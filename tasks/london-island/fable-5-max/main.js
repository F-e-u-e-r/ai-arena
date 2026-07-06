/* ============================================================================
   Little London in the Sky — 漂浮倫敦島與四季天氣
   原生 HTML + CSS + Three.js r149（UMD / 全域 THREE）

   架構總覽（皆為 class，於 App 中組裝）：
     SkyDome        漸層天空球（自訂 shader，頂色/地平色 uniform 漸變）
     DayNightCycle  15 秒日夜循環：關鍵影格取樣 + 線性插值
     SeasonSystem   四季參數：自動輪轉（每季 20 秒）+ 手動切換，指數平滑過渡
     Island         島體、草地、泰晤士河、瀑布、道路、樹木、花、燈柱、電話亭
     BigBen         大笨鐘（含四面會走的時鐘指針、夜間亮燈）
     LondonEye      倫敦眼（轉動的輪、直立吊艙、夜間霓虹）
     TowerBridge    倫敦塔橋（船靠近時開合的活動橋面、鎖鏈、夜燈）
     Boat / Bus     泰晤士小船（煙囪冒煙）與雙層巴士 ×2
     CloudLayer     漂浮雲層（會投影）
     Celestials     太陽、月亮、星星（位置隨日夜時間變化）
     WeatherSystem  楓葉 / 雪花（InstancedMesh + 物件池）、春霧 sprite
     CameraRig      自訂軌道相機（拖曳旋轉、慣性、縮放、閒置自轉）
     HUD            狀態列、季節按鈕、FPS / 粒子數
     AudioSystem    Web Audio：風聲隨季節、日落時大笨鐘鐘聲（預設關閉）
   ============================================================================ */
'use strict';

