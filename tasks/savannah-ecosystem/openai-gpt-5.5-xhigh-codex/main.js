const canvas = document.getElementById('savannah');
const ctx = canvas.getContext('2d');
const statusLabel = document.getElementById('status');
const debugLabel = document.getElementById('debug');
const seasonToggle = document.getElementById('seasonToggle');
const weatherButtons = [...document.querySelectorAll('[data-weather]')];

const WORLD_W = 1000;
const WORLD_H = 625;
const GROUND_Y = 392;
const TAU = Math.PI * 2;

const WEATHER_NAMES = {
  sunny: 'Sunny',
  rain: 'Rain',
  'heavy-rain': 'Heavy Rain',
  snow: 'Snow',
  thunderstorm: 'Thunderstorm',
  tornado: 'Tornado'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function mixColor(a, b, t, alpha = 1) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  return `rgba(${Math.round(lerp(ar[0], br[0], t))}, ${Math.round(lerp(ar[1], br[1], t))}, ${Math.round(lerp(ar[2], br[2], t))}, ${alpha})`;
}

class Stage {
  constructor(canvasElement, context) {
    this.canvas = canvasElement;
    this.ctx = context;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  beginFrame() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.scale(this.width / WORLD_W, this.height / WORLD_H);
  }

  endFrame() {
    this.ctx.restore();
  }
}

class SeasonManager {
  constructor() {
    this.current = 'dry';
    this.previous = 'dry';
    this.autoTimer = 0;
    this.transition = 1;
    this.duration = 60;
    this.transitionDuration = 3;
    this.palettes = {
      dry: {
        skyTop: 0xe9a85d,
        skyBottom: 0xf5d596,
        hills: 0xc88451,
        grass: 0xbda447,
        grassDark: 0x72672b,
        brightness: 0.94,
        speed: 0.88,
        grouping: 1.22
      },
      wet: {
        skyTop: 0x86cff5,
        skyBottom: 0xcff0c4,
        hills: 0x6aa789,
        grass: 0x45b96b,
        grassDark: 0x227246,
        brightness: 1.08,
        speed: 1.16,
        grouping: 0.86
      }
    };
  }

  toggle() {
    this.previous = this.current;
    this.current = this.current === 'dry' ? 'wet' : 'dry';
    this.autoTimer = 0;
    this.transition = 0;
    this.updateUi();
  }

  update(deltaTime) {
    this.autoTimer += deltaTime;
    if (this.autoTimer >= this.duration) this.toggle();
    // Season changes are palette and behavior blends, so animals keep their live positions and state.
    this.transition = Math.min(1, this.transition + deltaTime / this.transitionDuration);
  }

  values() {
    const a = this.palettes[this.previous];
    const b = this.palettes[this.current];
    const t = smoothstep(0, 1, this.transition);
    return { a, b, t };
  }

  speedFactor() {
    const { a, b, t } = this.values();
    return lerp(a.speed, b.speed, t);
  }

  groupingFactor() {
    const { a, b, t } = this.values();
    return lerp(a.grouping, b.grouping, t);
  }

  isWet() {
    return this.current === 'wet';
  }

  updateUi() {
    seasonToggle.textContent = this.current === 'dry' ? 'Wet Season' : 'Dry Season';
  }
}

class WeatherParticle {
  constructor() {
    this.active = false;
    this.kind = 'rain';
    this.weatherOwned = true;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 1;
    this.size = 1;
    this.alpha = 1;
    this.spin = 0;
    this.color = '#fff';
  }

  reset(kind, x, y, vx, vy, life, size, color, alpha = 1) {
    this.active = true;
    this.kind = kind;
    this.weatherOwned = true;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.alpha = alpha;
    this.color = color;
    this.spin = rand(0, TAU);
  }
}

class ParticlePool {
  constructor(size) {
    this.items = Array.from({ length: size }, () => new WeatherParticle());
    this.cursor = 0;
  }

