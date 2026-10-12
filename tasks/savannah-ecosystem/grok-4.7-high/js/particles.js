(function (S) {
  'use strict';

  function makeParticle() {
    return {
      _pooled: true,
      type: '',
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, max: 1, size: 1,
      rot: 0, vr: 0,
      extra: 0, orbit: 0, rise: 0,
      front: 0
    };
  }

  function resetParticle(p) {
    p.type = '';
    p.life = 0;
    p.vx = 0;
    p.vy = 0;
    p.front = 0;
  }

  class ParticleSystem {
    constructor() {
      const cap = 520;
      this.pool = new S.ObjectPool(makeParticle, resetParticle, cap, cap);
      this.active = [];
      this.tally = {
        rain: 0, splash: 0, snow: 0, dust: 0,
        debris: 0, leaf: 0, ripple: 0, puff: 0
      };
      this.budget = 40;
    }

    stats() {
      return {
        live: this.pool.live,
        free: this.pool.free.length,
        created: this.pool.created,
        max: this.pool.max,
        active: this.active.length
      };
    }

    releaseAll() {
      const a = this.active;
      for (let i = 0; i < a.length; i++) this.pool.release(a[i]);
      a.length = 0;
      const c = this.tally;
      c.rain = 0; c.splash = 0; c.snow = 0; c.dust = 0;
      c.debris = 0; c.leaf = 0; c.ripple = 0; c.puff = 0;
    }

    scaleX(s) {
      const a = this.active;
      for (let i = 0; i < a.length; i++) a[i].x *= s;
    }

    _kill(i) {
      const a = this.active;
      const p = a[i];
      const last = a[a.length - 1];
      a.pop();
      if (i < a.length) a[i] = last;
      this.pool.release(p);
    }

    _recount() {
      const c = this.tally;
      c.rain = 0; c.splash = 0; c.snow = 0; c.dust = 0;
      c.debris = 0; c.leaf = 0; c.ripple = 0; c.puff = 0;
      const a = this.active;
      for (let i = 0; i < a.length; i++) {
        const t = a[i].type;
        if (c[t] != null) c[t]++;
      }
    }

    _trimTo(type, target) {
      let n = this.tally[type] || 0;
      const a = this.active;
      while (n > target) {
        let found = -1;
        for (let i = a.length - 1; i >= 0; i--) {
          if (a[i].type === type) { found = i; break; }
        }
        if (found < 0) break;
        this._kill(found);
        n--;
      }
      this.tally[type] = n;
    }

    /**
     * Keep a steady count of `type`. Extra particles are released back to the
     * pool (used when season intensity drops). New ones come from the pool,
     * at most `budget` spawns per frame so a weather switch cannot hitch.
     */
    maintain(type, target) {
      this._trimTo(type, target);
      let n = this.tally[type] || 0;
      while (n < target && this.budget > 0) {
        if (!this._spawn(type)) break;
        this.budget--;
        n++;
      }
      this.tally[type] = n;
    }

    _count(type) {
      let n = 0;
      const a = this.active;
      for (let i = 0; i < a.length; i++) if (a[i].type === type) n++;
      return n;
    }

    spawnPuff(x, y) {
      if (this._count('puff') > 48) return false;
      return this._spawn('puff', x, y);
    }

    spawnRipple(x, y) {
      if (this._count('ripple') > 36) return false;
      return this._spawn('ripple', x, y);
    }

    _spawn(type, x, y) {
      const p = this.pool.acquire();
      if (!p) return false;
      const env = this._env;
      p.type = type;
      p.life = 1;
      p.max = 1;
      p.rot = 0;
      p.vr = 0;
      p.extra = Math.random() * 6.28;
      p.orbit = 0;
      p.rise = 0;
      p.front = Math.random() < 0.42 ? 1 : 0;
      p.vx = 0;
      p.vy = 0;
      p.size = 2;

      if (type === 'rain') {
        p.x = Math.random() * env.w;
        p.y = Math.random() * env.h;
        p.vx = -30 - Math.random() * 40;
        p.vy = (env.weather === 'heavy' ? 820 : 560) + Math.random() * 220;
        p.size = (env.weather === 'heavy' ? 16 : 11) + Math.random() * 6;
        p.life = 8;
        p.max = 8;
      } else if (type === 'snow') {
        p.x = Math.random() * env.w;
        p.y = Math.random() * env.h;
        p.vx = -8 + Math.random() * 16;
        p.vy = 28 + Math.random() * 36;
        p.size = 1.4 + Math.random() * 2.4;
        p.life = 9;
        p.max = 9;
        p.extra = Math.random() * 6.28;
      } else if (type === 'dust') {
        p.x = Math.random() * env.w;
        p.y = env.groundY - Math.random() * env.h * 0.35;
        p.vx = 8 + Math.random() * 16;
        p.vy = -4 - Math.random() * 10;
        p.size = 1.2 + Math.random() * 1.8;
        p.life = 3 + Math.random() * 3;
        p.max = p.life;
      } else if (type === 'leaf') {
        p.x = Math.random() * env.w;
        p.y = env.h * (0.25 + Math.random() * 0.45);
        p.vx = 18 + Math.random() * 24;
        p.vy = 8 + Math.random() * 12;
        p.size = 2.5 + Math.random() * 2;
        p.vr = -2 + Math.random() * 4;
        p.life = 6 + Math.random() * 4;
        p.max = p.life;
      } else if (type === 'debris') {
        p.x = env.tornadoX || env.w * 0.5;
        p.y = env.groundY;
        p.orbit = 10 + Math.random() * 26;
        p.rise = Math.random() * env.h * 0.4;
        p.extra = Math.random() * 6.28;
        p.vr = 2.4 + Math.random() * 3.5;
        p.vy = 46 + Math.random() * 50;
        p.size = 1.6 + Math.random() * 2.6;
        p.life = 999;
        p.max = 999;
        p.rot = Math.random() * 6.28;
      } else if (type === 'puff') {
        p.x = x;
        p.y = y;
        p.vx = -6 + Math.random() * 12;
        p.vy = -10 - Math.random() * 18;
        p.size = 2 + Math.random() * 3;
        p.life = 0.45;
        p.max = 0.45;
      } else if (type === 'ripple') {
        p.x = x;
        p.y = y;
        p.size = 2;
        p.life = 0.8;
        p.max = 0.8;
      } else if (type === 'splash') {
        p.x = x;
        p.y = y;
        p.vx = -30 + Math.random() * 60;
        p.vy = -50 - Math.random() * 70;
        p.size = 1.4;
        p.life = 0.28;
        p.max = 0.28;
      }
      this.active.push(p);
      return true;
    }

    update(dt, env) {
      this._env = env;
      const a = this.active;
      const ground = env.groundY;
      const wind = env.wind;
      let splashes = 0;
      for (let s = 0; s < a.length; s++) if (a[s].type === 'splash') splashes++;
      for (let i = 0; i < a.length; ) {
        const p = a[i];
        let dead = false;
        if (p.type === 'rain') {
          p.x += (p.vx + wind * 0.35) * dt;
          p.y += p.vy * dt;
          if (p.y >= ground) {
            if (Math.random() < 0.4 && splashes < 70 && this.pool.free.length > 8) {
              // Recycle this drop into a splash — no extra allocation.
              p.type = 'splash';
              splashes++;
              p.y = ground;
              p.vx = -40 + Math.random() * 80;
              p.vy = -40 - Math.random() * 50;
              p.life = 0.26;
              p.max = 0.26;
              p.size = 1.5;
            } else dead = true;
          } else if (p.x < -30 || p.x > env.w + 30) dead = true;
        } else if (p.type === 'splash') {
          p.vy += 420 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          if (p.life <= 0 || p.y > ground + 8) dead = true;
        } else if (p.type === 'snow') {
          p.extra += dt * 1.4;
          p.x += (p.vx + Math.sin(p.extra) * 22 + wind * 0.15) * dt;
          p.y += p.vy * dt;
          p.life -= dt * 0.15;
          if (p.y > ground || p.life <= 0) dead = true;
          else if (p.x < -10) p.x = env.w + 5;
          else if (p.x > env.w + 10) p.x = -5;
        } else if (p.type === 'dust' || p.type === 'puff') {
          p.x += (p.vx + wind * 0.05) * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          if (p.life <= 0) dead = true;
        } else if (p.type === 'leaf') {
          p.rot += p.vr * dt;
          p.extra += dt;
          p.x += (p.vx + wind * 0.2 + Math.sin(p.extra) * 16) * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          if (p.life <= 0 || p.x > env.w + 20 || p.y > ground) dead = true;
        } else if (p.type === 'debris') {
          // Orbit the funnel and rise — the tornado "picks up" these particles.
          p.extra += p.vr * dt;
          p.rise += p.vy * dt;
          const ceiling = env.h * 0.58;
          if (p.rise > ceiling) {
            p.rise = 0;
            p.orbit = 12 + Math.random() * 22;
            p.vy = 40 + Math.random() * 50;
          }
          const widen = 0.7 + (p.rise / ceiling) * 2.4;
          const tx = env.tornadoX || 0;
          p.x = tx + Math.cos(p.extra) * p.orbit * widen;
          p.y = ground - p.rise + Math.sin(p.extra * 2) * 3;
          p.rot += dt * 4;
        } else if (p.type === 'ripple') {
          p.life -= dt;
          p.size += dt * 28;
          if (p.life <= 0) dead = true;
        }
        if (dead) this._kill(i);
        else i++;
      }
    }

    draw(ctx, env, pass) {
      const a = this.active;
      ctx.save();
      ctx.lineCap = 'round';
      if (pass === 'back') {
        ctx.strokeStyle = env.weather === 'heavy'
          ? 'rgba(174, 196, 214, 0.55)'
          : 'rgba(200, 218, 230, 0.48)';
        ctx.lineWidth = env.weather === 'heavy' ? 1.7 : 1.15;
        ctx.beginPath();
        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          if (p.type !== 'rain' || p.front) continue;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 0.012, p.y - p.size);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(90, 70, 40, 0.28)';
        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          if (p.type !== 'dust' && p.type !== 'puff') continue;
          const alpha = p.life / p.max;
          ctx.globalAlpha = alpha * 0.45;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.2832);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = env.weather === 'heavy'
          ? 'rgba(186, 208, 224, 0.7)'
          : 'rgba(214, 228, 236, 0.62)';
        ctx.lineWidth = env.weather === 'heavy' ? 1.8 : 1.2;
        ctx.beginPath();
        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          if (p.type !== 'rain' || !p.front) continue;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 0.012, p.y - p.size);
        }
        ctx.stroke();

        ctx.fillStyle = 'rgba(245, 248, 252, 0.92)';
        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          if (p.type !== 'snow') continue;
          ctx.globalAlpha = 0.45 + 0.5 * (p.life / p.max);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.2832);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(120, 86, 48, 0.85)';
        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          if (p.type !== 'debris') continue;
          ctx.globalAlpha = 0.75;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(70, 130, 60, 0.8)';
        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          if (p.type !== 'leaf') continue;
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, 6.2832);
          ctx.fill();
          ctx.restore();
        }

        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          if (p.type !== 'splash') continue;
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.strokeStyle = 'rgba(220, 230, 236, 0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - 4);
          ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(220, 235, 245, 0.55)';
        for (let i = 0; i < a.length; i++) {
          const p = a[i];
          if (p.type !== 'ripple') continue;
          ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.7;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.35, 0, 0, 6.2832);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  S.ParticleSystem = ParticleSystem;
})(window.Savannah = window.Savannah || {});
