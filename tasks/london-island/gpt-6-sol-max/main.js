/* Little London: all scenery is built from Three.js geometry; no image assets are loaded. */
(() => {
  'use strict';

  const T = window.THREE;
  if (!T) {
    document.getElementById('load-error').hidden = false;
    return;
  }

  const TAU = Math.PI * 2;
  const SEASON_LENGTH = 18; // seconds before the next season is selected
  const DAY_LENGTH = 15;    // seconds per complete daylight -> dusk -> night -> dawn loop
  const app = document.getElementById('app');
  const sceneHost = document.getElementById('scene');
  const seasonButtons = [...document.querySelectorAll('[data-season]')];
  const seasonTitle = document.getElementById('season-title');
  const seasonDescription = document.getElementById('season-description');
  const timeLabel = document.getElementById('time-label');
  const timeIndicator = document.getElementById('cycle-indicator');
  const timeToggle = document.getElementById('time-toggle');
  const timeToggleIcon = document.getElementById('time-toggle-icon');
  const debug = document.getElementById('debug');
  const fpsLabel = document.getElementById('fps');
  const particleLabel = document.getElementById('particles');

  const clamp = T.MathUtils.clamp;
  const lerp = T.MathUtils.lerp;
  const smoothstep = (a, b, v) => {
    const x = clamp((v - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  };
  const color = value => new T.Color(value);
  const rng = (() => { // seeded randomness keeps the illustration stable on refresh
    let seed = 82471;
    return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  })();
  const rand = (a, b) => a + (b - a) * rng();

  const boxGeometryCache = new Map();
  function boxGeometry(w, h, d) {
    const key = `${w}/${h}/${d}`;
    if (!boxGeometryCache.has(key)) boxGeometryCache.set(key, new T.BoxGeometry(w, h, d));
    return boxGeometryCache.get(key);
  }
  function toon(hex, extra = {}) { return new T.MeshToonMaterial({ color: hex, ...extra }); }
  function box(parent, w, h, d, material, x = 0, y = 0, z = 0, cast = true) {
    const mesh = new T.Mesh(boxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function sphere(parent, radius, material, x, y, z, detail = 9) {
    const mesh = new T.Mesh(new T.SphereGeometry(radius, detail, Math.max(6, detail - 2)), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cone(parent, radius, height, segments, material, x, y, z) {
    const mesh = new T.Mesh(new T.ConeGeometry(radius, height, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent, top, bottom, height, segments, material, x, y, z) {
    const mesh = new T.Mesh(new T.CylinderGeometry(top, bottom, height, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function rod(parent, start, end, radius, material, sides = 6) {
    const a = new T.Vector3(...start);
    const b = new T.Vector3(...end);
    const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, a.distanceTo(b), sides), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.sub(a).normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function tube(parent, points, radius, material, segments = 32) {
    const path = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    const mesh = new T.Mesh(new T.TubeGeometry(path, segments, radius, 5, false), material);
    parent.add(mesh);
    return mesh;
  }
  function ribbon(parent, points, width, material, y) {
    const vertices = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(points.length - 1, i + 2)];
      const dx = after[0] - before[0], dz = after[1] - before[1];
      const length = Math.hypot(dx, dz);
      const nx = dz / length * width / 2, nz = -dx / length * width / 2;
      const dx2 = (i + 2 < points.length ? points[i + 2][0] : b[0]) - a[0];
      const dz2 = (i + 2 < points.length ? points[i + 2][1] : b[1]) - a[1];
      const length2 = Math.hypot(dx2, dz2);
      const nx2 = dz2 / length2 * width / 2, nz2 = -dx2 / length2 * width / 2;
      vertices.push(
        a[0] + nx, y, a[1] + nz, a[0] - nx, y, a[1] - nz, b[0] + nx2, y, b[1] + nz2,
        a[0] - nx, y, a[1] - nz, b[0] - nx2, y, b[1] - nz2, b[0] + nx2, y, b[1] + nz2
      );
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new T.Mesh(geometry, material);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  const mats = {
    grass: new T.MeshToonMaterial({ color: '#92bb83', vertexColors: true, side: T.DoubleSide }),
    cliff: new T.MeshToonMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, side: T.DoubleSide }),
    stone: toon('#ead2a2'),
    stoneLight: toon('#f8e4bd'),
    stoneShade: toon('#caa978'),
    roof: toon('#57758e'),
    roofDark: toon('#38546f'),
    gold: toon('#deb476'),
    goldLight: toon('#f4d99c'),
    ink: toon('#3c5465'),
    road: toon('#627787', { side: T.DoubleSide }),
    roadMark: toon('#f5dfb1'),
    riverEdge: toon('#d4e9dd', { side: T.DoubleSide }),
    river: toon('#78c1ca', { side: T.DoubleSide }),
    foam: new T.MeshBasicMaterial({ color: '#ebffec', transparent: true, opacity: .78 }),
    bus: toon('#d65d52'),
    busShade: toon('#a94747'),
    wheel: toon('#293c4c'),
    window: new T.MeshStandardMaterial({ color: '#91b6bc', emissive: '#ffd184', emissiveIntensity: .03, roughness: .55 }),
    clockFace: new T.MeshStandardMaterial({ color: '#fff1cc', emissive: '#ffd78b', emissiveIntensity: .05, roughness: .7 }),
    lamp: new T.MeshStandardMaterial({ color: '#ffe3a0', emissive: '#ffc466', emissiveIntensity: .18, roughness: .4 }),
    shadow: new T.MeshBasicMaterial({ color: '#4b696d', transparent: true, opacity: .18, depthWrite: false }),
    trunk: toon('#8c766b'),
    flowerPink: toon('#f4a9b4'),
    flowerCream: toon('#ffe4ad'),
    flowerBlue: toon('#b5cde3')
  };

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    document.getElementById('load-error').textContent = 'This browser could not start WebGL.';
    document.getElementById('load-error').hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  sceneHost.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2('#d8dce2', .017);
  const camera = new T.OrthographicCamera(-8, 8, 5, -5, .1, 100);
  scene.add(camera); // the sky orbs are camera-relative and remain behind the diorama
  const hemi = new T.HemisphereLight('#fff6db', '#819bb1', 1.65);
  scene.add(hemi);
  const sunlight = new T.DirectionalLight('#fff2cd', 2.1);
  sunlight.position.set(-5, 10, 6);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -8;
  sunlight.shadow.camera.right = 8;
  sunlight.shadow.camera.top = 8;
  sunlight.shadow.camera.bottom = -8;
  sunlight.shadow.camera.near = .5;
  sunlight.shadow.camera.far = 28;
  sunlight.shadow.bias = -.0005;
  sunlight.shadow.normalBias = .035;
  scene.add(sunlight);

  function makeIslandGeometry() {
    const positions = [], colors = [];
    const N = 20;
    const wobble = [1.02, .99, 1.03, .97, 1.04, .98, 1.01, .99, 1.04, .96,
      1.02, .98, 1.03, .98, 1.02, .97, 1.04, .99, 1.02, .98];
    const rings = [
      { y: .055, radius: 1 },
      { y: -.23, radius: 1.025 },
      { y: -.83, radius: .89 },
      { y: -1.53, radius: .54 },
      { y: -2.18, radius: .22 }
    ];
    const point = (ring, i) => {
      const angle = TAU * (i % N) / N;
      const r = ring.radius * wobble[i % N];
      return [Math.cos(angle) * 5.15 * r, ring.y, Math.sin(angle) * 3.42 * r];
    };
    function triangle(a, b, c, hex) {
      const col = color(hex);
      positions.push(...a, ...b, ...c);
      for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
    }
    for (let i = 0; i < N; i++) {
      triangle([0, .057, 0], point(rings[0], i + 1), point(rings[0], i), i % 3 ? '#ffffff' : '#ebf9e7');
    }
    const grassEnd = positions.length;
    const cliffPalette = [
      ['#849965', '#9eaa72', '#b3a174', '#8f826d'],
      ['#f0c996', '#deb581', '#cba57f', '#be9e82'],
      ['#c79a7a', '#af8d7c', '#a78983', '#927f7b'],
      ['#967b78', '#8d7880', '#786d79', '#a38a7a']
    ];
    for (let band = 0; band < rings.length - 1; band++) {
      for (let i = 0; i < N; i++) {
        const a = point(rings[band], i), b = point(rings[band], i + 1);
        const c = point(rings[band + 1], i), d = point(rings[band + 1], i + 1);
        const shade = cliffPalette[band][(i * 3 + band) % 4];
        triangle(a, c, b, shade);
        triangle(b, c, d, cliffPalette[band][(i * 3 + band + 1) % 4]);
      }
    }
    for (let i = 0; i < N; i++) {
      triangle(point(rings[rings.length - 1], i), [0, -2.57, 0], point(rings[rings.length - 1], i + 1), '#786c77');
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.addGroup(0, grassEnd / 3, 0);
    geometry.addGroup(grassEnd / 3, (positions.length - grassEnd) / 3, 1);
    geometry.computeVertexNormals();
    return geometry;
  }

  class Island {
    constructor() {
      this.group = new T.Group();
      scene.add(this.group);
      const earth = new T.Mesh(makeIslandGeometry(), [mats.grass, mats.cliff]);
      earth.receiveShadow = true;
      earth.castShadow = true;
      this.group.add(earth);
      this.createRiver();
      this.createRoad();
      this.createGardens();
      this.createHouses();
      this.createBus();
    }

    createRiver() {
      const points = [];
      for (let i = 0; i <= 28; i++) {
        const z = -3.2 + i * 6.4 / 28;
        points.push([1.8 + .20 * Math.sin(z * 1.15), z]);
      }
      ribbon(this.group, points, 1.14, mats.riverEdge, .074);
      ribbon(this.group, points, .94, mats.river, .081);
      for (let side of [-1, 1]) {
        tube(this.group, points.filter((_, i) => i % 2 === 0).map(p => [p[0] + side * .51, .092, p[1]]), .012, mats.foam, 36);
      }
      for (let i = 0; i < 8; i++) {
        const z = -2.7 + i * .72;
        const x = 1.8 + .20 * Math.sin(z * 1.15);
        tube(this.group, [[x - .25, .099, z], [x, .099, z + .06], [x + .25, .099, z]], .013, mats.foam, 8);
      }
      const fall = box(this.group, .84, .85, .025, mats.river, 1.69, -.38, 3.19, false);
      fall.material = mats.river;
      for (let i = 0; i < 4; i++) box(this.group, .018, .59, .03, mats.foam, 1.4 + i * .18, -.31, 3.215, false);
    }

    createRoad() {
      const path = [];
      for (let i = 0; i <= 20; i++) {
        const x = -4.35 + i * 4.75 / 20;
        path.push([x, 1.48 + .11 * Math.sin((x + 3.1) * 1.25)]);
      }
      // Ribbon runs from left to right; it shares the same reusable surface builder as the river.
      ribbon(this.group, path, .64, mats.road, .083);
      for (let i = 0; i < 9; i++) {
        const x = -4.05 + i * .49;
        box(this.group, .21, .01, .025, mats.roadMark, x, .096, 1.48 + .11 * Math.sin((x + 3.1) * 1.25), false);
      }
    }

    createGardens() {
      const trees = [
        [-4.28, -.78, .91, 0], [-3.85, -1.85, .82, 1], [-2.45, -2.58, .81, 2],
        [-3.76, 2.02, .7, 1], [-1.32, 2.7, .73, 0], [.30, 2.52, .72, 2],
        [.55, -2.58, .78, 1], [2.71, -2.31, .75, 2], [4.03, -1.27, .82, 0],
        [4.22, 1.35, .73, 1], [3.47, 2.15, .62, 2]
      ];
      this.treeCanopies = [];
      this.snowCaps = [];
      trees.forEach(([x, z, size, variant]) => {
        const tree = new T.Group();
        tree.position.set(x, .07, z);
        this.group.add(tree);
        cylinder(tree, .055 * size, .077 * size, .61 * size, 6, mats.trunk, 0, .3 * size, 0);
        const foliageMat = toon('#91b781', { flatShading: true });
        const crownGeo = new T.DodecahedronGeometry(.38 * size, 0);
        const crown = new T.Mesh(crownGeo, foliageMat);
        crown.position.set(0, .76 * size, 0);
        crown.castShadow = true;
        tree.add(crown);
        this.treeCanopies.push({ material: foliageMat, variant });
        const side = new T.Mesh(new T.DodecahedronGeometry(.25 * size, 0), foliageMat);
        side.position.set(.24 * size, .68 * size, -.05 * size);
        side.castShadow = true;
        tree.add(side);
        const snowMat = new T.MeshBasicMaterial({ color: '#f5f8f2', transparent: true, opacity: 0, depthWrite: false });
        const cap = new T.Mesh(new T.SphereGeometry(.30 * size, 7, 5), snowMat);
        cap.scale.set(1.15, .35, 1.05);
        cap.position.set(0, 1.02 * size, 0);
        tree.add(cap);
        this.snowCaps.push(snowMat);
      });

      // Tiny flowers and grass tufts give the top of the island a hand-built texture.
      const flowers = [mats.flowerPink, mats.flowerCream, mats.flowerBlue];
      for (let i = 0; i < 82; i++) {
        const x = rand(-4.6, 4.6), z = rand(-2.95, 2.95);
        const onIsland = x * x / 25 + z * z / 11.7 < .85;
        const nearRiver = Math.abs(x - (1.8 + .2 * Math.sin(z * 1.15))) < .73;
        const nearRoad = x < .5 && Math.abs(z - (1.48 + .11 * Math.sin((x + 3.1) * 1.25))) < .45;
        if (!onIsland || nearRiver || nearRoad) continue;
        const stem = cylinder(this.group, .014, .016, .12, 4, mats.trunk, x, .12, z);
        stem.castShadow = false;
        const petal = sphere(this.group, rand(.045, .065), flowers[i % 3], x, .195, z, 5);
        petal.castShadow = false;
      }
    }

    createHouses() {
      const houses = [
        [-2.16, -1.98, '#e4b8a1', .66, .66], [-1.46, -2.20, '#eddcba', .58, .55],
        [.48, -2.10, '#accbd0', .57, .60], [-4.21, .17, '#e8c6b4', .57, .58],
        [-2.66, 2.13, '#c8d7c1', .60, .52], [-.35, 2.62, '#e2c19f', .56, .55],
        [3.78, -2.03, '#d9c7b8', .54, .58], [4.35, .23, '#b7cbd0', .56, .58]
      ];
      this.roofSnow = [];
      houses.forEach(([x, z, shade, w, h], index) => {
        const house = new T.Group();
        house.position.set(x, .075, z);
        this.group.add(house);
        const bodyMat = toon(shade);
        box(house, w, h, .56, bodyMat, 0, h / 2, 0);
        const roof = cone(house, w * .76, .36, 4, index % 3 === 0 ? mats.roofDark : mats.roof, 0, h + .17, 0);
        roof.rotation.y = Math.PI / 4;
        const snowMat = new T.MeshBasicMaterial({ color: '#f5f7ef', transparent: true, opacity: 0, depthWrite: false });
        const snow = cone(house, w * .79, .13, 4, snowMat, 0, h + .34, 0);
        snow.rotation.y = Math.PI / 4;
        this.roofSnow.push(snowMat);
        box(house, .12, .28, .016, mats.ink, 0, .14, .291, false);
        for (const wx of [-w * .26, w * .26]) {
          box(house, .12, .16, .019, mats.window, wx, h * .58, .294, false);
          box(house, .015, .17, .022, mats.stoneLight, wx, h * .58, .31, false);
        }
        box(house, .10, .20, .10, mats.stoneShade, w * .23, h + .33, -.09);
      });
    }

    createBus() {
      const bus = new T.Group();
      bus.position.set(-2.73, .115, 1.52);
      this.group.add(bus);
      box(bus, .88, .34, .34, mats.bus, 0, .29, 0);
      box(bus, .75, .25, .33, mats.bus, -.035, .58, 0);
      box(bus, .78, .045, .38, mats.busShade, -.025, .72, 0);
      for (const z of [-.176, .176]) {
        for (let i = 0; i < 4; i++) box(bus, .13, .12, .012, mats.window, -.30 + i * .18, .58, z, false);
      }
      box(bus, .16, .15, .015, mats.window, .449, .39, .03, false);
      for (const x of [-.27, .27]) {
        const wheel1 = cylinder(bus, .09, .09, .035, 9, mats.wheel, x, .13, .19);
        wheel1.rotation.x = Math.PI / 2;
        const wheel2 = cylinder(bus, .09, .09, .035, 9, mats.wheel, x, .13, -.19);
        wheel2.rotation.x = Math.PI / 2;
      }
    }

    update(time) { this.group.position.y = Math.sin(time * .78) * .11; }
  }

  class BigBen {
    constructor(parent) {
      this.group = new T.Group();
      this.group.position.set(-.57, .07, -.75);
      parent.add(this.group);
      this.hands = [];
      this.build();
      this.light = new T.PointLight('#ffd693', 0, 5, 2);
      this.light.position.set(0, 3.04, .72);
      this.group.add(this.light);
    }

    clockFace(x, z, rotation) {
      const face = new T.Group();
      face.position.set(x, 3.03, z);
      face.rotation.y = rotation;
      this.group.add(face);
      const disc = new T.Mesh(new T.CircleGeometry(.40, 32), mats.clockFace);
      face.add(disc);
      const ring = new T.Mesh(new T.TorusGeometry(.41, .035, 6, 32), mats.gold);
      ring.position.z = .025;
      face.add(ring);
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12;
        const tick = box(face, i % 3 === 0 ? .025 : .016, i % 3 === 0 ? .085 : .055, .012,
          mats.ink, Math.sin(a) * .322, Math.cos(a) * .322, .034, false);
        tick.rotation.z = -a;
      }
      const hour = new T.Group(), minute = new T.Group();
      face.add(hour, minute);
      box(hour, .039, .20, .016, mats.ink, 0, .095, .045, false);
      box(minute, .025, .29, .018, mats.ink, 0, .135, .052, false);
      sphere(face, .041, mats.gold, 0, 0, .075, 7);
      this.hands.push({ hour, minute });
    }

    build() {
      const g = this.group;
      box(g, 1.16, .24, 1.16, mats.stoneShade, 0, .12, 0);
      box(g, .91, 2.62, .91, mats.stone, 0, 1.54, 0);
      for (const x of [-.43, .43]) for (const z of [-.43, .43]) {
        box(g, .11, 2.74, .11, mats.stoneLight, x, 1.60, z);
      }
      for (const y of [.47, 1.24, 2.0, 2.78]) box(g, 1.03, .10, 1.03, mats.stoneShade, 0, y, 0);
      box(g, .19, .47, .025, mats.ink, 0, .45, .47, false);
      cone(g, .13, .13, 3, mats.stoneShade, 0, .71, .49);
      for (const y of [1.12, 1.83, 2.35]) {
        for (const x of [-.20, .20]) {
          box(g, .105, .33, .02, mats.ink, x, y, .469, false);
          box(g, .02, .33, .105, mats.ink, .469, y, x, false);
          box(g, .14, .05, .045, mats.stoneLight, x, y + .19, .48, false);
        }
      }
      box(g, 1.15, .83, 1.15, mats.stoneLight, 0, 3.02, 0);
      for (const y of [2.60, 3.47]) box(g, 1.25, .11, 1.25, mats.gold, 0, y, 0);
      this.clockFace(0, .585, 0);
      this.clockFace(.585, 0, Math.PI / 2);
      box(g, .91, .41, .91, mats.stone, 0, 3.72, 0);
      for (const x of [-.39, .39]) for (const z of [-.39, .39]) {
        cylinder(g, .058, .07, .55, 6, mats.stoneLight, x, 3.79, z);
      }
      box(g, 1.07, .10, 1.07, mats.gold, 0, 3.98, 0);
      cone(g, .63, .82, 4, mats.roofDark, 0, 4.42, 0).rotation.y = Math.PI / 4;
      cylinder(g, .035, .035, .28, 6, mats.gold, 0, 4.92, 0);
      sphere(g, .09, mats.goldLight, 0, 5.07, 0, 8);
    }

    update(time, lightPower) {
      const minuteAngle = -time * .23 - .43;
      for (const pair of this.hands) {
        pair.minute.rotation.z = minuteAngle;
        pair.hour.rotation.z = minuteAngle / 12 - .95;
      }
      this.light.intensity = lightPower * 1.25;
    }
  }

  class LondonEye {
    constructor(parent) {
      this.group = new T.Group();
      this.group.position.set(-3.03, .07, -.78);
      this.group.rotation.y = .36;
      parent.add(this.group);
      this.pods = [];
      this.build();
      this.light = new T.PointLight('#f6d1a0', 0, 4.5, 2);
      this.light.position.set(0, 2.14, .30);
      this.group.add(this.light);
    }

    build() {
      const g = this.group;
      const wheel = new T.Group();
      wheel.position.y = 2.08;
      g.add(wheel);
      this.wheel = wheel;
      const ring = new T.Mesh(new T.TorusGeometry(1.26, .054, 7, 64), mats.stoneLight);
      ring.castShadow = true;
      wheel.add(ring);
      const inner = new T.Mesh(new T.TorusGeometry(1.15, .018, 5, 64), mats.gold);
      wheel.add(inner);
      for (let i = 0; i < 12; i++) {
        const a = TAU * i / 12;
        rod(wheel, [0, 0, 0], [Math.cos(a) * 1.21, Math.sin(a) * 1.21, 0], .018, mats.stoneShade, 5);
        const pod = new T.Group();
        pod.position.set(Math.cos(a) * 1.28, Math.sin(a) * 1.28, 0);
        wheel.add(pod);
        rod(pod, [0, .06, 0], [0, -.07, 0], .018, mats.gold, 5);
        box(pod, .23, .22, .20, i % 3 === 0 ? mats.bus : mats.stoneLight, 0, -.17, 0);
        box(pod, .16, .08, .013, mats.window, 0, -.15, .105, false);
        box(pod, .25, .035, .22, mats.gold, 0, -.055, 0);
        this.pods.push(pod);
      }
      for (let i = 0; i < 24; i++) {
        const a = TAU * i / 24;
        sphere(wheel, .043, mats.lamp, Math.cos(a) * 1.26, Math.sin(a) * 1.26, .035, 6);
      }
      const hub = cylinder(wheel, .16, .16, .18, 16, mats.gold, 0, 0, .06);
      hub.rotation.x = Math.PI / 2;
      sphere(wheel, .10, mats.stoneLight, 0, 0, .18, 8);
      for (const x of [-.75, .75]) {
        rod(g, [x, .13, 0], [0, 2.08, -.07], .073, mats.stoneLight);
        box(g, .33, .10, .36, mats.stoneShade, x, .12, 0);
      }
      box(g, 1.6, .10, .49, mats.stoneLight, 0, .08, 0);
    }

    update(time, lightPower) {
      this.wheel.rotation.z = -time * .12;
      // Each cabin counter-rotates so it keeps hanging upright as the wheel turns.
      for (const pod of this.pods) pod.rotation.z = -this.wheel.rotation.z;
      this.light.intensity = lightPower * .75;
    }
  }

  class TowerBridge {
    constructor(parent) {
      this.group = new T.Group();
      this.group.position.z = .24;
      parent.add(this.group);
      this.build();
      this.light = new T.PointLight('#ffd79e', 0, 4.5, 2);
      this.light.position.set(2.28, 1.92, .35);
      this.group.add(this.light);
    }

    tower(x) {
      const g = this.group;
      box(g, .83, .24, .88, mats.stoneShade, x, .22, 0);
      box(g, .66, 1.66, .66, mats.stone, x, 1.10, 0);
      for (const dx of [-.3, .3]) for (const dz of [-.3, .3]) {
        box(g, .095, 1.76, .095, mats.stoneLight, x + dx, 1.12, dz);
      }
      for (const y of [.41, 1.48, 1.89]) box(g, .78, .09, .78, mats.stoneShade, x, y, 0);
      box(g, .17, .47, .025, mats.ink, x, .87, .346, false);
      cone(g, .13, .13, 3, mats.stoneShade, x, 1.16, .35);
      box(g, .13, .24, .025, mats.window, x, 1.68, .346, false);
      box(g, .74, .22, .74, mats.stoneLight, x, 2.01, 0);
      const roof = cone(g, .55, .58, 4, mats.roofDark, x, 2.40, 0);
      roof.rotation.y = Math.PI / 4;
      cylinder(g, .024, .024, .18, 6, mats.gold, x, 2.77, 0);
      sphere(g, .06, mats.lamp, x, 2.89, 0, 7);
      for (const dx of [-.32, .32]) for (const dz of [-.32, .32]) {
        cylinder(g, .055, .055, .28, 6, mats.stoneLight, x + dx, 2.07, dz);
        cone(g, .09, .24, 4, mats.roofDark, x + dx, 2.34, dz).rotation.y = Math.PI / 4;
      }
    }

    build() {
      const g = this.group;
      const x1 = 1.03, x2 = 3.51;
      box(g, 3.58, .23, .80, mats.roofDark, 2.27, .65, 0);
      box(g, 3.58, .06, .73, mats.stoneLight, 2.27, .80, 0);
      for (const z of [-.42, .42]) {
        box(g, 3.60, .055, .055, mats.stoneLight, 2.27, .96, z);
        for (let i = 0; i < 17; i++) {
          const x = .50 + i * 3.54 / 16;
          rod(g, [x, .85, z], [x, .98, z], .015, mats.gold, 5);
        }
      }
      this.tower(x1);
      this.tower(x2);
      box(g, 2.45, .27, .46, mats.roofDark, 2.27, 1.98, 0);
      box(g, 2.58, .065, .51, mats.gold, 2.27, 2.15, 0);
      box(g, 2.58, .06, .51, mats.stoneLight, 2.27, 1.81, 0);
      for (let i = 0; i < 7; i++) box(g, .20, .12, .023, mats.window, 1.32 + i * .31, 1.98, .246, false);
      for (const z of [-.49, .49]) {
        const points = [];
        for (let i = 0; i <= 18; i++) {
          const f = i / 18;
          points.push([lerp(x1, x2, f), .98 + .47 * Math.pow(2 * f - 1, 2), z]);
        }
        tube(g, points, .026, mats.gold, 40);
        for (let i = 1; i < 12; i++) {
          const f = i / 12, x = lerp(x1, x2, f);
          rod(g, [x, .98, z], [x, .98 + .47 * Math.pow(2 * f - 1, 2), z], .012, mats.stoneLight, 5);
        }
      }
      for (const x of [.61, 3.95]) for (const z of [-.34, .34]) {
        rod(g, [x, .90, z], [x, 1.24, z], .024, mats.roofDark);
        sphere(g, .06, mats.lamp, x, 1.29, z, 7);
      }
    }

    update(lightPower) { this.light.intensity = lightPower * .85; }
  }

  const seasonData = [
    { name: 'Spring', description: 'A little morning mist', sky: ['#9bbbd9', '#e8c4d7', '#ffe8c2'], ground: '#9cbd89', water: '#82c3c7' },
    { name: 'Summer', description: 'Sunshine on the Thames', sky: ['#70b9d9', '#b5dcd7', '#ffe9a8'], ground: '#86bc72', water: '#69c4cf' },
    { name: 'Autumn', description: 'Leaves on the breeze', sky: ['#8fa7c3', '#e7b69f', '#f8d4a9'], ground: '#b5aa70', water: '#76b8bf' },
    { name: 'Winter', description: 'Snow over the rooftops', sky: ['#9fb7ce', '#c8d7e2', '#eff0e9'], ground: '#bcd3cf', water: '#8bbbc6' }
  ];
  const groundColors = seasonData.map(s => color(s.ground));
  const waterColors = seasonData.map(s => color(s.water));
  const daySkyColors = [0, 1, 2].map(i => seasonData.map(s => color(s.sky[i])));
  const treeColors = [
    ['#edacb5', '#6dab75', '#d88a59', '#c8d7d3'],
    ['#b9d3a2', '#86ba78', '#e4ad59', '#b6ccc9'],
    ['#d6bdcb', '#73a981', '#bd7658', '#d4ded8']
  ].map(row => row.map(color));
  const weighted = (out, colors, weights) => {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 4; i++) {
      r += colors[i].r * weights[i];
      g += colors[i].g * weights[i];
      b += colors[i].b * weights[i];
    }
    return out.setRGB(r, g, b);
  };

  class SeasonSystem {
    constructor(island) {
      this.island = island;
      this.index = 0;
      this.elapsed = 0;
      this.weights = [1, 0, 0, 0];
      this.refreshUI();
    }

    choose(index) {
      this.index = index;
      this.elapsed = 0;
      this.refreshUI();
    }

    refreshUI() {
      seasonTitle.textContent = seasonData[this.index].name;
      seasonDescription.textContent = seasonData[this.index].description;
      seasonButtons.forEach((button, i) => {
        const selected = i === this.index;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    update(dt) {
      this.elapsed += dt;
      if (this.elapsed >= SEASON_LENGTH) {
        this.elapsed -= SEASON_LENGTH;
        this.index = (this.index + 1) % 4;
        this.refreshUI();
      }
      // The four weights approach the new target with the same time constant.
      // Their sum remains one, so colors, fog, foliage, and particle opacity crossfade together.
      const ease = 1 - Math.exp(-dt / 2.25);
      for (let i = 0; i < 4; i++) this.weights[i] += ((i === this.index ? 1 : 0) - this.weights[i]) * ease;
      weighted(mats.grass.color, groundColors, this.weights);
      weighted(mats.river.color, waterColors, this.weights);
      for (const tree of this.island.treeCanopies) weighted(tree.material.color, treeColors[tree.variant], this.weights);
      for (const cap of this.island.snowCaps) cap.opacity = this.weights[3] * .90;
      for (const roof of this.island.roofSnow) roof.opacity = this.weights[3] * .94;
    }
  }

  function radialTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,.8)');
    gradient.addColorStop(.35, 'rgba(255,255,255,.40)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new T.CanvasTexture(canvas);
    texture.encoding = T.sRGBEncoding;
    return texture;
  }
  const glowTexture = radialTexture();

  class Clouds {
    constructor() {
      this.clouds = [];
      this.dayTint = color('#fff7ea');
      this.nightTint = color('#8d9bbc');
      const specs = [
        [-6.45, 2.56, -4.15, .79], [5.75, 2.45, -4.65, .66],
        [-5.60, -.95, -3.95, .94], [5.58, -.70, -3.80, .78],
        [-4.85, -1.80, 2.65, .74], [3.65, -2.17, 3.55, .65],
        [.03, -3.14, -2.50, .98]
      ];
      specs.forEach(([x, y, z, size], i) => {
        const group = new T.Group();
        group.position.set(x, y, z);
        scene.add(group);
        const material = new T.MeshBasicMaterial({ color: '#fff6e9', transparent: true, opacity: .66, depthWrite: false });
        const puffs = [[-.75, 0, .55], [-.24, .27, .71], [.29, .20, .82], [.83, -.03, .53], [.05, -.12, .69]];
        puffs.forEach(([dx, dy, radius], j) => {
          const puff = sphere(group, radius * size, material, dx * size, dy * size, j * .018, 9);
          puff.scale.set(1.25, .67, .72);
          puff.castShadow = false;
        });
        this.clouds.push({ group, material, x, y, drift: i * .81 });
      });
    }

    update(time, nightPower) {
      for (const cloud of this.clouds) {
        cloud.group.position.x = cloud.x + Math.sin(time * .18 + cloud.drift) * .28;
        cloud.group.position.y = cloud.y + Math.sin(time * .29 + cloud.drift) * .07;
        cloud.material.color.copy(this.dayTint).lerp(this.nightTint, nightPower * .55);
        cloud.material.opacity = .67 - nightPower * .16;
      }
    }
  }

  function leafGeometry() {
    const outline = [
      [0, .82], [.17, .41], [.49, .59], [.43, .25], [.75, .18], [.47, -.03],
      [.58, -.36], [.21, -.28], [0, -.82], [-.21, -.28], [-.58, -.36],
      [-.47, -.03], [-.75, .18], [-.43, .25], [-.49, .59], [-.17, .41]
    ];
    const shape = new T.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
    shape.closePath();
    return new T.ShapeGeometry(shape);
  }

  class WeatherSystem {
    constructor(island) {
      this.dummy = new T.Object3D();
      this.leaves = Array.from({ length: 150 }, (_, i) => this.makeParticle(i, false));
      this.snow = Array.from({ length: 260 }, (_, i) => this.makeParticle(i, true));
      this.leafMaterial = new T.MeshBasicMaterial({ color: '#ffffff', side: T.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
      this.snowMaterial = new T.MeshBasicMaterial({ color: '#f8ffff', transparent: true, opacity: 0, depthWrite: false });
      this.leafMesh = new T.InstancedMesh(leafGeometry(), this.leafMaterial, this.leaves.length);
      this.snowMesh = new T.InstancedMesh(new T.SphereGeometry(.047, 5, 4), this.snowMaterial, this.snow.length);
      this.leafMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.snowMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.leafMesh.frustumCulled = this.snowMesh.frustumCulled = false;
      const leafShades = ['#b95447', '#d67845', '#e8a84a', '#e6bf6e', '#a76a56'];
      for (let i = 0; i < this.leaves.length; i++) this.leafMesh.setColorAt(i, color(leafShades[i % leafShades.length]));
      this.leafMesh.instanceColor.needsUpdate = true;
      scene.add(this.leafMesh, this.snowMesh);
      this.leafMesh.visible = this.snowMesh.visible = false;
      this.haze = [];
      const hazePlaces = [[-3.25, .55, -.45, 3.4], [-1.2, .48, 1.9, 3.8], [1.25, .53, -1.85, 3.4], [3.1, .51, .85, 3.2], [0, .75, 1.0, 4.1], [-4.1, .42, 1.2, 2.9]];
      hazePlaces.forEach(([x, y, z, scale], i) => {
        const material = new T.SpriteMaterial({ map: glowTexture, color: '#fff6f3', transparent: true, opacity: 0, depthWrite: false });
        const sprite = new T.Sprite(material);
        sprite.position.set(x, y, z);
        sprite.scale.set(scale, scale * .64, 1);
        island.group.add(sprite);
        this.haze.push({ sprite, material, x, drift: i * 1.3 });
      });
    }

    makeParticle(index, snow) {
      return {
        x: rand(-5.7, 5.7), y: rand(-1.7, 7), z: rand(-3.9, 3.9),
        speed: snow ? rand(.88, 1.7) : rand(.64, 1.36),
        size: snow ? rand(.66, 1.45) : rand(.11, .19),
        swing: rand(.08, .35), phase: rand(0, TAU), spin: rand(-2.5, 2.5),
        seed: index * .43 + rand(0, 1)
      };
    }

    updatePool(mesh, pool, dt, time, snow) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        // Wrap at the bottom instead of creating or removing meshes. Lateral motion is
        // deterministic per particle, so snow drifts gently while leaves flutter and spin.
        p.y -= p.speed * dt;
        p.x += (snow ? .11 : .23) * dt;
        if (p.y < -2.15) {
          p.y = rand(5.15, 7.1);
          p.x = rand(-5.7, 5.7);
          p.z = rand(-3.9, 3.9);
        }
        if (p.x > 5.9) p.x = -5.9;
        const sway = Math.sin(time * (snow ? 1.25 : 2.1) + p.phase + p.seed) * p.swing;
        this.dummy.position.set(p.x + sway, p.y, p.z);
        if (snow) {
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.setScalar(p.size);
        } else {
          this.dummy.rotation.set(time * p.spin + p.phase, time * (p.spin * .62) + p.phase, time * 1.8 + p.phase);
          this.dummy.scale.setScalar(p.size);
        }
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    update(dt, time, weights, nightPower) {
      const leafPower = weights[2], snowPower = weights[3];
      this.leafMesh.visible = leafPower > .012;
      this.snowMesh.visible = snowPower > .012;
      this.leafMaterial.opacity = leafPower * .96;
      this.snowMaterial.opacity = snowPower * (.82 + nightPower * .17);
      if (this.leafMesh.visible) this.updatePool(this.leafMesh, this.leaves, dt, time, false);
      if (this.snowMesh.visible) this.updatePool(this.snowMesh, this.snow, dt, time, true);
      this.haze.forEach(h => {
        h.sprite.position.x = h.x + Math.sin(time * .31 + h.drift) * .22;
        h.material.opacity = weights[0] * (.16 + .025 * Math.sin(time * .7 + h.drift));
      });
      return (this.leafMesh.visible ? this.leaves.length : 0) + (this.snowMesh.visible ? this.snow.length : 0);
    }
  }

  class SkyObjects {
    constructor() {
      const sunMat = new T.MeshBasicMaterial({ color: '#fff0b5', transparent: true, opacity: 1, depthWrite: false, fog: false });
      const moonMat = new T.MeshBasicMaterial({ color: '#f2f4e9', transparent: true, opacity: 0, depthWrite: false, fog: false });
      this.sun = new T.Mesh(new T.SphereGeometry(.48, 20, 12), sunMat);
      this.moon = new T.Mesh(new T.SphereGeometry(.36, 18, 10), moonMat);
      this.sunHalo = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color: '#ffe0a4', transparent: true, opacity: .7, depthWrite: false, fog: false }));
      this.moonHalo = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color: '#ecf2ff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this.sunHalo.scale.set(5.2, 5.2, 1);
      this.moonHalo.scale.set(3.7, 3.7, 1);
      camera.add(this.sunHalo, this.moonHalo, this.sun, this.moon);
      const starPositions = [];
      for (let i = 0; i < 96; i++) starPositions.push(rand(-8.4, 8.4), rand(-4.3, 4.5), -29.5);
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(starPositions, 3));
      this.starMaterial = new T.PointsMaterial({ color: '#fff7e1', size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
      this.stars = new T.Points(geometry, this.starMaterial);
      camera.add(this.stars);
    }

    update(phase, nightPower) {
      const angle = phase * TAU;
      const x = Math.sin(angle) * 6.15;
      const y = 1.12 + Math.cos(angle) * 3.57;
      const sunAlpha = clamp((Math.cos(angle) + .2) * 2.1, 0, 1);
      const moonAlpha = clamp((-.85 * Math.cos(angle) + .16) * 2.1, 0, 1);
      this.sun.position.set(x, y, -27);
      this.sunHalo.position.set(x, y, -27.1);
      this.moon.position.set(-x, 2.24 - y, -27.2);
      this.moonHalo.position.copy(this.moon.position);
      this.moonHalo.position.z -= .1;
      this.sun.material.opacity = sunAlpha;
      this.sunHalo.material.opacity = sunAlpha * .70;
      this.moon.material.opacity = moonAlpha;
      this.moonHalo.material.opacity = moonAlpha * .56;
      this.starMaterial.opacity = nightPower * .84;
    }
  }

  const duskSky = ['#687ca6', '#df9b9a', '#f5c498'].map(color);
  const nightSky = ['#1d2b4e', '#3b5277', '#74708e'].map(color);
  const dawnSky = ['#7996b7', '#e5adb1', '#f7ddba'].map(color);
  const dayLight = color('#fff0ce'), duskLight = color('#ffab83');
  const nightLight = color('#a8c3f2'), dawnLight = color('#ffccb1');
  const dayHemi = color('#fff8e3'), duskHemi = color('#f7c2a9');
  const nightHemi = color('#a8bddb'), dawnHemi = color('#fce0ca');
  const lightStops = [dayLight, duskLight, nightLight, dawnLight, dayLight];
  const hemiStops = [dayHemi, duskHemi, nightHemi, dawnHemi, dayHemi];
  const sunStrength = [2.2, 1.08, .38, 1.12, 2.2];
  const fillStrength = [1.72, 1.18, .64, 1.27, 1.72];

  class DayNightCycle {
    constructor(sky) {
      this.sky = sky;
      this.seconds = 1.05;
      this.phase = this.seconds / DAY_LENGTH;
      this.jump = null;
      this.nightPower = 0;
      this.skyColors = [new T.Color(), new T.Color(), new T.Color()];
      this.dayColors = [new T.Color(), new T.Color(), new T.Color()];
      this.skyStops = [0, 1, 2].map(i => [this.dayColors[i], duskSky[i], nightSky[i], dawnSky[i], this.dayColors[i]]);
      this.lightColor = new T.Color();
      this.hemiColor = new T.Color();
      this.uiCounter = 0;
    }

    toggle() {
      const target = this.nightPower > .5 ? .01 : .51;
      let delta = target - this.phase;
      if (delta > .5) delta -= 1;
      if (delta < -.5) delta += 1;
      this.jump = { from: this.phase, delta, target, elapsed: 0, duration: 1.25 };
    }

    update(dt, weights) {
      if (this.jump) {
        this.jump.elapsed += dt;
        const f = smoothstep(0, 1, this.jump.elapsed / this.jump.duration);
        this.phase = (this.jump.from + this.jump.delta * f + 1) % 1;
        if (this.jump.elapsed >= this.jump.duration) {
          this.seconds = this.jump.target * DAY_LENGTH;
          this.phase = this.jump.target;
          this.jump = null;
        }
      } else {
        this.seconds = (this.seconds + dt) % DAY_LENGTH;
        this.phase = this.seconds / DAY_LENGTH;
      }

      // Four cyclic keyframes define the sky. Smoothstep removes visible jumps in
      // the CSS backdrop, fog color, hemisphere light, and sun direction.
      const segment = Math.floor(this.phase * 4);
      const f = smoothstep(0, 1, this.phase * 4 - segment);
      for (let i = 0; i < 3; i++) {
        weighted(this.dayColors[i], daySkyColors[i], weights);
        this.skyColors[i].copy(this.skyStops[i][segment]).lerp(this.skyStops[i][segment + 1], f);
      }
      this.lightColor.copy(lightStops[segment]).lerp(lightStops[segment + 1], f);
      this.hemiColor.copy(hemiStops[segment]).lerp(hemiStops[segment + 1], f);
      sunlight.intensity = lerp(sunStrength[segment], sunStrength[segment + 1], f) * (1 + weights[1] * .09);
      hemi.intensity = lerp(fillStrength[segment], fillStrength[segment + 1], f);
      sunlight.color.copy(this.lightColor);
      hemi.color.copy(this.hemiColor);
      sunlight.position.set(Math.sin(this.phase * TAU) * 8 - 1, 6 + Math.cos(this.phase * TAU) * 5, 6);

      // Lamps begin to glow at dusk and finish fading before dawn is complete.
      this.nightPower = smoothstep(.18, .37, this.phase) * (1 - smoothstep(.62, .74, this.phase));
      mats.window.emissiveIntensity = .03 + this.nightPower * 1.35;
      mats.clockFace.emissiveIntensity = .05 + this.nightPower * 1.55;
      mats.lamp.emissiveIntensity = .18 + this.nightPower * 2.15;
      scene.fog.color.copy(this.skyColors[1]);
      scene.fog.density = .010 + weights[0] * .020 + weights[3] * .007 + this.nightPower * .002;
      this.sky.update(this.phase, this.nightPower);

      this.uiCounter += dt;
      if (this.uiCounter > 1 / 30) {
        this.uiCounter = 0;
        app.style.setProperty('--sky-top', this.skyColors[0].getStyle());
        app.style.setProperty('--sky-mid', this.skyColors[1].getStyle());
        app.style.setProperty('--sky-bottom', this.skyColors[2].getStyle());
        let label = 'DAYLIGHT', icon = '☀';
        if (this.phase >= .18 && this.phase < .43) { label = 'GOLDEN HOUR'; icon = '◒'; }
        else if (this.phase >= .43 && this.phase < .69) { label = 'MOONLIGHT'; icon = '☾'; }
        else if (this.phase >= .69 && this.phase < .89) { label = 'DAWN'; icon = '◐'; }
        timeLabel.textContent = label;
        timeIndicator.textContent = icon;
        app.classList.toggle('is-night', this.nightPower > .45);
        const isNight = this.nightPower > .5;
        timeToggleIcon.textContent = isNight ? '☀' : '☾';
        timeToggle.setAttribute('aria-label', isNight ? 'Switch to day' : 'Switch to night');
      }
      return this.nightPower;
    }
  }

  class OrbitController {
    constructor(element) {
      this.azimuth = .57;
      this.targetAzimuth = .57;
      this.elevation = .41;
      this.dragging = false;
      this.lastX = 0;
      element.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        this.dragging = true;
        this.lastX = event.clientX;
        element.classList.add('is-dragging');
        element.setPointerCapture(event.pointerId);
      });
      element.addEventListener('pointermove', event => {
        if (!this.dragging) return;
        // Only horizontal drag changes azimuth; the frame loop keeps rendering throughout.
        this.targetAzimuth += (event.clientX - this.lastX) * .0065;
        this.lastX = event.clientX;
      });
      const end = () => { this.dragging = false; element.classList.remove('is-dragging'); };
      element.addEventListener('pointerup', end);
      element.addEventListener('pointercancel', end);
      this.update(1);
    }

    update(dt) {
      this.azimuth += (this.targetAzimuth - this.azimuth) * (1 - Math.exp(-dt * 8.5));
      const distance = 18;
      const c = Math.cos(this.elevation);
      camera.position.set(Math.sin(this.azimuth) * c * distance, .72 + Math.sin(this.elevation) * distance, Math.cos(this.azimuth) * c * distance);
      camera.lookAt(0, .72, 0);
    }
  }

  const island = new Island();
  const ben = new BigBen(island.group);
  const eye = new LondonEye(island.group);
  const bridge = new TowerBridge(island.group);
  const clouds = new Clouds();
  const seasons = new SeasonSystem(island);
  const weather = new WeatherSystem(island);
  const skyObjects = new SkyObjects();
  const daylight = new DayNightCycle(skyObjects);
  const orbit = new OrbitController(renderer.domElement);

  function resize() {
    const width = Math.max(1, sceneHost.clientWidth);
    const height = Math.max(1, sceneHost.clientHeight);
    const aspect = width / height;
    // Keep the full island in frame even in a narrow iframe card.
    const viewHeight = Math.max(9.5, 12.2 / aspect);
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  resize();
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(sceneHost);

  seasonButtons.forEach(button => button.addEventListener('click', () => seasons.choose(Number(button.dataset.season))));
  timeToggle.addEventListener('click', () => daylight.toggle());
  window.addEventListener('keydown', event => {
    if (event.key >= '1' && event.key <= '4') seasons.choose(Number(event.key) - 1);
    if (event.key.toLowerCase() === 'n') daylight.toggle();
    if (event.key.toLowerCase() === 'd') debug.hidden = !debug.hidden;
  });

  const clock = new T.Clock();
  let elapsed = 0, frames = 0, fpsTime = 0;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05); // tab restoration cannot skip an entire season
    elapsed += dt;
    seasons.update(dt);
    const lampPower = daylight.update(dt, seasons.weights);
    island.update(elapsed);
    ben.update(elapsed, lampPower);
    eye.update(elapsed, lampPower);
    bridge.update(lampPower);
    clouds.update(elapsed, lampPower);
    const particles = weather.update(dt, elapsed, seasons.weights, lampPower);
    orbit.update(dt);
    renderer.render(scene, camera);
    if (!debug.hidden) {
      frames++;
      fpsTime += dt;
      if (fpsTime >= 1) {
        fpsLabel.textContent = String(Math.round(frames / fpsTime));
        particleLabel.textContent = String(particles);
        frames = 0;
        fpsTime = 0;
      }
    } else {
      frames = 0;
      fpsTime = 0;
    }
  }
  animate();
})();
