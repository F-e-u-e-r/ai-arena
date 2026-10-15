/* Little Worlds · London. All artwork is made from geometry and canvas textures.
   Three.js r160 is the only runtime dependency. No build step or server is needed. */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  let seed = 7183;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => lerp(a, b, random());
  let T, app;

  const SEASONS = [
    { name: 'Spring', temperature: '12°', description: 'Misty & mild', poem: 'A little mist, a little magic.', icon: 'cloud', grass: '#a9bd7e', foliage: '#8fae68', blossom: '#e7a9b4', water: '#77b9bc', sky: '#eaf0e5', accent: '#59764a', active: '#e0e9d5', fog: .0125 },
    { name: 'Summer', temperature: '25°', description: 'Golden & sunlit', poem: 'Long days. Little adventures.', icon: 'sun', grass: '#a9bc65', foliage: '#71984e', blossom: '#8ca854', water: '#60b3bd', sky: '#f4efdc', accent: '#8b8742', active: '#eeeacb', fog: .004 },
    { name: 'Autumn', temperature: '14°', description: 'Crisp & breezy', poem: 'The city wears a warmer shade.', icon: 'leaf', grass: '#b6ad71', foliage: '#c78b45', blossom: '#ce7653', water: '#7aada8', sky: '#eee8dc', accent: '#a06b42', active: '#ede0cd', fog: .007 },
    { name: 'Winter', temperature: '3°', description: 'Softly snowing', poem: 'A quiet city, wrapped in white.', icon: 'snow', grass: '#dce4db', foliage: '#a3b6a8', blossom: '#cedad3', water: '#93c4cd', sky: '#e7edf0', accent: '#597b8a', active: '#dfe9eb', fog: .015 }
  ];

  class ArtKit {
    constructor() {
      this.geometries = new Map();
      this.materials = new Map();
      this.textures = [];
      this.up = new T.Vector3(0, 1, 0);
      this.direction = new T.Vector3();
      this.palette = {
        cream: this.material('cream', '#e5d5ad'), stone: this.material('stone', '#c9b890'),
        trim: this.material('trim', '#f2e5c8'), darkStone: this.material('darkStone', '#b7a47d'),
        roof: this.material('roof', '#4e6f69'), roofDark: this.material('roofDark', '#3e5956'),
        navy: this.material('navy', '#426677'), blue: this.material('blue', '#6eacbd'),
        white: this.material('white', '#efeee2'), path: this.material('path', '#dfd7b6'),
        road: this.material('road', '#8b9181'), bark: this.material('bark', '#8c7859'),
        red: this.material('red', '#c34f3f'), redDark: this.material('redDark', '#9d3f34'),
        glass: this.material('glass', '#425f62', { roughness: .4 }),
        black: this.material('black', '#34423c'), gold: this.material('gold', '#c4a05b', { metalness: .25 }),
        grass: this.material('grass', SEASONS[0].grass), foliage: this.material('foliage', SEASONS[0].foliage),
        foliageLight: this.material('foliageLight', '#a9bd7b'), foliageDark: this.material('foliageDark', '#7f9c5e'),
        blossom: this.material('blossom', SEASONS[0].blossom), blossomLight: this.material('blossomLight', '#f0c1c4'),
        snow: this.material('snow', '#f0f3eb', { transparent: true, opacity: 0, depthWrite: false }),
        windows: this.material('windows', '#456363', { emissive: '#ffc372', emissiveIntensity: 0 }),
        lamps: this.material('lamps', '#ffebba', { emissive: '#ffbd61', emissiveIntensity: .15 }),
        wheelLight: this.material('wheelLight', '#f5ebd3', { emissive: '#ffd394', emissiveIntensity: 0 })
      };
    }
    material(name, color, extra = {}) {
      if (!this.materials.has(name)) this.materials.set(name, new T.MeshStandardMaterial({ color, roughness: .85, metalness: 0, ...extra }));
      return this.materials.get(name);
    }
    geometry(key, create) {
      if (!this.geometries.has(key)) this.geometries.set(key, create());
      return this.geometries.get(key);
    }
    mesh(parent, geometry, material, x = 0, y = 0, z = 0, shadow = true) {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }
    box(parent, x, y, z, w, h, d, material, shadow = true) {
      const mesh = this.mesh(parent, this.geometry('box', () => new T.BoxGeometry(1, 1, 1)), material, x, y, z, shadow);
      mesh.scale.set(w, h, d);
      return mesh;
    }
    sphere(parent, x, y, z, radius, material, sx = 1, sy = 1, sz = 1) {
      const mesh = this.mesh(parent, this.geometry('sphere', () => new T.IcosahedronGeometry(1, 2)), material, x, y, z);
      mesh.scale.set(radius * sx, radius * sy, radius * sz);
      return mesh;
    }
    cylinder(parent, x, y, z, rt, rb, h, material, sides = 10) {
      const key = `cylinder-${rt}-${rb}-${h}-${sides}`;
      return this.mesh(parent, this.geometry(key, () => new T.CylinderGeometry(rt, rb, h, sides)), material, x, y, z);
    }
    cone(parent, x, y, z, r, h, material, sides = 4) {
      const mesh = this.mesh(parent, this.geometry(`cone-${sides}`, () => new T.ConeGeometry(1, 1, sides)), material, x, y, z);
      mesh.scale.set(r, h, r);
      if (sides === 4) mesh.rotation.y = Math.PI / 4;
      return mesh;
    }
    beam(parent, a, b, radius, material, sides = 6) {
      const mesh = this.mesh(parent, this.geometry(`beam-${sides}`, () => new T.CylinderGeometry(1, 1, 1, sides)), material);
      this.direction.subVectors(b, a);
      mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.scale.set(radius, this.direction.length(), radius);
      mesh.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
      return mesh;
    }
    tube(parent, points, radius, material, segments = 32) {
      return this.mesh(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points), segments, radius, 5, false), material);
    }
    texture(size, paint) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      paint(canvas.getContext('2d'), size);
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      this.textures.push(texture);
      return texture;
    }
    /* Flatten static meshes by material. Hundreds of architectural details become
       a small, fixed set of draw calls. Animated subtrees are explicitly excluded. */
    bake(root) {
      root.updateMatrixWorld(true);
      const inverse = root.matrixWorld.clone().invert();
      const buckets = new Map();
      const visit = (object, dynamic) => {
        dynamic = dynamic || object.userData.dynamic;
        if (object.isMesh && !dynamic && !object.isInstancedMesh && !Array.isArray(object.material)) {
          const key = `${object.material.id}-${object.castShadow}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(object);
        }
        for (const child of object.children) visit(child, dynamic);
      };
      visit(root, false);
      for (const meshes of buckets.values()) {
        const positions = [], normals = [], uvs = [], colors = [];
        let hasColor = false;
        for (const mesh of meshes) {
          const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          geo.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
          const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, c = geo.attributes.color;
          hasColor ||= Boolean(c);
          for (let i = 0; i < p.count; i++) {
            positions.push(p.getX(i), p.getY(i), p.getZ(i));
            normals.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
            uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
            colors.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1);
          }
          geo.dispose();
          mesh.removeFromParent();
        }
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
        if (hasColor) geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();
        this.mesh(root, geometry, meshes[0].material, 0, 0, 0, meshes[0].castShadow);
      }
    }
  }

  class BigBen {
    constructor(parent, kit) {
      const p = kit.palette, g = this.group = new T.Group();
      g.position.set(-.65, .15, -.75);
      parent.add(g);
      this.hands = [];
      kit.box(g, 0, .13, 0, 1.85, .26, 1.85, p.trim);
      kit.box(g, 0, 2.5, 0, 1.32, 4.8, 1.32, p.cream);
      for (const x of [-.67, .67]) for (const z of [-.67, .67]) {
        kit.box(g, x, 2.57, z, .16, 4.85, .16, p.trim);
        kit.box(g, x, 4.96, z, .24, .18, .24, p.stone);
      }
      for (const y of [.42, 1.5, 2.72, 3.95, 4.75]) kit.box(g, 0, y, 0, 1.46, .12, 1.46, p.stone);
      for (let face = 0; face < 4; face++) {
        const wall = new T.Group(); wall.rotation.y = face * Math.PI / 2; g.add(wall);
        for (const y of [1.0, 2.15, 3.4, 4.35]) for (const x of [-.35, 0, .35]) {
          kit.box(wall, x, y, .672, .15, y === 4.35 ? .38 : .66, .025, p.darkStone, false);
          kit.box(wall, x, y + .02, .69, .078, y === 4.35 ? .3 : .48, .025, p.windows, false);
          kit.cone(wall, x, y + (y === 4.35 ? .2 : .32), .69, .105, .15, p.trim, 4);
        }
      }
      kit.box(g, 0, 5.0, 0, 1.68, .26, 1.68, p.trim);
      kit.box(g, 0, 5.85, 0, 1.66, 1.55, 1.66, p.cream);
      const dialTexture = kit.texture(256, (c, s) => {
        c.fillStyle = '#f5ecd2'; c.fillRect(0, 0, s, s);
        c.translate(s / 2, s / 2);
        c.strokeStyle = '#66715b'; c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, 117, 0, TAU); c.stroke();
        c.beginPath(); c.arc(0, 0, 83, 0, TAU); c.stroke();
        for (let i = 0; i < 60; i++) {
          c.save(); c.rotate(i * TAU / 60);
          c.lineWidth = i % 5 === 0 ? 3 : 1;
          c.beginPath(); c.moveTo(0, -112); c.lineTo(0, i % 5 === 0 ? -104 : -108); c.stroke(); c.restore();
        }
        const roman = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
        c.fillStyle = '#384c40'; c.font = 'bold 22px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
        roman.forEach((text, i) => { const a = i * TAU / 12; c.fillText(text, Math.sin(a) * 96, -Math.cos(a) * 96); });
      });
      this.clockMaterial = kit.material('clock', '#ffffff', { map: dialTexture, emissiveMap: dialTexture, emissive: '#ffdd9b', emissiveIntensity: 0, roughness: 1 });
      for (let i = 0; i < 4; i++) {
        const face = new T.Group(); face.rotation.y = i * Math.PI / 2; g.add(face);
        kit.box(face, 0, 5.85, .84, 1.38, 1.38, .08, p.darkStone);
        const disc = kit.mesh(face, kit.geometry('clock-disc', () => new T.CircleGeometry(.59, 48)), this.clockMaterial, 0, 5.85, .894, false);
        const rim = kit.mesh(face, kit.geometry('clock-rim', () => new T.TorusGeometry(.61, .035, 6, 48)), p.gold, 0, 5.85, .9);
        for (const [length, width] of [[.41, .035], [.29, .05]]) {
          const hand = new T.Group(); hand.position.set(0, 5.85, .91); hand.userData.dynamic = true; face.add(hand);
          kit.box(hand, 0, length * .36, 0, width, length, .015, p.black, false);
          this.hands.push(hand);
        }
        kit.sphere(face, 0, 5.85, .93, .055, p.gold, 1, 1, .3);
      }
      kit.box(g, 0, 6.7, 0, 1.9, .16, 1.9, p.trim);
      kit.box(g, 0, 6.88, 0, 1.58, .18, 1.58, p.roofDark);
      for (const x of [-.76, .76]) for (const z of [-.76, .76]) {
        kit.box(g, x, 6.95, z, .19, .45, .19, p.trim);
        kit.cone(g, x, 7.29, z, .19, .42, p.roof);
        kit.sphere(g, x, 7.51, z, .04, p.gold);
      }
      kit.cone(g, 0, 7.52, 0, 1.12, 1.25, p.roof);
      kit.box(g, 0, 8.19, 0, .45, .37, .45, p.cream);
      kit.box(g, 0, 8.38, 0, .55, .09, .55, p.trim);
      kit.cone(g, 0, 8.69, 0, .4, .55, p.roofDark);
      kit.cylinder(g, 0, 9.08, 0, .025, .04, .43, p.gold, 6);
      kit.sphere(g, 0, 9.3, 0, .06, p.gold);
      kit.box(g, 0, 6.79, 0, 1.91, .045, 1.91, p.snow, false);
      // A tiny Westminster wing makes the tower feel rooted in a real city.
      const wing = new T.Group(); wing.position.set(-1.75, 0, .15); g.add(wing);
      kit.box(wing, 0, .98, 0, 2.1, 1.85, 1.2, p.cream);
      kit.box(wing, 0, 1.97, 0, 2.25, .15, 1.32, p.trim);
      kit.cone(wing, 0, 2.28, 0, 1, .55, p.roof).scale.set(1.55, .55, .9);
      for (let x = -.9; x <= .91; x += .3) {
        kit.box(wing, x, 1.1, .62, .12, 1.18, .035, p.windows, false);
        kit.box(wing, x + .13, 1, .65, .07, 1.75, .12, p.trim);
        kit.box(wing, x, 2.1, .55, .13, .28, .13, p.cream);
      }
    }
    update(phase, light) {
      for (let i = 0; i < this.hands.length; i++) this.hands[i].rotation.z = -TAU * (phase * (i % 2 === 0 ? 24 : 2) + (i % 2 === 0 ? 0 : .5));
      this.clockMaterial.emissiveIntensity = .05 + light * 1.9;
    }
  }

  class LondonEye {
    constructor(parent, kit) {
      const p = kit.palette, g = this.group = new T.Group();
      g.position.set(-4.5, .15, -2.1); g.rotation.y = .2; parent.add(g);
      const radius = 2.14, center = 2.72;
      kit.box(g, 0, .06, 0, 1.6, .15, 1.6, p.path);
      for (const z of [-.45, .5]) for (const x of [-.95, .95]) kit.beam(g, new T.Vector3(x, .16, z), new T.Vector3(0, center, 0), .075, p.white);
      const hub = kit.cylinder(g, 0, center, 0, .15, .15, .55, p.stone, 12); hub.rotation.x = Math.PI / 2;
      this.rotor = new T.Group(); this.rotor.position.y = center; this.rotor.userData.dynamic = true; g.add(this.rotor);
      for (const r of [radius, radius - .105]) kit.mesh(this.rotor, new T.TorusGeometry(r, .035, 6, 96), p.wheelLight);
      for (let i = 0; i < 32; i++) {
        const a = i * TAU / 32;
        kit.beam(this.rotor, new T.Vector3(0, 0, .08), new T.Vector3(Math.sin(a) * radius, Math.cos(a) * radius, 0), .012, p.white, 4);
      }
      this.pods = [];
      for (let i = 0; i < 16; i++) {
        const a = i * TAU / 16, pod = new T.Group();
        pod.position.set(Math.sin(a) * (radius + .03), Math.cos(a) * (radius + .03), 0);
        this.rotor.add(pod); this.pods.push(pod);
        kit.sphere(pod, 0, 0, 0, .16, p.white, 1.25, 1, .9);
        kit.sphere(pod, 0, .035, .035, .14, p.glass, 1.25, .65, .9);
        kit.box(pod, 0, -.09, .03, .27, .05, .22, p.wheelLight);
        kit.beam(pod, new T.Vector3(0, -.08, .16), new T.Vector3(0, .13, .12), .014, p.white, 4);
      }
      // Spokes and rim share materials; bake these once, leaving pod pivots intact.
      const flag = this.rotor.userData.dynamic; this.rotor.userData.dynamic = false;
      for (const pod of this.pods) pod.userData.dynamic = true;
      kit.bake(this.rotor); this.rotor.userData.dynamic = flag;
      for (const pod of this.pods) { pod.userData.dynamic = false; kit.bake(pod); pod.userData.dynamic = true; }
    }
    update(dt) {
      this.rotor.rotation.z -= dt * .045;
      for (const pod of this.pods) pod.rotation.z = -this.rotor.rotation.z;
    }
  }

  class TowerBridge {
    constructor(parent, kit) {
      const p = kit.palette, g = this.group = new T.Group();
      g.position.set(2.65, .15, 1.18); parent.add(g);
      kit.box(g, 0, .47, 0, 6.7, .17, .94, p.stone);
      kit.box(g, 0, .57, 0, 6.7, .055, .68, p.road, false);
      for (const z of [-.47, .47]) {
        kit.box(g, 0, .59, z, 6.8, .12, .14, p.trim);
        kit.box(g, 0, .9, z, 6.8, .035, .04, p.blue);
        for (let x = -3.3; x < 3.4; x += .26) kit.box(g, x, .75, z, .025, .29, .035, p.white);
      }
      for (let x = -3.1; x < 3.2; x += .45) kit.box(g, x, .61, 0, .18, .014, .025, p.trim, false);
      for (const x of [-1.58, 1.58]) {
        kit.box(g, x, .12, 0, 1.08, .38, 1.48, p.stone);
        for (const z of [-.45, .45]) {
          kit.box(g, x, 1.61, z, .83, 2.3, .25, p.cream);
          kit.box(g, x, 1.7, z * 1.29, .31, .65, .025, p.windows, false);
          kit.box(g, x, 1.71, z * 1.32, .035, .68, .025, p.trim, false);
          kit.box(g, x, 1.75, z * 1.32, .34, .04, .025, p.trim, false);
          for (const dx of [-.37, .37]) kit.box(g, x + dx, 1.65, z, .12, 2.42, .32, p.trim);
        }
        kit.box(g, x, 2.72, 0, .9, .59, 1.14, p.cream);
        kit.box(g, x, 2.42, 0, .96, .1, 1.17, p.stone);
        kit.box(g, x, 3.04, 0, 1.07, .12, 1.3, p.trim);
        kit.box(g, x, 3.11, 0, 1.07, .035, 1.3, p.snow, false);
        for (const z of [-.575, .575]) for (const dx of [-.22, .22]) kit.box(g, x + dx, 2.77, z, .12, .29, .02, p.windows, false);
        kit.cone(g, x, 3.5, 0, .65, .78, p.navy).scale.z *= 1.15;
        for (const dx of [-.43, .43]) for (const z of [-.53, .53]) {
          kit.cylinder(g, x + dx, 3.17, z, .095, .11, .38, p.cream, 6);
          kit.cone(g, x + dx, 3.52, z, .16, .37, p.navy);
          kit.sphere(g, x + dx, 3.73, z, .035, p.gold);
        }
        kit.cylinder(g, x, 4.03, 0, .012, .016, .4, p.gold, 5);
        const flag = kit.box(g, x + .11, 4.15, 0, .22, .12, .02, p.red); flag.rotation.z = -.08;
      }
      for (const z of [-.32, .32]) {
        kit.box(g, 0, 2.58, z, 3.2, .19, .18, p.blue);
        kit.box(g, 0, 2.83, z, 3.2, .055, .23, p.white);
        for (let x = -1.45; x < 1.5; x += .22) {
          kit.box(g, x, 2.7, z, .03, .23, .04, p.white);
          kit.beam(g, new T.Vector3(x, 2.59, z), new T.Vector3(x + .2, 2.82, z), .012, p.white, 4);
        }
      }
      for (const z of [-.51, .51]) {
        for (const [start, end] of [[-3.35, -1.58], [-1.58, 1.58], [1.58, 3.35]]) {
          const points = [];
          for (let i = 0; i <= 20; i++) {
            const t = i / 20, x = lerp(start, end, t);
            let y;
            if (start === -1.58) y = 1.12 + Math.pow((t - .5) * 2, 2) * 1.33;
            else y = start < -2 ? lerp(.86, 2.45, t * t) : lerp(2.45, .86, 1 - (1 - t) ** 2);
            points.push(new T.Vector3(x, y, z));
            if (i % 3 === 0) kit.beam(g, new T.Vector3(x, .82, z), new T.Vector3(x, y, z), .017, p.blue, 4);
          }
          kit.tube(g, points, .041, p.blue, 24);
        }
      }
    }
  }

  class Island {
    constructor(scene, kit) {
      this.kit = kit; this.group = new T.Group(); scene.add(this.group);
      this.ripples = []; this.rocks = [];
      this.makeTerrain();
      this.makeRiver();
      this.ben = new BigBen(this.group, kit);
      this.eye = new LondonEye(this.group, kit);
      this.bridge = new TowerBridge(this.group, kit);
      this.makeTown();
      this.makeGarden();
      this.makeDetails();
      kit.bake(this.group);
    }
    makeTerrain() {
      const k = this.kit, p = k.palette, n = 18, outline = [];
      for (let i = 0; i < n; i++) {
        const a = i * TAU / n, r = range(.96, 1.035);
        outline.push(new T.Vector2(Math.cos(a) * 7.65 * r, -Math.sin(a) * 5.45 * r));
      }
      const shape = new T.Shape(outline);
      const top = new T.ExtrudeGeometry(shape, { depth: .32, bevelEnabled: false, steps: 1 });
      top.rotateX(-Math.PI / 2); top.translate(0, -.16, 0);
      k.mesh(this.group, top, p.grass);
      const rings = [outline.map(v => new T.Vector3(v.x, -.18, -v.y)), outline.map(v => new T.Vector3(v.x * .94, range(-1.3, -.8), -v.y * .94)), outline.map(v => new T.Vector3(v.x * .64 + .35, range(-2.9, -2.2), -v.y * .64)), outline.map(v => new T.Vector3(v.x * .17 + .5, range(-3.95, -3.3), -v.y * .17))];
      const positions = [], colors = [], rockColors = ['#b2aa86', '#a99a77', '#958c70', '#b5a382', '#a09878', '#8d8a6d'].map(c => new T.Color(c));
      const tri = (a, b, c) => {
        const color = rockColors[Math.floor(random() * rockColors.length)];
        for (const v of [a, b, c]) { positions.push(v.x, v.y, v.z); colors.push(color.r, color.g, color.b); }
      };
      for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        tri(rings[r][i], rings[r + 1][i], rings[r][j]);
        tri(rings[r][j], rings[r + 1][i], rings[r + 1][j]);
      }
      const bottom = new T.Vector3(.5, -4.05, 0);
      for (let i = 0; i < n; i++) tri(rings[3][i], bottom, rings[3][(i + 1) % n]);
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
      k.mesh(this.group, geometry, k.material('rock', '#ffffff', { vertexColors: true, flatShading: true, side: T.DoubleSide }));
      // A few mossy overhangs break up the clean silhouette.
      for (let i = 0; i < 14; i++) {
        const a = i * TAU / 14 + .1;
        const mesh = k.sphere(this.group, Math.cos(a) * 7.3, -.15, Math.sin(a) * 5.12, range(.35, .6), p.grass, 1.4, .38, 1);
      }
      for (const [x, y, z, size] of [[-6.2, -2.8, 3.5, .38], [5.7, -3.3, 1.8, .47], [-1.8, -4.5, 2.7, .23], [4, -4.1, -3.2, .25]]) {
        const rock = k.mesh(this.group, k.geometry('floating-rock', () => new T.DodecahedronGeometry(1, 0)), p.stone, x, y, z);
        rock.scale.set(size, size * 1.3, size); rock.rotation.set(range(0, 2), range(0, 2), 0); rock.userData.dynamic = true;
        this.rocks.push({ mesh: rock, y, phase: range(0, TAU) });
      }
    }
    riverX(z) { return 2.7 + Math.sin(z * .62) * .4 - z * .025; }
    makeRiver() {
      const k = this.kit, p = k.palette, positions = [], indices = [], steps = 64, across = 8;
      for (let row = 0; row <= steps; row++) {
        const z = lerp(-5.05, 4.95, row / steps), center = this.riverX(z);
        const limit = 7.55 * Math.sqrt(Math.max(0, 1 - (z / 5.45) ** 2));
        for (let col = 0; col <= across; col++) {
          const x = Math.min(limit - .05, center + (col / across - .5) * 1.85);
          positions.push(x, .18, z);
          if (row < steps && col < across) { const i = row * (across + 1) + col; indices.push(i, i + across + 1, i + 1, i + 1, i + across + 1, i + across + 2); }
        }
      }
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      this.waterTime = { value: 0 };
      this.waterMaterial = k.material('water', SEASONS[0].water, { roughness: .3, metalness: .1, side: T.DoubleSide });
      this.waterMaterial.onBeforeCompile = shader => {
        shader.uniforms.uTime = this.waterTime;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(position.z * 3.0 + uTime * 1.1) * cos(position.x * 4.0 + uTime * 0.7) * 0.016;');
      };
      const water = k.mesh(this.group, geometry, this.waterMaterial, 0, 0, 0, false); water.userData.dynamic = true;
      const rippleMaterial = k.material('ripple', '#d6eecc', { transparent: true, opacity: .45, depthWrite: false });
      this.rippleMesh = new T.InstancedMesh(k.geometry('box', () => new T.BoxGeometry(1, 1, 1)), rippleMaterial, 45);
      this.rippleMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.rippleMesh.userData.dynamic = true; this.rippleMesh.frustumCulled = false;
      this.rippleDummy = new T.Object3D(); this.group.add(this.rippleMesh);
      for (let i = 0; i < 45; i++) {
        const z = range(-4.8, 4.8), x = this.riverX(z) + range(-.65, .65);
        this.ripples.push({ x, z, width: range(.13, .45), phase: range(0, TAU) });
      }
      // A translucent water ribbon continues over the edge of the island.
      const fallMaterial = k.material('waterfall', '#a2d6d0', { transparent: true, opacity: .57, roughness: .4, depthWrite: false, side: T.DoubleSide });
      const fall = k.box(this.group, 2.47, -.67, 5.02, 1.35, 1.55, .08, fallMaterial, false); fall.rotation.z = -.04;
      for (let i = 0; i < 5; i++) k.box(this.group, 1.95 + i * .25, -.7, 5.07, .018, range(.65, 1.5), .012, rippleMaterial, false);
      this.boat = new T.Group(); this.boat.userData.dynamic = true; this.group.add(this.boat);
      const hull = k.sphere(this.boat, 0, .06, 0, .23, p.white, .65, .45, 1.8);
      k.box(this.boat, 0, .14, -.03, .22, .16, .42, p.white);
      k.box(this.boat, 0, .24, -.03, .26, .04, .47, p.red);
      k.box(this.boat, 0, .16, .19, .17, .08, .018, p.glass);
      this.boat.userData.dynamic = false; k.bake(this.boat); this.boat.userData.dynamic = true;
    }
    house(x, z, color, height) {
      const k = this.kit, p = k.palette, g = new T.Group(); g.position.set(x, .17, z); this.group.add(g);
      const facade = k.material(`house-${color}`, color);
      k.box(g, 0, height / 2, 0, .93, height, 1.05, facade);
      k.box(g, 0, .1, .12, 1.02, .2, 1.15, p.trim);
      k.box(g, 0, height - .08, 0, 1.04, .12, 1.14, p.trim);
      const vertices = new Float32Array([-.55,0,-.63, .55,0,-.63, 0,.55,-.63, -.55,0,.63, 0,.55,.63, .55,0,.63, -.55,0,-.63, 0,.55,-.63, -.55,0,.63, 0,.55,-.63, 0,.55,.63, -.55,0,.63, .55,0,-.63, .55,0,.63, 0,.55,-.63, 0,.55,-.63, .55,0,.63, 0,.55,.63]);
      const roof = new T.BufferGeometry(); roof.setAttribute('position', new T.BufferAttribute(vertices, 3)); roof.computeVertexNormals();
      k.mesh(g, roof, p.roofDark, 0, height, 0);
      k.box(g, .29, height + .43, -.25, .17, .46, .2, facade);
      k.box(g, .29, height + .67, -.25, .22, .07, .24, p.trim);
      for (let row = 0; row < 2; row++) for (const xx of [-.25, .25]) {
        const y = height * .4 + row * .65;
        k.box(g, xx, y, .54, .27, .4, .055, p.trim);
        k.box(g, xx, y + .01, .574, .19, .3, .018, p.windows, false);
        k.box(g, xx, y, .589, .022, .31, .012, p.trim, false);
        k.box(g, xx, y, .589, .2, .02, .012, p.trim, false);
        k.box(g, xx, y - .22, .585, .31, .04, .13, p.white);
      }
      k.box(g, 0, .38, .545, .25, .57, .055, p.roof);
      k.box(g, 0, .13, .69, .43, .13, .26, p.stone);
      k.box(g, .07, .38, .581, .035, .035, .02, p.gold, false);
      k.box(g, 0, height + .025, .59, 1.1, .05, .12, p.snow, false);
    }
    makeTown() {
      const k = this.kit, p = k.palette;
      k.box(this.group, -2.72, .18, 2.85, 5.35, .07, 1.25, p.path, false);
      k.box(this.group, -1.85, .19, 3.55, 7.1, .065, .75, p.road, false);
      for (let x = -5.1; x < 1.5; x += .52) k.box(this.group, x, .23, 3.55, .22, .01, .025, p.trim, false);
      this.house(-4.75, 1.85, '#c78d76', 1.85);
      this.house(-3.63, 1.85, '#e1c585', 2.15);
      this.house(-2.51, 1.85, '#9eafa0', 1.9);
      this.house(-1.39, 1.85, '#d7b39d', 2.12);
      // Red double-decker bus, with two window decks and tiny destination boards.
      const bus = new T.Group(); bus.position.set(-3, .25, 3.54); this.group.add(bus);
      k.box(bus, 0, .46, 0, 1.55, .79, .58, p.red);
      k.box(bus, 0, .9, 0, 1.49, .1, .57, p.redDark);
      for (const z of [-.299, .299]) {
        for (const x of [-.55, -.23, .09, .41]) for (const y of [.36, .71]) {
          k.box(bus, x, y, z, .25, .21, .018, p.glass, false);
          k.box(bus, x, y, z * 1.025, .018, .21, .018, p.trim, false);
        }
        k.box(bus, -.1, .53, z * 1.03, 1.2, .085, .02, p.trim, false);
        for (const x of [-.49, .48]) { const wheel = k.cylinder(bus, x, .14, z, .145, .145, .06, p.black, 12); wheel.rotation.x = Math.PI / 2; }
      }
      k.box(bus, .786, .7, 0, .025, .23, .45, p.glass, false);
      k.box(bus, .786, .36, 0, .025, .23, .44, p.glass, false);
      for (const z of [-.21, .21]) k.box(bus, .8, .17, z, .03, .06, .07, p.lamps, false);
      const booth = new T.Group(); booth.position.set(-5.65, .19, 2.38); booth.rotation.y = -.1; this.group.add(booth);
      k.box(booth, 0, .5, 0, .42, 1, .42, p.red);
      k.box(booth, 0, 1.04, 0, .49, .13, .49, p.redDark);
      k.sphere(booth, 0, 1.11, 0, .23, p.red, 1, .3, 1);
      for (let side = 0; side < 4; side++) {
        const face = new T.Group(); face.rotation.y = side * Math.PI / 2; booth.add(face);
        k.box(face, 0, .56, .214, .3, .65, .015, p.glass, false);
        for (const x of [-.06, .06]) k.box(face, x, .56, .23, .018, .67, .018, p.red, false);
        for (const y of [.3, .47, .64, .81]) k.box(face, 0, y, .23, .32, .018, .018, p.red, false);
        k.box(face, 0, .94, .22, .3, .065, .018, p.trim, false);
      }
    }
    tree(x, z, size, blossom = false) {
      const k = this.kit, p = k.palette, g = new T.Group(); g.position.set(x, .18, z); g.scale.setScalar(size); this.group.add(g);
      k.cylinder(g, 0, .6, 0, .075, .105, 1.2, p.bark, 6);
      k.beam(g, new T.Vector3(0, .7, 0), new T.Vector3(.3, 1.25, .05), .045, p.bark);
      k.beam(g, new T.Vector3(0, .75, 0), new T.Vector3(-.3, 1.4, -.1), .04, p.bark);
      const colors = blossom ? [p.blossom, p.blossomLight, p.blossom] : [p.foliage, p.foliageLight, p.foliageDark];
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5;
        k.sphere(g, Math.cos(a) * .3, 1.25 + (i % 2) * .26, Math.sin(a) * .25, .51, colors[i % 3], 1, 1.06, .94);
      }
      k.sphere(g, 0, 1.7, 0, .49, colors[1], .9, 1, .9);
      k.sphere(g, 0, .02, 0, .52, p.foliageDark, 1.1, .12, 1);
    }
    makeGarden() {
      const p = this.kit.palette;
      for (const [x, z, size, blossom] of [[-6.2,-.7,.95,1],[-5.6,-3.5,.7,0],[-2.6,-3.9,1.12,1],[.2,-3.7,1.2,0],[1.3,-2.5,.7,0],[4.6,-3.5,.95,0],[5.6,-2,.9,1],[6.25,-.3,.8,0],[5.2,2.8,.8,0],[3.8,4,.75,1],[-.2,4.4,.6,0],[-5.1,3.9,.5,0],[-6.7,1.7,.65,0],[-3.8,-4.2,.55,0]]) this.tree(x, z, size, Boolean(blossom));
      for (let i = 0; i < 45; i++) {
        const x = range(-6.8, 6.8), z = range(-4.8, 4.8);
        if ((x*x/48 + z*z/23) > .9 || Math.abs(x - this.riverX(z)) < 1.25 || (x < 0 && z > -.8 && z < 3.9)) continue;
        const material = i % 3 ? p.trim : p.blossom;
        for (let j = 0; j < 3; j++) {
          const xx = x + range(-.12, .12), zz = z + range(-.12, .12);
          this.kit.sphere(this.group, xx, .28, zz, .055, material, 1, .45, 1);
          this.kit.box(this.group, xx, .23, zz, .015, .12, .015, p.foliageDark, false);
        }
      }
      // Low hedges and decorative stepping stones beside the clock tower.
      for (let i = 0; i < 6; i++) this.kit.box(this.group, .4, .2, -.8 - i * .45, .54, .07, .28, p.path, false);
      for (let i = 0; i < 9; i++) this.kit.sphere(this.group, -6.2 + i * .48, .42, -3.65, .25, p.foliage, 1.25, 1, 1);
    }
    makeDetails() {
      const k = this.kit, p = k.palette;
      for (const [x,z] of [[-5.6,3.25],[-.5,3.2],[.3,-2.8],[5.7,.1],[-2.9,-2.4],[4.2,3.4]]) {
        k.cylinder(this.group, x, .8, z, .026, .043, 1.28, p.roofDark, 6);
        k.box(this.group, x, 1.5, z, .17, .24, .17, p.lamps, false);
        k.cone(this.group, x, 1.68, z, .17, .15, p.roofDark);
        k.box(this.group, x, 1.36, z, .21, .055, .21, p.roofDark);
      }
      for (const [x,z] of [[-6.1,.4],[.3,-3.7],[4.85,3.2]]) {
        for (let i = 0; i < 3; i++) k.box(this.group, x, .5, z + i * .08, .65, .045, .05, p.bark);
        k.box(this.group, x, .7, z - .06, .65, .23, .05, p.bark);
        for (const xx of [-.24, .24]) k.box(this.group, x + xx, .35, z + .08, .04, .3, .24, p.roofDark);
      }
      // Narrow pale paths read clearly even when the island is a small iframe.
      k.box(this.group, -4.6, .185, -.15, .55, .04, 2.4, p.path, false);
      k.box(this.group, -2.7, .185, -2.8, 3.5, .04, .4, p.path, false);
    }
    update(time, dt, phase, lampLevel) {
      this.group.position.y = Math.sin(time * .65) * .13;
      this.group.rotation.z = Math.sin(time * .28) * .005;
      this.ben.update(phase, lampLevel); this.eye.update(dt); this.waterTime.value = time;
      for (const r of this.rocks) r.mesh.position.y = r.y + Math.sin(time * .7 + r.phase) * .12;
      for (let i = 0; i < this.ripples.length; i++) {
        const r = this.ripples[i], dummy = this.rippleDummy;
        dummy.position.set(r.x, .215, r.z + Math.sin(time * .45 + r.phase) * .12);
        dummy.scale.set(r.width * (1 + Math.sin(time * .8 + r.phase) * .3), .012, .018);
        dummy.updateMatrix(); this.rippleMesh.setMatrixAt(i, dummy.matrix);
      }
      this.rippleMesh.instanceMatrix.needsUpdate = true;
      const z = .05 + Math.sin(time * .12) * 4.2;
      this.boat.position.set(this.riverX(z), .2 + Math.sin(time * 2) * .018, z);
      this.boat.rotation.y = Math.cos(time * .12) >= 0 ? 0 : Math.PI;
      this.boat.rotation.z = Math.sin(time * 1.3) * .035;
    }
  }

  class Atmosphere {
    constructor(scene, kit) {
      this.clouds = []; this.mist = []; this.kit = kit;
      this.cloudMaterial = kit.material('cloud', '#f7f5e9', { roughness: 1 });
      for (const [x,y,z,size] of [[-8,4.4,-2.8,.9],[7.2,6.7,-5.7,1.15],[6.8,.2,5.3,.77],[-5.4,-1.4,5.2,.7],[.7,7.4,-7.8,.52]]) {
        const group = new T.Group(); group.position.set(x,y,z); group.scale.setScalar(size); scene.add(group);
        for (const [xx,yy,zz,r] of [[-1,0,0,.57],[-.35,.18,.08,.77],[.4,.16,0,.65],[1,.02,.06,.47],[-.1,-.12,.15,.6]]) {
          const cloud = kit.sphere(group, xx, yy, zz, r, this.cloudMaterial, 1, .68, .73); cloud.castShadow = false;
        }
        kit.bake(group); this.clouds.push({ group, x, y, phase: range(0, TAU) });
      }
      const mistTexture = kit.texture(128, (c,s) => {
        const gradient = c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
        gradient.addColorStop(0,'rgba(255,255,255,.65)'); gradient.addColorStop(.4,'rgba(255,255,255,.32)'); gradient.addColorStop(1,'rgba(255,255,255,0)');
        c.fillStyle=gradient; c.fillRect(0,0,s,s);
      });
      for (let i=0; i<18; i++) {
        const material = new T.SpriteMaterial({ map:mistTexture, color:'#edf2dc', transparent:true, opacity:0, depthWrite:false });
        const sprite = new T.Sprite(material), x=range(-8,8), y=range(-.5,2.3), z=range(-6,6);
        sprite.position.set(x,y,z); sprite.scale.set(range(4,8),range(.8,1.8),1); scene.add(sprite);
        this.mist.push({ sprite,x,y,z,phase:range(0,TAU) });
      }
      const shadowMaterial = new T.MeshBasicMaterial({ map:mistTexture, color:'#607866', transparent:true, opacity:.2, depthWrite:false, fog:false });
      this.shadow = new T.Mesh(new T.PlaneGeometry(25,18), shadowMaterial);
      this.shadow.rotation.x=-Math.PI/2; this.shadow.position.set(0,-5.5,0); scene.add(this.shadow);
      const haloTexture = kit.texture(128, (c,s) => {
        const g=c.createRadialGradient(s/2,s/2,1,s/2,s/2,s/2); g.addColorStop(0,'rgba(255,239,181,.65)'); g.addColorStop(.2,'rgba(255,232,167,.2)'); g.addColorStop(1,'rgba(255,232,167,0)'); c.fillStyle=g; c.fillRect(0,0,s,s);
      });
      this.sun = new T.Group(); this.moon = new T.Group(); scene.add(this.sun,this.moon);
      this.sunMaterial = new T.MeshBasicMaterial({color:'#f1cf84',transparent:true,opacity:1,fog:false});
      kit.sphere(this.sun,0,0,0,.55,this.sunMaterial);
      this.haloMaterial = new T.SpriteMaterial({map:haloTexture,transparent:true,opacity:.7,depthWrite:false,fog:false});
      const halo = new T.Sprite(this.haloMaterial); halo.scale.set(3,3,1); this.sun.add(halo);
      this.moonMaterial = new T.MeshBasicMaterial({color:'#e9e9cb',transparent:true,opacity:0,fog:false});
      kit.sphere(this.moon,0,0,0,.43,this.moonMaterial);
      const craterMaterial = new T.MeshBasicMaterial({color:'#c7d5c5',transparent:true,opacity:.3});
      for (const [x,y,r] of [[-.15,.13,.07],[.1,-.17,.09],[.18,.12,.045]]) kit.sphere(this.moon,x,y,.37,r,craterMaterial,1,1,.2);
      const stars = new Float32Array(110*3);
      for (let i=0;i<110;i++) { stars[i*3]=range(-17,17); stars[i*3+1]=range(1,15); stars[i*3+2]=range(-15,-9); }
      const starGeometry = new T.BufferGeometry(); starGeometry.setAttribute('position',new T.BufferAttribute(stars,3));
      this.starMaterial = new T.PointsMaterial({color:'#f9edd0',size:1.4,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,fog:false});
      this.stars = new T.Points(starGeometry,this.starMaterial); scene.add(this.stars);
      this.birds = [];
      for (let i=0;i<4;i++) {
        const geometry = new T.BufferGeometry(); geometry.setAttribute('position',new T.Float32BufferAttribute([-.16,0,0,0,-.06,0,0,-.06,0,.16,0,0],3));
        const bird = new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#698275',transparent:true,opacity:.7})); scene.add(bird); this.birds.push(bird);
      }
    }
    update(time, weights, phase, daylight, night) {
      for (const c of this.clouds) { c.group.position.x=c.x+Math.sin(time*.08+c.phase)*.5; c.group.position.y=c.y+Math.sin(time*.2+c.phase)*.12; }
      for (const m of this.mist) {
        m.sprite.position.x=m.x+Math.sin(time*.09+m.phase)*1.2;
        m.sprite.position.y=m.y+Math.sin(time*.2+m.phase)*.18;
        m.sprite.material.opacity=(weights[0]*.19+weights[3]*.055)*( .72+Math.sin(time*.15+m.phase)*.2 );
        m.sprite.visible=m.sprite.material.opacity>.004;
      }
      const angle=phase*TAU;
      this.sun.position.set(2+Math.cos(angle)*8,1.5+Math.sin(angle)*6.5,-6.5);
      this.moon.position.set(2-Math.cos(angle)*8,1.5-Math.sin(angle)*6.5,-6.5);
      this.sunMaterial.opacity=smooth(-.08,.22,Math.sin(angle)); this.sun.visible=this.sunMaterial.opacity>.01;
      this.haloMaterial.opacity=this.sunMaterial.opacity*.6;
      this.moonMaterial.opacity=smooth(-.08,.2,-Math.sin(angle)); this.moon.visible=this.moonMaterial.opacity>.01;
      this.starMaterial.opacity=night*.74; this.stars.visible=night>.02;
      this.shadow.material.opacity=.12+daylight*.11;
      for (let i=0;i<this.birds.length;i++) {
        const bird=this.birds[i], a=time*.055+i*.32;
        bird.position.set(Math.sin(a)*5-1,6.5+Math.sin(a*2)*.4+i*.18,-6+Math.cos(a)*1.2);
        const positions=bird.geometry.attributes.position;
        positions.setY(0,Math.sin(time*4+i)*.08); positions.setY(3,Math.sin(time*4+i)*.08); positions.needsUpdate=true;
        bird.material.opacity=daylight*.7;
      }
    }
  }

  class WeatherSystem {
    constructor(scene, kit, island) {
      this.scene=scene; this.kit=kit; this.island=island;
      this.weights=new Float32Array([1,0,0,0]); this.fromWeights=new Float32Array(this.weights);
      this.target=0; this.elapsed=0; this.transition=3; this.duration=24; this.transitionDuration=3;
      this.auto=true; this.onChange=null; this.activeParticles=0;
      this.dummy=new T.Object3D(); this.white=new T.Color('#eef1dc');
      this.colors={};
      for (const key of ['grass','foliage','blossom','water','sky','accent','active']) this.colors[key]=SEASONS.map(s=>new T.Color(s[key]));
      this.skyColor=new T.Color(); this.accentColor=new T.Color(); this.activeColor=new T.Color();
      this.createLeaves(); this.createSnow();
    }
    select(index,manual=true) {
      this.fromWeights.set(this.weights); this.target=index; this.transition=0; this.elapsed=0;
      if (manual) this.auto=false;
      if (this.onChange) this.onChange();
    }
    toggleAuto() { this.auto=!this.auto; this.elapsed=0; if(this.onChange)this.onChange(); }
    color(key,result) {
      result.setRGB(0,0,0);
      for(let i=0;i<4;i++) { const color=this.colors[key][i], w=this.weights[i]; result.r+=color.r*w; result.g+=color.g*w; result.b+=color.b*w; }
      return result;
    }
    createLeaves() {
      this.leafCapacity=window.innerWidth<600?110:230;
      const points=[[0,1],[.2,.56],[.46,.7],[.41,.25],[.83,.37],[.7,.04],[1,-.03],[.48,-.45],[.12,-.45],[.05,-.8],[-.05,-.8],[-.12,-.45],[-.48,-.45],[-1,-.03],[-.7,.04],[-.83,.37],[-.41,.25],[-.46,.7],[-.2,.56]].map(([x,y])=>new T.Vector2(x*.11,y*.11));
      const geometry=new T.ShapeGeometry(new T.Shape(points));
      this.leafMaterial=new T.MeshStandardMaterial({color:'#ffffff',roughness:1,side:T.DoubleSide,transparent:true,opacity:0,depthWrite:false});
      this.leaves=new T.InstancedMesh(geometry,this.leafMaterial,this.leafCapacity); this.leaves.instanceMatrix.setUsage(T.DynamicDrawUsage); this.leaves.frustumCulled=false;
      this.leafState=new Float32Array(this.leafCapacity*9);
      const colors=['#d28b3b','#b95e3b','#d8ac55','#a87940'].map(c=>new T.Color(c));
      for(let i=0;i<this.leafCapacity;i++) {
        const n=i*9;
        this.leafState.set([range(-8,8),range(-3,11),range(-5.5,6),range(0,TAU),range(.55,1.25),range(.4,1.6),range(0,TAU),range(.65,1.15),range(.8,1.5)],n);
        this.leaves.setColorAt(i,colors[i%colors.length]);
      }
      this.scene.add(this.leaves); this.leaves.visible=false;
    }
    createSnow() {
      this.snowCapacity=window.innerWidth<600?650:1250;
      this.snowPositions=new Float32Array(this.snowCapacity*3); this.snowSpeed=new Float32Array(this.snowCapacity); this.snowPhase=new Float32Array(this.snowCapacity);
      for(let i=0;i<this.snowCapacity;i++) {
        this.snowPositions.set([range(-9,9),range(-4,12),range(-7,7)],i*3); this.snowSpeed[i]=range(.45,1.1); this.snowPhase[i]=range(0,TAU);
      }
      const texture=this.kit.texture(64,(c,s)=>{
        c.translate(s/2,s/2); c.strokeStyle='#ffffff'; c.lineWidth=3; c.lineCap='round';
        for(let i=0;i<6;i++){c.save();c.rotate(i*TAU/6);c.beginPath();c.moveTo(0,0);c.lineTo(0,-24);c.moveTo(0,-13);c.lineTo(-6,-19);c.moveTo(0,-13);c.lineTo(6,-19);c.stroke();c.restore();}
        c.beginPath();c.arc(0,0,5,0,TAU);c.fillStyle='#ffffff';c.fill();
      });
      const geometry=new T.BufferGeometry(); geometry.setAttribute('position',new T.BufferAttribute(this.snowPositions,3).setUsage(T.DynamicDrawUsage));
      // Orthographic cameras need point sizes in pixels, not miniature world units.
      this.snowMaterial=new T.PointsMaterial({map:texture,color:'#ffffff',size:window.innerWidth<600?2.2:3.3,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,alphaTest:.025,fog:true});
      this.snow=new T.Points(geometry,this.snowMaterial); this.snow.frustumCulled=false; this.scene.add(this.snow); this.snow.visible=false;
    }
    update(dt,physicsDt,time) {
      if(this.auto) { this.elapsed+=dt; if(this.elapsed>=this.duration)this.select((this.target+1)%4,false); }
      this.transition=Math.min(this.transitionDuration,this.transition+dt);
      // Interpolate from a snapshot, so interrupted manual transitions remain smooth.
      // The weights always sum to one; every climate property shares these weights.
      const blend=smooth(0,this.transitionDuration,this.transition);
      for(let i=0;i<4;i++)this.weights[i]=lerp(this.fromWeights[i],i===this.target?1:0,blend);
      const p=this.kit.palette;
      this.color('grass',p.grass.color); this.color('foliage',p.foliage.color);
      p.foliageLight.color.copy(p.foliage.color).lerp(this.white,.18); p.foliageDark.color.copy(p.foliage.color).multiplyScalar(.78);
      this.color('blossom',p.blossom.color); p.blossomLight.color.copy(p.blossom.color).lerp(this.white,.25);
      this.color('water',this.island.waterMaterial.color); this.color('sky',this.skyColor); this.color('accent',this.accentColor); this.color('active',this.activeColor);
      p.snow.opacity=this.weights[3]*.94; p.snow.visible=p.snow.opacity>.01;
      this.fog=SEASONS.reduce((sum,s,i)=>sum+s.fog*this.weights[i],0);
      this.updateLeaves(physicsDt,time); this.updateSnow(physicsDt,time);
      this.activeParticles=this.leaves.count+this.snow.geometry.drawRange.count;
    }
    updateLeaves(dt,time) {
      const weight=this.weights[2], count=Math.floor(this.leafCapacity*smooth(0,.85,weight));
      this.leaves.count=count; this.leaves.visible=count>0; this.leafMaterial.opacity=weight*.95;
      if(!count)return;
      const state=this.leafState,dummy=this.dummy;
      // Fixed particle storage, recycled above the island. Sine acceleration and
      // independent tumbling make leaves flutter rather than fall in straight lines.
      for(let i=0;i<count;i++) {
        const n=i*9;
        state[n]+=(.19+Math.sin(time*.7+state[n+3])*.38)*dt;
        state[n+1]-=state[n+4]*dt; state[n+2]+=Math.cos(time*.5+state[n+3])*.19*dt;
        if(state[n+1]<-3.8 || state[n]>9.5) {state[n]=range(-8.5,7.8);state[n+1]=range(10,12);state[n+2]=range(-6,6);}
        dummy.position.set(state[n]+Math.sin(time*1.6+state[n+3])*.22,state[n+1],state[n+2]);
        dummy.rotation.set(time*state[n+5]+state[n+6],time*.6+state[n+3],Math.sin(time*state[n+7]+state[n+3])*.8);
        dummy.scale.setScalar(state[n+8]); dummy.updateMatrix(); this.leaves.setMatrixAt(i,dummy.matrix);
      }
      this.leaves.instanceMatrix.needsUpdate=true;
    }
    updateSnow(dt,time) {
      const weight=this.weights[3], count=Math.floor(this.snowCapacity*smooth(0,.85,weight));
      this.snow.geometry.setDrawRange(0,count); this.snow.visible=count>0; this.snowMaterial.opacity=weight*.88;
      if(!count)return;
      for(let i=0;i<count;i++) {
        const n=i*3;
        this.snowPositions[n]+=Math.sin(time*.6+this.snowPhase[i])*.17*dt;
        this.snowPositions[n+1]-=this.snowSpeed[i]*dt;
        this.snowPositions[n+2]+=Math.cos(time*.4+this.snowPhase[i])*.09*dt;
        if(this.snowPositions[n+1]<-4) {this.snowPositions[n+1]=12;this.snowPositions[n]=range(-9,9);this.snowPositions[n+2]=range(-7,7);}
      }
      this.snow.geometry.attributes.position.needsUpdate=true;
    }
  }

  class DayNightCycle {
    constructor(scene,kit) {
      this.phase=.16; this.period=15; this.paused=false; this.jumpState=null;
      this.skyColor=new T.Color(); this.ink=new T.Color(); this.muted=new T.Color(); this.active=new T.Color(); this.accent=new T.Color();
      this.dayInk=new T.Color('#263d34'); this.nightInk=new T.Color('#e5eada'); this.dayMuted=new T.Color('#758073'); this.nightMuted=new T.Color('#a6b9b8'); this.nightActive=new T.Color('#354c50'); this.nightAccent=new T.Color('#c5d5b0');
      this.sunColor=new T.Color('#fff4cf'); this.duskColor=new T.Color('#ffb17b'); this.moonColor=new T.Color('#a4bfdc'); this.scratchColor=new T.Color();
      this.frames=[
        [0,'#e9e4dc',0],[.09,'#edf1e8',0],[.34,'#edf1e8',0],[.46,'#eddac5',0],[.55,'#9aaeb4',.55],[.67,'#203b4b',1],[.84,'#203b4b',1],[.94,'#b6c4c1',.35],[1,'#e9e4dc',0]
      ].map(([at,color,night])=>({at,color:new T.Color(color),night}));
      this.hemisphere=new T.HemisphereLight('#f3f6df','#9cae89',2.4); scene.add(this.hemisphere);
      this.key=new T.DirectionalLight('#fff0cb',3); this.key.position.set(-8,16,10); this.key.castShadow=true;
      const shadow=this.key.shadow; shadow.mapSize.set(window.innerWidth<700?1024:2048,window.innerWidth<700?1024:2048);
      Object.assign(shadow.camera,{left:-12,right:12,top:15,bottom:-11,near:.5,far:60}); shadow.bias=-.0005; shadow.normalBias=.035; shadow.radius=3; scene.add(this.key);
      const fill=new T.DirectionalLight('#d3e5d7',.65); fill.position.set(6,7,-10); scene.add(fill);
      this.points=[];
      for(const [x,y,z,power] of [[-.65,5.9,-.75,4.5],[-4.5,2.8,-2.1,3],[2.65,2.5,1.18,5]]) {const light=new T.PointLight('#ffbc72',0,8,2);light.position.set(x,y,z);light.userData.power=power;scene.add(light);this.points.push(light);}
      this.kit=kit; this.scene=scene;
    }
    jump() {
      const moments=[.22,.46,.72,.98];
      const next=moments.find(p=>p>this.phase+.065)??moments[0];
      this.jumpState={from:this.phase,distance:(next-this.phase+1)%1,elapsed:0};
    }
    update(dt,weather) {
      if(this.jumpState) {
        const j=this.jumpState; j.elapsed+=dt; this.phase=(j.from+j.distance*smooth(0,.85,j.elapsed))%1;
        if(j.elapsed>=.85)this.jumpState=null;
      } else if(!this.paused)this.phase=(this.phase+dt/this.period)%1;
      let a=this.frames[0],b=this.frames[1];
      for(let i=0;i<this.frames.length-1;i++)if(this.phase>=this.frames[i].at&&this.phase<this.frames[i+1].at){a=this.frames[i];b=this.frames[i+1];break;}
      const t=smooth(a.at,b.at,this.phase);
      this.night=lerp(a.night,b.night,t);
      const sunHeight=Math.sin(this.phase*TAU);
      this.daylight=smooth(-.18,.45,sunHeight);
      this.skyColor.copy(a.color).lerp(b.color,t).lerp(weather.skyColor,(1-this.night)*.23);
      this.scene.fog.color.copy(this.skyColor); this.scene.fog.density=weather.fog*(.8+this.night*.25);
      const sunset=Math.exp(-Math.pow((this.phase-.46)/.065,2));
      this.key.color.copy(this.sunColor).lerp(this.duskColor,sunset*.8).lerp(this.moonColor,this.night);
      this.key.intensity=.62+this.daylight*(2.4+weather.weights[1]*.55);
      this.key.position.set(lerp(-7,6,1-this.daylight),12+this.daylight*6,9);
      this.hemisphere.intensity=lerp(2.25,.85,this.night);
      // Lamps fade on before sunset and extinguish before dawn. This is a bounded
      // intensity curve, not repeated creation/removal of lights at each boundary.
      this.lampLevel=smooth(.35,.49,this.phase)*(1-smooth(.82,.895,this.phase));
      for(const light of this.points)light.intensity=light.userData.power*this.lampLevel;
      this.kit.palette.windows.emissiveIntensity=this.lampLevel*1.7;
      this.kit.palette.lamps.emissiveIntensity=.1+this.lampLevel*2.4;
      this.kit.palette.wheelLight.emissiveIntensity=this.lampLevel*1.8;
      this.ink.copy(this.dayInk).lerp(this.nightInk,this.night);
      this.muted.copy(this.dayMuted).lerp(this.nightMuted,this.night);
      this.active.copy(weather.activeColor).lerp(this.nightActive,this.night);
      this.accent.copy(weather.accentColor).lerp(this.nightAccent,this.night);
    }
    get moment() {
      if(this.phase<.08||this.phase>=.9)return {name:'First light',icon:'sun',next:'daylight'};
      if(this.phase<.37)return {name:'Daylight',icon:'sun',next:'sunset'};
      if(this.phase<.56)return {name:'Golden hour',icon:'sun',next:'night'};
      return {name:'Nightfall',icon:'moon',next:'dawn'};
    }
    paintUI(element) {
      const s=element.style;
      s.setProperty('--paper',`#${this.skyColor.getHexString()}`); s.setProperty('--ink',`#${this.ink.getHexString()}`); s.setProperty('--muted',`#${this.muted.getHexString()}`);
      s.setProperty('--active',`#${this.active.getHexString()}`); s.setProperty('--accent',`#${this.accent.getHexString()}`); s.setProperty('--night',this.night.toFixed(3));
      const r=Math.round(lerp(255,39,this.night)),g=Math.round(lerp(255,62,this.night)),b=Math.round(lerp(249,72,this.night));
      s.setProperty('--panel',`rgba(${r},${g},${b},.78)`); s.setProperty('--line',`rgba(${this.night>.5?'216,230,215':'50,72,53'},.16)`);
    }
  }

  class OrbitController {
    constructor(camera,canvas,signal) {
      this.camera=camera; this.canvas=canvas;
      this.yaw=this.targetYaw=.56; this.elevation=this.targetElevation=.48; this.zoom=this.targetZoom=1;
      this.target=new T.Vector3(0,2.4,0); this.dragging=false; this.pointer=null;
      this.canvas.addEventListener('pointerdown',e=>{
        if(e.button!==0||this.pointer!==null)return;
        this.pointer=e.pointerId; this.dragging=true; this.lastX=e.clientX;this.lastY=e.clientY;
        canvas.setPointerCapture(e.pointerId); canvas.classList.add('is-dragging');
      },{signal});
      this.canvas.addEventListener('pointermove',e=>{
        if(!this.dragging||e.pointerId!==this.pointer)return;
        this.targetYaw-=(e.clientX-this.lastX)*.007; this.targetElevation=clamp(this.targetElevation+(e.clientY-this.lastY)*.003,.23,.78);
        this.lastX=e.clientX;this.lastY=e.clientY;
      },{signal});
      const release=e=>{if(e.pointerId!==this.pointer)return;this.dragging=false;this.pointer=null;canvas.classList.remove('is-dragging');};
      canvas.addEventListener('pointerup',release,{signal});canvas.addEventListener('pointercancel',release,{signal});canvas.addEventListener('lostpointercapture',release,{signal});
      canvas.addEventListener('wheel',e=>{e.preventDefault();this.changeZoom(-e.deltaY*.00075);},{passive:false,signal});
    }
    changeZoom(amount) {this.targetZoom=clamp(this.targetZoom+amount,.72,1.65);}
    reset() {this.targetYaw=.56;this.targetElevation=.48;this.targetZoom=1;}
    resize(width,height) {
      const aspect=width/height, half=Math.max(8.4,9/aspect);
      Object.assign(this.camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});this.camera.updateProjectionMatrix();
    }
    update(dt) {
      const ease=1-Math.exp(-dt*10);
      this.yaw=lerp(this.yaw,this.targetYaw,ease);this.elevation=lerp(this.elevation,this.targetElevation,ease);this.zoom=lerp(this.zoom,this.targetZoom,ease);
      const radius=30,flat=Math.cos(this.elevation)*radius;
      this.camera.position.set(Math.sin(this.yaw)*flat,Math.sin(this.elevation)*radius+this.target.y,Math.cos(this.yaw)*flat);
      this.camera.lookAt(this.target);this.camera.zoom=this.zoom;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    }
  }

  class AmbientAudio {
    constructor(){this.enabled=false;this.context=null;this.nextBird=0;}
    async toggle() {
      try {
        if(!this.context) {
          const AudioContext=window.AudioContext||window.webkitAudioContext;
          if(!AudioContext)return false;
          this.context=new AudioContext(); const c=this.context;
          this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);
          const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),data=buffer.getChannelData(0);let last=0;
          for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.025)/1.025;data[i]=last*3.5;}
          this.wind=c.createBufferSource();this.wind.buffer=buffer;this.wind.loop=true;
          this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=600;
          this.windGain=c.createGain();this.windGain.gain.value=.1;
          this.wind.connect(this.filter);this.filter.connect(this.windGain);this.windGain.connect(this.master);this.wind.start();
          this.bird=c.createOscillator();this.bird.type='sine';this.bird.frequency.value=1800;this.birdGain=c.createGain();this.birdGain.gain.value=0;this.bird.connect(this.birdGain);this.birdGain.connect(this.master);this.bird.start();
        }
        await this.context.resume();this.enabled=!this.enabled;
        this.master.gain.setTargetAtTime(this.enabled?.42:0,this.context.currentTime,.25);return true;
      } catch(error){return false;}
    }
    update(time,weights,daylight) {
      if(!this.enabled||!this.context||this.context.state!=='running')return;
      const now=this.context.currentTime;
      this.windGain.gain.setTargetAtTime(.08+weights[2]*.12+weights[3]*.07,now,.5);
      this.filter.frequency.setTargetAtTime(400+weights[0]*300+weights[2]*600,now,.5);
      if(time>this.nextBird&&daylight>.5&&(weights[0]+weights[1])>.5) {
        this.nextBird=time+range(4,8);this.bird.frequency.setValueAtTime(range(1800,2400),now);this.bird.frequency.exponentialRampToValueAtTime(2800,now+.08);this.bird.frequency.exponentialRampToValueAtTime(1700,now+.23);
        this.birdGain.gain.setValueAtTime(0,now);this.birdGain.gain.linearRampToValueAtTime(.025,now+.035);this.birdGain.gain.linearRampToValueAtTime(0,now+.25);
      }
    }
    visibility(hidden){if(this.context){if(hidden)this.context.suspend();else if(this.enabled)this.context.resume().catch(()=>{});}}
    dispose(){if(this.context)this.context.close().catch(()=>{});}
  }

  class LondonApp {
    constructor() {
      this.element=$('#app');this.canvas=$('#world');this.container=$('#scene-container');
      this.events=new AbortController();this.signal=this.events.signal;
      this.destroyed=false;this.contextLost=false;this.time=0;this.uiTimer=0;this.fpsTime=0;this.frames=0;this.fps=60;this.lastTimestamp=0;this.toastTimeout=0;
      this.renderer=new T.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
      this.renderer.setClearColor(0x000000,0);this.renderer.outputColorSpace=T.SRGBColorSpace;
      this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
      this.scene=new T.Scene();this.scene.fog=new T.FogExp2('#edf1e8',.012);
      this.camera=new T.OrthographicCamera(-12,12,9,-9,.1,100);
      this.kit=new ArtKit();this.island=new Island(this.scene,this.kit);
      this.atmosphere=new Atmosphere(this.scene,this.kit);
      this.weather=new WeatherSystem(this.scene,this.kit,this.island);
      this.cycle=new DayNightCycle(this.scene,this.kit);
      this.orbit=new OrbitController(this.camera,this.canvas,this.signal);
      this.audio=new AmbientAudio();this.projected=new T.Vector3();
      this.labels=[
        {element:$('[data-landmark="eye"]'),anchor:new T.Vector3(-5.7,3.6,-2.1),x:-105,y:-15},
        {element:$('[data-landmark="ben"]'),anchor:new T.Vector3(-.65,7.5,-.75),x:33,y:-20},
        {element:$('[data-landmark="bridge"]'),anchor:new T.Vector3(4.6,2.85,1.18),x:27,y:-5}
      ];
      this.bindUI();this.resize();this.orbit.update(1);
      this.weather.onChange=()=>this.paintSeason();this.paintSeason();
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.container);
      document.addEventListener('visibilitychange',()=>{
        this.audio.visibility(document.hidden);
        if(document.hidden)cancelAnimationFrame(this.raf);
        else if(!this.destroyed){this.lastTimestamp=0;this.raf=requestAnimationFrame(this.frame);}
      },{signal:this.signal});
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;this.toast('The world is taking a breath. Restoring graphics…');},{signal:this.signal});
      this.canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.resize();this.toast('Welcome back to your little world.');},{signal:this.signal});
      window.addEventListener('pagehide',e=>{if(!e.persisted)this.dispose();},{signal:this.signal});
      this.container.setAttribute('aria-busy','false');
      this.raf=requestAnimationFrame(this.frame);
      // A small public inspection API is useful for embedding and checking budgets.
      window.littleLondon=Object.freeze({
        setSeason:index=>{if(Number.isInteger(index)&&index>=0&&index<4)this.weather.select(index);},
        resetView:()=>this.orbit.reset(),
        getState:()=>({season:SEASONS[this.weather.target].name,weights:Array.from(this.weather.weights),autoCycle:this.weather.auto,dayPhase:this.cycle.phase,dayPaused:this.cycle.paused,dayPeriod:this.cycle.period,lamps:this.cycle.lampLevel,particles:this.weather.activeParticles,particleCapacity:this.weather.leafCapacity+this.weather.snowCapacity,fps:Math.round(this.fps),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,cameraYaw:this.orbit.yaw,zoom:this.orbit.zoom})
      });
    }
    bindUI() {
      const on=(element,type,handler)=>element.addEventListener(type,handler,{signal:this.signal});
      for(const button of $$('.season-tab'))on(button,'click',()=>this.weather.select(Number(button.dataset.season)));
      on($('#auto-cycle'),'click',()=>{this.weather.toggleAuto();this.toast(this.weather.auto?'The seasons will turn, every 24 seconds.':'Stay in this season a little longer.');});
      on($('#zoom-in'),'click',()=>this.orbit.changeZoom(.16));on($('#zoom-out'),'click',()=>this.orbit.changeZoom(-.16));
      on($('#reset-view'),'click',()=>{this.orbit.reset();this.toast('Back to your favorite perspective.');});
      on($('#time-jump'),'click',()=>this.cycle.jump());
      on($('#pause-time'),'click',()=>this.toggleTime());
      on($('#sound-button'),'click',()=>this.toggleSound());
      on($('#about-button'),'click',()=>this.showInfo('about'));
      for(const label of $$('.landmark-label'))on(label,'click',()=>this.showInfo(label.dataset.landmark));
      const dialog=$('#info-dialog');
      on($('#close-dialog'),'click',()=>dialog.close());on($('#dialog-done'),'click',()=>dialog.close());
      on(dialog,'click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
      on(document,'keydown',e=>{
        if(e.altKey||e.ctrlKey||e.metaKey||e.target.matches('input,textarea,select')||dialog.open)return;
        const key=e.key.toLowerCase();
        if(/^[1-4]$/.test(key)){this.weather.select(Number(key)-1);e.preventDefault();}
        else if(key==='a')this.weather.toggleAuto();
        else if(key==='d')this.cycle.jump();
        else if(key==='m')this.toggleSound();
        else if(key==='r')this.orbit.reset();
        else if(key==='f'){const debug=$('#debug');debug.hidden=!debug.hidden;}
        else if(key==='+'||key==='='){this.orbit.changeZoom(.12);e.preventDefault();}
        else if(key==='-'){this.orbit.changeZoom(-.12);e.preventDefault();}
        else if(key==='arrowleft'){this.orbit.targetYaw+=.18;e.preventDefault();}
        else if(key==='arrowright'){this.orbit.targetYaw-=.18;e.preventDefault();}
        else if(key===' '&&!e.target.closest('button,a')){this.toggleTime();e.preventDefault();}
      });
    }
    toggleTime() {
      this.cycle.paused=!this.cycle.paused;
      const button=$('#pause-time');button.setAttribute('aria-pressed',String(this.cycle.paused));
      button.setAttribute('aria-label',`${this.cycle.paused?'Resume':'Pause'} day and night cycle`);
      button.title=`${this.cycle.paused?'Resume':'Pause'} day and night (Space)`;
      button.querySelector('use').setAttribute('href',this.cycle.paused?'#i-play':'#i-pause');
      this.toast(this.cycle.paused?'Hold this light. Let the world keep moving.':'Let the day unfold.');
    }
    async toggleSound() {
      const success=await this.audio.toggle();
      if(!success){this.toast('Ambient sound is unavailable in this browser.');return;}
      const button=$('#sound-button');button.setAttribute('aria-pressed',String(this.audio.enabled));
      button.setAttribute('aria-label',`${this.audio.enabled?'Mute':'Turn on'} ambient sound`);
      button.title=`${this.audio.enabled?'Mute':'Turn on'} ambient sound (M)`;
      button.querySelector('use').setAttribute('href',this.audio.enabled?'#i-volume':'#i-mute');
      this.toast(this.audio.enabled?'A little birdsong. A soft London breeze.':'A quiet moment.');
    }
    paintSeason() {
      const current=SEASONS[this.weather.target];
      for(const button of $$('.season-tab')) {const active=Number(button.dataset.season)===this.weather.target;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
      $('#auto-cycle').setAttribute('aria-checked',String(this.weather.auto));
      $('#temperature').textContent=current.temperature;$('#weather-description').textContent=current.description;$('#season-poem').textContent=current.poem;
      $('#weather-icon use').setAttribute('href',`#i-${current.icon}`);
    }
    showInfo(which) {
      const content={
        about:{eyebrow:'WELCOME TO LITTLE WORLDS',title:'Small world.<br>Endless wonder.',body:'<p>A little love letter to London. A floating city, a changing sky, and a quiet invitation to slow down.</p><p>Drag to find a new perspective. Choose a season, or let all four unfold. Watch a full day pass in 15 seconds — and the landmarks glow after sunset.</p><div class="shortcut-list"><span><kbd>1–4</kbd> Choose a season</span><span><kbd>A</kbd> Auto seasons</span><span><kbd>D</kbd> Next time of day</span><span><kbd>Space</kbd> Hold the light</span><span><kbd>R</kbd> Reset the view</span><span><kbd>M</kbd> Ambient sound</span><span><kbd>← →</kbd> Rotate the island</span><span><kbd>F</kbd> Performance stats</span></div><p class="dialog-small">An imagined miniature. The weather is a little story, not a live forecast.</p>'},
        ben:{eyebrow:'THE HEART OF OUR LITTLE CITY',title:'Always a<br>good time.',body:'<p>Big Ben keeps watch over this miniature London. Look closer: four clock faces follow our little world’s time, beneath a crown of green spires.</p><p>Stay until golden hour to see the clock faces and windows turn a warm, honey-colored glow.</p>'},
        eye:{eyebrow:'A DIFFERENT POINT OF VIEW',title:'The city,<br>in a slow circle.',body:'<p>The London Eye turns gently above the rooftops. Each tiny capsule stays upright as the wheel carries it around.</p><p>A quiet reminder that sometimes, the best way to see somewhere familiar is from a different perspective.</p>'},
        bridge:{eyebrow:'TWO SIDES OF A LITTLE WORLD',title:'Meet me<br>by the river.',body:'<p>Twin stone towers and blue suspension cables stretch across our miniature Thames. Below, a little riverboat drifts beneath the bridge.</p><p>Follow the water to the island’s edge, where the river becomes a waterfall in the sky.</p>'}
      }[which];
      if(!content)return;
      $('#dialog-eyebrow').textContent=content.eyebrow;$('#dialog-title').innerHTML=content.title;$('#dialog-content').innerHTML=content.body;
      const dialog=$('#info-dialog');if(!dialog.open)dialog.showModal();
    }
    toast(message) {
      clearTimeout(this.toastTimeout);const element=$('#toast');element.textContent=message;element.classList.add('show');
      this.toastTimeout=setTimeout(()=>element.classList.remove('show'),2800);
    }
    resize() {
      const rect=this.container.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
      this.renderer.setSize(this.width,this.height,false);this.orbit.resize(this.width,this.height);
    }
    paintUI() {
      this.cycle.paintUI(this.element);
      const moment=this.cycle.moment;
      if(this.lastMoment!==moment.name) {
        this.lastMoment=moment.name;$('#time-label').textContent=moment.name;$('#time-icon use').setAttribute('href',`#i-${moment.icon}`);
        $('#time-jump').setAttribute('aria-label',`Skip to ${moment.next}`);
      }
      $('#time-progress').style.transform=`scaleX(${this.cycle.phase})`;
      this.element.style.setProperty('--season-progress',this.weather.auto?(this.weather.elapsed/this.weather.duration).toFixed(4):'1');
      $('#compass-needle').style.transform=`rotate(${(this.orbit.yaw-.56)*180/Math.PI-24}deg)`;
      $('#zoom-in').disabled=this.orbit.targetZoom>=1.65;$('#zoom-out').disabled=this.orbit.targetZoom<=.72;
      if(!$('#debug').hidden)$('#debug').textContent=`${Math.round(this.fps)} FPS · ${this.weather.activeParticles} particles · ${this.renderer.info.render.calls} draws`;
    }
    positionLabels() {
      if(window.innerWidth<761||window.innerHeight<481)return;
      for(const label of this.labels) {
        this.projected.copy(label.anchor);this.island.group.localToWorld(this.projected);this.projected.project(this.camera);
        const x=(this.projected.x*.5+.5)*this.width+label.x, y=(-this.projected.y*.5+.5)*this.height+label.y;
        label.element.style.transform=`translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
        const facing=Math.abs(Math.sin((this.orbit.yaw-.56)*.5));
        const visible=x>0&&x<this.width-110&&y>15&&y<this.height-30&&facing<.25;
        label.element.style.opacity=visible?'1':'0';
        label.element.style.pointerEvents=visible?'auto':'none';
        label.element.tabIndex=visible?0:-1;
      }
    }
    frame=(timestamp)=>{
      if(this.destroyed||document.hidden)return;
      // Time of day uses real elapsed visible time. Physics uses a bounded step so
      // a slow frame cannot fling particles or the camera across the diorama.
      const dt=this.lastTimestamp?Math.max(0,(timestamp-this.lastTimestamp)/1000):0;
      this.lastTimestamp=timestamp;const physicsDt=Math.min(dt,.05);this.time+=dt;
      this.weather.update(dt,physicsDt,this.time);this.cycle.update(dt,this.weather);
      this.island.update(this.time,physicsDt,this.cycle.phase,this.cycle.lampLevel);
      this.atmosphere.update(this.time,this.weather.weights,this.cycle.phase,this.cycle.daylight,this.cycle.night);
      this.orbit.update(physicsDt);this.audio.update(this.time,this.weather.weights,this.cycle.daylight);
      this.uiTimer+=dt;this.fpsTime+=dt;this.frames++;
      if(this.fpsTime>=.75){this.fps=this.frames/this.fpsTime;this.frames=0;this.fpsTime=0;}
      if(this.uiTimer>.075||dt===0){this.paintUI();this.uiTimer=0;}
      if(!this.contextLost){this.renderer.render(this.scene,this.camera);this.positionLabels();}
      if(!this.loaded){this.loaded=true;$('#scene-loading').classList.add('loaded');$('#scene-loading').setAttribute('aria-hidden','true');}
      this.raf=requestAnimationFrame(this.frame);
    };
    dispose() {
      if(this.destroyed)return;this.destroyed=true;cancelAnimationFrame(this.raf);clearTimeout(this.toastTimeout);
      this.events.abort();this.resizeObserver.disconnect();this.audio.dispose();
      const geometries=new Set(this.kit.geometries.values()),materials=new Set(this.kit.materials.values()),textures=new Set(this.kit.textures);
      this.scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material){for(const material of (Array.isArray(object.material)?object.material:[object.material]))materials.add(material);}if(object.shadow)object.shadow.dispose();});
      for(const material of materials){for(const value of Object.values(material))if(value&&value.isTexture)textures.add(value);material.dispose();}
      for(const geometry of geometries)geometry.dispose();for(const texture of textures)texture.dispose();this.renderer.dispose();
    }
  }

  function showError(message) {
    const loader=$('#scene-loading');loader.classList.add('error');loader.querySelector('p').textContent=message;
    $('#scene-container').setAttribute('aria-busy','false');
  }
  function boot() {
    T=window.THREE;
    if(!T)return false;
    try{app=new LondonApp();}catch(error){console.error('Little Worlds could not initialize:',error);showError('This little world needs WebGL. Enable hardware acceleration and refresh to explore.');}
    return true;
  }
  $('#scene-container').setAttribute('aria-busy','true');
  if(!boot()) {
    const start=performance.now();
    const wait=()=>{if(boot())return;if(performance.now()-start>20000){showError('The world couldn’t load. Check your internet connection and refresh to fetch Three.js.');return;}setTimeout(wait,150);};
    wait();
  }
})();
