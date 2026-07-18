/* =========================================================================
 * 漂浮倫敦島與四季天氣 (Three.js r160, UMD classic script)
 * -------------------------------------------------------------------------
 * 架構（模組化 class）：
 *   DayNightCycle   — 15 秒日夜輪轉：天空漸層、太陽/月亮軌道、光線漸變、亮燈因子
 *   SeasonSystem    — 四季權重狀態機，45s 自動輪轉 + 6s 平滑 crossfade
 *   WeatherParticles— 楓葉(InstancedMesh 物件池) / 雪(Points) / 春霧(Points)
 *   Island / River  — 浮空島本體（bobbing）+ 泰晤士河微波水面
 *   BigBen / LondonEye / TowerBridge / Decor — 景點與裝飾（夜間自動亮燈）
 *   CameraRig       — 自實作拖曳環繞 + 滾輪縮放 + 閒置自動旋轉
 *   HUD             — 季節/日夜狀態、FPS/粒子 debug、按鈕與鍵盤
 *
 * 效能策略：
 *   - requestAnimationFrame + deltaTime（clamp 50ms，避免切分頁回來暴衝）
 *   - 楓葉用單一 InstancedMesh（固定 pool 220，1 次 draw call），
 *     非秋季只縮放不刪建 → 無 GC 壓力；雪/霧用 Points + 固定 buffer 循環
 *   - 主迴圈內零配置（全部重用預建 Vector3/Color/Matrix4 temp）
 * ========================================================================= */
(function () {
'use strict';

/* ---------------- 0. 小工具 ---------------- */
var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
/** 平滑階梯（smoothstep），用於所有過渡，避免硬切 */
function smooth(a, b, v) {
  var t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function rand(a, b) { return a + Math.random() * (b - a); }

function fatal(msg) {
  var el = document.getElementById('fatal');
  el.hidden = false;
  el.textContent = msg;
  var ld = document.getElementById('loading');
  if (ld) ld.classList.add('done');
}

if (typeof THREE === 'undefined') {
  fatal('無法載入 Three.js（CDN 連線失敗）。請確認網路後重新整理。');
  return;
}

/* Canvas 柔邊圓點貼圖：雪/霧/星/光暈共用（執行期產生，無外部素材） */
function makeSoftTexture() {
  var c = document.createElement('canvas');
  c.width = c.height = 64;
  var g = c.getContext('2d');
  var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  var tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else tex.encoding = THREE.sRGBEncoding; // r134 相容
  return tex;
}

/* Toon 漸層貼圖：4 階段帶狀 shading → 卡通渲染感 */
function makeGradientMap(steps) {
  var data = new Uint8Array(steps);
  for (var i = 0; i < steps; i++) data[i] = Math.round((i / (steps - 1)) * 255);
  var tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

var SOFT_TEX = makeSoftTexture();
var TOON_GRAD = makeGradientMap(4);
function toon(opts) {
  opts = opts || {};
  if (!opts.gradientMap) opts.gradientMap = TOON_GRAD;
  return new THREE.MeshToonMaterial(opts);
}

/* ---------------- 1. Renderer / Scene / Camera ---------------- */
var renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  fatal('此瀏覽器不支援 WebGL，無法顯示 3D 場景。');
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', function (e) {
  e.preventDefault();
  fatal('WebGL context 已遺失，請重新整理頁面。');
});

var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe6f5, 30, 92); // 顏色與遠近由日夜/四季驅動

var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 320);

/* ---------------- 2. 天空（漸層穹頂） ---------------- */
var skyUniforms = {
  topColor: { value: new THREE.Color(0x3f96e0) },
  bottomColor: { value: new THREE.Color(0xbfe6f5) }
};
var skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(150, 24, 14),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader:
      'varying vec3 vPos;\n' +
      'void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;\n' +
      'void main(){ float h = normalize(vPos).y * 0.5 + 0.5;\n' +
      '  gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(0.02, 0.55, h)), 1.0); }'
  })
);
scene.add(skyDome);

/* ---------------- 3. DayNightCycle ---------------- */
var DAY_LEN = 15; // 規格：每 15 秒一次完整日夜輪轉
var ORBIT_R = 110; // 太陽/月亮軌道半徑（在霧外，material 皆 fog:false）

/* 日夜關鍵影格：t∈[0,1)，0=日出、0.25=正午、0.5=日落、0.75=午夜。
   兩影格之間線性插值（顏色 + 光強），保證全程平滑無跳變。 */
var SKY_KEYS = [
  { t: 0.00, top: 0x8a7fc0, bot: 0xf6c8d0, sun: 0xffd9b0, si: 0.55, hi: 0.50 },
  { t: 0.07, top: 0x63a8e6, bot: 0xd2ecf6, sun: 0xfff0d8, si: 1.05, hi: 0.78 },
  { t: 0.30, top: 0x3f96e0, bot: 0xbfe6f5, sun: 0xffffff, si: 1.28, hi: 0.92 },
  { t: 0.45, top: 0x5588cc, bot: 0xffdca6, sun: 0xffd2a0, si: 1.00, hi: 0.72 },
  { t: 0.52, top: 0x453a75, bot: 0xff9a5c, sun: 0xff8a50, si: 0.50, hi: 0.42 },
  { t: 0.60, top: 0x0c1130, bot: 0x1d2b52, sun: 0xa9c0ff, si: 0.16, hi: 0.22 },
  { t: 0.90, top: 0x0c1130, bot: 0x1d2b52, sun: 0xa9c0ff, si: 0.16, hi: 0.22 },
  { t: 0.97, top: 0x30356a, bot: 0x9a6f9f, sun: 0xffc9a8, si: 0.26, hi: 0.34 }
];
var _kcA = new THREE.Color(), _kcB = new THREE.Color();
/** 在環狀 keyframe 表上取 t 所在區間並回傳插值因子（處理 1→0 wrap） */
function sampleKeys(t) {
  var i = SKY_KEYS.length - 1;
  for (var k = 0; k < SKY_KEYS.length; k++) {
    if (t < SKY_KEYS[k].t) { i = k - 1; break; }
  }
  var a = SKY_KEYS[(i + SKY_KEYS.length) % SKY_KEYS.length];
  var b = SKY_KEYS[(i + 1) % SKY_KEYS.length];
  var span = b.t - a.t; if (span <= 0) span += 1;
  var f = t - a.t; if (f < 0) f += 1;
  return { a: a, b: b, f: clamp(f / span, 0, 1) };
}