  acquire() {
    for (let i = 0; i < this.items.length; i += 1) {
      const index = (this.cursor + i) % this.items.length;
      const particle = this.items[index];
      if (!particle.active) {
        this.cursor = (index + 1) % this.items.length;
        return particle;
      }
    }
    return null;
  }

  clearWeather() {
    for (const particle of this.items) {
      if (particle.weatherOwned) particle.active = false;
    }
  }

  get activeCount() {
    let count = 0;
    for (const particle of this.items) {
      if (particle.active) count += 1;
    }
    return count;
  }
}

class ParticleSystem {
  constructor() {
    this.pool = new ParticlePool(950);
    this.ground = GROUND_Y + 128;
  }

  emit(kind, x, y, vx, vy, life, size, color, alpha = 1) {
    const particle = this.pool.acquire();
    if (!particle) return null;
    particle.reset(kind, x, y, vx, vy, life, size, color, alpha);
    return particle;
  }

  clearWeather() {
    this.pool.clearWeather();
  }

  update(deltaTime) {
    for (const particle of this.pool.items) {
      if (!particle.active) continue;
      particle.life -= deltaTime;
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      particle.spin += deltaTime * 4;

      if (particle.kind === 'snow') {
        particle.x += Math.sin(particle.spin) * deltaTime * 14;
      }

      if ((particle.kind === 'rain' || particle.kind === 'heavy-rain') && particle.y > this.ground) {
        particle.active = false;
        if (Math.random() < 0.28) {
          this.emit('splash', particle.x, this.ground - 4, rand(-18, 18), rand(-36, -14), 0.32, rand(2, 4), '#ccefff', 0.55);
        }
        continue;
      }

      if (particle.y > WORLD_H + 60 || particle.y < -100 || particle.x < -120 || particle.x > WORLD_W + 120 || particle.life <= 0) {
        particle.active = false;
      }
    }
  }

  draw(context) {
    context.save();
    context.lineCap = 'round';
    for (const particle of this.pool.items) {
      if (!particle.active) continue;
      const lifeRatio = clamp(particle.life / particle.maxLife, 0, 1);
      context.globalAlpha = particle.alpha * lifeRatio;
      if (particle.kind === 'rain' || particle.kind === 'heavy-rain') {
        context.strokeStyle = particle.color;
        context.lineWidth = particle.kind === 'heavy-rain' ? 2.3 : 1.3;
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - particle.vx * 0.04, particle.y - particle.vy * 0.04);
        context.stroke();
      } else if (particle.kind === 'snow') {
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, TAU);
        context.fill();
      } else if (particle.kind === 'splash') {
        context.strokeStyle = particle.color;
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size * (1.4 - lifeRatio), Math.PI, TAU);
        context.stroke();
      } else {
        context.fillStyle = particle.color;
        context.beginPath();
        context.ellipse(particle.x, particle.y, particle.size * 1.7, particle.size, particle.spin, 0, TAU);
        context.fill();
      }
    }
    context.restore();
    context.globalAlpha = 1;
  }
}

