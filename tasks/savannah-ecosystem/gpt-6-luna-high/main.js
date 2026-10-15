(() => {
'use strict';
const canvas=document.getElementById('savannah'), ctx=canvas.getContext('2d',{alpha:false}), W=1000,H=500,TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t, rand=(a,b)=>a+Math.random()*(b-a);
const WEATHER={
 sunny:{label:'SUNNY',rate:0,active:1,tint:[0,0,0]},rain:{label:'RAIN',rate:20,active:.93,tint:[47,69,80]},
 heavyRain:{label:'HEAVY RAIN',rate:58,active:.79,tint:[28,43,55]},snow:{label:'SNOW',rate:18,active:.68,tint:[116,137,145]},
 thunderstorm:{label:'THUNDERSTORM',rate:40,active:.73,tint:[39,44,62]},tornado:{label:'TORNADO',rate:12,active:.84,tint:[61,68,61]}
};
class SeasonManager {
 constructor(){this.season='dry';this.elapsed=0;this.transition=1;}
 set(s){if(s===this.season)return;this.season=s;this.elapsed=0;this.transition=0;}
 toggle(){this.set(this.season==='dry'?'wet':'dry');}
 update(dt){this.elapsed+=dt;if(this.elapsed>=60){this.elapsed%=60;this.set(this.season==='dry'?'wet':'dry');}this.transition=Math.min(1,this.transition+dt/3);}
 get wetness(){return this.season==='wet'?this.transition:1-this.transition;}
}
class ParticlePool {
 constructor(n=1000){this.items=Array.from({length:n},()=>({active:false}));this.free=this.items.slice();this.live=[];}
 acquire(data){const p=this.free.pop();if(!p)return null;Object.assign(p,data,{active:true});this.live.push(p);return p;}
 releaseAt(i){const p=this.live[i];p.active=false;this.live[i]=this.live[this.live.length-1];this.live.pop();this.free.push(p);}
 clear(){while(this.live.length)this.releaseAt(this.live.length-1);}
 get count(){return this.live.length;}
}
class Animal {
 constructor(kind,x,y,speed,group){Object.assign(this,{kind,x,baseY:y,speed,group});this.gait=rand(0,TAU);this.state='move';this.stateTime=rand(4,12);}
 update(dt,season,weather){
  this.stateTime-=dt;
  if(this.stateTime<=0){
   if(this.kind==='leopard'&&season==='dry'&&Math.random()<.28){this.state='climb';this.stateTime=rand(4,7);}
   else if(this.kind==='lion'&&Math.random()<.34){this.state='rest';this.stateTime=rand(2,5);}
   else if(this.kind==='elephant'&&Math.random()<.25){this.state='drink';this.stateTime=rand(2,4);}
   else{this.state='move';this.stateTime=rand(7,14);}
  }
  let f=(this.state==='rest'||this.state==='drink') ? .14 : 1;
  if(this.state==='climb')f=.24;
  if(this.group&&season==='dry')f*=.91;
  this.x+=this.speed*(season==='wet'?1.17:.85)*WEATHER[weather].active*f*dt;
  if(this.x>W+130)this.x=-130;
  this.gait+=dt*(this.kind==='leopard'?8:this.kind==='elephant'?2.3:3.7)*(f>.5?1:.3);
  this.y=this.baseY-(this.state==='climb'?Math.sin((this.stateTime%4)/4*Math.PI)*54:0);
 }
 draw(g){
  g.save();g.translate(this.x,this.y);
  if(this.kind==='lion')drawLion(g,this.gait,this.state);
  if(this.kind==='elephant')drawElephant(g,this.gait,this.state);
  if(this.kind==='leopard')drawLeopard(g,this.gait,this.state);
  g.restore();
 }
}
class WeatherManager {
 constructor(pool,animals){this.pool=pool;this.animals=animals;this.current='sunny';this.acc=0;this.puddle=0;this.lightning=0;this.nextFlash=rand(5,9);this.flashX=-1;this.tornadoX=760;this.tornadoY=405;}
 set(w){if(!WEATHER[w]||w===this.current)return;this.current=w;this.pool.clear();this.acc=0;this.lightning=0;this.flashX=-1;}
 update(dt,time,seasonName){
  const w=this.current, wet=['rain','heavyRain','thunderstorm'].includes(w);
  this.puddle=lerp(this.puddle,wet?1:0,1-Math.exp(-dt*.28));
  if(w==='tornado')this.followNearest(dt);
  // Snow remains selectable, but its already-uncommon flakes thin out sharply in the wet season.
  this.acc+=WEATHER[w].rate*(w==='snow'&&seasonName==='wet' ? .22 : 1)*dt;
  while(this.acc>=1){this.acc-=1;this.spawn(w);}
  const grav=w==='snow'?13:wet?330:55;
  for(let i=this.pool.live.length-1;i>=0;i--){
   const p=this.pool.live[i];p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=grav*dt;
   if(p.kind==='snow')p.x+=Math.sin(time*1.6+p.phase)*13*dt;
   if(p.kind==='swirl'){const dx=this.tornadoX-p.x,dy=this.tornadoY-65-p.y;p.vx+=(dx*.8-dy*1.2)*dt;p.vy+=(dy*.8+dx*1.2)*dt;}
   if(p.age>=p.life||p.y>H+12||p.x < -20||p.x>W+20)this.pool.releaseAt(i);
  }
  if(w==='thunderstorm'){this.nextFlash-=dt;if(this.nextFlash<=0){const x=this.findSafeStrike();if(x!==null){this.flashX=x;this.lightning=.22;}this.nextFlash=rand(5,10);}}
  this.lightning=Math.max(0,this.lightning-dt);
 }
 followNearest(dt){
  const a=this.animals.reduce((best,x)=>Math.abs(x.x-this.tornadoX)<Math.abs(best.x-this.tornadoX)?x:best,this.animals[0]);
  if(a){const aim=clamp(a.x+(a.x>this.tornadoX?-105:105),90,920);this.tornadoX+=clamp(aim-this.tornadoX,-24*dt,24*dt);this.tornadoY=a.y;}
 }
 findSafeStrike(){
  // Every strike candidate is checked against all live animal positions; candidates inside a 125-unit clearance are rejected.
  let best=null,clearance=125;
  for(let x=45;x<=955;x+=35){let nearest=Infinity;for(const a of this.animals)nearest=Math.min(nearest,Math.hypot(x-a.x,Math.abs(a.y-405)*.65));if(nearest>clearance){clearance=nearest;best=x;}}
  return best;
 }
 spawn(w){
  const x=rand(0,W);
  if(['rain','heavyRain','thunderstorm'].includes(w))this.pool.acquire({kind:'rain',x,y:-8,vx:-60,vy:rand(230,390),age:0,life:2.2,size:w==='heavyRain'?1.7:1.1});
  else if(w==='snow')this.pool.acquire({kind:'snow',x,y:-8,vx:rand(-9,9),vy:rand(24,55),age:0,life:12,size:rand(1,3),phase:rand(0,TAU)});
  else if(w==='tornado'){const a=rand(0,TAU),r=rand(8,55);this.pool.acquire({kind:'swirl',x:this.tornadoX+Math.cos(a)*r,y:this.tornadoY-rand(15,140),vx:0,vy:0,age:0,life:rand(1.4,4.5),size:rand(1,3)});}
  else if(Math.random()<.55)this.pool.acquire({kind:'dust',x,y:rand(320,430),vx:rand(-14,18),vy:rand(-9,2),age:0,life:rand(4,11),size:rand(1,3)});
 }
 draw(g,time){
  if(this.puddle>.01){g.save();g.globalAlpha=this.puddle*.42;for(let i=0;i<8;i++){const x=80+i*125+Math.sin(time*.3+i)*14;g.fillStyle='#718c83';g.beginPath();g.ellipse(x,435+(i%3)*11,30+i%4*8,3,0,0,TAU);g.fill();g.strokeStyle='rgba(220,238,225,.55)';g.beginPath();g.ellipse(x,435+(i%3)*11,19+i%3*6,2,0,0,TAU);g.stroke();}g.restore();}
  if(this.current==='tornado')drawTornado(g,this.tornadoX,this.tornadoY,time);
  for(const p of this.pool.live){
   g.globalAlpha=clamp(1-p.age/p.life,.15,.92);
   if(p.kind==='rain'){g.strokeStyle='#c3d4d4';g.lineWidth=p.size;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x-3,p.y+10);g.stroke();}
   else{g.fillStyle=p.kind==='snow'?'#f1f4e9':p.kind==='swirl'?'#d2ba8e':'#dcae70';g.beginPath();g.arc(p.x,p.y,p.size,0,TAU);g.fill();}
  }
  g.globalAlpha=1;
  if(this.lightning>0){const a=Math.min(1,this.lightning*5);g.fillStyle='rgba(224,235,255,'+(a*.13)+')';g.fillRect(0,0,W,H);drawLightning(g,this.flashX,a);}
 }
}
const season=new SeasonManager();
const animals=[new Animal('lion',122,394,24,'pride'),new Animal('lion',183,402,24,'pride'),new Animal('elephant',325,395,17,'herd'),new Animal('elephant',398,405,17,'herd'),new Animal('leopard',640,411,45),new Animal('leopard',830,405,39)];
const pool=new ParticlePool(1200),weather=new WeatherManager(pool,animals);
let last=performance.now(),elapsed=0,width=1,height=1;
function resize(){const r=canvas.getBoundingClientRect();const dpr=Math.min(2,devicePixelRatio||1);width=Math.max(1,r.width);height=Math.max(1,r.height);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);}
new ResizeObserver(resize).observe(canvas);window.addEventListener('resize',resize,{passive:true});
function frame(now){
 const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;elapsed+=dt;season.update(dt);
 animals.forEach(a=>a.update(dt,season.season,weather.current));weather.update(dt,elapsed,season.season);drawScene(ctx,elapsed,season,weather);
 document.getElementById('particleCount').textContent=String(pool.count).padStart(3,'0');
 document.getElementById('weatherLabel').textContent=WEATHER[weather.current].label;
 document.getElementById('seasonLabel').textContent=season.season.toUpperCase()+' SEASON';
 document.getElementById('seasonButtonTitle').textContent=season.season.toUpperCase()+' SEASON';
 document.getElementById('seasonTimer').textContent='AUTO · '+Math.ceil(60-season.elapsed)+'s';
 document.getElementById('moodLabel').textContent=weather.current==='tornado'?'Dust devil tracking the herd':weather.current==='snow'?'A rare cool spell on the plains':season.season==='wet'?'Fresh grass, lively herds':'Herd on the move';
 requestAnimationFrame(frame);
}
function drawScene(g,time,s,wm){
 const wet=s.wetness;
 const sky=[mixHex('#eab879','#698998',wet),mixHex('#f3d39b','#9eb6b2',wet),mixHex('#c4b17e','#9eb29c',wet)];
 const grad=g.createLinearGradient(0,0,0,430);grad.addColorStop(0,sky[0]);grad.addColorStop(.52,sky[1]);grad.addColorStop(1,sky[2]);g.fillStyle=grad;g.fillRect(0,0,W,H);
 const sx=770-wet*250,sy=104,halo=g.createRadialGradient(sx,sy,5,sx,sy,110);halo.addColorStop(0,'rgba(255,235,181,'+(.36*(1-wet*.65))+')');halo.addColorStop(1,'rgba(255,235,181,0)');g.fillStyle=halo;g.fillRect(sx-115,sy-115,230,230);
 g.fillStyle='rgba(255,239,205,'+(.78*(1-wet*.68))+')';g.beginPath();g.arc(sx,sy,23,0,TAU);g.fill();drawClouds(g,time,wet);
 g.fillStyle=mixHex('#82744f','#617c69',wet);g.beginPath();g.moveTo(0,289);g.quadraticCurveTo(100,223,215,263);g.quadraticCurveTo(320,294,410,257);g.quadraticCurveTo(518,216,650,269);g.quadraticCurveTo(790,302,1000,244);g.lineTo(1000,435);g.lineTo(0,435);g.fill();
 for(let i=0;i<7;i++)drawAcacia(g,i*177+40+Math.sin(time*.08+i)*8,278+(i%2)*15,.42+(i%3)*.08,'#56664d',.58);
 const grass=mixHex('#b68a46','#71894d',wet),ground=g.createLinearGradient(0,330,0,H);ground.addColorStop(0,grass);ground.addColorStop(1,mixHex(grass,'#342f20',.46));g.fillStyle=ground;g.beginPath();g.moveTo(0,333);g.quadraticCurveTo(185,317,350,341);g.quadraticCurveTo(590,362,810,329);g.quadraticCurveTo(915,316,1000,333);g.lineTo(1000,H);g.lineTo(0,H);g.fill();
 g.fillStyle='rgba(113,145,137,'+(.13+wm.puddle*.11)+')';g.beginPath();g.ellipse(526,379,210,15,-.015,0,TAU);g.fill();g.strokeStyle='rgba(232,217,176,.23)';g.beginPath();g.ellipse(526,379,154,8,-.015,0,TAU);g.stroke();
 drawAcacia(g,85,357,1.24,'#3a3c2b',.98);drawAcacia(g,919,341,1.1,'#42432d',.96);drawBushes(g,wet);
 wm.draw(g,time);animals.slice().sort((a,b)=>a.baseY-b.baseY).forEach(a=>a.draw(g));drawGrass(g,time,wet);
 const tint=WEATHER[wm.current].tint;if(wm.current!=='sunny'){g.fillStyle='rgba('+tint.join(',')+','+(wm.current==='heavyRain' ? .24 : .14)+')';g.fillRect(0,0,W,H);}
 const v=g.createRadialGradient(500,250,180,500,250,620);v.addColorStop(0,'rgba(18,24,17,0)');v.addColorStop(1,'rgba(18,24,17,.21)');g.fillStyle=v;g.fillRect(0,0,W,H);
}
function drawClouds(g,time,wet){for(let i=0;i<(wet>.5?5:3);i++){const x=((i*263+time*(5+i)+80)%1220)-110,y=72+(i%3)*46;g.fillStyle='rgba('+(wet>.5?'63,82,91':'255,238,205')+','+(.23+wet*.2)+')';g.beginPath();g.ellipse(x,y,49,12,0,0,TAU);g.ellipse(x-18,y-4,22,12,0,0,TAU);g.ellipse(x+8,y-8,25,18,0,0,TAU);g.ellipse(x+31,y-3,18,10,0,0,TAU);g.fill();}}
function drawAcacia(g,x,y,scale,color,alpha){g.save();g.translate(x,y);g.scale(scale,scale);g.globalAlpha=alpha;g.strokeStyle='#514535';g.lineWidth=8;g.lineCap='round';g.beginPath();g.moveTo(0,0);g.lineTo(3,-59);g.lineTo(-9,-81);g.moveTo(2,-53);g.lineTo(19,-75);g.stroke();g.fillStyle=color;g.beginPath();g.moveTo(-56,-82);g.quadraticCurveTo(-44,-99,-21,-91);g.quadraticCurveTo(-1,-108,17,-91);g.quadraticCurveTo(47,-100,57,-80);g.quadraticCurveTo(32,-69,1,-76);g.quadraticCurveTo(-33,-69,-56,-82);g.fill();g.restore();}
function drawBushes(g,wet){for(let i=0;i<15;i++){const x=(i*79+23)%W,y=363+(i%4)*24;g.fillStyle=mixHex('#79623a','#4e6941',wet);g.beginPath();g.ellipse(x,y,13+i%4*3,4+i%3*2,0,Math.PI,TAU);g.fill();}}
function drawGrass(g,time,wet){g.strokeStyle=mixHex('#d7ac62','#b1bd70',wet);g.lineWidth=1.15;for(let i=0;i<130;i++){const x=(i*47+9)%W,y=439+(i*31)%63,lean=Math.sin(time*1.4+i*3.1)*(2+wet*2);g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+lean,y-7-i%8,x+lean*1.4,y-13-i%8);g.stroke();}}
function drawLion(g,gait,state){const step=Math.sin(gait)*5,bob=Math.abs(Math.sin(gait))*1.7;g.save();g.translate(0,bob);g.strokeStyle='#70502d';g.lineWidth=4;g.lineCap='round';g.beginPath();g.moveTo(-21,-17);g.quadraticCurveTo(-34,-28,-39,-17);g.stroke();g.fillStyle='#bd8a4e';g.beginPath();g.ellipse(-1,-18,25,14,-.04,0,TAU);g.fill();g.fillStyle='#8e572e';g.beginPath();g.ellipse(22,-23,17,17,0,0,TAU);g.fill();g.fillStyle='#d2a35b';g.beginPath();g.ellipse(23,-23,11,12,0,0,TAU);g.fill();g.fillStyle='#c18b4d';g.beginPath();g.ellipse(34,-22,9,8,0,0,TAU);g.fill();g.fillStyle='#432e21';g.beginPath();g.arc(38,-24,1.3,0,TAU);g.fill();g.strokeStyle='#78512f';g.lineWidth=3.4;for(const [x,o]of[[-15,0],[0,2],[13,0],[23,2]]){const lift=state==='rest'?0:Math.max(0,Math.sin(gait+o))*5;g.beginPath();g.moveTo(x,-10);g.lineTo(x+(x<0?-1:2)+step*(x%2?.2:-.2),-lift+1);g.lineTo(x+2,0);g.stroke();}g.restore();}
function drawElephant(g,gait,state){const bob=Math.abs(Math.sin(gait))*1.1;g.save();g.translate(0,bob);g.fillStyle='#777d70';g.beginPath();g.ellipse(-1,-30,32,24,0,0,TAU);g.fill();g.fillStyle='#858a7b';g.beginPath();g.ellipse(23,-35,19,19,0,0,TAU);g.fill();g.fillStyle='#a5a496';g.beginPath();g.ellipse(29,-40,11,15,-.4,0,TAU);g.fill();g.fillStyle='#777d70';g.beginPath();g.ellipse(33,-34,8,11,0,0,TAU);g.fill();g.strokeStyle='#777d70';g.lineWidth=7;g.lineCap='round';g.beginPath();g.moveTo(37,-30);g.quadraticCurveTo(41,-19,37+(state==='drink'?-10:Math.sin(gait*.6)*4),-14);g.stroke();g.strokeStyle='#e8dfc9';g.lineWidth=2.4;g.beginPath();g.moveTo(28,-28);g.lineTo(33,-22);g.stroke();g.fillStyle='#252b25';g.beginPath();g.arc(30,-40,1.4,0,TAU);g.fill();g.strokeStyle='#555e54';g.lineWidth=5;for(const [x,o]of[[-20,0],[-4,1],[15,2],[27,0]]){g.beginPath();g.moveTo(x,-13);g.lineTo(x+Math.sin(gait+o)*2+Math.sin(gait)*3,0);g.stroke();}g.restore();}
function drawLeopard(g,gait,state){g.save();g.translate(0,Math.sin(gait)*2.3+(state==='climb'?-5:0));g.strokeStyle='#d7aa5b';g.lineWidth=3;g.lineCap='round';g.beginPath();g.moveTo(-20,-18);g.quadraticCurveTo(-38,-29,-40,-18);g.stroke();g.fillStyle='#d5a04e';g.beginPath();g.ellipse(-1,-18,24,11,-.08,0,TAU);g.fill();g.fillStyle='#d6a451';g.beginPath();g.arc(22,-22,9,0,TAU);g.fill();g.fillStyle='#332820';g.beginPath();g.arc(25,-23,1.2,0,TAU);g.fill();g.fillStyle='#403022';for(const[x,y,r]of[[-14,-20,1.5],[-7,-25,1.4],[1,-15,1.6],[8,-23,1.3],[14,-17,1.4],[-21,-15,1.1]]){g.beginPath();g.arc(x,y,r,0,TAU);g.fill();}g.strokeStyle='#8a6539';g.lineWidth=2.7;for(const[x,o]of[[-14,0],[-2,1],[11,2],[19,0]]){g.beginPath();g.moveTo(x,-10);g.lineTo(x+Math.sin(gait+o)*3,0);g.stroke();}g.restore();}
function drawTornado(g,x,y,time){g.save();const grad=g.createLinearGradient(x-58,0,x+58,0);grad.addColorStop(0,'rgba(111,104,83,0)');grad.addColorStop(.5,'rgba(91,88,73,.37)');grad.addColorStop(1,'rgba(111,104,83,0)');g.fillStyle=grad;g.beginPath();g.moveTo(x-8,185);g.quadraticCurveTo(x-19,250,x-56,y+8);g.quadraticCurveTo(x,y-4,x+56,y+8);g.quadraticCurveTo(x+20,250,x+8,185);g.fill();for(let i=0;i<5;i++){const yy=220+i*37+Math.sin(time*2+i)*3,rw=8+i*8;g.strokeStyle='rgba(222,202,160,'+(.28-i*.025)+')';g.beginPath();g.ellipse(x+Math.sin(time*1.1+i)*6,yy,rw,3,0,0,TAU);g.stroke();}g.restore();}
function drawLightning(g,x,a){if(x<0)return;const p=[[x,0],[x-9,33],[x+5,53],[x-12,82],[x-3,102],[x-25,139]];g.save();g.globalAlpha=a;g.strokeStyle='#fff4ca';g.lineWidth=4;g.shadowColor='#d8e5ff';g.shadowBlur=13;g.beginPath();p.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.stroke();g.restore();}
function mixHex(a,b,t){const parse=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)],aa=parse(a),bb=parse(b);return '#'+aa.map((v,i)=>Math.round(lerp(v,bb[i],t)).toString(16).padStart(2,'0')).join('');}
function selectWeather(name){weather.set(name);document.querySelectorAll('.weather-button').forEach(b=>{const active=b.dataset.weather===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
document.querySelectorAll('.weather-button').forEach(b=>b.addEventListener('click',()=>selectWeather(b.dataset.weather)));
document.getElementById('seasonButton').addEventListener('click',()=>season.toggle());
window.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.matches('button,input,textarea,select'))return;const k=['sunny','rain','heavyRain','snow','thunderstorm','tornado'],n=Number(e.key);if(n>=1&&n<=6)selectWeather(k[n-1]);if(e.key.toLowerCase()==='s')season.toggle();});
document.querySelectorAll('.weather-button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weather==='sunny')));
resize();requestAnimationFrame(frame);
})();
