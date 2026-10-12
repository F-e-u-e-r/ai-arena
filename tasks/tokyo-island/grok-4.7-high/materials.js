/* Shared palette, toon gradient, layout, and night-light registry.
   No THREE calls run at parse time, so a missing CDN script fails in main. */

/* Default orbit yaw. The sun’s noon position is placed on the far side of this
   view so the opening camera and the daylight disc share one azimuth. */
const DEFAULT_VIEW_THETA = 0.42;

const SCENE = {
  pond: { x: -2.35, z: 2.55, r: 1.22 },
  fuji: { x: -5.7, z: -1.15 },
  torii: { x: 3.55, z: 5.15 },
  temple: { x: 5.55, z: -3.55 },
  trees: [
    { x: -3.7, z: 5.35, s: 1.05 },
    { x: 1.15, z: -5.7, s: 1.2 },
    { x: -8.15, z: 3.35, s: 0.85 },
    { x: 7.35, z: 1.45, s: 0.95 },
    { x: -1.35, z: -4.15, s: 0.8 }
  ],
  lanterns: [
    { x: 2.35, z: 3.85 },
    { x: 4.85, z: 3.55 },
    { x: 4.25, z: -2.35 },
    { x: -0.7, z: 3.7 }
  ]
};

/** Grass height of the island dome. r is horizontal distance from center. */
function islandSurfaceY(x, z) {
  const r = Math.hypot(x, z);
  const t = Math.min(r / 10.2, 1);
  return 1.38 - t * t * 0.78;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 4-band cartoon ramp. Linear data (not sRGB) so MeshToonMaterial steps stay even. */
let _toonGradient = null;
function toonGradient() {
  if (_toonGradient) return _toonGradient;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 1;
  const g = canvas.getContext("2d");
  const bands = ["#2a2a34", "#6a6a78", "#b4b4be", "#ffffff"];
  for (let i = 0; i < bands.length; i++) {
    g.fillStyle = bands[i];
    g.fillRect(i, 0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  _toonGradient = tex;
  return tex;
}

function toonMat(color, extra) {
  const params = { color: color, gradientMap: toonGradient() };
  if (extra) {
    for (const key in extra) params[key] = extra[key];
  }
  return new THREE.MeshToonMaterial(params);
}

/** Tracks emissive materials and point lights that fade with the night factor. */
class NightRig {
  constructor() {
    this.points = [];
    this.mats = [];
    this.level = 0;
  }

  trackPoint(light, base) {
    light.intensity = 0;
    light.userData.nightBase = base;
    this.points.push(light);
    return light;
  }

  trackMat(mat, base) {
    mat.userData.nightBase = base;
    this.mats.push(mat);
    return mat;
  }

  /** k is 0 (day) → 1 (full night lighting). No allocations. */
  set(k) {
    this.level = k;
    for (let i = 0; i < this.points.length; i++) {
      const light = this.points[i];
      light.intensity = light.userData.nightBase * k;
    }
    for (let i = 0; i < this.mats.length; i++) {
      const mat = this.mats[i];
      mat.emissiveIntensity = mat.userData.nightBase * k;
    }
  }
}

const nightRig = new NightRig();

let _mats = null;
function mats() {
  if (_mats) return _mats;
  const red = toonMat("#e04538", { emissive: "#ff5a40", emissiveIntensity: 0 });
  const cream = toonMat("#f6f1e6", { emissive: "#ffe1c2", emissiveIntensity: 0 });
  const brace = toonMat("#b4332c", { emissive: "#ff4d3c", emissiveIntensity: 0 });
  nightRig.trackMat(red, 0.95);
  nightRig.trackMat(cream, 0.55);
  nightRig.trackMat(brace, 0.6);
  _mats = {
    red: red,
    cream: cream,
    brace: brace,
    ink: toonMat("#2a2422"),
    gold: toonMat("#e7b84a"),
    wood: toonMat("#6b442c"),
    soil: toonMat("#a67c4e"),
    stone: toonMat("#d5cbb8"),
    roof: toonMat("#3c4d68"),
    roofTrim: toonMat("#c4483c"),
    snow: toonMat("#f5f9fc"),
    fuji: toonMat("#5f86a4"),
    grass: toonMat("#5eae4e"),
    grassDark: toonMat("#3f8c3e"),
    trunk: toonMat("#6a4228"),
    water: new THREE.MeshToonMaterial({
      color: "#2f8fd0",
      gradientMap: toonGradient(),
      transparent: true,
      opacity: 0.9
    }),
    leaf: new THREE.MeshToonMaterial({
      color: "#ffffff",
      gradientMap: toonGradient(),
      side: THREE.DoubleSide
    })
  };
  return _mats;
}

function glowMat(base, emissive, intensity) {
  const mat = toonMat(base, { emissive: emissive, emissiveIntensity: 0 });
  nightRig.trackMat(mat, intensity);
  return mat;
}

/** Soft disc used for sun / moon halos. Procedural, no external image. */
let _discTexture = null;
function discTexture() {
  if (_discTexture) return _discTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.7)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  _discTexture = tex;
  return tex;
}

function shadeMesh(mesh, cast) {
  mesh.castShadow = !!cast;
  mesh.receiveShadow = true;
  return mesh;
}
