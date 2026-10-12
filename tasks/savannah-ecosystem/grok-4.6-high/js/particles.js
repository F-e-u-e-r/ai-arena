/* Particle type + pooled particle system. One Particle shape is reused for
   rain, snow, dust, debris, sparks and splashes; `type` selects update/draw. */
(function (global) {
  "use strict";

  function Particle() {
    this.alive = false;
    this.type = "dust";
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 1;
    this.size = 1;
    this.rot = 0;
    this.spin = 0;
    this.alpha = 1;
    this.layer = 1;
    this.orbitR = 0;
    this.orbitA = 0;
    this.orbitH = 0;
    this.gx = 0;
    this.gy = 0;
    this.wind = 0;
  }

  Particle.prototype.kill = function () {
    this.alive = false;
  };

  function resetParticle(p) {
    p.alive = false;
    p.type = "dust";
    p.x = p.y = 0;
    p.vx = p.vy = 0;
    p.life = 0;
    p.maxLife = 1;
    p.size = 1;
    p.rot = p.spin = 0;
    p.alpha = 1;
    p.layer = 1;
    p.orbitR = p.orbitA = p.orbitH = 0;
    p.gx = p.gy = 0;
    p.wind = 0;
  }

  function ParticleSystem(max) {
    this.pool = new ObjectPool(function () { return new Particle(); }, resetParticle, 128, max || 1800);
    this.budget = max || 1800;
  }

  ParticleSystem.prototype.setBudget = function (n) {
    this.budget = n;
    this.pool.max = Math.max(this.pool.max, n);
  };

  ParticleSystem.prototype.spawn = function (init) {
    if (this.pool.live.length >= this.budget) return null;
    const p = this.pool.acquire(function (obj) {
      obj.alive = true;
    });
    if (!p) return null;
    if (init) init(p);
    p.alive = true;
    return p;
  };

  ParticleSystem.prototype.clear = function () {
    this.pool.releaseAll();
  };

  ParticleSystem.prototype.update = function (dt, env) {
    const live = this.pool.live;
    const ground = env.groundY;
    const w = env.w;
    const h = env.h;
    const wind = env.wind;
    const tornado = env.tornado;

    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }

      const t = p.life / p.maxLife;
      p.alpha = t;

      if (p.type === "rain" || p.type === "heavy") {
        p.vx = wind * 0.55 + p.wind;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y >= ground) {
          p.alive = false;
          if (env.spawnSplash) env.spawnSplash(p.x, ground);
        } else if (p.x < -20 || p.x > w + 20) {
          p.alive = false;
        }
      } else if (p.type === "snow") {
        p.vx = wind * 0.18 + Math.sin(p.life * 3 + p.rot) * 12;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        if (p.y >= ground + 4) {
          p.vy = 0;
          p.y = ground + 2;
          p.life -= dt * 1.4;
        }
        if (p.x < -30) p.x = w + 10;
        if (p.x > w + 30) p.x = -10;
      } else if (p.type === "dust") {
        p.x += (p.vx + wind * 0.12) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 10) p.alive = false;
      } else if (p.type === "splash") {
        p.vx += wind * 0.2 * dt;
        p.vy += 420 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > ground + 8) p.alive = false;
      } else if (p.type === "debris") {
        if (tornado) {
          p.orbitA += p.spin * dt;
          p.orbitR = Math.max(6, p.orbitR - 8 * dt);
          p.orbitH += 18 * dt;
          p.x = tornado.x + Math.cos(p.orbitA) * p.orbitR;
          p.y = tornado.y - p.orbitH;
          if (p.orbitH > tornado.height * 0.95) p.alive = false;
        } else {
          p.alive = false;
        }
      } else if (p.type === "spark") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt;
      } else if (p.type === "petal") {
        p.x += (p.vx + wind * 0.3) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        if (p.y > ground + 6 || p.x < -20 || p.x > w + 20) p.alive = false;
      }
    }

    this.pool.recycleDead(function (p) { return p.alive; });
  };

  ParticleSystem.prototype.draw = function (ctx, layer) {
    const live = this.pool.live;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      if (!p.alive || p.layer !== layer) continue;
      const a = p.alpha;
      if (p.type === "rain" || p.type === "heavy") {
        ctx.strokeStyle = p.type === "heavy"
          ? "rgba(170,200,230," + (0.55 * a) + ")"
          : "rgba(190,215,235," + (0.42 * a) + ")";
        ctx.lineWidth = p.type === "heavy" ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018);
        ctx.stroke();
      } else if (p.type === "snow") {
        ctx.fillStyle = "rgba(255,255,255," + (0.85 * a) + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === "dust") {
        ctx.fillStyle = "rgba(210,170,100," + (0.28 * a) + ")";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 1.6, p.size * 0.7, p.rot, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === "splash") {
        ctx.fillStyle = "rgba(160,200,220," + (0.5 * a) + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === "debris") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + p.orbitA);
        ctx.fillStyle = "rgba(120,80,40," + (0.7 * a) + ")";
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        ctx.restore();
      } else if (p.type === "spark") {
        ctx.fillStyle = "rgba(255,240,180," + (0.9 * a) + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === "petal") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = "rgba(70,130,60," + (0.55 * a) + ")";
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  ParticleSystem.prototype.count = function () {
    return this.pool.liveCount();
  };

  global.Particle = Particle;
  global.ParticleSystem = ParticleSystem;
})(window);