class Animal {
  constructor(type, x, y, scale, offset) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.scale = scale;
    this.offset = offset;
    this.state = 'move';
    this.stateTimer = rand(2, 6);
    this.mood = 'calm';
    this.safeRadius = 44 * scale;
    this.climb = 0;
    this.step = 0;
    this.groupAnchor = 0;
  }

  baseSpeed() {
    if (this.type === 'elephant') return 18;
    if (this.type === 'lion') return 25;
    return 44;
  }

  chooseState(weather, season) {
    const wet = season.isWet();
    if (this.type === 'elephant') {
      if (weather === 'rain' || wet) this.state = Math.random() < 0.44 ? 'drink' : 'herd';
      else this.state = Math.random() < 0.23 ? 'trunk' : 'herd';
    } else if (this.type === 'lion') {
      if (weather === 'tornado' || weather === 'thunderstorm') this.state = 'patrol';
      else this.state = Math.random() < (wet ? 0.22 : 0.42) ? 'rest' : 'pack';
    } else {
      this.state = Math.random() < (wet ? 0.32 : 0.23) ? 'climb' : 'stealth';
    }
    this.stateTimer = rand(2.2, 7.5);
  }

  weatherFactor(weather) {
    if (weather === 'heavy-rain') return this.type === 'leopard' ? 0.76 : 0.68;
    if (weather === 'rain') return 0.86;
    if (weather === 'snow') return 0.72;
    if (weather === 'thunderstorm') return this.type === 'lion' ? 0.7 : 0.78;
    if (weather === 'tornado') return 1.12;
    return 1;
  }

  update(deltaTime, elapsedTime, season, weather) {
    this.stateTimer -= deltaTime;
    if (this.stateTimer <= 0) this.chooseState(weather, season);

    const grouping = season.groupingFactor();
    const seasonalSpeed = season.speedFactor();
    let stateFactor = 1;
    if (this.state === 'rest') stateFactor = 0.08;
    if (this.state === 'drink' || this.state === 'trunk') stateFactor = 0.35;
    if (this.state === 'climb') stateFactor = 0.18;
    if (this.state === 'stealth') stateFactor = 1.22;
    if (this.state === 'patrol') stateFactor = 0.65;

    const packOffset = Math.sin(elapsedTime * 0.35 + this.offset) * 12 * grouping;
    this.x += (this.baseSpeed() * seasonalSpeed * this.weatherFactor(weather) * stateFactor) * deltaTime;
    this.y += (this.baseY + packOffset - this.y) * Math.min(1, deltaTime * 1.6);
    this.step += deltaTime * (4 + this.baseSpeed() * 0.05) * Math.max(0.25, stateFactor);

    if (this.state === 'climb') {
      this.climb = Math.sin(elapsedTime * 2.4 + this.offset) * 42 - 28;
      this.mood = 'climb';
    } else if (weather === 'tornado') {
      this.climb += (0 - this.climb) * Math.min(1, deltaTime * 4);
      this.mood = 'alert';
    } else if (this.state === 'rest') {
      this.climb += (0 - this.climb) * Math.min(1, deltaTime * 4);
      this.mood = 'rest';
    } else {
      this.climb += (0 - this.climb) * Math.min(1, deltaTime * 4);
      this.mood = season.isWet() ? 'active' : 'conserve';
    }

    if (this.x > WORLD_W + 90) {
      this.x = -120 - rand(0, 90);
      this.baseY = this.randomLane();
      this.y = this.baseY;
      this.chooseState(weather, season);
    }
  }

  randomLane() {
    if (this.type === 'elephant') return rand(470, 515);
    if (this.type === 'lion') return rand(420, 470);
    return rand(365, 425);
  }

  draw(context) {
    context.save();
    context.translate(this.x, this.y + this.climb);
    context.scale(this.scale, this.scale);
    if (this.type === 'elephant') this.drawElephant(context);
    if (this.type === 'lion') this.drawLion(context);
    if (this.type === 'leopard') this.drawLeopard(context);
    this.drawMood(context);
    context.restore();
  }

  drawMood(context) {
    context.save();
    context.globalAlpha = 0.74;
    context.fillStyle = this.mood === 'alert' ? '#ff6a3d' : this.mood === 'active' ? '#70e181' : '#fff4bf';
    context.beginPath();
    context.arc(-24, -58, 5, 0, TAU);
    context.fill();
    context.restore();
  }

  drawLegs(context, color, y, count, stride) {
    context.strokeStyle = color;
    context.lineWidth = 5;
    for (let i = 0; i < count; i += 1) {
      const x = -28 + i * (56 / Math.max(1, count - 1));
      const step = Math.sin(this.step + i * 1.7) * stride;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + step, y + 28);
      context.stroke();
    }
  }

  drawElephant(context) {
    const body = '#718184';
    const dark = '#536267';
    context.fillStyle = 'rgba(0, 0, 0, 0.16)';
    context.beginPath();
    context.ellipse(0, 32, 72, 14, 0, 0, TAU);
    context.fill();

    this.drawLegs(context, dark, -4, 4, 7);
    context.fillStyle = body;
    context.beginPath();
    context.ellipse(0, -24, 62, 35, 0, 0, TAU);
    context.fill();
    context.beginPath();
    context.ellipse(49, -30, 31, 28, 0, 0, TAU);
    context.fill();
    context.fillStyle = '#657478';
    context.beginPath();
    context.ellipse(34, -35, 19, 27, -0.22, 0, TAU);
    context.fill();
    context.strokeStyle = body;
    context.lineWidth = 11;
    context.beginPath();
    const lift = this.state === 'trunk' ? -34 : this.state === 'drink' ? 20 : 4;
    context.moveTo(70, -21);
    context.quadraticCurveTo(92, -3, 79, 24 + lift);
    context.stroke();
    context.strokeStyle = '#eee5cd';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(66, -16);
    context.quadraticCurveTo(79, -9, 90, -10);
    context.stroke();
    context.fillStyle = '#1f282b';
    context.beginPath();
    context.arc(59, -38, 3, 0, TAU);
    context.fill();
  }

  drawLion(context) {
    const body = '#cf9144';
    const mane = '#6d3a1c';
    context.fillStyle = 'rgba(0, 0, 0, 0.14)';
    context.beginPath();
    context.ellipse(0, 25, 52, 11, 0, 0, TAU);
    context.fill();

    this.drawLegs(context, '#9b642e', -1, 4, 9);
    context.fillStyle = body;
    context.beginPath();
    context.ellipse(0, -20, 48, 21, 0, 0, TAU);
    context.fill();
    context.strokeStyle = body;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(-46, -21);
    context.quadraticCurveTo(-69, -36, -75, -17 + Math.sin(this.step) * 4);
    context.stroke();
    context.fillStyle = mane;
    context.beginPath();
    context.arc(43, -26, 23, 0, TAU);
    context.fill();
    context.fillStyle = '#dca85a';
    context.beginPath();
    context.arc(49, -25, 14, 0, TAU);
    context.fill();
    context.fillStyle = '#20150b';
    context.beginPath();
    context.arc(55, -29, 2.8, 0, TAU);
    context.fill();
    if (this.state === 'rest') {
      context.strokeStyle = '#fff2bb';
      context.lineWidth = 2;
      context.strokeText('z', 18, -52);
    }
  }

  drawLeopard(context) {
    const body = '#dda447';
    context.fillStyle = 'rgba(0, 0, 0, 0.12)';
    context.beginPath();
    context.ellipse(0, 18, 45, 8, 0, 0, TAU);
    context.fill();

    this.drawLegs(context, '#8b5a26', -3, 4, 12);
    context.fillStyle = body;
    context.beginPath();
    context.ellipse(0, -18, 43, 14, 0, 0, TAU);
    context.fill();
    context.beginPath();
    context.ellipse(42, -22, 14, 12, 0, 0, TAU);
    context.fill();
    context.strokeStyle = body;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(-38, -20);
    context.quadraticCurveTo(-68, -45, -81, -23 + Math.sin(this.step * 0.8) * 8);
    context.stroke();
    context.fillStyle = '#2c1a0c';
    for (let i = 0; i < 12; i += 1) {
      const x = -29 + (i % 6) * 11;
      const y = -27 + Math.floor(i / 6) * 11;
      context.beginPath();
      context.arc(x, y, 2.3, 0, TAU);
      context.fill();
    }
    context.beginPath();
    context.arc(46, -25, 2.3, 0, TAU);
    context.fill();
  }
}

