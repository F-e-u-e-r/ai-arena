import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DAY_CYCLE_SEC = 15;
const SEASON_CYCLE_SEC = 40;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_LABELS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

// --- Object pool for weather particles (leaves / snowflakes) ---
class ParticlePool {
  constructor(scene, maxCount, factory) {
    this.scene = scene;
    this.max = maxCount;
    this.factory = factory;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < maxCount; i++) {
      const p = factory();
      p.mesh.visible = false;
      p.alive = false;
      this.pool.push(p);
      scene.add(p.mesh);
    }
  }

  spawn(x, y, z, opts = {}) {
    const p = this.pool.find(item => !item.alive) || this.active[0];
    if (!p) return null;
    if (p.alive) this._release(p);
    p.alive = true;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.vx = opts.vx ?? (Math.random() - 0.5) * 0.4;
    p.vy = opts.vy ?? -0.3 - Math.random() * 0.4;
    p.vz = opts.vz ?? (Math.random() - 0.5) * 0.4;
    p.spin = opts.spin ?? (Math.random() - 0.5) * 3;
    p.sway = opts.sway ?? Math.random() * Math.PI * 2;
    p.life = opts.life ?? 8 + Math.random() * 6;
    this.active.push(p);
    return p;
  }

  _release(p) {
    p.alive = false;
    p.mesh.visible = false;
    const idx = this.active.indexOf(p);
    if (idx >= 0) this.active.splice(idx, 1);
  }

  update(dt, bounds) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      p.sway += dt * 1.8;
      p.mesh.position.x += (p.vx + Math.sin(p.sway) * 0.35) * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += (p.vz + Math.cos(p.sway * 0.7) * 0.2) * dt;
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.6 * dt;
      if (p.life <= 0 || p.mesh.position.y < bounds.minY) this._release(p);
    }
  }

  clear() {
    while (this.active.length) this._release(this.active[0]);
  }

  get count() { return this.active.length; }
}

function makeLeafMesh() {
  const geo = new THREE.PlaneGeometry(0.18, 0.22);
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.85, 0.45 + Math.random() * 0.15),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.random() * Math.PI;
  return mesh;
}