function DayNightCycle() {
  this.t = 0.30; // 從上午開始
  this.lampFactor = 0; // 0=白天燈滅，1=全夜亮燈（供景點 emissive/point light 使用）
  this.nightFactor = 0;

  this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.9);
  scene.add(this.hemi);

  this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
  this.sun.castShadow = true;
  this.sun.shadow.mapSize.set(1024, 1024);
  var sc = this.sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20;
  sc.near = 55; sc.far = 170;
  this.sun.shadow.bias = -0.0006;
  scene.add(this.sun);
  scene.add(this.sun.target);

  // 太陽本體 + 光暈
  this.sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(5.5, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0xffd75e, fog: false })
  );
  this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: SOFT_TEX, color: 0xffdf8a, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  this.sunGlow.scale.set(26, 26, 1);
  this.sunMesh.add(this.sunGlow);
  scene.add(this.sunMesh);

  // 月亮本體 + 光暈
  this.moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(3.6, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false })
  );
  this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: SOFT_TEX, color: 0x9fb8ff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  this.moonGlow.scale.set(15, 15, 1);
  this.moonMesh.add(this.moonGlow);
  scene.add(this.moonMesh);

  // 星星（固定 buffer，透明度隨夜深入場）
  var starGeo = new THREE.BufferGeometry();
  var n = 420, pos = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    var th = rand(0, TAU), ph = Math.acos(rand(0.06, 1)); // 上半球
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * 125;
    pos[i * 3 + 1] = Math.cos(ph) * 125;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 125;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  this.starMat = new THREE.PointsMaterial({
    size: 2.4, map: SOFT_TEX, transparent: true, opacity: 0,
    depthWrite: false, color: 0xffffff, sizeAttenuation: true, fog: false
  });
  this.stars = new THREE.Points(starGeo, this.starMat);
  scene.add(this.stars);
}
DayNightCycle.prototype = {
  /** 跳到下一個階段（白天→黃昏→夜晚→黎明），按鈕/鍵盤 N 用 */
  jumpToNextPhase: function () {
    var q = Math.floor(this.t * 4);
    this.t = ((q + 1) % 4) / 4 + 0.005;
  },
  update: function (dt, warmth) {
    this.t = (this.t + dt / DAY_LEN) % 1;
    var ang = this.t * TAU;
    var sx = Math.cos(ang), sy = Math.sin(ang); // 太陽高度角 sy∈[-1,1]

    var s = sampleKeys(this.t);
    skyUniforms.topColor.value.copy(_kcA.setHex(s.a.top)).lerp(_kcB.setHex(s.b.top), s.f);
    skyUniforms.bottomColor.value.copy(_kcA.setHex(s.a.bot)).lerp(_kcB.setHex(s.b.bot), s.f);
    scene.fog.color.copy(skyUniforms.bottomColor.value);

    // 太陽沿東→西軌道；月亮在對面。方向光白天追太陽、夜裡追月亮，
    // 因此影子方向始終合理，且只需一支 castShadow 的光。
    this.sunMesh.position.set(sx * ORBIT_R, sy * ORBIT_R, 12);
    this.moonMesh.position.set(-sx * ORBIT_R, -sy * ORBIT_R, -12);
    var lightPos = sy > -0.12 ? this.sunMesh.position : this.moonMesh.position;
    this.sun.position.copy(lightPos);

    this.sun.color.copy(_kcA.setHex(s.a.sun)).lerp(_kcB.setHex(s.b.sun), s.f);
    this.sun.intensity = lerp(s.a.si, s.b.si, s.f) * warmth; // 季節：夏日更烈、冬日偏弱
    this.hemi.intensity = lerp(s.a.hi, s.b.hi, s.f);
    this.hemi.color.copy(skyUniforms.topColor.value).lerp(_kcA.setHex(0xffffff), 0.35);

    // 太陽貼地平線時調成橘紅，增加卡通夕陽感
    var lowSun = 1 - smooth(0.05, 0.45, Math.abs(sy));
    this.sunMesh.material.color.setHex(0xffd75e).lerp(_kcA.setHex(0xff7a3c), lowSun * smooth(-0.05, 0.25, sy));

    /* 亮燈因子：太陽高度角 sy 穿越地平線附近時平滑 0→1。
       黃昏（sy 下降穿過 0.1→0.02）自動亮起；黎明前（sy 上升回 0.02→0.1）自動關燈。 */
    this.lampFactor = 1 - smooth(0.02, 0.10, sy);
    this.nightFactor = 1 - smooth(-0.12, 0.06, sy);

    this.starMat.opacity = this.nightFactor * 0.9;
    this.sunMesh.visible = sy > -0.10;
    this.moonMesh.visible = sy < 0.10;
    this.sunGlow.material.opacity = 0.85 * smooth(-0.08, 0.12, sy);
    this.moonGlow.material.opacity = 0.5 * smooth(0.08, -0.10, sy);
  }
};

/* ---------------- 4. SeasonSystem（四季狀態機 + 平滑過渡） ---------------- */
var SEASON_LEN = 45; // 每季停留秒數（自動輪轉）
var SEASON_FADE = 6; // 季節 crossfade 秒數
var SEASONS = [
  { key: 'spring', label: '🌸 春季', mist: 1, leaves: 0, snow: 0,
    fogNear: 24, fogFar: 62, warm: 0.95,
    grass: 0x86c95c, tree: 0x6fc75e, treeB: 0xf0a8c4, water: 0x3f86c4 }, // 春：濕潤多霧 + 櫻花粉
  { key: 'summer', label: '☀️ 夏季', mist: 0, leaves: 0, snow: 0,
    fogNear: 36, fogFar: 100, warm: 1.32,
    grass: 0x67bd44, tree: 0x3f9e46, treeB: 0x4aa84a, water: 0x2f7fc0 }, // 夏：強光暖色、視野清澈
  { key: 'autumn', label: '🍁 秋季', mist: 0.15, leaves: 1, snow: 0,
    fogNear: 30, fogFar: 82, warm: 1.06,
    grass: 0xbfae56, tree: 0xe08a3c, treeB: 0xc95a2e, water: 0x3a76ae }, // 秋：楓葉 + 金黃色調
  { key: 'winter', label: '❄️ 冬季', mist: 0.25, leaves: 0, snow: 1,
    fogNear: 26, fogFar: 68, warm: 0.82,
    grass: 0xe4ebef, tree: 0xc4d0d6, treeB: 0xd4dde2, water: 0x9fc8de }  // 冬：雪 + 霜白 + 結冰河面
];