class WildlifeManager {
  constructor() {
    this.animals = [
      new Animal('lion', 120, 445, 0.86, 0.2),
      new Animal('lion', 43, 459, 0.8, 2.0),
      new Animal('elephant', 260, 500, 1.05, 1.1),
      new Animal('elephant', 160, 486, 0.92, 3.1),
      new Animal('leopard', 360, 390, 0.76, 0.7),
      new Animal('leopard', 35, 408, 0.7, 4.5),
      new Animal('lion', 520, 432, 0.72, 4.1),
      new Animal('elephant', 610, 515, 0.82, 5.1)
    ];
  }

  update(deltaTime, elapsedTime, season, weather) {
    for (const animal of this.animals) animal.update(deltaTime, elapsedTime, season, weather);
    this.animals.sort((a, b) => a.y - b.y);
  }

  draw(context) {
    for (const animal of this.animals) animal.draw(context);
  }

  nearest(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const animal of this.animals) {
      const dx = animal.x - x;
      const dy = animal.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = animal;
      }
    }
    return best;
  }
}

class WeatherManager {
  constructor(particles, wildlife, season) {
    this.particles = particles;
    this.wildlife = wildlife;
    this.season = season;
    this.weather = 'sunny';
    this.spawnDebt = 0;
    this.lightning = { active: 0, x: 0, branches: [] };
    this.lightningTimer = 2.4;
    this.tornado = { x: 780, y: 360, radius: 56, active: false };
  }

