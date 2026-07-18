/* ============================================================================
 * 漂浮東京島與楓葉（Three.js r134 UMD / classic script）
 *
 * 模組結構（每個類別職責單一，於底部 App 組裝）：
 *   ToonKit         — 共用的卡通渲染材質工廠（4 階 gradientMap）
 *   DayNightCycle   — 15 秒日夜輪轉：keyframe 插值天空/霧/光照、日月位置、星星、亮燈因子
 *   Island          — 浮空島本體（草地、岩層、水晶、浮岩、楓樹）+ 上下浮動
 *   TokyoTower      — 幾何體組裝的東京鐵塔，黃昏自動亮燈（PointLight + 自發光）
 *   Landmark        — 日本景點：富士山 / 鳥居 / 五重塔（簡化為三重）
 *   MapleLeafSystem — InstancedMesh 楓葉粒子，固定物件池回收，零逐幀配置
 *   CloudLayer      — 環島雲層
 *   Hud             — 相位 / FPS / 按鈕 / 快捷鍵
 * ============================================================================ */
(function () {
  'use strict';

  // CDN 失敗時 index.html 的 error handler 已顯示遮罩，直接中止
  if (!window.THREE || !THREE.OrbitControls) return;

  /* ------------------------------------------------------------------ *
   * 0. 常量與工具
   * ------------------------------------------------------------------ */
  var TAU = Math.PI * 2;
  var CYCLE_SECONDS = 15;   // 題目要求：每 15 秒一次完整日夜輪轉
  var LEAF_COUNT = 240;     // 楓葉物件池大小（固定，不動態增減 → 無 GC 壓力）
  var DEG = THREE.MathUtils.degToRad;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  // smoothstep 緩動：讓日夜 keyframe 之間的過渡两端速度趨零，避免「硬切」感
  function smooth(u) { return u * u * (3 - 2 * u); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /* ------------------------------------------------------------------ *
   * 1. ToonKit — 卡通渲染材質
   * 4 階灰階 DataTexture 作為 gradientMap：光照不再連續漸變，
   * 而是切成 4 個色階，形成手繪卡通的硬邊陰影。
   * ------------------------------------------------------------------ */
  var ToonKit = (function () {
    var steps = new Uint8Array([90, 150, 210, 255]);
    // 注意：r134 的 toon shader 取 texture2D(gradientMap, ...).rgb，
    // 必須用 LuminanceFormat（取樣為 L,L,L）；若用 RedFormat 會只剩紅色通道，
    // 方向光對 G/B 完全失效（綠草地變土色、藍山變紫的元兇）
    var gradient = new THREE.DataTexture(steps, steps.length, 1, THREE.LuminanceFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;

    function mat(params) {
      params = params || {};
      params.gradientMap = gradient;
      return new THREE.MeshToonMaterial(params);
    }
    return { gradient: gradient, mat: mat };
  })();

  /* 調色盤（無外部紋理，全部程序化色彩） */
  var PAL = {
    LAWN: 0x93dd66, DIRT: 0xa4714e,
    ROCK: 0x9a8b99, ROCK_DARK: 0x7d6f80, CRYSTAL: 0x8fe8ff, CRYSTAL_EM: 0x35c4e8,
    TOWER_ORANGE: 0xe8632c, TOWER_WHITE: 0xfff3e2, BEACON: 0xff5040,
    FUJI: 0x82a8dc, SNOW: 0xffffff,
    TORII: 0xd84a33, TORII_DARK: 0x33272a, STONE: 0xb9b2a6,
    PAGODA_WALL: 0xe9d3a6, PAGODA_ROOF: 0x8c4a3c, GOLD: 0xd9b45c,
    TRUNK: 0x7a5238, GRAVEL: 0xd9d0be,
    FOLIAGE: [0xc73e4e, 0xe0653a, 0xedab3f, 0xb83a52],
    LEAF: [0xd94f3d, 0xe8734a, 0xf0a13c, 0xc73e56, 0xe0632f],
    LAMP_EM: 0xffc98a // 夜燈自發光色（窗、燈籠、鐵塔橫紋共用）
  };

  /* ------------------------------------------------------------------ *
   * 2. DayNightCycle — 15 秒日夜輪轉
   *
   * 時間模型：cycleT = (time / 15) % 1 ∈ [0,1)
   *   0.00–0.40 白天 → 0.40–0.55 黃昏 → 0.55–0.86 夜晚 → 0.86–0.97 黎明 → 白天
   *
   * 過渡演算法：8 個 keyframe stop，對 cycleT 找到所在區間後以
   * smoothstep(u) 做 lerp —— 天空色、霧色、半球光、方向光色/強度/仰角、
   * 環境光、亮燈因子 lamp、星星因子 star 全部由同一張表驅動，保證同步。
   *
   * 太陽 / 月亮：只使用「一盞」 DirectionalLight 分飾兩角 ——
   * 白天它是高仰角暖色太陽，夜晚平滑變成冷色低強度月光（方位角固定 140°
   * = 島的遠側，預設相機剛好看得見；只插值仰角，因此方向永遠連續不跳變）。
   * 視覺上的太陽 / 月亮圓盤則是兩顆不受光照的 MeshBasicMaterial，
   * 走壓縮仰角（×0.22）維持在鏡頭視野帶內，各自依 star 因子淡入淡出。
   *
   * 亮燈因子 lamp：黃昏 keyframe 開始 >0，夜晚 =1，黎明回落到 0，
   * 由 TokyoTower / Landmark 消費（PointLight 強度 + 自發光強度）。
   * ------------------------------------------------------------------ */
  function DayNightCycle(scene) {
    this.scene = scene;
    this.time = 0;
    this.speed = 1;         // 快捷鍵 F / ⏩ 可切換 ×4
    this.cycleT = 0;
    this.lamp = 0;
    this._phase = '';

    // --- 燈光（初始值對齊 keyframe 0；每幀由 update 重算） ---
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a9a6a, 0.38);
    scene.add(this.hemi);

    this.dir = new THREE.DirectionalLight(0xfff2cf, 0.64);
    this.dir.castShadow = true;
    // 陰影相機只罩住島嶼範圍：解析度集中、避免 acne
    this.dir.shadow.mapSize.set(1024, 1024);
    this.dir.shadow.camera.left = -13;
    this.dir.shadow.camera.right = 13;
    this.dir.shadow.camera.top = 13;
    this.dir.shadow.camera.bottom = -13;
    this.dir.shadow.camera.near = 5;
    this.dir.shadow.camera.far = 100;
    this.dir.shadow.bias = -0.0004;
    this.dir.shadow.normalBias = 0.03;
    scene.add(this.dir);

    this.amb = new THREE.AmbientLight(0xffffff, 0.12);
    scene.add(this.amb);

    scene.fog = new THREE.Fog(0x7ecdf2, 34, 120);

    // --- keyframe 表（十六進位於此轉成 Color，供逐幀 lerpColors） ---
    // 光強度總和（dir+hemi+amb）刻意壓在 ≈1.1 以內：超過 1 時 toon 會把
    // 材質色往光源色推（綠草地變沙色、藍富士變粉），壓低後固有色才準。
    var S = [
      // t     sky       hemiSky   hemiGnd   hemiI  dir        dirI   el°  ambI  lamp star
      [0.00, 0x7ecdf2, 0xbfe3ff, 0x8a9a6a, 0.38, 0xfff2cf, 0.64, 60, 0.12, 0.00, 0.00],
      [0.36, 0x7ecdf2, 0xbfe3ff, 0x8a9a6a, 0.38, 0xfff2cf, 0.64, 62, 0.12, 0.00, 0.00], // 白天 plateau
      [0.45, 0xffab6b, 0xffc9a0, 0x7a6a5a, 0.30, 0xff9550, 0.45, 14, 0.10, 0.55, 0.08], // 黃昏（開始亮燈）
      [0.53, 0x5b5f94, 0x8087c0, 0x4a4a5a, 0.23, 0x8a9fd0, 0.23, 4, 0.09, 1.00, 0.55], // 藍調時刻
      [0.60, 0x182142, 0x39406e, 0x2a2c38, 0.19, 0xa9c0ff, 0.20, 45, 0.08, 1.00, 1.00], // 夜晚（月光）
      [0.84, 0x182142, 0x39406e, 0x2a2c38, 0.19, 0xa9c0ff, 0.20, 58, 0.08, 1.00, 1.00], // 夜晚 plateau
      [0.91, 0xffb49a, 0xffcfc0, 0x6a6a6a, 0.27, 0xffc39a, 0.37, 10, 0.10, 0.30, 0.20], // 黎明（燈漸暗）
      [0.97, 0x8fd4f5, 0xc5e6ff, 0x8a9a6a, 0.35, 0xfff0c8, 0.56, 40, 0.12, 0.00, 0.00]  // 回到白天前
    ];
    this.stops = S.map(function (s) {
      return {
        t: s[0],
        sky: new THREE.Color(s[1]), hemiSky: new THREE.Color(s[2]), hemiGnd: new THREE.Color(s[3]),
        hemiI: s[4], dir: new THREE.Color(s[5]), dirI: s[6], el: s[7],
        ambI: s[8], lamp: s[9], star: s[10]
      };
    });

    // --- 天體圓盤（BasicMaterial 不受光照、不參與霧） ---
    function disc(r, color, opacity) {
      var m = new THREE.Mesh(
        new THREE.CircleGeometry(r, 32),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, fog: false, depthWrite: false })
      );
      m.renderOrder = -1; // 先畫，當背景
      scene.add(m);
      return m;
    }
    this.sun = disc(3.0, 0xfff3b0, 1);
    this.sunGlow = disc(5.2, 0xffdf8a, 0.32);
    this.sunGlow.material.blending = THREE.AdditiveBlending;
    this.moon = disc(2.3, 0xe9efff, 0);
    this.moonGlow = disc(3.9, 0xafc4ff, 0);
    this.moonGlow.material.blending = THREE.AdditiveBlending;

    // --- 星星（單一 Points，opacity 由 star 因子控制） ---
    var starCount = 420;
    var pos = new Float32Array(starCount * 3);
    for (var i = 0; i < starCount; i++) {
      // 上半球均勻分佈（y 分量偏正），半徑 58–85
      var u = rand(0.08, 1), a = rand(0, TAU), r = rand(58, 85);
      var rr = Math.sqrt(1 - u * u);
      pos[i * 3] = rr * Math.cos(a) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = rr * Math.sin(a) * r;
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xdfe9ff, size: 1.15, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    scene.add(this.stars);

    // 逐幀暫存（避免配置新物件）
    this._sky = new THREE.Color();
    this._c1 = new THREE.Color();
    this._dirV = new THREE.Vector3();
    // 雲色計算用
    this.cloudColor = new THREE.Color(0xffffff);
    this._cloudNight = new THREE.Color(0x4a5470);
    this._cloudTint = new THREE.Color();
    this._white = new THREE.Color(0xffffff);
  }

  DayNightCycle.prototype.update = function (dt, camera) {
    this.time += dt * this.speed;
    var t = (this.time / CYCLE_SECONDS) % 1;
    this.cycleT = t;

    // 找 keyframe 區間 [a, b]；最後一站 (0.97) 會繞回第一站 (t=1 ≡ 0.00)
    var stops = this.stops, a = stops[stops.length - 1], b = stops[0], segLen = 1 - a.t;
    for (var i = 0; i < stops.length; i++) {
      var next = stops[(i + 1) % stops.length];
      var end = (i === stops.length - 1) ? 1 : next.t;
      if (t >= stops[i].t && t < end) { a = stops[i]; b = next; segLen = end - a.t; break; }
    }
    var u = smooth(clamp01((t - a.t) / segLen));

    // 天空 / 霧 / 背景同色漸變
    this._sky.lerpColors(a.sky, b.sky, u);
    this.scene.background = this._sky;
    this.scene.fog.color.copy(this._sky);

    this.hemi.color.lerpColors(a.hemiSky, b.hemiSky, u);
    this.hemi.groundColor.lerpColors(a.hemiGnd, b.hemiGnd, u);
    this.hemi.intensity = lerp(a.hemiI, b.hemiI, u);

    this._c1.lerpColors(a.dir, b.dir, u);
    this.dir.color.copy(this._c1);
    this.dir.intensity = lerp(a.dirI, b.dirI, u);
    this.amb.intensity = lerp(a.ambI, b.ambI, u);

    // 太陽/月亮「光源」位置：固定方位角 140°（島的遠側，預設相機可見），
    // 只插值仰角（仰角永遠連續 → 無跳變）；陰影朝鏡頭方向落，卡通逆光更好看
    var el = DEG(lerp(a.el, b.el, u));
    var az = DEG(140);
    var R = 42;
    this._dirV.set(Math.cos(el) * Math.sin(az) * R, Math.sin(el) * R, Math.cos(el) * Math.cos(az) * R);
    this.dir.position.copy(this._dirV);

    this.lamp = lerp(a.lamp, b.lamp, u);
    var star = lerp(a.star, b.star, u);

    // 天體「圓盤」走壓縮後的視覺仰角（真實仰角 ×0.22 ≈ 1°–13°），
    // 正好落在鏡頭視野帶內：白天高掛、黃昏/黎明貼地平線、夜晚中天的月亮
    var elV = DEG(lerp(a.el, b.el, u) * 0.22);
    this._dirV.set(Math.cos(elV) * Math.sin(az), Math.sin(elV), Math.cos(elV) * Math.cos(az)).multiplyScalar(78);
    this.sun.position.copy(this._dirV);
    this.sunGlow.position.copy(this._dirV);
    this.moon.position.copy(this._dirV);
    this.moonGlow.position.copy(this._dirV);
    var sunO = clamp01(1 - star * 1.6);          // 星星出來前太陽先下山
    var moonO = clamp01((star - 0.25) / 0.5);    // 入夜後月亮淡入
    this.sun.material.opacity = sunO;
    this.sunGlow.material.opacity = sunO * 0.32;
    this.moon.material.opacity = moonO;
    this.moonGlow.material.opacity = moonO * 0.28;
    this.sun.material.color.copy(this._c1);      // 黃昏時太陽一起變橘
    this.sun.lookAt(camera.position);
    this.sunGlow.lookAt(camera.position);
    this.moon.lookAt(camera.position);
    this.moonGlow.lookAt(camera.position);

    this.starMat.opacity = star;
    this.stars.rotation.y += dt * 0.004;         // 極緩慢星野自轉

    // 雲色（CloudLayer 消費）：雲用無光照 BasicMaterial，顏色由循環直接給定 ——
    // 白天近白、黃昏帶夕色、夜晚深藍灰，避免逆光面變成泥灰色
    var ck = clamp01((this.dir.intensity - 0.12) / 0.5);
    this._cloudTint.copy(this._c1).lerp(this._white, 0.7); // 光源色摻白 = 雲受光色
    this.cloudColor.lerpColors(this._cloudNight, this._cloudTint, ck);

    // 相位標籤（供 HUD）
    this._phase = t < 0.40 ? '☀️ 白天' : t < 0.55 ? '🌆 黃昏' : t < 0.86 ? '🌙 夜晚' : t < 0.97 ? '🌅 黎明' : '☀️ 白天';
  };

  DayNightCycle.prototype.phase = function () { return this._phase; };

  /* ------------------------------------------------------------------ *
   * 3. Island — 浮空島（含草地、岩層、水晶、繞行浮岩、楓樹）
   * 浮動動畫：y 以 sin 緩慢起伏，附帶極小的傾側，營造「漂」的感覺。
   * ------------------------------------------------------------------ */
  function Island() {
    this.group = new THREE.Group();
    this.trees = [];
    this.rocks = [];

    // 島頂：草皮淺盤 + 泥土裙邊（兩件圓柱做出雙色斜面）
    var lawn = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.15, 0.4, 28), ToonKit.mat({ color: PAL.LAWN }));
    lawn.position.y = 0.6;
    lawn.receiveShadow = true;
    this.group.add(lawn);

    var dirt = new THREE.Mesh(new THREE.CylinderGeometry(7.15, 6.35, 1.35, 28), ToonKit.mat({ color: PAL.DIRT }));
    dirt.position.y = -0.25;
    dirt.receiveShadow = true;
    this.group.add(dirt);

    // 島底：兩截低面數倒圓錐 = 岩層（低 segment 數自然產生切面感）
    var rock1 = new THREE.Mesh(new THREE.ConeGeometry(6.35, 4.6, 7), ToonKit.mat({ color: PAL.ROCK }));
    rock1.rotation.x = Math.PI;
    rock1.position.y = -3.2;
    this.group.add(rock1);

    var rock2 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.2, 7), ToonKit.mat({ color: PAL.ROCK_DARK }));
    rock2.rotation.x = Math.PI;
    rock2.rotation.y = 0.4;
    rock2.position.y = -5.9;
    this.group.add(rock2);

    // 島心能量水晶（自發光，夜晚更亮）：半埋在岩錐尖端、外露發光
    this.crystalMat = ToonKit.mat({ color: PAL.CRYSTAL, emissive: PAL.CRYSTAL_EM, emissiveIntensity: 0.5 });
    var crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), this.crystalMat);
    crystal.position.y = -7.4;
    this.group.add(crystal);
    this.crystal = crystal;

    // 三顆繞島緩慢公轉的小浮岩
    var rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (var i = 0; i < 3; i++) {
      var rm = new THREE.Mesh(rockGeo, ToonKit.mat({ color: i % 2 ? PAL.ROCK : PAL.ROCK_DARK }));
      rm.scale.setScalar(rand(0.45, 0.8));
      this.group.add(rm);
      this.rocks.push({ mesh: rm, r: rand(9.2, 11), y: rand(-7.5, -4), a: rand(0, TAU), spd: rand(0.06, 0.12), rot: rand(0.2, 0.6) });
    }

    // 島上楓樹（落葉的來源）：樹幹 + 2–3 顆二十面體樹冠
    var spots = [
      [-3.6, 3.6, 1.0], [-1.1, 5.3, 0.85], [1.8, -5.1, 0.95],
      [-5.3, 0.9, 0.8], [5.4, 1.5, 0.9], [0.4, 5.6, 0.7]
    ];
    for (var j = 0; j < spots.length; j++) {
      this._makeTree(spots[j][0], spots[j][1], spots[j][2]);
    }
  }

  Island.prototype._makeTree = function (x, z, s) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.22 * s, 1.2 * s, 6), ToonKit.mat({ color: PAL.TRUNK }));
    trunk.position.y = 0.6 * s;
    trunk.castShadow = true;
    g.add(trunk);

    var crown = new THREE.Group();
    var c = pick(PAL.FOLIAGE);
    var n = 2 + ((Math.random() * 2) | 0);
    for (var i = 0; i < n; i++) {
      var r = rand(0.55, 0.85) * s;
      var puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), ToonKit.mat({ color: c }));
      puff.position.set(rand(-0.35, 0.35) * s, (1.35 + i * 0.45) * s, rand(-0.35, 0.35) * s);
      puff.castShadow = true;
      crown.add(puff);
    }
    g.add(crown);
    g.position.set(x, 0.8, z);
    g.rotation.y = rand(0, TAU);
    this.group.add(g);
    this.trees.push({ crown: crown, phase: rand(0, TAU) });
  };

  Island.prototype.update = function (t, lamp) {
    // 島體浮沉 + 微傾（振幅小、頻率低才不會暈）
    this.group.position.y = Math.sin(t * 0.55) * 0.32;
    this.group.rotation.z = Math.sin(t * 0.40) * 0.012;
    this.group.rotation.x = Math.cos(t * 0.47) * 0.010;

    // 樹冠隨風輕擺
    for (var i = 0; i < this.trees.length; i++) {
      var tr = this.trees[i];
      tr.crown.rotation.z = Math.sin(t * 1.1 + tr.phase) * 0.045;
      tr.crown.rotation.x = Math.cos(t * 0.9 + tr.phase) * 0.03;
    }

    // 浮岩公轉 + 自轉 + 上下漂移
    for (var j = 0; j < this.rocks.length; j++) {
      var rk = this.rocks[j];
      rk.a += rk.spd * 0.016;
      rk.mesh.position.set(Math.cos(rk.a) * rk.r, rk.y + Math.sin(t * 0.7 + j * 2.1) * 0.45, Math.sin(rk.a) * rk.r);
      rk.mesh.rotation.x += rk.rot * 0.01;
      rk.mesh.rotation.y += rk.rot * 0.013;
    }

    // 水晶呼吸燈；夜晚（lamp→1）更亮，呼應「島在發光」
    this.crystalMat.emissiveIntensity = 0.45 + 0.3 * Math.sin(t * 2.2) + lamp * 0.6;
    this.crystal.rotation.y = t * 0.5;
  };

  /* ------------------------------------------------------------------ *
   * 4. TokyoTower — 幾何體組裝（腳柱、橫梁、甲板、塔身、天線）
   * 夜燈設計：
   *   - 所有白色橫紋共用一張 lampMat（自發光 #ffc98a），白天 emissive=0
   *     呈現原本的白色，夜晚 emissive 升起變成暖橘燈帶。
   *   - 塔頂 beacon 紅球在夜裡閃爍；塔腰一盞 PointLight 照亮周圍景點。
   * ------------------------------------------------------------------ */
  function TokyoTower() {
    this.group = new THREE.Group();
    var orange = ToonKit.mat({ color: PAL.TOWER_ORANGE });
    this.lampMat = ToonKit.mat({ color: PAL.TOWER_WHITE, emissive: PAL.LAMP_EM, emissiveIntensity: 0 });

    var add = function (mesh, x, y, z) {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    }.bind(this);

    // 四支外張腳柱（box 向島心傾斜，頂端自然收束）
    var legGeo = new THREE.BoxGeometry(0.24, 2.6, 0.24);
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sz = -1; sz <= 1; sz += 2) {
        var leg = add(new THREE.Mesh(legGeo, orange), 0.95 * sx, 1.3, 0.95 * sz);
        leg.rotation.set(0.19 * sz, 0, -0.19 * sx);
      }
    }
    // 兩層白色橫向支撐（夜裡的燈帶之一）
    var braceY = [0.95, 1.75], braceLen = [2.05, 1.7];
    for (var b = 0; b < 2; b++) {
      for (var side = 0; side < 4; side++) {
        var brace = new THREE.Mesh(new THREE.BoxGeometry(braceLen[b], 0.09, 0.09), this.lampMat);
        brace.position.y = braceY[b];
        brace.rotation.y = side * Math.PI / 2;
        // 將橫梁移到對應側面（繞 y 旋轉後沿本地 z 外推）
        brace.translateZ(0.98 - b * 0.16);
        brace.castShadow = true;
        this.group.add(brace);
      }
    }
    // 主甲板 + 燈帶
    add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.32, 1.8), orange), 0, 2.62, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.12, 1.88), this.lampMat), 0, 2.84, 0);
    // 下段塔身 + 兩圈燈帶
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.52, 1.5, 8), orange), 0, 3.65, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.11, 8), this.lampMat), 0, 3.3, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.11, 8), this.lampMat), 0, 3.95, 0);
    // 上層甲板 + 燈帶
    add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.26, 1.05), orange), 0, 4.52, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.09, 1.12), this.lampMat), 0, 4.7, 0);
    // 上段塔身 + 燈帶
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 1.0, 8), orange), 0, 5.25, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.10, 8), this.lampMat), 0, 5.2, 0);
    // 天線 + 紅色 beacon
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 1.35, 6), this.lampMat), 0, 6.4, 0);
    this.beaconMat = ToonKit.mat({ color: PAL.BEACON, emissive: PAL.BEACON, emissiveIntensity: 0.15 });
    add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), this.beaconMat), 0, 7.15, 0);

    // 塔腰暖色 PointLight：黃昏亮起、黎明熄滅（強度由 setLamp 控制）
    this.light = new THREE.PointLight(0xffb066, 0, 14, 2);
    this.light.position.set(0, 4.6, 0);
    this.group.add(this.light);
  }

  TokyoTower.prototype.setLamp = function (f, t) {
    this.light.intensity = 1.5 * f;
    this.lampMat.emissiveIntensity = 1.7 * f;
    // beacon 閃爍只在夜裡（f>0），白天維持微亮紅球
    this.beaconMat.emissiveIntensity = f > 0.01 ? f * (1.5 + 1.1 * Math.sin(t * 5.5)) : 0.15;
  };

  /* ------------------------------------------------------------------ *
   * 5. Landmark — 日本景點三選：'fuji' | 'torii' | 'pagoda'
   * 每個景點若有燈籠 / 窗戶，使用自己複製的 windowMat，
   * 由 setLamp(f) 統一控制自發光（題目允許「材質自發光」）。
   * ------------------------------------------------------------------ */
  function Landmark(type) {
    this.group = new THREE.Group();
    this.windowMat = ToonKit.mat({ color: 0xfff6e0, emissive: PAL.LAMP_EM, emissiveIntensity: 0 });
    this['build_' + type]();
  }

  // 富士山：藍紫山體 + 白雪冠（雪冠底徑依山體該高度半徑推算，服貼不懸空）
  Landmark.prototype.build_fuji = function () {
    var H = 3.4, R = 2.7;
    var body = new THREE.Mesh(new THREE.ConeGeometry(R, H, 24), ToonKit.mat({ color: PAL.FUJI }));
    body.position.y = H / 2;
    body.castShadow = true;
    this.group.add(body);

    var capBase = 2.28, capH = 1.2;
    var capR = R * (1 - capBase / H) + 0.06; // +0.06 微微覆蓋山脊線
    var cap = new THREE.Mesh(new THREE.ConeGeometry(capR, capH, 24), ToonKit.mat({ color: PAL.SNOW }));
    cap.position.y = capBase + capH / 2;
    this.group.add(cap);

    var skirt = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.35, R + 0.55, 0.3, 24), ToonKit.mat({ color: PAL.LAWN }));
    skirt.position.y = 0.15;
    skirt.receiveShadow = true;
    this.group.add(skirt);
  };

  // 鳥居：朱紅雙柱 + 貫 / 島木 / 笠木三橫梁 + 黑色冠板，兩旁石燈籠（夜裡發光）
  Landmark.prototype.build_torii = function () {
    var red = ToonKit.mat({ color: PAL.TORII });
    var dark = ToonKit.mat({ color: PAL.TORII_DARK });
    var stone = ToonKit.mat({ color: PAL.STONE });
    var self = this;

    function add(mesh, x, y, z) {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      self.group.add(mesh);
      return mesh;
    }
    var pillarGeo = new THREE.CylinderGeometry(0.15, 0.19, 2.5, 8);
    add(new THREE.Mesh(pillarGeo, red), -1.05, 1.25, 0);
    add(new THREE.Mesh(pillarGeo, red), 1.05, 1.25, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.22), red), 0, 1.95, 0);  // 貫
    add(new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.2, 0.26), red), 0, 2.62, 0);   // 島木
    add(new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.22, 0.3), red), 0, 2.82, 0);   // 笠木
    add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.07, 0.34), dark), 0, 2.97, 0);  // 冠板
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.06), dark), 0, 2.3, 0);   // 額束

    for (var sx = -1; sx <= 1; sx += 2) {
      var l = new THREE.Group();
      var base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.34), stone); base.position.y = 0.09;
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6), stone); post.position.y = 0.43;
      var box = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.26), this.windowMat); box.position.y = 0.8; // 火袋（夜裡亮）
      var roof = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 4), stone); roof.position.y = 1.04; roof.rotation.y = Math.PI / 4;
      l.add(base); l.add(post); l.add(box); l.add(roof);
      l.position.set(1.75 * sx, 0, 0.6);
      l.traverse(function (o) { o.castShadow = true; });
      this.group.add(l);
    }
    // 碎石地面
    var gravel = new THREE.Mesh(new THREE.CircleGeometry(2.1, 20), ToonKit.mat({ color: PAL.GRAVEL }));
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.y = 0.02;
    gravel.receiveShadow = true;
    this.group.add(gravel);
  };

  // 三重塔（五重塔簡化）：逐層收分的塔身 + 出檐屋頂 + 相輪；每層前後開窗（夜裡亮）
  Landmark.prototype.build_pagoda = function () {
    var wall = ToonKit.mat({ color: PAL.PAGODA_WALL });
    var roofM = ToonKit.mat({ color: PAL.PAGODA_ROOF });
    var self = this;
    function add(mesh, x, y, z) {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      self.group.add(mesh);
      return mesh;
    }
    add(new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.18, 1.75), ToonKit.mat({ color: PAL.STONE })), 0, 0.09, 0);
    for (var i = 0; i < 3; i++) {
      var w = 1.35 - 0.2 * i;
      var y = 0.18 + 0.26 + i * 0.68;
      add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.52, w), wall), 0, y, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.62, 0.15, w + 0.62), roofM), 0, y + 0.34, 0);
      // 前後兩扇窗
      for (var s = -1; s <= 1; s += 2) {
        var win = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), this.windowMat);
        win.position.set(0, y, s * (w / 2 + 0.012));
        if (s < 0) win.rotation.y = Math.PI;
        this.group.add(win);
      }
    }
    var topY = 0.18 + 0.26 + 2 * 0.68 + 0.42;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 6), ToonKit.mat({ color: PAL.GOLD })), 0, topY + 0.3, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), ToonKit.mat({ color: PAL.GOLD })), 0, topY + 0.68, 0);
  };

  Landmark.prototype.setLamp = function (f) {
    this.windowMat.emissiveIntensity = 1.8 * f;
  };

  /* ------------------------------------------------------------------ *
   * 6. MapleLeafSystem — 楓葉粒子（物件池 + InstancedMesh）
   *
   * 效能策略：
   *   - 全部 240 片葉子 = 1 個 InstancedMesh = 1 次 draw call；
   *     每片葉子的顏色用 instanceColor，共享一張 MeshToonMaterial。
   *   - 固定大小物件池：葉子掉出底界就「重置回頂部」再利用，
   *     不 new / 不 splice，長時間運行記憶體恆定、無 GC 抖動。
   *   - 每片葉子的狀態存在平行 Float32Array（cache-friendly），
   *     逐幀只更新位置/旋轉並寫回 instanceMatrix。
   *   - 掉落物理：等速下落 + 正弦左右搖擺（振幅/頻率/相位各自隨機）
   *     + 三軸各自等角速度翻轉 → 看起來自然且每片都不同。
   * ------------------------------------------------------------------ */
  function MapleLeafSystem(scene) {
    // 楓葉外形：5 裂星形 + 短葉柄（Shape → 平面幾何）
    var shape = new THREE.Shape();
    for (var k = 0; k < 10; k++) {
      var ang = (k / 10) * TAU - Math.PI / 2;
      var r = k % 2 === 0 ? 0.5 : 0.2;
      var px = Math.cos(ang) * r, py = Math.sin(ang) * r;
      if (k === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
    }
    shape.lineTo(0.06, -0.42);
    shape.lineTo(-0.06, -0.42);
    shape.closePath();
    var geo = new THREE.ShapeGeometry(shape);

    var mat = ToonKit.mat({ color: 0xffffff, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, LEAF_COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // 葉子散佈全場，跳過逐幀包圍體計算
    scene.add(this.mesh);

    // 狀態陣列（SoA 布局）
    this.px = new Float32Array(LEAF_COUNT); this.py = new Float32Array(LEAF_COUNT); this.pz = new Float32Array(LEAF_COUNT);
    this.rx = new Float32Array(LEAF_COUNT); this.ry = new Float32Array(LEAF_COUNT); this.rz = new Float32Array(LEAF_COUNT);
    this.vx = new Float32Array(LEAF_COUNT); this.vy = new Float32Array(LEAF_COUNT); this.vz = new Float32Array(LEAF_COUNT);
    this.fall = new Float32Array(LEAF_COUNT);
    this.swA = new Float32Array(LEAF_COUNT); this.swF = new Float32Array(LEAF_COUNT); this.swP = new Float32Array(LEAF_COUNT);
    this.scl = new Float32Array(LEAF_COUNT);

    var color = new THREE.Color();
    var m = new THREE.Matrix4();
    for (var i = 0; i < LEAF_COUNT; i++) {
      this._reset(i, true); // 初次打散在整個空間，避免「整批同時出生」
      this.scl[i] = rand(0.38, 0.75);
      this.mesh.setColorAt(i, color.setHex(pick(PAL.LEAF)));
      m.makeScale(this.scl[i], this.scl[i], this.scl[i]);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceColor.needsUpdate = true;

    // 逐幀合成矩陣用的暫存物件（建立一次，永不釋放）
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._m = new THREE.Matrix4();
  }

  // 回收 = 傳送回頂部並重抽參數（物件池核心，無任何配置）
  MapleLeafSystem.prototype._reset = function (i, scatter) {
    this.px[i] = rand(-13, 13);
    this.pz[i] = rand(-13, 13);
    this.py[i] = scatter ? rand(-8, 16) : rand(10, 16);
    this.rx[i] = rand(0, TAU); this.ry[i] = rand(0, TAU); this.rz[i] = rand(0, TAU);
    this.vx[i] = rand(-2.2, 2.2); this.vy[i] = rand(-2.2, 2.2); this.vz[i] = rand(-2.2, 2.2);
    this.fall[i] = rand(1.0, 2.0);
    this.swA[i] = rand(0.6, 1.6); this.swF[i] = rand(0.8, 1.8); this.swP[i] = rand(0, TAU);
  };

  MapleLeafSystem.prototype.update = function (dt, t) {
    var wind = Math.sin(t * 0.25) * 0.4; // 全域微風，整體緩慢漂移
    for (var i = 0; i < LEAF_COUNT; i++) {
      var y = this.py[i] - this.fall[i] * dt;
      if (y < -8.5) { this._reset(i, false); y = this.py[i]; } // 掉出底界 → 回收再利用
      this.py[i] = y;

      this.rx[i] += this.vx[i] * dt;
      this.ry[i] += this.vy[i] * dt;
      this.rz[i] += this.vz[i] * dt;

      // 左右搖擺疊加在基準位置上（x 大擺、z 小擺，相位相同頻率略異 → 立體飄感）
      var sway = Math.sin(t * this.swF[i] + this.swP[i]);
      var x = this.px[i] + sway * this.swA[i] + wind;
      var z = this.pz[i] + Math.cos(t * this.swF[i] * 0.9 + this.swP[i]) * this.swA[i] * 0.7;

      this._p.set(x, y, z);
      this._e.set(this.rx[i], this.ry[i], this.rz[i]);
      this._q.setFromEuler(this._e);
      this._s.setScalar(this.scl[i]);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  };

  /* ------------------------------------------------------------------ *
   * 7. CloudLayer — 環島雲層（球體群組壓扁成卡通雲，緩慢繞行）
   * 無光照 BasicMaterial：顏色由 DayNightCycle.cloudColor 驅動，
   * 不受逆光影響（否則黃昏時背光面會變泥灰）；fog 讓遠雲融入天空。
   * ------------------------------------------------------------------ */
  function CloudLayer(scene, cycle) {
    this.cycle = cycle;
    this.group = new THREE.Group();
    this.clouds = [];
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    for (var i = 0; i < 7; i++) {
      var c = new THREE.Group();
      var puffs = 3 + ((Math.random() * 3) | 0);
      for (var p = 0; p < puffs; p++) {
        var r = rand(0.7, 1.2);
        var s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), this.mat);
        s.scale.y = 0.55;
        s.position.set(rand(-1.4, 1.4), rand(-0.15, 0.3), rand(-0.6, 0.6));
        c.add(s);
      }
      this.group.add(c);
      var below = i >= 5; // 最後兩朵放在島下方，增加縱深
      this.clouds.push({
        node: c,
        r: below ? rand(11.5, 14.5) : rand(14, 19),
        // 上層雲拉高到塔頂（y≈8）之上：遠側的雲在螢幕上才會襯在天空，
        // 而不是遮住島上景點；下層雲從島底掠過增加深度
        y: below ? rand(-8.5, -6) : rand(10, 14),
        a: rand(0, TAU), spd: rand(0.015, 0.04) * (Math.random() < 0.5 ? 1 : -1)
      });
    }
    scene.add(this.group);
  }

  CloudLayer.prototype.update = function (dt) {
    this.mat.color.copy(this.cycle.cloudColor);
    for (var i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i];
      c.a += c.spd * dt;
      c.node.position.set(Math.cos(c.a) * c.r, c.y, Math.sin(c.a) * c.r);
    }
  };

  /* ------------------------------------------------------------------ *
   * 8. Hud — 相位指示、FPS、按鈕與快捷鍵
   * DOM 更新全部節流：相位只在改變時寫入，數據每 500ms 更新一次。
   * ------------------------------------------------------------------ */
  function Hud(cycle) {
    this.cycle = cycle;
    this.elPhase = document.getElementById('hud-phase');
    this.elStats = document.getElementById('hud-stats');
    this.btnSpeed = document.getElementById('btn-speed');
    this.btnInfo = document.getElementById('btn-info');
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this.lastPhase = '';

    var self = this;
    this.btnSpeed.addEventListener('click', function () { self.toggleSpeed(); });
    this.btnInfo.addEventListener('click', function () { self.toggleStats(); });
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var k = e.key.toLowerCase();
      if (k === 'f') self.toggleSpeed();
      else if (k === 'd') self.toggleStats();
    });
  }

  Hud.prototype.toggleSpeed = function () {
    this.cycle.speed = this.cycle.speed === 1 ? 4 : 1;
    this.btnSpeed.setAttribute('aria-pressed', String(this.cycle.speed !== 1));
    this.btnSpeed.title = this.cycle.speed === 1 ? '加速日夜循環 ×4（快捷鍵 F）' : '恢復日夜循環速度（快捷鍵 F）';
  };

  Hud.prototype.toggleStats = function () {
    var hidden = this.elStats.style.display === 'none';
    this.elStats.style.display = hidden ? '' : 'none';
    this.btnInfo.setAttribute('aria-pressed', String(hidden));
  };

  Hud.prototype.update = function (dt, renderer) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
      this.elStats.textContent =
        this.fps + ' FPS · ' + LEAF_COUNT + ' 葉 · ' + renderer.info.render.calls + ' calls' +
        (this.cycle.speed !== 1 ? ' · ×' + this.cycle.speed : '');
    }
    var p = this.cycle.phase();
    if (p !== this.lastPhase) {
      this.lastPhase = p;
      this.elPhase.textContent = p;
    }
  };

  /* ------------------------------------------------------------------ *
   * 9. App — renderer / scene / camera / 主迴圈
   * ------------------------------------------------------------------ */
  var container = document.getElementById('app');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    throw err; // 交給 index.html 的全域 error handler 顯示遮罩
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 600 ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // 刻意「不」開 sRGBEncoding：調色盤的 hex 是已調好的螢幕色，Linear 輸出
  // 才能原色呈現（sRGB 輸出會把 hex 當線性值再提亮一次 → 整體洗白）
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // WebGL context 遺失時給使用者一個可點擊的復原提示（長時間嵌入 iframe 可能遇到）
  renderer.domElement.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    var el = document.getElementById('fatal');
    el.hidden = false;
    el.innerHTML = '<div class="fatal-card"><h2>WebGL context lost</h2><p>點擊任意處重新整理</p></div>';
    el.addEventListener('click', function () { location.reload(); });
  });

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 240);

  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.4, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.enableZoom = false;      // 嵌入預覽不需要縮放；避免與頁面滾動衝突
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.16; // 不飛到正上方
  controls.maxPolarAngle = Math.PI * 0.62; // 不鑽到島底
  controls.autoRotate = true;       // 無互動時緩慢展示；一拖曳即暫停
  controls.autoRotateSpeed = 0.55;

  var resumeTimer = 0;
  controls.addEventListener('start', function () {
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
  });
  controls.addEventListener('end', function () {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () { controls.autoRotate = true; }, 2500);
  });

  // 依 viewport 寬高比調整相機距離：窄畫面拉遠，保證 320x200 也看得到整座島
  function frameCamera() {
    var w = window.innerWidth, h = Math.max(1, window.innerHeight);
    var aspect = w / h;
    var dist = aspect >= 1.55 ? 27 : 27 * Math.pow(1.55 / aspect, 0.85);
    dist = Math.min(46, Math.max(24, dist));
    var dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 0.001) dir.set(0, 0.32, 0.95);
    dir.normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  camera.position.set(0, 2.4 + 0.32 * 27, 0.95 * 27); // 初始 3/4 視角
  frameCamera();
  window.addEventListener('resize', frameCamera);

  // --- 組裝場景 ---
  var cycle = new DayNightCycle(scene);
  var island = new Island();
  scene.add(island.group);

  var tower = new TokyoTower();
  tower.group.position.set(0, 0.8, 0); // 島頂表面
  island.group.add(tower.group);

  var fuji = new Landmark('fuji');
  fuji.group.position.set(-4.7, 0.8, -3.2);
  fuji.group.rotation.y = 0.3;
  island.group.add(fuji.group);

  var torii = new Landmark('torii');
  torii.group.position.set(4.6, 0.8, -2.4);
  torii.group.rotation.y = -0.55;
  island.group.add(torii.group);

  var pagoda = new Landmark('pagoda');
  pagoda.group.position.set(3.8, 0.8, 3.9);
  pagoda.group.rotation.y = 0.4;
  island.group.add(pagoda.group);

  var landmarks = [fuji, torii, pagoda];
  var leaves = new MapleLeafSystem(scene);
  var clouds = new CloudLayer(scene, cycle);
  var hud = new Hud(cycle);

  // --- 主迴圈：requestAnimationFrame + deltaTime（上限 50ms，切分頁回來不暴衝） ---
  var clock = new THREE.Clock();
  var elapsed = 0;

  renderer.setAnimationLoop(function () {
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    cycle.update(dt, camera);
    island.update(elapsed, cycle.lamp);
    tower.setLamp(cycle.lamp, elapsed);
    for (var i = 0; i < landmarks.length; i++) landmarks[i].setLamp(cycle.lamp);
    leaves.update(dt, elapsed);
    clouds.update(dt);
    hud.update(dt, renderer);

    controls.update(); // 拖曳旋轉（damping 需要逐幀 update）；動畫不受拖曳阻塞
    renderer.render(scene, camera);
  });
})();
