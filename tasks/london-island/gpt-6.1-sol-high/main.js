/* Little London · procedural geometry, a pooled climate, and one very small Thames. */
(() => {
  'use strict';

  const loading = document.getElementById('loading');
  if (!window.THREE) {
    loading.textContent = 'A little connection is needed. Reconnect and refresh to load Three.js.';
    return;
  }

  const TAU = Math.PI * 2;
  const clamp = THREE.MathUtils.clamp;
  const lerp = THREE.MathUtils.lerp;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let seed = 1867;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const range = (a, b) => a + random() * (b - a);
  const $ = id => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SEASONS = [
    { name: 'spring', icon: 'spring', temperature: 14, greeting: 'Hello, spring.', description: 'A softer sky.<br>A fresh beginning.', label: 'MISTY MORNINGS & NEW BEGINNINGS', grass: '#a9be83', foliage: '#acc588', sky: '#dce6db', glow: '#f1f0d9', fog: .021 },
    { name: 'summer', icon: 'sun', temperature: 24, greeting: 'Hello, summer.', description: 'Golden hours.<br>A little more daydreaming.', label: 'SUN-KISSED & UNHURRIED', grass: '#acbb7b', foliage: '#90aa65', sky: '#e6ecdf', glow: '#fbf0d0', fog: .005 },
    { name: 'autumn', icon: 'leaf', temperature: 12, greeting: 'Hello, autumn.', description: 'Amber leaves.<br>A little magic in the air.', label: 'CRISP AIR & FALLING LEAVES', grass: '#bcad78', foliage: '#c68c4d', sky: '#e9dfcf', glow: '#f9e3c3', fog: .010 },
    { name: 'winter', icon: 'snow', temperature: 2, greeting: 'Hello, winter.', description: 'A quiet kind of wonder.<br>Let it snow, little London.', label: 'SNOWFLAKES & SLOW MOMENTS', grass: '#dce2d7', foliage: '#94afa2', sky: '#dce5e6', glow: '#eef1e8', fog: .014 }
  ];

  // Shared unit geometry and materials reduce allocations and make seasonal recoloring cheap.
  const geometryCache = new Map();
  const materialCache = new Map();
  const geometries = new Set();
  const materials = new Set();
  function geometry(key, create) {
    if (!geometryCache.has(key)) { const g = create(); geometryCache.set(key, g); geometries.add(g); }
    return geometryCache.get(key);
  }
  function material(color, options = {}) {
    const key = color + JSON.stringify(options);
    if (!materialCache.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: 0, flatShading: true, ...options });
      materialCache.set(key, m); materials.add(m);
    }
    return materialCache.get(key);
  }
  const M = {
    stone: material('#dfbd87'), lightStone: material('#f4deb0'), trim: material('#f8e9c7'), stoneDark: material('#c8a370'),
    roof: material('#46665e'), roofLight: material('#739084'), roofDark: material('#354e4c'),
    window: material('#587d79'), blueGlass: material('#abcac2'), white: material('#f6f3df'),
    brick: material('#c47c62'), brickPink: material('#d6a28b'), yellow: material('#e9ce91'),
    grass: material(SEASONS[1].grass), ground: material('#d8c7a2'), path: material('#e9dabc'),
    water: material('#6eaead', { roughness: .35, metalness: .12 }), waterLine: material('#b7d8c5', { transparent: true, opacity: .52 }),
    foliage: material(SEASONS[1].foliage), foliageLight: material('#b1c47d'), foliageDark: material('#718e59'),
    trunk: material('#867051'), red: material('#c14d40'), redDark: material('#9f4037'), black: material('#344944'),
    gold: material('#c5a55b', { metalness: .3, roughness: .5 }), cloud: material('#f8f7e9', { roughness: 1 }),
    snow: material('#f5f7ef', { transparent: true, opacity: 0, depthWrite: false }),
    lamp: material('#f5e0a3', { emissive: '#ffc55d', emissiveIntensity: 0 }),
    nightWindow: material('#839c84', { emissive: '#ffc56c', emissiveIntensity: 0 })
  };
  function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geo, mat);
    object.position.set(x, y, z); object.castShadow = mat !== M.snow; object.receiveShadow = true;
    parent.add(object); return object;
  }
  const boxGeo = geometry('box', () => new THREE.BoxGeometry(1, 1, 1));
  const ballGeo = geometry('ball', () => new THREE.IcosahedronGeometry(1, 1));
  const softBallGeo = geometry('soft-ball', () => new THREE.SphereGeometry(1, 12, 8));
  function box(parent, mat, w, h, d, x = 0, y = 0, z = 0) {
    const m = mesh(parent, boxGeo, mat, x, y, z); m.scale.set(w, h, d); return m;
  }
  function ball(parent, mat, r, x, y, z, sx = 1, sy = 1, sz = 1, soft = false) {
    const m = mesh(parent, soft ? softBallGeo : ballGeo, mat, x, y, z); m.scale.set(r * sx, r * sy, r * sz); return m;
  }
  function cylinder(parent, mat, top, bottom, height, x, y, z, segments = 12) {
    return mesh(parent, geometry(`c${top},${bottom},${height},${segments}`, () => new THREE.CylinderGeometry(top, bottom, height, segments)), mat, x, y, z);
  }
  function beam(parent, mat, start, end, radius = .025, square = false) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), delta = b.clone().sub(a);
    const m = square ? box(parent, mat, radius * 2, delta.length(), radius * 2) : cylinder(parent, mat, radius, radius, delta.length(), 0, 0, 0, 6);
    m.position.copy(a.add(b).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  function roof(parent, mat, w, h, d, x, y, z) {
    const g = geometry(`roof${w},${h},${d}`, () => {
      const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
      const result = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }); result.translate(0, 0, -d / 2); return result;
    });
    return mesh(parent, g, mat, x, y, z);
  }
  function ribbon(parent, points, width, y, mat) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], y, p[1])));
    const verts = [], indices = [], steps = 90;
    for (let i = 0; i <= steps; i++) {
      const p = curve.getPoint(i / steps), tangent = curve.getTangent(i / steps);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
      verts.push(p.x + normal.x, y, p.z + normal.z, p.x - normal.x, y, p.z - normal.z);
      if (i < steps) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(indices); g.computeVertexNormals(); geometries.add(g);
    return { mesh: mesh(parent, g, mat), curve };
  }

  // Merge opaque static geometry by material. Moving subtrees remain independent.
  // This turns hundreds of architectural details into a few dozen render calls.
  function batchStatic(root) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const batches = new Map(), remove = [];
    function visit(node, moving = false) {
      moving = moving || !!node.userData.moving;
      if (node.isMesh && !moving && !node.material.map && !Array.isArray(node.material)) {
        const key = `${node.material.uuid}:${node.castShadow}:${node.receiveShadow}`;
        if (!batches.has(key)) batches.set(key, { material: node.material, geometries: [], cast: node.castShadow, receive: node.receiveShadow });
        const source = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
        source.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld));
        batches.get(key).geometries.push(source); remove.push(node);
      }
      node.children.forEach(child => visit(child, moving));
    }
    visit(root);
    for (const batch of batches.values()) {
      let size = 0; batch.geometries.forEach(g => size += g.attributes.position.array.length);
      const positions = new Float32Array(size), normals = new Float32Array(size); let offset = 0;
      for (const g of batch.geometries) {
        positions.set(g.attributes.position.array, offset); normals.set(g.attributes.normal.array, offset); offset += g.attributes.position.array.length; g.dispose();
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(normals, 3)); g.computeBoundingSphere(); geometries.add(g);
      const result = mesh(root, g, batch.material); result.castShadow = batch.cast; result.receiveShadow = batch.receive;
    }
    remove.forEach(node => node.removeFromParent());
  }

  class Island {
    constructor(scene) {
      this.group = new THREE.Group(); scene.add(this.group);
      this.waterRipples = []; this.clouds = []; this.rocks = [];
      this.buildLand(); this.buildWater(); this.buildVillage(); this.buildGarden(); this.buildDetails(); this.buildClouds(scene);
    }
    buildLand() {
      const count = 48, noise = Array.from({ length: count }, () => range(.975, 1.025));
      const layers = [[1, .07], [1.015, -.12], [.99, -.38], [.89, -.94], [.72, -1.55], [.46, -2.04], [.1, -2.3]];
      const colors = ['#a7ad75', '#c3b18b', '#b9a07e', '#cbb798', '#bca88e', '#d0bea3'];
      const verts = [], shades = [];
      const pushTriangle = (a, b, c, color) => { verts.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) shades.push(color.r, color.g, color.b); };
      const vertex = (i, ring) => { const angle = (i % count) / count * TAU; return [Math.cos(angle) * 5.9 * ring[0] * noise[i % count], ring[1], Math.sin(angle) * 4.15 * ring[0] * noise[i % count]]; };
      for (let l = 0; l < layers.length - 1; l++) {
        for (let i = 0; i < count; i++) {
          const a = vertex(i, layers[l]), b = vertex(i + 1, layers[l]), c = vertex(i, layers[l + 1]), d = vertex(i + 1, layers[l + 1]);
          const color = new THREE.Color(colors[l]).multiplyScalar(range(.90, 1.06));
          pushTriangle(a, b, c, color); pushTriangle(b, d, c, color);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3)); g.computeVertexNormals(); geometries.add(g);
      const rockMaterial = material('#ffffff', { vertexColors: true });
      const sides = mesh(this.group, g, rockMaterial); sides.userData.moving = true; // Preserve per-vertex strata colors.
      const topVerts = [], topIndices = [];
      topVerts.push(0, .08, 0);
      for (let i = 0; i <= count; i++) topVerts.push(...vertex(i, layers[0]));
      for (let i = 1; i <= count; i++) topIndices.push(0, i + 1, i);
      const top = new THREE.BufferGeometry(); top.setAttribute('position', new THREE.Float32BufferAttribute(topVerts, 3)); top.setIndex(topIndices); top.computeVertexNormals(); geometries.add(top); mesh(this.group, top, M.grass);
      for (let i = 0; i < 12; i++) {
        const angle = range(0, TAU), radius = range(3.5, 6.5);
        const rock = ball(this.group, material(i % 2 ? '#c4b393' : '#ada68a'), range(.13, .36), Math.cos(angle) * radius, range(-2.4, -1.15), Math.sin(angle) * radius * .64, 1, 1.2, 1);
        rock.userData.moving = true; this.rocks.push({ object: rock, y: rock.position.y, phase: random() * TAU });
      }
      // A radial canvas shadow anchors the island without adding a ground plane.
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d'), grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, 'rgba(66,84,64,.17)'); grad.addColorStop(.45, 'rgba(66,84,64,.09)'); grad.addColorStop(1, 'rgba(66,84,64,0)'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
      this.shadowTexture = new THREE.CanvasTexture(c);
      const sm = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, opacity: .7 }); materials.add(sm);
      this.shadow = mesh(this.group, geometry('shadow', () => new THREE.PlaneGeometry(16, 11)), sm, 0, -3.1, 0); this.shadow.rotation.x = -Math.PI / 2; this.shadow.castShadow = this.shadow.receiveShadow = false; this.shadow.userData.moving = true;
    }
    buildWater() {
      const points = [[-5.35, .5], [-4, 1.45], [-1.8, 1.85], [.3, 2.02], [2.6, 1.68], [4.3, .95], [5.35, .35]];
      ribbon(this.group, points, 1.39, .094, M.path);
      this.river = ribbon(this.group, points, 1.13, .108, M.water).curve;
      ribbon(this.group, [[-5, -.1], [-3.2, .15], [-1.3, .3], [.7, .15], [2.7, -.1], [4.7, -1]], .39, .115, M.path);
      const rippleGroup = new THREE.Group(); rippleGroup.userData.moving = true; this.group.add(rippleGroup);
      for (let i = 0; i < 36; i++) {
        const p = this.river.getPoint((i + .4) / 37); p.z += range(-.38, .38);
        const line = box(rippleGroup, M.waterLine, range(.1, .45), .007, .018, p.x, .122, p.z);
        this.waterRipples.push({ object: line, phase: random() * TAU });
      }
      // Tiny Thames launch with a cream cabin and an unmistakably red funnel.
      const boat = new THREE.Group(); boat.position.set(-1.1, .17, 1.9); boat.rotation.y = -.12; this.group.add(boat);
      box(boat, M.white, .8, .14, .32, 0, .04, 0); box(boat, M.roofDark, .73, .025, .28, 0, .125, 0);
      box(boat, M.trim, .39, .19, .23, -.03, .21, 0); box(boat, M.blueGlass, .3, .075, .24, -.03, .23, 0); box(boat, M.red, .07, .16, .07, .21, .25, 0);
    }
    house(x, z, w, h, color, rotation = 0) {
      const g = new THREE.Group(); g.position.set(x, .12, z); g.rotation.y = rotation; this.group.add(g);
      box(g, color, w, h, .65, 0, h / 2, 0); box(g, M.trim, w + .06, .055, .7, 0, h * .49, 0);
      roof(g, M.roof, w + .12, .32, .79, 0, h, 0); box(g, M.stoneDark, .11, .27, .14, w * .27, h + .28, -.1);
      for (const wx of [-w * .25, w * .25]) for (const wy of [.3, .72]) {
        if (wy > h - .1) continue;
        box(g, M.trim, .18, .24, .035, wx, wy, .34); box(g, M.nightWindow, .11, .18, .04, wx, wy, .36);
        box(g, M.trim, .018, .19, .025, wx, wy, .385);
      }
      box(g, M.roofDark, .16, .28, .025, 0, .15, .35);
      box(g, M.snow, w + .12, .045, .79, 0, h + .08, 0);
    }
    buildVillage() {
      const row = [[-4,-2.0,.7,.95,M.brickPink],[-3.18,-2.6,.65,1.12,M.yellow],[-2.36,-2.95,.7,.95,M.lightStone],[-1.48,-3.18,.7,1.05,M.brick],[-.6,-3.23,.7,.85,M.yellow],[.3,-3.15,.72,1.0,M.brickPink],[1.2,-3.1,.68,.95,M.lightStone],[2.1,-2.75,.72,1.12,M.brick],[3,-2.2,.78,.98,M.yellow],[3.87,-1.7,.68,.83,M.lightStone]];
      row.forEach(([x,z,w,h,c]) => this.house(x,z,w,h,c,.08));
      this.house(-3.7, -.15, .66, .85, M.lightStone, -.08); this.house(-2.95, .05, .63, .95, M.brickPink, -.08);
      this.house(4.35, -.3, .62, .83, M.brickPink, -.45);
    }
    tree(x, z, size = 1, evergreen = false) {
      const g = new THREE.Group(); g.position.set(x, .12, z); g.scale.setScalar(size); this.group.add(g);
      cylinder(g, M.trunk, .055, .09, .8, 0, .4, 0, 7);
      if (evergreen) {
        cylinder(g, M.foliageDark, 0, .47, .85, 0, .85, 0, 7); cylinder(g, M.foliageDark, 0, .36, .75, 0, 1.2, 0, 7);
        cylinder(g, M.snow, 0, .37, .27, 0, 1.46, 0, 7);
      } else {
        ball(g, M.foliage, .52, -.16, .97, 0, 1, 1.05, 1); ball(g, M.foliageLight, .41, .2, 1.16, .05); ball(g, M.foliageDark, .4, .13, .88, -.2);
        ball(g, M.snow, .4, -.12, 1.25, 0, 1.2, .36, 1.1);
      }
    }
    buildGarden() {
      [[-4.8,-.85,.83],[-4.65,1.8,.8],[-3.8,2.4,.9],[-2.9,2.9,.65],[-1.9,3.28,.78],[-.8,3.5,.64],[.55,3.45,.64],[4.65,1.1,.75],[4.7,-1.2,.85],[3.75,-2.35,.8],[2.6,-3.05,.68],[-2.5,-3.35,.8],[-4.9,.3,.6]].forEach(([x,z,s], i) => this.tree(x,z,s,i % 4 === 0));
      for (let i = 0; i < 24; i++) {
        const angle = i / 24 * TAU;
        const x = Math.cos(angle) * 5.12, z = Math.sin(angle) * 3.52;
        ball(this.group, i % 2 ? M.foliage : M.foliageDark, range(.16,.26), x, .22, z, 1.3, .72, 1);
      }
      const flowerMat = material('#e9d3a2'), pinkMat = material('#d7a098');
      for (let i = 0; i < 60; i++) {
        const x = range(-4.5,4.5), z = range(2.7,3.45);
        ball(this.group, i % 3 ? flowerMat : pinkMat, .04, x, .16, z, 1,.6,1);
      }
      // A clipped garden and benches on the northern bank.
      box(this.group, M.foliageDark, 1.6, .18, .13, 1.7, .2, -2.35);
      for (const x of [-1.7, 1.1]) {
        box(this.group, M.trunk, .62,.065,.2, x,.32,.78); box(this.group,M.trunk,.62,.24,.045,x,.46,.85);
        for(const dx of [-.23,.23]) box(this.group,M.roofDark,.04,.23,.15,x+dx,.2,.79);
      }
    }
    buildDetails() {
      // Telephone box: crown, glazing, transom, and a tiny cream sign.
      const phone = new THREE.Group(); phone.position.set(-2.3,.12,.62); this.group.add(phone);
      box(phone,M.red,.27,.59,.27,0,.3,0); box(phone,M.redDark,.31,.055,.31,0,.6,0); roof(phone,M.red,.32,.07,.31,0,.625,0);
      box(phone,M.blueGlass,.19,.37,.015,0,.31,.145); box(phone,M.trim,.2,.055,.02,0,.55,.145);
      for (const x of [-.068,0,.068]) box(phone,M.red,.017,.4,.026,x,.31,.16);
      for (const y of [.18,.31,.44]) box(phone,M.red,.21,.016,.026,0,y,.16);
      // A double-decker bus remains a separate moving subtree.
      this.bus = new THREE.Group(); this.bus.userData.moving = true; this.group.add(this.bus); this.bus.position.set(-.9,.15,.22);
      box(this.bus,M.red,.95,.55,.36,0,.35,0); box(this.bus,M.redDark,1.0,.08,.38,0,.1,0);
      box(this.bus,M.white,.88,.035,.38,0,.38,0); box(this.bus,M.red,.87,.05,.33,0,.65,0);
      for(const x of [-.31,-.1,.11,.32]) for(const y of [.27,.51]) {
        box(this.bus,M.blueGlass,.15,.13,.37,x,y,0);
      }
      box(this.bus,M.blueGlass,.025,.2,.27,.49,.47,0); box(this.bus,M.trim,.025,.07,.18,.51,.19,0);
      for(const x of [-.31,.31]) for(const z of [-.19,.19]) {
        const wheel=cylinder(this.bus,M.black,.095,.095,.045,x,.1,z,10);wheel.rotation.x=Math.PI/2;
      }
      for (const [x,z] of [[-3.7,.9],[-.4,.85],[1.3,.7],[4.1,.45],[-3.6,-1.4],[2.8,-1.3]]) {
        cylinder(this.group,M.roofDark,.022,.035,.7,x,.47,z,6); box(this.group,M.roofDark,.11,.045,.11,x,.82,z);
        box(this.group,M.lamp,.075,.13,.075,x,.9,z); cylinder(this.group,M.roofDark,0,.09,.09,x,1.0,z,4);
      }
      // Postbox, little path stones, and river mooring posts.
      cylinder(this.group,M.red,.085,.085,.34,-1.9,.29,.6,10); ball(this.group,M.red,.09,-1.9,.47,.6,1,.5,1);
      for(let i=0;i<9;i++) box(this.group,M.trim,.18,.025,.11,-1.8+i*.25,.13,-.1);
      for(let i=0;i<7;i++) cylinder(this.group,M.trunk,.025,.03,.19,-4+i*1.3,.22,2.6,6);
    }
    buildClouds(scene) {
      const positions=[[-6.2,-.7,1.1,1], [5.4,-.5,-1.2,.95],[2.4,-1.5,4.8,.72],[-4.5,4.4,-5.6,.75],[4.8,5.2,-6,.8],[-7.2,2.1,-2,.5]];
      positions.forEach(([x,y,z,s],i)=>{
        const group=new THREE.Group(); group.position.set(x,y,z); group.scale.setScalar(s); scene.add(group);
        [[-.55,0,0,.7],[.12,.2,0,.85],[.8,-.02,.05,.59],[-.04,-.18,.15,.7]].forEach(([a,b,c,r])=>{
          const cloud=ball(group,M.cloud,r,a,b,c,1.25,.64,.75,true);cloud.castShadow=false;cloud.receiveShadow=false;
        });
        batchStatic(group); this.clouds.push({object:group,x,y,phase:i*1.7});
      });
    }
    update(time, weights) {
      this.group.position.y = Math.sin(time * .65) * (reducedMotion ? .025 : .1);
      this.group.rotation.z = Math.sin(time * .24) * (reducedMotion ? 0 : .005);
      this.bus.position.x = -.7 + Math.sin(time*.12)*1.05;
      this.waterRipples.forEach(({object,phase})=>{object.scale.x=.75+Math.sin(time*1.3+phase)*.25;});
      this.clouds.forEach(({object,x,y,phase})=>{object.position.x=x+Math.sin(time*.08+phase)*.24;object.position.y=y+Math.sin(time*.3+phase)*.09;});
      this.rocks.forEach(({object,y,phase})=>{object.position.y=y+Math.sin(time*.6+phase)*.08;object.rotation.y=time*.06+phase;});
      M.snow.opacity = weights[3] * .94;
    }
  }

  class BigBen {
    constructor(parent) {
      this.group = new THREE.Group(); this.group.position.set(.15,.13,-.65); parent.add(this.group); this.hands=[];
      this.buildPalace(); this.buildTower();
    }
    buildPalace() {
      const g=this.group;
      box(g,M.stone,2.65,.92,.95,1.6,.46,-.3); box(g,M.stoneDark,2.8,.13,1.02,1.6,.1,-.3);
      roof(g,M.roof,2.85,.45,1.09,1.6,.94,-.3);
      for(let i=0;i<8;i++) {
        const x=.5+i*.32;
        box(g,M.trim,.07,1.05,.08,x,.55,.21);box(g,M.window,.13,.47,.025,x+.13,.54,.19);
        cylinder(g,M.lightStone,0,.085,.23,x,1.22,.16,4);
        box(g,M.lightStone,.12,.16,.16,x,1.01,.18);
      }
      box(g,M.stone, .49,1.32,.54,2.98,.66,-.28);roof(g,M.roof,.62,.4,.66,2.98,1.32,-.28);
      for(const x of [2.75,3.2]) cylinder(g,M.trim,0,.08,.3,x,1.47,-.01,4);
    }
    buildTower() {
      const g=this.group;
      box(g,M.stoneDark,1.3,.2,1.3,0,.1,0);box(g,M.lightStone,1.12,.27,1.12,0,.33,0);
      box(g,M.stone,.91,3.15,.91,0,2.03,0);
      for(const x of [-.47,.47]) for(const z of [-.47,.47]) box(g,M.trim,.095,3.34,.095,x,2.06,z);
      for(const y of [.65,1.22,2.9,3.55]) box(g,M.lightStone,1.04,.09,1.04,0,y,0);
      for(let side=0;side<4;side++) {
        const face=new THREE.Group();face.rotation.y=side*Math.PI/2;g.add(face);
        for(const x of [-.27,0,.27]) {
          box(face,M.stoneDark,.13,1.56,.025,x,2.17,.463);box(face,M.window,.055,1.37,.03,x,2.2,.482);
          cylinder(face,M.lightStone,0,.09,.19,x,3.03,.465,4);
          box(face,M.window,.1,.45,.025,x,3.28,.464);
        }
      }
      box(g,M.stoneDark,1.19,.17,1.19,0,3.72,0); box(g,M.lightStone,1.16,1.03,1.16,0,4.29,0);
      box(g,M.trim,1.28,.1,1.28,0,3.84,0);box(g,M.trim,1.28,.13,1.28,0,4.83,0);
      // One locally drawn clock texture, reused on all four faces; no external assets.
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d'); ctx.fillStyle='#f9edcb';ctx.fillRect(0,0,256,256);
      ctx.strokeStyle='#a88b46';ctx.lineWidth=6;ctx.beginPath();ctx.arc(128,128,118,0,TAU);ctx.stroke();
      ctx.lineWidth=2;ctx.beginPath();ctx.arc(128,128,105,0,TAU);ctx.stroke();
      ctx.font='bold 24px Georgia';ctx.fillStyle='#3e5148';ctx.textAlign='center';ctx.textBaseline='middle';
      const roman=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
      for(let i=0;i<12;i++){const a=i/12*TAU;ctx.fillText(roman[i],128+Math.sin(a)*85,128-Math.cos(a)*85);}
      for(let i=0;i<60;i++){const a=i/60*TAU;ctx.strokeStyle='#9e8c59';ctx.lineWidth=i%5?1:3;ctx.beginPath();ctx.moveTo(128+Math.sin(a)*108,128-Math.cos(a)*108);ctx.lineTo(128+Math.sin(a)*114,128-Math.cos(a)*114);ctx.stroke();}
      this.clockTexture=new THREE.CanvasTexture(canvas);this.clockTexture.colorSpace=THREE.SRGBColorSpace;this.clockTexture.anisotropy=4;
      this.clockMaterial=new THREE.MeshStandardMaterial({map:this.clockTexture,roughness:.65,emissive:'#ffdb89',emissiveMap:this.clockTexture,emissiveIntensity:0});materials.add(this.clockMaterial);
      for(let i=0;i<4;i++) {
        const face=new THREE.Group();face.rotation.y=i*Math.PI/2;g.add(face);
        const disk=mesh(face,geometry('clockface',()=>new THREE.CircleGeometry(.405,48)),this.clockMaterial,0,4.31,.594);disk.castShadow=false;
        mesh(face,geometry('clockrim',()=>new THREE.TorusGeometry(.426,.022,6,48)),M.gold,0,4.31,.595);
        const hands=new THREE.Group();hands.position.set(0,4.31,.615);hands.userData.moving=true;face.add(hands);
        const hour=new THREE.Group(),minute=new THREE.Group();hands.add(hour,minute);
        box(hour,M.roofDark,.027,.2,.016,0,.083,0);box(minute,M.roofDark,.018,.29,.015,0,.12,.008);ball(hands,M.gold,.035,0,0,.02);
        this.hands.push({hour,minute});
        for(const x of [-.54,.54]) box(face,M.stoneDark,.075,.9,.035,x,4.3,.59);
        for(const x of [-.45,0,.45]) box(face,M.window,.12,.2,.025,x,5.03,.48);
      }
      box(g,M.stone,1.03,.37,1.03,0,5.07,0);box(g,M.trim,1.14,.08,1.14,0,5.29,0);
      for(const x of [-.51,.51]) for(const z of [-.51,.51]) {
        cylinder(g,M.lightStone,.052,.075,.55,x,5.25,z,6);cylinder(g,M.roof,0,.09,.28,x,5.66,z,6);
        ball(g,M.gold,.038,x,5.81,z);
      }
      const spire=cylinder(g,M.roofDark,.095,.76,1.25,0,5.93,0,4);spire.rotation.y=Math.PI/4;
      const band=cylinder(g,M.roofLight,.36,.43,.12,0,6.12,0,4);band.rotation.y=Math.PI/4;
      cylinder(g,M.roof,0,.18,.47,0,6.72,0,4).rotation.y=Math.PI/4;
      ball(g,M.gold,.075,0,6.99,0);cylinder(g,M.gold,.012,.02,.22,0,7.12,0,6);
    }
    update(hours,night) {
      for(const {hour,minute} of this.hands){hour.rotation.z=-(hours%12)/12*TAU;minute.rotation.z=-(hours%1)*TAU;}
      this.clockMaterial.emissiveIntensity=night*1.1;
    }
  }

  class LondonEye {
    constructor(parent) {
      this.group=new THREE.Group();this.group.position.set(-2.9,.13,-1.0);this.group.rotation.y=.28;parent.add(this.group);
      this.radius=1.64;this.height=2.08;this.angle=0;this.cabins=[];
      this.wheel=new THREE.Group();this.wheel.userData.moving=true;this.wheel.position.y=this.height;this.group.add(this.wheel);
      for(const z of [-.105,.105]) mesh(this.wheel,geometry('eye-rim',()=>new THREE.TorusGeometry(this.radius,.043,6,80)),M.white,0,0,z);
      for(let i=0;i<24;i++) {
        const a=i/24*TAU,x=Math.cos(a)*this.radius,y=Math.sin(a)*this.radius;
        beam(this.wheel,i%2?M.trim:M.white,[0,0,0],[x,y,i%2?.1:-.1],.012);
        ball(this.wheel,M.lamp,.038,x,y,.12);
      }
      ball(this.wheel,M.trim,.18,0,0,.08,1,1,.7);
      for(const x of [-.83,.83]) {
        box(this.group,M.stoneDark,.45,.13,.55,x,.07,.12);
        beam(this.group,M.white,[x,.13,.35],[0,this.height,.12],.075);beam(this.group,M.white,[x,.13,-.3],[0,this.height,-.14],.055);
      }
      for(let i=0;i<12;i++) {
        const cabin=new THREE.Group();cabin.userData.moving=true;this.group.add(cabin);
        ball(cabin,M.white,.19,0,-.08,0,1.1,.65,.85,true);box(cabin,M.blueGlass,.24,.19,.22,0,.01,0);box(cabin,M.white,.28,.035,.25,0,.11,0);
        box(cabin,M.white,.024,.2,.24,0,0,0);this.cabins.push(cabin);
      }
    }
    update(dt) {
      this.angle+=dt*.065;this.wheel.rotation.z=this.angle;
      this.cabins.forEach((c,i)=>{const a=i/12*TAU+this.angle;c.position.set(Math.cos(a)*this.radius,this.height+Math.sin(a)*this.radius,0);});
    }
  }

  class TowerBridge {
    constructor(parent) {
      const g=this.group=new THREE.Group();g.position.set(2.65,.14,1.66);g.rotation.y=.81;parent.add(g);
      box(g,M.stoneDark,4.15,.11,.65,0,.38,0);box(g,M.path,4.2,.035,.57,0,.46,0);
      for(const z of [-.31,.31]) {
        box(g,M.roofLight,4.2,.07,.045,0,.57,z);
        for(let i=0;i<19;i++) box(g,M.white,.02,.13,.02,-2.03+i*.225,.52,z);
      }
      for(const x of [-1.05,1.05]) this.tower(x);
      box(g,M.roofLight,2.15,.18,.12,0,1.91,-.25);box(g,M.roofLight,2.15,.18,.12,0,1.91,.25);
      roof(g,M.roof,2.15,.11,.7,0,2.02,0);
      for(const z of [-.32,.32]) {
        for(let i=0;i<8;i++){const x=-.97+i*.26;beam(g,M.white,[x,1.84,z],[x+.26,1.99,z],.016);beam(g,M.white,[x,1.99,z],[x+.26,1.84,z],.016);}
        const points=[[-2.1,.51,z],[-1.05,1.83,z],[0,.82,z],[1.05,1.83,z],[2.1,.51,z]].map(p=>new THREE.Vector3(...p));
        const curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',.15);
        mesh(g,geometry(`cable${z}`,()=>new THREE.TubeGeometry(curve,64,.027,5,false)),M.roofLight);
        for(let i=0;i<17;i++) {const p=curve.getPoint((i+.5)/17);if(Math.abs(p.x)>1.3||Math.abs(p.x)<.78)beam(g,M.white,[p.x,.49,z],[p.x,p.y,z],.012);}
      }
    }
    tower(x) {
      const g=this.group;
      box(g,M.stoneDark,.83,.23,.91,x,.25,0);box(g,M.lightStone,.65,1.5,.68,x,1.1,0);
      box(g,M.stone,.77,.11,.77,x,.7,0);box(g,M.trim,.77,.1,.77,x,1.72,0);
      for(const z of [-.35,.35]) {
        box(g,M.roofDark,.28,.5,.025,x,.77,z); // Dark arch recess below the upper chamber.
        for(const dx of [-.14,.14]){box(g,M.nightWindow,.13,.28,.027,x+dx,1.37,z);box(g,M.trim,.024,.28,.035,x+dx,1.37,z+.015);}
      }
      for(const dx of [-.33,.33]) for(const z of [-.34,.34]) {
        cylinder(g,M.stone,.075,.085,1.48,x+dx,1.19,z,7);cylinder(g,M.roof,0,.12,.38,x+dx,2.11,z,7);ball(g,M.lamp,.035,x+dx,2.33,z);
      }
      roof(g,M.roofLight,.75,.38,.78,x,1.84,0);box(g,M.trim,.67,.075,.72,x,1.88,0);
      cylinder(g,M.gold,.012,.018,.22,x,2.32,0,6);ball(g,M.gold,.04,x,2.46,0);
      box(g,M.snow,.74,.04,.75,x,1.96,0);
    }
  }

  class WeatherSystem {
    constructor(scene) {
      this.group=new THREE.Group();scene.add(this.group);this.dummy=new THREE.Object3D();
      this.leafCount=230;this.snowCount=720;this.leaves=[];
      const shape=new THREE.Shape();
      [[0,.52],[.1,.24],[.3,.35],[.25,.12],[.48,.07],[.19,-.12],[.23,-.31],[.035,-.25],[0,-.49],[-.035,-.25],[-.23,-.31],[-.19,-.12],[-.48,.07],[-.25,.12],[-.3,.35],[-.1,.24]].forEach((p,i)=>i?shape.lineTo(...p):shape.moveTo(...p));shape.closePath();
      const leafGeometry=new THREE.ShapeGeometry(shape);geometries.add(leafGeometry);
      this.leafMaterial=new THREE.MeshStandardMaterial({color:'#d4934c',roughness:.9,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});materials.add(this.leafMaterial);
      this.leafMesh=new THREE.InstancedMesh(leafGeometry,this.leafMaterial,this.leafCount);this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.leafMesh.frustumCulled=false;this.group.add(this.leafMesh);
      for(let i=0;i<this.leafCount;i++) {
        this.leaves.push({x:range(-8,8),y:range(-2,10),z:range(-5,5),speed:range(.45,1.05),phase:range(0,TAU),spin:range(.5,1.7),scale:range(.09,.19)});
        this.leafMesh.setColorAt(i,new THREE.Color().setHSL(range(.035,.13),range(.48,.7),range(.48,.65)));
      }
      this.positions=new Float32Array(this.snowCount*3);this.snowSpeed=new Float32Array(this.snowCount);
      for(let i=0;i<this.snowCount;i++){this.positions[i*3]=range(-8,8);this.positions[i*3+1]=range(-3,10);this.positions[i*3+2]=range(-6,6);this.snowSpeed[i]=range(.5,1.2);}
      const snowGeometry=new THREE.BufferGeometry();snowGeometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));geometries.add(snowGeometry);
      const sprite=document.createElement('canvas');sprite.width=sprite.height=32;const ctx=sprite.getContext('2d'),gradient=ctx.createRadialGradient(16,16,0,16,16,16);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.35,'rgba(255,255,255,.95)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
      this.snowTexture=new THREE.CanvasTexture(sprite);
      this.snowMaterial=new THREE.PointsMaterial({color:'#f9ffff',size:3.2,map:this.snowTexture,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});materials.add(this.snowMaterial);
      this.snow=new THREE.Points(snowGeometry,this.snowMaterial);this.group.add(this.snow);
      // Reuse twelve wide, feathered sprites for local spring mist instead of expensive volumes.
      const fogCanvas=document.createElement('canvas');fogCanvas.width=128;fogCanvas.height=128;const fc=fogCanvas.getContext('2d');const fg=fc.createRadialGradient(64,64,0,64,64,64);fg.addColorStop(0,'rgba(255,255,255,.55)');fg.addColorStop(.45,'rgba(255,255,255,.25)');fg.addColorStop(1,'rgba(255,255,255,0)');fc.fillStyle=fg;fc.fillRect(0,0,128,128);
      this.fogTexture=new THREE.CanvasTexture(fogCanvas);this.mists=[];
      for(let i=0;i<12;i++) {
        const fm=new THREE.SpriteMaterial({map:this.fogTexture,color:'#f2f3e6',transparent:true,opacity:0,depthWrite:false});materials.add(fm);
        const f=new THREE.Sprite(fm);f.position.set(range(-6,6),range(.1,1.8),range(-3,4));f.scale.set(range(5,8),range(1.2,2.4),1);this.group.add(f);this.mists.push({object:f,x:f.position.x,phase:range(0,TAU)});
      }
      this.activeParticles=0;
    }
    update(dt,time,weights) {
      const autumn=weights[2],winter=weights[3];
      this.leafMesh.visible=autumn>.005;this.leafMaterial.opacity=autumn*.95;
      // Fixed pools wrap back above the island. Drift uses multiple frequencies so flakes
      // and leaves do not move as a sheet; rotations continue independently of fall speed.
      if(this.leafMesh.visible) {
        for(let i=0;i<this.leafCount;i++) {
          const p=this.leaves[i];p.y-=dt*p.speed;p.x+=dt*(.13+Math.sin(time*.7+p.phase)*.13);
          if(p.y < -2.7){p.y=9.5;p.x=range(-7,7);}if(p.x>8)p.x=-8;
          this.dummy.position.set(p.x+Math.sin(time*1.25+p.phase)*.48,p.y,p.z+Math.cos(time*.7+p.phase)*.24);
          this.dummy.rotation.set(time*p.spin+p.phase,Math.sin(time+p.phase),time*.7+p.phase);this.dummy.scale.setScalar(p.scale);this.dummy.updateMatrix();this.leafMesh.setMatrixAt(i,this.dummy.matrix);
        }
        this.leafMesh.instanceMatrix.needsUpdate=true;
      }
      this.snow.visible=winter>.005;this.snowMaterial.opacity=winter*.9;
      if(this.snow.visible){
        for(let i=0;i<this.snowCount;i++) {
          const k=i*3;this.positions[k+1]-=dt*this.snowSpeed[i];this.positions[k]+=dt*(Math.sin(time*.55+i*.9)*.13+.07);
          if(this.positions[k+1]<-3){this.positions[k+1]=10;this.positions[k]=range(-8,8);}if(this.positions[k]>8)this.positions[k]=-8;
        }
        this.snow.geometry.attributes.position.needsUpdate=true;
      }
      for(const {object,x,phase} of this.mists){object.material.opacity=weights[0]*.25;object.visible=weights[0]>.005;object.position.x=x+Math.sin(time*.13+phase)*1.1;}
      this.activeParticles=Math.round(this.leafCount*autumn+this.snowCount*winter);
    }
  }

  class SeasonCycle {
    constructor(){this.current=1;this.elapsed=0;this.duration=24;this.auto=true;this.weights=[0,1,0,0];this.colors=SEASONS.map(s=>({grass:new THREE.Color(s.grass),foliage:new THREE.Color(s.foliage),sky:new THREE.Color(s.sky),glow:new THREE.Color(s.glow)}));this.grass=new THREE.Color();this.foliage=new THREE.Color();this.foliageHighlight=new THREE.Color('#e2d69f');this.sky=new THREE.Color();this.glow=new THREE.Color();this.uiDirty=true;}
    select(index){this.current=index;this.elapsed=0;this.uiDirty=true;}
    update(dt,timeDT=dt){
      if(this.auto){this.elapsed+=timeDT;if(this.elapsed>=this.duration){this.elapsed%=this.duration;this.current=(this.current+1)%4;this.uiDirty=true;}}
      // Exponential smoothing is frame-rate independent; all environment properties
      // share these four normalized weights, so manual and automatic changes both blend.
      const factor=1-Math.exp(-dt*.95);let total=0;
      for(let i=0;i<4;i++){this.weights[i]=lerp(this.weights[i],i===this.current?1:0,factor);total+=this.weights[i];}
      this.grass.setRGB(0,0,0);this.foliage.setRGB(0,0,0);this.sky.setRGB(0,0,0);this.glow.setRGB(0,0,0);
      for(let i=0;i<4;i++){const w=this.weights[i]/total;this.weights[i]=w;for(const key of ['grass','foliage','sky','glow']){this[key].r+=this.colors[i][key].r*w;this[key].g+=this.colors[i][key].g*w;this[key].b+=this.colors[i][key].b*w;}}
      M.grass.color.copy(this.grass);M.foliage.color.copy(this.foliage);M.foliageLight.color.copy(this.foliage).lerp(this.foliageHighlight,.25);M.foliageDark.color.copy(this.foliage).multiplyScalar(.76);
    }
  }

  class DayNightCycle {
    constructor(scene){
      this.phase=.23;this.duration=15;this.hours=12;this.lamps=0;this.day=1;
      this.ambient=new THREE.HemisphereLight('#fff4d7','#84927e',2.3);scene.add(this.ambient);
      this.sunLight=new THREE.DirectionalLight('#fff0c9',3.0);this.sunLight.position.set(-3,10,6);this.sunLight.castShadow=true;
      this.sunLight.shadow.mapSize.set(2048,2048);Object.assign(this.sunLight.shadow.camera,{left:-9,right:9,top:11,bottom:-7,near:.1,far:40});this.sunLight.shadow.normalBias=.04;this.sunLight.shadow.bias=-.0003;this.sunLight.shadow.radius=3;this.sunLight.target.position.set(0,1,0);scene.add(this.sunLight,this.sunLight.target);
      this.fill=new THREE.DirectionalLight('#d4ede8',1);this.fill.position.set(7,4,-6);scene.add(this.fill);
      this.landmarkLight=new THREE.PointLight('#ffc779',0,10,2);this.landmarkLight.position.set(.2,3.8,-.1);scene.add(this.landmarkLight);
      this.bridgeLight=new THREE.PointLight('#ffd18b',0,6,2);this.bridgeLight.position.set(2.7,2.4,2);scene.add(this.bridgeLight);
      this.sun=ball(scene,new THREE.MeshBasicMaterial({color:'#f4d28b'}),.56,-7,7,-6,1,1,1,true);materials.add(this.sun.material);this.sun.castShadow=false;
      const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;const ctx=glowCanvas.getContext('2d'),g=ctx.createRadialGradient(64,64,6,64,64,64);g.addColorStop(0,'rgba(255,216,128,.4)');g.addColorStop(.2,'rgba(255,220,155,.2)');g.addColorStop(1,'rgba(255,226,168,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
      this.glowTexture=new THREE.CanvasTexture(glowCanvas);const gm=new THREE.SpriteMaterial({map:this.glowTexture,transparent:true,depthWrite:false});materials.add(gm);this.sunGlow=new THREE.Sprite(gm);this.sunGlow.scale.set(4.5,4.5,1);scene.add(this.sunGlow);
      this.moon=ball(scene,new THREE.MeshBasicMaterial({color:'#ecf0da'}),.43,5,6,-6,1,1,1,true);materials.add(this.moon.material);this.moon.castShadow=false;
      const positions=new Float32Array(110*3);for(let i=0;i<110;i++){positions[i*3]=range(-23,23);positions[i*3+1]=range(4,16);positions[i*3+2]=range(-18,-7);}
      const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(positions,3));geometries.add(sg);this.starsMaterial=new THREE.PointsMaterial({color:'#f6edd0',size:1.7,transparent:true,opacity:0,depthWrite:false});materials.add(this.starsMaterial);scene.add(new THREE.Points(sg,this.starsMaterial));
      this.fog=new THREE.FogExp2('#e8ead9',.005);scene.fog=this.fog;
      this.sky=new THREE.Color();this.glow=new THREE.Color();this.nightSky=new THREE.Color('#263e50');this.nightGlow=new THREE.Color('#526666');this.duskSky=new THREE.Color('#c7b4a7');this.duskGlow=new THREE.Color('#f4ce9f');
      this.warm=new THREE.Color('#ffe0a2');this.sunWhite=new THREE.Color('#fff1d1');this.nightSun=new THREE.Color('#aac3de');this.skyWhite=new THREE.Color('#fff5de');this.nightAmbient=new THREE.Color('#9cb3c3');
      this.cssAccumulator=1;this.nightClass=false;this.windowDay=new THREE.Color('#839c84');this.windowNight=new THREE.Color('#b6aa75');
    }
    skip(){this.phase=(Math.floor(this.phase*4)+1)/4;if(this.phase>=1)this.phase=0;this.cssAccumulator=1;}
    update(dt,seasons){
      this.phase=(this.phase+dt/this.duration)%1;const angle=this.phase*TAU,elevation=Math.sin(angle);
      this.hours=(this.phase*24+6)%24;
      this.day=smooth(-.24,.32,elevation);const dusk=(1-smooth(0,.5,Math.abs(elevation)))*.75;
      this.sky.copy(seasons.sky).lerp(this.nightSky,1-this.day).lerp(this.duskSky,dusk*this.day);
      this.glow.copy(seasons.glow).lerp(this.nightGlow,1-this.day).lerp(this.duskGlow,dusk);
      this.ambient.intensity=lerp(.68,2.0,this.day);this.ambient.color.copy(this.nightAmbient).lerp(this.skyWhite,this.day);
      this.sunLight.intensity=lerp(.35,3.1,this.day)*(1-seasons.weights[0]*.22);this.sunLight.color.copy(this.nightSun).lerp(this.sunWhite,this.day).lerp(this.warm,dusk*.65);
      this.sunLight.position.set(-5+Math.cos(angle)*3,6+Math.max(0,elevation)*5,5+Math.sin(angle)*2);
      this.fill.intensity=lerp(.48,.85,this.day);
      // Dusk lights fade up; they fade out before sunrise, without a jump at phase 0.
      this.lamps=smooth(.425,.51,this.phase)*(1-smooth(.88,.965,this.phase));
      M.lamp.emissiveIntensity=this.lamps*2.1;M.nightWindow.emissiveIntensity=this.lamps*1.5;
      M.nightWindow.color.copy(this.windowNight).lerp(this.windowDay,this.day);
      this.landmarkLight.intensity=this.lamps*13;this.bridgeLight.intensity=this.lamps*8;
      this.sun.position.set(Math.cos(angle)*7,1+elevation*5,-5);this.sun.visible=elevation>-.15;this.sunGlow.position.copy(this.sun.position);this.sunGlow.material.opacity=this.day*.8;this.sunGlow.visible=this.sun.visible;
      this.moon.position.set(-Math.cos(angle)*7,1-elevation*5,-5);this.moon.visible=elevation<.1;
      this.starsMaterial.opacity=(1-this.day)*.78;
      let fogDensity=0;for(let i=0;i<4;i++)fogDensity+=SEASONS[i].fog*seasons.weights[i];this.fog.density=fogDensity;this.fog.color.copy(this.sky);
      this.cssAccumulator+=dt;
      if(this.cssAccumulator>.08){
        this.cssAccumulator=0;document.documentElement.style.setProperty('--sky',`#${this.sky.getHexString()}`);document.documentElement.style.setProperty('--glow',`#${this.glow.getHexString()}`);
        const h=Math.floor(this.hours),m=Math.floor((this.hours%1)*60);$('time-value').textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const label=elevation>.3?'Daylight':elevation<-.3?'Moonlight':Math.cos(angle)<0?'Golden hour':'First light';$('day-label').textContent=label;$('time-icon').setAttribute('href',this.day>.5?'#i-sun':'#i-moon');
        const isNight=this.day<.35;if(isNight!==this.nightClass){this.nightClass=isNight;document.body.classList.toggle('night',isNight);}
      }
    }
  }

  class CameraController {
    constructor(camera,element){
      this.camera=camera;this.element=element;this.yaw=.57;this.targetYaw=.57;this.elevation=.55;this.dragging=false;this.width=1;this.height=1;
      element.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;this.dragging=true;this.lastX=event.clientX;this.pointer=event.pointerId;element.setPointerCapture(event.pointerId);element.classList.add('dragging');element.focus({preventScroll:true});
      });
      element.addEventListener('pointermove',event=>{if(!this.dragging||event.pointerId!==this.pointer)return;this.targetYaw-=(event.clientX-this.lastX)*.006;this.lastX=event.clientX;});
      const release=()=>{this.dragging=false;element.classList.remove('dragging');};
      element.addEventListener('pointerup',release);element.addEventListener('pointercancel',release);element.addEventListener('lostpointercapture',release);
      element.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();this.targetYaw+=e.key==='ArrowLeft'?-.18:.18;}});
    }
    reset(){this.targetYaw=.57;}
    resize(w,h){
      this.width=w;this.height=h;const aspect=w/h;
      const compact=h<=450,phone=w<=700;
      const span=Math.max(compact?13.6:phone?13.6:13.35,(phone?12.9:14)/aspect);
      this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;this.camera.top=span/2;this.camera.bottom=-span/2;
      this.camera.setViewOffset(w,h,phone||compact?0:-w*.065,compact?-h*.015:-h*.025,w,h);this.camera.updateProjectionMatrix();
    }
    update(dt){
      this.yaw=lerp(this.yaw,this.targetYaw,1-Math.exp(-dt*8));
      const radius=24;this.camera.position.set(Math.sin(this.yaw)*Math.cos(this.elevation)*radius,Math.sin(this.elevation)*radius+1.9,Math.cos(this.yaw)*Math.cos(this.elevation)*radius);this.camera.lookAt(0,1.9,0);
    }
  }

  class AmbientSound {
    constructor(){this.on=false;this.context=null;}
    async toggle(){
      if(!this.context){
        const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;this.context=new AC();
        const buffer=this.context.createBuffer(1,this.context.sampleRate*3,this.context.sampleRate),data=buffer.getChannelData(0);let last=0;
        for(let i=0;i<data.length;i++){const white=Math.random()*2-1;last=(last+.018*white)/1.018;data[i]=last*3.5;}
        const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=550;
        this.gain=this.context.createGain();this.gain.gain.value=0;source.connect(filter).connect(this.gain).connect(this.context.destination);source.start();
      }
      await this.context.resume();this.on=!this.on;this.gain.gain.setTargetAtTime(this.on?.075:0,this.context.currentTime,.6);return this.on;
    }
    update(day,weights){if(this.context&&this.on)this.gain.gain.setTargetAtTime(.035+weights[0]*.04+weights[2]*.035+day*.012,this.context.currentTime,1.5);}
  }

  class App {
    constructor(){
      this.element=$('scene');this.scene=new THREE.Scene();
      try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch(error){loading.textContent='This little world needs a browser with WebGL enabled.';console.error(error);return;}
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.16;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.setClearColor(0x000000,0);this.element.appendChild(this.renderer.domElement);
      this.camera=new THREE.OrthographicCamera(-10,10,7,-7,.1,100);this.controls=new CameraController(this.camera,this.element);
      this.seasons=new SeasonCycle();this.dayNight=new DayNightCycle(this.scene);this.island=new Island(this.scene);
      this.bigBen=new BigBen(this.island.group);this.eye=new LondonEye(this.island.group);this.bridge=new TowerBridge(this.island.group);batchStatic(this.island.group);
      this.weather=new WeatherSystem(this.scene);this.sound=new AmbientSound();this.elapsed=0;this.paused=false;this.running=true;this.debug=false;this.uiAccumulator=0;this.frames=0;this.fpsTime=0;this.fps=60;
      this.bindUI();this.resize();window.addEventListener('resize',()=>this.resize());this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.element);
      this.lastTime=performance.now();this.animate=this.animate.bind(this);this.raf=requestAnimationFrame(this.animate);
      document.addEventListener('visibilitychange',()=>{
        // Never accumulate hidden-tab time, so returning cannot jump a season or explode dt.
        if(document.hidden){cancelAnimationFrame(this.raf);this.running=false;if(this.sound.context)this.sound.context.suspend();}
        else if(!this.running){this.running=true;this.lastTime=performance.now();this.raf=requestAnimationFrame(this.animate);if(this.sound.context&&this.sound.on)this.sound.context.resume().catch(()=>{});}
      });
      this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(this.raf);this.running=false;loading.classList.remove('loaded');loading.textContent='The little world is resting. Waiting for graphics to recover…';});
      this.renderer.domElement.addEventListener('webglcontextrestored',()=>{loading.classList.add('loaded');if(!this.running){this.running=true;this.lastTime=performance.now();this.raf=requestAnimationFrame(this.animate);}});
      window.addEventListener('pagehide',e=>{if(!e.persisted)this.dispose();});
      loading.classList.add('loaded');
    }
    bindUI(){
      this.seasonButtons=Array.from(document.querySelectorAll('[data-season]'));
      this.seasonButtons.forEach(button=>button.addEventListener('click',()=>this.seasons.select(Number(button.dataset.season))));
      $('auto-button').addEventListener('click',()=>{this.seasons.auto=!this.seasons.auto;$('auto-button').setAttribute('aria-pressed',String(this.seasons.auto));});
      $('pause-button').addEventListener('click',()=>{this.paused=!this.paused;$('pause-button').setAttribute('aria-pressed',String(this.paused));$('pause-button').setAttribute('aria-label',this.paused?'Resume time':'Pause time');$('pause-button').title=this.paused?'Resume time (Space)':'Pause time (Space)';$('pause-icon').setAttribute('href',this.paused?'#i-play':'#i-pause');});
      $('time-button').addEventListener('click',()=>this.dayNight.skip());$('reset-button').addEventListener('click',()=>this.controls.reset());
      const dialog=$('about-dialog');$('info-button').addEventListener('click',()=>dialog.showModal());$('close-dialog').addEventListener('click',()=>dialog.close());$('back-button').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
      $('sound-button').addEventListener('click',async()=>{try{const on=await this.sound.toggle();$('sound-button').setAttribute('aria-pressed',String(!!on));$('sound-button').setAttribute('aria-label',on?'Turn ambient sound off':'Turn ambient sound on');$('sound-button').title=on?'Turn ambient sound off':'Turn ambient sound on';document.querySelector('#sound-button use').setAttribute('href',on?'#i-sound':'#i-mute');}catch(e){$('sound-button').title='Ambient sound is unavailable in this browser';}});
      window.addEventListener('keydown',e=>{
        if(e.altKey||e.ctrlKey||e.metaKey||dialog.open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
        if(['1','2','3','4'].includes(e.key))this.seasons.select(Number(e.key)-1);
        else if(e.code==='Space'&&e.target.tagName!=='BUTTON'&&e.target.tagName!=='A'){e.preventDefault();$('pause-button').click();}
        else if(e.key.toLowerCase()==='a')$('auto-button').click();
        else if(e.key.toLowerCase()==='d')this.dayNight.skip();
        else if(e.key.toLowerCase()==='r')this.controls.reset();
        else if(e.key.toLowerCase()==='f'){this.debug=!this.debug;$('debug').hidden=!this.debug;}
      });
    }
    resize(){
      const w=this.element.clientWidth,h=this.element.clientHeight;if(!w||!h)return;
      this.renderer.setSize(w,h);this.controls.resize(w,h);
      // Small iframe cards cap pixel ratio to keep fill-rate and canvas memory bounded.
      const compact=w<600||h<400;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,compact?1.5:2));
    }
    updateUI(dt){
      if(this.seasons.uiDirty){
        this.seasons.uiDirty=false;const s=SEASONS[this.seasons.current];
        $('forecast-icon').setAttribute('href',`#i-${s.icon}`);$('temperature').innerHTML=`${s.temperature}<span>°</span>`;$('season-greeting').textContent=s.greeting;$('season-description').innerHTML=s.description;$('weather-label').textContent=s.label;
        this.seasonButtons.forEach((button,i)=>{const active=i===this.seasons.current;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
      }
      this.uiAccumulator+=dt;if(this.uiAccumulator>.15){this.uiAccumulator=0;document.documentElement.style.setProperty('--season-progress',this.seasons.auto?String(this.seasons.elapsed/this.seasons.duration):'0');if(this.debug)$('debug').textContent=`${this.fps} fps · ${this.renderer.info.render.calls} draws\n${this.weather.activeParticles} particles · ${this.renderer.info.memory.geometries} geometries`;}
    }
    animate(now){
      if(!this.running)return;
      // Clamp a stalled frame, but use elapsed seconds for all motion and simulation.
      const frameDT=Math.max(0,(now-this.lastTime)/1000);const dt=Math.min(frameDT,.05);this.lastTime=now;const cycleDT=this.paused?0:frameDT;this.elapsed+=dt;
      this.seasons.update(dt,cycleDT);this.dayNight.update(cycleDT,this.seasons);this.island.update(this.elapsed,this.seasons.weights);this.bigBen.update(this.dayNight.hours,this.dayNight.lamps);this.eye.update(dt);this.weather.update(dt,this.elapsed,this.seasons.weights);this.controls.update(dt);this.sound.update(this.dayNight.day,this.seasons.weights);this.updateUI(dt);
      this.renderer.render(this.scene,this.camera);
      this.frames++;this.fpsTime+=frameDT;if(this.fpsTime>=1){this.fps=Math.round(this.frames/this.fpsTime);this.frames=0;this.fpsTime=0;}
      this.raf=requestAnimationFrame(this.animate);
    }
    dispose(){
      this.running=false;cancelAnimationFrame(this.raf);this.observer.disconnect();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
      [this.island.shadowTexture,this.bigBen.clockTexture,this.weather.snowTexture,this.weather.fogTexture,this.dayNight.glowTexture].forEach(t=>t.dispose());if(this.dayNight.sunLight.shadow.map)this.dayNight.sunLight.shadow.map.dispose();this.renderer.dispose();if(this.sound.context)this.sound.context.close();
    }
  }

  try { new App(); } catch(error) { loading.classList.remove('loaded');loading.textContent='The little world could not start. Please refresh to try again.';console.error(error); }
})();
