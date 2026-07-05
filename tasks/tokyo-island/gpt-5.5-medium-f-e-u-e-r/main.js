import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#scene');
const phaseLabel = document.querySelector('#phase');
const statsLabel = document.querySelector('#stats');
const clock = new THREE.Clock();
const tmpColor = new THREE.Color();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xaedcff, 18, 42);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 90);
camera.position.set(8, 5.4, 9);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 17;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 1.0, 0);

function toon(color, options = {}) {
  return new THREE.MeshToonMaterial({ color, ...options });
}

function mesh(geometry, material, position, rotation, scale) {
  const item = new THREE.Mesh(geometry, material);
  if (position) item.position.set(...position);
  if (rotation) item.rotation.set(...rotation);
  if (scale) item.scale.set(...scale);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

class Island {
  constructor() {
    this.group = new THREE.Group();
    const grass = mesh(new THREE.CylinderGeometry(3.5, 3.9, 0.55, 56), toon(0x62bd5b), [0, 0, 0]);
    const earth = mesh(new THREE.ConeGeometry(3.9, 2.2, 56), toon(0x9b6b40), [0, -1.35, 0], [Math.PI, 0, 0]);
    const rim = mesh(new THREE.TorusGeometry(3.54, 0.08, 8, 80), toon(0x74d36b), [0, 0.32, 0], [Math.PI / 2, 0, 0]);
    this.group.add(grass, earth, rim);
    for (let i = 0; i < 28; i++) {
      const angle = i / 28 * Math.PI * 2;
      const r = 2.5 + Math.random() * 0.9;
      const stone = mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.12), toon(0xbf9c75), [Math.cos(angle) * r, 0.42, Math.sin(angle) * r]);
      stone.rotation.set(Math.random(), Math.random(), Math.random());
      this.group.add(stone);
    }
  }

  update(t) {
    this.group.position.y = Math.sin(t * 0.8) * 0.18;
    this.group.rotation.z = Math.sin(t * 0.25) * 0.025;
  }
}

class TokyoTower {
  constructor() {
    this.group = new THREE.Group();
    this.litMaterials = [];
    const red = toon(0xe44732);
    const white = toon(0xfff3df);
    const glow = new THREE.MeshStandardMaterial({ color: 0xff7b38, emissive: 0xff7b38, emissiveIntensity: 0 });
    this.litMaterials.push(glow);

    for (let level = 0; level < 5; level++) {
      const y = 0.55 + level * 0.58;
      const size = 1.25 - level * 0.18;
      const ring = mesh(new THREE.BoxGeometry(size, 0.12, size), level % 2 ? white : red, [0, y, 0]);
      this.group.add(ring);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.72, 6), red, [sx * size * 0.35, y - 0.18, sz * size * 0.35], [0.18 * sx, 0, -0.18 * sz]);
          this.group.add(leg);
        }
      }
    }
    this.group.add(mesh(new THREE.ConeGeometry(0.28, 0.8, 4), red, [0, 3.45, 0], [0, Math.PI / 4, 0]));
    this.group.add(mesh(new THREE.SphereGeometry(0.11, 16, 8), glow, [0, 2.55, 0]));
    this.light = new THREE.PointLight(0xff7b38, 0, 8);
    this.light.position.set(0, 2.7, 0);
    this.group.add(this.light);
  }

  setLights(on, strength) {
    this.light.intensity = on ? 2.2 * strength : 0;
    this.litMaterials.forEach(mat => { mat.emissiveIntensity = on ? 1.3 * strength : 0; });
  }
}

class Landmark {
  static torii(x, z) {
    const group = new THREE.Group();
    const red = toon(0xd83728);
    group.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.05, 8), red, [-0.45, 0.85, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.05, 8), red, [0.45, 0.85, 0]));
    group.add(mesh(new THREE.BoxGeometry(1.25, 0.16, 0.18), red, [0, 1.34, 0]));
    group.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 0.15), red, [0, 1.13, 0]));
    group.position.set(x, 0.08, z);
    group.rotation.y = -0.35;
    return group;
  }

  static fuji(x, z) {
    const group = new THREE.Group();
    group.add(mesh(new THREE.ConeGeometry(0.82, 1.35, 4), toon(0x5f8ac2), [0, 0.78, 0], [0, Math.PI / 4, 0]));
    group.add(mesh(new THREE.ConeGeometry(0.3, 0.34, 4), toon(0xf7fbff), [0, 1.42, 0], [0, Math.PI / 4, 0]));
    group.position.set(x, 0.02, z);
    return group;
  }

  static pagoda(x, z) {
    const group = new THREE.Group();
    const wood = toon(0x9e462f);
    const roof = toon(0x283b52);
    for (let i = 0; i < 3; i++) {
      group.add(mesh(new THREE.BoxGeometry(0.72 - i * 0.1, 0.28, 0.52 - i * 0.07), wood, [0, 0.36 + i * 0.42, 0]));
      group.add(mesh(new THREE.ConeGeometry(0.62 - i * 0.08, 0.18, 4), roof, [0, 0.58 + i * 0.42, 0], [0, Math.PI / 4, 0]));
    }
    group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), roof, [0, 1.65, 0]));
    group.position.set(x, 0.05, z);
    group.rotation.y = 0.45;
    return group;
  }
}

