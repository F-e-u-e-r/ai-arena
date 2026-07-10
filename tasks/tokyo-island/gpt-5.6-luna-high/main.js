import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, flatShading: true, ...extra });
const addBox = (p, size, pos, material, rotation = [0, 0, 0]) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...pos); mesh.rotation.set(...rotation); p.add(mesh); return mesh; };

class FloatingIsland {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.root.add(new THREE.Mesh(new THREE.CylinderGeometry(4.45, 3.25, .68, 12), M(0x6d3947)));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.28, .34, 12), M(0x7ca16e)); top.position.y = .48; this.root.add(top);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(2.1, 18), M(0x4a91a0, { transparent: true, opacity: .9 })); lake.rotation.x = -Math.PI / 2; lake.position.set(0, .67, .5); lake.scale.set(1.25, .62, 1); this.root.add(lake);
    for (let i = 0; i < 18; i++) { const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(.13 + (i % 4) * .05, 0), M(0x522e3a)); const a = i * TAU / 18; stone.position.set(Math.cos(a) * 3.6, .8, Math.sin(a) * 2.25); this.root.add(stone); }
  }
  update(t) { this.root.position.y = Math.sin(t * 1.1) * .12; this.root.rotation.z = Math.sin(t * .26) * .018; }
}

class TokyoTower {
  constructor(parent, lamps) {
    this.root = new THREE.Group(); this.root.position.set(0, 1, 0); parent.add(this.root);
    const red = M(0xe75e58), pale = M(0xffc4a7), light = M(0xffa06e, { emissive: 0xff5533, emissiveIntensity: 0 });
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + Math.PI / 4; addBox(this.root, [.12, 3.3, .12], [Math.cos(a) * .55, 1.7, Math.sin(a) * .55], red, [0, 0, Math.cos(a) * .27]); }
    for (const y of [.5, 1.5, 2.55]) { const r = .53 - y * .13; addBox(this.root, [r * 2, .1, .1], [0, y, 0], pale); addBox(this.root, [.1, .1, r * 2], [0, y, 0], pale); }
    addBox(this.root, [.4, .12, .4], [0, 2.95, 0], pale); const antenna = new THREE.Mesh(new THREE.ConeGeometry(.08, .7, 5), red); antenna.position.y = 3.36; this.root.add(antenna);
    for (const p of [[0, .95, .61], [0, 2.05, .42]]) { const lamp = new THREE.PointLight(0xff704d, 0, 3); lamp.position.set(...p); this.root.add(lamp); lamps.push({ light: lamp, materials: [light] }); }
  }
}

class JapanLandmarks {
  constructor(parent) {
    const red = M(0xb8474d), dark = M(0x4e3c46), snow = M(0xf7e6dc), cream = M(0xd9a875);
    const fuji = new THREE.Group(); fuji.position.set(-2.45, .7, .5); parent.add(fuji); const mountain = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.1, 6), dark); mountain.position.y = 1; fuji.add(mountain); const cap = new THREE.Mesh(new THREE.ConeGeometry(.62, .7, 6), snow); cap.position.y = 1.72; fuji.add(cap);
    const torii = new THREE.Group(); torii.position.set(2.55, .68, .25); parent.add(torii); addBox(torii, [.16, 1.5, .16], [-.65, .75, 0], red); addBox(torii, [.16, 1.5, .16], [.65, .75, 0], red); addBox(torii, [1.8, .16, .18], [0, 1.5, 0], red); addBox(torii, [1.35, .13, .16], [0, 1.23, 0], cream);
    const temple = new THREE.Group(); temple.position.set(2.25, .7, -1.65); parent.add(temple); addBox(temple, [1.25, .42, .85], [0, .35, 0], dark); const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, .55, 4), red); roof.position.y = .85; roof.rotation.y = Math.PI / 4; temple.add(roof); addBox(temple, [.12, .55, .12], [0, .7, 0], cream);
    const blossom = M(0xf6a7aa); for (let i = 0; i < 11; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.16, 0), blossom); const a = i * 2.4; b.position.set(-3 + (i % 4) * .28, 1 + (i % 3) * .25, -1.7 + Math.sin(a) * .45); parent.add(b); }
  }
}