function SeasonSystem(onChange) {
  this.weights = [1, 0, 0, 0];
  this.target = 0;
  this.fade = 1;          // 1 = 無過渡進行中
  this.from = [1, 0, 0, 0];
  this.auto = true;
  this.timer = 0;
  this.onChange = onChange;
  // 預建混合參數物件（避免每幀配置）
  this.params = {
    mist: 1, leaves: 0, snow: 0, fogNear: 24, fogFar: 62, warm: 1,
    grass: new THREE.Color(), tree: new THREE.Color(),
    treeB: new THREE.Color(), water: new THREE.Color()
  };
}
SeasonSystem.prototype = {
  goTo: function (i, manual) {
    if (i === this.target && this.fade >= 1) return;
    this.from = this.weights.slice();
    this.target = i;
    this.fade = 0;
    this.timer = 0;
    if (manual) this.auto = false; // 手動切換後停用自動輪轉（可由 Auto 鈕恢復）
    if (this.onChange) this.onChange(i, this.auto);
  },
  setAuto: function (v) {
    this.auto = v;
    this.timer = 0;
    if (this.onChange) this.onChange(this.target, this.auto);
  },
  update: function (dt) {
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / SEASON_FADE);
      var s = smooth(0, 1, this.fade);
      for (var i = 0; i < 4; i++) {
        this.weights[i] = lerp(this.from[i], i === this.target ? 1 : 0, s);
      }
    } else if (this.auto) {
      this.timer += dt;
      if (this.timer >= SEASON_LEN) this.goTo((this.target + 1) % 4, false);
    }
    // 依權重加權混合所有季節參數（連續值 → 過渡期粒子/霧/色調自然交叉淡化）
    var P = this.params, w = this.weights;
    P.mist = P.leaves = P.snow = P.fogNear = P.fogFar = P.warm = 0;
    P.grass.setRGB(0, 0, 0); P.tree.setRGB(0, 0, 0); P.treeB.setRGB(0, 0, 0); P.water.setRGB(0, 0, 0);
    for (var j = 0; j < 4; j++) {
      if (w[j] < 0.001) continue;
      var S = SEASONS[j];
      P.mist += S.mist * w[j]; P.leaves += S.leaves * w[j]; P.snow += S.snow * w[j];
      P.fogNear += S.fogNear * w[j]; P.fogFar += S.fogFar * w[j]; P.warm += S.warm * w[j];
      P.grass.add(_kcA.setHex(S.grass).multiplyScalar(w[j]));
      P.tree.add(_kcA.setHex(S.tree).multiplyScalar(w[j]));
      P.treeB.add(_kcA.setHex(S.treeB).multiplyScalar(w[j]));
      P.water.add(_kcA.setHex(S.water).multiplyScalar(w[j]));
    }
  }
};

/* ---------------- 5. WeatherParticles（物件池 + 固定 buffer） ---------------- */
var LEAF_COUNT = 220, SNOW_COUNT = 700, MIST_COUNT = 70;

/** 楓葉：單一 InstancedMesh（固定 pool）。秋季權重→整體縮放，
    不隨季節新建/銷毀物件 → 無記憶體抖動。 */
function LeafSystem(parent) {
  var shape = new THREE.Shape(); // 簡化楓葉輪廓（五裂片 + 葉柄）
  var pts = [
    [0, 1.00], [0.16, 0.52], [0.52, 0.80], [0.40, 0.36], [0.86, 0.38],
    [0.50, 0.02], [0.74, -0.38], [0.26, -0.24], [0.10, -0.62], [0.05, -0.30],
    [0, -0.34], [-0.05, -0.30], [-0.10, -0.62], [-0.26, -0.24], [-0.74, -0.38],
    [-0.50, 0.02], [-0.86, 0.38], [-0.40, 0.36], [-0.52, 0.80], [-0.16, 0.52]
  ];
  shape.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  var geo = new THREE.ShapeGeometry(shape);
  geo.scale(0.30, 0.30, 0.30);

  this.mesh = new THREE.InstancedMesh(geo, toon({ color: 0xffffff, side: THREE.DoubleSide }), LEAF_COUNT);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.mesh.frustumCulled = false;
  var palette = [0xd94f30, 0xe8813a, 0xe8b23a, 0xc23a2e, 0xe06a45];
  if (this.mesh.setColorAt) { // per-instance 顏色（橘紅系楓葉）
    for (var c = 0; c < LEAF_COUNT; c++) this.mesh.setColorAt(c, _kcA.setHex(palette[c % palette.length]));
    this.mesh.instanceColor.needsUpdate = true;
  } else {
    this.mesh.material.color.setHex(0xe06a33);
  }
  parent.add(this.mesh);

  this.leaves = [];
  for (var j = 0; j < LEAF_COUNT; j++) {
    this.leaves.push({
      x: rand(-16, 16), y: rand(0, 15), z: rand(-16, 16),
      vy: rand(1.1, 2.4),
      phase: rand(0, TAU), swayAmp: rand(0.5, 1.5), swayFreq: rand(0.7, 1.7),
      rx: rand(-1.6, 1.6), ry: rand(-2.2, 2.2), rz: rand(-1.2, 1.2),
      ex: rand(0, TAU), ey: rand(0, TAU), ez: rand(0, TAU),
      size: rand(0.7, 1.35)
    });
  }
  this._m = new THREE.Matrix4();
  this._q = new THREE.Quaternion();
  this._e = new THREE.Euler();
  this._p = new THREE.Vector3();
  this._s = new THREE.Vector3();
}
LeafSystem.prototype.update = function (dt, weight, time) {
  // 秋季權重 → 全域縮放；太小就整批隱藏並跳過矩陣運算
  var s = smooth(0.02, 0.3, weight);
  this.mesh.visible = s > 0.003;
  if (!this.mesh.visible) return;
  for (var i = 0; i < LEAF_COUNT; i++) {
    var L = this.leaves[i];
    L.y -= L.vy * dt;
    // 左右擺動（sin）+ 自轉（三軸不同角速度）→ 自然飄落
    L.x += Math.sin(time * L.swayFreq + L.phase) * L.swayAmp * dt;
    L.z += Math.cos(time * L.swayFreq * 0.8 + L.phase) * L.swayAmp * 0.7 * dt;
    L.ex += L.rx * dt; L.ey += L.ry * dt; L.ez += L.rz * dt;
    if (L.y < -1.5) { // 回收到天上重新飄（無縫循環）
      L.y = rand(11, 16); L.x = rand(-16, 16); L.z = rand(-16, 16);
    }
    this._e.set(L.ex, L.ey, L.ez);
    this._q.setFromEuler(this._e);
    this._p.set(L.x, L.y, L.z);
    var sc = L.size * s;
    this._s.set(sc, sc, sc);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
  }
  this.mesh.instanceMatrix.needsUpdate = true;
};

