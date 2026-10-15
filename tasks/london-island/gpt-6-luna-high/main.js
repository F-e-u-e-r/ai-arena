import * as THREE from 'three';

const $ = s => document.querySelector(s);
const sceneRoot = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
sceneRoot.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9dfe1');
scene.fog = new THREE.Fog('#a9dfe1', 13, 32);
const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
let orbit = 5.15, azimuth = .32, elevation = .22;
const target = new THREE.Vector3(0, 1.55, 0);
function placeCamera(){ camera.position.set(Math.sin(azimuth)*orbit, target.y + Math.sin(elevation)*orbit, Math.cos(azimuth)*orbit); camera.lookAt(target); }
placeCamera();

const hemi = new THREE.HemisphereLight('#dffaff','#9a7956',1.65); scene.add(hemi);
const key = new THREE.DirectionalLight('#fff1d5',3.0); key.position.set(-5,9,6); scene.add(key);
key.castShadow = true; key.shadow.mapSize.set(1024,1024); key.shadow.camera.left=-7;key.shadow.camera.right=7;key.shadow.camera.top=8;key.shadow.camera.bottom=-5;
const fill = new THREE.DirectionalLight('#8ccbd4',.7); fill.position.set(5,4,-5);scene.add(fill);

const mat = (color, extra={}) => new THREE.MeshToonMaterial({color, ...extra});
const standard = (color, extra={}) => new THREE.MeshStandardMaterial({color,roughness:.78,...extra});
const island = new THREE.Group(); scene.add(island);
const landmarks = new THREE.Group(); island.add(landmarks);
const seasonColors = [new THREE.Color('#94d3b5'),new THREE.Color('#74c9a2'),new THREE.Color('#c59058'),new THREE.Color('#c4d9df')];

