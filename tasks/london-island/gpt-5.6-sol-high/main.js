/* global THREE */
(() => {
  'use strict';

  const canvas = document.querySelector('#scene');
  const statusEl = document.querySelector('#status');
  const clockEl = document.querySelector('#clock');
  const fpsEl = document.querySelector('#fps');
  const hintEl = document.querySelector('#hint');
  const seasonButtons = [...document.querySelectorAll('[data-season]')];

  if (!window.THREE) {
    document.querySelector('#loading').innerHTML = '<em>Three.js could not be loaded</em>';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaed8df);
  scene.fog = new THREE.FogExp2(0xb9d6d5, 0.018);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  camera.position.set(9.2, 6.4, 11.5);
  const world = new THREE.Group();
  scene.add(world);

  const MAT = {
    grass: toon(0x72a85c), earth: toon(0x9a6550), rock: toon(0x6e5360),
    cream: toon(0xe5c48e), stone: toon(0xb7a58c), dark: toon(0x263844),
    red: toon(0xc84e4d), blue: toon(0x496d88), white: toon(0xeaf0e9),
    gold: toon(0xf1c768), water: new THREE.MeshStandardMaterial({ color: 0x65aeb4, roughness: .18, metalness: .08, transparent: true, opacity: .9 })
  };

  function toon(color, extras = {}) {
    return new THREE.MeshToonMaterial({ color, ...extras });
  }

  function mesh(geometry, material, parent = world, shadows = true) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = shadows;
    object.receiveShadow = shadows;
    parent.add(object);
    return object;
  }

  function box(w, h, d, material, parent, x = 0, y = 0, z = 0) {
    const object = mesh(new THREE.BoxGeometry(w, h, d), material, parent);
    object.position.set(x, y, z);
    return object;
  }

  function cylinder(rt, rb, h, segments, material, parent, x = 0, y = 0, z = 0) {
    const object = mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material, parent);
    object.position.set(x, y, z);
    return object;
  }

  class Island {
    constructor(parent) {
      this.group = new THREE.Group();
      parent.add(this.group);
      const rim = cylinder(5.45, 4.75, .58, 12, MAT.grass, this.group, 0, -.15, 0);
      rim.scale.z = .78;
      const body = cylinder(4.72, .7, 3.8, 11, MAT.earth, this.group, 0, -2.25, 0);
      body.scale.z = .78;
      cylinder(3.6, .12, 2.6, 9, MAT.rock, this.group, 0, -4.7, 0).scale.z = .76;
      for (let i = 0; i < 10; i++) {
        const stone = cylinder(.12 + Math.random() * .12, .05, .45 + Math.random() * .6, 5, MAT.rock, this.group);
        const a = i / 10 * Math.PI * 2;
        stone.position.set(Math.cos(a) * 4.4, -3.35 - Math.random(), Math.sin(a) * 3.2);
        stone.rotation.z = Math.cos(a) * .25;
      }
      const river = mesh(new THREE.PlaneGeometry(10.1, 1.2, 20, 2), MAT.water, this.group);
      river.rotation.x = -Math.PI / 2;
      river.rotation.z = -.11;
      river.position.set(.15, .18, .45);
      river.receiveShadow = true;
      this.river = river;
      this.addRoads();
      this.addTrees();
    }

    addRoads() {
      const roadMat = toon(0x6d6c68);
      const road = box(6.7, .04, .34, roadMat, this.group, -.1, .23, -1.4);
      road.rotation.y = -.12;
      for (let i = -5; i <= 5; i++) box(.3, .025, .035, MAT.cream, this.group, i * .55, .26, -1.38);
      for (let i = 0; i < 6; i++) {
        const house = box(.55, .35 + (i % 2) * .18, .5, i % 3 === 0 ? MAT.red : MAT.cream, this.group, -3.4 + i * .72, .45, -2.15);
        house.rotation.y = -.08;
        const roof = mesh(new THREE.ConeGeometry(.46, .3, 4), MAT.dark, this.group);
        roof.position.set(house.position.x, house.position.y + .36, house.position.z);
        roof.rotation.y = Math.PI / 4;
      }
    }

    addTrees() {
      for (let i = 0; i < 15; i++) {
        const a = i * 2.4;
        const r = 3 + (i % 4) * .35;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r * .7;
        if (Math.abs(z - .45) < .7) continue;
        cylinder(.08, .1, .52, 6, toon(0x79543b), this.group, x, .5, z);
        const crown = mesh(new THREE.DodecahedronGeometry(.38 + (i % 3) * .06, 0), toon(i % 4 === 0 ? 0xd2944d : 0x5f9254), this.group);
        crown.position.set(x, .96, z);
        crown.scale.y = 1.15;
      }
    }

    update(t) {
      this.group.position.y = Math.sin(t * .72) * .13;
      this.group.rotation.z = Math.sin(t * .27) * .008;
      this.river.material.opacity = .84 + Math.sin(t * 1.8) * .05;
    }
  }

  class BigBen {
    constructor(parent) {
      this.group = new THREE.Group();
      this.group.position.set(-.15, .22, -.45);
      parent.add(this.group);
      const lit = new THREE.MeshStandardMaterial({ color: 0xffefc0, emissive: 0xffbd55, emissiveIntensity: 0 });
      this.litMaterials = [lit];
      box(.96, 2.75, .86, MAT.cream, this.group, 0, 1.38, 0);
      for (const y of [.4, 1.2, 2.05]) box(1.08, .12, .98, MAT.stone, this.group, 0, y, 0);
      const clockBlock = box(1.06, .82, .96, MAT.dark, this.group, 0, 2.72, 0);
      const face = cylinder(.34, .34, .045, 32, lit, this.group, 0, 2.72, .505);
      face.rotation.x = Math.PI / 2;
      const handMat = new THREE.MeshBasicMaterial({ color: 0x26313a });
      box(.035, .28, .025, handMat, this.group, 0, 2.83, .54).rotation.z = .3;
      box(.025, .21, .025, handMat, this.group, .08, 2.68, .54).rotation.z = 1.15;
      const roof = mesh(new THREE.ConeGeometry(.67, .85, 4), MAT.dark, this.group);
      roof.position.y = 3.55;
      roof.rotation.y = Math.PI / 4;
      cylinder(.045, .06, .55, 6, MAT.gold, this.group, 0, 4.18, 0);
      this.group.scale.setScalar(.9);
    }
    setNight(amount) { this.litMaterials.forEach(m => { m.emissiveIntensity = amount * 2.2; }); }
  }

  class LondonEye {
    constructor(parent) {
      this.group = new THREE.Group();
      this.group.position.set(2.75, .48, -.65);
      this.group.rotation.y = -.2;
      parent.add(this.group);
      this.wheel = new THREE.Group();
      this.group.add(this.wheel);
      const glow = new THREE.MeshStandardMaterial({ color: 0xe7eef1, emissive: 0x8ecbff, emissiveIntensity: 0, roughness: .5 });
      this.glow = glow;
      mesh(new THREE.TorusGeometry(1.25, .055, 8, 48), glow, this.wheel);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const spoke = box(.025, 1.23, .025, MAT.white, this.wheel);
        spoke.position.set(Math.cos(a) * .61, Math.sin(a) * .61, 0);
        spoke.rotation.z = a - Math.PI / 2;
        const pod = mesh(new THREE.SphereGeometry(.13, 8, 6), glow, this.wheel);
        pod.position.set(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0);
      }
      this.wheel.position.y = 1.35;
      const legA = box(.09, 2.3, .09, MAT.white, this.group, -.47, .4, 0); legA.rotation.z = -.24;
      const legB = box(.09, 2.3, .09, MAT.white, this.group, .47, .4, 0); legB.rotation.z = .24;
    }
    update(dt) { this.wheel.rotation.z -= dt * .075; }
    setNight(amount) { this.glow.emissiveIntensity = amount * 2; }
  }

  class TowerBridge {
    constructor(parent) {
      this.group = new THREE.Group();
      this.group.position.set(-2.5, .42, 1.35);
      this.group.rotation.y = -.1;
      parent.add(this.group);
      const glow = new THREE.MeshStandardMaterial({ color: 0xe8e4d4, emissive: 0xffc96b, emissiveIntensity: 0 });
      this.glow = glow;
      for (const x of [-.8, .8]) {
        for (const z of [-.26, .26]) {
          box(.28, 1.42, .28, MAT.stone, this.group, x, .7, z);
          const cap = mesh(new THREE.ConeGeometry(.25, .32, 4), MAT.blue, this.group);
          cap.position.set(x, 1.55, z); cap.rotation.y = Math.PI / 4;
        }
        box(.75, .15, .7, MAT.blue, this.group, x, 1.08, 0);
      }
      box(2.4, .16, .62, MAT.dark, this.group, 0, .35, 0);
      box(1.38, .12, .3, glow, this.group, 0, 1.05, 0);
      for (let i = -5; i <= 5; i++) cylinder(.025, .025, .7, 5, glow, this.group, i * .18, .72, 0);
      this.group.scale.setScalar(.9);
    }
    setNight(amount) { this.glow.emissiveIntensity = amount * 2.3; }
  }

  class PooledWeather {
    constructor(parent, count, geometry, colors, kind) {
      this.kind = kind;
      this.count = count;
      this.items = Array.from({ length: count }, () => ({}));
      const material = new THREE.MeshToonMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: .95 });
      this.mesh = new THREE.InstancedMesh(geometry, material, count);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      parent.add(this.mesh);
      this.dummy = new THREE.Object3D();
      this.active = 0;
      this.items.forEach((p, i) => {
        p.seed = Math.random() * 20;
        this.reset(p, true);
        this.mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      });
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    reset(p, initial = false) {
      p.x = (Math.random() - .5) * 10;
      p.y = initial ? Math.random() * 7 - 1 : 5 + Math.random() * 2;
      p.z = (Math.random() - .5) * 7;
      p.v = this.kind === 'snow' ? .42 + Math.random() * .42 : .65 + Math.random() * .55;
      p.spin = (Math.random() - .5) * 3;
      p.rot = Math.random() * Math.PI;
    }
    setAmount(amount) { this.active = Math.round(this.count * THREE.MathUtils.clamp(amount, 0, 1)); }
    update(dt, t) {
      for (let i = 0; i < this.count; i++) {
        const p = this.items[i];
        if (i < this.active) {
          p.y -= p.v * dt;
          p.x += Math.sin(t * 1.2 + p.seed) * dt * (this.kind === 'snow' ? .16 : .42);
          p.z += Math.cos(t * .8 + p.seed) * dt * .08;
          p.rot += p.spin * dt;
          if (p.y < -2.2) this.reset(p);
          this.dummy.position.set(p.x, p.y, p.z);
          this.dummy.rotation.set(p.rot, p.rot * .55, Math.sin(t + p.seed));
          const s = this.kind === 'snow' ? .75 + Math.sin(p.seed) * .15 : 1;
          this.dummy.scale.setScalar(s);
        } else {
          this.dummy.position.set(0, -20, 0);
          this.dummy.scale.setScalar(0);
        }
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  class WeatherSystem {
    constructor(parent) {
      this.names = ['春霧', '盛夏', '金秋', '初雪'];
      this.notes = ['Morning tide', 'Golden skies', 'Leaves on the breeze', 'Quiet snowfall'];
      this.current = 0; this.next = 0; this.timer = 0; this.blend = 0;
      this.leaves = new PooledWeather(parent, 120, new THREE.CircleGeometry(.09, 4), [0xb84832, 0xe18537, 0xf2b24f], 'leaf');
      this.snow = new PooledWeather(parent, 155, new THREE.CircleGeometry(.045, 8), [0xffffff, 0xd8f1ff], 'snow');
      this.mists = [];
      const mistMat = new THREE.MeshBasicMaterial({ color: 0xe9f3ed, transparent: true, opacity: .08, depthWrite: false, side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const mist = mesh(new THREE.PlaneGeometry(2.2 + Math.random(), .32), mistMat.clone(), parent, false);
        mist.position.set((Math.random() - .5) * 9, .45 + Math.random() * 1.8, (Math.random() - .5) * 5);
        mist.rotation.y = Math.random() * Math.PI;
        this.mists.push(mist);
      }
      this.applyButtons();
    }
    choose(index) {
      this.current = index; this.next = index; this.timer = 0; this.blend = 0;
      this.applyButtons();
    }
    applyButtons() { seasonButtons.forEach((b, i) => b.classList.toggle('active', i === this.next)); }
    update(dt, t) {
      this.timer += dt;
      if (this.timer > 9 && this.next === this.current) {
        this.next = (this.current + 1) % 4;
        this.applyButtons();
      }
      if (this.next !== this.current) {
        this.blend = Math.min(1, this.blend + dt / 3);
        if (this.blend >= 1) { this.current = this.next; this.timer = 0; this.blend = 0; }
      }
      const weights = [0, 0, 0, 0];
      weights[this.current] = 1 - this.blend;
      weights[this.next] += this.blend;
      this.leaves.setAmount(weights[2]);
      this.snow.setAmount(weights[3]);
      this.leaves.update(dt, t); this.snow.update(dt, t);
      this.mists.forEach((m, i) => {
        m.material.opacity = weights[0] * .08;
        m.position.x += dt * (.035 + i * .006);
        if (m.position.x > 6) m.position.x = -6;
      });
      const labelIndex = this.blend > .5 ? this.next : this.current;
      statusEl.textContent = `${this.names[labelIndex]} · ${this.notes[labelIndex]}`;
      return weights;
    }
  }

  class DayNightCycle {
    constructor() {
      this.time = 0;
      this.sky = [0xaedce4, 0xf0a56b, 0x182442, 0xd28e84, 0xaedce4].map(c => new THREE.Color(c));
      this.fog = [0xc7dedb, 0xc89a83, 0x26344d, 0xc5a5a0, 0xc7dedb].map(c => new THREE.Color(c));
      this.keys = [0, .25, .48, .75, 1];
      this.sun = mesh(new THREE.SphereGeometry(.62, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffe4a2 }), scene, false);
      this.moon = mesh(new THREE.SphereGeometry(.42, 16, 10), new THREE.MeshBasicMaterial({ color: 0xdce8f3 }), scene, false);
      this.ambient = new THREE.HemisphereLight(0xd7eff2, 0x5c4051, 2.25);
      scene.add(this.ambient);
      this.key = new THREE.DirectionalLight(0xffe0aa, 3.4);
      this.key.position.set(-7, 10, 5);
      this.key.castShadow = true;
      this.key.shadow.mapSize.set(1024, 1024);
      this.key.shadow.camera.left = this.key.shadow.camera.bottom = -8;
      this.key.shadow.camera.right = this.key.shadow.camera.top = 8;
      scene.add(this.key);
    }
    sample(colors, phase) {
      let i = 0; while (phase > this.keys[i + 1]) i++;
      const f = THREE.MathUtils.smootherstep((phase - this.keys[i]) / (this.keys[i + 1] - this.keys[i]), 0, 1);
      return colors[i].clone().lerp(colors[i + 1], f);
    }
    update(dt, seasonWeights) {
      this.time = (this.time + dt / 15) % 1;
      const a = this.time * Math.PI * 2;
      const sky = this.sample(this.sky, this.time);
      if (seasonWeights) {
        sky.lerp(new THREE.Color(0xffcb7a), seasonWeights[1] * .12);
        sky.lerp(new THREE.Color(0xcfe7ee), seasonWeights[3] * .18);
      }
      scene.background.copy(sky);
      scene.fog.color.copy(this.sample(this.fog, this.time));
      scene.fog.density = .011 + (seasonWeights?.[0] || 0) * .018 + (seasonWeights?.[3] || 0) * .005;
      this.sun.position.set(Math.cos(a) * 17, Math.sin(a) * 11 + 1, -10);
      this.moon.position.copy(this.sun.position).multiplyScalar(-1);
      this.sun.visible = this.sun.position.y > -1;
      this.moon.visible = this.moon.position.y > -1;
      const daylight = THREE.MathUtils.smoothstep(this.sun.position.y, -2, 7);
      this.ambient.intensity = .55 + daylight * 1.8;
      this.key.intensity = .25 + daylight * 3.2;
      this.key.position.copy(this.sun.position);
      renderer.toneMappingExposure = .72 + daylight * .38;
      const night = 1 - THREE.MathUtils.smootherstep(daylight, .12, .55);
      const hour = Math.floor((this.time * 24 + 8) % 24);
      const minute = Math.floor((((this.time * 24 + 8) % 1) * 60) / 10) * 10;
      clockEl.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      return night;
    }
  }

  class CameraRig {
    constructor(element) {
      this.angle = .62; this.pitch = .43; this.radius = 16.2; this.dragging = false; this.idle = 0;
      let px = 0, py = 0;
      element.addEventListener('pointerdown', e => { this.dragging = true; px = e.clientX; py = e.clientY; this.idle = 0; element.setPointerCapture(e.pointerId); hintEl.style.opacity = '0'; });
      element.addEventListener('pointermove', e => {
        if (!this.dragging) return;
        this.angle -= (e.clientX - px) * .008;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - py) * .004, .2, .68);
        px = e.clientX; py = e.clientY;
      });
      element.addEventListener('pointerup', () => { this.dragging = false; });
      element.addEventListener('pointercancel', () => { this.dragging = false; });
    }
    update(dt) {
      this.idle += dt;
      if (!this.dragging && this.idle > 1.2) this.angle += dt * .035;
      const flat = Math.cos(this.pitch) * this.radius;
      camera.position.set(Math.sin(this.angle) * flat, Math.sin(this.pitch) * this.radius - .3, Math.cos(this.angle) * flat);
      camera.lookAt(0, -.8, 0);
    }
  }

  function addClouds() {
    const cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff, transparent: true, opacity: .68, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = mesh(new THREE.SphereGeometry(.45 + Math.random() * .35, 9, 6), cloudMat, cloud, false);
        puff.position.set(j * .5, Math.sin(j) * .15, Math.random() * .3);
      }
      cloud.position.set((Math.random() - .5) * 24, 4 + Math.random() * 5, -6 - Math.random() * 9);
      cloud.scale.setScalar(.8 + Math.random() * 1.1);
      scene.add(cloud);
    }
  }

  const island = new Island(world);
  const ben = new BigBen(island.group);
  const eye = new LondonEye(island.group);
  const bridge = new TowerBridge(island.group);
  const weather = new WeatherSystem(world);
  const cycle = new DayNightCycle();
  const rig = new CameraRig(canvas);
  addClouds();

  seasonButtons.forEach(button => button.addEventListener('click', () => weather.choose(Number(button.dataset.season))));
  window.addEventListener('keydown', event => {
    const key = Number(event.key);
    if (key >= 1 && key <= 4) weather.choose(key - 1);
  });

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.8 ? 39 : 34;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  const timer = new THREE.Clock();
  let elapsed = 0, frames = 0, fpsTime = 0;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(timer.getDelta(), .05);
    elapsed += dt; frames++; fpsTime += dt;
    island.update(elapsed); eye.update(dt);
    const seasonWeights = weather.update(dt, elapsed);
    const night = cycle.update(dt, seasonWeights);
    ben.setNight(night); eye.setNight(night); bridge.setNight(night);
    rig.update(dt);
    world.rotation.y = Math.sin(elapsed * .17) * .012;
    renderer.render(scene, camera);
    if (fpsTime > .75) { fpsEl.textContent = `${Math.round(frames / fpsTime)} FPS`; frames = 0; fpsTime = 0; }
  }
  animate();
  requestAnimationFrame(() => {
    document.querySelector('#loading').classList.add('hidden');
    window.__arenaReady = true;
  });
})();
