import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DAY_CYCLE_SEC = 15;

class ParticlePool {
  constructor(scene, maxCount, factory) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < maxCount; i++) {
      const p = { mesh: factory(), alive: false };
      p.mesh.visible = false;
      this.pool.push(p);
      scene.add(p.mesh);
    }
  }

  spawn(x, y, z) {
    let p = this.pool.find(item => !item.alive);
    if (!p && this.active.length) {
      p = this.active.shift();
      p.alive = false;
    }
    if (!p) return;
    p.alive = true;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.vx = (Math.random() - 0.5) * 0.5;
    p.vy = -0.2 - Math.random() * 0.35;
    p.vz = (Math.random() - 0.5) * 0.5;
    p.spin = (Math.random() - 0.5) * 4;
    p.sway = Math.random() * Math.PI * 2;
    p.life = 7 + Math.random() * 5;
    this.active.push(p);
  }

  release(p) {
    p.alive = false;
    p.mesh.visible = false;
    const i = this.active.indexOf(p);
    if (i >= 0) this.active.splice(i, 1);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      p.sway += dt * 2;
      p.mesh.position.x += (p.vx + Math.sin(p.sway) * 0.4) * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += (p.vz + Math.cos(p.sway) * 0.25) * dt;
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.5 * dt;
      if (p.life <= 0 || p.mesh.position.y < -2) this.release(p);
    }
  }

  get count() { return this.active.length; }
}

function mapleLeaf() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.12);
  shape.lineTo(0.08, 0.04);
  shape.lineTo(0.12, 0.08);
  shape.lineTo(0.04, 0);
  shape.lineTo(0.12, -0.08);
  shape.lineTo(0.08, -0.04);
  shape.lineTo(0, -0.12);
  shape.lineTo(-0.08, -0.04);
  shape.lineTo(-0.12, -0.08);
  shape.lineTo(-0.04, 0);
  shape.lineTo(-0.12, 0.08);
  shape.lineTo(-0.08, 0.04);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const hue = 0.02 + Math.random() * 0.08;
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color().setHSL(hue, 0.9, 0.42 + Math.random() * 0.12),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(0.9 + Math.random() * 0.4);
  return mesh;
}

class DayNightCycle {
  constructor(scene, sun, moon, ambient, sunLight) {
    this.scene = scene;
    this.sun = sun;
    this.moon = moon;
    this.ambient = ambient;
    this.sunLight = sunLight;
    this.phase = 0;
    this.timeScale = 1;
    this.lights = [];
  }

  register(light, emissiveMats) {
    this.lights.push({ light, mats: emissiveMats, on: false });
  }

  update(dt) {
    this.phase = (this.phase + (dt / DAY_CYCLE_SEC) * this.timeScale) % 1;
    const p = this.phase;
    const angle = p * Math.PI * 2 - Math.PI / 2;
    const r = 20;
    this.sun.position.set(Math.cos(angle) * r, Math.sin(angle) * r + 1, 6);
    this.moon.position.set(-Math.cos(angle) * r * 0.9, -Math.sin(angle) * r + 3, -5);
    this.sunLight.position.copy(this.sun.position);

    const day = Math.max(0, Math.sin(angle));
    const skyA = new THREE.Color(0x7ec8ff);
    const skyB = new THREE.Color(0xff7a50);
    const skyC = new THREE.Color(0x101830);
    const skyD = new THREE.Color(0xffc090);

    let sky;
    if (p < 0.25) sky = skyA.clone().lerp(skyB, p / 0.25);
    else if (p < 0.5) sky = skyB.clone().lerp(skyC, (p - 0.25) / 0.25);
    else if (p < 0.75) sky = skyC.clone().lerp(skyD, (p - 0.5) / 0.25);
    else sky = skyD.clone().lerp(skyA, (p - 0.75) / 0.25);

    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    this.ambient.intensity = 0.3 + day * 0.5;
    this.sunLight.intensity = day * 1.5 + (p > 0.2 && p < 0.35 ? 0.4 : 0);

    const on = p >= 0.22 && p < 0.78;
    for (const e of this.lights) {
      if (e.on !== on) {
        e.on = on;
        e.light.intensity = on ? e.light.userData.max : 0;
        for (const m of e.mats) m.emissiveIntensity = on ? m.userData.maxEmit : 0;
      }
    }
    this.sun.visible = day > 0.1;
    this.moon.visible = 1 - day > 0.2;
  }
}