function makeSnowMesh() {
  const geo = new THREE.CircleGeometry(0.06, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  return new THREE.Mesh(geo, mat);
}

// --- Day/night cycle: maps 0..1 phase to sky, lights, sun/moon ---
class DayNightCycle {
  constructor(scene, sunMesh, moonMesh, ambient, sunLight, fillLight) {
    this.scene = scene;
    this.sun = sunMesh;
    this.moon = moonMesh;
    this.ambient = ambient;
    this.sunLight = sunLight;
    this.fillLight = fillLight;
    this.phase = 0;
    this.timeScale = 1;
    this.landmarkLights = [];
  }

  registerLandmarkLight(light, emissiveMaterials) {
    this.landmarkLights.push({ light, mats: emissiveMaterials, on: false });
  }

  // Phase 0=midday, 0.25=dusk, 0.5=midnight, 0.75=dawn
  update(dt) {
    this.phase = (this.phase + (dt / DAY_CYCLE_SEC) * this.timeScale) % 1;
    const p = this.phase;

    const sunAngle = p * Math.PI * 2 - Math.PI / 2;
    const r = 22;
    this.sun.position.set(Math.cos(sunAngle) * r, Math.sin(sunAngle) * r + 2, 8);
    this.moon.position.set(-Math.cos(sunAngle) * r, -Math.sin(sunAngle) * r + 4, -6);
    this.sunLight.position.copy(this.sun.position);

    const day = Math.max(0, Math.sin(sunAngle));
    const dusk = smoothstep(0.15, 0.28, p) * (1 - smoothstep(0.28, 0.42, p));
    const night = 1 - smoothstep(0.35, 0.55, p) - (1 - smoothstep(0.85, 0.98, p));

    const skyDay = new THREE.Color(0x6eb8ff);
    const skyDusk = new THREE.Color(0xff8a5c);
    const skyNight = new THREE.Color(0x0a1228);
    const skyDawn = new THREE.Color(0xffb88a);

    let sky;
    if (p < 0.25) sky = skyDay.clone().lerp(skyDusk, p / 0.25);
    else if (p < 0.5) sky = skyDusk.clone().lerp(skyNight, (p - 0.25) / 0.25);
    else if (p < 0.75) sky = skyNight.clone().lerp(skyDawn, (p - 0.5) / 0.25);
    else sky = skyDawn.clone().lerp(skyDay, (p - 0.75) / 0.25);

    this.scene.background = sky;
    this.scene.fog.color.copy(sky);

    this.ambient.intensity = 0.25 + day * 0.45 + dusk * 0.15;
    this.ambient.color.setHSL(0.58, 0.3, 0.55 + day * 0.2);
    this.sunLight.intensity = day * 1.6 + dusk * 0.35;
    this.fillLight.intensity = night * 0.25 + dusk * 0.2;

    // Lights on from dusk (0.22) until pre-dawn (0.78)
    const lightsOn = p >= 0.22 && p < 0.78;
    for (const entry of this.landmarkLights) {
      if (entry.on !== lightsOn) {
        entry.on = lightsOn;
        entry.light.intensity = lightsOn ? entry.light.userData.maxIntensity : 0;
        for (const m of entry.mats) {
          m.emissiveIntensity = lightsOn ? m.userData.maxEmit : 0;
        }
      }
    }

    this.sun.visible = day > 0.08;
    this.moon.visible = night > 0.15;
  }
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// --- Four-season weather with smooth blend ---
class WeatherSystem {
  constructor(scene, leafPool, snowPool) {
    this.scene = scene;
    this.leafPool = leafPool;
    this.snowPool = snowPool;
    this.seasonIndex = 0;
    this.seasonPhase = 0;
    this.manualSeason = null;
    this.spawnTimer = 0;
    this.fogDensity = 0.012;
  }

  get season() {
    return this.manualSeason ?? SEASONS[this.seasonIndex];
  }

  setSeason(name) {
    this.manualSeason = name;
    this.leafPool.clear();
    this.snowPool.clear();
  }

  update(dt, islandY) {
    if (!this.manualSeason) {
      this.seasonPhase += dt / SEASON_CYCLE_SEC;
      if (this.seasonPhase >= 1) {
        this.seasonPhase = 0;
        this.seasonIndex = (this.seasonIndex + 1) % SEASONS.length;
        this.leafPool.clear();
        this.snowPool.clear();
      }
    }

    const s = this.season;
    const bounds = { minY: islandY - 8 };

    // Season-driven fog density (spring mist, summer clear, etc.)
    const targetFog = s === 'spring' ? 0.028 : s === 'summer' ? 0.008 : s === 'autumn' ? 0.014 : 0.02;
    this.fogDensity += (targetFog - this.fogDensity) * Math.min(1, dt * 0.5);
    this.scene.fog.density = this.fogDensity;

    this.spawnTimer += dt;
    const rate = s === 'autumn' ? 0.04 : s === 'winter' ? 0.06 : 0;
    if (rate > 0 && this.spawnTimer > rate) {
      this.spawnTimer = 0;
      const pool = s === 'autumn' ? this.leafPool : this.snowPool;
      for (let i = 0; i < (s === 'winter' ? 2 : 1); i++) {
        pool.spawn(
          (Math.random() - 0.5) * 14,
          6 + Math.random() * 4,
          (Math.random() - 0.5) * 14,
          { vy: s === 'winter' ? -0.15 - Math.random() * 0.2 : -0.25 - Math.random() * 0.3 }
        );
      }
    }

    this.leafPool.update(dt, bounds);
    this.snowPool.update(dt, bounds);
  }

  get particleCount() {
    return this.leafPool.count + this.snowPool.count;
  }
}

class Island {
  constructor() {
    this.group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 6.2, 1.4, 24),
      new THREE.MeshToonMaterial({ color: 0x5a7a48 })
    );
    body.position.y = -0.3;
    this.group.add(body);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(5.3, 5.5, 0.5, 24),
      new THREE.MeshToonMaterial({ color: 0x6faa58 })
    );
    top.position.y = 0.35;
    this.group.add(top);

    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshToonMaterial({ color: 0x6a6058 })
    );
    rock.position.set(0, -2.2, 0);
    this.group.add(rock);

    this.bobPhase = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.bobPhase += dt * 0.9;
    this.group.position.y = Math.sin(this.bobPhase) * 0.18;
    this.group.rotation.y += dt * 0.02;
  }
}