/** 雪：Points + 固定 Float32 buffer，落地即循環回頂部 */
function SnowSystem(parent) {
  var pos = new Float32Array(SNOW_COUNT * 3);
  this.speed = new Float32Array(SNOW_COUNT);
  for (var i = 0; i < SNOW_COUNT; i++) {
    pos[i * 3] = rand(-19, 19);
    pos[i * 3 + 1] = rand(0, 17);
    pos[i * 3 + 2] = rand(-19, 19);
    this.speed[i] = rand(1.2, 2.8);
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  this.mat = new THREE.PointsMaterial({
    size: 0.34, map: SOFT_TEX, transparent: true, opacity: 0,
    depthWrite: false, color: 0xffffff, sizeAttenuation: true
  });
  this.points = new THREE.Points(geo, this.mat);
  this.points.frustumCulled = false;
  this.points.visible = false;
  parent.add(this.points);
}
SnowSystem.prototype.update = function (dt, weight, time) {
  this.mat.opacity = weight * 0.95;
  this.points.visible = weight > 0.02;
  if (!this.points.visible) return;
  var pos = this.points.geometry.attributes.position.array;
  for (var i = 0; i < SNOW_COUNT; i++) {
    var j = i * 3;
    pos[j + 1] -= this.speed[i] * dt;
    pos[j] += Math.sin(time * 0.9 + i * 1.7) * 0.45 * dt; // 輕微橫向飄移
    if (pos[j + 1] < 0) {
      pos[j] = rand(-19, 19); pos[j + 1] = rand(15, 18); pos[j + 2] = rand(-19, 19);
    }
  }
  this.points.geometry.attributes.position.needsUpdate = true;
};

/** 春霧：大片柔邊 sprite 緩慢漂移（配合場景 fog 加密 → 水氣感） */
function MistSystem(parent) {
  var pos = new Float32Array(MIST_COUNT * 3);
  for (var i = 0; i < MIST_COUNT; i++) {
    pos[i * 3] = rand(-18, 18);
    pos[i * 3 + 1] = rand(0.3, 2.4);
    pos[i * 3 + 2] = rand(-18, 18);
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  this.mat = new THREE.PointsMaterial({
    size: 9, map: SOFT_TEX, transparent: true, opacity: 0,
    depthWrite: false, color: 0xf2f6ff, sizeAttenuation: true
  });
  this.points = new THREE.Points(geo, this.mat);
  this.points.frustumCulled = false;
  this.points.visible = false;
  parent.add(this.points);
}
MistSystem.prototype.update = function (dt, weight) {
  this.mat.opacity = weight * 0.13;
  this.points.visible = weight > 0.02;
  if (!this.points.visible) return;
  var pos = this.points.geometry.attributes.position.array;
  for (var i = 0; i < MIST_COUNT; i++) {
    var j = i * 3;
    pos[j] += 0.35 * dt;
    if (pos[j] > 20) pos[j] = -20;
  }
  this.points.geometry.attributes.position.needsUpdate = true;
};

/* ---------------- 6. 島嶼 / 河流 ---------------- */
function Island(parent) {
  this.group = new THREE.Group();
  parent.add(this.group);

  // 草地頂（圓柱，頂面 y=0；顏色由四季驅動）
  this.grassMat = toon({ color: 0x86c95c });
  var grass = new THREE.Mesh(new THREE.CylinderGeometry(14, 13, 2.4, 28), this.grassMat);
  grass.position.y = -1.2;
  grass.receiveShadow = true;
  this.group.add(grass);

  // 泥土層 + 岩石錐底（低邊數 → toon 分段陰影有卡通切面感）
  var dirt = new THREE.Mesh(new THREE.CylinderGeometry(13, 12.2, 1.4, 20), toon({ color: 0x8a6a4a }));
  dirt.position.y = -3.1;
  this.group.add(dirt);
  var rock = new THREE.Mesh(new THREE.CylinderGeometry(12.2, 3.5, 7.5, 9), toon({ color: 0x7a6248 }));
  rock.position.y = -7.5;
  rock.castShadow = true;
  this.group.add(rock);
  var rockTip = new THREE.Mesh(new THREE.ConeGeometry(3.5, 3.5, 9), toon({ color: 0x6a5440 }));
  rockTip.rotation.x = Math.PI;
  rockTip.position.y = -13;
  this.group.add(rockTip);

  // 周圍懸浮小岩石（各自獨立 bobbing）
  this.rocks = [];
  var rockSpots = [[18.5, -1.5, 6], [-17.5, 1.2, -8], [15.5, 2.2, -12.5]];
  for (var i = 0; i < rockSpots.length; i++) {
    var r = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.9, 1.5), 0), toon({ color: 0x8a7458 }));
    r.position.set(rockSpots[i][0], rockSpots[i][1], rockSpots[i][2]);
    r.castShadow = true;
    this.group.add(r);
    this.rocks.push({ mesh: r, baseY: rockSpots[i][1], phase: rand(0, TAU), speed: rand(0.5, 0.9) });
  }
}
Island.prototype.update = function (time) {
  for (var i = 0; i < this.rocks.length; i++) {
    var r = this.rocks[i];
    r.mesh.position.y = r.baseY + Math.sin(time * r.speed + r.phase) * 0.5;
    r.mesh.rotation.y = time * 0.12 + r.phase;
  }
};

