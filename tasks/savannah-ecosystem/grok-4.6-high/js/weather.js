/* Weather manager: one active weather, pooled particles, lightning that
   never strikes wildlife, and a slow-chasing tornado. */
(function (global) {
  "use strict";

  const U = function () { return global.Utils; };

  const WEATHERS = ["sunny", "rain", "heavyRain", "snow", "thunderstorm", "tornado"];

  const LABELS = {
    sunny: "Sunny",
    rain: "Rain",
    heavyRain: "Heavy Rain",
    snow: "Snow",
    thunderstorm: "Thunderstorm",
    tornado: "Tornado"
  };

  const WIND = {
    sunny: 10,
    rain: 46,
    heavyRain: 95,
    snow: 22,
    thunderstorm: 78,
    tornado: 150
  };

  const SPEED_MUL = {
    sunny: 1.0,
    rain: 0.88,
    heavyRain: 0.68,
    snow: 0.52,
    thunderstorm: 0.8,
    tornado: 1.12
  };

  function WeatherManager() {
    this.type = "sunny";
    this.particles = new ParticleSystem(1800);
    this.puddles = [];
    this.tornado = null;
    this.bolts = [];
    this.flash = 0;
    this.strikeCd = 2.5;
    this.spawnAcc = 0;
    this.wind = WIND.sunny;
    this.targetWind = WIND.sunny;
    this.dim = 0;
    this.targetDim = 0;
    this.snowCover = 0;
    this._splashBudget = 0;
  }

  WeatherManager.prototype.label = function () {
    return LABELS[this.type] || this.type;
  };

  WeatherManager.prototype.speedMul = function () {
    return SPEED_MUL[this.type] || 1;
  };

  /**
   * Weather change: every live particle is released back into the pool
   * immediately so raindrops cannot leak across a sunny sky. Puddles fade
   * rather than vanish; the tornado instance is dropped (debris dies on
   * the next update when `env.tornado` is null). Animal state is not
   * touched.
   */
  WeatherManager.prototype.setWeather = function (type) {
    if (WEATHERS.indexOf(type) < 0) return;
    if (type === this.type) return;
    this.particles.clear();
    this.bolts.length = 0;
    this.flash = 0;
    this.type = type;
    this.targetWind = WIND[type];
    this.targetDim = type === "thunderstorm" ? 0.42
      : type === "heavyRain" ? 0.22
      : type === "rain" ? 0.1
      : type === "tornado" ? 0.28
      : type === "snow" ? 0.08
      : 0;
    if (type !== "rain" && type !== "heavyRain" && type !== "thunderstorm") {
      for (let i = 0; i < this.puddles.length; i++) this.puddles[i].fading = true;
    }
    if (type === "tornado") {
      this.tornado = {
        x: 80,
        y: 0,
        vx: 0,
        vy: 0,
        height: 180,
        radius: 28,
        angle: 0,
        wobble: Math.random() * 10
      };
    } else {
      this.tornado = null;
    }
  };

  WeatherManager.prototype.resizeBudget = function (w, h) {
    const small = w * h < 90000;
    this.particles.setBudget(small ? 220 : w * h < 250000 ? 700 : 1400);
    const pool = this.particles.pool;
    const live = pool.live;
    while (live.length > this.particles.budget) {
      const p = live.pop();
      p.alive = false;
      if (pool.reset) pool.reset(p);
      pool.free.push(p);
    }
  };

  WeatherManager.prototype._fit = function (season, key) {
    const m = season.mods;
    if (this.type === "snow") return m.snowFit;
    if (this.type === "rain" || this.type === "heavyRain") return m.rainFit;
    if (this.type === "thunderstorm") return m.stormFit;
    if (this.type === "tornado") return m.tornadoFit;
    if (this.type === "sunny") return m.sunnyFit;
    return 1;
  };

  WeatherManager.prototype._spawnRain = function (n, env, heavy) {
    const ground = env.groundY;
    for (let i = 0; i < n; i++) {
      this.particles.spawn(function (p) {
        p.type = heavy ? "heavy" : "rain";
        p.x = U().rand(-20, env.w + 40);
        p.y = U().rand(-80, ground * 0.5);
        p.vy = heavy ? U().rand(520, 760) : U().rand(380, 560);
        p.wind = U().rand(-8, 8);
        p.life = p.maxLife = U().rand(0.9, 1.6);
        p.size = heavy ? 1.3 : 1;
        p.layer = 1;
      });
    }
  };

  WeatherManager.prototype._spawnSnow = function (n, env) {
    for (let i = 0; i < n; i++) {
      this.particles.spawn(function (p) {
        p.type = "snow";
        p.x = U().rand(-10, env.w + 10);
        p.y = U().rand(-40, env.groundY * 0.4);
        p.vy = U().rand(28, 62);
        p.size = U().rand(1.4, 3.4);
        p.rot = U().rand(0, Math.PI * 2);
        p.spin = U().rand(-1.2, 1.2);
        p.life = p.maxLife = U().rand(4, 8);
        p.layer = 1;
      });
    }
  };

  WeatherManager.prototype._spawnDust = function (n, env) {
    for (let i = 0; i < n; i++) {
      this.particles.spawn(function (p) {
        p.type = "dust";
        p.x = U().rand(0, env.w);
        p.y = U().rand(env.groundY * 0.45, env.groundY);
        p.vx = U().rand(8, 28);
        p.vy = U().rand(-6, 4);
        p.size = U().rand(1.2, 3.5);
        p.rot = U().rand(0, 6);
        p.spin = U().rand(-1, 1);
        p.life = p.maxLife = U().rand(2.2, 4.5);
        p.layer = 0;
      });
    }
  };

  WeatherManager.prototype._spawnDebris = function (n, env) {
    const t = this.tornado;
    if (!t) return;
    for (let i = 0; i < n; i++) {
      this.particles.spawn(function (p) {
        p.type = "debris";
        p.orbitA = U().rand(0, Math.PI * 2);
        p.orbitR = U().rand(t.radius * 0.6, t.radius * 2.2);
        p.orbitH = U().rand(0, 24);
        p.spin = U().rand(4, 9) * (Math.random() < 0.5 ? -1 : 1);
        p.size = U().rand(1.5, 4);
        p.rot = U().rand(0, 6);
        p.life = p.maxLife = U().rand(1.4, 2.8);
        p.layer = 1;
        p.x = t.x;
        p.y = t.y;
      });
    }
  };

  WeatherManager.prototype._maybePuddle = function (env) {
    if (this.puddles.length >= 14) return;
    if (!U().chance(0.35)) return;
    this.puddles.push({
      x: U().rand(env.w * 0.05, env.w * 0.95),
      y: env.groundY + U().rand(4, 16),
      rx: U().rand(16, 42),
      ry: U().rand(4, 9),
      a: 0,
      fading: false
    });
  };

  /**
   * Lightning safe-zone algorithm
   *
   * Animals occupy exclusion disks of radius max(36, bodyW*0.7)+28. We
   * sample strike columns every 14px, score each by its minimum distance
   * to any animal (maximin), and reject any column inside an exclusion
   * disk. If the herd packs the whole width we still pick the maximin
   * column — then the bolt polyline jogs around any AABB it would clip,
   * so a strike is never drawn through a body. Ground contact is the
   * chosen column; the sky origin may wander a little for a jagged look.
   */
  WeatherManager.prototype._safeStrikeX = function (env, animals) {
    const w = env.w;
    const margin = 24;
    let bestX = w * 0.5;
    let bestScore = -1;
    let bestLegal = -1;
    let bestLegalX = bestX;
    const step = 14;
    for (let x = margin; x <= w - margin; x += step) {
      let minD = 1e9;
      let legal = true;
      for (let i = 0; i < animals.length; i++) {
        const a = animals[i];
        const r = Math.max(36, a.bodyW * 0.7) + 28;
        const d = Math.abs(x - a.x);
        if (d < r) legal = false;
        if (d < minD) minD = d;
      }
      if (minD > bestScore) {
        bestScore = minD;
        bestX = x;
      }
      if (legal && minD > bestLegal) {
        bestLegal = minD;
        bestLegalX = x;
      }
    }
    const pick = bestLegal >= 0 ? bestLegalX : bestX;
    return pick + U().rand(-5, 5);
  };

  WeatherManager.prototype._buildBolt = function (x, env, animals) {
    const pts = [];
    let px = x + U().rand(-18, 18);
    let py = -6;
    const ground = env.groundY;
    pts.push({ x: px, y: py });
    const segs = 12;
    for (let i = 1; i <= segs; i++) {
      py = (ground + 4) * (i / segs);
      px += U().rand(-16, 16);
      for (let k = 0; k < animals.length; k++) {
        const a = animals[k];
        const hw = a.hitR || a.bodyW * 0.55 + 10;
        const top = a.y - (a.hitH || a.bodyH || 28);
        const bot = a.y + 8;
        if (py > top && py < bot && Math.abs(px - a.x) < hw) {
          const dir = px >= a.x ? 1 : -1;
          px = a.x + dir * (hw + 14);
        }
      }
      pts.push({ x: px, y: py });
    }
    pts.push({ x: x, y: ground + 6 });
    return pts;
  };

  WeatherManager.prototype._strike = function (env, animals) {
    const x = this._safeStrikeX(env, animals);
    const bolt = {
      pts: this._buildBolt(x, env, animals),
      life: 0.16,
      max: 0.16,
      x: x
    };
    this.bolts.push(bolt);
    this.flash = 0.18;
    const self = this;
    for (let i = 0; i < 10; i++) {
      this.particles.spawn(function (p) {
        p.type = "spark";
        p.x = x + U().rand(-8, 8);
        p.y = env.groundY + U().rand(-6, 2);
        p.vx = U().rand(-70, 70);
        p.vy = U().rand(-160, -40);
        p.size = U().rand(1, 2.2);
        p.life = p.maxLife = U().rand(0.18, 0.4);
        p.layer = 1;
      });
    }
  };

  /**
   * Tornado pursuit: argmin distance to any animal, then exponentially
   * smooth velocity toward that target at ~30 px/s (much slower than a
   * leopard dash). A low-frequency wobble keeps the funnel from looking
   * like a homing missile. Animals are not reset; nearby ones receive a
   * small flee impulse from WildlifeSystem.
   */
  WeatherManager.prototype._updateTornado = function (dt, env, animals) {
    const t = this.tornado;
    if (!t) return;
    t.y = env.groundY;
    t.height = env.groundY * 0.92;
    t.radius = Math.max(18, env.h * 0.07);
    let nearest = null;
    let best = 1e9;
    for (let i = 0; i < animals.length; i++) {
      const a = animals[i];
      const d = Math.abs(a.x - t.x);
      if (d < best) {
        best = d;
        nearest = a;
      }
    }
    let desired = 0;
    if (nearest) {
      const dir = nearest.x >= t.x ? 1 : -1;
      desired = dir * 30;
    }
    t.wobble += dt;
    desired += Math.sin(t.wobble * 0.7) * 10;
    const k = 1 - Math.exp(-1.8 * dt);
    t.vx += (desired - t.vx) * k;
    t.x += t.vx * dt;
    if (t.x < 30) { t.x = 30; t.vx = Math.abs(t.vx) * 0.4; }
    if (t.x > env.w - 30) { t.x = env.w - 30; t.vx = -Math.abs(t.vx) * 0.4; }
    t.angle += dt * 5;
  };

  WeatherManager.prototype.update = function (dt, env, season, animals) {
    this.wind += (this.targetWind - this.wind) * Math.min(1, dt * 1.4);
    this.dim += (this.targetDim - this.dim) * Math.min(1, dt * 1.6);
    this.flash = Math.max(0, this.flash - dt);
    this.strikeCd -= dt;
    this._splashBudget = 8;

    const fit = this._fit(season, this.type);
    const small = env.w < 400 || env.h < 240;
    const rateScale = (small ? 0.45 : 1) * fit;

    if (this.type === "rain") {
      this._spawnRain(Math.ceil(18 * rateScale), env, false);
      if (U().chance(0.04 * fit)) this._maybePuddle(env);
    } else if (this.type === "heavyRain") {
      this._spawnRain(Math.ceil(36 * rateScale), env, true);
      if (U().chance(0.08 * fit)) this._maybePuddle(env);
    } else if (this.type === "thunderstorm") {
      this._spawnRain(Math.ceil(22 * rateScale), env, true);
      if (U().chance(0.05 * fit)) this._maybePuddle(env);
      if (this.strikeCd <= 0) {
        this._strike(env, animals);
        this.strikeCd = U().rand(1.8, 4.2) / Math.max(0.6, season.mods.stormFit);
      }
    } else if (this.type === "snow") {
      this._spawnSnow(Math.ceil(4 * rateScale), env);
      this.snowCover = Math.min(1, this.snowCover + dt * 0.08 * fit);
    } else if (this.type === "sunny") {
      if (U().chance(0.35 * fit)) this._spawnDust(1, env);
      this.snowCover = Math.max(0, this.snowCover - dt * 0.15);
    } else if (this.type === "tornado") {
      this._updateTornado(dt, env, animals);
      this._spawnDebris(Math.ceil(3 * rateScale), env);
      if (U().chance(0.4)) this._spawnDust(2, env);
      if (U().chance(0.12)) {
        this.particles.spawn(function (p) {
          p.type = "petal";
          p.x = env.tornado ? env.tornado.x + U().rand(-40, 40) : U().rand(0, env.w);
          p.y = env.groundY - U().rand(0, 30);
          p.vx = U().rand(-40, 40);
          p.vy = U().rand(-90, -20);
          p.size = U().rand(2, 5);
          p.spin = U().rand(-4, 4);
          p.life = p.maxLife = U().rand(0.8, 1.6);
          p.layer = 1;
        });
      }
    }

    if (this.type !== "snow") this.snowCover = Math.max(0, this.snowCover - dt * 0.1);

    const self = this;
    env.tornado = this.tornado;
    env.wind = this.wind;
    env.spawnSplash = function (x, y) {
      if (self._splashBudget <= 0) return;
      self._splashBudget--;
      self.particles.spawn(function (p) {
        p.type = "splash";
        p.x = x;
        p.y = y;
        p.vx = U().rand(-40, 40);
        p.vy = U().rand(-90, -30);
        p.size = U().rand(0.8, 1.8);
        p.life = p.maxLife = 0.28;
        p.layer = 1;
      });
    };

    this.particles.update(dt, env);

    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const puddle = this.puddles[i];
      puddle.y = env.groundY + 8;
      if (puddle.fading) puddle.a -= dt * 0.35;
      else puddle.a = Math.min(0.45, puddle.a + dt * 0.2);
      if (puddle.a <= 0) this.puddles.splice(i, 1);
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
  };

  WeatherManager.prototype.drawBehind = function (ctx, env) {
    this.particles.draw(ctx, 0);
    for (let i = 0; i < this.puddles.length; i++) {
      const p = this.puddles[i];
      ctx.fillStyle = "rgba(40,90,110," + p.a + ")";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(180,220,230," + (p.a * 0.45) + ")";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  WeatherManager.prototype.drawTornado = function (ctx, env) {
    const t = this.tornado;
    if (!t) return;
    ctx.save();
    const h = t.height;
    const base = t.radius;
    ctx.translate(t.x, t.y);
    const g = ctx.createLinearGradient(0, 0, 0, -h);
    g.addColorStop(0, "rgba(90,70,50,0.55)");
    g.addColorStop(0.5, "rgba(130,120,110,0.32)");
    g.addColorStop(1, "rgba(180,180,180,0.08)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-base, 0);
    const waves = 8;
    for (let i = 0; i <= waves; i++) {
      const u = i / waves;
      const y = -h * u;
      const r = U().lerp(base, 7, u) + Math.sin(t.angle * 2 + u * 8) * (6 * (1 - u));
      ctx.lineTo(r, y);
    }
    for (let i = waves; i >= 0; i--) {
      const u = i / waves;
      const y = -h * u;
      const r = U().lerp(base, 7, u) + Math.sin(t.angle * 2 + u * 8) * (6 * (1 - u));
      ctx.lineTo(-r, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(60,40,25,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 4, base * 1.6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  WeatherManager.prototype.drawFront = function (ctx, env) {
    this.drawTornado(ctx, env);
    this.particles.draw(ctx, 1);
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      const a = b.life / b.max;
      ctx.strokeStyle = "rgba(255,255,240," + (0.95 * a) + ")";
      ctx.lineWidth = 2.4;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let k = 1; k < b.pts.length; k++) ctx.lineTo(b.pts[k].x, b.pts[k].y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(160,200,255," + (0.55 * a) + ")";
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    if (this.dim > 0.01) {
      ctx.fillStyle = "rgba(8,12,22," + this.dim + ")";
      ctx.fillRect(0, 0, env.w, env.h);
    }
    if (this.flash > 0) {
      ctx.fillStyle = "rgba(230,240,255," + (this.flash * 0.7) + ")";
      ctx.fillRect(0, 0, env.w, env.h);
    }
    if (this.snowCover > 0.01) {
      ctx.fillStyle = "rgba(255,255,255," + (this.snowCover * 0.18) + ")";
      ctx.fillRect(0, env.groundY - 2, env.w, env.h - env.groundY + 2);
    }
  };

  WeatherManager.WEATHERS = WEATHERS;
  WeatherManager.LABELS = LABELS;

  global.WeatherManager = WeatherManager;
})(window);