class Island {
  constructor() {
    this.group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5.8, 1.2, 20),
      new THREE.MeshToonMaterial({ color: 0x4a6840 })
    );
    base.position.y = -0.2;
    this.group.add(base);
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(4.8, 5, 0.4, 20),
      new THREE.MeshToonMaterial({ color: 0x62a050 })
    );
    grass.position.y = 0.35;
    this.group.add(grass);
    this.phase = 0;
  }

  update(dt) {
    this.phase += dt;
    this.group.position.y = Math.sin(this.phase * 0.8) * 0.2;
    this.group.rotation.y += dt * 0.015;
  }
}

class TokyoTower {
  constructor() {
    this.group = new THREE.Group();
    this.emissiveMats = [];
    const red = new THREE.MeshToonMaterial({ color: 0xcc3344 });

    const legGeo = new THREE.CylinderGeometry(0.08, 0.12, 2.5, 6);
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
      const leg = new THREE.Mesh(legGeo, red);
      leg.position.set(x, 1.25, z);
      this.group.add(leg);
    }

    for (const y of [2.8, 4.2, 5.8]) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5 + (6 - y) * 0.05, 0.55 + (6 - y) * 0.05, 0.25, 8),
        red
      );
      ring.position.y = y;
      this.group.add(ring);
    }

    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.5, 6), red);
    spire.position.y = 7;
    this.group.add(spire);

    const glowMat = emissive(0xff6688, 0);
    glowMat.userData.maxEmit = 1.5;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), glowMat);
    glow.position.y = 7.5;
    this.group.add(glow);
    this.emissiveMats.push(glowMat);

    this.light = new THREE.PointLight(0xff5566, 0, 8);
    this.light.userData.max = 2;
    this.light.position.set(0, 5, 0);
    this.group.add(this.light);
  }
}

class Fuji {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(-5, 0, 1);
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 3.5, 6),
      new THREE.MeshToonMaterial({ color: 0x5a6a78 })
    );
    mountain.position.y = 1.5;
    this.group.add(mountain);
    const snow = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 1.2, 6),
      new THREE.MeshToonMaterial({ color: 0xf0f4ff })
    );
    snow.position.y = 2.8;
    this.group.add(snow);
  }
}

class Torii {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(3.5, 0, 2.5);
    const mat = new THREE.MeshToonMaterial({ color: 0xcc2222 });
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), mat);
    const p2 = pillar.clone();
    p2.position.x = 1.2;
    this.group.add(pillar, p2);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.2), mat);
    lintel.position.set(0.6, 1.5, 0);
    this.group.add(lintel);
    const lower = lintel.clone();
    lower.position.y = 1.2;
    lower.scale.x = 0.85;
    this.group.add(lower);

    const glowMat = emissive(0xff4444, 0);
    glowMat.userData.maxEmit = 0.8;
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.15), glowMat);
    g.position.set(0.6, 1.5, 0.05);
    this.group.add(g);
    this.emissiveMats = [glowMat];
    this.light = new THREE.PointLight(0xff3333, 0, 4);
    this.light.userData.max = 0.9;
    this.light.position.set(0.6, 1.5, 0.3);
    this.group.add(this.light);
  }
}

class Temple {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(-2.5, 0, -3);
    const base = box(1.8, 0.4, 1.4, 0x4a4038);
    base.position.y = 0.2;
    this.group.add(base);
    const body = box(1.4, 1, 1.2, 0x6a5040);
    body.position.y = 0.9;
    this.group.add(body);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 0.7, 4),
      new THREE.MeshToonMaterial({ color: 0x2a3848 })
    );
    roof.position.y = 1.6;
    roof.rotation.y = Math.PI / 4;
    this.group.add(roof);

    const glowMat = emissive(0xffcc88, 0);
    glowMat.userData.maxEmit = 1;
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), glowMat);
    lantern.position.set(0, 0.55, 0.65);
    this.group.add(lantern);
    this.emissiveMats = [glowMat];
    this.light = new THREE.PointLight(0xffaa55, 0, 3);
    this.light.userData.max = 0.8;
    this.light.position.copy(lantern.position);
    this.group.add(this.light);
  }
}

