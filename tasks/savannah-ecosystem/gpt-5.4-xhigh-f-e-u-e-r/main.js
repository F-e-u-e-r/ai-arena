const WEATHER_OPTIONS = [
  'sunny',
  'rain',
  'heavy-rain',
  'snow',
  'thunderstorm',
  'tornado'
];

const SEASON_DURATION = 60;
const DRY = 'dry';
const WET = 'wet';

const SEASON_PALETTES = {
  dry: {
    skyTop: [239, 163, 78],
    skyBottom: [255, 227, 154],
    haze: [255, 213, 137],
    mountainFar: [189, 134, 78],
    mountainNear: [128, 93, 56],
    ground: [181, 138, 74],
    grass: [167, 133, 66],
    shadow: [91, 61, 38],
    water: [120, 152, 180]
  },
  wet: {
    skyTop: [70, 127, 158],
    skyBottom: [177, 212, 188],
    haze: [212, 237, 238],
    mountainFar: [101, 132, 107],
    mountainNear: [69, 96, 73],
    ground: [99, 127, 70],
    grass: [122, 164, 77],
    shadow: [48, 67, 39],
    water: [78, 121, 156]
  }
};

const WEATHER_IMPACTS = {
  sunny: { dim: 0, cool: 0, clouds: 0.22, targetParticles: 45, particleType: 'dust', animalSpeed: 1, puddles: 0 },
  rain: { dim: 0.1, cool: 0.08, clouds: 0.58, targetParticles: 230, particleType: 'rain', animalSpeed: 0.92, puddles: 0.38 },
  'heavy-rain': { dim: 0.18, cool: 0.12, clouds: 0.72, targetParticles: 380, particleType: 'rain', animalSpeed: 0.84, puddles: 0.64 },
  snow: { dim: 0.08, cool: 0.3, clouds: 0.45, targetParticles: 165, particleType: 'snow', animalSpeed: 0.78, puddles: 0.12 },
  thunderstorm: { dim: 0.28, cool: 0.14, clouds: 0.88, targetParticles: 320, particleType: 'storm-rain', animalSpeed: 0.9, puddles: 0.56 },
  tornado: { dim: 0.14, cool: 0.06, clouds: 0.62, targetParticles: 210, particleType: 'tornado-dust', animalSpeed: 1.05, puddles: 0.08 }
};

const WEATHER_LABELS = {
  sunny: 'Sunny',
  rain: 'Rain',
  'heavy-rain': 'Heavy Rain',
  snow: 'Snow',
  thunderstorm: 'Thunderstorm',
  tornado: 'Tornado'
};

const RANDOM = (min, max) => min + Math.random() * (max - min);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t)
  ];
}

function colorToCss(color, alpha = 1) {
  return `rgba(${color.map(v => Math.round(v)).join(',')}, ${alpha})`;
}

class ParticlePool {
  constructor(size) {
    this.particles = Array.from({ length: size }, () => ({ active: false }));
  }

  acquire() {
    for (const particle of this.particles) {
      if (!particle.active) {
        particle.active = true;
        return particle;
      }
    }
    return null;
  }

  release(particle) {
    particle.active = false;
  }

  reset() {
    for (const particle of this.particles) {
      particle.active = false;
    }
  }

  countActive(type) {
    let count = 0;
    for (const particle of this.particles) {
      if (particle.active && (!type || particle.type === type)) count += 1;
    }
    return count;
  }
}

class SeasonManager {
  constructor() {
    this.state = DRY;
    this.elapsed = 0;
    this.wetBlend = 0;
    this.transition = 0;
  }

  setSeason(state) {
    this.state = state;
    this.elapsed = 0;
  }

  toggle() {
    this.setSeason(this.state === DRY ? WET : DRY);
  }

  update(dt) {
    this.elapsed += dt;
    if (this.elapsed >= SEASON_DURATION) {
      this.toggle();
    }

    const target = this.state === WET ? 1 : 0;
    this.wetBlend = lerp(this.wetBlend, target, 1 - Math.exp(-dt * 2));
  }

  get timeRemaining() {
    return Math.max(0, SEASON_DURATION - this.elapsed);
  }

  get label() {
    return this.state === WET ? 'Wet season' : 'Dry season';
  }
}

class Animal {
  constructor(scene, config) {
    this.scene = scene;
    this.species = config.species;
    this.lane = config.lane;
    this.x = config.x;
    this.anchorX = config.anchorX ?? config.x;
    this.baseSpeed = config.baseSpeed;
    this.scale = config.scale;
    this.hue = config.hue;
    this.yOffset = 0;
    this.step = RANDOM(0, Math.PI * 2);
    this.stateTimer = RANDOM(2, 8);
    this.state = 'moving';
    this.icon = '';
    this.moodTimer = 0;
    this.wrapMargin = 160;
  }