function addMesh(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(parent,r1,r2,h,material,x,y,z,segments=12){return addMesh(parent,new THREE.CylinderGeometry(r1,r2,h,segments),material,x,y,z);}

// Layered, tapered earth gives the island a soft, hand-built silhouette.
const soil=mat('#795740'), soilLight=mat('#9b6e4e'), grass=mat('#76b973');
cylinder(island,2.15,2.48,.34,soil,0,.03,0,48);
cylinder(island,2.48,2.10,.42,soilLight,0,-.31,0,48);
cylinder(island,2.10,1.78,.46,soil,0,-.72,0,48);
addMesh(island,new THREE.CylinderGeometry(2.15,2.48,.12,48),grass,0,.25,0);
// Small scalloped ground patches and tiny flowers.
const patchMat=mat('#8cc77b');
for(let i=0;i<18;i++){const a=i*2.4, r=.45+(i%5)*.31;addMesh(island,new THREE.SphereGeometry(.62,12,8),patchMat,Math.cos(a)*r,.29,Math.sin(a)*r,1,.12,.76);}

// Big Ben / Elizabeth Tower: warm stone, stepped roof, four glowing clock faces.
const stone=mat('#e6c797'), stoneHi=mat('#f5dfb6'), roof=mat('#526f70'), dark=mat('#314c53');
const ben=new THREE.Group();landmarks.add(ben);ben.position.set(-.12,.3,.03);
addMesh(ben,new THREE.BoxGeometry(.48,2.15,.46),stone,0,1.28,0);
addMesh(ben,new THREE.BoxGeometry(.56,.34,.54),stoneHi,0,2.44,0);
addMesh(ben,new THREE.BoxGeometry(.4,.66,.4),stone,.0,2.94,0);
const roofGeo=new THREE.ConeGeometry(.34,.67,4);const benRoof=addMesh(ben,roofGeo,roof,0,3.59,0);benRoof.rotation.y=Math.PI/4;
for(let i=0;i<4;i++){const a=i*Math.PI/2;const face=new THREE.Mesh(new THREE.CircleGeometry(.135,24),standard('#fff0c9',{emissive:'#ffd568',emissiveIntensity:0}));face.position.set(Math.sin(a)*.237,1.86,Math.cos(a)*.237);face.rotation.y=a;ben.add(face);const rim=new THREE.Mesh(new THREE.TorusGeometry(.145,.018,6,24),mat('#b27b48'));rim.position.copy(face.position);rim.rotation.y=a;ben.add(rim);const hands=new THREE.Group();hands.position.copy(face.position);hands.rotation.y=a;const h1=addMesh(hands,new THREE.BoxGeometry(.012,.075,.008),dark,0,.018,.009);h1.rotation.z=.28;const h2=addMesh(hands,new THREE.BoxGeometry(.01,.05,.008),dark,.025,-.005,.009);h2.rotation.z=-.55;ben.add(hands);}
for(let y=.55;y<2.15;y+=.28){for(const x of [-.15,.15])addMesh(ben,new THREE.BoxGeometry(.07,.1,.012),mat('#9c7650'),x,y,.236);}
const benLamp=new THREE.PointLight('#ffd887',0,2.5,2);benLamp.position.set(0,2.15,.5);ben.add(benLamp);

// London Eye wheel and radial spokes, placed behind the riverbank.
const eye=new THREE.Group();landmarks.add(eye);eye.position.set(1.13,.9,-.65);eye.rotation.y=-.22;
const wheelMat=mat('#617f83'), wheel=new THREE.Mesh(new THREE.TorusGeometry(.8,.045,8,64),wheelMat);wheel.position.y=.93;eye.add(wheel);
const hub=addMesh(eye,new THREE.SphereGeometry(.09,16,12),mat('#d8b378'),0,.93,0);
for(let i=0;i<16;i++){const a=i*Math.PI/8;const spoke=addMesh(eye,new THREE.BoxGeometry(.018,.78,.018),mat('#8ba3a0'),Math.sin(a)*.39,.93+Math.cos(a)*.39,0);spoke.rotation.z=-a;}
for(const x of [-.43,.43]){addMesh(eye,new THREE.BoxGeometry(.07,1.02,.09),stone,x,.45,0);addMesh(eye,new THREE.BoxGeometry(.2,.09,.2),mat('#c69258'),x,.04,0);}
for(let i=0;i<16;i++){const a=i*Math.PI/8;const pod=addMesh(eye,new THREE.SphereGeometry(.075,12,8),mat('#e6ae6b'),Math.sin(a)*.8,.93+Math.cos(a)*.8,.02,.8,1.15,.75);pod.userData.angle=a;}
const eyeLamp=new THREE.PointLight('#ffd17a',0,2.2,2);eyeLamp.position.set(0,1.05,.15);eye.add(eyeLamp);

// Tower Bridge: two blue-roofed towers, stone spans, and hinged bascules.
const bridge=new THREE.Group();landmarks.add(bridge);bridge.position.set(-1.22,.3,-.75);bridge.rotation.y=.28;
const bridgeStone=mat('#d7c19b'), bridgeBlue=mat('#638b91');
for(const x of [-.62,.62]){addMesh(bridge,new THREE.BoxGeometry(.38,1.03,.42),bridgeStone,x,.55,0);addMesh(bridge,new THREE.BoxGeometry(.48,.13,.5),stoneHi,x,1.1,0);for(const side of [-1,1]){const cap=addMesh(bridge,new THREE.ConeGeometry(.25,.4,4),bridgeBlue,x,1.35,side*.04);cap.rotation.y=Math.PI/4;}addMesh(bridge,new THREE.BoxGeometry(.1,.32,.1),bridgeBlue,x,.84,.22);}
addMesh(bridge,new THREE.BoxGeometry(1.8,.16,.32),bridgeStone,0,.84,0);
for(const x of [-.22,.22]){const lift=addMesh(bridge,new THREE.BoxGeometry(.43,.07,.29),mat('#e9d6b2'),x,.75,.03);lift.userData.lift=true;}
addMesh(bridge,new THREE.BoxGeometry(1.84,.08,.37),bridgeBlue,0,1.13,0);
const bridgeLamp=new THREE.PointLight('#ffd17a',0,2.1,2);bridgeLamp.position.set(0,1,.25);bridge.add(bridgeLamp);

// A few toy townhouses and evergreen trees complete the miniature.
for(let i=0;i<7;i++){const a=i*2*Math.PI/7+.2,r=1.55;const x=Math.cos(a)*r,z=Math.sin(a)*r;const h=.3+(i%3)*.08;const house=new THREE.Group();landmarks.add(house);house.position.set(x,.3,z);house.rotation.y=-a;addMesh(house,new THREE.BoxGeometry(.31,h,.28),mat(['#d58c73','#e4c18a','#87aeb0'][i%3]),0,h/2,0);const cap=addMesh(house,new THREE.ConeGeometry(.26,.24,4),mat(['#a96055','#657f81','#bd8b56'][i%3]),0,h+.1,0);cap.rotation.y=Math.PI/4;addMesh(house,new THREE.BoxGeometry(.055,.09,.015),mat('#f7dfad'),0,h*.55,.15);}
const treeMat=mat('#478766'), trunk=mat('#8b6446');
for(let i=0;i<9;i++){const a=i*2.4,r=1.38+(i%2)*.2,x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.hypot(x+.12,z)<.8)continue;addMesh(landmarks,new THREE.CylinderGeometry(.045,.06,.33,7),trunk,x,.44,z);const crown=addMesh(landmarks,new THREE.SphereGeometry(.24,10,8),treeMat,x,.69,z,1,1.2,1);crown.userData.tree=true;}

