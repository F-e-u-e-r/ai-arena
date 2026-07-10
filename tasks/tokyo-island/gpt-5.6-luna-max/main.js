/* Tokyo Island / Maple Hour — native Three.js scene with a pooled leaf system. */
(() => {
  'use strict';

  const THREE = window.THREE;
  const TAU = Math.PI * 2;
  const stage = document.querySelector('#stage');
  const loading = document.querySelector('#loading');
  if (!THREE) {
    loading.textContent = 'THREE.JS COULD NOT LOAD';
    return;
  }

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x4e9eb8);
  scene.fog = new THREE.FogExp2(0x765a7f, .012);
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
  camera.position.set(10.2, 7.3, 12.7);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else renderer.outputEncoding = THREE.sRGBEncoding;
  stage.appendChild(renderer.domElement);

  class OrbitController {
    constructor(viewCamera, element) {
      this.camera = viewCamera;
      this.element = element;
      this.target = new THREE.Vector3(0, 1.75, 0);
      const offset = this.camera.position.clone().sub(this.target);
      this.radius = offset.length();
      this.azimuth = Math.atan2(offset.x, offset.z);
      this.polar = Math.acos(clamp(offset.y / this.radius, -1, 1));
      this.goalAzimuth = this.azimuth;
      this.goalPolar = this.polar;
      this.dragging = false;
      this.lastX = 0;
      this.lastY = 0;
      element.style.touchAction = 'none';
      element.addEventListener('pointerdown', event => {
        this.dragging = true;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
        element.setPointerCapture?.(event.pointerId);
      });
      element.addEventListener('pointermove', event => {
        if (!this.dragging) return;
        this.goalAzimuth -= (event.clientX - this.lastX) * .008;
        this.goalPolar = clamp(this.goalPolar + (event.clientY - this.lastY) * .006, .45, 1.46);
        this.lastX = event.clientX;
        this.lastY = event.clientY;
      });
      const release = event => { this.dragging = false; element.releasePointerCapture?.(event.pointerId); };
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('wheel', event => {
        event.preventDefault();
        this.radius = clamp(this.radius + event.deltaY * .008, 8, 18);
      }, { passive: false });
    }

    update(dt) {
      const smoothing = 1 - Math.pow(.0005, dt);
      this.azimuth = lerp(this.azimuth, this.goalAzimuth, smoothing);
      this.polar = lerp(this.polar, this.goalPolar, smoothing);
      const sinPolar = Math.sin(this.polar);
      this.camera.position.set(
        this.target.x + this.radius * sinPolar * Math.sin(this.azimuth),
        this.target.y + this.radius * Math.cos(this.polar),
        this.target.z + this.radius * sinPolar * Math.cos(this.azimuth)
      );
      this.camera.lookAt(this.target);
    }
  }
  const controls = new OrbitController(camera, renderer.domElement);

  const world = new THREE.Group();
  scene.add(world);
  const hemi = new THREE.HemisphereLight(0xffd9d0, 0x241b38, 1.18);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0ba, 1.72);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -.0006;
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x9ba7ff, .1);
  scene.add(moon);
  const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb974 }));
  const moonOrb = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe0e2ff }));
  scene.add(sunOrb, moonOrb);

  const mats = {
    grass: new THREE.MeshToonMaterial({ color: 0x527d73 }),
    grassLight: new THREE.MeshToonMaterial({ color: 0x8ca686 }),
    rock: new THREE.MeshToonMaterial({ color: 0x382c4a }),
    rockLight: new THREE.MeshToonMaterial({ color: 0x685064 }),
    water: new THREE.MeshToonMaterial({ color: 0x3c92a5, transparent: true, opacity: .88 }),
    road: new THREE.MeshToonMaterial({ color: 0xb78070 }),
    tower: new THREE.MeshToonMaterial({ color: 0xd8514b }),
    towerDark: new THREE.MeshToonMaterial({ color: 0x8e3544 }),
    white: new THREE.MeshToonMaterial({ color: 0xffe7d3 }),
    roof: new THREE.MeshToonMaterial({ color: 0x332b57 }),
    shrine: new THREE.MeshToonMaterial({ color: 0xc69a73 }),
    leaf: new THREE.MeshToonMaterial({ color: 0xff704f, side: THREE.DoubleSide, transparent: true, opacity: .92 }),
    neon: new THREE.MeshStandardMaterial({ color: 0xffa06b, emissive: 0x5b171f, emissiveIntensity: 0, roughness: .35 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffd18b, emissive: 0x8e421d, emissiveIntensity: 0, roughness: .28 })
  };

  const setShadow = (mesh, cast = true, receive = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    return mesh;
  };
  function box(parent, size, position, material, rotation = [0, 0, 0]) {
    const mesh = setShadow(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }

  function addMapleTree(parent, x, z, size = 1) {
    const tree = new THREE.Group();
    tree.position.set(x, .63, z);
    const trunk = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.09 * size, .16 * size, 1.25 * size, 8), mats.shrine));
    trunk.position.y = .62 * size;
    tree.add(trunk);
    const colors = [mats.leaf, mats.tower, mats.road];
    for (let i = 0; i < 4; i++) {
      const crown = setShadow(new THREE.Mesh(new THREE.IcosahedronGeometry((.35 + (i % 2) * .12) * size, 1), colors[i % colors.length]));
      crown.position.set((i - 1.5) * .24 * size, (1.1 + (i % 2) * .2) * size, (i % 2 ? .12 : -.1) * size);
      crown.scale.y = .72;
      tree.add(crown);
    }
    parent.add(tree);
  }

  function buildIsland() {
    const island = new THREE.Group();
    const base = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(5.2, 3.0, 2.35, 32), mats.rock));
    base.position.y = -.72;
    island.add(base);
    const rim = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(5.85, 5.3, .54, 32), mats.rockLight));
    rim.position.y = -.02;
    island.add(rim);
    const top = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(5.88, 5.88, .6, 40), mats.grass));
    top.position.y = .3;
    island.add(top);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(5.63, .13, 8, 64), mats.grassLight);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = .62;
    island.add(edge);

    const pond = new THREE.Mesh(new THREE.CircleGeometry(1.18, 32), mats.water);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(3.2, .63, -1.95);
    island.add(pond);
    const road = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.44, 28), mats.road);
    road.rotation.x = -Math.PI / 2;
    road.position.y = .64;
    island.add(road);
    box(island, [3.4, .08, .32], [-1.65, .68, 2.36], mats.road, [0, -.12, 0]);
    box(island, [.3, .09, 3.25], [-3.9, .69, .1], mats.road, [0, .15, 0]);

    addMapleTree(island, -4.35, -2.3, .82);
    addMapleTree(island, 4.12, 2.62, .7);
    addMapleTree(island, -2.3, 3.5, .55);

    const city = new THREE.Group();
    city.position.y = .66;
    [[-2.65, -.9, .42, 1.1], [-2.1, -.7, .28, .72], [3.9, .55, .48, 1.25], [3.15, 1.15, .33, .72]].forEach(([x, z, w, h], i) => {
      box(city, [w, h, w * .76], [x, h / 2, z], i % 2 ? mats.roof : mats.road, [0, i * .18, 0]);
      for (let row = 0; row < Math.floor(h * 2); row++) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(.06, .095, .014), mats.lamp);
        window.position.set(x + (row % 2 ? .11 : -.11), .25 + row * .22, z - w * .38 - .008);
        city.add(window);
      }
    });
    island.add(city);
    return island;
  }

  function buildTokyoTower() {
    const root = new THREE.Group();
    root.position.set(0, .64, -.15);
    const lights = [mats.neon, mats.lamp];
    for (const x of [-.34, .34]) {
      const leg = box(root, [.16, 3.32, .16], [x, 1.67, 0], mats.tower, [0, 0, x > 0 ? -.08 : .08]);
      leg.scale.z = .9;
    }
    box(root, [.56, .13, .56], [0, .18, 0], mats.towerDark);
    box(root, [.71, .12, .58], [0, .48, 0], mats.tower);
    box(root, [.56, .1, .48], [0, 1.55, 0], mats.white);
    box(root, [.43, .1, .4], [0, 2.28, 0], mats.white);
    box(root, [.3, .08, .34], [0, 2.88, 0], mats.towerDark);
    for (const y of [.84, 1.88, 2.58]) {
      box(root, [.8 - y * .12, .055, .62 - y * .07], [0, y, 0], mats.towerDark);
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.035, .09, .95, 8), mats.tower);
    antenna.position.y = 3.73;
    root.add(antenna);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), mats.lamp);
    beacon.position.y = 4.23;
    root.add(beacon);
    for (const z of [-.32, .32]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(.065, 8, 6), mats.lamp);
      light.position.set(0, 2.3, z);
      root.add(light);
    }
    const point = new THREE.PointLight(0xff7b54, 0, 4.4, 2);
    point.position.set(0, 2.1, .2);
    root.add(point);
    root.userData.lampMaterials = lights;
    root.userData.pointLight = point;
    return root;
  }

  function buildFuji() {
    const root = new THREE.Group();
    root.position.set(-3.25, .63, -2.25);
    const mountain = setShadow(new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.15, 32), new THREE.MeshToonMaterial({ color: 0x4a6c87 })));
    mountain.position.y = 1.57;
    root.add(mountain);
    const snow = setShadow(new THREE.Mesh(new THREE.ConeGeometry(.92, 1.18, 32), mats.white));
    snow.position.y = 2.72;
    root.add(snow);
    const cloud = new THREE.Mesh(new THREE.TorusGeometry(.72, .12, 6, 24), new THREE.MeshBasicMaterial({ color: 0xe2d7de, transparent: true, opacity: .55 }));
    cloud.rotation.x = Math.PI / 2;
    cloud.position.set(0, 1.0, .1);
    root.add(cloud);
    return root;
  }

  function buildTorii() {
    const root = new THREE.Group();
    root.position.set(3.25, .65, 1.8);
    const red = mats.tower;
    box(root, [.17, 1.78, .17], [-.7, .86, 0], red);
    box(root, [.17, 1.78, .17], [.7, .86, 0], red);
    box(root, [1.9, .17, .2], [0, 1.63, 0], red);
    box(root, [2.22, .15, .22], [0, 1.94, 0], mats.towerDark, [0, 0, -.03]);
    box(root, [1.4, .12, .16], [0, .8, 0], mats.white);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), mats.lamp);
    lantern.position.set(0, 1.38, .15);
    root.add(lantern);
    return root;
  }

  function buildPagoda() {
    const root = new THREE.Group();
    root.position.set(3.75, .65, -1.1);
    for (let i = 0; i < 3; i++) {
      const y = .55 + i * .72;
      const width = 1.0 - i * .19;
      box(root, [width, .34, width], [0, y, 0], mats.shrine);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(width * .78, .32, 4), mats.roof);
      roof.position.set(0, y + .28, 0);
      roof.rotation.y = Math.PI / 4;
      root.add(roof);
    }
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(.035, .08, .82, 8), mats.lamp);
    finial.position.y = 2.95;
    root.add(finial);
    return root;
  }

  const island = buildIsland();
  const tower = buildTokyoTower();
  world.add(island, tower, buildFuji(), buildTorii(), buildPagoda());
  const cityPoint = new THREE.PointLight(0xffad73, 0, 8, 2);
  cityPoint.position.set(0, 1.9, .3);
  scene.add(cityPoint);

  function leafGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(0, .24);
    shape.bezierCurveTo(-.22, .31, -.26, .04, -.08, -.06);
    shape.bezierCurveTo(-.3, -.12, -.12, -.31, 0, -.17);
    shape.bezierCurveTo(.12, -.31, .3, -.12, .08, -.06);
    shape.bezierCurveTo(.26, .04, .22, .31, 0, .24);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  // Fixed object pool: leaf meshes are created once and recycled by reset().
  class ParticlePool {
    constructor(items) { this.items = items; }
    forEach(callback) { this.items.forEach(callback); }
    get size() { return this.items.length; }
  }

  class MapleLeafSystem {
    constructor(parent, count = 180) {
      this.root = new THREE.Group();
      parent.add(this.root);
      this.items = [];
      this.geometry = leafGeometry();
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(this.geometry, mats.leaf);
        mesh.material = i % 5 === 0 ? mats.tower : mats.leaf;
        const item = { mesh, phase: i * .47, speed: .46 + (i % 11) * .045, drift: .28 + (i % 5) * .04 };
        this.reset(item, true);
        this.root.add(mesh);
        this.items.push(item);
      }
      this.pool = new ParticlePool(this.items);
    }

    reset(item, initial = false) {
      item.mesh.position.set(-6.3 + Math.random() * 12.6, initial ? .72 + Math.random() * 5.9 : 6.3 + Math.random() * 1.2, -4.9 + Math.random() * 9.8);
      item.mesh.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      item.mesh.scale.setScalar(.65 + Math.random() * .65);
    }

    update(dt, elapsed) {
      this.pool.forEach(item => {
        const p = item.mesh.position;
        p.y -= item.speed * dt;
        p.x += (Math.sin(elapsed * 1.3 + item.phase) * item.drift + .12) * dt;
        p.z += Math.cos(elapsed * .8 + item.phase) * .07 * dt;
        item.mesh.rotation.x += dt * (1.6 + item.speed);
        item.mesh.rotation.y += dt * (1.1 + item.drift);
        item.mesh.rotation.z += Math.sin(elapsed + item.phase) * .4 * dt;
        if (p.y < .62 || p.x > 7) this.reset(item);
      });
    }
  }

  class DayNightCycle {
    constructor() { this.phase = .23; this.running = true; }

    sky(phase) {
      const stops = [[0, 0x292e58], [.12, 0xa8748f], [.23, 0x4e9eb8], [.42, 0xf58e83], [.57, 0x4c315b], [.75, 0x12152e], [.92, 0x211d43], [1, 0x292e58]];
      for (let i = 0; i < stops.length - 1; i++) {
        if (phase <= stops[i + 1][0]) {
          return new THREE.Color(stops[i][1]).lerp(new THREE.Color(stops[i + 1][1]), smoothstep(0, 1, (phase - stops[i][0]) / (stops[i + 1][0] - stops[i][0])));
        }
      }
      return new THREE.Color(stops[0][1]);
    }

    update(dt) {
      if (this.running) this.phase = (this.phase + dt / 15) % 1;
      const phase = this.phase;
      const sunHeight = Math.sin(phase * TAU);
      const daylight = clamp((sunHeight + .06) / 1.06);
      const night = 1 - daylight;
      const lightsIn = smoothstep(.4, .53, phase);
      const lightsOut = 1 - smoothstep(.84, .98, phase);
      const glow = clamp(lightsIn * lightsOut);
      const angle = phase * TAU;
      sun.position.set(Math.cos(angle) * 8, Math.max(.25, Math.sin(angle) * 9), Math.sin(angle) * 5);
      moon.position.set(-sun.position.x, Math.max(.3, -sun.position.y), -sun.position.z);
      sunOrb.position.copy(sun.position).multiplyScalar(1.22);
      moonOrb.position.copy(moon.position).multiplyScalar(1.22);
      sun.intensity = .32 + daylight * 1.7;
      moon.intensity = .08 + night * .34;
      hemi.intensity = .58 + daylight * .75;
      sunOrb.scale.setScalar(.8 + daylight * .28);
      scene.background.copy(this.sky(phase));
      scene.fog.color.copy(this.sky((phase + .03) % 1));
      scene.fog.density = .010 + night * .012;
      tower.userData.pointLight.intensity = glow * 1.45;
      cityPoint.intensity = glow * 1.1;
      [mats.neon, mats.lamp].forEach(material => { material.emissiveIntensity = glow * (material === mats.neon ? .62 : .85); });
      document.querySelector('#time-name').textContent = phase < .1 || phase > .9 ? 'DAWN' : phase < .42 ? 'DAYLIGHT' : phase < .59 ? 'GOLDEN HOUR' : 'NIGHT';
    }
  }

  const leaves = new MapleLeafSystem(world);
  const cycle = new DayNightCycle();
  const clock = new THREE.Clock();
  let elapsed = 0;

  document.querySelector('#cycle-toggle').addEventListener('click', () => {
    cycle.running = !cycle.running;
    document.querySelector('#cycle-toggle').textContent = cycle.running ? 'CYCLE · ON' : 'CYCLE · PAUSED';
  });
  window.addEventListener('keydown', event => {
    if (event.code === 'Space') {
      event.preventDefault();
      document.querySelector('#cycle-toggle').click();
    }
  });

  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05);
    elapsed += dt;
    world.position.y = Math.sin(elapsed * .72) * .1;
    leaves.update(dt, elapsed);
    tower.rotation.y = Math.sin(elapsed * .24) * .008;
    cycle.update(dt);
    controls.update(dt);
    renderer.render(scene, camera);
    if (loading) loading.style.opacity = '0';
  }
  animate();
})();