/** 泰晤士河：細分平面 + CPU 正弦頂點波（微波水面），顏色隨季節（冬=結冰淡藍） */
function River(parent) {
  var geo = new THREE.PlaneGeometry(30, 5.2, 30, 6);
  geo.rotateX(-Math.PI / 2);
  this.base = geo.attributes.position.array.slice();
  this.mat = toon({ color: 0x3f86c4, transparent: true, opacity: 0.92 });
  this.mesh = new THREE.Mesh(geo, this.mat);
  this.mesh.position.set(0, 0.07, 6.5);
  parent.add(this.mesh);
  // 兩側河岸（沙丘色長條，讓河看起來是嵌入島上的運河）
  var bankMat = toon({ color: 0xd8c49a });
  var b1 = new THREE.Mesh(new THREE.BoxGeometry(30, 0.42, 0.8), bankMat);
  b1.position.set(0, 0.12, 3.55); b1.receiveShadow = true;
  parent.add(b1);
  var b2 = b1.clone();
  b2.position.z = 9.45;
  parent.add(b2);
}
River.prototype.update = function (time, color) {
  var pos = this.mesh.geometry.attributes.position.array;
  for (var i = 0; i < pos.length; i += 3) {
    var x = this.base[i], z = this.base[i + 2];
    pos[i + 1] = Math.sin(x * 1.1 + time * 2.2) * 0.05 + Math.cos(z * 1.9 + time * 1.6) * 0.04;
  }
  this.mesh.geometry.attributes.position.needsUpdate = true;
  this.mat.color.copy(color);
};

/* ---------------- 7. 景點 ---------------- */
/** 大笨鐘：四面時鐘（指針顯示場景時間！）+ 夜間鐘面自發光 + PointLight */
function BigBen(parent) {
  this.group = new THREE.Group();
  parent.add(this.group);
  var stone = toon({ color: 0xd9c08a });
  var stoneDark = toon({ color: 0xc2a771 });
  var slate = toon({ color: 0x4a5560 });

  var base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.9, 2.7), stoneDark);
  base.position.y = 0.45;
  this.group.add(base);
  var shaft = new THREE.Mesh(new THREE.BoxGeometry(1.7, 6.6, 1.7), stone);
  shaft.position.y = 4.2;
  this.group.add(shaft);
  var trim = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.28, 1.95), stoneDark);
  trim.position.y = 7.6;
  this.group.add(trim);
  var clockBlock = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.1, 2.35), stone);
  clockBlock.position.y = 8.75;
  this.group.add(clockBlock);

  // 鐘面（4 面）：夜間 emissive 拉起 → 經典夜光鐘面
  this.clockMat = toon({ color: 0xfff6dc, emissive: 0xffe9a8, emissiveIntensity: 0 });
  var ringGeo = new THREE.RingGeometry(0.88, 1.0, 28);
  var faceGeo = new THREE.CircleGeometry(0.88, 28);
  var hourGeo = new THREE.BoxGeometry(0.10, 0.5, 0.05); hourGeo.translate(0, 0.22, 0);
  var minGeo = new THREE.BoxGeometry(0.07, 0.72, 0.05); minGeo.translate(0, 0.32, 0);
  var handMat = new THREE.MeshBasicMaterial({ color: 0x2a2f38 });
  this.hands = [];
  for (var i = 0; i < 4; i++) {
    var face = new THREE.Group();
    var a = i * Math.PI / 2;
    face.position.set(Math.sin(a) * 1.19, 8.75, Math.cos(a) * 1.19);
    face.rotation.y = a;
    face.add(new THREE.Mesh(faceGeo, this.clockMat));
    face.add(new THREE.Mesh(ringGeo, handMat));
    var hour = new THREE.Mesh(hourGeo, handMat); hour.position.z = 0.03;
    var min = new THREE.Mesh(minGeo, handMat); min.position.z = 0.05;
    face.add(hour); face.add(min);
    this.hands.push({ hour: hour, min: min });
    this.group.add(face);
  }

  var roof = new THREE.Mesh(new THREE.ConeGeometry(1.72, 1.7, 4), slate);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 10.65;
  this.group.add(roof);
  for (var p = 0; p < 4; p++) { // 四角小尖塔
    var pin = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.75, 4), slate);
    var pa = p * Math.PI / 2 + Math.PI / 4;
    pin.position.set(Math.sin(pa) * 1.45, 10.1, Math.cos(pa) * 1.45);
    this.group.add(pin);
  }
  var spire = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.5, 6), toon({ color: 0xd8b45a }));
  spire.position.y = 12.2;
  this.group.add(spire);
  var tip = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), toon({ color: 0xd8b45a }));
  tip.position.y = 13.05;
  this.group.add(tip);

  this.lamp = new THREE.PointLight(0xffd9a0, 0, 13, 1.8); // 夜間鐘面光
  this.lamp.position.set(0, 8.75, 0);
  this.group.add(this.lamp);

  this.group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
}
BigBen.prototype.update = function (dayT, lampF) {
  // 場景時間 = dayT × 24h；指針跟著日夜循環走（15 秒一整天）
  var hours = dayT * 24;
  for (var i = 0; i < this.hands.length; i++) {
    this.hands[i].hour.rotation.z = -(hours / 12) * TAU;
    this.hands[i].min.rotation.z = -(hours % 1) * TAU;
  }
  this.clockMat.emissiveIntensity = lampF * 1.25;
  this.lamp.intensity = lampF * 26;
};

