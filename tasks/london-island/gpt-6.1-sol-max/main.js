/* Little London — procedural geometry, no build tools or external assets. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  let seed = 2609;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + random() * (b - a);

  const SEASONS = [
    { name: 'Spring', title: 'A breath of spring', description: 'Soft skies & a little morning mist', temp: 12, humidity: 82, wind: 8, ground: '#a5b69a', leaf: '#c5d2a1', leaf2: '#e1b8ae', sky: '#e5e9dd', fog: .012 },
    { name: 'Summer', title: 'A pocket of sunshine', description: 'Golden days & a warmer breeze', temp: 25, humidity: 48, wind: 5, ground: '#9bb274', leaf: '#89a673', leaf2: '#b4bd75', sky: '#e6e8d3', fog: .003 },
    { name: 'Autumn', title: 'The art of slowing down', description: 'Copper leaves & a crisp little breeze', temp: 14, humidity: 68, wind: 14, ground: '#b7aa7c', leaf: '#c5804c', leaf2: '#d8a15a', sky: '#e8d8c2', fog: .007 },
    { name: 'Winter', title: 'A little winter wonder', description: 'Snow-dusted rooftops & quiet skies', temp: 2, humidity: 74, wind: 11, ground: '#c3cfc1', leaf: '#a0b7a4', leaf2: '#c7d4c6', sky: '#dae5e5', fog: .009 }
  ];
  SEASONS.forEach(s => { s.groundColor = null; });

  let toastTimeout;
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2600);
  }

  function fail(message) {
    $('loading-screen').classList.add('loaded');
    $('fallback').hidden = false;
    if (message) $('fallback-message').textContent = message;
  }
  $('retry-button').addEventListener('click', () => location.reload());

  async function loadThree() {
    if (window.THREE) return;
    // Classic scripts (rather than ES module imports) also work over file://.
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function boot() {
    try { await loadThree(); } catch (_) { fail('The clouds are taking their time. An internet connection is needed to load Three.js. Reconnect and try again.'); return; }
    const THREE = window.THREE;
    const V3 = THREE.Vector3;
    SEASONS.forEach(s => {
      s.groundColor = new THREE.Color(s.ground);
      s.leafColor = new THREE.Color(s.leaf);
      s.leafColor2 = new THREE.Color(s.leaf2);
      s.skyColor = new THREE.Color(s.sky);
    });

    const G = {
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 16, 12),
      cloud: new THREE.SphereGeometry(1, 12, 8),
      ico: new THREE.IcosahedronGeometry(1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
      cone: new THREE.ConeGeometry(1, 1, 8),
      pyramid: new THREE.ConeGeometry(1, 1, 4),
      disk: new THREE.CircleGeometry(1, 40)
    };
    const gradient = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 170, 170, 170, 255, 218, 218, 218, 255, 255, 255, 255, 255]), 4, 1);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
    const standard = (color, props = {}) => new THREE.MeshStandardMaterial({ color, roughness: .84, metalness: 0, ...props });
    const toon = (color, props = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...props });
    const M = {
      grass: toon(SEASONS[0].ground),
      grassEdge: toon('#7b987e'),
      sand: standard('#e2c69d'),
      stone: standard('#e9d4ad'),
      lightStone: standard('#f1e0ba'),
      trim: standard('#bf9b65'),
      trimLight: standard('#e1c38c'),
      roof: toon('#4c6964'),
      roofLight: toon('#6c8273'),
      dark: standard('#344c4b'),
      white: standard('#f6efdb'),
      teal: standard('#75aaa7'),
      bridgeBlue: standard('#729eac'),
      water: standard('#83c2c3', { roughness: .28, metalness: .12 }),
      foam: standard('#d3e6d9', { roughness: .5 }),
      road: standard('#a3a18b'),
      path: standard('#d9ceac'),
      red: toon('#bc5545'),
      redDark: standard('#8c3c36'),
      rubber: standard('#34433c'),
      bark: toon('#8b8162'),
      foliage: toon(SEASONS[0].leaf),
      foliage2: toon(SEASONS[0].leaf2),
      evergreen: toon('#678b79'),
      cloud: standard('#f8f5e9', { roughness: 1 }),
      window: standard('#4d6765', { emissive: '#ffcd77', emissiveIntensity: .05, roughness: .45 }),
      lamp: standard('#f4dd9b', { emissive: '#ffcf74', emissiveIntensity: .2 }),
      eyeLight: standard('#f1e7ce', { emissive: '#ffe1a0', emissiveIntensity: .05 }),
      snow: standard('#f1f3e8', { transparent: true, opacity: 0, depthWrite: false }),
      pinkHouse: standard('#cc9c8c'),
      greenHouse: standard('#a9b4a1'),
      ochreHouse: standard('#cfb079'),
      paper: standard('#f2e7c9')
    };

    const transform = new THREE.Object3D();
    function shape(parent, geometry, material, x, y, z, sx = 1, sy = sx, sz = sx) {
      const o = new THREE.Mesh(geometry, material);
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      o.castShadow = material !== M.snow;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }
    const box = (p, m, x, y, z, w, h, d) => shape(p, G.box, m, x, y, z, w, h, d);
    const sphere = (p, m, x, y, z, r, sy = r, sz = r) => shape(p, G.sphere, m, x, y, z, r, sy, sz);
    const cylinder = (p, m, x, y, z, r, h) => shape(p, G.cylinder, m, x, y, z, r, h, r);
    function roof(p, m, x, y, z, radius, height) {
      const o = shape(p, G.pyramid, m, x, y, z, radius, height, radius);
      o.rotation.y = Math.PI / 4;
      return o;
    }
    function beam(p, m, from, to, radius = .04) {
      const a = new V3(...from), b = new V3(...to), direction = b.clone().sub(a);
      const o = cylinder(p, m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, radius, direction.length());
      o.quaternion.setFromUnitVectors(new V3(0, 1, 0), direction.normalize());
      return o;
    }
    function tube(p, m, curve, radius = .035, segments = 36) {
      return shape(p, new THREE.TubeGeometry(curve, segments, radius, 5, false), m, 0, 0, 0);
    }
    function ribbon(curve, width, y = .05, segments = 90) {
      const vertices = [], indices = [], normals = [];
      for (let i = 0; i <= segments; i++) {
        const pt = curve.getPoint(i / segments), tangent = curve.getTangent(i / segments);
        const len = Math.hypot(tangent.x, tangent.z) || 1;
        const dx = -tangent.z / len * width * .5, dz = tangent.x / len * width * .5;
        vertices.push(pt.x + dx, y, pt.z + dz, pt.x - dx, y, pt.z - dz);
        normals.push(0, 1, 0, 0, 1, 0);
        if (i < segments) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setIndex(indices);
      return geometry;
    }

    // Batch repeated static geometry into a small set of GPU draw calls. Dynamic
    // subtrees (clocks, wheel, boat) stay independent, and share the same resources.
    function batchStatic(root) {
      root.updateMatrixWorld(true);
      const inverse = root.matrixWorld.clone().invert(), batches = new Map();
      function visit(node, moving) {
        moving = moving || node.userData.dynamic;
        if (node.isMesh && !moving && !node.isInstancedMesh) {
          const key = node.geometry.uuid + node.material.uuid + node.castShadow;
          if (!batches.has(key)) batches.set(key, []);
          batches.get(key).push(node);
        }
        node.children.forEach(child => visit(child, moving));
      }
      visit(root, false);
      const matrix = new THREE.Matrix4();
      batches.forEach(meshes => {
        if (meshes.length < 2) return;
        const first = meshes[0], instance = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
        instance.castShadow = first.castShadow;
        instance.receiveShadow = true;
        meshes.forEach((mesh, i) => {
          matrix.multiplyMatrices(inverse, mesh.matrixWorld);
          instance.setMatrixAt(i, matrix);
          mesh.parent.remove(mesh);
        });
        instance.instanceMatrix.needsUpdate = true;
        instance.computeBoundingSphere();
        root.add(instance);
      });
    }

    class BigBen {
      constructor(parent) {
        this.root = new THREE.Group();
        this.root.position.set(-1.15, .08, -.1);
        parent.add(this.root);
        const p = this.root;
        box(p, M.trim, 0, .15, 0, 1.95, .3, 1.8);
        box(p, M.stone, 0, 2.65, 0, 1.4, 5, 1.36);
        for (let x of [-.72, .72]) for (let z of [-.7, .7]) {
          box(p, M.lightStone, x, 2.75, z, .18, 5.2, .18);
          box(p, M.trimLight, x, 4.65, z, .24, .14, .24);
        }
        for (let y of [.55, 1.15, 2.15, 3.25, 4.35, 4.8]) box(p, M.trimLight, 0, y, 0, 1.57, .11, 1.52);
        for (let side = 0; side < 4; side++) {
          const wall = new THREE.Group();
          wall.rotation.y = side * Math.PI / 2;
          p.add(wall);
          for (let level = 0; level < 3; level++) {
            for (let x of [-.28, .28]) {
              box(wall, M.trim, x, 1.7 + level * 1.08, .704, .23, .77, .055);
              box(wall, M.window, x, 1.72 + level * 1.08, .738, .13, .62, .016);
              roof(wall, M.trimLight, x, 2.14 + level * 1.08, .73, .18, .17).scale.z = .04;
            }
          }
          for (let x of [-.4, -.2, 0, .2, .4]) box(wall, M.window, x, 4.65, .72, .085, .32, .02);
        }
        box(p, M.trim, 0, 5.03, 0, 1.85, .21, 1.8);
        box(p, M.lightStone, 0, 5.77, 0, 1.75, 1.34, 1.7);
        for (let x of [-.88, .88]) for (let z of [-.86, .86]) box(p, M.trimLight, x, 5.82, z, .15, 1.55, .15);
        box(p, M.trim, 0, 6.51, 0, 2.02, .18, 1.98);
        box(p, M.lightStone, 0, 6.65, 0, 1.88, .13, 1.83);
        box(p, M.roof, 0, 6.84, 0, 1.65, .25, 1.6);
        roof(p, M.roof, 0, 7.46, 0, 1.19, 1.3);
        roof(p, M.trim, 0, 8.1, 0, .38, .42);
        cylinder(p, M.trimLight, 0, 8.45, 0, .055, .51);
        sphere(p, M.trimLight, 0, 8.74, 0, .095);
        for (let x of [-.8, .8]) for (let z of [-.78, .78]) {
          box(p, M.lightStone, x, 6.96, z, .18, .56, .18);
          roof(p, M.roof, x, 7.33, z, .18, .3);
          cylinder(p, M.trimLight, x, 7.55, z, .025, .19);
        }
        // A single generated clock texture is shared by all four faces.
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f6ecd0'; ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#546259'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(128, 128, 116, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(128, 128, 87, 0, TAU); ctx.stroke();
        const roman = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
        ctx.fillStyle = '#394d48'; ctx.font = '18px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < 12; i++) {
          const a = i * TAU / 12 - Math.PI / 2;
          ctx.fillText(roman[i], 128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100);
        }
        for (let i = 0; i < 60; i++) {
          const a = i * TAU / 60;
          ctx.beginPath(); ctx.moveTo(128 + Math.sin(a) * 77, 128 + Math.cos(a) * 77);
          ctx.lineTo(128 + Math.sin(a) * (i % 5 ? 81 : 85), 128 + Math.cos(a) * (i % 5 ? 81 : 85)); ctx.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.clockMaterial = standard('#ffffff', { map: texture, emissiveMap: texture, emissive: '#ffe6a5', emissiveIntensity: .12, roughness: .8 });
        this.hands = [];
        for (let side = 0; side < 4; side++) {
          const face = new THREE.Group();
          face.rotation.y = side * Math.PI / 2;
          p.add(face);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(.665, .045, 8, 48), M.trim);
          ring.position.set(0, 5.78, .91); face.add(ring);
          shape(face, G.disk, this.clockMaterial, 0, 5.78, .925, .624, .624, 1);
          const handsRoot = new THREE.Group();
          handsRoot.position.set(0, 5.78, .95);
          handsRoot.userData.dynamic = true; face.add(handsRoot);
          const minute = new THREE.Group(), hour = new THREE.Group();
          handsRoot.add(minute, hour);
          box(minute, M.dark, 0, .205, 0, .032, .45, .025);
          box(hour, M.dark, 0, .135, .012, .05, .31, .025);
          sphere(handsRoot, M.trim, 0, 0, .035, .045);
          this.hands.push({ minute, hour });
        }
      }
      update(hours, lights) {
        for (const h of this.hands) {
          h.minute.rotation.z = -(hours % 1) * TAU;
          h.hour.rotation.z = -(hours % 12) / 12 * TAU;
        }
        this.clockMaterial.emissiveIntensity = .1 + lights * .85;
      }
    }

    class Westminster {
      constructor(parent) {
        const p = new THREE.Group(); p.position.set(-4.15, .08, -.45); parent.add(p);
        box(p, M.trim, 0, .12, 0, 4.7, .24, 1.86);
        box(p, M.stone, 0, 1.17, 0, 4.4, 2.1, 1.65);
        box(p, M.trimLight, 0, 2.24, 0, 4.58, .14, 1.83);
        box(p, M.roof, 0, 2.41, 0, 4.3, .29, 1.57);
        for (let x = -1.98; x <= 2.01; x += .4) {
          for (let z of [-.85, .85]) {
            box(p, M.trimLight, x, 1.3, z, .1, 2.2, .1);
            for (let y of [.8, 1.7]) box(p, M.window, x + .17, y, z, .19, .61, .035);
            box(p, M.lightStone, x, 2.52, z, .16, .36, .18);
            roof(p, M.trim, x, 2.8, z, .14, .26);
          }
        }
        for (let x of [-2.15, 2.15]) {
          box(p, M.lightStone, x, 1.55, 0, .45, 2.7, 1.85);
          box(p, M.trim, x, 2.95, 0, .55, .15, 1.98);
          for (let z of [-.7, .7]) roof(p, M.roof, x, 3.2, z, .31, .4);
        }
        box(p, M.trimLight, 0, .42, .86, 4.48, .1, .08);
        box(p, M.trimLight, 0, 1.25, .86, 4.48, .08, .08);
        box(p, M.snow, 0, 2.58, 0, 4.22, .055, 1.5);
      }
    }

    class LondonEye {
      constructor(parent) {
        this.root = new THREE.Group(); this.root.position.set(3.65, .08, -2.4); parent.add(this.root);
        const p = this.root, radius = 2.18;
        box(p, M.stone, 0, .16, .05, 2.5, .3, 1.1);
        for (let z of [-.28, .36]) {
          beam(p, M.white, [-1.03, .3, z], [0, 3.3, 0], .09);
          beam(p, M.white, [1.03, .3, z], [0, 3.3, 0], .09);
        }
        this.wheel = new THREE.Group(); this.wheel.position.set(0, 3.3, 0); this.wheel.userData.dynamic = true; p.add(this.wheel);
        for (let z of [-.12, .12]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .048, 7, 100), M.eyeLight);
          ring.position.z = z; this.wheel.add(ring);
        }
        for (let i = 0; i < 20; i++) {
          const angle = i * TAU / 20, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
          beam(this.wheel, M.white, [0, 0, 0], [x, y, .1], .013);
          beam(this.wheel, M.white, [0, 0, -.06], [Math.cos(angle + .19) * radius, Math.sin(angle + .19) * radius, -.12], .009);
        }
        const hub = cylinder(p, M.trim, 0, 3.3, .18, .18, .48); hub.rotation.x = Math.PI / 2;
        sphere(p, M.white, 0, 3.3, .45, .13);
        // The cabin bodies orbit independently of the rim, keeping them upright.
        // Three persistent instance batches render every capsule in three calls.
        this.cabinRoot = new THREE.Group(); this.cabinRoot.position.y = 3.3;
        this.cabinRoot.userData.dynamic = true; p.add(this.cabinRoot);
        this.cabinBatches = [
          { geometry: G.sphere, material: M.white, parts: [[0, -.08, 0, .19, .16, .16]] },
          { geometry: G.box, material: M.teal, parts: [[0, -.045, .025, .27, .16, .25]] },
          { geometry: G.box, material: M.white, parts: [[0, .045, .025, .32, .05, .29], [0, -.14, .025, .3, .035, .27], [-.1, -.045, .165, .018, .17, .018], [.1, -.045, .165, .018, .17, .018]] }
        ];
        for (const batch of this.cabinBatches) {
          batch.mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.parts.length * 20);
          batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          batch.mesh.frustumCulled = false; batch.mesh.receiveShadow = true;
          this.cabinRoot.add(batch.mesh);
        }
        // Local batching still permits the entire rim to rotate as one object.
        this.wheel.userData.dynamic = false;
        batchStatic(this.wheel);
        this.wheel.userData.dynamic = true;
        this.update(0);
      }
      update(t) {
        const angle = t * .055;
        this.wheel.rotation.z = angle;
        transform.rotation.set(0, 0, 0);
        for (const batch of this.cabinBatches) {
          for (let i = 0; i < 20; i++) {
            const a = i * TAU / 20 + angle, x = Math.cos(a) * 2.18, y = Math.sin(a) * 2.18;
            for (let j = 0; j < batch.parts.length; j++) {
              const part = batch.parts[j];
              transform.position.set(x + part[0], y + part[1], part[2]);
              transform.scale.set(part[3], part[4], part[5]); transform.updateMatrix();
              batch.mesh.setMatrixAt(i * batch.parts.length + j, transform.matrix);
            }
          }
          batch.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }

    class TowerBridge {
      constructor(parent) {
        const p = new THREE.Group(); p.position.set(4.1, .1, 2.1); p.rotation.y = -.08; parent.add(p);
        box(p, M.trim, 0, .48, 0, 5.4, .24, .85);
        box(p, M.road, 0, .63, 0, 5.35, .08, .63);
        for (let z of [-.44, .44]) {
          box(p, M.bridgeBlue, 0, .81, z, 5.4, .07, .04);
          for (let x = -2.6; x < 2.7; x += .23) box(p, M.bridgeBlue, x, .74, z, .024, .25, .024);
        }
        for (let x of [-1.38, 1.38]) {
          box(p, M.trim, x, .27, 0, .98, .5, 1.02);
          box(p, M.lightStone, x, 1.51, 0, .77, 1.95, .91);
          box(p, M.trimLight, x, 1.04, 0, .88, .13, 1.02);
          box(p, M.trimLight, x, 2.35, 0, .94, .15, 1.04);
          box(p, M.stone, x, 2.59, 0, .7, .37, .83);
          for (let z of [-.46, .46]) {
            box(p, M.window, x, 1.61, z, .22, .62, .025);
            box(p, M.trim, x, 1.3, z, .3, .065, .06);
            for (let dx of [-.34, .34]) {
              box(p, M.lightStone, x + dx, 2.07, z, .17, 1.17, .17);
              roof(p, M.roof, x + dx, 2.91, z, .23, .53);
              cylinder(p, M.trim, x + dx, 3.24, z, .025, .16);
            }
          }
          roof(p, M.roof, x, 2.99, 0, .49, .44);
          box(p, M.snow, x, 2.81, 0, .57, .06, .65);
        }
        box(p, M.bridgeBlue, 0, 2.2, 0, 2.8, .14, .48);
        for (let z of [-.25, .25]) {
          box(p, M.white, 0, 2.34, z, 2.7, .035, .035);
          for (let x = -1.2; x <= 1.3; x += .24) {
            box(p, M.white, x, 2.28, z, .025, .16, .025);
          }
        }
        for (let z of [-.46, .46]) {
          const center = new THREE.QuadraticBezierCurve3(new V3(-1.38, 2.2, z), new V3(0, .56, z), new V3(1.38, 2.2, z));
          tube(p, M.bridgeBlue, center, .035);
          for (let sign of [-1, 1]) {
            const outer = new THREE.QuadraticBezierCurve3(new V3(sign * 1.38, 2.2, z), new V3(sign * 2, .8, z), new V3(sign * 2.7, .8, z));
            tube(p, M.bridgeBlue, outer, .035, 24);
          }
          for (let i = 1; i < 12; i++) {
            const pt = center.getPoint(i / 12);
            box(p, M.bridgeBlue, pt.x, (.82 + pt.y) / 2, z, .02, pt.y - .82, .02);
          }
        }
        for (let x of [-2.5, 2.5]) for (let z of [-.47, .47]) {
          cylinder(p, M.dark, x, .99, z, .021, .6);
          sphere(p, M.lamp, x, 1.32, z, .065);
        }
      }
    }

    class Island {
      constructor(scene) {
        this.root = new THREE.Group(); scene.add(this.root);
        const p = this.root;
        this.buildTerrain();
        this.river = new THREE.CatmullRomCurve3([
          new V3(5.4, 0, -4.35), new V3(3.9, 0, -2.9), new V3(3.6, 0, -.8), new V3(4.15, 0, 1.6), new V3(3.3, 0, 3.8), new V3(2.25, 0, 5.4)
        ]);
        shape(p, ribbon(this.river, 2.55, .062), M.path, 0, 0, 0);
        shape(p, ribbon(this.river, 2.14, .084), M.water, 0, 0, 0);
        this.waterRipples = new THREE.Group(); this.waterRipples.userData.dynamic = true; p.add(this.waterRipples);
        for (let i = 0; i < 24; i++) {
          const pos = this.river.getPoint((i + .5) / 24), tangent = this.river.getTangent((i + .5) / 24);
          const ripple = box(this.waterRipples, M.foam, pos.x + range(-.65, .65), .105, pos.z, range(.1, .38), .012, .018);
          ripple.rotation.y = -Math.atan2(tangent.z, tangent.x) + Math.PI / 2;
          ripple.castShadow = false;
        }
        const fallMaterial = standard('#9dcfc8', { transparent: true, opacity: .72, roughness: .2, side: THREE.DoubleSide });
        box(p, fallMaterial, 2.25, -1.19, 5.37, 1.77, 2.55, .065);
        for (let i = 0; i < 7; i++) box(p, M.foam, 1.52 + i * .23, -1.15, 5.42, .025, range(1.6, 2.65), .012);
        this.road = new THREE.CatmullRomCurve3([new V3(-7.5, 0, 1.15), new V3(-5.6, 0, 2.3), new V3(-3.4, 0, 2.7), new V3(-1.5, 0, 3.6), new V3(-.1, 0, 5.1)]);
        shape(p, ribbon(this.road, 1.02, .075), M.path, 0, 0, 0);
        shape(p, ribbon(this.road, .78, .085), M.road, 0, 0, 0);
        for (let i = 1; i < 24; i++) {
          const pt = this.road.getPoint(i / 25), dir = this.road.getTangent(i / 25);
          const dash = box(p, M.paper, pt.x, .1, pt.z, .16, .01, .035); dash.rotation.y = -Math.atan2(dir.z, dir.x);
        }
        const walk = new THREE.CatmullRomCurve3([new V3(-.2, 0, -4.7), new V3(.8, 0, -2.9), new V3(.4, 0, -.4), new V3(1, 0, 2), new V3(.6, 0, 4.7)]);
        shape(p, ribbon(walk, .5, .07), M.path, 0, 0, 0);
        this.bigben = new BigBen(p);
        new Westminster(p);
        this.eye = new LondonEye(p);
        new TowerBridge(p);
        this.buildHouses();
        this.buildGardens();
        this.buildStreetDetails();
        this.buildBoat();
        // All terrain, buildings, vegetation and street furniture are batched once.
        batchStatic(p);
      }
      buildTerrain() {
        const n = 56, outline = [];
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU;
          const noise = 1 + Math.sin(a * 5) * .022 + Math.cos(a * 9) * .013;
          outline.push([Math.cos(a) * 8.6 * noise, Math.sin(a) * 5.65 * noise]);
        }
        const top = new THREE.Shape();
        outline.forEach(([x, z], i) => i ? top.lineTo(x, -z) : top.moveTo(x, -z)); top.closePath();
        const ground = shape(this.root, new THREE.ShapeGeometry(top), M.grass, 0, .035, 0);
        ground.rotation.x = -Math.PI / 2;
        const layers = [
          { y: 0, r: 1 }, { y: -.4, r: .995 }, { y: -1.18, r: .91 }, { y: -2.65, r: .73 }, { y: -3.85, r: .41 }, { y: -4.45, r: .08 }
        ];
        const verts = [], colors = [], earthColors = ['#98a386', '#cdb08a', '#d8b991', '#b59473', '#c5a582'];
        const col = new THREE.Color();
        for (let layer = 0; layer < layers.length - 1; layer++) {
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n, a = layers[layer], b = layers[layer + 1];
            const upperNoiseA = layer === 0 ? 1 : 1 + Math.sin(i * 4.37 + layer) * .045;
            const upperNoiseB = layer === 0 ? 1 : 1 + Math.sin(j * 4.37 + layer) * .045;
            const lowerNoiseA = 1 + Math.sin(i * 4.37 + layer + 1) * .045;
            const lowerNoiseB = 1 + Math.sin(j * 4.37 + layer + 1) * .045;
            const upperYA = layer === 0 ? 0 : Math.sin(i * 2.4) * .09;
            const upperYB = layer === 0 ? 0 : Math.sin(j * 2.4) * .09;
            const points = [
              [outline[i][0] * a.r * upperNoiseA, a.y + upperYA, outline[i][1] * a.r * upperNoiseA], [outline[j][0] * a.r * upperNoiseB, a.y + upperYB, outline[j][1] * a.r * upperNoiseB],
              [outline[i][0] * b.r * lowerNoiseA, b.y + Math.sin(i * 2.4) * .09, outline[i][1] * b.r * lowerNoiseA],
              [outline[j][0] * b.r * lowerNoiseB, b.y + Math.sin(j * 2.4) * .09, outline[j][1] * b.r * lowerNoiseB]
            ];
            for (const tri of [[0, 1, 2], [1, 3, 2]]) {
              col.set(earthColors[layer]); col.multiplyScalar(range(.89, 1.11));
              for (const k of tri) { verts.push(...points[k]); colors.push(col.r, col.g, col.b); }
            }
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
        shape(this.root, geometry, standard('#ffffff', { vertexColors: true, flatShading: true }), 0, 0, 0);
        // Small suspended fragments make the underside feel lighter than a pedestal.
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * TAU, r = range(4.5, 8);
          const stone = shape(this.root, G.ico, M.sand, Math.cos(a) * r, range(-4.1, -1.4), Math.sin(a) * r * .6, range(.12, .35), range(.2, .55), range(.12, .3));
          stone.rotation.set(range(0, 3), range(0, 3), range(0, 3));
        }
      }
      tree(x, z, scale = 1, pink = false, pine = false) {
        const p = new THREE.Group(); p.position.set(x, .08, z); p.scale.setScalar(scale); this.root.add(p);
        cylinder(p, M.bark, 0, .6, 0, .085, 1.2);
        beam(p, M.bark, [0, .6, 0], [-.28, 1.1, .04], .045);
        beam(p, M.bark, [0, .65, 0], [.3, 1.15, -.03], .04);
        if (pine) {
          for (let i = 0; i < 3; i++) shape(p, G.cone, M.evergreen, 0, .9 + i * .39, 0, .65 - i * .14, .92, .65 - i * .14);
          shape(p, G.cone, M.snow, 0, 1.83, 0, .31, .55, .31);
        } else {
          const mat = pink ? M.foliage2 : M.foliage;
          for (const a of [[0, 1.48, 0, .58], [-.39, 1.26, .03, .45], [.36, 1.35, .05, .45], [.04, 1.32, .3, .41]]) {
            shape(p, G.ico, mat, a[0], a[1], a[2], a[3], a[3] * .95, a[3]);
          }
          shape(p, G.ico, M.snow, 0, 1.76, .01, .48, .22, .43);
        }
      }
      buildHouses() {
        const houses = [
          [-6.2, -2.65, M.pinkHouse, 1.3], [-4.92, -2.95, M.ochreHouse, 1.65], [-3.65, -3.18, M.greenHouse, 1.48],
          [-2.38, -3.36, M.pinkHouse, 1.7], [.15, -3.25, M.ochreHouse, 1.4], [1.34, -3.35, M.greenHouse, 1.6], [-7.05, -.55, M.greenHouse, 1.2]
        ];
        for (const [x, z, mat, h] of houses) {
          const p = new THREE.Group(); p.position.set(x, .08, z); this.root.add(p);
          box(p, mat, 0, h / 2, 0, 1.02, h, .86);
          box(p, M.lightStone, 0, .14, 0, 1.08, .2, .93);
          roof(p, M.roof, 0, h + .28, 0, .78, .58).scale.z *= .87;
          box(p, M.trim, .29, h + .45, -.19, .14, .5, .15);
          box(p, M.trimLight, .29, h + .72, -.19, .19, .07, .2);
          for (let wy = .63; wy < h; wy += .58) for (let wx of [-.28, .28]) {
            box(p, M.white, wx, wy, .441, .27, .34, .035);
            box(p, M.window, wx, wy, .465, .21, .27, .018);
            box(p, M.lightStone, wx, wy - .19, .48, .31, .045, .07);
          }
          box(p, M.dark, 0, .33, .45, .2, .48, .03);
          box(p, M.snow, 0, h + .36, 0, .84, .05, .7);
        }
      }
      buildGardens() {
        const trees = [
          [-7.25, 1.12, .86, true], [-6.55, 3.17, .9, false], [-5.02, 3.75, .82, true], [-3.35, 4.18, 1, false],
          [-1.62, 4.67, .68, true], [.18, 2.54, .78, true], [.9, .5, .8, false], [-.2, -2, .7, true],
          [-7.05, -2.4, .8, false], [-5.85, -4.02, .75, true], [-.9, -4.25, .7, false], [2.22, -4.1, .7, true],
          [6.38, -.55, .92, false], [6.78, 1.15, .78, true], [5.88, 3.28, .74, false], [.65, 4.53, .63, true]
        ];
        trees.forEach(([x, z, s, pink]) => this.tree(x, z, s, pink));
        this.tree(6.42, -2.55, .8, false, true); this.tree(7.08, -.75, .68, false, true);
        // Flower beds, hedges and stepping stones provide detail at every angle.
        for (let i = 0; i < 48; i++) {
          const a = range(0, TAU), r = range(.5, 1.9), x = -4.7 + Math.cos(a) * r, z = 3.35 + Math.sin(a) * r * .35;
          sphere(this.root, i % 3 ? M.foliage2 : M.paper, x, .12, z, range(.035, .065));
        }
        for (let i = 0; i < 7; i++) box(this.root, M.foliage, -5.65 + i * .48, .23, 1.08, .43, .32, .32);
        for (let i = 0; i < 7; i++) {
          const a = i * .34;
          const stone = box(this.root, M.stone, .85 + Math.sin(a) * .7, .09, -.9 + i * .36, .24, .055, .16);
          stone.rotation.y = -.3;
        }
        // A miniature round garden, fountain and three little benches.
        const bed = cylinder(this.root, M.path, -1.18, .11, 2.16, .72, .15); bed.scale.z = .74;
        cylinder(this.root, M.stone, -1.18, .25, 2.16, .37, .21);
        cylinder(this.root, M.water, -1.18, .365, 2.16, .31, .025);
        cylinder(this.root, M.lightStone, -1.18, .52, 2.16, .065, .35);
        sphere(this.root, M.water, -1.18, .74, 2.16, .11, .05, .11);
        for (const [x, z, angle] of [[-4.4, 3.9, 0], [.6, 1.5, Math.PI / 2], [-6.5, .9, .2]]) {
          const b = new THREE.Group(); b.position.set(x, .1, z); b.rotation.y = angle; this.root.add(b);
          for (let i = 0; i < 3; i++) box(b, M.trim, 0, .25, -.09 + i * .09, .6, .035, .07);
          box(b, M.trim, 0, .42, -.14, .6, .19, .04);
          for (let bx of [-.22, .22]) box(b, M.dark, bx, .13, 0, .035, .25, .24);
        }
      }
      buildStreetDetails() {
        const bus = new THREE.Group(); const pos = this.road.getPoint(.63), tangent = this.road.getTangent(.63);
        bus.position.set(pos.x, .14, pos.z); bus.rotation.y = -Math.atan2(tangent.z, tangent.x); this.root.add(bus);
        box(bus, M.redDark, 0, .21, 0, 1.22, .3, .48);
        box(bus, M.red, 0, .61, 0, 1.23, .72, .49);
        box(bus, M.red, 0, 1.0, 0, 1.17, .09, .47);
        for (let z of [-.251, .251]) {
          for (let x of [-.43, -.15, .13, .4]) for (let y of [.48, .82]) box(bus, M.window, x, y, z, .21, .2, .012);
          box(bus, M.paper, -.03, .64, z * 1.02, .94, .07, .012);
        }
        for (let x of [-.38, .38]) for (let z of [-.26, .26]) {
          const wheel = cylinder(bus, M.rubber, x, .18, z, .14, .075); wheel.rotation.x = Math.PI / 2;
          const hub = cylinder(bus, M.trimLight, x, .18, z * 1.15, .06, .02); hub.rotation.x = Math.PI / 2;
        }
        box(bus, M.window, .62, .52, 0, .012, .26, .39);
        box(bus, M.window, .6, .85, 0, .012, .19, .37);
        for (let z of [-.15, .15]) sphere(bus, M.lamp, .632, .3, z, .04);
        // The red telephone box, with a proper gridded glass door.
        const phone = new THREE.Group(); phone.position.set(-.47, .09, 3.32); phone.rotation.y = .1; this.root.add(phone);
        box(phone, M.redDark, 0, .05, 0, .43, .1, .43);
        box(phone, M.red, 0, .55, 0, .37, 1.02, .37);
        box(phone, M.red, 0, 1.12, 0, .44, .15, .43);
        roof(phone, M.red, 0, 1.25, 0, .29, .17);
        for (let z of [-.191, .191]) {
          box(phone, M.paper, 0, 1.02, z, .29, .085, .015);
          box(phone, M.window, 0, .59, z, .29, .66, .015);
          for (let x of [-.1, 0, .1]) box(phone, M.red, x, .59, z * 1.04, .018, .68, .015);
          for (let y of [.32, .5, .68, .86]) box(phone, M.red, 0, y, z * 1.04, .29, .018, .015);
        }
        for (const [x, z] of [[-5.9, 2.73], [-2.4, 3.6], [1.13, -.3], [5.8, -.1]]) {
          cylinder(this.root, M.dark, x, .66, z, .025, 1.2);
          box(this.root, M.dark, x, 1.28, z, .18, .06, .18);
          box(this.root, M.lamp, x, 1.16, z, .13, .18, .13);
          roof(this.root, M.dark, x, 1.38, z, .16, .16);
        }
        // Three tiny gulls above the river.
        for (let i = 0; i < 3; i++) {
          const x = 5.6 + i * .65, y = 5.4 + Math.sin(i) * .4, z = -1.9 + i * .3;
          beam(this.root, M.white, [x - .17, y + .04, z], [x, y, z], .016);
          beam(this.root, M.white, [x, y, z], [x + .17, y + .06, z], .016);
        }
      }
      buildBoat() {
        this.boat = new THREE.Group(); this.boat.userData.dynamic = true; this.root.add(this.boat);
        box(this.boat, M.roof, 0, .16, 0, .48, .18, 1.0);
        box(this.boat, M.white, 0, .32, -.08, .42, .22, .62);
        box(this.boat, M.teal, 0, .39, -.08, .33, .12, .63);
        box(this.boat, M.white, 0, .49, -.08, .46, .055, .67);
        box(this.boat, M.red, 0, .56, -.18, .08, .14, .1);
        this.boat.userData.dynamic = false; batchStatic(this.boat); this.boat.userData.dynamic = true;
        this.boatPosition = new V3(); this.boatTangent = new V3();
      }
      update(t, dt, hours, lights) {
        this.root.position.y = Math.sin(t * .62) * .12;
        this.root.rotation.z = Math.sin(t * .21) * .006;
        this.eye.update(t);
        this.bigben.update(hours, lights);
        const u = .12 + ((Math.sin(t * .055) + 1) * .5) * .64;
        this.river.getPoint(u, this.boatPosition); this.river.getTangent(u, this.boatTangent);
        this.boat.position.set(this.boatPosition.x, .1 + Math.sin(t * 2) * .017, this.boatPosition.z);
        this.boat.rotation.y = Math.atan2(this.boatTangent.x, this.boatTangent.z);
        this.waterRipples.position.y = Math.sin(t * 1.3) * .008;
        this.waterRipples.children.forEach((r, i) => { r.scale.x = .16 + .1 * Math.sin(t * 1.6 + i * 2); });
      }
    }

    function radialTexture(color = '255,244,215') {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d'), glow = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
      glow.addColorStop(0, `rgba(${color},.8)`); glow.addColorStop(.28, `rgba(${color},.42)`); glow.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }

    class Cloudscape {
      constructor(scene) {
        this.clouds = [];
        const places = [[-10.3, 1.7, -3.6, 1.05], [8.8, -.9, 4.8, .85], [-7.8, -3.4, 5, 1.15], [6.6, 6.3, -7.8, .75], [-5, 6.5, -7.2, .52], [1.5, -4.3, -4.5, .8], [9.3, 2.1, -3.1, .67]];
        places.forEach(([x, y, z, s], i) => {
          const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); scene.add(g);
          for (const [cx, cy, cz, r] of [[-1.1, 0, 0, .8], [-.35, .25, 0, 1], [.55, .16, 0, .9], [1.3, -.08, .02, .65], [0, -.16, .3, .8]]) {
            shape(g, G.cloud, M.cloud, cx, cy, cz, r, r * .62, r * .64).castShadow = false;
          }
          batchStatic(g);
          this.clouds.push({ g, x, y, phase: i * 1.7 });
        });
      }
      update(t) {
        for (const { g, x, y, phase } of this.clouds) {
          g.position.x = x + Math.sin(t * .07 + phase) * .65;
          g.position.y = y + Math.sin(t * .22 + phase) * .16;
        }
      }
    }

    class SeasonController {
      constructor(onChange) {
        this.selected = 0;
        this.weights = [1, 0, 0, 0];
        this.age = 0;
        this.duration = 30;
        this.auto = true;
        this.onChange = onChange;
      }
      select(index, manual = true) {
        this.selected = ((index % 4) + 4) % 4;
        this.age = 0;
        if (manual) this.auto = false;
        this.onChange(this.selected, this.auto);
      }
      toggleAuto() {
        this.auto = !this.auto; this.age = 0;
        this.onChange(this.selected, this.auto);
        toast(this.auto ? 'Let the seasons wander · 30 seconds each' : 'Stay a little longer · automatic seasons paused');
      }
      update(dt) {
        if (this.auto) {
          this.age += dt;
          if (this.age >= this.duration) {
            const steps = Math.floor(this.age / this.duration), remainder = this.age % this.duration;
            this.select(this.selected + steps, false); this.age = remainder;
          }
        }
        // Exponential damping is independent of frame rate. The four weights
        // keep a unit sum, blending weather, trees, terrain, fog and sky together.
        const blend = 1 - Math.exp(-dt * 1.3);
        for (let i = 0; i < 4; i++) this.weights[i] += ((i === this.selected ? 1 : 0) - this.weights[i]) * blend;
      }
    }

    class WeatherSystem {
      constructor(scene, compact) {
        this.leafCount = compact ? 140 : 240;
        this.snowCount = compact ? 650 : 1100;
        this.root = new THREE.Group(); scene.add(this.root);
        const leafShape = new THREE.Shape();
        const outline = [[0, -.42], [-.06, -.13], [-.42, -.2], [-.33, .04], [-.62, .3], [-.3, .32], [-.34, .66], [-.12, .5], [0, .94], [.14, .5], [.36, .67], [.3, .32], [.62, .3], [.33, .04], [.42, -.2], [.06, -.13]];
        outline.forEach(([x, y], i) => i ? leafShape.lineTo(x, y) : leafShape.moveTo(x, y)); leafShape.closePath();
        this.leafMaterial = toon('#ffffff', { side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
        this.leaves = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape), this.leafMaterial, this.leafCount);
        this.leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.leaves.frustumCulled = false;
        this.leafData = new Float32Array(this.leafCount * 10);
        const leafColors = ['#c7773c', '#d69245', '#bb5c3f', '#d6ae67'];
        const col = new THREE.Color();
        for (let i = 0; i < this.leafCount; i++) {
          const k = i * 10;
          this.leafData.set([range(-9, 9), range(-3, 12), range(-6, 6), range(.5, 1.2), range(0, TAU), range(0, TAU), range(0, TAU), range(0, TAU), range(.1, .2), range(.4, 1.2)], k);
          this.leaves.setColorAt(i, col.set(leafColors[i % leafColors.length]));
        }
        this.root.add(this.leaves);
        const snowCanvas = document.createElement('canvas'); snowCanvas.width = snowCanvas.height = 64;
        const snowCtx = snowCanvas.getContext('2d');
        const glow = snowCtx.createRadialGradient(32, 32, 0, 32, 32, 30);
        glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(.28, 'rgba(255,255,255,.95)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
        snowCtx.fillStyle = glow; snowCtx.fillRect(0, 0, 64, 64);
        snowCtx.strokeStyle = 'rgba(255,255,255,.8)'; snowCtx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; snowCtx.beginPath(); snowCtx.moveTo(32 - Math.cos(a) * 21, 32 - Math.sin(a) * 21); snowCtx.lineTo(32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21); snowCtx.stroke(); }
        this.snowTexture = new THREE.CanvasTexture(snowCanvas);
        const snowPositions = new Float32Array(this.snowCount * 3);
        this.snowSpeed = new Float32Array(this.snowCount);
        for (let i = 0; i < this.snowCount; i++) {
          snowPositions.set([range(-10, 10), range(-4, 12), range(-7, 7)], i * 3);
          this.snowSpeed[i] = range(.42, 1.1);
        }
        const snowGeometry = new THREE.BufferGeometry();
        snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
        this.snowMaterial = new THREE.PointsMaterial({ color: '#ffffff', size: compact ? 2.6 : 3.2, map: this.snowTexture, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: false });
        this.snow = new THREE.Points(snowGeometry, this.snowMaterial); this.snow.frustumCulled = false; this.root.add(this.snow);
        this.mists = [];
        const mistTexture = radialTexture('244,245,229');
        for (let i = 0; i < 14; i++) {
          const material = new THREE.SpriteMaterial({ map: mistTexture, color: '#f4f0db', transparent: true, opacity: 0, depthWrite: false });
          const mist = new THREE.Sprite(material);
          mist.position.set(range(-9, 9), range(-.8, 1), range(-5, 5));
          mist.scale.set(range(6, 11), range(1.4, 2.4), 1);
          this.root.add(mist); this.mists.push({ mist, x: mist.position.x, y: mist.position.y, phase: i * 1.9 });
        }
        this.color = new THREE.Color();
      }
      update(dt, t, weights, daylight) {
        const autumn = weights[2], winter = weights[3], spring = weights[0];
        this.leaves.visible = autumn > .006;
        this.leafMaterial.opacity = autumn * .95;
        if (this.leaves.visible) {
          for (let i = 0; i < this.leafCount; i++) {
            const k = i * 10, d = this.leafData;
            // A persistent object pool: gravity, a shared breeze and individual
            // oscillation produce drifting paths. Offscreen leaves wrap to the top.
            d[k + 1] -= d[k + 3] * dt;
            d[k] += (Math.sin(t * .9 + d[k + 4]) * .32 + .14) * dt;
            d[k + 2] += Math.cos(t * .6 + d[k + 4]) * dt * .13;
            d[k + 5] += dt * d[k + 9]; d[k + 6] += dt * .72; d[k + 7] += dt * .46;
            if (d[k + 1] < -4) { d[k + 1] = 12; d[k] = range(-9, 9); d[k + 2] = range(-6, 6); }
            if (d[k] > 10) d[k] = -10;
            transform.position.set(d[k] + Math.sin(t * 1.1 + d[k + 4]) * .24, d[k + 1], d[k + 2]);
            transform.rotation.set(d[k + 5], d[k + 6], d[k + 7]); transform.scale.setScalar(d[k + 8]); transform.updateMatrix();
            this.leaves.setMatrixAt(i, transform.matrix);
          }
          this.leaves.instanceMatrix.needsUpdate = true;
        }
        this.snow.visible = winter > .006;
        this.snowMaterial.opacity = winter * .92;
        if (this.snow.visible) {
          const positions = this.snow.geometry.attributes.position.array;
          for (let i = 0; i < this.snowCount; i++) {
            const k = i * 3;
            positions[k + 1] -= this.snowSpeed[i] * dt;
            positions[k] += Math.sin(t * .65 + i * 1.7) * dt * .16;
            positions[k + 2] += Math.cos(t * .55 + i) * dt * .08;
            if (positions[k + 1] < -4) { positions[k + 1] = 12; positions[k] = range(-10, 10); }
          }
          this.snow.geometry.attributes.position.needsUpdate = true;
        }
        for (const { mist, x, y, phase } of this.mists) {
          mist.position.x = x + Math.sin(t * .08 + phase) * 1.1;
          mist.position.y = y + Math.sin(t * .2 + phase) * .1;
          mist.material.opacity = (spring * .18 + winter * .035) * (.7 + Math.sin(t * .22 + phase) * .15) * (.65 + daylight * .35);
        }
        // A weighted palette transition keeps the island coherent with its weather.
        for (const [material, key] of [[M.grass, 'groundColor'], [M.foliage, 'leafColor'], [M.foliage2, 'leafColor2']]) {
          material.color.setRGB(0, 0, 0);
          for (let i = 0; i < 4; i++) this.addColor(material.color, SEASONS[i][key], weights[i]);
        }
        M.snow.opacity = winter * .96;
        M.snow.visible = winter > .005;
      }
      addColor(out, col, w) { out.r += col.r * w; out.g += col.g * w; out.b += col.b * w; }
      get activeParticles() { return (this.leaves.visible ? this.leafCount : 0) + (this.snow.visible ? this.snowCount : 0); }
    }

    class DayNightCycle {
      constructor(scene) {
        this.time = .1535 * 15;
        this.duration = 15;
        this.phase = .1535;
        this.daylight = 1;
        this.lights = 0;
        this.hours = 9.684;
        this.ambient = new THREE.HemisphereLight('#fff4db', '#829481', 2.15); scene.add(this.ambient);
        this.sunlight = new THREE.DirectionalLight('#fff0ce', 3.2);
        this.sunlight.position.set(-8, 15, 9); this.sunlight.castShadow = true;
        this.sunlight.shadow.mapSize.set(1024, 1024);
        Object.assign(this.sunlight.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
        this.sunlight.shadow.normalBias = .045; this.sunlight.shadow.bias = -.00015;
        this.sunlight.shadow.camera.updateProjectionMatrix();
        scene.add(this.sunlight);
        this.fill = new THREE.DirectionalLight('#e8f0e1', .7); this.fill.position.set(9, 5, -8); scene.add(this.fill);
        this.landmarkLights = [];
        for (const [x, y, z, power] of [[-1.15, 5.5, 1.25, 5], [4.1, 2, 2.1, 4], [3.65, 3.5, -1.8, 3]]) {
          const light = new THREE.PointLight('#ffd18d', 0, 7, 2); light.position.set(x, y, z); scene.add(light);
          this.landmarkLights.push({ light, power });
        }
        this.sun = new THREE.Group(); scene.add(this.sun);
        const sunMat = new THREE.MeshBasicMaterial({ color: '#efc988', fog: false });
        sphere(this.sun, sunMat, 0, 0, 0, .67).castShadow = false;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: '#f3cd90', transparent: true, opacity: .34, depthWrite: false, fog: false }));
        glow.scale.set(4.5, 4.5, 1); this.sun.add(glow);
        this.moon = new THREE.Group(); scene.add(this.moon);
        sphere(this.moon, new THREE.MeshBasicMaterial({ color: '#f5eed4', fog: false }), 0, 0, 0, .46).castShadow = false;
        const moonCrater = new THREE.MeshBasicMaterial({ color: '#e0dfce', fog: false });
        sphere(this.moon, moonCrater, -.12, .12, .41, .085, .1, .015).castShadow = false;
        sphere(this.moon, moonCrater, .13, -.11, .42, .065, .05, .015).castShadow = false;
        const starPositions = new Float32Array(165 * 3);
        for (let i = 0; i < 165; i++) starPositions.set([range(-30, 30), range(2, 23), range(-26, -12)], i * 3);
        const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fff6dd', size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })); scene.add(this.stars);
        this.colors = {
          nightTop: new THREE.Color('#243947'), nightMid: new THREE.Color('#536975'), nightBottom: new THREE.Color('#9ea79a'),
          dayTop: new THREE.Color('#f4f1e6'), dayBottom: new THREE.Color('#f1dfca'),
          duskTop: new THREE.Color('#969ca8'), duskMid: new THREE.Color('#d4b3a3'), duskBottom: new THREE.Color('#edd0ad'),
          dayLight: new THREE.Color('#fff0cf'), duskLight: new THREE.Color('#f6bc94'), moonLight: new THREE.Color('#b8cfdf'), windowDay: new THREE.Color('#4d6765'), windowNight: new THREE.Color('#b5a877'),
          top: new THREE.Color(), middle: new THREE.Color(), bottom: new THREE.Color(), seasonal: new THREE.Color(), fog: new THREE.Color()
        };
      }
      update(dt, weights, scene) {
        this.time = (this.time + dt) % this.duration;
        this.phase = this.time / this.duration;
        const angle = this.phase * TAU, altitude = Math.sin(angle);
        this.daylight = smooth(-.28, .28, altitude);
        const twilight = (1 - smooth(.03, .5, Math.abs(altitude))) * .8;
        // Dusk/dawn lamp envelopes are deliberately offset from sunrise: lamps
        // warm up as dusk begins and finish fading out just before dawn.
        this.lights = smooth(.385, .475, this.phase) * (1 - smooth(.90, .97, this.phase));
        this.hours = (this.phase * 24 + 6) % 24;
        const c = this.colors;
        c.seasonal.setRGB(0, 0, 0);
        for (let i = 0; i < 4; i++) {
          c.seasonal.r += SEASONS[i].skyColor.r * weights[i]; c.seasonal.g += SEASONS[i].skyColor.g * weights[i]; c.seasonal.b += SEASONS[i].skyColor.b * weights[i];
        }
        c.top.copy(c.nightTop).lerp(c.dayTop, this.daylight).lerp(c.duskTop, twilight * .62);
        c.middle.copy(c.nightMid).lerp(c.seasonal, this.daylight).lerp(c.duskMid, twilight);
        c.bottom.copy(c.nightBottom).lerp(c.dayBottom, this.daylight).lerp(c.duskBottom, twilight);
        c.fog.copy(c.middle); scene.fog.color.copy(c.fog);
        let fog = 0;
        for (let i = 0; i < 4; i++) fog += SEASONS[i].fog * weights[i];
        scene.fog.density = fog * (.7 + .3 * this.daylight);
        this.ambient.intensity = .85 + this.daylight * 1.3;
        this.sunlight.intensity = .28 + this.daylight * (2.5 + weights[1] * .7);
        this.sunlight.color.copy(c.moonLight).lerp(c.dayLight, this.daylight).lerp(c.duskLight, twilight * .75);
        this.sunlight.position.set(Math.cos(angle) * -12, 8 + Math.max(altitude, 0) * 13, 8 + Math.sin(angle * .5) * 6);
        this.fill.intensity = .55 + (1 - this.daylight) * .2;
        M.window.color.copy(c.windowDay).lerp(c.windowNight, this.lights);
        M.window.emissiveIntensity = .03 + this.lights * 1.25;
        M.lamp.emissiveIntensity = .08 + this.lights * 2.3;
        M.eyeLight.emissiveIntensity = .03 + this.lights * 1.1;
        for (const { light, power } of this.landmarkLights) light.intensity = this.lights * power;
        this.sun.position.set(Math.cos(angle) * -11, Math.sin(angle) * 4.5 + 2, -8);
        this.moon.position.set(Math.cos(angle + Math.PI) * -11, Math.sin(angle + Math.PI) * 4.5 + 2, -8);
        this.sun.visible = altitude > -.2; this.moon.visible = altitude < .17;
        this.stars.material.opacity = (1 - this.daylight) * .65;
      }
      next() {
        const phases = [.24, .47, .74, .965, 1.24];
        const next = phases.find(p => p > this.phase + .055) || 1.24;
        this.time = (next % 1) * this.duration;
        toast('A new light on a little London');
      }
      updateUI() {
        const c = this.colors, style = document.documentElement.style;
        style.setProperty('--sky-top', '#' + c.top.getHexString());
        style.setProperty('--sky-middle', '#' + c.middle.getHexString());
        style.setProperty('--sky-bottom', '#' + c.bottom.getHexString());
        document.body.classList.toggle('night', this.daylight < .28);
        const p = this.phase;
        const phaseName = p < .07 || p > .95 ? 'First light' : p < .34 ? 'Morning light' : p < .43 ? 'Golden afternoon' : p < .54 ? 'A softer sunset' : p < .9 ? 'Under the stars' : 'Almost morning';
        const hours = Math.floor(this.hours), minutes = Math.floor((this.hours % 1) * 60);
        $('phase-name').textContent = phaseName;
        $('clock-time').textContent = String(hours % 12 || 12).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
        $('clock-suffix').textContent = hours >= 12 ? ' PM' : ' AM';
        $('time-icon-use').setAttribute('href', this.daylight < .28 ? '#i-moon' : p > .42 || p < .065 ? '#i-dusk' : '#i-summer');
        $('day-progress').style.width = (p * 100).toFixed(2) + '%';
        $('time-button').setAttribute('aria-label', phaseName + '. Jump to the next time of day');
      }
    }

    class CameraController {
      constructor(camera, canvas, onMove) {
        this.camera = camera;
        this.canvas = canvas;
        this.yaw = this.targetYaw = .48;
        this.elevation = this.targetElevation = .49;
        this.zoom = this.targetZoom = 1;
        this.target = new V3(0, 1.7, 0);
        this.pointers = new Map();
        this.lastPinch = 0;
        canvas.addEventListener('pointerdown', e => {
          if (e.button !== 0 && e.pointerType === 'mouse') return;
          this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          canvas.setPointerCapture(e.pointerId); this.lastPinch = 0;
          canvas.focus({ preventScroll: true }); onMove();
        });
        canvas.addEventListener('pointermove', e => {
          const previous = this.pointers.get(e.pointerId);
          if (!previous) return;
          const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
          previous.x = e.clientX; previous.y = e.clientY;
          if (this.pointers.size === 2) {
            const points = Array.from(this.pointers.values()), distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            if (this.lastPinch > 0) this.targetZoom = clamp(this.targetZoom * distance / this.lastPinch, .72, 1.45);
            this.lastPinch = distance;
          } else {
            this.targetYaw -= dx * .006;
            this.targetElevation = clamp(this.targetElevation + dy * .002, .28, .77);
          }
        });
        const release = e => { this.pointers.delete(e.pointerId); this.lastPinch = 0; };
        canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('lostpointercapture', release);
        canvas.addEventListener('wheel', e => { e.preventDefault(); this.targetZoom = clamp(this.targetZoom * Math.exp(-e.deltaY * .001), .72, 1.45); }, { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
      }
      reset() { this.targetYaw = .48; this.targetElevation = .49; this.targetZoom = 1; toast('A fresh perspective'); }
      update(dt) {
        const damping = 1 - Math.exp(-dt * 9);
        this.yaw += (this.targetYaw - this.yaw) * damping;
        this.elevation += (this.targetElevation - this.elevation) * damping;
        this.zoom += (this.targetZoom - this.zoom) * damping;
        const radius = 32, cos = Math.cos(this.elevation);
        this.camera.position.set(Math.sin(this.yaw) * cos * radius, this.target.y + Math.sin(this.elevation) * radius, Math.cos(this.yaw) * cos * radius);
        this.camera.lookAt(this.target);
        if (Math.abs(this.camera.zoom - this.zoom) > .0001) { this.camera.zoom = this.zoom; this.camera.updateProjectionMatrix(); }
      }
      resize(width, height) {
        const aspect = width / height;
        const span = Math.max(height <= 440 ? 17 : 19.7, (width <= 600 ? 19.6 : 21) / aspect);
        Object.assign(this.camera, { left: -span * aspect / 2, right: span * aspect / 2, top: span / 2, bottom: -span / 2 });
        const compactLandscape = height <= 440 && width <= 900;
        const offsetX = compactLandscape ? 0 : width > 1000 ? -.112 * width : width > 600 ? -.105 * width : 0;
        const offsetY = width <= 600 && height > 700 ? -.065 * height : width <= 600 && height > 440 ? 0 : height <= 440 ? -.015 * height : -.005 * height;
        this.camera.setViewOffset(width, height, offsetX, offsetY, width, height);
        this.camera.updateProjectionMatrix();
      }
    }

    class AmbientSound {
      constructor() { this.enabled = false; this.context = null; this.suspendTimer = null; }
      async toggle() {
        try {
          clearTimeout(this.suspendTimer);
          if (!this.context) this.create();
          this.enabled = !this.enabled;
          if (this.enabled) {
            await this.context.resume();
            this.volume.gain.setTargetAtTime(.075, this.context.currentTime, .5);
          } else {
            this.volume.gain.setTargetAtTime(0, this.context.currentTime, .12);
            this.suspendTimer = setTimeout(() => { if (!this.enabled) this.context.suspend().catch(() => {}); }, 600);
          }
          $('sound-button').setAttribute('aria-pressed', String(this.enabled));
          $('sound-button').setAttribute('aria-label', this.enabled ? 'Mute ambient sound' : 'Enable ambient sound');
          $('sound-icon-use').setAttribute('href', this.enabled ? '#i-volume' : '#i-muted');
          toast(this.enabled ? 'A soft breeze, a slower pace · sound on' : 'A quiet little world · sound off');
        } catch (_) { this.enabled = false; toast('Sound is unavailable in this browser'); }
      }
      create() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('Web Audio unavailable');
        this.context = new AudioContext();
        const ctx = this.context;
        this.volume = ctx.createGain(); this.volume.gain.value = 0; this.volume.connect(ctx.destination);
        // One reusable, continuous noise loop; no downloaded audio
        // and no new audio nodes during the render loop or seasonal transitions.
        const length = ctx.sampleRate * 4, buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < length; i++) { previous = (previous + (Math.random() * 2 - 1) * .025) / 1.025; data[i] = previous * 6; }
        const seamDifference = data[length - 1] - data[0];
        for (let i = 0; i < length; i++) data[i] -= seamDifference * i / (length - 1);
        const wind = ctx.createBufferSource(); wind.buffer = buffer; wind.loop = true;
        this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 850; this.filter.Q.value = .4;
        wind.connect(this.filter); this.filter.connect(this.volume); wind.start();
        this.sources = [wind];
        const overtone = ctx.createGain(); overtone.gain.value = .055; overtone.connect(this.volume);
        for (const frequency of [196, 293.66, 392]) {
          const oscillator = ctx.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
          oscillator.connect(overtone); oscillator.start(); this.sources.push(oscillator);
        }
      }
      update(weights, daylight) {
        if (!this.context || !this.enabled) return;
        this.filter.frequency.setTargetAtTime(850 * weights[0] + 1450 * weights[1] + 670 * weights[2] + 420 * weights[3], this.context.currentTime, 1);
        this.volume.gain.setTargetAtTime(.055 + .02 * daylight + .012 * weights[2], this.context.currentTime, 1);
      }
      dispose() {
        clearTimeout(this.suspendTimer);
        if (this.context) { this.sources.forEach(s => s.stop()); this.context.close().catch(() => {}); }
      }
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (_) { fail('This little world needs WebGL. Enable hardware acceleration or visit in a current browser, then try again.'); return; }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', 'London island. Drag to rotate, scroll or pinch to zoom. Arrow keys also rotate the view.');
    $('scene').appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#e5e9dd', .012);
    const camera = new THREE.OrthographicCamera(-16, 16, 10, -10, .1, 120);
    const cameraController = new CameraController(camera, renderer.domElement, () => { $('explore-hint')?.classList.add('explored'); });
    const dayNight = new DayNightCycle(scene);
    const island = new Island(scene);
    const cloudscape = new Cloudscape(scene);
    const weather = new WeatherSystem(scene, matchMedia('(max-width: 600px), (max-height: 440px)').matches);
    const audio = new AmbientSound();
    const seasonButtons = Array.from(document.querySelectorAll('[data-season]'));
    const seasons = new SeasonController((index, auto) => {
      const s = SEASONS[index];
      seasonButtons.forEach((button, i) => { button.classList.toggle('selected', i === index); button.setAttribute('aria-pressed', String(i === index)); });
      $('temperature').textContent = s.temp; $('weather-title').textContent = s.title; $('weather-description').textContent = s.description;
      $('humidity').textContent = s.humidity; $('wind').textContent = s.wind;
      $('weather-icon').firstElementChild.setAttribute('href', '#i-' + s.name.toLowerCase());
      $('cycle-button').setAttribute('aria-pressed', String(auto));
      $('cycle-button').setAttribute('aria-label', auto ? 'Pause automatic seasons' : 'Resume automatic seasons');
      $('cycle-button').title = (auto ? 'Pause' : 'Resume') + ' automatic seasons (Space)';
      $('cycle-icon-use').setAttribute('href', auto ? '#i-pause' : '#i-play');
      document.body.dataset.season = s.name.toLowerCase();
    });
    seasonButtons.forEach(button => button.addEventListener('click', () => {
      seasons.select(Number(button.dataset.season));
      toast(SEASONS[seasons.selected].title + ' · ' + SEASONS[seasons.selected].temp + '°C');
    }));
    $('cycle-button').addEventListener('click', () => seasons.toggleAuto());
    $('time-button').addEventListener('click', () => dayNight.next());
    $('reset-button').addEventListener('click', () => cameraController.reset());
    $('brand-reset').addEventListener('click', e => { e.preventDefault(); cameraController.reset(); });
    $('sound-button').addEventListener('click', () => audio.toggle());

    async function toggleFullscreen() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
        else toast('Fullscreen is unavailable in this preview');
      } catch (_) { toast('Fullscreen is unavailable in this preview'); }
    }
    $('fullscreen-button').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => $('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));

    const dialog = $('info-dialog');
    const originalDialog = { title: $('dialog-title').innerHTML, description: $('dialog-description').textContent };
    function showInfo(landmark) {
      const info = {
        bigben: { eyebrow: 'THE HEART OF OUR LITTLE LONDON', title: 'A familiar face.<br><em>A timeless wonder.</em>', text: 'The chimes may be quiet up here, but London’s most familiar clock keeps ticking. Its four faces follow this little world’s time, glowing softly as the sun slips away.' },
        eye: { eyebrow: 'A DIFFERENT WAY TO SEE THE CITY', title: 'Round and round.<br><em>Above the everyday.</em>', text: 'A little turn of the London Eye, a new perspective on everything. Watch the cabins stay upright as the wheel slowly spins, then catch the lights around its rim after sunset.' },
        bridge: { eyebrow: 'WHERE THE LITTLE THAMES WANDERS', title: 'Two towers.<br><em>One little icon.</em>', text: 'Follow the blue ribbons across the Thames to our miniature Tower Bridge. Look for the tiny riverboat below, the pointed rooftops above, and the warm lights that welcome the evening.' }
      }[landmark];
      $('dialog-eyebrow').textContent = info ? info.eyebrow : 'WELCOME TO YOUR LITTLE ESCAPE';
      $('dialog-title').innerHTML = info ? info.title : originalDialog.title;
      $('dialog-description').textContent = info ? info.text : originalDialog.description;
      $('dialog-extra').hidden = !!info;
      if (!dialog.open) dialog.showModal();
    }
    $('help-button').addEventListener('click', () => showInfo());
    $('dialog-close').addEventListener('click', () => dialog.close());
    $('dialog-done').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });

    const landmarks = [
      { element: $('label-bigben'), point: new V3(-1.15, 9.05, -.1), offset: -25 },
      { element: $('label-eye'), point: new V3(3.65, 6.0, -2.4), offset: -20 },
      { element: $('label-bridge'), point: new V3(4.1, 3.65, 2.1), offset: 20 }
    ];
    landmarks.forEach(({ element }) => element.addEventListener('click', () => showInfo(element.dataset.landmark)));
    const projected = new V3();
    let width = innerWidth, height = innerHeight;
    const labelRects = [{ x: 0, y: 0, w: 0 }, { x: 0, y: 0, w: 0 }, { x: 0, y: 0, w: 0 }];
    function updateLabels() {
      if (width <= 600 && height <= 440) return;
      for (let i = 0; i < landmarks.length; i++) {
        const { element, point, offset } = landmarks[i];
        projected.copy(point); island.root.localToWorld(projected); projected.project(camera);
        const x = (projected.x * .5 + .5) * width + offset, y = (-projected.y * .5 + .5) * height - 21;
        const w = i === 0 ? 72 : 89;
        let visible = x > 10 && x + w < width - 12 && y > 75 && y < height - 110;
        if (width > 600 && height > 440 && x < width * .3 && y < height * .65) visible = false;
        for (let j = 0; j < i; j++) if (Math.abs(labelRects[j].x - x) < w + 5 && Math.abs(labelRects[j].y - y) < 27) visible = false;
        element.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
        element.style.opacity = visible ? '1' : '0';
        element.style.pointerEvents = visible ? 'auto' : 'none';
        element.tabIndex = visible ? 0 : -1;
        labelRects[i].x = visible ? x : -1000; labelRects[i].y = y;
      }
    }

    let debugEnabled = new URLSearchParams(location.search).has('debug');
    $('debug').hidden = !debugEnabled;
    document.addEventListener('keydown', e => {
      if (dialog.open || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      if (e.repeat && !key.startsWith('arrow') && !['+', '-', '='].includes(key)) return;
      if (/^[1-4]$/.test(key)) { seasons.select(Number(key) - 1); toast(SEASONS[seasons.selected].title); }
      else if (key === 'd') dayNight.next();
      else if (key === ' ') { e.preventDefault(); seasons.toggleAuto(); }
      else if (key === 'r') cameraController.reset();
      else if (key === 'm') audio.toggle();
      else if (key === 'f') toggleFullscreen();
      else if (key === '?' || key === 'h') showInfo();
      else if (key === '`') { debugEnabled = !debugEnabled; $('debug').hidden = !debugEnabled; }
      else if (key === 'arrowleft') { e.preventDefault(); cameraController.targetYaw += .15; }
      else if (key === 'arrowright') { e.preventDefault(); cameraController.targetYaw -= .15; }
      else if (key === '+' || key === '=') cameraController.targetZoom = clamp(cameraController.targetZoom + .1, .72, 1.45);
      else if (key === '-') cameraController.targetZoom = clamp(cameraController.targetZoom - .1, .72, 1.45);
    });

    function resize() {
      const bounds = $('app').getBoundingClientRect();
      width = Math.max(bounds.width, 1); height = Math.max(bounds.height, 1);
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width <= 600 ? 1.5 : 1.75));
      renderer.setSize(width, height);
      cameraController.resize(width, height);
    }
    const observer = new ResizeObserver(resize); observer.observe($('app'));
    resize(); cameraController.update(1);

    let running = true, contextLost = false, frameId = 0, lastTime = performance.now(), elapsed = 0, uiAge = .2;
    let frames = 0, fpsAge = 0, fps = 60;
    function animate(now) {
      if (!running || contextLost) return;
      frameId = requestAnimationFrame(animate);
      // Timelines use actual elapsed seconds, preserving the exact 15-second day
      // even on slow devices. Cap only particle/interaction integration after a
      // stall. Visibility changes reset the clock to avoid hidden-tab catch-up.
      const realDt = Math.max((now - lastTime) / 1000, 0), dt = Math.min(realDt, .06); lastTime = now;
      elapsed += realDt; uiAge += realDt; fpsAge += realDt; frames++;
      seasons.update(realDt);
      dayNight.update(realDt, seasons.weights, scene);
      island.update(elapsed, dt, dayNight.hours, dayNight.lights);
      cloudscape.update(elapsed);
      weather.update(dt, elapsed, seasons.weights, dayNight.daylight);
      cameraController.update(dt);
      renderer.render(scene, camera);
      updateLabels();
      if (uiAge > .1) {
        uiAge = 0; dayNight.updateUI(); audio.update(seasons.weights, dayNight.daylight);
        $('season-progress').style.strokeDashoffset = String(94.25 * (seasons.auto ? seasons.age / seasons.duration : 0));
      }
      if (fpsAge >= 1) {
        fps = Math.round(frames / fpsAge); frames = 0; fpsAge = 0;
        if (debugEnabled) $('debug').textContent = `${fps} fps · ${weather.activeParticles} particles · ${renderer.info.render.calls} draws · ${renderer.info.memory.geometries} geometries`;
      }
    }
    renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; cancelAnimationFrame(frameId); toast('The clouds are regrouping · restoring the view'); });
    renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; lastTime = performance.now(); if (running) frameId = requestAnimationFrame(animate); toast('Back above the clouds'); });
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden; cancelAnimationFrame(frameId); lastTime = performance.now();
      if (running && !contextLost) frameId = requestAnimationFrame(animate);
      if (audio.context) {
        if (document.hidden) audio.context.suspend().catch(() => {});
        else if (audio.enabled) audio.context.resume().catch(() => {});
      }
    });
    window.addEventListener('pagehide', e => {
      if (e.persisted) return;
      running = false; cancelAnimationFrame(frameId); observer.disconnect(); audio.dispose(); clearTimeout(toastTimeout);
      const geometries = new Set(), materials = new Set(), textures = new Set();
      scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
      Object.values(G).forEach(g => geometries.add(g)); Object.values(M).forEach(m => materials.add(m));
      materials.forEach(m => { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); });
      textures.add(gradient); textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose()); renderer.dispose();
    }, { once: true });

    // Small inspection API for embeds and manual verification; it creates no
    // timers and does not hold extra render resources.
    window.littleLondon = Object.freeze({
      setSeason: index => seasons.select(clamp(Math.floor(Number(index) || 0), 0, 3)),
      setTime: phase => { dayNight.time = (((Number(phase) || 0) % 1 + 1) % 1) * 15; },
      resetView: () => cameraController.reset(),
      getState: () => ({ season: SEASONS[seasons.selected].name, weights: [...seasons.weights], automatic: seasons.auto, seasonAge: seasons.age, phase: dayNight.phase, hours: dayNight.hours, daylight: dayNight.daylight, landmarkLights: dayNight.lights, particles: weather.activeParticles, fps, drawCalls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, cameraYaw: cameraController.yaw, cameraZoom: cameraController.zoom, elapsed })
    });
    dayNight.update(0, seasons.weights, scene); dayNight.updateUI();
    renderer.render(scene, camera); updateLabels();
    $('loading-screen').classList.add('loaded');
    frameId = requestAnimationFrame(animate);
  }

  boot().catch(error => { console.error('Little London could not start:', error); fail('A cloud got in the way. Please reload to bring this little world back to life.'); });
})();
