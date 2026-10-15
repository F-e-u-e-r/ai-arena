(() => {
  'use strict';

  const canvas = document.getElementById('savannah');
  const ctx = canvas.getContext('2d', { alpha: false });
  const weatherCaption = document.getElementById('weather-caption');
  const seasonReadout = document.getElementById('season-readout');
  const seasonButtonLabel = document.getElementById('season-button-label');
  const weatherButtons = [...document.querySelectorAll('[data-weather]')];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const hexRgb = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
  const rgbCss = (rgb) => `rgb(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0})`;
  const rgba = (rgb, alpha) => `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${alpha})`;

  const WEATHER = {
    sunny: { label: 'GOLDEN HOUR · OPEN PLAINS', sky: '#f2bd72', horizon: '#f2dda7', field: '#bd8c43', far: '#927247', rain: 0, speed: 1.04 },
    rain: { label: 'SOFT RAIN · WATER RETURNS', sky: '#7a9990', horizon: '#b9bc91', field: '#8f884d', far: '#777b56', rain: 150, speed: .93 },
    heavyRain: { label: 'MONSOON · SHELTERING HERDS', sky: '#475e65', horizon: '#7c8879', field: '#77784d', far: '#626e58', rain: 440, speed: .76 },
    snow: { label: 'RARE HAIL · COOL DRY SEASON', sky: '#a9cbd1', horizon: '#e1dec0', field: '#a9a879', far: '#8d9a80', rain: 85, speed: .86 },
    thunderstorm: { label: 'THUNDERHEADS · SAFE DISTANCE', sky: '#2d4052', horizon: '#657579', field: '#69724c', far: '#4e6257', rain: 310, speed: .78 },
    tornado: { label: 'DUST DEVIL · TRACKING THE HERD', sky: '#ae8052', horizon: '#d3a35f', field: '#a47b3f', far: '#80643d', rain: 0, speed: .84 }
  };

  const SEASON_COLORS = {
    dry: { sky: '#f2bd72', horizon: '#f2dda7', field: '#bd8c43', far: '#927247' },
    wet: { sky: '#91c6b7', horizon: '#d5d998', field: '#71954f', far: '#617b50' }
  };

  const WEATHER_ORDER = ['sunny', 'rain', 'heavyRain', 'snow', 'thunderstorm', 'tornado'];

  class SeasonManager {
    constructor(onChange) {
      this.current = 'dry';
      this.elapsed = 0;
      this.duration = 60;
      this.onChange = onChange;
    }
    update(dt) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.elapsed %= this.duration;
        this.toggle(true);
      }
    }
    toggle(fromClock = false) {
      this.current = this.current === 'dry' ? 'wet' : 'dry';
      if (!fromClock) this.elapsed = 0;
      this.onChange?.(this.current);
    }
    get activity() { return this.current === 'wet' ? 1.16 : .91; }
    get clusterFactor() { return this.current === 'dry' ? .78 : 1.14; }
  }

  // Particles are recycled through a fixed-capacity pool. Weather changes return every
  // active particle before starting the next emitter, so an old storm cannot accumulate.
  class ParticleSystem {
    constructor(capacity = 1100) {
      this.capacity = capacity;
      this.free = [];
      this.active = [];
      for (let i = 0; i < capacity; i++) this.free.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, kind: '', spin: 0 });
    }
    emit(kind, x, y, vx, vy, life, size, spin = 0) {
      const p = this.free.pop();
      if (!p) return false;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.maxLife = life; p.size = size; p.kind = kind; p.spin = spin;
      this.active.push(p);
      return true;
    }
    update(dt, width, height) {
      for (let i = this.active.length - 1; i >= 0; i--) {
        const p = this.active[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'snow') p.vx += Math.sin((p.maxLife - p.life) * 2.2 + p.spin) * 5 * dt;
        if (p.kind === 'dust') { p.vx *= 1 - dt * .32; p.vy -= 7 * dt; }
        if (p.life <= 0 || p.y > height + 35 || p.x < -60 || p.x > width + 60) {
          this.active[i] = this.active[this.active.length - 1];
          this.active.pop();
          this.free.push(p);
        }
      }
    }
    clear() {
      for (let i = this.active.length - 1; i >= 0; i--) this.free.push(this.active[i]);
      this.active.length = 0;
    }
    draw(ctx) {
      for (const p of this.active) {
        const alpha = clamp(p.life / Math.min(p.maxLife, .35), 0, 1) * .72;
        if (p.kind === 'rain') {
          ctx.strokeStyle = `rgba(209, 235, 229, ${alpha * .55})`;
          ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 5, p.y + 13); ctx.stroke();
        } else if (p.kind === 'snow') {
          ctx.fillStyle = `rgba(255, 255, 244, ${alpha})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = `rgba(205, 151, 76, ${alpha * .5})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    get count() { return this.active.length; }
  }

  class Animal {
    constructor(x, baseline, scale = 1) {
      this.x = x;
      this.baseline = baseline;
      this.scale = scale;
      this.phase = rand(0, Math.PI * 2);
      this.state = 'walk';
      this.stateTime = rand(2, 6);
      this.baseSpeed = 40;
      this.bodyWidth = 86;
      this.bodyHeight = 56;
      this.mood = 'calm';
    }
    get width() { return this.bodyWidth * this.scale; }
    update(dt, world) {
      this.phase += dt * (this.state === 'rest' ? .7 : 5.2);
      this.stateTime -= dt;
      this.advanceState(dt, world);
      const speed = this.currentSpeed(world) + world.wildlife.groupAdjustment(this, world);
      this.x += speed * dt;
      if (this.x > world.width + this.width) this.x = -this.width - rand(8, 35);
      this.baseline = world.groundY + this.depthOffset;
    }
    advanceState() {}
    currentSpeed(world) { return this.baseSpeed * world.season.activity * world.weather.speed; }
    get depthOffset() { return 0; }
    draw(ctx, world) { this.drawAnimal(ctx, world); }
    drawAnimal() {}
    leg(ctx, x, y, swing, color, width = 5) {
      ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + swing * .55, y + 12); ctx.lineTo(x + swing, y + 25); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(x + swing - width * .45, y + 22, width * .9, 4);
    }
  }

  class Lion extends Animal {
    constructor(x, baseline, member = 0) {
      super(x, baseline, 1);
      this.member = member;
      this.baseSpeed = 37;
      this.bodyWidth = 88;
      this.bodyHeight = 63;
      this.state = 'patrol';
      this.stateTime = rand(8, 15);
    }
    advanceState(dt, world) {
      if (this.stateTime <= 0) {
        const restChance = world.season.current === 'dry' ? .56 : .28;
        this.state = this.state === 'rest' ? 'patrol' : (Math.random() < restChance ? 'rest' : 'patrol');
        this.stateTime = this.state === 'rest' ? rand(2.5, 5) : rand(8, 16) / world.season.activity;
        this.mood = this.state === 'rest' ? 'resting' : 'patrol';
      }
    }
    currentSpeed(world) {
      return this.baseSpeed * world.season.activity * world.weather.speed * (this.state === 'rest' ? .22 : 1);
    }
    get depthOffset() { return 0; }
    drawAnimal(ctx, world) {
      const s = this.scale, gait = this.state === 'rest' ? Math.sin(this.phase) * 1.3 : Math.sin(this.phase) * 7;
      ctx.save(); ctx.translate(this.x, this.baseline); ctx.scale(s, s);
      // Fine tail and paws keep the silhouette readable at thumbnail scale.
      ctx.strokeStyle = '#80502d'; ctx.lineWidth = 3.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-36, -26); ctx.quadraticCurveTo(-54, -39 + Math.sin(this.phase * .4) * 4, -58, -19); ctx.stroke();
      ctx.fillStyle = '#553c2b'; ctx.beginPath(); ctx.arc(-58, -18, 4, 0, Math.PI * 2); ctx.fill();
      this.leg(ctx, -27, -19, gait, '#a86e39', 6); this.leg(ctx, -15, -17, -gait, '#bd8044', 6);
      this.leg(ctx, 17, -20, -gait, '#c68b4d', 6); this.leg(ctx, 28, -18, gait, '#ad713b', 6);
      ctx.fillStyle = '#d49a54'; ctx.beginPath(); ctx.ellipse(-1, -32, 37, 19, -.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0ad68'; ctx.beginPath(); ctx.ellipse(17, -40, 14, 11, -.18, 0, Math.PI * 2); ctx.fill();
      // Layered mane with scalloped edge, warm shadow and cheek highlights.
      ctx.fillStyle = '#75432c'; ctx.beginPath(); ctx.ellipse(18, -45, 26, 25, -.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9a5630'; ctx.beginPath(); ctx.ellipse(18, -47, 22, 22, -.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b76e3a';
      for (let i = 0; i < 7; i++) { const a = -2.8 + i * .47; ctx.beginPath(); ctx.arc(18 + Math.cos(a) * 20, -46 + Math.sin(a) * 20, 6, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#d59a56'; ctx.beginPath(); ctx.ellipse(34, -44, 12, 10, -.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ead0a0'; ctx.beginPath(); ctx.ellipse(40, -39, 7, 4.3, -.13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4d3529'; ctx.beginPath(); ctx.arc(37, -47, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(46, -40, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7b472c'; ctx.beginPath(); ctx.arc(26, -60, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  class Elephant extends Animal {
    constructor(x, baseline, member = 0) {
      super(x, baseline, 1.1);
      this.member = member;
      this.baseSpeed = 29;
      this.bodyWidth = 112;
      this.bodyHeight = 79;
      this.state = 'walk';
      this.stateTime = rand(10, 17);
      this.trunkLift = 0;
    }
    advanceState(dt, world) {
      if (this.stateTime <= 0) {
        const dry = world.season.current === 'dry';
        this.state = this.state === 'drink' ? 'walk' : (Math.random() < (dry ? .72 : .42) ? 'drink' : 'walk');
        this.stateTime = this.state === 'drink' ? rand(3.2, 6) : rand(dry ? 8 : 15, dry ? 14 : 25);
        this.mood = this.state === 'drink' ? 'at water' : 'travelling';
      }
      this.trunkLift = this.state === 'drink' ? .5 + .5 * Math.sin(this.phase * .9) : Math.max(0, Math.sin(this.phase * .35) * .22);
    }
    currentSpeed(world) { return this.baseSpeed * world.season.activity * world.weather.speed * (this.state === 'drink' ? .13 : 1); }
    get depthOffset() { return 22; }
    drawAnimal(ctx, world) {
      const s = this.scale, gait = this.state === 'drink' ? 1 : Math.sin(this.phase) * 5;
      const trunkLift = this.trunkLift;
      ctx.save(); ctx.translate(this.x, this.baseline); ctx.scale(s, s);
      ctx.strokeStyle = '#65716b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-41, -38); ctx.quadraticCurveTo(-54, -38 + Math.sin(this.phase * .35) * 3, -57, -28); ctx.stroke();
      this.leg(ctx, -31, -21, gait, '#7f8980', 8); this.leg(ctx, -15, -19, -gait, '#929b8e', 8);
      this.leg(ctx, 20, -21, -gait, '#93998c', 8); this.leg(ctx, 34, -20, gait, '#7c8780', 8);
      ctx.fillStyle = '#8b968d'; ctx.beginPath(); ctx.ellipse(-2, -48, 44, 32, -.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a0a69a'; ctx.beginPath(); ctx.ellipse(-34, -55, 14, 22, -.28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(225, 219, 189, .4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(-34, -55, 10, -.5, 1.15); ctx.stroke();
      ctx.fillStyle = '#89948b'; ctx.beginPath(); ctx.ellipse(32, -58, 19, 20, -.12, 0, Math.PI * 2); ctx.fill();
      // The trunk curls up to drink and relaxes toward the dust while travelling.
      ctx.strokeStyle = '#707d75'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(42, -52); ctx.bezierCurveTo(53, -49, 53 + trunkLift * 15, -34 - trunkLift * 9, 47 + trunkLift * 24, -28 - trunkLift * 26); ctx.stroke();
      ctx.strokeStyle = '#b5b3a3'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(46, -31); ctx.lineTo(48 + trunkLift * 20, -28 - trunkLift * 24); ctx.stroke();
      ctx.fillStyle = '#e7d8b1'; ctx.beginPath(); ctx.moveTo(42, -47); ctx.quadraticCurveTo(55, -46, 52, -36); ctx.quadraticCurveTo(48, -39, 43, -40); ctx.fill();
      ctx.fillStyle = '#353d37'; ctx.beginPath(); ctx.arc(37, -61, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(78, 90, 82, .38)'; ctx.beginPath(); ctx.ellipse(-6, -21, 28, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  class Leopard extends Animal {
    constructor(x, baseline, member = 0) {
      super(x, baseline, .93);
      this.member = member;
      this.baseSpeed = 67;
      this.bodyWidth = 78;
      this.bodyHeight = 50;
      this.state = 'sneak';
      this.stateTime = rand(7, 13);
      this.climbProgress = 0;
      this.climbCooldown = member ? 15 : 4;
      this.spots = [];
      let seed = 410 + member * 83;
      for (let i = 0; i < 27; i++) {
        seed = (seed * 16807) % 2147483647;
        const x = -26 + (seed % 560) / 10;
        seed = (seed * 16807) % 2147483647;
        const y = -32 + (seed % 180) / 10;
        this.spots.push([x, y, 1.2 + (seed % 10) / 10]);
      }
    }
    advanceState(dt, world) {
      this.climbCooldown -= dt;
      if (this.state === 'climb') {
        const t = clamp((5.4 - this.stateTime) / 5.4, 0, 1);
        this.climbProgress = Math.sin(t * Math.PI);
        if (this.stateTime <= 0) { this.state = 'dash'; this.stateTime = 2.3; this.climbProgress = 0; this.climbCooldown = 24; }
        return;
      }
      if (this.stateTime <= 0) {
        if (this.state === 'dash') {
          this.state = 'sneak';
          this.stateTime = rand(world.season.current === 'wet' ? 5 : 9, world.season.current === 'wet' ? 10 : 16);
        } else {
          this.state = 'dash'; this.stateTime = rand(2, 3.8);
        }
      }
      const treeX = world.width * .77;
      if (this.climbCooldown <= 0 && this.x > treeX - 2 && this.x < treeX + 35) {
        this.state = 'climb'; this.stateTime = 5.4; this.climbProgress = 0; this.mood = 'climbing';
      }
    }
    currentSpeed(world) {
      if (this.state === 'climb') return 0;
      const dash = this.state === 'dash' ? 1.8 : .72;
      return this.baseSpeed * dash * world.season.activity * world.weather.speed;
    }
    get depthOffset() { return -12 - this.climbProgress * 72; }
    drawAnimal(ctx, world) {
      const s = this.scale, gait = Math.sin(this.phase * (this.state === 'dash' ? 1.8 : 1)) * (this.state === 'climb' ? 3 : 7);
      ctx.save(); ctx.translate(this.x, this.baseline); ctx.scale(s, s);
      ctx.strokeStyle = '#bd8a3c'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-35, -31); ctx.bezierCurveTo(-55, -46 + Math.sin(this.phase * .5) * 5, -61, -17, -67, -34 + Math.sin(this.phase * .45) * 5); ctx.stroke();
      this.leg(ctx, -24, -18, gait, '#bd8439', 4.5); this.leg(ctx, -8, -17, -gait, '#d7a44f', 4.5);
      this.leg(ctx, 14, -17, -gait, '#d6a34e', 4.5); this.leg(ctx, 26, -19, gait, '#bf873d', 4.5);
      ctx.fillStyle = '#d7a44e'; ctx.beginPath(); ctx.ellipse(-2, -30, 34, 13, -.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e4b862'; ctx.beginPath(); ctx.ellipse(27, -38, 11, 9, -.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d39b45'; ctx.beginPath(); ctx.arc(25, -47, 3.5, 0, Math.PI * 2); ctx.arc(34, -46, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0d29a'; ctx.beginPath(); ctx.ellipse(35, -34, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#382e25'; ctx.beginPath(); ctx.arc(32, -39, 1.4, 0, Math.PI * 2); ctx.fill();
      for (const [x, y, r] of this.spots) {
        ctx.fillStyle = 'rgba(65, 47, 31, .78)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#f2d79f'; ctx.beginPath(); ctx.ellipse(-4, -21, 21, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  class WildlifeSystem {
    constructor() {
      this.animals = [];
      this.resetForSize(1050, 500);
    }
    resetForSize(width, height) {
      // Re-layout only on a real viewport resize; season/weather changes never touch positions.
      if (this.animals.length) {
        const oldWidth = this.width || width;
        const ratio = width / oldWidth;
        for (const animal of this.animals) animal.x *= ratio;
      } else {
        this.animals = [
          new Lion(width * .09, height * .76, 0), new Lion(width * .20, height * .76, 1),
          new Elephant(width * .39, height * .76, 0), new Elephant(width * .54, height * .76, 1),
          new Leopard(width * .65, height * .76, 0), new Leopard(width * .88, height * .76, 1)
        ];
      }
      this.width = width; this.height = height;
    }
    update(dt, world) { for (const animal of this.animals) animal.update(dt, world); }
    groupAdjustment(animal, world) {
      if (animal.member !== 1 || animal.state === 'rest' || animal.state === 'drink' || animal.state === 'climb') return 0;
      const leader = this.animals.find(other => other.constructor === animal.constructor && other.member === 0);
      if (!leader) return 0;
      let separation = animal.x - leader.x;
      if (separation < -world.width * .5) separation += world.width;
      if (separation > world.width * .5) separation -= world.width;
      const desired = (animal instanceof Elephant ? 118 : 105) * world.season.clusterFactor;
      // The trailing herd member gently closes or widens the gap as season changes.
      return clamp((separation - desired) * .22, -10, 10);
    }
    draw(ctx, world) {
      for (const animal of this.animals) animal.draw(ctx, world);
    }
  }

  class WeatherManager {
    constructor(particles) {
      this.current = 'sunny';
      this.particles = particles;
      this.emission = 0;
      this.lightningTimer = 4;
      this.lightning = null;
      this.tornadoX = 0;
      this.tornadoY = 0;
      this.tornadoReady = false;
      this.wetness = 0;
      this.wind = 0;
    }
    get speed() { return WEATHER[this.current].speed; }
    setWeather(weather) {
      if (!WEATHER[weather] || weather === this.current) return;
      this.current = weather;
      this.particles.clear();
      this.emission = 0;
      this.lightning = null;
      this.lightningTimer = rand(2.5, 5.5);
      this.wetness = weather === 'rain' || weather === 'heavyRain' || weather === 'thunderstorm' ? this.wetness : this.wetness * .45;
      this.tornadoReady = false;
    }
    update(dt, world) {
      const def = WEATHER[this.current];
      this.wind = this.current === 'tornado' ? 24 : (this.current === 'thunderstorm' ? 15 : this.current === 'heavyRain' ? 10 : 3);
      const rainRate = def.rain * (world.season.current === 'wet' && this.current === 'snow' ? .62 : 1);
      this.emission += rainRate * dt;
      while (this.emission >= 1) {
        this.emission -= 1;
        const isSnow = this.current === 'snow';
        const kind = isSnow ? 'snow' : 'rain';
        this.particles.emit(kind, rand(-10, world.width + 10), rand(-35, 10),
          (isSnow ? rand(-11, 11) : -this.wind - 16), isSnow ? rand(28, 75) : rand(370, 570),
          isSnow ? rand(4, 9) : rand(.65, 1.25), isSnow ? rand(1, 2.6) : rand(.7, 1.6), rand(0, 10));
      }
      if (this.current === 'tornado') {
        this.updateTornado(dt, world);
        this.emission += 18 * dt;
        while (this.emission >= 1) {
          this.emission -= 1;
          this.particles.emit('dust', this.tornadoX + rand(-17, 17), this.tornadoY - rand(0, 65), rand(-38, 38), rand(-35, 14), rand(1.2, 2.5), rand(2, 5), rand(0, 6));
        }
      }
      this.particles.update(dt, world.width, world.height);
      const targetWetness = this.current === 'rain' || this.current === 'heavyRain' || this.current === 'thunderstorm' ? 1 : (world.season.current === 'wet' ? .36 : 0);
      this.wetness += (targetWetness - this.wetness) * Math.min(1, dt * .22);
      if (this.current === 'thunderstorm') {
        this.lightningTimer -= dt;
        if (this.lightning) {
          this.lightning.life -= dt;
          if (this.lightning.life <= 0) this.lightning = null;
        }
        if (this.lightningTimer <= 0) {
          this.lightningTimer = rand(3.2, 7.2);
          const safeX = this.findSafeStrike(world.animals, world.width);
          if (safeX >= 0) this.lightning = { x: safeX, life: .28, maxLife: .28, wobble: rand(0, 100) };
        }
      } else this.lightning = null;
    }
    updateTornado(dt, world) {
      if (!this.tornadoReady) {
        this.tornadoX = world.width * .74; this.tornadoY = world.groundY - 8; this.tornadoReady = true;
      }
      let nearest = null, best = Infinity;
      for (const animal of world.animals) {
        const distance = Math.abs(animal.x - this.tornadoX);
        if (distance < best) { best = distance; nearest = animal; }
      }
      if (nearest) {
        // It follows the nearest moving animal, but this capped speed keeps it a slow chase.
        const dx = nearest.x - this.tornadoX;
        this.tornadoX += Math.sign(dx) * Math.min(Math.abs(dx), 16 * dt);
      }
      this.tornadoY = world.groundY - 5;
    }
    findSafeStrike(animals, width) {
      // Test candidate ground coordinates against every live animal. The bolt is omitted if
      // no point clears each body's width plus a generous 64-unit safety radius.
      let bestX = -1, bestClearance = -Infinity;
      for (let i = 0; i < 48; i++) {
        const x = width * (.035 + .93 * ((i + Math.random() * .65) / 48));
        let clearance = Infinity;
        for (const animal of animals) clearance = Math.min(clearance, Math.abs(animal.x - x) - animal.width * .62);
        if (clearance > bestClearance) { bestClearance = clearance; bestX = x; }
      }
      return bestClearance >= 64 ? bestX : -1;
    }
    isStrikeSafe(x, animals) {
      for (const animal of animals) if (Math.abs(animal.x - x) <= animal.width * .62 + 64) return false;
      return true;
    }
    drawLightning(ctx, world) {
      if (!this.lightning) return;
      let x = this.lightning.x;
      if (!this.isStrikeSafe(x, world.animals)) x = this.findSafeStrike(world.animals, world.width);
      if (x < 0) return;
      const alpha = clamp(this.lightning.life / .28, 0, 1);
      // Flash and bolt are drawn before wildlife, in the sky layer, and revalidated every frame.
      ctx.fillStyle = `rgba(223, 239, 231, ${alpha * .105})`;
      ctx.fillRect(0, 0, world.width, world.horizonY + 30);
      ctx.save(); ctx.strokeStyle = `rgba(255, 249, 218, ${alpha * .95})`; ctx.lineWidth = 3.5; ctx.shadowColor = '#d8f3ee'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(x, 0);
      let px = x, py = 0;
      for (let i = 1; i <= 7; i++) {
        py = world.horizonY * i / 7;
        px = x + Math.sin(i * 13.7 + this.lightning.wobble) * (i === 7 ? 8 : 15);
        ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.restore();
    }
    drawTornado(ctx, world, time) {
      if (this.current !== 'tornado' || !this.tornadoReady) return;
      const x = this.tornadoX, y = this.tornadoY;
      ctx.save();
      const spin = time * 3.4;
      for (let i = 0; i < 5; i++) {
        const t = i / 5, yy = y - 12 - t * 88;
        const wide = lerp(29, 6, t), offset = Math.sin(spin + i * 1.1) * (16 - t * 5);
        ctx.strokeStyle = `rgba(176, 133, 79, ${.18 + t * .1})`; ctx.lineWidth = 3 - t * 1.2;
        ctx.beginPath(); ctx.ellipse(x + offset, yy, wide, 4 + t * 2, 0, .1, Math.PI * 1.55); ctx.stroke();
      }
      const funnel = ctx.createLinearGradient(x - 25, y - 95, x + 22, y);
      funnel.addColorStop(0, 'rgba(177, 137, 86, .02)'); funnel.addColorStop(.62, 'rgba(150, 111, 64, .12)'); funnel.addColorStop(1, 'rgba(111, 83, 49, .22)');
      ctx.fillStyle = funnel; ctx.beginPath(); ctx.moveTo(x - 5, y - 92); ctx.quadraticCurveTo(x - 12, y - 40, x - 34, y); ctx.lineTo(x + 34, y); ctx.quadraticCurveTo(x + 11, y - 42, x + 6, y - 92); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  class SavannahRenderer {
    constructor(particles) {
      this.particles = particles;
      this.time = 0;
      this.clouds = [
        { x: .11, y: .14, size: 1 }, { x: .38, y: .22, size: .72 }, { x: .68, y: .12, size: 1.2 }, { x: .91, y: .27, size: .8 }
      ];
      this.palette = null;
      this.paletteKey = '';
      this.puddles = Array.from({ length: 7 }, (_, i) => ({ x: .16 + i * .127, y: .81 + (i % 3) * .045, w: .025 + (i % 2) * .012, h: .009 + (i % 3) * .002 }));
    }
    resize(width, height, dpr) {
      const scale = Math.min(width / 1000, height / 500, 1.35);
      const safeScale = Math.max(.16, scale);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      ctx.setTransform(dpr * safeScale, 0, 0, dpr * safeScale, 0, 0);
      return { width: width / safeScale, height: height / safeScale, scale: safeScale };
    }
    update(dt, world) {
      this.time += dt;
      for (const cloud of this.clouds) {
        cloud.x += dt * (cloud.size > 1 ? .004 : .007);
        if (cloud.x > 1.16) cloud.x = -.16;
      }
      const key = `${world.weather.current}-${world.season.current}`;
      if (key !== this.paletteKey) {
        this.paletteKey = key;
        this.targetPalette = this.makePalette(world.weather.current, world.season.current);
      }
      if (!this.palette) this.palette = this.targetPalette.map(rgb => rgb.slice());
      for (let i = 0; i < this.palette.length; i++) for (let c = 0; c < 3; c++) {
        this.palette[i][c] += (this.targetPalette[i][c] - this.palette[i][c]) * Math.min(1, dt * .6);
      }
    }
    makePalette(weather, season) {
      const def = WEATHER[weather], seasonal = SEASON_COLORS[season];
      const mix = (a, b, t) => { const aa = hexRgb(a), bb = hexRgb(b); return aa.map((v, i) => lerp(v, bb[i], t)); };
      const influence = weather === 'sunny' || weather === 'tornado' ? .24 : .13;
      return [
        mix(def.sky, seasonal.sky, influence),
        mix(def.horizon, seasonal.horizon, influence),
        mix(def.field, seasonal.field, season === 'wet' ? .3 : .11),
        mix(def.far, seasonal.far, .2)
      ];
    }
    draw(world, weather) {
      const W = world.width, H = world.height, horizon = world.horizonY;
      const top = this.palette[0], horizonColor = this.palette[1], field = this.palette[2], far = this.palette[3];
      const sky = ctx.createLinearGradient(0, 0, 0, horizon + 30);
      sky.addColorStop(0, rgbCss(top)); sky.addColorStop(1, rgbCss(horizonColor));
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      this.drawSun(W, H, horizon, weather.current);
      this.drawClouds(W, horizon, weather.current);
      this.drawDistantLandscape(W, H, horizon, far);
      this.drawGround(W, H, horizon, field, world);
      this.drawWaterhole(W, H, world);
      this.drawTrees(W, H, world);
      weather.drawLightning(ctx, world);
      weather.drawTornado(ctx, world, this.time);
      world.wildlife.draw(ctx, world);
      this.drawForegroundGrass(W, H, world);
      this.particles.draw(ctx);
      this.drawVignette(W, H);
    }
    drawSun(W, H, horizon, weather) {
      const storm = ['heavyRain', 'thunderstorm'].includes(weather);
      const x = W * .78, y = horizon * .35, r = Math.min(W, H) * .083;
      const glow = ctx.createRadialGradient(x, y, r * .12, x, y, r * 2.8);
      glow.addColorStop(0, storm ? 'rgba(232, 222, 180, .15)' : 'rgba(255, 221, 153, .29)');
      glow.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = storm ? 'rgba(232, 222, 192, .65)' : 'rgba(255, 225, 160, .95)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    drawClouds(W, horizon, weather) {
      const storm = weather === 'thunderstorm' || weather === 'heavyRain';
      for (const cloud of this.clouds) {
        const x = cloud.x * W, y = cloud.y * horizon, s = cloud.size * Math.min(W / 1050, 1.1);
        ctx.fillStyle = storm ? 'rgba(44, 57, 61, .49)' : 'rgba(255, 239, 204, .22)';
        ctx.beginPath();
        ctx.ellipse(x, y + 8 * s, 38 * s, 9 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 22 * s, y + 5 * s, 18 * s, 12 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 1 * s, y, 21 * s, 17 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 23 * s, y + 6 * s, 20 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (storm) {
        const shade = ctx.createLinearGradient(0, 0, 0, horizon * .6);
        shade.addColorStop(0, 'rgba(28, 40, 51, .25)'); shade.addColorStop(1, 'rgba(28, 40, 51, 0)');
        ctx.fillStyle = shade; ctx.fillRect(0, 0, W, horizon * .6);
      }
    }
    drawDistantLandscape(W, H, horizon, far) {
      ctx.fillStyle = rgba(far, .6); ctx.beginPath(); ctx.moveTo(0, horizon + 20);
      ctx.quadraticCurveTo(W * .16, horizon - 28, W * .31, horizon + 5);
      ctx.quadraticCurveTo(W * .48, horizon - 36, W * .66, horizon + 7);
      ctx.quadraticCurveTo(W * .81, horizon - 16, W, horizon + 9); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(82, 103, 61, .27)';
      ctx.beginPath(); ctx.moveTo(0, horizon + 38); ctx.quadraticCurveTo(W * .24, horizon + 4, W * .42, horizon + 32); ctx.quadraticCurveTo(W * .7, horizon - 2, W, horizon + 30); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    }
    drawGround(W, H, horizon, field, world) {
      const baseY = horizon + (H - horizon) * .24;
      world.groundY = baseY + (H - baseY) * .22;
      ctx.fillStyle = rgbCss(field); ctx.beginPath(); ctx.moveTo(0, baseY);
      ctx.bezierCurveTo(W * .24, baseY - 18, W * .54, baseY + 14, W, baseY - 3);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      const light = ctx.createLinearGradient(0, baseY, 0, H);
      light.addColorStop(0, 'rgba(230, 190, 103, .18)'); light.addColorStop(.45, 'rgba(100, 95, 50, .04)'); light.addColorStop(1, 'rgba(43, 56, 34, .23)');
      ctx.fillStyle = light; ctx.fillRect(0, baseY, W, H - baseY);
      ctx.fillStyle = rgba(field, .32);
      for (let i = 0; i < 9; i++) {
        const x = ((i * 137 + 44) % 997) / 997 * W, y = baseY + (i % 4) * 13 + 27;
        ctx.beginPath(); ctx.ellipse(x, y, 33 + (i % 3) * 11, 8, -.04, 0, Math.PI * 2); ctx.fill();
      }
      // Rain-darkened earth gradually gains a reflective sheen and small pools.
      if (world.weather.wetness > .02) {
        ctx.fillStyle = `rgba(32, 67, 63, ${world.weather.wetness * .12})`; ctx.fillRect(0, baseY + 20, W, H - baseY - 20);
        for (const p of this.puddles) {
          const x = p.x * W, y = (p.y * H) + 20;
          ctx.fillStyle = `rgba(74, 126, 119, ${world.weather.wetness * .33})`;
          ctx.beginPath(); ctx.ellipse(x, y, p.w * W, p.h * H * (1 + world.weather.wetness), -.04, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(217, 220, 178, ${world.weather.wetness * .18})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(x - 4, y - 1, p.w * W * .58, p.h * H * .5, -.04, 3.35, 5.4); ctx.stroke();
        }
      }
    }
    drawWaterhole(W, H, world) {
      const x = W * .88, y = world.groundY + 28, rx = Math.min(W * .075, 83), ry = Math.max(7, rx * .22);
      ctx.fillStyle = 'rgba(73, 75, 46, .21)'; ctx.beginPath(); ctx.ellipse(x, y + 5, rx * 1.2, ry * 1.55, -.04, 0, Math.PI * 2); ctx.fill();
      const water = ctx.createLinearGradient(x, y - ry, x, y + ry);
      water.addColorStop(0, world.season.current === 'wet' ? 'rgba(124, 169, 145, .91)' : 'rgba(96, 147, 139, .88)');
      water.addColorStop(1, 'rgba(49, 101, 100, .94)');
      ctx.fillStyle = water; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, -.03, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(239, 217, 156, .44)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x - 2, y - 1, rx * .68, ry * .58, -.03, 3.5, 5.9); ctx.stroke();
      ctx.fillStyle = 'rgba(235, 219, 170, .42)'; ctx.beginPath(); ctx.ellipse(x + rx * .35, y - 2, rx * .16, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawTrees(W, H, world) {
      const treeX = W * .77, ground = world.groundY - 8, scale = Math.min(W / 1050, 1.15);
      // The featured acacia provides a climb point for leopards; distant silhouettes add depth.
      this.drawAcacia(W * .17, ground - 38 * scale, .55 * scale, '#555a38', .61);
      this.drawAcacia(W * .58, ground - 28 * scale, .43 * scale, '#5c5b38', .48);
      this.drawAcacia(treeX, ground, 1.05 * scale, '#504b2e', .93);
      for (let i = 0; i < 4; i++) {
        const x = W * (.29 + i * .19), y = ground + 5 + i * 3;
        ctx.strokeStyle = 'rgba(95, 76, 40, .3)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 5, y - 9, x + 10, y); ctx.stroke();
      }
    }
    drawAcacia(x, ground, scale, color, alpha) {
      ctx.save(); ctx.translate(x, ground); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
      ctx.fillStyle = '#735b39'; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-1, -29, 0, -58); ctx.lineTo(5, -58); ctx.quadraticCurveTo(3, -20, 9, 0); ctx.fill();
      ctx.strokeStyle = '#735b39'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1, -48); ctx.lineTo(-22, -67); ctx.moveTo(2, -50); ctx.lineTo(27, -65); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, -71, 38, 12, 0, 0, Math.PI * 2); ctx.ellipse(-23, -70, 18, 8, -.05, 0, Math.PI * 2); ctx.ellipse(25, -69, 17, 8, .04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(223, 190, 111, .17)'; ctx.beginPath(); ctx.ellipse(-5, -75, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawForegroundGrass(W, H, world) {
      const ground = world.groundY + 65, wind = world.weather.wind;
      ctx.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        const x = (i * 97.31 + 13) % W, y = ground + (i % 4) * 17;
        const h = 7 + (i % 5) * 2.4, sway = Math.sin(this.time * 1.2 + i * 2.31) * (2 + wind * .11);
        ctx.strokeStyle = i % 4 === 0 ? 'rgba(55, 69, 39, .58)' : 'rgba(215, 183, 105, .55)'; ctx.lineWidth = i % 3 === 0 ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sway * .4, y - h * .62, x + sway, y - h); ctx.stroke();
      }
      // Subtle edge vignette frames the warm illustration without obscuring the animals.
      const shade = ctx.createLinearGradient(0, H * .75, 0, H);
      shade.addColorStop(0, 'rgba(35, 47, 35, 0)'); shade.addColorStop(1, 'rgba(35, 47, 35, .18)');
      ctx.fillStyle = shade; ctx.fillRect(0, H * .75, W, H * .25);
    }
    drawVignette(W, H) {
      const g = ctx.createRadialGradient(W * .5, H * .46, Math.min(W, H) * .2, W * .5, H * .46, Math.max(W, H) * .76);
      g.addColorStop(.55, 'rgba(36, 45, 34, 0)'); g.addColorStop(1, 'rgba(36, 45, 34, .17)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  class SavannahSimulation {
    constructor() {
      this.particles = new ParticleSystem();
      this.wildlife = new WildlifeSystem();
      this.season = new SeasonManager(() => this.syncSeasonUI());
      this.weather = new WeatherManager(this.particles);
      this.renderer = new SavannahRenderer(this.particles);
      this.viewport = { width: 1000, height: 500, scale: 1 };
      this.world = {
        width: 1000, height: 500, scale: 1, horizonY: 255, groundY: 0,
        season: this.season, weather: this.weather, wildlife: this.wildlife,
        animals: this.wildlife.animals
      };
      this.lastFrame = 0;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      this.onFrame = this.frame.bind(this);
      this.bindControls();
      this.syncSeasonUI();
      this.resize();
      requestAnimationFrame(this.onFrame);
    }
    resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.viewport = this.renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height), dpr);
      this.viewport.horizonY = this.viewport.height * .51;
      this.wildlife.resetForSize(this.viewport.width, this.viewport.height);
      this.world.width = this.viewport.width;
      this.world.height = this.viewport.height;
      this.world.scale = this.viewport.scale;
      this.world.horizonY = this.viewport.horizonY;
      for (const animal of this.wildlife.animals) animal.baseline = this.viewport.height * .76 + animal.depthOffset;
    }
    bindControls() {
      weatherButtons.forEach((button) => button.addEventListener('click', () => this.setWeather(button.dataset.weather)));
      document.getElementById('season-toggle').addEventListener('click', () => this.season.toggle());
      window.addEventListener('keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (/^[1-6]$/.test(event.key)) this.setWeather(WEATHER_ORDER[Number(event.key) - 1]);
        if (event.key.toLowerCase() === 's') this.season.toggle();
      });
    }
    setWeather(name) {
      this.weather.setWeather(name);
      weatherButtons.forEach((button) => {
        const active = button.dataset.weather === name;
        button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
      });
      weatherCaption.textContent = WEATHER[name].label;
    }
    syncSeasonUI() {
      const wet = this.season.current === 'wet';
      seasonReadout.textContent = wet ? 'WET SEASON' : 'DRY SEASON';
      seasonButtonLabel.textContent = wet ? 'WET' : 'DRY';
      const button = document.getElementById('season-toggle');
      button.setAttribute('aria-label', `Toggle season, current ${wet ? 'wet' : 'dry'} season`);
      button.setAttribute('aria-pressed', String(wet));
    }
    frame(now) {
      const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, .05) : 0;
      this.lastFrame = now;
      this.season.update(dt);
      const world = this.world;
      // Ground is initialized from the current viewport before animals and particles update.
      world.groundY = world.horizonY + (world.height - world.horizonY) * .24 + (world.height - (world.horizonY + (world.height - world.horizonY) * .24)) * .22;
      this.wildlife.update(dt, world);
      this.weather.update(dt, world);
      this.renderer.update(dt, world);
      this.renderer.draw(world, this.weather);
      requestAnimationFrame(this.onFrame);
    }
  }

  new SavannahSimulation();
})();
