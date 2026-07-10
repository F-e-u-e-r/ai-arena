import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

class Island {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    const grass = new THREE.MeshStandardMaterial({ color: 0x6e9b7e, roughness: .9, flatShading: true });
    const soil = new THREE.MeshStandardMaterial({ color: 0x6e4b3d, roughness: 1, flatShading: true });
    const water = new THREE.MeshStandardMaterial({ color: 0x408899, roughness: .28, metalness: .05, transparent: true, opacity: .9 });
    this.root.add(new THREE.Mesh(new THREE.CylinderGeometry(4.65, 3.45, .7, 12), soil));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(4.62, 4.35, .34, 12), grass); top.position.y = .47; this.root.add(top);
    const river = new THREE.Mesh(new THREE.TorusGeometry(2.1, .28, 6, 24), water); river.rotation.x = 0; river.scale.set(1.8, .58, 1); river.position.set(.1, .67, .05); this.root.add(river);
    for (let i = 0; i < 16; i++) { const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.16 + (i % 3) * .07, 0), soil); const a = i * TAU / 16; rock.position.set(Math.cos(a) * 3.55, .82, Math.sin(a) * 2.1); rock.scale.y = .65; this.root.add(rock); }
  }
  update(t) { this.root.position.y = Math.sin(t * 1.05) * .12; this.root.rotation.y = Math.sin(t * .15) * .025; }
}

function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .72, flatShading: true, ...extra }); }
function box(parent, size, position, material, rotation = [0, 0, 0]) { const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material); m.position.set(...position); m.rotation.set(...rotation); parent.add(m); return m; }

class BigBen {
  constructor(root, lamps) {
    this.root = new THREE.Group(); this.root.position.set(0, 1.2, 0); root.add(this.root);
    const stone = mat(0xb98758), dark = mat(0x4b3735), gold = mat(0xffd58e, { emissive: 0xffae55, emissiveIntensity: 0 });
    box(this.root, [.72, 2.65, .72], [0, 1.3, 0], stone);
    box(this.root, [.9, .22, .9], [0, 2.6, 0], dark);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(.54, .85, 4), dark); roof.position.y = 3.12; roof.rotation.y = Math.PI / 4; this.root.add(roof);
    for (const z of [-.38, .38]) { const face = new THREE.Mesh(new THREE.CircleGeometry(.23, 24), gold); face.position.set(0, 1.72, z); face.rotation.y = z > 0 ? 0 : Math.PI; this.root.add(face); }
    box(this.root, [.04, .25, .025], [0, 1.72, .405], dark); box(this.root, [.25, .04, .025], [0, 1.72, .405], dark);
    const lamp = new THREE.PointLight(0xffb25b, 0, 4); lamp.position.set(0, 1.7, .6); this.root.add(lamp); lamps.push({ light: lamp, materials: [gold] });
  }
}

class Landmark {
  constructor(root, kind, position, lamps) {
    this.root = new THREE.Group(); this.root.position.set(...position); root.add(this.root);
    const blue = mat(0x386c86), cream = mat(0xd9b985), red = mat(0xc8594e), white = mat(0xe9dfc7);
    if (kind === 'eye') {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.05, .07, 8, 36), white); wheel.position.y = 1.32; wheel.rotation.y = .05; this.root.add(wheel);
      for (let i = 0; i < 12; i++) { const a = i * TAU / 12; box(this.root, [.025, 2.05, .025], [Math.cos(a) * 1.05, 1.32, Math.sin(a) * 1.05], white, [0, -a, 0]); }
      box(this.root, [.1, 1.25, .1], [-.52, .55, 0], blue, [0, 0, -.36]); box(this.root, [.1, 1.25, .1], [.52, .55, 0], blue, [0, 0, .36]);
    } else {
      for (const x of [-.85, .85]) { box(this.root, [.34, 1.7, .42], [x, .92, 0], blue); const cap = new THREE.Mesh(new THREE.ConeGeometry(.3, .5, 4), cream); cap.position.set(x, 1.98, 0); cap.rotation.y = Math.PI / 4; this.root.add(cap); }
      box(this.root, [2.25, .15, .32], [0, 1.6, 0], cream); box(this.root, [2.25, .11, .18], [0, 1.82, 0], blue);
      box(this.root, [.1, .36, .1], [-.45, 1.72, 0], red); box(this.root, [.1, .36, .1], [.45, 1.72, 0], red);
    }
    const lamp = new THREE.PointLight(0xff9d55, 0, 3); lamp.position.y = 1.5; this.root.add(lamp); lamps.push({ light: lamp, materials: [] });
  }
}