/** 倫敦眼：轉動的輪框 + 保持水平的車廂（反向旋轉），夜間紫藍燈光 */
function LondonEye(parent) {
  this.group = new THREE.Group();
  this.group.position.set(-9.5, 0, -2.5);
  this.group.rotation.y = 0.5;
  parent.add(this.group);
  var steel = toon({ color: 0xeef2f6 });
  this.rimMat = toon({ color: 0xeef2f6, emissive: 0x7f9fff, emissiveIntensity: 0 });
  this.capsuleMat = toon({ color: 0xf4f7fa, emissive: 0x86b2ff, emissiveIntensity: 0 });

  var platform = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 2.8), toon({ color: 0x9aa4ae }));
  platform.position.y = 0.17;
  this.group.add(platform);
  for (var s = -1; s <= 1; s += 2) { // A 字支撐腳
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.9, 8), steel);
    leg.position.set(s * 1.35, 2.75, 0);
    leg.rotation.z = -s * 0.31;
    this.group.add(leg);
  }
  var axle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.4, 10), steel);
  axle.rotation.x = Math.PI / 2;
  axle.position.y = 5.2;
  this.group.add(axle);

  this.wheel = new THREE.Group();
  this.wheel.position.y = 5.2;
  this.group.add(this.wheel);
  var rim = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.13, 10, 48), this.rimMat);
  this.wheel.add(rim);
  for (var k = 0; k < 12; k++) { // 輪輻
    var a = k * TAU / 12;
    var spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 4.55, 6), steel);
    spoke.position.set(Math.cos(a) * 2.28, Math.sin(a) * 2.28, 0);
    spoke.rotation.z = a - Math.PI / 2;
    this.wheel.add(spoke);
  }
  var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10), steel);
  hub.rotation.x = Math.PI / 2;
  this.wheel.add(hub);

  this.capsules = [];
  var capGeo = new THREE.BoxGeometry(0.55, 0.75, 0.55);
  for (var c = 0; c < 12; c++) {
    var ca = c * TAU / 12;
    var cap = new THREE.Mesh(capGeo, this.capsuleMat);
    cap.position.set(Math.cos(ca) * 4.6, Math.sin(ca) * 4.6, 0);
    this.wheel.add(cap);
    this.capsules.push(cap);
  }

  this.lamp = new THREE.PointLight(0x8fb4ff, 0, 15, 1.8);
  this.lamp.position.set(0, 5.2, 0.8);
  this.group.add(this.lamp);

  this.group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
}
LondonEye.prototype.update = function (dt, lampF) {
  this.wheel.rotation.z += dt * 0.22; // 緩慢轉動
  for (var i = 0; i < this.capsules.length; i++) {
    this.capsules[i].rotation.z = -this.wheel.rotation.z; // 車廂保持水平
  }
  this.rimMat.emissiveIntensity = lampF * 0.9;
  this.capsuleMat.emissiveIntensity = lampF * 0.7;
  this.lamp.intensity = lampF * 24;
};

/** 倫敦塔橋：雙塔 + 上層步道 + 橋面 + 懸索（貝茲曲線 Tube），夜間暖燈 */
function TowerBridge(parent) {
  this.group = new THREE.Group();
  this.group.position.set(6.3, 0, 0);
  parent.add(this.group);
  var blue = toon({ color: 0x8fb4d9 });
  var cream = toon({ color: 0xf2ead8 });
  var cableMat = new THREE.MeshBasicMaterial({ color: 0xe8edf2 });
  this.stripMat = toon({ color: 0xf4f6f8, emissive: 0xffd9a0, emissiveIntensity: 0 });

  for (var ti = 0; ti < 2; ti++) {
    var tz = ti === 0 ? 4.3 : 8.7;
    var tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.6, 1.5), blue);
    tower.position.set(0, 2.3, tz);
    this.group.add(tower);
    var band = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.3, 1.62), cream);
    band.position.set(0, 4.0, tz);
    this.group.add(band);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.15, 4), cream);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(0, 5.2, tz);
    this.group.add(roof);
    for (var p = 0; p < 4; p++) {
      var pin = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 4), cream);
      var pa = p * Math.PI / 2 + Math.PI / 4;
      pin.position.set(Math.sin(pa) * 0.95, 4.85, tz + Math.cos(pa) * 0.95);
      this.group.add(pin);
    }
  }
  var walkway = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 8.8), cream);
  walkway.position.set(0, 3.55, 6.5);
  this.group.add(walkway);
  var strip = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.1, 8.86), this.stripMat);
  strip.position.set(0, 3.24, 6.5);
  this.group.add(strip);
  var deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 11.2), toon({ color: 0x39424e }));
  deck.position.set(0, 1.0, 6.5);
  this.group.add(deck);

  // 懸索：中央主跨垂墜 + 兩端拉到橋面（二次貝茲曲線近似懸鏈線）
  for (var side = -1; side <= 1; side += 2) {
    var x = side * 0.95;
    var main = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x, 5.0, 4.3),
      new THREE.Vector3(x, 3.85, 6.5),
      new THREE.Vector3(x, 5.0, 8.7)
    );
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(main, 12, 0.05, 5), cableMat));
    var ends = [[4.3, 1.6], [8.7, 11.4]];
    for (var e = 0; e < 2; e++) {
      var sideSpan = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(x, 5.0, ends[e][0]),
        new THREE.Vector3(x, 2.5, (ends[e][0] + ends[e][1]) / 2),
        new THREE.Vector3(x, 1.15, ends[e][1])
      );
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(sideSpan, 8, 0.045, 5), cableMat));
    }
  }

  this.lamp = new THREE.PointLight(0xffc98a, 0, 11, 1.8);
  this.lamp.position.set(0, 3.6, 6.5);
  this.group.add(this.lamp);

  this.group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
  // 懸索與細小圓錐不投影，減少 shadow acne 與繪製成本
  var self = this;
  this.group.traverse(function (o) {
    if (o.isMesh && (o.geometry.type === 'TubeGeometry')) o.castShadow = false;
  });
}
TowerBridge.prototype.update = function (lampF) {
  this.stripMat.emissiveIntensity = lampF * 1.1;
  this.lamp.intensity = lampF * 20;
};