class MapleLeafSystem {
  constructor(count = 150) {
    this.group = new THREE.Group();
    this.leaves = [];
    const colors = [0xd94b28, 0xf17735, 0xc6322d, 0xf2a541];
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.2);
    shape.lineTo(0.08, 0.05);
    shape.lineTo(0.2, 0.1);
    shape.lineTo(0.1, -0.02);
    shape.lineTo(0.16, -0.18);
    shape.lineTo(0, -0.08);
    shape.lineTo(-0.16, -0.18);
    shape.lineTo(-0.1, -0.02);
    shape.lineTo(-0.2, 0.1);
    shape.lineTo(-0.08, 0.05);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    for (let i = 0; i < count; i++) {
      const leaf = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
      leaf.userData = this.spawn(true);
      this.apply(leaf);
      this.group.add(leaf);
      this.leaves.push(leaf);
    }
  }

  spawn(randomY = false) {
    const radius = 3.4 + Math.random() * 7.5;
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      y: randomY ? Math.random() * 8 : 6 + Math.random() * 3,
      z: Math.sin(angle) * radius,
      speed: 0.45 + Math.random() * 0.55,
      sway: Math.random() * Math.PI * 2,
      spin: 0.8 + Math.random() * 1.8
    };
  }

  apply(leaf) {
    const d = leaf.userData;
    leaf.position.set(d.x, d.y, d.z);
    const s = 0.55 + Math.random() * 0.28;
    leaf.scale.setScalar(s);
  }

  update(dt, t) {
    for (const leaf of this.leaves) {
      const d = leaf.userData;
      d.y -= d.speed * dt;
      d.sway += dt * (1.2 + d.speed);
      leaf.position.set(d.x + Math.sin(d.sway) * 0.55, d.y, d.z + Math.cos(d.sway * 0.7) * 0.35);
      leaf.rotation.set(t * d.spin, d.sway, Math.sin(d.sway) * 0.8);
      if (d.y < -2.0) {
        leaf.userData = this.spawn(false);
        this.apply(leaf);
      }
    }
  }
}

class DayNightCycle {
  constructor() {
    this.ambient = new THREE.AmbientLight(0xffffff, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 30;
    this.moon = new THREE.DirectionalLight(0xb8ccff, 0);
    this.sunDisk = mesh(new THREE.SphereGeometry(0.36, 24, 12), new THREE.MeshBasicMaterial({ color: 0xffd86c }), [0, 0, 0]);
    this.moonDisk = mesh(new THREE.SphereGeometry(0.28, 24, 12), new THREE.MeshBasicMaterial({ color: 0xe9efff }), [0, 0, 0]);
    scene.add(this.ambient, this.sun, this.moon, this.sunDisk, this.moonDisk);
  }

  update(elapsed, towerLights) {
    const cycle = (elapsed % 15) / 15;
    const angle = cycle * Math.PI * 2;
    const sunY = Math.sin(angle) * 9;
    const moonY = Math.sin(angle + Math.PI) * 9;
    this.sun.position.set(Math.cos(angle) * 10, sunY, Math.sin(angle) * 5);
    this.moon.position.set(Math.cos(angle + Math.PI) * 9, moonY, Math.sin(angle + Math.PI) * 4);
    this.sunDisk.position.copy(this.sun.position);
    this.moonDisk.position.copy(this.moon.position);

    const daylight = THREE.MathUtils.smoothstep(sunY, -1.5, 4.5);
    const dusk = 1 - Math.abs(cycle - 0.28) / 0.18;
    const dawn = 1 - Math.abs(cycle - 0.78) / 0.18;
    const warm = Math.max(0, dusk, dawn);
    const night = 1 - daylight;

    const daySky = new THREE.Color(0x9ed7ff);
    const duskSky = new THREE.Color(0xffa16e);
    const nightSky = new THREE.Color(0x101735);
    scene.background = tmpColor.copy(daySky).lerp(duskSky, Math.min(1, warm)).lerp(nightSky, night);
    scene.fog.color.copy(scene.background);
    scene.fog.near = THREE.MathUtils.lerp(16, 9, night);
    scene.fog.far = THREE.MathUtils.lerp(43, 25, night);
    this.ambient.intensity = THREE.MathUtils.lerp(0.26, 0.95, daylight);
    this.sun.intensity = THREE.MathUtils.lerp(0.05, 2.4, daylight);
    this.moon.intensity = THREE.MathUtils.lerp(0.8, 0.05, daylight);
    this.sun.color.copy(new THREE.Color(0xffffff)).lerp(new THREE.Color(0xff8f4d), Math.min(1, warm));
    const lightsOn = cycle > 0.22 && cycle < 0.76;
    towerLights(lightsOn, THREE.MathUtils.smoothstep(night + warm * 0.5, 0.15, 0.8));
    phaseLabel.textContent = cycle < 0.22 ? 'Day' : cycle < 0.35 ? 'Dusk' : cycle < 0.72 ? 'Night' : 'Dawn';
  }
}

function makeCloud(x, y, z, scale) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 });
  for (let i = 0; i < 5; i++) {
    group.add(mesh(new THREE.SphereGeometry(0.35 + Math.random() * 0.22, 16, 8), mat, [(i - 2) * 0.32, Math.sin(i) * 0.08, 0]));
  }
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  return group;
}

const island = new Island();
const tower = new TokyoTower();
const leaves = new MapleLeafSystem();
const cycle = new DayNightCycle();
island.group.add(tower.group, Landmark.torii(-1.95, 1.15), Landmark.fuji(1.95, -0.9), Landmark.pagoda(1.8, 1.45));
scene.add(island.group, leaves.group);

const clouds = [makeCloud(-5, 4.8, -5, 1.1), makeCloud(4.5, 5.2, -4, 0.85), makeCloud(-2, 6.1, 4.5, 0.75)];
clouds.forEach(c => scene.add(c));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  island.update(t);
  leaves.update(dt, t);
  cycle.update(t, (on, strength) => tower.setLights(on, strength));
  clouds.forEach((c, i) => {
    c.position.x += dt * (0.08 + i * 0.02);
    if (c.position.x > 7) c.position.x = -7;
  });
  controls.update();
  statsLabel.textContent = `Leaves ${leaves.leaves.length}`;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