class BigBen {
  constructor() {
    this.group = new THREE.Group();
    this.emissiveMats = [];

    const base = box(1.4, 3.2, 1.4, 0x6a5040);
    base.position.y = 1.6;
    this.group.add(base);

    const tower = box(0.9, 4.5, 0.9, 0x8a6848);
    tower.position.y = 4.9;
    this.group.add(tower);

    const clock = box(1.1, 1.1, 0.15, 0xf0e8d0);
    clock.position.set(0, 5.8, 0.48);
    this.group.add(clock);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.2, 4),
      new THREE.MeshToonMaterial({ color: 0x2a2838 })
    );
    roof.position.y = 7.2;
    roof.rotation.y = Math.PI / 4;
    this.group.add(roof);

    const winMat = emissiveMat(0xffe8a0, 0);
    winMat.userData.maxEmit = 1.2;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.5), winMat);
    win.position.set(0, 4.2, 0.46);
    this.group.add(win);
    this.emissiveMats.push(winMat);

    this.light = new THREE.PointLight(0xffcc66, 0, 6);
    this.light.userData.maxIntensity = 1.8;
    this.light.position.set(0, 5.5, 0.8);
    this.group.add(this.light);
  }

  update(dt) {
    this.group.children[2].rotation.z = Math.sin(performance.now() * 0.001) * 0.02;
  }
}

class LondonEye {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(-4.5, 0, 2);
    this.emissiveMats = [];
    this.wheel = new THREE.Group();

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.06, 8, 32),
      new THREE.MeshToonMaterial({ color: 0x4488cc })
    );
    this.wheel.add(rim);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pod = box(0.22, 0.28, 0.22, 0xd0e8ff);
      pod.position.set(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0);
      this.wheel.add(pod);
    }

    const legMat = new THREE.MeshToonMaterial({ color: 0x8899aa });
    for (const x of [-0.5, 0.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), legMat);
      leg.position.set(x, 1.1, 0);
      leg.rotation.z = x * 0.35;
      this.group.add(leg);
    }

    this.group.add(this.wheel);
    this.wheel.position.y = 2.2;

    const glowMat = emissiveMat(0x66ccff, 0);
    glowMat.userData.maxEmit = 0.9;
    const glow = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.65, 32), glowMat);
    glow.position.z = 0.05;
    this.wheel.add(glow);
    this.emissiveMats.push(glowMat);

    this.light = new THREE.PointLight(0x88ccff, 0, 5);
    this.light.userData.maxIntensity = 1.2;
    this.light.position.set(0, 2.2, 0.5);
    this.wheel.add(this.light);
  }

  update(dt) {
    this.wheel.rotation.z += dt * 0.15;
  }
}

class TowerBridge {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(4.2, 0, -1.5);
    this.emissiveMats = [];

    const deck = box(3.6, 0.25, 1.2, 0x4a5568);
    deck.position.y = 0.5;
    this.group.add(deck);

    for (const x of [-1.4, 1.4]) {
      const tower = box(0.55, 2.8, 0.7, 0x7a5a48);
      tower.position.set(x, 1.9, 0);
      this.group.add(tower);

      const top = box(0.65, 0.35, 0.8, 0x3a4a5a);
      top.position.set(x, 3.3, 0);
      this.group.add(top);

      const winMat = emissiveMat(0xffaa55, 0);
      winMat.userData.maxEmit = 1;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.35), winMat);
      win.position.set(x, 2.2, 0.36);
      this.group.add(win);
      this.emissiveMats.push(winMat);
    }

    const upper = box(3.8, 0.15, 0.9, 0x556677);
    upper.position.y = 3.1;
    this.group.add(upper);

    this.light = new THREE.PointLight(0xff9955, 0, 6);
    this.light.userData.maxIntensity = 1.4;
    this.light.position.set(0, 2.5, 0.6);
    this.group.add(this.light);
  }

  update(dt) {
    const t = performance.now() * 0.0008;
    this.group.children[0].position.y = 0.5 + Math.sin(t) * 0.02;
  }
}

function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshToonMaterial({ color })
  );
}

function emissiveMat(color, intensity) {
  return new THREE.MeshStandardMaterial({
    color: 0x333333,
    emissive: color,
    emissiveIntensity: intensity,
  });
}

// --- Main ---
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x6eb8ff, 0.012);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
camera.position.set(10, 7, 12);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI / 2.1;
controls.target.set(0, 2, 0);