  setWeather(weather) {
    if (this.weather === weather) return;
    this.weather = weather;
    this.spawnDebt = 0;
    this.lightning.active = 0;
    this.lightningTimer = 1.2;
    this.tornado.active = weather === 'tornado';
    this.particles.clearWeather();
    weatherButtons.forEach(button => button.classList.toggle('active', button.dataset.weather === weather));
    this.updateUi();
  }

  updateUi() {
    const seasonName = this.season.current === 'dry' ? 'Dry Season' : 'Wet Season';
    statusLabel.textContent = `${seasonName} - ${WEATHER_NAMES[this.weather]}`;
  }

  update(deltaTime, elapsedTime) {
    const wetBoost = this.season.isWet() ? 1.25 : 0.86;
    if (this.weather === 'rain') this.spawnRain(deltaTime, 175 * wetBoost, false);
    if (this.weather === 'heavy-rain') this.spawnRain(deltaTime, 390 * wetBoost, true);
    if (this.weather === 'snow') this.spawnSnow(deltaTime, this.season.isWet() ? 42 : 78);
    if (this.weather === 'thunderstorm') {
      this.spawnRain(deltaTime, 260 * wetBoost, true);
      this.updateLightning(deltaTime);
    }
    if (this.weather === 'tornado') this.updateTornado(deltaTime, elapsedTime);
    if (this.lightning.active > 0) this.lightning.active -= deltaTime;
  }

