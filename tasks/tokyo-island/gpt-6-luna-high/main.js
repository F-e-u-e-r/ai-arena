(() => {
  'use strict';

  const host = document.getElementById('scene');
  const stage = document.getElementById('stage');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f2a77d');
  scene.fog = new THREE.Fog('#f2a77d', 15, 34);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(33, host.clientWidth / host.clientHeight, .1, 100);
  camera.position.set(9.7, 7.8, 12.5);
  const target = new THREE.Vector3(0, .75, 0);
  camera.lookAt(target);

  const mat = (color, roughness = .82, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const mats = {
    grass: mat('#72aa68'), grassLight: mat('#98c875'), soil: mat('#875342'), soil2: mat('#b96d54'),
    rock: mat('#7b8580'), towerRed: mat('#e65047'), towerWhite: mat('#fff0d4'), dark: mat('#384b52'),
    cream: mat('#fff1d2'), roof: mat('#d95b47'), wood: mat('#ae604c'), water: mat('#67c6c4', .35, { metalness: .08 }),
    leafGold: mat('#eb9d49', .75, { side: THREE.DoubleSide }), leafRed: mat('#d9574c', .75, { side: THREE.DoubleSide }),
    cloud: new THREE.MeshStandardMaterial({ color: '#fff8ee', roughness: 1, transparent: true, opacity: .84 })
  };

  const hemi = new THREE.HemisphereLight('#fff0dd', '#53677b', 1.15); scene.add(hemi);
  const sunLight = new THREE.DirectionalLight('#fff0d2', 3.0); sunLight.position.set(-5, 10, 7); sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024); sunLight.shadow.camera.left = -10; sunLight.shadow.camera.right = 10;
  sunLight.shadow.camera.top = 12; sunLight.shadow.camera.bottom = -10; sunLight.shadow.bias = -.0005; scene.add(sunLight);
  const fill = new THREE.DirectionalLight('#c8e6f2', .65); fill.position.set(6, 4, -8); scene.add(fill);

  const islandRoot = new THREE.Group(); scene.add(islandRoot);
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#344850', transparent: true, opacity: .11, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(4.1, 64), shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -2.2, -1.2); scene.add(shadow);

  class Island {
    constructor() {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.48, .8, 64, 1), mats.grass);
      top.position.y = 0; top.castShadow = true; top.receiveShadow = true; islandRoot.add(top);
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(4.48, 2.9, 1.25, 64, 1), mats.soil);
      soil.position.y = -.91; soil.castShadow = true; soil.receiveShadow = true; islandRoot.add(soil);
      const under = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.3, 64), mats.soil2);
      under.position.y = -2.15; under.rotation.y = .12; under.castShadow = true; islandRoot.add(under);
      // Chunky little strata and stones give the floating underside a hand-built toy feel.
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * Math.PI * 2, r = 4.48;
        const b = new THREE.Mesh(new THREE.SphereGeometry(.28 + Math.random() * .2, 8, 6), i % 3 ? mats.soil : mats.rock);
        b.position.set(Math.cos(a) * r, -.84 + Math.sin(i * 4) * .18, Math.sin(a) * r); b.scale.y = .65; b.castShadow = true; islandRoot.add(b);
      }
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, r = 1.3 + Math.random() * 3.2;
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(.15 + Math.random() * .15, 7, 6), i % 2 ? mats.grassLight : mats.grass);
        tuft.position.set(Math.cos(a) * r, .36, Math.sin(a) * r); tuft.scale.set(1.4, .6, .8); islandRoot.add(tuft);
      }
    }
  }

  const landmarks = [];
  function makeTower() {
    const group = new THREE.Group(); group.position.set(0, .35, .15); islandRoot.add(group);
    // A tapered mast, crossed braces, viewing decks and beacon suggest Tokyo Tower at toy scale.
    const height = 4.75;
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(.055, .49, height, 4, 1), mats.towerRed);
    frame.position.y = height / 2; frame.castShadow = true; group.add(frame);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.57, .72, .22, 4), mats.towerWhite); foot.position.y = .1; foot.rotation.y = Math.PI / 4; group.add(foot);
    for (const y of [.82, 1.68, 2.55, 3.36]) {
      const r = .49 * (1 - y / height) + .045;
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(r + .12, r + .12, .105, 4), y % 2 ? mats.towerWhite : mats.towerRed);
      deck.rotation.y = Math.PI / 4; deck.position.y = y; deck.castShadow = true; group.add(deck);
    }
    // Thin white diagonals make the silhouette read as a lattice tower.
    for (let side = 0; side < 4; side++) {
      const angle = side * Math.PI / 2 + Math.PI / 4;
      for (let band = 0; band < 5; band++) {
        const y0 = band * .82 + .2, y1 = y0 + .82;
        const r0 = .49 * (1 - y0 / height) + .07, r1 = .49 * (1 - y1 / height) + .07;
        const p0 = new THREE.Vector3(Math.cos(angle) * r0, y0, Math.sin(angle) * r0);
        const p1 = new THREE.Vector3(Math.cos(angle + Math.PI / 2) * r1, y1, Math.sin(angle + Math.PI / 2) * r1);
        const d = new THREE.Vector3().subVectors(p1, p0), brace = new THREE.Mesh(new THREE.BoxGeometry(.045, d.length(), .045), mats.towerWhite);
        brace.position.copy(p0).add(p1).multiplyScalar(.5); brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); group.add(brace);
      }
    }
    const beaconMat = new THREE.MeshStandardMaterial({ color: '#fff0c6', emissive: '#ff733b', emissiveIntensity: 0 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), beaconMat); beacon.position.y = height + .05; group.add(beacon);
    const lamp = new THREE.PointLight('#ff7956', 0, 2.4, 2); lamp.position.y = height; group.add(lamp);
    landmarks.push({ material: beaconMat, light: lamp, base: .9 });
  }

  function makeFuji() {
    const g = new THREE.Group(); g.position.set(-2.35, .36, -1.25); g.rotation.y = -.15; islandRoot.add(g);
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(1.03, 1.68, 7), mat('#6f8f9a'));
    mountain.position.y = .78; mountain.castShadow = true; g.add(mountain);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.57, .67, 7), mats.cream); cap.position.y = 1.34; cap.castShadow = true; g.add(cap);
    for (const [x,z] of [[-.32,.03],[.3,-.06]]) {
      const snow = new THREE.Mesh(new THREE.ConeGeometry(.2,.38,5), mats.cream); snow.position.set(x,1.08,z); g.add(snow);
    }
    const glow = new THREE.PointLight('#ffd08c', 0, 1.7, 2); glow.position.set(0, .6, .9); g.add(glow);
    landmarks.push({ material: null, light: glow, base: .8 });
  }

  function makeTorii() {
    const g = new THREE.Group(); g.position.set(2.5, .36, -.82); g.rotation.y = -.18; islandRoot.add(g);
    for (const x of [-.48,.48]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,1.27,8), mats.roof); post.position.set(x,.65,0); post.castShadow = true; g.add(post);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(.31,.12,.34), mats.cream); foot.position.set(x,.12,0); g.add(foot);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.52,.16,.29), mats.roof); lintel.position.y = 1.29; lintel.rotation.z = -.025; lintel.castShadow = true; g.add(lintel);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(1.78,.2,.37), mats.roof); upper.position.y = 1.47; upper.rotation.z = -.045; upper.castShadow = true; g.add(upper);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(.3,.33,.12), mats.cream); plaque.position.set(0,1.05,.06); g.add(plaque);
    const lamp = new THREE.PointLight('#ffb469', 0, 1.5, 2); lamp.position.set(0, .45, .55); g.add(lamp);
    landmarks.push({ material: null, light: lamp, base: .55 });
  }

  function makePagoda() {
    const g = new THREE.Group(); g.position.set(1.9,.36,1.8); g.rotation.y = .25; islandRoot.add(g);
    const base = new THREE.Mesh(new THREE.BoxGeometry(.9,.18,.75), mats.cream); base.position.y=.1; g.add(base);
    for (let level=0; level<2; level++) {
      const y=.48+level*.52, size=.72-level*.15;
      const room=new THREE.Mesh(new THREE.BoxGeometry(size,.38,size*.72), mats.wood); room.position.y=y; room.castShadow=true; g.add(room);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(size*.82,.3,4), mats.roof); roof.rotation.y=Math.PI/4; roof.position.y=y+.29; roof.castShadow=true; g.add(roof);
      const eave=new THREE.Mesh(new THREE.BoxGeometry(size*1.42,.075,size*1.18), mats.roof); eave.position.y=y+.18; g.add(eave);
    }
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.08,.45,6), mats.roof); tip.position.y=1.8; g.add(tip);
    const glow=new THREE.PointLight('#ffbf72',0,1.5,2); glow.position.set(0,.8,.55); g.add(glow);
    landmarks.push({ material:null, light:glow, base:.52 });
  }

  function makePines() {
    for (const [x,z,s] of [[-3.35,1.15,.8],[3.35,.25,.72],[-1.5,2.95,.62]]) {
      const g = new THREE.Group(); g.position.set(x,.37,z); islandRoot.add(g);
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,.55,7), mats.wood); trunk.position.y=.25; g.add(trunk);
      for(let i=0;i<3;i++){ const c=new THREE.Mesh(new THREE.ConeGeometry(.46-i*.08,.72,7),mat(i===1?'#3d785c':'#4d8b63')); c.position.y=.52+i*.4; c.castShadow=true; g.add(c); }
      g.scale.setScalar(s);
    }
  }
  new Island(); makeTower(); makeFuji(); makeTorii(); makePagoda(); makePines();

  // Soft cumulus use a handful of shared spheres; slow drift adds depth without a texture dependency.
  const clouds = [];
  for (let i=0;i<7;i++) {
    const c=new THREE.Group();
    for(let j=0;j<4;j++){ const puff=new THREE.Mesh(new THREE.SphereGeometry(.46+Math.random()*.27,12,10),mats.cloud); puff.position.set((j-1.5)*.42,Math.random()*.15,Math.random()*.18); c.add(puff); }
    const a=i/7*Math.PI*2, r=8+Math.random()*2; c.position.set(Math.cos(a)*r,1.8+Math.random()*3,Math.sin(a)*r-1); c.scale.setScalar(.8+Math.random()*.55); scene.add(c); clouds.push(c);
  }

  const sun = new THREE.Mesh(new THREE.SphereGeometry(.48,24,16), new THREE.MeshBasicMaterial({ color:'#fff0b0' })); scene.add(sun);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(.34,24,16), new THREE.MeshBasicMaterial({ color:'#e7f1fa' })); scene.add(moon);
  const starGroup = new THREE.Group(); scene.add(starGroup);
  const starMat = new THREE.MeshBasicMaterial({ color:'#fff6d4', transparent:true, opacity:.8 });
  for (let i=0;i<75;i++) { const s=new THREE.Mesh(new THREE.SphereGeometry(.018+Math.random()*.018,5,4),starMat); s.position.set((Math.random()-.5)*29,2+Math.random()*12,(Math.random()-.5)*17-4); starGroup.add(s); }

  class MapleLeafSystem {
    constructor(count=110) {
      this.count=count;
      const shape=new THREE.Shape();
      shape.moveTo(0,-.36); shape.lineTo(-.1,-.2); shape.lineTo(-.29,-.24); shape.lineTo(-.22,-.06); shape.lineTo(-.42,.02); shape.lineTo(-.2,.13); shape.lineTo(-.26,.34); shape.lineTo(-.04,.24); shape.lineTo(0,.48); shape.lineTo(.07,.24); shape.lineTo(.29,.35); shape.lineTo(.23,.13); shape.lineTo(.43,.02); shape.lineTo(.22,-.06); shape.lineTo(.29,-.24); shape.lineTo(.1,-.2); shape.lineTo(0,-.36);
      this.geometry=new THREE.ShapeGeometry(shape); this.geometry.computeVertexNormals();
      this.mesh=new THREE.InstancedMesh(this.geometry, mats.leafRed, count/2);
      this.goldMesh=new THREE.InstancedMesh(this.geometry, mats.leafGold, count/2);
      this.mesh.castShadow=false; this.goldMesh.castShadow=false; scene.add(this.mesh,this.goldMesh);
      this.dummy=new THREE.Object3D(); this.items=[];
      for(let i=0;i<count;i++) this.items.push(this.spawn(true));
    }
    spawn(initial=false) { return { x:(Math.random()-.5)*16, y:initial?Math.random()*12-2:8+Math.random()*5, z:(Math.random()-.5)*13-1, fall:1.1+Math.random()*1.35, sway:Math.random()*Math.PI*2, spin:(Math.random()-.5)*2.5, size:.12+Math.random()*.12, gold:Math.random()<.38 }; }
    update(dt,t) {
      let ri=0,gi=0;
      for(const p of this.items){
        p.y-=p.fall*dt; p.sway+=dt*(1.3+p.fall*.24); p.x+=Math.sin(p.sway)*dt*.3; p.z+=Math.cos(p.sway*.72)*dt*.12;
        if(p.y < -3.3) Object.assign(p,this.spawn(false));
        const obj=this.dummy; obj.position.set(p.x+Math.sin(p.sway)*.25,p.y,p.z); obj.rotation.set(.2+Math.sin(p.sway)*.42,t*p.spin+p.sway,.15+Math.cos(p.sway)*.35); obj.scale.setScalar(p.size); obj.updateMatrix();
        if(p.gold){ if(gi<55) this.goldMesh.setMatrixAt(gi++,obj.matrix); } else { if(ri<55) this.mesh.setMatrixAt(ri++,obj.matrix); }
      }
      this.mesh.count=ri; this.goldMesh.count=gi; this.mesh.instanceMatrix.needsUpdate=true; this.goldMesh.instanceMatrix.needsUpdate=true;
    }
  }
  const leaves=new MapleLeafSystem(110);

  class DayNightCycle {
    constructor(){ this.duration=15; this.elapsed=0; this.speed=1; this.paused=false; this.phase='DAYLIGHT'; }
    update(dt){ if(!this.paused) this.elapsed=(this.elapsed+dt*this.speed)%this.duration; const u=this.elapsed/this.duration; this.apply(u); return u; }
    // Cosine interpolation removes hard phase edges. The cycle's key colors are dawn, noon, dusk and midnight.
    smooth(a,b,t){ const q=(1-Math.cos(Math.PI*THREE.MathUtils.clamp(t,0,1)))*.5; return a.clone().lerp(b,q); }
    apply(u){
      const stops=[{t:0,c:'#93c7dd',fog:'#b9d8df',amb:1.35,key:3.5},{t:.25,c:'#e88a72',fog:'#dda39a',amb:.82,key:1.9},{t:.5,c:'#172849',fog:'#263a5c',amb:.34,key:.52},{t:.75,c:'#efa27c',fog:'#edb29b',amb:.88,key:1.75},{t:1,c:'#93c7dd',fog:'#b9d8df',amb:1.35,key:3.5}];
      let a=stops[0],b=stops[1]; for(let i=0;i<stops.length-1;i++) if(u>=stops[i].t&&u<=stops[i+1].t){a=stops[i];b=stops[i+1];break;}
      const f=(u-a.t)/(b.t-a.t), sky=this.smooth(new THREE.Color(a.c),new THREE.Color(b.c),f), fog=this.smooth(new THREE.Color(a.fog),new THREE.Color(b.fog),f);
      scene.background.copy(sky); scene.fog.color.copy(fog); hemi.intensity=THREE.MathUtils.lerp(a.amb,b.amb,(1-Math.cos(Math.PI*f))*.5); sunLight.intensity=THREE.MathUtils.lerp(a.key,b.key,(1-Math.cos(Math.PI*f))*.5);
      sunLight.color.copy(this.smooth(new THREE.Color('#fff0d2'),new THREE.Color('#b8ccff'),u>.62?1:0));
      const twilight=Math.max(0,1-Math.abs(u-.25)/.19); const night=THREE.MathUtils.smoothstep(u,.34,.48)*(1-THREE.MathUtils.smoothstep(u,.69,.82));
      const glow=THREE.MathUtils.clamp(twilight*.78+night*.72,0,1);
      for(const l of landmarks) l.light.intensity=l.base*glow;
      starGroup.visible=night>.04; starMat.opacity=.15+.78*night;
      mats.cloud.opacity=.78+.14*(1-night);
      mats.grass.color.copy(this.smooth(new THREE.Color('#72aa68'),new THREE.Color('#435878'),night*.72));
      mats.grassLight.color.copy(this.smooth(new THREE.Color('#98c875'),new THREE.Color('#657b83'),night*.72));
      const angle=u*Math.PI*2+Math.PI/2, radius=17;
      sun.position.set(Math.cos(angle)*radius,Math.sin(angle)*11+2, -5); moon.position.set(Math.cos(angle+Math.PI)*radius,Math.sin(angle+Math.PI)*11+2,-5);
      sun.visible=Math.sin(angle)>-.12; moon.visible=Math.sin(angle)<.12;
      if(u<.13)this.phase='DAYLIGHT'; else if(u<.37)this.phase='DUSK'; else if(u<.68)this.phase='MOONLIGHT'; else if(u<.88)this.phase='DAWN'; else this.phase='DAYLIGHT';
    }
  }
  const cycle=new DayNightCycle();

  let dragging=false, previousX=0, previousY=0, yaw=.62, pitch=.42, pointerId=null;
  renderer.domElement.addEventListener('pointerdown',e=>{ if(e.button!==0 && e.pointerType==='mouse')return; dragging=true; pointerId=e.pointerId; previousX=e.clientX; previousY=e.clientY; renderer.domElement.setPointerCapture(pointerId); renderer.domElement.classList.add('dragging'); });
  renderer.domElement.addEventListener('pointermove',e=>{ if(!dragging||e.pointerId!==pointerId)return; const dx=e.clientX-previousX,dy=e.clientY-previousY; previousX=e.clientX;previousY=e.clientY; yaw-=dx*.006; pitch=THREE.MathUtils.clamp(pitch+dy*.003,-.12,.82); });
  const endDrag=e=>{ if(e.pointerId!==pointerId)return; dragging=false;pointerId=null;renderer.domElement.classList.remove('dragging'); };
  renderer.domElement.addEventListener('pointerup',endDrag); renderer.domElement.addEventListener('pointercancel',endDrag);
  document.getElementById('pauseBtn').addEventListener('click',e=>{cycle.paused=!cycle.paused;e.currentTarget.textContent=cycle.paused?'▶':'Ⅱ';e.currentTarget.setAttribute('aria-label',cycle.paused?'Resume day cycle':'Pause day cycle');});
  document.getElementById('speedBtn').addEventListener('click',e=>{cycle.speed=cycle.speed===1?2:cycle.speed===2?.5:1;e.currentTarget.textContent=`${cycle.speed}×`;});

  const clock=new THREE.Clock(); let elapsed=0, frame=0;
  function animate(){ requestAnimationFrame(animate); const dt=Math.min(clock.getDelta(),.05); elapsed+=dt; frame++;
    const u=cycle.update(dt); islandRoot.position.y=Math.sin(elapsed*.8)*.16; islandRoot.rotation.y=Math.sin(elapsed*.16)*.045;
    shadow.position.y=-2.2+islandRoot.position.y*.15; clouds.forEach((c,i)=>{c.position.x+=dt*(i%2?-.12:.09);if(c.position.x>13)c.position.x=-13;if(c.position.x<-13)c.position.x=13;});
    leaves.update(dt,elapsed);
    const r=15.8; camera.position.set(Math.sin(yaw)*Math.cos(pitch)*r, 2.2+Math.sin(pitch)*r, Math.cos(yaw)*Math.cos(pitch)*r); camera.lookAt(target);
    const name=document.getElementById('phaseName'); name.textContent=cycle.phase;
    const seconds=Math.floor(cycle.elapsed); document.getElementById('phaseClock').textContent=`00:${String(seconds).padStart(2,'0')}`;
    renderer.render(scene,camera);
  }
  animate();
  setTimeout(()=>document.getElementById('loading').classList.add('hidden'),350);

  const resize=()=>{ const w=host.clientWidth,h=host.clientHeight; camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6)); };
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('keydown',e=>{if(e.code==='Space'){cycle.paused=!cycle.paused;document.getElementById('pauseBtn').textContent=cycle.paused?'▶':'Ⅱ';}if(e.key==='ArrowRight')cycle.speed=Math.min(4,cycle.speed+.5);if(e.key==='ArrowLeft')cycle.speed=Math.max(.5,cycle.speed-.5);});
})();