  get groundY() {
    return this.scene.groundLine + this.lane * 82;
  }

  get safeRadius() {
    return 42 * this.scale;
  }

  update(dt, env) {
    this.step += dt * 5;
    const weatherFactor = WEATHER_IMPACTS[env.weather].animalSpeed;
    const wetBonus = lerp(0.92, 1.18, env.wetBlend);
    const speed = this.getSpeed(env) * weatherFactor * wetBonus;
    this.x += speed * dt;
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) this.pickNextState(env);
    this.handleVerticalMotion(dt, env);

    if (this.x > this.scene.width + this.wrapMargin) {
      this.x = -this.wrapMargin - RANDOM(40, 220);
      this.anchorX = this.x;
    }
  }

  pickNextState() {}

  handleVerticalMotion() {}

  getSpeed() {
    return this.baseSpeed;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.groundY + this.yOffset);
    ctx.scale(this.scale, this.scale);
    this.drawShadow(ctx);
    this.drawBody(ctx);
    ctx.restore();
  }

  drawShadow(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(26, 17, 11, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Lion extends Animal {
  constructor(scene, config) {
    super(scene, { ...config, species: 'lion' });
    this.restPhase = RANDOM(0, Math.PI * 2);
    this.herdOffset = config.herdOffset;
    this.icon = 'patrol';
  }

  pickNextState(env) {
    const restBias = env.weather === 'sunny' ? 0.48 : 0.25;
    this.state = Math.random() < restBias ? 'resting' : 'moving';
    this.stateTimer = this.state === 'resting'
      ? RANDOM(2.4, 5.6)
      : RANDOM(4.2, 8.8);
    this.icon = this.state === 'resting' ? 'rest' : 'patrol';
  }

  handleVerticalMotion(dt) {
    this.restPhase += dt * (this.state === 'resting' ? 1.8 : 4.6);
    this.yOffset = this.state === 'resting'
      ? Math.sin(this.restPhase) * 1.8
      : Math.sin(this.restPhase) * 3.4;
  }

  getSpeed(env) {
    const herdTarget = this.anchorX + this.herdOffset;
    const correction = clamp((herdTarget - this.x) * 0.12, -14, 14);
    return this.state === 'resting' ? correction : this.baseSpeed + correction;
  }

  drawBody(ctx) {
    const legLift = Math.sin(this.step) * 4;
    ctx.fillStyle = '#4d2c18';
    ctx.beginPath();
    ctx.ellipse(-12, -10, 14, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#c58d42';
    ctx.beginPath();
    ctx.ellipse(6, -2, 40, 19, -0.04, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillRect(-20, 4, 10, 28 + legLift * 0.2);
    ctx.fillRect(-4, 4, 10, 30 - legLift * 0.2);
    ctx.fillRect(18, 4, 10, 32 - legLift * 0.2);
    ctx.fillRect(34, 4, 10, 28 + legLift * 0.2);

    ctx.beginPath();
    ctx.moveTo(42, -6);
    ctx.quadraticCurveTo(70, -18, 74, 10);
    ctx.strokeStyle = '#5b351f';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#2f170e';
    ctx.beginPath();
    ctx.arc(76, 11, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e0b565';
    ctx.beginPath();
    ctx.arc(-18, -10, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#362013';
    ctx.beginPath();
    ctx.arc(-22, -10, 2.4, 0, Math.PI * 2);
    ctx.arc(-12, -10, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#362013';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-18, -4);
    ctx.quadraticCurveTo(-14, 0, -8, -4);
    ctx.stroke();
  }
}

class Elephant extends Animal {
  constructor(scene, config) {
    super(scene, { ...config, species: 'elephant' });
    this.drinkTimer = RANDOM(5, 12);
    this.trunkPhase = RANDOM(0, Math.PI * 2);
    this.icon = 'migrate';
  }

  pickNextState() {
    if (Math.abs(this.x - this.scene.waterhole.x) < 110 && Math.random() < 0.58) {
      this.state = 'drinking';
      this.stateTimer = RANDOM(3.4, 5.4);
      this.icon = 'drink';
    } else {
      this.state = 'moving';
      this.stateTimer = RANDOM(5.2, 9.5);
      this.icon = 'migrate';
    }
  }

  handleVerticalMotion(dt) {
    this.trunkPhase += dt * (this.state === 'drinking' ? 2.8 : 3.8);
    this.yOffset = Math.sin(this.trunkPhase) * 2.3;
  }

  getSpeed(env) {
    if (this.state === 'drinking') return 8;
    const herdPull = clamp((this.anchorX - this.x) * 0.08, -10, 10);
    const thunderPause = env.weather === 'thunderstorm' ? -8 : 0;
    return this.baseSpeed + herdPull + thunderPause;
  }

  drawBody(ctx) {
    const trunkSwing = Math.sin(this.trunkPhase) * 10;

    ctx.fillStyle = '#5d635f';
    ctx.beginPath();
    ctx.ellipse(8, -6, 48, 23, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(-30, -18, 22, 18, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-15, -18, 18, 16, 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillRect(-24, 8, 12, 34);
    ctx.fillRect(-2, 6, 12, 36);
    ctx.fillRect(22, 6, 12, 36);
    ctx.fillRect(44, 8, 12, 34);

    ctx.beginPath();
    ctx.arc(-42, -10, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#535853';
    ctx.beginPath();
    ctx.moveTo(-52, -4);
    ctx.quadraticCurveTo(-74, 8, -58, 26 + trunkSwing * 0.25);
    ctx.stroke();

    ctx.strokeStyle = '#f2ead4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-50, -4);
    ctx.lineTo(-64, 12);
    ctx.moveTo(-44, -2);
    ctx.lineTo(-56, 12);
    ctx.stroke();

    ctx.fillStyle = '#2c322f';
    ctx.beginPath();
    ctx.arc(-46, -12, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Leopard extends Animal {
  constructor(scene, config) {
    super(scene, { ...config, species: 'leopard' });
    this.climbTree = null;
    this.climbProgress = 0;
    this.icon = 'stalk';
  }

  pickNextState(env) {
    const candidateTree = this.scene.trees.find(tree => Math.abs(tree.x - this.x) < 52);
    if (candidateTree && Math.random() < 0.46 && env.weather !== 'tornado') {
      this.state = 'climbing';
      this.stateTimer = RANDOM(3.8, 5.2);
      this.climbTree = candidateTree;
      this.icon = 'climb';
    } else {
      this.state = Math.random() < 0.5 ? 'sprint' : 'moving';
      this.stateTimer = this.state === 'sprint' ? RANDOM(2.2, 4.2) : RANDOM(3.8, 6.2);
      this.icon = this.state === 'sprint' ? 'sprint' : 'stalk';
      this.climbTree = null;
    }
  }

  handleVerticalMotion(dt) {
    if (this.state === 'climbing' && this.climbTree) {
      this.climbProgress += dt / this.stateTimer;
      const arc = Math.sin(Math.min(1, this.climbProgress) * Math.PI);
      this.yOffset = -arc * this.climbTree.height * 0.6;
    } else {
      this.climbProgress = 0;
      this.yOffset = Math.sin(this.step * 1.6) * 4.2;
    }
  }

  getSpeed(env) {
    if (this.state === 'climbing') return 18;
    const stormBoost = env.weather === 'thunderstorm' ? 10 : 0;
    const sprint = this.state === 'sprint' ? 58 : 0;
    return this.baseSpeed + sprint + stormBoost;
  }

  drawBody(ctx) {
    const bodyColor = '#cf9d4c';
    const spotColor = '#3d2211';
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(8, -2, 34, 12, -0.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillRect(-12, 6, 8, 26);
    ctx.fillRect(8, 6, 8, 30);
    ctx.fillRect(28, 6, 8, 28);
    ctx.fillRect(44, 6, 8, 24);

    ctx.beginPath();
    ctx.arc(-22, -8, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(36, 0);
    ctx.quadraticCurveTo(68, -20, 84, 2);
    ctx.stroke();

    ctx.fillStyle = '#f0db9d';
    ctx.beginPath();
    ctx.ellipse(-26, -4, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = spotColor;
    for (let i = 0; i < 11; i += 1) {
      const px = -2 + (i % 4) * 14 + RANDOM(-2.2, 2.2);
      const py = -8 + Math.floor(i / 4) * 9 + RANDOM(-2.2, 2.2);
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(-26, -10, 1.8, 0, Math.PI * 2);
    ctx.arc(-18, -10, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

class WeatherManager {
  constructor(scene) {
    this.scene = scene;
    this.current = 'sunny';
    this.visualBlend = 0;
    this.particles = new ParticlePool(1100);
    this.ripples = [];
    this.strikes = [];
    this.tornado = { active: false, x: 0, y: 0, radius: 16, phase: 0 };
    this.lightningTimer = RANDOM(2.1, 3.8);
  }

  setWeather(nextWeather) {
    if (!WEATHER_IMPACTS[nextWeather] || nextWeather === this.current) return;
    this.current = nextWeather;
    this.particles.reset();
    this.ripples.length = 0;
    if (nextWeather !== 'thunderstorm') this.strikes.length = 0;
    if (nextWeather !== 'tornado') this.tornado.active = false;
  }

  update(dt, animals, wetBlend) {
    this.visualBlend = lerp(this.visualBlend, 1, 1 - Math.exp(-dt * 1.8));
    const impact = WEATHER_IMPACTS[this.current];
    const target = Math.round(impact.targetParticles * lerp(0.9, 1.15, wetBlend));
    const activeType = impact.particleType;
    while (this.particles.countActive(activeType) < target) {
      const particle = this.particles.acquire();
      if (!particle) break;
      this.seedParticle(particle, activeType);
    }

    this.updateParticles(dt);
    this.updateRipples(dt);

    if (this.current === 'thunderstorm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.spawnLightning(animals);
        this.lightningTimer = RANDOM(2.0, 4.1);
      }
      for (const strike of this.strikes) strike.life -= dt;
      this.strikes = this.strikes.filter(strike => strike.life > 0);
    }

    if (this.current === 'tornado') {
      this.updateTornado(dt, animals);
    } else {
      this.tornado.active = false;
    }
  }

  seedParticle(particle, type) {
    particle.type = type;
    particle.active = true;
    particle.alpha = 1;
    particle.spin = RANDOM(-3, 3);

    if (type === 'rain' || type === 'storm-rain') {
      particle.x = RANDOM(-40, this.scene.width + 40);
      particle.y = RANDOM(-this.scene.height, 0);
      particle.vx = RANDOM(-160, -70);
      particle.vy = type === 'storm-rain' ? RANDOM(680, 940) : RANDOM(520, 740);
      particle.length = type === 'storm-rain' ? RANDOM(18, 34) : RANDOM(12, 24);
    } else if (type === 'snow') {
      particle.x = RANDOM(-20, this.scene.width + 20);
      particle.y = RANDOM(-this.scene.height, 0);
      particle.vx = RANDOM(-26, 24);
      particle.vy = RANDOM(28, 70);
      particle.size = RANDOM(2.2, 5.2);
      particle.phase = RANDOM(0, Math.PI * 2);
    } else if (type === 'tornado-dust') {
      particle.angle = RANDOM(0, Math.PI * 2);
      particle.radius = RANDOM(10, 56);
      particle.height = RANDOM(6, 180);
      particle.size = RANDOM(2, 5);
      particle.life = RANDOM(1.4, 2.8);
    } else {
      particle.x = RANDOM(-20, this.scene.width + 20);
      particle.y = RANDOM(this.scene.horizonY * 0.3, this.scene.height * 0.8);
      particle.vx = RANDOM(10, 34);
      particle.vy = RANDOM(-12, 4);
      particle.size = RANDOM(1.2, 3.6);
      particle.life = RANDOM(2.2, 5.4);
    }
  }

  updateParticles(dt) {
    for (const particle of this.particles.particles) {
      if (!particle.active) continue;

      if (particle.type === 'rain' || particle.type === 'storm-rain') {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.y > this.scene.groundLine + 100 || particle.x < -120) {
          this.spawnRipple(particle.x, particle.type === 'storm-rain' ? 1 : 0.6);
          this.particles.release(particle);
        }
      } else if (particle.type === 'snow') {
        particle.phase += dt;
        particle.x += (particle.vx + Math.sin(particle.phase * 2) * 12) * dt;
        particle.y += particle.vy * dt;
        if (particle.y > this.scene.height + 30 || particle.x < -40 || particle.x > this.scene.width + 40) {
          this.particles.release(particle);
        }
      } else if (particle.type === 'tornado-dust') {
        if (!this.tornado.active) {
          this.particles.release(particle);
          continue;
        }
        particle.life -= dt;
        particle.angle += dt * (3.8 + particle.radius * 0.05);
        particle.radius = clamp(particle.radius + dt * 8, 10, 64);
        if (particle.life <= 0) {
          this.seedParticle(particle, 'tornado-dust');
        }
      } else {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt + Math.sin(particle.life * 4) * 0.3;
        if (particle.life <= 0 || particle.x > this.scene.width + 40) {
          this.particles.release(particle);
        }
      }
    }
  }

  updateRipples(dt) {
    for (const ripple of this.ripples) {
      ripple.life -= dt;
      ripple.radius += dt * ripple.growth;
    }
    this.ripples = this.ripples.filter(ripple => ripple.life > 0);
  }

  spawnRipple(x, intensity) {
    this.ripples.push({
      x,
      y: this.scene.groundLine + 52,
      radius: 2,
      life: 0.6,
      growth: 42 * intensity
    });
  }

  // Lightning is only allowed to land in x-ranges that stay outside every
  // animal's current safety radius. If random samples all fail, choose the
  // widest remaining corridor to guarantee a strike without hitting wildlife.
  pickSafeStrikeX(animals) {
    const minX = 48;
    const maxX = this.scene.width - 48;
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const candidate = RANDOM(minX, maxX);
      const safe = animals.every(animal => Math.abs(animal.x - candidate) > animal.safeRadius + 14);
      if (safe) return candidate;
    }

    let bestX = minX;
    let bestClearance = -Infinity;
    for (let x = minX; x <= maxX; x += 24) {
      const clearance = Math.min(...animals.map(animal => Math.abs(animal.x - x) - animal.safeRadius));
      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestX = x;
      }
    }
    return bestX;
  }

  spawnLightning(animals) {
    const x = this.pickSafeStrikeX(animals);
    const points = [{ x, y: 0 }];
    let currentX = x;
    let currentY = 0;
    const targetY = this.scene.groundLine + 40;
    while (currentY < targetY) {
      currentX += RANDOM(-28, 28);
      currentY += RANDOM(34, 60);
      points.push({ x: currentX, y: currentY });
    }
    this.strikes.push({
      life: 0.24,
      x,
      points
    });
  }

  updateTornado(dt, animals) {
    const closest = animals.reduce((best, animal) => {
      const distance = Math.abs(animal.x - this.tornado.x);
      if (!best || distance < best.distance) return { animal, distance };
      return best;
    }, null);

    if (!this.tornado.active) {
      this.tornado.active = true;
      this.tornado.x = this.scene.width * 0.18;
      this.tornado.y = this.scene.groundLine + 40;
    }

    if (closest) {
      const direction = Math.sign(closest.animal.x - this.tornado.x);
      this.tornado.x += direction * dt * 46;
    }

    this.tornado.phase += dt * 3.6;
    this.tornado.radius = 26 + Math.sin(this.tornado.phase) * 4;
  }

  draw(ctx) {
    for (const ripple of this.ripples) {
      ctx.strokeStyle = `rgba(205, 226, 238, ${ripple.life * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, ripple.radius * 1.8, ripple.radius * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const particle of this.particles.particles) {
      if (!particle.active) continue;

      if (particle.type === 'rain' || particle.type === 'storm-rain') {
        ctx.strokeStyle = particle.type === 'storm-rain'
          ? 'rgba(213, 234, 255, 0.9)'
          : 'rgba(197, 225, 242, 0.76)';
        ctx.lineWidth = particle.type === 'storm-rain' ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x + 7, particle.y - particle.length);
        ctx.stroke();
      } else if (particle.type === 'snow') {
        ctx.fillStyle = 'rgba(245, 248, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.type === 'tornado-dust') {
        const x = this.tornado.x + Math.cos(particle.angle) * particle.radius;
        const y = this.tornado.y - particle.height + Math.sin(particle.angle * 2) * 8;
        ctx.fillStyle = 'rgba(222, 188, 122, 0.4)';
        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(243, 211, 128, 0.3)';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const strike of this.strikes) {
      ctx.strokeStyle = `rgba(248, 248, 255, ${strike.life * 4})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(strike.points[0].x, strike.points[0].y);
      for (const point of strike.points.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();

      ctx.strokeStyle = `rgba(161, 225, 255, ${strike.life * 3.4})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(strike.points[0].x, strike.points[0].y);
      for (const point of strike.points.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }

    if (this.tornado.active) {
      const gradient = ctx.createLinearGradient(this.tornado.x, this.tornado.y - 190, this.tornado.x, this.tornado.y);
      gradient.addColorStop(0, 'rgba(226, 203, 156, 0.08)');
      gradient.addColorStop(0.4, 'rgba(216, 184, 128, 0.28)');
      gradient.addColorStop(1, 'rgba(97, 67, 39, 0.62)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(this.tornado.x - 12, this.tornado.y - 190);
      ctx.quadraticCurveTo(this.tornado.x - 60, this.tornado.y - 70, this.tornado.x - 26, this.tornado.y);
      ctx.lineTo(this.tornado.x + 26, this.tornado.y);
      ctx.quadraticCurveTo(this.tornado.x + 60, this.tornado.y - 70, this.tornado.x + 12, this.tornado.y - 190);
      ctx.closePath();
      ctx.fill();
    }
  }
}

class SavannahScene {
  constructor(canvas, statsEl, seasonStatusEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.statsEl = statsEl;
    this.seasonStatusEl = seasonStatusEl;
    this.width = 0;
    this.height = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.horizonY = 0;
    this.groundLine = 0;
    this.lastTime = performance.now();
    this.debugVisible = true;
    this.frameSamples = [];
    this.fps = 60;
    this.weather = new WeatherManager(this);
    this.season = new SeasonManager();
    this.waterhole = { x: 0, y: 0, rx: 0, ry: 0 };
    this.trees = [];
    this.clouds = Array.from({ length: 6 }, (_, index) => ({
      x: index * 220 + RANDOM(-40, 50),
      y: RANDOM(70, 210),
      scale: RANDOM(0.7, 1.4),
      speed: RANDOM(6, 12)
    }));

    this.animals = [];
    this.resize();
    this.initAnimals();
    window.addEventListener('resize', () => this.resize());
  }

  initAnimals() {
    const elephantLead = this.width * 0.42;
    const lionLead = this.width * 0.68;
    const leopardLead = this.width * 0.58;
    this.animals = [
      new Elephant(this, { x: elephantLead, anchorX: elephantLead + 24, lane: 0.08, scale: 1.16, baseSpeed: 36, hue: 0 }),
      new Elephant(this, { x: elephantLead + 150, anchorX: elephantLead + 24, lane: 0.12, scale: 1.08, baseSpeed: 34, hue: 0 }),
      new Lion(this, { x: lionLead, anchorX: lionLead + 20, herdOffset: -34, lane: 0.2, scale: 0.95, baseSpeed: 52, hue: 0 }),
      new Lion(this, { x: lionLead + 120, anchorX: lionLead + 20, herdOffset: 38, lane: 0.24, scale: 0.92, baseSpeed: 48, hue: 0 }),
      new Leopard(this, { x: leopardLead, lane: 0.42, scale: 0.98, baseSpeed: 78, hue: 0 }),
      new Leopard(this, { x: leopardLead + 310, lane: 0.36, scale: 0.92, baseSpeed: 74, hue: 0 })
    ];
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.horizonY = this.height * 0.5;
    this.groundLine = this.height * 0.62;
    this.waterhole = {
      x: this.width * 0.7,
      y: this.groundLine + 52,
      rx: this.width * 0.12,
      ry: 42
    };
    this.trees = [
      { x: this.width * 0.26, y: this.groundLine - 8, height: 124, crown: 96 },
      { x: this.width * 0.54, y: this.groundLine - 20, height: 146, crown: 118 },
      { x: this.width * 0.84, y: this.groundLine - 26, height: 136, crown: 108 }
    ];

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setWeather(weather) {
    this.weather.setWeather(weather);
  }

  toggleSeason(force) {
    if (force) {
      this.season.setSeason(force);
    } else {
      this.season.toggle();
    }
  }

  update(dt) {
    this.season.update(dt);
    const env = {
      weather: this.weather.current,
      wetBlend: this.season.wetBlend
    };

    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x > this.width + 180) cloud.x = -180;
    }

    for (const animal of this.animals) {
      animal.update(dt, env);
    }
    this.weather.update(dt, this.animals, this.season.wetBlend);

    if (dt > 0) {
      this.frameSamples.push(1 / Math.max(dt, 1 / 240));
      if (this.frameSamples.length > 24) this.frameSamples.shift();
      this.fps = this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length;
    }

    this.seasonStatusEl.textContent = `${this.season.label} · auto switch in ${this.season.timeRemaining.toFixed(1)}s`;
    document.getElementById('season-toggle').textContent = this.season.state === WET
      ? 'Switch To Dry Season'
      : 'Switch To Wet Season';
    this.statsEl.innerHTML = [
      `Weather: ${WEATHER_LABELS[this.weather.current]}`,
      `Season blend: ${(this.season.wetBlend * 100).toFixed(0)}% wet`,
      `Animals: ${this.animals.length} active`,
      `Particles: ${this.weather.particles.countActive()}`,
      `FPS: ${this.fps.toFixed(1)}`
    ].join('<br>');
  }

  getEnvironmentColors() {
    const base = mixPalette(SEASON_PALETTES.dry, SEASON_PALETTES.wet, this.season.wetBlend);
    const impact = WEATHER_IMPACTS[this.weather.current];
    const cool = impact.cool;
    const dim = impact.dim;
    return {
      skyTop: dimColor(mixColor(base.skyTop, [194, 220, 255], cool), dim),
      skyBottom: dimColor(mixColor(base.skyBottom, [216, 232, 248], cool * 0.8), dim * 0.6),
      haze: dimColor(base.haze, dim * 0.3),
      mountainFar: dimColor(base.mountainFar, dim * 0.8),
      mountainNear: dimColor(base.mountainNear, dim),
      ground: dimColor(base.ground, dim * 0.6),
      grass: dimColor(base.grass, dim * 0.44),
      shadow: dimColor(base.shadow, dim * 0.32),
      water: dimColor(mixColor(base.water, [166, 188, 219], impact.puddles * 0.2), dim * 0.14)
    };
  }

  draw() {
    const ctx = this.ctx;
    const colors = this.getEnvironmentColors();
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawSky(ctx, colors);
    this.drawMountains(ctx, colors);
    this.drawClouds(ctx);
    this.drawGround(ctx, colors);
    this.drawTrees(ctx, colors);
    this.drawWaterhole(ctx, colors);

    const sortedAnimals = [...this.animals].sort((a, b) => a.groundY - b.groundY);
    for (const animal of sortedAnimals) {
      animal.draw(ctx);
    }

    this.drawForegroundGrass(ctx, colors);
    this.weather.draw(ctx);

    if (this.debugVisible) {
      this.drawDebug(ctx);
    }
  }

  drawSky(ctx, colors) {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.horizonY + 120);
    gradient.addColorStop(0, colorToCss(colors.skyTop));
    gradient.addColorStop(1, colorToCss(colors.skyBottom));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = colorToCss(colors.haze, 0.34);
    ctx.beginPath();
    ctx.arc(this.width * 0.18, this.height * 0.18, 110, 0, Math.PI * 2);
    ctx.fill();
  }

  drawClouds(ctx) {
    const impact = WEATHER_IMPACTS[this.weather.current];
    for (const cloud of this.clouds) {
      ctx.save();
      ctx.translate(cloud.x, cloud.y);
      ctx.scale(cloud.scale, cloud.scale);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.14 + impact.clouds * 0.32})`;
      drawCloud(ctx);
      ctx.restore();
    }
  }

  drawMountains(ctx, colors) {
    ctx.fillStyle = colorToCss(colors.mountainFar);
    ctx.beginPath();
    ctx.moveTo(0, this.horizonY + 40);
    ctx.quadraticCurveTo(this.width * 0.16, this.horizonY - 20, this.width * 0.3, this.horizonY + 26);
    ctx.quadraticCurveTo(this.width * 0.48, this.horizonY - 48, this.width * 0.64, this.horizonY + 18);
    ctx.quadraticCurveTo(this.width * 0.82, this.horizonY - 10, this.width, this.horizonY + 44);
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colorToCss(colors.mountainNear);
    ctx.beginPath();
    ctx.moveTo(0, this.horizonY + 86);
    ctx.quadraticCurveTo(this.width * 0.2, this.horizonY + 24, this.width * 0.36, this.horizonY + 74);
    ctx.quadraticCurveTo(this.width * 0.58, this.horizonY + 10, this.width * 0.78, this.horizonY + 96);
    ctx.quadraticCurveTo(this.width * 0.9, this.horizonY + 48, this.width, this.horizonY + 84);
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();
  }

  drawGround(ctx, colors) {
    ctx.fillStyle = colorToCss(colors.ground);
    ctx.fillRect(0, this.groundLine - 40, this.width, this.height - this.groundLine + 40);

    const gradient = ctx.createLinearGradient(0, this.groundLine, 0, this.height);
    gradient.addColorStop(0, colorToCss(colors.grass, 0.35));
    gradient.addColorStop(1, colorToCss(colors.shadow, 0.42));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, this.groundLine - 30, this.width, this.height - this.groundLine + 30);

    if (WEATHER_IMPACTS[this.weather.current].puddles > 0.1) {
      ctx.fillStyle = `rgba(186, 208, 232, ${WEATHER_IMPACTS[this.weather.current].puddles * 0.16})`;
      for (let i = 0; i < 4; i += 1) {
        const px = this.width * (0.2 + i * 0.18);
        ctx.beginPath();
        ctx.ellipse(px, this.groundLine + 72 + (i % 2) * 14, 40 + i * 12, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTrees(ctx, colors) {
    for (const tree of this.trees) {
      ctx.fillStyle = colorToCss(colors.shadow, 0.92);
      ctx.fillRect(tree.x - 10, tree.y - tree.height, 20, tree.height + 36);

      ctx.fillStyle = colorToCss(mixColor(colors.grass, colors.shadow, 0.32), 0.94);
      ctx.beginPath();
      ctx.ellipse(tree.x, tree.y - tree.height, tree.crown * 0.56, tree.crown * 0.2, 0, 0, Math.PI * 2);
      ctx.ellipse(tree.x - tree.crown * 0.24, tree.y - tree.height - 14, tree.crown * 0.38, tree.crown * 0.16, -0.12, 0, Math.PI * 2);
      ctx.ellipse(tree.x + tree.crown * 0.22, tree.y - tree.height - 8, tree.crown * 0.34, tree.crown * 0.14, 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawWaterhole(ctx, colors) {
    ctx.fillStyle = 'rgba(39, 56, 43, 0.22)';
    ctx.beginPath();
    ctx.ellipse(this.waterhole.x, this.waterhole.y + 8, this.waterhole.rx * 1.04, this.waterhole.ry * 1.06, 0, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createRadialGradient(
      this.waterhole.x,
      this.waterhole.y - 8,
      12,
      this.waterhole.x,
      this.waterhole.y,
      this.waterhole.rx
    );
    gradient.addColorStop(0, colorToCss(mixColor(colors.water, [240, 251, 255], 0.42), 0.9));
    gradient.addColorStop(1, colorToCss(colors.water, 0.88));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(this.waterhole.x, this.waterhole.y, this.waterhole.rx, this.waterhole.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawForegroundGrass(ctx, colors) {
    ctx.strokeStyle = colorToCss(mixColor(colors.grass, colors.shadow, 0.18), 0.5);
    ctx.lineWidth = 2;
    for (let x = 0; x < this.width; x += 18) {
      const baseY = this.groundLine + 94 + Math.sin(x * 0.02) * 6;
      ctx.beginPath();
      ctx.moveTo(x, baseY + 26);
      ctx.quadraticCurveTo(x + 3, baseY + 12, x + 2, baseY - 4);
      ctx.stroke();
    }
  }

  drawDebug(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(11, 14, 13, 0.68)';
    ctx.fillRect(this.width - 192, 16, 176, 88);
    ctx.fillStyle = 'rgba(247, 240, 220, 0.92)';
    ctx.font = '12px monospace';
    ctx.fillText(`weather=${this.weather.current}`, this.width - 180, 38);
    ctx.fillText(`season=${this.season.state}`, this.width - 180, 56);
    ctx.fillText(`particles=${this.weather.particles.countActive()}`, this.width - 180, 74);
    ctx.fillText(`fps=${this.fps.toFixed(1)}`, this.width - 180, 92);
    ctx.restore();
  }

  animate(now = performance.now()) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame(next => this.animate(next));
  }
}

function dimColor(color, amount) {
  return mixColor(color, [18, 22, 24], amount);
}

function mixPalette(a, b, t) {
  return {
    skyTop: mixColor(a.skyTop, b.skyTop, t),
    skyBottom: mixColor(a.skyBottom, b.skyBottom, t),
    haze: mixColor(a.haze, b.haze, t),
    mountainFar: mixColor(a.mountainFar, b.mountainFar, t),
    mountainNear: mixColor(a.mountainNear, b.mountainNear, t),
    ground: mixColor(a.ground, b.ground, t),
    grass: mixColor(a.grass, b.grass, t),
    shadow: mixColor(a.shadow, b.shadow, t),
    water: mixColor(a.water, b.water, t)
  };
}

function drawCloud(ctx) {
  ctx.beginPath();
  ctx.arc(-32, 0, 24, 0, Math.PI * 2);
  ctx.arc(-4, -18, 28, 0, Math.PI * 2);
  ctx.arc(24, -6, 24, 0, Math.PI * 2);
  ctx.arc(50, 0, 18, 0, Math.PI * 2);
  ctx.fill();
}

const canvas = document.getElementById('scene');
const statsEl = document.getElementById('stats');
const seasonStatusEl = document.getElementById('season-status');
const scene = new SavannahScene(canvas, statsEl, seasonStatusEl);

document.querySelectorAll('[data-weather]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-weather]').forEach(candidate => candidate.classList.toggle('is-active', candidate === button));
    scene.setWeather(button.dataset.weather);
  });
});

document.getElementById('season-toggle').addEventListener('click', () => {
  scene.toggleSeason();
});

window.addEventListener('keydown', event => {
  if (event.key >= '1' && event.key <= '6') {
    const weather = WEATHER_OPTIONS[Number(event.key) - 1];
    const button = document.querySelector(`[data-weather="${weather}"]`);
    if (button) {
      button.click();
    }
  } else if (event.key.toLowerCase() === 's') {
    document.getElementById('season-toggle').click();
  } else if (event.key.toLowerCase() === 'd') {
    scene.debugVisible = !scene.debugVisible;
  }
});

scene.animate();