// Clouds are lightweight decorative puffs drifting at several depths.
const clouds=new THREE.Group();scene.add(clouds);
for(let i=0;i<9;i++){const g=new THREE.Group();clouds.add(g);const a=i*2.4,r=4.6+(i%3)*1.3;g.position.set(Math.cos(a)*r,2.5+(i%4)*.65,Math.sin(a)*r-1);for(let j=0;j<4;j++){const p=addMesh(g,new THREE.SphereGeometry(.36+(j%2)*.08,12,9),new THREE.MeshToonMaterial({color:'#fffaf2',transparent:true,opacity:.77,depthWrite:false}),j*.29-.4,(j%2)*.16,0,1.15,.78,.92);p.castShadow=false;}g.userData.phase=i;}

// Sun and moon travel opposite arcs across the sky over one 15 second day.
const sun=addMesh(scene,new THREE.SphereGeometry(.38,24,16),new THREE.MeshBasicMaterial({color:'#ffcf75'}),0,0,0);sun.material.toneMapped=false;
const moon=addMesh(scene,new THREE.SphereGeometry(.27,20,14),new THREE.MeshBasicMaterial({color:'#f2f5ef'}),0,0,0);moon.material.toneMapped=false;
const sunGlow=new THREE.PointLight('#ffd182',0,12,2);scene.add(sunGlow);

// Reusable instanced weather pool: transform slots are recycled on wraparound.
const particleCount=240, dummy=new THREE.Object3D();
const leafGeo=new THREE.PlaneGeometry(.12,.2), snowGeo=new THREE.IcosahedronGeometry(.045,0);
const leafMesh=new THREE.InstancedMesh(leafGeo,mat('#cb6942',{side:THREE.DoubleSide}),particleCount);leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(leafMesh);
const snowMesh=new THREE.InstancedMesh(snowGeo,new THREE.MeshToonMaterial({color:'#ffffff',transparent:true,opacity:.9}),particleCount);snowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(snowMesh);
const rainMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.012,.16,.012),new THREE.MeshBasicMaterial({color:'#d5f2ed',transparent:true,opacity:.42}),120);rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(rainMesh);
let seed=24681;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const particleData=Array.from({length:particleCount},()=>({x:(rand()-.5)*7,z:(rand()-.5)*6,y:rand()*6,phase:rand()*6.28,spin:(rand()-.5)*2,speed:.45+rand()*.7}));
const rainData=Array.from({length:120},()=>({x:(rand()-.5)*6,z:(rand()-.5)*5,y:rand()*5,speed:2+rand()*2,phase:rand()*6.28}));

