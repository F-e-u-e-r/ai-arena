(() => {
  'use strict';

  const canvas = document.querySelector('#world');
  const ctx = canvas.getContext('2d', { alpha: false });
  const weatherButtons = [...document.querySelectorAll('[data-weather]')];
  const seasonButton = document.querySelector('#seasonButton');
  const seasonLabel = document.querySelector('#seasonLabel');
  const weatherLabel = document.querySelector('#weatherLabel');
  const particleLabel = document.querySelector('#particleCount');
  const fpsLabel = document.querySelector('#fps');
  const tip = document.querySelector('#tip');

  const W = 1280, H = 720, GROUND = 535;
  const WEATHER_NAMES = { sunny: 'SUNNY', rain: 'RAIN', heavy: 'HEAVY RAIN', snow: 'SNOW', storm: 'THUNDERSTORM', tornado: 'TORNADO' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const random = (a, b) => a + Math.random() * (b - a);

  function mixColor(a, b, amount) {
    const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    return `rgb(${lerp(ar, br, amount) | 0},${lerp(ag, bg, amount) | 0},${lerp(ab, bb, amount) | 0})`;
  }

  class SeasonManager {
    constructor() { this.wet = false; this.target = 0; this.mix = 0; this.timer = 0; }
    toggle() {
      this.wet = !this.wet; this.target = this.wet ? 1 : 0; this.timer = 0;
      seasonButton.classList.toggle('wet', this.wet);
      seasonButton.querySelector('span').textContent = this.wet ? 'Wet' : 'Dry';
      seasonLabel.textContent = this.wet ? 'WET SEASON' : 'DRY SEASON';
    }
    update(dt) {
      this.timer += dt;
      if (this.timer >= 60) this.toggle();
      // Season color and behavior changes take 2.5 seconds, while positions persist.
      this.mix += (this.target - this.mix) * Math.min(1, dt * .42);
    }
  }

  class ParticlePool {
    constructor(size) {
      this.items = Array.from({ length: size }, (_, id) => ({ id, active: false, type: '' }));
      this.free = [...this.items];
      this.active = [];
    }
    acquire(type) {
      const p = this.free.pop();
      if (!p) return null;
      p.active = true; p.type = type; this.active.push(p); return p;
    }
    releaseAt(index) {
      const p = this.active[index];
      p.active = false; p.type = '';
      this.free.push(p);
      const last = this.active.pop();
      if (index < this.active.length) this.active[index] = last;
    }
    releaseAll() { while (this.active.length) this.releaseAt(this.active.length - 1); }
  }

  class Animal {
    constructor(x, y, scale, speed) {
      this.x = x; this.y = y; this.baseY = y; this.scale = scale; this.baseSpeed = speed;
      this.phase = Math.random() * Math.PI * 2; this.state = 'moving'; this.stateTime = random(4, 9);
      this.mood = 'ROAMING'; this.family = 'animal'; this.vertical = 0;
    }
    setState(name, time, mood) { this.state = name; this.stateTime = time; this.mood = mood; }
    behavior() {}
    update(dt, sim) {
      this.phase += dt * 5;
      this.stateTime -= dt;
      if (this.stateTime <= 0) this.behavior(sim);
      const rainSlow = sim.weather.kind === 'heavy' || sim.weather.kind === 'storm' ? .76 : 1;
      const wetActive = .87 + sim.season.mix * .35;
      let stateSpeed = this.state === 'rest' || this.state === 'drink' ? .06 : this.state === 'stalk' ? .65 : 1;
      if (this.state === 'climb') stateSpeed = .04;
      this.x += this.baseSpeed * wetActive * rainSlow * stateSpeed * dt;
      if (this.x > W + 170) {
        this.x = -170 - Math.random() * 170;
        this.baseY = random(GROUND + 35, H - 72);
        this.y = this.baseY;
      }
      this.y = this.baseY + this.vertical;
    }
    shadow(alpha = .19) {
      ctx.save(); ctx.translate(this.x, this.baseY + 18); ctx.scale(this.scale, this.scale * .33);
      ctx.beginPath(); ctx.ellipse(0, 0, 62, 22, 0, 0, Math.PI * 2); ctx.fillStyle = `rgba(38,28,17,${alpha})`; ctx.fill(); ctx.restore();
    }
    label(text) {
      if (innerWidth < 650 || this.state === 'moving') return;
      ctx.save(); ctx.font = '800 8px system-ui'; const width = ctx.measureText(text).width + 14;
      ctx.fillStyle = 'rgba(38,31,22,.66)'; roundedRect(this.x - width / 2, this.y - 73 * this.scale, width, 18, 9); ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff6e5'; ctx.fillText(text, this.x, this.y - 60 * this.scale); ctx.restore();
    }
  }

  class Lion extends Animal {
    constructor(x, y, scale, male = true) { super(x, y, scale, random(24, 30)); this.male = male; this.family = 'lion'; }
    behavior(sim) {
      const restChance = .25 + (1 - sim.season.mix) * .22;
      if (Math.random() < restChance) this.setState('rest', random(2.5, 5), 'RESTING');
      else this.setState(Math.random() < .35 ? 'patrol' : 'moving', random(5, 10), 'PRIDE PATROL');
    }
    update(dt, sim) {
      super.update(dt, sim);
      const pride = sim.animals.filter(a => a.family === 'lion');
      const center = pride.reduce((s, a) => s + a.baseY, 0) / pride.length;
      this.baseY += clamp(center - this.baseY, -1, 1) * dt * (1 - sim.season.mix) * 2;
    }
    draw() {
      this.shadow();
      const rest = this.state === 'rest';
      const bob = rest ? 7 : Math.sin(this.phase) * 2;
      ctx.save(); ctx.translate(this.x, this.y + bob); ctx.scale(this.scale, this.scale * (rest ? .82 : 1));
      const fur = this.male ? '#c98a3f' : '#d7a65a';
      ctx.strokeStyle = '#7a4a28'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-44, -12); ctx.quadraticCurveTo(-72, -38, -70, -4); ctx.stroke();
      ctx.beginPath(); ctx.arc(-70, -3, 5, 0, Math.PI * 2); ctx.fillStyle = '#4e3023'; ctx.fill();
      ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(-5, -14, 48, 24, -.05, 0, Math.PI * 2); ctx.fill();
      if (!rest) {
        drawLeg(-27, 1, Math.sin(this.phase) * 7, fur); drawLeg(21, 2, -Math.sin(this.phase) * 7, fur);
      } else { ctx.fillStyle = fur; roundedRect(-35, 0, 70, 13, 7); ctx.fill(); }
      if (this.male) { ctx.fillStyle = '#70452e'; ctx.beginPath(); ctx.arc(42, -28, 25, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = fur; ctx.beginPath(); ctx.arc(44, -28, 17, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(31, -43); ctx.lineTo(34, -57); ctx.lineTo(43, -44); ctx.moveTo(51, -44); ctx.lineTo(58, -56); ctx.lineTo(61, -39); ctx.fill();
      ctx.fillStyle = '#2f241d'; ctx.beginPath(); ctx.arc(51, -31, 2.3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(61, -24, 3, 0, 7); ctx.fill();
      ctx.restore(); this.label(this.mood);
    }
  }

  class Elephant extends Animal {
    constructor(x, y, scale) { super(x, y, scale, random(16, 21)); this.family = 'elephant'; }
    behavior(sim) {
      const drink = Math.random() < .3 + (1 - sim.season.mix) * .2;
      if (drink) this.setState('drink', random(3, 5), 'DRINKING');
      else if (Math.random() < .45) this.setState('trunk', random(2, 4), 'TRUMPETING');
      else this.setState('moving', random(7, 12), 'MIGRATING');
    }
    draw() {
      this.shadow(.23);
      const lift = this.state === 'trunk' ? Math.sin(this.phase * .45) * 8 - 9 : 0;
      ctx.save(); ctx.translate(this.x, this.y + Math.sin(this.phase * .5)); ctx.scale(this.scale, this.scale);
      const skin = '#758487', shade = '#56686d';
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(-8, -28, 56, 35, 0, 0, Math.PI * 2); ctx.fill();
      drawLeg(-38, -5, Math.sin(this.phase) * 3, skin, 14, 39); drawLeg(20, -5, -Math.sin(this.phase) * 3, skin, 14, 39);
      ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(43, -37, 29, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(54, -39, 23, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = skin; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(68, -34); ctx.quadraticCurveTo(82, -7 + lift, 72 + lift * .5, 14 + lift); ctx.stroke();
      ctx.strokeStyle = '#e6d8b9'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(65, -26); ctx.quadraticCurveTo(77, -17, 78, -5); ctx.stroke();
      ctx.fillStyle = '#172323'; ctx.beginPath(); ctx.arc(64, -44, 2.5, 0, 7); ctx.fill();
      ctx.restore(); this.label(this.mood);
    }
  }

  class Leopard extends Animal {
    constructor(x, y, scale) { super(x, y, scale, random(43, 54)); this.family = 'leopard'; }
    behavior() {
      const nearTree = [155, 935, 1180].some(x => Math.abs(this.x - x) < 125);
      if (nearTree && Math.random() < .58) this.setState('climb', random(2.5, 4.5), 'CLIMBING');
      else if (Math.random() < .35) this.setState('stalk', random(3, 5), 'STALKING');
      else this.setState('moving', random(4, 8), 'SPRINTING');
    }
    update(dt, sim) {
      const nearTree = [155, 935, 1180].some(x => Math.abs(this.x - x) < 105);
      if (this.state !== 'climb' && nearTree && Math.random() < dt * .22) this.setState('climb', random(2.5, 4.5), 'CLIMBING');
      if (this.state === 'climb') this.vertical = lerp(this.vertical, -80, dt * 1.4);
      else this.vertical = lerp(this.vertical, 0, dt * 2);
      super.update(dt, sim);
    }
    draw() {
      this.shadow(.14);
      const angle = this.state === 'climb' ? -.18 : 0;
      ctx.save(); ctx.translate(this.x, this.y + Math.sin(this.phase) * 2); ctx.rotate(angle); ctx.scale(this.scale, this.scale);
      ctx.strokeStyle = '#a76824'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-38, -16); ctx.quadraticCurveTo(-68, -31, -76, -4); ctx.stroke();
      ctx.fillStyle = '#d79a35'; ctx.beginPath(); ctx.ellipse(-3, -17, 43, 18, -.03, 0, Math.PI * 2); ctx.fill();
      drawLeg(-25, -3, Math.sin(this.phase) * 8, '#d79a35', 8, 29); drawLeg(22, -3, -Math.sin(this.phase) * 8, '#d79a35', 8, 29);
      ctx.beginPath(); ctx.arc(39, -29, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#342719';
      [[-26,-20],[-12,-11],[3,-23],[18,-13],[36,-31]].forEach(([x,y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); });
      ctx.beginPath(); ctx.arc(46, -31, 2, 0, 7); ctx.fill();
      ctx.restore(); this.label(this.mood);
    }
  }

  function drawLeg(x, y, stride, color, width = 10, height = 34) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + stride, y + height); ctx.stroke();
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  class WeatherManager {
    constructor(pool) {
      this.pool = pool; this.kind = 'sunny'; this.spawnBudget = 0; this.lightning = null; this.lightningTimer = 1.2;
      this.tornadoX = 1080; this.tornadoPhase = 0; this.flash = 0; this.puddle = 0;
    }
    set(kind) {
      this.kind = kind; this.pool.releaseAll(); this.spawnBudget = 0; this.lightning = null; this.flash = 0;
      weatherButtons.forEach(b => b.classList.toggle('active', b.dataset.weather === kind));
      weatherLabel.textContent = WEATHER_NAMES[kind]; tip.style.opacity = '0';
    }
    resetParticle(p) {
      p.x = random(-50, W + 50); p.y = random(-H * .4, 20);
      if (p.type === 'rain') { p.vx = -70; p.vy = random(680, 910); p.size = random(11, 22); }
      if (p.type === 'snow') { p.vx = random(-18, 18); p.vy = random(28, 65); p.size = random(2, 5); p.seed = Math.random() * 20; }
      if (p.type === 'debris') { p.angle = random(0, Math.PI * 2); p.radius = random(15, 90); p.y = random(250, GROUND + 70); p.size = random(2, 6); }
    }
    spawn(type, amount) {
      for (let i = 0; i < amount; i++) { const p = this.pool.acquire(type); if (!p) break; this.resetParticle(p); }
    }
    chooseSafeStrike(animals) {
      // Every candidate is scored against all live animal x bounds. A valid one clears
      // every body radius; the fallback keeps the maximum possible nearest distance.
      let best = 80, bestDistance = -1;
      for (let i = 0; i < 36; i++) {
        const x = random(70, W - 70);
        let nearest = Infinity, safe = true;
        for (const animal of animals) {
          const clearance = Math.abs(animal.x - x) - 74 * animal.scale;
          nearest = Math.min(nearest, clearance);
          if (clearance < 70) safe = false;
        }
        if (safe) return x;
        if (nearest > bestDistance) { bestDistance = nearest; best = x; }
      }
      return bestDistance >= 70 ? best : null;
    }
    update(dt, animals) {
      const rates = { rain: 125, heavy: 320, snow: 78, storm: 270 };
      if (rates[this.kind]) {
        this.spawnBudget += rates[this.kind] * dt;
        const n = Math.floor(this.spawnBudget); this.spawnBudget -= n;
        this.spawn(this.kind === 'snow' ? 'snow' : 'rain', n);
      }
      if (this.kind === 'tornado' && !this.pool.active.some(p => p.type === 'debris')) this.spawn('debris', 90);
      for (let i = this.pool.active.length - 1; i >= 0; i--) {
        const p = this.pool.active[i];
        if (p.type === 'rain') { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > GROUND + 130) this.resetParticle(p); }
        else if (p.type === 'snow') { p.y += p.vy * dt; p.x += (p.vx + Math.sin(p.seed + p.y * .015) * 20) * dt; if (p.y > H) this.resetParticle(p); }
        else if (p.type === 'debris') { p.angle += dt * (2.5 + 80 / p.radius); p.y -= dt * 8; if (p.y < 270) p.y = GROUND + 80; }
      }
      this.puddle += ((['rain', 'heavy', 'storm'].includes(this.kind) ? 1 : 0) - this.puddle) * Math.min(1, dt * .45);
      this.flash = Math.max(0, this.flash - dt * 3.8);
      if (this.kind === 'storm') {
        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0) {
          const x = this.chooseSafeStrike(animals);
          if (x === null) { this.lightningTimer = .25; return; }
          const points = [{ x: x + random(-90, 90), y: 0 }];
          for (let y = 70; y < GROUND; y += random(45, 85)) points.push({ x: x + random(-28, 28), y });
          points.push({ x, y: GROUND + 28 });
          this.lightning = { points, life: .22 }; this.flash = 1; this.lightningTimer = random(1.4, 3.3);
        }
      }
      if (this.lightning) { this.lightning.life -= dt; if (this.lightning.life <= 0) this.lightning = null; }
      if (this.kind === 'tornado') {
        // The funnel steers toward the nearest animal but is capped below normal wildlife speed.
        const target = animals.reduce((best, a) => Math.abs(a.x - this.tornadoX) < Math.abs(best.x - this.tornadoX) ? a : best, animals[0]);
        this.tornadoX += Math.sign(target.x - this.tornadoX) * Math.min(19 * dt, Math.abs(target.x - this.tornadoX));
        this.tornadoPhase += dt * 3;
      }
    }
    drawBehind() {
      if (this.puddle > .02) {
        ctx.save(); ctx.globalAlpha = this.puddle * .38; ctx.fillStyle = '#537e86';
        [[250,620,125,15],[690,650,180,19],[1040,584,110,12]].forEach(p => { ctx.beginPath(); ctx.ellipse(...p, 0, 0, Math.PI * 2); ctx.fill(); }); ctx.restore();
      }
      if (['heavy', 'storm'].includes(this.kind)) {
        const g = ctx.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, 'rgba(31,45,55,.54)'); g.addColorStop(1, 'rgba(55,68,66,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);
      }
    }
    drawFront() {
      ctx.save();
      for (const p of this.pool.active) {
        if (p.type === 'rain') { ctx.strokeStyle = this.kind === 'heavy' || this.kind === 'storm' ? 'rgba(200,230,235,.67)' : 'rgba(215,239,242,.56)'; ctx.lineWidth = this.kind === 'heavy' ? 2.2 : 1.3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * .025, p.y + p.size); ctx.stroke(); }
        else if (p.type === 'snow') { ctx.fillStyle = 'rgba(250,253,248,.86)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
        else if (p.type === 'debris') { const taper = clamp((p.y - 250) / 370, .2, 1); const x = this.tornadoX + Math.sin(p.angle) * p.radius * taper; ctx.fillStyle = p.id % 3 ? '#80623d' : '#c19c58'; ctx.fillRect(x, p.y, p.size, p.size * .65); }
      }
      if (this.kind === 'tornado') this.drawTornado();
      if (this.lightning) {
        ctx.shadowColor = '#e8f7ff'; ctx.shadowBlur = 18; ctx.strokeStyle = '#f7fdff'; ctx.lineWidth = 5; ctx.beginPath();
        this.lightning.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      }
      ctx.restore();
    }
    drawTornado() {
      ctx.save(); ctx.translate(this.tornadoX, 0); ctx.lineCap = 'round';
      for (let i = 0; i < 18; i++) {
        const y = 215 + i * 20, width = 10 + i * 5.2;
        ctx.strokeStyle = `rgba(105,99,84,${.16 + i * .018})`; ctx.lineWidth = 8 + i * .25;
        ctx.beginPath(); ctx.arc(Math.sin(this.tornadoPhase + i * .7) * 12, y, width, 0, Math.PI * 1.7); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(104,90,66,.22)'; ctx.beginPath(); ctx.ellipse(0, GROUND + 48, 115, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  class SavannahSimulation {
    constructor() {
      this.season = new SeasonManager(); this.pool = new ParticlePool(520); this.weather = new WeatherManager(this.pool); this.time = 0;
      this.animals = [
        new Elephant(90, 621, 1.05), new Leopard(165, 566, .64), new Lion(300, 642, .86, true), new Leopard(480, 580, .72),
        new Elephant(620, 600, .88), new Lion(800, 653, .75, false), new Leopard(970, 625, .68),
        new Elephant(1110, 650, .78), new Lion(1190, 585, .7, false)
      ];
      document.querySelector('#animalCount').textContent = this.animals.length;
    }
    update(dt) {
      this.time += dt; this.season.update(dt); this.weather.update(dt, this.animals);
      this.animals.forEach(a => a.update(dt, this));
    }
    draw() {
      drawBackground(this.time, this.season.mix, this.weather.kind);
      this.weather.drawBehind();
      drawLandscapeDetails(this.time, this.season.mix);
      [...this.animals].sort((a, b) => a.baseY - b.baseY).forEach(a => a.draw());
      this.weather.drawFront();
      if (this.weather.flash > 0) { ctx.fillStyle = `rgba(229,246,255,${this.weather.flash * .34})`; ctx.fillRect(0, 0, W, H); }
    }
  }

  function drawBackground(t, wet, weather) {
    const skyTop = mixColor('#84bdd0', '#719fbb', wet), skyBottom = mixColor('#f2c17e', '#a9cfaa', wet);
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND); sky.addColorStop(0, skyTop); sky.addColorStop(1, skyBottom);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (!['heavy', 'storm'].includes(weather)) {
      const sunX = 1010, sunY = 115; const sun = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 85);
      sun.addColorStop(0, 'rgba(255,241,178,.94)'); sun.addColorStop(.25, 'rgba(255,224,137,.55)'); sun.addColorStop(1, 'rgba(255,220,130,0)');
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sunX, sunY, 85, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe3a1'; ctx.beginPath(); ctx.arc(sunX, sunY, 34, 0, Math.PI * 2); ctx.fill();
    }
    drawClouds(t, weather);
    ctx.fillStyle = mixColor('#8a8160', '#667c68', wet); mountainLayer(390, [0,190,310,500,710,900,1110,1280], [60,120,68,155,72,126,55,105]);
    ctx.fillStyle = mixColor('#9c955f', '#638462', wet); mountainLayer(455, [0,150,360,580,790,1010,1280], [55,105,72,116,68,105,70]);
    ctx.fillStyle = mixColor('#b5904f', '#6f9b5c', wet); ctx.fillRect(0, 450, W, H - 450);
    const ground = ctx.createLinearGradient(0, 450, 0, H); ground.addColorStop(0, mixColor('#b99a55', '#719e58', wet)); ground.addColorStop(1, mixColor('#92703c', '#477644', wet)); ctx.fillStyle = ground; ctx.fillRect(0, 450, W, H - 450);
  }

  function mountainLayer(base, xs, peaks) {
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, base);
    xs.forEach((x, i) => { ctx.quadraticCurveTo(x + 45, base - peaks[i], x + 100, base); });
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  function drawClouds(t, weather) {
    const dark = ['heavy', 'storm'].includes(weather); ctx.fillStyle = dark ? 'rgba(64,72,75,.68)' : 'rgba(255,244,220,.50)';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 310 + t * (6 + i)) % 1550) - 160, y = 80 + (i % 3) * 58;
      ctx.beginPath(); ctx.ellipse(x, y, 72, 22, 0, 0, 7); ctx.ellipse(x + 45, y - 14, 48, 31, 0, 0, 7); ctx.ellipse(x + 92, y, 68, 21, 0, 0, 7); ctx.fill();
    }
  }

  function drawLandscapeDetails(t, wet) {
    drawAcacia(155, 495, 1.1, wet); drawAcacia(935, 505, .9, wet); drawAcacia(1180, 472, .62, wet);
    ctx.strokeStyle = mixColor('#765d31', '#3d743f', wet); ctx.lineWidth = 2;
    for (let i = 0; i < 90; i++) {
      const x = (i * 89) % W, y = 505 + (i * 47) % 210, sway = Math.sin(t * 1.4 + i) * 4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sway, y - 13, x + sway * .7, y - 24 - (i % 4) * 4); ctx.stroke();
    }
  }

  function drawAcacia(x, y, scale, wet) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.strokeStyle = '#5d452b'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 55); ctx.quadraticCurveTo(-8, 2, 5, -42); ctx.moveTo(0, -8); ctx.lineTo(-39, -43); ctx.moveTo(3, -24); ctx.lineTo(45, -51); ctx.stroke();
    ctx.fillStyle = mixColor('#6f793a', '#3f7c48', wet); [[-42,-52,52,18],[0,-67,62,22],[48,-59,49,17]].forEach(([a,b,c,d]) => { ctx.beginPath(); ctx.ellipse(a,b,c,d,0,0,7); ctx.fill(); }); ctx.restore();
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), cw = canvas.clientWidth, ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    const scale = Math.max(cw / W, ch / H), ox = (cw - W * scale) / 2, oy = (ch - H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  }

  const sim = new SavannahSimulation();
  weatherButtons.forEach(button => button.addEventListener('click', () => sim.weather.set(button.dataset.weather)));
  seasonButton.addEventListener('click', () => sim.season.toggle());
  addEventListener('keydown', event => {
    const options = ['sunny', 'rain', 'heavy', 'snow', 'storm', 'tornado'];
    if (Number(event.key) >= 1 && Number(event.key) <= 6) sim.weather.set(options[Number(event.key) - 1]);
    if (event.key.toLowerCase() === 's') sim.season.toggle();
  });
  addEventListener('resize', resize); resize();

  let previous = performance.now(), frames = 0, fpsTime = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - previous) / 1000, .05); previous = now;
    sim.update(dt); sim.draw();
    particleLabel.textContent = sim.pool.active.length;
    frames++; fpsTime += dt;
    if (fpsTime > .75) { fpsLabel.textContent = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
  }
  requestAnimationFrame(loop);
  window.__arenaReady = true;
})();
