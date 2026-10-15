/* London, Afloat — procedural Three.js scene. No external models or textures. */
(() => {
  'use strict';

  const T = window.THREE;
  const loading = document.getElementById('loading');
  if (!T) {
    loading.textContent = 'Three.js could not load. Please check your connection.';
    return;
  }

  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const color = hex => new T.Color(hex);
  const mat = (hex, opts = {}) => new T.MeshToonMaterial({ color: hex, ...opts });
  const basic = (hex, opts = {}) => new T.MeshBasicMaterial({ color: hex, ...opts });
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  };
  const cyl = (rt, rb, h, sides, m, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(new T.CylinderGeometry(rt, rb, h, sides), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  };
  const ball = (r, m, x = 0, y = 0, z = 0, detail = 0) => {
    const mesh = new T.Mesh(new T.IcosahedronGeometry(r, detail), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; return mesh;
  };
  function rod(a, b, radius, material, sides = 6) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b);
    const mesh = cyl(radius, radius, start.distanceTo(end), sides, material);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.sub(start).normalize());
    return mesh;
  }
  function tube(points, radius, material) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    return new T.Mesh(new T.TubeGeometry(curve, Math.max(18, points.length * 4), radius, 5, false), material);
  }

  // Stable positions and colors make repeated seasons visually continuous.
  let seed = 210219;
  function rand() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
  const rr = (min, max) => mix(min, max, rand());

  const palette = {
    grass: mat('#83ba78'), grassLight: mat('#a8ce82'), moss: mat('#5c946a'),
    soil: mat('#a97059'), clay: mat('#c48a67'), stone: mat('#e7d4ad'),
    cream: mat('#f8ead0'), pale: mat('#fff2d6'), ochre: mat('#d7ae6e'),
    dark: mat('#365367'), navy: mat('#31586e'), teal: mat('#5a9aa2'),
    blue: mat('#85c5cf'), roof: mat('#4e7d87'), brick: mat('#b77a68'),
    gold: mat('#e9b85f'), white: mat('#f6f0d9'), pink: mat('#e9a0a0'),
    river: new T.MeshStandardMaterial({ color: '#70c4cf', metalness: .15, roughness: .28, transparent: true, opacity: .91, side: T.DoubleSide }),
    waterLight: basic('#d4f7ee', { transparent: true, opacity: .52, depthWrite: false }),
    glass: mat('#3c6273', { emissive: '#ffb95e', emissiveIntensity: .02 }),
    lamp: mat('#ffe7a1', { emissive: '#ffc568', emissiveIntensity: .02 }),
    dial: mat('#fff8df', { emissive: '#ffd783', emissiveIntensity: .04 }),
  };

  class Island {
    constructor() {
      this.group = new T.Group();
      this.treeLeaves = [];
      this.riverHighlights = [];
      this.foliageColors = ['#73b97f', '#4dac65', '#d28749', '#b9cad0'].map(color);
      this.foliageMix = new T.Color(0, 0, 0);
      this.createLand(); this.createRiver(); this.createNeighborhood();
    }
    createLand() {
      const g = this.group;
      const layers = [
        [6.95, 7.05, .27, .08, palette.grass],
        [7.05, 6.55, .42, -.26, palette.moss],
        [6.55, 5.35, .68, -.81, palette.clay],
        [5.35, 3.76, .8, -1.53, palette.soil],
        [3.76, 2.22, .74, -2.30, palette.clay],
        [2.22, .72, .66, -2.98, palette.soil],
      ];
      layers.forEach(([top, bottom, h, y, m]) => {
        const piece = cyl(top, bottom, h, 64, m, 0, y, 0);
        piece.scale.z = .73; g.add(piece);
      });
      const cap = cyl(6.9, 6.93, .065, 64, palette.grassLight, 0, .235, 0);
      cap.scale.z = .73; g.add(cap);
      const rim = new T.Mesh(new T.TorusGeometry(6.96, .065, 5, 64), palette.grassLight);
      rim.rotation.x = Math.PI / 2; rim.scale.y = .73; rim.position.y = .25; g.add(rim);
      // A few low polygon rock seams give the underside a carved, storybook silhouette.
      for (let i = 0; i < 30; i++) {
        const a = rr(0, TAU), r = rr(2, 5.9), y = rr(-1.75, -.55);
        const rock = ball(rr(.11, .29), i % 3 ? palette.clay : palette.stone,
          Math.cos(a) * r, y, Math.sin(a) * r * .72);
        rock.scale.set(rr(.7, 1.2), rr(.8, 1.8), rr(.5, 1)); g.add(rock);
      }
    }
    createRiver() {
      const points = [], len = 42;
      for (let i = 0; i <= len; i++) {
        const x = -6.8 + i * 13.6 / len;
        const center = 2.16 + .34 * Math.sin(x * .85) + .1 * Math.sin(x * 2);
        const width = .63 + .13 * Math.cos(x * 1.18);
        points.push(x, .273, center - width, x, .273, center + width);
      }
      const indices = [];
      for (let i = 0; i < len; i++) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(points, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      const water = new T.Mesh(geo, palette.river); water.receiveShadow = true; this.group.add(water);
      for (let i = 0; i < 18; i++) {
        const x = rr(-6, 6), z = 2.16 + .34 * Math.sin(x * .85) + rr(-.39, .39);
        const glint = box(rr(.14, .37), .009, .018, palette.waterLight, x, .285, z);
        glint.rotation.y = rr(-.28, .28); glint.userData.baseX = x;
        this.group.add(glint); this.riverHighlights.push(glint);
      }
      // Tiny pedestrian bridge over the river.
      const foot = box(.35, .1, 1.55, palette.stone, -1.3, .38, 2.15); this.group.add(foot);
      for (const z of [1.45, 2.85]) this.group.add(box(.035, .22, .035, palette.ochre, -1.3, .48, z));
    }
    createNeighborhood() {
      const homes = [
        [-5.4, -.8, .55], [-4.9, -2.15, .8], [-2.55, -3.24, .72],
        [1.8, -3.2, .73], [5.45, -1.7, .56], [5.55, 1.25, .65],
        [-5.5, 1.18, .5], [1.0, 3.15, .53], [3.0, 3.0, .45]
      ];
      homes.forEach(([x, z, s], i) => this.house(x, z, s, i));
      const trees = [
        [-6.02, .35, .82], [-4.15, 1.26, .75], [-3.1, -1.7, .83],
        [-1.55, -3.48, .84], [1.55, -1.6, .68], [2.17, 1.45, .6],
        [5.45, .15, .71], [4.5, -2.6, .8], [.0, 3.55, .68], [-5.3, 2.22, .62]
      ];
      trees.forEach(([x, z, s], i) => this.tree(x, z, s, i));
      for (let i = 0; i < 44; i++) {
        const a = rr(0, TAU), r = rr(3.1, 6.5), x = Math.cos(a) * r, z = Math.sin(a) * r * .69;
        if (z > 1.38 && z < 3.1) continue;
        const m = i % 5 ? palette.pale : palette.pink;
        const flower = ball(rr(.035, .07), m, x, .31, z); this.group.add(flower);
      }
    }
    house(x, z, s, i) {
      const g = new T.Group(); g.position.set(x, .27, z); g.scale.setScalar(s);
      const bodyMat = [palette.cream, palette.brick, palette.pale, palette.ochre][i % 4];
      const roofMat = i % 3 ? palette.roof : palette.navy;
      g.add(box(1, 1.1, .78, bodyMat, 0, .55));
      const roof = new T.Mesh(new T.ConeGeometry(.76, .55, 4), roofMat);
      roof.rotation.y = Math.PI / 4; roof.position.y = 1.36; roof.castShadow = true; g.add(roof);
      for (const wx of [-.27, .27]) {
        const win = box(.15, .21, .018, palette.glass, wx, .78, .402); g.add(win);
        g.add(box(.17, .025, .04, palette.stone, wx, .64, .42));
      }
      g.add(box(.21, .39, .03, palette.dark, 0, .20, .41));
      this.group.add(g);
    }
    tree(x, z, s, i) {
      const g = new T.Group(); g.position.set(x, .27, z); g.scale.setScalar(s);
      g.add(cyl(.075, .115, .9, 6, palette.soil, 0, .45));
      for (let j = 0; j < 3; j++) {
        const crown = ball(.45 + j * .035, mat('#7ab373'), (j - 1) * .28, 1.02 + (j % 2) * .22, j % 2 ? .13 : -.1, 1);
        g.add(crown); this.treeLeaves.push(crown.material);
      }
      if (i % 3 === 0) g.add(ball(.13, palette.pink, -.18, 1.33, .37));
      this.group.add(g);
    }
    update(t, weights) {
      this.group.position.y = Math.sin(t * .88) * .105;
      const c = this.foliageMix.setRGB(0, 0, 0);
      this.foliageColors.forEach((f, i) => { c.r += f.r * weights[i]; c.g += f.g * weights[i]; c.b += f.b * weights[i]; });
      this.treeLeaves.forEach(m => m.color.copy(c));
      this.riverHighlights.forEach((m, i) => { m.position.x = m.userData.baseX + Math.sin(t * 1.4 + i) * .035; });
    }
  }

  function makeClockTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff6db'; c.beginPath(); c.arc(128, 128, 124, 0, TAU); c.fill();
    c.strokeStyle = '#bd8f50'; c.lineWidth = 8; c.beginPath(); c.arc(128, 128, 116, 0, TAU); c.stroke();
    c.strokeStyle = '#395467'; c.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 - Math.PI / 2;
      c.beginPath(); c.moveTo(128 + Math.cos(a) * 91, 128 + Math.sin(a) * 91);
      c.lineTo(128 + Math.cos(a) * 105, 128 + Math.sin(a) * 105); c.stroke();
    }
    c.strokeStyle = '#2d4352'; c.lineCap = 'round'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(128, 128); c.lineTo(118, 72); c.moveTo(128, 128); c.lineTo(170, 151); c.stroke();
    c.fillStyle = '#bd8f50'; c.beginPath(); c.arc(128, 128, 8, 0, TAU); c.fill();
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
  }

  class BigBen {
    constructor() {
      this.group = new T.Group(); this.group.position.set(.15, .27, -.9);
      this.lamps = []; this.build();
    }
    build() {
      const g = this.group;
      g.add(box(1.67, .25, 1.5, palette.stone, 0, .12));
      g.add(box(1.35, 3.42, 1.22, palette.ochre, 0, 1.96));
      g.add(box(1.45, .16, 1.32, palette.cream, 0, .45));
      g.add(box(1.46, .17, 1.32, palette.cream, 0, 3.49));
      for (const x of [-.66, .66]) for (const z of [-.59, .59]) {
        g.add(box(.13, 3.35, .13, palette.cream, x, 1.94, z));
        g.add(box(.21, .14, .21, palette.stone, x, 3.53, z));
      }
      for (const y of [1.05, 1.85, 2.65]) {
        for (const x of [-.32, .32]) {
          const w = box(.24, .46, .035, palette.glass, x, y, .637); g.add(w);
          g.add(box(.32, .055, .08, palette.stone, x, y - .27, .68));
        }
      }
      // Open belfry under the clock room.
      g.add(box(1.55, .17, 1.43, palette.stone, 0, 3.77));
      g.add(box(1.18, .6, 1.08, palette.dark, 0, 4.13));
      for (const x of [-.6, .6]) for (const z of [-.55, .55]) g.add(box(.13, .61, .13, palette.cream, x, 4.15, z));
      g.add(box(1.47, .12, 1.35, palette.cream, 0, 4.49));
      g.add(box(1.31, 1.15, 1.19, palette.ochre, 0, 5.11));
      for (const y of [4.60, 5.64]) g.add(box(1.55, .14, 1.42, palette.stone, 0, y));
      const clockMap = makeClockTexture();
      const faceMat = new T.MeshToonMaterial({ map: clockMap, emissive: '#ffe2a0', emissiveMap: clockMap, emissiveIntensity: .03, side: T.DoubleSide });
      this.lamps.push(faceMat);
      const front = new T.Mesh(new T.CircleGeometry(.46, 40), faceMat); front.position.set(0, 5.13, .613); g.add(front);
      const side = new T.Mesh(new T.CircleGeometry(.46, 40), faceMat); side.rotation.y = Math.PI / 2; side.position.set(.673, 5.13, 0); g.add(side);
      const ringMat = palette.gold;
      const ring1 = new T.Mesh(new T.TorusGeometry(.48, .032, 6, 48), ringMat); ring1.position.set(0, 5.13, .625); g.add(ring1);
      const ring2 = new T.Mesh(new T.TorusGeometry(.48, .032, 6, 48), ringMat); ring2.rotation.y = Math.PI / 2; ring2.position.set(.686, 5.13, 0); g.add(ring2);
      const roof = new T.Mesh(new T.ConeGeometry(.96, .78, 4), palette.roof); roof.rotation.y = Math.PI / 4; roof.position.y = 6.11; roof.castShadow = true; g.add(roof);
      g.add(cyl(.065, .11, .54, 8, palette.gold, 0, 6.66));
      g.add(ball(.13, palette.gold, 0, 6.96));
      for (const x of [-.61, .61]) for (const z of [-.53, .53]) {
        g.add(cyl(.04, .055, .37, 6, palette.cream, x, 5.85, z));
        g.add(ball(.08, palette.gold, x, 6.05, z));
      }
    }
  }

  class LondonEye {
    constructor() {
      this.group = new T.Group(); this.group.position.set(-3.52, .30, -.33);
      this.wheel = new T.Group(); this.wheel.position.y = 2.42;
      this.lamps = []; this.build();
    }
    build() {
      const g = this.group, wheel = this.wheel, r = 1.83;
      g.add(box(2.1, .15, 1.48, palette.stone, 0, .04, 0));
      for (const dx of [-.84, .84]) g.add(rod([dx, .08, .52], [0, 2.43, 0], .073, palette.cream));
      for (const dx of [-.68, .68]) g.add(rod([dx, .08, -.46], [0, 2.43, 0], .05, palette.cream));
      const rimMat = mat('#f8e8ca', { emissive: '#ffd388', emissiveIntensity: .025 });
      this.lamps.push(rimMat);
      for (const z of [-.10, .10]) {
        const ring = new T.Mesh(new T.TorusGeometry(r, .065, 7, 64), rimMat);
        ring.position.z = z; wheel.add(ring);
      }
      const spokeMat = palette.cream;
      for (let i = 0; i < 16; i++) {
        const a = i * TAU / 16, x = Math.sin(a) * r, y = Math.cos(a) * r;
        wheel.add(rod([0, 0, 0], [x, y, 0], .022, spokeMat, 5));
      }
      wheel.add(cyl(.21, .21, .26, 16, palette.ochre, 0, 0, 0));
      wheel.children[wheel.children.length - 1].rotation.x = Math.PI / 2;
      for (let i = 0; i < 16; i++) {
        const a = i * TAU / 16, x = Math.sin(a) * r, y = Math.cos(a) * r;
        const cabin = new T.Group(); cabin.position.set(x, y, .05);
        cabin.add(box(.31, .28, .30, i % 4 ? palette.pale : palette.pink));
        cabin.add(box(.22, .12, .015, palette.glass, 0, .025, .162));
        cabin.add(box(.37, .055, .34, palette.roof, 0, .17));
        wheel.add(cabin);
      }
      g.add(wheel);
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        const spark = ball(.055, palette.lamp, Math.sin(a) * 1.88, 2.42 + Math.cos(a) * 1.88, .11);
        wheel.add(spark);
      }
    }
    update(t) {
      this.wheel.rotation.z = -t * .105;
      // Cabins stay upright while the rim turns.
      this.wheel.children.forEach(c => { if (c.type === 'Group') c.rotation.z = -this.wheel.rotation.z; });
    }
  }

  class TowerBridge {
    constructor() { this.group = new T.Group(); this.group.position.set(3.55, .28, .10); this.lamps = []; this.build(); }
    build() {
      const g = this.group, towerX = [-1.21, 1.21];
      g.add(box(4.7, .26, .82, palette.stone, 0, .31));
      g.add(box(4.52, .055, .90, palette.dark, 0, .47));
      for (const x of towerX) {
        g.add(box(.79, 2.40, .82, palette.stone, x, 1.43));
        g.add(box(.91, .16, .91, palette.cream, x, 2.68));
        for (const dx of [-.35, .35]) for (const dz of [-.36, .36]) {
          g.add(box(.16, .32, .16, palette.stone, x + dx, 2.84, dz));
        }
        const roof = new T.Mesh(new T.ConeGeometry(.69, .63, 4), palette.roof);
        roof.rotation.y = Math.PI / 4; roof.position.set(x, 3.13, 0); roof.castShadow = true; g.add(roof);
        g.add(cyl(.04, .05, .27, 6, palette.gold, x, 3.55));
        for (const y of [.92, 1.58, 2.23]) {
          g.add(box(.22, .34, .015, palette.glass, x, y, .42));
          g.add(box(.28, .045, .06, palette.cream, x, y - .20, .44));
        }
        g.add(box(.9, .12, .92, palette.cream, x, .58));
      }
      g.add(box(2.03, .24, .56, palette.blue, 0, 2.47));
      g.add(box(2.10, .08, .64, palette.cream, 0, 2.64));
      for (const z of [-.36, .36]) {
        for (const side of [-1, 1]) {
          const pts = [];
          for (let i = 0; i <= 8; i++) {
            const u = i / 8, x = side * (1.22 + u * 1.12);
            pts.push([x, 2.44 - 1.63 * u * u, z]);
          }
          g.add(tube(pts, .032, palette.blue));
        }
        for (let i = 0; i < 7; i++) {
          const x = -2.2 + i * .73;
          g.add(box(.035, .26, .035, palette.cream, x, .68, z));
        }
      }
      for (const x of [-2.07, -1.92, 1.92, 2.07]) {
        g.add(cyl(.025, .025, .48, 6, palette.dark, x, .85, .37));
        g.add(ball(.09, palette.lamp, x, 1.13, .37));
      }
      const stripMat = mat('#ffe2a2', { emissive: '#ffbb69', emissiveIntensity: .02 });
      this.lamps.push(stripMat);
      g.add(box(2.05, .04, .05, stripMat, 0, 2.28, .32));
    }
  }

  function makeGlowTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), grad = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,244,202,.88)'); grad.addColorStop(.22, 'rgba(255,216,148,.45)'); grad.addColorStop(1, 'rgba(255,216,148,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(canvas);
  }
  function makeMistTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    grad.addColorStop(0, 'rgba(232,247,247,.55)'); grad.addColorStop(1, 'rgba(232,247,247,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128); return new T.CanvasTexture(canvas);
  }

  class Atmosphere {
    constructor(scene) {
      this.scene = scene; this.clouds = []; this.mist = [];
      const domeMat = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
        uniforms: { topColor: { value: color('#84c7e9') }, bottomColor: { value: color('#f3eacb') } },
        vertexShader: 'varying float vHeight; void main(){ vHeight = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying float vHeight; void main(){ float h = smoothstep(-0.55,0.8,vHeight); gl_FragColor=vec4(mix(bottomColor,topColor,h),1.0); }'
      });
      this.dome = new T.Mesh(new T.SphereGeometry(78, 32, 20), domeMat); this.dome.renderOrder = -100; scene.add(this.dome);
      const glowTex = makeGlowTexture();
      this.sun = ball(1.18, basic('#fff4cc'), 0, 12, -30, 2); scene.add(this.sun);
      this.sunGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: '#ffe1a0', transparent: true, depthWrite: false, fog: false }));
      this.sunGlow.scale.set(8.5, 8.5, 1); scene.add(this.sunGlow);
      this.moon = ball(.92, basic('#f8f2df'), 0, 10, -30, 2); scene.add(this.moon);
      this.moonGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: '#d5e6ff', transparent: true, opacity: .45, depthWrite: false, fog: false }));
      this.moonGlow.scale.set(6, 6, 1); scene.add(this.moonGlow);
      const starPos = [];
      for (let i = 0; i < 210; i++) {
        const a = rr(0, TAU), y = rr(6, 37), r = rr(24, 58);
        starPos.push(Math.cos(a) * r, y, -21 - Math.sin(a) * 25);
      }
      const starsG = new T.BufferGeometry(); starsG.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
      this.starsM = new T.PointsMaterial({ color: '#fff7e7', size: .13, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
      scene.add(new T.Points(starsG, this.starsM));
      const cloudMat = new T.MeshBasicMaterial({ color: '#fff9ea', transparent: true, opacity: .76, depthWrite: false, fog: false });
      for (let i = 0; i < 10; i++) {
        const group = new T.Group();
        group.position.set(rr(-22, 22), rr(5.6, 10.2), rr(-20, -7));
        for (let j = 0; j < 4; j++) {
          const puff = new T.Mesh(new T.SphereGeometry(rr(.8, 1.35), 10, 7), cloudMat);
          puff.scale.set(1.25, .55, .55); puff.position.set((j - 1.5) * .9, rr(-.18, .18), rr(-.2, .2)); group.add(puff);
        }
        scene.add(group); this.clouds.push(group);
      }
      const mistTex = makeMistTexture();
      for (let i = 0; i < 7; i++) {
        const material = new T.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0, depthWrite: false, fog: false });
        const mist = new T.Sprite(material);
        mist.position.set(rr(-6, 6), rr(.2, 2.5), rr(-3, 4)); mist.scale.set(rr(3, 6), rr(1.0, 2.2), 1);
        scene.add(mist); this.mist.push(mist);
      }
    }
    update(dt, t, day, weights, camera) {
      this.dome.position.copy(camera.position);
      this.dome.material.uniforms.topColor.value.copy(day.top);
      this.dome.material.uniforms.bottomColor.value.copy(day.horizon);
      const angle = day.phase * TAU;
      this.sun.position.set(Math.cos(angle) * 22, Math.sin(angle) * 14 + 2, -29);
      this.moon.position.set(-Math.cos(angle) * 22, -Math.sin(angle) * 14 + 2, -29);
      this.sunGlow.position.copy(this.sun.position); this.moonGlow.position.copy(this.moon.position);
      this.sun.visible = this.sunGlow.visible = this.sun.position.y > -1;
      this.moon.visible = this.moonGlow.visible = this.moon.position.y > -1;
      this.sunGlow.material.opacity = clamp((this.sun.position.y + 1) / 5) * .85;
      this.starsM.opacity = day.night * .88;
      this.clouds.forEach((cloud, i) => {
        cloud.position.x += (i % 2 ? 1 : -1) * dt * .15;
        if (cloud.position.x > 24) cloud.position.x = -24;
        if (cloud.position.x < -24) cloud.position.x = 24;
        cloud.position.y += Math.sin(t * .6 + i) * dt * .042;
      });
      this.mist.forEach((m, i) => {
        m.material.opacity = (.08 + .1 * Math.sin(t * .45 + i) ** 2) * weights[0];
        m.position.x += Math.sin(t * .25 + i) * dt * .03;
      });
    }
  }

  // Palette keys interpolate around the full 15-second clock, including dawn and dusk.
  const daylightKeys = [
    { p: 0, top: '#728bb6', horizon: '#f6b395', ambient: .86, sun: .78, night: .08 },
    { p: .12, top: '#89c6e4', horizon: '#f8e8bb', ambient: 1.42, sun: 1.65, night: 0 },
    { p: .37, top: '#83c9e9', horizon: '#e9f0da', ambient: 1.55, sun: 1.8, night: 0 },
    { p: .54, top: '#d88a96', horizon: '#ffd3a0', ambient: 1.08, sun: .9, night: .1 },
    { p: .68, top: '#344770', horizon: '#ab7792', ambient: .52, sun: .18, night: .8 },
    { p: .83, top: '#1a2e55', horizon: '#586e8c', ambient: .43, sun: .08, night: 1 },
    { p: 1, top: '#728bb6', horizon: '#f6b395', ambient: .86, sun: .78, night: .08 },
  ];
  daylightKeys.forEach(k => { k.topColor = color(k.top); k.horizonColor = color(k.horizon); });
  class DayNightCycle {
    constructor(scene) {
      this.clock = 0; this.offset = 0; this.targetOffset = 0;
      this.current = { phase: .27, top: new T.Color(), horizon: new T.Color(), ambient: 1, sun: 1, night: 0 };
      this.sunDayColor = color('#fff2d3'); this.sunDuskColor = color('#ffd1a4');
      this.hemi = new T.HemisphereLight('#e7f5ff', '#7d6954', 1.2); scene.add(this.hemi);
      this.sunLight = new T.DirectionalLight('#fff2d3', 1.6);
      this.sunLight.position.set(-8, 14, 10); this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(512, 512);
      this.sunLight.shadow.camera.left = -11; this.sunLight.shadow.camera.right = 11;
      this.sunLight.shadow.camera.top = 11; this.sunLight.shadow.camera.bottom = -11;
      this.sunLight.shadow.camera.near = .5; this.sunLight.shadow.camera.far = 40;
      this.sunLight.shadow.bias = -.0003; scene.add(this.sunLight);
      this.fill = new T.DirectionalLight('#8fc0dc', .44); this.fill.position.set(7, 5, -9); scene.add(this.fill);
    }
    jump() {
      const phase = ((this.clock / 15 + .27 + this.targetOffset) % 1 + 1) % 1;
      const targetPhase = phase > .56 && phase < .98 ? .28 : .76;
      let delta = targetPhase - phase;
      if (delta > .5) delta -= 1; if (delta < -.5) delta += 1;
      this.targetOffset += delta;
    }
    update(dt, seasonWeights) {
      this.clock += dt;
      // Manual time jumps ease their phase offset; automatic rotation remains one loop per 15 s.
      this.offset += (this.targetOffset - this.offset) * (1 - Math.exp(-dt * 3));
      const phase = ((this.clock / 15 + .27 + this.offset) % 1 + 1) % 1;
      let a = daylightKeys[0], b = daylightKeys[1];
      for (let i = 0; i < daylightKeys.length - 1; i++) {
        if (phase >= daylightKeys[i].p && phase <= daylightKeys[i + 1].p) { a = daylightKeys[i]; b = daylightKeys[i + 1]; break; }
      }
      const u = smooth((phase - a.p) / (b.p - a.p));
      const day = this.current;
      day.phase = phase; day.top.copy(a.topColor).lerp(b.topColor, u);
      day.horizon.copy(a.horizonColor).lerp(b.horizonColor, u);
      day.ambient = mix(a.ambient, b.ambient, u);
      day.sun = mix(a.sun, b.sun, u); day.night = mix(a.night, b.night, u);
      this.hemi.intensity = day.ambient;
      this.sunLight.intensity = day.sun * (1 + seasonWeights[1] * .12);
      this.sunLight.color.copy(this.sunDayColor).lerp(this.sunDuskColor, clamp((phase - .42) / .2));
      this.sunLight.position.set(Math.cos(phase * TAU) * 11, Math.max(4, Math.sin(phase * TAU) * 13), 8);
      this.fill.intensity = .3 + day.night * .38;
      return day;
    }
  }

  class WeatherSystem {
    constructor(scene) {
      this.leaves = []; this.snow = [];
      const shape = new T.Shape();
      shape.moveTo(0, .15); shape.quadraticCurveTo(.14, .08, .12, -.06);
      shape.quadraticCurveTo(.04, -.12, 0, -.18); shape.quadraticCurveTo(-.12, -.07, -.12, .04);
      shape.quadraticCurveTo(-.07, .11, 0, .15);
      const leafGeo = new T.ShapeGeometry(shape);
      leafGeo.translate(0, .015, 0);
      const leafMat = new T.MeshToonMaterial({ color: '#ffffff', side: T.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
      this.leafMesh = new T.InstancedMesh(leafGeo, leafMat, 135);
      this.leafMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.leafMesh.frustumCulled = false; scene.add(this.leafMesh);
      for (let i = 0; i < 135; i++) {
        this.leaves.push(this.spawn('leaf', true));
        this.leafMesh.setColorAt(i, color(['#c8543d', '#d99146', '#ebbc62', '#a9503d'][i % 4]));
      }
      const snowMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false });
      this.snowMesh = new T.InstancedMesh(new T.IcosahedronGeometry(.052, 0), snowMat, 210);
      this.snowMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.snowMesh.frustumCulled = false; scene.add(this.snowMesh);
      for (let i = 0; i < 210; i++) this.snow.push(this.spawn('snow', true));
      this.dummy = new T.Object3D(); this.visibleCount = 0;
    }
    spawn(kind, spread, particle = {}) {
      particle.x = rr(-7.4, 7.4);
      particle.y = spread ? rr(-2, 9) : rr(7.0, 9.5);
      particle.z = rr(-4.2, 5.2);
      particle.speed = kind === 'leaf' ? rr(.65, 1.25) : rr(.9, 1.7);
      particle.drift = rr(.2, .7);
      particle.phase = rr(0, TAU);
      particle.spin = rr(-2.5, 2.5);
      particle.scale = rr(.7, 1.3);
      return particle;
    }
    updatePool(pool, mesh, dt, t, kind, strength) {
      mesh.visible = strength > .008;
      mesh.material.opacity = kind === 'leaf' ? strength * .91 : strength * .92;
      if (!mesh.visible) return;
      const d = this.dummy;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        // Recycle at the bottom; sine sway and independent spin keep motion organic.
        p.y -= p.speed * dt; p.x += (kind === 'leaf' ? .18 : .11) * dt;
        if (p.y < -1.7 || p.x > 8.3) this.spawn(kind, false, p);
        const sway = Math.sin(t * (kind === 'leaf' ? 1.7 : .85) + p.phase) * p.drift;
        d.position.set(p.x + sway, p.y, p.z);
        if (kind === 'leaf') d.rotation.set(t * p.spin + p.phase, t * p.spin * .45, t * .9 + p.phase);
        else d.rotation.set(0, 0, 0);
        d.scale.setScalar(p.scale); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    update(dt, t, weights) {
      this.updatePool(this.leaves, this.leafMesh, dt, t, 'leaf', weights[2]);
      this.updatePool(this.snow, this.snowMesh, dt, t, 'snow', weights[3]);
      this.visibleCount = Math.round(135 * weights[2] + 210 * weights[3]);
    }
  }

  class SeasonCycle {
    constructor() { this.clock = 0; this.auto = true; this.display = 0; this.target = 0; }
    select(index) { this.auto = false; this.target = index; }
    toggleAuto() {
      this.auto = !this.auto;
      if (this.auto) this.clock = this.display * 14;
    }
    update(dt) {
      if (this.auto) {
        this.clock += dt;
        const p = (this.clock / 14) % 4, i = Math.floor(p), frac = p - i;
        // Each season holds its look, then crossfades through the last 2.8 seconds.
        const blend = smooth((frac - .8) / .2);
        const w = [0, 0, 0, 0]; w[i] = 1 - blend; w[(i + 1) % 4] = blend;
        this.display = (i + blend) % 4; return w;
      }
      let delta = this.target - this.display;
      if (delta > 2) delta -= 4; if (delta < -2) delta += 4;
      this.display = (this.display + delta * (1 - Math.exp(-dt * 2.2)) + 4) % 4;
      const i = Math.floor(this.display), blend = smooth(this.display - i);
      const w = [0, 0, 0, 0]; w[i] = 1 - blend; w[(i + 1) % 4] = blend;
      return w;
    }
  }

  const scene = new T.Scene();
  scene.fog = new T.FogExp2('#dce9e5', .013);
  const camera = new T.PerspectiveCamera(38, 1, .1, 180);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  document.getElementById('scene').appendChild(renderer.domElement);

  const island = new Island(); scene.add(island.group);
  const ben = new BigBen(), eye = new LondonEye(), bridge = new TowerBridge();
  island.group.add(ben.group, eye.group, bridge.group);
  const atmosphere = new Atmosphere(scene);
  const timeCycle = new DayNightCycle(scene);
  const seasons = new SeasonCycle();
  const weather = new WeatherSystem(scene);

  // Small pools of actual light accompany emissive material at dusk.
  const cityLights = [];
  [[.15, 5.25, -.08, '#ffd68b', 2.4], [-3.52, 2.72, -.22, '#ffd5a0', 2.8], [3.55, 2.45, .42, '#ffd4a3', 2.5]].forEach(([x, y, z, hue, dist]) => {
    const lamp = new T.PointLight(hue, 0, dist, 2);
    lamp.position.set(x, y, z); island.group.add(lamp); cityLights.push(lamp);
  });

  const container = document.getElementById('scene');
  const cameraState = { angle: 0, velocity: 0, dragging: false, pointerX: 0, targetX: 0, distance: 20.5 };
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 520 ? 1 : 1.25));
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = h < 360 ? 43 : 38; camera.updateProjectionMatrix();
    cameraState.targetX = w > 1100 && h > 500 ? -2.5 : 0;
    cameraState.distance = w < 520 ? 18.8 : 20.5;
  }
  window.addEventListener('resize', resize, { passive: true }); resize();

  container.addEventListener('pointerdown', e => {
    cameraState.dragging = true; cameraState.pointerX = e.clientX;
    cameraState.velocity = 0; container.setPointerCapture(e.pointerId);
  });
  container.addEventListener('pointermove', e => {
    if (!cameraState.dragging) return;
    const dx = e.clientX - cameraState.pointerX; cameraState.pointerX = e.clientX;
    cameraState.angle -= dx * .0065; cameraState.velocity = -dx * .0065;
  });
  const release = () => { cameraState.dragging = false; };
  container.addEventListener('pointerup', release); container.addEventListener('pointercancel', release);

  const seasonButtons = [...document.querySelectorAll('[data-season]')];
  seasonButtons.forEach(button => button.addEventListener('click', () => {
    seasons.select(Number(button.dataset.season)); updateControls(Number(button.dataset.season));
  }));
  document.getElementById('time-toggle').addEventListener('click', () => timeCycle.jump());
  document.getElementById('auto-toggle').addEventListener('click', () => { seasons.toggleAuto(); updateControls(); });
  document.addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '4') { seasons.select(Number(e.key) - 1); updateControls(Number(e.key) - 1); }
    if (e.key.toLowerCase() === 'n') timeCycle.jump();
    if (e.code === 'Space') { e.preventDefault(); seasons.toggleAuto(); updateControls(); }
  });
  const seasonNames = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const seasonWeather = ['Misty morning', 'Golden sunshine', 'Falling leaves', 'Soft snowfall'];
  const seasonGlyphs = ['✿', '☀', '❧', '❄'];
  function updateControls(force) {
    const i = force === undefined ? Math.floor((seasons.display + .001) % 4) : force;
    seasonButtons.forEach((b, n) => { b.classList.toggle('active', n === i); b.setAttribute('aria-pressed', String(n === i)); });
    document.getElementById('season-name').textContent = seasonNames[i];
    document.getElementById('weather-description').textContent = seasonWeather[i];
    document.getElementById('weather-glyph').textContent = seasonGlyphs[i];
    document.getElementById('auto-icon').textContent = seasons.auto ? 'Ⅱ' : '▶';
    document.getElementById('auto-toggle').setAttribute('aria-label', seasons.auto ? 'Pause automatic seasons' : 'Resume automatic seasons');
  }

  let previous = performance.now(), elapsed = 0, uiTimer = 0, frameCount = 0;
  const fogTint = color('#c7dce4');
  const summerTop = color('#69bde5'), summerHorizon = color('#ffe1b1');
  const autumnHorizon = color('#f3c397'), winterTop = color('#9bbfd5');
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - previous) / 1000, .05); previous = now; elapsed += dt; uiTimer += dt;
    const weights = seasons.update(dt);
    const day = timeCycle.update(dt, weights);
    const daylight = 1 - day.night;
    day.top.lerp(summerTop, weights[1] * daylight * .17).lerp(winterTop, weights[3] * daylight * .22);
    day.horizon.lerp(summerHorizon, weights[1] * daylight * .26)
      .lerp(autumnHorizon, weights[2] * daylight * .17);
    island.update(elapsed, weights); eye.update(elapsed);
    weather.update(dt, elapsed, weights);
    const wetFog = .012 + weights[0] * .022 + weights[3] * .008;
    scene.fog.density = wetFog + day.night * .005;
    scene.fog.color.copy(day.horizon).lerp(fogTint, weights[0] * .25);
    const glow = smooth((day.night - .15) / .55);
    palette.glass.emissiveIntensity = .02 + glow * .75;
    palette.lamp.emissiveIntensity = .02 + glow * 2.1;
    palette.dial.emissiveIntensity = .04 + glow;
    ben.lamps.forEach(m => m.emissiveIntensity = .03 + glow * .9);
    eye.lamps.forEach(m => m.emissiveIntensity = .025 + glow * .9);
    bridge.lamps.forEach(m => m.emissiveIntensity = .02 + glow * 1.4);
    cityLights.forEach(l => l.intensity = glow * 1.45);

    if (!cameraState.dragging) { cameraState.angle += cameraState.velocity; cameraState.velocity *= Math.exp(-dt * 5); }
    const x = Math.sin(cameraState.angle) * cameraState.distance + cameraState.targetX;
    const z = Math.cos(cameraState.angle) * cameraState.distance;
    camera.position.set(x, 8.8, z); camera.lookAt(cameraState.targetX, 1.38, 0);
    atmosphere.update(dt, elapsed, day, weights, camera);
    if (frameCount++ % 8 === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (uiTimer > .35) {
      uiTimer = 0; updateControls();
      const isNight = day.night > .5;
      document.getElementById('time-name').textContent = isNight ? 'Moonlight' : day.phase > .48 && day.phase < .7 ? 'Golden hour' : 'Daylight';
      document.getElementById('time-icon').textContent = isNight ? '☀' : '☾';
      document.getElementById('time-toggle').setAttribute('aria-label', isNight ? 'Jump to day' : 'Jump to night');
    }
  }
  requestAnimationFrame(frame);
  loading.classList.add('hidden');
  setTimeout(() => loading.remove(), 550);
})();