  spawnRain(deltaTime, rate, heavy) {
    this.spawnDebt += rate * deltaTime;
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      this.particles.emit(
        heavy ? 'heavy-rain' : 'rain',
        rand(-40, WORLD_W + 80),
        rand(-80, -5),
        rand(-80, -38),
        heavy ? rand(760, 920) : rand(520, 670),
        1.4,
        heavy ? 3 : 2,
        heavy ? '#c4e4ff' : '#d7f0ff',
        heavy ? 0.66 : 0.52
      );
    }
  }

  spawnSnow(deltaTime, rate) {
    this.spawnDebt += rate * deltaTime;
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      this.particles.emit('snow', rand(-20, WORLD_W + 20), rand(-70, -10), rand(-15, 15), rand(42, 82), 9, rand(1.7, 3.8), '#ffffff', 0.76);
    }
  }

  updateLightning(deltaTime) {
    this.lightningTimer -= deltaTime;
    if (this.lightningTimer > 0) return;
    this.lightningTimer = rand(2.0, 4.2);

    let bestX = 80;
    let bestScore = -Infinity;
    for (let candidate = 40; candidate <= WORLD_W - 40; candidate += 28) {
      let minClearance = Infinity;
      for (const animal of this.wildlife.animals) {
        const clearance = Math.abs(candidate - animal.x) - animal.safeRadius - 58;
        minClearance = Math.min(minClearance, clearance);
      }
      if (minClearance > bestScore) {
        bestScore = minClearance;
        bestX = candidate;
      }
    }

    // Lightning is a vertical strike, so every candidate column is scored against live animal bounds.
    // The highest-clearance column is used; if animals bunch together, the edge columns naturally win.
    this.lightning.x = bestX;
    this.lightning.active = 0.22;
    this.lightning.branches = [
      rand(-42, 42),
      rand(-34, 34),
      rand(-28, 28),
      rand(-22, 22)
    ];
  }

  updateTornado(deltaTime, elapsedTime) {
    const target = this.wildlife.nearest(this.tornado.x, this.tornado.y);
    if (target) {
      const targetX = target.x - 32;
      const targetY = target.y - 62;
      const dx = targetX - this.tornado.x;
      const dy = targetY - this.tornado.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const speed = 34;
      // The tornado pursues the closest animal with capped steering, creating pressure without teleporting.
      this.tornado.x += (dx / distance) * speed * deltaTime;
      this.tornado.y += (dy / distance) * speed * deltaTime;
    }
    this.tornado.x = clamp(this.tornado.x, 40, WORLD_W - 40);
    this.tornado.y = clamp(this.tornado.y, 285, 505);

    for (let i = 0; i < 6; i += 1) {
      const angle = elapsedTime * 5 + i * 1.3 + rand(-0.2, 0.2);
      const radius = rand(18, this.tornado.radius);
      this.particles.emit(
        'dust',
        this.tornado.x + Math.cos(angle) * radius,
        this.tornado.y + Math.sin(angle) * radius * 0.7,
        Math.sin(angle) * 70,
        rand(-120, -34),
        rand(0.7, 1.3),
        rand(3, 8),
        Math.random() < 0.5 ? '#d5a060' : '#8b6842',
        0.5
      );
    }
  }

  drawBack(context) {
    if (this.weather === 'rain' || this.weather === 'heavy-rain' || this.weather === 'thunderstorm') {
      context.save();
      context.globalAlpha = this.weather === 'heavy-rain' ? 0.22 : 0.12;
      context.fillStyle = '#55768e';
      context.fillRect(0, 0, WORLD_W, WORLD_H);
      context.restore();
    }
    if (this.weather === 'snow') {
      context.save();
      context.globalAlpha = 0.18;
      context.fillStyle = '#f7fbff';
      context.fillRect(0, 0, WORLD_W, WORLD_H);
      context.restore();
    }
  }

  drawFront(context) {
    if (this.weather === 'rain' || this.weather === 'heavy-rain' || this.weather === 'thunderstorm') {
      this.drawPuddles(context);
    }
    if (this.weather === 'tornado') this.drawTornado(context);
    this.particles.draw(context);
    if (this.lightning.active > 0) this.drawLightning(context);
  }

  drawPuddles(context) {
    context.save();
    context.globalAlpha = this.weather === 'heavy-rain' || this.weather === 'thunderstorm' ? 0.34 : 0.22;
    context.fillStyle = '#7fc7dc';
    for (let i = 0; i < 7; i += 1) {
      const x = 95 + i * 137;
      const y = GROUND_Y + 145 + Math.sin(i) * 18;
      context.beginPath();
      context.ellipse(x, y, 48 + (i % 3) * 15, 8 + (i % 2) * 5, 0, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  drawLightning(context) {
    context.save();
    context.globalAlpha = clamp(this.lightning.active / 0.22, 0, 1);
    context.strokeStyle = '#fff7b3';
    context.lineWidth = 5;
    context.shadowColor = '#d8f6ff';
    context.shadowBlur = 18;
    context.beginPath();
    let x = this.lightning.x;
    context.moveTo(x, 0);
    for (let i = 0; i < 5; i += 1) {
      const y = i * 82 + 70;
      x = this.lightning.x + (this.lightning.branches[i - 1] || 0);
      context.lineTo(x, y);
    }
    context.lineTo(this.lightning.x + 10, GROUND_Y + 115);
    context.stroke();
    context.restore();
  }

  drawTornado(context) {
    context.save();
    context.translate(this.tornado.x, this.tornado.y);
    context.globalAlpha = 0.82;
    for (let i = 0; i < 7; i += 1) {
      const y = i * 24 - 96;
      const rx = 18 + i * 9;
      context.strokeStyle = i % 2 ? '#9f8d76' : '#6e614e';
      context.lineWidth = 5;
      context.beginPath();
      context.ellipse(Math.sin(performance.now() * 0.004 + i) * 6, y, rx, 10, -0.12, 0, TAU);
      context.stroke();
    }
    context.restore();
  }
}

class Background {
  constructor() {
    this.clouds = Array.from({ length: 8 }, (_, index) => ({
      x: rand(0, WORLD_W),
      y: rand(52, 180),
      speed: rand(3, 12),
      scale: rand(0.7, 1.35),
      phase: index
    }));
  }

  update(deltaTime) {
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * deltaTime;
      if (cloud.x > WORLD_W + 110) cloud.x = -150;
    }
  }

  draw(context, season, weather, elapsedTime) {
    const { a, b, t } = season.values();
    const storm = weather === 'thunderstorm' || weather === 'heavy-rain';
    const top = storm ? mixColor(0x5c6f83, 0x35485c, 0.4) : mixColor(a.skyTop, b.skyTop, t);
    const bottom = storm ? mixColor(0x8998a2, 0x596a74, 0.45) : mixColor(a.skyBottom, b.skyBottom, t);
    const sky = context.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    context.fillStyle = sky;
    context.fillRect(0, 0, WORLD_W, WORLD_H);

    context.save();
    context.globalAlpha = storm ? 0.22 : 0.5;
    context.fillStyle = '#fff1b8';
    context.beginPath();
    context.arc(800, 92, weather === 'snow' ? 32 : 48, 0, TAU);
    context.fill();
    context.restore();

    this.drawClouds(context, storm, weather);
    this.drawHills(context, a, b, t);
    this.drawGround(context, a, b, t, elapsedTime, weather);
    this.drawAcacia(context, 110, 356, 0.9);
    this.drawAcacia(context, 850, 342, 1.08);
    this.drawAcacia(context, 610, 374, 0.68);
  }

  drawClouds(context, storm, weather) {
    context.save();
    context.fillStyle = storm ? 'rgba(56, 69, 82, 0.72)' : 'rgba(255, 255, 255, 0.62)';
    if (weather === 'sunny') context.globalAlpha = 0.68;
    for (const cloud of this.clouds) {
      context.save();
      context.translate(cloud.x, cloud.y);
      context.scale(cloud.scale, cloud.scale * 0.72);
      for (let i = 0; i < 4; i += 1) {
        context.beginPath();
        context.arc(i * 30, Math.sin(cloud.phase + i) * 5, 28 - i * 2, 0, TAU);
        context.fill();
      }
      context.restore();
    }
    context.restore();
  }

  drawHills(context, a, b, t) {
    context.fillStyle = mixColor(a.hills, b.hills, t, 0.56);
    context.beginPath();
    context.moveTo(0, 312);
    context.bezierCurveTo(160, 230, 310, 330, 460, 265);
    context.bezierCurveTo(620, 198, 735, 330, 1000, 245);
    context.lineTo(WORLD_W, GROUND_Y + 65);
    context.lineTo(0, GROUND_Y + 65);
    context.closePath();
    context.fill();
  }

  drawGround(context, a, b, t, elapsedTime, weather) {
    const ground = context.createLinearGradient(0, GROUND_Y, 0, WORLD_H);
    ground.addColorStop(0, mixColor(a.grass, b.grass, t));
    ground.addColorStop(1, mixColor(a.grassDark, b.grassDark, t));
    context.fillStyle = ground;
    context.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);

    context.save();
    context.globalAlpha = weather === 'tornado' ? 0.42 : 0.28;
    context.strokeStyle = mixColor(a.grassDark, b.grassDark, t);
    context.lineWidth = 2;
    for (let x = -20; x < WORLD_W + 20; x += 18) {
      const wave = Math.sin(elapsedTime * 1.7 + x * 0.04) * 5;
      context.beginPath();
      context.moveTo(x, WORLD_H);
      context.quadraticCurveTo(x + wave, GROUND_Y + 90, x + 8, GROUND_Y + rand(45, 74));
      context.stroke();
    }
    context.restore();
  }

  drawAcacia(context, x, y, scale) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.strokeStyle = '#594122';
    context.lineWidth = 11;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(0, 82);
    context.quadraticCurveTo(-8, 24, 10, -40);
    context.stroke();
    context.lineWidth = 7;
    for (const branch of [[10, -32, 68, -72], [4, -16, -54, -54], [6, -48, 36, -93]]) {
      context.beginPath();
      context.moveTo(branch[0], branch[1]);
      context.quadraticCurveTo(branch[0] + 12, branch[1] - 14, branch[2], branch[3]);
      context.stroke();
    }
    context.fillStyle = '#3e6f35';
    for (const crown of [[60, -75, 60, 21], [-42, -55, 52, 19], [24, -96, 45, 17]]) {
      context.beginPath();
      context.ellipse(crown[0], crown[1], crown[2], crown[3], 0, 0, TAU);
      context.fill();
    }
    context.restore();
  }
}

