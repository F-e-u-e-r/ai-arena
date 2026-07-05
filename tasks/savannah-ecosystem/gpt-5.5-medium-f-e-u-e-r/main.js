(() => {
  const canvas = document.querySelector('#savannah');
  const ctx = canvas.getContext('2d');
  const weatherBox = document.querySelector('#weather');
  const seasonButton = document.querySelector('#season');
  const hud = document.querySelector('#hud');
  const weatherNames = ['Sunny', 'Rain', 'Heavy', 'Snow', 'Storm', 'Tornado'];
  const state = { weather: 'Sunny', season: 'Dry', time: 0, seasonClock: 0, fps: 0 };
  let width = 1;
  let height = 1;
  let dpr = 1;
  let last = performance.now();

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = Math.max(320, innerWidth);
    height = Math.max(200, innerHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  class ParticlePool {
    constructor(size) {
      this.items = Array.from({ length: size }, () => ({ active: false }));
      this.cursor = 0;
    }

    spawn(data) {
      const p = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.items.length;
      Object.assign(p, data, { active: true });
      return p;
    }

    clear(kind) {
      for (const p of this.items) {
        if (!kind || p.kind === kind) p.active = false;
      }
    }

    update(dt) {
      let live = 0;
      for (const p of this.items) {
        if (!p.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.rot = (p.rot || 0) + (p.spin || 0) * dt;
        if (p.life <= 0 || p.y > height + 60 || p.x < -80 || p.x > width + 80) p.active = false;
        else live++;
      }
      return live;
    }

    draw(ctx) {
      for (const p of this.items) {
        if (!p.active) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife)) * (p.alpha || 1);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        if (p.kind === 'snow') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'dust') {
          ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
        } else {
          ctx.fillRect(-p.size * 0.12, -p.size, p.size * 0.24, p.size * 2);
        }
        ctx.restore();
      }
    }
  }

  class SeasonManager {
    update(dt) {
      state.seasonClock += dt;
      if (state.seasonClock >= 60) this.toggle();
    }

    toggle() {
      state.season = state.season === 'Dry' ? 'Wet' : 'Dry';
      state.seasonClock = 0;
      seasonButton.textContent = state.season === 'Dry' ? 'Wet' : 'Dry';
    }
  }

  class Animal {
    constructor(x, lane, color) {
      this.x = x;
      this.lane = lane;
      this.color = color;
      this.phase = Math.random() * Math.PI * 2;
      this.stateTimer = Math.random() * 4;
      this.action = 'walk';
    }

    behavior(dt, baseSpeed, groupBias) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.action = Math.random() < groupBias ? 'cluster' : 'walk';
        this.stateTimer = 2 + Math.random() * 5;
      }
      let modifier = state.season === 'Wet' ? 1.16 : 0.88;
      if (state.weather === 'Heavy' || state.weather === 'Storm') modifier *= 0.78;
      if (state.weather === 'Tornado') modifier *= 1.22;
      if (this.action === 'cluster') modifier *= 0.68;
      this.x += baseSpeed * modifier * dt;
      this.phase += dt * baseSpeed * 0.045;
      if (this.x > width + 90) this.x = -80 - Math.random() * 120;
    }

    y() {
      return height * this.lane + Math.sin(this.phase) * 2;
    }
  }

  class Lion extends Animal {
    update(dt) {
      this.behavior(dt, 28, state.season === 'Dry' ? 0.7 : 0.42);
    }

    draw(ctx) {
      const y = this.y();
      const s = Math.max(0.72, height / 360);
      ctx.save();
      ctx.translate(this.x, y);
      ctx.scale(s, s);
      ctx.fillStyle = '#c79234';
      ctx.fillRect(-18, -12, 38, 18);
      ctx.fillStyle = '#7a4a22';
      ctx.beginPath();
      ctx.arc(22, -9, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9a447';
      ctx.beginPath();
      ctx.arc(25, -9, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a4a22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, -4);
      ctx.quadraticCurveTo(-34, -18, -42, -5);
      ctx.stroke();
      this.legs(ctx, '#8c5a25');
      ctx.restore();
    }

    legs(ctx, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      for (const x of [-10, 5, 16]) {
        ctx.beginPath();
        ctx.moveTo(x, 4);
        ctx.lineTo(x + Math.sin(this.phase + x) * 4, 20);
        ctx.stroke();
      }
    }
  }

  class Elephant extends Animal {
    update(dt) {
      this.behavior(dt, 17, state.season === 'Dry' ? 0.86 : 0.58);
      this.drink = state.season === 'Dry' && Math.sin(state.time * 0.45 + this.phase) > 0.82;
    }

    draw(ctx) {
      const y = this.y();
      const s = Math.max(0.78, height / 340);
      ctx.save();
      ctx.translate(this.x, y);
      ctx.scale(s, s);
      ctx.fillStyle = '#7d8790';
      ctx.beginPath();
      ctx.ellipse(0, -13, 34, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(31, -18, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6f7880';
      ctx.beginPath();
      ctx.ellipse(23, -20, 9, 16, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6f7880';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(43, -10);
      ctx.quadraticCurveTo(58, this.drink ? 22 : -1, 42, this.drink ? 23 : 15);
      ctx.stroke();
      ctx.fillStyle = '#6f7880';
      for (const x of [-20, -4, 13, 26]) ctx.fillRect(x, 0, 7, 25);
      ctx.restore();
    }
  }

  class Leopard extends Animal {
    update(dt) {
      this.behavior(dt, 44, 0.15);
      this.climb = Math.sin(state.time * 0.9 + this.phase) > 0.74;
    }

    draw(ctx) {
      const y = this.y() - (this.climb ? Math.abs(Math.sin(state.time * 4 + this.phase)) * 34 : 0);
      const s = Math.max(0.62, height / 390);
      ctx.save();
      ctx.translate(this.x, y);
      ctx.scale(s, s);
      ctx.fillStyle = '#d7a13c';
      ctx.fillRect(-16, -10, 34, 13);
      ctx.beginPath();
      ctx.arc(23, -11, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2117';
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(-12 + i * 5, -8 + Math.sin(i) * 5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#2b2117';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-17, -6);
      ctx.quadraticCurveTo(-34, -16, -39, -2);
      ctx.stroke();
      ctx.restore();
    }
  }

  class WeatherManager {
    constructor(pool, animals) {
      this.pool = pool;
      this.animals = animals;
      this.lightning = null;
      this.lightningTimer = 0;
      this.tornado = { x: width * 0.25, y: height * 0.58 };
    }

    setWeather(name) {
      state.weather = name;
      this.pool.clear();
      document.querySelectorAll('.weather button').forEach(b => b.classList.toggle('active', b.dataset.weather === name));
    }

    update(dt) {
      const density = state.weather === 'Rain' ? 8 : state.weather === 'Heavy' ? 18 : state.weather === 'Snow' ? 5 : state.weather === 'Storm' ? 12 : 0;
      for (let i = 0; i < density; i++) {
        const snow = state.weather === 'Snow';
        this.pool.spawn({
          kind: snow ? 'snow' : 'rain',
          x: Math.random() * width,
          y: -10,
          vx: snow ? -10 + Math.random() * 20 : -36,
          vy: snow ? 36 + Math.random() * 28 : 420 + Math.random() * 160,
          life: snow ? 7 : 1.6,
          maxLife: snow ? 7 : 1.6,
          size: snow ? 2 + Math.random() * 2 : 12 + Math.random() * 8,
          color: snow ? '#f7fbff' : '#8ed8ff',
          alpha: snow ? 0.78 : 0.62
        });
      }
      if (state.weather === 'Storm') this.updateLightning(dt);
      else this.lightning = null;
      if (state.weather === 'Tornado') this.updateTornado(dt);
    }

    updateLightning(dt) {
      this.lightningTimer -= dt;
      if (this.lightningTimer > 0) return;
      this.lightningTimer = 1.1 + Math.random() * 1.8;
      const zones = this.animals.map(a => ({ x: a.x, y: a.y(), r: 70 }));
      let x = Math.random() * width;
      // Lightning searches for a strike x-coordinate outside every animal safety circle.
      for (let tries = 0; tries < 30; tries++) {
        const candidate = Math.random() * width;
        if (zones.every(z => Math.hypot(candidate - z.x, height * 0.62 - z.y) > z.r)) {
          x = candidate;
          break;
        }
      }
      this.lightning = { x, life: 0.16, maxLife: 0.16 };
    }

    updateTornado(dt) {
      let nearest = this.animals[0];
      let best = Infinity;
      for (const a of this.animals) {
        const d = Math.hypot(a.x - this.tornado.x, a.y() - this.tornado.y);
        if (d < best) {
          best = d;
          nearest = a;
        }
      }
      // The tornado pursues the closest animal slowly, so it is visible without instantly catching wildlife.
      const tx = nearest.x;
      const ty = nearest.y() - 20;
      this.tornado.x += (tx - this.tornado.x) * dt * 0.16;
      this.tornado.y += (ty - this.tornado.y) * dt * 0.16;
      for (let i = 0; i < 6; i++) {
        this.pool.spawn({
          kind: 'dust',
          x: this.tornado.x + (Math.random() - 0.5) * 46,
          y: this.tornado.y + Math.random() * 70,
          vx: (Math.random() - 0.5) * 140,
          vy: -30 - Math.random() * 80,
          life: 1.1,
          maxLife: 1.1,
          size: 4 + Math.random() * 8,
          color: '#b68a49',
          alpha: 0.55,
          spin: 3
        });
      }
    }

    drawOverlays(ctx) {
      if (state.weather === 'Rain' || state.weather === 'Heavy' || state.weather === 'Storm') {
        ctx.fillStyle = state.weather === 'Heavy' ? 'rgba(46, 83, 102, 0.18)' : 'rgba(84, 137, 151, 0.1)';
        ctx.fillRect(0, height * 0.76, width, height * 0.24);
      }
      if (this.lightning) {
        this.lightning.life -= 1 / 60;
        if (this.lightning.life <= 0) this.lightning = null;
        else {
          ctx.strokeStyle = `rgba(255, 245, 166, ${this.lightning.life / this.lightning.maxLife})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(this.lightning.x, 0);
          for (let y = 0; y < height * 0.68; y += 24) ctx.lineTo(this.lightning.x + Math.sin(y * 0.2) * 18 + (Math.random() - 0.5) * 18, y);
          ctx.stroke();
        }
      }
      if (state.weather === 'Tornado') {
        const t = this.tornado;
        ctx.save();
        ctx.translate(t.x, t.y);
        for (let i = 0; i < 6; i++) {
          ctx.strokeStyle = `rgba(94, 73, 52, ${0.18 + i * 0.07})`;
          ctx.lineWidth = 8 - i;
          ctx.beginPath();
          ctx.ellipse(0, 8 + i * 10, 18 + i * 8, 5 + i * 3, state.time * 2 + i, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  const animals = [
    new Lion(-40, 0.69, '#c79234'),
    new Lion(-170, 0.72, '#c79234'),
    new Elephant(-90, 0.78, '#7d8790'),
    new Elephant(-250, 0.82, '#7d8790'),
    new Leopard(-25, 0.61, '#d7a13c'),
    new Leopard(-310, 0.57, '#d7a13c')
  ];
  const pool = new ParticlePool(900);
  const seasons = new SeasonManager();
  const weather = new WeatherManager(pool, animals);

  for (const name of weatherNames) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.weather = name;
    button.textContent = name;
    button.addEventListener('click', () => weather.setWeather(name));
    weatherBox.append(button);
  }
  seasonButton.addEventListener('click', () => seasons.toggle());
  weather.setWeather('Sunny');

  function drawBackground() {
    const wet = state.season === 'Wet';
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, wet ? '#79bde7' : '#eaa85f');
    sky.addColorStop(0.52, wet ? '#cbeaa9' : '#f1c36e');
    sky.addColorStop(1, wet ? '#4d9d54' : '#c8973f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = wet ? '#5e9a62' : '#b88939';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.58);
    for (let x = 0; x <= width; x += 32) ctx.lineTo(x, height * 0.55 + Math.sin(x * 0.015 + state.time * 0.15) * 10);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fill();
    ctx.fillStyle = wet ? '#2d7c42' : '#8b6a2b';
    for (let x = -20; x < width + 20; x += 18) {
      const h = 10 + Math.sin(x * 0.06 + state.time * 1.4) * 5;
      ctx.fillRect(x, height * 0.78 - h, 3, h);
    }
    drawTrees();
  }

  function drawTrees() {
    for (let i = 0; i < 5; i++) {
      const x = (i * 0.23 * width + 80) % width;
      const y = height * (0.54 + (i % 2) * 0.04);
      ctx.fillStyle = '#65421e';
      ctx.fillRect(x, y - 40, 8, 46);
      ctx.fillStyle = state.season === 'Wet' ? '#286b35' : '#866e28';
      ctx.beginPath();
      ctx.arc(x - 18, y - 44, 22, 0, Math.PI * 2);
      ctx.arc(x + 10, y - 52, 24, 0, Math.PI * 2);
      ctx.arc(x + 30, y - 38, 19, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    state.time += dt;
    state.fps = state.fps * 0.92 + (1 / dt) * 0.08;
    seasons.update(dt);
    weather.update(dt);
    animals.forEach(a => a.update(dt));
    const live = pool.update(dt);
    drawBackground();
    animals.slice().sort((a, b) => a.y() - b.y()).forEach(a => a.draw(ctx));
    pool.draw(ctx);
    weather.drawOverlays(ctx);
    hud.textContent = `${state.weather} | ${state.season} | ${Math.round(state.fps)} fps | ${live}`;
    requestAnimationFrame(loop);
  }

  addEventListener('resize', resize);
  addEventListener('keydown', event => {
    const i = Number(event.key) - 1;
    if (i >= 0 && i < weatherNames.length) weather.setWeather(weatherNames[i]);
    if (event.key.toLowerCase() === 's') seasons.toggle();
  });
  resize();
  requestAnimationFrame(loop);
})();
