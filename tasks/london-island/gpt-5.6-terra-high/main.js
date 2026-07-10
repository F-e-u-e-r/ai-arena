import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';

const canvas=document.querySelector('#scene'), label=document.querySelector('#season');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(38,1,.1,100); camera.position.set(10,7,13);
const clock=new THREE.Clock(), world=new THREE.Group(); scene.add(world);
const ambient=new THREE.HemisphereLight(0xbdeeff,0x5b3d52,2.3), sunLight=new THREE.DirectionalLight(0xffecbf,3.1); sunLight.position.set(7,10,5); sunLight.castShadow=true; scene.add(ambient,sunLight);
const orbit=new THREE.Group(), celestial=new THREE.Group(); scene.add(orbit,celestial);
const mat=(c,em=0)=>new THREE.MeshToonMaterial({color:c,emissive:c,emissiveIntensity:em});
function mesh(geo,material,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;world.add(m);return m}

class Island{
 constructor(){this.group=new THREE.Group();world.add(this.group);const soil=new THREE.Mesh(new THREE.CylinderGeometry(5.3,3.4,1.8,8),mat(0x9a5b3d));soil.position.y=-1;soil.castShadow=true;this.group.add(soil);const grass=new THREE.Mesh(new THREE.CylinderGeometry(5.35,5.08,.42,8),mat(0x5ca85a));grass.position.y=-.03;grass.castShadow=true;this.group.add(grass);for(let i=0;i<18;i++){const a=i/18*Math.PI*2,r=3.5+Math.random()*1.2;const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.12+Math.random()*.22),mat(0x6c453a));rock.position.set(Math.cos(a)*r,.34,Math.sin(a)*r);this.group.add(rock)} }
 update(t){this.group.position.y=Math.sin(t*.8)*.18}
}
class BigBen{
 constructor(){this.lit=[];const stone=mat(0xeacb93), roof=mat(0x5c5369);mesh(new THREE.BoxGeometry(1.1,4,1.1),stone,0,2.2,0);mesh(new THREE.ConeGeometry(.86,1.7,4),roof,0,5.04,0).rotation.y=Math.PI/4;for(const z of [-.57,.57]){const face=mesh(new THREE.CylinderGeometry(.36,.36,.04,24),mat(0xf9f4d1),0,3.35,z);face.rotation.x=Math.PI/2;const hand=mesh(new THREE.BoxGeometry(.025,.23,.035),mat(0x283652),0,3.42,z*1.04);hand.rotation.z=.55;this.lit.push(face.material)}for(let i=0;i<4;i++){const a=i*Math.PI/2;const win=mesh(new THREE.BoxGeometry(.13,.42,.04),mat(0xffc961),Math.cos(a)*.57,1.75,Math.sin(a)*.57);this.lit.push(win.material)}}
 setLights(v){this.lit.forEach(m=>m.emissiveIntensity=v?1.2:0)}
}
class LondonEye{
 constructor(){this.lit=[];const g=new THREE.Group();g.position.set(-2.9,1.25,-.3);world.add(g);const ring=new THREE.Mesh(new THREE.TorusGeometry(1.28,.07,8,32),mat(0xf6e7cc));ring.rotation.y=Math.PI/2;g.add(ring);const hub=new THREE.Mesh(new THREE.SphereGeometry(.14,12,8),mat(0xefb447));g.add(hub);for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const spoke=new THREE.Mesh(new THREE.BoxGeometry(.025,1.22,.025),mat(0xd6e8e7));spoke.rotation.z=-a;spoke.position.set(0,Math.sin(a)*.61,Math.cos(a)*.61);g.add(spoke);const pod=new THREE.Mesh(new THREE.SphereGeometry(.11,10,7),mat(0xffd15e),0,Math.sin(a)*1.28,Math.cos(a)*1.28);g.add(pod);this.lit.push(pod.material)}const leg=new THREE.Mesh(new THREE.CylinderGeometry(.08,.13,1.5,6),mat(0xe4c79e));leg.position.y=-1.55;leg.rotation.z=.3;g.add(leg);this.g=g}
 update(dt){this.g.rotation.x+=dt*.1}setLights(v){this.lit.forEach(m=>m.emissiveIntensity=v?1.1:0)}
}
class TowerBridge{
 constructor(){this.lit=[];const c=mat(0xe7d7bc),blue=mat(0x315b8e),makeTower=(x)=>{mesh(new THREE.BoxGeometry(.72,2.05,.72),c,x,1.23,2.8);mesh(new THREE.ConeGeometry(.57,.9,4),blue,x,2.7,2.8);const w=mesh(new THREE.BoxGeometry(.15,.28,.03),mat(0xffc95c),x,1.35,3.18);this.lit.push(w.material)};makeTower(-1.25);makeTower(1.25);mesh(new THREE.BoxGeometry(2.1,.34,.55),blue,0,1.53,2.8);mesh(new THREE.BoxGeometry(3.6,.12,.48),mat(0x503d4a),0,.65,2.8);for(let x of [-1.25,1.25]){const cable=mesh(new THREE.CylinderGeometry(.025,.025,1.42),mat(0xdfe5e0),x,1.2,2.8);cable.rotation.z=x<0?-.7:.7}}
 setLights(v){this.lit.forEach(m=>m.emissiveIntensity=v?1.1:0)}
}
class WeatherSystem{
 constructor(){this.pool=[];this.weather='spring';const leafGeo=new THREE.PlaneGeometry(.16,.16),snowGeo=new THREE.CircleGeometry(.055,8);for(let i=0;i<150;i++){const p=new THREE.Mesh(leafGeo,mat(0xe97a3e));p.visible=false;p.userData={speed:.4+Math.random()*.9,phase:Math.random()*7,kind:'leaf'};world.add(p);this.pool.push(p)}for(let i=0;i<170;i++){const p=new THREE.Mesh(snowGeo,mat(0xffffff));p.visible=false;p.userData={speed:.6+Math.random(),phase:Math.random()*7,kind:'snow'};world.add(p);this.pool.push(p)}this.fog=new THREE.FogExp2(0xc6e7e2,.035);scene.fog=this.fog}
 reset(kind){this.weather=kind;this.pool.forEach((p,i)=>{const on=(kind==='autumn'&&p.userData.kind==='leaf')||(kind==='winter'&&p.userData.kind==='snow');p.visible=on;if(on)this.spawn(p,i,true)});}
 spawn(p,i,top){p.position.set((Math.random()-.5)*14,top?3+Math.random()*5:-2.5,(Math.random()-.5)*12);p.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3)}
 update(dt,t,season){const target=season==='spring'?.052:season==='winter'?.035:.012;this.fog.damp=target;this.fog.density+= (target-this.fog.density)*dt*.9;this.pool.forEach((p,i)=>{if(!p.visible)return;p.position.y-=p.userData.speed*dt;p.position.x+=Math.sin(t*1.4+p.userData.phase)*dt*.42;p.rotation.x+=dt*2;p.rotation.z+=dt*1.2;if(p.position.y<-2.45)this.spawn(p,i,true)})}
}
new Island(); const ben=new BigBen(), eye=new LondonEye(), bridge=new TowerBridge(), weather=new WeatherSystem();
// Thames ribbon and stylised trees
mesh(new THREE.BoxGeometry(8.5,.03,.78),mat(0x4aa8bf),0,.27,-1.7);for(let i=0;i<9;i++){const a=i/9*Math.PI*2,r=3.8;mesh(new THREE.CylinderGeometry(.08,.12,.65,7),mat(0x704d35),Math.cos(a)*r,.65,Math.sin(a)*r);mesh(new THREE.SphereGeometry(.42,8,6),mat(i%2?0x7dbf65:0x96c96d),Math.cos(a)*r,1.16,Math.sin(a)*r)}
const sun=new THREE.Mesh(new THREE.SphereGeometry(.5,18,12),mat(0xffdf75,1)),moon=new THREE.Mesh(new THREE.SphereGeometry(.38,16,12),mat(0xd7e8ff,1));celestial.add(sun,moon);
const seasons=[{name:'SPRING · MIST',sky:0x9bd7d5,ground:0x63a964},{name:'SUMMER · GOLD',sky:0x69c9eb,ground:0x74b757},{name:'AUTUMN · LEAVES',sky:0xe5a777,ground:0x869f4e},{name:'WINTER · SNOW',sky:0x9fb9d7,ground:0x75a899}];let current=0,seasonMix=1,previous=0;
function chooseSeason(n){previous=current;current=n;seasonMix=0;weather.reset(['spring','summer','autumn','winter'][n]);document.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',i===n));label.textContent=seasons[n].name}chooseSeason(0);document.querySelectorAll('button').forEach(b=>b.onclick=()=>chooseSeason(+b.dataset.season));
let angle=.62,drag=false,lastX=0;canvas.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(drag){angle-=(e.clientX-lastX)*.009;lastX=e.clientX}});canvas.addEventListener('pointerup',()=>drag=false);
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}addEventListener('resize',resize);resize();
function tick(){const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;requestAnimationFrame(tick);seasonMix=Math.min(1,seasonMix+dt*.22);const s=seasons[current],p=seasons[previous], sky=new THREE.Color(p.sky).lerp(new THREE.Color(s.sky),seasonMix);scene.background=sky;const cycle=(t%15)/15,day=(Math.sin(cycle*Math.PI*2-Math.PI/2)+1)/2,night=1-day;sun.position.set(Math.cos(cycle*Math.PI*2)*9,Math.sin(cycle*Math.PI*2)*7,0);moon.position.copy(sun.position).multiplyScalar(-1);sun.visible=day>.14;moon.visible=day<.72;ambient.intensity=.35+day*2.1;sunLight.intensity=.12+day*3.2;sunLight.color.setHSL(.1,.72,.48+day*.32);scene.fog.color.copy(sky);const lights=day<.35;ben.setLights(lights);eye.setLights(lights);bridge.setLights(lights);world.rotation.y=angle;camera.lookAt(0,1,0);world.position.y=Math.sin(t*.8)*.12;eye.update(dt);weather.update(dt,t,['spring','summer','autumn','winter'][current]);renderer.render(scene,camera)}tick();