class App {
  constructor() {
    this.stage = new Stage(canvas, ctx);
    this.season = new SeasonManager();
    this.background = new Background();
    this.particles = new ParticleSystem();
    this.wildlife = new WildlifeManager();
    this.weather = new WeatherManager(this.particles, this.wildlife, this.season);
    this.last = performance.now();
    this.elapsed = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.fps = 0;

    this.bindUi();
    this.season.updateUi();
    this.weather.updateUi();
    requestAnimationFrame(time => this.tick(time));
  }

  bindUi() {
    for (const button of weatherButtons) {
      button.addEventListener('click', () => this.weather.setWeather(button.dataset.weather));
    }
    seasonToggle.addEventListener('click', () => {
      this.season.toggle();
      this.weather.updateUi();
    });
    window.addEventListener('keydown', event => {
      const keyMap = ['sunny', 'rain', 'heavy-rain', 'snow', 'thunderstorm', 'tornado'];
      const index = Number(event.key) - 1;
      if (keyMap[index]) this.weather.setWeather(keyMap[index]);
      if (event.key.toLowerCase() === 's') {
        this.season.toggle();
        this.weather.updateUi();
      }
    });
  }

  tick(time) {
    const deltaTime = Math.min(0.05, (time - this.last) / 1000 || 0.016);
    this.last = time;
    this.elapsed += deltaTime;

    this.season.update(deltaTime);
    this.background.update(deltaTime);
    this.wildlife.update(deltaTime, this.elapsed, this.season, this.weather.weather);
    this.weather.update(deltaTime, this.elapsed);
    this.particles.update(deltaTime);

    this.draw();
    this.updateDebug(deltaTime);
    requestAnimationFrame(next => this.tick(next));
  }

  draw() {
    this.stage.beginFrame();
    this.background.draw(ctx, this.season, this.weather.weather, this.elapsed);
    this.weather.drawBack(ctx);
    this.wildlife.draw(ctx);
    this.weather.drawFront(ctx);
    this.stage.endFrame();
  }

  updateDebug(deltaTime) {
    this.frames += 1;
    this.fpsTime += deltaTime;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
      debugLabel.textContent = `${this.fps} fps - ${this.particles.pool.activeCount} particles`;
      this.weather.updateUi();
    }
  }
}

new App();
