/* global THREE */
(() => {
  'use strict';

  const canvas = document.querySelector('#scene');
  const clockEl = document.querySelector('#clock');
  const iconEl = document.querySelector('#timeIcon');
  const dragEl = document.querySelector('#drag');
  if (!window.THREE) { document.querySelector('#loading').innerHTML = '<span>Three.js could not be loaded</span>'; return; }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xefb28e);
  scene.fog = new THREE.FogExp2(0xe8ae91, .015);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const camera = new THREE.PerspectiveCamera(33, 1, .1, 120);
  const world = new THREE.Group(); scene.add(world);

  function toon(color, extras = {}) { return new THREE.MeshToonMaterial({ color, ...extras }); }
  const M = {
    grass: toon(0xa87045), moss: toon(0x858744), earth: toon(0x6c4750), rock: toon(0x493847),
    red: toon(0xb52e39), vermilion: toon(0xd94838), white: toon(0xeee5d2), charcoal: toon(0x2e2930),
    wood: toon(0x5a382f), roof: toon(0x294148), gold: toon(0xe5b756), water: new THREE.MeshStandardMaterial({ color: 0x578e95, roughness: .22, metalness: .08 })
  };
  function addMesh(geometry, material, parent = world, shadow = true) {
    const o = new THREE.Mesh(geometry, material); o.castShadow = shadow; o.receiveShadow = shadow; parent.add(o); return o;
  }
  function box(w, h, d, material, parent, x = 0, y = 0, z = 0) {
    const o = addMesh(new THREE.BoxGeometry(w, h, d), material, parent); o.position.set(x, y, z); return o;
  }
  function cyl(rt, rb, h, sides, material, parent, x = 0, y = 0, z = 0) {
    const o = addMesh(new THREE.CylinderGeometry(rt, rb, h, sides), material, parent); o.position.set(x, y, z); return o;
  }

  class FloatingIsland {
    constructor(parent) {
      this.group = new THREE.Group(); parent.add(this.group);
      const top = cyl(5.45, 4.72, .6, 12, M.grass, this.group, 0, -.12, 0); top.scale.z = .77;
      const soil = cyl(4.75, .65, 4.2, 11, M.earth, this.group, 0, -2.48, 0); soil.scale.z = .77;
      const core = cyl(3.4, .1, 2.85, 9, M.rock, this.group, 0, -5.65, 0); core.scale.z = .75;
      for (let i = 0; i < 13; i++) {
        const shard = cyl(.08 + Math.random() * .12, .02, .5 + Math.random(), 5, M.rock, this.group);
        const a = i * 2.3; shard.position.set(Math.cos(a) * (3.6 + Math.random()), -4.15 - Math.random(), Math.sin(a) * 2.8);
        shard.rotation.z = Math.cos(a) * .22;
      }
      const pond = addMesh(new THREE.CircleGeometry(1.3, 24), M.water, this.group); pond.rotation.x = -Math.PI / 2; pond.position.set(2.1, .235, .55); pond.scale.z = .53;
      this.pond = pond;
      this.makePaths(); this.makeGarden();
    }
    makePaths() {
      const path = box(5.2, .045, .55, toon(0xbda77b), this.group, -.4, .25, .25); path.rotation.y = -.18;
      for (let i = 0; i < 9; i++) {
        const stone = cyl(.28, .3, .05, 7, toon(i % 2 ? 0x766a62 : 0x998a75), this.group, -3.5 + i * .52, .31, 1.65 - i * .13);
        stone.rotation.y = i * .8; stone.scale.z = .62;
      }
      const bridge = new THREE.Group(); bridge.position.set(1.95, .42, .5); bridge.rotation.z = .05; this.group.add(bridge);
      for (let i = -3; i <= 3; i++) box(.38, .07 + Math.cos(i / 3 * Math.PI / 2) * .18, .72, M.red, bridge, i * .36, Math.cos(i / 3 * Math.PI / 2) * .18, 0);
    }
    makeGarden() {
      const colors = [0xa72c31, 0xcf4b31, 0xe0803e, 0x8d313a];
      for (let i = 0; i < 19; i++) {
        const a = i * 2.17, r = 3 + (i % 4) * .35, x = Math.cos(a) * r, z = Math.sin(a) * r * .72;
        if ((x > 1 && z > -.2) || (x < -2.2 && z < -.5)) continue;
        cyl(.07, .1, .5, 6, M.wood, this.group, x, .54, z);
        const crown = addMesh(new THREE.DodecahedronGeometry(.34 + (i % 3) * .08, 0), toon(colors[i % colors.length]), this.group);
        crown.position.set(x, 1.02, z); crown.scale.set(1.15, 1.05, .9);
      }
      for (let i = 0; i < 6; i++) {
        const lanternMat = new THREE.MeshStandardMaterial({ color: 0xf3e0b1, emissive: 0xff8b45, emissiveIntensity: 0 });
        this.lanterns ||= []; this.lanterns.push(lanternMat);
        const x = -2.8 + i * .82;
        cyl(.025, .035, .48, 5, M.charcoal, this.group, x, .55, 1.28 - i * .1);
        const lamp = addMesh(new THREE.CylinderGeometry(.11, .14, .22, 6), lanternMat, this.group); lamp.position.set(x, .84, 1.28 - i * .1);
      }
    }
    setNight(v) { this.lanterns.forEach(m => { m.emissiveIntensity = v * 2.6; }); }
    update(t) { this.group.position.y = Math.sin(t * .7) * .14; this.group.rotation.z = Math.sin(t * .25) * .009; this.pond.material.color.offsetHSL(Math.sin(t * 1.4) * .00006, 0, 0); }
  }

  class TokyoTower {
    constructor(parent) {
      this.group = new THREE.Group(); this.group.position.set(.1, .23, -.45); parent.add(this.group);
      this.glow = new THREE.MeshStandardMaterial({ color: 0xf3d9af, emissive: 0xff5b32, emissiveIntensity: 0, roughness: .45 });
      this.red = new THREE.MeshStandardMaterial({ color: 0xc7353d, emissive: 0xd4262f, emissiveIntensity: 0, roughness: .7 });
      this.build(); this.group.scale.setScalar(.94);
    }
    beam(a, b, thickness, material, parent = this.group) {
      const mid = a.clone().add(b).multiplyScalar(.5), length = a.distanceTo(b);
      const beam = box(thickness, length, thickness, material, parent); beam.position.copy(mid); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return beam;
    }
    build() {
      const levels = [[0, 1.5, 1.05], [1.5, 3.15, .5], [3.15, 4.65, .16]];
      const corners = [[-1,-.65],[1,-.65],[-1,.65],[1,.65]];
      levels.forEach(([bottom, top, width], section) => {
        corners.forEach(([sx, sz], i) => {
          const lowerWidth = section === 0 ? 1.15 : section === 1 ? .58 : .22;
          this.beam(new THREE.Vector3(sx * lowerWidth, bottom, sz * lowerWidth), new THREE.Vector3(sx * width, top, sz * width), .075, section === 1 ? M.white : this.red);
          if (i < 2) {
            const x1 = sx * lowerWidth, x2 = sx * width;
            this.beam(new THREE.Vector3(x1, bottom + .18, sz * lowerWidth), new THREE.Vector3(-x2, top - .18, sz * width), .035, this.red);
          }
        });
      });
      for (const [y,w,d] of [[1.25,1.72,1.12],[2.75,.94,.68],[3.55,.62,.5]]) box(w, .14, d, y === 2.75 ? M.white : this.red, this.group, 0, y, 0);
      box(.44, .34, .42, this.glow, this.group, 0, 3.68, 0);
      cyl(.035, .07, 1.35, 6, this.red, this.group, 0, 4.95, 0);
      cyl(.012, .035, .6, 5, M.white, this.group, 0, 5.9, 0);
    }
    setNight(v) { this.glow.emissiveIntensity = v * 3; this.red.emissiveIntensity = v * .65; }
  }

  class Fuji {
    constructor(parent) {
      this.group = new THREE.Group(); this.group.position.set(-2.8, .35, -1.85); this.group.scale.set(.9, .9, .9); parent.add(this.group);
      const mountain = addMesh(new THREE.ConeGeometry(1.25, 2.15, 10), toon(0x53717a), this.group); mountain.position.y = 1.02;
      const cap = addMesh(new THREE.ConeGeometry(.55, .78, 10), M.white, this.group); cap.position.y = 1.8;
      for (let i = 0; i < 6; i++) { const snow = addMesh(new THREE.ConeGeometry(.17, .55, 4), M.white, this.group); const a = i / 6 * Math.PI * 2; snow.position.set(Math.cos(a) * .36, 1.48, Math.sin(a) * .36); snow.rotation.z = Math.cos(a) * .38; }
    }
  }

  class Pagoda {
    constructor(parent) {
      this.group = new THREE.Group(); this.group.position.set(-2.55, .27, .55); parent.add(this.group);
      this.glow = new THREE.MeshStandardMaterial({ color: 0xf2d39a, emissive: 0xffa14c, emissiveIntensity: 0 });
      for (let i = 0; i < 4; i++) {
        const y = i * .55, size = .86 - i * .12;
        box(size * .82, .42, size * .68, i === 0 ? M.vermilion : M.wood, this.group, 0, y + .25, 0);
        const roof = addMesh(new THREE.ConeGeometry(size, .35, 4), M.roof, this.group); roof.position.y = y + .58; roof.rotation.y = Math.PI / 4; roof.scale.z = .78;
        box(.1, .16, .08, this.glow, this.group, .25, y + .28, .36 * size);
      }
      cyl(.025, .045, .5, 5, M.gold, this.group, 0, 2.38, 0);
      this.group.scale.setScalar(.85);
    }
    setNight(v) { this.glow.emissiveIntensity = v * 3; }
  }

  class Torii {
    constructor(parent) {
      this.group = new THREE.Group(); this.group.position.set(3.25, .28, 1.2); this.group.rotation.y = -.25; parent.add(this.group);
      this.red = new THREE.MeshStandardMaterial({ color: 0xd94336, emissive: 0xc62b24, emissiveIntensity: 0 });
      for (const x of [-.55, .55]) { cyl(.105, .14, 1.55, 8, this.red, this.group, x, .72, 0); box(.24, .1, .28, M.charcoal, this.group, x, -.04, 0); }
      box(1.65, .17, .2, this.red, this.group, 0, 1.52, 0).rotation.z = -.015;
      box(1.95, .14, .26, this.red, this.group, 0, 1.77, 0);
      box(.2, .32, .16, M.gold, this.group, 0, 1.56, .12);
    }
    setNight(v) { this.red.emissiveIntensity = v * .8; }
  }

  function mapleShape() {
    const shape = new THREE.Shape();
    const points = [[0,.2],[-.07,.08],[-.18,.13],[-.12,.02],[-.25,-.02],[-.1,-.08],[-.13,-.19],[0,-.1],[.13,-.19],[.1,-.08],[.25,-.02],[.12,.02],[.18,.13],[.07,.08]];
    shape.moveTo(points[0][0], points[0][1]); points.slice(1).forEach(p => shape.lineTo(p[0], p[1])); shape.closePath(); return new THREE.ShapeGeometry(shape);
  }

  class MapleLeafSystem {
    constructor(parent, count = 220) {
      this.count = count; this.particles = Array.from({ length: count }, () => ({})); this.dummy = new THREE.Object3D();
      const material = new THREE.MeshToonMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      this.mesh = new THREE.InstancedMesh(mapleShape(), material, count); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; parent.add(this.mesh);
      const colors = [0x8d1f2d, 0xc43832, 0xe36f34, 0xf0a144, 0x7d2733];
      this.particles.forEach((p, i) => { p.seed = Math.random() * 30; this.reset(p, true); this.mesh.setColorAt(i, new THREE.Color(colors[i % colors.length])); });
      this.mesh.instanceColor.needsUpdate = true;
    }
    reset(p, initial = false) {
      p.x = (Math.random() - .5) * 11; p.y = initial ? random(-1.5, 7.5) : random(5.8, 8); p.z = (Math.random() - .5) * 7;
      p.v = random(.42, 1.05); p.spin = random(-2.8, 2.8); p.rot = random(0, Math.PI * 2); p.sway = random(.25, .65); p.size = random(.35, .72);
    }
    update(dt, t) {
      for (let i = 0; i < this.count; i++) {
        const p = this.particles[i]; p.y -= p.v * dt; p.x += Math.sin(t * 1.15 + p.seed) * p.sway * dt; p.z += Math.cos(t * .62 + p.seed) * .12 * dt; p.rot += p.spin * dt;
        if (p.y < -3.3) this.reset(p);
        this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(p.rot * .7, p.rot, Math.sin(t + p.seed) * 1.2); this.dummy.scale.setScalar(p.size); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  class DayNightCycle {
    constructor() {
      this.phase = 0; this.jump = 0;
      this.keys = [0, .24, .47, .73, 1];
      this.skies = [0x8fc8d5, 0xf0a076, 0x1d2140, 0xc88991, 0x8fc8d5].map(c => new THREE.Color(c));
      this.fogs = [0xa8cdd0, 0xd79578, 0x293049, 0xb8939c, 0xa8cdd0].map(c => new THREE.Color(c));
      this.sun = addMesh(new THREE.SphereGeometry(.65, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffdda0 }), scene, false);
      this.moon = addMesh(new THREE.SphereGeometry(.42, 16, 10), new THREE.MeshBasicMaterial({ color: 0xe1e5f2 }), scene, false);
      this.hemi = new THREE.HemisphereLight(0xe4f1f0, 0x4c3544, 2.3); scene.add(this.hemi);
      this.key = new THREE.DirectionalLight(0xffd3a2, 3.5); this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024); this.key.shadow.camera.left = this.key.shadow.camera.bottom = -8; this.key.shadow.camera.right = this.key.shadow.camera.top = 8; scene.add(this.key);
    }
    sample(colors, p) { let i = 0; while (p > this.keys[i + 1]) i++; const n = THREE.MathUtils.smootherstep((p - this.keys[i]) / (this.keys[i + 1] - this.keys[i]), 0, 1); return colors[i].clone().lerp(colors[i + 1], n); }
    skip() { this.phase = (this.phase + .125) % 1; }
    update(dt) {
      this.phase = (this.phase + dt / 15) % 1; const a = this.phase * Math.PI * 2;
      scene.background.copy(this.sample(this.skies, this.phase)); scene.fog.color.copy(this.sample(this.fogs, this.phase));
      this.sun.position.set(Math.cos(a) * 18, Math.sin(a) * 12 + 1, -11); this.moon.position.copy(this.sun.position).multiplyScalar(-1);
      this.sun.visible = this.sun.position.y > -1; this.moon.visible = this.moon.position.y > -1;
      const day = THREE.MathUtils.smoothstep(this.sun.position.y, -2, 7); this.hemi.intensity = .5 + day * 1.9; this.key.intensity = .25 + day * 3.1; this.key.position.copy(this.sun.position); renderer.toneMappingExposure = .7 + day * .38;
      const night = 1 - THREE.MathUtils.smootherstep(day, .12, .55);
      const local = (this.phase * 24 + 8) % 24, hour = Math.floor(local), minute = Math.floor((local % 1) * 6) * 10;
      clockEl.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; iconEl.textContent = night > .45 ? '☾' : '☀';
      return night;
    }
  }

  class CameraRig {
    constructor(el) {
      this.angle = .56; this.pitch = .42; this.radius = 15.2; this.drag = false; this.idle = 0; let x = 0, y = 0;
      el.addEventListener('pointerdown', e => { this.drag = true; this.idle = 0; x = e.clientX; y = e.clientY; el.setPointerCapture(e.pointerId); dragEl.style.opacity = 0; });
      el.addEventListener('pointermove', e => { if (!this.drag) return; this.angle -= (e.clientX - x) * .008; this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - y) * .004, .2, .68); x = e.clientX; y = e.clientY; });
      el.addEventListener('pointerup', () => { this.drag = false; }); el.addEventListener('pointercancel', () => { this.drag = false; });
    }
    update(dt) { this.idle += dt; if (!this.drag && this.idle > 1.2) this.angle += dt * .032; const flat = Math.cos(this.pitch) * this.radius; camera.position.set(Math.sin(this.angle) * flat, Math.sin(this.pitch) * this.radius - .2, Math.cos(this.angle) * flat); camera.lookAt(0, -.3, 0); }
  }

  function addClouds() {
    const mat = new THREE.MeshToonMaterial({ color: 0xfff2df, transparent: true, opacity: .6, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group(); for (let j = 0; j < 4; j++) { const puff = addMesh(new THREE.SphereGeometry(.5 + Math.random() * .3, 9, 6), mat, cloud, false); puff.position.set(j * .45, Math.sin(j) * .12, Math.random() * .3); }
      cloud.position.set(random(-12, 12), random(4.5, 9), random(-15, -6)); cloud.scale.setScalar(random(.7, 1.4)); scene.add(cloud);
    }
  }
  function random(a, b) { return a + Math.random() * (b - a); }

  const island = new FloatingIsland(world); const tower = new TokyoTower(island.group); const fuji = new Fuji(island.group); const pagoda = new Pagoda(island.group); const torii = new Torii(island.group);
  const leaves = new MapleLeafSystem(world); const cycle = new DayNightCycle(); const rig = new CameraRig(canvas); addClouds();

  document.querySelector('#timeJump').addEventListener('click', () => cycle.skip());
  addEventListener('keydown', event => { if (event.code === 'Space') { event.preventDefault(); cycle.skip(); } });
  function resize() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.75 ? 38 : 33; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  const timer = new THREE.Clock(); let elapsed = 0;
  function loop() {
    requestAnimationFrame(loop); const dt = Math.min(timer.getDelta(), .05); elapsed += dt;
    island.update(elapsed); leaves.update(dt, elapsed); const night = cycle.update(dt); island.setNight(night); tower.setNight(night); pagoda.setNight(night); torii.setNight(night); rig.update(dt); renderer.render(scene, camera);
  }
  loop();
  requestAnimationFrame(() => { document.querySelector('#loading').classList.add('hidden'); window.__arenaReady = true; });
})();