function box(w, h, d, c) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ color: c }));
}

function emissive(color, intensity) {
  return new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: intensity });
}

class MapleLeafSystem {
  constructor(scene) {
    this.pool = new ParticlePool(scene, 140, mapleLeaf);
    this.timer = 0;
  }

  update(dt) {
    this.timer += dt;
    if (this.timer > 0.05) {
      this.timer = 0;
      for (let i = 0; i < 2; i++) {
        this.pool.spawn((Math.random() - 0.5) * 16, 7 + Math.random() * 3, (Math.random() - 0.5) * 16);
      }
    }
    this.pool.update(dt);
  }

  get count() { return this.pool.count; }
}

// --- Scene setup ---
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7ec8ff, 0.01);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(11, 6, 13);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 24;
controls.maxPolarAngle = Math.PI / 2.05;
controls.target.set(0, 2.5, 0);

const ambient = new THREE.AmbientLight(0xaabbdd, 0.55);
scene.add(ambient);
const sunLight = new THREE.DirectionalLight(0xfff0dd, 1.3);
sunLight.castShadow = true;
scene.add(sunLight);

const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffee99 }));
const moon = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 12), new THREE.MeshBasicMaterial({ color: 0xdde8ff }));
scene.add(sun, moon);

const island = new Island();
const tower = new TokyoTower();
const fuji = new Fuji();
const torii = new Torii();
const temple = new Temple();

tower.group.position.set(0, 0.4, 0);
island.group.add(tower.group, fuji.group, torii.group, temple.group);
scene.add(island.group);

// Distant mountains
const mountains = new THREE.Group();
for (let i = 0; i < 5; i++) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(3 + Math.random() * 2, 2 + Math.random(), 5),
    new THREE.MeshToonMaterial({ color: 0x4a5a68, transparent: true, opacity: 0.6 })
  );
  m.position.set((i - 2) * 8, 0, -18 - Math.random() * 5);
  mountains.add(m);
}
scene.add(mountains);

// Clouds
const cloudGroup = new THREE.Group();
for (let i = 0; i < 5; i++) {
  const c = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 8, 8),
    new THREE.MeshToonMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
  );
  c.position.set((Math.random() - 0.5) * 28, 9 + Math.random() * 4, (Math.random() - 0.5) * 16);
  c.scale.set(2.5, 0.7, 1.5);
  cloudGroup.add(c);
}
scene.add(cloudGroup);

const maple = new MapleLeafSystem(scene);
const dayNight = new DayNightCycle(scene, sun, moon, ambient, sunLight);
dayNight.register(tower.light, tower.emissiveMats);
dayNight.register(torii.light, torii.emissiveMats);
dayNight.register(temple.light, temple.emissiveMats);

const panel = document.getElementById('panel');
const hudToggle = document.getElementById('hud-toggle');
const timeBtn = document.getElementById('time-speed');
const debugEl = document.getElementById('debug');

hudToggle.addEventListener('click', () => panel.classList.toggle('collapsed'));

const speeds = [1, 2, 4];
let si = 0;
timeBtn.addEventListener('click', () => {
  si = (si + 1) % speeds.length;
  dayNight.timeScale = speeds[si];
  timeBtn.textContent = `Day ${speeds[si]}×`;
});
addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    si = (si + 1) % speeds.length;
    dayNight.timeScale = speeds[si];
    timeBtn.textContent = `Day ${speeds[si]}×`;
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
let fpsAcc = 0;

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  island.update(dt);
  dayNight.update(dt);
  maple.update(dt);

  for (const c of cloudGroup.children) {
    c.position.x += dt * 0.25;
    if (c.position.x > 16) c.position.x = -16;
  }

  controls.update();
  renderer.render(scene, camera);

  frames++;
  fpsAcc += dt;
  if (fpsAcc >= 0.5) {
    debugEl.textContent = `FPS ${Math.round(frames / fpsAcc)} · leaves ${maple.count}`;
    frames = 0;
    fpsAcc = 0;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);