class WeatherSystem {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group); this.season = 'spring'; this.items = [];
    const geo = new THREE.PlaneGeometry(.13, .2); const colors = { leaf: 0xd86c42, snow: 0xeaf8ff };
    for (let i = 0; i < 150; i++) { const m = new THREE.Mesh(geo, mat(i % 2 ? colors.leaf : colors.snow, { transparent: true, opacity: .86, side: THREE.DoubleSide })); m.visible = false; this.group.add(m); this.items.push({ mesh: m, seed: Math.random() * 20, speed: .28 + Math.random() * .65 }); }
    this.mist = new THREE.Mesh(new THREE.SphereGeometry(3.3, 16, 8), new THREE.MeshBasicMaterial({ color: 0xddeeea, transparent: true, opacity: 0, depthWrite: false })); this.mist.scale.y = .14; this.mist.position.y = 1.2; scene.add(this.mist);
  }
  setSeason(season) { this.season = season; this.items.forEach((p, i) => { const active = season === 'autumn' || season === 'winter'; p.mesh.visible = active && i < 112; p.mesh.material.color.set(season === 'winter' ? 0xeaf8ff : (i % 3 ? 0xd46842 : 0xf0a84d)); }); }
  update(dt, time) {
    for (const p of this.items) if (p.mesh.visible) { const y = 4.6 - ((time * p.speed + p.seed) % 5.5); p.mesh.position.set(Math.sin(time * .7 + p.seed) * 2.9 + Math.sin(p.seed) * 1.5, y, Math.cos(time * .55 + p.seed) * 2.1); p.mesh.rotation.set(time * p.speed * 2, time * .4, Math.sin(time + p.seed)); }
    const target = this.season === 'spring' ? .115 : 0; this.mist.material.opacity = lerp(this.mist.material.opacity, target, 1 - Math.pow(.001, dt)); this.mist.scale.x = 1 + Math.sin(time * .2) * .05;
  }
}

class DayNightCycle {
  constructor(scene, hemi, sun, lamps) { this.scene = scene; this.hemi = hemi; this.sun = sun; this.lamps = lamps; this.elapsed = 0; this.phase = 0; this.sky = new THREE.Color(); this.fog = scene.fog; }
  update(dt) {
    this.elapsed = (this.elapsed + dt) % 15; this.phase = this.elapsed / 15; const sunHeight = Math.sin(this.phase * TAU - Math.PI / 2); const day = clamp((sunHeight + .2) / .55, 0, 1); const dawn = clamp(1 - Math.abs(sunHeight) * 3, 0, 1); const dusk = clamp(1 - Math.abs(this.phase - .5) * 7, 0, 1);
    const skyDay = new THREE.Color(0x73b9c9), skyNight = new THREE.Color(0x10182f), skyDusk = new THREE.Color(0xe78a67); this.sky.copy(skyNight).lerp(skyDay, day).lerp(skyDusk, dusk * .75); this.scene.background = this.sky; this.fog.color.copy(this.sky);
    this.hemi.intensity = .22 + day * .86; this.sun.intensity = .18 + day * 1.8; this.sun.position.set(Math.cos(this.phase * TAU) * 7, sunHeight * 8, 4);
    const lit = sunHeight < .2; this.lamps.forEach(x => { x.light.intensity = lit ? 1.35 : 0; x.materials.forEach(m => { m.emissiveIntensity = lit ? 1.7 : 0; }); });
    return { day, lit, label: sunHeight < -.05 ? 'NIGHT' : (sunHeight < .35 ? 'GOLDEN HOUR' : 'DAYLIGHT') };
  }
}

function createScene() {
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x73b9c9, 10, 28);
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100); camera.position.set(8, 5.7, 9); camera.lookAt(0, 1.1, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; document.querySelector('#scene').appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 7; controls.maxDistance = 14; controls.minPolarAngle = .75; controls.maxPolarAngle = 1.45; controls.target.set(0, 1.2, 0); controls.autoRotate = true; controls.autoRotateSpeed = .35;
  const hemi = new THREE.HemisphereLight(0xc7ecf4, 0x162844, 1); const sun = new THREE.DirectionalLight(0xffe2b1, 1.6); sun.position.set(4, 8, 5); sun.castShadow = true; scene.add(hemi, sun);
  const world = new THREE.Group(); scene.add(world); const island = new Island(world); const lamps = []; new BigBen(world, lamps); new Landmark(world, 'eye', [-2.55, .62, .55], lamps); new Landmark(world, 'bridge', [2.55, .58, -.25], lamps);
  const bushMat = mat(0x35644e); for (let i = 0; i < 13; i++) { const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(.23 + Math.random() * .13, 0), bushMat); const a = Math.random() * TAU; bush.position.set(Math.cos(a) * 3.1, 1, Math.sin(a) * 2.1); world.add(bush); }
  const weather = new WeatherSystem(scene); const cycle = new DayNightCycle(scene, hemi, sun, lamps); weather.setSeason('spring');
  let season = 'spring'; let previous = performance.now(); let total = 0;
  const seasonLabel = document.querySelector('#seasonLabel'), timeLabel = document.querySelector('#timeLabel');
  document.querySelectorAll('.season').forEach(btn => btn.addEventListener('click', () => { season = btn.dataset.season; weather.setSeason(season); seasonLabel.textContent = season.toUpperCase(); document.querySelectorAll('.season').forEach(b => b.classList.toggle('active', b === btn)); }));
  const resize = () => { const w = innerWidth, h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); }; addEventListener('resize', resize); resize();
  function frame(now) { requestAnimationFrame(frame); const dt = Math.min((now - previous) / 1000, .05); previous = now; total += dt; island.update(total); weather.update(dt, total); const status = cycle.update(dt); timeLabel.textContent = status.label; controls.update(); renderer.render(scene, camera); }
  requestAnimationFrame(frame);
}
createScene();
