/* Shared toon materials, geometry helpers, and math. Classic script (file:// safe). */

const TAU = Math.PI * 2;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function wrap01(t) {
  return t - Math.floor(t);
}

function createToonGradient(steps) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255);
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const TOON_GRADIENT = createToonGradient(4);
const OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x2a1810,
  side: THREE.BackSide,
});

function toon(color, extra) {
  return new THREE.MeshToonMaterial(
    Object.assign(
      {
        color: color,
        gradientMap: TOON_GRADIENT,
      },
      extra || {}
    )
  );
}

function addOutline(mesh, scale) {
  const outline = new THREE.Mesh(mesh.geometry, OUTLINE_MAT);
  outline.scale.setScalar(scale || 1.06);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}

function mesh(geo, mat, x, y, z, shadow) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (shadow !== false) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  return m;
}

function makeMapleAlpha() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size * 0.5, size * 0.42);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  const lobes = 5;
  for (let i = 0; i <= 80; i++) {
    const t = (i / 80) * TAU;
    const lobe = Math.pow(Math.abs(Math.cos((lobes / 2) * t)), 0.35);
    const r = (0.38 + 0.5 * lobe) * 48;
    const stemCut = t > 3.9 && t < 5.5 ? 0.55 : 1;
    const x = Math.sin(t) * r * 0.78 * stemCut;
    const y = -Math.cos(t) * r * stemCut;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-2, 28, 4, 26);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

