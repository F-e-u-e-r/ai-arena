(() => {
  'use strict';

  const canvas = document.getElementById('savannahCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scene = document.querySelector('.scene');
  const buttons = [...document.querySelectorAll('.weather-button')];
  const seasonButton = document.getElementById('seasonToggle');
  const seasonName = document.getElementById('seasonName');
  const seasonTimer = document.getElementById('seasonTimer');
  const weatherTitle = document.getElementById('weatherTitle');
  const weatherDescription = document.getElementById('weatherDescription');
  const debugPanel = document.getElementById('debugPanel');

  const H = 500;
  const TAU = Math.PI * 2;
  const WEATHER = ['sunny', 'rain', 'heavy', 'snow', 'thunder', 'tornado'];
  const WEATHER_COPY = {
    sunny: ['Under a golden sky', 'A quiet hour on the savannah.'],
    rain: ['A welcome rain', 'The plains come alive again.'],
    heavy: ['The downpour', 'Wildlife seeks a gentler path.'],
    snow: ['An unlikely winter', 'A rare hush falls over the grass.'],
    thunder: ['The sky awakens', 'The herds keep moving through the storm.'],
    tornado: ['Winds on the plains', 'A slow spiral follows the wildlife.']
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b) => a + Math.random() * (b - a);
  const mix = (a, b, t) => a + (b - a) * t;
  const color = (a, b, t) => `rgb(${Math.round(mix(a[0], b[0], t))},${Math.round(mix(a[1], b[1], t))},${Math.round(mix(a[2], b[2], t))})`;

  let W = 1000;
  let pixelRatio = 1;
  let time = 0;
  let frameCount = 0;
  let fpsClock = 0;
  let fps = 60;
  let debug = false;

  class SeasonManager {
    constructor() {
      this.wet = false;
      this.blend = 0;
      this.elapsed = 0;
    }
    toggle() {
      this.wet = !this.wet;
      this.elapsed = 0;
      this.updateUI();
    }
    update(dt) {
      this.elapsed += dt;
      if (this.elapsed >= 60) this.toggle();
      // Ease the environmental palette over several seconds while animal positions remain untouched.
      this.blend += ((this.wet ? 1 : 0) - this.blend) * (1 - Math.exp(-dt / 2.8));
      seasonTimer.textContent = `NEXT SHIFT · 0:${String(Math.ceil(60 - this.elapsed)).padStart(2, '0')}`;
    }
    updateUI() {
      seasonName.textContent = this.wet ? 'WET SEASON' : 'DRY SEASON';
      seasonButton.classList.toggle('wet', this.wet);
      seasonButton.setAttribute('aria-label', `Switch season; current season ${this.wet ? 'wet' : 'dry'}`);
    }
  }

  class Particle {
    constructor() { this.alive = false; }
    activate(type, x, y, vx, vy, life, size, hue = 0) {
      this.type = type; this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.life = life; this.maxLife = life; this.size = size; this.hue = hue;
      this.angle = rand(0, TAU); this.alive = true;
      return this;
    }
    update(dt, manager) {
      this.life -= dt;
      if (this.life <= 0) return false;
      if (this.type === 'vortex') {
        // Each mote circles the moving funnel; its radius shrinks as it rises.
        this.angle += dt * (2.8 + this.hue);
        this.y += this.vy * dt;
        const progress = clamp((365 - this.y) / 175, 0, 1);
        this.x = manager.tornadoX + Math.cos(this.angle) * (17 + progress * 55);
      } else {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (this.type === 'snow') this.x += Math.sin(time * 2 + this.hue) * 10 * dt;
      }
      return this.x > -100 && this.x < W + 100 && this.y < H + 35;
    }
    draw(c) {
      const fade = clamp(this.life / Math.min(this.maxLife, .55), 0, 1);
      c.globalAlpha = fade;
      if (this.type === 'rain') {
        c.strokeStyle = '#d4edeb'; c.lineWidth = this.size;
        c.beginPath(); c.moveTo(this.x, this.y); c.lineTo(this.x - this.vx * .026, this.y - this.vy * .026); c.stroke();
      } else if (this.type === 'snow') {
        c.fillStyle = '#fffdf0'; c.beginPath(); c.arc(this.x, this.y, this.size, 0, TAU); c.fill();
      } else if (this.type === 'vortex') {
        c.fillStyle = this.hue > 1 ? '#eacb98' : '#7a795f';
        c.beginPath(); c.arc(this.x, this.y, this.size, 0, TAU); c.fill();
      } else if (this.type === 'splash') {
        c.strokeStyle = '#d9ebe2'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(this.x, this.y, this.size * (1.5 - fade), Math.PI, TAU); c.stroke();
      } else {
        c.fillStyle = this.hue > .5 ? '#fae0a4' : '#cad9a0';
        c.beginPath(); c.arc(this.x, this.y, this.size, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  class ParticleSystem {
    constructor(capacity = 900) {
      this.capacity = capacity;
      this.active = [];
      this.free = [];
      this.allocated = 0;
    }
    emit(type, x, y, vx, vy, life, size, hue) {
      let p = this.free.pop();
      if (!p) {
        if (this.allocated >= this.capacity) return;
        p = new Particle();
        this.allocated++;
      }
      p.activate(type, x, y, vx, vy, life, size, hue);
      this.active.push(p);
    }
    clear() {
      while (this.active.length) {
        const p = this.active.pop(); p.alive = false; this.free.push(p);
      }
    }
    update(dt, manager) {
      for (let i = this.active.length - 1; i >= 0; i--) {
        const p = this.active[i];
        if (!p.update(dt, manager)) {
          p.alive = false;
          this.active[i] = this.active[this.active.length - 1];
          this.active.pop();
          this.free.push(p);
        }
      }
    }
    draw(c) { for (const p of this.active) p.draw(c); }
  }

  class WeatherManager {
    constructor() {
      this.type = 'sunny';
      this.particles = new ParticleSystem();
      this.emitRemainder = 0;
      this.lightning = null;
      this.strikeClock = 2.4;
      this.tornadoX = W * .77;
      this.tornadoY = 366;
    }
    set(type) {
      if (!WEATHER.includes(type) || type === this.type) return;
      this.type = type;
      this.particles.clear(); // Return every old-weather particle to the pool immediately.
      this.emitRemainder = 0;
      this.lightning = null;
      this.strikeClock = rand(1.7, 3.2);
      for (const button of buttons) {
        const active = button.dataset.weather === type;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      weatherTitle.textContent = WEATHER_COPY[type][0];
      weatherDescription.textContent = WEATHER_COPY[type][1];
    }
    safeStrikeX(animals) {
      // Reserve an entire vertical corridor, including zigzag width and a movement margin.
      // A strike is emitted only where no current animal bounding circle intersects it.
      const candidates = [];
      for (let x = 48; x < W - 48; x += 14) {
        let safe = true;
        for (const animal of animals) {
          if (Math.abs(x - animal.x) < animal.radius + 64) { safe = false; break; }
        }
        if (safe) candidates.push(x);
      }
      return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }
    createLightning(x) {
      const points = [{ x, y: -8 }];
      let px = x;
      for (let y = 35; y <= 375; y += rand(29, 43)) {
        px = clamp(px + rand(-12, 12), x - 17, x + 17);
        points.push({ x: px, y });
      }
      points.push({ x: px + rand(-7, 7), y: 380 });
      this.lightning = { x, points, life: .27, maxLife: .27 };
    }
    update(dt, animals, season) {
      const type = this.type;
      let rate = { sunny: 8, rain: 115, heavy: 280, snow: 105, thunder: 215, tornado: 92 }[type];
      if (type === 'snow' && !season.wet) rate *= .66; // Dry-season snow is sparse, but the control remains usable.
      rate *= clamp(W / 1000, .7, 1.5);
      this.emitRemainder += dt * rate;
      let count = Math.min(40, Math.floor(this.emitRemainder));
      this.emitRemainder -= count;
      while (count--) {
        if (type === 'sunny') {
          this.particles.emit('mote', rand(0, W), rand(230, 430), rand(-10, 13), rand(-13, -3), rand(2.4, 5), rand(.7, 2), Math.random());
        } else if (type === 'snow') {
          this.particles.emit('snow', rand(-20, W + 20), rand(-22, 0), rand(-14, 7), rand(42, 81), rand(6, 10), rand(1, 2.7), rand(0, 10));
        } else if (type === 'tornado') {
          this.particles.emit('vortex', this.tornadoX, rand(310, 385), 0, rand(-72, -35), rand(.8, 2.5), rand(1, 3.5), rand(0, 2));
        } else {
          const heavy = type === 'heavy' || type === 'thunder';
          this.particles.emit('rain', rand(-25, W + 25), rand(-35, 0), heavy ? -105 : -49,
            heavy ? rand(460, 690) : rand(330, 480), rand(.6, 1.45), heavy ? 1.4 : 1.1, 0);
        }
      }
      if (type === 'rain' || type === 'heavy' || type === 'thunder') {
        if (Math.random() < dt * (type === 'rain' ? 3 : 8)) {
          this.particles.emit('splash', rand(0, W), rand(386, 462), 0, 0, .48, rand(3, 8), 0);
        }
      }
      this.particles.update(dt, this);
      if (type === 'thunder') {
        if (this.lightning) {
          this.lightning.life -= dt;
          // Recheck live positions for the whole visible lifetime of the bolt.
          if (this.lightning.life <= 0 || animals.some(a => Math.abs(a.x - this.lightning.x) < a.radius + 40)) this.lightning = null;
        }
        this.strikeClock -= dt;
        if (this.strikeClock <= 0) {
          const x = this.safeStrikeX(animals);
          if (x !== null) this.createLightning(x);
          this.strikeClock = x === null ? .5 : rand(2.8, 5.2);
        }
      }
      if (type === 'tornado') {
        // Follow the closest live animal, with a capped speed slower than a leopard's run.
        let target = null, best = Infinity;
        for (const animal of animals) {
          const d = Math.abs(animal.x - this.tornadoX) + Math.abs(animal.y - this.tornadoY) * .3;
          if (d < best) { best = d; target = animal; }
        }
        if (target) this.tornadoX += clamp(target.x - this.tornadoX, -17 * dt, 17 * dt);
        this.tornadoX = clamp(this.tornadoX, 50, W - 50);
      }
    }
    drawParticles(c) { this.particles.draw(c); }
    drawTornado(c) {
      if (this.type !== 'tornado') return;
      c.save(); c.translate(this.tornadoX, this.tornadoY);
      const sway = Math.sin(time * 1.5) * 11;
      const funnel = c.createLinearGradient(-70, 0, 70, 0);
      funnel.addColorStop(0, '#6c6e6388'); funnel.addColorStop(.5, '#d6c8a4b0'); funnel.addColorStop(1, '#72756d77');
      c.fillStyle = funnel;
      c.beginPath(); c.moveTo(-70 + sway, -185); c.bezierCurveTo(-40, -140, -14, -76, -9, 0);
      c.quadraticCurveTo(0, 15, 14, 1); c.bezierCurveTo(10, -73, 44, -132, 78 + sway, -185);
      c.closePath(); c.fill();
      for (let i = 0; i < 9; i++) {
        const yy = -15 - i * 19;
        c.strokeStyle = i % 2 ? '#e9dcc18a' : '#4e625b75'; c.lineWidth = 2.5 + i * .22;
        c.beginPath(); c.ellipse(sway * i / 9, yy, 13 + i * 7, 5 + i * .5, -.1, time * (1.9 + i * .05), time * (1.9 + i * .05) + Math.PI * 1.3); c.stroke();
      }
      c.fillStyle = '#bdab8380'; c.beginPath(); c.ellipse(0, 5, 47, 12, 0, 0, TAU); c.fill();
      c.restore();
    }
    drawLightning(c) {
      const bolt = this.lightning;
      if (!bolt || this.type !== 'thunder') return;
      const alpha = clamp(bolt.life / bolt.maxLife, 0, 1);
      c.save(); c.globalAlpha = alpha;
      c.fillStyle = '#f9f1d7'; c.globalAlpha = alpha * .13; c.fillRect(0, 0, W, H);
      c.globalAlpha = alpha; c.shadowColor = '#cde8ff'; c.shadowBlur = 28;
      c.strokeStyle = '#d6eafa'; c.lineWidth = 10; c.beginPath();
      bolt.points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
      c.shadowBlur = 0; c.strokeStyle = '#fffef1'; c.lineWidth = 3; c.stroke();
      c.restore();
    }
  }

  class Animal {
    constructor(type, x, y, radius, speed, leader = null) {
      this.type = type; this.x = x; this.y = y; this.radius = radius; this.baseSpeed = speed;
      this.leader = leader; this.phase = rand(0, TAU); this.state = 'walk';
      this.stateTime = rand(2, 5); this.stateDuration = this.stateTime; this.age = rand(0, 8);
      this.climbCooldown = rand(3, 12); this.climbOffset = 0;
    }
    pickState() { /* Specialized by each species. */ }
    update(dt, season, weather) {
      this.age += dt;
      this.climbCooldown -= dt;
      this.stateTime -= dt;
      if (this.type === 'leopard' && this.state !== 'climb' && this.climbCooldown <= 0) {
        const treeX = [W * .16, W * .83];
        if (treeX.some(x => Math.abs(this.x - x) < 48) && Math.random() < dt * .8) {
          this.state = 'climb'; this.stateTime = 3.3; this.stateDuration = 3.3; this.climbCooldown = rand(18, 26);
        }
      }
      if (this.stateTime <= 0) this.pickState(season, weather);
      const wetBoost = this.type === 'elephant' ? .93 + season.blend * .18 : .86 + season.blend * .35;
      const weatherFactor = {
        sunny: 1, rain: 1.09, heavy: .72, snow: .57, thunder: this.type === 'leopard' ? 1.15 : .79,
        tornado: this.type === 'leopard' ? 1.38 : 1.17
      }[weather.type];
      let stateFactor = 1;
      if (this.state === 'rest') stateFactor = .08;
      if (this.state === 'drink') stateFactor = .12;
      if (this.state === 'trunk') stateFactor = .7;
      if (this.state === 'stalk') stateFactor = .57;
      if (this.state === 'dart') stateFactor = 1.58;
      if (this.state === 'climb') stateFactor = .1;
      let speed = this.baseSpeed * wetBoost * weatherFactor * stateFactor;
      if (this.leader) {
        // Followers close ranks in the dry season and spread out when rain returns.
        let gap = this.leader.x - this.x;
        if (gap < -W * .5) gap += W + 2 * this.radius;
        const desired = mix(82, 123, season.blend);
        speed *= clamp(1 + (gap - desired) * .009, .48, 1.65);
      }
      this.x += speed * dt;
      this.phase += dt * (this.type === 'leopard' ? 10 : this.type === 'lion' ? 5 : 3.2) * Math.max(stateFactor, .18);
      if (this.state === 'climb') {
        const progress = 1 - this.stateTime / this.stateDuration;
        this.climbOffset = Math.sin(progress * Math.PI) * 85;
      } else this.climbOffset += (0 - this.climbOffset) * Math.min(1, dt * 8);
      if (this.x > W + this.radius + 40) this.x = -this.radius - rand(22, 65);
    }
    draw(c) {
      c.save(); c.translate(this.x, this.y - this.climbOffset);
      const step = Math.sin(this.phase) * (this.state === 'rest' || this.state === 'drink' ? 1 : 5);
      c.globalAlpha = clamp(1 - this.climbOffset / 250, .45, 1);
      c.fillStyle = '#273c3050'; c.beginPath(); c.ellipse(0, this.climbOffset + 5, this.radius * .74, 7, 0, 0, TAU); c.fill();
      this.drawSpecies(c, step);
      c.restore();
    }
    drawElephant(c, step) {
      const trunkLift = this.state === 'trunk' ? 30 + Math.sin(time * 4 + this.phase) * 11 : this.state === 'drink' ? -4 : 8 + Math.sin(time * 1.8 + this.phase) * 4;
      c.lineCap = 'round';
      c.strokeStyle = '#687b73'; c.lineWidth = 5; c.beginPath(); c.moveTo(-58, -35); c.quadraticCurveTo(-78, -16, -70, -5 + Math.sin(time * 2) * 4); c.stroke();
      c.fillStyle = '#657970';
      for (const [x, d] of [[-42, step], [-15, -step], [19, step], [43, -step]]) {
        c.beginPath(); c.moveTo(x - 10, -29); c.lineTo(x + 8, -29); c.lineTo(x + 10 + d * .25, -1); c.lineTo(x - 9 + d * .4, -1); c.closePath(); c.fill();
        c.fillStyle = '#53675f'; c.fillRect(x - 9 + d * .4, -3, 19, 4); c.fillStyle = '#657970';
      }
      c.fillStyle = '#73877b'; c.beginPath(); c.ellipse(-5, -47, 62, 37, -.05, 0, TAU); c.fill();
      c.fillStyle = '#85988b'; c.beginPath(); c.ellipse(-13, -57, 43, 27, -.15, Math.PI, TAU); c.fill();
      c.fillStyle = '#60766d'; c.beginPath(); c.ellipse(33, -48, 24, 30, -.17, 0, TAU); c.fill();
      c.fillStyle = '#8fa195'; c.beginPath(); c.ellipse(37, -51, 18, 23, -.22, 0, TAU); c.fill();
      c.fillStyle = '#73877b'; c.beginPath(); c.ellipse(54, -48, 22, 24, .08, 0, TAU); c.fill();
      c.strokeStyle = '#70867a'; c.lineWidth = 18; c.beginPath(); c.moveTo(68, -44); c.bezierCurveTo(76, -30, 72, -14, 66, -5 - trunkLift); c.stroke();
      c.strokeStyle = '#92a397'; c.lineWidth = 3; c.beginPath(); c.moveTo(75, -40); c.quadraticCurveTo(78, -25, 72, -16 - trunkLift * .45); c.stroke();
      c.strokeStyle = '#f6e8c8'; c.lineWidth = 5; c.beginPath(); c.moveTo(57, -30); c.quadraticCurveTo(64, -13, 75, -21); c.stroke();
      c.fillStyle = '#233a35'; c.beginPath(); c.arc(62, -54, 2.3, 0, TAU); c.fill();
      c.fillStyle = '#e6f0db'; c.beginPath(); c.arc(62.6, -55, .7, 0, TAU); c.fill();
      c.strokeStyle = '#53695f'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(55, -63); c.quadraticCurveTo(61, -66, 66, -62); c.stroke();
      if (this.state === 'drink') {
        c.fillStyle = '#cce9e3';
        for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(69 + i * 5, -2 + ((time * 24 + i * 8) % 21), 1.5, 0, TAU); c.fill(); }
      }
    }
    drawLion(c, step) {
      const male = !this.leader;
      c.strokeStyle = '#b67b43'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-39, -24); c.bezierCurveTo(-65, -30, -69, -6, -60, -2); c.stroke();
      c.fillStyle = '#70472e'; c.beginPath(); c.ellipse(-60, -2, 6, 4, -.4, 0, TAU); c.fill();
      c.fillStyle = '#b77c45';
      for (const [x, d] of [[-25, step], [-9, -step], [16, -step], [31, step]]) {
        c.beginPath(); c.moveTo(x - 5, -19); c.lineTo(x + 5, -19); c.lineTo(x + 7 + d * .5, 0); c.lineTo(x - 4 + d * .7, 0); c.closePath(); c.fill();
      }
      c.fillStyle = '#d6a05e'; c.beginPath(); c.ellipse(-2, -27, 41, 19, -.02, 0, TAU); c.fill();
      c.fillStyle = '#e5b778'; c.beginPath(); c.ellipse(-13, -33, 25, 9, -.1, Math.PI, TAU); c.fill();
      if (male) {
        c.fillStyle = '#805031'; c.beginPath(); c.ellipse(37, -36, 24, 25, -.08, 0, TAU); c.fill();
        c.fillStyle = '#9a6137';
        for (let i = 0; i < 9; i++) { const a = -2.7 + i * .58; c.beginPath(); c.ellipse(38 + Math.cos(a) * 17, -35 + Math.sin(a) * 17, 5, 9, a, 0, TAU); c.fill(); }
      }
      c.fillStyle = '#dfa967'; c.beginPath(); c.ellipse(43, -36, male ? 14 : 17, male ? 16 : 15, 0, 0, TAU); c.fill();
      c.fillStyle = '#e9be7d'; c.beginPath(); c.ellipse(53, -27, 10, 7, 0, 0, TAU); c.fill();
      c.fillStyle = '#d69b5a';
      for (const x of [34, 49]) { c.beginPath(); c.arc(x, -49, 5, 0, TAU); c.fill(); }
      c.fillStyle = '#302b25'; c.beginPath(); c.arc(51, -40, 1.8, 0, TAU); c.arc(61, -27, 2.7, 0, TAU); c.fill();
      c.strokeStyle = '#6e4b37'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(58, -25); c.quadraticCurveTo(53, -21, 48, -25); c.stroke();
      if (this.state === 'rest') { c.strokeStyle = '#5b4636'; c.beginPath(); c.moveTo(47, -40); c.quadraticCurveTo(51, -37, 55, -40); c.stroke(); }
    }
    drawLeopard(c, step) {
      c.strokeStyle = '#c58f4c'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath();
      c.moveTo(-39, -25); c.bezierCurveTo(-63, -27, -64, -10, -77, -19 + Math.sin(time * 3 + this.phase) * 5); c.stroke();
      c.fillStyle = '#3c3328'; c.beginPath(); c.arc(-77, -19 + Math.sin(time * 3 + this.phase) * 5, 4, 0, TAU); c.fill();
      c.fillStyle = '#b98649';
      for (const [x, d] of [[-28, step], [-10, -step], [13, -step], [31, step]]) {
        c.beginPath(); c.moveTo(x - 4, -22); c.lineTo(x + 5, -22); c.lineTo(x + 6 + d * .65, -1); c.lineTo(x - 4 + d * .7, -1); c.closePath(); c.fill();
      }
      c.fillStyle = '#d2a45f'; c.beginPath(); c.ellipse(-4, -29, 40, 14, -.03, 0, TAU); c.fill();
      c.fillStyle = '#e7c587'; c.beginPath(); c.ellipse(-5, -22, 29, 5, 0, 0, TAU); c.fill();
      c.fillStyle = '#d3a45e'; c.beginPath(); c.ellipse(37, -35, 15, 12, 0, 0, TAU); c.fill();
      for (const x of [29, 43]) { c.beginPath(); c.arc(x, -45, 4.5, 0, TAU); c.fill(); }
      c.fillStyle = '#e4c184'; c.beginPath(); c.ellipse(48, -29, 7, 5, 0, 0, TAU); c.fill();
      c.fillStyle = '#3e342b';
      const spots = [[-31,-34],[-21,-26],[-14,-36],[-3,-28],[5,-37],[15,-29],[26,-34],[-36,-26],[33,-39],[39,-31]];
      for (const [x,y] of spots) { c.beginPath(); c.ellipse(x, y, 2.3, 1.6, -.25, 0, TAU); c.fill(); }
      c.beginPath(); c.arc(46, -37, 1.7, 0, TAU); c.arc(53, -28, 1.9, 0, TAU); c.fill();
      c.strokeStyle = '#f3dfb5'; c.lineWidth = 1; c.beginPath(); c.moveTo(49, -26); c.lineTo(58, -24); c.stroke();
    }
  }

  class Lion extends Animal {
    constructor(x, y, leader = null) { super('lion', x, y, 65, leader ? 28 : 29, leader); }
    pickState(season, weather) {
      const r = Math.random();
      this.state = r < (season.wet ? .13 : .33) || weather.type === 'heavy' && r < .6 ? 'rest' : 'patrol';
      this.stateTime = this.state === 'rest' ? rand(2.4, 4.8) : rand(4, 8);
      this.stateDuration = this.stateTime;
    }
    drawSpecies(c, step) { this.drawLion(c, step); }
  }

  class Elephant extends Animal {
    constructor(x, y, leader = null) { super('elephant', x, y, 88, leader ? 17 : 18, leader); }
    pickState(season) {
      const r = Math.random();
      const nearWater = Math.abs(this.x - W * .61) < 125;
      this.state = nearWater && r < (season.wet ? .36 : .68) ? 'drink' : r < .28 ? 'trunk' : 'walk';
      this.stateTime = this.state === 'drink' ? rand(2.3, 4.3) : rand(3.5, 6.5);
      this.stateDuration = this.stateTime;
    }
    drawSpecies(c, step) { this.drawElephant(c, step); }
  }

  class Leopard extends Animal {
    constructor(x, y, speed) { super('leopard', x, y, 58, speed); }
    pickState(season) {
      this.state = Math.random() < (season.wet ? .59 : .34) ? 'dart' : 'stalk';
      this.stateTime = rand(2.5, 5.5);
      this.stateDuration = this.stateTime;
    }
    drawSpecies(c, step) { this.drawLeopard(c, step); }
  }

  function ellipse(c, x, y, rx, ry, fill, rotation = 0) {
    c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, TAU); c.fill();
  }

  function drawCloud(c, x, y, scale, shade, opacity = 1) {
    c.save(); c.translate(x, y); c.scale(scale, scale); c.globalAlpha = opacity;
    ellipse(c, 0, 8, 75, 16, shade);
    ellipse(c, -39, 0, 31, 18, shade); ellipse(c, -9, -7, 39, 25, shade);
    ellipse(c, 29, -2, 36, 20, shade); ellipse(c, 59, 7, 27, 13, shade);
    c.restore();
  }

  function drawTree(c, x, y, scale, wet, snow, phase) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    const trunk = color([65, 65, 45], [48, 71, 59], wet);
    c.strokeStyle = trunk; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 13; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(7, -44, -9, -78, -3, -128); c.stroke();
    c.lineWidth = 6;
    for (const [sx, ex, ey] of [[-3,-67,-134],[-5,-98,-141],[0,31,-143],[0,72,-128]]) {
      c.beginPath(); c.moveTo(sx, -94); c.quadraticCurveTo(ex * .55, -125, ex, ey); c.stroke();
    }
    const foliage = color([79, 91, 52], [49, 103, 77], wet);
    const light = color([117, 125, 65], [75, 134, 88], wet);
    for (const [cx,cy,rx,ry] of [[-74,-136,36,15],[-41,-145,47,19],[5,-151,55,20],[50,-142,48,18],[82,-133,31,13]]) {
      ellipse(c, cx, cy, rx, ry, foliage);
      ellipse(c, cx - 2, cy - 6, rx * .75, ry * .46, light);
      if (snow) { c.globalAlpha = .73; ellipse(c, cx - 3, cy - ry * .75, rx * .67, 4, '#f2f2df'); c.globalAlpha = 1; }
    }
    // Little moving leaves keep the trees from reading as static silhouettes.
    c.fillStyle = light;
    for (let i = 0; i < 5; i++) {
      const fx = -68 + i * 35 + Math.sin(phase * .7 + i) * 2;
      c.beginPath(); c.ellipse(fx, -123 + Math.sin(phase + i) * 3, 4, 2, .4, 0, TAU); c.fill();
    }
    c.restore();
  }

  function drawHills(c, base, amplitude, fill, seed) {
    c.fillStyle = fill; c.beginPath(); c.moveTo(-20, H);
    c.lineTo(-20, base);
    for (let x = -20; x <= W + 25; x += 18) {
      const y = base + Math.sin(x * .004 + seed) * amplitude + Math.sin(x * .011 + seed * 1.7) * amplitude * .38;
      c.lineTo(x, y);
    }
    c.lineTo(W + 25, H); c.closePath(); c.fill();
  }

  function drawLandscape(c, season, weather) {
    const wet = season.blend;
    const storm = { sunny: 0, rain: .28, heavy: .47, snow: .36, thunder: .66, tornado: .27 }[weather.type];
    const sky = c.createLinearGradient(0, 0, 0, 335);
    const top = color([107, 155, 165], [99, 157, 171], wet);
    const bottom = color([249, 200, 141], [202, 224, 197], wet);
    sky.addColorStop(0, top); sky.addColorStop(1, bottom); c.fillStyle = sky; c.fillRect(0, 0, W, H);
    if (storm) {
      c.fillStyle = weather.type === 'snow' ? `rgba(226,240,235,${storm})` : weather.type === 'tornado' ? `rgba(154,124,99,${storm})` : `rgba(29,57,73,${storm})`;
      c.fillRect(0, 0, W, H);
    }
    const sunX = W * .73, sunY = 112;
    const glow = c.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
    glow.addColorStop(0, '#fff1c68c'); glow.addColorStop(.5, '#f5d7a343'); glow.addColorStop(1, '#f5d7a300');
    c.fillStyle = glow; c.fillRect(sunX - 150, sunY - 150, 300, 300);
    ellipse(c, sunX, sunY, weather.type === 'snow' ? 30 : 38, weather.type === 'snow' ? 30 : 38,
      weather.type === 'snow' ? '#fff5ddbb' : storm > .4 ? '#f4e5c17a' : '#ffebba');
    for (let i = 0; i < 6; i++) {
      const wrap = W + 260;
      const x = ((i * 262 + time * (i % 2 ? 6 : 10)) % wrap) - 130;
      drawCloud(c, x, 64 + i % 3 * 39, .47 + i % 3 * .18,
        storm > .3 ? '#718c92' : '#fff4dc', storm > .3 ? .42 : .4);
    }
    drawHills(c, 242, 17, color([169, 166, 126], [126, 169, 148], wet), .2);
    drawHills(c, 272, 23, color([140, 148, 107], [99, 148, 126], wet), 1.2);
    drawHills(c, 308, 20, color([150, 145, 91], [91, 137, 101], wet), 2.4);
    const plain = c.createLinearGradient(0, 300, 0, H);
    plain.addColorStop(0, color([185, 158, 87], [111, 153, 97], wet));
    plain.addColorStop(.55, color([177, 140, 77], [90, 130, 78], wet));
    plain.addColorStop(1, color([117, 111, 68], [58, 99, 71], wet));
    c.fillStyle = plain; c.fillRect(0, 317, W, H - 317);
    drawHills(c, 328, 7, color([181, 154, 85], [104, 147, 89], wet), 1.3);
    c.strokeStyle = color([207, 180, 108], [142, 179, 119], wet); c.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      c.beginPath(); c.moveTo(-20, 359 + i * 21);
      c.bezierCurveTo(W * .2, 348 + i * 20, W * .64, 382 + i * 17, W + 20, 360 + i * 21); c.stroke();
    }
    for (let i = 0; i < 11; i++) {
      const x = (i + .2) * W / 11;
      drawTree(c, x, 311 + (i % 3) * 9, .14 + i % 3 * .035, wet, false, time);
    }
    // The waterhole expands with the wet season and becomes a puddle network in rain.
    const water = weather.type === 'rain' || weather.type === 'heavy' || weather.type === 'thunder';
    const rx = 90 + wet * 46 + (water ? 24 : 0);
    ellipse(c, W * .61, 410, rx + 10, 17 + wet * 4, color([145, 127, 75], [61, 107, 87], wet));
    ellipse(c, W * .61, 407, rx, 11 + wet * 4, water ? '#729fa4' : '#839e9b');
    c.strokeStyle = '#d3d8bcaa'; c.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(W * .61 + Math.sin(time * .9 + i) * 20, 407, 23 + i * 20, 3 + i, 0, .1, Math.PI - .1); c.stroke(); }
    if (water) {
      for (const [x,y,r] of [[.18,426,31],[.37,451,23],[.89,405,28]]) ellipse(c, W*x, y, r, 3, '#a8c5b0a8');
    }
    drawTree(c, W * .16, 354, 1.01, wet, weather.type === 'snow', time);
    drawTree(c, W * .83, 345, .82, wet, weather.type === 'snow', time + 1);
    if (weather.type === 'snow') {
      c.fillStyle = '#f3f3e5ad'; c.fillRect(0, 466, W, 34);
      for (let i = 0; i < 65; i++) ellipse(c, (i * 73.7) % W, 338 + (i * 47) % 148, 2 + i % 3, .7, '#f1f1e1a9');
    }
    for (let i = 0; i < 28; i++) {
      const x = (i * 117.13) % W, y = 348 + (i * 71) % 142;
      ellipse(c, x, y, 2 + i % 3, 1, '#5d60414d');
    }
  }

  function drawForeground(c, season, weather) {
    const wet = season.blend;
    c.lineCap = 'round';
    for (let i = 0; i < 133; i++) {
      const x = (i * 79.31 + 15) % W;
      const y = 350 + (i * 51) % 151;
      const h = 6 + (i * 7) % 17;
      const sway = Math.sin(time * (weather.type === 'tornado' ? 5 : 1.5) + i * .8) * (weather.type === 'tornado' ? 8 : 2.5);
      c.strokeStyle = i % 4 === 0 ? color([226, 187, 106], [123, 183, 105], wet) : color([114, 125, 73], [65, 122, 79], wet);
      c.globalAlpha = y > 430 ? .9 : .55; c.lineWidth = y > 430 ? 1.5 : .9;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sway * .5, y - h * .6, x + sway + (i % 3 - 1) * 3, y - h); c.stroke();
      if (i % 13 === 0 && wet > .25) ellipse(c, x + sway, y - h, 2, 2, '#e7cf9d');
    }
    c.globalAlpha = 1;
  }

  const season = new SeasonManager();
  const weather = new WeatherManager();
  let animals = [];

  function createAnimals() {
    const elephantA = new Elephant(W * .22, 398);
    const elephantB = new Elephant(W * .11, 374, elephantA);
    const lionA = new Lion(W * .48, 439);
    const lionB = new Lion(W * .38, 449, lionA);
    const leopardA = new Leopard(W * .69, 383, 52);
    const leopardB = new Leopard(W * .91, 464, 57);
    animals = [elephantA, elephantB, lionA, lionB, leopardA, leopardB];
    animals.forEach(a => a.pickState(season, weather));
  }

  function resize() {
    const rect = scene.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const oldW = W;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * pixelRatio);
    canvas.height = Math.round(rect.height * pixelRatio);
    W = H * rect.width / rect.height;
    if (animals.length) {
      const factor = W / oldW;
      for (const animal of animals) animal.x *= factor;
      weather.tornadoX *= factor;
      weather.particles.clear();
    } else weather.tornadoX = W * .77;
  }

  function render() {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    drawLandscape(ctx, season, weather);
    weather.drawTornado(ctx);
    animals.sort((a,b) => a.y - b.y);
    for (const animal of animals) animal.draw(ctx);
    weather.drawParticles(ctx);
    drawForeground(ctx, season, weather);
    weather.drawLightning(ctx);
  }

  function animate(now) {
    const dt = Math.min((now - animate.last) / 1000 || 0, .05);
    animate.last = now;
    time += dt;
    season.update(dt);
    for (const animal of animals) animal.update(dt, season, weather);
    weather.update(dt, animals, season);
    render();
    frameCount++; fpsClock += dt;
    if (fpsClock >= .5) {
      fps = Math.round(frameCount / fpsClock); frameCount = 0; fpsClock = 0;
      if (debug) debugPanel.textContent = `${fps} FPS\n${weather.particles.active.length} PARTICLES\n${weather.particles.allocated} POOLED`;
    }
    requestAnimationFrame(animate);
  }
  animate.last = performance.now();

  buttons.forEach(button => button.addEventListener('click', () => weather.set(button.dataset.weather)));
  seasonButton.addEventListener('click', () => season.toggle());
  window.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (/^[1-6]$/.test(event.key)) weather.set(WEATHER[Number(event.key) - 1]);
    if (event.key.toLowerCase() === 's') season.toggle();
    if (event.key.toLowerCase() === 'd') { debug = !debug; debugPanel.hidden = !debug; }
  });
  window.addEventListener('resize', resize, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(scene);
  resize(); createAnimals(); season.updateUI(); requestAnimationFrame(animate);
})();
