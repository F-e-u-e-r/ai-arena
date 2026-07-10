/* London in the Clouds — native Three.js scene, no external assets. */
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
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };
  const color = (hex) => new THREE.Color(hex);

  const palette = [
    { name: 'SPRING', dot: '#a6d8bd', top: '#7897aa', grass: '#6f9b83', fog: '#b8d0cd', fogDensity: .046, leaf: '#f1a68f' },
    { name: 'SUMMER', dot: '#ffd27e', top: '#58b3cb', grass: '#66a774', fog: '#8cb9c2', fogDensity: .009, leaf: '#f1a68f' },
    { name: 'AUTUMN', dot: '#e68a62', top: '#8b6b76', grass: '#a97852', fog: '#ae9a96', fogDensity: .018, leaf: '#ed7853' },
    { name: 'WINTER', dot: '#b3d8ec', top: '#607b9d', grass: '#a4b8aa', fog: '#aab9c5', fogDensity: .032, leaf: '#e9b7a7' }
  ];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x56b8cf);
  scene.fog = new THREE.FogExp2(0x9db7bd, .014);

  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
  camera.position.set(10.8, 7.2, 12.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else renderer.outputEncoding = THREE.sRGBEncoding;
  stage.appendChild(renderer.domElement);

  class OrbitController {
    constructor(viewCamera, element) {
      this.camera = viewCamera;
      this.element = element;
      this.target = new THREE.Vector3(0, 1.7, 0);
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
        this.goalPolar = clamp(this.goalPolar + (event.clientY - this.lastY) * .006, .45, 1.45);
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

  const hemi = new THREE.HemisphereLight(0xbfe6eb, 0x34434d, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe1ac, 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -.0006;
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x8db8ff, .12);
  scene.add(moon);
  const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(.52, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd78a }));
  const moonOrb = new THREE.Mesh(new THREE.SphereGeometry(.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd5e5ff }));
  scene.add(sunOrb, moonOrb);

  const islandMats = {
    grass: new THREE.MeshToonMaterial({ color: 0x6f9b83 }),
    grassLight: new THREE.MeshToonMaterial({ color: 0x9aba80 }),
    rock: new THREE.MeshToonMaterial({ color: 0x72534d }),
    rockLight: new THREE.MeshToonMaterial({ color: 0x987066 }),
    water: new THREE.MeshToonMaterial({ color: 0x2d8da4, transparent: true, opacity: .9 }),
    path: new THREE.MeshToonMaterial({ color: 0xd4b77e }),
    dark: new THREE.MeshToonMaterial({ color: 0x293c49 }),
    moss: new THREE.MeshToonMaterial({ color: 0x4f786a })
  };

  const setShadow = (mesh, cast = true, receive = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    return mesh;
  };

  function makeBox(parent, size, position, material, rotation = [0, 0, 0]) {
    const mesh = setShadow(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }

  function makeCylinder(parent, radiusTop, radiusBottom, height, position, material, radial = 12) {
    const mesh = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial), material));
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }

  function addTree(parent, x, z, size = 1) {
    const tree = new THREE.Group();
    tree.position.set(x, .62, z);
    const trunk = makeCylinder(tree, .12 * size, .17 * size, 1.1 * size, [0, .55 * size, 0], islandMats.rockLight, 8);
    trunk.rotation.z = (x % 2 ? -.11 : .11);
    const crown = setShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(.66 * size, 1), islandMats.grass));
    crown.position.set(.08 * size, 1.15 * size, 0);
    crown.scale.set(1.15, .8, .9);
    tree.add(crown);
    const crown2 = setShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(.43 * size, 1), islandMats.grassLight));
    crown2.position.set(-.43 * size, 1.03 * size, .06);
    tree.add(crown2);
    parent.add(tree);
    return tree;
  }

  function buildIsland() {
    const island = new THREE.Group();
    const under = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(5.25, 3.05, 2.35, 32), islandMats.rock));
    under.position.y = -.72;
    island.add(under);
    const underCap = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(5.85, 5.35, .5, 32), islandMats.rockLight));
    underCap.position.y = -.02;
    island.add(underCap);
    const top = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(5.9, 5.9, .62, 40), islandMats.grass));
    top.position.y = .28;
    island.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.63, .13, 8, 64), islandMats.grassLight);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = .62;
    island.add(rim);

    const riverShape = new THREE.Shape();
    riverShape.moveTo(-5.4, -1.2);
    riverShape.bezierCurveTo(-2.4, -.28, -1.25, .65, .3, .2);
    riverShape.bezierCurveTo(1.7, -.28, 3.45, -.9, 5.45, -.15);
    riverShape.lineTo(5.45, .62);
    riverShape.bezierCurveTo(3.15, -.08, 1.55, .38, .2, .82);
    riverShape.bezierCurveTo(-1.45, 1.25, -3.05, .22, -5.4, -.4);
    riverShape.closePath();
    const river = setShadow(new THREE.Mesh(new THREE.ShapeGeometry(riverShape), islandMats.water), false, false);
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, .61, -.55);
    island.add(river);

    const path = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.38, 24), islandMats.path);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, .635, 0);
    island.add(path);
    makeBox(island, [3.6, .08, .42], [-1.5, .67, 2.25], islandMats.path, [0, -.16, 0]);
    makeBox(island, [.38, .09, 3.4], [-4.0, .68, .18], islandMats.path, [0, .16, 0]);

    const pebblePositions = [[-4.7, 1.3, .28], [4.55, 1.1, .35], [3.55, 3.1, .22], [-2.5, -3.55, .3], [1.2, -4.15, .25]];
    pebblePositions.forEach(([x, z, s]) => {
      const pebble = setShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), islandMats.moss));
      pebble.position.set(x, .73, z);
      pebble.scale.y = .35;
      island.add(pebble);
    });

    addTree(island, -4.35, -2.25, .78);
    addTree(island, 4.05, 2.72, .72);
    addTree(island, -2.15, 3.42, .52);

    const skyline = new THREE.Group();
    skyline.position.y = .66;
    [[-2.5, -1.65, .45, 1.35], [-1.8, -1.5, .34, .9], [3.65, .55, .5, 1.15], [3.05, .95, .3, .75]].forEach(([x, z, w, h], i) => {
      const building = makeBox(skyline, [w, h, w * .72], [x, h / 2, z], i % 2 ? islandMats.dark : islandMats.path);
      building.rotation.y = i * .2;
      for (let row = 0; row < Math.floor(h * 2); row++) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(.055, .09, .012), new THREE.MeshBasicMaterial({ color: 0xffd791, transparent: true, opacity: .78 }));
        window.position.set(x - w * .18 + (row % 2) * w * .34, .3 + row * .22, z - w * .37 - .008);
        skyline.add(window);
      }
    });
    island.add(skyline);
    return island;
  }

  function buildBigBen() {
    const group = new THREE.Group();
    group.position.set(0, .63, -.15);
    const stone = new THREE.MeshToonMaterial({ color: 0xe0bd82 });
    const stoneDark = new THREE.MeshToonMaterial({ color: 0x9e774f });
    const clock = new THREE.MeshStandardMaterial({ color: 0x254452, roughness: .55, metalness: .05, emissive: 0x071d2a, emissiveIntensity: 0 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf7d38b, metalness: .35, roughness: .35, emissive: 0x7d4b19, emissiveIntensity: 0 });
    const lampMaterials = [clock, gold];
    makeBox(group, [1.12, .35, 1.08], [0, .18, 0], stoneDark);
    makeBox(group, [.88, 3.55, .85], [0, 2.05, 0], stone);
    makeBox(group, [1.04, .14, 1.02], [0, 3.78, 0], stoneDark);
    makeBox(group, [.75, .67, .73], [0, 4.15, 0], stone);
    const roof = setShadow(new THREE.Mesh(new THREE.ConeGeometry(.62, .9, 4), stoneDark));
    roof.position.y = 4.92;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const spire = makeCylinder(group, .045, .08, .84, [0, 5.7, 0], gold, 8);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), gold);
    ball.position.y = 6.12;
    group.add(ball);

    const addClockFace = (z, rotateY = 0) => {
      const face = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .045, 32), clock);
      face.rotation.set(Math.PI / 2, rotateY, 0);
      face.position.set(0, 3.98, z);
      group.add(face);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.35, .045, 8, 24), gold);
      ring.rotation.set(Math.PI / 2, rotateY, 0);
      ring.position.set(0, 3.98, z + (z < 0 ? -.025 : .025));
      group.add(ring);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(.035, .21, .025), gold);
      hand.position.set(.03, 4.04, z + (z < 0 ? -.05 : .05));
      hand.rotation.z = -.72;
      group.add(hand);
      const hand2 = new THREE.Mesh(new THREE.BoxGeometry(.03, .15, .027), gold);
      hand2.position.set(-.05, 3.92, z + (z < 0 ? -.05 : .05));
      hand2.rotation.z = 1.3;
      group.add(hand2);
    };
    addClockFace(-.455);
    addClockFace(.455, Math.PI);
    for (let y = 1.5; y < 3.35; y += .42) {
      makeBox(group, [.12, .18, .028], [-.22, y, -.445], clock);
      makeBox(group, [.12, .18, .028], [.22, y, -.445], clock);
    }
    group.userData.lampMaterials = lampMaterials;
    return group;
  }

  function buildLondonEye() {
    const root = new THREE.Group();
    root.position.set(-3.55, .64, 1.85);
    const wheel = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0xc7e4dd, metalness: .55, roughness: .28, emissive: 0x274b50, emissiveIntensity: 0 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffc875, transparent: true, opacity: .2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, .055, 8, 48), frame);
    wheel.add(ring);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(.035, 2.42, .035), frame);
      spoke.position.y = 0;
      spoke.rotation.z = a;
      wheel.add(spoke);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(.16, .22, .13), glow);
      cabin.position.set(Math.cos(a) * 1.28, Math.sin(a) * 1.28, 0);
      cabin.rotation.z = -a;
      wheel.add(cabin);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .24, 16), frame);
    axle.rotation.x = Math.PI / 2;
    wheel.add(axle);
    wheel.position.y = 1.62;
    root.add(wheel);
    const legMat = new THREE.MeshToonMaterial({ color: 0x477a7b });
    const legL = makeBox(root, [.15, 1.48, .15], [-.55, .72, 0], legMat, [0, 0, -.25]);
    const legR = makeBox(root, [.15, 1.48, .15], [.55, .72, 0], legMat, [0, 0, .25]);
    makeBox(root, [1.45, .13, .2], [0, .13, 0], legMat);
    root.userData.wheel = wheel;
    root.userData.lampMaterials = [frame, glow];
    return root;
  }

  function buildTowerBridge() {
    const root = new THREE.Group();
    root.position.set(2.75, .64, -2.25);
    const blue = new THREE.MeshToonMaterial({ color: 0x3e718b });
    const blueDark = new THREE.MeshToonMaterial({ color: 0x24485d });
    const bridgeLight = new THREE.MeshStandardMaterial({ color: 0xf3c987, emissive: 0x6b421c, emissiveIntensity: 0 });
    for (const x of [-1.18, 1.18]) {
      makeBox(root, [.42, 1.65, .62], [x, .82, 0], blue);
      makeBox(root, [.58, .2, .8], [x, 1.58, 0], blueDark);
      makeBox(root, [.7, .16, .7], [x, 1.92, 0], blue);
      makeBox(root, [.18, .3, .74], [x - .12, 1.05, -.08], bridgeLight);
    }
    makeBox(root, [3.25, .17, .62], [0, .28, 0], blueDark);
    makeBox(root, [1.15, .09, .72], [0, .43, 0], bridgeLight);
    makeBox(root, [3.0, .11, .2], [0, 1.78, 0], blue);
    const cableMat = new THREE.LineBasicMaterial({ color: 0x80a9ac, transparent: true, opacity: .9 });
    const makeCable = (z) => {
      const points = [];
      for (let i = 0; i <= 16; i++) {
        const x = lerp(-1.14, 1.14, i / 16);
        const y = .68 + Math.pow(Math.abs(x) / 1.14, 1.7) * 1.04;
        points.push(new THREE.Vector3(x, y, z));
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), cableMat));
    };
    makeCable(-.36);
    makeCable(.36);
    root.userData.lampMaterials = [bridgeLight];
    return root;
  }

  const island = buildIsland();
  const bigBen = buildBigBen();
  const eye = buildLondonEye();
  const bridge = buildTowerBridge();
  world.add(island, bigBen, eye, bridge);

  const lampLights = [
    new THREE.PointLight(0xffb969, 0, 4.2, 2),
    new THREE.PointLight(0xffb969, 0, 3.4, 2),
    new THREE.PointLight(0xffb969, 0, 3.4, 2)
  ];
  lampLights[0].position.set(0, 4.2, -.7);
  lampLights[1].position.set(-3.55, 1.9, 1.7);
  lampLights[2].position.set(2.75, 1.6, -2.5);
  lampLights.forEach(light => scene.add(light));
  const lampMaterials = [...bigBen.userData.lampMaterials, ...eye.userData.lampMaterials, ...bridge.userData.lampMaterials];

  function makeLeafGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(0, .22);
    shape.bezierCurveTo(-.21, .28, -.26, .03, -.09, -.05);
    shape.bezierCurveTo(-.28, -.12, -.13, -.3, 0, -.17);
    shape.bezierCurveTo(.13, -.3, .28, -.12, .09, -.05);
    shape.bezierCurveTo(.26, .03, .21, .28, 0, .22);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  // Fixed particle pools keep every mesh alive for the whole session. A fallen
  // particle is reset in place instead of allocating a replacement.
  class ParticlePool {
    constructor(items) { this.items = items; }
    forEach(callback) { this.items.forEach(callback); }
    get size() { return this.items.length; }
  }

  class WeatherSystem {
    constructor(sceneRoot) {
      this.root = new THREE.Group();
      sceneRoot.add(this.root);
      this.current = 0;
      this.target = 0;
      this.transition = 1;
      this.leafMaterial = new THREE.MeshToonMaterial({ color: 0xed7853, side: THREE.DoubleSide, transparent: true, opacity: 0 });
      this.snowMaterial = new THREE.MeshToonMaterial({ color: 0xf5fbff, side: THREE.DoubleSide, transparent: true, opacity: 0 });
      this.leafGeometry = makeLeafGeometry();
      this.leaves = Array.from({ length: 145 }, (_, index) => {
        const mesh = new THREE.Mesh(this.leafGeometry, this.leafMaterial);
        const item = { mesh, x: 0, y: 0, z: 0, phase: index * .61, speed: .6 + (index % 7) * .08 };
        this.resetLeaf(item, true);
        this.root.add(mesh);
        return item;
      });
      this.snow = Array.from({ length: 175 }, (_, index) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(.045 + (index % 3) * .018, 6, 4), this.snowMaterial);
        const item = { mesh, x: 0, y: 0, z: 0, phase: index * .43, speed: .45 + (index % 9) * .04 };
        this.resetSnow(item, true);
        this.root.add(mesh);
        return item;
      });
      this.leafPool = new ParticlePool(this.leaves);
      this.snowPool = new ParticlePool(this.snow);
      this.mist = Array.from({ length: 5 }, (_, index) => {
        const material = new THREE.MeshBasicMaterial({ color: 0xd8e9e5, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.5), material);
        mesh.position.set(-5 + index * 2.5, 1.45 + (index % 2) * .65, -2.6 + (index % 3) * 2);
        mesh.rotation.y = index * .32;
        mesh.rotation.x = -.12;
        this.root.add(mesh);
        return { mesh, material, phase: index * 1.4 };
      });
    }

    resetLeaf(item, initial = false) {
      item.x = -6.4 + Math.random() * 12.8;
      item.y = initial ? .75 + Math.random() * 5.2 : 5.8 + Math.random() * 1.3;
      item.z = -4.8 + Math.random() * 9.6;
      item.mesh.position.set(item.x, item.y, item.z);
      item.mesh.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
    }

    resetSnow(item, initial = false) {
      item.x = -6.3 + Math.random() * 12.6;
      item.y = initial ? .8 + Math.random() * 5.6 : 6.2 + Math.random() * 1.4;
      item.z = -4.8 + Math.random() * 9.6;
      item.mesh.position.set(item.x, item.y, item.z);
    }

    setSeason(index) {
      if (index === this.target) return;
      this.current = this.target;
      this.target = index;
      this.transition = 0;
    }

    weights() {
      const p = smoothstep(0, 1, this.transition);
      const result = [0, 0, 0, 0];
      result[this.current] = 1 - p;
      result[this.target] += p;
      return result;
    }

    update(dt, elapsed) {
      if (this.transition < 1) this.transition = Math.min(1, this.transition + dt / 2.4);
      const weights = this.weights();
      const autumn = weights[2];
      const winter = weights[3];
      this.leafMaterial.opacity = autumn * .92;
      this.snowMaterial.opacity = winter * .84;
      this.mist.forEach(item => {
        item.material.opacity = weights[0] * (.06 + .025 * Math.sin(elapsed * .7 + item.phase));
        item.mesh.position.x += dt * (.12 + item.phase * .01);
        if (item.mesh.position.x > 7) item.mesh.position.x = -7;
      });
      this.leafPool.forEach(item => {
        item.y -= item.speed * dt;
        item.x += (Math.sin(elapsed * 1.25 + item.phase) * .34 + .1) * dt;
        item.mesh.position.set(item.x, item.y, item.z + Math.sin(elapsed + item.phase) * .18);
        item.mesh.rotation.x += dt * (1.7 + item.speed);
        item.mesh.rotation.y += dt * (1.1 + item.speed * .5);
        if (item.y < .62 || item.x > 7) this.resetLeaf(item);
      });
      this.snowPool.forEach(item => {
        item.y -= item.speed * dt;
        item.x += Math.sin(elapsed * .7 + item.phase) * .14 * dt;
        item.mesh.position.set(item.x, item.y, item.z);
        if (item.y < .58) this.resetSnow(item);
      });
      return weights;
    }
  }

  class DayNightCycle {
    constructor() { this.phase = .23; }

    sampleSky(phase) {
      const stops = [
        [0, 0x203952], [.12, 0x9a9eb6], [.23, 0x56b8cf], [.42, 0xf6b36d], [.56, 0x252d51], [.75, 0x07142e], [.92, 0x182b47], [1, 0x203952]
      ];
      for (let i = 0; i < stops.length - 1; i++) {
        if (phase <= stops[i + 1][0]) {
          const a = new THREE.Color(stops[i][1]);
          const b = new THREE.Color(stops[i + 1][1]);
          return a.lerp(b, smoothstep(0, 1, (phase - stops[i][0]) / (stops[i + 1][0] - stops[i][0])));
        }
      }
      return new THREE.Color(stops[0][1]);
    }

    update(dt) {
      this.phase = (this.phase + dt / 15) % 1;
      const phase = this.phase;
      const sunHeight = Math.sin(phase * TAU);
      const daylight = clamp((sunHeight + .06) / 1.06);
      const night = 1 - daylight;
      const lightIn = smoothstep(.41, .54, phase);
      const lightOut = 1 - smoothstep(.84, .98, phase);
      const lamp = clamp(lightIn * lightOut);
      const angle = phase * TAU;
      sun.position.set(Math.cos(angle) * 8, Math.max(.25, Math.sin(angle) * 9), Math.sin(angle) * 5);
      moon.position.set(-sun.position.x, Math.max(.3, -sun.position.y), -sun.position.z);
      sunOrb.position.copy(sun.position).multiplyScalar(1.22);
      moonOrb.position.copy(moon.position).multiplyScalar(1.22);
      sun.intensity = .35 + daylight * 1.72;
      moon.intensity = .08 + night * .35;
      hemi.intensity = .62 + daylight * .75;
      sunOrb.material.color.setHSL(.1, .72, .62 + daylight * .22);
      sunOrb.scale.setScalar(.8 + daylight * .3);
      moonOrb.material.opacity = .35 + night * .65;
      lampLights.forEach((light, index) => { light.intensity = lamp * [1.45, .85, .78][index]; });
      lampMaterials.forEach(material => { material.emissiveIntensity = lamp * (material === lampMaterials[0] ? .55 : .92); });
      scene.background.copy(this.sampleSky(phase));
      const timeName = phase < .1 || phase > .9 ? 'DAWN' : phase < .42 ? 'DAYLIGHT' : phase < .59 ? 'GOLDEN HOUR' : 'NIGHT';
      document.querySelector('#time-name').textContent = timeName;
      return { daylight, lamp };
    }
  }

  const weather = new WeatherSystem(world);
  const cycle = new DayNightCycle();
  let elapsed = 0;
  let seasonTimer = 0;
  let season = 0;
  let autoSeason = true;
  const clock = new THREE.Clock();

  function setSeason(index, manual = true) {
    season = (index + 4) % 4;
    weather.setSeason(season);
    document.querySelectorAll('.season-button').forEach(button => button.classList.toggle('active', Number(button.dataset.season) === season));
    document.querySelector('#season-name').textContent = palette[season].name;
    document.querySelector('#season-dot').style.backgroundColor = palette[season].dot;
    if (manual) { autoSeason = false; document.querySelector('#auto-toggle').textContent = 'AUTO · OFF'; }
  }

  document.querySelectorAll('.season-button').forEach(button => {
    button.addEventListener('click', () => setSeason(Number(button.dataset.season)));
  });
  document.querySelector('#auto-toggle').addEventListener('click', () => {
    autoSeason = !autoSeason;
    document.querySelector('#auto-toggle').textContent = autoSeason ? 'AUTO · ON' : 'AUTO · OFF';
    if (autoSeason) seasonTimer = 0;
  });
  window.addEventListener('keydown', event => {
    if (/^[1-4]$/.test(event.key)) setSeason(Number(event.key) - 1);
    if (event.key.toLowerCase() === 'a') document.querySelector('#auto-toggle').click();
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
    seasonTimer += dt;
    if (autoSeason && seasonTimer > 12) {
      seasonTimer = 0;
      setSeason(season + 1, false);
    }
    const weights = weather.update(dt, elapsed);
    const day = cycle.update(dt);
    const fogColor = new THREE.Color(0x92aeb0);
    const fogTarget = new THREE.Color();
    palette.forEach((item, index) => fogTarget.add(new THREE.Color(item.fog).multiplyScalar(weights[index])));
    scene.fog.color.copy(fogTarget);
    scene.fog.density = weights.reduce((sum, weight, index) => sum + weight * palette[index].fogDensity, 0) * (1 - day.daylight * .25);
    islandMats.grass.color.copy(new THREE.Color(0x6f9b83).lerp(new THREE.Color(0xb8c7bb), weights[3] * .4));
    world.position.y = Math.sin(elapsed * .72) * .105;
    eye.userData.wheel.rotation.z += dt * .18;
    bridge.rotation.y = Math.sin(elapsed * .28) * .012;
    controls.update(dt);
    renderer.render(scene, camera);
    if (loading) loading.style.opacity = '0';
  }
  animate();
})();
