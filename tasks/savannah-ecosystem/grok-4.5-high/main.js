/**
 * African Savannah Ecosystem — Canvas 2D
 * Classes: ParticlePool, WeatherManager, SeasonManager, Lion, Elephant, Leopard, World
 */
(() => {
  'use strict';

  const WEATHERS = ['sunny', 'rain', 'heavy', 'snow', 'thunder', 'tornado'];
  const WEATHER_LABEL = {
    sunny: 'SUNNY', rain: 'RAIN', heavy: 'HEAVY', snow: 'SNOW',
    thunder: 'STORM', tornado: 'TORNADO',
  };
  const SEASON_AUTO_SEC = 60;

  // ─── Object Pool ───────────────────────────────────────────────────────────
  class ParticlePool {
    constructor(max = 800) {
      this.max = max;
      this.pool = [];
      this.active = [];
      for (let i = 0; i < max; i++) {
        this.pool.push(this._blank());
      }
    }

    _blank() {
      return {
        x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
        size: 2, alpha: 1, color: '#fff', kind: 'rain',
        rot: 0, rotV: 0, active: false,
      };
    }

    acquire(init) {
      let p = this.pool.pop();
      if (!p) {
        // Hard cap: recycle oldest active instead of growing
        if (this.active.length) {
          p = this.active.shift();
        } else {
          p = this._blank();
        }
      }
      p.active = true;
      p.x = init.x || 0;
      p.y = init.y || 0;
      p.vx = init.vx || 0;
      p.vy = init.vy || 0;
      p.life = 0;
      p.maxLife = init.maxLife || 1;
      p.size = init.size || 2;
      p.alpha = init.alpha != null ? init.alpha : 1;
      p.color = init.color || '#fff';
      p.kind = init.kind || 'rain';
      p.rot = init.rot || 0;
      p.rotV = init.rotV || 0;
      this.active.push(p);
      return p;
    }

    release(p, index) {
      p.active = false;
      this.active.splice(index, 1);
      if (this.pool.length < this.max) this.pool.push(p);
    }

    /** Release all active particles back to the pool (weather switch). */
    clear() {
      while (this.active.length) {
        const p = this.active.pop();
        p.active = false;
        if (this.pool.length < this.max) this.pool.push(p);
      }
    }

    update(dt, integrate) {
      for (let i = this.active.length - 1; i >= 0; i--) {
        const p = this.active[i];
        p.life += dt;
        if (integrate) integrate(p, dt);
        if (p.life >= p.maxLife || p.y > 2000 || p.x < -50 || p.x > 4000) {
          this.release(p, i);
        }
      }
    }

    get count() {
      return this.active.length;
    }
  }

  // ─── Season Manager ────────────────────────────────────────────────────────
  class SeasonManager {
    constructor() {
      this.season = 'wet'; // 'wet' | 'dry'
      this.t = 0;
      this.blend = 1; // 0..1 toward current season look
      this.target = 'wet';
    }

    toggle() {
      this.set(this.season === 'wet' ? 'dry' : 'wet');
    }

    set(s) {
      if (s === this.target) return;
      this.target = s;
      this.blend = 0;
    }

    update(dt) {
      this.t += dt;
      if (this.t >= SEASON_AUTO_SEC) {
        this.t = 0;
        this.toggle();
      }
      if (this.blend < 1) {
        this.blend = Math.min(1, this.blend + dt * 0.6);
        if (this.blend >= 1) this.season = this.target;
      }
      // During transition, treat "effective" as target for behaviour once halfway
      if (this.blend > 0.5) this.season = this.target;
    }

    get isWet() {
      return this.season === 'wet';
    }

    /** Behaviour multipliers used by animals */
    get activity() {
      return this.isWet ? 1.25 : 0.85;
    }

    get flockPull() {
      // Dry season → stronger clustering
      return this.isWet ? 0.35 : 1.0;
    }

    palette() {
      if (this.isWet) {
        return {
          skyTop: '#4a8ec4',
          skyBot: '#c8dff0',
          farHill: '#6a8a5a',
          midHill: '#7a9a48',
          grass: '#8cb84a',
          grassDark: '#6a9438',
          dirt: '#c4a060',
          bright: 1.05,
        };
      }
      return {
        skyTop: '#d4a060',
        skyBot: '#f0d090',
        farHill: '#b08a4a',
        midHill: '#c49a50',
        grass: '#c4b060',
        grassDark: '#a89040',
        dirt: '#d4b070',
        bright: 1.15,
      };
    }
  }

  // ─── Weather Manager ───────────────────────────────────────────────────────
  class WeatherManager {
    constructor(pool) {
      this.pool = pool;
      this.weather = 'sunny';
      this.puddles = []; // ground wetness circles
      this.bolts = [];   // lightning flashes
      this.tornado = null;
      this.flash = 0;
      this.thunderTimer = 0;
    }

    setWeather(w) {
      if (w === this.weather) return;
      this.weather = w;
      // Recycle all weather particles on switch
      this.pool.clear();
      this.bolts.length = 0;
      this.flash = 0;
      if (w !== 'tornado') this.tornado = null;
      if (w === 'tornado') {
        this.tornado = { x: 80, y: 0, targetId: null, spin: 0 };
      }
      if (w === 'sunny' || w === 'snow') {
        // Puddles dry slowly; leave them to fade in update
      }
    }

    /**
     * Lightning safe-zone algorithm:
     * Sample candidate strike X positions; reject any within SAFE radius of an animal.
     * Prefer mid-sky gaps between animals; fall back to edges if crowded.
     */
    pickSafeStrikeX(animals, W, safeR = 55) {
      const candidates = [];
      const step = Math.max(40, W / 12);
      for (let x = step; x < W - step; x += step) {
        let ok = true;
        for (const a of animals) {
          if (Math.abs(a.x - x) < safeR + a.radius) {
            ok = false;
            break;
          }
        }
        if (ok) candidates.push(x);
      }
      if (candidates.length) {
        return candidates[(Math.random() * candidates.length) | 0];
      }
      // Fallback: farthest from nearest animal
      let bestX = W * 0.5;
      let bestDist = -1;
      for (let x = 20; x < W - 20; x += 15) {
        let minD = Infinity;
        for (const a of animals) minD = Math.min(minD, Math.abs(a.x - x));
        if (minD > bestDist) {
          bestDist = minD;
          bestX = x;
        }
      }
      return bestX;
    }

    spawn(dt, W, H, animals, season) {
      const w = this.weather;
      const rate = (n) => {
        // expected particles this frame
        const k = n * dt;
        const whole = k | 0;
        for (let i = 0; i < whole; i++) this._one(w, W, H, season);
        if (Math.random() < k - whole) this._one(w, W, H, season);
      };

      if (w === 'rain') rate(90);
      else if (w === 'heavy') rate(220);
      else if (w === 'snow') {
        // Snow rarer in wet season (availability rule)
        rate(season.isWet ? 25 : 100);
      } else if (w === 'thunder') {
        rate(160);
        this.thunderTimer -= dt;
        if (this.thunderTimer <= 0) {
          this.thunderTimer = 1.2 + Math.random() * 2.5;
          this._strike(animals, W, H);
        }
      } else if (w === 'tornado') {
        rate(40); // debris
        this._updateTornado(dt, animals, W, H);
      } else if (w === 'sunny') {
        // occasional dust motes in dry season
        if (!season.isWet) rate(8);
      }

      // Puddles grow in rain, shrink otherwise
      if (w === 'rain' || w === 'heavy' || w === 'thunder') {
        if (Math.random() < dt * (w === 'heavy' ? 3 : 1.2)) {
          this.puddles.push({
            x: Math.random() * W,
            y: H * (0.72 + Math.random() * 0.2),
            r: 8 + Math.random() * 18,
            a: 0.25,
          });
          if (this.puddles.length > 40) this.puddles.shift();
        }
      } else {
        for (const p of this.puddles) p.a -= dt * 0.08;
        this.puddles = this.puddles.filter((p) => p.a > 0.02);
      }

      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    }

    _one(w, W, H, season) {
      if (w === 'rain' || w === 'heavy' || w === 'thunder') {
        const heavy = w === 'heavy';
        this.pool.acquire({
          kind: 'rain',
          x: Math.random() * W * 1.2 - W * 0.1,
          y: -10 - Math.random() * 40,
          vx: -40 - Math.random() * 30,
          vy: 420 + Math.random() * (heavy ? 280 : 120),
          size: heavy ? 10 + Math.random() * 8 : 6 + Math.random() * 5,
          maxLife: 1.2,
          color: 'rgba(180,210,255,0.7)',
          alpha: heavy ? 0.7 : 0.5,
        });
      } else if (w === 'snow') {
        this.pool.acquire({
          kind: 'snow',
          x: Math.random() * W,
          y: -8,
          vx: (Math.random() - 0.5) * 30,
          vy: 35 + Math.random() * 50,
          size: 2 + Math.random() * 3.5,
          maxLife: 6,
          color: '#ffffff',
          alpha: 0.85,
          rotV: (Math.random() - 0.5) * 3,
        });
      } else if (w === 'tornado') {
        const t = this.tornado;
        if (!t) return;
        this.pool.acquire({
          kind: 'debris',
          x: t.x + (Math.random() - 0.5) * 30,
          y: H * 0.75 - Math.random() * 80,
          vx: (Math.random() - 0.5) * 80,
          vy: -60 - Math.random() * 100,
          size: 2 + Math.random() * 4,
          maxLife: 1.5,
          color: season.isWet ? '#8a7a50' : '#c4a868',
          alpha: 0.8,
          rotV: (Math.random() - 0.5) * 8,
        });
      } else if (w === 'sunny') {
        this.pool.acquire({
          kind: 'dust',
          x: Math.random() * W,
          y: H * (0.55 + Math.random() * 0.3),
          vx: 20 + Math.random() * 40,
          vy: (Math.random() - 0.5) * 10,
          size: 1 + Math.random() * 2,
          maxLife: 2.5,
          color: '#e8d4a0',
          alpha: 0.35,
        });
      }
    }

    _strike(animals, W, H) {
      const x = this.pickSafeStrikeX(animals, W, 58);
      const segments = [];
      let cx = x;
      let cy = 0;
      const groundY = H * 0.78;
      while (cy < groundY) {
        const nx = cx + (Math.random() - 0.5) * 28;
        const ny = cy + 18 + Math.random() * 22;
        segments.push({ x1: cx, y1: cy, x2: nx, y2: Math.min(ny, groundY) });
        cx = nx;
        cy = ny;
      }
      this.bolts.push({ segments, life: 0.18, maxLife: 0.18 });
      this.flash = 1;

      // Splash sparks at impact (still not on animals — x was safe)
      for (let i = 0; i < 12; i++) {
        this.pool.acquire({
          kind: 'spark',
          x: cx,
          y: groundY,
          vx: (Math.random() - 0.5) * 120,
          vy: -80 - Math.random() * 100,
          size: 2,
          maxLife: 0.4,
          color: '#ffffcc',
          alpha: 1,
        });
      }
    }

    /** Tornado chases nearest animal, but slowly */
    _updateTornado(dt, animals, W, H) {
      if (!this.tornado) return;
      const t = this.tornado;
      t.spin += dt * 8;

      let nearest = null;
      let best = Infinity;
      for (const a of animals) {
        const d = Math.abs(a.x - t.x);
        if (d < best) {
          best = d;
          nearest = a;
        }
      }
      if (nearest) {
        // Slow chase
        const dir = Math.sign(nearest.x - t.x) || 0;
        t.x += dir * 38 * dt; // slower than leopards
        t.x = Math.max(40, Math.min(W - 40, t.x));
      }

      // Spiral suction particles near funnel
      if (Math.random() < dt * 50) {
        const ang = Math.random() * Math.PI * 2;
        const r = 10 + Math.random() * 40;
        this.pool.acquire({
          kind: 'debris',
          x: t.x + Math.cos(ang) * r,
          y: H * 0.78 - Math.random() * 20,
          vx: Math.cos(ang + 1.2) * 60,
          vy: -90 - Math.random() * 80,
          size: 2 + Math.random() * 3,
          maxLife: 1.2,
          color: '#a89060',
          alpha: 0.75,
          rotV: 6,
        });
      }
    }

    updateParticles(dt, W, H) {
      const tornado = this.tornado;
      this.pool.update(dt, (p, d) => {
        if (p.kind === 'snow') {
          p.vx += Math.sin(p.life * 3 + p.x * 0.01) * 20 * d;
        }
        if (p.kind === 'debris' && tornado) {
          // Spiral toward funnel
          const dx = tornado.x - p.x;
          p.vx += dx * 1.5 * d;
          p.vy -= 20 * d;
        }
        p.x += p.vx * d;
        p.y += p.vy * d;
        p.rot += p.rotV * d;
        if (p.kind === 'rain' && p.y > H * 0.82) p.life = p.maxLife;
      });

      for (let i = this.bolts.length - 1; i >= 0; i--) {
        this.bolts[i].life -= dt;
        if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
      }
    }

    draw(ctx, W, H) {
      // Puddles
      for (const p of this.puddles) {
        ctx.fillStyle = `rgba(60,100,140,${p.a})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Particles
      for (const p of this.pool.active) {
        ctx.save();
        ctx.globalAlpha = p.alpha * Math.max(0, 1 - p.life / p.maxLife);
        if (p.kind === 'rain') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 0.02, p.y + p.size);
          ctx.stroke();
        } else if (p.kind === 'snow') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }
        ctx.restore();
      }

      // Lightning bolts
      for (const b of this.bolts) {
        const a = Math.max(0, b.life / b.maxLife);
        ctx.save();
        ctx.strokeStyle = `rgba(220,240,255,${a})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#aaccff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        for (const s of b.segments) {
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.stroke();
        ctx.restore();
      }

      // Tornado funnel
      if (this.tornado && this.weather === 'tornado') {
        const t = this.tornado;
        const baseY = H * 0.8;
        ctx.save();
        for (let i = 0; i < 8; i++) {
          const yy = baseY - i * (H * 0.07);
          const rr = 28 - i * 2.8 + Math.sin(t.spin + i) * 3;
          ctx.globalAlpha = 0.12 + i * 0.03;
          ctx.fillStyle = '#6a5a40';
          ctx.beginPath();
          ctx.ellipse(t.x + Math.sin(t.spin * 1.5 + i) * 4, yy, rr, rr * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Full-screen lightning flash
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,255,240,${this.flash * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  // ─── Animals ───────────────────────────────────────────────────────────────
  class Animal {
    constructor(type, x, y, packId) {
      this.type = type;
      this.x = x;
      this.y = y;
      this.baseY = y;
      this.packId = packId;
      this.phase = Math.random() * Math.PI * 2;
      this.state = 'walk'; // walk | rest | drink | climb
      this.stateT = 0;
      this.facing = 1;
      this.climbOff = 0;
      this.trunk = 0; // elephant trunk angle
      this.radius = type === 'elephant' ? 28 : type === 'lion' ? 18 : 14;
      this.mood = 'calm';
    }

    baseSpeed(season, weather) {
      let s =
        this.type === 'leopard' ? 95 :
        this.type === 'lion' ? 42 :
        28;
      s *= season.activity;
      if (weather === 'heavy' || weather === 'thunder') s *= 0.75;
      if (weather === 'tornado') s *= 1.15; // flee energy
      if (weather === 'sunny' && !season.isWet) s *= 0.9;
      if (this.state === 'rest' || this.state === 'drink') s = 0;
      if (this.state === 'climb') s *= 0.15;
      return s;
    }

    update(dt, W, H, season, weather, packCenter) {
      this.phase += dt * (this.type === 'leopard' ? 10 : 6);
      this.stateT -= dt;

      // State machine by species
      if (this.stateT <= 0) this._pickState(season, weather);

      const spd = this.baseSpeed(season, weather);

      // Flocking / pack pull in dry season for lions & elephants
      if ((this.type === 'lion' || this.type === 'elephant') && packCenter) {
        const pull = season.flockPull * 18 * dt;
        this.x += Math.sign(packCenter - this.x) * pull;
      }

      // Leopard climb: vertical bob on tree
      if (this.state === 'climb') {
        this.climbOff = Math.min(50, this.climbOff + 40 * dt);
      } else {
        this.climbOff = Math.max(0, this.climbOff - 50 * dt);
      }

      // Elephant trunk animation when drinking
      if (this.state === 'drink') {
        this.trunk = Math.sin(this.phase * 0.5) * 0.6 - 0.4;
      } else if (this.state === 'walk') {
        this.trunk = Math.sin(this.phase * 0.3) * 0.15;
      }

      this.x += spd * dt;
      // Walk bob
      const bob =
        this.state === 'walk'
          ? Math.abs(Math.sin(this.phase)) * (this.type === 'elephant' ? 2 : 3)
          : 0;
      this.y = this.baseY - this.climbOff + bob;

      // Wrap left← when past right
      if (this.x > W + 40) {
        this.x = -40 - Math.random() * 30;
        // Keep state continuity — do not reset state machine fully
      }

      // Mood for optional HUD
      if (weather === 'tornado') this.mood = 'alert';
      else if (weather === 'thunder') this.mood = 'wary';
      else if (this.state === 'rest') this.mood = 'rest';
      else this.mood = season.isWet ? 'active' : 'calm';
    }

    _pickState(season, weather) {
      const r = Math.random();
      if (this.type === 'lion') {
        // Pride: walk / rest / patrol
        if (r < 0.18) {
          this.state = 'rest';
          this.stateT = 1.5 + Math.random() * 2.5;
        } else {
          this.state = 'walk';
          this.stateT = 3 + Math.random() * 5;
        }
      } else if (this.type === 'elephant') {
        if (r < 0.15 * (season.isWet ? 1.4 : 0.7)) {
          this.state = 'drink';
          this.stateT = 2 + Math.random() * 2;
        } else {
          this.state = 'walk';
          this.stateT = 4 + Math.random() * 6;
        }
      } else {
        // Leopard: mostly walk, occasional climb
        if (r < 0.12 && weather !== 'tornado') {
          this.state = 'climb';
          this.stateT = 2 + Math.random() * 2.5;
        } else {
          this.state = 'walk';
          this.stateT = 2 + Math.random() * 4;
        }
      }
      // More rest in dry / heat
      if (!season.isWet && weather === 'sunny' && this.type !== 'leopard' && Math.random() < 0.2) {
        this.state = 'rest';
        this.stateT = 2 + Math.random() * 3;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.type === 'lion') this._drawLion(ctx);
      else if (this.type === 'elephant') this._drawElephant(ctx);
      else this._drawLeopard(ctx);
      ctx.restore();
    }

    _drawLion(ctx) {
      // Body
      ctx.fillStyle = '#c9953a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Mane
      ctx.fillStyle = '#8a5a20';
      ctx.beginPath();
      ctx.arc(12, -4, 10, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.fillStyle = '#d4a84a';
      ctx.beginPath();
      ctx.arc(14, -3, 6, 0, Math.PI * 2);
      ctx.fill();
      // Legs
      ctx.fillStyle = '#b88830';
      const legSwing = this.state === 'walk' ? Math.sin(this.phase) * 4 : 0;
      ctx.fillRect(-10, 6, 3.5, 8 + legSwing * 0.2);
      ctx.fillRect(-2, 6, 3.5, 8 - legSwing * 0.2);
      ctx.fillRect(4, 6, 3.5, 8 + legSwing * 0.15);
      ctx.fillRect(10, 6, 3.5, 8 - legSwing * 0.15);
      // Tail
      ctx.strokeStyle = '#c9953a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-15, -2);
      ctx.quadraticCurveTo(-22, -10 + Math.sin(this.phase) * 3, -20, -14);
      ctx.stroke();
      // Rest indicator
      if (this.state === 'rest') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '9px sans-serif';
        ctx.fillText('z', 8, -16);
      }
    }

    _drawElephant(ctx) {
      ctx.fillStyle = '#8a8a92';
      // Body
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.ellipse(20, -4, 10, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ear
      ctx.fillStyle = '#7a7a84';
      ctx.beginPath();
      ctx.ellipse(16, -8, 8, 12, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // Trunk
      ctx.strokeStyle = '#8a8a92';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(28, 0);
      const trunkY = 12 + this.trunk * 20;
      ctx.quadraticCurveTo(34, 8 + this.trunk * 10, 30 + this.trunk * 8, trunkY);
      ctx.stroke();
      // Tusks
      ctx.strokeStyle = '#f0e8d0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(26, 2);
      ctx.lineTo(32, 8);
      ctx.stroke();
      // Legs
      ctx.fillStyle = '#7a7a82';
      const sw = this.state === 'walk' ? Math.sin(this.phase) * 3 : 0;
      ctx.fillRect(-14, 10, 6, 12 + sw * 0.2);
      ctx.fillRect(-4, 10, 6, 12 - sw * 0.2);
      ctx.fillRect(6, 10, 6, 12 + sw * 0.15);
      ctx.fillRect(14, 10, 6, 12 - sw * 0.15);
      if (this.state === 'drink') {
        ctx.fillStyle = 'rgba(100,160,200,0.4)';
        ctx.beginPath();
        ctx.ellipse(30, 22, 10, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _drawLeopard(ctx) {
      ctx.fillStyle = '#d4a050';
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Spots
      ctx.fillStyle = '#3a2a18';
      [[-4, -2], [2, 1], [6, -3], [-8, 1], [0, 2]].forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
      // Head
      ctx.fillStyle = '#d4a050';
      ctx.beginPath();
      ctx.arc(12, -2, 5, 0, Math.PI * 2);
      ctx.fill();
      // Legs
      ctx.fillStyle = '#c09040';
      const sw = this.state === 'walk' ? Math.sin(this.phase) * 5 : 0;
      ctx.fillRect(-8, 5, 2.5, 7 + sw * 0.2);
      ctx.fillRect(-2, 5, 2.5, 7 - sw * 0.2);
      ctx.fillRect(4, 5, 2.5, 7 + sw * 0.15);
      ctx.fillRect(8, 5, 2.5, 7 - sw * 0.15);
      // Tail
      ctx.strokeStyle = '#d4a050';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -1);
      ctx.quadraticCurveTo(-18, -8, -16, -12);
      ctx.stroke();
      if (this.state === 'climb') {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '8px sans-serif';
        ctx.fillText('↑', -4, -12);
      }
    }
  }

  // ─── World / Background ────────────────────────────────────────────────────
  class World {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.W = 0;
      this.H = 0;
      this.pool = new ParticlePool(900);
      this.season = new SeasonManager();
      this.weather = new WeatherManager(this.pool);
      this.animals = [];
      this.trees = [];
      this.cloudPhase = 0;
      this.grassPhase = 0;
      this._initAnimals();
      this.resize();
    }

    _initAnimals() {
      // 2 lions (pride pack 0), 2 elephants (herd pack 1), 2 leopards (solo)
      this.animals = [
        new Animal('lion', 40, 0, 0),
        new Animal('lion', 90, 0, 0),
        new Animal('elephant', 160, 0, 1),
        new Animal('elephant', 220, 0, 1),
        new Animal('leopard', 300, 0, -1),
        new Animal('leopard', 380, 0, -1),
      ];
      // Slight lane offsets
      this.animals.forEach((a, i) => {
        a.lane = i % 3;
      });
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = w;
      this.H = h;

      // Place animals on ground lanes
      const ground = h * 0.78;
      this.animals.forEach((a, i) => {
        a.baseY = ground - 8 - a.lane * 10;
        if (!a._placed) {
          a.x = 30 + i * (w / 7);
          a._placed = true;
        }
      });

      // Trees for leopards to climb near
      this.trees = [];
      for (let i = 0; i < 5; i++) {
        this.trees.push({
          x: (i + 0.5) * (w / 5) + (i % 2) * 20,
          h: 40 + (i % 3) * 12,
        });
      }
    }

    packCenter(packId) {
      let s = 0, n = 0;
      for (const a of this.animals) {
        if (a.packId === packId) {
          s += a.x;
          n++;
        }
      }
      return n ? s / n : null;
    }

    update(dt) {
      this.season.update(dt);
      this.cloudPhase += dt * 0.15;
      this.grassPhase += dt * 2;

      this.weather.spawn(dt, this.W, this.H, this.animals, this.season);
      this.weather.updateParticles(dt, this.W, this.H);

      for (const a of this.animals) {
        const pc = a.packId >= 0 ? this.packCenter(a.packId) : null;
        a.update(dt, this.W, this.H, this.season, this.weather.weather, pc);
      }
    }

    draw() {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      const pal = this.season.palette();
      const bright = pal.bright;

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(1, pal.skyBot);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Sun / mood disc
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = this.season.isWet ? '#ffe89a' : '#ffcc55';
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.16, this.season.isWet ? 18 : 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Far hills (parallax layer 1)
      this._hills(ctx, W, H * 0.52, H * 0.18, pal.farHill, 0.5, this.cloudPhase * 8);
      // Mid hills
      this._hills(ctx, W, H * 0.58, H * 0.16, pal.midHill, 0.8, this.cloudPhase * 14);

      // Clouds
      this._clouds(ctx, W, H);

      // Grass ground
      const groundY = H * 0.7;
      const grass = ctx.createLinearGradient(0, groundY, 0, H);
      grass.addColorStop(0, pal.grass);
      grass.addColorStop(1, pal.grassDark);
      ctx.fillStyle = grass;
      ctx.fillRect(0, groundY, W, H - groundY);

      // Dirt path
      ctx.fillStyle = pal.dirt;
      ctx.beginPath();
      ctx.ellipse(W * 0.5, H * 0.88, W * 0.55, H * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // Grass blades
      ctx.strokeStyle = pal.grassDark;
      ctx.lineWidth = 1;
      for (let i = 0; i < 60; i++) {
        const gx = ((i * 47 + this.grassPhase * 5) % W);
        const gy = groundY + 8 + (i % 5) * 6;
        const sway = Math.sin(this.grassPhase + i) * 3;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.quadraticCurveTo(gx + sway, gy - 8, gx + sway * 1.2, gy - 14);
        ctx.stroke();
      }

      // Trees
      for (const t of this.trees) this._tree(ctx, t.x, groundY + 5, t.h);

      // Puddles + weather under animals slightly for rain, but animals on top
      this.weather.draw(ctx, W, H);

      // Animals sorted by y for depth
      const sorted = this.animals.slice().sort((a, b) => a.y - b.y);
      for (const a of sorted) a.draw(ctx);

      // Vignette / weather dimming
      if (this.weather.weather === 'thunder' || this.weather.weather === 'heavy') {
        ctx.fillStyle = 'rgba(20,30,50,0.12)';
        ctx.fillRect(0, 0, W, H);
      }
      if (this.weather.weather === 'tornado') {
        ctx.fillStyle = 'rgba(60,50,30,0.1)';
        ctx.fillRect(0, 0, W, H);
      }

      // Brightness wash
      if (bright > 1) {
        ctx.fillStyle = `rgba(255,230,150,${(bright - 1) * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    _hills(ctx, W, baseY, amp, color, scale, offset) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, this.H);
      ctx.lineTo(0, baseY);
      for (let x = 0; x <= W; x += 20) {
        const y =
          baseY +
          Math.sin(x * 0.01 * scale + offset * 0.02) * amp * 0.4 +
          Math.sin(x * 0.02 + 1) * amp * 0.25;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, this.H);
      ctx.closePath();
      ctx.fill();
    }

    _clouds(ctx, W, H) {
      ctx.fillStyle = this.season.isWet
        ? 'rgba(255,255,255,0.55)'
        : 'rgba(255,240,200,0.35)';
      for (let i = 0; i < 5; i++) {
        const x = ((this.cloudPhase * 20 * (0.5 + i * 0.2) + i * 120) % (W + 100)) - 50;
        const y = 20 + i * 12;
        ctx.beginPath();
        ctx.ellipse(x, y, 28 + i * 3, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 18, y + 2, 20, 10, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 16, y + 3, 16, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _tree(ctx, x, groundY, h) {
      // Acacia-ish
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(x - 3, groundY - h, 6, h);
      ctx.fillStyle = '#3d6b28';
      ctx.beginPath();
      ctx.ellipse(x, groundY - h, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a8030';
      ctx.beginPath();
      ctx.ellipse(x - 8, groundY - h + 4, 14, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 10, groundY - h + 3, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────
  const canvas = document.getElementById('c');
  const world = new World(canvas);
  const seasonBadge = document.getElementById('season-badge');
  const weatherBadge = document.getElementById('weather-badge');
  const statsEl = document.getElementById('stats');
  const seasonBtn = document.getElementById('btn-season');
  const weatherBtns = [...document.querySelectorAll('[data-weather]')];

  function setWeather(w) {
    world.weather.setWeather(w);
    weatherBtns.forEach((b) => b.classList.toggle('active', b.dataset.weather === w));
    weatherBadge.textContent = WEATHER_LABEL[w] || w.toUpperCase();
  }

  function syncSeasonUI() {
    const wet = world.season.target === 'wet' || world.season.season === 'wet';
    const label = world.season.season === 'wet' ? 'WET' : 'DRY';
    seasonBadge.textContent = label;
    seasonBtn.textContent = world.season.season === 'wet' ? '🌿 Wet' : '🏜️ Dry';
    seasonBtn.classList.toggle('active', true);
  }

  weatherBtns.forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      setWeather(b.dataset.weather);
    });
  });

  seasonBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    world.season.toggle();
    world.season.t = 0;
    syncSeasonUI();
  });

  // Keyboard: 1-6 weather, S season
  addEventListener('keydown', (e) => {
    const map = { '1': 'sunny', '2': 'rain', '3': 'heavy', '4': 'snow', '5': 'thunder', '6': 'tornado' };
    if (map[e.key]) setWeather(map[e.key]);
    if (e.key === 's' || e.key === 'S') {
      world.season.toggle();
      world.season.t = 0;
      syncSeasonUI();
    }
  });

  addEventListener('resize', () => world.resize());

  setWeather('sunny');
  syncSeasonUI();

  let last = performance.now();
  let fpsA = 0, fpsN = 0, fps = 60;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    world.update(dt);
    world.draw();

    fpsA += dt;
    fpsN++;
    if (fpsA >= 0.5) {
      fps = Math.round(fpsN / fpsA);
      fpsA = 0;
      fpsN = 0;
      syncSeasonUI();
      statsEl.textContent = `${fps}fps · ${world.pool.count}p · ${world.animals.length} animals`;
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
