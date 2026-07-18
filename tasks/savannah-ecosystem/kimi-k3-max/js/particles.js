'use strict';
/* =========================================================
 * 粒子系統 — Object Pooling
 *
 * 設計:
 * - ParticlePool 預先配置固定容量物件,spawn 從 freeList 取、
 *   release 用 swap-remove 還回,整個生命週期 0 配置,
 *   長時間運行不會造成 GC 壓力或記憶體碎片化。
 * - PrecipSystem 依「天氣強度(每秒顆數)」以累加器生粒子;
 *   天氣切換時舊粒子**自然死亡回收**(池復用),不需要 clear。
 * - 繪製採「同類粒子批次成單一 path」:雨一次 stroke、
 *   雪一次 fill,把 draw call 從 O(n) 降到 O(1)。
 * ========================================================= */

class ParticlePool {
  constructor(capacity) {
    this.capacity = capacity;
    this.slots = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.slots[i] = {
        active: false, _slot: i,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 1, seed: 0,
        floor: 0, angle: 0, radius: 0, omega: 0, len: 0,
      };
    }
    this.freeList = new Array(capacity);
    for (let i = 0; i < capacity; i++) this.freeList[i] = capacity - 1 - i;
    this.live = []; // 密集存放存活粒子(swap-remove,無空洞)
  }
  spawn() {
    if (this.freeList.length === 0) return null; // 池滿 → 直接丟棄,保幀率
    const idx = this.freeList.pop();
    const p = this.slots[idx];
    p.active = true;
    this.live.push(p);
    return p;
  }
  releaseAt(liveIdx) {
    const p = this.live[liveIdx];
    p.active = false;
    this.freeList.push(p._slot);
    const last = this.live.pop();
    if (liveIdx < this.live.length) this.live[liveIdx] = last;
  }
  count() { return this.live.length; }
}

class PrecipSystem {
  constructor() {
    this.rain = new ParticlePool(900);    // 雨滴(線段)
    this.splash = new ParticlePool(320);  // 落地水花(擴散弧)
    this.snow = new ParticlePool(380);    // 雪花(搖擺飄落)
    this.debris = new ParticlePool(240);  // 龍捲風捲起的碎屑
    this.dust = new ParticlePool(140);    // 環境塵土 / 風暴沙塵
    this._rainAcc = 0;
    this._snowAcc = 0;
    this._dustAcc = 0;
    this._debrisAcc = 0;
  }

  totalCount() {
    return this.rain.count() + this.splash.count() + this.snow.count() +
           this.debris.count() + this.dust.count();
  }