/** 場景裝飾：樹（四季變色）、灌木、紅色電話亭、路燈（夜間發光）、雲 */
function Decor(parent, sceneRoot) {
  this.treeMat = toon({ color: 0x6fc75e });   // 綠樹（季節色）
  this.treeBMat = toon({ color: 0xf0a8c4 });  // 花樹（春櫻粉→秋楓紅）
  var trunkMat = toon({ color: 0x7a5230 });
  var trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 0.9, 7);

  var treeSpots = [
    [8.5, -5.5, 0], [-5.5, -6, 1], [-12, 2.5, 0], [3.5, -9.5, 1], [-2.5, -9, 0], [11.5, 1.5, 0]
  ];
  for (var i = 0; i < treeSpots.length; i++) {
    var g = new THREE.Group();
    g.position.set(treeSpots[i][0], 0, treeSpots[i][1]);
    var trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.45;
    g.add(trunk);
    var mat = treeSpots[i][2] ? this.treeBMat : this.treeMat;
    var f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), mat);
    f1.position.y = 1.35;
    var f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), mat);
    f2.position.set(0.35, 1.9, 0.15);
    g.add(f1); g.add(f2);
    var sc = rand(0.85, 1.25);
    g.scale.set(sc, sc, sc);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    parent.add(g);
  }

  var bushGeo = new THREE.IcosahedronGeometry(0.45, 0);
  var bushSpots = [[5, 2.6], [-7, 3.1], [-1, 2.4], [9, -1.2], [-8.5, -5.8]];
  for (var b = 0; b < bushSpots.length; b++) {
    var bush = new THREE.Mesh(bushGeo, this.treeMat);
    bush.position.set(bushSpots[b][0], 0.3, bushSpots[b][1]);
    bush.castShadow = true;
    parent.add(bush);
  }

  // 紅色電話亭（倫敦 icon）
  var boothMat = toon({ color: 0xc8332b });
  var boothSpots = [[2.2, 3.2, 0.4], [-4.5, 0.5, -0.3]];
  for (var p = 0; p < boothSpots.length; p++) {
    var booth = new THREE.Group();
    booth.position.set(boothSpots[p][0], 0, boothSpots[p][1]);
    booth.rotation.y = boothSpots[p][2];
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.0, 0.52), boothMat);
    body.position.y = 0.5;
    var roof = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), boothMat);
    roof.position.y = 1.05;
    var sign = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.54), toon({ color: 0xf4e9d8 }));
    sign.position.y = 0.9;
    booth.add(body); booth.add(roof); booth.add(sign);
    booth.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    parent.add(booth);
  }

  // 路燈：夜間燈罩自發光（不加真實光源，控制 PointLight 數量）
  this.globeMat = toon({ color: 0xf8f4e8, emissive: 0xffd9a0, emissiveIntensity: 0 });
  var postMat = toon({ color: 0x2c313a });
  var lampSpots = [[4.5, 3.55], [-3.5, 3.55], [7.8, -3]];
  for (var L = 0; L < lampSpots.length; L++) {
    var lamp = new THREE.Group();
    lamp.position.set(lampSpots[L][0], 0, lampSpots[L][1]);
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.7, 6), postMat);
    post.position.y = 0.85;
    var globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this.globeMat);
    globe.position.y = 1.8;
    lamp.add(post); lamp.add(globe);
    parent.add(lamp);
  }

  // 卡通雲（壓扁的 icosahedron 組合，緩慢飄移、繞場循環）
  this.clouds = [];
  var cloudMat = new THREE.MeshToonMaterial({
    color: 0xffffff, gradientMap: TOON_GRAD, transparent: true, opacity: 0.94, fog: false
  });
  for (var c = 0; c < 6; c++) {
    var cloud = new THREE.Group();
    var puffs = 3 + (c % 2);
    for (var u = 0; u < puffs; u++) {
      var puff = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.9, 1.6), 0), cloudMat);
      puff.position.set(u * rand(1.0, 1.5) - puffs * 0.6, rand(-0.2, 0.3), rand(-0.5, 0.5));
      cloud.add(puff);
    }
    cloud.scale.y = 0.55;
    cloud.position.set(rand(-40, 40), rand(15, 22), rand(-26, 10));
    sceneRoot.add(cloud);
    this.clouds.push({ mesh: cloud, speed: rand(0.4, 0.95) });
  }
}
Decor.prototype.update = function (dt, params, lampF) {
  this.treeMat.color.copy(params.tree);
  this.treeBMat.color.copy(params.treeB);
  this.globeMat.emissiveIntensity = lampF * 1.5;
  for (var i = 0; i < this.clouds.length; i++) {
    var c = this.clouds[i];
    c.mesh.position.x += c.speed * dt;
    if (c.mesh.position.x > 46) c.mesh.position.x = -46;
  }
};

/* ---------------- 8. CameraRig（自實作環繞控制） ---------------- */
function CameraRig(cam, dom) {
  this.cam = cam;
  this.dom = dom;
  this.target = new THREE.Vector3(0, 2.6, 0.8);
  this.theta = 0.62;      // 方位角
  this.phi = 1.12;        // 極角（從 +Y 起算）；略低視角讓塔身剪影更突出
  this.radius = 34;
  this.vTheta = 0; this.vPhi = 0;
  this.dragging = false;
  this.lastX = 0; this.lastY = 0;
  this.idleTime = 99;     // 閒置超過 3 秒 → 緩慢自動旋轉（拖曳中絕不啟動）
  this._bind();
}
CameraRig.prototype = {
  _bind: function () {
    var self = this, dom = this.dom;
    dom.addEventListener('pointerdown', function (e) {
      self.dragging = true;
      self.lastX = e.clientX; self.lastY = e.clientY;
      self.idleTime = 0;
      dom.classList.add('dragging');
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', function (e) {
      if (!self.dragging) return;
      var dx = e.clientX - self.lastX, dy = e.clientY - self.lastY;
      self.lastX = e.clientX; self.lastY = e.clientY;
      // 直接套用 + 保留一點慣性速度，update() 裡阻尼衰減
      self.theta -= dx * 0.0052;
      self.phi -= dy * 0.0038;
      self.vTheta = -dx * 0.0035;
      self.vPhi = -dy * 0.0026;
      self.phi = clamp(self.phi, 0.45, 1.45);
      self.idleTime = 0;
    });
    function endDrag(e) {
      self.dragging = false;
      self.dom.classList.remove('dragging');
    }
    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);
    dom.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.radius = clamp(self.radius * (1 + e.deltaY * 0.001), 19, 58);
      self.idleTime = 0;
    }, { passive: false });
  },
  update: function (dt) {
    this.idleTime += dt;
    if (!this.dragging) {
      // 慣性阻尼
      this.theta += this.vTheta;
      this.phi = clamp(this.phi + this.vPhi, 0.45, 1.45);
      var damp = Math.exp(-5.5 * dt);
      this.vTheta *= damp; this.vPhi *= damp;
      if (this.idleTime > 3) this.theta += dt * 0.045; // 閒置自動旋轉
    }
    var sp = Math.sin(this.phi);
    this.cam.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    this.cam.lookAt(this.target);
  }
};