(function () {

  // ---------------------------------------------------------------- 基本常數
  const DAY_LENGTH = 15;     // 一次完整日夜輪轉秒數（題目要求 15s）
  const SEASON_LENGTH = 20;  // 每季持續秒數（含尾端 25% 的跨季過渡窗）
  const ISLAND_R = 26;       // 島面半徑
  const RIVER_X = 15;        // 泰晤士河中心線 x 座標（沿 z 軸貫穿全島）
  const RIVER_W = 5;         // 河寬

  // ------------------------------------------------------------ 小工具 / 暫存
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smooth = t => t * t * (3 - 2 * t); // smoothstep(0,1,t)

  // 決定性偽隨機（島上配置固定，重新整理不跳動）
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260705);

  // 供 update 迴圈重複使用的暫存物件（避免每幀配置記憶體 → 防 GC 卡頓）
  const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
  const _v1 = new THREE.Vector3();
  const _dummy = new THREE.Object3D();

  // ------------------------------------------------------- 卡通渲染共用素材
  // MeshToonMaterial 的 gradientMap：3 階灰階 + NearestFilter → 明確色階的卡通感
  function makeGradientMap(steps) {
    const data = new Uint8Array(steps.length * 4);
    steps.forEach((v, i) => {
      const g = Math.round(v * 255);
      data.set([g, g, g, 255], i * 4);
    });
    const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }
  const GRADIENT = makeGradientMap([0.45, 0.72, 1.0]);

  function toon(color, opts) {
    return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: GRADIENT }, opts || {}));
  }

  // 柔和圓形光暈貼圖（霧、煙、太陽月亮光暈共用）
  function makeGlowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  // 瀑布 / 河面用的縱向條紋貼圖（下緣淡出）
  function makeStreakTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 256);
    for (let i = 0; i < 11; i++) {
      const x = rand() * 64, w = 2 + rand() * 6;
      g.fillStyle = 'rgba(255,255,255,' + (0.35 + rand() * 0.55).toFixed(2) + ')';
      g.fillRect(x, 0, w, 256);
    }
    // 底部淡出，讓瀑布尾端消散在空中
    const fade = g.createLinearGradient(0, 0, 0, 256);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.65, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade;
    g.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 幾何小幫手
  // 兩點之間架一根圓柱（支架 / 斜撐用）
  function strut(parent, x0, y0, z0, x1, y1, z1, r, mat) {
    const from = new THREE.Vector3(x0, y0, z0);
    const to = new THREE.Vector3(x1, y1, z1);
    const len = from.distanceTo(to);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.25, len, 6), mat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_v1.set(0, 1, 0), to.sub(from).normalize());
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function box(parent, w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cyl(parent, rt, rb, h, seg, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /* ==========================================================================
     SkyDome — 大型背面球體 + 漸層 shader。
     頂色 / 地平色由 DayNightCycle 每幀寫入 uniform。
     ========================================================================== */
  class SkyDome {
    constructor(scene) {
      this.uniforms = {
        top: { value: new THREE.Color(0x4f9be8) },
        horizon: { value: new THREE.Color(0xbfe3f7) }
      };
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.uniforms,
        vertexShader:
          'varying vec3 vDir;\n' +
          'void main(){ vDir = normalize(position);\n' +
          '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'varying vec3 vDir; uniform vec3 top; uniform vec3 horizon;\n' +
          'void main(){\n' +
          '  float h = max(vDir.y, 0.0);\n' +
          '  vec3 col = mix(horizon, top, pow(h, 0.42));\n' +
          // 地平線以下：往乳白霧光提亮（浮空島下方的雲氣感，而非死黑）
          '  if (vDir.y < 0.0) col = mix(horizon, mix(horizon, vec3(1.0), 0.32), min(1.0, -vDir.y * 1.4));\n' +
          '  gl_FragColor = vec4(col, 1.0); }'
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(175, 32, 20), mat);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    set(top, horizon) {
      this.uniforms.top.value.copy(top);
      this.uniforms.horizon.value.copy(horizon);
    }
  }

  /* ==========================================================================
     DayNightCycle — 日夜循環核心演算法
     dayT ∈ [0,1)：0=日出、0.25=正午、0.5=日落、0.75=午夜。
     以「關鍵影格陣列」描述每個時刻的天空/霧/光照/燈光參數，
     取樣時找出前後兩個影格做線性插值 → 保證所有屬性同步且平滑漸變。
     lamp 欄位（0→1）即「黃昏亮燈、黎明前關燈」的自動開關曲線。
     ========================================================================== */
  class DayNightCycle {
    constructor() {
      const S = (t, top, hor, fog, sunC, sunI, moonI, hemiI, hemiSky, hemiGnd, stars, lamp, dens) => ({
        t,
        top: new THREE.Color(top), hor: new THREE.Color(hor), fog: new THREE.Color(fog),
        sunC: new THREE.Color(sunC), sunI, moonI,
        hemiI, hemiSky: new THREE.Color(hemiSky), hemiGnd: new THREE.Color(hemiGnd),
        stars, lamp, dens
      });
      //             t      天頂色     地平色     霧色      日光色    日強  月強  半球  半球天     半球地    星星  燈    霧密度
      this.stops = [
        S(0.000, 0x6f86c8, 0xffb086, 0xe8bda0, 0xffb078, 0.85, 0.05, 0.50, 0xffd8bf, 0x8a7c6a, 0.10, 0.0, 1.05), // 日出
        S(0.075, 0x5b9ce4, 0xffe2b4, 0xe8d8c0, 0xfff0d4, 1.28, 0.00, 0.68, 0xcfe8ff, 0x9a8f78, 0.00, 0.0, 0.90), // 早晨
        S(0.240, 0x2f8ceb, 0x8ccdf6, 0xd5ecf8, 0xfff6e2, 1.60, 0.00, 0.58, 0xd8f0ff, 0xa09880, 0.00, 0.0, 0.78), // 正午
        S(0.400, 0x5288d8, 0xffd9a4, 0xecd8b8, 0xffe4ae, 1.20, 0.00, 0.66, 0xf0e0c8, 0x948a72, 0.00, 0.0, 0.90), // 午後
        S(0.500, 0x715ea6, 0xff8e58, 0xeaa584, 0xff7a42, 0.60, 0.02, 0.50, 0xffc0a0, 0x7a6858, 0.06, 0.3, 1.15), // 日落（開始亮燈）
        S(0.575, 0x2f3874, 0xc66d97, 0x8f6888, 0xff6a4a, 0.12, 0.14, 0.34, 0x8f88c0, 0x4a4458, 0.50, 1.0, 1.20), // 黃昏（燈全亮）
        S(0.680, 0x0d1230, 0x232f5a, 0x1a2545, 0x201a18, 0.00, 0.30, 0.17, 0x46589a, 0x1a2030, 1.00, 1.0, 1.00), // 深夜
        S(0.860, 0x0d1230, 0x232f5a, 0x1a2545, 0x201a18, 0.00, 0.30, 0.17, 0x46589a, 0x1a2030, 1.00, 1.0, 1.00), // 深夜（持續）
        S(0.925, 0x1c2450, 0x4a4478, 0x4a4468, 0x584038, 0.00, 0.22, 0.26, 0x5a6aa0, 0x2a3042, 0.60, 1.0, 1.05), // 黎明前
        S(0.962, 0x3a4a88, 0x8a5878, 0xa08088, 0xff9868, 0.10, 0.10, 0.34, 0x9a90a8, 0x4a4650, 0.30, 0.0, 1.05)  // 破曉（燈已關）
      ];
      // 取樣輸出（重複使用，避免配置）
      this.state = {
        top: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(),
        sunC: new THREE.Color(), hemiSky: new THREE.Color(), hemiGnd: new THREE.Color(),
        sunI: 0, moonI: 0, hemiI: 0, stars: 0, lamp: 0, dens: 1, sunDir: new THREE.Vector3()
      };
    }

    // 依 dayT 取樣：找出所在區間 [a,b]，u = 區間內位置，逐欄位插值（含環狀回繞）
    sample(dayT) {
      const st = this.stops, s = this.state;
      let a = st[st.length - 1], b = st[0], u;
      for (let i = 0; i < st.length; i++) {
        const nxt = st[(i + 1) % st.length];
        const end = (i + 1 === st.length) ? st[0].t + 1 : nxt.t; // 回繞區間
        if (dayT >= st[i].t && dayT < end) { a = st[i]; b = nxt; u = (dayT - a.t) / (end - a.t); break; }
        if (i + 1 === st.length) { u = (dayT + 1 - a.t) / (st[0].t + 1 - a.t); }
      }
      s.top.lerpColors(a.top, b.top, u);
      s.hor.lerpColors(a.hor, b.hor, u);
      s.fog.lerpColors(a.fog, b.fog, u);
      s.sunC.lerpColors(a.sunC, b.sunC, u);
      s.hemiSky.lerpColors(a.hemiSky, b.hemiSky, u);
      s.hemiGnd.lerpColors(a.hemiGnd, b.hemiGnd, u);
      s.sunI = lerp(a.sunI, b.sunI, u);
      s.moonI = lerp(a.moonI, b.moonI, u);
      s.hemiI = lerp(a.hemiI, b.hemiI, u);
      s.stars = lerp(a.stars, b.stars, u);
      s.lamp = lerp(a.lamp, b.lamp, u);
      s.dens = lerp(a.dens, b.dens, u);
      // 太陽方位：繞場景一圈，t=0 在東方地平線、0.25 到頂、0.5 西沉
      // y 壓低到 0.66 → 正午仍保有斜射光，陰影不會消失（畫面更立體）
      const ang = dayT * Math.PI * 2;
      s.sunDir.set(Math.cos(ang), Math.sin(ang) * 0.66, 0.5).normalize();
      // 整體亮度係數：供不受光照的材質（葉、雪、雲、煙）模擬晝夜明暗
      s.light = clamp(0.24 + s.sunI * 0.55 + s.moonI * 0.5, 0, 1);
      return s;
    }
  }

  /* ==========================================================================
     SeasonSystem — 四季氣候過渡演算法
     yearT 累進（每季 SEASON_LENGTH 秒）。每季前 75% 為「純季節」，
     最後 25% 與下一季線性混合（跨季過渡窗）。
     另外維護一份 `cur`（實際套用值），以指數平滑趨近目標值 —
     這使「手動切換季節」也能獲得同樣柔順的漸變，而非瞬間跳變。
     ========================================================================== */
  class SeasonSystem {
    constructor() {
      const D = (name, emoji, grass, grassSide, folA, folB, river, fogTint, sunTint,
                 fogMul, sunMul, mist, leafRate, snowRate, snowAmt, flowers, wind) => ({
        name, emoji,
        grass: new THREE.Color(grass), grassSide: new THREE.Color(grassSide),
        folA: new THREE.Color(folA), folB: new THREE.Color(folB),
        river: new THREE.Color(river), fogTint: new THREE.Color(fogTint), sunTint: new THREE.Color(sunTint),
        fogMul, sunMul, mist, leafRate, snowRate, snowAmt, flowers, wind
      });
      this.defs = [
        //  名        emoji  草面       草側       樹A        樹B(櫻/紅) 河水       霧色調     日光調    霧倍  日倍  霧氣 葉率 雪率 雪積 花   風
        D('春 Spring', '🌸', 0x7ecf68, 0x55a447, 0x8fd97a, 0xf2b8d8, 0x6fc0e4, 0xd0dee0, 0xfff0e0, 2.70, 0.95, 1.00, 0, 0, 0.00, 1.00, 0.034),
        D('夏 Summer', '🌞', 0x5ec44b, 0x3f9c36, 0x46a83c, 0x62bc4a, 0x45aee0, 0xffffff, 0xfff2c4, 0.50, 1.16, 0.00, 0, 0, 0.00, 0.45, 0.022),
        D('秋 Autumn', '🍁', 0x8fa050, 0x6e8340, 0xe08238, 0xcc4f30, 0x6aa4c4, 0xeadcc4, 0xffe2b8, 1.20, 1.00, 0.00, 20, 0, 0.00, 0.00, 0.048),
        D('冬 Winter', '❄️', 0xe6edf2, 0xc2ccd6, 0xdde8ee, 0xe4ecf2, 0x8ab8d4, 0xdde6f0, 0xdce8fc, 1.80, 0.82, 0.25, 0, 48, 1.00, 0.00, 0.062)
      ];
      this.auto = true;
      this.yearT = 1.42;    // 開場：夏季中段（第 1 季 index=1）
      this.manualIdx = 1;
      // 目標值與實際套用值（皆為可重複寫入的容器）
      this.target = this._makeParams();
      this.cur = this._makeParams();
      this._blendAuto(this.target);
      this._copy(this.cur, this.target);
    }
    _makeParams() {
      return {
        grass: new THREE.Color(), grassSide: new THREE.Color(), folA: new THREE.Color(),
        folB: new THREE.Color(), river: new THREE.Color(), fogTint: new THREE.Color(),
        sunTint: new THREE.Color(),
        fogMul: 1, sunMul: 1, mist: 0, leafRate: 0, snowRate: 0, snowAmt: 0, flowers: 0, wind: 0.03
      };
    }
    _mix(out, a, b, t) {
      out.grass.lerpColors(a.grass, b.grass, t);
      out.grassSide.lerpColors(a.grassSide, b.grassSide, t);
      out.folA.lerpColors(a.folA, b.folA, t);
      out.folB.lerpColors(a.folB, b.folB, t);
      out.river.lerpColors(a.river, b.river, t);
      out.fogTint.lerpColors(a.fogTint, b.fogTint, t);
      out.sunTint.lerpColors(a.sunTint, b.sunTint, t);
      out.fogMul = lerp(a.fogMul, b.fogMul, t);
      out.sunMul = lerp(a.sunMul, b.sunMul, t);
      out.mist = lerp(a.mist, b.mist, t);
      out.leafRate = lerp(a.leafRate, b.leafRate, t);
      out.snowRate = lerp(a.snowRate, b.snowRate, t);
      out.snowAmt = lerp(a.snowAmt, b.snowAmt, t);
      out.flowers = lerp(a.flowers, b.flowers, t);
      out.wind = lerp(a.wind, b.wind, t);
    }
    _copy(out, src) { this._mix(out, src, src, 0); }
    // 自動模式：季節位置 p ∈ [0,4)，尾端 25% 與下一季混合（smoothstep 柔化）
    _blendAuto(out) {
      const p = this.yearT % 4;
      const i = Math.floor(p), f = p - i;
      const a = this.defs[i], b = this.defs[(i + 1) % 4];
      const g = f < 0.75 ? 0 : smooth((f - 0.75) / 0.25);
      this._mix(out, a, b, g);
      this.domIdx = g > 0.5 ? (i + 1) % 4 : i; // HUD 顯示的主導季節
    }
    setManual(i) {
      this.auto = false;
      this.manualIdx = i;
      this.yearT = Math.floor(this.yearT / 4) * 4 + i + 0.3; // 之後恢復自動時由該季接續
      this.domIdx = i;
    }
    setAuto() { this.auto = true; }
    update(dt) {
      if (this.auto) {
        this.yearT += dt / SEASON_LENGTH;
        this._blendAuto(this.target);
      } else {
        this._copy(this.target, this.defs[this.manualIdx]);
        this.domIdx = this.manualIdx;
      }
      // 指數平滑：手動切換約 2 秒內完成柔順過渡；自動模式時 k 貼近 1:1 跟隨
      const k = 1 - Math.exp(-dt * 1.6);
      this._mix(this.cur, this.cur, this.target, k);
      return this.cur;
    }
  }

  /* ==========================================================================
     Island — 島體與地景
     ========================================================================== */
  class Island {
    constructor(root) {
      this.group = new THREE.Group();
      root.add(this.group);
      const g = this.group;

      // --- 材質（保留引用供季節變色） ---
      this.grassTopMat = toon(0x5ec44b);
      this.grassSideMat = toon(0x3f9c36);
      this.dirtMat = toon(0x8a6242);
      this.rockMat = toon(0x6e6258); // 岩石的硬邊改在幾何層處理（non-indexed 平面法線）
      this.roadMat = toon(0x5a5a63);
      this.riverMat = toon(0x45aee0);

      // 草地圓台（頂面 / 側面用不同材質 → 卡通蛋糕感）
      const grassGeo = new THREE.CylinderGeometry(ISLAND_R, ISLAND_R + 1.4, 2.6, 15);
      const grass = new THREE.Mesh(grassGeo, [this.grassSideMat, this.grassTopMat, this.dirtMat]);
      grass.position.y = -1.3;
      grass.receiveShadow = true;
      grass.castShadow = true;
      g.add(grass);

      // 泥土層與底部岩錐（頂點抖動 → 有機的漂浮岩塊）
      cyl(g, ISLAND_R + 1.4, 21, 5.2, 15, 0, -5.2, 0, this.dirtMat);
      let rockGeo = new THREE.CylinderGeometry(21, 2.2, 15, 15, 4);
      const pos = rockGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y > 7.4 || y < -7.4) continue; // 保留頂/底圈平整以接合
        pos.setX(i, pos.getX(i) * (0.88 + rand() * 0.28));
        pos.setZ(i, pos.getZ(i) * (0.88 + rand() * 0.28));
        pos.setY(i, y + (rand() - 0.5) * 1.6);
      }
      // non-indexed + 重算法線 → 每面一個法線（faceted 岩石硬邊）
      rockGeo = rockGeo.toNonIndexed();
      rockGeo.computeVertexNormals();
      const rock = new THREE.Mesh(rockGeo, this.rockMat);
      rock.position.y = -15.3;
      rock.castShadow = rock.receiveShadow = true;
      g.add(rock);

      // 周邊小浮岩（緩慢漂浮，公轉留給 update）
      this.rocks = [];
      for (let i = 0; i < 4; i++) {
        const s = 1 + rand() * 1.6;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), this.rockMat);
        const grassCap = new THREE.Mesh(new THREE.DodecahedronGeometry(s * 0.72, 0), this.grassTopMat);
        grassCap.position.y = s * 0.55;
        grassCap.scale.y = 0.5;
        m.add(grassCap);
        m.castShadow = true;
        const ang = rand() * Math.PI * 2;
        m.userData = { r: ISLAND_R + 6 + rand() * 7, ang, h: -2 - rand() * 8, ph: rand() * 6.28, sp: 0.02 + rand() * 0.03 };
        g.add(m);
        this.rocks.push(m);
      }

      // --- 泰晤士河（貫穿全島的藍帶）與河岸 ---
      const halfLen = Math.sqrt(ISLAND_R * ISLAND_R - RIVER_X * RIVER_X) + 0.6; // 弦長/2
      const river = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_W, halfLen * 2), this.riverMat);
      river.rotation.x = -Math.PI / 2;
      river.position.set(RIVER_X, 0.07, 0);
      river.receiveShadow = true;
      g.add(river);
      // 微波水面：兩層滾動白色條紋
      this.streakTex = makeStreakTexture();
      const flowTex = this.streakTex.clone();
      flowTex.needsUpdate = true;
      flowTex.wrapS = flowTex.wrapT = THREE.RepeatWrapping;
      flowTex.repeat.set(2, 4);
      this.flowMat = new THREE.MeshBasicMaterial({
        map: flowTex, transparent: true, opacity: 0.16, depthWrite: false, color: 0xffffff
      });
      const flow = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_W, halfLen * 2), this.flowMat);
      flow.rotation.x = -Math.PI / 2;
      flow.position.set(RIVER_X, 0.1, 0);
      g.add(flow);
      this.flowTex = flowTex;
      // 河岸鑲邊
      box(g, 0.5, 0.34, halfLen * 2, RIVER_X - RIVER_W / 2 - 0.2, 0.17, 0, this.grassSideMat);
      box(g, 0.5, 0.34, halfLen * 2, RIVER_X + RIVER_W / 2 + 0.2, 0.17, 0, this.grassSideMat);

      // --- 兩端瀑布：滾動條紋貼圖往下流、尾端淡出 ---
      this.fallMat = new THREE.MeshBasicMaterial({
        map: this.streakTex, transparent: true, opacity: 0.62,
        depthWrite: false, side: THREE.DoubleSide, color: 0x9fd8f0
      });
      this.streakTex.repeat.set(2.4, 1.6);
      this.falls = [];
      [1, -1].forEach(dir => {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_W - 0.3, 17), this.fallMat);
        f.position.set(RIVER_X, -8.1, dir * (halfLen + 0.15));
        if (dir < 0) f.rotation.y = Math.PI;
        f.rotation.x = dir * -0.05;
        g.add(f);
        this.falls.push(f);
      });

      // --- 環形道路（巴士路線） ---
      const road = new THREE.Mesh(new THREE.RingGeometry(10.2, 12.2, 56), this.roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.y = 0.06;
      road.receiveShadow = true;
      g.add(road);

      // --- 樹木（幹 + 2~3 顆樹冠球；樹冠材質分 A/B 兩組供季節變色） ---
      this.folAMat = toon(0x46a83c);
      this.folBMat = toon(0x62bc4a);
      this.trunkMat = toon(0x7a5236);
      this.folMeshes = [];
      const treePos = [
        [-8, -17], [-13.5, -11], [-19, -4.5], [-21, 7], [-11, 14], [-4, 19],
        [6, 17.5], [20.6, -7.5], [20.2, 6.5], [9, -18.5], [5.5, -5.5], [-5, 6]
      ];
      treePos.forEach(([x, z], i) => {
        const t = new THREE.Group();
        const s = 0.75 + rand() * 0.55;
        const trunkH = 1.6 * s;
        cyl(t, 0.22 * s, 0.3 * s, trunkH, 7, 0, trunkH / 2, 0, this.trunkMat);
        const mat = (i % 2 === 0) ? this.folAMat : this.folBMat;
        const blobs = [
          [0, trunkH + 1.1 * s, 0, 1.25 * s],
          [0.7 * s, trunkH + 0.55 * s, 0.25 * s, 0.8 * s],
          [-0.6 * s, trunkH + 0.65 * s, -0.3 * s, 0.72 * s]
        ];
        blobs.forEach(([bx, by, bz, br]) => {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 1), mat);
          b.position.set(bx, by, bz);
          b.castShadow = b.receiveShadow = true;
          b.userData.baseScale = 1;
          t.add(b);
          this.folMeshes.push(b);
        });
        t.position.set(x, 0, z);
        t.rotation.y = rand() * Math.PI * 2;
        g.add(t);
      });

      // --- 灌木叢 ---
      const bushPos = [[8.4, 6.2], [-7.5, -8.2], [12, -9.8], [-14.5, 5.2], [3, -9.4], [18.9, 1.5]];
      bushPos.forEach(([x, z]) => {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + rand() * 0.5, 1), this.folBMat);
        b.position.set(x, 0.45, z);
        b.scale.y = 0.75;
        b.castShadow = b.receiveShadow = true;
        g.add(b);
        this.folMeshes.push(b);
      });

      // --- 春季小花（InstancedMesh，縮放隨季節 flowers 參數開合） ---
      const flowerGeo = new THREE.SphereGeometry(0.26, 6, 5);
      const flowerMat = new THREE.MeshToonMaterial({ gradientMap: GRADIENT, color: 0xffffff });
      this.flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, 48);
      this.flowers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const fCols = [0xff8fb8, 0xffe066, 0xffffff, 0xc79bff, 0xff9e6b];
      this.flowerBase = [];
      let placed = 0;
      while (placed < 48) {
        const a = rand() * Math.PI * 2, r = 3 + Math.sqrt(rand()) * 21;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const rr = Math.hypot(x, z);
        if (rr > 10 && rr < 12.4) continue;                    // 避開道路
        if (x > RIVER_X - RIVER_W / 2 - 1 && x < RIVER_X + RIVER_W / 2 + 1) continue; // 避開河
        this.flowerBase.push({ x, z, s: 0.7 + rand() * 0.7 });
        this.flowers.setColorAt(placed, _c1.setHex(fCols[placed % fCols.length]));
        placed++;
      }
      this.flowers.castShadow = false;
      g.add(this.flowers);
      this.flowerScale = -1;

      // --- 街燈（4 座，其中 2 座掛真實 PointLight，其餘以自發光表現） ---
      this.lampMat = toon(0x2e3138);
      this.bulbMat = toon(0xfff3cf, { emissive: 0xffdf8f, emissiveIntensity: 0 });
      this.lampLights = [];
      const lampAng = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
      lampAng.forEach((a, i) => {
        const x = Math.cos(a) * 13.4, z = Math.sin(a) * 13.4;
        const lp = new THREE.Group();
        cyl(lp, 0.07, 0.1, 2.6, 6, 0, 1.3, 0, this.lampMat);
        box(lp, 0.34, 0.4, 0.34, 0, 2.75, 0, this.bulbMat).castShadow = false;
        cyl(lp, 0.24, 0.02, 0.2, 4, 0, 3.05, 0, this.lampMat);
        lp.position.set(x, 0, z);
        g.add(lp);
        if (i % 2 === 0) {
          const pl = new THREE.PointLight(0xffd98f, 0, 11, 2);
          pl.position.set(x, 2.9, z);
          g.add(pl);
          this.lampLights.push(pl);
        }
      });

      // --- 紅色電話亭 ×2（倫敦味） ---
      const boothMat = toon(0xd0342c);
      const boothGlassMat = toon(0xcfe8f2, { emissive: 0xfff0c8, emissiveIntensity: 0 });
      this.boothGlassMat = boothGlassMat;
      [[5.2, 7.4, 0.6], [9.2, -3.5, -0.8]].forEach(([x, z, ry]) => {
        const bo = new THREE.Group();
        box(bo, 0.85, 1.9, 0.85, 0, 0.95, 0, boothMat);
        box(bo, 0.62, 1.0, 0.9, 0, 1.05, 0, boothGlassMat).castShadow = false;
        box(bo, 0.95, 0.18, 0.95, 0, 1.98, 0, boothMat);
        bo.position.set(x, 0, z);
        bo.rotation.y = ry;
        g.add(bo);
      });

      // 草地淡色圓斑（卡通質感點綴）
      const patchMat = new THREE.MeshToonMaterial({ gradientMap: GRADIENT, color: 0xffffff, transparent: true, opacity: 0.16 });
      this.patchMat = patchMat;
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2, r = 4 + rand() * 20;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (x > RIVER_X - RIVER_W / 2 - 1.5) continue;
        const p = new THREE.Mesh(new THREE.CircleGeometry(1 + rand() * 2, 10), patchMat);
        p.rotation.x = -Math.PI / 2;
        p.position.set(x, 0.045, z);
        g.add(p);
      }

      // 供雪積色使用的材質清單（base → snowy）
      this.snowables = [
        { mat: this.roadMat, base: new THREE.Color(0x5a5a63), snowy: new THREE.Color(0xdde4ec), k: 0.85 },
        { mat: this.dirtMat, base: new THREE.Color(0x8a6242), snowy: new THREE.Color(0xb8a898), k: 0.5 },
        { mat: this.rockMat, base: new THREE.Color(0x6e6258), snowy: new THREE.Color(0xa8b0bc), k: 0.55 },
        { mat: this.trunkMat, base: new THREE.Color(0x7a5236), snowy: new THREE.Color(0x9a8878), k: 0.4 }
      ];
    }

    update(dt, time, S, P) {
      // 季節上色（cur 已平滑，直接複製即可）
      this.grassTopMat.color.copy(P.grass);
      this.grassSideMat.color.copy(P.grassSide);
      this.folAMat.color.copy(P.folA);
      this.folBMat.color.copy(P.folB);
      this.riverMat.color.copy(P.river);
      this.snowables.forEach(s => s.mat.color.copy(s.base).lerp(s.snowy, P.snowAmt * s.k));

      // 冬季樹冠輕微壓扁（覆雪感）
      const squash = 1 - 0.15 * P.snowAmt;
      this.folMeshes.forEach(m => { m.scale.y = squash; });

      // 河水 / 瀑布流動（貼圖 offset 滾動 = 廉價的動態水）
      this.flowTex.offset.y = (this.flowTex.offset.y + dt * 0.35) % 1;
      this.streakTex.offset.y = (this.streakTex.offset.y - dt * 0.55) % 1;
      const L = S.light;
      this.flowMat.opacity = 0.1 + 0.1 * L;
      this.fallMat.color.copy(P.river).lerp(_c1.setHex(0xffffff), 0.5).multiplyScalar(0.45 + 0.6 * L);
      this.fallMat.opacity = 0.55 + 0.25 * L;

      // 花朵開合（僅在數值有感變動時重寫矩陣）
      if (Math.abs(P.flowers - this.flowerScale) > 0.004) {
        this.flowerScale = P.flowers;
        this.flowerBase.forEach((f, i) => {
          const s = Math.max(0.0001, f.s * this.flowerScale);
          _dummy.position.set(f.x, 0.14 * s + 0.1, f.z);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.setScalar(s);
          _dummy.updateMatrix();
          this.flowers.setMatrixAt(i, _dummy.matrix);
        });
        this.flowers.instanceMatrix.needsUpdate = true;
        if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
      }

      // 街燈（隨 lamp 亮度開關）
      this.bulbMat.emissiveIntensity = S.lamp * 2.2;
      this.boothGlassMat.emissiveIntensity = S.lamp * 0.9;
      this.lampLights.forEach(l => { l.intensity = S.lamp * 0.9; });

      // 浮岩公轉 + 上下漂浮
      this.rocks.forEach(m => {
        const u = m.userData;
        u.ang += u.sp * dt;
        m.position.set(Math.cos(u.ang) * u.r, u.h + Math.sin(time * 0.6 + u.ph) * 1.2, Math.sin(u.ang) * u.r);
        m.rotation.y += dt * 0.1;
      });
    }
  }

  /* ==========================================================================
     BigBen — 大笨鐘：四面時鐘會依「場景時間」走動，夜晚鐘面與窗戶亮起
     ========================================================================== */
  class BigBen {
    constructor(root) {
      const g = this.group = new THREE.Group();
      root.add(g);

      const stone = toon(0xd9b98a);
      const trim = toon(0xb2905e);
      const roof = toon(0x4f6660);
      this.roofMat = roof;
      const gold = toon(0xf0c050, { emissive: 0xf0b040, emissiveIntensity: 0.15 });
      this.goldMat = gold;
      this.windowMat = toon(0x38405a, { emissive: 0xffd98a, emissiveIntensity: 0 });
      this.faceMat = toon(0xfdf6e0, { emissive: 0xffe9b0, emissiveIntensity: 0 });
      const handMat = toon(0x22252e);
      const ringMat = toon(0x2f3440);

      // 基座與塔身
      box(g, 6, 1.2, 6, 0, 0.6, 0, trim);
      box(g, 5, 1.0, 5, 0, 1.7, 0, stone);
      box(g, 3.6, 13, 3.6, 0, 8.7, 0, stone);
      // 四角壁柱
      [[1.75, 1.75], [-1.75, 1.75], [1.75, -1.75], [-1.75, -1.75]].forEach(([x, z]) => {
        box(g, 0.5, 13, 0.5, x, 8.7, z, trim);
      });

      // 塔身長窗（InstancedMesh 一次繪製 40 扇；夜間自發光）
      const winGeo = new THREE.BoxGeometry(0.44, 0.9, 0.08);
      this.windows = new THREE.InstancedMesh(winGeo, this.windowMat, 40);
      let wi = 0;
      for (let f = 0; f < 4; f++) {           // 四個面
        const ry = f * Math.PI / 2;
        for (let cx = -1; cx <= 1; cx += 2) { // 兩列
          for (let ry2 = 0; ry2 < 5; ry2++) { // 五行
            _dummy.position.set(cx * 0.8, 4.4 + ry2 * 2.2, 1.83);
            _dummy.rotation.set(0, 0, 0);
            _dummy.scale.setScalar(1);
            _dummy.position.applyAxisAngle(_v1.set(0, 1, 0), ry);
            _dummy.rotation.y = ry;
            _dummy.updateMatrix();
            this.windows.setMatrixAt(wi++, _dummy.matrix);
          }
        }
      }
      g.add(this.windows);

      // 鐘樓段（含四面鐘）
      box(g, 4.6, 0.5, 4.6, 0, 15.45, 0, trim);
      box(g, 4.4, 3.2, 4.4, 0, 17.3, 0, stone);
      box(g, 4.8, 0.4, 4.8, 0, 19.1, 0, trim);
      this.hands = [];
      for (let f = 0; f < 4; f++) {
        const face = new THREE.Group();
        face.rotation.y = f * Math.PI / 2;
        g.add(face);
        const dial = new THREE.Mesh(new THREE.CircleGeometry(1.55, 24), this.faceMat);
        dial.position.set(0, 17.3, 2.21);
        face.add(dial);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.13, 8, 28), ringMat);
        ring.position.set(0, 17.3, 2.21);
        face.add(ring);
        // 時針 / 分針：幾何往 +Y 平移，使旋轉軸恰為錶心
        const hourGeo = new THREE.BoxGeometry(0.2, 0.92, 0.05); hourGeo.translate(0, 0.4, 0);
        const minGeo = new THREE.BoxGeometry(0.14, 1.36, 0.05); minGeo.translate(0, 0.62, 0);
        const hour = new THREE.Mesh(hourGeo, handMat);
        const minute = new THREE.Mesh(minGeo, handMat);
        hour.position.set(0, 17.3, 2.26);
        minute.position.set(0, 17.3, 2.28);
        face.add(hour, minute);
        const hub = new THREE.Mesh(new THREE.CircleGeometry(0.14, 10), handMat);
        hub.position.set(0, 17.3, 2.3);
        face.add(hub);
        this.hands.push({ hour, minute });
      }

      // 鐘室（夜晚透出暖光）與尖頂
      this.belfryMat = toon(0x3a3448, { emissive: 0xffc870, emissiveIntensity: 0 });
      box(g, 3.1, 1.4, 3.1, 0, 20.0, 0, stone);
      for (let f = 0; f < 4; f++) {
        const a = f * Math.PI / 2;
        const w = box(g, 0.8, 1.0, 0.1, Math.sin(a) * 1.56, 20.0, Math.cos(a) * 1.56, this.belfryMat);
        w.rotation.y = a;
        w.castShadow = false;
      }
      const spire = cyl(g, 0.01, 2.25, 3.3, 4, 0, 22.4, 0, roof);
      spire.rotation.y = Math.PI / 4;
      cyl(g, 0.01, 0.8, 1.5, 4, 0, 24.6, 0, roof).rotation.y = Math.PI / 4;
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), gold);
      fin.position.y = 25.6;
      g.add(fin);

      // 鐘面補光（黃昏亮起 → 名符其實的城市地標）
      this.clockLight = new THREE.PointLight(0xffe9a8, 0, 16, 2);
      this.clockLight.position.set(0, 17.5, 0);
      g.add(this.clockLight);

      this.snowables = [
        { mat: roof, base: new THREE.Color(0x4f6660), snowy: new THREE.Color(0xdce6ea), k: 0.9 }
      ];
    }

    // hours：場景內時刻（0~24，dayT=0 對應清晨 6 點）
    update(dt, S, P, hours) {
      const hA = -((hours % 12) / 12) * Math.PI * 2;
      const mA = -(hours % 1) * Math.PI * 2;
      this.hands.forEach(h => {
        h.hour.rotation.z = hA;
        h.minute.rotation.z = mA;
      });
      this.faceMat.emissiveIntensity = S.lamp * 0.95;
      this.windowMat.emissiveIntensity = S.lamp * 1.5;
      this.belfryMat.emissiveIntensity = S.lamp * 1.3;
      this.goldMat.emissiveIntensity = 0.15 + S.lamp * 0.45;
      this.clockLight.intensity = S.lamp * 1.1;
      this.snowables.forEach(s => s.mat.color.copy(s.base).lerp(s.snowy, P.snowAmt * s.k));
    }
  }

  /* ==========================================================================
     LondonEye — 倫敦眼：輪體旋轉；吊艙位置以「輪角 + 固定姿態」計算 → 永遠直立
     ========================================================================== */
  class LondonEye {
    constructor(root) {
      const g = this.group = new THREE.Group();
      g.position.set(-16.5, 0, 0);
      g.rotation.y = 0.72; // 輪面朝向預設鏡頭方位
      root.add(g);

      const white = toon(0xeef2f6);
      this.rimMat = toon(0xdfe8f0, { emissive: 0x5fc8ff, emissiveIntensity: 0 });
      this.podMat = toon(0x9fc8e0, { emissive: 0xbfe8ff, emissiveIntensity: 0 });
      const HUB_Y = 8.2, R = 7;
      this.R = R; this.HUB_Y = HUB_Y;

      // A 字支架（前後各一組，斜向撐住輪軸）
      [-1, 1].forEach(sz => {
        strut(g, -3.4, 0, sz * 2.6, 0, HUB_Y, sz * 0.55, 0.17, white);
        strut(g, 3.4, 0, sz * 2.6, 0, HUB_Y, sz * 0.55, 0.17, white);
      });
      const axle = cyl(g, 0.28, 0.28, 2.4, 10, 0, HUB_Y, 0, white);
      axle.rotation.x = Math.PI / 2;

      // 輪體：外圈 + 內圈 + 輻條
      this.wheel = new THREE.Group();
      this.wheel.position.y = HUB_Y;
      g.add(this.wheel);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.17, 8, 44), this.rimMat);
      rim.castShadow = true;
      this.wheel.add(rim);
      this.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R - 0.55, 0.07, 6, 40), this.rimMat));
      for (let i = 0; i < 20; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, R - 0.1, 5), white);
        sp.position.y = (R - 0.1) / 2;
        const holder = new THREE.Group();
        holder.rotation.z = (i / 20) * Math.PI * 2;
        holder.add(sp);
        this.wheel.add(holder);
      }
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), this.rimMat);
      this.wheel.add(hub);

      // 吊艙（掛在 g 而非 wheel → 不隨輪旋轉，永遠保持直立）
      this.pods = [];
      const podGeo = new THREE.CapsuleGeometry(0.42, 0.55, 4, 10);
      podGeo.rotateZ(Math.PI / 2);
      for (let i = 0; i < 12; i++) {
        const p = new THREE.Mesh(podGeo, this.podMat);
        p.castShadow = true;
        g.add(p);
        this.pods.push(p);
      }
      this.angle = 0;

      // 中心點光（夜晚的藍色霓虹感）
      this.glow = new THREE.PointLight(0x7fd4ff, 0, 20, 2);
      this.glow.position.y = HUB_Y;
      g.add(this.glow);
    }
    update(dt, S) {
      this.angle += dt * 0.16; // 緩慢轉動
      this.wheel.rotation.z = this.angle;
      for (let i = 0; i < 12; i++) {
        const a = this.angle + (i / 12) * Math.PI * 2;
        this.pods[i].position.set(Math.cos(a) * this.R, this.HUB_Y + Math.sin(a) * this.R, 0);
      }
      this.rimMat.emissiveIntensity = S.lamp * 1.25;
      this.podMat.emissiveIntensity = S.lamp * 0.7;
      this.glow.intensity = S.lamp * 1.0;
    }
  }

  /* ==========================================================================
     TowerBridge — 倫敦塔橋：船靠近時活動橋面升起（緩動），走道掛夜燈
     ========================================================================== */
  class TowerBridge {
    constructor(root) {
      const g = this.group = new THREE.Group();
      root.add(g);

      const stone = toon(0xe6dcc2);
      const blue = toon(0x5b95cc);
      this.blueMat = blue;
      this.roofMat = toon(0x51707e);
      this.winMat = toon(0x3a4258, { emissive: 0xffd98a, emissiveIntensity: 0 });
      this.deckMat = toon(0x707684);
      this.lightMat = toon(0xfff2c8, { emissive: 0xffe2a0, emissiveIntensity: 0 });

      const TX = [12.2, 17.8]; // 兩座塔的 x 位置（跨在河兩岸）
      const TOP = 7.6;

      TX.forEach(tx => {
        // 橋墩（立於水面）
        box(g, 2.6, 1.6, 3.6, tx, 0.5, 0, stone);
        // 塔身與四角小塔
        box(g, 2.2, 5.6, 2.2, tx, 4.1, 0, stone);
        [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
          cyl(g, 0.26, 0.26, 6.4, 7, tx + sx * 1.05, 4.4, sz * 1.05, stone);
          cyl(g, 0.01, 0.34, 0.8, 7, tx + sx * 1.05, 8.0, sz * 1.05, this.roofMat);
        });
        const roof = cyl(g, 0.03, 1.35, 1.5, 4, tx, 7.8, 0, this.roofMat);
        roof.rotation.y = Math.PI / 4;
        // 塔窗
        const w1 = box(g, 0.7, 1.0, 0.1, tx, 4.6, 1.16, this.winMat); w1.castShadow = false;
        const w2 = box(g, 0.7, 1.0, 0.1, tx, 4.6, -1.16, this.winMat); w2.castShadow = false;
      });

      // 上層走道（塔橋的招牌雙走廊）
      box(g, 5.4, 0.42, 1.0, 15, 6.6, 0.62, blue);
      box(g, 5.4, 0.42, 1.0, 15, 6.6, -0.62, blue);
      box(g, 5.4, 0.16, 2.5, 15, 6.0, 0, blue);

      // 引道（兩側固定橋面 + 斜坡）
      box(g, 1.9, 0.3, 3.2, 10.35, 2.0, 0, this.deckMat);
      box(g, 1.9, 0.3, 3.2, 19.65, 2.0, 0, this.deckMat);
      const rampL = box(g, 3.4, 0.28, 3.2, 7.9, 1.0, 0, this.deckMat);
      rampL.rotation.z = -0.55;
      const rampR = box(g, 3.4, 0.28, 3.2, 22.1, 1.0, 0, this.deckMat);
      rampR.rotation.z = 0.55;

      // 活動橋面（bascule）：以河道兩緣為鉸鏈的樞紐群組
      this.leafL = new THREE.Group(); this.leafL.position.set(13.35, 2.05, 0);
      this.leafR = new THREE.Group(); this.leafR.position.set(16.65, 2.05, 0);
      box(this.leafL, 1.7, 0.22, 3.0, 0.85, 0, 0, blue);
      box(this.leafR, 1.7, 0.22, 3.0, -0.85, 0, 0, blue);
      g.add(this.leafL, this.leafR);
      this.openT = 0;

      // 懸鏈（塔頂 → 引道末端，二次貝茲取樣以短圓柱連成）
      const chainMat = blue;
      const mkChain = (x0, y0, x1, y1, z) => {
        const N = 7;
        let px = x0, py = y0;
        for (let i = 1; i <= N; i++) {
          const t = i / N;
          const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 1.1; // 控制點（下垂）
          const cx = lerp(lerp(x0, mx, t), lerp(mx, x1, t), t);
          const cy = lerp(lerp(y0, my, t), lerp(my, y1, t), t);
          const len = Math.hypot(cx - px, cy - py);
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 5), chainMat);
          seg.position.set((px + cx) / 2, (py + cy) / 2, z);
          // 圓柱體沿 +Y，繞 Z 旋轉對齊線段方向（XY 平面內）
          seg.rotation.z = Math.atan2(cy - py, cx - px) - Math.PI / 2;
          g.add(seg);
          px = cx; py = cy;
        }
      };
      [-1.35, 1.35].forEach(z => {
        mkChain(12.2, TOP, 9.0, 2.5, z);
        mkChain(17.8, TOP, 21.0, 2.5, z);
      });

      // 走道夜燈串
      this.lights = [];
      for (let i = 0; i < 7; i++) {
        const x = 12.9 + i * 0.7;
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), this.lightMat);
        s.position.set(x, 6.95, 1.15);
        g.add(s);
        const s2 = s.clone(); s2.position.z = -1.15; g.add(s2);
      }

      this.snowables = [
        { mat: this.roofMat, base: new THREE.Color(0x51707e), snowy: new THREE.Color(0xdde6ec), k: 0.9 },
        { mat: this.deckMat, base: new THREE.Color(0x707684), snowy: new THREE.Color(0xd8dfe8), k: 0.8 }
      ];
    }
    update(dt, S, P, boatZ) {
      // 船距橋 < 7 單位時開橋，離開後放下（指數緩動 → 機械感的滑順）
      const target = Math.abs(boatZ) < 7 ? 1 : 0;
      this.openT += (target - this.openT) * Math.min(1, dt * 1.5);
      this.leafL.rotation.z = this.openT * 0.92;
      this.leafR.rotation.z = -this.openT * 0.92;

      this.winMat.emissiveIntensity = S.lamp * 1.4;
      this.lightMat.emissiveIntensity = S.lamp * 1.8;
      this.snowables.forEach(s => s.mat.color.copy(s.base).lerp(s.snowy, P.snowAmt * s.k));
    }
  }

  /* ==========================================================================
     Boat — 泰晤士小汽船：往返河道、靠近塔橋時觸發開橋、煙囪冒煙（sprite 池）
     ========================================================================== */
  class Boat {
    constructor(root, smokeTex) {
      const g = this.group = new THREE.Group();
      root.add(g);
      const hullMat = toon(0x8a4a32);
      const cabinMat = toon(0xf2ead8);
      const stackMat = toon(0x3a3f4a);
      this.lanternMat = toon(0xfff2c0, { emissive: 0xffdf90, emissiveIntensity: 0 });

      box(g, 2.4, 0.5, 1.05, 0, 0.3, 0, hullMat);
      const bow = cyl(g, 0.53, 0.53, 1.05, 3, 1.45, 0.3, 0, hullMat);
      bow.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      bow.scale.set(1, 1, 0.55);
      box(g, 1.1, 0.62, 0.8, -0.15, 0.86, 0, cabinMat);
      cyl(g, 0.13, 0.16, 0.72, 8, 0.62, 1.0, 0, stackMat);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), this.lanternMat);
      lantern.position.set(1.3, 0.72, 0);
      g.add(lantern);

      this.z = -12; this.dir = 1; this.speed = 2.1;
      this.targetRotY = 0;

      // 煙霧粒子池
      this.smoke = [];
      for (let i = 0; i < 10; i++) {
        const m = new THREE.SpriteMaterial({ map: smokeTex, color: 0xeef0f4, transparent: true, opacity: 0, depthWrite: false });
        const s = new THREE.Sprite(m);
        s.visible = false;
        root.add(s);
        this.smoke.push({ s, life: 0, max: 1 });
      }
      this.smokeAcc = 0;
    }
    update(dt, time, S) {
      // 往返航行；到端點折返（旋轉以緩動翻面）
      this.z += this.dir * this.speed * dt;
      const LIMIT = 17.5;
      if (this.z > LIMIT) { this.z = LIMIT; this.dir = -1; }
      if (this.z < -LIMIT) { this.z = -LIMIT; this.dir = 1; }
      this.targetRotY = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.rotation.y += (this.targetRotY - this.group.rotation.y) * Math.min(1, dt * 3);
      this.group.position.set(RIVER_X, 0.12 + Math.sin(time * 2.1) * 0.05, this.z);
      this.group.rotation.z = Math.sin(time * 1.7) * 0.03;
      this.lanternMat.emissiveIntensity = S.lamp * 2.0;

      // 煙：每 0.45s 由池中取一顆重生
      this.smokeAcc += dt;
      if (this.smokeAcc > 0.45) {
        this.smokeAcc = 0;
        const p = this.smoke.find(p => p.life <= 0);
        if (p) {
          p.life = p.max = 1.9 + rand() * 0.7;
          // 由船身朝向換算煙囪（船身局部 x=0.62）的世界位置
          const ry = this.group.rotation.y;
          p.s.position.set(RIVER_X + 0.62 * Math.cos(ry), 1.3, this.z - 0.62 * Math.sin(ry));
          p.s.visible = true;
          p.s.scale.setScalar(0.4);
        }
      }
      const L = S.light;
      this.smoke.forEach(p => {
        if (p.life <= 0) return;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; return; }
        const t = 1 - p.life / p.max;
        p.s.position.y += dt * 0.85;
        p.s.position.x += dt * 0.2;
        p.s.scale.setScalar(0.4 + t * 1.6);
        p.s.material.opacity = (1 - t) * 0.4;
        p.s.material.color.setScalar(0.45 + 0.55 * L);
      });
    }
  }

  /* ==========================================================================
     Bus — 紅色雙層巴士 ×2：沿環形道路行駛
     ========================================================================== */
  class Bus {
    constructor(root, offset) {
      const g = this.group = new THREE.Group();
      root.add(g);
      const red = toon(0xc93325);
      this.bandMat = toon(0xf4ede0, { emissive: 0xfff0c0, emissiveIntensity: 0 });
      const wheelMat = toon(0x24262c);

      box(g, 3.1, 0.85, 1.45, 0, 0.78, 0, red);
      box(g, 3.1, 0.8, 1.45, 0, 1.63, 0, red);
      box(g, 3.14, 0.34, 1.48, 0, 1.78, 0, this.bandMat).castShadow = false; // 上層窗帶
      box(g, 3.14, 0.3, 1.48, 0, 0.95, 0, this.bandMat).castShadow = false;  // 下層窗帶
      box(g, 3.0, 0.1, 1.4, 0, 2.08, 0, red);
      this.wheels = [];
      [[-1.05, 0.78], [1.05, 0.78], [-1.05, -0.78], [1.05, -0.78]].forEach(([x, z]) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.3, z);
        w.castShadow = true;
        g.add(w);
        this.wheels.push(w);
      });

      this.a = offset;
      this.R = 11.2;
      this.speed = 3.0; // 線速度
    }
    update(dt, S) {
      this.a += (this.speed / this.R) * dt;
      const x = Math.cos(this.a) * this.R, z = Math.sin(this.a) * this.R;
      this.group.position.set(x, 0.02, z);
      this.group.rotation.y = -this.a + Math.PI; // 車頭朝切線方向
      this.wheels.forEach(w => { w.rotation.y += (this.speed / 0.3) * dt * 0.2; });
      this.bandMat.emissiveIntensity = S.lamp * 0.9;
    }
  }

  /* ==========================================================================
     CloudLayer — 卡通雲層：球串組成，繞島緩慢漂移並投下移動影子
     ========================================================================== */
  class CloudLayer {
    constructor(scene) {
      this.mat = new THREE.MeshToonMaterial({ gradientMap: GRADIENT, color: 0xffffff });
      this.clouds = [];
      const mkCloud = (rMin, rSpan, hMin, hSpan, sMin, sSpan) => {
        const c = new THREE.Group();
        const n = 3 + Math.floor(rand() * 3);
        for (let j = 0; j < n; j++) {
          const r = 1.5 + rand() * 2.2;
          const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), this.mat);
          b.position.set((j - n / 2) * 2.1 + rand(), rand() * 0.9, rand() * 1.4 - 0.7);
          b.castShadow = true;
          c.add(b);
        }
        c.userData = {
          r: rMin + rand() * rSpan, ang: rand() * Math.PI * 2,
          h: hMin + rand() * hSpan, sp: 0.012 + rand() * 0.014
        };
        c.scale.setScalar(sMin + rand() * sSpan);
        scene.add(c);
        this.clouds.push(c);
      };
      // 遠景大雲（背景層）+ 島緣低空雲絮（雲海感）：兩層都避開相機視線帶
      for (let i = 0; i < 4; i++) mkCloud(58, 22, 16, 14, 1.2, 0.7);
      for (let i = 0; i < 4; i++) mkCloud(33, 9, 5, 5, 0.5, 0.35);
      this.day = new THREE.Color(0xffffff);
      this.night = new THREE.Color(0x5a6488);
    }
    update(dt, S) {
      this.clouds.forEach(c => {
        const u = c.userData;
        u.ang += u.sp * dt;
        c.position.set(Math.cos(u.ang) * u.r, u.h, Math.sin(u.ang) * u.r);
      });
      // 雲色 = 亮度插值後再染上一點地平線色 → 黃昏的雲會泛橘粉
      this.mat.color.lerpColors(this.night, this.day, S.light);
      this.mat.color.lerp(S.hor, 0.48);
    }
  }

  /* ==========================================================================
     Celestials — 太陽 / 月亮 / 星星：位置由 dayT 決定，星星夜間淡入 + 微閃爍
     ========================================================================== */
  class Celestials {
    constructor(scene, glowTex) {
      this.sun = new THREE.Group();
      const sunBall = new THREE.Mesh(
        new THREE.SphereGeometry(5, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
      );
      const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xffd77a, transparent: true, opacity: 0.75, fog: false, depthWrite: false
      }));
      sunGlow.scale.setScalar(26);
      this.sun.add(sunBall, sunGlow);
      scene.add(this.sun);

      this.moon = new THREE.Group();
      const moonBall = new THREE.Mesh(
        new THREE.SphereGeometry(3.4, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xe8eef8, fog: false })
      );
      // 月面陰影小圓
      const crater = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xc2ccdc, fog: false }));
      crater.scale.setScalar(0.96);
      crater.position.set(0.5, 0.4, -0.4);
      const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xbfd4ff, transparent: true, opacity: 0.5, fog: false, depthWrite: false
      }));
      moonGlow.scale.setScalar(15);
      this.moon.add(crater, moonBall, moonGlow);
      scene.add(this.moon);

      // 星空（上半球隨機分佈的 Points）
      const N = 340;
      const posArr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        // 均勻取樣上半球（y > 0.08）
        let x, y, z, l;
        do {
          x = rand() * 2 - 1; y = rand(); z = rand() * 2 - 1;
          l = Math.hypot(x, y, z);
        } while (l > 1 || y / l < 0.06);
        posArr[i * 3] = (x / l) * 160;
        posArr[i * 3 + 1] = (y / l) * 160;
        posArr[i * 3 + 2] = (z / l) * 160;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      this.starMat = new THREE.PointsMaterial({
        color: 0xffffff, size: 2.2, sizeAttenuation: false,
        transparent: true, opacity: 0, fog: false, depthWrite: false
      });
      const stars = new THREE.Points(starGeo, this.starMat);
      stars.frustumCulled = false;
      scene.add(stars);
    }
    update(time, S) {
      this.sun.position.copy(S.sunDir).multiplyScalar(128);
      this.moon.position.copy(S.sunDir).multiplyScalar(-126);
      this.moon.position.z -= 18;
      this.sun.visible = S.sunDir.y > -0.18;
      this.moon.visible = -S.sunDir.y > -0.18;
      // 微閃爍：整體 opacity 疊一點慢速正弦
      this.starMat.opacity = S.stars * (0.82 + 0.18 * Math.sin(time * 2.3));
    }
  }

  /* ==========================================================================
     WeatherSystem — 天氣粒子（核心效能設計）
     - 楓葉 / 雪花各用一顆 InstancedMesh（單次 draw call 繪出全部粒子）
     - 物件池：固定大小的狀態陣列 + free list。粒子死亡 → push 回池，
       生成時 pop 出來重設 → 零記憶體配置、零 GC 壓力
     - 生成速率 = 季節參數（過渡期間自然升降）
     - 楓葉物理：等速下落 + 相位化左右擺動（cos 累加）+ 雙軸自旋，
       落地後停留漸隱；雪花較慢、帶橫向漂移
     ========================================================================== */
  class ParticlePool {
    constructor(root, geo, mat, capacity, conf) {
      this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.castShadow = false;
      this.mesh.frustumCulled = false;
      root.add(this.mesh);
      this.cap = capacity;
      this.conf = conf;
      this.parts = [];
      this.free = [];
      for (let i = 0; i < capacity; i++) {
        this.parts.push({
          on: false, x: 0, y: 0, z: 0, fall: 0, swPh: 0, swSp: 0, swAmp: 0,
          rx: 0, ry: 0, rz: 0, vrx: 0, vry: 0, vrz: 0, drift: 0,
          land: 0, scale: 1
        });
        this.free.push(i);
        // 初始全部縮到 0（隱形）
        _dummy.position.set(0, -999, 0);
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
      }
      this.active = 0;
      this.acc = 0;
    }
    spawn() {
      if (!this.free.length) return;
      const i = this.free.pop();
      const p = this.parts[i];
      const c = this.conf;
      p.on = true;
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (ISLAND_R + 3);
      p.x = Math.cos(a) * r;
      p.z = Math.sin(a) * r;
      p.y = c.spawnY[0] + rand() * (c.spawnY[1] - c.spawnY[0]);
      p.fall = c.fall[0] + rand() * (c.fall[1] - c.fall[0]);
      p.swPh = rand() * Math.PI * 2;
      p.swSp = 1.2 + rand() * 1.8;
      p.swAmp = c.sway[0] + rand() * (c.sway[1] - c.sway[0]);
      p.rx = rand() * 6.28; p.ry = rand() * 6.28; p.rz = rand() * 6.28;
      p.vrx = (rand() - 0.5) * c.spin;
      p.vry = (rand() - 0.5) * c.spin;
      p.vrz = (rand() - 0.5) * c.spin * 0.6;
      p.drift = (rand() - 0.5) * 0.5;
      p.land = 0;
      p.scale = c.size[0] + rand() * (c.size[1] - c.size[0]);
      this.active++;
    }
    update(dt, rate, windX) {
      // 依速率生成（累加器把「每秒 N 顆」化為逐幀整數生成）
      this.acc += rate * dt;
      while (this.acc >= 1) { this.acc -= 1; this.spawn(); }

      const c = this.conf;
      let needsUpdate = false;
      for (let i = 0; i < this.cap; i++) {
        const p = this.parts[i];
        if (!p.on) continue;
        needsUpdate = true;
        let sc = p.scale;
        if (p.land > 0) {
          // 已落地：停留原地並漸隱（縮小）
          p.land -= dt;
          sc = p.scale * Math.max(0, p.land / c.linger);
          if (p.land <= 0) { p.on = false; this.active--; this.free.push(i); sc = 0.0001; }
        } else {
          p.swPh += p.swSp * dt;
          p.y -= p.fall * dt;
          p.x += (Math.cos(p.swPh) * p.swAmp + windX + p.drift) * dt; // 擺動 + 風
          p.z += Math.sin(p.swPh * 0.7) * p.swAmp * 0.4 * dt;
          p.rx += p.vrx * dt; p.ry += p.vry * dt; p.rz += p.vrz * dt;
          const inIsland = (p.x * p.x + p.z * p.z) < (ISLAND_R - 0.5) * (ISLAND_R - 0.5);
          if (inIsland && p.y <= c.ground) {
            p.y = c.ground;
            p.land = c.linger; // 進入落地停留階段
          } else if (p.y < -30) {
            p.on = false; this.active--; this.free.push(i); sc = 0.0001; // 掉出島外 → 回收
          }
        }
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(p.rx, p.ry, p.rz);
        _dummy.scale.setScalar(Math.max(0.0001, sc));
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
      }
      if (needsUpdate) this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  class WeatherSystem {
    constructor(root, glowTex) {
      // --- 楓葉幾何：極座標五瓣星形 → 卡通楓葉剪影 ---
      const shape = new THREE.Shape();
      const LOBES = 5;
      // 淺鋸齒 + 飽滿輪廓：遠看是圓潤葉片、近看帶楓葉尖角
      for (let i = 0; i <= LOBES * 2; i++) {
        const a = (i / (LOBES * 2)) * Math.PI * 2;
        const r = (i % 2 === 0) ? 0.5 : 0.37;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) shape.moveTo(x, y);
        else shape.quadraticCurveTo(
          Math.cos(a - Math.PI / (LOBES * 2)) * 0.52, Math.sin(a - Math.PI / (LOBES * 2)) * 0.52, x, y);
      }
      const leafGeo = new THREE.ShapeGeometry(shape, 3);
      this.leafMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      this.leaves = new ParticlePool(root, leafGeo, this.leafMat, 340, {
        spawnY: [16, 30], fall: [1.8, 2.9], sway: [0.9, 2.2], spin: 4.5,
        size: [0.42, 0.8], ground: 0.16, linger: 2.6
      });
      // 每片葉子固定一個秋色（紅橙黃的漸層調色盤）
      const palette = [0xe8863a, 0xd95f2b, 0xc94a2a, 0xe8a53a, 0xb5432e, 0xe0742e];
      for (let i = 0; i < 340; i++) {
        this.leaves.mesh.setColorAt(i, _c1.setHex(palette[i % palette.length]));
      }
      this.leaves.mesh.instanceColor.needsUpdate = true;

      // --- 雪花：小六邊形，慢速飄落 ---
      const snowGeo = new THREE.CircleGeometry(0.14, 6);
      this.snowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
      this.snow = new ParticlePool(root, snowGeo, this.snowMat, 640, {
        spawnY: [12, 24], fall: [1.4, 2.4], sway: [0.5, 1.3], spin: 2.0,
        size: [0.7, 1.4], ground: 0.12, linger: 1.5
      });

      // --- 春霧：大型柔霧 sprite 繞島緩慢漂移 ---
      this.mists = [];
      for (let i = 0; i < 9; i++) {
        const m = new THREE.SpriteMaterial({
          map: glowTex, color: 0xe8eef6, transparent: true, opacity: 0, depthWrite: false
        });
        const s = new THREE.Sprite(m);
        s.scale.set(16 + rand() * 14, 6 + rand() * 4, 1);
        s.userData = { r: 6 + rand() * 20, ang: rand() * Math.PI * 2, sp: 0.02 + rand() * 0.03, ph: rand() * 6.28, h: 2 + rand() * 4 };
        root.add(s);
        this.mists.push(s);
      }
    }
    update(dt, time, S, P) {
      const wind = Math.sin(time * 0.4) * 0.5; // 全場緩慢變向的微風
      this.leaves.update(dt, P.leafRate, wind);
      this.snow.update(dt, P.snowRate, wind * 0.6);
      // 不受光照的粒子 → 用日夜亮度係數壓暗
      const L = S.light;
      this.leafMat.color.setScalar(0.35 + 0.65 * L);
      this.snowMat.color.setScalar(0.5 + 0.5 * L);
      this.mists.forEach((s, i) => {
        const u = s.userData;
        u.ang += u.sp * dt;
        s.position.set(Math.cos(u.ang) * u.r, u.h + Math.sin(time * 0.3 + u.ph) * 0.6, Math.sin(u.ang) * u.r);
        s.material.opacity = P.mist * (0.14 + 0.08 * Math.sin(time * 0.5 + u.ph)) * (0.45 + 0.55 * L);
      });
    }
    get particleCount() { return this.leaves.active + this.snow.active; }
  }

  /* ==========================================================================
     CameraRig — 自訂軌道相機
     - Pointer Events 統一滑鼠 / 觸控；拖曳改變方位角與仰角
     - 慣性：放開後角速度指數衰減
     - 滾輪 / 雙指縮放；閒置 4 秒後緩慢自動環繞（gallery 預覽更生動）
     ========================================================================== */
  class CameraRig {
    constructor(camera, dom) {
      this.camera = camera;
      this.dom = dom;
      this.theta = 0.26; // 預設方位：倫敦眼、大笨鐘、塔橋三地標一字排開皆可見
      this.phi = 1.17;
      this.radius = 62;
      this.userZoomed = false; // 使用者調過縮放後，resize 不再自動改距離
      this.target = new THREE.Vector3(0, 8.5, 0);
      this.vTheta = 0; this.vPhi = 0;
      this.idle = 99;
      this.autoW = 1;
      this.pointers = new Map();
      this.lastPinch = 0;

      dom.addEventListener('pointerdown', e => {
        dom.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.idle = 0;
        dom.classList.add('dragging');
      });
      dom.addEventListener('pointermove', e => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        this.idle = 0;
        if (this.pointers.size === 2) {
          // 雙指：以指距變化縮放
          p.x = e.clientX; p.y = e.clientY;
          const pts = [...this.pointers.values()];
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this.lastPinch > 0) { this.radius = clamp(this.radius * (this.lastPinch / d), 36, 100); this.userZoomed = true; }
          this.lastPinch = d;
          return;
        }
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        this.vTheta = -dx * 0.0055;
        this.vPhi = -dy * 0.0045;
        this.theta += this.vTheta;
        this.phi = clamp(this.phi + this.vPhi, 0.32, 1.72);
      });
      const up = e => {
        this.pointers.delete(e.pointerId);
        this.lastPinch = 0;
        if (!this.pointers.size) dom.classList.remove('dragging');
      };
      dom.addEventListener('pointerup', up);
      dom.addEventListener('pointercancel', up);
      dom.addEventListener('wheel', e => {
        e.preventDefault();
        this.idle = 0;
        this.radius = clamp(this.radius * (1 + e.deltaY * 0.0011), 36, 100);
        this.userZoomed = true;
      }, { passive: false });
    }
    // 小視窗（如 320×200 iframe 卡片）自動拉遠，讓整座島入鏡
    fit(w, h) {
      if (this.userZoomed) return;
      const k = clamp(Math.sqrt(560 / Math.max(200, h)), 1, 1.32);
      this.radius = 62 * k;
    }
    update(dt) {
      this.idle += dt;
      const dragging = this.pointers.size > 0;
      if (!dragging) {
        // 慣性衰減
        const decay = Math.exp(-dt * 3.2);
        this.vTheta *= decay; this.vPhi *= decay;
        this.theta += this.vTheta;
        this.phi = clamp(this.phi + this.vPhi, 0.32, 1.72);
        // 閒置自動環繞（緩慢淡入）
        const w = clamp((this.idle - 4) / 3, 0, 1);
        this.theta += smooth(w) * 0.045 * dt;
      }
      const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
      this.camera.position.set(
        this.target.x + this.radius * sp * Math.sin(this.theta),
        this.target.y + this.radius * cp,
        this.target.z + this.radius * sp * Math.cos(this.theta)
      );
      this.camera.lookAt(this.target);
    }
  }

  /* ==========================================================================
     AudioSystem — Web Audio 環境音（預設關閉，按 🔊 或 M 開啟）
     - 風聲：白噪音 → lowpass，音量隨季節風力與慢速 LFO 起伏
     - 大笨鐘：日落亮燈時敲三響、正午一響（正弦 + 泛音、指數衰減）
     ========================================================================== */
  class AudioSystem {
    constructor() {
      this.ctx = null;
      this.enabled = false;
      this.windGain = null;
      this.windLevel = 0;
    }
    toggle() {
      if (!this.ctx) this._init();
      this.enabled = !this.enabled;
      if (this.ctx) {
        if (this.enabled) this.ctx.resume();
        else this.ctx.suspend();
      }
      return this.enabled;
    }
    _init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      // 2 秒白噪音 loop → lowpass = 風
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      src.connect(lp).connect(this.windGain).connect(this.master);
      src.start();
    }
    // 大笨鐘鐘聲：基頻 E3 + 非整數泛音 → 鐘的金屬感
    strike(times) {
      if (!this.enabled || !this.ctx) return;
      const t0 = this.ctx.currentTime;
      for (let n = 0; n < times; n++) {
        const at = t0 + n * 1.35;
        [[164.8, 0.22], [164.8 * 2.02, 0.07], [164.8 * 2.76, 0.06], [164.8 * 4.1, 0.02]].forEach(([f, a]) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.003);
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(a, at + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
          o.connect(g).connect(this.master);
          o.start(at); o.stop(at + 2.8);
        });
      }
    }
    update(dt, time, windAmt) {
      if (!this.enabled || !this.windGain) return;
      const target = windAmt * (1 + 0.4 * Math.sin(time * 0.37)) * 1.3;
      this.windLevel += (target - this.windLevel) * Math.min(1, dt * 1.2);
      this.windGain.gain.value = this.windLevel;
    }
  }

  /* ==========================================================================
     HUD — 狀態顯示與控制列
     ========================================================================== */
  class HUD {
    constructor(onSeason, onAuto, onSound) {
      this.elSeason = document.getElementById('statusSeason');
      this.elPhase = document.getElementById('statusPhase');
      this.elStats = document.getElementById('stats');
      this.autoBtn = document.getElementById('autoBtn');
      this.soundBtn = document.getElementById('soundBtn');
      this.seasonBtns = [...document.querySelectorAll('.seasonBtn')];
      this.seasonBtns.forEach(b => {
        b.addEventListener('click', () => onSeason(+b.dataset.season));
      });
      this.autoBtn.addEventListener('click', onAuto);
      this.soundBtn.addEventListener('click', onSound);
      // 操作提示 6 秒後淡出
      setTimeout(() => document.getElementById('hint')?.classList.add('fade'), 6000);
      this._statTimer = 0;
      this._frames = 0;
      this._lastText = '';
    }
    setSound(on) { this.soundBtn.textContent = on ? '🔊' : '🔇'; }
    update(dt, seasons, dayT, particles) {
      // 季節 / 日夜狀態（文字有變才觸碰 DOM）
      const def = seasons.defs[seasons.domIdx];
      let phase;
      if (dayT >= 0.9 || dayT < 0.06) phase = '🌅 Dawn';
      else if (dayT < 0.44) phase = '☀️ Day';
      else if (dayT < 0.62) phase = '🌇 Dusk';
      else phase = '🌙 Night';
      // 變化偵測 key 包含 auto / domIdx，避免按鈕高亮停留在舊狀態
      const txt = def.emoji + ' ' + def.name + '|' + phase + '|' + seasons.auto + seasons.domIdx;
      if (txt !== this._lastText) {
        this._lastText = txt;
        this.elSeason.textContent = def.emoji + ' ' + def.name;
        this.elPhase.textContent = phase;
        this.seasonBtns.forEach((b, i) => b.classList.toggle('active', i === seasons.domIdx));
        this.autoBtn.classList.toggle('on', seasons.auto);
      }
      // FPS / 粒子數：每 0.5 秒更新一次（避免每幀重排）
      this._frames++;
      this._statTimer += dt;
      if (this._statTimer >= 0.5) {
        const fps = Math.round(this._frames / this._statTimer);
        this.elStats.textContent = fps + ' FPS · ' + particles + ' ptcl';
        this._statTimer = 0;
        this._frames = 0;
      }
    }
  }

  /* ==========================================================================
     App — 組裝與主迴圈
     ========================================================================== */
  class App {
    constructor() {
      const canvas = document.getElementById('scene');
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0xd5ecf8, 0.004);
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);

      // 光照組
      this.hemi = new THREE.HemisphereLight(0xd8f0ff, 0xa09880, 0.7);
      this.scene.add(this.hemi);
      this.sunLight = new THREE.DirectionalLight(0xfff6e2, 1.4);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      const sc = this.sunLight.shadow.camera;
      sc.left = -44; sc.right = 44; sc.top = 44; sc.bottom = -44;
      sc.near = 10; sc.far = 200;
      this.sunLight.shadow.bias = -0.002;
      this.scene.add(this.sunLight, this.sunLight.target);
      this.moonLight = new THREE.DirectionalLight(0xa8c4ff, 0);
      this.scene.add(this.moonLight, this.moonLight.target);

      // 共用貼圖
      const glowTex = makeGlowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');

      // 天空與天體
      this.sky = new SkyDome(this.scene);
      this.celestials = new Celestials(this.scene, glowTex);
      this.clouds = new CloudLayer(this.scene);

      // 漂浮島（整組隨浮動動畫升降）
      this.islandRoot = new THREE.Group();
      this.scene.add(this.islandRoot);
      this.island = new Island(this.islandRoot);
      this.bigBen = new BigBen(this.islandRoot);
      this.eye = new LondonEye(this.islandRoot);
      this.bridge = new TowerBridge(this.islandRoot);
      this.boat = new Boat(this.islandRoot, glowTex);
      this.buses = [new Bus(this.islandRoot, 0), new Bus(this.islandRoot, Math.PI)];
      this.weather = new WeatherSystem(this.islandRoot, glowTex);

      // 系統
      this.cycle = new DayNightCycle();
      this.seasons = new SeasonSystem();
      this.rig = new CameraRig(this.camera, canvas);
      this.audio = new AudioSystem();
      this.hud = new HUD(
        i => this.seasons.setManual(i),
        () => this.seasons.setAuto(),
        () => this.hud.setSound(this.audio.toggle())
      );

      // 鍵盤快捷鍵：1-4 季節、A 自動、M 音效
      window.addEventListener('keydown', e => {
        if (e.key >= '1' && e.key <= '4') this.seasons.setManual(+e.key - 1);
        else if (e.key === 'a' || e.key === 'A') this.seasons.setAuto();
        else if (e.key === 'm' || e.key === 'M') this.hud.setSound(this.audio.toggle());
      });

      window.addEventListener('resize', () => this.resize());
      this.resize();

      // 主時鐘：以累加 dt 為場景時間（分頁切走時凍結，避免恢復時粒子暴衝）
      this.time = 0;
      this.dayT = 0.16;   // 開場：上午（光線最漂亮的時段）
      this.prevDayT = this.dayT;
      this.prevLamp = 0;
      this._last = performance.now();
      this.renderer.setAnimationLoop(() => this.frame());
      window.__app = this; // 除錯 / 自動化驗證用途
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.rig.fit(w, h);
    }

    frame() {
      // deltaTime（上限 0.1s：分頁喚醒 / 卡頓時不產生物理跳躍）
      const now = performance.now();
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      this.time += dt;

      // --- 推進日夜與季節 ---
      this.prevDayT = this.dayT;
      this.dayT = (this.dayT + dt / DAY_LENGTH) % 1;
      if (this._forceDayT != null) this.dayT = this._forceDayT; // 除錯：凍結時刻
      const S = this.cycle.sample(this.dayT);
      const P = this.seasons.update(dt);

      // --- 天空 / 霧 / 光照套用（所有值皆為連續插值 → 平滑過渡） ---
      // 季節霧氣越重，天空越往霧色靠（春霧乳白、冬日灰藍）
      const haze = clamp((P.fogMul - 1) * 0.26, 0, 0.55);
      _c1.copy(S.hor).lerp(P.fogTint, haze);
      _c3.copy(S.top).lerp(P.fogTint, haze * 0.45);
      this.sky.set(_c3, _c1);
      _c2.copy(S.fog).lerp(P.fogTint, 0.4);
      this.scene.fog.color.copy(_c2);
      this.scene.fog.density = 0.0042 * S.dens * P.fogMul;

      this.hemi.intensity = S.hemiI;
      this.hemi.color.copy(S.hemiSky);
      this.hemi.groundColor.copy(S.hemiGnd);
      this.sunLight.intensity = S.sunI * P.sunMul;
      this.sunLight.color.copy(S.sunC).lerp(P.sunTint, 0.45);
      this.sunLight.position.copy(S.sunDir).multiplyScalar(90);
      this.moonLight.intensity = S.moonI;
      this.moonLight.position.copy(S.sunDir).multiplyScalar(-90);
      this.moonLight.position.z -= 14;

      // --- 場景物件 ---
      // 島體浮動：主升降 + 輕微傾擺
      this.islandRoot.position.y = Math.sin(this.time * 0.5) * 0.9;
      this.islandRoot.rotation.z = Math.sin(this.time * 0.31) * 0.008;
      this.islandRoot.rotation.x = Math.cos(this.time * 0.23) * 0.006;

      const hours = (this.dayT * 24 + 6) % 24; // 場景時刻（dayT=0 → 06:00）
      this.island.update(dt, this.time, S, P);
      this.bigBen.update(dt, S, P, hours);
      this.eye.update(dt, S);
      this.bridge.update(dt, S, P, this.boat.z);
      this.boat.update(dt, this.time, S);
      this.buses.forEach(b => b.update(dt, S));
      this.clouds.update(dt, S);
      this.celestials.update(this.time, S);
      this.weather.update(dt, this.time, S, P);
      this.rig.update(dt);

      // --- 音效事件：日落亮燈敲三響、正午一響 ---
      if (this.prevLamp < 0.5 && S.lamp >= 0.5) this.audio.strike(3);
      if (this.prevDayT < 0.25 && this.dayT >= 0.25) this.audio.strike(1);
      this.prevLamp = S.lamp;
      this.audio.update(dt, this.time, P.wind);

      // --- HUD ---
      this.hud.update(dt, this.seasons, this.dayT, this.weather.particleCount);

      this.renderer.render(this.scene, this.camera);
    }
  }

  // ------------------------------------------------------------------ 進入點
  function main() {
    if (typeof THREE === 'undefined') {
      document.getElementById('fallback').hidden = false;
      return;
    }
    new App();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();
