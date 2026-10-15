/* Little Worlds — all geometry, textures, animation and audio are generated here. */
'use strict';

(() => {
  if (!window.THREE) { showError(); return; }
  const T = THREE;
  const TAU = Math.PI * 2;
  const clamp = T.MathUtils.clamp;
  const lerp = T.MathUtils.lerp;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // A seeded random source makes the composition identical on every visit.
  let seed = 7531;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + random() * (b - a);
  const $ = id => document.getElementById(id);
  const GEO = {
    box: new T.BoxGeometry(1, 1, 1), sphere: new T.SphereGeometry(1, 12, 8),
    ico: new T.IcosahedronGeometry(1, 1), cone: new T.ConeGeometry(1, 1, 4),
    cylinder: new T.CylinderGeometry(1, 1, 1, 12), plane: new T.PlaneGeometry(1, 1),
    circle: new T.CircleGeometry(1, 48), torus: new T.TorusGeometry(1, .035, 6, 64)
  };
  const shadeTexture = new T.DataTexture(new Uint8Array([105, 163, 208, 255]), 4, 1, T.RedFormat);
  shadeTexture.minFilter = shadeTexture.magFilter = T.NearestFilter;
  shadeTexture.needsUpdate = true;
  const toon = color => new T.MeshToonMaterial({ color, gradientMap: shadeTexture });
  const MAT = {
    sand: toon('#dfb984'), trim: toon('#f4d9a4'), stone: toon('#b88c65'), darkStone: toon('#927455'),
    roof: toon('#3e6c66'), roofEdge: toon('#2c514e'), grass: toon('#99b782'), path: toon('#eadac0'),
    soil: toon('#b77f59'), soilLight: toon('#d49d70'), soilDark: toon('#8f624c'),
    water: new T.MeshStandardMaterial({ color:'#6db4b7', roughness:.33, metalness:.15 }),
    wave: new T.MeshBasicMaterial({ color:'#c2e3d8', transparent:true, opacity:.65 }),
    road: toon('#c1b9a1'), roadLine: toon('#f2e9cf'), red: toon('#bd503b'), redDark: toon('#883d31'),
    cream: toon('#faf0d2'), blue: toon('#648c91'), charcoal: toon('#344645'), black: toon('#283b37'),
    trunk: toon('#80684d'), pink: toon('#d9a29d'), white: toon('#eee7d0'), brass: toon('#b8974c'),
    foliage: toon('#7b9e69'), foliage2: toon('#b7c58a'), blossom: toon('#dcb1ac'),
    window: new T.MeshStandardMaterial({color:'#4e6661',roughness:.55,emissive:'#ffc773',emissiveIntensity:.05}),
    glow: new T.MeshStandardMaterial({color:'#ffedbf',emissive:'#ffd58a',emissiveIntensity:.1,roughness:.5}),
    snow: new T.MeshToonMaterial({color:'#f0f4ed',gradientMap:shadeTexture,transparent:true,opacity:0,depthWrite:false})
  };
  function mesh(parent, geometry, material, position, scale, rotation) {
    const m = new T.Mesh(geometry, material);
    if (position) m.position.set(...position);
    if (scale) m.scale.set(...scale);
    if (rotation) m.rotation.set(...rotation);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  }
  const box = (g, m, p, s, r) => mesh(g, GEO.box, m, p, s, r);
  const sphere = (g, m, p, s) => mesh(g, GEO.sphere, m, p, s);
  const cylinder = (g, m, p, s, r) => mesh(g, GEO.cylinder, m, p, s, r);
  function group(parent, x=0, y=0, z=0) { const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g; }
  function beam(g, a, b, radius, mat=MAT.cream) {
    const start=new T.Vector3(...a), end=new T.Vector3(...b), delta=end.clone().sub(start);
    const m=cylinder(g,mat,start.clone().add(end).multiplyScalar(.5).toArray(),[radius,delta.length(),radius]);
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()); return m;
  }
  function shapeMesh(g, points, material, y, depth=0) {
    const shape=new T.Shape();points.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));shape.closePath();
    const geo=depth?new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false}):new T.ShapeGeometry(shape);
    return mesh(g,geo,material,[0,y,0],null,[-Math.PI/2,0,0]);
  }
  // Repeated static geometry is consolidated by geometry/material. The island keeps
  // one parent transform for its bob; the wheel, boat and bus remain separate.
  function batchStatic(root) {
    root.updateMatrixWorld(true);
    const inverse=new T.Matrix4().copy(root.matrixWorld).invert();
    const batches=new Map();
    function collect(node) {
      if(node.userData.dynamic) return;
      if(node.isMesh && !Array.isArray(node.material)) {
        const key=node.geometry.uuid+node.material.uuid;
        if(!batches.has(key)) batches.set(key,[]);
        batches.get(key).push(node);
      }
      [...node.children].forEach(collect);
    }
    [...root.children].forEach(collect);
    const transform=new T.Matrix4();
    for(const items of batches.values()) {
      if(items.length<3) continue;
      const inst=new T.InstancedMesh(items[0].geometry,items[0].material,items.length);
      items.forEach((item,i)=>{transform.multiplyMatrices(inverse,item.matrixWorld);inst.setMatrixAt(i,transform);item.removeFromParent();});
      inst.castShadow=true;inst.receiveShadow=true;inst.instanceMatrix.needsUpdate=true;root.add(inst);
    }
  }
  function clockTexture() {
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
    ctx.fillStyle='#f8edc7';ctx.fillRect(0,0,256,256);
    ctx.translate(128,128);ctx.strokeStyle='#3d554c';ctx.fillStyle='#3d554c';
    ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,117,0,TAU);ctx.stroke();
    ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(0,0,78,0,TAU);ctx.stroke();
    const numerals=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
    ctx.font='bold 22px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';
    numerals.forEach((n,i)=>{const a=i/12*TAU;ctx.fillText(n,Math.sin(a)*96,-Math.cos(a)*96);});
    for(let i=0;i<60;i++){const a=i/60*TAU;ctx.lineWidth=i%5?1:3;ctx.beginPath();ctx.moveTo(Math.sin(a)*109,-Math.cos(a)*109);ctx.lineTo(Math.sin(a)*114,-Math.cos(a)*114);ctx.stroke();}
    ctx.lineCap='round';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-46,-32);ctx.lineTo(0,0);ctx.lineTo(54,-61);ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,8,0,TAU);ctx.fill();
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;
  }

  class BigBen {
    constructor(parent) {
      const g=group(parent,-1.25,.52,-1.35);this.group=g;
      box(g,MAT.stone,[0,.14,0],[2.12,.28,2.12]);
      box(g,MAT.sand,[0,3.13,0],[1.52,6.1,1.52]);
      for(const x of [-.77,.77])for(const z of [-.77,.77]){
        box(g,MAT.trim,[x,3.35,z],[.16,6.5,.16]);
        box(g,MAT.stone,[x,.55,z],[.27,.6,.27]);
      }
      for(let level=0;level<5;level++){
        const y=1+level*.98;
        for(let side=0;side<4;side++){
          const face=group(g);face.rotation.y=side*Math.PI/2;
          for(const x of [-.4,0,.4]){
            box(face,MAT.stone,[x,y+.1,.777],[.25,.74,.045]);
            box(face,MAT.window,[x,y+.1,.804],[.13,.56,.035]);
            box(face,MAT.trim,[x,y+.1,.83],[.035,.57,.025]);
          }
          box(face,MAT.trim,[0,y-.37,.81],[1.65,.1,.1]);
        }
      }
      box(g,MAT.trim,[0,5.98,0],[1.94,.22,1.94]);
      box(g,MAT.sand,[0,6.85,0],[1.85,1.56,1.85]);
      const tex=clockTexture();this.clockMat=new T.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:'#ffd596',emissiveIntensity:.05,roughness:.7});
      for(let side=0;side<4;side++) {
        const face=group(g);face.rotation.y=side*Math.PI/2;
        mesh(face,GEO.circle,MAT.roofEdge,[0,6.88,.937],[.77,.77,1]);
        mesh(face,GEO.circle,MAT.brass,[0,6.88,.948],[.7,.7,1]);
        mesh(face,GEO.circle,this.clockMat,[0,6.88,.96],[.62,.62,1]);
        for(const x of [-.86,.86])box(face,MAT.trim,[x,6.85,.96],[.1,1.55,.1]);
      }
      box(g,MAT.trim,[0,7.67,0],[2.1,.16,2.1]);
      box(g,MAT.stone,[0,7.87,0],[1.66,.22,1.66]);
      box(g,MAT.roof,[0,8.15,0],[1.48,.45,1.48]);
      for(let side=0;side<4;side++){
        const f=group(g);f.rotation.y=side*Math.PI/2;
        for(const x of [-.45,-.15,.15,.45])box(f,MAT.trim,[x,8.14,.76],[.1,.42,.08]);
      }
      mesh(g,GEO.cone,MAT.roof,[0,8.98,0],[1.18,1.42,1.18],[0,Math.PI/4,0]);
      box(g,MAT.brass,[0,9.48,0],[.36,.18,.36]);
      mesh(g,GEO.cone,MAT.roofEdge,[0,9.89,0],[.38,.78,.38],[0,Math.PI/4,0]);
      cylinder(g,MAT.brass,[0,10.47,0],[.035,.6,.035]);
      sphere(g,MAT.brass,[0,10.7,0],[.09,.09,.09]);
      for(const x of [-.91,.91])for(const z of [-.91,.91]){
        box(g,MAT.trim,[x,7.91,z],[.17,.44,.17]);
        mesh(g,GEO.cone,MAT.roof,[x,8.23,z],[.18,.32,.18],[0,Math.PI/4,0]);
      }
      // A little Parliament wing anchors the tower to the miniature city.
      const palace=group(parent,-3.2,.5,-1.4);
      box(palace,MAT.sand,[0,.8,0],[2.2,1.6,1.45]);
      box(palace,MAT.trim,[0,1.7,0],[2.35,.15,1.65]);
      mesh(palace,GEO.cone,MAT.roof,[0,1.98,0],[1.65,.6,1.15],[0,Math.PI/4,0]);
      for(let i=0;i<7;i++){
        const x=-.95+i*.32;
        box(palace,MAT.window,[x,.93,.74],[.15,.75,.04]);
        box(palace,MAT.trim,[x,1.77,.77],[.1,.37,.11]);
      }
    }
  }

  class LondonEye {
    constructor(parent) {
      const g=group(parent,-5.6,.6,-2.3);g.rotation.y=-.15;
      box(g,MAT.stone,[0,.05,0],[2.5,.15,1.8]);
      beam(g,[-1.15,.1,.65],[0,3.9,0],.12,MAT.cream);
      beam(g,[1.15,.1,.65],[0,3.9,0],.12,MAT.cream);
      beam(g,[0,.1,-.7],[0,3.9,0],.11,MAT.white);
      this.wheel=group(g,0,3.9,0);this.wheel.userData.dynamic=true;
      const radius=3.18;
      for(const z of [-.11,.11])mesh(this.wheel,GEO.torus,MAT.white,[0,0,z],[radius,radius,radius]);
      mesh(this.wheel,GEO.torus,MAT.glow,[0,0,.13],[radius*.97,radius*.97,radius*.97]);
      this.cabins=[];
      for(let i=0;i<24;i++){
        const a=i/24*TAU;
        beam(this.wheel,[0,0,0],[Math.sin(a)*radius,Math.cos(a)*radius,0],.018,MAT.cream);
        const pod=group(this.wheel,Math.sin(a)*radius,Math.cos(a)*radius,0);
        sphere(pod,MAT.cream,[0,0,0],[.27,.21,.25]);
        sphere(pod,MAT.blue,[0,.025,.025],[.218,.137,.23]);
        box(pod,MAT.cream,[0,-.12,.02],[.33,.055,.38]);
        box(pod,MAT.cream,[0,.01,.25],[.025,.23,.018]);
        this.cabins.push(pod);
      }
      sphere(g,MAT.brass,[0,3.9,.16],[.2,.2,.16]);
    }
    update(t) { this.wheel.rotation.z=-t*.035;for(const pod of this.cabins)pod.rotation.z=-this.wheel.rotation.z; }
  }

  class TowerBridge {
    constructor(parent) {
      const g=group(parent,3.3,.55,1.65);
      box(g,MAT.blue,[0,.65,0],[7.9,.21,1.1]);
      box(g,MAT.path,[0,.79,0],[7.9,.09,.88]);
      for(const z of [-.52,.52]) {
        box(g,MAT.cream,[0,.99,z],[7.9,.055,.045]);
        for(let x=-3.85;x<4;x+=.27)box(g,MAT.cream,[x,.9,z],[.025,.2,.025]);
      }
      for(const x of [-2.15,2.15]) {
        box(g,MAT.stone,[x,.12,0],[1.37,.35,1.5]);
        box(g,MAT.sand,[x,.32,0],[1.04,.42,1.12]);
        // Two pillars leave a genuinely open passage beneath each tower.
        for(const z of [-.44,.44])box(g,MAT.trim,[x,1.3,z],[1.12,1.25,.26]);
        box(g,MAT.sand,[x,2.6,0],[1.12,1.55,1.12]);
        box(g,MAT.trim,[x,1.88,0],[1.29,.15,1.26]);
        box(g,MAT.trim,[x,3.37,0],[1.33,.18,1.3]);
        for(const dx of [-.32,.32]){
          box(g,MAT.window,[x+dx,2.66,.575],[.17,.7,.03]);
          box(g,MAT.trim,[x+dx,2.66,.6],[.035,.72,.03]);
          box(g,MAT.window,[x+dx,2.66,-.575],[.17,.7,.03]);
        }
        mesh(g,GEO.cone,MAT.roof,[x,3.86,0],[1.02,.88,1.02],[0,Math.PI/4,0]);
        for(const dx of [-.51,.51])for(const z of [-.5,.5]){
          box(g,MAT.trim,[x+dx,3.46,z],[.23,.65,.23]);
          mesh(g,GEO.cone,MAT.roof,[x+dx,3.94,z],[.26,.45,.26],[0,Math.PI/4,0]);
          cylinder(g,MAT.brass,[x+dx,4.24,z],[.019,.2,.019]);
        }
        cylinder(g,MAT.brass,[x,4.47,0],[.018,.5,.018]);
        box(g,MAT.red,[x+.15,4.6,0],[.29,.17,.022]);
      }
      for(const z of [-.36,.36]){
        box(g,MAT.blue,[0,2.95,z],[4.3,.28,.15]);
        box(g,MAT.trim,[0,3.12,z],[4.35,.06,.2]);
        for(let x=-1.5;x<=1.6;x+=.37){
          beam(g,[x,2.83,z+.09],[x+.31,3.08,z+.09],.025,MAT.cream);
          beam(g,[x,3.08,z+.09],[x+.31,2.83,z+.09],.025,MAT.cream);
        }
      }
      // Blue suspension curves and their slim hangers, repeated on both sides.
      for(const z of [-.57,.57])for(const side of [-1,1]) {
        const points=[];
        for(let i=0;i<=18;i++){
          const p=i/18,x=side*(2.15+p*1.85),y=.95+1.9*(1-p)**2;
          points.push(new T.Vector3(x,y,z));
          if(i%3===0)beam(g,[x,.85,z],[x,y,z],.022,MAT.blue);
        }
        mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points),20,.055,5,false),MAT.blue);
      }
    }
  }

  class Island {
    constructor(scene) {
      this.root=group(scene);this.waterLines=[];this.snowCaps=[];
      const outline=[];
      const count=48;
      for(let i=0;i<count;i++){const a=i/count*TAU,r=1+.035*Math.sin(a*5)+.022*Math.cos(a*7);outline.push([Math.cos(a)*9*r,Math.sin(a)*6.5*r]);}
      // Corresponding polygon rings create a chunky, tapering, low-poly cliff.
      const rings=[{s:1,y:.36},{s:1.015,y:-.1},{s:.96,y:-1.15},{s:.78,y:-2.2},{s:.43,y:-3.15},{s:.14,y:-3.65}];
      const positions=[],colors=[];const cliffColors=['#c79970','#d5a478','#b98560','#b47d58','#9c7055'];
      for(let j=0;j<rings.length-1;j++)for(let i=0;i<count;i++){
        const k=(i+1)%count,a=outline[i],b=outline[k],r=rings[j],s=rings[j+1];
        const verts=[[a[0]*r.s,r.y,a[1]*r.s],[b[0]*r.s,r.y,b[1]*r.s],[a[0]*s.s,s.y,a[1]*s.s],[b[0]*r.s,r.y,b[1]*r.s],[b[0]*s.s,s.y,b[1]*s.s],[a[0]*s.s,s.y,a[1]*s.s]];
        const color=new T.Color(cliffColors[j]).multiplyScalar(range(.91,1.08));
        verts.forEach(v=>{positions.push(...v);colors.push(color.r,color.g,color.b);});
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
      mesh(this.root,geo,new T.MeshToonMaterial({vertexColors:true,gradientMap:shadeTexture,side:T.DoubleSide}));
      shapeMesh(this.root,outline,MAT.path,.36,.12);
      shapeMesh(this.root,outline.map(p=>p.map(v=>v*.97)),MAT.grass,.49);
      const snowTop=shapeMesh(this.root,outline.map(p=>p.map(v=>v*.967)),MAT.snow,.505);snowTop.castShadow=false;
      // The river remains inside the island boundary, with a soft stone bank.
      const river=[[1,-6.0],[3.3,-5.95],[3.45,-4.2],[3.1,-2.4],[3.85,-.3],[4.1,2.3],[5.0,4.95],[3.0,6.0],[2.25,4.2],[1.5,2.3],[1.75,.2],[.9,-2.2],[1.4,-4.1]];
      shapeMesh(this.root,river.map(([x,z])=>[x+(x>2.5?.12:-.12),z]),MAT.trim,.515);
      shapeMesh(this.root,river,MAT.water,.53);
      // Waterfall: stepped sheets disappear into a tiny spray cloud beneath the island.
      box(this.root,MAT.water,[3.94,-.29,5.42],[1.3,1.65,.16],[0,-.48,0]);
      for(let i=0;i<5;i++)box(this.root,MAT.wave,[3.5+i*.19,-.28,5.5-i*.1],[.035,range(.8,1.9),.025]);
      for(let i=0;i<32;i++){
        const z=range(-5.5,5.3);const x=2.35+Math.max(0,z)*.17+range(-.45,.45);
        const line=box(this.root,MAT.wave,[x,.548,z],[range(.12,.42),.009,.025]);line.userData.dynamic=true;
        this.waterLines.push({mesh:line,z,width:line.scale.x,phase:range(0,TAU)});
      }
      this.makePaths();
      this.ben=new BigBen(this.root);this.eye=new LondonEye(this.root);this.bridge=new TowerBridge(this.root);
      this.makeNeighborhood();this.makeGarden();this.makeBus();this.makeBoat();
      // A few little fragments sell the impossible floating geography.
      [[-6,-2.2,3,.5],[6.8,-2.7,-1,.38],[-3,-3.8,-1,.3],[3,-4.1,2,.24]].forEach(([x,y,z,s])=>mesh(this.root,GEO.ico,MAT.soilLight,[x,y,z],[s,s*.8,s]));
      batchStatic(this.root);
    }
    makePaths(){
      const g=this.root;
      box(g,MAT.path,[-3.8,.525,.6],[7.2,.035,.85]);
      box(g,MAT.path,[-1.3,.525,1.0],[.9,.035,4.8]);
      box(g,MAT.road,[-3.35,.53,3.4],[7.8,.045,1.18]);
      box(g,MAT.path,[-3.35,.52,4.11],[8,.05,.22]);
      box(g,MAT.path,[-3.35,.52,2.7],[8,.05,.22]);
      for(let x=-7;x<.5;x+=.65)box(g,MAT.roadLine,[x,.558,3.4],[.31,.008,.035]);
      for(let z=3.05;z<3.9;z+=.15)box(g,MAT.roadLine,[-.55,.56,z],[.45,.01,.065]);
      // An inset plaza under the Eye, with radial paving stones.
      cylinder(g,MAT.path,[-5.6,.51,-2.3],[2.1,.055,2.1]);
      for(let i=0;i<18;i++){
        const a=i/18*TAU;
        box(g,MAT.trim,[-5.6+Math.cos(a)*1.8,.546,-2.3+Math.sin(a)*1.8],[.26,.015,.17],[0,-a,0]);
      }
    }
    makeNeighborhood(){
      const colors=['#d7a38a','#dcbf8e','#a7b4a0','#d1a581'];
      for(let i=0;i<4;i++){
        const g=group(this.root,-6.25+i*1.14,.55,1.35),h=[1.85,2.12,1.9,2.26][i];
        box(g,toon(colors[i]),[0,h/2,0],[1.02,h,1.12]);
        box(g,MAT.trim,[0,h+.04,0],[1.15,.13,1.24]);
        box(g,MAT.roof,[0,h+.2,0],[1.12,.22,1.18]);
        box(g,MAT.redDark,[.3,h+.47,-.22],[.17,.42,.22]);
        for(let row=0;row<2;row++)for(const x of [-.26,.26]){
          const y=h-.42-row*.66;
          box(g,MAT.cream,[x,y,.578],[.32,.43,.05]);
          box(g,MAT.window,[x,y,.61],[.23,.34,.025]);
          box(g,MAT.cream,[x,y,.63],[.025,.36,.02]);
          box(g,MAT.cream,[x,y,.63],[.24,.025,.02]);
          box(g,MAT.trim,[x,y-.24,.64],[.38,.065,.12]);
        }
        box(g,MAT.roofEdge,[0,.33,.58],[.25,.61,.035]);
        box(g,MAT.trim,[0,.05,.77],[.42,.1,.32]);
        sphere(g,MAT.brass,[.075,.31,.61],[.022,.022,.02]);
        if(i===0||i===2){box(g,MAT.cream,[0,.98,.78],[.97,.07,.44],[.15,0,0]);for(let j=0;j<4;j++)box(g,MAT.red,[j*.24-.36,.985,.8],[.115,.075,.43],[.15,0,0]);}
      }
      // Classic red telephone box, with bright mullions and a small cream sign.
      const phone=group(this.root,-2.12,.56,2.25);
      box(phone,MAT.red,[0,.56,0],[.43,1.12,.43]);box(phone,MAT.redDark,[0,.07,0],[.48,.14,.48]);
      sphere(phone,MAT.red,[0,1.12,0],[.25,.13,.25]);
      for(let side=0;side<4;side++){
        const face=group(phone);face.rotation.y=side*Math.PI/2;
        box(face,MAT.window,[0,.58,.225],[.32,.73,.02]);
        for(const x of [-.105,.105])box(face,MAT.red,[x,.58,.245],[.028,.77,.02]);
        for(let y=.25;y<.95;y+=.17)box(face,MAT.red,[0,y,.245],[.35,.027,.02]);
        box(face,MAT.cream,[0,1.02,.225],[.32,.1,.02]);
      }
    }
    tree(x,z,size=1,type=0){
      const g=group(this.root,x,.53,z);g.scale.setScalar(size);
      cylinder(g,MAT.trunk,[0,.6,0],[.085,1.2,.085]);
      beam(g,[0,.65,0],[.33,1.15,.05],.045,MAT.trunk);
      const mat=[MAT.foliage,MAT.foliage2,MAT.blossom][type];
      [[0,1.53,0,.68],[-.36,1.3,.05,.48],[.35,1.46,.1,.5],[.05,1.85,-.03,.47]].forEach(([a,b,c,s])=>mesh(g,GEO.ico,mat,[a,b,c],[s,s*1.06,s]));
      sphere(g,MAT.snow,[0,1.93,.0],[.5,.15,.43]);
    }
    makeGarden(){
      const trees=[[-7.3,-.2,1.1,2],[-7.7,1.6,.8,0],[-7.0,-3.7,1,0],[-4,-4.8,.85,2],[-2.7,-4.7,1.2,0],[-.4,-4.6,.8,1],[4.5,-4.5,1.1,0],[6.4,-3,.9,2],[7,-1.4,1.15,1],[7.2,2.7,.85,0],[5.8,4.3,.85,2],[-4.5,4.8,.75,0],[-6.2,4.2,.85,1],[-1.8,4.8,.7,2]];
      trees.forEach(t=>this.tree(...t));
      for(let i=0;i<35;i++){
        const a=range(0,TAU),x=Math.cos(a)*range(7.6,8.6),z=Math.sin(a)*range(5.2,5.8);
        if(x>1.2&&x<5&&z>3)continue;
        mesh(this.root,GEO.ico,i%2?MAT.foliage:MAT.foliage2,[x,.7,z],[range(.23,.5),range(.2,.4),range(.23,.45)]);
        if(i%3===0){
          cylinder(this.root,MAT.trunk,[x,.7,z],[.015,.2,.015]);sphere(this.root,i%2?MAT.pink:MAT.cream,[x,.84,z],[.08,.06,.08]);
        }
      }
      // Moss hangs in rounded strands over the edge.
      for(let i=0;i<13;i++){
        const a=range(0,TAU),x=8.8*Math.cos(a),z=6.1*Math.sin(a);
        for(let j=0;j<3;j++)mesh(this.root,GEO.ico,MAT.foliage,[x-j*.06,.25-j*.27,z],[.24-j*.04,.3,.23-j*.035]);
      }
      for(const [x,z,rotation] of [[-4.2,.25,0],[6.5,.2,Math.PI/2],[-4.7,4.2,0]]){
        const b=group(this.root,x,.56,z);b.rotation.y=rotation;
        for(let j=0;j<3;j++)box(b,MAT.trunk,[0,.32,j*.105],[.83,.055,.075]);
        for(let j=0;j<2;j++)box(b,MAT.trunk,[0,.5+j*.11,-.03],[.83,.07,.05]);
        for(const dx of [-.31,.31])box(b,MAT.charcoal,[dx,.18,.1],[.045,.32,.29]);
      }
      for(const [x,z] of [[-7,2.65],[-3.3,2.65],[.2,2.65],[-4,.4],[5.5,-.2],[6.8,3]]){
        cylinder(this.root,MAT.charcoal,[x,1.14,z],[.035,1.22,.035]);
        box(this.root,MAT.charcoal,[x,1.79,z],[.22,.06,.22]);
        box(this.root,MAT.glow,[x,1.66,z],[.15,.21,.15]);
        mesh(this.root,GEO.cone,MAT.charcoal,[x,1.87,z],[.18,.13,.18],[0,Math.PI/4,0]);
      }
      // A low white garden fence follows the back-right lawn.
      for(let i=0;i<14;i++){
        const x=4.3+i*.22;
        box(this.root,MAT.cream,[x,.79,-2.55],[.05,.5,.055]);
      }
      box(this.root,MAT.cream,[5.7,.88,-2.55],[2.9,.05,.045]);
      box(this.root,MAT.cream,[5.7,.68,-2.55],[2.9,.05,.045]);
    }
    makeBus(){
      this.bus=group(this.root,-4,.76,3.4);this.bus.userData.dynamic=true;
      const b=this.bus;
      box(b,MAT.red,[0,.43,0],[1.55,.9,.59]);box(b,MAT.red,[0,.92,0],[1.42,.12,.57]);
      box(b,MAT.redDark,[0,.07,0],[1.58,.1,.6]);
      for(const z of [-.305,.305]){
        for(let i=0;i<5;i++)for(const y of [.34,.73])box(b,MAT.window,[-.56+i*.27,y,z],[.2,.22,.02]);
        box(b,MAT.cream,[0,.52,z],[1.04,.1,.022]);
      }
      for(const y of [.33,.73])box(b,MAT.window,[.785,y,0],[.025,.23,.45]);
      for(const z of [-.22,.22])box(b,MAT.glow,[.8,.14,z],[.02,.08,.09]);
      for(const x of [-.5,.48])for(const z of [-.31,.31]){
        cylinder(b,MAT.black,[x,.02,z],[.15,.085,.15],[Math.PI/2,0,0]);
        cylinder(b,MAT.stone,[x,.02,z*1.1],[.065,.015,.065],[Math.PI/2,0,0]);
      }
    }
    makeBoat(){
      this.boat=group(this.root,3.25,.6,3.7);this.boat.userData.dynamic=true;const g=this.boat;g.rotation.y=-.2;
      sphere(g,MAT.roofEdge,[0,.04,0],[.33,.15,.7]);box(g,MAT.cream,[0,.18,0],[.56,.15,1]);
      box(g,MAT.white,[0,.36,-.1],[.43,.3,.55]);box(g,MAT.window,[0,.39,.19],[.35,.15,.02]);
      for(const x of [-.225,.225])box(g,MAT.window,[x,.39,-.1],[.02,.15,.4]);
      box(g,MAT.red,[0,.56,-.1],[.49,.08,.62]);cylinder(g,MAT.brass,[0,.72,-.35],[.018,.32,.018]);
    }
    update(t,dt){
      this.root.position.y=Math.sin(t*.65)*.16;
      this.root.rotation.z=Math.sin(t*.28)*.006;
      this.eye.update(t);
      this.bus.position.x=-3.9+Math.sin(t*.18)*2.6;
      this.bus.rotation.y=Math.cos(t*.18)<0?Math.PI:0;
      this.boat.position.z=3.85+Math.sin(t*.3)*.6;this.boat.position.y=.61+Math.sin(t*1.6)*.03;this.boat.rotation.z=Math.sin(t*1.2)*.03;
      for(const w of this.waterLines){w.mesh.position.z=w.z+Math.sin(t*.65+w.phase)*.12;w.mesh.scale.x=w.width*(.8+.2*Math.sin(t+w.phase));}
    }
  }

  const SEASONS=[
    {name:'Spring',line:'A softer kind of morning.',temp:'12°',weather:'Fresh blooms & a little mist',grass:'#9db885',leaf:'#80a374',leaf2:'#b3c58a',blossom:'#e2b0ad',sky:'#f1efe5'},
    {name:'Summer',line:'A little sunshine goes a long way.',temp:'24°',weather:'Golden light & clear skies',grass:'#a0b676',leaf:'#658e5c',leaf2:'#9db267',blossom:'#a0b679',sky:'#f4efdd'},
    {name:'Autumn',line:'The city takes a golden turn.',temp:'14°',weather:'Falling leaves & warm colours',grass:'#b7aa75',leaf:'#ba793e',leaf2:'#d4a451',blossom:'#c98b65',sky:'#f1e7d9'},
    {name:'Winter',line:'A quiet little snow globe.',temp:'2°',weather:'Soft snowfall & frosty rooftops',grass:'#bdcdc0',leaf:'#859e8f',leaf2:'#bbccc1',blossom:'#b2c7c3',sky:'#e5edf0'}
  ];
  SEASONS.forEach(s=>{for(const key of ['grass','leaf','leaf2','blossom','sky'])s[key]=new T.Color(s[key]);});

  class SeasonCycle {
    constructor(){this.current=0;this.auto=true;this.elapsed=0;this.duration=24;this.transition=4.5;this.weights=[1,0,0,0];this.from=[1,0,0,0];this.blend=1;this.color=new T.Color();this.sky=new T.Color();}
    select(index,manual=false){
      this.current=index;this.from=this.weights.slice();this.blend=0;this.elapsed=0;
      if(manual){this.auto=false;this.updateAuto();}
      const s=SEASONS[index];
      document.querySelectorAll('.season-button').forEach((b,i)=>{b.classList.toggle('active',i===index);b.setAttribute('aria-pressed',String(i===index));});
      $('story-number').textContent=String(index+1).padStart(2,'0');$('story-label').textContent=`THE ${s.name.toUpperCase()} EDITION`;
      $('story-copy').textContent=s.line;$('temperature').textContent=s.temp;$('weather-description').textContent=s.weather;
    }
    updateAuto(){ $('auto').setAttribute('aria-pressed',String(this.auto));document.querySelector('.auto-text').textContent=`AUTO-CYCLE ${this.auto?'ON':'OFF'}`; }
    mix(key,target){target.setRGB(0,0,0);for(let i=0;i<4;i++){const c=SEASONS[i][key],w=this.weights[i];target.r+=c.r*w;target.g+=c.g*w;target.b+=c.b*w;}return target;}
    update(dt){
      if(this.auto){this.elapsed+=dt;if(this.elapsed>=this.duration)this.select((this.current+1)%4);}
      // Smoothstep blends from the *current* weights, so interrupting a transition
      // with another season never causes a colour or particle-density pop.
      this.blend=Math.min(1,this.blend+dt/this.transition);const t=smooth(0,1,this.blend);
      for(let i=0;i<4;i++)this.weights[i]=lerp(this.from[i],i===this.current?1:0,t);
      this.mix('grass',MAT.grass.color);this.mix('leaf',MAT.foliage.color);this.mix('leaf2',MAT.foliage2.color);this.mix('blossom',MAT.blossom.color);this.mix('sky',this.sky);
      MAT.snow.opacity=this.weights[3]*.82;
      $('season-progress-fill').style.width=`${this.auto?this.elapsed/this.duration*100:0}%`;
    }
  }

  function radialTexture(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
    const gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.2,'#ffffffbf');gradient.addColorStop(1,'#ffffff00');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);return new T.CanvasTexture(canvas);
  }
  class WeatherSystem {
    constructor(scene){
      this.group=group(scene);this.dummy=new T.Object3D();this.time=0;
      const leafShape=new T.Shape();
      const outline=[[0,.52],[.1,.29],[.24,.38],[.2,.15],[.43,.19],[.31,-.02],[.46,-.08],[.14,-.25],[.04,-.21],[.02,-.46],[-.02,-.46],[-.04,-.21],[-.14,-.25],[-.46,-.08],[-.31,-.02],[-.43,.19],[-.2,.15],[-.24,.38],[-.1,.29]];
      outline.forEach((p,i)=>i?leafShape.lineTo(...p):leafShape.moveTo(...p));leafShape.closePath();
      this.leafMaterial=new T.MeshToonMaterial({color:'#ffffff',gradientMap:shadeTexture,side:T.DoubleSide,transparent:true,opacity:0,depthWrite:false});
      this.leaves=new T.InstancedMesh(new T.ShapeGeometry(leafShape),this.leafMaterial,180);this.leaves.instanceMatrix.setUsage(T.DynamicDrawUsage);this.leaves.frustumCulled=false;
      this.leafState=[];const colors=['#b86132','#c9883b','#e4b752','#bd754a','#d79b58'];
      for(let i=0;i<180;i++){this.leafState.push({x:range(-10,10),y:range(-2,13),z:range(-7,7),speed:range(.5,1.1),phase:range(0,TAU),scale:range(.12,.24)});this.leaves.setColorAt(i,new T.Color(colors[i%colors.length]));}
      this.group.add(this.leaves);
      const snowCount=760;this.snowState=[];this.snowPositions=new Float32Array(snowCount*3);
      for(let i=0;i<snowCount;i++)this.snowState.push({x:range(-11,11),y:range(-3,14),z:range(-8,8),speed:range(.45,1.25),phase:range(0,TAU)});
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(this.snowPositions,3).setUsage(T.DynamicDrawUsage));
      this.softTexture=radialTexture();
      this.snowMaterial=new T.PointsMaterial({color:'#fffef2',map:this.softTexture,size:.12,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});
      this.snow=new T.Points(geo,this.snowMaterial);this.snow.frustumCulled=false;this.group.add(this.snow);
      this.mists=[];
      for(let i=0;i<18;i++){
        const material=new T.SpriteMaterial({map:this.softTexture,color:'#f2f1df',transparent:true,opacity:0,depthWrite:false});
        const sprite=new T.Sprite(material);sprite.position.set(range(-10,10),range(.5,3),range(-7,6));sprite.scale.set(range(4,8),range(1.3,2.4),1);
        this.group.add(sprite);this.mists.push({sprite,x:sprite.position.x,phase:range(0,TAU)});
      }
      this.activeCount=0;
    }
    update(dt,t,weights){
      const autumn=weights[2],winter=weights[3],spring=weights[0];
      this.leaves.visible=autumn>.005;this.leafMaterial.opacity=autumn*.95;
      this.snow.visible=winter>.005;this.snowMaterial.opacity=winter*.9;
      // Fixed pools recycle particles below the island. No geometry, vectors or
      // particle objects are allocated in this animation loop.
      if(this.leaves.visible){
        for(let i=0;i<this.leafState.length;i++){
          const p=this.leafState[i];p.y-=dt*p.speed;p.x+=dt*.14;
          if(p.y< -3){p.y=13;p.x=range(-10,10);p.z=range(-7,7);}if(p.x>11)p.x=-11;
          this.dummy.position.set(p.x+Math.sin(t*.8+p.phase)*.65,p.y,p.z+Math.cos(t*.6+p.phase)*.35);
          this.dummy.rotation.set(t*.9+p.phase,t*.75+p.phase,Math.sin(t+p.phase)*.8);this.dummy.scale.setScalar(p.scale);this.dummy.updateMatrix();this.leaves.setMatrixAt(i,this.dummy.matrix);
        }
        this.leaves.instanceMatrix.needsUpdate=true;
      }
      if(this.snow.visible){
        for(let i=0;i<this.snowState.length;i++){
          const p=this.snowState[i];p.y-=dt*p.speed;if(p.y< -3){p.y=14;p.x=range(-11,11);}
          this.snowPositions[i*3]=p.x+Math.sin(t*.5+p.phase)*.55;this.snowPositions[i*3+1]=p.y;this.snowPositions[i*3+2]=p.z+Math.cos(t*.4+p.phase)*.3;
        }
        this.snow.geometry.attributes.position.needsUpdate=true;
      }
      for(const m of this.mists){m.sprite.visible=spring>.01;m.sprite.position.x=m.x+Math.sin(t*.09+m.phase)*2;m.sprite.material.opacity=spring*(.10+.035*Math.sin(t*.25+m.phase));}
      this.activeCount=(this.leaves.visible?180:0)+(this.snow.visible?760:0);
    }
  }

  class Atmosphere {
    constructor(scene){
      this.clouds=[];this.cloudMaterial=new T.MeshToonMaterial({color:'#fffcf0',gradientMap:shadeTexture,transparent:true,opacity:.86,depthWrite:false});
      for(const [x,y,z,s] of [[-10,3,-2,1.1],[8,7,-6,1.3],[-4,9,-8,.72],[10,1,5,.8],[-8,-1,4,.8]]){
        const g=group(scene,x,y,z);
        [[-.85,0,0,.68],[0,.18,0,.95],[.9,.02,0,.64],[.25,-.14,.35,.64]].forEach(([a,b,c,r])=>{const m=sphere(g,this.cloudMaterial,[a,b,c],[r,r*.5,r*.65]);m.castShadow=false;});
        g.scale.setScalar(s);this.clouds.push({group:g,x,phase:range(0,TAU)});
      }
      const soft=radialTexture();
      this.sun=group(scene);sphere(this.sun,new T.MeshBasicMaterial({color:'#ffdd91'}),[0,0,0],[.65,.65,.65]);
      const glow=new T.Sprite(new T.SpriteMaterial({map:soft,color:'#ffe3a1',transparent:true,opacity:.24,depthWrite:false}));glow.scale.set(4,4,1);this.sun.add(glow);
      this.moon=group(scene);sphere(this.moon,new T.MeshBasicMaterial({color:'#f1eddb'}),[0,0,0],[.47,.47,.47]);
      for(const [x,y,s] of [[-.16,.15,.09],[.15,-.06,.12],[-.12,-.2,.06]])sphere(this.moon,new T.MeshBasicMaterial({color:'#d8ded6'}),[x,y,.43],[s,s,.018]);
      const stars=[];for(let i=0;i<150;i++)stars.push(range(-35,35),range(7,30),range(-30,-12));
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(stars,3));
      this.starMat=new T.PointsMaterial({color:'#fff5d6',size:.075,transparent:true,opacity:0,depthWrite:false});this.stars=new T.Points(geo,this.starMat);scene.add(this.stars);
    }
    update(t,phase,night){
      for(const c of this.clouds)c.group.position.x=c.x+Math.sin(t*.075+c.phase)*.7;
      const a=phase*TAU+Math.PI/2;
      this.sun.position.set(Math.cos(a)*15,4+Math.sin(a)*13,-12);
      this.moon.position.set(-Math.cos(a)*15,4-Math.sin(a)*13,-12);
      this.sun.visible=Math.sin(a)>-.2;this.moon.visible=Math.sin(a)<.2;
      this.starMat.opacity=night*.75;this.cloudMaterial.color.set('#fffcf0').lerp(new T.Color('#9eaebe'),night*.55);
    }
  }

  class DayNightCycle {
    constructor(scene,island,atmosphere){
      this.scene=scene;this.island=island;this.atmosphere=atmosphere;this.elapsed=0;this.offset=0;this.phase=0;this.jumpRemaining=0;this.night=0;this.label='';
      this.hemi=new T.HemisphereLight('#fff2d5','#859c77',2.5);scene.add(this.hemi);
      this.sunLight=new T.DirectionalLight('#ffe4b1',3.1);this.sunLight.position.set(-8,17,9);this.sunLight.castShadow=true;
      const shadow=this.sunLight.shadow;shadow.mapSize.set(2048,2048);shadow.camera.left=-14;shadow.camera.right=14;shadow.camera.top=16;shadow.camera.bottom=-12;shadow.camera.near=1;shadow.camera.far=60;shadow.normalBias=.045;shadow.bias=-.00015;shadow.radius=3;scene.add(this.sunLight);
      this.rim=new T.DirectionalLight('#d8eeee',1.4);this.rim.position.set(8,9,-10);scene.add(this.rim);
      this.nightLight=new T.PointLight('#ffd59a',0,15,2);this.nightLight.position.set(-1,6,1);island.root.add(this.nightLight);
      this.sky=new T.Color();this.nightSky=new T.Color('#263a48');this.sunsetSky=new T.Color('#e9c2a6');this.darkInk=new T.Color('#293e35');this.lightInk=new T.Color('#e7e9d8');this.color=new T.Color();this.fogColor=new T.Color();
      scene.fog=new T.FogExp2('#f1efe5',.009);
    }
    jump(){
      // Move forward to the opposite lighting state with a short eased travel,
      // then continue at the normal 15-second period. No sky/lighting cut.
      const target=this.night>.5?0:.5;const current=(this.elapsed/15+this.offset)%1;
      this.jumpRemaining=(target-current+1)%1;
    }
    update(dt,seasons,t){
      this.elapsed+=dt;
      if(this.jumpRemaining>.0001){const step=this.jumpRemaining*(1-Math.exp(-dt*4));this.offset=(this.offset+step)%1;this.jumpRemaining-=step;}
      this.phase=(this.elapsed/15+this.offset)%1;
      const altitude=Math.cos(this.phase*TAU);
      const day=smooth(-.22,.55,altitude),night=1-day;this.night=night;
      const twilight=(1-smooth(.02,.48,Math.abs(altitude)))*.64;
      this.sky.copy(seasons.sky).lerp(this.nightSky,night).lerp(this.sunsetSky,twilight);
      this.scene.background=this.sky;
      this.scene.fog.color.copy(this.sky);this.scene.fog.density=.006+seasons.weights[0]*.009+seasons.weights[3]*.004;
      this.hemi.intensity=lerp(1.05,2.6,day);this.hemi.color.set('#a7c7dd').lerp(new T.Color('#fff1d3'),day);
      this.sunLight.intensity=lerp(.4,3.1+seasons.weights[1]*.5,day);
      this.sunLight.color.set('#adc9ee').lerp(new T.Color('#ffe4b5'),day).lerp(new T.Color('#ffa96e'),twilight);
      this.sunLight.position.set(-8+Math.sin(this.phase*TAU)*5,12+day*6,9);
      this.rim.intensity=lerp(1.2,.85,day);
      // Lamps come on as the afternoon sun approaches the horizon. They fade
      // out ahead of dawn; the slightly different thresholds leave no hard switch.
      const lamps=this.phase<.5?1-smooth(.0,.48,altitude):1-smooth(-.35,.08,altitude);
      MAT.window.emissiveIntensity=.03+lamps*1.35;MAT.glow.emissiveIntensity=.1+lamps*1.8;
      this.island.ben.clockMat.emissiveIntensity=.05+lamps*1.25;this.nightLight.intensity=lamps*12;
      this.atmosphere.update(t,this.phase,night);
      // Match the editorial overlay to the sky while keeping the control dock light.
      const ink=this.color.copy(this.darkInk).lerp(this.lightInk,night);document.documentElement.style.setProperty('--ink',`#${ink.getHexString()}`);
      this.color.set('#717d70').lerp(new T.Color('#bdc9bf'),night);document.documentElement.style.setProperty('--muted',`#${this.color.getHexString()}`);
      this.color.set('#ae633f').lerp(new T.Color('#e7bf90'),night);document.documentElement.style.setProperty('--accent',`#${this.color.getHexString()}`);
      document.documentElement.style.setProperty('--sky',`#${this.sky.getHexString()}`);
      document.documentElement.style.setProperty('--line',night>.5?'rgba(218,229,207,.2)':'rgba(65,80,62,.19)');
      const label=altitude>.3?'Daylight':altitude<-.3?'Moonlight':this.phase<.5?'Golden hour':'First light';
      if(label!==this.label){this.label=label;$('phase-label').textContent=label;$('time-toggle').setAttribute('aria-label',night>.5?'Jump to day':'Jump to night');}
    }
  }

  class CameraControls {
    constructor(camera,element){
      this.camera=camera;this.element=element;this.angle=.64;this.targetAngle=.64;this.zoom=1;this.targetZoom=1;this.pointers=new Map();this.pinchDistance=0;this.compact=false;
      element.addEventListener('pointerdown',e=>{element.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});element.classList.add('dragging');if(this.pointers.size===2)this.pinchDistance=this.distance();});
      element.addEventListener('pointermove',e=>{
        const previous=this.pointers.get(e.pointerId);if(!previous)return;
        const dx=e.clientX-previous.x;
        this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(this.pointers.size===2){const distance=this.distance();if(this.pinchDistance>0)this.targetZoom=clamp(this.targetZoom*distance/this.pinchDistance,.72,1.55);this.pinchDistance=distance;}
        else this.targetAngle-=dx*.006;
      });
      const end=e=>{this.pointers.delete(e.pointerId);if(!this.pointers.size)element.classList.remove('dragging');this.pinchDistance=0;};
      element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);element.addEventListener('lostpointercapture',end);
      element.addEventListener('wheel',e=>{e.preventDefault();this.targetZoom=clamp(this.targetZoom*Math.exp(-e.deltaY*.001),.72,1.55);},{passive:false});
      element.addEventListener('dblclick',()=>{this.targetAngle=.64;this.targetZoom=1;});
    }
    distance(){const a=[...this.pointers.values()];return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
    resize(w,h){
      const aspect=w/h;this.compact=w<=760||h<=500;
      let height=this.compact?Math.max(22.2,25/aspect):Math.max(22.8,32/aspect);
      // Mobile portrait leaves room above for the small title; tiny landscape cards
      // keep only the brand and a single row of controls around a centered island.
      if(w<=760&&h>500)height=Math.max(28,25/aspect);
      const half=height/2,shift=this.compact?0:height*aspect*.165;
      this.camera.left=-half*aspect-shift;this.camera.right=half*aspect-shift;this.camera.top=half;this.camera.bottom=-half;
      this.targetY=this.compact?(h>500?2.7:2.4):2.8;
      this.camera.updateProjectionMatrix();
    }
    update(dt){
      const ease=1-Math.exp(-dt*9);this.angle=lerp(this.angle,this.targetAngle,ease);this.zoom=lerp(this.zoom,this.targetZoom,ease);
      const distance=29;this.camera.position.set(Math.sin(this.angle)*distance,18,Math.cos(this.angle)*distance);
      this.camera.lookAt(0,this.targetY,0);this.camera.zoom=this.zoom;this.camera.updateProjectionMatrix();
    }
  }

  class AmbientAudio {
    constructor(){this.context=null;this.enabled=false;this.volume=null;this.filter=null;}
    async toggle(){
      try{
        if(!this.context){
          const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
          this.context=new Context();this.volume=this.context.createGain();this.volume.gain.value=0;this.volume.connect(this.context.destination);
          const buffer=this.context.createBuffer(1,this.context.sampleRate*4,this.context.sampleRate);const data=buffer.getChannelData(0);let previous=0;
          for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*.02)/1.02;data[i]=previous*3.5;}
          const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;
          this.filter=this.context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=450;source.connect(this.filter);this.filter.connect(this.volume);source.start();
          // A very quiet pair of musical tones sits beneath the wind and river.
          for(const frequency of [174.61,261.63]){const oscillator=this.context.createOscillator();oscillator.frequency.value=frequency;const gain=this.context.createGain();gain.gain.value=.025;oscillator.connect(gain);gain.connect(this.volume);oscillator.start();}
        }
        await this.context.resume();this.enabled=!this.enabled;this.volume.gain.setTargetAtTime(this.enabled?.17:0,this.context.currentTime,.4);
        $('sound').setAttribute('aria-pressed',String(this.enabled));$('sound').setAttribute('aria-label',this.enabled?'Mute ambient sound':'Enable ambient sound');
      }catch(error){console.warn('Ambient audio unavailable:',error);}
    }
    update(weights,night){if(this.filter)this.filter.frequency.setTargetAtTime(350+weights[0]*450+weights[2]*280-night*100,this.context.currentTime,.8);}
  }

  function showError(error){const loading=document.getElementById('loading');if(loading)loading.style.display='none';document.getElementById('error').hidden=false;if(error)console.error(error);}
  try {
    const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(innerWidth,innerHeight);
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    $('world').appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden','true');
    const scene=new T.Scene();const camera=new T.OrthographicCamera(-20,20,12,-12,.1,130);
    const island=new Island(scene),seasons=new SeasonCycle(),weather=new WeatherSystem(scene),atmosphere=new Atmosphere(scene),cycle=new DayNightCycle(scene,island,atmosphere),audio=new AmbientAudio();
    const controls=new CameraControls(camera,$('world'));
    const resize=()=>{renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));controls.resize(innerWidth,innerHeight);};
    window.addEventListener('resize',resize);resize();
    document.querySelectorAll('.season-button').forEach(b=>b.addEventListener('click',()=>seasons.select(Number(b.dataset.season),true)));
    $('auto').addEventListener('click',()=>{seasons.auto=!seasons.auto;seasons.elapsed=0;seasons.updateAuto();});
    $('time-toggle').addEventListener('click',()=>cycle.jump());$('sound').addEventListener('click',()=>audio.toggle());
    $('about').addEventListener('click',()=>$('about-dialog').showModal());$('close-about').addEventListener('click',()=>$('about-dialog').close());
    $('about-dialog').addEventListener('click',e=>{if(e.target===$('about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
    window.addEventListener('keydown',e=>{
      if(e.ctrlKey||e.metaKey||e.altKey||$('about-dialog').open)return;
      if(/^[1-4]$/.test(e.key))seasons.select(Number(e.key)-1,true);
      if(e.key.toLowerCase()==='a')$('auto').click();if(e.key.toLowerCase()==='d')cycle.jump();if(e.key.toLowerCase()==='m')audio.toggle();if(e.key.toLowerCase()==='f')$('debug').hidden=!$('debug').hidden;
    });
    let last=performance.now(),elapsed=0,debugTime=0,frameCount=0,raf=0,stopped=false;
    // Clamp physics after tab suspension. The visible-world clock pauses while
    // hidden, preserving particle positions and preventing catch-up storms.
    function frame(now){
      if(stopped)return;
      const dt=Math.min((now-last)/1000,.05);last=now;elapsed+=dt;
      controls.update(dt);seasons.update(dt);island.update(elapsed,dt);weather.update(dt,elapsed,seasons.weights);cycle.update(dt,seasons,elapsed);audio.update(seasons.weights,cycle.night);
      renderer.render(scene,camera);debugTime+=dt;frameCount++;
      if(debugTime>=.75){if(!$('debug').hidden)$('debug').textContent=`${Math.round(frameCount/debugTime)} FPS · ${weather.activeCount} particles\n${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles/1000)}k triangles`;frameCount=0;debugTime=0;}
      raf=requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){cancelAnimationFrame(raf);if(audio.context)audio.context.suspend();}
      else{last=performance.now();if(audio.context&&audio.enabled)audio.context.resume();if(!stopped)raf=requestAnimationFrame(frame);}
    });
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();stopped=true;cancelAnimationFrame(raf);showError(new Error('WebGL context lost. Reload to restore the world.'));});
    window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);if(audio.context)audio.context.suspend();});
    window.addEventListener('pageshow',e=>{if(e.persisted&&!stopped){last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);}});
    // Expose read-only-friendly state for inspection without attaching extra loops.
    window.littleWorld={renderer,scene,camera,seasons,cycle,weather,controls};
    controls.update(1);seasons.update(0);island.update(0,0);weather.update(0,0,seasons.weights);cycle.update(0,seasons,0);renderer.render(scene,camera);
    $('loading').classList.add('done');setTimeout(()=>$('loading').remove(),700);
    raf=requestAnimationFrame(frame);
  } catch(error){showError(error);}
})();
