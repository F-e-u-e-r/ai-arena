/* Wildland — original Canvas artwork and a small, bounded ecosystem simulation.
   No dependencies, network requests, image assets, or build step. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const WORLD_WIDTH = 1600;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = t => t * t * (3 - 2 * t);
  const approach = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  class Random {
    constructor(seed = 82741) { this.seed = seed >>> 0; }
    next() {
      this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }
    range(a, b) { return lerp(a, b, this.next()); }
    int(a, b) { return Math.floor(this.range(a, b)); }
  }

  class EventBus {
    constructor() { this.listeners = new Map(); }
    on(event, handler) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(handler);
    }
    emit(event, detail) {
      const handlers = this.listeners.get(event);
      if (handlers) for (const handler of handlers) handler(detail);
    }
  }

  function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rotation, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function stroke(ctx, color, width, draw) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    draw();
    ctx.stroke();
  }

  const WEATHER = Object.freeze({
    sunny: { name: 'Sunny', title: 'The golden hour.', dark: 0, wind: 12, temp: 29, rate: 13, activity: 1, cloud: .12 },
    rain: { name: 'Rain', title: 'A softer kind of rhythm.', dark: .23, wind: 19, temp: 23, rate: 155, activity: 1.16, cloud: .6 },
    'heavy-rain': { name: 'Heavy rain', title: 'The plains drink deeply.', dark: .48, wind: 35, temp: 20, rate: 590, activity: .86, cloud: .9 },
    snow: { name: 'Snow', title: 'An unexpected stillness.', dark: .12, wind: 9, temp: 2, rate: 115, activity: .67, cloud: .66 },
    thunderstorm: { name: 'Thunderstorm', title: 'A rumble in the distance.', dark: .72, wind: 48, temp: 18, rate: 495, activity: 1.42, cloud: 1 },
    tornado: { name: 'Tornado', title: 'The wild holds its breath.', dark: .57, wind: 76, temp: 22, rate: 150, activity: 1.95, cloud: .94 }
  });

  class SeasonManager {
    constructor(events) {
      this.events = events;
      this.current = 'dry';
      this.elapsed = 0;
      this.duration = 60;
      this.wetness = 0;
      this.transitionFrom = 0;
      this.transitionTime = 8;
    }
    set(season, automatic = false) {
      if (!['dry', 'wet'].includes(season) || season === this.current) return false;
      this.current = season;
      this.elapsed = 0;
      this.transitionFrom = this.wetness;
      this.transitionTime = 0;
      this.events.emit('season', { season, automatic });
      return true;
    }
    update(dt) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) this.set(this.current === 'dry' ? 'wet' : 'dry', true);
      // Snapshot the current blend when interrupted. A cubic eight-second blend
      // changes the palette and behavior continuously, without touching positions.
      this.transitionTime = Math.min(8, this.transitionTime + dt);
      this.wetness = lerp(this.transitionFrom, this.current === 'wet' ? 1 : 0, smoothstep(this.transitionTime / 8));
    }
  }

  class ParticlePool {
    constructor(capacity = 1800) {
      this.capacity = capacity;
      this.active = [];
      this.free = [];
      for (let i = 0; i < capacity; i++) {
        this.free.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0,
          angle: 0, spin: 0, radius: 0, ground: 0, kind: '', alpha: 0 });
      }
      this.peak = 0;
    }
    acquire() {
      if (!this.free.length) return null; // A hard memory ceiling; excess emissions are skipped.
      const particle = this.free.pop();
      this.active.push(particle);
      this.peak = Math.max(this.peak, this.active.length);
      return particle;
    }
    release(index) {
      const particle = this.active[index];
      const last = this.active.pop();
      if (index < this.active.length) this.active[index] = last;
      particle.life = 0;
      particle.kind = '';
      this.free.push(particle);
    }
    clear() {
      while (this.active.length) this.release(this.active.length - 1);
    }
  }

  class ParticleSystem {
    constructor(world, reducedMotion) {
      this.world = world;
      this.random = new Random(42316);
      this.pool = new ParticlePool();
      this.emission = 0;
      this.quality = reducedMotion ? .55 : 1;
    }
    clear() { this.pool.clear(); this.emission = 0; }
    spawn(weather, tornado, fill = false) {
      const p = this.pool.acquire();
      if (!p) return;
      const r = this.random, h = this.world.height;
      p.x = r.range(-100, WORLD_WIDTH + 150);
      p.y = fill ? r.range(0, h) : -25;
      p.life = p.maxLife = 12;
      p.size = r.range(1, 2);
      p.angle = r.range(0, TAU);
      p.spin = r.range(-3, 3);
      p.alpha = r.range(.3, .8);
      p.ground = r.range(h * .66, h * 1.03);
      p.radius = 0;
      if (weather === 'sunny') {
        p.kind = 'dust';
        p.y = r.range(h * .55, h);
        p.vx = r.range(6, 18);
        p.vy = r.range(-9, -2);
        p.life = p.maxLife = r.range(3, 7);
        p.size = r.range(1, 2.5);
      } else if (weather === 'snow') {
        p.kind = 'snow';
        p.vx = r.range(-10, 15);
        p.vy = r.range(30, 70);
        p.size = r.range(1.2, 3.5);
        p.life = p.maxLife = 35;
      } else if (weather === 'tornado') {
        p.kind = 'debris';
        p.life = p.maxLife = r.range(1.7, 3.7);
        p.radius = r.range(18, 95);
        p.vx = r.range(35, 90);
        p.vy = r.range(50, 160);
        p.y = tornado.y + r.range(-30, 12);
        p.x = tornado.x;
        p.spin = r.range(4, 9);
        p.size = r.range(2, 5);
      } else {
        p.kind = 'rain';
        p.vy = r.range(weather === 'rain' ? 640 : 850, weather === 'rain' ? 880 : 1200);
        p.vx = weather === 'thunderstorm' ? -290 : weather === 'heavy-rain' ? -180 : -90;
        p.size = r.range(.7, 1.5);
      }
    }
    update(dt, weather, tornado) {
      this.emission += WEATHER[weather].rate * this.quality * dt;
      const count = Math.min(100, Math.floor(this.emission));
      this.emission -= Math.floor(this.emission); // Drop excess work instead of building a backlog.
      for (let i = 0; i < count; i++) this.spawn(weather, tornado);
      const list = this.pool.active, h = this.world.height;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.kind === 'debris') {
          p.angle += p.spin * dt;
          p.radius += 20 * dt;
          p.x = tornado.x + Math.cos(p.angle) * p.radius;
          p.y -= p.vy * dt;
        } else if (p.kind === 'splash') {
          p.vy += 360 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        } else {
          p.x += (p.vx + (p.kind === 'snow' ? Math.sin(p.angle += dt) * 22 : 0)) * dt;
          p.y += p.vy * dt;
          if (p.kind === 'rain' && p.y >= p.ground) {
            if (this.random.next() > .53) {
              // Reuse the raindrop itself for its ground splash; no secondary allocation.
              p.kind = 'splash';
              p.y = p.ground;
              p.vx = this.random.range(-35, 35);
              p.vy = -this.random.range(30, 60);
              p.life = p.maxLife = .23;
            } else p.life = 0;
          }
          if (p.kind === 'snow' && p.y >= p.ground) p.life = 0;
        }
        if (p.life <= 0 || p.y > h + 35 || p.y < -h * .2 || p.x < -230 || p.x > WORLD_WIDTH + 230) this.pool.release(i);
      }
    }
    draw(ctx, weather) {
      const particles = this.pool.active;
      if (weather !== 'sunny' && weather !== 'snow' && weather !== 'tornado') {
        // All rain segments share one path and one stroke, instead of hundreds of calls.
        ctx.beginPath();
        ctx.strokeStyle = weather === 'rain' ? '#e6f0dc77' : '#d5e4db96';
        ctx.lineWidth = weather === 'rain' ? 1.05 : 1.4;
        for (const p of particles) {
          if (p.kind === 'rain') { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .024, p.y - p.vy * .024); }
          else if (p.kind === 'splash') { ctx.moveTo(p.x - 2, p.y + 1); ctx.lineTo(p.x, p.y - 2); ctx.lineTo(p.x + 3, p.y); }
        }
        ctx.stroke();
        return;
      }
      for (const p of particles) {
        const fade = Math.min(1, p.life, (p.maxLife - p.life) * 2);
        ctx.globalAlpha = p.alpha * fade;
        if (p.kind === 'debris') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
          ctx.fillStyle = p.size > 3.5 ? '#6e7349' : '#ddca98';
          ctx.fillRect(-p.size, -1, p.size * 2, p.size * .65); ctx.restore();
        } else ellipse(ctx, p.x, p.y, p.size, p.size, p.kind === 'snow' ? '#fffdf0' : '#fff2bc');
      }
      ctx.globalAlpha = 1;
    }
  }

  class Animal {
    constructor(id, species, progress, lane, size) {
      this.id = id;
      this.species = species;
      this.random = new Random(id * 1274 + 943);
      this.spawnX = -190;
      // A prewarmed world: these are the distances already traveled from the
      // left entrance before the visitor arrives. Every subsequent lap starts there.
      this.x = this.spawnX + progress;
      this.baseLane = lane;
      this.lane = lane;
      this.y = 0;
      this.groundY = 0;
      this.size = size;
      this.renderScale = size;
      this.speed = 0;
      this.baseSpeed = 20;
      this.phase = this.random.range(0, TAU);
      this.state = 'walk';
      this.stateTime = 0;
      this.stateDuration = 0;
      this.cooldown = this.random.range(3, 14);
      this.angle = 0;
      this.climb = 0;
      this.tree = null;
      this.bounds = { left: 0, right: 0, top: 0, bottom: 0 };
      this.localBounds = { left: -115, right: 110, top: -104, bottom: 8 };
      this.laps = 0;
    }
    setState(state, duration = 0) {
      this.state = state;
      this.stateTime = 0;
      this.stateDuration = duration;
    }
    behavior(dt, context) {
      if (this.state !== 'walk' && this.stateTime >= this.stateDuration) this.setState('walk');
    }
    update(dt, context) {
      const { world, season, weather, animals, time } = context;
      const dangerous = weather.current === 'tornado' || weather.current === 'thunderstorm';
      this.stateTime += dt;
      this.cooldown -= dt;
      this.behavior(dt, context);
      if (dangerous && ['rest', 'drink', 'trunk', 'stealth'].includes(this.state)) this.setState('walk');
      let factor = lerp(.82, 1.23, season.wetness) * WEATHER[weather.current].activity;
      if (this.state === 'rest' || this.state === 'drink') factor *= .025;
      if (this.state === 'trunk') factor *= .55;
      if (this.state === 'stealth') factor *= .65;
      if (this.state === 'sprint') factor *= 1.65;
      if (['climb', 'perch', 'descend'].includes(this.state)) factor = 0;

      // Group species seek the next family member in the circular world.
      // Dry weather and danger reduce preferred spacing; leopards never flock.
      let targetLane = this.baseLane;
      if (this.species !== 'leopard') {
        let ahead = null, distance = Infinity;
        for (const other of animals) {
          if (other === this || other.species !== this.species) continue;
          const gap = (other.x - this.x + WORLD_WIDTH + 380) % (WORLD_WIDTH + 380);
          if (gap < distance) { distance = gap; ahead = other; }
        }
        const spacing = (dangerous ? 102 : lerp(135, 205, season.wetness)) * this.size;
        if (ahead && distance < 460) {
          factor *= clamp(distance / spacing, .66, 1.2);
          targetLane = lerp(ahead.baseLane, this.baseLane, season.wetness * .7 + .2);
        }
      } else targetLane += Math.sin(time * .1 + this.id) * .012;
      if (this.tree && ['climb', 'perch', 'descend'].includes(this.state)) targetLane = this.tree.lane;
      this.lane = approach(this.lane, targetLane, .8, dt);
      this.speed = this.baseSpeed * factor;
      this.x += this.speed * dt;
      this.phase = (this.phase + dt * (this.speed * .12 + .45)) % TAU;
      const targetAngle = this.state === 'perch' ? -.07 : (['climb', 'descend'].includes(this.state) ? -1.03 : 0);
      this.angle = approach(this.angle, targetAngle, 4, dt);
      if (this.x + this.localBounds.left * this.renderScale > WORLD_WIDTH) {
        // The only position reset happens beyond the right edge. Animals reenter
        // fully offscreen on the left; weather and season never call this code.
        this.x = -this.localBounds.right * this.renderScale;
        this.climb = 0;
        this.tree = null;
        this.angle = 0;
        this.setState('walk');
        this.laps++;
      }
      this.project(world);
    }
    project(world) {
      this.renderScale = this.size * clamp(world.height / 650, .78, 1.27);
      this.groundY = world.height * (this.lane + Math.sin(this.x * .004 + this.id) * .005);
      const climbHeight = this.tree ? this.tree.height * .72 * this.climb : 0;
      this.y = this.groundY - climbHeight;
      this.updateBounds();
    }
    updateBounds() {
      const b = this.localBounds, out = this.bounds, s = this.renderScale;
      const cosine = Math.cos(this.angle), sine = Math.sin(this.angle);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < 4; i++) {
        const px = (i & 1 ? b.right : b.left) * s;
        const py = (i & 2 ? b.bottom : b.top) * s;
        const x = this.x + px * cosine - py * sine;
        const y = this.y + px * sine + py * cosine;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      out.left = minX; out.right = maxX; out.top = minY; out.bottom = maxY;
    }
    draw(ctx, selected) {
      const s = this.renderScale;
      ellipse(ctx, this.x, this.groundY + 3, 64 * s, 9 * s, `rgba(61,64,34,${this.climb ? .09 : .15})`);
      if (selected) {
        ctx.save(); ctx.setLineDash([4, 5]);
        stroke(ctx, '#faf3cdcc', 1.5, () => ctx.ellipse(this.x, this.groundY + 1, 82 * s, 16 * s, 0, 0, TAU));
        ctx.restore();
      }
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.scale(s, s);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      this.drawBody(ctx);
      ctx.restore();
    }
    leg(ctx, x, top, length, width, step, color, elephant = false) {
      const toe = x + step;
      ctx.beginPath(); ctx.moveTo(x - width * .5, top);
      ctx.quadraticCurveTo(x - width * .55 + step * .45, top + length * .55, toe - width * .42, top + length - 4);
      ctx.quadraticCurveTo(toe - width * .35, top + length + 1, toe + width * .65, top + length);
      ctx.lineTo(toe + width * .67, top + length - 5);
      ctx.lineTo(x + width * .4 + step * .3, top + length * .4);
      ctx.lineTo(x + width * .6, top); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      if (elephant) {
        for (let i = 0; i < 3; i++) ellipse(ctx, toe - width * .2 + i * width * .27, top + length - 1.8, width * .12, 2.1, '#c5c5ad');
      }
    }
    get label() { return this.species === 'lion' ? 'African lion' : this.species === 'elephant' ? 'African elephant' : 'African leopard'; }
    get mood() {
      return ({ walk: this.species === 'lion' ? 'Patrolling with the pride' : this.species === 'elephant' ? 'Wandering with the herd' : 'Taking the quiet way', rest: 'A little rest in the warm grass', drink: 'A drink at the waterhole', trunk: 'Reading the breeze', stealth: 'Moving low through the grass', sprint: 'A quick, quiet dash', climb: 'Climbing an acacia', perch: 'A better view from up here', descend: 'Returning to the grasslands' })[this.state];
    }
  }

  class Lion extends Animal {
    constructor(id, progress, lane, size, male = false) {
      super(id, 'lion', progress, lane, size);
      this.male = male;
      this.baseSpeed = 18;
      this.localBounds = { left: -117, right: 100, top: -113, bottom: 27 };
    }
    behavior(dt, context) {
      super.behavior(dt, context);
      if (this.state === 'walk' && this.cooldown <= 0 && !['tornado', 'thunderstorm'].includes(context.weather.current)) {
        this.setState('rest', this.random.range(3, 6));
        this.cooldown = this.random.range(16, 29) * lerp(.8, 1.4, context.season.wetness);
      }
    }
    drawBody(ctx) {
      const rest = this.state === 'rest', gait = Math.sin(this.phase), gait2 = Math.sin(this.phase + Math.PI);
      const step = rest ? 0 : gait * 9;
      ctx.save();
      if (rest) ctx.translate(0, 22);
      stroke(ctx, '#b38b49', 4.3, () => { ctx.moveTo(-50, -47); ctx.bezierCurveTo(-86, -34, -75, -78 + gait * 5, -104, -68 + gait * 5); });
      ellipse(ctx, -104, -68 + gait * 5, 5, 8, '#695134', -.4);
      const legLength = rest ? 22 : 43;
      this.leg(ctx, -42, -44, legLength, 12, -step, '#ad8547');
      this.leg(ctx, 33, -45, legLength, 11, -gait2 * 9, '#ad8547');
      const bodyGradient = ctx.createLinearGradient(0, -80, 0, -27);
      bodyGradient.addColorStop(0, '#d7b16a'); bodyGradient.addColorStop(1, '#c39a54');
      ctx.beginPath(); ctx.moveTo(-53, -65); ctx.bezierCurveTo(-23, -81, 7, -71, 36, -75);
      ctx.bezierCurveTo(58, -72, 57, -43, 36, -34); ctx.bezierCurveTo(7, -25, -16, -36, -42, -31);
      ctx.bezierCurveTo(-68, -28, -71, -54, -53, -65); ctx.fillStyle = bodyGradient; ctx.fill();
      ellipse(ctx, -41, -46, 24, 23, bodyGradient);
      ellipse(ctx, 29, -50, 19, 26, bodyGradient);
      this.leg(ctx, -40, -41, legLength, 13, step, '#c8a05a');
      this.leg(ctx, 31, -43, legLength, 12, gait2 * 10, '#cba45e');
      if (this.male) {
        ctx.beginPath();
        for (let i = 0; i <= 26; i++) {
          const a = i / 26 * TAU, r = i % 2 ? 34 : 31;
          const x = 44 + Math.cos(a) * r, y = -68 + Math.sin(a) * (r + 4);
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const mane = ctx.createLinearGradient(20, -100, 65, -34);
        mane.addColorStop(0, '#80603a'); mane.addColorStop(.5, '#8d6336'); mane.addColorStop(1, '#5b4a31');
        ctx.fillStyle = mane; ctx.fill();
        stroke(ctx, '#b08b52', 1.3, () => { ctx.moveTo(24, -86); ctx.quadraticCurveTo(7, -64, 29, -44); ctx.moveTo(37, -95); ctx.lineTo(32, -84); });
      }
      ellipse(ctx, 45, -91, 9, 10, '#bd9554', -.15);
      ellipse(ctx, 45, -91, 4.7, 5.8, '#8d6f42');
      ellipse(ctx, 57, -70, this.male ? 20 : 19, 25, '#d8b471', -.12);
      ellipse(ctx, 68, -58, 13, 9, '#e6ca8d');
      ellipse(ctx, 62, -50, 8, 4, '#e0c084');
      ctx.beginPath(); ctx.moveTo(76, -64); ctx.lineTo(83, -61); ctx.lineTo(77, -57); ctx.closePath(); ctx.fillStyle = '#514736'; ctx.fill();
      if (rest) stroke(ctx, '#514736', 1.7, () => { ctx.moveTo(65, -76); ctx.quadraticCurveTo(69, -74, 72, -77); });
      else { ellipse(ctx, 69, -76, 2.2, 2.1, '#3f4130'); ellipse(ctx, 69.7, -76.5, .65, .65, '#fff4cc'); }
      stroke(ctx, '#8e774b', 1, () => { ctx.moveTo(70, -53); ctx.lineTo(77, -53); ctx.moveTo(77, -53); ctx.lineTo(79, -57); });
      ellipse(ctx, 69, -59, .8, .8, '#7f6b43'); ellipse(ctx, 72, -56, .8, .8, '#7f6b43');
      stroke(ctx, '#ead39b99', .75, () => { ctx.moveTo(70, -57); ctx.lineTo(90, -54); ctx.moveTo(70, -55); ctx.lineTo(88, -49); });
      ctx.restore();
    }
  }

  class Elephant extends Animal {
    constructor(id, progress, lane, size) {
      super(id, 'elephant', progress, lane, size);
      this.baseSpeed = 13;
      this.localBounds = { left: -113, right: 154, top: -164, bottom: 12 };
    }
    behavior(dt, context) {
      super.behavior(dt, context);
      if (this.state === 'walk' && this.cooldown <= 0 && !['tornado', 'thunderstorm'].includes(context.weather.current)) {
        const nearWater = this.x > 305 && this.x < 580;
        this.setState(nearWater ? 'drink' : 'trunk', nearWater ? 4.5 : 3.1);
        this.cooldown = this.random.range(12, 23) * lerp(.8, 1.1, context.season.wetness);
      }
    }
    drawBody(ctx) {
      const gait = Math.sin(this.phase), step = this.state === 'drink' ? 0 : gait * 5;
      const body = ctx.createLinearGradient(-30, -126, 20, -25);
      body.addColorStop(0, '#a8afa0'); body.addColorStop(.52, '#939e90'); body.addColorStop(1, '#818e80');
      stroke(ctx, '#7e8b7a', 3.5, () => { ctx.moveTo(-76, -90); ctx.bezierCurveTo(-96, -79, -91, -53, -96, -42); });
      ellipse(ctx, -96, -40, 3.5, 6.5, '#596953');
      this.leg(ctx, -52, -57, 55, 22, -step, '#758575', true);
      this.leg(ctx, 29, -58, 56, 23, step, '#778777', true);
      ctx.beginPath(); ctx.moveTo(-76, -105); ctx.bezierCurveTo(-60, -135, 2, -132, 35, -114);
      ctx.bezierCurveTo(57, -102, 59, -63, 26, -49); ctx.bezierCurveTo(1, -37, -36, -42, -64, -49);
      ctx.bezierCurveTo(-88, -60, -90, -84, -76, -105); ctx.fillStyle = body; ctx.fill();
      this.leg(ctx, -57, -58, 59, 25, step, '#9aa492', true);
      this.leg(ctx, 21, -56, 58, 25, -step, '#96a18f', true);
      ellipse(ctx, 58, -99, 34, 36, body, -.12);
      ctx.beginPath(); ctx.moveTo(64, -127); ctx.bezierCurveTo(82, -128, 93, -114, 92, -88);
      ctx.lineTo(82, -67); ctx.lineTo(56, -74); ctx.closePath(); ctx.fillStyle = body; ctx.fill();
      const lift = this.state === 'trunk' ? Math.sin(clamp(this.stateTime / this.stateDuration, 0, 1) * Math.PI) : 0;
      const endX = 109 + lift * 22, endY = -12 - lift * 120;
      ctx.beginPath(); ctx.moveTo(79, -103); ctx.bezierCurveTo(106, -88, 91 + lift * 32, endY + 14, endX, endY);
      ctx.quadraticCurveTo(endX + 11, endY - 5, endX + 11, endY + 3);
      ctx.bezierCurveTo(98 + lift * 45, endY + 31, 108, -67, 93, -107);
      ctx.closePath(); ctx.fillStyle = '#919c8b'; ctx.fill();
      stroke(ctx, '#738570', 1.5, () => { ctx.moveTo(97, -57); ctx.lineTo(105, -58); ctx.moveTo(99, -48); ctx.lineTo(108, -49); });
      ellipse(ctx, endX + 6, endY + 2, 3, 2, '#5b6e58', -.3);
      ctx.beginPath(); ctx.moveTo(75, -78); ctx.quadraticCurveTo(89, -66, 112, -68); ctx.quadraticCurveTo(98, -53, 75, -68); ctx.closePath(); ctx.fillStyle = '#eee5bd'; ctx.fill();
      // The broad fan-shaped ear overlaps the shoulder and moves gently at its tip.
      const flap = Math.sin(this.phase * .45) * 3;
      ctx.beginPath(); ctx.moveTo(37, -117); ctx.bezierCurveTo(-9, -140, -16 - flap, -103, 8, -67);
      ctx.bezierCurveTo(21, -43, 42, -64, 45, -91); ctx.quadraticCurveTo(49, -109, 37, -117);
      const ear = ctx.createLinearGradient(3, -100, 47, -84); ear.addColorStop(0, '#aab09c'); ear.addColorStop(1, '#8a9782'); ctx.fillStyle = ear; ctx.fill();
      stroke(ctx, '#74857077', 1.2, () => { ctx.moveTo(35, -111); ctx.bezierCurveTo(6, -123, 1, -102, 19, -76); });
      stroke(ctx, '#c2c7ae66', 1.2, () => { ctx.moveTo(-66, -107); ctx.quadraticCurveTo(-35, -123, -6, -115); ctx.moveTo(-54, -53); ctx.lineTo(-43, -52); });
      ellipse(ctx, 77, -103, 2.4, 2, '#394d3d');
      stroke(ctx, '#64775f', 1.3, () => { ctx.moveTo(72, -108); ctx.lineTo(80, -110); });
      if (this.state === 'drink') {
        const ripple = (this.stateTime % 1.3) / 1.3;
        ctx.globalAlpha = (1 - ripple) * .45;
        stroke(ctx, '#e5ead1', 1.4, () => ctx.ellipse(endX + 5, 4, 8 + ripple * 18, 2 + ripple * 4, 0, 0, TAU));
        ctx.globalAlpha = 1;
      }
    }
  }

  class Leopard extends Animal {
    constructor(id, progress, lane, size) {
      super(id, 'leopard', progress, lane, size);
      this.baseSpeed = 34;
      this.cooldown = this.random.range(0, 6);
      this.localBounds = { left: -135, right: 96, top: -105, bottom: 12 };
      this.spots = [];
      for (let i = 0; i < 24; i++) {
        const angle = this.random.range(0, TAU), radius = Math.sqrt(this.random.next());
        this.spots.push({ x: -12 + Math.cos(angle) * 47 * radius, y: -51 + Math.sin(angle) * 17 * radius, size: this.random.range(2.2, 3.7), angle });
      }
    }
    behavior(dt, context) {
      const danger = ['tornado', 'thunderstorm'].includes(context.weather.current);
      if (danger && ['climb', 'perch'].includes(this.state)) this.setState('descend');
      if (this.state === 'climb') {
        this.climb = Math.min(1, this.climb + dt * .3);
        if (this.climb >= 1) this.setState('perch', 3.5);
      } else if (this.state === 'perch') {
        if (this.stateTime >= this.stateDuration) this.setState('descend');
      } else if (this.state === 'descend') {
        this.climb = Math.max(0, this.climb - dt * .4);
        if (this.climb <= 0) { this.setState('walk'); this.tree = null; this.cooldown = 17; }
      } else {
        if (this.state !== 'walk' && this.stateTime >= this.stateDuration) this.setState('walk');
        if (!danger && this.cooldown <= 0) {
          const tree = context.trees.find(t => t.climbable && this.x > t.x - 32 && this.x < t.x + 8);
          if (tree) { this.tree = tree; this.setState('climb'); }
          else if (this.state === 'walk' && this.random.next() < dt * .2) {
            this.setState(context.season.wetness > .5 ? 'sprint' : 'stealth', this.random.range(3, 5));
            this.cooldown = this.random.range(4, 9);
          }
        }
      }
    }
    drawBody(ctx) {
      const gait = Math.sin(this.phase), step = ['perch', 'climb', 'descend'].includes(this.state) ? Math.sin(this.phase * 2) * 7 : gait * 12;
      stroke(ctx, '#685339', 6, () => { ctx.moveTo(-56, -46); ctx.bezierCurveTo(-105, -25, -100, -71 + gait * 7, -122, -65 + gait * 7); });
      stroke(ctx, '#ceaa61', 3.7, () => { ctx.moveTo(-56, -46); ctx.bezierCurveTo(-105, -25, -100, -71 + gait * 7, -122, -65 + gait * 7); });
      for (let i = 0; i < 4; i++) ellipse(ctx, -83 - i * 6, -43 - i * 5 + gait * i, 2.5, 2.2, '#6d5637');
      this.leg(ctx, -43, -41, 39, 7.5, -step, '#ae8c46');
      this.leg(ctx, 30, -41, 39, 7.5, step, '#ad8b44');
      const body = ctx.createLinearGradient(0, -77, 0, -27);
      body.addColorStop(0, '#dbb660'); body.addColorStop(1, '#c8a35a');
      ctx.beginPath(); ctx.moveTo(-57, -63); ctx.bezierCurveTo(-22, -76, 3, -62, 35, -70);
      ctx.bezierCurveTo(53, -68, 53, -45, 31, -34); ctx.bezierCurveTo(7, -27, -27, -38, -49, -30);
      ctx.bezierCurveTo(-66, -29, -75, -51, -57, -63); ctx.closePath(); ctx.fillStyle = body; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-32, -34); ctx.quadraticCurveTo(3, -38, 29, -34); ctx.quadraticCurveTo(4, -25, -32, -34); ctx.fillStyle = '#e5cd90'; ctx.fill();
      for (const spot of this.spots) {
        ctx.beginPath(); ctx.strokeStyle = '#715737'; ctx.lineWidth = 1.8;
        ctx.arc(spot.x, spot.y, spot.size, spot.angle, spot.angle + Math.PI * 1.5); ctx.stroke();
        ellipse(ctx, spot.x + .5, spot.y, .7, .8, '#a27d40');
      }
      this.leg(ctx, -44, -38, 39, 9, step, '#caa45a');
      this.leg(ctx, 28, -40, 41, 9, -step, '#cfad65');
      for (let i = 0; i < 3; i++) {
        ellipse(ctx, -42 + step * (i / 4), -30 + i * 10, 2, 1.8, '#7d5e38');
        ellipse(ctx, 28 - step * (i / 4), -31 + i * 10, 1.8, 1.6, '#7d5e38');
      }
      ellipse(ctx, 41, -62, 13, 24, body, -.5);
      ellipse(ctx, 49, -78, 6, 7, '#6a5439'); ellipse(ctx, 49, -77, 3.5, 4.5, '#c7aa68');
      ellipse(ctx, 63, -76, 6, 7, '#705b3c');
      ellipse(ctx, 58, -62, 19, 20, '#d7b66c', -.22);
      ellipse(ctx, 70, -52, 11, 7, '#efdab0');
      ctx.beginPath(); ctx.moveTo(75, -58); ctx.lineTo(81, -55); ctx.lineTo(77, -52); ctx.closePath(); ctx.fillStyle = '#494837'; ctx.fill();
      ellipse(ctx, 67, -65, 2.1, 1.8, '#404935');
      stroke(ctx, '#e8d293', 1.6, () => { ctx.moveTo(63, -68); ctx.lineTo(69, -69); });
      const faceSpots = [[50,-66],[54,-55],[51,-72],[60,-72],[61,-49],[45,-54],[42,-47]];
      for (const [x, y] of faceSpots) ellipse(ctx, x, y, 1.6, 1.7, '#715a38');
      stroke(ctx, '#f4e5be99', .7, () => { ctx.moveTo(70, -51); ctx.lineTo(86, -48); ctx.moveTo(68, -48); ctx.lineTo(82, -43); });
    }
  }

  class LightningController {
    constructor(world, random) {
      this.world = world;
      this.random = random;
      this.next = 1.6;
      this.age = 1;
      this.duration = .34;
      this.visible = false;
      this.flash = 0;
      this.points = Array.from({ length: 15 }, () => ({ x: 0, y: 0 }));
      this.intervals = [];
      this.gaps = [];
      this.minX = 0;
      this.maxX = 0;
      this.strikes = 0;
    }
    clear() { this.visible = false; this.age = 1; this.flash = 0; this.next = 1.6; }
    build(animals) {
      /* SAFETY ALGORITHM: project every animal's complete, transformed bounding
         box onto the horizontal axis, pad it by 43 world units, then merge those
         forbidden intervals. The ENTIRE lightning path (including its glow) stays
         in one remaining vertical corridor. This is more conservative than just
         choosing a safe ground endpoint: even climbing animals are protected.
         If the scene has no clear corridor, the strike is suppressed. */
      this.intervals.length = 0;
      this.gaps.length = 0;
      const padding = 43;
      for (const animal of animals) {
        const b = animal.bounds;
        if (b.right + padding < 0 || b.left - padding > WORLD_WIDTH) continue;
        this.intervals.push([Math.max(0, b.left - padding), Math.min(WORLD_WIDTH, b.right + padding)]);
      }
      this.intervals.sort((a, b) => a[0] - b[0]);
      let cursor = 18;
      for (const interval of this.intervals) {
        if (interval[0] - cursor >= 48) this.gaps.push([cursor, interval[0]]);
        cursor = Math.max(cursor, interval[1]);
      }
      if (WORLD_WIDTH - 18 - cursor >= 48) this.gaps.push([cursor, WORLD_WIDTH - 18]);
      if (!this.gaps.length) { this.visible = false; return false; }
      let total = 0;
      for (const gap of this.gaps) total += gap[1] - gap[0];
      let pick = this.random.range(0, total), chosen = this.gaps[0];
      for (const gap of this.gaps) {
        pick -= gap[1] - gap[0];
        if (pick <= 0) { chosen = gap; break; }
      }
      const x = (chosen[0] + chosen[1]) * .5;
      const jitter = Math.min(35, (chosen[1] - chosen[0]) * .5 - 15);
      this.minX = Infinity; this.maxX = -Infinity;
      const endpoint = this.world.height * this.random.range(.79, .91);
      for (let i = 0; i < this.points.length; i++) {
        const point = this.points[i];
        point.x = x + (i === this.points.length - 1 ? 0 : this.random.range(-jitter, jitter));
        point.y = lerp(this.world.height * .025, endpoint, i / (this.points.length - 1));
        this.minX = Math.min(this.minX, point.x - 13);
        this.maxX = Math.max(this.maxX, point.x + 13);
      }
      this.visible = true;
      return true;
    }
    isSafe(animals) {
      if (!this.visible) return true;
      return animals.every(animal => animal.bounds.right + 26 < this.minX || animal.bounds.left - 26 > this.maxX);
    }
    update(dt, enabled, animals) {
      if (!enabled) return;
      this.next -= dt;
      this.age += dt;
      if (this.next <= 0) {
        this.age = 0;
        this.next = this.random.range(3.6, 7);
        if (this.build(animals)) this.strikes++;
      }
      if (this.age >= this.duration) this.visible = false;
      // Revalidate AFTER wildlife movement on every frame of the flash. If a
      // moving animal enters a corridor, relocate the bolt before rendering it.
      if (this.visible && !this.isSafe(animals)) this.build(animals);
      this.flash = this.visible ? Math.max(0, 1 - this.age / this.duration) * .2 : 0;
    }
    draw(ctx) {
      if (!this.visible) return;
      const flicker = (Math.sin(this.age * 105) + 1) * .25 + .5;
      ctx.save(); ctx.globalAlpha = (1 - this.age / this.duration) * flicker;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); this.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.strokeStyle = '#e5edc528'; ctx.lineWidth = 21; ctx.stroke();
      ctx.strokeStyle = '#eff8cd99'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = '#fffce3'; ctx.lineWidth = 2.7; ctx.stroke();
      const last = this.points[this.points.length - 1];
      ellipse(ctx, last.x, last.y + 1, 12, 3.5, '#f7f3c777'); ctx.restore();
    }
  }

  class WeatherManager {
    constructor(world, events, reducedMotion) {
      this.world = world;
      this.events = events;
      this.random = new Random(7231);
      this.current = 'sunny';
      this.darkness = 0;
      this.cloudiness = .12;
      this.wind = 12;
      this.water = 0;
      this.snowCover = 0;
      this.particles = new ParticleSystem(world, reducedMotion);
      this.lightning = new LightningController(world, this.random);
      this.tornado = { x: 1360, y: world.height * .78, targetId: null, speed: 0, phase: 0 };
    }
    set(weather, season) {
      if (!WEATHER[weather] || weather === this.current) return false;
      if (weather === 'snow' && season.current === 'wet') {
        this.events.emit('notice', 'Snow visits the dry season. Try switching seasons.');
        return false;
      }
      // Recycle every old particle before emitting the newly selected effect.
      // Environmental wetness can persist and evaporate; old weather particles cannot.
      this.particles.clear();
      this.lightning.clear();
      this.current = weather;
      if (weather === 'tornado') {
        this.tornado.x = 1320;
        this.tornado.y = this.world.height * .77;
        this.tornado.targetId = null;
      }
      const preload = Math.min(175, Math.floor(WEATHER[weather].rate * .35));
      for (let i = 0; i < preload; i++) this.particles.spawn(weather, this.tornado, true);
      this.events.emit('weather', weather);
      return true;
    }
    update(dt, animals) {
      const profile = WEATHER[this.current];
      this.darkness = approach(this.darkness, profile.dark, 1, dt);
      this.cloudiness = approach(this.cloudiness, profile.cloud, .8, dt);
      this.wind = approach(this.wind, profile.wind, 1.2, dt);
      const raining = ['rain', 'heavy-rain', 'thunderstorm'].includes(this.current);
      this.water = clamp(this.water + dt * (raining ? (this.current === 'rain' ? .022 : .054) : -.012), 0, 1);
      this.snowCover = clamp(this.snowCover + dt * (this.current === 'snow' ? .025 : -.018), 0, .82);
      if (this.current === 'tornado') this.updateTornado(dt, animals);
      this.particles.update(dt, this.current, this.tornado);
      this.lightning.update(dt, this.current === 'thunderstorm', animals);
    }
    updateTornado(dt, animals) {
      const t = this.tornado;
      t.phase = (t.phase + dt * 3) % TAU;
      let nearest = null, bestDistance = Infinity;
      // Reacquire the nearest visible animal each frame (nine comparisons).
      // Velocity is capped below the target's current speed; vector normalization
      // makes diagonal pursuit no faster, and min(distance, step) prevents overshoot.
      for (const animal of animals) {
        if (animal.bounds.right < 0 || animal.bounds.left > WORLD_WIDTH) continue;
        const distance = (animal.x - t.x) ** 2 + (animal.groundY - t.y) ** 2;
        if (distance < bestDistance) { bestDistance = distance; nearest = animal; }
      }
      if (!nearest) { t.targetId = null; return; }
      t.targetId = nearest.id;
      const distance = Math.sqrt(bestDistance);
      t.speed = Math.min(9, nearest.speed * .58);
      if (distance > 2) {
        const step = Math.min(distance, t.speed * dt);
        t.x += (nearest.x - t.x) / distance * step;
        t.y += (nearest.groundY - t.y) / distance * step;
      }
      t.y = clamp(t.y, this.world.height * .65, this.world.height * .93);
    }
    drawTornado(ctx, time) {
      if (this.current !== 'tornado') return;
      const t = this.tornado, top = this.world.height * .12, height = t.y - top;
      const sway = Math.sin(time * .8) * 28;
      const topX = t.x + 50 + sway;
      ellipse(ctx, t.x, t.y + 4, 102, 17, '#4a50352a');
      ctx.beginPath(); ctx.moveTo(topX - 144, top);
      ctx.bezierCurveTo(topX - 95, top + height * .4, t.x - 10, t.y - 90, t.x - 18, t.y);
      ctx.quadraticCurveTo(t.x, t.y + 10, t.x + 19, t.y);
      ctx.bezierCurveTo(t.x + 2, t.y - 92, topX + 90, top + height * .35, topX + 148, top);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(topX - 100, top, topX + 85, t.y);
      gradient.addColorStop(0, '#6e756e24'); gradient.addColorStop(.45, '#656c62a6'); gradient.addColorStop(1, '#b5ab8577');
      ctx.fillStyle = gradient; ctx.fill();
      for (let i = 0; i < 23; i++) {
        const fraction = (i + (time * 1.7 % 1)) / 23;
        const y = lerp(t.y, top, fraction);
        const cx = lerp(t.x, topX, fraction * fraction) + Math.sin(fraction * 12 + time * 3) * 9;
        const radius = 14 + Math.pow(fraction, 1.6) * 135;
        ctx.beginPath(); ctx.ellipse(cx, y, radius, 5 + fraction * 13, -.09, .15 + time * 4, 4.4 + time * 4);
        ctx.strokeStyle = i % 2 ? '#d5cfab55' : '#454e4440'; ctx.lineWidth = 2.3 + fraction * 2; ctx.stroke();
      }
      stroke(ctx, '#d3c39666', 3, () => ctx.ellipse(t.x, t.y, 85, 13, 0, time * 2, time * 2 + 4.4));
    }
  }

  const PALETTES = {
    dry: { skyTop: [216,178,157], skyBottom: [247,215,161], far: [184,166,144], mountain: [157,150,125], ridge: [180,168,113], horizon: [196,181,112], middle: [183,170,93], near: [159,151,76], tree: [76,91,55], leaf: [116,126,72], water: [136,163,150] },
    wet: { skyTop: [166,198,191], skyBottom: [229,222,174], far: [155,179,164], mountain: [122,150,128], ridge: [145,168,100], horizon: [162,182,109], middle: [132,163,86], near: [103,137,72], tree: [57,88,55], leaf: [91,128,65], water: [122,164,157] },
    storm: { skyTop: [91,111,111], skyBottom: [172,180,158], far: [125,145,140], mountain: [103,129,113], ridge: [131,144,103], horizon: [151,158,105], middle: [132,143,86], near: [105,123,74], tree: [53,75,52], leaf: [87,110,66], water: [125,154,148] }
  };

  function drawAcacia(ctx, tree, palette, time = 0) {
    const { x, y, height } = tree;
    const s = height / 190;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const sway = Math.sin(time * .65 + x) * 1.8;
    ellipse(ctx, 18, 0, 108, 8, '#4b553a15');
    ctx.beginPath(); ctx.moveTo(-15, 3); ctx.quadraticCurveTo(-1, -48, -13, -99);
    ctx.lineTo(-23, -127); ctx.lineTo(-16, -135); ctx.lineTo(2, -110);
    ctx.quadraticCurveTo(8, -70, 5, -48); ctx.lineTo(12, 3); ctx.closePath();
    ctx.fillStyle = '#6e6749'; ctx.fill();
    ctx.lineCap = 'round';
    stroke(ctx, '#6e6749', 7, () => {
      ctx.moveTo(-5, -78); ctx.bezierCurveTo(-34, -106, -53, -114, -86, -126);
      ctx.moveTo(-9, -97); ctx.bezierCurveTo(18, -120, 35, -134, 72, -145);
      ctx.moveTo(-15, -108); ctx.lineTo(-37, -153);
      ctx.moveTo(24, -119); ctx.lineTo(105, -133);
    });
    stroke(ctx, '#a1905e77', 1.5, () => { ctx.moveTo(-8, -3); ctx.quadraticCurveTo(2, -50, -9, -89); });
    ctx.translate(sway, 0);
    // An uneven, flat umbrella canopy: overlapping scalloped lobes rather than
    // a stock circular tree silhouette. Warm highlights give the foliage depth.
    ctx.beginPath(); ctx.moveTo(-151, -132);
    ctx.bezierCurveTo(-159, -145, -139, -155, -119, -154);
    ctx.bezierCurveTo(-129, -173, -96, -179, -76, -173);
    ctx.bezierCurveTo(-66, -194, -28, -195, -9, -184);
    ctx.bezierCurveTo(15, -206, 52, -197, 64, -181);
    ctx.bezierCurveTo(92, -188, 122, -176, 120, -163);
    ctx.bezierCurveTo(154, -166, 169, -146, 148, -136);
    ctx.bezierCurveTo(124, -124, 83, -129, 59, -126);
    ctx.bezierCurveTo(23, -117, 2, -131, -27, -125);
    ctx.bezierCurveTo(-77, -120, -130, -120, -151, -132); ctx.closePath();
    const crown = ctx.createLinearGradient(0, -196, 0, -121);
    crown.addColorStop(0, rgb(palette.leaf)); crown.addColorStop(1, rgb(palette.tree)); ctx.fillStyle = crown; ctx.fill();
    ellipse(ctx, -88, -160, 44, 13, `rgba(${palette.leaf.join(',')},.49)`, -.12);
    ellipse(ctx, 11, -181, 53, 12, `rgba(${palette.leaf.join(',')},.7)`);
    ellipse(ctx, 96, -150, 43, 10, `rgba(${palette.leaf.join(',')},.4)`, .08);
    ctx.strokeStyle = '#e2d5922b'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 47; i++) {
      const px = Math.sin(i * 73.97 + x) * 128, py = -147 - ((i * 19) % 33);
      if (Math.abs(px) > 85 && py < -170) continue;
      ctx.moveTo(px, py); ctx.lineTo(px + 5 + i % 5, py - 1);
    }
    ctx.stroke(); ctx.restore();
  }

  class Landscape {
    constructor(world) {
      this.world = world;
      this.random = new Random(738291);
      this.sky = document.createElement('canvas');
      this.terrain = document.createElement('canvas');
      this.skyContext = this.sky.getContext('2d');
      this.terrainContext = this.terrain.getContext('2d');
      this.palette = {};
      this.lastSignature = '';
      this.cacheTimer = 1;
      this.grasses = [];
      this.foreground = [];
      this.clouds = [];
      this.stones = [];
      this.trees = [
        { x: 57, lane: .805, heightRatio: .37, y: 0, height: 0, climbable: false },
        { x: 697, lane: .654, heightRatio: .22, y: 0, height: 0, climbable: true },
        { x: 1285, lane: .745, heightRatio: .38, y: 0, height: 0, climbable: true },
        { x: 1540, lane: .91, heightRatio: .34, y: 0, height: 0, climbable: false }
      ];
      for (let i = 0; i < 650; i++) this.grasses.push({ x: this.random.range(0, WORLD_WIDTH), y: this.random.range(.58, .99), size: this.random.range(2, 9), angle: this.random.range(-.5, .5), light: this.random.next() });
      for (let i = 0; i < 108; i++) this.foreground.push({ x: this.random.range(-30, WORLD_WIDTH + 30), y: this.random.range(.93, 1.08), size: this.random.range(12, 48), phase: this.random.range(0, TAU) });
      for (let i = 0; i < 9; i++) this.clouds.push({ x: this.random.range(-250, 1800), y: this.random.range(.10, .37), width: this.random.range(100, 230), speed: this.random.range(1.8, 4.8), alpha: this.random.range(.17, .41) });
      for (let i = 0; i < 33; i++) this.stones.push({ x: this.random.range(120, 1580), y: this.random.range(.68, .95), size: this.random.range(3, 10) });
      this.grain = document.createElement('canvas');
      this.grain.width = this.grain.height = 256;
      const grainCtx = this.grain.getContext('2d');
      const data = grainCtx.createImageData(256, 256);
      for (let i = 0; i < data.data.length; i += 4) {
        const shade = this.random.next() > .5 ? 255 : 53;
        data.data[i] = shade; data.data[i + 1] = shade; data.data[i + 2] = shade;
        data.data[i + 3] = this.random.int(0, 12);
      }
      grainCtx.putImageData(data, 0, 0);
      this.grainPattern = null;
    }
    resize() {
      const h = Math.ceil(this.world.height);
      this.sky.width = this.terrain.width = WORLD_WIDTH;
      this.sky.height = this.terrain.height = h;
      for (const tree of this.trees) {
        tree.y = tree.lane * this.world.height;
        tree.height = tree.heightRatio * this.world.height;
      }
      this.lastSignature = '';
      this.cacheTimer = 1;
    }
    update(dt, season, weather) {
      this.cacheTimer += dt;
      const signature = [season.wetness.toFixed(2), weather.darkness.toFixed(2), weather.water.toFixed(2), weather.snowCover.toFixed(2)].join('|');
      if (signature !== this.lastSignature && this.cacheTimer >= .14) {
        this.cacheTimer = 0;
        this.lastSignature = signature;
        for (const key of Object.keys(PALETTES.dry)) {
          this.palette[key] = mix(mix(PALETTES.dry[key], PALETTES.wet[key], season.wetness), PALETTES.storm[key], weather.darkness);
          if (weather.snowCover > 0 && ['horizon', 'middle', 'near'].includes(key)) this.palette[key] = mix(this.palette[key], [218,222,203], weather.snowCover * .8);
        }
        this.cacheSky(weather);
        this.cacheTerrain(season, weather);
      }
      for (const cloud of this.clouds) {
        cloud.x += cloud.speed * weather.wind / 12 * dt;
        if (cloud.x > WORLD_WIDTH + 350) cloud.x = -350;
      }
    }
    cacheSky(weather) {
      const ctx = this.skyContext, h = this.world.height, p = this.palette;
      ctx.clearRect(0, 0, WORLD_WIDTH, h);
      const sky = ctx.createLinearGradient(0, 0, 0, h * .67);
      sky.addColorStop(0, rgb(p.skyTop)); sky.addColorStop(1, rgb(p.skyBottom));
      ctx.fillStyle = sky; ctx.fillRect(0, 0, WORLD_WIDTH, h);
      const sx = 1122, sy = h * .232, radius = Math.min(71, h * .108);
      ctx.globalAlpha = 1 - weather.darkness * 1.05;
      const glow = ctx.createRadialGradient(sx, sy, radius * .5, sx, sy, radius * 3.1);
      glow.addColorStop(0, '#fff5c444'); glow.addColorStop(1, '#fff5c400');
      ellipse(ctx, sx, sy, radius * 3.1, radius * 3.1, glow);
      ellipse(ctx, sx, sy, radius, radius, '#fff0b9');
      ellipse(ctx, sx, sy, radius * 1.11, radius * 1.11, '#fff3c018');
      ctx.globalAlpha = 1;
      const haze = ctx.createLinearGradient(0, h * .37, 0, h * .6);
      haze.addColorStop(0, '#f9e4b800'); haze.addColorStop(1, '#f9e4b82e');
      ctx.fillStyle = haze; ctx.fillRect(0, h * .37, WORLD_WIDTH, h * .23);
    }
    cacheTerrain(season, weather) {
      const ctx = this.terrainContext, h = this.world.height, p = this.palette;
      ctx.clearRect(0, 0, WORLD_WIDTH, h);
      // Distant layers overlap with increasingly strong color and contrast.
      ctx.beginPath(); ctx.moveTo(0, h * .50); ctx.lineTo(0, h * .43);
      ctx.bezierCurveTo(70, h * .42, 142, h * .35, 215, h * .40);
      ctx.lineTo(315, h * .345); ctx.lineTo(385, h * .366); ctx.lineTo(490, h * .31);
      ctx.lineTo(565, h * .344); ctx.lineTo(647, h * .326); ctx.lineTo(739, h * .405);
      ctx.bezierCurveTo(840, h * .366, 901, h * .42, 990, h * .395);
      ctx.lineTo(1100, h * .365); ctx.lineTo(1200, h * .40); ctx.lineTo(1330, h * .35);
      ctx.lineTo(1450, h * .40); ctx.lineTo(1600, h * .38); ctx.lineTo(1600, h * .56); ctx.closePath(); ctx.fillStyle = rgb(p.far); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, h * .50); ctx.bezierCurveTo(123, h * .49, 190, h * .42, 302, h * .437);
      ctx.bezierCurveTo(382, h * .45, 460, h * .39, 536, h * .405);
      ctx.bezierCurveTo(640, h * .407, 675, h * .475, 803, h * .46);
      ctx.bezierCurveTo(955, h * .44, 1014, h * .47, 1101, h * .447);
      ctx.bezierCurveTo(1270, h * .39, 1455, h * .45, 1600, h * .425);
      ctx.lineTo(1600, h * .65); ctx.lineTo(0, h * .65); ctx.closePath(); ctx.fillStyle = rgb(p.mountain); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, h * .527); ctx.bezierCurveTo(255, h * .47, 497, h * .558, 726, h * .505);
      ctx.bezierCurveTo(1000, h * .452, 1250, h * .548, 1600, h * .477);
      ctx.lineTo(1600, h); ctx.lineTo(0, h); ctx.closePath();
      const ground = ctx.createLinearGradient(0, h * .5, 0, h);
      ground.addColorStop(0, rgb(p.horizon)); ground.addColorStop(.5, rgb(p.middle)); ground.addColorStop(1, rgb(p.near));
      ctx.fillStyle = ground; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, h * .61); ctx.bezierCurveTo(188, h * .535, 464, h * .60, 655, h * .58);
      ctx.bezierCurveTo(880, h * .55, 1154, h * .58, 1600, h * .55);
      ctx.lineTo(1600, h * .61); ctx.bezierCurveTo(1071, h * .61, 560, h * .6, 0, h * .665); ctx.closePath(); ctx.fillStyle = rgb(p.ridge); ctx.fill();
      // The pale meandering track leads the eye into the landscape.
      ctx.beginPath(); ctx.moveTo(977, h * .536);
      ctx.bezierCurveTo(1095, h * .60, 761, h * .68, 902, h * .77);
      ctx.bezierCurveTo(1020, h * .86, 1018, h * .89, 852, h);
      ctx.lineTo(1195, h); ctx.bezierCurveTo(1250, h * .85, 1090, h * .82, 998, h * .75);
      ctx.bezierCurveTo(884, h * .66, 1142, h * .6, 985, h * .536); ctx.closePath();
      ctx.fillStyle = `rgba(225,202,143,${lerp(.48,.26,season.wetness)})`; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, h * .86); ctx.bezierCurveTo(308, h * .76, 560, h * .84, 830, h * .93); ctx.lineTo(880,h); ctx.lineTo(0,h); ctx.closePath(); ctx.fillStyle = '#817e4420'; ctx.fill();

      const poolX = 448, poolY = h * .768, rx = 156 + season.wetness * 35 + weather.water * 49, ry = h * (.025 + weather.water * .008);
      ellipse(ctx, poolX + 5, poolY + 1, rx + 23, ry + 9, '#d3be7e');
      ctx.beginPath(); ctx.moveTo(poolX - rx, poolY - 2);
      ctx.bezierCurveTo(poolX - rx * .8, poolY - ry, poolX - 60, poolY - ry * .85, poolX - 10, poolY - ry * .9);
      ctx.bezierCurveTo(poolX + 30, poolY - ry * 1.9, poolX + rx * .85, poolY - ry * .75, poolX + rx, poolY + 1);
      ctx.bezierCurveTo(poolX + rx * .75, poolY + ry, poolX + 70, poolY + ry * 1.2, poolX + 15, poolY + ry);
      ctx.bezierCurveTo(poolX - 60, poolY + ry * 1.4, poolX - rx * 1.1, poolY + ry * .5, poolX - rx, poolY - 2);
      const water = ctx.createLinearGradient(0, poolY - ry, 0, poolY + ry);
      water.addColorStop(0, rgb(p.water)); water.addColorStop(1, '#b5c0a2'); ctx.fillStyle = water; ctx.fill();
      stroke(ctx, '#e9ddad99', 2, () => { ctx.moveTo(poolX - rx * .8, poolY + ry * .55); ctx.quadraticCurveTo(poolX, poolY + ry * 1.4, poolX + rx * .8, poolY + ry * .35); });
      ctx.globalAlpha = weather.water * .7;
      for (let i = 0; i < 6; i++) {
        const x = 100 + i * 278 + Math.sin(i * 3) * 60, y = h * (.72 + (i % 3) * .065);
        ellipse(ctx, x, y, 24 + i % 3 * 19, 3 + i % 2 * 3, rgb(p.water), -.03);
        stroke(ctx, '#d9d9b888', 1, () => { ctx.moveTo(x - 19, y + 2); ctx.lineTo(x + 17, y + 2); });
      }
      ctx.globalAlpha = 1;

      // Distant trees are baked into the terrain; nearer trees take part in depth sorting.
      const smallTrees = [[220,.57,.115],[920,.574,.105],[1090,.55,.066],[1510,.587,.13],[433,.551,.075],[770,.548,.06]];
      for (const [x, lane, height] of smallTrees) drawAcacia(ctx, { x, y: h * lane, height: h * height }, p);
      for (const grass of this.grasses) {
        const y = grass.y * h, length = grass.size * (grass.y - .4) * 2;
        ctx.beginPath(); ctx.moveTo(grass.x, y);
        ctx.quadraticCurveTo(grass.x - 2, y - length * .6, grass.x - 3 + grass.angle * 6, y - length);
        ctx.moveTo(grass.x, y); ctx.lineTo(grass.x + 4 + grass.angle * 3, y - length * .7);
        ctx.strokeStyle = grass.light > .65 ? '#f2d69a5e' : '#666f3a40'; ctx.lineWidth = .9 + (grass.y - .6); ctx.stroke();
      }
      for (const rock of this.stones) {
        const y = rock.y * h;
        ellipse(ctx, rock.x + 2, y + 2, rock.size + 1, rock.size * .26, '#626f3822');
        ctx.beginPath(); ctx.moveTo(rock.x - rock.size, y); ctx.lineTo(rock.x - rock.size * .6, y - rock.size * .6);
        ctx.lineTo(rock.x + rock.size * .2, y - rock.size * .8); ctx.lineTo(rock.x + rock.size, y);
        ctx.closePath(); ctx.fillStyle = '#a59f73'; ctx.fill();
      }
      // Reeds and a few ochre flowers around the waterhole.
      for (let i = 0; i < 22; i++) {
        const x = poolX - rx + 16 + i * 14, y = poolY + ry + Math.sin(i * 3) * 4;
        if (i > 6 && i < 15) continue;
        stroke(ctx, '#6e8052', 1.4, () => { ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2, y - 12, x - 5, y - 23 - i % 3 * 6); ctx.moveTo(x,y); ctx.lineTo(x+8,y-15); });
        ellipse(ctx, x - 5, y - 23 - i % 3 * 6, 1.4, 4, '#8e7e4b');
      }
      if (weather.snowCover > .03) {
        ctx.globalAlpha = weather.snowCover * .74;
        for (const stone of this.stones) ellipse(ctx, stone.x, stone.y * h - stone.size * .5, stone.size * .7, 2.5, '#eef0da');
        ctx.globalAlpha = 1;
      }
    }
    drawSky(ctx, weather, time, parallax) {
      const h = this.world.height;
      ctx.drawImage(this.sky, 0, 0, WORLD_WIDTH, h);
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds[i], w = c.width * (1 + weather.cloudiness * .45);
        const x = c.x + parallax * .35, y = c.y * h, ch = 17 + weather.cloudiness * 14;
        ctx.beginPath(); ctx.moveTo(x - w * .5, y);
        ctx.bezierCurveTo(x - w * .59, y - ch * .65, x - w * .33, y - ch, x - w * .24, y - ch * .65);
        ctx.bezierCurveTo(x - w * .17, y - ch * 2, x + w * .12, y - ch * 1.9, x + w * .20, y - ch * .9);
        ctx.bezierCurveTo(x + w * .38, y - ch * 1.15, x + w * .6, y - ch * .35, x + w * .5, y);
        ctx.bezierCurveTo(x + w * .25, y + ch * .3, x - w * .27, y + ch * .5, x - w * .5, y); ctx.closePath();
        ctx.fillStyle = weather.darkness > .4 ? `rgba(211,217,192,${c.alpha * .72})` : `rgba(255,240,205,${c.alpha + weather.cloudiness * .14})`; ctx.fill();
      }
      ctx.strokeStyle = '#616d5266'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        const x = ((time * 7 + 510 + i * 41) % 1850) - 80;
        const y = h * (.245 + i % 3 * .018) + Math.sin(time * .8 + i) * 3;
        const wing = Math.sin(time * 3.2 + i) * 3.7;
        ctx.beginPath(); ctx.moveTo(x - 5,y - wing); ctx.quadraticCurveTo(x-2,y-2,x,y);
        ctx.quadraticCurveTo(x+3,y-3,x+6,y-wing); ctx.stroke();
      }
    }
    drawGround(ctx, time, weather, parallax) {
      const h = this.world.height;
      ctx.drawImage(this.terrain, parallax * .15, 0, WORLD_WIDTH, h);
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const progress = ((time * .14 + i * .24) % 1), x = 386 + i * 29, y = h * .77 + Math.sin(i * 4) * 5;
        ctx.globalAlpha = (1 - progress) * .27;
        stroke(ctx, '#edf0cc', 1, () => ctx.ellipse(x, y, 7 + progress * 21, 1.1 + progress * 2.8, 0, .2, Math.PI * 1.7));
      }
      ctx.restore();
    }
    drawForeground(ctx, time, weather) {
      const h = this.world.height;
      const fade = ctx.createLinearGradient(0, h * .9, 0, h);
      fade.addColorStop(0,'#3c492300'); fade.addColorStop(1,'#3c492333'); ctx.fillStyle = fade; ctx.fillRect(0,h*.9,WORLD_WIDTH,h*.1);
      for (const grass of this.foreground) {
        const y = grass.y * h, wind = Math.sin(time * 1.4 + grass.phase) * (3 + weather.wind * .07);
        ctx.beginPath(); ctx.moveTo(grass.x, y);
        ctx.quadraticCurveTo(grass.x - 6 + wind * .4, y - grass.size * .6, grass.x - 9 + wind, y - grass.size);
        ctx.moveTo(grass.x, y); ctx.quadraticCurveTo(grass.x + 1 + wind * .4, y - grass.size * .55, grass.x + 6 + wind, y - grass.size * 1.25);
        ctx.moveTo(grass.x, y); ctx.quadraticCurveTo(grass.x + 8, y - grass.size * .4, grass.x + 13 + wind, y - grass.size * .7);
        ctx.strokeStyle = grass.phase > 3 ? '#6a7549b3' : '#d4c38377'; ctx.lineWidth = grass.size > 30 ? 2 : 1.4; ctx.stroke();
        if (grass.phase > 4.7) ellipse(ctx, grass.x + 6 + wind, y - grass.size * 1.25, 1.5, 4, '#d0b57b', .25);
      }
      if (!this.grainPattern) this.grainPattern = ctx.createPattern(this.grain, 'repeat');
      ctx.fillStyle = this.grainPattern; ctx.fillRect(0, 0, WORLD_WIDTH, h);
    }
  }

  class Renderer {
    constructor(canvas, world, landscape, animals, weather) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = world;
      this.landscape = landscape;
      this.weather = weather;
      this.items = [...animals, ...landscape.trees];
      const depth = item => item instanceof Animal ? Math.max(item.groundY, item.tree ? item.tree.y + 2 : -Infinity) : item.y;
      this.depthSort = (a, b) => depth(a) - depth(b);
      this.pointerTarget = 0;
      this.parallax = 0;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    resize(width, height) {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(width * pixelRatio);
      this.canvas.height = Math.round(height * pixelRatio);
      this.world.height = WORLD_WIDTH * height / width;
      this.landscape.resize();
    }
    draw(time, dt, selected) {
      const ctx = this.ctx, h = this.world.height, weather = this.weather;
      ctx.setTransform(this.canvas.width / WORLD_WIDTH, 0, 0, this.canvas.height / h, 0, 0);
      this.parallax = this.reducedMotion ? 0 : approach(this.parallax, this.pointerTarget, 2, dt);
      this.landscape.drawSky(ctx, weather, time, this.parallax);
      this.landscape.drawGround(ctx, time, weather, this.parallax);
      weather.drawTornado(ctx, time);
      this.items.sort(this.depthSort);
      for (const item of this.items) {
        if (item instanceof Animal) item.draw(ctx, item === selected);
        else drawAcacia(ctx, item, this.landscape.palette, time);
      }
      this.landscape.drawForeground(ctx, time, weather);
      if (weather.darkness > .01) {
        ctx.fillStyle = `rgba(28,48,50,${weather.darkness * .11})`;
        ctx.fillRect(0, 0, WORLD_WIDTH, h);
      }
      weather.particles.draw(ctx, weather.current);
      weather.lightning.draw(ctx);
      if (weather.lightning.flash > 0) {
        ctx.fillStyle = `rgba(245,249,218,${weather.lightning.flash})`;
        ctx.fillRect(0, 0, WORLD_WIDTH, h);
      }
    }
  }

  class Interface {
    constructor(engine) {
      this.engine = engine;
      this.weatherButtons = [...document.querySelectorAll('[data-weather]')];
      this.seasonButtons = [...document.querySelectorAll('[data-season]')];
      this.pauseButtons = [...document.querySelectorAll('[data-action="pause"]')];
      this.stage = document.getElementById('canvas-stage');
      this.tooltip = document.getElementById('animal-tooltip');
      this.selected = null;
      this.toastTime = 0;
      this.debug = false;
      this.lastState = '';
      this.uiClock = 0;
      this.elements = {};
      const ids = ['scene-condition', 'scene-season', 'weather-title', 'season-countdown', 'season-progress', 'temperature', 'wind-reading', 'speed-button', 'paused-indicator', 'scene-toast', 'debug-overlay', 'footer-status', 'animal-category', 'animal-name', 'animal-state', 'announcer'];
      for (const id of ids) this.elements[id] = document.getElementById(id);
      for (const button of this.weatherButtons) button.addEventListener('click', () => engine.weather.set(button.dataset.weather, engine.season));
      for (const button of this.seasonButtons) button.addEventListener('click', () => engine.season.set(button.dataset.season));
      for (const button of this.pauseButtons) button.addEventListener('click', () => engine.togglePause());
      this.elements['speed-button'].addEventListener('click', () => {
        engine.setSpeed(engine.timeScale === 1 ? 2 : engine.timeScale === 2 ? 4 : 1);
      });
      const guide = document.getElementById('field-guide');
      document.getElementById('open-guide').addEventListener('click', () => guide.showModal());
      document.getElementById('close-guide').addEventListener('click', () => guide.close());
      guide.addEventListener('click', event => {
        const rect = guide.getBoundingClientRect();
        if (event.target === guide && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) guide.close();
      });
      document.getElementById('debug-button').addEventListener('click', () => this.toggleDebug());
      const expand = document.getElementById('expand-button');
      this.toggleExpanded = () => {
        const expanded = document.body.classList.toggle('immersive');
        expand.setAttribute('aria-label', expanded ? 'Return to the page' : 'Expand the scene');
        expand.title = expanded ? 'Return to the page (Escape)' : 'Expand the scene';
        expand.querySelector('use').setAttribute('href', expanded ? '#icon-close' : '#icon-expand');
      };
      expand.addEventListener('click', this.toggleExpanded);
      document.addEventListener('keydown', event => {
        if (guide.open || event.ctrlKey || event.altKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
        if (event.code === 'Escape') { if (document.body.classList.contains('immersive')) this.toggleExpanded(); this.select(null); return; }
        // Preserve native Space activation for focused buttons.
        if (event.code === 'Space' && event.target.closest('button, a')) return;
        if (event.code === 'Space') { event.preventDefault(); engine.togglePause(); }
        if (/^Digit[1-6]$/.test(event.code)) engine.weather.set(Object.keys(WEATHER)[Number(event.code.slice(-1)) - 1], engine.season);
        if (event.code === 'KeyS') engine.season.set(engine.season.current === 'dry' ? 'wet' : 'dry');
        if (event.code === 'KeyD') this.toggleDebug();
        if (event.code === 'Enter' && event.target === engine.canvas) {
          const next = this.selected ? (engine.animals.indexOf(this.selected) + 1) % engine.animals.length : 0;
          this.select(engine.animals[next]);
        }
      });
      engine.canvas.addEventListener('click', event => {
        const rect = engine.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width * WORLD_WIDTH;
        const y = (event.clientY - rect.top) / rect.height * engine.world.height;
        let picked = null, distance = Infinity;
        for (const animal of engine.animals) {
          const b = animal.bounds;
          if (x < b.left || x > b.right || y < b.top || y > b.bottom) continue;
          const d = (animal.x - x) ** 2 + (animal.y - 40 * animal.renderScale - y) ** 2;
          if (d < distance) { distance = d; picked = animal; }
        }
        this.select(picked === this.selected ? null : picked);
      });
      engine.canvas.addEventListener('pointermove', event => {
        const rect = engine.canvas.getBoundingClientRect();
        engine.renderer.pointerTarget = ((event.clientX - rect.left) / rect.width - .5) * 12;
      }, { passive: true });
      engine.canvas.addEventListener('pointerleave', () => { engine.renderer.pointerTarget = 0; });
      engine.events.on('weather', weather => {
        this.refreshControls();
        this.announce(`${WEATHER[weather].name}. The wildlife responds to the changing weather.`);
        this.toast(({ sunny: 'A little sunshine goes a long way.', rain: 'Fresh rain. New energy.', 'heavy-rain': 'Water gathers across the grasslands.', snow: 'A rare visitor to the dry season.', thunderstorm: 'The pride gathers. Lightning finds clear ground.', tornado: 'A restless wind follows the wildlife.' })[weather]);
      });
      engine.events.on('season', ({ season, automatic }) => {
        this.refreshControls();
        this.announce(`${season === 'dry' ? 'Dry' : 'Wet'} season. ${automatic ? 'The season has turned automatically.' : 'The landscape is changing.'}`);
        this.toast(season === 'wet' ? 'The wet season arrives. The plains come alive.' : 'The dry season returns. The herds draw closer.');
      });
      engine.events.on('notice', message => this.toast(message));
      this.refreshControls();
    }
    announce(message) { this.elements.announcer.textContent = message; }
    toast(message) {
      this.elements['scene-toast'].textContent = message;
      this.elements['scene-toast'].classList.add('visible');
      this.toastTime = 4;
    }
    select(animal) {
      this.selected = animal;
      this.tooltip.hidden = !animal;
      if (!animal) return;
      this.elements['animal-category'].textContent = animal.species === 'lion' ? 'THE PRIDE' : animal.species === 'elephant' ? 'THE HERD' : 'THE SOLITARY ONES';
      this.elements['animal-name'].textContent = animal.label;
      this.elements['animal-state'].textContent = animal.mood;
      this.announce(`${animal.label}. ${animal.mood}.`);
    }
    toggleDebug() {
      this.debug = !this.debug;
      this.elements['debug-overlay'].hidden = !this.debug;
      document.getElementById('debug-button').setAttribute('aria-pressed', String(this.debug));
    }
    refreshControls() {
      const { weather, season } = this.engine;
      for (const button of this.weatherButtons) {
        const active = button.dataset.weather === weather.current;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = button.dataset.weather === 'snow' && season.current === 'wet';
        if (button.dataset.weather === 'snow') button.title = season.current === 'wet' ? 'Snow is available in the dry season' : 'A rare dry-season snowfall (4)';
      }
      for (const button of this.seasonButtons) {
        const active = button.dataset.season === season.current;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      this.elements['scene-condition'].textContent = WEATHER[weather.current].name.toUpperCase();
      this.elements['scene-season'].textContent = `${season.current.toUpperCase()} SEASON`;
      this.elements['weather-title'].textContent = WEATHER[weather.current].title;
      this.stage.classList.toggle('stormy', ['thunderstorm', 'tornado', 'heavy-rain'].includes(weather.current));
      this.elements['footer-status'].textContent = ({ sunny: 'A WORLD IN BALANCE', rain: 'A LITTLE RAIN, A LITTLE RENEWAL', 'heavy-rain': 'LIFE FINDS ITS FLOW', snow: 'WONDER COMES IN MANY FORMS', thunderstorm: 'CLEAR GROUND. SAFE WILDLIFE.', tornado: 'EVERYTHING IS IN MOTION' })[weather.current];
      this.refreshPlayback();
    }
    refreshPlayback() {
      const { paused, timeScale } = this.engine;
      for (const button of this.pauseButtons) {
        button.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
        button.title = paused ? 'Resume (Space)' : 'Pause (Space)';
        button.querySelector('use').setAttribute('href', paused ? '#icon-play' : '#icon-pause');
      }
      this.elements['paused-indicator'].hidden = !paused;
      const speedButton = this.elements['speed-button'];
      speedButton.firstChild.textContent = timeScale;
      speedButton.setAttribute('aria-label', `Simulation speed: ${timeScale} times`);
    }
    update(realDt) {
      const { season, weather, fps, animals } = this.engine;
      this.toastTime -= realDt;
      if (this.toastTime <= 0) this.elements['scene-toast'].classList.remove('visible');
      if (this.selected) {
        const a = this.selected, w = this.stage.clientWidth, h = this.stage.clientHeight;
        if (a.bounds.right < 0 || a.bounds.left > WORLD_WIDTH) this.select(null);
        else {
          const half = this.tooltip.offsetWidth * .5;
          const top = a.bounds.top / this.engine.world.height * h - 8;
          const x = clamp(a.x / WORLD_WIDTH * w, half + 5, w - half - 5);
          this.tooltip.style.left = `${x}px`;
          this.tooltip.style.top = `${clamp(top, this.tooltip.offsetHeight + 7, h - 10)}px`;
          if (this.lastState !== a.mood) { this.lastState = a.mood; this.elements['animal-state'].textContent = a.mood; }
        }
      }
      this.uiClock += realDt;
      if (this.uiClock < .25) return;
      this.uiClock = 0;
      this.elements['season-countdown'].textContent = Math.ceil(60 - season.elapsed);
      this.elements['season-progress'].style.width = `${season.elapsed / 60 * 100}%`;
      this.elements.temperature.textContent = `${Math.round(WEATHER[weather.current].temp - season.wetness * 2)}°`;
      this.elements['wind-reading'].textContent = `${Math.round(weather.wind)} km/h`;
      if (this.debug) {
        const pool = weather.particles.pool;
        const target = weather.tornado.targetId;
        this.elements['debug-overlay'].textContent = `${fps.toFixed(0)} FPS  ·  ${animals.length} ANIMALS\nPARTICLES ${pool.active.length} / ${pool.capacity}\nFREE ${pool.free.length}  ·  PEAK ${pool.peak}\nSEASON ${season.current.toUpperCase()} ${Math.ceil(60 - season.elapsed)}s\nLIGHTNING ${weather.lightning.isSafe(animals) ? 'SAFE' : 'SUPPRESSED'}${weather.current === 'tornado' ? `\nPURSUIT #${target ?? '—'} · ${weather.tornado.speed.toFixed(1)} u/s` : ''}`;
      }
    }
  }

  class Ecosystem {
    constructor() {
      this.canvas = document.getElementById('savanna');
      this.stage = document.getElementById('canvas-stage');
      this.world = { width: WORLD_WIDTH, height: 650 };
      this.events = new EventBus();
      this.season = new SeasonManager(this.events);
      this.landscape = new Landscape(this.world);
      this.weather = new WeatherManager(this.world, this.events, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.events.on('season', ({ season }) => {
        if (season === 'wet' && this.weather.current === 'snow') this.weather.set('rain', this.season);
      });
      this.animals = [
        new Elephant(1, 398, .768, 1.08),
        new Elephant(2, 558, .778, .91),
        new Elephant(3, 711, .788, .68),
        new Lion(4, 994, .838, .91),
        new Lion(5, 1160, .823, 1.02, true),
        new Lion(6, 1315, .837, .79),
        new Leopard(7, 775, .914, .84),
        new Leopard(8, 1280, .675, .71),
        new Leopard(9, 1600, .879, .87)
      ];
      this.renderer = new Renderer(this.canvas, this.world, this.landscape, this.animals, this.weather);
      this.time = 0;
      this.timeScale = 1;
      this.paused = false;
      this.fps = 60;
      this.lastTimestamp = 0;
      this.context = { world: this.world, season: this.season, weather: this.weather, animals: this.animals, trees: this.landscape.trees, time: 0 };
      this.interface = new Interface(this);
      this.resize = () => {
        const rect = this.stage.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const oldHeight = this.world.height;
        this.renderer.resize(rect.width, rect.height);
        this.weather.tornado.y *= this.world.height / oldHeight;
        // Particle coordinates belong to the old projection; return them to the
        // same pool on resize. Wildlife retain their horizontal progress/state.
        this.weather.particles.clear();
        this.weather.lightning.clear();
        for (const animal of this.animals) animal.project(this.world);
        this.landscape.update(0, this.season, this.weather);
        this.renderer.draw(this.time, 0, this.interface.selected);
      };
      this.resize();
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.stage);
      document.addEventListener('visibilitychange', () => { this.lastTimestamp = 0; });
      this.frame = timestamp => {
        const elapsed = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 1 / 60;
        const realDt = clamp(elapsed, 0, .05);
        this.lastTimestamp = timestamp;
        this.fps = approach(this.fps, 1 / Math.max(.001, elapsed), 2, Math.min(elapsed, .5));
        if (!this.paused && !document.hidden) this.update(realDt * this.timeScale);
        this.renderer.draw(this.time, realDt, this.interface.selected);
        this.interface.update(realDt);
        this.raf = requestAnimationFrame(this.frame);
      };
      this.raf = requestAnimationFrame(this.frame);
    }
    update(dt) {
      this.time = (this.time + dt) % 86400;
      this.context.time = this.time;
      this.season.update(dt);
      for (const animal of this.animals) animal.update(dt, this.context);
      this.weather.update(dt, this.animals);
      this.landscape.update(dt, this.season, this.weather);
    }
    togglePause() {
      this.paused = !this.paused;
      this.interface.refreshPlayback();
      this.interface.announce(this.paused ? 'Simulation paused.' : 'Simulation resumed.');
    }
    setSpeed(speed) {
      if (![1, 2, 4].includes(speed)) return;
      this.timeScale = speed;
      this.interface.refreshPlayback();
      this.interface.toast(`A new pace: ${speed}× simulation speed.`);
    }
    inspect() {
      const pool = this.weather.particles.pool;
      return {
        weather: this.weather.current,
        season: this.season.current,
        seasonElapsed: this.season.elapsed,
        wetness: this.season.wetness,
        paused: this.paused,
        speed: this.timeScale,
        fps: this.fps,
        particles: { active: pool.active.length, free: pool.free.length, capacity: pool.capacity, peak: pool.peak },
        lightning: { visible: this.weather.lightning.visible, safe: this.weather.lightning.isSafe(this.animals), strikes: this.weather.lightning.strikes, minX: this.weather.lightning.minX, maxX: this.weather.lightning.maxX },
        tornado: { ...this.weather.tornado },
        animals: this.animals.map(a => ({ id: a.id, species: a.species, x: a.x, y: a.y, speed: a.speed, state: a.state, laps: a.laps, bounds: { ...a.bounds } }))
      };
    }
  }

  const ecosystem = new Ecosystem();
  // A small read-only snapshot API is useful when profiling an iframe or checking
  // invariants from the console. Snapshots never retain simulation objects.
  window.Wildland = Object.freeze({
    inspect: () => ecosystem.inspect(),
    setWeather: name => ecosystem.weather.set(name, ecosystem.season),
    setSeason: name => ecosystem.season.set(name),
    pause: () => { if (!ecosystem.paused) ecosystem.togglePause(); },
    resume: () => { if (ecosystem.paused) ecosystem.togglePause(); },
    setSpeed: speed => ecosystem.setSpeed(speed)
  });
})();
