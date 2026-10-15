/* Savanna — original Canvas artwork; no libraries or external assets. */
'use strict';

(() => {
  const W = 1400;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = (a, b) => a + Math.random() * (b - a);
  const $ = (selector) => document.querySelector(selector);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function seeded(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }
  function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rotation, 0, TAU);
    ctx.fillStyle = color; ctx.fill();
  }
  function shape(ctx, points, color) {
    ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function line(ctx, points, color, width = 1) {
    ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function rgb(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
  const WEATHER = {
    sunny: { label: 'Sunny', speed: 1, wind: 8, rate: 5, caption: 'Golden light. A slower kind of life.' },
    rain: { label: 'Rain', speed: 1.2, wind: 45, rate: 160, caption: 'Fresh rain brings the grasslands to life.' },
    heavy: { label: 'Heavy rain', speed: 1.5, wind: 95, rate: 480, caption: 'The heavens open. The herds draw closer.' },
    snow: { label: 'Snow', speed: .65, wind: 30, rate: 85, caption: 'An unlikely hush falls over the savannah.' },
    storm: { label: 'Thunderstorm', speed: 1.8, wind: 125, rate: 420, caption: 'Thunder rolls. Instinct leads the way.' },
    tornado: { label: 'Tornado', speed: 2, wind: 190, rate: 90, caption: 'The wind has a wild spirit of its own.' }
  };

  class SeasonManager extends EventTarget {
    constructor() { super(); this.current = 'dry'; this.elapsed = 0; this.wetness = 0; this.duration = 60; }
    set(name) {
      if (name !== 'dry' && name !== 'wet') return;
      if (name === this.current) return;
      this.current = name; this.elapsed = 0;
      this.dispatchEvent(new CustomEvent('change', { detail: name }));
    }
    update(dt) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) this.set(this.current === 'dry' ? 'wet' : 'dry');
      // Exponential interpolation is independent of frame rate. Only the palette and
      // behavioral parameters transition: no animal is recreated or repositioned.
      this.wetness = lerp(this.wetness, this.current === 'wet' ? 1 : 0, 1 - Math.exp(-dt * .65));
    }
  }

  class ParticlePool {
    constructor(capacity) {
      this.capacity = capacity;
      this.free = Array.from({ length: capacity }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 0, phase: 0, kind: '', alpha: 1 }));
      this.active = [];
    }
    acquire(kind, x, y, vx, vy, life, size) {
      if (!this.free.length) return null;
      const p = this.free.pop();
      p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = p.maxLife = life; p.size = size; p.phase = random(0, TAU); p.alpha = 1;
      this.active.push(p); return p;
    }
    release(index) {
      const last = this.active.pop();
      if (index < this.active.length) { this.free.push(this.active[index]); this.active[index] = last; }
      else this.free.push(last);
    }
    clear() { while (this.active.length) this.free.push(this.active.pop()); }
  }

  class ParticleSystem {
    constructor(capacity) { this.pool = new ParticlePool(capacity); this.emission = 0; }
    clear() { this.pool.clear(); this.emission = 0; }
    spawn(...args) { return this.pool.acquire(...args); }
    update(dt, weather, height, time) {
      const kind = weather.current;
      this.emission += WEATHER[kind].rate * dt;
      const count = Math.min(45, Math.floor(this.emission)); this.emission -= count;
      for (let i = 0; i < count; i++) {
        if (kind === 'sunny') this.spawn('mote', random(0, W), random(height * .48, height), random(4, 17), -random(2, 9), random(3, 8), random(.8, 2));
        else if (kind === 'snow') this.spawn('snow', random(-80, W), -10, random(10, 35), random(24, 65), 22, random(1.4, 3.5));
        else if (kind === 'tornado') this.spawn('debris', random(0, W), random(height * .7, height), random(80, 160), -random(8, 40), random(2, 5), random(1.2, 3));
        else this.spawn('rain', random(-180, W), random(-height * .2, 0), WEATHER[kind].wind, random(470, 760), 3, kind === 'rain' ? 12 : 23);
      }
      for (let i = this.pool.active.length - 1; i >= 0; i--) {
        const p = this.pool.active[i]; p.life -= dt;
        if (p.kind === 'debris') {
          const dx = weather.tornado.x - p.x, dy = weather.tornado.y - p.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 330) { p.vx += (dx * .65 - dy * 2) * dt; p.vy += (dy * .8 + dx * .6 - 100) * dt; }
        }
        if (p.kind === 'snow' || p.kind === 'mote') p.x += Math.sin(time * 1.5 + p.phase) * 15 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'rain' && p.y > height * (.77 + .2 * Math.sin(p.phase) ** 2)) {
          p.kind = 'splash'; p.life = p.maxLife = .27; p.vx *= .07; p.vy = -10; p.size = 2;
        }
        if (p.kind === 'splash') p.size += dt * 20;
        if (p.kind === 'dust') p.size += dt * 4;
        if (p.life <= 0 || p.y > height + 20 || p.x > W + 200 || p.x < -250 || p.y < -height * .4) this.pool.release(i);
      }
    }
    draw(ctx) {
      ctx.lineWidth = 1; ctx.lineCap = 'round';
      for (const p of this.pool.active) {
        const fade = Math.min(1, p.life / Math.min(1, p.maxLife));
        if (p.kind === 'rain') {
          ctx.strokeStyle = `rgba(219,231,217,${.34 * fade})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / 55, p.y - p.size); ctx.stroke();
        } else if (p.kind === 'splash') {
          ctx.strokeStyle = `rgba(225,238,218,${.3 * p.life / p.maxLife})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * .23, 0, 0, TAU); ctx.stroke();
        } else {
          const colors = { snow: `rgba(248,250,243,${.8 * fade})`, mote: `rgba(255,236,172,${.65 * fade})`, dust: `rgba(208,174,104,${.16 * fade})`, debris: `rgba(104,96,65,${.7 * fade})` };
          ellipse(ctx, p.x, p.y, p.size, p.kind === 'debris' ? p.size * .4 : p.size, colors[p.kind]);
        }
      }
    }
  }

  class WeatherManager extends EventTarget {
    constructor() {
      super(); this.current = 'sunny'; this.intensity = 0; this.snow = 0; this.puddles = 0;
      this.particles = new ParticleSystem(1800); this.flash = 0; this.bolt = null; this.lightningTimer = 4;
      this.tornado = { x: 1200, y: 420, target: null }; this.wind = 8;
    }
    set(kind) {
      if (!WEATHER[kind] || kind === this.current) return;
      // Pool ownership is explicit: switching weather returns every old particle,
      // including secondary splashes/dust, and drops any active lightning path.
      this.particles.clear(); this.current = kind; this.bolt = null; this.flash = 0; this.lightningTimer = random(2, 4);
      this.dispatchEvent(new CustomEvent('change', { detail: kind }));
    }
    safeGaps(animals, height) {
      // A full-height protected x interval is deliberately more conservative than
      // point/animal collision checks. A bolt cannot cross a body at ANY height.
      const intervals = animals.map(a => a.bounds(height)).map(b => [clamp(b.left - 26, 0, W), clamp(b.right + 26, 0, W)]).filter(b => b[1] > b[0]).sort((a, b) => a[0] - b[0]);
      const gaps = []; let edge = 15;
      for (const [left, right] of intervals) { if (left - edge > 65) gaps.push([edge, left]); edge = Math.max(edge, right); }
      if (W - 15 - edge > 65) gaps.push([edge, W - 15]);
      return gaps;
    }
    strike(animals, height) {
      const gaps = this.safeGaps(animals, height);
      if (!gaps.length) return; // No safe corridor means no strike.
      const gap = gaps[Math.floor(Math.random() * gaps.length)];
      const middle = random(gap[0] + 25, gap[1] - 25);
      const points = [];
      for (let i = 0; i <= 10; i++) points.push({ x: clamp(middle + random(-23, 23), gap[0] + 8, gap[1] - 8), y: (height * .81) * i / 10 });
      this.bolt = { points, min: Math.min(...points.map(p => p.x)) - 9, max: Math.max(...points.map(p => p.x)) + 9 };
      this.flash = .34;
    }
    update(dt, animals, height, time) {
      const dark = { sunny: 0, rain: .42, heavy: .7, snow: .23, storm: .94, tornado: .77 }[this.current];
      this.intensity = lerp(this.intensity, dark, 1 - Math.exp(-dt * 1.3));
      this.wind = lerp(this.wind, WEATHER[this.current].wind, 1 - Math.exp(-dt));
      this.snow = lerp(this.snow, this.current === 'snow' ? 1 : 0, 1 - Math.exp(-dt * .16));
      this.puddles = lerp(this.puddles, ['rain', 'heavy', 'storm'].includes(this.current) ? 1 : 0, 1 - Math.exp(-dt * .1));
      this.flash = Math.max(0, this.flash - dt);
      if (this.current === 'storm') {
        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0) { this.strike(animals, height); this.lightningTimer = random(3.5, 7); }
      }
      // Revalidate after wildlife moves, on every visible flash frame. Remove a
      // bolt BEFORE drawing if an animal enters its corridor (including glow).
      if (this.bolt && (this.flash <= 0 || animals.some(a => { const b = a.bounds(height); return b.right + 18 >= this.bolt.min && b.left - 18 <= this.bolt.max; }))) { this.bolt = null; this.flash = 0; }
      if (this.current === 'tornado') {
        let nearest = null, distance = Infinity;
        for (const a of animals) {
          if (a.x < 0 || a.x > W) continue;
          const d = Math.hypot(a.x - this.tornado.x, a.yRatio * height - this.tornado.y);
          if (d < distance) { distance = d; nearest = a; }
        }
        this.tornado.target = nearest;
        // Normalized pursuit, capped at 9 world units/sec: slower than even the
        // elephants' storm gait. The nearest visible target is reevaluated each frame.
        if (nearest && distance > 1) { const step = Math.min(9 * dt, distance); this.tornado.x += (nearest.x - this.tornado.x) / distance * step; this.tornado.y += (nearest.yRatio * height - this.tornado.y) / distance * step; }
      }
      this.particles.update(dt, this, height, time);
    }
    drawTornado(ctx, time, height) {
      if (this.current !== 'tornado') return;
      const { x, y } = this.tornado; const h = Math.min(340, height * .7);
      ellipse(ctx, x, y + 5, 74, 12, '#5d594536');
      for (let i = 0; i < 43; i++) {
        const t = i / 42, cy = y - h * t;
        const sway = Math.sin(time * 2 + t * 4) * (10 + 20 * t);
        const radius = 8 + t * t * 89;
        ellipse(ctx, x + sway, cy, radius, 5 + t * 12, `rgba(${83 + i},${86 + i},${72 + i},${.24 + .08 * Math.sin(i + time * 4)})`);
        ctx.strokeStyle = `rgba(203,191,148,${.1 + .1 * t})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x + sway, cy, radius, 5 + t * 12, 0, time * 3 + i, time * 3 + i + 2.2); ctx.stroke();
      }
    }
    drawLightning(ctx, height) {
      if (!this.bolt || this.flash <= 0) return;
      if (!reducedMotion) { ctx.fillStyle = `rgba(240,241,211,${this.flash * .36})`; ctx.fillRect(0, 0, W, height); }
      ctx.save(); ctx.globalAlpha = Math.min(1, this.flash * 7);
      const pts = this.bolt.points.flatMap(p => [p.x, p.y]);
      line(ctx, pts, '#e7eaca35', 16); line(ctx, pts, '#e8f0d68a', 6); line(ctx, pts, '#fffde7', 2);
      ctx.restore();
    }
  }

  class Animal {
    constructor(id, x, yRatio, scale, speed) {
      this.id = id; this.x = x; this.yRatio = yRatio; this.homeY = yRatio; this.scale = scale; this.baseSpeed = speed;
      this.phase = random(0, TAU); this.state = 'walking'; this.stateTime = random(5, 15); this.stateAge = 0;
      this.dustTime = 0; this.lift = 0; this.species = 'Animal'; this.leader = null; this.gap = 0;
      this.width = 110; this.height = 100;
    }
    changeState(state, duration) { this.state = state; this.stateTime = duration; this.stateAge = 0; }
    chooseState(world) { this.changeState('walking', random(8, 19)); }
    update(dt, world) {
      this.stateTime -= dt; this.stateAge += dt;
      const alarm = ['heavy', 'storm', 'tornado'].includes(world.weather.current);
      if (alarm && ['resting', 'drinking', 'trumpeting'].includes(this.state)) this.changeState('walking', random(9, 17));
      if (this.stateTime <= 0) this.chooseState(world);
      const walking = this.state === 'walking' || this.state === 'stalking';
      let speed = this.baseSpeed * WEATHER[world.weather.current].speed * (1 + .23 * world.season.wetness);
      if (this.leader) {
        const desiredGap = this.gap * (world.season.current === 'wet' ? 1.35 : 1) * (alarm ? .8 : 1);
        let actualGap = this.leader.x - this.x;
        if (actualGap < -W / 2) actualGap += W + 320;
        speed *= clamp(1 + (actualGap - desiredGap) / 160, .6, 1.35);
      }
      if (walking) {
        this.x += speed * dt; this.phase += speed * dt * .078;
        this.dustTime -= dt;
        if (this.dustTime <= 0 && world.weather.current === 'sunny' && world.season.current === 'dry' && this.x > 0 && this.x < W) {
          world.weather.particles.spawn('dust', this.x - 30 * this.scale, this.yRatio * world.height, -random(2, 9), -random(3, 9), 1.8, random(2, 5));
          this.dustTime = .7;
        }
      }
      if (this.x - this.width * this.scale > W + 20) { this.x = -this.width * this.scale - 30; this.changeState('walking', random(15, 30)); }
      const cluster = alarm ? -.016 : world.season.wetness * .015;
      const targetY = this.state === 'drinking' ? .765 : this.homeY + cluster + Math.sin(world.time * .13 + this.id) * .003;
      this.yRatio = lerp(this.yRatio, targetY, 1 - Math.exp(-dt));
    }
    bounds(height) {
      return { left: this.x - this.width * this.scale, right: this.x + this.width * this.scale, top: this.yRatio * height - (this.height * this.scale) - this.lift, bottom: this.yRatio * height + 9 };
    }
    mood(weather) {
      if (weather === 'tornado') return 'Moving to safety';
      if (weather === 'storm' || weather === 'heavy') return 'Seeking shelter';
      return { walking: 'On the move', resting: 'Resting in the warmth', drinking: 'At the watering hole', trumpeting: 'Sensing the breeze', stalking: 'Quietly exploring', climbing: 'Climbing an acacia', perched: 'Watching from above', descending: 'Back to the grasslands' }[this.state];
    }
    draw(ctx, world) {
      const y = this.yRatio * world.height;
      const walk = this.state === 'walking' || this.state === 'stalking';
      ellipse(ctx, this.x, y + 3, this.width * this.scale * .79, 7 * this.scale, '#514b2c26');
      ctx.save(); ctx.translate(this.x, y - this.lift + (walk ? Math.sin(this.phase * 2) * 1.1 : 0)); ctx.scale(this.scale, this.scale);
      if (this.state === 'resting') { ctx.translate(0, 1); ctx.scale(1, .66); }
      this.drawBody(ctx, walk ? this.phase : 0, world);
      ctx.restore();
    }
  }

  class Elephant extends Animal {
    constructor(...args) { super(...args); this.species = 'Elephant'; this.width = 114; this.height = 166; }
    chooseState(world) {
      if (this.state !== 'walking') return this.changeState('walking', random(11, 24));
      const nearWater = this.x > 790 && this.x < 1080;
      if (nearWater) this.changeState('drinking', random(4, 7));
      else if (Math.random() < .65) this.changeState('trumpeting', random(2, 4));
      else this.changeState('walking', random(5, 12));
    }
    drawBody(ctx, phase, world) {
      const leg = Math.sin(phase) * 12;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(-59, -91); ctx.quadraticCurveTo(-82, -78, -77 + Math.sin(world.time * 2) * 5, -42); ctx.strokeStyle = '#777b66'; ctx.lineWidth = 4; ctx.stroke();
      ellipse(ctx, -77 + Math.sin(world.time * 2) * 5, -41, 3, 7, '#62624d');
      shape(ctx, [-42,-70,-20,-67,-24+leg,-7,-46+leg,-7], '#737764');
      shape(ctx, [26,-69,47,-66,49-leg,-7,28-leg,-7], '#707463');
      ellipse(ctx, -6, -88, 67, 49, '#999d87');
      ctx.beginPath(); ctx.ellipse(-10,-92,62,41,-.07,Math.PI,TAU); ctx.strokeStyle='#b9bba0';ctx.lineWidth=2;ctx.stroke();
      shape(ctx, [-53,-67,-29,-69,-32-leg,0,-55-leg,0], '#969b83');
      shape(ctx, [14,-73,39,-72,44+leg,0,19+leg,0], '#979c86');
      for (const x of [-48-leg, -39-leg, 26+leg, 35+leg]) ellipse(ctx,x,-1,3,3,'#bec0a4');
      ellipse(ctx, 53, -111, 33, 36, '#a3a78f', -.12);
      const ear = Math.sin(world.time * 1.7 + this.id) * 3;
      ctx.beginPath(); ctx.moveTo(40,-137); ctx.bezierCurveTo(0,-147,-3,-107,20,-78); ctx.bezierCurveTo(31,-68,47,-81,49+ear,-110); ctx.closePath(); ctx.fillStyle='#898f78';ctx.fill();
      ctx.beginPath();ctx.moveTo(37,-132);ctx.bezierCurveTo(10,-135,7,-106,23,-83);ctx.strokeStyle='#b0b39a';ctx.lineWidth=1.7;ctx.stroke();
      const raised = this.state === 'trumpeting' ? Math.sin(Math.min(1,this.stateAge/.8)*Math.PI/2) : 0;
      const drinking = this.state === 'drinking';
      ctx.beginPath();ctx.moveTo(74,-110);ctx.bezierCurveTo(90,-89,76,-42,93,-37-raised*66);ctx.quadraticCurveTo(105,-32-raised*75,107,-49-raised*70);
      ctx.strokeStyle='#a3a78f';ctx.lineWidth=15;ctx.lineCap='round';ctx.stroke();
      ctx.beginPath();ctx.moveTo(74,-109);ctx.bezierCurveTo(86,-83,78,-43,94,-39-raised*65);ctx.strokeStyle='#b4b79d';ctx.lineWidth=2;ctx.stroke();
      if(drinking){ctx.beginPath();ctx.moveTo(99,-40);ctx.quadraticCurveTo(96,-14,102,-2);ctx.strokeStyle='#98a08b';ctx.lineWidth=8;ctx.stroke();}
      ctx.beginPath();ctx.moveTo(67,-87);ctx.quadraticCurveTo(89,-64,105,-78);ctx.quadraticCurveTo(89,-65,75,-94);ctx.fillStyle='#f0e6c7';ctx.fill();
      ellipse(ctx,69,-115,2,2.1,'#4d5547');ellipse(ctx,69.5,-115.5,.55,.55,'#eee3bc');
      line(ctx,[76,-96,83,-95],'#7c836f',1.2);
      line(ctx,[-17,-73,-19,-60],'#878d77',1);line(ctx,[-11,-72,-13,-61],'#878d77',1);
      ctx.restore();
    }
  }

  class Lion extends Animal {
    constructor(id,x,y,scale,speed,male=false) { super(id,x,y,scale,speed);this.species='Lion';this.male=male;this.width=93;this.height=99; }
    chooseState(world) {
      const calm = !['storm','heavy','tornado'].includes(world.weather.current);
      if(this.state==='walking' && calm && Math.random()<(world.season.current==='dry'?.65:.35)) this.changeState('resting',random(3,7));
      else this.changeState('walking',random(12,25));
    }
    drawBody(ctx,phase,world) {
      const gait=Math.sin(phase)*12;
      ctx.beginPath();ctx.moveTo(-45,-48);ctx.bezierCurveTo(-74,-34,-80,-74,-94,-65+Math.sin(world.time*1.6+this.id)*6);ctx.strokeStyle='#b68a4c';ctx.lineWidth=4;ctx.stroke();
      ellipse(ctx,-94,-65+Math.sin(world.time*1.6+this.id)*6,5,7,'#685335',-.5);
      shape(ctx,[-33,-43,-19,-42,-25+gait,-5,-36+gait,-4], '#b38a4b');
      shape(ctx,[26,-40,41,-42,35-gait,-5,23-gait,-4], '#b38a4b');
      ellipse(ctx,-4,-51,49,25,'#cda15d');
      ellipse(ctx,-5,-41,37,13,'#d8b578');
      ellipse(ctx,-36,-46,18,23,'#d1a560',-.25);
      shape(ctx,[-47,-43,-29,-38,-33-gait,-9,-26-gait,-3,-48-gait,-3], '#d0a461');
      shape(ctx,[24,-47,40,-46,46+gait,-5,31+gait,-3], '#d2a565');
      ellipse(ctx,-38-gait,-3,11,4,'#d8ae6e');ellipse(ctx,40+gait,-3,10,4,'#d8ae6e');
      if(this.male){
        ctx.beginPath();ctx.moveTo(23,-72);ctx.bezierCurveTo(29,-105,66,-100,77,-77);ctx.lineTo(81,-58);ctx.lineTo(70,-45);ctx.lineTo(65,-29);ctx.lineTo(52,-34);ctx.lineTo(39,-28);ctx.lineTo(26,-46);ctx.closePath();ctx.fillStyle='#8f673a';ctx.fill();
        ellipse(ctx,48,-65,27,30,'#a37a42',-.12);
        line(ctx,[27,-66,31,-48,40,-36],'#b38b4b',2);
      }
      ellipse(ctx,57,-70,20,19,'#d3a45e');
      ellipse(ctx,47,-86,7,8,'#ba8e4b');ellipse(ctx,48,-86,3.5,4,'#8d713f');
      ellipse(ctx,72,-62,13,9,'#dfbc81');ellipse(ctx,80,-65,4,2.8,'#594b34');
      ellipse(ctx,65,-75,2,1.8,'#484730');line(ctx,[62,-79,69,-79],'#ae8146',1.6);
      line(ctx,[77,-60,74,-57,67,-57],'#80643a',1);
      line(ctx,[73,-59,87,-57],'#f1d39a',.7);line(ctx,[72,-56,85,-53],'#f1d39a',.7);
    }
  }

  class Leopard extends Animal {
    constructor(...args) {
      super(...args);this.species='Leopard';this.width=108;this.height=79;this.state='stalking';this.climbTree=null;this.climbed=false;
      const rand=seeded(281+this.id);this.spots=Array.from({length:47},()=>({x:rand()*110-54,y:rand()*42-68,r:1.7+rand()*2.4}));
    }
    chooseState() { this.changeState('stalking',random(12,24)); }
    update(dt,world) {
      super.update(dt,world);
      const badWeather=['storm','heavy','tornado'].includes(world.weather.current);
      if(this.state==='walking')this.state='stalking';
      if(this.state==='stalking'){
        for(const tree of world.scene.climbTrees){
          if(Math.abs(this.x-tree.x)<12 && !this.climbed && !badWeather){ this.climbTree=tree;this.climbed=true;this.changeState('climbing',2.4);break; }
        }
        if(this.x<0)this.climbed=false;
      }
      if(this.state==='climbing'){
        this.lift=lerp(0,this.climbHeight(world),clamp(this.stateAge/2.3,0,1));
        if(this.stateAge>=2.2)this.changeState('perched',random(3,6));
      } else if(this.state==='perched'){
        this.lift=this.climbHeight(world);
        if(this.stateTime<.15 || badWeather)this.changeState('descending',2);
      } else if(this.state==='descending'){
        this.lift=this.climbHeight(world)*(1-clamp(this.stateAge/1.8,0,1));
        if(this.stateAge>=1.8){this.lift=0;this.changeState('stalking',20);}
      } else this.lift=Math.max(0,this.lift-dt*80);
    }
    climbHeight(world) {
      if(!this.climbTree)return 0;
      const treeScale=this.climbTree.x===194?Math.min(1.12,world.height/455):Math.min(.89,world.height/560);
      return Math.max(0,(this.yRatio-this.climbTree.y)*world.height+128*treeScale);
    }
    drawBody(ctx,phase,world) {
      const gait=Math.sin(phase)*15;
      ctx.beginPath();ctx.moveTo(-45,-42);ctx.bezierCurveTo(-80,-34,-110,-68,-100,-79+Math.sin(world.time*2+this.id)*5);ctx.strokeStyle='#b69750';ctx.lineWidth=6;ctx.stroke();
      ctx.beginPath();ctx.moveTo(-101,-69);ctx.lineTo(-100,-79+Math.sin(world.time*2+this.id)*5);ctx.strokeStyle='#514b32';ctx.lineWidth=6;ctx.stroke();
      shape(ctx,[-30,-40,-17,-37,-23+gait,-5,-35+gait,-4],'#ad8e49');shape(ctx,[29,-40,40,-38,39-gait,-5,27-gait,-4],'#ad8e49');
      ellipse(ctx,-4,-48,50,20,'#d0ad60');ellipse(ctx,3,-40,35,10,'#dfc78b');
      shape(ctx,[-44,-41,-28,-36,-32-gait,-7,-23-gait,-2,-42-gait,-2],'#d0ad60');shape(ctx,[25,-42,39,-42,46+gait,-4,33+gait,-3],'#d0ad60');
      ellipse(ctx,49,-55,25,17,'#d0ad60',-.25);ellipse(ctx,62,-60,16,14,'#d0ad60');ellipse(ctx,71,-53,10,7,'#e6cc91');
      ctx.save();ctx.beginPath();ctx.ellipse(-4,-48,48,19,0,0,TAU);ctx.ellipse(49,-55,25,16,-.25,0,TAU);ctx.clip();
      for(const p of this.spots){ctx.beginPath();ctx.ellipse(p.x,p.y,p.r,p.r*.76,p.x,0,TAU*.83);ctx.strokeStyle='#776038';ctx.lineWidth=1.8;ctx.stroke();}
      ctx.restore();
      for(const pos of [[-34-gait,-24],[-34-gait,-15],[37+gait,-27],[38+gait,-16]])ellipse(ctx,pos[0],pos[1],2,2,'#786038');
      ellipse(ctx,54,-72,6,6,'#93783f');ellipse(ctx,55,-72,3,3,'#e6c478');ellipse(ctx,66,-62,1.8,1.8,'#394032');ellipse(ctx,78,-54,3,2,'#4c4730');
      line(ctx,[65,-59,68,-53],'#756138',1);line(ctx,[72,-50,79,-50],'#8f7440',1);
    }
  }

  class Landscape {
    constructor() {
      const rng=seeded(95);this.grasses=[];
      for(let i=0;i<720;i++)this.grasses.push({x:rng()*W,y:.53+rng()*.48,h:4+rng()*19,lean:rng()*2-1,shade:rng(),phase:rng()*TAU});
      this.clouds=Array.from({length:10},()=>({x:rng()*W,y:.08+rng()*.29,size:50+rng()*105,speed:1+rng()*3}));
      this.climbTrees=[{x:194,y:.79,s:1.05},{x:1159,y:.72,s:.86}];
      this.palette={sky:[239,217,175],horizon:[246,224,176],far:[192,186,138],hill:[165,167,112],ground:[192,171,100],front:[151,149,75],tree:[87,102,61]};
      this.treeShapes=[];const tr=seeded(626);
      for(let i=0;i<48;i++){const a=tr()*TAU,r=Math.sqrt(tr());this.treeShapes.push({x:Math.cos(a)*r*134,y:Math.sin(a)*r*24,r:14+tr()*21});}
    }
    update(dt,world) {
      const wet=world.season.wetness,dark=world.weather.intensity,snow=world.weather.snow;
      const dry={sky:[239,217,175],horizon:[248,228,183],far:[194,185,138],hill:[170,171,115],ground:[192,175,106],front:[146,146,73],tree:[85,103,63]};
      const rainy={sky:[185,207,186],horizon:[220,228,185],far:[139,167,128],hill:[117,153,103],ground:[144,167,91],front:[94,128,61],tree:[58,94,59]};
      const storm={sky:[88,110,109],horizon:[152,163,143],far:[106,123,109],hill:[94,119,91],ground:[126,139,85],front:[92,110,63],tree:[54,80,57]};
      for(const key of Object.keys(this.palette))for(let c=0;c<3;c++){
        let target=lerp(dry[key][c],rainy[key][c],wet);target=lerp(target,storm[key][c],dark*.86);
        if(['ground','front','hill'].includes(key))target=lerp(target,[214,220,206][c],snow*.6);
        this.palette[key][c]=target;
      }
      for(const cloud of this.clouds){cloud.x+=dt*(cloud.speed+world.weather.wind*.035);if(cloud.x-cloud.size>W)cloud.x=-cloud.size*2;}
    }
    tree(ctx,x,y,s,opacity=1) {
      ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha=opacity;
      const trunk='#67664a',leaf=rgb(this.palette.tree);
      shape(ctx,[-8,1,-5,-91,-29,-129,-78,-158,-75,-163,-24,-141,-9,-119,-6,-169,0,-171,4,-122,34,-151,76,-161,77,-155,37,-143,8,-106,7,0],trunk);
      line(ctx,[-2,-25,-1,-101,-16,-129],'#969072',2);
      shape(ctx,[-65,-163,-118,-170,-137,-179,-110,-193,-55,-200,6,-208,65,-201,115,-188,137,-173,83,-162,23,-155],leaf);
      for(const p of this.treeShapes)ellipse(ctx,p.x,p.y-181,p.r,p.r*.45,leaf);
      ctx.globalAlpha=opacity*.28;
      for(let i=0;i<18;i++){const p=this.treeShapes[i];ellipse(ctx,p.x-3,p.y-185,p.r*.8,p.r*.25,'#b0b879');}
      ctx.restore();
    }
    drawSky(ctx,world) {
      const h=world.height,p=this.palette,dark=world.weather.intensity;
      const sky=ctx.createLinearGradient(0,0,0,h*.68);sky.addColorStop(0,rgb(p.sky));sky.addColorStop(1,rgb(p.horizon));ctx.fillStyle=sky;ctx.fillRect(0,0,W,h);
      const sx=W*.755,sy=h*.259,r=Math.min(58,h*.135);
      const glow=ctx.createRadialGradient(sx,sy,r*.2,sx,sy,r*3.8);glow.addColorStop(0,`rgba(255,242,200,${.44*(1-dark)})`);glow.addColorStop(1,'#fff0bf00');ctx.fillStyle=glow;ctx.fillRect(sx-r*4,sy-r*4,r*8,r*8);
      ellipse(ctx,sx,sy,r,r,`rgba(255,244,204,${.87-dark*.75})`);
      for(const cloud of this.clouds){ctx.save();ctx.globalAlpha=.11+dark*.15;const color=dark>.45?'#465e5c':'#fff9de';ellipse(ctx,cloud.x,cloud.y*h,cloud.size,cloud.size*.12,color);ellipse(ctx,cloud.x-cloud.size*.3,cloud.y*h-7,cloud.size*.6,cloud.size*.17,color);ctx.restore();}
      // Broad, overlapping ridgelines give atmospheric perspective without textures.
      shape(ctx,[0,h*.52,0,h*.43,65,h*.44,148,h*.40,226,h*.42,338,h*.35,421,h*.32,495,h*.37,579,h*.39,675,h*.44,790,h*.46,889,h*.40,981,h*.38,1083,h*.43,1170,h*.37,1300,h*.42,W,h*.39,W,h*.61],rgb(p.far));
      shape(ctx,[0,h*.59,0,h*.48,125,h*.49,250,h*.45,355,h*.46,465,h*.5,595,h*.47,726,h*.49,870,h*.45,1005,h*.49,1120,h*.48,1220,h*.52,W,h*.48,W,h*.65],rgb(p.hill));
      ctx.fillStyle=`rgba(245,227,175,${.14*(1-dark)})`;ctx.fillRect(0,h*.495,W,h*.03);
      const farTrees=[[90,.52,.23],[346,.515,.19],[481,.535,.3],[735,.51,.23],[865,.53,.17],[1060,.52,.2],[1350,.53,.26]];
      for(const [x,y,s] of farTrees)this.tree(ctx,x,y*h,s,.4);
      // A small, quiet flock follows independent sinusoidal paths across the sky.
      for(let i=0;i<7;i++){
        const x=(W*.4+i*19+world.time*3)%(W+100)-50,y=h*.21+Math.sin(i*1.3)*12;
        const flap=Math.sin(world.time*3+i)*3;ctx.beginPath();ctx.moveTo(x-4,y+flap);ctx.quadraticCurveTo(x-2,y-2,x,y);ctx.quadraticCurveTo(x+2,y-2,x+4,y+flap);ctx.strokeStyle=`rgba(102,111,78,${.42-dark*.15})`;ctx.lineWidth=1.2;ctx.stroke();
      }
    }
    drawGround(ctx,world) {
      const h=world.height,p=this.palette;
      const ground=ctx.createLinearGradient(0,h*.51,0,h);ground.addColorStop(0,rgb(p.ground));ground.addColorStop(1,rgb(p.front));
      ctx.beginPath();ctx.moveTo(0,h*.56);ctx.bezierCurveTo(300,h*.52,400,h*.57,680,h*.54);ctx.bezierCurveTo(970,h*.49,1210,h*.58,W,h*.55);ctx.lineTo(W,h);ctx.lineTo(0,h);ctx.fillStyle=ground;ctx.fill();
      ctx.beginPath();ctx.moveTo(0,h*.67);ctx.bezierCurveTo(300,h*.59,550,h*.69,800,h*.61);ctx.bezierCurveTo(1070,h*.55,1250,h*.64,W,h*.62);ctx.lineTo(W,h*.69);ctx.bezierCurveTo(950,h*.62,590,h*.74,0,h*.74);ctx.fillStyle='#e3cc8b25';ctx.fill();
      ctx.beginPath();ctx.moveTo(750,h*.59);ctx.bezierCurveTo(525,h*.71,730,h*.82,285,h);ctx.lineTo(465,h);ctx.bezierCurveTo(850,h*.82,606,h*.72,798,h*.59);ctx.fillStyle=`rgba(225,201,143,${.25-world.season.wetness*.1})`;ctx.fill();
      // Permanent watering hole; rain slowly widens the bank and secondary pools.
      const poolWidth=143+world.weather.puddles*28;
      ellipse(ctx,953,h*.774,poolWidth+15,23+world.weather.puddles*9,'#b7ac7980',-.045);
      ellipse(ctx,953,h*.768,poolWidth,18+world.weather.puddles*8,'#9eaf998c',-.045);
      for(let i=0;i<8;i++){const px=857+i*27+Math.sin(world.time*.9+i)*5;line(ctx,[px,h*.762+(i%3)*4,px+randomStable(i)*31+8,h*.762+(i%3)*4],'#e3dec07a',1);}
      if(world.weather.puddles>.1)for(let i=0;i<5;i++)ellipse(ctx,190+i*268,h*(.83+.035*Math.sin(i*4)),(28+i*6)*world.weather.puddles,3*world.weather.puddles,'#a9b6a16a');
      this.drawGrass(ctx,world,false);
      this.tree(ctx,194,h*.79,Math.min(1.12,h/455));this.tree(ctx,1159,h*.72,Math.min(.89,h/560));
      this.tree(ctx,1292,h*.595,.35,.55);this.tree(ctx,593,h*.59,.28,.5);
      this.drawRocks(ctx,world);
    }
    drawRocks(ctx,world) {
      const h=world.height;
      for(const [x,y,s] of [[130,.81,1],[1220,.75,.7],[810,.79,.45],[482,.61,.3]]){
        ctx.save();ctx.translate(x,h*y);ctx.scale(s,s);shape(ctx,[-35,0,-25,-15,-8,-21,10,-17,20,-5,28,1],'#99977b');shape(ctx,[-25,-15,-8,-21,10,-17,-1,-5,-35,0],'#b5ad88');shape(ctx,[1,-5,10,-17,20,-5,28,1],'#7e8369');ctx.restore();
      }
    }
    drawGrass(ctx,world,foreground) {
      const h=world.height,wind=world.weather.wind/80,t=world.time;
      for(const g of this.grasses){
        if(foreground ? g.y<.9 : g.y>=.9)continue;
        const depth=(g.y-.45)*1.6,gh=g.h*depth;
        const sway=Math.sin(t*1.25+g.phase+g.x*.015)*(2+wind*3)*depth;
        const color=g.shade>.65?'#eee0a250':g.shade>.25?'#727c4349':'#56653d40';
        ctx.strokeStyle=color;ctx.lineWidth=foreground?1.4:.9;ctx.beginPath();ctx.moveTo(g.x,g.y*h);ctx.quadraticCurveTo(g.x+g.lean*5,g.y*h-gh*.5,g.x+g.lean*8+sway,g.y*h-gh);ctx.stroke();
        if(g.shade>.75){line(ctx,[g.x,g.y*h,g.x-4+sway*.6,g.y*h-gh*.65],color,.8);}
      }
      if(foreground){
        // Large edge grasses frame the scene, like the foreground of a field sketch.
        for(let side=0;side<2;side++)for(let i=0;i<24;i++){
          const x=side?W-i*5:i*6,gh=28+randomStable(i+side*12)*68,sway=Math.sin(t+ i)*4;
          ctx.beginPath();ctx.moveTo(x,h+10);ctx.quadraticCurveTo(x+(side?-10:10),h-gh*.45,x+(side?-14:14)+sway,h-gh);ctx.strokeStyle=i%3?'#68744399':'#b4b16d8a';ctx.lineWidth=2.2;ctx.stroke();
        }
      }
    }
  }
  function randomStable(n){return (Math.sin(n*127.1+311.7)*43758.5453)%1*.5+.5;}

  class Ecosystem {
    constructor(canvas) {
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.width=W;this.height=600;this.time=0;this.paused=false;
      this.weather=new WeatherManager();this.season=new SeasonManager();this.scene=new Landscape();this.animals=[];this.lastTime=0;this.frame=0;this.fps=60;this.debug=false;this.selected=null;this.tooltipTime=0;
      // All animals originate beyond the left edge. A deterministic entrance
      // pre-roll presents an established habitat on the very first painted frame.
      this.animals.push(new Elephant(0,-110,.72,1.05,14),new Elephant(1,-282,.735,.79,14),new Elephant(2,-394,.749,.51,14));
      this.animals[1].leader=this.animals[0];this.animals[1].gap=172;this.animals[2].leader=this.animals[1];this.animals[2].gap=112;
      this.animals.push(new Lion(3,-725,.849,.93,18,true),new Lion(4,-854,.822,.81,18),new Lion(5,-977,.842,.72,18));
      this.animals[4].leader=this.animals[3];this.animals[4].gap=129;this.animals[5].leader=this.animals[4];this.animals[5].gap=123;
      this.animals.push(new Leopard(6,-905,.909,.74,32),new Leopard(7,-1460,.614,.49,31));
      // Advance entrance travel only, preserving state timers and season duration.
      for(let step=0;step<600;step++)for(const animal of this.animals)animal.x+=animal.baseSpeed*.1;
      this.resize();this.bindUI();this.scene.update(0,this);
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.canvas);
      document.addEventListener('visibilitychange',()=>{this.lastTime=0;});
      this.animate=this.animate.bind(this);requestAnimationFrame(this.animate);
    }
    resize() {
      const r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
      if(!r.width||!r.height)return;
      const oldHeight=this.height;this.height=W*r.height/r.width;
      this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);
      this.ctx.setTransform(this.canvas.width/W,0,0,this.canvas.height/this.height,0,0);
      if(oldHeight){for(const p of this.weather.particles.pool.active)p.y*=this.height/oldHeight;this.weather.tornado.y*=this.height/oldHeight;}
      this.weather.bolt=null;this.weather.flash=0;
    }
    bindUI() {
      document.querySelectorAll('[data-weather]').forEach(button=>button.addEventListener('click',()=>this.setWeather(button.dataset.weather)));
      document.querySelectorAll('[data-season]').forEach(button=>button.addEventListener('click',()=>this.season.set(button.dataset.season)));
      this.weather.addEventListener('change',()=>this.updateControls());
      this.season.addEventListener('change',()=>{
        if(this.season.current==='wet' && this.weather.current==='snow')this.weather.set('rain');
        this.updateControls();
      });
      $('#pause-button').addEventListener('click',()=>this.togglePause());
      $('#stats-button').addEventListener('click',()=>this.toggleDebug());
      $('#expand-button').addEventListener('click',()=>{
        document.body.classList.toggle('expanded');const expanded=document.body.classList.contains('expanded');
        $('#expand-button').setAttribute('aria-label',expanded?'Exit fullscreen':'Enter fullscreen');$('#expand-button').title=expanded?'Exit fullscreen · Escape':'Fullscreen';
      });
      const dialog=$('#field-guide');$('#guide-button').addEventListener('click',()=>dialog.showModal());$('#close-guide').addEventListener('click',()=>dialog.close());
      dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
      document.addEventListener('keydown',e=>{
        if(dialog.open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.altKey||e.ctrlKey||e.metaKey)return;
        if(e.code==='Space' && e.target.tagName==='BUTTON')return;
        if(e.key>='1' && e.key<='6'){e.preventDefault();this.setWeather(Object.keys(WEATHER)[+e.key-1]);}
        if(e.key.toLowerCase()==='s'){e.preventDefault();this.season.set(this.season.current==='dry'?'wet':'dry');}
        if(e.code==='Space'){e.preventDefault();this.togglePause();}
        if(e.key.toLowerCase()==='d')this.toggleDebug();
        if(e.key==='Escape'){document.body.classList.remove('expanded');$('#expand-button').setAttribute('aria-label','Enter fullscreen');}
      });
      this.canvas.addEventListener('pointerdown',e=>{
        const r=this.canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*this.height;
        this.selected=null;
        for(const a of [...this.animals].sort((a,b)=>b.yRatio-a.yRatio)){
          const b=a.bounds(this.height);if(x>b.left&&x<b.right&&y>b.top&&y<b.bottom){this.selected=a;this.tooltipTime=6;break;}
        }
        this.updateTooltip();
      });
      this.updateControls();
    }
    setWeather(kind) {
      if(kind==='snow' && this.season.current==='wet'){ $('#announcement').textContent='Snow is available during the dry season. Switch to Dry to explore it.';return; }
      this.weather.set(kind);
    }
    togglePause() {
      this.paused=!this.paused;this.lastTime=0;
      $('#pause-button').setAttribute('aria-label',this.paused?'Resume ecosystem':'Pause ecosystem');$('#pause-button').title=this.paused?'Resume · Space':'Pause · Space';
      $('#pause-button use').setAttribute('href',this.paused?'#i-play':'#i-pause');$('#pause-notice').hidden=!this.paused;
    }
    toggleDebug(){this.debug=!this.debug;$('#debug').hidden=!this.debug;$('#stats-button').setAttribute('aria-pressed',String(this.debug));}
    updateControls() {
      document.querySelectorAll('[data-weather]').forEach(b=>{const active=b.dataset.weather===this.weather.current;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));if(b.dataset.weather==='snow'){b.disabled=this.season.current==='wet';b.title=b.disabled?'Snow is available in the dry season':'Snow · 4 · A rare dry-season experiment';}});
      document.querySelectorAll('[data-season]').forEach(b=>{const active=b.dataset.season===this.season.current;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
      $('#scene-description').textContent=WEATHER[this.weather.current].caption;
      $('#habitat').classList.toggle('dark-weather',['heavy','storm','tornado'].includes(this.weather.current));
      $('#announcement').textContent=`${WEATHER[this.weather.current].label}, ${this.season.current} season.`;
    }
    updateTooltip() {
      const tooltip=$('#animal-tooltip');tooltip.hidden=!this.selected;
      if(!this.selected)return;
      const a=this.selected,r=this.canvas.getBoundingClientRect();
      tooltip.innerHTML=`<strong>${a.species}${a instanceof Lion&&a.male?' · Pride leader':''}</strong><span>${a.mood(this.weather.current)}</span>`;
      tooltip.style.left=clamp(a.x/W*r.width-50,8,Math.max(8,r.width-167))+'px';
      tooltip.style.top=clamp((a.yRatio*this.height-a.height*a.scale-a.lift)/this.height*r.height-50,8,Math.max(8,r.height-58))+'px';
    }
    update(dt) {
      this.time+=dt;this.season.update(dt);
      for(const a of this.animals)a.update(dt,this);
      this.weather.update(dt,this.animals,this.height,this.time);this.scene.update(dt,this);
      if(this.selected){this.tooltipTime-=dt;if(this.tooltipTime<=0)this.selected=null;this.updateTooltip();}
    }
    draw() {
      const ctx=this.ctx;this.scene.drawSky(ctx,this);this.scene.drawGround(ctx,this);
      for(const animal of [...this.animals].sort((a,b)=>a.yRatio-b.yRatio))animal.draw(ctx,this);
      this.weather.drawTornado(ctx,this.time,this.height);this.scene.drawGrass(ctx,this,true);
      const shade=ctx.createLinearGradient(0,this.height*.8,0,this.height);shade.addColorStop(0,'#404f2b00');shade.addColorStop(1,'#34422424');ctx.fillStyle=shade;ctx.fillRect(0,this.height*.8,W,this.height*.2);
      this.weather.particles.draw(ctx);this.weather.drawLightning(ctx,this.height);
    }
    animate(stamp) {
      requestAnimationFrame(this.animate);
      if(document.hidden){this.lastTime=0;return;}
      const elapsed=this.lastTime?(stamp-this.lastTime)/1000:1/60;this.lastTime=stamp;
      const dt=Math.min(elapsed,.05);this.fps=lerp(this.fps,1/Math.max(.001,elapsed),.04);
      if(!this.paused)this.update(dt);
      this.draw();this.frame++;
      if(this.frame%15===0){
        $('#season-countdown').textContent=Math.ceil(60-this.season.elapsed)+'s';$('#season-progress').style.transform=`scaleX(${1-this.season.elapsed/60})`;
        if(this.debug)$('#debug').textContent=`${Math.round(this.fps)} FPS · ${this.weather.particles.pool.active.length} / 1800 particles · ${this.animals.length} animals`;
      }
    }
  }
  // A small read-only inspection surface makes pool and safety invariants auditable.
  const app=new Ecosystem($('#ecosystem'));
  window.savanna={get stats(){return Object.freeze({animals:app.animals.length,particles:app.weather.particles.pool.active.length,free:app.weather.particles.pool.free.length,capacity:app.weather.particles.pool.capacity,weather:app.weather.current,season:app.season.current,fps:Math.round(app.fps),paused:app.paused});}};
})();
