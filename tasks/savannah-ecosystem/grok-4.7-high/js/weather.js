(function (S) {
  'use strict';

  const KEYS = [
    'skyTop', 'skyMid', 'skyHor', 'hillFar', 'hillNear',
    'grassA', 'grassB', 'grassC', 'tree', 'treeFar',
    'sun', 'water', 'flower', 'cloud', 'haze', 'rock'
  ];

  const DRY = {
    skyTop: [42, 104, 168], skyMid: [126, 178, 214], skyHor: [250, 196, 122],
    hillFar: [198, 164, 132], hillNear: [168, 112, 72],
    grassA: [198, 166, 78], grassB: [154, 118, 54], grassC: [98, 74, 38],
    tree: [118, 132, 58], treeFar: [156, 142, 96],
    sun: [255, 214, 120], water: [126, 138, 96], flower: [196, 82, 62],
    cloud: [255, 250, 244], haze: [236, 196, 146], rock: [146, 112, 82]
  };

  const WET = {
    skyTop: [24, 98, 162], skyMid: [86, 166, 198], skyHor: [168, 210, 146],
    hillFar: [118, 150, 128], hillNear: [58, 112, 74],
    grassA: [92, 170, 68], grassB: [52, 128, 54], grassC: [26, 84, 40],
    tree: [32, 122, 54], treeFar: [86, 132, 96],
    sun: [255, 238, 186], water: [48, 128, 168], flower: [214, 72, 104],
    cloud: [244, 250, 255], haze: [176, 208, 170], rock: [108, 102, 92]
  };

  const LABELS = {
    sunny: 'Sunny',
    rain: 'Rain',
    heavy: 'Heavy Rain',
    snow: 'Snow',
    thunder: 'Thunderstorm',
    tornado: 'Tornado'
  };

  function blankPalette() {
    const p = {};
    for (let i = 0; i < KEYS.length; i++) p[KEYS[i]] = [0, 0, 0];
    return p;
  }

  function seasonMix(blend, dst) {
    for (let i = 0; i < KEYS.length; i++) {
      const k = KEYS[i];
      const a = DRY[k];
      const b = WET[k];
      const d = dst[k];
      d[0] = a[0] + (b[0] - a[0]) * blend;
      d[1] = a[1] + (b[1] - a[1]) * blend;
      d[2] = a[2] + (b[2] - a[2]) * blend;
    }
  }

  function copyPal(src, dst) {
    for (let i = 0; i < KEYS.length; i++) {
      const k = KEYS[i];
      dst[k][0] = src[k][0];
      dst[k][1] = src[k][1];
      dst[k][2] = src[k][2];
    }
  }

  function mixPal(a, b, t, dst) {
    for (let i = 0; i < KEYS.length; i++) {
      const k = KEYS[i];
      dst[k][0] = a[k][0] + (b[k][0] - a[k][0]) * t;
      dst[k][1] = a[k][1] + (b[k][1] - a[k][1]) * t;
      dst[k][2] = a[k][2] + (b[k][2] - a[k][2]) * t;
    }
  }

  function mulAll(p, k) {
    for (let i = 0; i < KEYS.length; i++) {
      const c = p[KEYS[i]];
      c[0] *= k; c[1] *= k; c[2] *= k;
    }
  }

  function toward(c, r, g, b, t) {
    c[0] += (r - c[0]) * t;
    c[1] += (g - c[1]) * t;
    c[2] += (b - c[2]) * t;
  }

  function clampPal(p) {
    for (let i = 0; i < KEYS.length; i++) {
      const c = p[KEYS[i]];
      for (let k = 0; k < 3; k++) {
        if (c[k] < 0) c[k] = 0;
        else if (c[k] > 255) c[k] = 255;
      }
    }
  }

  function theme(base, weather, dst) {
    copyPal(base, dst);
    if (weather === 'sunny') {
      toward(dst.skyHor, 255, 186, 96, 0.28);
      toward(dst.sun, 255, 220, 130, 0.2);
    } else if (weather === 'rain') {
      mulAll(dst, 0.74);
      toward(dst.skyTop, 68, 88, 112, 0.5);
      toward(dst.skyMid, 96, 116, 132, 0.4);
      toward(dst.skyHor, 128, 138, 146, 0.48);
      toward(dst.cloud, 176, 186, 196, 0.72);
    } else if (weather === 'heavy') {
      mulAll(dst, 0.56);
      toward(dst.skyTop, 52, 62, 78, 0.6);
      toward(dst.skyMid, 70, 82, 96, 0.55);
      toward(dst.skyHor, 92, 100, 110, 0.5);
      toward(dst.cloud, 120, 130, 142, 0.75);
      toward(dst.grassA, 40, 60, 40, 0.25);
    } else if (weather === 'snow') {
      toward(dst.skyTop, 214, 222, 230, 0.62);
      toward(dst.skyMid, 206, 214, 222, 0.55);
      toward(dst.skyHor, 196, 204, 210, 0.5);
      toward(dst.grassA, 186, 196, 184, 0.5);
      toward(dst.grassB, 170, 180, 172, 0.45);
      toward(dst.grassC, 150, 160, 154, 0.35);
      toward(dst.hillFar, 186, 194, 198, 0.45);
      toward(dst.hillNear, 160, 168, 172, 0.35);
      toward(dst.cloud, 236, 240, 244, 0.55);
      toward(dst.sun, 230, 236, 242, 0.65);
    } else if (weather === 'thunder') {
      mulAll(dst, 0.42);
      toward(dst.skyTop, 16, 14, 36, 0.78);
      toward(dst.skyMid, 36, 32, 62, 0.72);
      toward(dst.skyHor, 64, 54, 86, 0.55);
      toward(dst.cloud, 54, 50, 74, 0.82);
      toward(dst.grassA, 30, 40, 28, 0.35);
    } else if (weather === 'tornado') {
      mulAll(dst, 0.68);
      toward(dst.skyTop, 108, 102, 74, 0.6);
      toward(dst.skyMid, 128, 118, 82, 0.5);
      toward(dst.skyHor, 150, 132, 86, 0.45);
      toward(dst.cloud, 142, 132, 100, 0.7);
      toward(dst.grassA, 128, 104, 58, 0.35);
      toward(dst.hillNear, 120, 96, 60, 0.3);
    }
    clampPal(dst);
  }

  const _hit = { left: 0, right: 0, top: 0, bottom: 0 };

  /**
   * 閃電安全區（lightning safe zone）
   *
   * A bolt is a vertical column. It may exist only inside a horizontal gap
   * that misses every animal's live screen bounds, expanded by `expand`.
   * 1. Build forbidden intervals [left-expand, right+expand], clipped to the screen.
   * 2. Merge overlaps. 3. Complement inside [0, width] = safe gaps.
   * 4. Drop gaps narrower than minGap. If none remain, return null and
   *    skip the strike — never shove the bolt onto an animal.
   * 5. Pick a gap and an x inset from its edges. The polyline is clamped
   *    to [clampL, clampR], strictly inside that gap.
   * A second guard (`columnHitsAnimal`) runs every frame a bolt is alive:
   * if any animal walks into the column, the bolt is put out before draw.
   */
  S.pickSafeStrikeX = function (bounds, count, width, expand, minGap, rand) {
    if (!(width > 8)) return null;
    const raw = [];
    for (let i = 0; i < count; i++) {
      const b = bounds[i];
      if (!b) continue;
      let L = b.left - expand;
      let R = b.right + expand;
      if (R < 0 || L > width) continue;
      if (L < 0) L = 0;
      if (R > width) R = width;
      if (R > L) raw.push(L, R);
    }
    const merged = [];
    const pairCount = raw.length / 2;
    const order = [];
    for (let i = 0; i < pairCount; i++) order.push(i);
    order.sort(function (ia, ib) { return raw[ia * 2] - raw[ib * 2]; });
    for (let n = 0; n < order.length; n++) {
      const i = order[n];
      const L = raw[i * 2];
      const R = raw[i * 2 + 1];
      if (!merged.length || L > merged[merged.length - 1]) {
        merged.push(L, R);
      } else if (R > merged[merged.length - 1]) {
        merged[merged.length - 1] = R;
      }
    }
    // merged is flat [L,R, L,R, ...] but the overlap test above used
    // merged[last] as if it were R only when I pushed L,R — the test
    // `L > merged[merged.length - 1]` compares against R. Good.
    // When extending, merged[last] = R. Good.
    const gaps = [];
    let cursor = 0;
    for (let i = 0; i < merged.length; i += 2) {
      const s = merged[i];
      const e = merged[i + 1];
      if (s - cursor >= minGap) gaps.push(cursor, s);
      if (e > cursor) cursor = e;
    }
    if (width - cursor >= minGap) gaps.push(cursor, width);
    if (!gaps.length) return null;
    const gi = ((rand() * (gaps.length / 2)) | 0) * 2;
    const g0 = gaps[gi];
    const g1 = gaps[gi + 1];
    const inset = Math.min(8, (g1 - g0) * 0.25);
    const span = g1 - g0 - inset * 2;
    if (span < 4) return null;
    const x = g0 + inset + rand() * span;
    return { x: x, clampL: g0 + 1, clampR: g1 - 1 };
  };

  S.columnHitsAnimal = function (x0, x1, animals, pad) {
    if (x1 < x0) {
      const t = x0;
      x0 = x1;
      x1 = t;
    }
    for (let i = 0; i < animals.length; i++) {
      const b = animals[i].getBounds(_hit);
      if (x1 >= b.left - pad && x0 <= b.right + pad) return true;
    }
    return false;
  };

  function makeBolt() {
    const points = [];
    for (let i = 0; i < 14; i++) points.push({ x: 0, y: 0 });
    const fork = [];
    for (let i = 0; i < 6; i++) fork.push({ x: 0, y: 0 });
    return {
      on: false, life: 0, max: 0.16,
      points: points, n: 14, fork: fork, forkN: 0,
      clampL: 0, clampR: 0
    };
  }

  class WeatherManager {
    constructor() {
      this.weather = 'sunny';
      this.from = 'sunny';
      this.blendW = 1;
      this.base = blankPalette();
      this.palA = blankPalette();
      this.palB = blankPalette();
      this.palette = blankPalette();
      this.slots = {};
      for (let i = 0; i < KEYS.length; i++) this.slots[KEYS[i]] = S.colorSlot();
      this.particles = new S.ParticleSystem();
      this.tornado = { x: 0, on: false, inited: false, speed: 20 };
      this.bolts = [makeBolt(), makeBolt()];
      this.boundBuf = [];
      for (let i = 0; i < 12; i++) {
        this.boundBuf.push({ left: 0, right: 0, top: 0, bottom: 0 });
      }
      this.flash = 0;
      this.nextBolt = 1.2;
      this.wind = 12;
      this.groundWet = 0;
      this.sunAlpha = 1;
      this.cloudAlpha = 0.85;
      this.strikes = 0;
      this.skips = 0;
      this.aborts = 0;
      this.attempts = 0;
      this.puddles = [];
      for (let i = 0; i < 7; i++) {
        this.puddles.push({
          nx: 0.06 + i * 0.13 + (i % 2) * 0.02,
          rx: 16 + (i % 3) * 7,
          ry: 4.5 + (i % 2) * 1.6,
          amp: 0,
          phase: i * 1.3
        });
      }
      this._env = null;
    }

    get label() {
      return LABELS[this.weather] || this.weather;
    }

    css(key, alpha) {
      return S.slotCss(this.slots[key], this.palette[key], alpha);
    }

    setWeather(name) {
      if (!LABELS[name] || name === this.weather) return;
      this.from = this.weather;
      this.weather = name;
      this.blendW = 0;
      // Drop the previous weather's particles back into the pool immediately.
      // Animal positions are not touched.
      this.particles.releaseAll();
      for (let i = 0; i < this.bolts.length; i++) this.bolts[i].on = false;
    }

    scaleX(s) {
      if (this.tornado.inited) this.tornado.x *= s;
      this.particles.scaleX(s);
    }

    prepare(dt, env) {
      this._env = env;
      if (this.blendW < 1) this.blendW = Math.min(1, this.blendW + dt / 1.15);
      this.flash = this.flash * Math.exp(-dt * 7.5);
      if (this.flash < 0.01) this.flash = 0;

      let windTarget = 14;
      if (this.weather === 'rain') windTarget = 48;
      else if (this.weather === 'heavy') windTarget = 86;
      else if (this.weather === 'snow') windTarget = 18;
      else if (this.weather === 'thunder') windTarget = 100;
      else if (this.weather === 'tornado') windTarget = 170;
      this.wind = S.expLerp(this.wind, windTarget, dt, 1.6);
      env.wind = this.wind;

      const wetTarget = this.weather === 'heavy' ? 1 : (this.weather === 'rain' || this.weather === 'thunder') ? 0.62 : 0;
      this.groundWet = S.expLerp(this.groundWet, wetTarget, dt, 1.15);

      const sunTarget = this.weather === 'sunny' ? 1 : this.weather === 'snow' ? 0.45 : 0.07;
      this.sunAlpha = S.expLerp(this.sunAlpha, sunTarget, dt, 2);
      const cloudTarget = this.weather === 'sunny' ? 0.72 : this.weather === 'snow' ? 0.8 : 0.95;
      this.cloudAlpha = S.expLerp(this.cloudAlpha, cloudTarget, dt, 1.5);

      if (this.weather === 'tornado') {
        this.tornado.on = true;
        if (!this.tornado.inited) {
          this.tornado.x = env.w * 0.2;
          this.tornado.inited = true;
        }
      } else {
        this.tornado.on = false;
      }
      env.tornadoActive = this.tornado.on;
      env.tornadoX = this.tornado.x;

      const grow = (this.weather === 'rain' || this.weather === 'heavy' || this.weather === 'thunder')
        ? (this.weather === 'heavy' ? 0.55 : 0.32) : 0;
      for (let i = 0; i < this.puddles.length; i++) {
        const puddle = this.puddles[i];
        const target = grow * (0.65 + 0.35 * (0.5 + 0.5 * Math.sin(puddle.phase)));
        puddle.amp = S.expLerp(puddle.amp, target, dt, grow > 0 ? 1.4 : 0.8);
      }

      this._paint(env.seasonBlend, this.flash);
    }

    _paint(seasonBlend, flash) {
      seasonMix(seasonBlend, this.base);
      const t = S.smooth(this.blendW);
      if (t >= 0.999 || this.from === this.weather) {
        theme(this.base, this.weather, this.palette);
      } else {
        theme(this.base, this.from, this.palA);
        theme(this.base, this.weather, this.palB);
        mixPal(this.palA, this.palB, t, this.palette);
      }
      if (flash > 0.01) {
        toward(this.palette.skyTop, 255, 255, 255, flash * 0.8);
        toward(this.palette.skyMid, 255, 255, 255, flash * 0.5);
        toward(this.palette.skyHor, 255, 246, 230, flash * 0.32);
        clampPal(this.palette);
      }
    }

    /**
     * 龍捲風追逐（tornado chase）
     * Each frame pick the nearest animal by squared distance to the funnel
     * base — no allocation. Step toward that animal at `tornado.speed`,
     * which is capped to 58% of the elephant cruise under the current
     * modifiers. A walking elephant therefore pulls away; a resting animal
     * is slowly closed on. When a herd member wraps to the left and becomes
     * the nearest, the funnel reverses. That reversal is the chase.
     */
    simulate(dt, env, animals) {
      this._env = env;
      if (this.tornado.on && animals.length) {
        let best = null;
        let bestD = Infinity;
        const tx = this.tornado.x;
        const ty = env.groundY;
        for (let i = 0; i < animals.length; i++) {
          const a = animals[i];
          const dx = a.x - tx;
          const dy = (a.y - 16) - ty;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = a; }
        }
        const cruise = 34 * env.unit * (env.mods ? env.mods.speed : 1);
        this.tornado.speed = Math.max(10 * env.unit, cruise * 0.58);
        if (best) {
          const dx = best.x - this.tornado.x;
          const step = this.tornado.speed * dt;
          if (Math.abs(dx) <= step) this.tornado.x = best.x;
          else this.tornado.x += (dx > 0 ? 1 : -1) * step;
        }
        if (this.tornado.x < 16) this.tornado.x = 16;
        if (this.tornado.x > env.w - 16) this.tornado.x = env.w - 16;
        env.tornadoX = this.tornado.x;
      }

      if (this.weather === 'thunder') {
        this.nextBolt -= dt;
        if (this.nextBolt <= 0) {
          const struck = this._tryStrike(env, animals);
          this.nextBolt = struck ? 1.3 + Math.random() * 1.7 : 0.45;
        }
      } else {
        this.nextBolt = 0.8;
      }

      for (let i = 0; i < this.bolts.length; i++) {
        const b = this.bolts[i];
        if (!b.on) continue;
        b.life -= dt;
        if (b.life <= 0) b.on = false;
      }
      this.cullBolts(animals);

      this.particles.update(dt, env);
      this._syncParticles(env);

      if ((this.weather === 'rain' || this.weather === 'heavy' || this.weather === 'thunder') && Math.random() < dt * 6) {
        const puddle = this.puddles[(Math.random() * this.puddles.length) | 0];
        if (puddle.amp > 0.25) {
          this.particles.spawnRipple(puddle.nx * env.w, env.groundY + 4);
        }
      }
    }

    _tryStrike(env, animals) {
      const n = animals.length;
      if (n > this.boundBuf.length) return false;
      for (let i = 0; i < n; i++) animals[i].getBounds(this.boundBuf[i]);
      const expand = 16;
      const pick = S.pickSafeStrikeX(this.boundBuf, n, env.w, expand, 18, Math.random);
      this.attempts++;
      if (!pick || S.columnHitsAnimal(pick.clampL, pick.clampR, animals, 1)) {
        this.flash = Math.max(this.flash, 0.4);
        this.skips++;
        return false;
      }
      const bolt = this._freeBolt();
      if (!bolt) return false;
      this._ignite(bolt, pick.x, pick.clampL, pick.clampR, env);
      if (this._boltHits(bolt, animals, 2)) {
        bolt.on = false;
        this.aborts++;
        this.flash = Math.max(this.flash, 0.4);
        return false;
      }
      this.flash = 1;
      this.strikes++;
      return true;
    }

    _freeBolt() {
      for (let i = 0; i < this.bolts.length; i++) {
        if (!this.bolts[i].on) return this.bolts[i];
      }
      return null;
    }

    _ignite(bolt, x, clampL, clampR, env) {
      bolt.on = true;
      bolt.life = 0.24;
      bolt.max = 0.24;
      bolt.clampL = clampL;
      bolt.clampR = clampR;
      const y0 = env.h * 0.06;
      const y1 = env.groundY;
      const room = Math.max(2, Math.min(14, (clampR - clampL) * 0.45));
      for (let i = 0; i < bolt.n; i++) {
        const t = i / (bolt.n - 1);
        let xj = x;
        if (i !== 0 && i !== bolt.n - 1) xj += (Math.random() * 2 - 1) * room;
        if (xj < clampL) xj = clampL;
        if (xj > clampR) xj = clampR;
        bolt.points[i].x = xj;
        bolt.points[i].y = y0 + (y1 - y0) * t;
      }
      bolt.forkN = room > 6 ? 6 : 0;
      if (bolt.forkN) {
        const start = bolt.points[4];
        for (let i = 0; i < bolt.forkN; i++) {
          const t = i / (bolt.forkN - 1);
          let xj = start.x + (Math.random() * 2 - 1) * room * 0.8 * t;
          if (xj < clampL) xj = clampL;
          if (xj > clampR) xj = clampR;
          bolt.fork[i].x = xj;
          bolt.fork[i].y = start.y + t * (y1 - start.y) * 0.45;
        }
      }
    }

    _boltHits(bolt, animals, pad) {
      let x0 = 1e9;
      let x1 = -1e9;
      for (let i = 0; i < bolt.n; i++) {
        const x = bolt.points[i].x;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
      for (let i = 0; i < bolt.forkN; i++) {
        const x = bolt.fork[i].x;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
      return S.columnHitsAnimal(x0, x1, animals, pad);
    }

    cullBolts(animals) {
      for (let i = 0; i < this.bolts.length; i++) {
        const b = this.bolts[i];
        if (!b.on) continue;
        if (this._boltHits(b, animals, 3)) {
          b.on = false;
          this.aborts++;
        }
      }
    }

    /** Test hook: place a bolt and immediately apply the live-animal guard. */
    forceBoltAt(x, clampL, clampR, env, animals) {
      const bolt = this._freeBolt() || this.bolts[0];
      this._ignite(bolt, x, clampL, clampR, env);
      this.cullBolts(animals);
      return this.liveBolts();
    }

    liveBolts() {
      const out = [];
      for (let i = 0; i < this.bolts.length; i++) {
        const b = this.bolts[i];
        if (!b.on) continue;
        let x0 = 1e9;
        let x1 = -1e9;
        for (let k = 0; k < b.n; k++) {
          if (b.points[k].x < x0) x0 = b.points[k].x;
          if (b.points[k].x > x1) x1 = b.points[k].x;
        }
        out.push({ x0: x0, x1: x1, life: b.life });
      }
      return out;
    }

    spawnPuff(x, y) {
      this.particles._env = this._env;
      if (!this._env) return;
      this.particles.spawnPuff(x, y);
    }

    spawnRipple(x, y) {
      this.particles._env = this._env;
      this.particles.spawnRipple(x, y);
    }

    _area(env) {
      return S.clamp((env.w * env.h) / (960 * 540), 0.32, 1.55);
    }

    _syncParticles(env) {
      const ps = this.particles;
      ps._env = env;
      ps._recount();
      ps.budget = 42;
      const area = this._area(env);
      const reduced = env.reduced ? 0.28 : 1;
      const intensity = S.weatherIntensity(this.weather, env.seasonBlend);
      const w = this.weather;
      let rain = 0, snow = 0, dust = 0, debris = 0, leaf = 0;
      if (w === 'sunny') {
        dust = Math.round(34 * area * intensity * reduced);
        leaf = Math.round(env.seasonBlend * 14 * area * reduced);
      } else if (w === 'rain') {
        rain = Math.round(170 * area * intensity * reduced);
      } else if (w === 'heavy') {
        rain = Math.round(300 * area * intensity * reduced);
      } else if (w === 'snow') {
        snow = Math.round(190 * area * intensity * reduced);
      } else if (w === 'thunder') {
        rain = Math.round(140 * area * intensity * reduced);
      } else if (w === 'tornado') {
        debris = Math.round(78 * area * reduced);
        dust = Math.round(24 * area * reduced);
      }
      ps.maintain('rain', rain);
      ps.maintain('snow', snow);
      ps.maintain('dust', dust);
      ps.maintain('debris', debris);
      ps.maintain('leaf', leaf);
      ps._trimTo('splash', w === 'rain' || w === 'heavy' || w === 'thunder' ? 64 : 0);
      ps._trimTo('ripple', w === 'rain' || w === 'heavy' || w === 'thunder' ? 30 : 0);
      ps._trimTo('puff', 48);
    }
  }

  S.WeatherManager = WeatherManager;
  S.WEATHER_LABELS = LABELS;
})(window.Savannah = window.Savannah || {});