class MapleLeafSystem {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group); this.leaves = [];
    const geo = new THREE.Shape(); geo.moveTo(0, .18); geo.lineTo(.11, .04); geo.lineTo(.25, .08); geo.lineTo(.16, -.04); geo.lineTo(.25, -.17); geo.lineTo(0, -.08); geo.lineTo(-.25, -.17); geo.lineTo(-.16, -.04); geo.lineTo(-.25, .08); geo.lineTo(-.11, .04); geo.closePath();
    const shape = new THREE.ShapeGeometry(geo); for (let i = 0; i < 132; i++) { const leaf = new THREE.Mesh(shape, M(i % 4 ? 0xd96251 : 0xf1a15f, { side: THREE.DoubleSide, transparent: true, opacity: .9 })); leaf.visible = false; this.group.add(leaf); this.leaves.push({ mesh: leaf, seed: Math.random() * 30, speed: .25 + Math.random() * .55 }); }
    this.active = true; this.setActive(true);
  }
  setActive(on) { this.active = on; this.leaves.forEach((p, i) => { p.mesh.visible = on && i < 106; }); }
  update(time) { if (!this.active) return; for (const p of this.leaves) if (p.mesh.visible) { const y = 4.8 - ((time * p.speed + p.seed) % 5.9); p.mesh.position.set(Math.sin(time * .55 + p.seed) * 3.4, y, Math.cos(time * .63 + p.seed) * 2.6); p.mesh.rotation.set(time * .5, time * .7 + p.seed, Math.sin(time + p.seed) * .7); const s = .65 + (Math.sin(p.seed) + 1) * .22; p.mesh.scale.setScalar(s); } }
}

class DayNightCycle {
  constructor(scene, hemi, sun, lamps) { this.scene = scene; this.hemi = hemi; this.sun = sun; this.lamps = lamps; this.elapsed = 0; this.sky = new THREE.Color(); }
  update(dt, paused) { if (!paused) this.elapsed = (this.elapsed + dt) % 15; const phase = this.elapsed / 15; const height = Math.sin(phase * TAU - Math.PI / 2); const day = clamp((height + .22) / .6, 0, 1); const dusk = clamp(1 - Math.abs(phase - .5) * 7, 0, 1); this.sky.set(0x101b35).lerp(new THREE.Color(0x8dc8d2), day).lerp(new THREE.Color(0xe87c75), dusk * .72); this.scene.background = this.sky; this.scene.fog.color.copy(this.sky); this.hemi.intensity = .25 + day * .9; this.sun.intensity = .2 + day * 1.85; this.sun.position.set(Math.cos(phase * TAU) * 8, height * 8, 4); const lit = height < .18; this.lamps.forEach(x => { x.light.intensity = lit ? 1.2 : 0; x.materials.forEach(m => { m.emissiveIntensity = lit ? 1.5 : 0; }); }); return height < -.05 ? 'NIGHT' : height < .3 ? 'GOLDEN HOUR' : 'DAYLIGHT'; }
}

function start() {
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x8dc8d2, 10, 27); const camera = new THREE.PerspectiveCamera(36, 1, .1, 100); camera.position.set(8.3, 5.5, 8.7);
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8)); renderer.outputColorSpace = THREE.SRGBColorSpace; document.querySelector('#scene').appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 7; controls.maxDistance = 14; controls.minPolarAngle = .76; controls.maxPolarAngle = 1.45; controls.target.set(0, 1.4, 0); controls.autoRotate = true; controls.autoRotateSpeed = -.3;
  const hemi = new THREE.HemisphereLight(0xffe3ee, 0x25203f, 1.1), sun = new THREE.DirectionalLight(0xffe3bd, 1.8); sun.position.set(4, 8, 5); scene.add(hemi, sun); const world = new THREE.Group(); scene.add(world); const island = new FloatingIsland(scene); const lamps = []; new TokyoTower(world, lamps); new JapanLandmarks(world); const leaves = new MapleLeafSystem(scene); const cycle = new DayNightCycle(scene, hemi, sun, lamps);
  let paused = false, total = 0, prev = performance.now(); document.querySelector('#pause').addEventListener('click', e => { paused = !paused; e.currentTarget.textContent = paused ? 'RESUME SKY' : 'PAUSE SKY'; });
  const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); }; addEventListener('resize', resize); resize();
  function frame(now) { requestAnimationFrame(frame); const dt = Math.min((now - prev) / 1000, .05); prev = now; if (!paused) total += dt; island.update(total); leaves.update(total); document.querySelector('#timeLabel').textContent = paused ? 'SKY PAUSED' : cycle.update(dt, paused); if (paused) cycle.update(0, true); controls.update(); renderer.render(scene, camera); } requestAnimationFrame(frame);
}
start();
