/* KŌYŌ · Tokyo, suspended in an endless autumn.
   All artwork is procedural. Three.js is the only runtime dependency. */
'use strict';

(() => {
  if (!window.THREE) return;
  const T = window.THREE;
  const TAU = Math.PI * 2;
  const clamp = T.MathUtils.clamp;
  const lerp = T.MathUtils.lerp;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // A seeded generator makes the same carefully composed world on every visit.
  let seed = 1717;
  function random(a = 0, b = 1) { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); }
  const palette = {
    red: '#d65739', vermilion: '#ef7047', cream: '#f2e5c9', grass: '#9ca782',
    dark: '#424e48', roof: '#536264', gold: '#e5a549', trunk: '#7e5848', stone: '#d8c9a9'
  };
  const materials = new Map();
  function material(color, extra = {}) {
    const key = color + JSON.stringify(extra);
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: .9, metalness: 0, ...extra }));
    return materials.get(key);
  }
  const geometries = new Map();
  function geometry(key, factory) { if (!geometries.has(key)) geometries.set(key, factory()); return geometries.get(key); }
  const boxGeometry = geometry('box', () => new T.BoxGeometry(1, 1, 1));
  const sphereGeometry = geometry('ico', () => new T.IcosahedronGeometry(1, 1));
  const lowSphereGeometry = geometry('icoLow', () => new T.IcosahedronGeometry(1, 0));
  const cylinderGeometry = geometry('cylinder', () => new T.CylinderGeometry(1, 1, 1, 8));
  const v1 = new T.Vector3(), v2 = new T.Vector3(), direction = new T.Vector3();
  const up = new T.Vector3(0, 1, 0);
  function mesh(parent, geo, mat, position, scale) {
    const object = new T.Mesh(geo, mat);
    if (position) object.position.set(...position);
    if (scale) object.scale.set(...scale);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent, x, y, z, w, h, d, color, mat) { return mesh(parent, boxGeometry, mat || material(color), [x, y, z], [w, h, d]); }
  function sphere(parent, x, y, z, sx, sy, sz, color, low = false) { return mesh(parent, low ? lowSphereGeometry : sphereGeometry, material(color, { flatShading: true }), [x, y, z], [sx, sy, sz]); }
  function beam(parent, a, b, radius, color, square = false, mat) {
    v1.set(...a); v2.set(...b); direction.subVectors(v2, v1);
    const m = mesh(parent, square ? boxGeometry : cylinderGeometry, mat || material(color));
    m.position.copy(v1).add(v2).multiplyScalar(.5);
    m.scale.set(radius, direction.length(), radius);
    m.quaternion.setFromUnitVectors(up, direction.normalize());
    return m;
  }
  function cone(parent, radius, height, position, color, segments = 8) {
    return mesh(parent, geometry(`cone-${radius}-${height}-${segments}`, () => new T.ConeGeometry(radius, height, segments)), material(color, { flatShading: true }), position);
  }

  // Bake static meshes together by material. Tree groups remain independently
  // animated, while the tower's many trusses become a handful of draw calls.
  function batchStatic(group) {
    const batches = new Map();
    for (const child of group.children) {
      if (!child.isMesh || child.isInstancedMesh || Array.isArray(child.material)) continue;
      const key = child.material.uuid;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(child);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const chunks = []; let size = 0;
      for (const object of meshes) {
        object.updateMatrix();
        const transformed = object.geometry.clone().applyMatrix4(object.matrix);
        const geo = transformed.index ? transformed.toNonIndexed() : transformed;
        if (geo !== transformed) transformed.dispose();
        chunks.push(geo); size += geo.attributes.position.array.length;
      }
      const positions = new Float32Array(size), normals = new Float32Array(size);
      const useColors = meshes[0].material.vertexColors;
      const colors = useColors ? new Float32Array(size) : null;
      let offset = 0;
      for (const chunk of chunks) {
        positions.set(chunk.attributes.position.array, offset);
        normals.set(chunk.attributes.normal.array, offset);
        if (useColors) colors.set(chunk.attributes.color.array, offset);
        offset += chunk.attributes.position.array.length; chunk.dispose();
      }
      const merged = new T.BufferGeometry();
      merged.setAttribute('position', new T.BufferAttribute(positions, 3));
      merged.setAttribute('normal', new T.BufferAttribute(normals, 3));
      if (useColors) merged.setAttribute('color', new T.BufferAttribute(colors, 3));
      meshes.forEach(object => group.remove(object));
      mesh(group, merged, meshes[0].material);
    }
  }

  class TokyoTower {
    constructor(parent) {
      this.group = new T.Group();
      this.group.position.set(-.15, .72, -.35);
      parent.add(this.group);
      const p = this.group, red = palette.red, white = '#fff1d9';
      this.windowMaterial = new T.MeshStandardMaterial({ color: '#7c9290', emissive: '#ffb55b', emissiveIntensity: 0, roughness: .4, metalness: .2 });
      this.bulbMaterial = new T.MeshStandardMaterial({ color: '#f7d2a0', emissive: '#ff993e', emissiveIntensity: 0 });
      const levels = [0, .8, 1.6, 2.4, 3.15, 3.55, 4.15, 4.75, 5.35];
      const widthAt = y => y <= 3.15 ? lerp(1.2, .57, y / 3.15) : lerp(.53, .18, (y - 3.15) / 2.2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        box(p, sx * 1.2, .045, sz * 1.2, .47, .19, .47, palette.stone);
        beam(p, [sx * 1.2, .1, sz * 1.2], [sx * .57, 3.15, sz * .57], .115, red, true);
        beam(p, [sx * .53, 3.3, sz * .53], [sx * .18, 5.45, sz * .18], .085, red, true);
      }
      // Four faces of crossed trusses; every element shares cached geometry/materials.
      for (let i = 0; i < levels.length - 1; i++) {
        const ya = levels[i], yb = levels[i + 1];
        if (ya === 3.15) continue;
        const wa = widthAt(ya), wb = widthAt(yb);
        for (const side of [-1, 1]) {
          beam(p, [-wa, ya, wa * side], [wb, yb, wb * side], .047, red, true);
          beam(p, [wa, ya, wa * side], [-wb, yb, wb * side], .047, red, true);
          beam(p, [wa * side, ya, -wa], [wb * side, yb, wb], .047, red, true);
          beam(p, [wa * side, ya, wa], [wb * side, yb, -wb], .047, red, true);
          beam(p, [-wb, yb, wb * side], [wb, yb, wb * side], .048, red, true);
          beam(p, [wb * side, yb, -wb], [wb * side, yb, wb], .048, red, true);
        }
      }
      this.observationDeck(3.25, 1.58, .3);
      this.observationDeck(5.45, .72, .23);
      box(p, 0, 3.48, 0, 1.75, .08, 1.75, white);
      box(p, 0, 3.1, 0, 1.7, .12, 1.7, red);
      for (const side of [-1, 1]) {
        for (let i = -5; i <= 5; i++) {
          box(p, i * .14, 3.53, side * .79, .025, .15, .025, white);
          box(p, side * .79, 3.53, i * .14, .025, .15, .025, white);
        }
        box(p, 0, 3.6, side * .79, 1.63, .025, .025, white);
        box(p, side * .79, 3.6, 0, .025, .025, 1.63, white);
      }
      // Alternating antenna stripes make Tokyo Tower's silhouette unmistakable.
      for (let i = 0; i < 8; i++) {
        const y = 5.7 + i * .18;
        const r = .13 - i * .009;
        mesh(p, cylinderGeometry, material(i % 2 ? red : white), [0, y, 0], [r, .18, r]);
      }
      beam(p, [0, 7.06, 0], [0, 7.55, 0], .032, red);
      mesh(p, sphereGeometry, this.bulbMaterial, [0, 7.11, 0], [.07, .07, .07]);
      // Small practical lights supplement the emissive windows at night.
      this.light = new T.PointLight('#ffb256', 0, 10, 2);
      this.light.position.set(0, 2.5, 1.2); p.add(this.light);
    }
    observationDeck(y, width, height) {
      const p = this.group;
      box(p, 0, y, 0, width, height, width, null, this.windowMaterial);
      box(p, 0, y + height / 2, 0, width + .12, .075, width + .12, palette.cream);
      box(p, 0, y - height / 2, 0, width + .12, .075, width + .12, palette.red);
      for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) {
        box(p, i * width / 7, y, s * (width / 2 + .007), .033, height, .025, palette.cream);
        box(p, s * (width / 2 + .007), y, i * width / 7, .025, height, .033, palette.cream);
      }
    }
    setNight(value, elapsed) {
      this.windowMaterial.emissiveIntensity = value * 1.7;
      this.bulbMaterial.emissiveIntensity = value * (1.5 + Math.sin(elapsed * 3) * .4);
      this.light.intensity = value * 7;
    }
  }

  class Landmark {
    constructor(parent) { this.group = new T.Group(); parent.add(this.group); }
    static roof(parent, y, width, depth, height, color) {
      // A four-ring roof lifts the corners, giving the eaves a gentle Japanese curve.
      const positions = [], indices = [];
      const rings = [{ w: width * .18, d: depth * .18, y: y + height }, { w: width * .63, d: depth * .63, y: y + height * .45 }, { w: width, d: depth, y: y + .02 }, { w: width * 1.06, d: depth * 1.06, y: y + .12 }];
      rings.forEach(r => { for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) positions.push(x * r.w / 2, r.y, z * r.d / 2); });
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
        const a = r * 4 + i, b = r * 4 + (i + 1) % 4, c = (r + 1) * 4 + i, d = (r + 1) * 4 + (i + 1) % 4;
        indices.push(a, c, b, b, c, d);
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      mesh(parent, geo, material(color, { side: T.DoubleSide, flatShading: true }));
      beam(parent, [-width * .15, y + height + .025, 0], [width * .15, y + height + .025, 0], .045, color);
    }
  }

  class MountFuji extends Landmark {
    constructor(parent) {
      super(parent); this.group.position.set(-3.15, .71, -2.25);
      const p = this.group, radius = 1.8, height = 2.7, n = 12;
      const vertices = [], colors = [];
      const blue = new T.Color('#81999f'), snow = new T.Color('#fff4dd');
      // A jagged snow line is part of the mountain mesh rather than a second cone.
      const ring = [];
      for (let i = 0; i < n; i++) {
        const angle = i / n * TAU;
        const snowY = height * random(.59, .75);
        ring.push([Math.cos(angle) * radius * (1 - snowY / height), snowY, Math.sin(angle) * radius * (1 - snowY / height)]);
      }
      function tri(a, b, c, color) { vertices.push(...a, ...b, ...c); for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b); }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = i / n * TAU, b = j / n * TAU;
        const baseA = [Math.cos(a) * radius, 0, Math.sin(a) * radius];
        const baseB = [Math.cos(b) * radius, 0, Math.sin(b) * radius];
        const faceBlue = blue.clone().multiplyScalar(random(.88, 1.13));
        tri(baseA, ring[i], baseB, faceBlue); tri(baseB, ring[i], ring[j], faceBlue);
        tri(ring[i], [0, height, 0], ring[j], snow.clone().multiplyScalar(random(.9, 1.04)));
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
      mesh(p, geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
      sphere(p, .1, .02, .1, 2.02, .14, 1.88, '#9baf92');
    }
  }

  class Pagoda extends Landmark {
    constructor(parent, glow) {
      super(parent); this.group.position.set(3.1, .7, -1.4); this.group.rotation.y = -.15;
      const p = this.group;
      box(p, 0, .06, 0, 2.2, .18, 1.95, '#c2b49a');
      for (let level = 0; level < 3; level++) {
        const y = .2 + level * .79, w = 1.4 - level * .23;
        box(p, 0, y + .3, 0, w, .65, w * .83, '#d2b393');
        box(p, 0, y + .3, w * .42, w * .73, .34, .025, null, glow);
        box(p, w * .5 + .007, y + .3, 0, .025, .34, w * .64, null, glow);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, sx * w * .47, y + .32, sz * w * .4, .075, .7, .075, palette.red);
        for (let i = -2; i <= 2; i++) box(p, i * w * .16, y + .32, w * .43, .035, .36, .03, palette.trunk);
        box(p, 0, y + .04, 0, w * 1.15, .09, w, palette.red);
        Landmark.roof(p, y + .65, w * 1.53, w * 1.4, .42, palette.roof);
        box(p, 0, y + .11, w * .51, w * 1.13, .055, .035, palette.red);
      }
      beam(p, [0, 2.95, 0], [0, 3.47, 0], .035, '#b58d4f');
      for (let i = 0; i < 4; i++) mesh(p, cylinderGeometry, material('#c6a05b'), [0, 3.05 + i * .1, 0], [.12 - i * .02, .025, .12 - i * .02]);
      for (let i = 0; i < 3; i++) box(p, 0, -.03 + i * .055, 1.15 - i * .14, .83, .09, .33, palette.stone);
    }
  }

  class Torii extends Landmark {
    constructor(parent) {
      super(parent); this.group.position.set(-2.7, .73, 2.25); this.group.rotation.y = -.12;
      const p = this.group;
      for (const x of [-.83, .83]) {
        box(p, x, .1, 0, .3, .22, .32, palette.dark);
        beam(p, [x, .12, 0], [x * .95, 1.92, 0], .11, palette.red);
        box(p, x, 1.15, 0, .21, .1, .23, '#b84e32');
      }
      box(p, 0, 1.51, 0, 2.17, .14, .19, palette.red);
      box(p, 0, 1.94, 0, 2.52, .18, .31, palette.red);
      box(p, 0, 2.07, 0, 2.68, .1, .38, '#574c40');
      for (const s of [-1, 1]) {
        const eave = box(p, s * 1.36, 2.105, 0, .24, .1, .38, '#574c40'); eave.rotation.z = s * .2;
      }
      box(p, 0, 1.73, .125, .29, .35, .07, '#d4a24f');
      box(p, 0, 1.73, .17, .19, .25, .025, palette.dark);
      // Shimenawa rope and paper streamers under the lintel.
      const rope = new T.CatmullRomCurve3([new T.Vector3(-.77, 1.67, .13), new T.Vector3(0, 1.54, .13), new T.Vector3(.77, 1.67, .13)]);
      mesh(p, new T.TubeGeometry(rope, 12, .022, 4, false), material('#d6bf8d'));
      for (const x of [-.48, .35]) { const paper = box(p, x, 1.45, .14, .09, .22, .012, palette.cream); paper.rotation.z = .3; }
    }
  }

  class Garden extends Landmark {
    constructor(parent) {
      super(parent); const p = this.group;
      // An irregular oval pond, ringed with flat river stones.
      const pond = mesh(p, geometry('pond', () => new T.CylinderGeometry(1, 1, .03, 40)), material('#91b6b1', { roughness: .3, metalness: .15 }), [2.6, .735, 2], [1.5, 1, 1.03]);
      pond.rotation.y = -.25;
      const rippleMaterial = material('#d8e2c4', { transparent: true, opacity: .55 });
      for (let i = 0; i < 3; i++) {
        const ring = mesh(p, new T.TorusGeometry(.24 + i * .11, .008, 3, 36), rippleMaterial, [2.22, .764, 2.16]); ring.rotation.x = -Math.PI / 2; ring.scale.y = .55;
      }
      for (let i = 0; i < 21; i++) {
        const a = i / 21 * TAU;
        const rock = sphere(p, 2.6 + Math.cos(a) * 1.48, .76, 2 + Math.sin(a) * 1.03, random(.12, .25), random(.08, .15), random(.1, .2), i % 4 ? '#c6bfa6' : '#a4ab8b', true); rock.rotation.y = random(0, TAU);
      }
      // Tiny koi sit just above the stylized water surface.
      for (let i = 0; i < 4; i++) { const fish = sphere(p, random(1.8, 3.3), .765, random(1.65, 2.3), .11, .012, .035, i % 2 ? '#e6c391' : '#c37651', true); fish.rotation.y = random(0, TAU); }
      this.bridge(p);
      // A gravel path curves around the base of the tower.
      for (let i = 0; i < 22; i++) {
        const t = i / 21, a = t * 3.3 - 1.2;
        const stone = mesh(p, cylinderGeometry, material(i % 3 ? '#dfcfac' : '#cfc29f'), [Math.cos(a) * 2.15 - .45, .74, Math.sin(a) * 1.63 + .35], [random(.17, .28), .025, random(.13, .2)]); stone.rotation.y = random(0, TAU);
      }
      for (let i = 0; i < 5; i++) box(p, -2.7, .74, 1.6 + i * .34, .62, .04, .22, '#d7c5a2');
      // A few white stepping stones make a little entrance at the island's edge.
      for (let i = 0; i < 3; i++) box(p, -.55, .63 - i * .16, 3.7 + i * .21, 1.03, .19, .35, '#cfc0a2');
    }
    bridge(p) {
      const bridge = new T.Group(); bridge.position.set(3.1, .8, 2.48); bridge.rotation.y = -.38; p.add(bridge);
      const curveY = x => .12 + Math.sin((x + .95) / 1.9 * Math.PI) * .31;
      for (let i = 0; i < 15; i++) {
        const x = -.95 + i / 14 * 1.9;
        const plank = box(bridge, x, curveY(x), 0, .14, .07, .68, '#af7954');
        plank.rotation.z = Math.cos(i / 14 * Math.PI) * .4;
      }
      for (const z of [-.34, .34]) {
        const pts = [];
        for (let i = 0; i <= 12; i++) { const x = -.98 + i / 12 * 1.96; pts.push(new T.Vector3(x, curveY(x) + .38, z)); }
        mesh(bridge, new T.TubeGeometry(new T.CatmullRomCurve3(pts), 18, .032, 5, false), material(palette.red));
        for (let i = 0; i <= 4; i++) { const x = -.95 + i / 4 * 1.9; box(bridge, x, curveY(x) + .19, z, .045, .45, .045, palette.red); }
      }
    }
  }

  class Island {
    constructor(scene) {
      this.group = new T.Group(); scene.add(this.group);
      this.glowMaterial = new T.MeshStandardMaterial({ color: '#bf925a', emissive: '#ffc06a', emissiveIntensity: 0, roughness: .6 });
      this.lanternMaterial = new T.MeshStandardMaterial({ color: '#f7dfb2', emissive: '#ffb04b', emissiveIntensity: 0 });
      this.buildTerrain();
      this.fuji = new MountFuji(this.group);
      this.tower = new TokyoTower(this.group);
      this.pagoda = new Pagoda(this.group, this.glowMaterial);
      this.torii = new Torii(this.group);
      this.garden = new Garden(this.group);
      this.trees = [];
      const trees = [
        [-4.65,-.8,1.0],[-4.5,1.05,.83],[-3.8,2.7,.78],[-3.65,-3.3,.8],[-1.6,-3.35,.9],
        [.1,-3.45,.9],[1.75,-3.05,.74],[4.55,-1.9,.95],[4.9,-.2,.9],[4.65,1.15,.76],
        [3.9,3.0,.65],[.95,3.52,.68],[-1.8,3.5,.7],[-4.8,-2.15,.65],[2.3,-3.35,.7],
        [-1.9,.55,.68],[1.5,-1.8,.68]
      ];
      trees.forEach(([x,z,s], i) => this.tree(x,z,s,i));
      this.lanterns();
      for (let i = 0; i < 55; i++) {
        const a = random(0, TAU), r = random(.78, .98), x = Math.cos(a) * 5.1 * r, z = Math.sin(a) * 3.7 * r;
        if (i % 3 === 0) {
          const stone = sphere(this.group, x, .78, z, random(.15,.3), random(.12,.24), random(.13,.27), '#afb191', true); stone.rotation.y = random(0, TAU);
        } else {
          const grass = cone(this.group, .055, random(.13, .24), [x, .81, z], i % 2 ? '#7e916c' : '#b5b18b', 4); grass.rotation.z = random(-.3,.3);
        }
      }
      // Fallen leaves remain static and share one instance buffer.
      const fallen = new T.InstancedMesh(geometry('fallen', () => new T.CircleGeometry(.055, 5)), material('#c66c3a', { side: T.DoubleSide }), 110);
      const dummy = new T.Object3D(), color = new T.Color();
      for (let i = 0; i < 110; i++) {
        const a = random(0,TAU), r = Math.sqrt(random(.1,1));
        dummy.position.set(Math.cos(a)*4.9*r,.758,Math.sin(a)*3.4*r); dummy.rotation.set(-Math.PI/2,0,random(0,TAU)); dummy.scale.setScalar(random(.65,1.5)); dummy.updateMatrix(); fallen.setMatrixAt(i,dummy.matrix); fallen.setColorAt(i,color.set(['#c76a3c','#d9a34f','#bc573e'][i%3]));
      }
      this.group.add(fallen);
      [this.tower.group, this.fuji.group, this.pagoda.group, this.torii.group,
        this.garden.group, ...this.trees.map(tree => tree.group), this.group].forEach(batchStatic);
    }
    buildTerrain() {
      const n = 15, outline = [];
      for (let i = 0; i < n; i++) { const a = i/n*TAU, r = random(.96,1.04); outline.push([Math.cos(a)*5.65*r,Math.sin(a)*4.05*r]); }
      const shape = new T.Shape(); outline.forEach(([x,z],i) => i ? shape.lineTo(x,-z) : shape.moveTo(x,-z)); shape.closePath();
      const top = new T.ExtrudeGeometry(shape,{depth:.37,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.17,bevelThickness:.13,curveSegments:1});
      const cap = mesh(this.group,top,[material('#a7ac83'),material('#b9b18a')],[0,.18,0]); cap.rotation.x=-Math.PI/2;
      const positions=[],colors=[];
      const rockColors=['#b6a28c','#9c8d81','#bca38c','#8e8d82','#a29483','#c6b094','#958a7c'];
      const rings=[outline.map(([x,z])=>[x,.19,z]),outline.map(([x,z])=>[x*.88+random(-.2,.2),random(-1.2,-.8),z*.88]),outline.map(([x,z])=>[x*.5+.28,random(-2.55,-1.85),z*.48]),outline.map(([x,z])=>[x*.12+.5,-3.0+random(-.25,.25),z*.12])];
      function triangle(a,b,c,col) { positions.push(...a,...c,...b); for(let j=0;j<3;j++) colors.push(col.r,col.g,col.b); }
      for(let ring=0;ring<3;ring++) for(let i=0;i<n;i++) {
        const j=(i+1)%n, col=new T.Color(rockColors[(i+ring*3)%rockColors.length]);
        triangle(rings[ring][i],rings[ring+1][i],rings[ring][j],col);
        triangle(rings[ring][j],rings[ring+1][i],rings[ring+1][j],col.clone().multiplyScalar(random(.9,1.06)));
      }
      for(let i=0;i<n;i++) triangle(rings[3][i],[.5,-3.4,0],rings[3][(i+1)%n],new T.Color('#9e9081'));
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
      mesh(this.group,geo,new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));
      // A few protruding crags and hanging roots break the otherwise neat outline.
      for(let i=0;i<7;i++) { const a=i/7*TAU; const rock=sphere(this.group,Math.cos(a)*4.2,-.95,Math.sin(a)*3.15,.5,.8,.5,rockColors[i],true);rock.rotation.set(random(0,1),random(0,TAU),random(-.4,.4)); }
      for(let i=0;i<5;i++) { const x=-3.6+i*1.7,z=3.22-Math.abs(x)*.07; beam(this.group,[x,.2,z],[x+.13,-.7,z-.08],.028,'#7e735d'); }
    }
    tree(x,z,s,index) {
      const tree=new T.Group();tree.position.set(x,.7,z);tree.scale.setScalar(s);tree.rotation.y=random(0,TAU);this.group.add(tree);
      const h=random(1.15,1.55);
      beam(tree,[0,0,0],[.03,h+.12,0],.07,palette.trunk);
      for(const side of [-1,1]) { beam(tree,[0,h*.5,0],[side*.43,h*.9,.12],.034,palette.trunk);beam(tree,[0,h*.72,0],[.05,h*1.05,side*.4],.025,palette.trunk); }
      const shades=[['#d86f36','#e89840','#d35930'],['#e4a343','#f0ba55','#d88c38'],['#bb5234','#d16b36','#a94c37'],['#d48347','#e8a05b','#cf683c']][index%4];
      const clusters=[[0,h+.1,0,.64,.6,.6],[-.43,h-.08,.06,.48,.45,.5],[.42,h-.03,.11,.45,.46,.46],[.02,h+.05,-.39,.5,.43,.46],[.05,h+.51,-.03,.4,.36,.4]];
      for(let i=0;i<clusters.length;i++) {const [cx,cy,cz,sx,sy,sz]=clusters[i];const crown=sphere(tree,cx,cy,cz,sx,sy,sz,shades[i%3]);crown.rotation.y=random(0,TAU);}
      this.trees.push({group:tree,phase:random(0,TAU)});
      sphere(this.group,x,.77,z,.38*s,.15*s,.35*s,'#8f9b72');
    }
    lanterns() {
      for(const [x,z] of [[-2.05,2.8],[-3.45,1.7],[1.8,1.1],[3.85,-.25],[.4,2.65]]) {
        box(this.group,x,.83,z,.26,.2,.26,'#b8b095');
        box(this.group,x,1.1,z,.09,.45,.09,palette.trunk);
        box(this.group,x,1.43,z,.24,.32,.24,null,this.lanternMaterial);
        for(const sx of [-1,1])for(const sz of [-1,1])box(this.group,x+sx*.12,1.43,z+sz*.12,.025,.34,.025,palette.dark);
        Landmark.roof(this.group,1.59,.43,.43,.16,palette.roof);
        // roof helper is local around origin, so move this roof to its lantern.
        const roof=this.group.children[this.group.children.length-2];roof.position.set(x,0,z);
        const ridge=this.group.children[this.group.children.length-1];ridge.position.x+=x;ridge.position.z+=z;
      }
      this.gardenLight=new T.PointLight('#ffc078',0,8,2);this.gardenLight.position.set(2,2,2);this.group.add(this.gardenLight);
    }
    update(time,night) {
      this.group.position.y=Math.sin(time*.72)*.13;
      this.group.rotation.z=Math.sin(time*.32)*.006;
      for(const tree of this.trees)tree.group.rotation.z=Math.sin(time*.85+tree.phase)*.025;
      this.tower.setNight(night,time);this.glowMaterial.emissiveIntensity=night*1.7;this.lanternMaterial.emissiveIntensity=night*2;
      this.gardenLight.intensity=night*5;
    }
  }

  class MapleLeafSystem {
    constructor(scene,count=280) {
      this.count=count;this.elapsed=0;
      const shape=new T.Shape();
      // A seven-lobed maple silhouette, including a little stem.
      const points=[[0,-.62],[.035,-.22],[.37,-.32],[.28,-.08],[.6,.05],[.39,.18],[.49,.4],[.23,.34],[.2,.64],[.075,.48],[0,.88],[-.09,.49],[-.24,.63],[-.23,.34],[-.5,.41],[-.39,.18],[-.6,.05],[-.28,-.08],[-.38,-.32],[-.035,-.22],[-.03,-.62]];
      points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
      this.geometry=new T.ShapeGeometry(shape);
      this.material=new T.MeshStandardMaterial({color:'#ffffff',side:T.DoubleSide,roughness:1,flatShading:true});
      this.mesh=new T.InstancedMesh(this.geometry,this.material,count);this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.mesh.frustumCulled=false;scene.add(this.mesh);
      // Fixed-size buffers are the object pool: updates and recycling allocate nothing.
      this.state=new Float32Array(count*9);this.dummy=new T.Object3D();
      const color=new T.Color(), shades=['#cb6338','#e6a044','#b8482f','#d5833d','#eabb60'];
      for(let i=0;i<count;i++){this.reset(i,true);this.mesh.setColorAt(i,color.set(shades[i%shades.length]));}
      this.update(0);
    }
    reset(i,initial=false){const k=i*9,s=this.state;s[k]=random(-9,9);s[k+1]=initial?random(-3.8,11.5):random(10,12.5);s[k+2]=random(-6,6);s[k+3]=random(.3,.66);s[k+4]=random(0,TAU);s[k+5]=random(0,TAU);s[k+6]=random(.085,.17);s[k+7]=random(-1,1);s[k+8]=random(.55,1.25);}
    update(dt){
      this.elapsed+=dt;const s=this.state,d=this.dummy,t=this.elapsed;
      for(let i=0;i<this.count;i++){
        const k=i*9;s[k+1]-=s[k+3]*dt;s[k]+=(.12+Math.sin(t*.6+s[k+4])*.1)*dt;
        if(s[k+1]<-4.2||s[k]>11)this.reset(i);
        // A slow horizontal drift and independent flutter avoid a uniform rain effect.
        d.position.set(s[k]+Math.sin(t*s[k+8]+s[k+4])*.5,s[k+1],s[k+2]+Math.cos(t*.55+s[k+4])*.27);
        d.rotation.set(t*s[k+7]+s[k+5],t*s[k+8]+s[k+4],Math.sin(t+s[k+4])*.65+s[k+5]);d.scale.setScalar(s[k+6]);d.updateMatrix();this.mesh.setMatrixAt(i,d.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate=true;
    }
  }

  class Atmosphere {
    constructor(scene) {
      this.clouds=[];this.cloudMaterial=new T.MeshStandardMaterial({color:'#fff8e8',transparent:true,opacity:.8,roughness:1,flatShading:false,depthWrite:false});
      const specs=[[-6.1,-1.5,-1.8,1],[5.9,-.4,-3.1,.9],[.8,-3.2,3.2,1.1],[-4.9,4.4,-6,.7],[5.8,4.4,-5.1,.65]];
      specs.forEach(([x,y,z,scale],j)=>{const group=new T.Group();group.position.set(x,y,z);group.scale.setScalar(scale);scene.add(group);
        [[0,0,0,1.15,.34,.55],[-.7,-.05,.12,.7,.27,.43],[.67,-.03,0,.75,.3,.5],[-.18,.19,-.04,.65,.44,.47]].forEach(([a,b,c,sx,sy,sz])=>{const cMesh=mesh(group,sphereGeometry,this.cloudMaterial,[a,b,c],[sx,sy,sz]);cMesh.castShadow=false;cMesh.receiveShadow=false;});
        this.clouds.push({group,x,y,phase:j*1.3});
      });
      const positions=new Float32Array(110*3);
      for(let i=0;i<110;i++){positions[i*3]=random(-25,25);positions[i*3+1]=random(3,19);positions[i*3+2]=random(-20,-12);}
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(positions,3));
      this.stars=new T.Points(geo,new T.PointsMaterial({color:'#fff2cb',size:.055,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true}));scene.add(this.stars);
      this.sun=mesh(scene,geometry('sun',()=>new T.SphereGeometry(.56,20,16)),new T.MeshBasicMaterial({color:'#e7b46b'}));this.sun.castShadow=false;
      this.moon=mesh(scene,geometry('moon',()=>new T.SphereGeometry(.42,20,16)),new T.MeshBasicMaterial({color:'#fff2ce'}));this.moon.castShadow=false;
      // Crater geometry gives the tiny moon a deliberately toy-like surface.
      for(const [x,y,r]of[[.14,.1,.09],[-.14,-.08,.055],[.03,-.2,.065]])sphere(this.moon,x,y,.38,r,r,.014,'#ded6bb');
      this.birds=[];
      const birdGeometry=new T.BufferGeometry().setFromPoints([new T.Vector3(-.15,.05,0),new T.Vector3(0,0,0),new T.Vector3(.15,.05,0)]);
      for(let i=0;i<5;i++){const bird=new T.Line(birdGeometry,new T.LineBasicMaterial({color:'#77766a',transparent:true,opacity:.65}));bird.position.set(-4+i*.55,5.3+i%2*.24,-5);scene.add(bird);this.birds.push(bird);}
    }
    update(time,phase,night){
      for(const cloud of this.clouds){cloud.group.position.x=cloud.x+Math.sin(time*.12+cloud.phase)*.4;cloud.group.position.y=cloud.y+Math.sin(time*.22+cloud.phase)*.12;}
      this.cloudMaterial.opacity=lerp(.82,.45,night);
      this.stars.material.opacity=night*.85*(.9+Math.sin(time*.7)*.1);
      const angle=phase*TAU;
      this.sun.position.set(Math.sin(angle)*5,Math.cos(angle)*5+1.2,-5);
      this.moon.position.set(-Math.sin(angle)*5,-Math.cos(angle)*5+1.2,-5);
      this.sun.visible=phase<.28||phase>.78;this.moon.visible=phase>.28&&phase<.78;
      for(let i=0;i<this.birds.length;i++){const bird=this.birds[i];bird.position.x=-4+i*.6+Math.sin(time*.1)*1.5;bird.position.y=5.2+i%2*.2+Math.sin(time*1.6+i)*.045;bird.material.opacity=(1-night)*.6;}
    }
  }

  class DayNightCycle {
    constructor(scene,renderer){
      this.phase=.1;this.speed=1;this.paused=false;this.scrubbing=false;this.night=0;this.lastUi=0;
      this.ambient=new T.HemisphereLight('#fff3d2','#847d6c',2.15);scene.add(this.ambient);
      this.sunlight=new T.DirectionalLight('#fff0cf',3.2);this.sunlight.position.set(-4,10,7);this.sunlight.castShadow=true;
      this.sunlight.shadow.mapSize.set(2048,2048);Object.assign(this.sunlight.shadow.camera,{left:-9,right:9,top:10,bottom:-8,near:1,far:35});this.sunlight.shadow.bias=-.0005;this.sunlight.shadow.normalBias=.035;this.sunlight.shadow.radius=3;scene.add(this.sunlight);
      this.fill=new T.DirectionalLight('#b6d7db',.85);this.fill.position.set(5,4,-6);scene.add(this.fill);
      this.fog=new T.Fog('#f3eee4',30,65);scene.fog=this.fog;
      this.keys=[
        [0,'#f1eee2','#fff0cf','#fff3d6',3.1,2.05],
        [.17,'#f1e8d7','#ffd3a0','#ffe9cb',2.9,1.95],
        [.29,'#e4b4a6','#ffae79','#ebc4b7',2.4,1.6],
        [.43,'#333c53','#99afd3','#a8b8d8',.95,1.0],
        [.63,'#333c53','#a8b7e5','#a8b8d8',1.0,1.0],
        [.76,'#dbc3bc','#f6c6ac','#f6d4cb',1.8,1.55],
        [.88,'#f1eee2','#fff0cf','#fff3d6',3.1,2.05],
        [1,'#f1eee2','#fff0cf','#fff3d6',3.1,2.05]
      ].map(([t,bg,sun,ambient,direct,hemi])=>({t,bg:new T.Color(bg),sun:new T.Color(sun),ambient:new T.Color(ambient),direct,hemi}));
      this.sky=new T.Color();this.inkDay=new T.Color('#333e38');this.inkNight=new T.Color('#f5e9d0');this.mutedDay=new T.Color('#818475');this.mutedNight=new T.Color('#b2b7c0');this.accentDay=new T.Color('#c45c3b');this.accentNight=new T.Color('#eab37f');this.uiColor=new T.Color();
      this.root=document.documentElement;this.renderer=renderer;
      this.clock=document.getElementById('clock');this.label=document.getElementById('phase-label');this.slider=document.getElementById('time-slider');
    }
    update(dt,time){
      // One complete, seamless cycle is exactly 15 simulation seconds at 1×.
      if(!this.paused&&!this.scrubbing)this.phase=(this.phase+dt*this.speed/15)%1;
      const p=this.phase;let a=this.keys[0],b=this.keys[1];
      for(let i=0;i<this.keys.length-1;i++)if(p>=this.keys[i].t&&p<=this.keys[i+1].t){a=this.keys[i];b=this.keys[i+1];break;}
      const t=smooth(a.t,b.t,p);
      this.sky.copy(a.bg).lerp(b.bg,t);this.sunlight.color.copy(a.sun).lerp(b.sun,t);this.ambient.color.copy(a.ambient).lerp(b.ambient,t);
      this.sunlight.intensity=lerp(a.direct,b.direct,t);this.ambient.intensity=lerp(a.hemi,b.hemi,t);this.fog.color.copy(this.sky);
      // Lamps ease on at sunset, then extinguish before dawn. No threshold flicker.
      this.night=smooth(.18,.34,p)*(1-smooth(.65,.735,p));
      this.fill.intensity=lerp(.85,1.45,this.night);
      this.sunlight.position.set(-5+Math.sin(p*TAU)*3,9,6+Math.cos(p*TAU)*2);
      // Updating CSS at 12 Hz avoids redundant layout/style work in the render loop.
      if(time-this.lastUi>.08||dt===0){
        this.lastUi=time;const dark=smooth(.27,.43,p)*(1-smooth(.65,.8,p));
        this.root.style.setProperty('--sky','#'+this.sky.getHexString());
        this.root.style.setProperty('--ink','#'+this.uiColor.copy(this.inkDay).lerp(this.inkNight,dark).getHexString());
        this.root.style.setProperty('--muted','#'+this.uiColor.copy(this.mutedDay).lerp(this.mutedNight,dark).getHexString());
        this.root.style.setProperty('--accent','#'+this.uiColor.copy(this.accentDay).lerp(this.accentNight,dark).getHexString());
        this.root.style.setProperty('--panel',dark>.5?'rgba(49,59,76,.84)':'rgba(255,253,245,.83)');
        const minutes=Math.floor(((12+p*24)%24)*60);this.clock.textContent=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
        this.label.textContent=p<.17?'AFTERNOON':p<.3?'GOLDEN HOUR':p<.68?'AFTER DARK':p<.83?'FIRST LIGHT':'DAYDREAM';
        if(!this.scrubbing)this.slider.value=p;
      }
      return this.night;
    }
  }

  class CameraController {
    constructor(camera,canvas){
      this.camera=camera;this.canvas=canvas;this.angle=.69;this.targetAngle=this.angle;this.elevation=.49;this.targetElevation=.49;this.dragging=false;this.touring=false;this.width=0;this.height=0;
      const stopTour=()=>{this.touring=false;document.getElementById('explore-button').innerHTML='Explore the island <span>↗</span>';};
      canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;stopTour();this.dragging=true;this.pointerId=e.pointerId;this.x=e.clientX;this.y=e.clientY;canvas.setPointerCapture(e.pointerId);});
      canvas.addEventListener('pointermove',e=>{if(!this.dragging||e.pointerId!==this.pointerId)return;this.targetAngle-=(e.clientX-this.x)*.007;this.targetElevation=clamp(this.targetElevation+(e.clientY-this.y)*.002,.28,.78);this.x=e.clientX;this.y=e.clientY;});
      const release=e=>{if(e.pointerId!==this.pointerId)return;this.dragging=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
      canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',()=>{this.dragging=false;});
      document.getElementById('explore-button').addEventListener('click',()=>{this.touring=!this.touring;document.getElementById('explore-button').innerHTML=this.touring?'Taking the scenic route <span>↻</span>':'Explore the island <span>↗</span>';});
    }
    resize(width,height){
      this.width=width;this.height=height;const aspect=width/height;
      let frustum=15.1;
      if(width<760&&height>580)frustum=Math.max(18.5,14.7/aspect);
      else if(width<600)frustum=17.5;
      else if(height<580)frustum=16.1;
      const c=this.camera;c.left=-frustum*aspect/2;c.right=frustum*aspect/2;c.top=frustum/2;c.bottom=-frustum/2;
      c.clearViewOffset();
      let shift=width>=1050?.13:width>=760?.15:width>=600?.16:height<580?.085:0;
      c.setViewOffset(width,height,-width*shift,height>580&&width<760?-height*.04:0,width,height);c.updateProjectionMatrix();
    }
    update(dt){
      if(this.touring&&!this.dragging)this.targetAngle+=dt*.17;
      const damping=1-Math.exp(-dt*8);this.angle=lerp(this.angle,this.targetAngle,damping);this.elevation=lerp(this.elevation,this.targetElevation,damping);
      const distance=23,targetY=1.6;
      this.camera.position.set(Math.sin(this.angle)*Math.cos(this.elevation)*distance,Math.sin(this.elevation)*distance+targetY,Math.cos(this.angle)*Math.cos(this.elevation)*distance);
      this.camera.lookAt(0,targetY,0);this.camera.updateMatrixWorld();
    }
  }

  class AmbientSound {
    constructor(){this.context=null;this.enabled=false;this.button=document.getElementById('sound-button');this.button.addEventListener('click',()=>this.toggle());}
    async toggle(){
      try{
        if(!this.context){
          const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
          this.context=new Context();const c=this.context;
          this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);
          // A quiet pentatonic drone and filtered wind, created without audio assets.
          this.tones=[146.83,220,293.66,329.63,440].map((frequency,i)=>{const osc=c.createOscillator(),gain=c.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.value=.012/(1+i*.35);osc.connect(gain);gain.connect(this.master);osc.start();return gain;});
          const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
          const noise=c.createBufferSource();noise.buffer=buffer;noise.loop=true;this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=430;const windGain=c.createGain();windGain.gain.value=.025;noise.connect(this.filter);this.filter.connect(windGain);windGain.connect(this.master);noise.start();
        }
        this.enabled=!this.enabled;
        if(this.enabled)await this.context.resume();
        this.master.gain.setTargetAtTime(this.enabled?1:0,this.context.currentTime,.4);this.button.classList.toggle('sound-on',this.enabled);this.button.setAttribute('aria-pressed',String(this.enabled));this.button.setAttribute('aria-label',this.enabled?'Mute ambient sound':'Enable ambient sound');
      }catch(error){this.enabled=false;this.button.setAttribute('aria-label','Ambient sound unavailable');console.warn('Ambient audio is unavailable.',error);}
    }
    update(night){if(!this.context||!this.enabled)return;this.filter.frequency.setTargetAtTime(lerp(520,220,night),this.context.currentTime,.5);this.tones.forEach((gain,i)=>gain.gain.setTargetAtTime((.012/(1+i*.35))*lerp(1,.6,night),this.context.currentTime,.5));}
  }

  class Application {
    constructor(){
      this.container=document.getElementById('world');this.scene=new T.Scene();
      this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.22;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.container.appendChild(this.renderer.domElement);
      this.renderer.domElement.setAttribute('aria-label','Floating Tokyo island. Drag horizontally to orbit.');this.renderer.domElement.setAttribute('role','img');
      this.camera=new T.OrthographicCamera(-10,10,8,-8,.1,100);
      this.controller=new CameraController(this.camera,this.renderer.domElement);
      this.cycle=new DayNightCycle(this.scene,this.renderer);this.island=new Island(this.scene);this.leaves=new MapleLeafSystem(this.scene,280);this.atmosphere=new Atmosphere(this.scene);this.sound=new AmbientSound();
      this.elapsed=0;this.previous=0;this.frame=0;this.running=true;this.raf=0;this.contextLost=false;
      this.projected=new T.Vector3();this.markers=[];this.createMarkers();this.bindUI();this.resize();
      window.addEventListener('resize',()=>this.resize());
      document.addEventListener('visibilitychange',()=>{this.previous=0;if(document.hidden){cancelAnimationFrame(this.raf);this.raf=0;if(this.sound.context)this.sound.context.suspend();}else if(!this.contextLost){if(this.sound.enabled)this.sound.context.resume();this.raf=requestAnimationFrame(t=>this.animate(t));}});
      this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;cancelAnimationFrame(this.raf);});
      this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.previous=0;if(!document.hidden)this.raf=requestAnimationFrame(t=>this.animate(t));});
      this.raf=requestAnimationFrame(t=>this.animate(t));
      document.getElementById('loading').classList.add('ready');
      // Expose read-only diagnostics for optional ?debug and manual verification.
      if(new URLSearchParams(location.search).has('debug')){this.debug=document.createElement('div');this.debug.style.cssText='position:fixed;left:15px;bottom:110px;font:9px monospace;opacity:.65;pointer-events:none;color:var(--ink)';document.body.appendChild(this.debug);this.fpsTime=0;this.fpsFrames=0;}
    }
    createMarkers(){
      const data=[
        {name:'Tokyo Tower',number:'01 / THE HEART OF TOKYO',description:'A vermilion landmark reaching for the sky. Watch its windows glow as the little city slips into night.',position:[.6,4.4,-.35]},
        {name:'Mount Fuji',number:'02 / A QUIET GIANT',description:'Snow above, autumn below. Japan’s beloved mountain finds a peaceful home among the maple trees.',position:[-3.15,3.6,-2.25]},
        {name:'The autumn shrine',number:'03 / A MOMENT OF STILLNESS',description:'Past the red torii, a pagoda, a koi pond, and a tiny garden. Take the long way around.',position:[3.1,3.8,-1.4]}
      ];
      const container=document.getElementById('landmark-markers');
      data.forEach(d=>{const button=document.createElement('button');button.className='landmark-marker';button.textContent='+';button.setAttribute('aria-label','Discover '+d.name);button.dataset.label=d.name;button.addEventListener('click',()=>{
        this.markers.forEach(m=>m.button.classList.remove('active'));button.classList.add('active');document.getElementById('landmark-number').textContent=d.number;document.getElementById('landmark-name').textContent=d.name;document.getElementById('landmark-description').textContent=d.description;document.getElementById('landmark-card').hidden=false;
      });container.appendChild(button);this.markers.push({...d,button,point:new T.Vector3(...d.position)});});
    }
    updateMarkers(){
      this.island.group.updateMatrixWorld();
      for(const marker of this.markers){
        this.projected.copy(marker.point).applyMatrix4(this.island.group.matrixWorld).project(this.camera);const x=(this.projected.x*.5+.5)*this.width,y=(-this.projected.y*.5+.5)*this.height;
        const compact=this.width<600&&this.height<360;
        const visible=x>16&&x<this.width-16&&y>(compact?43:70)&&y<this.height-(compact?54:110);
        marker.button.style.left=x+'px';marker.button.style.top=y+'px';marker.button.hidden=!visible;
      }
    }
    bindUI(){
      const play=document.getElementById('play-button');
      this.togglePause=()=>{this.cycle.paused=!this.cycle.paused;play.setAttribute('aria-label',this.cycle.paused?'Play day and night cycle':'Pause day and night cycle');document.getElementById('play-icon').setAttribute('d',this.cycle.paused?'M6 4l9 6-9 6Z':'M6 5v10M13 5v10');};
      play.addEventListener('click',this.togglePause);
      const speed=document.getElementById('speed-button');this.changeSpeed=()=>{this.cycle.speed=this.cycle.speed===4?1:this.cycle.speed*2;speed.textContent=this.cycle.speed+'×';};speed.addEventListener('click',this.changeSpeed);
      const slider=document.getElementById('time-slider');
      slider.addEventListener('pointerdown',()=>{this.cycle.scrubbing=true;});
      window.addEventListener('pointerup',()=>{this.cycle.scrubbing=false;});
      window.addEventListener('pointercancel',()=>{this.cycle.scrubbing=false;});
      slider.addEventListener('input',()=>{this.cycle.phase=Number(slider.value)%1;this.cycle.update(0,this.elapsed);});
      const dialog=document.getElementById('about-dialog'),about=document.getElementById('about-button'),close=document.getElementById('close-about');
      const hideAbout=()=>{dialog.hidden=true;about.focus();};
      about.addEventListener('click',()=>{dialog.hidden=false;close.focus();});close.addEventListener('click',hideAbout);dialog.addEventListener('click',e=>{if(e.target===dialog)hideAbout();});
      document.getElementById('close-landmark').addEventListener('click',()=>{document.getElementById('landmark-card').hidden=true;this.markers.forEach(m=>m.button.classList.remove('active'));});
      window.addEventListener('keydown',e=>{
        if(e.key==='Escape'){if(!dialog.hidden)hideAbout();document.getElementById('landmark-card').hidden=true;return;}
        if(!dialog.hidden){if(e.key==='Tab'){const items=[...dialog.querySelectorAll('button')],first=items[0],last=items[items.length-1];if((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:first).focus();}}return;}
        if(/INPUT|BUTTON|A/.test(document.activeElement.tagName))return;
        if(e.code==='Space'){e.preventDefault();this.togglePause();}
        if(e.key.toLowerCase()==='f')this.changeSpeed();
        if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();this.controller.targetAngle+=(e.key==='ArrowLeft'?-1:1)*.2;}
      });
    }
    resize(){this.width=window.innerWidth;this.height=window.innerHeight;this.renderer.setSize(this.width,this.height);this.controller.resize(this.width,this.height);this.controller.update(1);this.updateMarkers();}
    animate(timestamp){
      // Clamp only physics after a stalled/background frame. The regular rAF loop is
      // time-based at every refresh rate; visibility resumes with a fresh timestamp.
      const realDelta=this.previous?(timestamp-this.previous)/1000:0;
      const dt=Math.min(realDelta,.05);this.previous=timestamp;this.elapsed+=realDelta;
      const night=this.cycle.update(realDelta,this.elapsed);this.island.update(this.elapsed,night);this.leaves.update(dt);this.atmosphere.update(this.elapsed,this.cycle.phase,night);this.controller.update(dt);
      if(this.frame%2===0)this.updateMarkers();if(this.frame%15===0)this.sound.update(night);
      this.renderer.render(this.scene,this.camera);this.frame++;
      if(this.debug){this.fpsTime+=dt;this.fpsFrames++;if(this.fpsTime>=.5){this.debug.textContent=`${Math.round(this.fpsFrames/this.fpsTime)} FPS · ${this.leaves.count} leaves · ${this.renderer.info.render.calls} draws`;this.fpsTime=0;this.fpsFrames=0;}}
      this.raf=requestAnimationFrame(t=>this.animate(t));
    }
  }

  try{new Application();}catch(error){
    console.error('Could not initialize Kōyō:',error);const loading=document.getElementById('loading');loading.classList.remove('ready');loading.innerHTML='<span class="loading-symbol">紅</span><span>This little world needs WebGL.<br>Please enable hardware acceleration and reload.</span>';
  }
})();