const ambient = new THREE.AmbientLight(0x8899bb, 0.55);
scene.add(ambient);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x6688cc, 0.2);
fillLight.position.set(-5, 3, -8);
scene.add(fillLight);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(1.2, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffee88 })
);
scene.add(sun);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.7, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xdde8ff })
);
scene.add(moon);

const island = new Island();
const bigBen = new BigBen();
const eye = new LondonEye();
const bridge = new TowerBridge();

bigBen.group.position.set(0, 0.5, 0);
island.group.add(bigBen.group, eye.group, bridge.group);
scene.add(island.group);

// Thames river hint
const river = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 2.5),
  new THREE.MeshToonMaterial({ color: 0x3a6a9a, transparent: true, opacity: 0.75 })
);
river.rotation.x = -Math.PI / 2;
river.position.set(0, 0.42, 2.5);
island.group.add(river);

// Clouds
const clouds = new THREE.Group();
for (let i = 0; i < 6; i++) {
  const c = new THREE.Mesh(
    new THREE.SphereGeometry(0.6 + Math.random() * 0.5, 8, 8),
    new THREE.MeshToonMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
  );
  c.position.set((Math.random() - 0.5) * 30, 8 + Math.random() * 6, (Math.random() - 0.5) * 20);
  c.scale.set(2 + Math.random(), 0.6, 1.2);
  clouds.add(c);
}
scene.add(clouds);

const leafPool = new ParticlePool(scene, 120, () => ({ mesh: makeLeafMesh() }));
const snowPool = new ParticlePool(scene, 150, () => ({ mesh: makeSnowMesh() }));

const weather = new WeatherSystem(scene, leafPool, snowPool);
const dayNight = new DayNightCycle(scene, sun, moon, ambient, sunLight, fillLight);

dayNight.registerLandmarkLight(bigBen.light, bigBen.emissiveMats);
dayNight.registerLandmarkLight(eye.light, eye.emissiveMats);
dayNight.registerLandmarkLight(bridge.light, bridge.emissiveMats);

// Ground shadow plane
const shadowPlane = new THREE.Mesh(
  new THREE.CircleGeometry(14, 32),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = -3;
scene.add(shadowPlane);

// HUD
const panel = document.getElementById('panel');
const hudToggle = document.getElementById('hud-toggle');
const seasonBtns = document.getElementById('season-btns');
const timeSpeedBtn = document.getElementById('time-speed');
const debugEl = document.getElementById('debug');

hudToggle.addEventListener('click', () => panel.classList.toggle('collapsed'));

for (const s of SEASONS) {
  const btn = document.createElement('button');
  btn.textContent = SEASON_LABELS[s];
  btn.dataset.season = s;
  btn.addEventListener('click', () => {
    weather.setSeason(s);
    seasonBtns.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.season === s));
  });
  seasonBtns.appendChild(btn);
}
seasonBtns.querySelector('[data-season="spring"]').classList.add('active');

const speeds = [1, 2, 4];
let speedIdx = 0;
timeSpeedBtn.addEventListener('click', () => {
  speedIdx = (speedIdx + 1) % speeds.length;
  dayNight.timeScale = speeds[speedIdx];
  timeSpeedBtn.textContent = `${speeds[speedIdx]}×`;
});

addEventListener('keydown', (e) => {
  const idx = SEASONS.indexOf(e.key === '1' ? 'spring' : e.key === '2' ? 'summer' : e.key === '3' ? 'autumn' : e.key === '4' ? 'winter' : '');
  if (idx >= 0) {
    weather.setSeason(SEASONS[idx]);
    seasonBtns.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.season === SEASONS[idx]));
  }
  if (e.key === ' ') {
    speedIdx = (speedIdx + 1) % speeds.length;
    dayNight.timeScale = speeds[speedIdx];
    timeSpeedBtn.textContent = `${speeds[speedIdx]}×`;
  }
});

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let frames = 0;
let fps = 60;
let fpsTimer = 0;

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  island.update(dt);
  bigBen.update(dt);
  eye.update(dt);
  bridge.update(dt);
  dayNight.update(dt);
  weather.update(dt, island.group.position.y);

  for (const c of clouds.children) {
    c.position.x += dt * 0.3;
    if (c.position.x > 18) c.position.x = -18;
  }
  river.material.opacity = 0.65 + Math.sin(now * 0.002) * 0.1;

  controls.update();
  renderer.render(scene, camera);

  frames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
    debugEl.textContent = `FPS ${fps} · particles ${weather.particleCount}`;
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);