const seasonDefs=[{name:'SPRING',label:'SOFT MORNING MIST',icon:'☁',fog:'#b9dcdb',bg:'#a9dfe1',light:'#fff0d9'},{name:'SUMMER',label:'GOLDEN ISLAND SUN',icon:'☀',fog:'#b6dce5',bg:'#9bd8e9',light:'#fff1c7'},{name:'AUTUMN',label:'LEAVES IN THE BREEZE',icon:'🍂',fog:'#d9c5a3',bg:'#d9c6a7',light:'#ffe0b1'},{name:'WINTER',label:'QUIET LITTLE SNOWFALL',icon:'❄',fog:'#bdced9',bg:'#b9d1e1',light:'#e3efff'}];
let season=0, seasonMix=0, seasonFrom=0, seasonTo=0, seasonChanging=false, autoSeason=true, seasonClock=0;
const lerpColor=(a,b,t)=>new THREE.Color(a).lerp(new THREE.Color(b),t);
function setSeason(next){if(next===seasonTo&&seasonChanging)return;seasonFrom=season;seasonTo=next;seasonChanging=true;seasonMix=0;season=next;$('.season-btn').forEach((b,i)=>b.classList.toggle('active',i===next));$('#seasonName').textContent=seasonDefs[next].name;$('#weatherLabel').textContent=seasonDefs[next].label;$('#weatherIcon').textContent=seasonDefs[next].icon;}
$('.season-btn').forEach(b=>b.addEventListener('click',()=>{autoSeason=false;$('#cycleButton').textContent='▶';$('#cycleButton').setAttribute('aria-label','Resume seasonal cycle');setSeason(Number(b.dataset.season));}));
$('#cycleButton').addEventListener('click',()=>{autoSeason=!autoSeason;$('#cycleButton').textContent=autoSeason?'Ⅱ':'▶';$('#cycleButton').setAttribute('aria-label',autoSeason?'Pause seasonal cycle':'Resume seasonal cycle');});
$('.season-btn')[0].classList.add('active');

let pointerDown=false,lastX=0,lastY=0,moved=false;
renderer.domElement.addEventListener('pointerdown',e=>{pointerDown=true;lastX=e.clientX;lastY=e.clientY;moved=false;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!pointerDown)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>1)moved=true;azimuth-=dx*.006;elevation=THREE.MathUtils.clamp(elevation+dy*.004,-.18,.75);lastX=e.clientX;lastY=e.clientY;placeCamera();});
renderer.domElement.addEventListener('pointerup',()=>pointerDown=false);renderer.domElement.addEventListener('pointercancel',()=>pointerDown=false);
renderer.domElement.addEventListener('wheel',e=>{orbit=THREE.MathUtils.clamp(orbit+e.deltaY*.003,4.4,7.5);placeCamera();},{passive:true});

