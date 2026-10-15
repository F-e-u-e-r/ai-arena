/* Floating Tokyo — procedural Three.js diorama. No textures or model files. */
(() => {
  'use strict';

  const THREE = window.THREE;
  const loading = document.getElementById('loading');
  if (!THREE) {
    loading.textContent = 'Three.js could not load. Please connect to the internet and refresh.';
    return;
  }

  const TAU = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const palette = {
    grass: '#92bd81', grassLight: '#b9d595', moss: '#729b74',
    soil: '#cc9c74', soilDark: '#8e6371', soilDeep: '#6a5c78',
    vermilion: '#ed634d', redDark: '#b84648', cream: '#fff1d6',
    ink: '#324960', roof: '#334e69', gold: '#f5bf68',
    water: '#72c8cc', leafRed: '#d94e49', leafOrange: '#ec8050',
    leafGold: '#f5b969', leafRose: '#df6f70'
  };

  const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, ...extra });
  const mat = {
    grass: toon(palette.grass, { side: THREE.DoubleSide }),
    grassLight: toon(palette.grassLight), moss: toon(palette.moss),
    cream: toon(palette.cream), red: toon(palette.vermilion),
    redDark: toon(palette.redDark), ink: toon(palette.ink),
    roof: toon(palette.roof, { side: THREE.DoubleSide }),
    gold: toon(palette.gold), water: toon(palette.water, { transparent: true, opacity: .88 }),
    trunk: toon('#795b5c'), paleStone: toon('#e5d3b2'),
    stone: toon('#a0a9a0'), soilDeep: toon(palette.soilDeep), snow: toon('#f4f3e4'),
    mountain: toon('#7894a6', { flatShading: true }),
    lanternGlass: new THREE.MeshStandardMaterial({ color: '#ffe9bc', emissive: '#ffb55f', emissiveIntensity: 0, roughness: .75 }),
    window: new THREE.MeshStandardMaterial({ color: '#ffe8b4', emissive: '#ff9a50', emissiveIntensity: 0, roughness: .65 })
  };

  function box(parent, width, height, depth, x, y, z, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function cylinder(parent, top, bottom, height, x, y, z, material, sides = 10, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function beam(parent, start, end, radius, material, sides = 6, shadow = true) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), sides), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    mesh.castShadow = shadow;
    parent.add(mesh);
    return mesh;
  }

  function taperedRoof(parent, width, depth, y, color = mat.roof) {
    // A low, four-sided hip roof with raised corners gives the pagoda its silhouette.
    const w = width / 2;
    const d = depth / 2;
    const vertices = [
      0, y + .43, 0,  -w, y + .09, -d,  w, y + .09, -d,
      0, y + .43, 0,   w, y + .09, -d,  w, y + .09, d,
      0, y + .43, 0,   w, y + .09, d, -w, y + .09, d,
      0, y + .43, 0,  -w, y + .09, d, -w, y + .09, -d
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const roof = new THREE.Mesh(geometry, color);
    roof.castShadow = true;
    roof.receiveShadow = true;
    parent.add(roof);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.085, 6, 4), mat.gold);
      tip.position.set(sx * w, y + .12, sz * d);
      parent.add(tip);
    }
    return roof;
  }

  class Island {
    constructor() {
      this.group = new THREE.Group();
      this.lights = [];
      this.luminousMaterials = [mat.window, mat.lanternGlass];
      this.makeLand();
      this.makePaths();
      this.makeGarden();
      this.tower = new TokyoTower(this.group, this.lights);
      this.fuji = new Fuji(this.group, this.lights);
      this.torii = new Torii(this.group, this.lights);
      this.pagoda = new Pagoda(this.group, this.lights);
    }

    ringPoint(angle, scale, y) {
      const ripple = 1 + .052 * Math.sin(angle * 5 + .4) + .029 * Math.cos(angle * 9 - .6);
      return [Math.cos(angle) * 6.8 * ripple * scale, y, Math.sin(angle) * 4.9 * ripple * scale];
    }

    makeLand() {
      const N = 36;
      const topPositions = [];
      for (let i = 0; i < N; i++) {
        const a = i / N * TAU;
        const b = (i + 1) / N * TAU;
        topPositions.push(0, .055, 0, ...this.ringPoint(b, 1, -.025), ...this.ringPoint(a, 1, -.025));
      }
      const topGeometry = new THREE.BufferGeometry();
      topGeometry.setAttribute('position', new THREE.Float32BufferAttribute(topPositions, 3));
      topGeometry.computeVertexNormals();
      const top = new THREE.Mesh(topGeometry, mat.grass);
      top.receiveShadow = true;
      this.group.add(top);

      const bands = [
        { a: -.025, b: -.30, ra: 1, rb: .995, colors: ['#c1d996', '#a9c98a', '#b4d390'] },
        { a: -.30, b: -.76, ra: .995, rb: .94, colors: ['#e1bc88', '#d4a67e', '#c89475'] },
        { a: -.76, b: -1.48, ra: .94, rb: .72, colors: ['#ca9476', '#bb816e', '#ad786d'] },
        { a: -1.48, b: -2.36, ra: .72, rb: .38, colors: ['#a67570', '#966d76', '#866777'] },
        { a: -2.36, b: -3.48, ra: .38, rb: .02, colors: ['#746478', '#806878', '#645d77'] }
      ];
      for (const band of bands) {
        const positions = [];
        const colors = [];
        for (let i = 0; i < N; i++) {
          const a = i / N * TAU;
          const b = (i + 1) / N * TAU;
          const p1 = this.ringPoint(a, band.ra, band.a);
          const p2 = this.ringPoint(b, band.ra, band.a);
          const p3 = this.ringPoint(a, band.rb, band.b);
          const p4 = this.ringPoint(b, band.rb, band.b);
          positions.push(...p1, ...p2, ...p3, ...p2, ...p4, ...p3);
          const c = new THREE.Color(band.colors[i % band.colors.length]);
          for (let v = 0; v < 6; v++) colors.push(c.r, c.g, c.b);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }

      // A few exposed rocks continue the pointed island shape below the soil bands.
      const shards = [[-2.4,-1.9,-.2,.65], [2.9,-1.35,-.9,.5], [.8,-2.5,1.0,.43]];
      for (const [x, y, z, s] of shards) {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat.soilDeep);
        rock.position.set(x, y, z);
        rock.scale.set(1.1, 1.7, .7);
        rock.rotation.z = .25;
        rock.castShadow = true;
        this.group.add(rock);
      }
    }

    makePaths() {
      const trail = [
        [-4.65,2.2], [-4.2,1.65], [-3.55,1.28], [-2.8,.82], [-2.0,.65],
        [-1.15,.74], [-.42,1.12], [.45,1.62], [1.3,1.65], [2.15,1.32],
        [2.9,.74], [3.35,.06]
      ];
      trail.forEach(([x,z], i) => {
        const stone = cylinder(this.group, .33 + (i % 3) * .035, .35, .055, x, .092, z, mat.paleStone, 7, false);
        stone.scale.z = .72;
        stone.rotation.y = i * 1.13;
      });

      // Turquoise pond and an ochre rim add a second focal point in the foreground.
      const rim = cylinder(this.group, 1.18, 1.23, .075, 3.58, .085, 2.73, mat.paleStone, 20, false);
      rim.scale.z = .66;
      const pond = cylinder(this.group, 1.07, 1.07, .038, 3.58, .135, 2.73, mat.water, 24, false);
      pond.scale.z = .61;
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(.47, .022, 4, 28), toon('#e9fff2'));
      ripple.rotation.x = Math.PI / 2;
      ripple.scale.z = .67;
      ripple.position.set(3.65, .163, 2.72);
      this.group.add(ripple);
    }

    makeGarden() {
      const treeData = [
        [5.22,1.2,1.26], [-5.25,-.55,.95], [1.72,-2.55,.78],
        [-1.28,-2.92,.78], [5.17,-1.75,.72]
      ];
      treeData.forEach((entry, i) => this.makeMapleTree(...entry, i));

      // Low faceted shrubs and blades give the grass texture without a texture file.
      const shrubs = [[-5.5,1.18],[-2.35,-2.25],[-.5,-3.18],[2.1,3.35],[5.6,-.58],[-5.95,-1.42],[.65,-2.83]];
      for (let i = 0; i < shrubs.length; i++) {
        const [x,z] = shrubs[i];
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(.28 + .055 * (i%3), 0), i%2 ? mat.moss : mat.grassLight);
        bush.position.set(x, .27, z);
        bush.scale.y = .65;
        bush.castShadow = true;
        this.group.add(bush);
      }
      for (let i = 0; i < 48; i++) {
        const a = i * 2.39996;
        const r = .38 + .56 * ((i * .618033) % 1);
        const x = 6.4 * r * Math.cos(a), z = 4.55 * r * Math.sin(a);
        // Keep grass tufts away from the buildings and pond.
        if ((Math.abs(x) < 1.5 && Math.abs(z) < 1.5) || (x > 2.35 && z > 1.9)) continue;
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(.055, .22, 3), i%3 ? mat.moss : mat.grassLight);
        tuft.position.set(x, .17, z);
        tuft.rotation.z = .12 * Math.sin(i * 3);
        this.group.add(tuft);
      }

      // Small paper lanterns guide the path after sundown.
      [[-2.9,1.42],[1.9,1.98],[4.55,3.12]].forEach(([x,z]) => {
        cylinder(this.group, .055, .07, .55, x, .35, z, mat.ink, 6, false);
        box(this.group, .22, .23, .22, x, .69, z, mat.lanternGlass, false);
        box(this.group, .30, .055, .30, x, .84, z, mat.roof, false);
        const light = new THREE.PointLight('#ffae66', 0, 3.6, 2);
        light.position.set(x, .78, z);
        this.group.add(light);
        this.lights.push({ light, max: .68 });
      });
    }

    makeMapleTree(x, z, scale, variant) {
      const tree = new THREE.Group();
      tree.position.set(x, .07, z);
      tree.scale.setScalar(scale);
      this.group.add(tree);
      beam(tree, [0,0,0], [.08,1.23,0], .105, mat.trunk, 6);
      beam(tree, [.04,.68,0], [-.37,1.43,.10], .055, mat.trunk, 5);
      beam(tree, [.07,.83,0], [.44,1.55,-.12], .06, mat.trunk, 5);
      const crowns = [
        [0,1.55,0,.58],[-.46,1.45,.06,.45],[.45,1.54,-.12,.48],
        [-.22,1.91,-.16,.39],[.19,1.97,.11,.37],[.08,1.42,.44,.37]
      ];
      const foliage = [toon('#d9584c'), toon('#eb7652'), toon('#f2a15b'), toon('#dc6656')];
      crowns.forEach(([cx,cy,cz,r], i) => {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), foliage[(i + variant)%foliage.length]);
        crown.position.set(cx,cy,cz);
        crown.scale.y = .83;
        crown.castShadow = true;
        crown.receiveShadow = true;
        tree.add(crown);
      });
    }

    update(elapsed) {
      this.group.position.y = .19 * Math.sin(elapsed * .72);
      this.group.rotation.z = .009 * Math.sin(elapsed * .51);
    }
  }

  class TokyoTower {
    constructor(parent, lights) {
      this.group = new THREE.Group();
      this.group.position.set(.13, .08, -.26);
      parent.add(this.group);
      const g = this.group;
      cylinder(g, 1.43, 1.48, .18, 0, .11, 0, mat.paleStone, 8);
      cylinder(g, 1.22, 1.31, .08, 0, .24, 0, mat.ink, 8);

      const levels = [
        { y: .29, s: 1.02 }, { y: 1.58, s: .78 },
        { y: 2.95, s: .49 }, { y: 4.65, s: .20 }
      ];
      for (let j = 0; j < levels.length - 1; j++) {
        const lower = levels[j], upper = levels[j+1];
        const legMaterial = j === 1 ? mat.cream : mat.red;
        for (const sx of [-1,1]) for (const sz of [-1,1]) {
          beam(g, [sx*lower.s,lower.y,sz*lower.s], [sx*upper.s,upper.y,sz*upper.s], .095 - j*.014, legMaterial, 7);
        }
        // Cross-bracing on all four faces makes the open frame read as Tokyo Tower.
        for (const side of [-1,1]) {
          beam(g, [-lower.s,lower.y,side*lower.s], [upper.s,upper.y,side*upper.s], .039, mat.redDark, 5, false);
          beam(g, [lower.s,lower.y,side*lower.s], [-upper.s,upper.y,side*upper.s], .039, mat.redDark, 5, false);
          beam(g, [side*lower.s,lower.y,-lower.s], [side*upper.s,upper.y,upper.s], .039, mat.redDark, 5, false);
          beam(g, [side*lower.s,lower.y,lower.s], [side*upper.s,upper.y,-upper.s], .039, mat.redDark, 5, false);
        }
        const braceY = lower.y + .62 * (upper.y-lower.y);
        const braceS = lower.s + .62*(upper.s-lower.s);
        box(g, braceS*2+.08, .075, .075, 0, braceY, braceS, mat.red, false);
        box(g, braceS*2+.08, .075, .075, 0, braceY, -braceS, mat.red, false);
        box(g, .075, .075, braceS*2+.08, braceS, braceY, 0, mat.red, false);
        box(g, .075, .075, braceS*2+.08, -braceS, braceY, 0, mat.red, false);
      }

      // Main observation deck: warm windows are driven by the shared night material.
      box(g, 1.72, .19, 1.72, 0, 2.83, 0, mat.red);
      box(g, 1.53, .42, 1.53, 0, 3.13, 0, mat.cream);
      box(g, 1.78, .13, 1.78, 0, 3.40, 0, mat.red);
      box(g, 1.88, .055, 1.88, 0, 3.49, 0, mat.cream, false);
      for (const side of [-1,1]) {
        for (const x of [-.49,0,.49]) {
          box(g, .29, .23, .035, x, 3.13, side*.785, mat.window, false);
          box(g, .035, .23, .29, side*.785, 3.13, x, mat.window, false);
        }
      }

      box(g, .97, .13, .97, 0, 4.69, 0, mat.red);
      box(g, .82, .31, .82, 0, 4.92, 0, mat.cream);
      box(g, 1.02, .10, 1.02, 0, 5.12, 0, mat.red);
      for (const s of [-1,1]) {
        box(g, .43, .17, .026, 0, 4.92, s*.425, mat.window, false);
        box(g, .026, .17, .43, s*.425, 4.92, 0, mat.window, false);
      }
      cylinder(g, .24, .32, .45, 0, 5.39, 0, mat.cream, 8);
      cylinder(g, .165, .22, .65, 0, 5.93, 0, mat.red, 8);
      cylinder(g, .12, .16, .44, 0, 6.46, 0, mat.cream, 8);
      cylinder(g, .085, .12, .41, 0, 6.88, 0, mat.red, 8);
      cylinder(g, .025, .06, .38, 0, 7.27, 0, mat.ink, 6, false);
      for (const y of [5.65,6.25,6.65]) {
        cylinder(g, .31, .31, .035, 0, y, 0, mat.redDark, 8, false);
      }
      const beacon = new THREE.PointLight('#ff9966', 0, 6, 2);
      beacon.position.set(0, 3.15, 0);
      g.add(beacon);
      lights.push({ light: beacon, max: 1.55 });
    }
  }

  class Fuji {
    constructor(parent, lights) {
      const g = new THREE.Group();
      g.position.set(-3.96, .075, -1.67);
      parent.add(g);
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(1.68, 2.75, 9), mat.mountain);
      mountain.position.y = 1.38;
      mountain.rotation.y = .20;
      mountain.castShadow = true;
      mountain.receiveShadow = true;
      g.add(mountain);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(.60, .88, 9), mat.snow);
      snow.position.y = 2.36;
      snow.rotation.y = .20;
      snow.castShadow = true;
      g.add(snow);
      for (let i = 0; i < 4; i++) {
        const a = i * TAU/4 + .5;
        const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(.24 + .06*(i%2), 0), mat.stone);
        boulder.position.set(Math.cos(a)*1.35,.20,Math.sin(a)*1.1);
        boulder.scale.y = .55;
        g.add(boulder);
      }
      // A lit trail shrine at Mount Fuji's foot makes this landmark glow at night.
      this.addLantern(g, -1.20, .58, 1.22, lights);
    }

    addLantern(g, x, y, z, lights) {
      cylinder(g, .045,.055,.38,x,y-.22,z,mat.ink,6,false);
      box(g,.24,.29,.24,x,y+.10,z,mat.lanternGlass,false);
      taperedRoof(g,.39,.39,y+.26);
      const light = new THREE.PointLight('#ffad65', 0, 3, 2);
      light.position.set(x,y+.18,z);
      g.add(light);
      lights.push({ light, max: .70 });
    }
  }

  class Torii {
    constructor(parent, lights) {
      const g = new THREE.Group();
      g.position.set(-3.91, .06, 2.24);
      g.rotation.y = -.10;
      parent.add(g);
      for (const x of [-.88,.88]) {
        cylinder(g,.11,.135,1.76,x,.88,0,mat.red,8);
        cylinder(g,.21,.21,.10,x,.09,0,mat.ink,8);
      }
      box(g,2.18,.15,.24,0,1.17,0,mat.redDark);
      box(g,2.62,.19,.31,0,1.85,0,mat.ink);
      box(g,2.48,.095,.35,0,2.00,0,mat.red);
      for (const side of [-1,1]) {
        const cap = box(g,.55,.12,.35,side*1.43,2.00,0,mat.red);
        cap.rotation.z = side*.18;
      }
      box(g,.24,.31,.045,0,1.48,.16,mat.gold,false);
      for (const x of [-1.19,1.19]) {
        box(g,.22,.29,.22,x,.53,.19,mat.lanternGlass,false);
        box(g,.28,.05,.28,x,.71,.19,mat.ink,false);
        const light = new THREE.PointLight('#ffaf69',0,2.7,2);
        light.position.set(x,.58,.2);
        g.add(light);
        lights.push({ light, max:.58 });
      }
    }
  }

  class Pagoda {
    constructor(parent, lights) {
      const g = new THREE.Group();
      g.position.set(3.36, .12, -1.26);
      g.rotation.y = -.29;
      parent.add(g);
      cylinder(g,1.27,1.35,.13,0,.08,0,mat.paleStone,8);
      const levels = [
        { y:.28, width:1.65, height:.70 },
        { y:1.19, width:1.26, height:.61 },
        { y:2.00, width:.91, height:.51 }
      ];
      levels.forEach((level, i) => {
        const {y,width,height} = level;
        box(g,width*.78,height,width*.78,0,y+height/2,0,mat.cream);
        for (const sx of [-1,1]) for (const sz of [-1,1]) {
          box(g,.10,height,.10,sx*width*.39,y+height/2,sz*width*.39,mat.red);
        }
        for (const s of [-1,1]) {
          box(g,width*.30,height*.39,.029,0,y+height*.55,s*width*.397,mat.window,false);
          box(g,.029,height*.39,width*.30,s*width*.397,y+height*.55,0,mat.window,false);
        }
        box(g,width*.88,.09,width*.88,0,y-.015,0,mat.redDark);
        taperedRoof(g,width+(.75-i*.11),width+(.75-i*.11),y+height-.06);
      });
      cylinder(g,.105,.19,.34,0,2.99,0,mat.gold,8);
      cylinder(g,.025,.065,.31,0,3.31,0,mat.ink,6,false);
      const light = new THREE.PointLight('#ffbd6d',0,5,2);
      light.position.set(0,1.46,.8);
      g.add(light);
      lights.push({ light, max: 1.0 });
    }
  }

  class MapleLeafSystem {
    constructor(scene, count = 132) {
      this.scene = scene;
      this.count = count;
      this.elapsed = 0;
      this.dummy = new THREE.Object3D();
      this.leaves = [];
      this.meshes = [];
      const shape = new THREE.Shape();
      const p = [
        [0,1.13],[.14,.54],[.47,.85],[.42,.39],[.91,.49],[.59,.12],
        [.79,-.23],[.30,-.11],[.11,-.46],[.06,-.84],[-.06,-.84],[-.11,-.46],
        [-.30,-.11],[-.79,-.23],[-.59,.12],[-.91,.49],[-.42,.39],[-.47,.85],[-.14,.54]
      ];
      shape.moveTo(...p[0]);
      for (let i = 1; i < p.length; i++) shape.lineTo(...p[i]);
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.computeVertexNormals();
      const colors = [palette.leafRed, palette.leafOrange, palette.leafGold, palette.leafRose];
      for (let group = 0; group < colors.length; group++) {
        const groupCount = Math.ceil((count-group)/colors.length);
        const mesh = new THREE.InstancedMesh(geometry, toon(colors[group], { side: THREE.DoubleSide }), groupCount);
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = false;
        scene.add(mesh);
        this.meshes.push(mesh);
        const list = [];
        for (let i = 0; i < groupCount; i++) list.push(this.newLeaf(true));
        this.leaves.push(list);
      }
      this.update(0);
    }

    newLeaf(scattered = false) {
      const leaf = {};
      this.resetLeaf(leaf,scattered);
      return leaf;
    }

    resetLeaf(leaf,scattered = false) {
      leaf.x = (Math.random()-.5)*17.5;
      leaf.z = (Math.random()-.5)*12.5;
      leaf.y = scattered ? -2.8 + Math.random()*12 : 7.2 + Math.random()*3.6;
      leaf.size = .12 + Math.random()*.13;
      leaf.speed = .68 + Math.random()*.88;
      leaf.phase = Math.random()*TAU;
      leaf.roll = Math.random()*TAU;
      leaf.spin = (Math.random()-.5)*2.3;
      leaf.sway = .30 + Math.random()*.55;
    }

    update(dt) {
      this.elapsed += dt;
      const d = this.dummy;
      for (let group = 0; group < this.meshes.length; group++) {
        const mesh = this.meshes[group];
        const list = this.leaves[group];
        for (let i = 0; i < list.length; i++) {
          const leaf = list[i];
          // Fixed-size instance pool: a leaf is reset above the scene when it falls out.
          leaf.y -= leaf.speed * dt;
          leaf.x += (.18 + .13*Math.sin(this.elapsed*.55+leaf.phase)) * dt;
          if (leaf.y < -3.6 || leaf.x > 10.6) this.resetLeaf(leaf);
          const sway = Math.sin(this.elapsed*1.9+leaf.phase) * leaf.sway;
          d.position.set(leaf.x+sway, leaf.y, leaf.z+Math.cos(this.elapsed*1.4+leaf.phase)*.28);
          d.rotation.set(
            leaf.roll + this.elapsed*leaf.spin,
            leaf.phase + this.elapsed*(.78+leaf.sway),
            Math.sin(this.elapsed*1.2+leaf.phase)*.9
          );
          d.scale.setScalar(leaf.size);
          d.updateMatrix();
          mesh.setMatrixAt(i,d.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  class CloudSystem {
    constructor(scene) {
      this.clouds = [];
      const data = [
        [-10.4,2.4,-6,1.7], [10.0,4.1,-7,2.0], [-8.4,6.5,-11,1.2],
        [7.9,-1.3,-4.2,1.55], [-7.2,-2.2,2.5,1.25], [1.7,-3.4,-6,1.4],
        [12.8,-1.9,1,1.6], [-12.4,-.3,-1,1.3]
      ];
      const cloudMaterial = new THREE.MeshToonMaterial({ color:'#f9f4e8', transparent:true, opacity:.74, depthWrite:false });
      data.forEach(([x,y,z,s],i) => {
        const group = new THREE.Group();
        group.position.set(x,y,z);
        [[0,0,0,.88],[-.62,-.15,.04,.54],[.67,-.12,.06,.60],[-.12,.23,.03,.60],[.27,.17,-.05,.66]].forEach(([cx,cy,cz,r]) => {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(r,8,6),cloudMaterial);
          puff.position.set(cx,cy,cz);
          puff.scale.set(1.2,.48,.66);
          group.add(puff);
        });
        group.scale.setScalar(s);
        scene.add(group);
        this.clouds.push({ group, x, y, speed:.05+.012*(i%3), phase:i*1.4 });
      });
    }
    update(dt,elapsed) {
      for (const cloud of this.clouds) {
        cloud.x += cloud.speed*dt;
        if (cloud.x > 14) cloud.x = -14;
        cloud.group.position.x = cloud.x;
        cloud.group.position.y = cloud.y + Math.sin(elapsed*.3+cloud.phase)*.08;
      }
    }
  }

  function glowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64,64,6,64,64,64);
    gradient.addColorStop(0,'rgba(255,255,255,0.58)');
    gradient.addColorStop(.34,'rgba(255,255,255,0.21)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(canvas);
  }

  class CelestialSky {
    constructor(camera) {
      this.group = new THREE.Group();
      camera.add(this.group);
      const texture = glowTexture();
      this.sun = new THREE.Group();
      this.sunCoreMaterial = new THREE.MeshBasicMaterial({color:'#fff0ba',transparent:true,depthWrite:false});
      const sunCore = new THREE.Mesh(new THREE.SphereGeometry(1.02,24,16),this.sunCoreMaterial);
      this.sun.add(sunCore);
      this.sunHaloMaterial = new THREE.SpriteMaterial({map:texture,color:'#ffe3a1',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      const sunHalo = new THREE.Sprite(this.sunHaloMaterial);
      sunHalo.scale.set(7.5,7.5,1);
      this.sun.add(sunHalo);
      this.group.add(this.sun);

      this.moon = new THREE.Group();
      this.moonCoreMaterial = new THREE.MeshBasicMaterial({color:'#fff3d9',transparent:true,depthWrite:false});
      this.moon.add(new THREE.Mesh(new THREE.SphereGeometry(.83,24,16),this.moonCoreMaterial));
      this.craterMaterials = [];
      for (const [x,y,r] of [[-.22,.23,.12],[.27,-.15,.16],[-.17,-.30,.075]]) {
        const craterMaterial = new THREE.MeshBasicMaterial({color:'#d7d8d0',transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});
        this.craterMaterials.push(craterMaterial);
        const crater = new THREE.Mesh(new THREE.CircleGeometry(r,12),craterMaterial);
        crater.position.set(x,y,.83);
        this.moon.add(crater);
      }
      this.moonHaloMaterial = new THREE.SpriteMaterial({map:texture,color:'#d6e7fb',transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending});
      const moonHalo = new THREE.Sprite(this.moonHaloMaterial);
      moonHalo.scale.set(5.5,5.5,1);
      this.moon.add(moonHalo);
      this.group.add(this.moon);

      const points = [];
      for (let i=0;i<72;i++) {
        points.push((Math.random()-.5)*43, -5+Math.random()*20, -43);
      }
      const stars = new THREE.BufferGeometry();
      stars.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
      this.starsMaterial = new THREE.PointsMaterial({ color:'#fff5df',size:.14,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true });
      this.group.add(new THREE.Points(stars,this.starsMaterial));
    }
    update(phase,starVisibility) {
      const angle = TAU*phase;
      // The celestial bodies move in camera space so they remain visible while orbiting the island.
      this.sun.position.set(7+7*Math.sin(angle),1+8.5*Math.cos(angle),-36);
      this.moon.position.set(7-7*Math.sin(angle),1-8.5*Math.cos(angle),-37);
      const sunAlpha = smoothstep(-.30,.18,Math.cos(angle));
      const moonAlpha = smoothstep(-.30,.18,-Math.cos(angle));
      this.sunCoreMaterial.opacity = sunAlpha;
      this.sunHaloMaterial.opacity = sunAlpha;
      this.moonCoreMaterial.opacity = moonAlpha;
      this.moonHaloMaterial.opacity = moonAlpha*.75;
      for (const material of this.craterMaterials) material.opacity = moonAlpha*.55;
      this.starsMaterial.opacity = starVisibility*.9;
    }
  }

  function smoothstep(a,b,x) {
    const t = THREE.MathUtils.clamp((x-a)/(b-a),0,1);
    return t*t*(3-2*t);
  }

  class DayNightCycle {
    constructor(app,lights,sky,island) {
      this.app = app;
      this.lights = lights;
      this.sky = sky;
      this.island = island;
      this.phase = 0;
      this.speed = 1;
      this.keyframes = [
        {t:0,    top:'#78c6e4',bottom:'#f8dfbd',glow:'#ffe4a4',fog:'#bad8df',hemi:'#edf8f4',ground:'#b3a6a0',sun:'#fff0cf',sunPower:2.0,hemiPower:1.48,ambient:.58,fogDensity:.007,stars:0},
        {t:.25, top:'#756e9c',bottom:'#f4a57c',glow:'#ffc28c',fog:'#bc9bad',hemi:'#e4cee3',ground:'#8f7995',sun:'#ffb27c',sunPower:1.24,hemiPower:1.00,ambient:.46,fogDensity:.008,stars:.10},
        {t:.50, top:'#18234d',bottom:'#425b82',glow:'#a8b2d6',fog:'#46577d',hemi:'#899bc2',ground:'#504d77',sun:'#a6b8e2',sunPower:.34,hemiPower:.53,ambient:.42,fogDensity:.009,stars:1},
        {t:.75, top:'#7689ac',bottom:'#f4c5a4',glow:'#ffe1b5',fog:'#b9afc2',hemi:'#e7d8dd',ground:'#837a94',sun:'#ffdfb3',sunPower:1.18,hemiPower:1.00,ambient:.48,fogDensity:.008,stars:.12},
        {t:1,    top:'#78c6e4',bottom:'#f8dfbd',glow:'#ffe4a4',fog:'#bad8df',hemi:'#edf8f4',ground:'#b3a6a0',sun:'#fff0cf',sunPower:2.0,hemiPower:1.48,ambient:.58,fogDensity:.007,stars:0}
      ].map(k => ({...k,top:new THREE.Color(k.top),bottom:new THREE.Color(k.bottom),glow:new THREE.Color(k.glow),fog:new THREE.Color(k.fog),hemi:new THREE.Color(k.hemi),ground:new THREE.Color(k.ground),sun:new THREE.Color(k.sun)}));
      this.temp = {
        top:new THREE.Color(),bottom:new THREE.Color(),glow:new THREE.Color(),fog:new THREE.Color(),
        hemi:new THREE.Color(),ground:new THREE.Color(),sun:new THREE.Color()
      };
      this.uiDay = new THREE.Color('#173d4b');
      this.uiNight = new THREE.Color('#fff0df');
      this.uiColor = new THREE.Color();
      this.phaseLabel = document.getElementById('phase-label');
      this.timeLabel = document.getElementById('time-label');
      this.marker = document.getElementById('cycle-marker');
      this.progress = document.getElementById('cycle-progress');
      this.dot = document.querySelector('.time-panel__dot');
      this.update(0);
    }

    update(dt) {
      // One full loop is exactly 15 seconds at the default 1× speed.
      this.phase = (this.phase + dt*this.speed/15) % 1;
      const p = this.phase;
      let left = this.keyframes[0], right = this.keyframes[1];
      for (let i=0;i<this.keyframes.length-1;i++) {
        if (p >= this.keyframes[i].t && p <= this.keyframes[i+1].t) {
          left = this.keyframes[i]; right = this.keyframes[i+1]; break;
        }
      }
      // Smoothstep makes the value and velocity continuous at each quarter-day keyframe.
      const f = smoothstep(0,1,(p-left.t)/(right.t-left.t));
      for (const key of ['top','bottom','glow','fog','hemi','ground','sun']) {
        this.temp[key].copy(left[key]).lerp(right[key],f);
      }
      const mix = key => THREE.MathUtils.lerp(left[key],right[key],f);
      this.app.style.setProperty('--sky-top',this.temp.top.getStyle());
      this.app.style.setProperty('--sky-bottom',this.temp.bottom.getStyle());
      this.app.style.setProperty('--sky-glow',this.temp.glow.getStyle().replace('rgb(', 'rgba(').replace(')', ', 0.38)'));
      const darkHud = smoothstep(.15,.28,p) * (1-smoothstep(.73,.86,p));
      this.uiColor.copy(this.uiDay).lerp(this.uiNight,darkHud);
      this.app.style.setProperty('--hud-ink',this.uiColor.getStyle());
      this.app.style.setProperty('--hud-line',this.uiColor.getStyle().replace('rgb(', 'rgba(').replace(')', ', 0.32)'));
      scene.fog.color.copy(this.temp.fog);
      scene.fog.density = mix('fogDensity');
      hemi.color.copy(this.temp.hemi);
      hemi.groundColor.copy(this.temp.ground);
      hemi.intensity = mix('hemiPower');
      ambient.intensity = mix('ambient');
      sunLight.color.copy(this.temp.sun);
      sunLight.intensity = mix('sunPower');
      sunLight.position.set(-8+10*Math.sin(p*TAU),11+5*Math.cos(p*TAU),9);

      // Lamps fade in during dusk, stay on at night, and finish fading out before dawn.
      const lamp = smoothstep(.15,.27,p) * (1-smoothstep(.65,.74,p));
      for (const target of this.lights) target.light.intensity = target.max*lamp;
      mat.window.emissiveIntensity = 1.55*lamp;
      mat.lanternGlass.emissiveIntensity = 2.0*lamp;
      this.sky.update(p,mix('stars'));

      const label = p < .17 ? 'DAYLIGHT' : p < .36 ? 'GOLDEN HOUR' : p < .66 ? 'LANTERN NIGHT' : p < .87 ? 'FIRST LIGHT' : 'SUNLIT MORNING';
      this.phaseLabel.textContent = label;
      const clockHours = (p*24+12)%24;
      this.timeLabel.textContent = `${String(Math.floor(clockHours)).padStart(2,'0')}:${String(Math.floor((clockHours%1)*60)).padStart(2,'0')}`;
      this.marker.style.left = `${p*100}%`;
      this.progress.style.width = `${p*100}%`;
      this.dot.style.background = lamp > .45 ? '#ffb871' : p < .36 ? '#f6b35f' : '#dce8ff';
    }
  }

  class OrbitDrag {
    constructor(canvas,camera) {
      this.canvas=canvas;
      this.camera=camera;
      this.angle=.43;
      this.targetAngle=.43;
      this.dragging=false;
      this.lastX=0;
      this.idle=0;
      canvas.addEventListener('pointerdown', e => {
        this.dragging=true;
        this.lastX=e.clientX;
        this.idle=0;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', e => {
        if (!this.dragging) return;
        this.targetAngle -= (e.clientX-this.lastX)*.0085;
        this.lastX=e.clientX;
        this.idle=0;
      });
      const finish = () => { this.dragging=false; };
      canvas.addEventListener('pointerup',finish);
      canvas.addEventListener('pointercancel',finish);
      canvas.addEventListener('lostpointercapture',finish);
      this.update(0);
    }
    update(dt) {
      this.idle += dt;
      if (!this.dragging && this.idle > 4) this.targetAngle += dt*.055;
      this.angle += (this.targetAngle-this.angle)*(1-Math.exp(-8*dt));
      const radius=20.3;
      this.camera.position.set(Math.sin(this.angle)*radius,9.2,Math.cos(this.angle)*radius);
      this.camera.lookAt(0,1.65,0);
    }
  }

  const app = document.getElementById('app');
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.7));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xffffff,0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#bad8df',.007);
  const camera = new THREE.PerspectiveCamera(38,1,.1,150);
  scene.add(camera);
  const hemi = new THREE.HemisphereLight('#edf8f4','#b3a6a0',1.48);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight('#ffffff',.58);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight('#fff0cf',2);
  sunLight.position.set(-8,16,9);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024,1024);
  sunLight.shadow.camera.left = -12;
  sunLight.shadow.camera.right = 12;
  sunLight.shadow.camera.top = 12;
  sunLight.shadow.camera.bottom = -12;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 45;
  sunLight.shadow.bias = -.0004;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const island = new Island();
  scene.add(island.group);
  const clouds = new CloudSystem(scene);
  const leaves = new MapleLeafSystem(scene,132);
  const sky = new CelestialSky(camera);
  const dayNight = new DayNightCycle(app,island.lights,sky,island);
  const orbit = new OrbitDrag(canvas,camera);

  const speedButton = document.getElementById('speed-button');
  const speedLabel = document.getElementById('speed-label');
  const speeds = [1,4,.25];
  let speedIndex = 0;
  function changeSpeed() {
    speedIndex=(speedIndex+1)%speeds.length;
    dayNight.speed=speeds[speedIndex];
    const label = speeds[speedIndex] === .25 ? '¼×' : `${speeds[speedIndex]}×`;
    speedLabel.textContent=label;
    speedButton.setAttribute('aria-label',`Time speed: ${label}. Click to change.`);
  }
  speedButton.addEventListener('click',changeSpeed);
  window.addEventListener('keydown',e => {
    if (e.code === 'Space' && !e.repeat && e.target !== speedButton) {
      e.preventDefault();
      changeSpeed();
    }
  });

  function resize() {
    const w=Math.max(app.clientWidth,1), h=Math.max(app.clientHeight,1);
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.fov = w/h < 1.2 ? 48 : 38;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize',resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(app);
  resize();

  const debug = new URLSearchParams(location.search).has('debug');
  let debugBadge, frameCount=0, frameTime=0;
  if (debug) {
    debugBadge=document.createElement('div');
    debugBadge.style.cssText='position:absolute;z-index:4;top:74px;right:24px;padding:5px 8px;border-radius:7px;background:#173d4bbb;color:white;font:11px monospace;pointer-events:none';
    app.appendChild(debugBadge);
  }

  let last=performance.now(),elapsed=0;
  document.addEventListener('visibilitychange',() => { last=performance.now(); });
  function animate(now) {
    requestAnimationFrame(animate);
    // Physics uses a capped step for stability; the clock uses real active-frame time.
    const clockDt=Math.max(0,(now-last)/1000);
    const dt=Math.min(clockDt,.05);
    last=now;
    elapsed+=dt;
    island.update(elapsed);
    clouds.update(dt,elapsed);
    leaves.update(dt);
    dayNight.update(clockDt);
    orbit.update(dt);
    renderer.render(scene,camera);
    if (debug) {
      frameCount++;
      frameTime+=clockDt;
      if (frameTime >= .5) {
        debugBadge.textContent=`${Math.round(frameCount/frameTime)} FPS · ${leaves.count} leaves`;
        frameCount=0; frameTime=0;
      }
    }
  }
  requestAnimationFrame(animate);
  loading.classList.add('is-hidden');
  setTimeout(() => loading.remove(),650);
})();
