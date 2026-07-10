(() => {
  'use strict';

  const canvas = document.querySelector('#ecosystem');
  const context = canvas.getContext('2d', { alpha: false });
  const loadingPanel = document.querySelector('#loading');
  const weatherLabel = document.querySelector('#weather-label');
  const temperature = document.querySelector('#temperature');
  const statusIcon = document.querySelector('#status-icon');
  const weatherButtons = [...document.querySelectorAll('[data-weather]')];
  const seasonButtons = [...document.querySelectorAll('[data-season]')];

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;

  function seededRandom(seed = 1) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function colorBetween(a, b, amount, shade = 1) {
    return `rgb(${Math.round(lerp(a[0], b[0], amount) * shade)} ${Math.round(lerp(a[1], b[1], amount) * shade)} ${Math.round(lerp(a[2], b[2], amount) * shade)})`;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  class SeasonManager {
    constructor(buttons) {
      this.buttons = buttons;
      this.elapsed = 0;
      this.wetMix = 0;
      this.targetWet = 0;
      this.manualRemaining = 0;
      for (const button of buttons) {
        button.addEventListener('click', () => this.choose(button.dataset.season === 'wet'));
      }
    }

    choose(wet) {
      this.targetWet = wet ? 1 : 0;
      this.elapsed = wet ? 60 : 0;
      this.manualRemaining = 15;
      this.updateButtons();
    }

    updateButtons() {
      for (const button of this.buttons) {
        const pressed = (button.dataset.season === 'wet') === (this.targetWet === 1);
        button.setAttribute('aria-pressed', String(pressed));
      }
    }

    update(deltaTime) {
      this.elapsed += deltaTime;
      if (this.manualRemaining > 0) {
        this.manualRemaining -= deltaTime;
      } else {
        // The target season flips every 60 seconds; wetMix eases the entire ecosystem between palettes.
        this.targetWet = Math.floor(this.elapsed / 60) % 2;
      }
      const damping = 1 - Math.exp(-deltaTime * 1.4);
      this.wetMix += (this.targetWet - this.wetMix) * damping;
      this.updateButtons();
      return this.wetMix;
    }
  }

  class ParticlePool {
    constructor(maxCount, random) {
      this.maxCount = maxCount;
      this.random = random;
      this.mode = 'sunny';
      this.baseCount = 0;
      this.activeCount = 0;
      this.x = new Float32Array(maxCount);
      this.y = new Float32Array(maxCount);
      this.vx = new Float32Array(maxCount);
      this.vy = new Float32Array(maxCount);
      this.size = new Float32Array(maxCount);
      this.phase = new Float32Array(maxCount);
      this.aux = new Float32Array(maxCount);
    }

    configure(mode, count) {
      // Switching weather recycles the same fixed slots, clearing all old particle state in place.
      this.mode = mode;
      this.baseCount = Math.min(count, this.maxCount);
      this.activeCount = this.baseCount;
      for (let i = 0; i < this.baseCount; i += 1) this.reset(i, true);
    }

    setSeason(wetMix) {
      let factor = 1;
      if (this.mode === 'rain' || this.mode === 'heavy-rain' || this.mode === 'thunderstorm') factor = lerp(0.7, 1, wetMix);
      if (this.mode === 'snow') factor = lerp(0.58, 1, wetMix);
      this.activeCount = Math.max(0, Math.floor(this.baseCount * factor));
    }

    reset(index, initial = false) {
      const random = this.random;
      this.phase[index] = random() * TAU;
      this.aux[index] = random();
      if (this.mode === 'sunny') {
        this.x[index] = random();
        this.y[index] = initial ? random() * 0.82 + 0.08 : 0.9;
        this.vx[index] = (random() - 0.5) * 0.007;
        this.vy[index] = -0.012 - random() * 0.01;
        this.size[index] = 0.8 + random() * 1.7;
      } else if (this.mode === 'snow') {
        this.x[index] = random();
        this.y[index] = initial ? random() : -0.04 - random() * 0.12;
        this.vx[index] = (random() - 0.5) * 0.025;
        this.vy[index] = 0.07 + random() * 0.07;
        this.size[index] = 1.2 + random() * 2.2;
      } else if (this.mode === 'tornado') {
        this.x[index] = 0;
        this.y[index] = initial ? 0.34 + random() * 0.45 : 0.78;
        this.vx[index] = 0;
        this.vy[index] = -0.05 - random() * 0.08;
        this.size[index] = 1.1 + random() * 2.5;
        this.aux[index] = 0.025 + random() * 0.16;
      } else {
        this.x[index] = random() * 1.1 - 0.05;
        this.y[index] = initial ? random() : -0.08 - random() * 0.2;
        this.vx[index] = -0.035 - random() * 0.025;
        this.vy[index] = this.mode === 'rain' ? 0.56 + random() * 0.22 : 0.78 + random() * 0.34;
        this.size[index] = 6 + random() * 8;
      }
    }

    update(deltaTime, tornadoX) {
      for (let i = 0; i < this.activeCount; i += 1) {
        if (this.mode === 'tornado') {
          this.phase[i] += deltaTime * (2.5 + (i % 7) * 0.22);
          this.y[i] += this.vy[i] * deltaTime;
          if (this.y[i] < 0.31) this.reset(i, false);
          this.x[i] = tornadoX + Math.cos(this.phase[i]) * this.aux[i] * (0.35 + this.y[i]);
        } else {
          this.x[i] += this.vx[i] * deltaTime;
          this.y[i] += this.vy[i] * deltaTime;
          if (this.mode === 'snow') this.x[i] += Math.sin(this.phase[i] + this.y[i] * 12) * deltaTime * 0.012;
          if (this.mode === 'sunny') {
            this.x[i] += Math.sin(this.phase[i] + this.y[i] * 9) * deltaTime * 0.004;
            if (this.y[i] < 0.06) this.reset(i, false);
          } else if (this.y[i] > 1.02 || this.x[i] < -0.12 || this.x[i] > 1.12) {
            this.reset(i, false);
          }
        }
      }
    }

    draw(ctx, width, height, scale) {
      ctx.save();
      if (this.mode === 'sunny') {
        ctx.fillStyle = 'rgba(255, 225, 135, .58)';
        for (let i = 0; i < this.activeCount; i += 1) {
          ctx.beginPath();
          ctx.arc(this.x[i] * width, this.y[i] * height, this.size[i] * scale, 0, TAU);
          ctx.fill();
        }
      } else if (this.mode === 'snow') {
        ctx.fillStyle = 'rgba(246, 253, 255, .9)';
        for (let i = 0; i < this.activeCount; i += 1) {
          ctx.beginPath();
          ctx.arc(this.x[i] * width, this.y[i] * height, this.size[i] * scale, 0, TAU);
          ctx.fill();
        }
      } else if (this.mode === 'tornado') {
        ctx.fillStyle = 'rgba(98, 78, 59, .62)';
        for (let i = 0; i < this.activeCount; i += 1) {
          ctx.save();
          ctx.translate(this.x[i] * width, this.y[i] * height);
          ctx.rotate(this.phase[i]);
          ctx.fillRect(-this.size[i] * scale, -scale, this.size[i] * scale * 2, scale * 2);
          ctx.restore();
        }
      } else {
        ctx.strokeStyle = this.mode === 'rain' ? 'rgba(178, 224, 232, .58)' : 'rgba(160, 211, 224, .67)';
        ctx.lineWidth = Math.max(0.7, scale * (this.mode === 'rain' ? 1.1 : 1.45));
        ctx.beginPath();
        for (let i = 0; i < this.activeCount; i += 1) {
          const x = this.x[i] * width;
          const y = this.y[i] * height;
          ctx.moveTo(x, y);
          ctx.lineTo(x + this.vx[i] * 18 * width / 1000, y + this.size[i] * scale);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  class WeatherManager {
    constructor(buttons, random) {
      this.buttons = buttons;
      this.random = random;
      this.pool = new ParticlePool(420, random);
      this.current = 'sunny';
      this.flash = 0;
      this.boltTime = 0;
      this.lightningTimer = 1.5;
      this.lightningX = 0.5;
      this.lightningPath = new Float32Array(12);
      this.tornadoX = 0.78;
      this.tornadoY = 0.7;
      this.nearestAnimal = null;
      this.definitions = {
        sunny: { label: 'Sunny', icon: 9728, count: 34, temp: 34 },
        rain: { label: 'Rain', icon: 9730, count: 135, temp: 25 },
        'heavy-rain': { label: 'Heavy rain', icon: 9729, count: 285, temp: 22 },
        snow: { label: 'Snow', icon: 10052, count: 175, temp: 1 },
        thunderstorm: { label: 'Thunderstorm', icon: 9889, count: 235, temp: 21 },
        tornado: { label: 'Tornado', icon: 8635, count: 145, temp: 27 }
      };
      for (const button of buttons) button.addEventListener('click', () => this.setWeather(button.dataset.weather));
      this.setWeather('sunny');
    }

    setWeather(name) {
      if (!this.definitions[name]) return;
      this.current = name;
      this.flash = 0;
      this.boltTime = 0;
      this.lightningTimer = 0.8 + this.random() * 1.2;
      this.pool.configure(name, this.definitions[name].count);
      for (const button of this.buttons) button.setAttribute('aria-pressed', String(button.dataset.weather === name));
      const definition = this.definitions[name];
      weatherLabel.textContent = definition.label;
      statusIcon.textContent = String.fromCodePoint(definition.icon);
    }

    behaviorFactor() {
      return {
        sunny: 1,
        rain: 0.88,
        'heavy-rain': 0.68,
        snow: 0.54,
        thunderstorm: 0.76,
        tornado: 1.55
      }[this.current];
    }

    chooseSafeStrike(animals) {
      // Score fixed candidates by their clearance from every live animal and choose the widest gap.
      let bestX = 0.08;
      let bestClearance = -Infinity;
      for (let candidateIndex = 0; candidateIndex < 27; candidateIndex += 1) {
        const candidate = 0.06 + (candidateIndex / 26) * 0.88;
        let clearance = Infinity;
        for (const animal of animals) {
          const safetyRadius = animal.species === 'elephant' ? 0.055 : 0.04;
          clearance = Math.min(clearance, Math.abs(candidate - animal.x) - safetyRadius);
        }
        if (clearance > bestClearance) {
          bestClearance = clearance;
          bestX = candidate;
        }
      }
      this.lightningX = bestX;
      for (let i = 0; i < this.lightningPath.length; i += 1) {
        const taper = 1 - i / this.lightningPath.length;
        this.lightningPath[i] = (this.random() - 0.5) * 0.05 * taper;
      }
      this.flash = 1;
      this.boltTime = 0.18;
    }

    updateTornado(deltaTime, animals) {
      let closest = null;
      let closestDistance = Infinity;
      for (const animal of animals) {
        const dx = animal.x - this.tornadoX;
        const dy = animal.y - this.tornadoY;
        const distance = dx * dx + dy * dy;
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = animal;
        }
      }
      this.nearestAnimal = closest;
      if (!closest) return;
      const dx = closest.x - this.tornadoX;
      const dy = closest.y - this.tornadoY;
      const length = Math.hypot(dx, dy) || 1;
      // At 0.011 world units/s the funnel visibly pursues, but every fleeing species remains faster.
      this.tornadoX = clamp(this.tornadoX + (dx / length) * deltaTime * 0.011, 0.08, 0.92);
      this.tornadoY = clamp(this.tornadoY + (dy / length) * deltaTime * 0.004, 0.61, 0.74);
    }

    update(deltaTime, animals, wetMix) {
      this.pool.setSeason(wetMix);
      if (this.current === 'thunderstorm') {
        this.lightningTimer -= deltaTime;
        if (this.lightningTimer <= 0) {
          this.chooseSafeStrike(animals);
          this.lightningTimer = 2.2 + this.random() * 2.8;
        }
      }
      if (this.current === 'tornado') this.updateTornado(deltaTime, animals);
      this.flash = Math.max(0, this.flash - deltaTime * 4.8);
      this.boltTime = Math.max(0, this.boltTime - deltaTime);
      this.pool.update(deltaTime, this.tornadoX);
      const baseTemperature = this.definitions[this.current].temp;
      temperature.textContent = `${Math.round(baseTemperature - wetMix * 3)} C`;
    }

    drawPuddles(ctx, width, height, scale, wetMix) {
      if (!['rain', 'heavy-rain', 'thunderstorm'].includes(this.current)) return;
      const strength = this.current === 'rain' ? 0.35 : 0.7;
      ctx.save();
      ctx.strokeStyle = `rgba(145, 205, 211, ${strength})`;
      ctx.lineWidth = Math.max(0.7, scale);
      for (let i = 0; i < 8; i += 1) {
        const pulse = ((performance.now() * 0.001 + i * 0.17) % 1);
        ctx.beginPath();
        ctx.ellipse((0.12 + i * 0.115) * width, (0.76 + (i % 2) * 0.05) * height, (8 + pulse * 12) * scale * (1 + wetMix * 0.4), (2 + pulse * 3) * scale, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawLightning(ctx, width, height, scale) {
      if (this.boltTime <= 0) return;
      ctx.save();
      ctx.strokeStyle = '#fff7ad';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 15 * scale;
      ctx.lineWidth = Math.max(1.3, 3 * scale);
      ctx.beginPath();
      ctx.moveTo(this.lightningX * width, 0.11 * height);
      for (let i = 0; i < this.lightningPath.length; i += 1) {
        const y = 0.11 + (i + 1) / this.lightningPath.length * 0.68;
        ctx.lineTo((this.lightningX + this.lightningPath[i]) * width, y * height);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawTornado(ctx, width, height, scale, elapsed) {
      if (this.current !== 'tornado') return;
      const x = this.tornadoX * width;
      const baseY = this.tornadoY * height;
      ctx.save();
      ctx.translate(x, baseY);
      ctx.globalAlpha = 0.82;
      for (let layer = 0; layer < 9; layer += 1) {
        const t = layer / 8;
        const y = -t * 165 * scale;
        const radius = lerp(8, 46, t) * scale;
        const wobble = Math.sin(elapsed * 4 + layer * 0.9) * 7 * scale;
        ctx.strokeStyle = layer % 2 ? 'rgba(88, 76, 62, .58)' : 'rgba(189, 173, 145, .7)';
        ctx.lineWidth = Math.max(1.2, 5 * scale * (0.4 + t));
        ctx.beginPath();
        ctx.ellipse(wobble, y, radius, radius * 0.23, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    draw(ctx, width, height, scale, elapsed) {
      this.pool.draw(ctx, width, height, scale);
      this.drawTornado(ctx, width, height, scale, elapsed);
      this.drawLightning(ctx, width, height, scale);
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(245, 250, 255, ${this.flash * 0.48})`;
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  class Animal {
    constructor(species, x, y, speed, scale, random) {
      this.species = species;
      this.x = x;
      this.y = y;
      this.homeY = y;
      this.speed = speed;
      this.scale = scale;
      this.random = random;
      this.gait = random() * TAU;
      this.state = 'moving';
      this.stateTime = 2 + random() * 4;
      this.verticalOffset = 0;
      this.safeRadius = species === 'elephant' ? 0.055 : 0.04;
    }

    weatherSpeed(weather, wetMix) {
      return weather.behaviorFactor() * lerp(0.9, 1.14, wetMix);
    }

    wrap() {
      // Keep the entering or exiting silhouette visible at the edge so six or more animals remain on screen.
      if (this.x > 1.045) this.x = -0.035;
    }
  }

  class Lion extends Animal {
    constructor(x, y, male, random) {
      super('lion', x, y, 0.0175, male ? 1.02 : 0.92, random);
      this.male = male;
    }

    update(deltaTime, weather, wetMix) {
      this.stateTime -= deltaTime;
      if (this.stateTime <= 0) {
        const restChance = lerp(0.34, 0.18, wetMix);
        this.state = this.random() < restChance ? 'resting' : 'patrolling';
        this.stateTime = this.state === 'resting' ? 2.5 + this.random() * 3.5 : 4 + this.random() * 5;
      }
      const stateSpeed = this.state === 'resting' ? 0.08 : 0.78;
      const tornadoBoost = weather.current === 'tornado' ? 1.25 : 1;
      this.x += this.speed * this.weatherSpeed(weather, wetMix) * stateSpeed * tornadoBoost * deltaTime;
      const prideLane = this.male ? 0.595 : 0.625;
      this.y += (lerp(prideLane, this.homeY, wetMix) - this.y) * deltaTime * 0.25;
      this.gait += deltaTime * 5 * stateSpeed;
      this.wrap();
    }

    draw(ctx, width, height, unit) {
      const scale = unit * this.scale;
      const x = this.x * width;
      const y = this.y * height;
      const leg = Math.sin(this.gait) * 8;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(56, 38, 24, .18)';
      ctx.beginPath(); ctx.ellipse(0, 4, 39, 8, 0, 0, TAU); ctx.fill();
      if (this.state === 'resting') ctx.scale(1, 0.82);

      ctx.strokeStyle = '#9b642f';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-31, -16);
      ctx.bezierCurveTo(-48, -25, -48, -2, -55, -7);
      ctx.stroke();
      ctx.fillStyle = '#5b3926';
      ctx.beginPath(); ctx.arc(-56, -8, 4.5, 0, TAU); ctx.fill();

      ctx.fillStyle = '#c98a45';
      ctx.beginPath(); ctx.ellipse(-2, -17, 34, 17, -0.05, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9b642f';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-21, -7); ctx.lineTo(-23 + leg * .35, 8);
      ctx.moveTo(-5, -6); ctx.lineTo(-3 - leg * .35, 8);
      ctx.moveTo(15, -7); ctx.lineTo(13 + leg * .35, 8);
      ctx.stroke();

      if (this.male) {
        ctx.fillStyle = '#70452c';
        ctx.beginPath(); ctx.arc(29, -23, 18, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#d69a51';
      ctx.beginPath(); ctx.arc(31, -23, 12, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(24, -33, 4.5, 0, TAU); ctx.arc(37, -33, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f2923';
      ctx.beginPath(); ctx.arc(35, -24, 1.8, 0, TAU); ctx.arc(42, -19, 2.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  class Elephant extends Animal {
    constructor(x, y, size, random) {
      super('elephant', x, y, 0.0115, size, random);
      this.drinkCooldown = 4 + random() * 8;
      this.trunkPhase = random() * TAU;
    }

    update(deltaTime, weather, wetMix) {
      this.stateTime -= deltaTime;
      this.drinkCooldown -= deltaTime;
      const nearWater = this.x > 0.61 && this.x < 0.75;
      if (nearWater && this.drinkCooldown <= 0 && weather.current !== 'tornado') {
        this.state = 'drinking';
        this.stateTime = 3.2;
        this.drinkCooldown = 16 + this.random() * 12;
      } else if (this.stateTime <= 0) {
        this.state = this.random() < 0.3 ? 'trunk-up' : 'walking';
        this.stateTime = 3 + this.random() * 5;
      }
      const stateSpeed = this.state === 'drinking' ? 0.04 : 0.72;
      this.x += this.speed * this.weatherSpeed(weather, wetMix) * stateSpeed * deltaTime;
      const herdLane = this.scale > 1 ? 0.66 : 0.685;
      this.y += (lerp(herdLane, this.homeY, wetMix) - this.y) * deltaTime * 0.2;
      this.gait += deltaTime * 3.2 * stateSpeed;
      this.trunkPhase += deltaTime * 2;
      this.wrap();
    }

    draw(ctx, width, height, unit) {
      const scale = unit * this.scale;
      const x = this.x * width;
      const y = this.y * height;
      const leg = Math.sin(this.gait) * 5;
      const drinking = this.state === 'drinking';
      const trunkUp = this.state === 'trunk-up';
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(48, 42, 37, .18)';
      ctx.beginPath(); ctx.ellipse(0, 7, 48, 10, 0, 0, TAU); ctx.fill();

      ctx.fillStyle = '#798a87';
      ctx.beginPath(); ctx.ellipse(-4, -27, 43, 27, -0.04, 0, TAU); ctx.fill();
      ctx.fillStyle = '#879795';
      ctx.beginPath(); ctx.arc(34, -28, 19, 0, TAU); ctx.fill();
      ctx.fillStyle = '#687b79';
      ctx.beginPath(); ctx.ellipse(20, -29, 17, 21, -.3, 0, TAU); ctx.fill();

      ctx.strokeStyle = '#687b79';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-28, -13); ctx.lineTo(-27 + leg * .25, 10);
      ctx.moveTo(-4, -10); ctx.lineTo(-3 - leg * .25, 10);
      ctx.moveTo(18, -12); ctx.lineTo(19 + leg * .2, 10);
      ctx.stroke();

      ctx.strokeStyle = '#7d8f8c';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(45, -21);
      if (drinking) ctx.bezierCurveTo(55, -4, 44, 12, 52, 15);
      else if (trunkUp) ctx.bezierCurveTo(56, -18, 54, -43, 61, -46);
      else ctx.bezierCurveTo(53, -12, 46, 3 + Math.sin(this.trunkPhase) * 3, 50, 7);
      ctx.stroke();
      ctx.strokeStyle = '#eee0ba';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(42, -18); ctx.quadraticCurveTo(53, -13, 51, -5); ctx.stroke();
      ctx.fillStyle = '#263331';
      ctx.beginPath(); ctx.arc(42, -32, 2, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  class Leopard extends Animal {
    constructor(x, y, random) {
      super('leopard', x, y, 0.028, 0.82, random);
      this.climbTime = 0;
      this.climbDuration = 2.7;
      this.climbCooldown = 3 + random() * 8;
    }

    update(deltaTime, weather, wetMix) {
      this.climbCooldown -= deltaTime;
      const nearTree = Math.abs(this.x - 0.23) < 0.014 || Math.abs(this.x - 0.84) < 0.014;
      if (nearTree && this.climbCooldown <= 0 && weather.current !== 'tornado') {
        this.climbTime = this.climbDuration;
        this.climbCooldown = 18 + this.random() * 10;
        this.state = 'climbing';
      }
      let stateSpeed = 1;
      this.verticalOffset = 0;
      if (this.climbTime > 0) {
        this.climbTime -= deltaTime;
        const progress = 1 - this.climbTime / this.climbDuration;
        this.verticalOffset = Math.sin(progress * Math.PI) * 58;
        stateSpeed = 0.08;
      } else {
        this.state = weather.current === 'tornado' ? 'sprinting' : 'stalking';
      }
      this.x += this.speed * this.weatherSpeed(weather, wetMix) * stateSpeed * deltaTime;
      this.gait += deltaTime * 8 * stateSpeed;
      this.wrap();
    }

    draw(ctx, width, height, unit) {
      const scale = unit * this.scale;
      const x = this.x * width;
      const y = this.y * height - this.verticalOffset * scale;
      const leg = Math.sin(this.gait) * 8;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(53, 39, 24, .16)';
      ctx.beginPath(); ctx.ellipse(0, 4 + this.verticalOffset, 36, 7, 0, 0, TAU); ctx.fill();

      ctx.strokeStyle = '#c88936';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-29, -11); ctx.bezierCurveTo(-48, -20, -52, 3, -63, -5); ctx.stroke();
      ctx.fillStyle = '#d79a42';
      ctx.beginPath(); ctx.ellipse(-2, -13, 32, 13, -.05, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(29, -18, 10, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(24, -27, 3.8, 0, TAU); ctx.arc(33, -27, 3.8, 0, TAU); ctx.fill();

      ctx.strokeStyle = '#b97930';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-19, -5); ctx.lineTo(-20 + leg * .35, 7);
      ctx.moveTo(-2, -4); ctx.lineTo(-1 - leg * .35, 7);
      ctx.moveTo(18, -6); ctx.lineTo(20 + leg * .25, 7);
      ctx.stroke();

      ctx.fillStyle = '#543722';
      for (const spot of [[-21, -15], [-11, -8], [-3, -17], [7, -9], [15, -17], [25, -17]]) {
        ctx.beginPath(); ctx.arc(spot[0], spot[1], 2.1, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(33, -19, 1.5, 0, TAU); ctx.arc(39, -15, 1.8, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  class Ecosystem {
    constructor(ctx, random) {
      this.ctx = ctx;
      this.random = random;
      this.width = 1;
      this.height = 1;
      this.unit = 1;
      this.elapsed = 0;
      this.cloudOffset = 0;
      this.seasons = new SeasonManager(seasonButtons);
      this.weather = new WeatherManager(weatherButtons, random);
      this.animals = [
        new Lion(0.10, 0.57, true, random),
        new Lion(0.34, 0.62, false, random),
        new Lion(0.73, 0.64, false, random),
        new Elephant(0.04, 0.66, 0.82, random),
        new Elephant(0.56, 0.57, 1.03, random),
        new Elephant(0.79, 0.68, 0.9, random),
        new Leopard(0.22, 0.70, random),
        new Leopard(0.45, 0.735, random),
        new Leopard(0.91, 0.61, random)
      ];
      this.drawOrder = this.animals.slice();
      this.grass = [];
      for (let i = 0; i < 105; i += 1) {
        this.grass.push({ x: random(), y: 0.5 + random() * 0.45, height: 5 + random() * 15, phase: random() * TAU });
      }
    }

    resize() {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, bounds.width <= 520 || bounds.height <= 300 ? 1.5 : 2);
      canvas.width = Math.max(1, Math.round(bounds.width * dpr));
      canvas.height = Math.max(1, Math.round(bounds.height * dpr));
      this.width = Math.max(1, bounds.width);
      this.height = Math.max(1, bounds.height);
      this.unit = this.height / 625;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    update(deltaTime) {
      this.elapsed += deltaTime;
      this.cloudOffset = (this.cloudOffset + deltaTime * 0.006) % 1.3;
      const wetMix = this.seasons.update(deltaTime);
      this.weather.update(deltaTime, this.animals, wetMix);
      for (const animal of this.animals) animal.update(deltaTime, this.weather, wetMix);
      return wetMix;
    }

    drawCloud(x, y, scale, color, alpha) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.arc(-24, 4, 21, 0, TAU);
      ctx.arc(0, -4, 30, 0, TAU);
      ctx.arc(29, 5, 22, 0, TAU);
      ctx.rect(-28, 2, 58, 24);
      ctx.fill();
      ctx.restore();
    }

    drawAcacia(x, y, scale, wetMix, foreground = false) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.strokeStyle = foreground ? '#5c3e2c' : '#674936';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 35); ctx.lineTo(1, -30);
      ctx.moveTo(0, -15); ctx.lineTo(-35, -38);
      ctx.moveTo(1, -20); ctx.lineTo(34, -44);
      ctx.stroke();
      ctx.fillStyle = colorBetween([130, 122, 57], [54, 115, 72], wetMix);
      for (const crown of [[-37, -45, 38, 16], [0, -55, 46, 19], [39, -49, 36, 16]]) {
        ctx.beginPath(); ctx.ellipse(crown[0], crown[1], crown[2], crown[3], 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    drawBackground(wetMix) {
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const unit = this.unit;
      let shade = 1;
      if (this.weather.current === 'rain') shade = 0.82;
      if (this.weather.current === 'heavy-rain') shade = 0.66;
      if (this.weather.current === 'thunderstorm') shade = 0.48;
      if (this.weather.current === 'tornado') shade = 0.72;
      if (this.weather.current === 'snow') shade = 0.9;

      const sky = ctx.createLinearGradient(0, 0, 0, height * 0.56);
      sky.addColorStop(0, colorBetween([91, 170, 194], [56, 135, 157], wetMix, shade));
      sky.addColorStop(1, colorBetween([249, 184, 99], [174, 205, 157], wetMix, shade));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      if (this.weather.current === 'sunny' || this.weather.current === 'snow') {
        ctx.save();
        ctx.globalAlpha = this.weather.current === 'snow' ? 0.55 : 0.92;
        ctx.fillStyle = '#ffd774';
        ctx.shadowColor = '#ffd774';
        ctx.shadowBlur = 38 * unit;
        ctx.beginPath(); ctx.arc(width * 0.82, height * 0.17, 40 * unit, 0, TAU); ctx.fill();
        ctx.restore();
      }

      const cloudColor = this.weather.current === 'thunderstorm' ? '#394c51' : (this.weather.current === 'heavy-rain' ? '#60777a' : '#f0eadb');
      const cloudAlpha = ['rain', 'heavy-rain', 'thunderstorm'].includes(this.weather.current) ? 0.92 : 0.62;
      for (let i = 0; i < 5; i += 1) {
        const x = ((((i * 0.27 + this.cloudOffset) % 1.35) - 0.17) * width);
        this.drawCloud(x, height * (0.13 + (i % 2) * 0.09), unit * (0.72 + (i % 3) * 0.18), cloudColor, cloudAlpha);
      }

      ctx.fillStyle = colorBetween([116, 103, 79], [75, 115, 92], wetMix, shade);
      ctx.beginPath();
      ctx.moveTo(0, height * 0.48);
      ctx.lineTo(width * .13, height * .32); ctx.lineTo(width * .25, height * .45);
      ctx.lineTo(width * .39, height * .28); ctx.lineTo(width * .53, height * .46);
      ctx.lineTo(width * .68, height * .31); ctx.lineTo(width * .82, height * .45);
      ctx.lineTo(width, height * .35); ctx.lineTo(width, height * .57); ctx.lineTo(0, height * .57);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = colorBetween([174, 143, 72], [82, 142, 83], wetMix, shade);
      ctx.beginPath();
      ctx.moveTo(0, height * .47);
      ctx.quadraticCurveTo(width * .25, height * .42, width * .5, height * .5);
      ctx.quadraticCurveTo(width * .75, height * .43, width, height * .48);
      ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();

      ctx.fillStyle = colorBetween([151, 116, 55], [66, 126, 71], wetMix, shade);
      ctx.beginPath();
      ctx.moveTo(0, height * .64);
      ctx.quadraticCurveTo(width * .3, height * .55, width * .58, height * .68);
      ctx.quadraticCurveTo(width * .8, height * .58, width, height * .64);
      ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();

      this.drawAcacia(width * .23, height * .53, unit * .76, wetMix);
      this.drawAcacia(width * .84, height * .55, unit * .68, wetMix);

      const waterSize = lerp(0.74, 1.28, wetMix);
      ctx.fillStyle = this.weather.current === 'snow' ? '#a9c7cc' : '#4f9da0';
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.ellipse(width * .68, height * .77, width * .12 * waterSize, 24 * unit * waterSize, -.05, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      const sway = this.elapsed * 1.8;
      ctx.lineCap = 'round';
      for (let i = 0; i < this.grass.length; i += 1) {
        const blade = this.grass[i];
        if (blade.y > 0.78) continue;
        const x = blade.x * width;
        const y = blade.y * height;
        ctx.strokeStyle = i % 3 ? colorBetween([121, 92, 43], [48, 112, 61], wetMix, shade) : colorBetween([194, 150, 62], [85, 145, 78], wetMix, shade);
        ctx.lineWidth = Math.max(.6, unit * 1.5);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.sin(sway + blade.phase) * 4 * unit, y - blade.height * unit * .55, x + Math.sin(sway + blade.phase) * 6 * unit, y - blade.height * unit);
        ctx.stroke();
      }
    }

    drawForeground(wetMix) {
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const unit = this.unit;
      ctx.fillStyle = colorBetween([104, 76, 38], [38, 98, 55], wetMix);
      ctx.globalAlpha = 0.84;
      for (let i = 0; i < this.grass.length; i += 1) {
        const blade = this.grass[i];
        if (blade.y <= 0.78) continue;
        const x = blade.x * width;
        const y = blade.y * height;
        const h = blade.height * unit * 1.25;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2 * unit, y - h);
        ctx.lineTo(x + 3 * unit, y - h * .35);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const vignette = ctx.createLinearGradient(0, 0, 0, height);
      vignette.addColorStop(0, 'rgba(29, 43, 39, 0)');
      vignette.addColorStop(.82, 'rgba(27, 35, 28, 0)');
      vignette.addColorStop(1, 'rgba(27, 31, 24, .18)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    }

    draw(wetMix) {
      this.drawBackground(wetMix);
      this.weather.drawPuddles(this.ctx, this.width, this.height, this.unit, wetMix);
      this.drawOrder.sort((a, b) => (a.y - a.verticalOffset * .001) - (b.y - b.verticalOffset * .001));
      for (const animal of this.drawOrder) animal.draw(this.ctx, this.width, this.height, this.unit);
      this.drawForeground(wetMix);
      this.weather.draw(this.ctx, this.width, this.height, this.unit, this.elapsed);
    }
  }

  const ecosystem = new Ecosystem(context, seededRandom(20260710));
  ecosystem.resize();
  window.addEventListener('resize', () => ecosystem.resize());
  if ('ResizeObserver' in window) new ResizeObserver(() => ecosystem.resize()).observe(document.querySelector('#app'));
  window.addEventListener('keydown', (event) => {
    const index = Number(event.key) - 1;
    if (index >= 0 && index < weatherButtons.length) ecosystem.weather.setWeather(weatherButtons[index].dataset.weather);
    if (event.key.toLowerCase() === 's') ecosystem.seasons.choose(ecosystem.seasons.targetWet === 0);
  });

  let lastTime = performance.now();
  let firstFrame = true;
  function animate(now) {
    requestAnimationFrame(animate);
    const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const wetMix = ecosystem.update(deltaTime);
    ecosystem.draw(wetMix);
    if (firstFrame) {
      firstFrame = false;
      requestAnimationFrame(() => loadingPanel.classList.add('ready'));
    }
  }
  requestAnimationFrame(animate);
})();