  update(dt, env) {
    const { W, H, u, horizonY, wind } = env;
    const rates = env.rates; // WeatherManager 每幀給的平滑後生成速率

    /* ---------- 生成(累加器:速率 × dt,避免每幀亂數決定) ---------- */
    this._rainAcc += rates.rain * dt;
    while (this._rainAcc >= 1) {
      this._rainAcc -= 1;
      const p = this.rain.spawn();
      if (p) {
        p.x = rand(-30, W + 30);
        p.y = -20;
        p.vy = H * rand(0.9, 1.3);
        p.len = u * rand(9, 16);
        // 地面有深度:每滴落在不同的草层高度,看起來才有前後層次
        p.floor = horizonY + (H - horizonY) * rand(0.15, 0.95);
        p.seed = rand(TAU);
      }
    }
    this._snowAcc += rates.snow * dt;
    while (this._snowAcc >= 1) {
      this._snowAcc -= 1;
      const p = this.snow.spawn();
      if (p) {
        p.x = rand(-20, W + 20);
        p.y = -10;
        p.vy = H * rand(0.08, 0.16);
        p.size = u * rand(1.6, 3.4);
        p.seed = rand(TAU);
        p.floor = horizonY + (H - horizonY) * rand(0.1, 0.95);
      }
    }
    this._dustAcc += rates.dust * dt;
    while (this._dustAcc >= 1) {
      this._dustAcc -= 1;
      const p = this.dust.spawn();
      if (p) {
        p.x = rand(W);
        p.y = horizonY + (H - horizonY) * rand(0.2, 0.9);
        p.size = u * rand(4, 11);
        p.maxLife = p.life = rand(2.5, 5);
        p.vx = rand(-8, 8) * u;
        p.seed = rand(TAU);
      }
    }
    // 龍捲風碎屑:從漏斗底部被捲入,繞軸螺旋上升
    this._debrisAcc += rates.debris * dt;
    while (this._debrisAcc >= 1) {
      this._debrisAcc -= 1;
      const p = this.debris.spawn();
      if (p && env.tornado) {
        p.angle = rand(TAU);
        p.radius = u * rand(4, 20);
        p.omega = rand(3.5, 6.5) * (chance(0.5) ? 1 : -1);
        p.y = env.tornado.baseY - rand(0, u * 8);
        p.size = u * rand(1.5, 3.5);
        p.maxLife = p.life = rand(0.8, 1.4);
        p.seed = rand(TAU);
      } else if (p) {
        p.life = 0; // 無龍捲風直接回收
      }
    }

    /* ---------- 更新 + 回收 ---------- */
    const windPx = wind * u * 30;
    // 雨:受風斜落,到達各自 floor 高度 → 生成水花並回收
    for (let i = this.rain.live.length - 1; i >= 0; i--) {
      const p = this.rain.live[i];
      p.y += p.vy * dt;
      p.x += windPx * dt;
      if (p.y >= p.floor) {
        if (chance(0.55)) {
          const s = this.splash.spawn();
          if (s) {
            s.x = p.x; s.y = p.floor;
            s.size = u * rand(2, 4.5);
            s.maxLife = s.life = rand(0.22, 0.32);
          }
        }
        this.rain.releaseAt(i);
      }
    }
    // 水花:壽命遞減
    for (let i = this.splash.live.length - 1; i >= 0; i--) {
      const p = this.splash.live[i];
      p.life -= dt;
      if (p.life <= 0) this.splash.releaseAt(i);
    }
    // 雪:慢速飄落 + 左右搖擺
    for (let i = this.snow.live.length - 1; i >= 0; i--) {
      const p = this.snow.live[i];
      p.y += p.vy * dt;
      p.x += (Math.cos(env.time * 1.4 + p.seed) * u * 14 + windPx * 0.4) * dt;
      if (p.y >= p.floor) this.snow.releaseAt(i);
    }
    // 塵土:緩慢漂移、淡入淡出
    for (let i = this.dust.live.length - 1; i >= 0; i--) {
      const p = this.dust.live[i];
      p.life -= dt;
      p.x += (p.vx + windPx * 0.25) * dt;
      p.y += Math.sin(env.time * 0.8 + p.seed) * u * 3 * dt;
      if (p.life <= 0) this.dust.releaseAt(i);
    }
    // 碎屑:繞龍捲風軸心螺旋上升(位置由角度/半徑即時推算)
    for (let i = this.debris.live.length - 1; i >= 0; i--) {
      const p = this.debris.live[i];
      p.life -= dt;
      p.angle += p.omega * dt;
      p.radius += u * 16 * dt;
      p.y -= H * 0.16 * dt;
      if (env.tornado) p.x = env.tornado.x + Math.cos(p.angle) * p.radius;
      if (p.life <= 0) this.debris.releaseAt(i);
    }
  }

  draw(ctx, env) {
    const u = env.u;

    // 雨:全部雨滴收成單一 path,一次 stroke(大批繪製的關鍵優化)
    if (this.rain.live.length) {
      ctx.strokeStyle = 'rgba(190,212,235,0.55)';
      ctx.lineWidth = Math.max(1, u * 1.1);
      ctx.beginPath();
      for (let i = 0; i < this.rain.live.length; i++) {
        const p = this.rain.live[i];
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - env.wind * u * 3, p.y - p.len);
      }
      ctx.stroke();
    }
    // 水花:擴散的小弧線,淡出
    if (this.splash.live.length) {
      ctx.strokeStyle = 'rgba(200,220,240,0.5)';
      ctx.lineWidth = Math.max(0.6, u * 0.8);
      ctx.beginPath();
      for (let i = 0; i < this.splash.live.length; i++) {
        const p = this.splash.live[i];
        const t = 1 - p.life / p.maxLife;
        const r = p.size * (0.4 + t);
        ctx.moveTo(p.x - r, p.y);
        ctx.arc(p.x, p.y, r, Math.PI, TAU);
      }
      ctx.stroke();
    }
    // 雪:單一 fill 批次
    if (this.snow.live.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      for (let i = 0; i < this.snow.live.length; i++) {
        const p = this.snow.live[i];
        ctx.moveTo(p.x + p.size, p.y);
        ctx.arc(p.x, p.y, p.size, 0, TAU);
      }
      ctx.fill();
    }
    // 碎屑:小方塊,數量少(≤240)可逐個旋轉
    for (let i = 0; i < this.debris.live.length; i++) {
      const p = this.debris.live[i];
      const a = clamp(p.life / p.maxLife, 0, 1) * 0.8;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = `rgba(122,96,58,${a})`;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    // 塵土:半透明軟圓
    for (let i = 0; i < this.dust.live.length; i++) {
      const p = this.dust.live[i];
      const a = Math.sin((1 - p.life / p.maxLife) * Math.PI) * 0.12;
      ctx.fillStyle = `rgba(214,190,150,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
  }
}
