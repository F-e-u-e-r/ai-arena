/* Tokyo Sky Garden · Three.js r160 · All artwork is procedural. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const host = $('#world');
  if (!window.THREE) {
    $('#loading').classList.add('error');
    $('#loading').innerHTML = '<span class="loading-mark">空</span><span>The garden could not reach its sky.<br>Please connect to the internet and reload.</span><button onclick="location.reload()">Try again</button>';
    return;
  }
  const T = THREE;
  const TAU = Math.PI * 2;
  const clamp = T.MathUtils.clamp;
  const smooth = T.MathUtils.smoothstep;
  const lerp = T.MathUtils.lerp;
  let seed = 1907;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const between = (a, b) => lerp(a, b, rand());
  const materials = new Map();
  const geometries = {
    box: new T.BoxGeometry(1, 1, 1),
    cylinder: new T.CylinderGeometry(1, 1, 1, 8),
    sphere: new T.IcosahedronGeometry(1, 1),
    rock: new T.IcosahedronGeometry(1, 0),
    cone: new T.ConeGeometry(1, 1, 7),
  };
  function mat(color, options = {}) {
    const key = color + JSON.stringify(options);
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...options }));
    return materials.get(key);
  }
  const palette = {
    grass: mat('#8e9b69'), moss: mat('#697d53'), paleGrass: mat('#a8ac77'),
    stone: mat('#a3a08c'), path: mat('#d9c6a1'), wood: mat('#684c3c'),
    red: mat('#db5434'), redDark: mat('#a43e2d'), cream: mat('#f3e6c9'),
    roof: mat('#3e605d'), roofEdge: mat('#789086'), gold: mat('#dcb46c'),
    window: mat('#6b8780', { emissive: '#ffc66c', emissiveIntensity: 0 }),
    lantern: mat('#f7d795', { emissive: '#ffba50', emissiveIntensity: 0 }),
    snow: mat('#f4f2e4'), mountain: mat('#77929a'), water: mat('#7cafae', { roughness: .4, metalness: .1 }),
    orange: mat('#db793e'), coral: mat('#d95a3a'), amber: mat('#e9ac50'), lightLeaf: mat('#efb065'),
    darkLeaf: mat('#a94330'), green: mat('#607957'),
  };
  const emissives = [palette.window, palette.lantern];
  const lamps = [];
  function mesh(parent, geometry, material, pos = [0, 0, 0], scale = [1, 1, 1]) {
    const object = new T.Mesh(geometry, material);
    object.position.set(...pos); object.scale.set(...scale);
    object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  }
  function box(parent, material, pos, scale) { return mesh(parent, geometries.box, material, pos, scale); }
  function ball(parent, material, pos, scale) { return mesh(parent, geometries.sphere, material, pos, scale); }
  const axisY = new T.Vector3(0, 1, 0);
  function beam(parent, from, to, radius, material) {
    const a = new T.Vector3(...from), b = new T.Vector3(...to), dir = b.clone().sub(a);
    const object = mesh(parent, geometries.cylinder, material, a.add(b).multiplyScalar(.5).toArray(), [radius, dir.length(), radius]);
    object.quaternion.setFromUnitVectors(axisY, dir.normalize()); return object;
  }
  function ring(parent, y, half, thickness, material) {
    for (let i = 0; i < 4; i++) {
      const points = [[-half, y, -half], [half, y, -half], [half, y, half], [-half, y, half]];
      beam(parent, points[i], points[(i + 1) % 4], thickness, material);
    }
  }
  function ribbon(parent, points, width, material) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    const p = [], idx = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50, center = curve.getPoint(t), tangent = curve.getTangent(t);
      const side = new T.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
      p.push(center.x + side.x, center.y, center.z + side.z, center.x - side.x, center.y, center.z - side.z);
      if (i < 50) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals();
    return mesh(parent, g, material);
  }
  // Bake static architecture into a small number of material batches. Meshes with
  // animated transforms stay separate. Geometries/materials are reused thereafter.
  function batchStatic(root) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert(), groups = new Map(), originals = [];
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.dynamic || Array.isArray(o.material)) return;
      let parent = o.parent;
      while (parent && parent !== root) { if (parent.userData.dynamic) return; parent = parent.parent; }
      const key = o.material.uuid + o.castShadow + o.receiveShadow;
      if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, parts: [] });
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
      groups.get(key).parts.push(g); originals.push(o);
    });
    groups.forEach(({ material, cast, receive, parts }) => {
      const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
      const g = new T.BufferGeometry();
      for (const attribute of ['position', 'normal', 'color']) {
        if (!parts[0].attributes[attribute]) continue;
        const array = new Float32Array(count * 3); let offset = 0;
        parts.forEach(part => { const src = part.attributes[attribute].array; array.set(src, offset); offset += src.length; });
        g.setAttribute(attribute, new T.BufferAttribute(array, 3));
      }
      g.computeBoundingSphere();
      const o = new T.Mesh(g, material); o.castShadow = cast; o.receiveShadow = receive; root.add(o);
      parts.forEach(p => p.dispose());
    });
    const shared = new Set(Object.values(geometries));
    originals.forEach(o => { o.removeFromParent(); if (!shared.has(o.geometry)) o.geometry.dispose(); });
  }

  class TokyoTower {
    constructor(parent) {
      this.group = new T.Group(); parent.add(this.group);
      this.group.position.set(.25, .12, -.45);
      const g = this.group, red = palette.red, white = palette.cream;
      const levels = [ [0, 1.12], [.75, .87], [1.5, .63], [2.25, .47], [2.85, .41], [3.55, .32], [4.2, .24], [4.8, .16], [5.4, .10] ];
      const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
      for (let n = 0; n < levels.length - 1; n++) {
        const [y0, w0] = levels[n], [y1, w1] = levels[n + 1];
        const material = n === 4 || n === 6 ? white : red;
        for (let i = 0; i < 4; i++) {
          const a = corners[i], b = corners[(i + 1) % 4];
          beam(g, [a[0]*w0,y0,a[1]*w0], [a[0]*w1,y1,a[1]*w1], n < 3 ? .065 : .043, material);
          beam(g, [a[0]*w0,y0,a[1]*w0], [b[0]*w1,y1,b[1]*w1], .026, material);
          beam(g, [b[0]*w0,y0,b[1]*w0], [a[0]*w1,y1,a[1]*w1], .026, material);
        }
        ring(g, y1, w1, .035, material);
        if (n < 3) ring(g, (y0 + y1)/2, (w0 + w1)/2, .023, red);
      }
      corners.forEach(([x,z]) => box(g, palette.stone, [x*1.12,-.04,z*1.12], [.38,.16,.38]));
      this.deck(2.45, 1.31, .36);
      this.deck(4.72, .65, .28);
      box(g, white, [0, 5.42, 0], [.25,.3,.25]);
      for (let i = 0; i < 7; i++) mesh(g, geometries.cylinder, i%2 ? red : white, [0,5.65+i*.18,0], [.065-i*.006,.185,.065-i*.006]);
      beam(g, [0,6.75,0], [0,7.04,0], .018, palette.redDark);
      this.beacon = ball(g, palette.lantern, [0,6.99,0], [.045,.045,.045]);
      const light = new T.PointLight('#ff9d4d', 0, 5, 2); light.position.set(0, 2.5, .4); g.add(light); lamps.push(light);
      // Light strips follow all four structural legs and glow together at dusk.
      const strips = mat('#eb9c5a', { emissive: '#ff9d42', emissiveIntensity: 0 }); emissives.push(strips);
      corners.forEach(([x,z]) => beam(g, [x*1.13,.16,z*1.13], [x*.48,2.27,z*.48], .014, strips));
    }
    deck(y, w, h) {
      const g = this.group;
      box(g, palette.redDark, [0,y-h*.5,0], [w+.15,.09,w+.15]);
      box(g, palette.cream, [0,y,0], [w,h,w]);
      box(g, palette.window, [0,y+.015,0], [w+.015,h*.47,w+.015]);
      for (let i = -3; i <= 3; i++) {
        const p = i * w/7;
        for (const s of [-1,1]) {
          box(g, palette.cream, [p,y,s*(w/2+.015)], [.035,h,.035]);
          box(g, palette.cream, [s*(w/2+.015),y,p], [.035,h,.035]);
        }
      }
      box(g, palette.red, [0,y+h*.5,0], [w+.14,.075,w+.14]);
    }
  }

  class Landmark {
    static fuji(parent) {
      const group = new T.Group(); group.position.set(-2.35,.03,-1.7); parent.add(group);
      const n = 11, pos = [], color = [];
      const rock = new T.Color('#83989c'), snow = new T.Color('#f7f4e9');
      const bottom = [], snowline = [], peak = new T.Vector3(.08,2.65,-.06);
      for (let i=0;i<n;i++) {
        const a=i/n*TAU;
        bottom.push(new T.Vector3(Math.cos(a)*1.61,0,Math.sin(a)*1.34));
        const h=1.67+(i%3)*.14;
        snowline.push(new T.Vector3(Math.cos(a)*(2.65-h)/2.65*1.61,h,Math.sin(a)*(2.65-h)/2.65*1.34));
      }
      function triangle(a,b,c,shade) { [a,b,c].forEach(v=>{pos.push(v.x,v.y,v.z);color.push(shade.r,shade.g,shade.b);}); }
      for(let i=0;i<n;i++) {
        const j=(i+1)%n, c=rock.clone().multiplyScalar(.9+rand()*.17);
        triangle(bottom[i],snowline[i],bottom[j],c);triangle(bottom[j],snowline[i],snowline[j],c);
        triangle(snowline[i],peak,snowline[j],snow);
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('color',new T.Float32BufferAttribute(color,3));geo.computeVertexNormals();
      mesh(group,geo,mat('#ffffff',{vertexColors:true,side:T.DoubleSide}));
      for(let i=0;i<7;i++) {
        const a=i*2.4;ball(group,palette.moss,[Math.cos(a)*1.45,.11,Math.sin(a)*1.15],[.33,.22,.28]);
      }
    }
    static torii(parent) {
      const g=new T.Group();g.position.set(-1.7,.12,2.55);g.rotation.y=.14;parent.add(g);
      for(const s of [-1,1]) {
        box(g,palette.stone,[s*.61,.04,0],[.39,.16,.38]);
        beam(g,[s*.64,.1,0],[s*.54,1.75,0],.095,palette.red);
        mesh(g,geometries.cylinder,palette.redDark,[s*.635,.2,0],[.13,.2,.13]);
        box(g,palette.red,[s*.76,1.31,0],[.22,.12,.2]);
      }
      box(g,palette.red,[0,1.33,0],[1.8,.13,.18]);
      box(g,palette.red,[0,1.75,0],[1.93,.17,.27]);
      beam(g,[-1.05,1.85,0],[0,1.78,0],.085,palette.roof);
      beam(g,[0,1.78,0],[1.05,1.85,0],.085,palette.roof);
      box(g,palette.gold,[0,1.52,.12],[.2,.31,.06]);
      box(g,palette.redDark,[0,1.52,.16],[.1,.2,.015]);
      // A shimenawa rope with folded paper streamers under the crossbar.
      beam(g,[-.5,1.22,.04],[0,1.13,.04],.018,palette.gold);beam(g,[0,1.13,.04],[.5,1.22,.04],.018,palette.gold);
      for(let i=-1;i<=1;i++) {const paper=box(g,palette.cream,[i*.3,1.05,.05],[.08,.17,.015]);paper.rotation.z=.2;}
    }
    static roof(parent, y, width, depth) {
      const p=[], idx=[];
      const edges=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];
      p.push(0,y+.46,0);
      edges.forEach(([x,z],i)=>p.push(x*width/2,y+(i%2===0?.14:0),z*depth/2));
      for(let i=0;i<8;i++) idx.push(0,1+(i+1)%8,1+i);
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();
      mesh(parent,geo,mat('#3e605d',{side:T.DoubleSide}));
      for(let i=0;i<8;i++) {
        const a=edges[i],b=edges[(i+1)%8];
        beam(parent,[a[0]*width/2,y+(i%2===0?.14:0),a[1]*depth/2],[b[0]*width/2,y+(i%2===0?0:.14),b[1]*depth/2],.035,palette.roofEdge);
      }
      // Repeated tile ribs make the miniature roof readable without textures.
      for(const s of [-1,1]) for(let i=-3;i<=3;i++) {
        beam(parent,[i*width/9,y+.34,s*depth*.13],[i*width/9,y+.02,s*depth*.49],.012,palette.roofEdge);
      }
    }
    static pagoda(parent) {
      const g=new T.Group();g.position.set(2.53,.06,.28);g.rotation.y=-.12;parent.add(g);
      box(g,palette.stone,[0,.08,0],[1.65,.18,1.5]);
      box(g,palette.cream,[0,.22,0],[1.42,.13,1.27]);
      for(let i=0;i<3;i++) {
        const y=.35+i*.72,w=1.18-i*.18,d=1.06-i*.15;
        box(g,palette.redDark,[0,y+.23,0],[w,.51,d]);
        for(const s of [-1,1]) {
          box(g,palette.cream,[0,y+.23,s*(d/2+.01)],[w*.81,.32,.025]);
          box(g,palette.window,[0,y+.22,s*(d/2+.03)],[w*.38,.31,.025]);
          box(g,palette.cream,[s*(w/2+.01),y+.23,0],[.025,.32,d*.81]);
          for(const t of [-1,1])box(g,palette.red,[s*w*.44,y+.25,t*d*.5],[.09,.58,.09]);
          box(g,palette.red,[0,y+.06,s*(d/2+.13)],[w+.18,.06,.07]);
          for(let k=-3;k<=3;k++)box(g,palette.red,[k*w/7,y+.13,s*(d/2+.13)],[.035,.2,.035]);
        }
        Landmark.roof(g,y+.49,w+.63,d+.59);
      }
      beam(g,[0,2.7,0],[0,3.28,0],.035,palette.gold);
      for(let i=0;i<4;i++)mesh(g,geometries.cylinder,palette.gold,[0,2.78+i*.1,0],[.12-i*.019,.045,.12-i*.019]);
      ball(g,palette.gold,[0,3.31,0],[.075,.09,.075]);
      for(let i=0;i<3;i++)box(g,palette.stone,[0,.05+i*.06,.97-i*.14],[.78,.1,.27]);
      const light=new T.PointLight('#ffd18b',0,3.5,2);light.position.set(0,.9,1);g.add(light);lamps.push(light);
    }
    static lantern(parent,x,z) {
      box(parent,palette.stone,[x,.08,z],[.24,.13,.24]);
      mesh(parent,geometries.cylinder,palette.stone,[x,.35,z],[.065,.5,.065]);
      box(parent,palette.lantern,[x,.65,z],[.19,.23,.19]);
      const cap=mesh(parent,geometries.cone,palette.roof,[x,.83,z],[.19,.19,.19]);cap.rotation.y=Math.PI/4;
      for(const s of [-1,1])for(const t of [-1,1])box(parent,palette.wood,[x+s*.1,.65,z+t*.1],[.026,.25,.026]);
    }
  }

  class Island {
    constructor(scene) {
      this.group=new T.Group();scene.add(this.group);
      this.createLand();this.createGarden();
      Landmark.fuji(this.group);new TokyoTower(this.group);Landmark.pagoda(this.group);Landmark.torii(this.group);
      [[-3.45,.9],[-2.65,2.6],[-.68,2.8],[1.8,1.7],[3.6,0],[-.95,-1.6]].forEach(([x,z])=>Landmark.lantern(this.group,x,z));
      this.createTrees();this.createBridge();
      batchStatic(this.group);
      this.fragments=[];
      for(let i=0;i<7;i++) {
        const a=i/7*TAU, r=between(3.5,5.1),size=between(.16,.39);
        const object=mesh(scene,geometries.rock,mat(i%2?'#a79b7b':'#c1ad88'),[Math.cos(a)*r,between(-3,-1.8),Math.sin(a)*r],[size,size*1.3,size]);
        object.rotation.set(rand(),rand(),rand());this.fragments.push({object,base:object.position.y,phase:a});
      }
    }
    createLand() {
      const n=15,outline=[];
      for(let i=0;i<n;i++){const a=i/n*TAU;outline.push([Math.cos(a)*(4.6+rand()*.35),Math.sin(a)*(3.8+rand()*.28)]);}
      const levels=[{y:0,s:1},{y:-.34,s:1.02},{y:-1.16,s:.87},{y:-2.18,s:.55},{y:-2.9,s:.19}];
      // Adjacent rock strata share exactly the same ring vertices, so the
      // irregular facets remain watertight from every orbit angle.
      const rings=levels.map((level,r)=>outline.map(([x,z],i)=>[
        x*level.s+Math.max(0,r-1)*.08,
        level.y-(r===0?0:(i%3)*.11),
        z*level.s,
      ]));
      const colors=['#8c9b65','#b49e72','#b39b78','#9b896d'];
      const p=[],c=[];
      const add=(v,col)=>{p.push(...v);c.push(col.r,col.g,col.b);};
      for(let r=0;r<levels.length-1;r++)for(let i=0;i<n;i++) {
        const j=(i+1)%n;
        const v1=rings[r][i],v2=rings[r][j];
        const v3=rings[r+1][i],v4=rings[r+1][j];
        let col=new T.Color(colors[r]).multiplyScalar(between(.87,1.12));[v1,v3,v2].forEach(v=>add(v,col));
        col=col.clone().multiplyScalar(between(.86,1.09));[v2,v3,v4].forEach(v=>add(v,col));
      }
      for(let i=0;i<n;i++) {
        const col=new T.Color('#94816a');
        [rings[4][i],rings[4][(i+1)%n],[.24,-3.25,0]].forEach(v=>add(v,col));
      }
      for(let i=0;i<n;i++){const j=(i+1)%n,col=new T.Color('#94a16f').multiplyScalar(between(.95,1.06));[[0,.005,0],[outline[j][0],0,outline[j][1]],[outline[i][0],0,outline[i][1]]].forEach(v=>add(v,col));}
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('color',new T.Float32BufferAttribute(c,3));geo.computeVertexNormals();
      mesh(this.group,geo,mat('#ffffff',{vertexColors:true,side:T.DoubleSide}));
      for(let i=0;i<20;i++) {
        const a=rand()*TAU,r=between(3.2,4.1);
        const rock=mesh(this.group,geometries.rock,palette.moss,[Math.cos(a)*r,-.12,Math.sin(a)*r*.83],[between(.2,.5),between(.12,.24),between(.2,.4)]);rock.rotation.y=rand()*6;
      }
    }
    createGarden() {
      const g=this.group;
      ribbon(g,[[-2.4,.04,3.3],[-1.6,.04,2.1],[-.9,.04,1.6],[0,.04,.9],[.9,.04,.6],[2.5,.04,1.5]],.55,palette.path);
      ribbon(g,[[-.7,.047,1.45],[-1.8,.047,.5],[-2.9,.047,-.2]],.38,palette.path);
      ribbon(g,[[1,.042,.6],[.8,.042,1.7],[1.1,.042,2.7],[2.15,.042,3.1]],.43,palette.path);
      const pond=mesh(g,new T.CylinderGeometry(1,1,.045,40),palette.water,[1.04,.035,2.25],[1.32,1,.78]);pond.rotation.y=-.18;
      for(let i=0;i<22;i++) {
        const a=i/22*TAU;
        const stone=mesh(g,geometries.rock,i%3?palette.stone:palette.cream,[1.04+Math.cos(a)*1.34,.09,2.25+Math.sin(a)*.8],[between(.11,.2),.1,between(.09,.16)]);stone.rotation.y=a;
      }
      const rippleMaterial=new T.MeshBasicMaterial({color:'#d6e5cb',transparent:true,opacity:.42,side:T.DoubleSide,depthWrite:false});
      this.ripples=[];
      for(let i=0;i<3;i++) {
        const r=mesh(g,new T.RingGeometry(.2,.213,32),rippleMaterial,[1.61,.067,2.21],[1,1,1]);r.rotation.x=-Math.PI/2;r.userData.dynamic=true;r.castShadow=false;this.ripples.push(r);
      }
      // Tiny koi silhouettes inhabit the pond.
      for(let i=0;i<4;i++) {
        const fish=ball(g,i%2?palette.cream:palette.orange,[.4+i*.38,.071,2.45+(i%2)*.17],[.1,.012,.035]);fish.rotation.y=.4+i*.8;
      }
      for(let i=0;i<65;i++) {
        const x=between(-4,4),z=between(-3.4,3.35);
        if((x*x/19+z*z/13)>1 || (x>-1.2&&x<2.2&&z>-.5))continue;
        const size=between(.025,.065);
        if(i%3===0) mesh(g,geometries.rock,palette.stone,[x,.055,z],[size*2,size,size*1.4]);
        else {
          const stem=box(g,i%2?palette.paleGrass:palette.moss,[x,.08,z],[.025,.16,.025]);stem.rotation.z=.3;
          const stem2=box(g,palette.paleGrass,[x+.045,.06,z],[.022,.12,.022]);stem2.rotation.z=-.3;
        }
      }
      // A small park bench, with slats and legs.
      for(let i=0;i<3;i++)box(g,palette.wood,[-3.15,.34,.25+i*.11],[.67,.045,.08]);
      for(const x of [-3.4,-2.9]){box(g,palette.roof,[x,.19,.35],[.05,.33,.25]);box(g,palette.wood,[x,.55,.51],[.035,.5,.04]);}
      box(g,palette.wood,[-3.15,.65,.51],[.67,.11,.04]);
    }
    createTrees() {
      const positions=[[-3.6,1.35,1],[-3.5,-.6,.86],[-2.9,2.2,.76],[-.6,-2.8,.85],[1.35,-2.5,1.05],[2.85,-1.6,.95],[3.65,1.5,.95],[2.9,2.65,.66],[-.1,3.3,.62],[-4,-1.8,.73]];
      positions.forEach(([x,z,s],index)=>{
        const g=new T.Group();g.position.set(x,.03,z);g.scale.setScalar(s);g.rotation.y=rand()*TAU;this.group.add(g);
        beam(g,[0,0,0],[.06,1.35,0],.085,palette.wood);
        beam(g,[.02,.65,0],[-.43,1.48,.09],.04,palette.wood);beam(g,[.02,.83,0],[.4,1.57,-.04],.043,palette.wood);
        beam(g,[.03,1.1,0],[.08,1.74,.34],.03,palette.wood);
        const colors=index%3===0?[palette.coral,palette.darkLeaf,palette.orange]:index%3===1?[palette.amber,palette.lightLeaf,palette.orange]:[palette.orange,palette.coral,palette.lightLeaf];
        const clusters=[[-.42,1.52,.02,.47],[.4,1.65,-.04,.49],[.02,1.86,.07,.56],[.02,1.53,.4,.44],[.12,1.62,-.37,.44],[-.32,1.89,-.14,.35],[.34,1.99,.14,.33]];
        clusters.forEach(([a,b,c,r],i)=>{const o=ball(g,colors[i%3],[a,b,c],[r,r*.8,r]);o.rotation.set(rand(),rand(),rand());});
        for(let k=0;k<6;k++){const a=rand()*TAU;const leaf=mesh(g,geometries.rock,colors[k%3],[Math.cos(a)*.65,.024,Math.sin(a)*.5],[.07,.014,.05]);leaf.rotation.y=rand()*6;}
      });
      for(let i=0;i<5;i++) {
        const x=-3.5+i*.45,z=-2.75+Math.sin(i)*.2;
        beam(this.group,[x,0,z],[x,.7,z],.035,palette.wood);
        for(let j=0;j<3;j++)mesh(this.group,geometries.cone,palette.green,[x,.45+j*.2,z],[.27-j*.06,.5,.27-j*.06]);
      }
    }
    createBridge() {
      const g=new T.Group();g.position.set(.85,.15,2.25);g.rotation.y=-.23;this.group.add(g);
      for(let i=0;i<12;i++) {
        const x=(i/11-.5)*1.58,y=Math.sin(i/11*Math.PI)*.27;
        const plank=box(g,palette.wood,[x,y,0],[.145,.06,.56]);plank.rotation.z=Math.cos(i/11*Math.PI)*.4;
        for(const s of [-1,1]) {
          if(i%3===0||i===11)box(g,palette.red,[x,y+.22,s*.29],[.048,.44,.048]);
          if(i<11){const nx=((i+1)/11-.5)*1.58,ny=Math.sin((i+1)/11*Math.PI)*.27;beam(g,[x,y+.43,s*.29],[nx,ny+.43,s*.29],.032,palette.red);}
        }
      }
    }
    update(time) {
      this.group.position.y=Math.sin(time*.7)*.12;
      this.group.rotation.z=Math.sin(time*.32)*.006;
      this.fragments.forEach(({object,base,phase})=>{object.position.y=base+Math.sin(time*.65+phase)*.12;object.rotation.y=time*.04+phase;});
      this.ripples.forEach((r,i)=>{const phase=(time*.17+i/3)%1;r.scale.setScalar(.4+phase*2);});
    }
  }

  class MapleLeafSystem {
    constructor(scene, count) {
      this.count=count;this.visible=true;
      const shape=new T.Shape();
      // A recognizable seven-lobed maple outline, not a rectangular billboard.
      const outline=[[0,.62],[.13,.28],[.31,.39],[.25,.12],[.51,.18],[.38,-.04],[.46,-.12],[.12,-.22],[.025,-.18],[.025,-.47],[-.025,-.47],[-.025,-.18],[-.12,-.22],[-.46,-.12],[-.38,-.04],[-.51,.18],[-.25,.12],[-.31,.39],[-.13,.28]];
      outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
      const geometry=new T.ShapeGeometry(shape);
      const material=new T.MeshStandardMaterial({color:'#ffffff',side:T.DoubleSide,roughness:1,metalness:0});
      this.mesh=new T.InstancedMesh(geometry,material,count);this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.mesh.frustumCulled=false;scene.add(this.mesh);
      this.data=new Float32Array(count*9);this.dummy=new T.Object3D();
      const colors=['#c54d2d','#e18b3d','#b63f29','#e8b35b','#dc7135'];
      for(let i=0;i<count;i++){this.reset(i,true);this.mesh.setColorAt(i,new T.Color(colors[i%colors.length]));}
      this.mesh.instanceColor.needsUpdate=true;
      this.update(0,0);
    }
    reset(i,initial=false) {
      const d=this.data,k=i*9;
      d[k]=between(-6.6,6.6);d[k+1]=initial?between(-3.5,8):between(7.5,9.8);d[k+2]=between(-4.6,4.6);
      d[k+3]=between(.3,.7);d[k+4]=rand()*TAU;d[k+5]=rand()*TAU;d[k+6]=between(.07,.15);d[k+7]=between(.5,1.6);d[k+8]=rand()*TAU;
    }
    update(dt,time) {
      if(!this.visible)return;
      const d=this.data,o=this.dummy;
      for(let i=0;i<this.count;i++) {
        const k=i*9;
        // Delta-time integration plus independent phase/frequency creates a soft
        // terminal fall, crosswind and tumbling. Expired slots are reset in place.
        d[k+1]-=d[k+3]*dt;d[k]+=(.09+Math.sin(time*.55+d[k+4])*.12)*dt;
        if(d[k+1]<-3.8||d[k]>7.4)this.reset(i);
        o.position.set(d[k]+Math.sin(time*d[k+7]+d[k+4])*.45,d[k+1]+Math.cos(time*1.3+d[k+4])*.08,d[k+2]+Math.sin(time*.7+d[k+8])*.3);
        o.rotation.set(time*.6+d[k+5],time*d[k+7]+d[k+8],Math.sin(time+d[k+4])*.8+d[k+5]);
        o.scale.setScalar(d[k+6]);o.updateMatrix();this.mesh.setMatrixAt(i,o.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate=true;
    }
    toggle() {this.visible=!this.visible;this.mesh.visible=this.visible;return this.visible;}
  }

  class Sky {
    constructor(scene) {
      this.clouds=[];
      const cloudMaterial=mat('#f9f7eb',{transparent:true,opacity:.82,depthWrite:false});
      const clouds=[[-6,2.5,-3,1.1],[5.9,2,-2,.9],[-3.6,-1.8,2,.75],[4.6,-1.5,1.8,.65],[-.5,4.5,-5,.57]];
      clouds.forEach(([x,y,z,s],i)=>{
        const group=new T.Group();scene.add(group);group.position.set(x,y,z);group.scale.setScalar(s);group.userData.dynamic=true;
        [[-.6,0,0,.6],[0,.15,0,.85],[.7,0,.05,.57],[.16,-.15,.15,.62]].forEach(([a,b,c,r])=>{const o=ball(group,cloudMaterial,[a,b,c],[r,r*.45,r*.5]);o.castShadow=false;o.receiveShadow=false;});
        this.clouds.push({group,x,y,phase:i*1.7});
      });
      this.sun=mesh(scene,new T.SphereGeometry(.48,24,16),new T.MeshBasicMaterial({color:'#edbb73',transparent:true,depthWrite:false}));this.sun.castShadow=false;
      this.moon=new T.Group();scene.add(this.moon);
      const moonShape=new T.Shape();moonShape.absarc(0,0,.4,.35,Math.PI*1.9,false);moonShape.quadraticCurveTo(-.22,.09,Math.cos(.35)*.4,Math.sin(.35)*.4);
      this.moonMaterial=new T.MeshBasicMaterial({color:'#f9eac5',side:T.DoubleSide,transparent:true,depthWrite:false});
      const moonMesh=new T.Mesh(new T.ShapeGeometry(moonShape),this.moonMaterial);this.moon.add(moonMesh);
      const p=[];for(let i=0;i<75;i++)p.push(between(-12,12),between(0,11),between(-9,-5));
      const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(p,3));
      this.stars=new T.Points(sg,new T.PointsMaterial({color:'#fff1cf',size:.035,transparent:true,opacity:0,depthWrite:false}));scene.add(this.stars);
    }
    update(time,phase,night,camera) {
      this.clouds.forEach(({group,x,y,phase:p})=>{group.position.x=x+Math.sin(time*.1+p)*.3;group.position.y=y+Math.sin(time*.16+p)*.12;});
      const angle=phase*TAU;
      const altitude=Math.cos(angle);
      this.sun.position.set(-Math.sin(angle)*6,altitude*5+.8,-4.5);
      this.sun.material.opacity=smooth(altitude,-.25,.2);this.sun.visible=this.sun.material.opacity>.001;
      this.moon.position.set(Math.sin(angle)*6,-altitude*5+.8,-4.5);
      this.moonMaterial.opacity=smooth(-altitude,-.25,.2);this.moon.visible=this.moonMaterial.opacity>.001;this.moon.quaternion.copy(camera.quaternion);
      this.stars.material.opacity=night*.8;
    }
  }

  class DayNightCycle {
    constructor(scene,renderer) {
      this.phase=0;this.duration=15;this.speed=1;this.paused=false;this.night=0;
      this.scene=scene;this.renderer=renderer;
      this.ambient=new T.HemisphereLight('#fff3da','#777951',2.35);scene.add(this.ambient);
      this.sunlight=new T.DirectionalLight('#ffe5bf',3.3);this.sunlight.position.set(-4,9,5);this.sunlight.castShadow=true;
      this.sunlight.shadow.mapSize.set(1024,1024);Object.assign(this.sunlight.shadow.camera,{left:-8,right:8,top:10,bottom:-7,near:.5,far:35});this.sunlight.shadow.bias=-.001;this.sunlight.shadow.normalBias=.045;scene.add(this.sunlight);
      this.fill=new T.DirectionalLight('#dbe9e8',1.1);this.fill.position.set(5,5,-6);scene.add(this.fill);
      this.stops=[
        {p:0,sky:'#f3eee4',halo:'#e9d7b6',ink:'#303c35',muted:'#7d8174',accent:'#b95c3c',ambient:'#fff3da',sun:'#ffe5c1',ground:'#8c9169',a:2.35,s:3.3,n:0},
        {p:.18,sky:'#f1e6d6',halo:'#eacda6',ink:'#453e34',muted:'#887c6d',accent:'#b45e3b',ambient:'#ffe1bf',sun:'#ffd097',ground:'#89775c',a:2.1,s:3,n:0},
        {p:.29,sky:'#e7c3ad',halo:'#eaa982',ink:'#593e39',muted:'#967269',accent:'#a34e3c',ambient:'#f3b8a2',sun:'#ff9965',ground:'#88635e',a:1.6,s:2.8,n:.8},
        {p:.43,sky:'#303e51',halo:'#465264',ink:'#e4e6d9',muted:'#a8b4b6',accent:'#efba80',ambient:'#a7bddc',sun:'#adbee5',ground:'#595d78',a:.95,s:1.2,n:1},
        {p:.62,sky:'#29394c',halo:'#3b4e62',ink:'#e4e6d9',muted:'#a8b4b6',accent:'#efba80',ambient:'#a7bddc',sun:'#b3c8ed',ground:'#595d78',a:.95,s:1.2,n:1},
        {p:.72,sky:'#b7adb9',halo:'#d1aeb3',ink:'#4c4752',muted:'#787482',accent:'#9d5e51',ambient:'#e3c7dc',sun:'#ebc8d6',ground:'#817388',a:1.6,s:1.7,n:0},
        {p:.82,sky:'#ece1d8',halo:'#eed1bb',ink:'#48463b',muted:'#8a8073',accent:'#b37554',ambient:'#ffe0c7',sun:'#ffdbb4',ground:'#9a876c',a:2,s:2.6,n:0},
      ];
      this.stops.push({...this.stops[0],p:1});
      this.stops.forEach(s=>['sky','halo','ink','muted','accent','ambient','sun','ground'].forEach(k=>s[k]=new T.Color(s[k])));
      this.color=new T.Color();this.fog=new T.Fog('#f3eee4',24,48);scene.fog=this.fog;this.uiTimer=1;
    }
    update(dt) {
      if(!this.paused)this.phase=(this.phase+dt*this.speed/this.duration)%1;
      const p=this.phase;let a=this.stops[0],b=this.stops[1];
      for(let i=0;i<this.stops.length-1;i++)if(p>=this.stops[i].p&&p<=this.stops[i+1].p){a=this.stops[i];b=this.stops[i+1];break;}
      // Smoothstep between cyclic palette anchors has zero slope at each stop;
      // linear-color interpolation keeps sky, fog, light and UI in the same dusk.
      const t=smooth(p,a.p,b.p),mix=(key)=>this.color.copy(a[key]).lerp(b[key],t);
      this.ambient.color.copy(mix('ambient'));this.ambient.groundColor.copy(mix('ground'));this.ambient.intensity=lerp(a.a,b.a,t);
      this.sunlight.color.copy(mix('sun'));this.sunlight.intensity=lerp(a.s,b.s,t);
      this.fog.color.copy(mix('sky'));this.fog.near=lerp(26,21,lerp(a.n,b.n,t));
      this.night=lerp(a.n,b.n,t);
      // Lamps fade on at dusk and reach zero before the dawn anchor, avoiding
      // abrupt threshold flicker. No lights or materials are allocated per frame.
      emissives.forEach((m,i)=>m.emissiveIntensity=this.night*(i===0?2.4:1.8));
      lamps.forEach((l,i)=>l.intensity=this.night*(i===0?6:3));
      this.fill.intensity=lerp(1.1,.6,this.night);
      this.sunlight.position.set(-4*Math.cos(p*TAU),7+Math.abs(Math.cos(p*TAU))*2,5);
      this.uiTimer+=dt;
      if(this.uiTimer>.065||dt===0){
        this.uiTimer=0;const style=document.documentElement.style;
        ['sky','ink','muted','accent'].forEach(k=>style.setProperty('--'+k,'#'+mix(k).getHexString()));
        const halo=mix('halo');style.setProperty('--halo',`rgba(${Math.round(halo.r*255)},${Math.round(halo.g*255)},${Math.round(halo.b*255)},.22)`);
        style.setProperty('--line',this.night>.65?'rgba(213,224,222,.16)':'rgba(80,85,65,.16)');
        style.setProperty('--panel',this.night>.65?'rgba(49,65,81,.76)':'rgba(253,250,241,.65)');
        style.setProperty('--soft',this.night>.65?'rgba(213,224,222,.08)':'rgba(80,85,65,.055)');
        document.body.classList.toggle('night',this.night>.65);
        $('#time-progress').style.width=(p*100)+'%';
        const phase=p<.21||p>=.88?0:p<.38?1:p<.69?2:3;
        document.querySelectorAll('.phase-button').forEach((el,i)=>{el.classList.toggle('active',i===phase);el.setAttribute('aria-pressed',i===phase?'true':'false');});
        $('#status-text').textContent=['A quiet afternoon','Everything turns to gold','A thousand little lights','The world wakes softly'][phase];
        const minutes=Math.floor(((p*24+12)%24)*60);$('#world-clock').textContent=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
      }
    }
    seek(p){this.phase=p;this.update(0);}
  }

  class CameraOrbit {
    constructor(camera,element) {
      this.camera=camera;this.element=element;this.angle=.48;this.targetAngle=.48;this.elevation=.43;this.zoom=1;this.targetZoom=1;this.pointer=null;this.lastX=0;this.moved=false;this.autoUntil=0;
      element.addEventListener('pointerdown',e=>{
        if(e.button!==0)return;this.pointer=e.pointerId;this.lastX=e.clientX;this.moved=false;this.autoUntil=0;element.setPointerCapture(e.pointerId);element.classList.add('dragging');
      });
      element.addEventListener('pointermove',e=>{if(e.pointerId!==this.pointer)return;const dx=e.clientX-this.lastX;this.targetAngle-=dx*.007;this.lastX=e.clientX;if(Math.abs(dx)>1)this.moved=true;});
      const release=e=>{if(e.pointerId!==this.pointer)return;this.pointer=null;element.classList.remove('dragging');};
      element.addEventListener('pointerup',release);element.addEventListener('pointercancel',release);element.addEventListener('lostpointercapture',release);
      element.addEventListener('wheel',e=>{e.preventDefault();this.targetZoom=clamp(this.targetZoom-e.deltaY*.001,.8,1.45);},{passive:false});
    }
    reset(){this.targetAngle=this.angle+Math.atan2(Math.sin(.48-this.angle),Math.cos(.48-this.angle));this.targetZoom=1;this.autoUntil=0;}
    update(dt,time) {
      if(time<this.autoUntil&&this.pointer===null)this.targetAngle+=dt*.19;
      const damping=1-Math.exp(-dt*9);this.angle=lerp(this.angle,this.targetAngle,damping);this.zoom=lerp(this.zoom,this.targetZoom,damping);
      const radius=18;
      this.camera.position.set(Math.sin(this.angle)*radius,10.4,Math.cos(this.angle)*radius);
      this.camera.lookAt(0,1.65,0);this.camera.zoom=this.zoom;this.camera.updateProjectionMatrix();
    }
  }

  class AmbientAudio {
    constructor(){this.context=null;this.enabled=false;this.lastNote=0;this.voices=new Set();}
    async toggle() {
      if(!this.context) {
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Audio is unavailable in this browser.');
        this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);
        // A quiet filtered breeze is generated locally; no audio downloads.
        const buffer=this.context.createBuffer(1,this.context.sampleRate*3,this.context.sampleRate),data=buffer.getChannelData(0);
        let last=0;for(let i=0;i<data.length;i++){last=(last+(.02*(rand()*2-1)))/1.02;data[i]=last*3.5;}
        this.wind=this.context.createBufferSource();this.wind.buffer=buffer;this.wind.loop=true;
        this.filter=this.context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=650;
        const gain=this.context.createGain();gain.gain.value=.3;this.wind.connect(this.filter);this.filter.connect(gain);gain.connect(this.master);this.wind.start();
      }
      this.enabled=!this.enabled;
      if(this.enabled)await this.context.resume();
      this.master.gain.setTargetAtTime(this.enabled?.32:0,this.context.currentTime,.35);
      return this.enabled;
    }
    update(time,night) {
      if(!this.enabled||!this.context)return;
      this.filter.frequency.setTargetAtTime(lerp(850,300,night),this.context.currentTime,.5);
      if(time-this.lastNote<3.5)return;this.lastNote=time;
      const now=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();
      const notes=night>.5?[220,293.66,329.63,440]:[523.25,587.33,783.99,880];
      o.type='sine';o.frequency.value=notes[Math.floor(rand()*notes.length)];g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(.075,now+.04);g.gain.exponentialRampToValueAtTime(.0001,now+2.8);
      o.connect(g);g.connect(this.master);o.start(now);o.stop(now+3);this.voices.add(o);o.onended=()=>{o.disconnect();g.disconnect();this.voices.delete(o);};
    }
    dispose(){if(this.context){this.wind.stop();this.voices.forEach(o=>{try{o.stop();}catch(_){}o.disconnect();});this.context.close();}}
  }

  let renderer;
  try {renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch(error){
    $('#loading').classList.add('error');$('#loading').innerHTML='<span class="loading-mark">空</span><span>This garden needs WebGL.<br>Enable hardware acceleration and reload to visit.</span>';return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setClearColor(0x000000,0);
  renderer.domElement.setAttribute('aria-hidden','true');host.appendChild(renderer.domElement);
  const scene=new T.Scene();
  const camera=new T.OrthographicCamera(-10,10,7,-7,.1,80);
  const island=new Island(scene),leaves=new MapleLeafSystem(scene,180),sky=new Sky(scene),cycle=new DayNightCycle(scene,renderer),orbit=new CameraOrbit(camera,host),audio=new AmbientAudio();
  let animationId=0,elapsed=0,lastStamp=0,disposed=false,contextLost=false;
  let frames=0,fpsTime=0,lastFps=60,toastTimer;
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2200);}
  function resize(){
    const {width,height}=host.getBoundingClientRect();if(!width||!height)return;
    const aspect=width/height;
    // Fit both the tower's height and island's width, including tiny iframe cards.
    const viewHeight=Math.max(12.8,13.6/aspect);
    camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  }
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  orbit.update(1,0);cycle.update(0);
  const setIcon=(button,id)=>button.querySelector('use').setAttribute('href','#'+id);
  function toggleTime(){cycle.paused=!cycle.paused;const b=$('#play-toggle');setIcon(b,cycle.paused?'i-play':'i-pause');b.setAttribute('aria-label',cycle.paused?'Resume day-night cycle':'Pause day-night cycle');b.setAttribute('aria-pressed',String(cycle.paused));toast(cycle.paused?'Time stands still. The garden breathes.':'Let the day drift.');}
  $('#play-toggle').addEventListener('click',toggleTime);
  document.querySelectorAll('.phase-button').forEach(b=>b.addEventListener('click',()=>{cycle.seek(Number(b.dataset.phase));}));
  function changeSpeed(){cycle.speed=cycle.speed===1?2:cycle.speed===2?4:1;$('#speed-toggle').textContent=cycle.speed+'×';$('#speed-toggle').setAttribute('aria-label',`Cycle speed: ${cycle.speed} times. Click to change.`);$('#cycle-seconds').textContent=String(15/cycle.speed);}
  $('#speed-toggle').addEventListener('click',changeSpeed);
  $('#reset-view').addEventListener('click',()=>{orbit.reset();toast('Back to a familiar little view.');});
  $('#explore').addEventListener('click',()=>{orbit.autoUntil=elapsed+TAU/.19;toast('A slow trip around the garden. Drag to take over.');});
  $('#leaf-toggle').addEventListener('click',()=>{const on=leaves.toggle();$('#leaf-toggle').setAttribute('aria-pressed',String(on));toast(on?'Autumn is in the air.':'A moment without the breeze.');});
  async function toggleSound(){try{const on=await audio.toggle();setIcon($('#sound-toggle'),on?'i-sound':'i-muted');$('#sound-toggle').setAttribute('aria-pressed',String(on));$('#sound-toggle').setAttribute('aria-label',on?'Mute ambient sound':'Enable ambient sound');toast(on?'A breeze, and a distant chime.':'Sound off. A little quiet.');}catch(e){toast('Ambient sound is unavailable in this browser.');}}
  $('#sound-toggle').addEventListener('click',toggleSound);
  const dialog=$('#info-dialog');$('#info-toggle').addEventListener('click',()=>dialog.showModal());$('#close-info').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
  window.addEventListener('keydown',e=>{
    if(dialog.open||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if(e.code==='Space'){if(e.target.closest('button,a'))return;e.preventDefault();toggleTime();}
    else if(e.key.toLowerCase()==='f')changeSpeed();
    else if(e.key.toLowerCase()==='r'){orbit.reset();toast('Back to the garden.');}
    else if(e.key.toLowerCase()==='m')toggleSound();
    else if(e.key.toLowerCase()==='d')$('#debug').hidden=!$('#debug').hidden;
    else if(e.key==='ArrowLeft'){e.preventDefault();orbit.targetAngle-=.18;orbit.autoUntil=0;}
    else if(e.key==='ArrowRight'){e.preventDefault();orbit.targetAngle+=.18;orbit.autoUntil=0;}
    else if(e.key==='+'||e.key==='=')orbit.targetZoom=clamp(orbit.targetZoom+.1,.8,1.45);
    else if(e.key==='-')orbit.targetZoom=clamp(orbit.targetZoom-.1,.8,1.45);
  });
  function animate(stamp){
    if(disposed||contextLost)return;
    animationId=requestAnimationFrame(animate);
    // Clamp gaps (background tabs / slow frames) to avoid physics teleports.
    // Day-night time uses the real visible-frame delta so its default period is 15s.
    const realDt=lastStamp?Math.max(0,(stamp-lastStamp)/1000):0;lastStamp=stamp;
    const dt=Math.min(realDt,.05);elapsed+=dt;
    island.update(elapsed);leaves.update(dt,elapsed);cycle.update(realDt);orbit.update(dt,elapsed);sky.update(elapsed,cycle.phase,cycle.night,camera);audio.update(elapsed,cycle.night);
    renderer.render(scene,camera);
    frames++;fpsTime+=realDt;
    if(fpsTime>=.5){lastFps=Math.round(frames/fpsTime);frames=0;fpsTime=0;if(!$('#debug').hidden)$('#debug').textContent=`${lastFps} FPS  ·  ${leaves.visible?leaves.count:0} leaves\n${renderer.info.render.calls} draw calls  ·  ${renderer.info.memory.geometries} geometries\n${(cycle.phase*15).toFixed(1)} / 15s  ·  ${cycle.speed}×`;}
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelAnimationFrame(animationId);lastStamp=0;if(audio.context)audio.context.suspend();}
    else if(!disposed&&!contextLost){lastStamp=0;cancelAnimationFrame(animationId);animationId=requestAnimationFrame(animate);if(audio.enabled)audio.context.resume();}
  });
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(animationId);toast('The sky is taking a breath. Restoring…');});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;lastStamp=0;animationId=requestAnimationFrame(animate);});
  window.addEventListener('pagehide',event=>{
    if(event.persisted)return;disposed=true;cancelAnimationFrame(animationId);clearTimeout(toastTimer);observer.disconnect();audio.dispose();
    const gs=new Set(Object.values(geometries)),ms=new Set(materials.values());scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>ms.add(m));else ms.add(o.material);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());renderer.dispose();
  });
  // Read-only diagnostics are useful when this page is embedded in a gallery.
  window.garden={get stats(){return {phase:cycle.phase,paused:cycle.paused,speed:cycle.speed,particles:leaves.visible?leaves.count:0,fps:lastFps,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries};}};
  $('#loading').classList.add('loaded');setTimeout(()=>$('#loading').remove(),600);
  animationId=requestAnimationFrame(animate);
})();