/* ---------------- 9. HUD ---------------- */
function HUD(seasons, day) {
  this.seasons = seasons;
  this.day = day;
  this.seasonLabel = document.getElementById('seasonLabel');
  this.timeLabel = document.getElementById('timeLabel');
  this.debugLabel = document.getElementById('debugLabel');
  this.buttons = Array.prototype.slice.call(document.querySelectorAll('#controls button[data-season]'));
  this.autoBtn = document.getElementById('autoBtn');
  this.frames = 0;
  this.fpsTimer = 0;
  this.fps = 0;
  this._textTimer = 0;

  var self = this;
  this.buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      self.seasons.goTo(parseInt(btn.getAttribute('data-season'), 10), true);
    });
  });
  this.autoBtn.addEventListener('click', function () {
    self.seasons.setAuto(!self.seasons.auto);
  });
  document.getElementById('phaseBtn').addEventListener('click', function () {
    self.day.jumpToNextPhase();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key >= '1' && e.key <= '4') self.seasons.goTo(parseInt(e.key, 10) - 1, true);
    else if (e.key === 'a' || e.key === 'A') self.seasons.setAuto(!self.seasons.auto);
    else if (e.key === 'n' || e.key === 'N') self.day.jumpToNextPhase();
  });
  this.refreshButtons(seasons.target, seasons.auto);
}
HUD.prototype.refreshButtons = function (target, auto) {
  this.buttons.forEach(function (btn, i) {
    btn.classList.toggle('active', i === target);
  });
  this.autoBtn.innerHTML = (auto ? '⏸' : '▶') + '<span>' + (auto ? '自動' : '手動') + '</span>';
  this.autoBtn.classList.toggle('active', auto);
};
HUD.prototype.tick = function (dt, params, leafW, snowW, mistW) {
  this.frames++;
  this.fpsTimer += dt;
  if (this.fpsTimer >= 0.5) {
    this.fps = Math.round(this.frames / this.fpsTimer);
    this.frames = 0; this.fpsTimer = 0;
  }
  this._textTimer += dt;
  if (this._textTimer < 0.25) return; // 節流 DOM 更新
  this._textTimer = 0;
  this.seasonLabel.textContent = SEASONS[this.seasons.target].label;
  var t = this.day.t;
  var phase = t < 0.04 ? '🌄 黎明' : t < 0.45 ? '☀️ 白天' : t < 0.56 ? '🌇 黃昏' : t < 0.96 ? '🌙 夜晚' : '🌄 黎明';
  this.timeLabel.textContent = phase;
  this.debugLabel.textContent =
    'FPS ' + this.fps +
    (leafW > 0.02 ? ' · 🍁' + Math.round(LEAF_COUNT * smooth(0.02, 0.3, leafW)) : '') +
    (snowW > 0.02 ? ' · ❄' + SNOW_COUNT : '') +
    (mistW > 0.02 ? ' · 🌫' + Math.round(mistW * 100) + '%' : '');
};

/* ---------------- 10. 組裝與主迴圈 ---------------- */
var world = new THREE.Group(); // 整座島（含景點）→ 統一 bobbing
scene.add(world);

var day = new DayNightCycle();
var seasons = new SeasonSystem(function (target, auto) { hud.refreshButtons(target, auto); });
var island = new Island(world);
var river = new River(world);
var bigBen = new BigBen(world);
var londonEye = new LondonEye(world);
var towerBridge = new TowerBridge(world);
var decor = new Decor(world, scene);
var leaves = new LeafSystem(scene);   // 粒子掛在 scene（不跟島 bob，天空範圍更自然）
var snow = new SnowSystem(scene);
var mist = new MistSystem(scene);
var rig = new CameraRig(camera, renderer.domElement);
var hud = new HUD(seasons, day);

window.addEventListener('resize', function () { // RWD：視窗 resize 自動調整
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

var loading = document.getElementById('loading');
var started = false;
var last = performance.now();
var elapsed = 0;

/* 除錯 / 截圖用：`?ff=<秒>` 在載入時把日夜與季節狀態快轉
   （例如 ?ff=8 → 夜晚、?ff=95 → 秋季）。對正常使用無影響。 */
var FF = parseFloat(new URLSearchParams(location.search).get('ff')) || 0;
if (FF > 0) {
  elapsed = FF;
  day.t = (day.t + FF / DAY_LEN) % 1;
  var si = Math.floor(FF / SEASON_LEN) % 4;
  seasons.weights = [0, 0, 0, 0];
  seasons.weights[si] = 1;
  seasons.target = si;
  seasons.timer = FF % SEASON_LEN;
  seasons.update(0);
  hud.refreshButtons(si, seasons.auto);
}

/** 每幀更新 + 渲染（rAF 迴圈與首次同步渲染共用） */
function tick(dt) {
  elapsed += dt;

  seasons.update(dt);
  var P = seasons.params;

  day.update(dt, P.warm);
  scene.fog.near = P.fogNear;
  scene.fog.far = P.fogFar;
  island.grassMat.color.copy(P.grass);

  // 島體輕微上下浮動（規格要求）+ 極小傾側增加生動感
  world.position.y = Math.sin(elapsed * 0.55) * 0.35;
  world.rotation.z = Math.sin(elapsed * 0.4) * 0.008;

  var lampF = day.lampFactor;
  bigBen.update(day.t, lampF);
  londonEye.update(dt, lampF);
  towerBridge.update(lampF);
  decor.update(dt, P, lampF);
  island.update(elapsed);
  river.update(elapsed, P.water);

  leaves.update(dt, P.leaves, elapsed);
  snow.update(dt, P.snow, elapsed);
  mist.update(dt, P.mist);

  rig.update(dt);
  hud.tick(dt, P, P.leaves, P.snow, P.mist);
  renderer.render(scene, camera);

  if (!started) { // 首幀渲染完成才淡入（避免黑畫面）
    started = true;
    loading.classList.add('done');
    setTimeout(function () { loading.remove(); }, 600);
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  var dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp deltaTime：切分頁/卡頓後不暴衝
  tick(dt);
}

// 先同步渲染一幀（讓 load 事件當下畫面就有內容），再進入 rAF 迴圈
tick(0.016);
requestAnimationFrame(loop);

// 除錯掛勾（截圖測試 / console 檢查用；不影響正常運作）
window.__london = { renderer: renderer, scene: scene, camera: camera, day: day, seasons: seasons };

})();
