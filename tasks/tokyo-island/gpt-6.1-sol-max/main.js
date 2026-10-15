/* Momiji — a small, procedural world. Three.js r158; no asset downloads. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const showError = (message) => {
    $('loading').hidden = true;
    $('error-message').hidden = false;
    $('error-detail').textContent = message;
  };
  $('retry-button').addEventListener('click', () => location.reload());
  const dialog = $('about-dialog');
  $('help-button').addEventListener('click', () => dialog.showModal());
  $('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  if (!window.THREE) {
    showError('Please connect to the internet to load Three.js, then refresh this page.');
    return;
  }

  const T = THREE;
  const TAU = Math.PI * 2;
  const clamp = T.MathUtils.clamp;
  const smooth = T.MathUtils.smoothstep;
  const mix = T.MathUtils.lerp;
  const UP = new T.Vector3(0, 1, 0);
  const resources = new Set();
  const track = (resource) => { resources.add(resource); return resource; };
  const random = (() => {
    let seed = 45187;
    return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  })();
  const between = (min, max) => mix(min, max, random());
  const choose = (values) => values[Math.floor(random() * values.length)];
  const v3 = (x, y, z) => new T.Vector3(x, y, z);

  class Palette {
    constructor() {
      this.gradient = track(new T.DataTexture(new Uint8Array([95, 165, 215, 255]), 4, 1, T.RedFormat));
      this.gradient.minFilter = this.gradient.magFilter = T.NearestFilter;
      this.gradient.needsUpdate = true;
      this.cache = new Map();
      const colors = {
        red: '#c44f37', redLight: '#dc6847', redDark: '#943e31', cream: '#f0d5a8', white: '#fff0d4',
        wood: '#725144', darkWood: '#493d37', roof: '#536c66', roofLight: '#6d8274',
        grass: '#a9b780', moss: '#8f9f6e', dirt: '#b78b64', path: '#dfcba4', pathLight: '#ead8b6',
        stone: '#b9b5a0', stoneDark: '#8b9483', gold: '#d9ac5b', teal: '#729b8e',
        mapleRed: '#c75b3b', mapleOrange: '#dd8650', mapleGold: '#e0a553', mapleDeep: '#ad4737',
        mapleLight: '#e8a061', green: '#7d9466', pink: '#e5b494', dark: '#3e4841'
      };
      for (const [name, color] of Object.entries(colors)) {
        this[name] = this.toon(color);
      }
      this.terrain = track(new T.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: this.gradient }));
      this.water = track(new T.MeshStandardMaterial({ color: '#77b6ae', roughness: .25, metalness: .12, transparent: true, opacity: .9, flatShading: true }));
      this.lamp = track(new T.MeshStandardMaterial({ color: '#f6d39b', emissive: '#ffbd58', emissiveIntensity: .1, roughness: .8 }));
      this.window = track(new T.MeshStandardMaterial({ color: '#9a997d', emissive: '#ffd587', emissiveIntensity: 0, roughness: .4 }));
      this.paperLamp = track(new T.MeshStandardMaterial({ color: '#d75a3c', emissive: '#f18a3d', emissiveIntensity: 0, roughness: .9 }));
    }
    toon(color) {
      if (this.cache.has(color)) return this.cache.get(color);
      const material = track(new T.MeshToonMaterial({ color, gradientMap: this.gradient }));
      this.cache.set(color, material);
      return material;
    }
  }

  const G = {
    box: track(new T.BoxGeometry(1, 1, 1)),
    sphere: track(new T.IcosahedronGeometry(1, 1)),
    rock: track(new T.IcosahedronGeometry(1, 0)),
    cylinder: track(new T.CylinderGeometry(1, 1, 1, 8)),
    cone: track(new T.ConeGeometry(1, 1, 8)),
    plane: track(new T.PlaneGeometry(1, 1))
  };
  const mesh = (parent, geometry, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const box = (parent, material, x, y, z, w, h, d) => mesh(parent, G.box, material, x, y, z, w, h, d);
  const sphere = (parent, material, x, y, z, sx, sy = sx, sz = sx, low = false) => mesh(parent, low ? G.rock : G.sphere, material, x, y, z, sx, sy, sz);
  const cylinder = (parent, material, x, y, z, radius, height) => mesh(parent, G.cylinder, material, x, y, z, radius, height, radius);
  const beam = (parent, material, a, b, radius = .035) => {
    const start = v3(...a), end = v3(...b);
    const object = mesh(parent, G.cylinder, material);
    object.position.copy(start).add(end).multiplyScalar(.5);
    object.scale.set(radius, start.distanceTo(end), radius);
    object.quaternion.setFromUnitVectors(UP, end.sub(start).normalize());
    return object;
  };

  // Bake static architecture into one geometry per material / shadow mode.
  // This preserves detailed silhouettes without a draw call for each tiny beam.
  class StaticBatch {
    static bake(root) {
      root.updateMatrixWorld(true);
      const inverse = root.matrixWorld.clone().invert();
      const batches = new Map(), originals = [];
      const visit = (object, dynamic = false) => {
        dynamic ||= !!object.userData.dynamic;
        if (object.isMesh && !object.isInstancedMesh && !dynamic && !Array.isArray(object.material)) {
          const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
          if (!batches.has(key)) batches.set(key, { material: object.material, cast: object.castShadow, receive: object.receiveShadow, pieces: [], count: 0 });
          const batch = batches.get(key);
          const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
          geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
          batch.pieces.push(geometry);
          batch.count += geometry.getAttribute('position').count;
          originals.push(object);
        }
        for (const child of object.children) visit(child, dynamic);
      };
      visit(root);
      for (const batch of batches.values()) {
        const positions = new Float32Array(batch.count * 3);
        const normals = new Float32Array(batch.count * 3);
        const uvs = new Float32Array(batch.count * 2);
        const colors = batch.material.vertexColors ? new Float32Array(batch.count * 3) : null;
        let offset = 0;
        for (const part of batch.pieces) {
          const count = part.getAttribute('position').count;
          positions.set(part.getAttribute('position').array, offset * 3);
          if (part.getAttribute('normal')) normals.set(part.getAttribute('normal').array, offset * 3);
          if (part.getAttribute('uv')) uvs.set(part.getAttribute('uv').array, offset * 2);
          if (colors && part.getAttribute('color')) colors.set(part.getAttribute('color').array, offset * 3);
          offset += count;
          part.dispose();
        }
        const geometry = track(new T.BufferGeometry());
        geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new T.BufferAttribute(uvs, 2));
        if (colors) geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();
        const combined = new T.Mesh(geometry, batch.material);
        combined.castShadow = batch.cast;
        combined.receiveShadow = batch.receive;
        root.add(combined);
      }
      for (const original of originals) original.removeFromParent();
    }
  }

  function makeRibbon(parent, points, width, material) {
    const curve = new T.CatmullRomCurve3(points.map((point) => v3(...point)));
    const positions = [], normals = [], indices = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const point = curve.getPoint(i / segments), tangent = curve.getTangent(i / segments);
      const normal = v3(tangent.z, 0, -tangent.x).normalize().multiplyScalar(width / 2);
      positions.push(point.x + normal.x, point.y, point.z + normal.z, point.x - normal.x, point.y, point.z - normal.z);
      normals.push(0, 1, 0, 0, 1, 0);
      if (i < segments) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = track(new T.BufferGeometry());
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    return mesh(parent, geometry, material);
  }

  function roof(parent, palette, x, y, z, w, d, height) {
    const positions = [], colors = [];
    const roofColors = [new T.Color('#526b65'), new T.Color('#617b70'), new T.Color('#728576'), new T.Color('#5c7469')];
    const rings = [
      [[-w / 2, .07, -d / 2], [w / 2, .07, -d / 2], [w / 2, .07, d / 2], [-w / 2, .07, d / 2]],
      [[-w * .34, .14, -d * .34], [w * .34, .14, -d * .34], [w * .34, .14, d * .34], [-w * .34, .14, d * .34]],
      [[-w * .16, height, -.035], [w * .16, height, -.035], [w * .16, height, .035], [-w * .16, height, .035]]
    ];
    const push = (point, color) => { positions.push(point[0] + x, point[1] + y, point[2] + z); colors.push(color.r, color.g, color.b); };
    for (let layer = 0; layer < 2; layer++) {
      for (let side = 0; side < 4; side++) {
        const next = (side + 1) % 4, color = roofColors[side];
        for (const point of [rings[layer][side], rings[layer + 1][side], rings[layer][next], rings[layer][next], rings[layer + 1][side], rings[layer + 1][next]]) push(point, color);
      }
    }
    const geometry = track(new T.BufferGeometry());
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    mesh(parent, geometry, palette.terrain);
    for (let side = 0; side < 4; side++) {
      const a = rings[0][side], b = rings[0][(side + 1) % 4];
      beam(parent, palette.roof, [a[0] + x, a[1] + y, a[2] + z], [b[0] + x, b[1] + y, b[2] + z], .045);
    }
    beam(parent, palette.roofLight, [x - w * .19, y + height + .025, z], [x + w * .19, y + height + .025, z], .055);
    // Narrow tile seams make the large, simple roof planes feel hand-built.
    for (let i = 0; i < 11; i++) {
      const xx = mix(-w * .43, w * .43, i / 10);
      beam(parent, palette.roofLight, [x + xx, y + .09, z + d * .48], [x + xx * .38, y + height - .015, z + .02], .011);
    }
  }

  function mapleTree(parent, palette, x, z, size = 1, colorIndex = 0) {
    const tree = new T.Group(); tree.position.set(x, .66, z); tree.scale.setScalar(size); parent.add(tree);
    const leaves = [palette.mapleOrange, palette.mapleRed, palette.mapleGold, palette.mapleDeep, palette.mapleLight];
    const mainColor = leaves[colorIndex % leaves.length];
    cylinder(tree, palette.wood, 0, .48, 0, .065, .96);
    beam(tree, palette.wood, [0, .48, 0], [-.32, 1.12, .04], .035);
    beam(tree, palette.wood, [0, .65, 0], [.34, 1.24, -.12], .032);
    const clusters = [[0,1.3,0,.62,.5,.56],[-.4,1.17,.04,.48,.36,.43],[.4,1.24,-.05,.47,.39,.46],[.05,1.58,-.1,.42,.35,.39],[-.15,1.24,.36,.43,.36,.38],[.17,1.25,-.35,.4,.36,.4]];
    clusters.forEach((c, i) => {
      const material = i === 3 ? leaves[(colorIndex + 4) % leaves.length] : mainColor;
      const crown = sphere(tree, material, ...c, true); crown.rotation.set(between(0, .5), between(0, TAU), between(-.2, .2));
    });
    for (let i = 0; i < 3; i++) sphere(tree, palette.moss, between(-.2,.2), .02, between(-.2,.2), .15, .035, .11, true);
  }

  function stoneLantern(parent, p, x, z, size = 1) {
    const group = new T.Group(); group.position.set(x, .7, z); group.scale.setScalar(size); parent.add(group);
    box(group, p.stoneDark, 0, .045, 0, .32, .09, .32);
    cylinder(group, p.stone, 0, .27, 0, .075, .45);
    box(group, p.stone, 0, .48, 0, .24, .08, .24);
    box(group, p.lamp, 0, .62, 0, .18, .22, .18);
    for (const xx of [-.1,.1]) for (const zz of [-.1,.1]) box(group, p.stoneDark, xx, .62, zz, .035, .26, .035);
    mesh(group, G.cone, p.stoneDark, 0, .83, 0, .26, .2, .26).rotation.y = Math.PI / 4;
    sphere(group, p.stone, 0, .97, 0, .055, .07, .055, true);
  }

  class TokyoTower {
    constructor(palette) {
      this.group = new T.Group();
      const g = this.group, p = palette;
      const levels = [0, 1.25, 2.45, 2.95, 3.85, 4.65, 5.18, 5.65];
      const widths = [1.16, .84, .6, .53, .37, .24, .17, .105];
      for (const sx of [-1,1]) for (const sz of [-1,1]) {
        box(g, p.cream, sx * widths[0], .06, sz * widths[0], .38, .12, .38);
        for (let i = 0; i < levels.length - 1; i++) {
          const material = (i === 3 || i === 5) ? p.white : p.red;
          beam(g, material, [sx * widths[i], levels[i] + .12, sz * widths[i]], [sx * widths[i+1], levels[i+1], sz * widths[i+1]], i < 2 ? .063 : .035);
        }
      }
      for (let i = 1; i < levels.length - 1; i++) {
        const mat = i === 3 || i === 5 ? p.white : p.red;
        const lo = levels[i], hi = levels[i+1], a = widths[i], b = widths[i+1];
        for (const side of [-1,1]) {
          beam(g, mat, [-a,lo,side*a], [a,lo,side*a], .032);
          beam(g, mat, [side*a,lo,-a], [side*a,lo,a], .032);
          beam(g, mat, [-a,lo,side*a], [b,hi,side*b], .022);
          beam(g, mat, [a,lo,side*a], [-b,hi,side*b], .022);
          beam(g, mat, [side*a,lo,-a], [side*b,hi,b], .022);
          beam(g, mat, [side*a,lo,a], [side*b,hi,-b], .022);
          const middle = mix(a,b,.5), yy = mix(lo,hi,.5);
          beam(g, mat, [-middle,yy,side*middle], [middle,yy,side*middle], .017);
          beam(g, mat, [side*middle,yy,-middle], [side*middle,yy,middle], .017);
        }
      }
      // Four structural arches keep the tower's distinctive open lower silhouette.
      for (let side = 0; side < 4; side++) {
        const group = new T.Group(); group.rotation.y = side * Math.PI / 2; g.add(group);
        const curve = new T.QuadraticBezierCurve3(v3(-1.1,.16,1.08),v3(0,2.28,.9),v3(1.1,.16,1.08));
        mesh(group, track(new T.TubeGeometry(curve, 16, .048, 5, false)), p.red);
        beam(group,p.red,[-.84,1.25,.84],[.84,1.25,.84],.04);
      }
      this.observatory(g,p,2.48,1.58,.38);
      this.observatory(g,p,4.88,.7,.26);
      cylinder(g,p.red,0,5.71,0,.065,.42);
      for (let i = 0; i < 7; i++) cylinder(g, i%2 ? p.white : p.red, 0, 5.95 + i*.16, 0, .055-i*.004, .16);
      cylinder(g,p.redDark,0,7.11,0,.018,.33);
      sphere(g,p.lamp,0,7.29,0,.04);
      // Stair treads, small railings, and the warm entrance at the feet of the tower.
      box(g,p.cream,0,.06,0,1.1,.12,.95);
      box(g,p.darkWood,0,.24,.41,.66,.31,.06);
      box(g,p.window,0,.24,.45,.47,.22,.035);
      for(let i=0;i<3;i++) box(g,p.pathLight,0,.05-i*.02, .7+i*.16, .8+i*.16,.08,.22);
      this.group.position.set(0,.72,-.08);
    }
    observatory(g,p,y,width,height) {
      box(g,p.red,0,y,0,width+.12,.09,width+.12);
      box(g,p.window,0,y+height*.46,0,width,height*.7,width);
      box(g,p.white,0,y+height*.88,0,width+.09,.1,width+.09);
      box(g,p.roof,0,y+height+ .025,0,width+.15,.07,width+.15);
      const count = width > 1 ? 10 : 5;
      for (let i=0;i<=count;i++) {
        const offset=mix(-width/2,width/2,i/count);
        for(const side of [-1,1]) {
          box(g,p.red,offset,y+height*.45,side*(width/2+.008),.025,height*.72,.025);
          box(g,p.red,side*(width/2+.008),y+height*.45,offset,.025,height*.72,.025);
        }
      }
      if(width>1) {
        for(const side of [-1,1]) {
          beam(g,p.red,[-width/2,y+height+.16,side*width/2],[width/2,y+height+.16,side*width/2],.014);
          beam(g,p.red,[side*width/2,y+height+.16,-width/2],[side*width/2,y+height+.16,width/2],.014);
          for(let i=0;i<7;i++) {
            const o=mix(-width/2,width/2,i/6);
            beam(g,p.red,[o,y+height,side*width/2],[o,y+height+.16,side*width/2],.012);
            beam(g,p.red,[side*width/2,y+height,o],[side*width/2,y+height+.16,o],.012);
          }
        }
      }
    }
  }

  class Landmark {
    constructor(kind, palette) {
      this.group = new T.Group();
      if(kind === 'fuji') this.createFuji(palette);
      else if(kind === 'shrine') this.createShrine(palette);
      else this.createTorii(palette);
    }
    createFuji(p) {
      const g = this.group;
      const segments=18, positions=[], colors=[];
      const sideColors=['#8b9d9c','#98a8a3','#aeb7ab','#7e9699','#b6bdae'].map(c=>new T.Color(c));
      const rings = [];
      for(let layer=0;layer<4;layer++) {
        const ring=[];
        for(let i=0;i<segments;i++) {
          const angle=i/segments*TAU;
          const radius=[1.75,1.27,.59,.045][layer]*(1+Math.sin(i*3.5)*.055);
          const yy=[0,.62,1.58,2.42][layer]+(layer===2?Math.sin(i*2.4)*.105:0);
          ring.push([Math.cos(angle)*radius,yy,Math.sin(angle)*radius*.87]);
        }
        rings.push(ring);
      }
      const push=(point,c)=>{positions.push(...point); colors.push(c.r,c.g,c.b);};
      for(let layer=0;layer<3;layer++) for(let i=0;i<segments;i++) {
        const j=(i+1)%segments;
        const color=layer===2 ? new T.Color(i%3===0?'#e3e6d5':'#fff1d7') : sideColors[i%sideColors.length];
        for(const point of [rings[layer][i],rings[layer+1][i],rings[layer][j],rings[layer][j],rings[layer+1][i],rings[layer+1][j]]) push(point,color);
      }
      const geometry=track(new T.BufferGeometry());
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      geometry.computeVertexNormals();
      mesh(g,geometry,p.terrain);
      for(let i=0;i<9;i++) {
        const angle=i/9*TAU;
        sphere(g,i%2?p.moss:p.stoneDark,Math.cos(angle)*1.5,.07,Math.sin(angle)*1.28,.36,.17,.29,true);
      }
      g.position.set(-3.2,.7,-2.13);
    }
    createShrine(p) {
      const g=this.group;
      box(g,p.stoneDark,0,.08,0,2.17,.16,1.9);
      box(g,p.cream,0,.2,0,1.92,.16,1.7);
      box(g,p.red,0,.37,0,1.78,.14,1.55);
      box(g,p.cream,0,.86,0,1.59,.88,1.36);
      box(g,p.darkWood,0,.86,.696,.72,.83,.04);
      box(g,p.window,0,.94,.722,.53,.64,.025);
      for(const sx of [-1,1]) for(const sz of [-1,1]) {
        cylinder(g,p.red,sx*.82,.87,sz*.72,.065,1.01);
        box(g,p.gold,sx*.82,.44,sz*.72,.14,.09,.14);
      }
      for(let i=0;i<6;i++) {
        box(g,p.red,-.65+i*.26,.87,.73,.035,.77,.04);
        box(g,p.red,.807,.87,-.55+i*.23,.045,.7,.035);
      }
      box(g,p.red,0,.72,.747,1.7,.035,.04);
      box(g,p.red,0,1.27,0,1.9,.13,1.65);
      roof(g,p,0,1.35,0,2.55,2.18,.51);
      box(g,p.cream,0,1.97,0,1.12,.62,.99);
      for(const sx of [-1,1]) for(const sz of [-1,1]) cylinder(g,p.red,sx*.58,1.99,sz*.51,.045,.73);
      for(let i=0;i<5;i++) box(g,p.red,-.48+i*.24,1.96,.514,.026,.53,.03);
      box(g,p.window,0,1.99,.52,.62,.4,.027);
      box(g,p.red,0,2.3,0,1.27,.09,1.13);
      roof(g,p,0,2.33,0,1.95,1.68,.45);
      cylinder(g,p.darkWood,0,2.98,0,.032,.46);
      for(let i=0;i<4;i++) cylinder(g,p.gold,0,2.83+i*.085,0,.1-i*.016,.025);
      sphere(g,p.gold,0,3.23,0,.065,.09,.065);
      for(let i=0;i<4;i++) box(g,p.stone,0,.2-i*.04,1.01+i*.13,1.05,.1,.22);
      // Warm paper lanterns beneath the lower eaves.
      for(const xx of [-.62,.62]) {
        sphere(g,p.lamp,xx,1.1,.89,.1,.15,.1);
        cylinder(g,p.darkWood,xx,1.25,.89,.07,.035);
      }
      g.rotation.y=-.12;
      g.position.set(3.2,.71,-1.45);
    }
    createTorii(p) {
      const g=this.group;
      for(const xx of [-.65,.65]) {
        cylinder(g,p.red,xx,.92,0,.09,1.84);
        cylinder(g,p.darkWood,xx,.15,0,.102,.3);
        cylinder(g,p.stone,xx,.04,0,.16,.08);
      }
      box(g,p.red,0,1.46,0,1.8,.12,.16);
      box(g,p.red,0,1.92,0,1.94,.16,.2);
      for(const side of [-1,1]) {
        const tip=box(g,p.red,side*.95,1.96,0,.38,.15,.2); tip.rotation.z=side*.15;
        const cap=box(g,p.darkWood,side*.95,2.065,0,.4,.065,.25); cap.rotation.z=side*.15;
      }
      box(g,p.darkWood,0,2.02,0,1.8,.065,.25);
      box(g,p.red,0,1.73,0,.09,.4,.1);
      box(g,p.gold,0,1.71,.13,.23,.33,.045);
      box(g,p.darkWood,0,1.71,.16,.14,.23,.01);
      beam(g,p.cream,[-.66,1.36,.14],[0,1.22,.14],.018);
      beam(g,p.cream,[0,1.22,.14],[.66,1.36,.14],.018);
      for(const xx of [-.34,0,.34]) {
        const paper=box(g,p.white,xx,1.15,.14,.055,.18,.012); paper.rotation.z=xx*1.1;
      }
      g.position.set(2.62,.73,1.92);
      g.rotation.y=-.12;
    }
  }

  class Island {
    constructor(palette) {
      this.group=new T.Group();
      this.palette=palette;
      this.ripples=[]; this.koi=[]; this.floatingRocks=[];
      this.buildTerrain();
      this.buildGarden();
      this.tower=new TokyoTower(palette);
      this.fuji=new Landmark('fuji',palette);
      this.shrine=new Landmark('shrine',palette);
      this.torii=new Landmark('torii',palette);
      this.group.add(this.tower.group,this.fuji.group,this.shrine.group,this.torii.group);
      this.buildVillage();
      this.buildDetails();
      StaticBatch.bake(this.group);
      this.lights=[];
      [[0,3.5,.3,6.5,1.8],[3.2,2,-1.1,5,1.5],[1.7,1.3,2,4,1]].forEach(([x,y,z,distance,power])=>{
        const light=new T.PointLight('#ffc279',0,distance,2);
        light.position.set(x,y,z); light.userData.power=power;
        this.group.add(light); this.lights.push(light);
      });
    }
    buildTerrain() {
      const positions=[], colors=[], rings=[], count=28;
      const rockColors=['#bc916b','#c9a078','#b88865','#d1aa7d','#a77f61','#d3ac82'].map(c=>new T.Color(c));
      const radii=Array.from({length:count},()=>between(.93,1.06));
      const layers=[{y:.64,r:1},{y:.36,r:1.01},{y:-.36,r:.95},{y:-1.25,r:.75},{y:-2.38,r:.36},{y:-2.95,r:.09}];
      for(let layer=0;layer<layers.length;layer++) {
        const ring=[];
        for(let i=0;i<count;i++) {
          const a=i/count*TAU+(layer>2?.045*(layer-2):0), info=layers[layer];
          ring.push([Math.cos(a)*5.65*radii[i]*info.r,info.y+(layer>1?between(-.15,.15):0),Math.sin(a)*4.15*radii[i]*info.r]);
        }
        rings.push(ring);
      }
      const push=(point,color)=>{positions.push(...point);colors.push(color.r,color.g,color.b);};
      for(let i=0;i<count;i++) {
        const c=new T.Color(choose(['#b8c38f','#b2bf87','#aebb85','#b6c18b']));
        for(const point of [[0,.64,0],rings[0][(i+1)%count],rings[0][i]])push(point,c);
      }
      for(let layer=0;layer<layers.length-1;layer++) for(let i=0;i<count;i++) {
        const j=(i+1)%count;
        const c=layer===0?new T.Color(i%3===0?'#8d9f6d':'#9bab78'):rockColors[(i+layer*3)%rockColors.length];
        for(const point of [rings[layer][i],rings[layer][j],rings[layer+1][i],rings[layer][j],rings[layer+1][j],rings[layer+1][i]]) push(point,c);
      }
      const geometry=track(new T.BufferGeometry());
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3)); geometry.computeVertexNormals();
      mesh(this.group,geometry,this.palette.terrain);
      for(let i=0;i<16;i++) {
        const a=i/16*TAU, r=between(.78,.95);
        const rock=sphere(this.group,this.palette.toon(choose(['#b88b64','#c69d72','#a47d60'])),Math.cos(a)*4.6*r,-.94,Math.sin(a)*3.7*r,between(.4,.85),between(.35,.8),between(.35,.7),true);
        rock.rotation.set(random(),random(),random());
      }
      for(let i=0;i<3;i++) {
        const group=new T.Group(); group.userData.dynamic=true;
        group.position.set([4.3,-3.9,2.4][i],[-2.1,-2.5,-3.5][i],[1.4,1.5,-1.5][i]);
        const scale=[.36,.24,.19][i]; sphere(group,this.palette.dirt,0,0,0,scale,scale*1.4,scale,true);
        group.userData.baseY=group.position.y; this.group.add(group); this.floatingRocks.push(group);
      }
      // A handful of vines break the clean cut of the grassy rim.
      for(let i=0;i<7;i++) {
        const angle=[.35,.8,1.25,1.85,2.6,3.4,5.9][i];
        const x=Math.cos(angle)*5.35,z=Math.sin(angle)*3.95;
        const length=between(.4,1.1);
        beam(this.group,this.palette.moss,[x,.55,z],[x*.96,.55-length,z*.96],.022);
        for(let j=0;j<4;j++) sphere(this.group,this.palette.moss,x*(1-j*.009)+Math.sin(j*3)*.06,.4-j*length/4,z*(1-j*.009),.09,.14,.055,true);
      }
    }
    buildGarden() {
      const g=this.group,p=this.palette;
      makeRibbon(g,[[-4.9,.665,1.45],[-3.2,.67,1.05],[-1.6,.67,1.25],[.2,.675,1.2],[2.3,.67,.8],[3.3,.67,-.25]],.67,p.path);
      makeRibbon(g,[[2.4,.67,2.8],[2.6,.67,1.6],[3,.67,.3],[3.2,.67,-.55]],.55,p.pathLight);
      box(g,p.pathLight,0,.69,-.08,2.85,.07,2.75);
      const pond=new T.Shape();
      pond.moveTo(-1.65,-.12); pond.bezierCurveTo(-1.75,.72,-.65,.92,.22,.75);
      pond.bezierCurveTo(1.5,.9,1.82,.27,1.42,-.23); pond.bezierCurveTo(1.1,-.85,.28,-.67,-.36,-.82);
      pond.bezierCurveTo(-1.16,-1.01,-1.73,-.65,-1.65,-.12);
      const geometry=track(new T.ShapeGeometry(pond,32));
      const bank=mesh(g,geometry,p.pathLight,.28,.67,2.63,1.11,1.11,1.11); bank.rotation.x=-Math.PI/2;
      const water=mesh(g,geometry,p.water,.28,.69,2.63);water.rotation.x=-Math.PI/2;water.castShadow=false;
      const shore=[[1.6,3.1],[1.4,2],[.1,3.55],[-1.2,2.6],[-.8,3.3]];
      shore.forEach(([x,z],i)=>sphere(g,i%2?p.stone:p.stoneDark,x,.74,z,.22,.1,.17,true));
      for(let i=0;i<3;i++) {
        const mat=track(new T.MeshBasicMaterial({color:'#e9f1d8',transparent:true,opacity:.3,depthWrite:false}));
        const ripple=mesh(g,track(new T.TorusGeometry(.18,.009,3,40)),mat,-.22+i*.43,.705,2.67+i*.15);
        ripple.rotation.x=-Math.PI/2;ripple.userData.dynamic=true;ripple.castShadow=ripple.receiveShadow=false;
        this.ripples.push(ripple);
      }
      for(let i=0;i<3;i++) {
        const fish=new T.Group(); fish.userData.dynamic=true;
        sphere(fish,i%2?p.white:p.redLight,0,0,0,.12,.025,.047);
        const tail=mesh(fish,G.cone,p.redLight,-.14,0,0,.065,.11,.02);tail.rotation.z=Math.PI/2;
        g.add(fish);this.koi.push(fish);
      }
      // A small arched cedar footbridge, with individual slats and curved rails.
      const bridge=new T.Group();bridge.position.set(-.99,.77,2.53);bridge.rotation.y=-.17;g.add(bridge);
      for(let i=0;i<11;i++) {
        const z=mix(-.7,.7,i/10),y=Math.cos(z/.7*Math.PI/2)*.17;
        box(bridge,p.wood,0,y,z,.66,.065,.125);
        if(i%2===0) for(const side of [-1,1]) box(bridge,p.red,side*.34,y+.21,z,.045,.44,.045);
      }
      for(const side of [-1,1]) for(let i=0;i<12;i++) {
        const za=mix(-.73,.73,i/12),zb=mix(-.73,.73,(i+1)/12);
        beam(bridge,p.red,[side*.34,.43+Math.cos(za/.8*Math.PI/2)*.17,za],[side*.34,.43+Math.cos(zb/.8*Math.PI/2)*.17,zb],.028);
      }
      const trees=[[-4.7,-.5,1.12,0],[-4.65,1.65,1.15,1],[-3.9,2.75,.91,2],[-2.6,3.45,.82,1],[-.5,3.8,.75,0],[3.5,2.65,1.12,2],[4.8,1.08,1.13,1],[4.77,-.8,1.28,0],[4.1,-2.75,.97,1],[2.4,-3.35,1.02,2],[.7,-3.45,1.13,0],[-1.1,-3.45,.83,1],[-4.45,-2.1,.9,2],[-1.8,.15,.76,0]];
      trees.forEach(args=>mapleTree(g,p,...args));
    }
    buildVillage() {
      const g=this.group,p=this.palette;
      const house=(x,z,rotation,scale,second=false)=>{
        const h=new T.Group();h.position.set(x,.71,z);h.rotation.y=rotation;h.scale.setScalar(scale);g.add(h);
        box(h,p.cream,0,.48,0,1.19,.96,1.07);
        box(h,p.wood,0,.12,0,1.24,.24,1.1);
        for(const xx of [-.59,.59]) for(const zz of [-.53,.53]) box(h,p.darkWood,xx,.56,zz,.065,.96,.065);
        box(h,p.darkWood,0,.5,.546,.99,.65,.03);
        for(let i=0;i<5;i++) {
          box(h,p.window,-.4+i*.2,.55,.568,.15,.5,.018);
          box(h,p.wood,-.4+i*.2,.55,.58,.025,.56,.025);
        }
        box(h,p.wood,0,.78,.58,1.19,.045,.04);
        roof(h,p,0,1.02,0,1.65,1.45,.43);
        const awning=box(h,second?p.teal:p.red,0,.84,.77,1.16,.035,.44);awning.rotation.x=.16;
        for(let i=0;i<4;i++)box(h,second?p.teal:p.red,-.44+i*.295,.71,.97,.267,.22,.025);
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#edddb6';ctx.fillRect(0,0,256,96);
        ctx.fillStyle='#685044';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='500 48px serif';ctx.fillText(second?'お茶処':'もみじ',128,47);
        const texture=track(new T.CanvasTexture(canvas));texture.colorSpace=T.SRGBColorSpace;
        const sign=track(new T.MeshStandardMaterial({map:texture,roughness:1}));
        mesh(h,G.plane,sign,0,.99,.713,.71,.25,1);
        sphere(h,p.paperLamp,-.69,.62,.72,.105,.17,.105);
        for(let i=0;i<3;i++) cylinder(h,p.darkWood,-.69,.51+i*.11,.72,.092,.012);
        box(h,p.wood,.7,.23,.71,.23,.46,.04);
        box(h,p.cream,.7,.25,.735,.17,.27,.012);
      };
      house(-3.28,.8,.12,1.05);house(-4.17,-.58,.33,.85,true);
      // An unobtrusive little vending machine beside the tea shop.
      box(g,p.teal,-3.52,1.02,-.18,.26,.63,.3);
      box(g,p.window,-3.52,1.12,-.018,.2,.25,.015);
      for(let i=0;i<3;i++)box(g,i%2?p.redLight:p.white,-3.58+i*.06,1.12,-.002,.035,.13,.01);
      box(g,p.dark,-3.52,.84,-.015,.13,.08,.015);
    }
    buildDetails() {
      const g=this.group,p=this.palette;
      [[2.14,-.35],[4.02,-.45],[1.93,2.55],[-1.85,1.6],[-3.98,1.8]].forEach(([x,z],i)=>stoneLantern(g,p,x,z,i>2?.66:.82));
      for(let i=0;i<8;i++) {
        const step=box(g,p.stone,1.9-i*.39,.715,1.34+Math.sin(i*.9)*.13,.25,.055,.23);step.rotation.y=i*.7;
      }
      const bench=new T.Group();bench.position.set(.7,.75,3.47);bench.rotation.y=-.1;g.add(bench);
      for(const x of [-.35,.35])box(bench,p.darkWood,x,.12,0,.055,.24,.27);
      for(let i=0;i<3;i++)box(bench,p.wood,0,.27,-.1+i*.1,.91,.055,.075);
      box(bench,p.wood,0,.47,-.16,.91,.17,.045);
      for(let i=0;i<34;i++) {
        const angle=between(0,TAU),r=between(.78,.99),x=Math.cos(angle)*5.3*r,z=Math.sin(angle)*3.8*r;
        const bush=sphere(g,i%3?p.moss:p.green,x,.72,z,between(.12,.26),between(.07,.16),between(.12,.23),true);bush.rotation.y=random()*3;
      }
      for(let i=0;i<65;i++) {
        const x=between(-4.8,4.8),z=between(-3.3,3.3);
        if((x/5.2)**2+(z/3.8)**2>1||Math.abs(x)<1.5&&Math.abs(z)<1.5||x>-.9&&x<1.8&&z>1.8)continue;
        const mat=choose([p.mapleRed,p.mapleGold,p.mapleOrange]);
        const leaf=mesh(g,G.plane,mat,x,.682,z,between(.045,.09),between(.05,.1),1);leaf.rotation.set(-Math.PI/2,0,between(0,TAU));leaf.castShadow=false;
      }
    }
    update(time,lightLevel) {
      this.group.position.y=Math.sin(time*.7)*.13;
      this.group.rotation.z=Math.sin(time*.27)*.008;
      this.floatingRocks.forEach((rock,i)=>{rock.position.y=rock.userData.baseY+Math.sin(time*.9+i*2)*.15;rock.rotation.y=time*.07*(i%2?1:-1);});
      this.ripples.forEach((ripple,i)=>{const phase=(time*.27+i*.33)%1;ripple.scale.setScalar(1+phase*2);ripple.material.opacity=Math.sin(phase*Math.PI)*.29;});
      this.koi.forEach((fish,i)=>{const a=time*.22+i*TAU/3;fish.position.set(.25+Math.cos(a)*.79,.708,2.64+Math.sin(a)*.42);fish.rotation.y=-Math.atan2(Math.cos(a)*.42,-Math.sin(a)*.79);});
      for(const light of this.lights)light.intensity=lightLevel*light.userData.power*2.8;
    }
  }

  class MapleLeafSystem {
    constructor(count,palette) {
      this.count=count;this.time=0;
      const shape=new T.Shape();
      const outline=[[0,-.65],[.07,-.2],[.4,-.24],[.3,-.02],[.66,.25],[.32,.27],[.37,.59],[.13,.43],[0,.9],[-.13,.43],[-.37,.59],[-.32,.27],[-.66,.25],[-.3,-.02],[-.4,-.24],[-.06,-.2],[-.04,-.65]];
      outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
      const geometry=track(new T.ShapeGeometry(shape));
      const position=geometry.getAttribute('position');
      for(let i=0;i<position.count;i++)position.setZ(i,Math.abs(position.getX(i))*.24+Math.sin(position.getY(i)*4)*.035);
      geometry.computeVertexNormals();
      const material=track(new T.MeshToonMaterial({color:'#ffffff',gradientMap:palette.gradient,side:T.DoubleSide}));
      this.mesh=new T.InstancedMesh(geometry,material,count);this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.mesh.frustumCulled=false;
      this.dummy=new T.Object3D();this.data=new Float32Array(count*10);
      const colors=['#c45632','#dc873e','#dfac58','#af4332','#e6b36f','#cb7244'].map(c=>new T.Color(c));
      for(let i=0;i<count;i++) {this.spawn(i,true);this.mesh.setColorAt(i,choose(colors));}
      this.mesh.instanceColor.needsUpdate=true;this.update(0);
    }
    spawn(index,initial=false) {
      const o=index*10,d=this.data;
      d[o]=between(-8,8);d[o+1]=initial?between(-4,11):between(10,12);d[o+2]=between(-5.8,5.8);
      d[o+3]=between(.4,.92);d[o+4]=between(.15,.55);d[o+5]=between(0,TAU);d[o+6]=between(.075,.15);
      d[o+7]=between(-1.7,1.7);d[o+8]=between(-1.2,1.2);d[o+9]=between(-1.5,1.5);
    }
    update(dt) {
      this.time+=dt;const t=this.time,d=this.data,object=this.dummy;
      // The fixed pool integrates gravity and a low-frequency crosswind. Flutter
      // is an offset, so it cannot accumulate numerical drift in the simulation.
      // Recycling below the island keeps CPU/GPU memory constant over time.
      for(let i=0;i<this.count;i++) {
        const o=i*10,phase=d[o+5];
        d[o]+=(.12+Math.sin(t*.42+phase)*.17)*dt;d[o+1]-=d[o+3]*dt;d[o+2]+=Math.sin(t*.31+phase)*.08*dt;
        if(d[o+1]<-5.1||d[o]>10)this.spawn(i);
        object.position.set(d[o]+Math.sin(t*1.6+phase)*d[o+4],d[o+1]+Math.sin(t*2+phase)*.09,d[o+2]+Math.cos(t*1.1+phase)*d[o+4]*.5);
        object.rotation.set(t*d[o+7]+phase,t*d[o+8],t*d[o+9]+phase);
        object.scale.setScalar(d[o+6]);object.updateMatrix();this.mesh.setMatrixAt(i,object.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate=true;
    }
  }

  class Atmosphere {
    constructor(scene,palette) {
      this.clouds=[];
      this.cloudMaterial=track(new T.MeshBasicMaterial({color:'#fff6e5',transparent:true,opacity:.57,depthWrite:false}));
      const placements=[[-10,3,-11,1.1],[8,5,-13,.9],[-9,7,-20,1.4],[15,1,-6,1.2],[0,6,-23,1.0],[-7,-2,2,.65],[7,-2,-2,.65],[-13,-4,9,1.05],[10,-4,10,.9]];
      placements.forEach(([x,y,z,s],i)=>{
        const cloud=new T.Group();cloud.position.set(x,y,z);cloud.scale.setScalar(s);cloud.userData.baseX=x;cloud.userData.baseY=y;
        for(let j=0;j<5;j++) {
          const puff=sphere(cloud,this.cloudMaterial,(j-2)*.72,Math.sin(j*1.7)*.12,Math.cos(j*2)*.21,between(.7,1.05),between(.35,.65),between(.6,.9));
          puff.castShadow=puff.receiveShadow=false;
        }
        scene.add(cloud);this.clouds.push(cloud);
      });
      this.sun=new T.Group();
      mesh(this.sun,G.sphere,track(new T.MeshBasicMaterial({color:'#ffe6a4',fog:false})),0,0,0,.88,.88,.88);
      const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=128;
      const ctx=haloCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
      gradient.addColorStop(0,'rgba(255,216,144,.48)');gradient.addColorStop(.35,'rgba(255,216,144,.17)');gradient.addColorStop(1,'rgba(255,216,144,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
      const halo=new T.Sprite(track(new T.SpriteMaterial({map:track(new T.CanvasTexture(haloCanvas)),transparent:true,depthWrite:false,fog:false})));halo.scale.set(6,6,1);this.sun.add(halo);scene.add(this.sun);
      this.moon=new T.Group();
      const moonMaterial=track(new T.MeshBasicMaterial({color:'#f1ebd3',fog:false}));
      mesh(this.moon,G.sphere,moonMaterial,0,0,0,.63,.63,.63);
      const crater=track(new T.MeshBasicMaterial({color:'#d5d7c7',fog:false}));
      sphere(this.moon,crater,-.21,.13,.52,.1,.1,.04);sphere(this.moon,crater,.16,-.2,.54,.14,.14,.04);sphere(this.moon,crater,.24,.23,.49,.07,.07,.03);scene.add(this.moon);
      const starPositions=new Float32Array(200*3);
      for(let i=0;i<200;i++) {const a=between(0,TAU),elevation=between(-.45,.52),r=between(40,60);starPositions.set([Math.cos(a)*r*Math.cos(elevation),Math.sin(elevation)*r,Math.sin(a)*r*Math.cos(elevation)],i*3);}
      const starsGeometry=track(new T.BufferGeometry());starsGeometry.setAttribute('position',new T.BufferAttribute(starPositions,3));
      this.starMaterial=track(new T.PointsMaterial({color:'#fff0c6',size:.16,transparent:true,opacity:0,depthWrite:false,fog:false,sizeAttenuation:true}));
      this.stars=new T.Points(starsGeometry,this.starMaterial);scene.add(this.stars);
    }
    update(time,phase,night) {
      this.clouds.forEach((cloud,i)=>{cloud.position.x=cloud.userData.baseX+Math.sin(time*.045+i)*.55;cloud.position.y=cloud.userData.baseY+Math.sin(time*.15+i)*.08;});
      const a=phase*TAU-Math.PI/2;
      this.sun.position.set(-Math.cos(a)*20,Math.sin(a)*5-5,-20);
      this.moon.position.set(Math.cos(a)*20,-Math.sin(a)*5-5,-20);
      this.sun.visible=Math.sin(a)>-.025;this.moon.visible=Math.sin(a)<.025;
      this.starMaterial.opacity=night*.77;
      this.stars.rotation.y=time*.0015;
    }
  }

  class DayNightCycle {
    constructor(scene,palette,atmosphere) {
      this.phase=.4;this.duration=15;this.paused=false;this.speed=1;this.shift=false;this.scrubbing=false;
      this.scene=scene;this.palette=palette;this.atmosphere=atmosphere;this.lampLevel=0;this.night=0;
      this.ambient=new T.HemisphereLight('#f6f0d9','#867a61',1.7);scene.add(this.ambient);
      this.sunlight=new T.DirectionalLight('#fff0d0',2.6);this.sunlight.position.set(-7,14,8);this.sunlight.castShadow=true;
      this.sunlight.shadow.mapSize.set(2048,2048);Object.assign(this.sunlight.shadow.camera,{left:-9,right:9,top:11,bottom:-7,near:.5,far:45});
      this.sunlight.shadow.normalBias=.035;this.sunlight.shadow.bias=-.00015;this.sunlight.shadow.radius=3;
      this.sunlight.target.position.set(0,.4,0);scene.add(this.sunlight,this.sunlight.target);
      this.fill=new T.DirectionalLight('#e4eacb',.5);this.fill.position.set(8,6,-7);scene.add(this.fill);
      scene.fog=new T.Fog('#f3e8d4',25,80);
      const frames=[
        [0,'#233742','#65736e',.5,.45,'#bdcde2','#b2c3ba'],
        [.19,'#334750','#928c82',.6,.6,'#c7c9d6','#c0c4b1'],
        [.27,'#dbcdba','#f3d4b4',1.35,2.1,'#ffdaab','#f3e2c3'],
        [.36,'#e4e8d8','#f8efe2',1.5,2.05,'#fff1d5','#f6f0d9'],
        [.59,'#e2e7d6','#f6ebdb',1.5,2.05,'#fff0cf','#f5f0d6'],
        [.69,'#d9bba4','#f0d0b0',1.3,2.4,'#ffbe8b','#f2d5b8'],
        [.77,'#857e88','#c29c8d',.65,.8,'#d8b4be','#d8b5ab'],
        [.86,'#233742','#65736e',.5,.45,'#bdcde2','#b2c3ba'],
        [1,'#233742','#65736e',.5,.45,'#bdcde2','#b2c3ba']
      ];
      this.frames=frames.map(([t,top,bottom,ambient,direct,sun,hemi])=>({t,top:new T.Color(top),bottom:new T.Color(bottom),ambient,direct,sun:new T.Color(sun),hemi:new T.Color(hemi)}));
      this.top=new T.Color();this.bottom=new T.Color();this.ink=new T.Color();this.muted=new T.Color();this.accent=new T.Color();this.cloudWhite=new T.Color('#fff6e7');
      this.dayInk=new T.Color('#343c35');this.nightInk=new T.Color('#ece7d4');this.dayMuted=new T.Color('#7c8073');this.nightMuted=new T.Color('#b8c1b2');this.dayAccent=new T.Color('#b9593e');this.nightAccent=new T.Color('#efba82');
      // Render the sky at the animation frame rate. The matching HTML palette
      // can update less frequently without stepping the visible sky gradient.
      const skyMaterial=track(new T.ShaderMaterial({
        uniforms:{topColor:{value:this.top},bottomColor:{value:this.bottom}},
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, .999, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          varying vec2 vUv;
          void main() {
            float blend = smoothstep(0.0, 1.0, vUv.y * .85 + vUv.x * .15);
            gl_FragColor = vec4(mix(bottomColor, topColor, blend), 1.0);
            #include <colorspace_fragment>
          }
        `,
        depthWrite:false,depthTest:false,toneMapped:false
      }));
      this.sky=new T.Mesh(track(new T.PlaneGeometry(2,2)),skyMaterial);this.sky.frustumCulled=false;this.sky.renderOrder=-1000;scene.add(this.sky);
      this.uiElapsed=1;this.rootStyle=document.documentElement.style;this.lastMinute=-1;
      this.update(0);
    }
    update(dt) {
      if(!this.paused&&!this.scrubbing)this.phase=(this.phase+dt/this.duration*this.speed*(this.shift?4:1))%1;
      const p=this.phase;
      let a=this.frames[0],b=this.frames[1];
      for(let i=0;i<this.frames.length-1;i++)if(p>=this.frames[i].t&&p<=this.frames[i+1].t){a=this.frames[i];b=this.frames[i+1];break;}
      // Smoothstep gives zero slope at every keyframe. All atmosphere channels
      // share this interpolation, avoiding abrupt sky, fog, or lighting changes.
      const t=smooth(p,a.t,b.t);
      this.top.copy(a.top).lerp(b.top,t);this.bottom.copy(a.bottom).lerp(b.bottom,t);
      this.ambient.intensity=mix(a.ambient,b.ambient,t);this.ambient.color.copy(a.hemi).lerp(b.hemi,t);
      this.sunlight.intensity=mix(a.direct,b.direct,t);this.sunlight.color.copy(a.sun).lerp(b.sun,t);
      const angle=p*TAU-Math.PI/2;
      this.sunlight.position.set(-Math.cos(angle)*10,8+Math.max(0,Math.sin(angle))*10,8);
      this.scene.fog.color.copy(this.bottom);
      this.night=1-smooth(this.ambient.intensity,.58,1.65);
      this.fill.intensity=mix(.5,.23,this.night);
      this.atmosphere.cloudMaterial.color.copy(this.bottom).lerp(this.cloudWhite,(1-this.night)*.6);
      // Lights fade on at sunset, then fade off just before the dawn interval.
      this.lampLevel=p<.5?1-smooth(p,.18,.235):smooth(p,.665,.745);
      this.palette.lamp.emissiveIntensity=.08+this.lampLevel*2.1;
      this.palette.window.emissiveIntensity=this.lampLevel*1.6;
      this.palette.paperLamp.emissiveIntensity=this.lampLevel*.9;
      this.uiElapsed+=dt;
      if(this.uiElapsed>.1) {this.uiElapsed=0;this.updateUI();}
    }
    updateUI() {
      const style=this.rootStyle,night=smooth(this.night,.3,.85);
      style.setProperty('--sky-top',`#${this.top.getHexString()}`);style.setProperty('--sky-bottom',`#${this.bottom.getHexString()}`);
      style.setProperty('--ink',`#${this.ink.copy(this.dayInk).lerp(this.nightInk,night).getHexString()}`);
      style.setProperty('--muted',`#${this.muted.copy(this.dayMuted).lerp(this.nightMuted,night).getHexString()}`);
      style.setProperty('--accent',`#${this.accent.copy(this.dayAccent).lerp(this.nightAccent,night).getHexString()}`);
      style.setProperty('--rule',`rgba(${night>.5?'230,231,206':'70,79,60'},${mix(.17,.21,night).toFixed(3)})`);
      style.setProperty('--glass',`rgba(${Math.round(mix(249,39,night))},${Math.round(mix(247,57,night))},${Math.round(mix(239,61,night))},.73)`);
      style.setProperty('--paper',`#${this.bottom.getHexString()}`);
      document.body.classList.toggle('night',night>.5);
      const minute=Math.floor(this.phase*24*60)%1440;
      if(minute!==this.lastMinute) {
        this.lastMinute=minute;
        const time=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
        $('time-display').textContent=time;
        $('time-slider').setAttribute('aria-valuetext',time);
      }
      const p=this.phase,phase=p<.21||p>.79?'NIGHTFALL':p<.33?'FIRST LIGHT':p<.64?'DAYLIGHT':'GOLDEN HOUR';
      $('phase-name').textContent=phase;
      $('phase-icon').firstElementChild.setAttribute('href',this.night>.5?'#icon-moon':'#icon-sun');
      // Timeline begins at 06:00, matching its dawn → day → dusk → night labels.
      if(!this.scrubbing)$('time-slider').value=((p-.25+1)%1)*1000;
    }
    toggle() {
      this.paused=!this.paused;
      $('play-icon').setAttribute('href',this.paused?'#icon-play':'#icon-pause');
      $('play-button').setAttribute('aria-label',`${this.paused?'Resume':'Pause'} the day–night cycle`);
      $('play-button').setAttribute('aria-pressed',String(this.paused));
      $('play-button').title=`${this.paused?'Resume':'Pause'} the cycle (Space)`;
    }
  }

  class CameraController {
    constructor(camera,element) {
      this.camera=camera;this.element=element;this.yaw=.57;this.targetYaw=.57;this.pitch=.48;this.targetPitch=.48;
      this.radius=27;this.targetRadius=27;this.lookAt=v3(0,1.6,0);this.targetLookAt=this.lookAt.clone();
      this.width=1;this.height=1;this.dragging=false;this.pointerId=null;this.travel=0;this.inertia=0;
      this.boundDown=this.pointerDown.bind(this);this.boundMove=this.pointerMove.bind(this);this.boundUp=this.pointerUp.bind(this);
      element.addEventListener('pointerdown',this.boundDown);element.addEventListener('pointermove',this.boundMove);element.addEventListener('pointerup',this.boundUp);element.addEventListener('pointercancel',this.boundUp);element.addEventListener('lostpointercapture',this.boundUp);
      element.addEventListener('wheel',(event)=>{event.preventDefault();this.targetRadius=clamp(this.targetRadius+event.deltaY*.008,22,36);},{passive:false});
      element.addEventListener('contextmenu',(event)=>event.preventDefault());
    }
    pointerDown(event) {
      if(event.button!==0||this.pointerId!==null)return;
      this.dragging=true;this.pointerId=event.pointerId;this.lastX=event.clientX;this.lastY=event.clientY;this.travel=0;this.inertia=0;
      this.element.setPointerCapture(event.pointerId);this.element.classList.add('dragging');
    }
    pointerMove(event) {
      if(!this.dragging||event.pointerId!==this.pointerId)return;
      const dx=event.clientX-this.lastX,dy=event.clientY-this.lastY;
      this.travel+=Math.abs(dx)+Math.abs(dy);this.targetYaw-=dx*.006;this.targetPitch=clamp(this.targetPitch+dy*.002,.24,.78);
      this.inertia=clamp(-dx*.003,-.06,.06);this.lastX=event.clientX;this.lastY=event.clientY;
    }
    pointerUp(event) {
      if(event.pointerId!==this.pointerId)return;
      this.dragging=false;this.pointerId=null;this.element.classList.remove('dragging');
      if(this.element.hasPointerCapture(event.pointerId))this.element.releasePointerCapture(event.pointerId);
    }
    focus(index) {
      const settings=[{yaw:.57,radius:25.7,target:[0,1.6,0]},{yaw:-.25,radius:25.4,target:[-.45,1.3,-.2]},{yaw:1.03,radius:25.7,target:[.55,1.4,-.15]}];
      const setting=settings[index];
      this.targetYaw=this.yaw+T.MathUtils.euclideanModulo(setting.yaw-this.yaw+Math.PI,TAU)-Math.PI;
      this.targetRadius=setting.radius;this.targetPitch=.48;this.targetLookAt.set(...setting.target);this.inertia=0;
    }
    reset() {this.focus(0);this.targetRadius=27;this.targetLookAt.set(0,1.6,0);}
    resize(w,h) {
      this.width=w;this.height=h;this.camera.aspect=w/h;
      const editorial=w>800&&h>520;
      this.fit=editorial?Math.max(1,1.25/(w/h)):Math.max(1,.78/(w/h))*(h<280?.92:1);
      this.camera.setViewOffset(w,h,editorial?-w*.148:0,editorial?-h*.015:h<280?h*.015:-h*.018,w,h);
      this.camera.updateProjectionMatrix();
    }
    update(dt) {
      if(!this.dragging) {this.targetYaw+=this.inertia*dt*24;this.inertia*=Math.exp(-dt*5);}
      const ease=1-Math.exp(-dt*5);
      this.yaw=mix(this.yaw,this.targetYaw,ease);this.pitch=mix(this.pitch,this.targetPitch,ease);this.radius=mix(this.radius,this.targetRadius,ease);
      this.lookAt.lerp(this.targetLookAt,ease);
      const radius=this.radius*this.fit;
      this.camera.position.set(this.lookAt.x+Math.sin(this.yaw)*Math.cos(this.pitch)*radius,this.lookAt.y+Math.sin(this.pitch)*radius,this.lookAt.z+Math.cos(this.yaw)*Math.cos(this.pitch)*radius);
      this.camera.lookAt(this.lookAt);
    }
  }

  class AmbientAudio {
    constructor() {this.enabled=false;this.context=null;this.birdTime=0;this.noise=null;}
    init() {
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return false;
      this.context=new AudioContext();const ctx=this.context;
      this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),data=buffer.getChannelData(0);
      let last=0;for(let i=0;i<data.length;i++){last=(last+(.02*(Math.random()*2-1)))/1.02;data[i]=last*3.5;}
      this.noise=ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
      this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=900;
      const wind=ctx.createGain();wind.gain.value=.22;this.noise.connect(this.filter).connect(wind).connect(this.master);this.noise.start();
      this.pads=[];[174.61,261.63,349.23].forEach((frequency,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.value=.007;osc.connect(gain).connect(this.master);osc.start();this.pads.push({osc,gain});});
      return true;
    }
    async toggle() {
      try {
        if(!this.context&&!this.init()) { $('sound-label').textContent='Unavailable';return; }
        this.enabled=!this.enabled;
        if(this.enabled){await this.context.resume();if(!this.enabled)return;this.master.gain.setTargetAtTime(.65,this.context.currentTime,.8);}
        else this.master.gain.setTargetAtTime(0,this.context.currentTime,.2);
        $('sound-icon').setAttribute('href',this.enabled?'#icon-audio':'#icon-muted');$('sound-label').textContent=this.enabled?'Sound on':'Sound off';
        $('sound-button').setAttribute('aria-pressed',String(this.enabled));$('sound-button').setAttribute('aria-label',`Turn ${this.enabled?'off':'on'} ambient sound`);
      }catch(error){console.warn('Ambient audio is unavailable.',error);this.enabled=false;}
    }
    update(dt,night) {
      if(!this.enabled||!this.context)return;
      const ctx=this.context,t=ctx.currentTime;this.filter.frequency.setTargetAtTime(mix(1000,450,night),t,.5);
      this.pads.forEach(({gain},i)=>gain.gain.setTargetAtTime(mix(.004,.018,night)*(1+Math.sin(t*.13+i)*.2),t,1));
      this.birdTime+=dt;
      if(this.birdTime>(night>.6?7:4.1)) {
        this.birdTime=0;
        const oscillator=ctx.createOscillator(),gain=ctx.createGain();
        oscillator.type='sine';oscillator.frequency.setValueAtTime(night>.6?880:1900,t);oscillator.frequency.exponentialRampToValueAtTime(night>.6?660:2700,t+.11);oscillator.frequency.exponentialRampToValueAtTime(night>.6?660:1600,t+.3);
        gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(night>.6?.018:.027,t+.02);gain.gain.exponentialRampToValueAtTime(.0001,t+(night>.6?1.6:.34));
        oscillator.connect(gain).connect(this.master);oscillator.start(t);oscillator.stop(t+(night>.6?1.7:.4));oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
      }
    }
    dispose() {if(this.context)this.context.close().catch(()=>{});}
  }

  class App {
    constructor() {
      this.disposed=false;this.time=0;this.frame=0;this.debugTime=0;this.debugFrames=0;this.debugVisible=false;this.selected=0;this.fps=60;
      this.host=$('scene');this.scene=new T.Scene();this.palette=new Palette();
      this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
      this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.13;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
      this.renderer.setClearColor(0x000000,0);this.host.appendChild(this.renderer.domElement);
      this.camera=new T.PerspectiveCamera(35,1,.1,150);this.controls=new CameraController(this.camera,this.host);
      this.island=new Island(this.palette);this.scene.add(this.island.group);
      this.atmosphere=new Atmosphere(this.scene,this.palette);this.cycle=new DayNightCycle(this.scene,this.palette,this.atmosphere);
      const compact=window.innerWidth<700||window.innerHeight<400;
      this.leaves=new MapleLeafSystem(compact?240:380,this.palette);this.scene.add(this.leaves.mesh);
      this.audio=new AmbientAudio();this.tagPoint=new T.Vector3();this.clock=new T.Clock();
      this.anchors=[v3(1.0,3.6,.15),v3(-2.6,2.65,-2.0),v3(3.5,2.2,-1.1)];
      this.resize=this.resize.bind(this);this.animate=this.animate.bind(this);this.onKey=this.onKey.bind(this);
      this.installEvents();this.resize();this.controls.update(1);this.cycle.updateUI();
      this.renderer.render(this.scene,this.camera);$('loading').classList.add('loaded');this.loadingTimer=setTimeout(()=>$('loading').hidden=true,750);
      this.raf=requestAnimationFrame(this.animate);
    }
    installEvents() {
      window.addEventListener('resize',this.resize);
      this.observer=new ResizeObserver(this.resize);this.observer.observe(this.host);
      $('play-button').addEventListener('click',()=>this.cycle.toggle());
      $('reset-button').addEventListener('click',()=>{this.select(0);this.controls.reset();});
      $('explore-button').addEventListener('click',()=>this.select((this.selected+1)%3));
      document.querySelectorAll('[data-landmark]').forEach(button=>button.addEventListener('click',()=>this.select(Number(button.dataset.landmark))));
      $('speed-button').addEventListener('click',()=>{this.cycle.speed=this.cycle.speed===1?2:this.cycle.speed===2?.5:1;const label=`${this.cycle.speed}×`;$('speed-button').textContent=label;$('speed-button').setAttribute('aria-label',`Cycle speed, ${this.cycle.speed} times. Click to change.`);});
      $('sound-button').addEventListener('click',()=>this.audio.toggle());
      const slider=$('time-slider');
      slider.addEventListener('pointerdown',()=>this.cycle.scrubbing=true);
      slider.addEventListener('input',()=>{this.cycle.phase=(Number(slider.value)/1000+.25)%1;this.cycle.uiElapsed=1;this.cycle.update(0);});
      const release=()=>this.cycle.scrubbing=false;
      window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);slider.addEventListener('blur',release);
      window.addEventListener('keydown',this.onKey);
      window.addEventListener('keyup',event=>{if(event.key==='Shift')this.cycle.shift=false;});
      window.addEventListener('blur',()=>{this.cycle.shift=false;this.cycle.scrubbing=false;});
      document.addEventListener('visibilitychange',()=>{
        if(document.hidden){cancelAnimationFrame(this.raf);if(this.audio.context)this.audio.context.suspend().catch(()=>{});}
        else if(!this.disposed){this.clock.getDelta();this.raf=requestAnimationFrame(this.animate);if(this.audio.enabled)this.audio.context.resume().catch(()=>{});}
      });
      this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(this.raf);showError('The graphics connection was interrupted. Refresh to return to your little world.');});
      window.addEventListener('pagehide',event=>{if(!event.persisted)this.dispose();});
    }
    onKey(event) {
      if(dialog.open)return;
      if(event.key==='Shift'){this.cycle.shift=true;return;}
      if(event.target.matches('input,textarea,select,button,a'))return;
      if(event.code==='Space'){event.preventDefault();if(!event.repeat)this.cycle.toggle();}
      if(event.key==='ArrowLeft'){event.preventDefault();this.controls.targetYaw+=.12;}
      if(event.key==='ArrowRight'){event.preventDefault();this.controls.targetYaw-=.12;}
      if(event.key.toLowerCase()==='r')this.controls.reset();
      if(event.key.toLowerCase()==='d'&&!event.repeat){this.debugVisible=!this.debugVisible;$('debug').hidden=!this.debugVisible;}
    }
    select(index) {
      this.selected=index;this.controls.focus(index);
      const titles=['The heart of Tokyo.','A mountain, a little magic.','A quiet kind of sacred.'];
      const descriptions=['A familiar silhouette. A little closer to the sky.','Snow at the summit. Autumn at its feet.','Through the red gate, leave the rush behind.'];
      $('landmark-title').textContent=titles[index];$('landmark-description').textContent=descriptions[index];
      $('landmark-count').textContent=`0${index+1} — 03`;$('tag-number').textContent=`0${index+1}`;$('scene-tag-text').textContent=['TOKYO TOWER','MOUNT FUJI','THE SHRINE'][index];
      document.querySelectorAll('[data-landmark]').forEach(button=>{const active=Number(button.dataset.landmark)===index;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    }
    resize() {
      const w=this.host.clientWidth,h=this.host.clientHeight;
      if(!w||!h)return;
      this.width=w;this.height=h;this.renderer.setSize(w,h);this.controls.resize(w,h);
    }
    updateTag() {
      const tag=$('scene-tag');
      if(this.width<=800||this.height<=520)return;
      this.tagPoint.copy(this.anchors[this.selected]).applyMatrix4(this.island.group.matrixWorld).project(this.camera);
      const x=(this.tagPoint.x*.5+.5)*this.width,y=(-this.tagPoint.y*.5+.5)*this.height;
      const visible=x>this.width*.4&&x<this.width*.84&&y>105&&y<this.height*.73;
      tag.classList.toggle('visible',visible&&!this.controls.dragging);
      if(visible){tag.style.left=`${x.toFixed(1)}px`;tag.style.top=`${y.toFixed(1)}px`;}
    }
    animate() {
      if(this.disposed)return;
      this.raf=requestAnimationFrame(this.animate);
      // Clamp tab-resume stalls. Every moving system consumes seconds, not frames.
      const elapsed=this.clock.getDelta(),dt=Math.min(elapsed,.075);this.time+=dt;this.frame++;
      this.cycle.update(elapsed);this.island.update(this.time,this.cycle.lampLevel);this.leaves.update(dt);
      this.atmosphere.update(this.time,this.cycle.phase,this.cycle.night);this.controls.update(dt);this.audio.update(dt,this.cycle.night);
      this.renderer.render(this.scene,this.camera);
      if(this.frame%3===0)this.updateTag();
      this.debugTime+=elapsed;this.debugFrames++;
      if(this.debugTime>.6) {
        this.fps=this.debugFrames/this.debugTime;
        if(this.debugVisible)$('debug').textContent=`${Math.round(this.fps)} FPS · ${this.leaves.count} leaves\n${this.renderer.info.render.calls} draws · ${this.renderer.info.memory.geometries} geometries\n15s / day · ${this.cycle.paused?'paused':`${this.cycle.speed}×`}`;
        this.debugFrames=0;this.debugTime=0;
      }
    }
    dispose() {
      if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.raf);clearTimeout(this.loadingTimer);
      this.observer.disconnect();window.removeEventListener('resize',this.resize);window.removeEventListener('keydown',this.onKey);
      this.audio.dispose();this.renderer.dispose();
      for(const resource of resources)resource.dispose();resources.clear();this.scene.clear();
    }
  }

  try {new App();}
  catch(error) {console.error('Momiji could not initialize:',error);showError('This little world needs a browser with WebGL enabled. Please enable graphics acceleration and refresh.');}
})();
