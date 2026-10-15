/* Tokyo in the Sky — procedural Three.js scene. No models or image textures are used. */
(() => {
  'use strict';

  const THREE = window.THREE;
  const canvas = document.getElementById('scene');
  if (!THREE) {
    document.getElementById('fallback').hidden = false;
    return;
  }

  const C = {
    cream: 0xfff0d5, white: 0xfff9e9, red: 0xd95243, deepRed: 0x9e3540,
    coral: 0xef7950, orange: 0xf4a157, gold: 0xf8c970, plum: 0x58435e,
    roof: 0x32465a, roofEdge: 0x24384b, wood: 0x704951, grass: 0x9aaf77,
    grassLight: 0xc8c88a, grassDark: 0x748f6d, rock: 0x8c766d,
    snow: 0xfff4e1, fuji: 0x81859a, window: 0xffd487
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const toon = (color, extras = {}) => new THREE.MeshToonMaterial({ color, ...extras });
  const rand = (() => { let seed = 271828; return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); })();
  const lerp = THREE.MathUtils.lerp;
  const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function addMesh(parent, geometry, material, position, rotation) {
    const mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function box(parent, size, material, position, rotation) {
    return addMesh(parent, new THREE.BoxGeometry(...size), material, position, rotation);
  }
  function rod(parent, a, b, radius, material, sides = 6) {
    const A = v(...a), B = v(...b), dir = B.clone().sub(A);
    const mesh = addMesh(parent, new THREE.CylinderGeometry(radius, radius, dir.length(), sides), material);
    mesh.position.copy(A.add(B).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), dir.normalize());
    return mesh;
  }
  function cylinder(parent, top, bottom, height, sides, material, position, rotation) {
    return addMesh(parent, new THREE.CylinderGeometry(top, bottom, height, sides), material, position, rotation);
  }
  function blob(parent, material, position, scale, detail = 0) {
    const m = addMesh(parent, new THREE.IcosahedronGeometry(1, detail), material, position);
    m.scale.set(...scale);
    return m;
  }

  class Island {
    constructor() {
      this.group = new THREE.Group();
      this.group.name = 'Floating island';
      this.createLand();
      this.createScenery();
    }
    createLand() {
      const n = 36, outline = [];
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n;
        const ripple = 1 + .055 * Math.sin(5 * a + .4) + .035 * Math.sin(11 * a);
        outline.push([Math.cos(a) * 5.1 * ripple, Math.sin(a) * 3.65 * ripple]);
      }
      const topPositions = [];
      for (let i = 0; i < n; i++) {
        const p = outline[i], q = outline[(i + 1) % n];
        topPositions.push(0, .12, 0, p[0], .12, p[1], q[0], .12, q[1]);
      }
      const topGeo = new THREE.BufferGeometry();
      topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPositions, 3));
      topGeo.computeVertexNormals();
      addMesh(this.group, topGeo, toon(C.grassLight, { side: THREE.DoubleSide }), null);

      const rings = [
        { y: .12, s: 1 }, { y: -.18, s: 1.01 }, { y: -.5, s: .94 },
        { y: -1.15, s: .75 }, { y: -1.88, s: .48 }, { y: -2.55, s: .22 },
        { y: -2.85, s: .035 }
      ];
      const positions = [], colors = [];
      const shades = [0xb5ae83, 0xb39c7b, 0x9f8475, 0x8f746c, 0x78646a, 0x645b69];
      const put = (a, b, c, color) => {
        positions.push(...a, ...b, ...c);
        const shade = new THREE.Color(color).multiplyScalar(.89 + rand() * .18);
        for (let j = 0; j < 3; j++) colors.push(shade.r, shade.g, shade.b);
      };
      for (let r = 0; r < rings.length - 1; r++) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const a = [outline[i][0] * rings[r].s, rings[r].y, outline[i][1] * rings[r].s];
          const b = [outline[j][0] * rings[r].s, rings[r].y, outline[j][1] * rings[r].s];
          const c = [outline[i][0] * rings[r + 1].s, rings[r + 1].y + .065 * Math.sin(i * 2.9 + r), outline[i][1] * rings[r + 1].s];
          const d = [outline[j][0] * rings[r + 1].s, rings[r + 1].y + .065 * Math.sin(j * 2.9 + r), outline[j][1] * rings[r + 1].s];
          put(a, c, b, shades[r]); put(b, c, d, shades[r]);
        }
      }
      const rockGeo = new THREE.BufferGeometry();
      rockGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      rockGeo.computeVertexNormals();
      addMesh(this.group, rockGeo, new THREE.MeshToonMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));

      // Small angular crystals and hanging roots reinforce the floating silhouette.
      const rootMat = toon(0x796366), crystalMat = toon(0xe4b58c);
      for (let i = 0; i < 11; i++) {
        const a = rand() * Math.PI * 2, radius = 1.2 + rand() * 2.1;
        const x = Math.cos(a) * radius, z = Math.sin(a) * radius * .7;
        const length = .25 + rand() * .55;
        cylinder(this.group, .08, .01, length, 5, i % 3 ? rootMat : crystalMat, [x, -2.05 - rand() * .28, z], [Math.PI, 0, rand() * .26]);
      }
    }
    createScenery() {
      const grass1 = toon(C.grass), grass2 = toon(C.grassDark), grass3 = toon(C.grassLight);
      // Flat low-poly patches make the island surface feel planted, not empty.
      for (let i = 0; i < 28; i++) {
        const a = rand() * Math.PI * 2, radius = Math.sqrt(rand());
        const x = Math.cos(a) * radius * 4.55, z = Math.sin(a) * radius * 3.16;
        if (Math.hypot(x * .8, z) < 1.65) continue;
        const patch = cylinder(this.group, .16 + rand() * .28, .17 + rand() * .28, .014, 7, i % 3 ? grass1 : grass2, [x, .135, z]);
        patch.scale.z = .6 + rand() * .8;
      }
      const pebble = toon(0xf1debf), pebble2 = toon(0xb9ae9a);
      for (let i = 0; i < 45; i++) {
        const x = (rand() - .5) * 8.4, z = (rand() - .5) * 5.8;
        if (x * x / 25 + z * z / 12 > .87 || Math.hypot(x, z) < 1.3) continue;
        blob(this.group, i % 3 ? pebble : pebble2, [x, .17, z], [.055 + rand() * .06, .025, .045 + rand() * .04]);
      }
      // A curved stepping-stone path leads toward the tower.
      for (let i = 0; i < 7; i++) {
        const x = -1.6 + i * .47, z = 2.35 - Math.sin(i / 6 * Math.PI) * .85;
        const stone = cylinder(this.group, .19, .2, .035, 8, pebble, [x, .17, z]);
        stone.scale.z = .7;
      }
      const trees = [[-3.75, .75, 1.1], [-4.05, -1.6, .75], [3.8, -.45, .9], [1.6, -2.7, .75], [-.9, -2.8, .62]];
      trees.forEach(([x, z, s], i) => this.createTree(x, z, s, i));
      for (let i = 0; i < 22; i++) {
        const a = rand() * Math.PI * 2, r = 3.1 + rand() * 1.3;
        const x = Math.cos(a) * r, z = Math.sin(a) * r * .69;
        if (x * x / 25 + z * z / 12 > .84) continue;
        const flower = blob(this.group, i % 3 ? toon(C.cream) : toon(C.coral), [x, .21, z], [.06, .075, .06]);
        flower.castShadow = false;
      }
    }
    createTree(x, z, s, seed) {
      const trunk = toon(0x75555b);
      rod(this.group, [x, .12, z], [x + .07 * s, .93 * s, z], .11 * s, trunk);
      const palette = [C.red, C.coral, C.orange, C.gold, C.deepRed];
      const crown = new THREE.Group();
      this.group.add(crown);
      const points = [[0, 1.05, 0, .48], [-.35, 1.1, 0, .32], [.34, 1.18, .03, .34], [0, 1.39, -.12, .3], [.06, .96, .28, .3]];
      points.forEach(([dx, y, dz, r], i) => blob(crown, toon(palette[(seed + i) % palette.length]), [x + dx * s, y * s, z + dz * s], [r * s, r * .86 * s, r * .9 * s], 1));
    }
    update(t) { this.group.position.y = Math.sin(t * 1.1) * .13; this.group.rotation.z = Math.sin(t * .53) * .008; }
  }

  class TokyoTower {
    constructor(parent, lamps) {
      this.group = new THREE.Group(); this.group.position.set(.15, .16, .05); parent.add(this.group);
      const red = toon(C.red), white = toon(C.cream), dark = toon(C.deepRed), gold = toon(C.gold), glass = toon(0x4e6074);
      const levels = [
        { y: 0, w: .83 }, { y: .52, w: .68 }, { y: 1.04, w: .53 },
        { y: 1.6, w: .39 }, { y: 2.15, w: .29 }, { y: 2.74, w: .19 },
        { y: 3.15, w: .13 }
      ];
      // Tapered corner legs and diagonal bracing create a recognizable open lattice.
      for (let k = 0; k < 4; k++) {
        const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
        for (let i = 0; i < levels.length - 1; i++) {
          const a = levels[i], b = levels[i + 1];
          rod(this.group, [sx * a.w, a.y, sz * a.w], [sx * b.w, b.y, sz * b.w], i < 2 ? .07 : .047, i % 2 ? white : red);
        }
      }
      for (let i = 1; i < levels.length - 1; i++) {
        const { y, w } = levels[i], m = i % 2 ? red : white;
        for (let side = 0; side < 4; side++) {
          const a = side * Math.PI / 2, b = (side + 1) * Math.PI / 2;
          rod(this.group, [Math.cos(a + Math.PI / 4) * w * Math.SQRT2, y, Math.sin(a + Math.PI / 4) * w * Math.SQRT2], [Math.cos(b + Math.PI / 4) * w * Math.SQRT2, y, Math.sin(b + Math.PI / 4) * w * Math.SQRT2], .035, m);
        }
      }
      for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i], b = levels[i + 1];
        for (const side of [-1, 1]) {
          rod(this.group, [-a.w, a.y, side * a.w], [b.w, b.y, side * b.w], .019, i % 2 ? red : dark);
          rod(this.group, [a.w, a.y, side * a.w], [-b.w, b.y, side * b.w], .019, i % 2 ? red : dark);
          rod(this.group, [side * a.w, a.y, -a.w], [side * b.w, b.y, b.w], .019, i % 2 ? red : dark);
          rod(this.group, [side * a.w, a.y, a.w], [side * b.w, b.y, -b.w], .019, i % 2 ? red : dark);
        }
      }
      const deck = cylinder(this.group, .48, .55, .22, 8, dark, [0, 2.03, 0]);
      cylinder(this.group, .54, .54, .055, 8, white, [0, 2.18, 0]);
      cylinder(this.group, .47, .47, .045, 8, white, [0, 1.9, 0]);
      deck.castShadow = true;
      const litGlass = new THREE.MeshToonMaterial({ color: C.window, emissive: C.window, emissiveIntensity: 0 });
      lamps.push(litGlass);
      for (let i = 0; i < 8; i++) {
        const a = (i + .5) * Math.PI / 4;
        const pane = box(this.group, [.2, .11, .02], litGlass, [Math.sin(a) * .51, 2.03, Math.cos(a) * .51], [0, a, 0]);
        pane.castShadow = false;
      }
      cylinder(this.group, .065, .13, .65, 6, red, [0, 3.47, 0]);
      cylinder(this.group, .042, .042, .37, 6, white, [0, 3.96, 0]);
      cylinder(this.group, .027, .027, .37, 6, red, [0, 4.31, 0]);
      blob(this.group, gold, [0, 4.51, 0], [.065, .065, .065]);
      const lamp = new THREE.PointLight(0xffaa65, 0, 4.4, 2);
      lamp.position.set(0, 2.25, 0); this.group.add(lamp); lamps.push(lamp);
    }
  }

  class Landmarks {
    constructor(parent, lamps) {
      this.group = new THREE.Group(); parent.add(this.group);
      this.fuji(); this.torii(lamps); this.pagoda(lamps); this.lanterns(lamps);
    }
    fuji() {
      const group = new THREE.Group(); group.position.set(-2.55, .14, -1.15); this.group.add(group);
      const mountain = cylinder(group, 0, 1.36, 2.3, 11, toon(C.fuji, { flatShading: true }), [0, 1.15, 0]);
      mountain.rotation.y = .1;
      const positions = [], n = 11;
      for (let i = 0; i < n; i++) {
        const a = (i + .1) / n * Math.PI * 2, b = (i + 1.1) / n * Math.PI * 2;
        const ya = 1.42 + .12 * Math.sin(i * 2.4), yb = 1.42 + .12 * Math.sin((i + 1) * 2.4);
        const ra = 1.36 * (1 - ya / 2.3), rb = 1.36 * (1 - yb / 2.3);
        positions.push(0, 2.31, 0, Math.cos(a) * ra, ya, Math.sin(a) * ra, Math.cos(b) * rb, yb, Math.sin(b) * rb);
      }
      const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); snowGeo.computeVertexNormals();
      addMesh(group, snowGeo, toon(C.snow, { side: THREE.DoubleSide, flatShading: true }));
      for (let i = 0; i < 3; i++) {
        const hill = cylinder(group, 0, .42 + i * .1, .7 + i * .2, 7, toon(i % 2 ? 0x9a96a0 : 0x8a93a4, { flatShading: true }), [-1.05 + i * .98, .36 + i * .08, .35 + i * .12]);
        hill.rotation.y = i;
      }
    }
    torii(lamps) {
      const g = new THREE.Group(); g.position.set(3.13, .16, 1.05); g.rotation.y = -.23; this.group.add(g);
      const red = toon(C.red), black = toon(C.roofEdge), gold = toon(C.gold);
      for (const x of [-.62, .62]) {
        cylinder(g, .068, .094, 1.43, 8, red, [x, .72, 0]);
        cylinder(g, .11, .11, .13, 8, black, [x, .11, 0]);
        cylinder(g, .085, .085, .06, 8, gold, [x, 1.47, 0]);
      }
      box(g, [1.65, .15, .18], red, [0, 1.48, 0]);
      box(g, [1.9, .15, .27], black, [0, 1.67, 0]);
      box(g, [1.92, .045, .3], red, [0, 1.78, 0]);
      box(g, [1.24, .11, .11], red, [0, 1.15, 0]);
      const glow = new THREE.MeshToonMaterial({ color: C.window, emissive: C.window, emissiveIntensity: 0 }); lamps.push(glow);
      box(g, [.2, .22, .035], glow, [0, 1.38, .12]);
      const light = new THREE.PointLight(0xffb373, 0, 3.2, 2); light.position.set(0, 1.35, .2); g.add(light); lamps.push(light);
    }
    pagoda(lamps) {
      const g = new THREE.Group(); g.position.set(2.9, .15, -1.85); this.group.add(g);
      const wall = toon(0xffe7ca), red = toon(C.deepRed), roof = toon(C.roof), edge = toon(C.roofEdge);
      cylinder(g, .58, .62, .16, 4, toon(0xa59b8d), [0, .09, 0], [0, Math.PI / 4, 0]);
      for (let level = 0; level < 3; level++) {
        const w = .86 - level * .18, base = .18 + level * .64;
        box(g, [w, .48, w], wall, [0, base + .28, 0]);
        for (const x of [-1, 1]) for (const z of [-1, 1]) box(g, [.065, .52, .065], red, [x * w * .43, base + .28, z * w * .43]);
        const roofMesh = cylinder(g, .11, (w + .36) * .71, .32, 4, roof, [0, base + .69, 0], [0, Math.PI / 4, 0]);
        roofMesh.scale.z = 1.05;
        box(g, [w + .41, .055, w + .41], edge, [0, base + .55, 0]);
      }
      cylinder(g, .02, .08, .42, 6, red, [0, 2.18, 0]);
      blob(g, toon(C.gold), [0, 2.43, 0], [.085, .085, .085]);
      const windowMat = new THREE.MeshToonMaterial({ color: C.window, emissive: C.window, emissiveIntensity: 0 }); lamps.push(windowMat);
      for (let level = 0; level < 3; level++) {
        const base = .18 + level * .64, w = .86 - level * .18;
        for (const side of [-1, 1]) {
          box(g, [.18, .24, .015], windowMat, [0, base + .33, side * (w / 2 + .009)]);
          box(g, [.015, .24, .18], windowMat, [side * (w / 2 + .009), base + .33, 0]);
        }
      }
      const light = new THREE.PointLight(0xffaa67, 0, 3.5, 2); light.position.set(0, 1.25, .6); g.add(light); lamps.push(light);
    }
    lanterns(lamps) {
      const locations = [[1.86, 1.75], [-1.65, 2.23], [3.98, .35]];
      const stone = toon(0x8b847c), roof = toon(C.roofEdge);
      const glow = new THREE.MeshToonMaterial({ color: C.window, emissive: C.window, emissiveIntensity: 0 }); lamps.push(glow);
      locations.forEach(([x, z]) => {
        cylinder(this.group, .055, .09, .43, 5, stone, [x, .38, z]);
        box(this.group, [.28, .07, .28], stone, [x, .6, z]);
        box(this.group, [.19, .2, .19], glow, [x, .73, z]);
        cylinder(this.group, 0, .24, .18, 4, roof, [x, .92, z], [0, Math.PI / 4, 0]);
      });
    }
  }

  class MapleLeafSystem {
    constructor(parent, count = 150) {
      this.count = count; this.leaves = []; this.dummy = new THREE.Object3D();
      // One custom maple silhouette, one draw call. Instances are moved and recycled in place.
      const outline = [
        [0, .48], [.1, .24], [.22, .34], [.22, .18], [.43, .2], [.29, .07],
        [.37, -.04], [.17, -.05], [.17, -.21], [.04, -.14], [0, -.41],
        [-.04, -.14], [-.17, -.21], [-.17, -.05], [-.37, -.04], [-.29, .07],
        [-.43, .2], [-.22, .18], [-.22, .34], [-.1, .24]
      ];
      const shape = new THREE.Shape(); shape.moveTo(...outline[0]); outline.slice(1).forEach(p => shape.lineTo(...p)); shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
      this.mesh = new THREE.InstancedMesh(geo, mat, count);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
      parent.add(this.mesh);
      const colors = [0xd64f40, 0xef7250, 0xf59b51, 0xf6bd66, 0xb83f44];
      for (let i = 0; i < count; i++) {
        this.leaves.push(this.makeLeaf(true));
        this.mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      }
      this.mesh.instanceColor.needsUpdate = true;
    }
    makeLeaf(initial) {
      return {
        x: (rand() - .5) * 12.5, y: initial ? rand() * 7 - 1 : 5.5 + rand() * 2,
        z: (rand() - .5) * 9, fall: .38 + rand() * .58, drift: (rand() - .5) * .36,
        sway: .18 + rand() * .5, rate: 1.3 + rand() * 2.1, phase: rand() * Math.PI * 2,
        spin: (rand() - .5) * 2.1, angle: rand() * Math.PI * 2, size: .13 + rand() * .16
      };
    }
    update(dt, time) {
      for (let i = 0; i < this.count; i++) {
        const p = this.leaves[i];
        p.y -= p.fall * dt;
        p.x += (p.drift + Math.sin(time * p.rate + p.phase) * p.sway * .25) * dt;
        p.angle += p.spin * dt;
        if (p.y < -2.1 || Math.abs(p.x) > 7.5) this.leaves[i] = this.makeLeaf(false);
        const q = this.leaves[i];
        this.dummy.position.set(q.x + Math.sin(time * q.rate + q.phase) * q.sway, q.y, q.z + Math.cos(time * .8 + q.phase) * .17);
        this.dummy.rotation.set(Math.sin(time * 1.7 + q.phase) * .8, q.angle, Math.cos(time * q.rate + q.phase) * .55);
        this.dummy.scale.setScalar(q.size);
        this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  class DayNightCycle {
    constructor(scene, renderer, sunLight, ambient, sky, stars, celestial, lamps) {
      this.scene = scene; this.renderer = renderer; this.sunLight = sunLight; this.ambient = ambient;
      this.sky = sky; this.stars = stars; this.celestial = celestial; this.lamps = lamps;
      this.elapsed = 15 * .29; this.speed = 1; this.paused = false;
      this.keys = [
        { p: 0, top: '#768fb0', horizon: '#edbaa5', fog: '#bdabb4', light: '#f4b595', ambient: 1.25, sun: 1.3 },
        { p: .14, top: '#9dc9d1', horizon: '#f9dcac', fog: '#e9d7ba', light: '#ffe5bc', ambient: 2.1, sun: 2.35 },
        { p: .29, top: '#86c6d8', horizon: '#f9dfb4', fog: '#e9ddc3', light: '#fff0cf', ambient: 2.25, sun: 2.55 },
        { p: .43, top: '#dda5aa', horizon: '#ffce9b', fog: '#e7bbb2', light: '#ffb983', ambient: 1.75, sun: 1.9 },
        { p: .55, top: '#755f8e', horizon: '#e99388', fog: '#a47d9d', light: '#ef8b78', ambient: .9, sun: .65 },
        { p: .68, top: '#273f66', horizon: '#71617e', fog: '#526078', light: '#8292be', ambient: .42, sun: .15 },
        { p: .82, top: '#1d345b', horizon: '#51577e', fog: '#465475', light: '#809bc5', ambient: .38, sun: .12 },
        { p: .94, top: '#596b91', horizon: '#ca92a2', fog: '#8f849e', light: '#d9a5a0', ambient: .8, sun: .5 },
        { p: 1, top: '#768fb0', horizon: '#edbaa5', fog: '#bdabb4', light: '#f4b595', ambient: 1.25, sun: 1.3 }
      ];
      this.top = new THREE.Color(); this.horizon = new THREE.Color(); this.fog = new THREE.Color();
      this.lightColor = new THREE.Color(); this.update(0);
    }
    update(dt) {
      if (!this.paused) this.elapsed += dt * this.speed;
      const p = (this.elapsed % 15) / 15;
      let i = 0; while (i < this.keys.length - 2 && p > this.keys[i + 1].p) i++;
      const a = this.keys[i], b = this.keys[i + 1];
      // Smoothstep on each palette interval avoids abrupt changes in sky, fog and light.
      const t = smooth(a.p, b.p, p);
      this.top.set(a.top).lerp(new THREE.Color(b.top), t);
      this.horizon.set(a.horizon).lerp(new THREE.Color(b.horizon), t);
      this.fog.set(a.fog).lerp(new THREE.Color(b.fog), t);
      this.lightColor.set(a.light).lerp(new THREE.Color(b.light), t);
      this.sky.topColor.value.copy(this.top);
      this.sky.horizonColor.value.copy(this.horizon);
      this.scene.background.copy(this.horizon);
      this.scene.fog.color.copy(this.fog);
      this.ambient.intensity = lerp(a.ambient, b.ambient, t);
      this.sunLight.intensity = lerp(a.sun, b.sun, t);
      this.sunLight.color.copy(this.lightColor);
      const angle = p * Math.PI * 2;
      this.sunLight.position.set(-Math.cos(angle) * 12, Math.sin(angle) * 12 + 7, 10);
      this.celestial.sun.position.set(-Math.cos(angle) * 24, Math.sin(angle) * 14 + 2, -22);
      this.celestial.moon.position.set(Math.cos(angle) * 24, -Math.sin(angle) * 14 + 2, -22);
      this.celestial.sun.visible = Math.sin(angle) > -.12;
      this.celestial.moon.visible = Math.sin(angle) < .15;
      this.stars.material.opacity = smooth(.54, .72, p) * (1 - smooth(.89, .99, p)) * .83;
      // Lamps fade on during dusk and fade out before dawn; emissive windows match point lights.
      const lampLevel = smooth(.42, .57, p) * (1 - smooth(.89, .99, p));
      for (const lamp of this.lamps) {
        if (lamp.isLight) lamp.intensity = lampLevel * 2.1;
        else lamp.emissiveIntensity = lampLevel * 2.15;
      }
      let label = 'Golden morning', icon = '☀';
      if (p >= .18 && p < .39) label = 'Sunny afternoon';
      else if (p >= .39 && p < .58) { label = 'Amber sunset'; icon = '◒'; }
      else if (p >= .58 && p < .9) { label = 'Moonlit night'; icon = '☾'; }
      else if (p >= .9 || p < .07) { label = 'Soft dawn'; icon = '☼'; }
      document.getElementById('phase-label').textContent = label;
      document.getElementById('phase-icon').textContent = icon;
      document.getElementById('progress-fill').style.width = `${p * 100}%`;
    }
  }

  function makeSky(scene) {
    const uniforms = { topColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() } };
    const material = new THREE.ShaderMaterial({
      uniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 topColor;uniform vec3 horizonColor;varying vec3 vDir;void main(){float h=smoothstep(-0.35,0.85,vDir.y);vec3 c=mix(horizonColor,topColor,h);c=mix(c,vec3(1.0,0.93,0.82),0.09*(1.0-smoothstep(-0.12,0.3,vDir.y)));gl_FragColor=vec4(c,1.0);}'
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(65, 24, 16), material);
    sky.renderOrder = -100; scene.add(sky);
    return { sky, uniforms };
  }
  function makeStars(scene) {
    const pts = [];
    for (let i = 0; i < 240; i++) {
      const a = rand() * Math.PI * 2, elevation = .08 + rand() * 1.25;
      pts.push(Math.sin(a) * Math.cos(elevation) * 54, Math.sin(elevation) * 54, Math.cos(a) * Math.cos(elevation) * 54);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff2d5, size: .23, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }));
    scene.add(stars); return stars;
  }
  function makeCelestial(scene) {
    const sun = new THREE.Group(), moon = new THREE.Group(); scene.add(sun, moon);
    addMesh(sun, new THREE.SphereGeometry(2.35, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe4a5, fog: false }));
    addMesh(sun, new THREE.SphereGeometry(3.5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd99d, transparent: true, opacity: .13, depthWrite: false, fog: false }));
    addMesh(moon, new THREE.SphereGeometry(1.8, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffefdd, fog: false }));
    addMesh(moon, new THREE.SphereGeometry(2.5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe4e9ff, transparent: true, opacity: .12, depthWrite: false, fog: false }));
    return { sun, moon };
  }
  function makeClouds(scene) {
    const clouds = new THREE.Group(); scene.add(clouds);
    const white = toon(0xfff3df, { transparent: true, opacity: .83, depthWrite: false });
    const pink = toon(0xf4d8d2, { transparent: true, opacity: .63, depthWrite: false });
    const places = [[-8, -1.5, -5, 1.4], [7.8, -2.4, -4, 1.1], [-6.6, -3.5, 3, 1.25], [7, -3.1, 4, 1.5], [0, -4.1, -6, 1.6]];
    places.forEach(([x, y, z, s], j) => {
      const g = new THREE.Group(); g.position.set(x, y, z); clouds.add(g);
      for (let i = 0; i < 5; i++) {
        const m = blob(g, i % 3 ? white : pink, [(i - 2) * .78 * s, Math.sin(i * 1.8) * .12 * s, (rand() - .5) * .3], [.95 * s, .37 * s, .55 * s], 1);
        m.castShadow = false; m.receiveShadow = false;
      }
      g.userData.phase = j * 1.8;
    });
    return clouds;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    document.getElementById('fallback').hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f9dfb4');
  scene.fog = new THREE.Fog('#e9ddc3', 23, 66);
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 140);
  const sky = makeSky(scene), stars = makeStars(scene), celestial = makeCelestial(scene), clouds = makeClouds(scene);
  const ambient = new THREE.HemisphereLight(0xfff3df, 0x8a7488, 2);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xffeac9, 2.4);
  sunLight.position.set(-6, 12, 9);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -10; sunLight.shadow.camera.right = 10;
  sunLight.shadow.camera.top = 10; sunLight.shadow.camera.bottom = -10;
  sunLight.shadow.camera.near = .5; sunLight.shadow.camera.far = 38;
  sunLight.shadow.bias = -.0005;
  scene.add(sunLight);

  const island = new Island(); scene.add(island.group);
  const lamps = [];
  new TokyoTower(island.group, lamps);
  new Landmarks(island.group, lamps);
  const leaves = new MapleLeafSystem(island.group, 150);
  const cycle = new DayNightCycle(scene, renderer, sunLight, ambient, sky.uniforms, stars, celestial, lamps);

  let azimuth = .57, targetAzimuth = .57, dragging = false, lastX = 0;
  const target = v(0, .42, 0);
  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    camera.aspect = w / h;
    camera.fov = w / h < .9 ? 46 : 37;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize); resize();
  canvas.addEventListener('pointerdown', event => { dragging = true; lastX = event.clientX; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    targetAzimuth -= (event.clientX - lastX) * .006;
    lastX = event.clientX;
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  const speedButton = document.getElementById('speed-button');
  const pauseButton = document.getElementById('pause-button');
  function setSpeed() {
    cycle.speed = cycle.speed === 1 ? 2 : cycle.speed === 2 ? 4 : 1;
    speedButton.textContent = `${cycle.speed}×`;
    speedButton.setAttribute('aria-label', `Change time speed, currently ${cycle.speed} times`);
  }
  speedButton.addEventListener('click', setSpeed);
  pauseButton.addEventListener('click', () => {
    cycle.paused = !cycle.paused;
    document.getElementById('pause-icon').textContent = cycle.paused ? '▶' : 'Ⅱ';
    pauseButton.setAttribute('aria-label', cycle.paused ? 'Resume animation' : 'Pause animation');
    pauseButton.title = cycle.paused ? 'Resume animation' : 'Pause animation';
  });
  window.addEventListener('keydown', event => {
    if (event.code === 'KeyF') setSpeed();
    if (event.code === 'Space') { event.preventDefault(); pauseButton.click(); }
    if (event.code === 'ArrowLeft') targetAzimuth -= .2;
    if (event.code === 'ArrowRight') targetAzimuth += .2;
  });

  const clock = new THREE.Clock(); let time = 0;
  function animate() {
    requestAnimationFrame(animate);
    // Capping delta prevents huge leaf jumps and particle churn after a hidden tab resumes.
    const dt = Math.min(clock.getDelta(), .05);
    if (!cycle.paused) {
      time += dt;
      island.update(time);
      leaves.update(dt, time);
      clouds.children.forEach((g, i) => { g.position.y += Math.sin(time * .44 + g.userData.phase) * dt * .09; g.rotation.y = Math.sin(time * .13 + i) * .04; });
    }
    cycle.update(dt);
    if (!dragging && !cycle.paused) targetAzimuth += dt * .025;
    azimuth += (targetAzimuth - azimuth) * Math.min(1, dt * 8);
    const portrait = camera.aspect < .9;
    const distance = portrait ? 18.3 : 14.7;
    camera.position.set(Math.sin(azimuth) * distance, portrait ? 8.8 : 7.3, Math.cos(azimuth) * distance);
    camera.lookAt(target);
    sky.sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    renderer.render(scene, camera);
  }
  animate();
})();
