/* Savannah / Living Weather — Canvas 2D only, no framework or library. */
(() => {
  'use strict';

  const canvas = document.querySelector('#savannah-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const WORLD_W = 960;
  const WORLD_H = 600;
  const TAU = Math.PI * 2;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }
  function mixRgb(a, b, amount) {
    return a.map((value, index) => Math.round(lerp(value, b[index], amount)));
  }
  function cssRgb(rgb, alpha = 1) { return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`; }
  function rgba(hex, alpha = 1) { return cssRgb(hexToRgb(hex), alpha); }

  const seasonPalettes = [
    {
      name: 'DRY SEASON',
      mark: '#d4a15d',
      skyTop: hexToRgb('#3d5460'),
      skyBottom: hexToRgb('#e7b56e'),
      distant: hexToRgb('#766b68'),
      grass: hexToRgb('#9b7e49'),
      groundTop: hexToRgb('#c58c52'),
      groundBottom: hexToRgb('#76513b'),
      water: hexToRgb('#4f9a99'),
      cloud: hexToRgb('#f8dbad'),
      brightness: .92
    },
    {
      name: 'WET SEASON',
      mark: '#9dc7a7',
      skyTop: hexToRgb('#1b4352'),
      skyBottom: hexToRgb('#80b7a7'),
      distant: hexToRgb('#456d62'),
      grass: hexToRgb('#4f8a62'),
      groundTop: hexToRgb('#6b9b62'),
      groundBottom: hexToRgb('#294f42'),
      water: hexToRgb('#4faaa7'),
      cloud: hexToRgb('#d4e1d1'),
      brightness: 1.08
    }
  ];

  class SeasonManager {
    constructor() {
      this.current = 0;
      this.target = 0;
      this.transition = 1;
      this.autoTimer = 0;
    }

    set(index) {
      const next = (index + 2) % 2;
      if (next === this.target) return;
      this.current = this.target;
      this.target = next;
      this.transition = 0;
    }

    update(dt) {
      this.autoTimer += dt;
      if (this.autoTimer >= 60) {
        this.autoTimer = 0;
        this.set(this.target + 1);
      }
      if (this.transition < 1) this.transition = Math.min(1, this.transition + dt / 3.8);
    }

    get palette() {
      const p = smoothstep(0, 1, this.transition);
      const a = seasonPalettes[this.current];
      const b = seasonPalettes[this.target];
      return {
        name: this.transition > .5 ? b.name : a.name,
        mark: this.transition > .5 ? b.mark : a.mark,
        skyTop: mixRgb(a.skyTop, b.skyTop, p),
        skyBottom: mixRgb(a.skyBottom, b.skyBottom, p),
        distant: mixRgb(a.distant, b.distant, p),
        grass: mixRgb(a.grass, b.grass, p),
        groundTop: mixRgb(a.groundTop, b.groundTop, p),
        groundBottom: mixRgb(a.groundBottom, b.groundBottom, p),
        water: mixRgb(a.water, b.water, p),
        cloud: mixRgb(a.cloud, b.cloud, p),
        brightness: lerp(a.brightness, b.brightness, p)
      };
    }
  }

  // A fixed pool means weather changes only activate/recycle existing particles.
  class ParticlePool {
    constructor(size = 560) {
      this.items = Array.from({ length: size }, (_, index) => ({
        active: false, type: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0,
        size: 1, alpha: 1, spin: 0, angle: 0, seed: index * .71
      }));
      this.free = [...this.items];
      this.active = [];
    }

    acquire(type, x, y, options = {}) {
      const particle = this.free.pop();
      if (!particle) return null;
      particle.active = true;
      particle.type = type;
      particle.x = x;
      particle.y = y;
      particle.vx = options.vx || 0;
      particle.vy = options.vy || 0;
      particle.life = particle.maxLife = options.life || 1;
      particle.size = options.size || 1;
      particle.alpha = options.alpha ?? 1;
      particle.spin = options.spin || 0;
      particle.angle = options.angle || 0;
      this.active.push(particle);
      return particle;
    }

    recycleAt(index) {
      const particle = this.active[index];
      const last = this.active.pop();
      particle.active = false;
      this.free.push(particle);
      if (last !== particle) this.active[index] = last;
    }

    clear() {
      while (this.active.length) {
        const particle = this.active.pop();
        particle.active = false;
        this.free.push(particle);
      }
    }

    update(dt) {
      for (let i = this.active.length - 1; i >= 0; i--) {
        const p = this.active[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        if (p.life <= 0 || p.y > WORLD_H + 35 || p.x < -35 || p.x > WORLD_W + 35) this.recycleAt(i);
      }
    }

    draw(context, elapsed) {
      this.active.forEach(p => {
        const lifeAlpha = clamp(p.life / Math.min(p.maxLife, 1));
        context.save();
        context.translate(p.x, p.y);
        context.globalAlpha = p.alpha * Math.min(1, lifeAlpha * 2);
        if (p.type === 'rain') {
          context.strokeStyle = '#c2e4e2';
          context.lineWidth = p.size;
          context.beginPath();
          context.moveTo(0, 0);
          context.lineTo(p.vx * .035, p.vy * .035);
          context.stroke();
        } else if (p.type === 'snow') {
          context.fillStyle = '#e9f2e7';
          context.beginPath();
          context.arc(Math.sin(elapsed + p.seed) * 1.4, 0, p.size, 0, TAU);
          context.fill();
        } else if (p.type === 'dust') {
          context.fillStyle = p.alpha > .7 ? '#d9b67c' : '#e2c78f';
          context.beginPath();
          context.arc(0, 0, p.size * (1 + (1 - lifeAlpha) * 1.4), 0, TAU);
          context.fill();
        } else if (p.type === 'firefly') {
          context.fillStyle = '#ffe9a1';
          context.shadowColor = '#ffe9a1';
          context.shadowBlur = 9;
          context.beginPath();
          context.arc(0, 0, p.size, 0, TAU);
          context.fill();
        }
        context.restore();
      });
    }
  }

  const WEATHER = {
    sunny: { label: 'SUNNY', speed: 1, density: 0 },
    rain: { label: 'RAIN', speed: .86, density: 9 },
    'heavy-rain': { label: 'HEAVY RAIN', speed: .62, density: 22 },
    snow: { label: 'SNOW', speed: .7, density: 8 },
    thunderstorm: { label: 'THUNDERSTORM', speed: .55, density: 18 },
    tornado: { label: 'TORNADO', speed: .72, density: 4 }
  };

  class WeatherManager {
    constructor() {
      this.pool = new ParticlePool();
      this.current = 'sunny';
      this.emitCarry = 0;
      this.time = 0;
      this.puddle = 0;
      this.lightning = { active: false, timer: 0, x: 0, safeRadius: 0, flash: 0 };
      this.nextStrike = rand(3.5, 6.5);
      this.tornado = { x: 790, y: 365, phase: 0 };
    }

    set(type) {
      if (!WEATHER[type] || type === this.current) return;
      // Old weather is retired immediately, but its objects go back to the pool.
      this.pool.clear();
      this.current = type;
      this.emitCarry = 0;
      this.lightning.active = false;
      this.lightning.flash = 0;
      this.nextStrike = rand(2.8, 5.6);
      if (type === 'sunny') this.puddle = 0;
    }

    findSafeStrike(animals) {
      // Sample the sky and choose the column with the largest live distance from
      // every animal. The bolt is narrower than safeRadius, so it cannot hit a body.
      let bestX = 80;
      let bestDistance = -Infinity;
      for (let sample = 0; sample < 42; sample++) {
        const x = 60 + sample * 20.5;
        const distance = animals.reduce((nearest, animal) => Math.min(nearest, Math.abs(animal.x - x)), WORLD_W);
        if (distance > bestDistance) { bestDistance = distance; bestX = x; }
      }
      return { x: bestX, safeRadius: Math.max(58, bestDistance - 18) };
    }

    strike(animals) {
      const target = this.findSafeStrike(animals);
      this.lightning.active = true;
      this.lightning.timer = .42;
      this.lightning.x = target.x;
      this.lightning.safeRadius = target.safeRadius;
      this.lightning.flash = 1;
    }

    emitForWeather(dt, env) {
      const weather = WEATHER[this.current];
      this.emitCarry += weather.density * dt;
      while (this.emitCarry >= 1) {
        this.emitCarry -= 1;
        if (this.current === 'rain' || this.current === 'heavy-rain' || this.current === 'thunderstorm') {
          const heavy = this.current !== 'rain';
          this.pool.acquire('rain', rand(-15, WORLD_W + 15), rand(36, 110), {
            vx: heavy ? -70 : -45, vy: heavy ? 520 : 390, life: 1.5, size: heavy ? 1.7 : 1.1, alpha: heavy ? .58 : .42
          });
        } else if (this.current === 'snow') {
          this.pool.acquire('snow', rand(0, WORLD_W), rand(30, 110), {
            vx: rand(-10, 10), vy: rand(22, 43), life: 16, size: rand(2, 4), alpha: .75
          });
        } else if (this.current === 'tornado') {
          this.pool.acquire('dust', this.tornado.x + rand(-42, 42), this.tornado.y + rand(-18, 32), {
            vx: rand(-24, 24), vy: rand(-28, 14), life: rand(1.3, 2.8), size: rand(2, 7), alpha: rand(.35, .72), spin: rand(-2, 2)
          });
        }
      }
      if (this.current === 'sunny' && env.daylight < .65) {
        this.emitCarry += dt * 2.2;
        while (this.emitCarry >= 1) {
          this.emitCarry -= 1;
          this.pool.acquire('firefly', rand(80, WORLD_W - 100), rand(220, 360), { vx: rand(-3, 3), vy: rand(-2, 2), life: 4.2, size: rand(1.3, 2.5), alpha: .75 });
        }
      }
    }

    update(dt, env) {
      this.time += dt;
      const wet = this.current === 'rain' || this.current === 'heavy-rain' || this.current === 'thunderstorm';
      this.puddle = lerp(this.puddle, wet ? (this.current === 'heavy-rain' ? 1 : .65) : 0, 1 - Math.pow(.02, dt));
      this.emitForWeather(dt, env);
      if (this.current === 'thunderstorm') {
        this.nextStrike -= dt;
        if (this.nextStrike <= 0 && !this.lightning.active) {
          this.strike(env.animals);
          this.nextStrike = rand(3.8, 7.5);
          env.note('Lightning found an empty corridor');
        }
      }
      if (this.lightning.active) {
        this.lightning.timer -= dt;
        this.lightning.flash = Math.max(0, this.lightning.timer / .42);
        // Re-evaluate the corridor while the flash is visible; the animation
        // never draws within the current safe radius around a live animal.
        const target = this.findSafeStrike(env.animals);
        this.lightning.x = target.x;
        this.lightning.safeRadius = target.safeRadius;
        if (this.lightning.timer <= 0) this.lightning.active = false;
      }
      if (this.current === 'tornado') {
        const nearest = env.animals.reduce((best, animal) => {
          const distance = Math.abs(animal.x - this.tornado.x) + Math.abs(animal.y - this.tornado.y) * .5;
          return !best || distance < best.distance ? { animal, distance } : best;
        }, null);
        if (nearest) this.tornado.x += clamp(nearest.animal.x - this.tornado.x, -1, 1) * 19 * dt;
        this.tornado.x = clamp(this.tornado.x, 180, 850);
        this.tornado.phase += dt;
      }
      this.pool.update(dt);
    }

    draw(context, elapsed, palette) {
      if (this.puddle > .01) {
        context.save();
        context.globalAlpha = this.puddle * .38;
        context.fillStyle = cssRgb(palette.water);
        context.beginPath();
        context.ellipse(244, 438, 92 + this.puddle * 16, 17, -.08, 0, TAU);
        context.fill();
        context.strokeStyle = 'rgba(212, 244, 228, .45)';
        context.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          context.beginPath();
          context.ellipse(215 + i * 24, 436, 16 + i * 4, 3, 0, 0, TAU);
          context.stroke();
        }
        context.restore();
      }
      this.pool.draw(context, elapsed);
      if (this.current === 'tornado') this.drawTornado(context);
      if (this.lightning.active) this.drawLightning(context);
    }

    drawTornado(context) {
      const x = this.tornado.x;
      const y = this.tornado.y;
      context.save();
      context.translate(x, y);
      context.globalAlpha = .58;
      context.strokeStyle = '#bfae86';
      context.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const width = 16 + i * 7;
        context.lineWidth = 5 - i * .35;
        context.beginPath();
        context.moveTo(-width * .22, -118 + i * 11);
        context.quadraticCurveTo(width * .75, -84 + i * 9, width * .32, -53 + i * 9);
        context.quadraticCurveTo(-width * .72, -24 + i * 6, width * .45, 1 + i * 4);
        context.stroke();
      }
      context.fillStyle = 'rgba(245, 218, 160, .7)';
      context.beginPath();
      context.ellipse(0, 3, 45, 10, 0, 0, TAU);
      context.fill();
      context.restore();
    }

    drawLightning(context) {
      const x = this.lightning.x;
      const alpha = clamp(this.lightning.flash * 2);
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = 'rgba(255, 242, 190, .2)';
      context.fillRect(0, 0, WORLD_W, 400);
      context.strokeStyle = '#fff5b1';
      context.shadowColor = '#ffe781';
      context.shadowBlur = 18;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(x, 58);
      for (let i = 1; i < 7; i++) context.lineTo(x + (i % 2 ? -1 : 1) * (8 + i * 2), 58 + i * 39);
      context.lineTo(x - 10, 315);
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = '#fff5b1';
      context.font = '700 10px Inter, sans-serif';
      context.letterSpacing = '1px';
      context.fillText('SAFE STRIKE', x + 14, 83);
      context.restore();
    }
  }

  class Animal {
    constructor(species, id, x, y, scale = 1) {
      this.species = species;
      this.id = id;
      this.x = x;
      this.y = y;
      this.baseY = y;
      this.scale = scale;
      this.phase = id * 1.7;
      this.walk = id * .9;
      this.state = 'walk';
      this.stateTimer = rand(2.6, 5.5);
      this.climb = 0;
    }

    behavior(env) {
      const rain = env.weather.current === 'rain' || env.weather.current === 'heavy-rain' || env.weather.current === 'thunderstorm';
      const wet = env.season.target === 1;
      if (this.stateTimer > 0) return;
      if (this.species === 'lion') this.state = Math.random() < (wet ? .27 : .42) ? 'rest' : 'patrol';
      if (this.species === 'elephant') this.state = Math.random() < .42 ? 'drink' : 'walk';
      if (this.species === 'leopard') this.state = Math.random() < (rain ? .3 : .45) ? 'climb' : 'stalk';
      this.stateTimer = this.species === 'leopard' ? rand(3, 6) : rand(4, 8);
    }

    update(dt, env) {
      this.stateTimer -= dt;
      this.behavior(env);
      const rain = env.weather.current === 'rain' || env.weather.current === 'heavy-rain' || env.weather.current === 'thunderstorm';
      const seasonSpeed = env.season.target === 1 ? 1.14 : .84;
      const weatherSpeed = WEATHER[env.weather.current].speed * (rain && this.species === 'lion' ? .82 : 1);
      let stateSpeed = 1;
      if (this.state === 'rest') stateSpeed = .16;
      if (this.state === 'drink') stateSpeed = .25;
      if (this.state === 'climb') stateSpeed = .55;
      const baseSpeed = this.species === 'lion' ? 21 : this.species === 'elephant' ? 15 : 38;
      this.x += baseSpeed * seasonSpeed * weatherSpeed * stateSpeed * dt;
      if (this.x > WORLD_W + 90) {
        this.x = -rand(35, 180);
        this.state = 'walk';
        this.stateTimer = rand(1.5, 4);
      }
      this.walk += dt * (1.8 + baseSpeed * .05) * (stateSpeed + .25);
      const bob = this.state === 'rest' ? Math.sin(this.walk) * 1 : Math.sin(this.walk) * 2.2;
      this.climb = this.state === 'climb' ? .5 + Math.sin(this.walk * .7) * .5 : 0;
      this.y = this.baseY + bob - this.climb * 20;
    }

    draw(context, elapsed) {
      context.save();
      context.translate(this.x, this.y);
      context.scale(this.scale, this.scale);
      context.globalAlpha = this.species === 'leopard' ? .92 : 1;
      if (this.species === 'lion') this.drawLion(context);
      if (this.species === 'elephant') this.drawElephant(context);
      if (this.species === 'leopard') this.drawLeopard(context, elapsed);
      context.restore();
    }

    strokeLeg(context, x, height, color, phase) {
      context.strokeStyle = color;
      context.lineWidth = 5;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(x, 6);
      context.lineTo(x + Math.sin(this.walk + phase) * 3, height);
      context.stroke();
    }

    drawLion(context) {
      context.fillStyle = 'rgba(28, 26, 23, .22)';
      context.beginPath(); context.ellipse(3, 14, 29, 5, 0, 0, TAU); context.fill();
      this.strokeLeg(context, -14, 27, '#9d6438', 0);
      this.strokeLeg(context, -4, 29, '#b8783f', 1.2);
      this.strokeLeg(context, 15, 27, '#8f5736', 2.4);
      context.strokeStyle = '#995b35'; context.lineWidth = 3; context.beginPath(); context.moveTo(28, -8); context.quadraticCurveTo(45, -25, 42, -35); context.stroke();
      context.fillStyle = '#c57e42'; context.beginPath(); context.ellipse(4, -7, 29, 18, -.04, 0, TAU); context.fill();
      context.fillStyle = '#a86439'; context.beginPath(); context.ellipse(-20, -12, 14, 13, 0, 0, TAU); context.fill();
      context.fillStyle = '#6e402d'; context.beginPath(); context.arc(-29, -16, 14, 0, TAU); context.fill();
      context.fillStyle = '#ce8848'; context.beginPath(); context.arc(-29, -16, 9, 0, TAU); context.fill();
      context.fillStyle = '#edba71'; context.beginPath(); context.ellipse(-34, -12, 6, 4, 0, 0, TAU); context.fill();
      context.fillStyle = '#2b2521'; context.beginPath(); context.arc(-36, -17, 1.8, 0, TAU); context.fill();
      context.strokeStyle = '#6c3d2d'; context.lineWidth = 1.5; context.beginPath(); context.moveTo(-38, -8); context.quadraticCurveTo(-33, -4, -28, -8); context.stroke();
    }

    drawElephant(context) {
      context.fillStyle = 'rgba(28, 30, 28, .22)';
      context.beginPath(); context.ellipse(4, 17, 38, 6, 0, 0, TAU); context.fill();
      this.strokeLeg(context, -20, 30, '#596864', 0);
      this.strokeLeg(context, -6, 31, '#677871', 1.3);
      this.strokeLeg(context, 17, 30, '#52625f', 2.5);
      context.fillStyle = '#70827a'; context.beginPath(); context.ellipse(0, -9, 39, 23, 0, 0, TAU); context.fill();
      context.fillStyle = '#5b6d68'; context.beginPath(); context.ellipse(-30, -16, 18, 20, -.16, 0, TAU); context.fill();
      context.fillStyle = '#899b8d'; context.beginPath(); context.ellipse(-34, -13, 10, 13, -.16, 0, TAU); context.fill();
      context.strokeStyle = '#70827a'; context.lineWidth = 8; context.lineCap = 'round'; context.beginPath(); context.moveTo(-42, -8); context.quadraticCurveTo(-53, 5, -49, 20); context.stroke();
      context.strokeStyle = '#f0dfb4'; context.lineWidth = 2.5; context.beginPath(); context.moveTo(-43, 2); context.quadraticCurveTo(-55, -3, -57, -11); context.stroke();
      context.fillStyle = '#252b2a'; context.beginPath(); context.arc(-38, -20, 2, 0, TAU); context.fill();
      context.strokeStyle = 'rgba(34,44,42,.35)'; context.lineWidth = 2; context.beginPath(); context.arc(-4, -9, 23, .3, 2.3); context.stroke();
    }

    drawLeopard(context, elapsed) {
      context.fillStyle = 'rgba(28, 24, 22, .2)';
      context.beginPath(); context.ellipse(4, 12, 27, 4, 0, 0, TAU); context.fill();
      this.strokeLeg(context, -12, 22, '#b17a3e', 0);
      this.strokeLeg(context, 11, 22, '#9a6737', 1.9);
      context.strokeStyle = '#a46d38'; context.lineWidth = 3; context.beginPath(); context.moveTo(25, -8); context.quadraticCurveTo(48, -30, 38, -40); context.stroke();
      context.fillStyle = '#c18b49'; context.beginPath(); context.ellipse(3, -8, 28, 14, 0, 0, TAU); context.fill();
      context.fillStyle = '#b4773e'; context.beginPath(); context.ellipse(-22, -13, 12, 10, 0, 0, TAU); context.fill();
      context.fillStyle = '#bf8141'; context.beginPath(); context.moveTo(-31, -20); context.lineTo(-27, -31); context.lineTo(-20, -23); context.fill();
      context.fillStyle = '#1f2220';
      [[-7,-12], [3,-3], [13,-13], [20,-4], [-15,-3], [7,-16]].forEach(([x, y]) => { context.beginPath(); context.arc(x, y, 2.2, 0, TAU); context.fill(); });
      context.fillStyle = '#24211f'; context.beginPath(); context.arc(-27, -15, 1.5, 0, TAU); context.fill();
      if (this.state === 'climb') {
        context.strokeStyle = 'rgba(255, 219, 153, .8)'; context.lineWidth = 1; context.beginPath(); context.arc(-23, -36 - Math.sin(elapsed * 2) * 2, 6, 0, TAU); context.stroke();
      }
    }
  }

  class Lion extends Animal { constructor(id, x, y) { super('lion', id, x, y, .95); } }
  class Elephant extends Animal { constructor(id, x, y) { super('elephant', id, x, y, 1.03); } }
  class Leopard extends Animal { constructor(id, x, y) { super('leopard', id, x, y, .86); } }

  class Ecosystem {
    constructor() {
      this.animals = [
        new Lion(0, 138, 369), new Lion(1, 211, 380),
        new Elephant(2, 390, 405), new Elephant(3, 472, 396),
        new Leopard(4, 628, 347), new Leopard(5, 744, 356)
      ];
      this.season = new SeasonManager();
      this.weather = new WeatherManager();
      this.elapsed = 0;
      this.dayPhase = .18;
      this.noteText = 'A quiet crossing at first light';
      this.noteTimer = 0;
    }

    note(text) { this.noteText = text; this.noteTimer = 4.2; }

    update(dt) {
      this.elapsed += dt;
      this.dayPhase = (this.dayPhase + dt / 42) % 1;
      this.season.update(dt);
      const env = { animals: this.animals, season: this.season, weather: this.weather, daylight: this.daylight, note: text => this.note(text) };
      this.animals.forEach(animal => animal.update(dt, env));
      this.weather.update(dt, env);
      if (this.noteTimer > 0) this.noteTimer -= dt;
      else this.noteText = this.weather.current === 'tornado' ? 'A slow spiral follows the nearest traveler' : this.season.target === 1 ? 'The wet season wakes every trail' : 'A quiet crossing at first light';
      return env;
    }

    get daylight() {
      return clamp((Math.sin(this.dayPhase * TAU) + .1) / 1.1);
    }

    draw(context) {
      const palette = this.season.palette;
      const daylight = this.daylight;
      const night = 1 - daylight;
      context.clearRect(0, 0, WORLD_W, WORLD_H);
      const sky = context.createLinearGradient(0, 0, 0, 420);
      sky.addColorStop(0, cssRgb(palette.skyTop));
      sky.addColorStop(1, cssRgb(palette.skyBottom));
      context.fillStyle = sky;
      context.fillRect(0, 0, WORLD_W, 430);
      this.drawCelestial(context, palette, daylight, night);
      this.drawClouds(context, palette);
      this.drawMountains(context, palette);
      this.drawGround(context, palette);
      this.drawTrees(context, palette);
      this.weather.draw(context, this.elapsed, palette);
      this.animals.forEach(animal => animal.draw(context, this.elapsed));
      this.drawForegroundGrass(context, palette);
      if (night > .44) this.drawNightVeil(context, night);
    }

    drawCelestial(context, palette, daylight, night) {
      const angle = this.dayPhase * TAU;
      const x = 480 + Math.cos(angle) * 330;
      const y = 235 - Math.sin(angle) * 178;
      context.save();
      context.globalAlpha = .3 + daylight * .7;
      const glow = context.createRadialGradient(x, y, 3, x, y, 80);
      glow.addColorStop(0, rgba('#fff2b5', .8));
      glow.addColorStop(1, rgba('#fff2b5', 0));
      context.fillStyle = glow;
      context.fillRect(x - 84, y - 84, 168, 168);
      context.fillStyle = '#ffe4a4';
      context.beginPath(); context.arc(x, y, 25, 0, TAU); context.fill();
      context.restore();
      if (night > .3) {
        context.save();
        context.globalAlpha = night * .8;
        context.fillStyle = '#e5edda';
        context.beginPath(); context.arc(785, 94, 18, 0, TAU); context.fill();
        context.fillStyle = cssRgb(palette.skyTop);
        context.beginPath(); context.arc(793, 87, 18, 0, TAU); context.fill();
        for (let i = 0; i < 26; i++) {
          const sx = (i * 97) % WORLD_W;
          const sy = 48 + ((i * 47) % 160);
          context.fillStyle = rgba('#fff3c6', .25 + (i % 3) * .15);
          context.fillRect(sx, sy, 2, 2);
        }
        context.restore();
      }
    }

    drawClouds(context, palette) {
      context.save();
      context.globalAlpha = this.season.target === 1 ? .65 : .48;
      for (let i = 0; i < 4; i++) {
        const x = ((this.elapsed * (5 + i * 1.2) + i * 270) % 1150) - 95;
        const y = 98 + (i % 2) * 44;
        context.fillStyle = cssRgb(palette.cloud);
        context.beginPath();
        context.ellipse(x, y, 78, 18, 0, 0, TAU);
        context.ellipse(x + 48, y - 8, 46, 22, 0, 0, TAU);
        context.ellipse(x - 44, y + 2, 39, 14, 0, 0, TAU);
        context.fill();
      }
      context.restore();
    }

    drawMountains(context, palette) {
      context.fillStyle = cssRgb(palette.distant, .85);
      context.beginPath();
      context.moveTo(0, 340);
      for (let x = 0; x <= WORLD_W; x += 80) context.lineTo(x, 300 - Math.sin(x * .014) * 42 - (x % 240 === 0 ? 32 : 0));
      context.lineTo(WORLD_W, 430); context.lineTo(0, 430); context.closePath(); context.fill();
      context.fillStyle = cssRgb(mixRgb(palette.distant, palette.groundTop, .25), .9);
      context.beginPath();
      context.moveTo(0, 378); context.lineTo(155, 295); context.lineTo(275, 377); context.lineTo(430, 277); context.lineTo(574, 383); context.lineTo(754, 306); context.lineTo(960, 388); context.lineTo(960, 438); context.lineTo(0, 438); context.closePath(); context.fill();
    }

    drawGround(context, palette) {
      const ground = context.createLinearGradient(0, 400, 0, WORLD_H);
      ground.addColorStop(0, cssRgb(palette.groundTop));
      ground.addColorStop(1, cssRgb(palette.groundBottom));
      context.fillStyle = ground;
      context.fillRect(0, 390, WORLD_W, 210);
      context.fillStyle = cssRgb(palette.water, .78);
      context.beginPath(); context.ellipse(245, 437, 91, 18, -.08, 0, TAU); context.fill();
      context.strokeStyle = 'rgba(223, 240, 202, .46)'; context.lineWidth = 2;
      for (let i = 0; i < 4; i++) { context.beginPath(); context.ellipse(186 + i * 33, 435 + (i % 2) * 4, 17, 3, 0, 0, TAU); context.stroke(); }
    }

    drawTrees(context, palette) {
      this.drawAcacia(context, 92, 365, 1.25, palette);
      this.drawAcacia(context, 864, 370, 1, palette);
      this.drawAcacia(context, 550, 350, .62, palette);
    }

    drawAcacia(context, x, y, scale, palette) {
      context.save(); context.translate(x, y); context.scale(scale, scale);
      context.strokeStyle = '#5c4838'; context.lineWidth = 10; context.lineCap = 'round';
      context.beginPath(); context.moveTo(0, 0); context.quadraticCurveTo(-8, -76, 9, -132); context.stroke();
      context.lineWidth = 4; context.beginPath(); context.moveTo(6, -86); context.lineTo(-35, -123); context.moveTo(8, -92); context.lineTo(39, -126); context.stroke();
      context.fillStyle = cssRgb(palette.grass, .95);
      context.beginPath(); context.ellipse(-30, -133, 55, 17, -.08, 0, TAU); context.ellipse(38, -136, 48, 16, .05, 0, TAU); context.fill();
      context.fillStyle = 'rgba(42, 55, 38, .28)'; context.beginPath(); context.ellipse(0, -128, 80, 9, 0, 0, TAU); context.fill();
      context.restore();
    }

    drawForegroundGrass(context, palette) {
      context.save(); context.strokeStyle = cssRgb(mixRgb(palette.grass, palette.groundBottom, .35), .85); context.lineWidth = 2; context.lineCap = 'round';
      for (let i = 0; i < 100; i++) {
        const x = (i * 73) % WORLD_W;
        const y = 465 + ((i * 31) % 115);
        const height = 8 + (i % 7) * 2;
        context.beginPath(); context.moveTo(x, y); context.quadraticCurveTo(x + Math.sin(this.elapsed * .7 + i) * 4, y - height * .5, x + (i % 2 ? -4 : 4), y - height); context.stroke();
      }
      context.restore();
    }

    drawNightVeil(context, night) {
      context.save(); context.globalAlpha = (night - .44) * .22; context.fillStyle = '#112631'; context.fillRect(0, 0, WORLD_W, WORLD_H); context.restore();
    }
  }

  const ecosystem = new Ecosystem();
  const view = { width: 1, height: 1, dpr: 1 };

  function resize() {
    view.width = canvas.clientWidth || 320;
    view.height = canvas.clientHeight || 200;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
  }
  function render() {
    const sx = view.width / WORLD_W;
    const sy = view.height / WORLD_H;
    ctx.setTransform(sx * view.dpr, 0, 0, sy * view.dpr, 0, 0);
    ecosystem.draw(ctx);
  }
  function updateHud() {
    const palette = ecosystem.season.palette;
    document.querySelector('#season-name').textContent = palette.name;
    document.querySelector('.season-mark').style.backgroundColor = palette.mark;
    document.querySelector('#weather-name').textContent = WEATHER[ecosystem.weather.current].label;
    document.querySelector('#particle-count').textContent = String(ecosystem.weather.pool.active.length).padStart(2, '0');
    document.querySelector('#event-note').textContent = ecosystem.noteText;
    document.querySelectorAll('.weather-button').forEach(button => button.classList.toggle('active', button.dataset.weather === ecosystem.weather.current));
  }

  document.querySelectorAll('.weather-button').forEach(button => {
    button.addEventListener('click', () => {
      ecosystem.weather.set(button.dataset.weather);
      ecosystem.note(`The field shifts into ${WEATHER[button.dataset.weather].label.toLowerCase()}`);
      updateHud();
    });
  });
  document.querySelector('#season-toggle').addEventListener('click', () => {
    ecosystem.season.set(ecosystem.season.target + 1);
    ecosystem.note(ecosystem.season.target ? 'Wet season gathers across the grass' : 'Dry season returns to the ridge');
    updateHud();
  });
  window.addEventListener('keydown', event => {
    if (/^[1-6]$/.test(event.key)) document.querySelector(`[data-weather="${Object.keys(WEATHER)[Number(event.key) - 1]}"]`).click();
    if (event.key.toLowerCase() === 's') document.querySelector('#season-toggle').click();
  });
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    ecosystem.update(dt || 0);
    render();
    updateHud();
  }
  requestAnimationFrame(frame);
})();