function resize(){const w=sceneRoot.clientWidth,h=sceneRoot.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<420?37:34;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();
const clock=new THREE.Clock();let elapsed=0;
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;
  island.position.y=Math.sin(elapsed*.8)*.095;island.rotation.y=Math.sin(elapsed*.18)*.035;
  eye.rotation.z=Math.sin(elapsed*.35)*.025;for(const child of eye.children){if(child.geometry?.type==='SphereGeometry'&&child.userData.angle!==undefined){const a=child.userData.angle+eye.rotation.z;child.position.y=.93+Math.cos(a)*.8;}}
  for(const child of bridge.children)if(child.userData.lift)child.rotation.z=Math.sin(elapsed*.55)*.08;
  clouds.children.forEach(c=>{c.position.x+=dt*.035*(c.userData.phase%2?1:-1);if(c.position.x>9)c.position.x=-9;if(c.position.x< -9)c.position.x=9;});
  // Day/night angle is a normalized 15 second phase; eased illumination keeps dawn and dusk soft.
  const day=(elapsed%15)/15, sunAngle=day*Math.PI*2-Math.PI/2, daylight=THREE.MathUtils.smoothstep(Math.sin(sunAngle),-.24,.22);
  if(seasonChanging){seasonMix=Math.min(1,seasonMix+dt/2.4);if(seasonMix>=1)seasonChanging=false;}
  const seasonT=seasonChanging?seasonMix*seasonMix*(3-2*seasonMix):1;
  const seasonBg=seasonChanging?lerpColor(seasonDefs[seasonFrom].bg,seasonDefs[seasonTo].bg,seasonT):new THREE.Color(seasonDefs[season].bg);
  const seasonFog=seasonChanging?lerpColor(seasonDefs[seasonFrom].fog,seasonDefs[seasonTo].fog,seasonT):new THREE.Color(seasonDefs[season].fog);
  const foliage=seasonChanging?lerpColor(seasonColors[seasonFrom],seasonColors[seasonTo],seasonT):seasonColors[season];
  grass.color.copy(foliage);patchMat.color.copy(foliage);treeMat.color.copy(foliage).multiplyScalar(.72);
  sun.position.set(Math.cos(sunAngle)*8,Math.sin(sunAngle)*5+2,-1);moon.position.set(-sun.position.x,-sun.position.y,0);sunGlow.position.copy(sun.position);sunGlow.intensity=daylight*1.3;
  hemi.intensity=.28+daylight*1.38;key.intensity=.22+daylight*2.95;key.color.copy(lerpColor('#879ac8','#fff0d5',daylight));fill.intensity=.16+daylight*.55;
  const nightColor=new THREE.Color('#26385f'), baseSky=lerpColor(nightColor,seasonBg,daylight);scene.background.copy(baseSky);
  const fogColor=lerpColor('#344566',seasonFog,daylight);scene.fog.color.copy(fogColor);scene.fog.near=season===0?8.5:12;scene.fog.far=season===0?23:31;
  const lamps=1-daylight;benLamp.intensity=lamps*2.2;eyeLamp.intensity=lamps*1.2;bridgeLamp.intensity=lamps*1.1;
  for(const face of ben.children)if(face.material?.emissive)face.material.emissiveIntensity=lamps*.7;
  sun.visible=daylight>.08;moon.visible=daylight<.82;
  if(autoSeason){seasonClock+=dt;if(seasonClock>22){seasonClock=0;setSeason((seasonTo+1)%4);}}
  // Autumn leaves, winter snow and spring drizzle reuse fixed instanced slots.
  for(let i=0;i<particleCount;i++){const p=particleData[i];p.y-=dt*p.speed*(season===3?1.05:1);p.x+=Math.sin(elapsed*1.4+p.phase)*dt*(season===2?.42:.14);p.z+=Math.cos(elapsed+p.phase)*dt*.1;p.phase+=dt*p.spin;if(p.y<-.3){p.y=5.8+rand()*1.2;p.x=(rand()-.5)*7;p.z=(rand()-.5)*6;}dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,p.phase);const isLeaf=season===2;dummy.scale.setScalar(isLeaf?1:.75);dummy.updateMatrix();leafMesh.setMatrixAt(i,dummy.matrix);dummy.scale.setScalar(1);dummy.rotation.set(p.phase*.3,0,p.phase);dummy.position.set(p.x,p.y,p.z);dummy.updateMatrix();snowMesh.setMatrixAt(i,dummy.matrix);}
  leafMesh.visible=season===2; snowMesh.visible=season===3;leafMesh.instanceMatrix.needsUpdate=true;snowMesh.instanceMatrix.needsUpdate=true;
  for(let i=0;i<rainData.length;i++){const p=rainData[i];p.y-=dt*p.speed;if(p.y<-.3){p.y=4+rand()*1.5;p.x=(rand()-.5)*6;p.z=(rand()-.5)*5;}dummy.position.set(p.x+Math.sin(elapsed+p.phase)*.12,p.y,p.z);dummy.rotation.set(0,0,-.15);dummy.updateMatrix();rainMesh.setMatrixAt(i,dummy.matrix);}rainMesh.visible=season===0;rainMesh.instanceMatrix.needsUpdate=true;
  renderer.render(scene,camera);if(elapsed>1)$('#loading').classList.add('hidden');}
animate();
