'use strict';

// Everything is local and dependency-free, including the illustration.
(() => {
  const TAU = Math.PI * 2;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = t => t * t * (3 - 2 * t);
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
  function ellipse(c, x, y, rx, ry, color, angle = 0) {
    c.beginPath(); c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), angle, 0, TAU);
    if (color) { c.fillStyle = color; c.fill(); }
  }
  function shape(c, color, draw) { c.beginPath(); draw(c); c.fillStyle = color; c.fill(); }
  function line(c, color, width, draw) {
    c.beginPath(); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; draw(c); c.stroke();
  }
  function mixColor(a, b, t) {
    const parse = hex => hex[0] === '#' ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) : hex.match(/[\d.]+/g).slice(0, 3).map(Number);
    const aa = parse(a), bb = parse(b);
    return `rgb(${aa.map((v, i) => Math.round(lerp(v, bb[i], t))).join(',')})`;
  }

  const WEATHER = {
    sunny: { label: 'Sunny', icon: 'sun', temp: 31, darkness: 0, speed: 1, rate: 0, status: 'The grasslands are calm. The herds are on the move.' },
    rain: { label: 'Rain', icon: 'rain', temp: 23, darkness: .34, speed: 1.08, rate: 125, status: 'A little rain, a little renewal. Life gathers around the water.' },
    heavy: { label: 'Heavy rain', icon: 'heavy', temp: 20, darkness: .66, speed: .76, rate: 490, status: 'The rains have arrived. The herds draw closer for shelter.' },
    snow: { label: 'Snow', icon: 'snow', temp: 2, darkness: .21, speed: .6, rate: 80, status: 'A rare cold spell. Soft snow settles over a slower savannah.' },
    thunder: { label: 'Thunderstorm', icon: 'thunder', temp: 19, darkness: .85, speed: 1.13, rate: 360, status: 'Thunder rolls across the plains. The animals seek safer ground.' },
    tornado: { label: 'Tornado', icon: 'tornado', temp: 24, darkness: .69, speed: 1.2, rate: 140, status: 'The wind takes a wild turn. A slow-moving funnel follows the herd.' }
  };

  class SeasonManager extends EventTarget {
    constructor() { super(); this.current = 'dry'; this.elapsed = 0; this.duration = 60; this.blend = 0; }
    set(season) {
      if (season === this.current) return;
      this.current = season; this.elapsed = 0;
      this.dispatchEvent(new CustomEvent('change', { detail: season }));
    }
    update(dt) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) this.set(this.current === 'dry' ? 'wet' : 'dry');
      // The logical season switches immediately; the color palette eases independently.
      // Keeping simulation positions outside this class prevents transitions from resetting wildlife.
      const target = this.current === 'wet' ? 1 : 0;
      this.blend = lerp(this.blend, target, 1 - Math.exp(-dt * .8));
      if (Math.abs(target - this.blend) < .001) this.blend = target;
    }
  }

  class ParticlePool {
    constructor(capacity) {
      this.capacity = capacity;
      this.items = Array.from({ length: capacity }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, phase: 0, kind: '', alpha: 0, spin: 0 }));
      this.count = 0;
    }
    acquire(kind, x, y, vx, vy, life, size, phase = 0) {
      if (this.count === this.capacity) return null;
      const p = this.items[this.count++];
      // Reinitialize every field, so an old splash can safely become snow or debris.
      p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = p.maxLife = life; p.size = size; p.phase = phase; p.alpha = 1; p.spin = 0;
      return p;
    }
    release(index) {
      // A dense active prefix + swap removal means O(1) recycling and no array splices.
      const last = --this.count;
      const recycled = this.items[index]; this.items[index] = this.items[last]; this.items[last] = recycled;
    }
    clear() { this.count = 0; }
  }

  class ParticleSystem {
    constructor(capacity) { this.pool = new ParticlePool(capacity); this.budget = 0; }
    clear() { this.pool.clear(); this.budget = 0; }
    emit(rate, dt, emitter) {
      this.budget = Math.min(this.budget + rate * dt, this.pool.capacity);
      while (this.budget >= 1) { emitter(this.pool); this.budget--; }
    }
    update(dt, world, weather) {
      const pool = this.pool;
      for (let i = pool.count - 1; i >= 0; i--) {
        const p = pool.items[i]; p.life -= dt;
        if (p.kind === 'debris') {
          p.phase += dt * (3 + p.size * .5);
          p.y -= p.vy * dt;
          const height = clamp((weather.tornado.y - p.y) / 360, 0, 1);
          p.x = weather.tornado.x + Math.sin(p.phase) * (18 + height * 108);
          p.alpha = (1 - height) * .7;
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.kind === 'snow' || p.kind === 'mote') p.x += Math.sin(world.time + p.phase) * dt * (p.kind === 'snow' ? 14 : 4);
          if (p.kind === 'splash') p.vy += 210 * dt;
          if ((p.kind === 'rain' || p.kind === 'snow') && p.y > p.phase) {
            if (p.kind === 'rain' && Math.random() < .18) weather.ground.pool.acquire('splash', p.x, p.y, rand(-18, 18), rand(-45, -15), .3, 1.5);
            p.life = 0;
          }
        }
        if (p.life <= 0 || p.y > world.h + 30 || p.x < -200 || p.x > world.w + 200) pool.release(i);
      }
    }
    draw(c) {
      const pool = this.pool;
      c.save();
      for (let i = 0; i < pool.count; i++) {
        const p = pool.items[i], fade = Math.min(1, p.life * 2);
        if (p.kind === 'rain') {
          c.strokeStyle = `rgba(220,234,221,${.28 * fade})`; c.lineWidth = p.size;
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * .022, p.y - p.vy * .022); c.stroke();
        } else if (p.kind === 'snow') {
          c.globalAlpha = .8 * fade; ellipse(c, p.x, p.y, p.size, p.size, '#fafff5');
        } else if (p.kind === 'debris') {
          c.globalAlpha = p.alpha * fade;
          ellipse(c, p.x, p.y, p.size * 2, p.size * .65, '#a49165', p.phase);
        } else if (p.kind === 'splash') {
          c.globalAlpha = fade * .5; ellipse(c, p.x, p.y, 2.5, .8, '#e7eee0');
        } else {
          c.globalAlpha = .5 * fade * (.5 + .5 * Math.sin(p.phase + p.life));
          ellipse(c, p.x, p.y, p.size, p.size, '#f5e7a9');
        }
        c.globalAlpha = 1;
      }
      c.restore();
    }
  }

  class Animal {
    constructor(id, u, y, scale, seed) {
      this.id = id; this.u = u; this.y = y; this.scale = scale; this.x = 0;
      this.phase = seed; this.stride = seed; this.state = 'walking'; this.timer = 6 + seed;
      this.baseSpeed = 10; this.velocity = 10; this.width = 210; this.height = 160;
      this.climb = 0; this.selected = false; this.mood = 'At ease'; this.kind = 'animal';
    }
    update(dt, world) {
      this.x = this.u * world.w;
      this.timer -= dt;
      this.chooseState(dt, world);
      const wet = world.season.current === 'wet';
      let speed = this.baseSpeed * WEATHER[world.weather.current].speed * (wet ? 1.25 : 1);
      if (this.kind !== 'leopard') {
        const leader = world.animals.find(a => a.kind === this.kind);
        if (leader && leader !== this) {
          let gap = (leader.u - this.u) * world.w;
          if (gap < -world.w * .5) gap += world.w + 200;
          if (gap > world.w * .5) gap -= world.w + 200;
          const desired = wet ? 200 : 145;
          speed *= clamp(1 + (gap - desired) * .002, .7, 1.55);
        }
      }
      if (this.state === 'resting' || this.state === 'drinking') speed *= .025;
      if (this.state === 'climbing') speed *= .025;
      if (world.weather.current === 'tornado') {
        const distance = Math.hypot(this.x - world.weather.tornado.x, this.y - world.weather.tornado.y);
        if (distance < 320) { speed *= 1.8; this.mood = 'Alert to the wind'; }
      }
      this.velocity = speed;
      this.u += speed * dt / world.w;
      if (this.u * world.w > world.w + this.width * this.scale) this.u = -this.width * this.scale / world.w;
      this.x = this.u * world.w;
      this.stride += speed * dt * .035;
    }
    chooseState() {}
    get bounds() {
      return { left: this.x - this.width * this.scale * .64, right: this.x + this.width * this.scale * .72,
        top: this.y - this.height * this.scale - this.climb, bottom: this.y + 10 };
    }
    hit(x, y) { const b = this.bounds; return x > b.left && x < b.right && y > b.top && y < b.bottom; }
    draw(c, time) {
      c.save();
      const bob = this.state === 'resting' || this.state === 'climbing' || this.state === 'drinking' ? 0 : Math.sin(this.stride * 2) * 1.5;
      ellipse(c, this.x, this.y + 2, this.width * this.scale * .39, 10 * this.scale, '#3c402221');
      if (this.selected) {
        c.strokeStyle = '#f5f2c7a0'; c.lineWidth = 1.3; c.setLineDash([5, 6]);
        ellipse(c, this.x + 4, this.y + 3, this.width * this.scale * .52, 15 * this.scale);
        c.stroke(); c.setLineDash([]);
      }
      c.translate(this.x, this.y - this.climb + bob); c.scale(this.scale, this.scale);
      this.paint(c, time); c.restore();
    }
  }

  class Elephant extends Animal {
    constructor(id, u, y, scale, seed, juvenile = false) {
      super(id, u, y, scale, seed); this.kind = 'elephant'; this.baseSpeed = juvenile ? 13 : 12;
      this.juvenile = juvenile; this.width = 235; this.height = 174;
      this.drinkBlend = 0; this.trunkBlend = 0;
      this.state = 'walking'; this.name = 'African elephant'; this.scientific = 'Loxodonta africana';
    }
    chooseState(dt, world) {
      const severe = ['thunder', 'tornado', 'heavy'].includes(world.weather.current);
      if (severe && this.state === 'drinking') { this.state = 'walking'; this.timer = 5; }
      if (this.timer <= 0) {
        if (this.state !== 'walking') { this.state = 'walking'; this.timer = rand(11, 19); }
        else {
          // Drinking is tied to a real waterhole; lifting the trunk is possible anywhere.
          const nearWater = Math.abs(this.x + 131 * this.scale - world.w * .31) < 145;
          this.state = !severe && nearWater ? 'drinking' : 'trunk'; this.timer = rand(3, 5);
        }
      }
      this.mood = severe ? 'Staying with the herd' : this.state === 'drinking' ? 'Drinking at the waterhole' : this.state === 'trunk' ? 'Sensing the breeze' : 'Moving with the herd';
      this.drinkBlend = lerp(this.drinkBlend, this.state === 'drinking' ? 1 : 0, 1 - Math.exp(-dt * 2.4));
      this.trunkBlend = lerp(this.trunkBlend, this.state === 'trunk' ? 1 : 0, 1 - Math.exp(-dt * 2.4));
    }
    paint(c, time) {
      const step = Math.sin(this.stride), resting = this.state === 'drinking';
      // Tail, far legs, body, near legs, head, ear, and trunk form a layered silhouette.
      line(c, '#626c60', 4, p => { p.moveTo(-87, -100); p.bezierCurveTo(-106, -79, -98, -38, -111, -30 + Math.sin(time * 2) * 6); });
      shape(c, '#454f48', p => { p.moveTo(-114, -35); p.lineTo(-108, -21); p.lineTo(-104, -33); });
      this.leg(c, -56, -2, -step, '#687167'); this.leg(c, 45, -4, step, '#687167');
      shape(c, '#8c9484', p => { p.moveTo(-89, -71); p.bezierCurveTo(-110, -140, -49, -163, 7, -151); p.bezierCurveTo(59, -149, 80, -124, 70, -71); p.bezierCurveTo(49, -44, -45, -44, -89, -71); });
      shape(c, '#a0a591', p => { p.moveTo(-84, -112); p.bezierCurveTo(-63, -153, 14, -160, 48, -120); p.bezierCurveTo(10, -141, -42, -137, -84, -112); });
      this.leg(c, -60, 0, step, '#838d7f'); this.leg(c, 39, 1, -step, '#8c9584');
      shape(c, '#939c89', p => { p.moveTo(23, -127); p.bezierCurveTo(31, -163, 73, -166, 88, -138); p.bezierCurveTo(111, -117, 96, -81, 77, -76); p.lineTo(42, -86); p.closePath(); });
      shape(c, '#758270', p => { p.moveTo(37, -141); p.bezierCurveTo(-16, -165, -25, -111, 10, -72); p.bezierCurveTo(32, -46, 61, -85, 58, -114); p.closePath(); });
      shape(c, '#9ca58e', p => { p.moveTo(31, -141); p.bezierCurveTo(-7, -153, -18, -113, 15, -82); p.bezierCurveTo(29, -70, 47, -102, 44, -121); p.closePath(); });
      line(c, '#6e7b68', 1.2, p => { p.moveTo(22, -132); p.quadraticCurveTo(3, -117, 20, -91); });
      const raise = ((Math.sin(time * 1.5 + this.phase) * .5 + .5) * 65 + 20) * this.trunkBlend;
      const dip = ((562 - this.y) / this.scale + 36) * this.drinkBlend;
      line(c, '#8c9683', 21, p => { p.moveTo(86, -122); p.bezierCurveTo(112, -106, 92, -43 + dip * .6, 114, -22 - raise + dip); p.quadraticCurveTo(130, -9 - raise + dip, 131, -36 - raise + dip); });
      line(c, '#a9b09a', 4, p => { p.moveTo(91, -117); p.bezierCurveTo(104, -92, 96, -46 + dip * .6, 113, -30 - raise + dip); });
      if (!this.juvenile) {
        shape(c, '#f2e9c8', p => { p.moveTo(82, -91); p.quadraticCurveTo(108, -64, 125, -82); p.quadraticCurveTo(108, -57, 81, -82); });
        shape(c, '#d6d4b4', p => { p.moveTo(69, -86); p.quadraticCurveTo(83, -65, 104, -73); p.quadraticCurveTo(88, -55, 68, -79); });
      }
      ellipse(c, 81, -127, 3.2, 2.5, '#303e34'); ellipse(c, 82, -128, .8, .7, '#e5e5c8');
      line(c, '#697863', 1.1, p => { p.moveTo(74, -133); p.quadraticCurveTo(80, -136, 87, -132); p.moveTo(-80, -99); p.quadraticCurveTo(-86, -86, -80, -78); p.moveTo(-49, -114); p.quadraticCurveTo(-45, -93, -49, -85); });
      if (this.drinkBlend > .7) { c.globalAlpha = .6; ellipse(c, 132, (562 - this.y) / this.scale, 13 + Math.sin(time * 4) * 3, 2, '#d6e5c7'); c.globalAlpha = 1; }
    }
    leg(c, x, y, step, color) {
      const swing = step * 9;
      shape(c, color, p => { p.moveTo(x - 15, -77); p.lineTo(x + 16, -73); p.lineTo(x + 12 + swing, y - 8); p.quadraticCurveTo(x + 16 + swing, y + 4, x - 15 + swing, y + 2); p.lineTo(x - 18 + swing, y - 9); p.closePath(); });
      line(c, '#b0b6a0', 2, p => { for (let j = 0; j < 3; j++) { p.moveTo(x - 7 + j * 6 + swing, y); p.lineTo(x - 7 + j * 6 + swing, y - 4); } });
    }
  }

  class Lion extends Animal {
    constructor(id, u, y, scale, seed, male = false) {
      super(id, u, y, scale, seed); this.kind = 'lion'; this.baseSpeed = 15; this.width = 205; this.height = 113;
      this.male = male; this.name = 'African lion'; this.scientific = 'Panthera leo'; this.state = 'patrolling';
    }
    chooseState(dt, world) {
      const alert = ['thunder', 'tornado'].includes(world.weather.current);
      if (alert && this.state === 'resting') { this.state = 'patrolling'; this.timer = 10; }
      if (this.timer <= 0) {
        this.state = this.state === 'resting' || alert ? 'patrolling' : 'resting';
        this.timer = this.state === 'resting' ? rand(3, world.season.current === 'wet' ? 5 : 8) : rand(15, 25);
      }
      this.mood = alert ? 'Alert and on the move' : this.state === 'resting' ? 'A quiet moment in the grass' : 'Patrolling with the pride';
    }
    paint(c, time) {
      const step = Math.sin(this.stride), rest = this.state === 'resting';
      c.save(); if (rest) { c.translate(0, 24); c.scale(1, .75); }
      line(c, '#be8d45', 6, p => { p.moveTo(-70, -66); p.bezierCurveTo(-103, -63, -107, -15, -131, -44 + Math.sin(time * 2 + this.phase) * 8); });
      ellipse(c, -131, -44 + Math.sin(time * 2 + this.phase) * 8, 7, 10, '#5e4a2d', -.4);
      this.leg(c, -49, -step, '#b28b4b'); this.leg(c, 47, step, '#b28b4b');
      shape(c, '#cda259', p => { p.moveTo(-78, -57); p.bezierCurveTo(-82, -103, -21, -98, 31, -93); p.bezierCurveTo(62, -98, 77, -77, 61, -52); p.bezierCurveTo(26, -31, -26, -41, -54, -47); p.closePath(); });
      shape(c, '#dcb675', p => { p.moveTo(-66, -79); p.bezierCurveTo(-47, -104, 28, -91, 49, -85); p.bezierCurveTo(19, -83, -33, -79, -66, -79); });
      shape(c, '#e4c38a', p => { p.moveTo(-43, -49); p.quadraticCurveTo(7, -30, 47, -54); p.quadraticCurveTo(17, -40, -43, -49); });
      this.leg(c, -57, step, '#cfaa65'); this.leg(c, 45, -step, '#d4ab63');
      if (this.male) {
        shape(c, '#795232', p => { p.moveTo(25, -83); p.bezierCurveTo(24, -126, 71, -145, 91, -112); p.bezierCurveTo(117, -82, 92, -44, 64, -34); p.bezierCurveTo(37, -40, 23, -54, 25, -83); });
        const r = seeded(18);
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; ellipse(c, 64 + Math.cos(a) * 30, -86 + Math.sin(a) * 39, 12 + r() * 7, 15, i % 3 ? '#8d6136' : '#a8753e', a); }
        ellipse(c, 68, -91, 28, 31, '#bd8e4a', -.14);
        line(c, '#ad7b3b', 1.5, p => { p.moveTo(43, -108); p.lineTo(34, -84); p.moveTo(47, -60); p.lineTo(57, -48); p.moveTo(88, -103); p.lineTo(95, -85); });
      }
      ellipse(c, 77, -104, 11, 12, '#c49a57'); ellipse(c, 77, -104, 6, 7, '#9a743f');
      shape(c, '#d6ac64', p => { p.moveTo(62, -105); p.bezierCurveTo(87, -111, 103, -94, 96, -82); p.lineTo(113, -73); p.quadraticCurveTo(111, -56, 86, -59); p.lineTo(67, -71); p.closePath(); });
      ellipse(c, 102, -70, 14, 9, '#eee0b4'); ellipse(c, 108, -75, 6, 3, '#403c28');
      ellipse(c, 93, -92, 3, 2.2, '#333d29'); ellipse(c, 94, -93, .7, .7, '#f8edca');
      line(c, '#8d713e', 1, p => { p.moveTo(89, -97); p.lineTo(97, -96); p.moveTo(103, -66); p.quadraticCurveTo(109, -63, 113, -68); p.moveTo(97, -69); p.lineTo(88, -71); p.moveTo(98, -65); p.lineTo(87, -63); });
      c.restore();
    }
    leg(c, x, step, color) {
      const s = step * 12;
      shape(c, color, p => { p.moveTo(x - 10, -61); p.quadraticCurveTo(x + 6, -67, x + 12, -52); p.lineTo(x + 4 + s * .45, -28); p.lineTo(x + s, -7); p.quadraticCurveTo(x + 14 + s, -7, x + 12 + s, 0); p.lineTo(x - 8 + s, 0); p.lineTo(x - 9 + s * .4, -26); p.closePath(); });
      line(c, '#9e7b43', .8, p => { p.moveTo(x + 3 + s, -1); p.lineTo(x + 3 + s, -5); p.moveTo(x + 8 + s, -1); p.lineTo(x + 8 + s, -4); });
    }
  }

  class Leopard extends Animal {
    constructor(id, u, y, scale, seed) {
      super(id, u, y, scale, seed); this.kind = 'leopard'; this.baseSpeed = 30; this.width = 230; this.height = 90;
      this.name = 'African leopard'; this.scientific = 'Panthera pardus pardus'; this.state = 'stalking'; this.climbTime = 0; this.climbHeight = 124;
      const r = seeded(seed * 123); this.spots = [];
      for (let i = 0; i < 65; i++) {
        const x = r() * 136 - 73, y = r() * 44 - 80;
        if (((x + 6) / 70) ** 2 + ((y + 57) / 24) ** 2 < .9) this.spots.push({ x, y, size: 2 + r() * 1.7, angle: r() * TAU });
      }
    }
    chooseState(dt, world) {
      if (this.state === 'climbing') {
        this.climbTime += dt;
        const t = this.climbTime / 7;
        // Ascend, perch, descend. The horizontal route and identity survive the action.
        this.climb = this.climbHeight * (t < .3 ? smooth(t / .3) : t < .7 ? 1 : 1 - smooth((t - .7) / .3));
        if (t >= 1) { this.climb = 0; this.state = 'stalking'; this.timer = rand(18, 30); }
      } else if (this.timer <= 0) {
        const tree = world.renderer.trees.find(t => Math.abs(t.u * world.w - this.x) < 45);
        if (tree && !['tornado', 'thunder'].includes(world.weather.current)) {
          this.state = 'climbing'; this.climbTime = 0;
          this.climbHeight = Math.max(100, this.y - (tree.y - 118 * tree.scale));
        } else this.timer = .8;
      }
      this.mood = this.state === 'climbing' ? 'A little perspective from the acacia' : ['heavy', 'thunder', 'tornado'].includes(world.weather.current) ? 'Quietly seeking cover' : 'A solitary wanderer';
    }
    paint(c, time) {
      const step = Math.sin(this.stride);
      line(c, '#b8954c', 7, p => { p.moveTo(-72, -57); p.bezierCurveTo(-108, -56, -100, -2, -144, -27 + Math.sin(time * 2 + this.phase) * 7); });
      for (let i = 0; i < 10; i++) { const t = i / 10; ellipse(c, lerp(-81, -140, t), -45 + Math.sin(t * 2) * 22, 3, 3.5, '#51462c'); }
      this.leg(c, -52, -step, '#aa8844'); this.leg(c, 45, step, '#aa8844');
      shape(c, '#cfaa57', p => { p.moveTo(-78, -51); p.bezierCurveTo(-81, -85, -17, -86, 32, -74); p.quadraticCurveTo(67, -88, 72, -58); p.bezierCurveTo(38, -33, -23, -28, -65, -39); p.closePath(); });
      shape(c, '#ead39a', p => { p.moveTo(-49, -42); p.quadraticCurveTo(-6, -25, 48, -47); p.quadraticCurveTo(11, -35, -49, -42); });
      c.strokeStyle = '#57472b'; c.lineWidth = 1.5;
      for (const s of this.spots) { ellipse(c, s.x, s.y, s.size * 1.2, s.size, null, s.angle); c.stroke(); if (s.size > 3.1) ellipse(c, s.x + 1, s.y + .5, .8, 1, '#7c6234'); }
      this.leg(c, -60, step, '#c7a156'); this.leg(c, 40, -step, '#d3b168');
      ellipse(c, 73, -77, 22, 21, '#d7b771', -.3);
      ellipse(c, 62, -94, 8, 8, '#493f29'); ellipse(c, 63, -94, 4, 4.5, '#d7bd83');
      ellipse(c, 85, -69, 18, 11, '#e8d7a4'); ellipse(c, 99, -73, 4, 2.8, '#3c3928');
      ellipse(c, 84, -84, 3, 2, '#263d2b'); ellipse(c, 85, -84, .9, .9, '#e6e9aa');
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ellipse(c, 73 + Math.cos(a) * 13, -78 + Math.sin(a) * 13, 1.8, 1.3, '#4f442c'); }
      line(c, '#6e5d36', .9, p => { p.moveTo(83, -72); p.lineTo(95, -65); p.moveTo(87, -66); p.lineTo(99, -62); p.moveTo(81, -87); p.lineTo(88, -88); });
    }
    leg(c, x, step, color) {
      const s = step * 17;
      shape(c, color, p => { p.moveTo(x - 8, -49); p.lineTo(x + 10, -51); p.lineTo(x + 5 - s * .3, -25); p.lineTo(x + s, -5); p.quadraticCurveTo(x + 10 + s, -7, x + 12 + s, -1); p.lineTo(x - 5 + s, 0); p.lineTo(x - 10 - s * .3, -22); p.closePath(); });
      for (let i = 0; i < 4; i++) ellipse(c, x + Math.sin(i) * 3, -42 + i * 7, 2, 1.5, '#57482d');
    }
  }

  class WeatherManager extends EventTarget {
    constructor(reducedMotion) {
      super(); this.current = 'sunny'; this.darkness = 0; this.wetness = 0; this.snow = 0;
      this.primary = new ParticleSystem(1500); this.ground = new ParticleSystem(240); this.ambient = new ParticleSystem(85);
      this.lightning = null; this.strikeTimer = 3; this.flash = 0; this.reducedMotion = reducedMotion;
      this.tornado = { x: 0, y: 520, u: .76, target: null, initialized: false };
      this.strikes = 0; this.safetyChecks = 0;
    }
    set(type) {
      if (!WEATHER[type] || type === this.current) return;
      this.current = type;
      // Changing the primary weather synchronously recycles all weather-owned particles.
      this.primary.clear(); this.ground.clear(); this.lightning = null; this.flash = 0;
      this.strikeTimer = rand(2.5, 5); this.tornado.initialized = false;
      this.dispatchEvent(new CustomEvent('change', { detail: type }));
    }
    update(dt, world) {
      const config = WEATHER[this.current], rain = ['rain', 'heavy', 'thunder'].includes(this.current);
      this.darkness = lerp(this.darkness, config.darkness, 1 - Math.exp(-dt * 1.3));
      if (Math.abs(this.darkness - config.darkness) < .002) this.darkness = config.darkness;
      this.wetness = clamp(this.wetness + (rain ? .09 : -.025) * dt, 0, 1);
      this.snow = clamp(this.snow + (this.current === 'snow' ? .025 : -.018) * dt, 0, .7);
      if (this.current === 'tornado') this.chase(dt, world);
      const density = this.reducedMotion ? .55 : 1;
      this.primary.emit(config.rate * density, dt, pool => {
        if (rain) pool.acquire('rain', rand(-80, world.w + 150), rand(-150, 0), this.current === 'thunder' ? -200 : -90, rand(650, 1000), 1.8, rand(.8, 1.7), rand(405, 700));
        if (this.current === 'snow') pool.acquire('snow', rand(0, world.w), -10, rand(-16, 16), rand(24, 60), 23, rand(1.5, 4), rand(440, 720));
        if (this.current === 'tornado') pool.acquire('debris', this.tornado.x, this.tornado.y, 0, rand(40, 100), rand(2, 5), rand(1, 3.5), rand(0, TAU));
      });
      this.ambient.emit(5, dt, pool => pool.acquire('mote', rand(0, world.w), rand(360, 700), rand(3, 12), rand(-5, -1), rand(4, 10), rand(.7, 1.8), rand(0, TAU)));
      this.primary.update(dt, world, this); this.ground.update(dt, world, this); this.ambient.update(dt, world, this);
      this.flash = Math.max(0, this.flash - dt * 2.5);
      if (this.current === 'thunder') {
        this.strikeTimer -= dt;
        if (this.strikeTimer <= 0) { this.makeLightning(world); this.strikeTimer = rand(4, 8); }
      }
      if (this.lightning) {
        this.lightning.life -= dt;
        // Revalidate against EVERY animal on EVERY visible bolt frame. Even motion after
        // creation, window resizing, and climbing cannot invalidate the safety guarantee.
        if (this.lightning.life <= 0 || !this.boltIsSafe(world, this.lightning)) this.lightning = null;
      }
    }
    chase(dt, world) {
      const t = this.tornado;
      if (!t.initialized) { t.x = world.w * t.u; t.y = 540; t.initialized = true; }
      let nearest = null, best = Infinity;
      for (const a of world.animals) {
        if (a.x < 0 || a.x > world.w) continue;
        const d = (a.x - t.x) ** 2 + (a.y - t.y) ** 2;
        if (d < best) { best = d; nearest = a; }
      }
      t.target = nearest;
      if (nearest) {
        const dx = nearest.x - t.x, dy = nearest.y - t.y, distance = Math.hypot(dx, dy);
        // Normalize the pursuit vector; 6 world units/sec is below every moving animal.
        // A small stand-off radius avoids sitting directly on a resting animal.
        const step = Math.min(6 * dt, Math.max(0, distance - 55));
        if (distance > .001) { t.x += dx / distance * step; t.y += dy / distance * step; }
        t.u = t.x / world.w;
      }
    }
    safetyIntervals(world, horizon = .3) {
      // Projected horizontal silhouettes include tail, tusks, trunk, and a generous margin.
      // Blocking whole x intervals is conservative: the entire jagged bolt stays outside
      // every animal's vertical column, regardless of the animal's height or climbing.
      return world.animals.map(a => {
        const b = a.bounds, motion = Math.abs(a.velocity) * horizon;
        return [b.left - 38 - motion, b.right + 38 + motion];
      }).sort((a, b) => a[0] - b[0]);
    }
    makeLightning(world) {
      const gaps = []; let start = 25;
      for (const [left, right] of this.safetyIntervals(world)) {
        if (left > start + 32) gaps.push([start, Math.min(left, world.w - 25)]);
        start = Math.max(start, right);
      }
      if (start < world.w - 57) gaps.push([start, world.w - 25]);
      const safe = gaps.filter(g => g[1] - g[0] > 32);
      this.flash = this.reducedMotion ? .025 : .14;
      if (!safe.length) return; // No safe corridor? Only illuminate the clouds.
      const gap = safe[Math.floor(rand(0, safe.length))], center = (gap[0] + gap[1]) / 2;
      const jitter = Math.min(24, (gap[1] - gap[0]) * .28), points = [];
      const bottom = rand(470, 615);
      for (let i = 0; i <= 12; i++) points.push({ x: center + rand(-jitter, jitter), y: lerp(40, bottom, i / 12) });
      const bolt = { points, life: .21, minX: center - jitter - 6, maxX: center + jitter + 6 };
      if (this.boltIsSafe(world, bolt)) { this.lightning = bolt; this.strikes++; }
    }
    boltIsSafe(world, bolt) {
      this.safetyChecks++;
      return !this.safetyIntervals(world).some(([left, right]) => bolt.maxX >= left && bolt.minX <= right);
    }
    drawTornado(c, world) {
      if (this.current !== 'tornado') return;
      const t = this.tornado;
      c.save();
      ellipse(c, t.x, t.y + 5, 91, 14, '#554e3e40');
      for (let i = 27; i >= 0; i--) {
        const f = i / 27, y = t.y - f * 370, radius = 14 + f * f * 120;
        const cx = t.x + Math.sin(world.time * 1.7 + f * 4) * (12 + f * 16);
        c.globalAlpha = .23 + (1 - f) * .27;
        ellipse(c, cx, y, radius, 9 + f * 12, i % 3 === 0 ? '#a3a08b' : '#727b70');
        c.strokeStyle = '#c2bba365'; c.lineWidth = 1.6;
        c.beginPath(); c.ellipse(cx, y, radius, 9 + f * 12, 0, world.time * 3 + i, world.time * 3 + i + 2.4); c.stroke();
      }
      c.restore();
    }
    drawLightning(c) {
      if (!this.lightning) return;
      const pts = this.lightning.points;
      const boltPath = p => { p.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y); };
      c.save(); c.shadowColor = '#efffd8'; c.shadowBlur = 18;
      line(c, '#c5e4d08c', 8, boltPath); line(c, '#fbffe8', 2.8, boltPath); c.restore();
    }
    get particleCount() { return this.primary.pool.count + this.ground.pool.count + this.ambient.pool.count; }
  }

  const DRY = { skyTop: '#d7e1ce', skyLow: '#f4e7b9', far: '#acb7a0', mountain: '#8c9d87', hill: '#c2bf83', hillFront: '#c9bb73', groundTop: '#d9c788', groundBottom: '#b2a568', grass: '#a39f60', grassLight: '#d6c58b', tree: '#536249', treeLight: '#77805a', trunk: '#65563b' };
  const WET = { skyTop: '#c3dcd3', skyLow: '#ecedc9', far: '#9caf9d', mountain: '#809b85', hill: '#a6b778', hillFront: '#92a66b', groundTop: '#b4bf7b', groundBottom: '#7c9559', grass: '#7d9852', grassLight: '#b8c98a', tree: '#3c6246', treeLight: '#678451', trunk: '#5a573b' };
  const STORM = { skyTop: '#637c78', skyLow: '#b7c4a9', far: '#81988a', mountain: '#617f70', hill: '#879b72', hillFront: '#809064', groundTop: '#9ea575', groundBottom: '#6b7c55', grass: '#728054', grassLight: '#acaf81', tree: '#3f5542', treeLight: '#5f7450', trunk: '#52533b' };

  class SceneRenderer {
    constructor(world) {
      this.world = world; this.cache = document.createElement('canvas'); this.cacheKey = '';
      this.palette = DRY; this.trees = [{ u: .135, y: 467, scale: 1.16 }, { u: .80, y: 480, scale: 1.48 }];
      const r = seeded(8801);
      this.tufts = Array.from({ length: 112 }, () => ({ u: r(), y: 632 + r() * 106, height: 12 + r() * 43, phase: r() * TAU, blades: 3 + Math.floor(r() * 4) }));
      this.clouds = [{ u: .05, y: 107, s: 1.2 }, { u: .35, y: 72, s: 1.0 }, { u: .63, y: 124, s: .75 }, { u: .94, y: 70, s: 1.2 }];
    }
    invalidate() { this.cacheKey = ''; }
    getPalette() {
      const world = this.world, wet = Math.round(world.season.blend * 35) / 35, dark = Math.round(world.weather.darkness * 35) / 35;
      const p = {};
      for (const key of Object.keys(DRY)) p[key] = mixColor(mixColor(DRY[key], WET[key], wet), STORM[key], dark);
      return p;
    }
    updateCache() {
      const w = this.world, key = `${Math.round(w.w)}:${Math.round(w.season.blend * 35)}:${Math.round(w.weather.darkness * 35)}`;
      if (key === this.cacheKey) return;
      this.cacheKey = key; this.palette = this.getPalette();
      const p = this.palette, width = w.w, height = w.h;
      this.cache.width = Math.ceil(width); this.cache.height = height;
      const c = this.cache.getContext('2d');
      const sky = c.createLinearGradient(0, 0, 0, 405); sky.addColorStop(0, p.skyTop); sky.addColorStop(1, p.skyLow);
      c.fillStyle = sky; c.fillRect(0, 0, width, height);
      // Transparent rings give the sun a soft, printed-paper halo.
      const sunX = width * .69, sunY = 149;
      ellipse(c, sunX, sunY, 88, 88, '#fcf0c410'); ellipse(c, sunX, sunY, 72, 72, '#fff5ce20');
      ellipse(c, sunX, sunY, 52, 52, mixColor('#fff0bc', '#e1e2bf', w.weather.darkness));
      this.ridge(c, 285, 39, p.far, .9, 1.8);
      shape(c, p.mountain, q => {
        q.moveTo(width * .27, 340); q.bezierCurveTo(width * .37, 325, width * .39, 283, width * .43, 279);
        q.lineTo(width * .46, 272); q.lineTo(width * .49, 254); q.lineTo(width * .52, 254); q.lineTo(width * .54, 259);
        q.bezierCurveTo(width * .58, 269, width * .61, 315, width * .70, 326); q.lineTo(width * .77, 363); q.closePath();
      });
      shape(c, '#d5d8b22e', q => { q.moveTo(width * .43, 279); q.lineTo(width * .49, 254); q.lineTo(width * .52, 254); q.lineTo(width * .54, 259); q.lineTo(width * .57, 278); q.lineTo(width * .53, 271); q.lineTo(width * .50, 272); q.lineTo(width * .47, 268); q.closePath(); });
      this.ridge(c, 338, 25, p.hill, 2.4, 2.1);
      this.ridge(c, 371, 30, p.hillFront, 4.5, 1.8);
      const ground = c.createLinearGradient(0, 355, 0, height); ground.addColorStop(0, p.groundTop); ground.addColorStop(1, p.groundBottom);
      shape(c, ground, q => { q.moveTo(0, 409); q.bezierCurveTo(width * .27, 340, width * .47, 422, width * .65, 386); q.bezierCurveTo(width * .83, 355, width * .95, 380, width, 375); q.lineTo(width, height); q.lineTo(0, height); q.closePath(); });
      shape(c, '#f4db9b18', q => { q.moveTo(width * .6, 400); q.bezierCurveTo(width * .57, 468, width * .69, 498, width * .72, 540); q.bezierCurveTo(width * .76, 616, width * .61, 653, width * .56, 700); q.lineTo(width * .75, 700); q.bezierCurveTo(width * .83, 599, width * .8, 525, width * .72, 493); q.bezierCurveTo(width * .65, 455, width * .63, 431, width * .64, 400); q.closePath(); });
      const r = seeded(731);
      // Small distant acacias and fine, seeded ground marks create depth without assets.
      for (let i = 0; i < 19; i++) this.tree(c, r() * width, 354 + r() * 44, .1 + r() * .15, p, i + 14);
      for (let i = 0; i < 1250; i++) {
        const x = r() * width, y = 385 + r() * 315, depth = (y - 350) / 350;
        const h = 2 + r() * 11 * depth;
        c.strokeStyle = i % 3 ? p.grass : p.grassLight; c.globalAlpha = .2 + depth * .3; c.lineWidth = .6 + depth;
        c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x - 4, y - h * .7); c.moveTo(x, y); c.lineTo(x + 1, y - h); c.moveTo(x + 2, y); c.lineTo(x + 5, y - h * .6); c.stroke();
      }
      c.globalAlpha = 1;
      ellipse(c, width * .31, 565, 159, 28, '#a29b6260');
      ellipse(c, width * .31, 562, 142, 21, mixColor('#98af99', '#94bba4', w.season.blend));
      ellipse(c, width * .31 - 18, 555, 112, 8, '#d7ddbb55');
      for (const t of this.trees) this.tree(c, width * t.u, t.y, t.scale, p, Math.floor(t.u * 100));
      this.tree(c, width * 1.015, 578, 1.05, p, 69);
      // Foreground stones add scale and an irregular edge to the waterhole.
      for (let i = 0; i < 17; i++) {
        const x = r() * width, y = 500 + r() * 190;
        ellipse(c, x, y, 4 + r() * 9, 2 + r() * 3, '#7d825147', -.1);
      }
    }
    ridge(c, y, amplitude, color, phase, frequency) {
      const width = this.world.w;
      shape(c, color, p => {
        p.moveTo(0, y);
        for (let x = 0; x <= width + 30; x += 30) p.lineTo(x, y + Math.sin(x / width * TAU * frequency + phase) * amplitude + Math.sin(x * .009 + phase) * 7);
        p.lineTo(width + 30, 700); p.lineTo(0, 700); p.closePath();
      });
    }
    tree(c, x, y, s, p, seed) {
      const r = seeded(seed); c.save(); c.translate(x, y); c.scale(s, s);
      ellipse(c, 12, 2, 101, 8, '#4d562624');
      shape(c, p.trunk, q => { q.moveTo(-11, 2); q.lineTo(-4, -53); q.lineTo(-10, -110); q.lineTo(-44, -154); q.lineTo(-37, -159); q.lineTo(-1, -126); q.lineTo(17, -167); q.lineTo(25, -167); q.lineTo(12, -112); q.lineTo(8, -54); q.lineTo(17, 3); q.closePath(); });
      line(c, '#a0925d88', 2.5, q => { q.moveTo(-3, -4); q.lineTo(2, -65); q.lineTo(-4, -108); q.lineTo(-33, -150); });
      const branches = [[-3, -123, -87, -162], [6, -115, 74, -169], [-19, -139, -116, -155], [13, -141, 109, -159], [5, -137, 42, -188]];
      for (const b of branches) line(c, p.trunk, 3.5, q => { q.moveTo(b[0], b[1]); q.quadraticCurveTo((b[0] + b[2]) / 2, b[1] - 25, b[2], b[3]); });
      shape(c, p.tree, q => {
        q.moveTo(-137, -160); q.bezierCurveTo(-141, -174, -121, -191, -99, -188);
        q.bezierCurveTo(-93, -204, -72, -206, -52, -200); q.bezierCurveTo(-31, -218, 6, -214, 20, -203);
        q.bezierCurveTo(38, -215, 66, -204, 77, -193); q.bezierCurveTo(103, -197, 120, -180, 114, -172);
        q.bezierCurveTo(146, -167, 138, -152, 117, -150); q.bezierCurveTo(80, -142, 49, -148, 21, -150);
        q.bezierCurveTo(-5, -141, -27, -145, -50, -149); q.bezierCurveTo(-81, -142, -109, -148, -137, -160); q.closePath();
      });
      for (let i = 0; i < 38; i++) {
        const xx = r() * 242 - 123, yy = -185 + Math.abs(xx) * .09 + r() * 15;
        c.globalAlpha = .35 + r() * .35; ellipse(c, xx, yy, 10 + r() * 22, 4 + r() * 8, p.treeLight, (r() - .5) * .2);
      }
      c.globalAlpha = 1;
      // Tiny hanging stems keep the umbrella canopy from reading as a simple ellipse.
      for (let i = 0; i < 8; i++) { const xx = r() * 210 - 100; line(c, p.tree, 1.2, q => { q.moveTo(xx, -154); q.lineTo(xx - 3, -145 - r() * 6); }); }
      c.restore();
    }
    drawCloud(c, x, y, scale, storm) {
      c.save(); c.translate(x, y); c.scale(scale, scale);
      c.globalAlpha = storm ? .34 : .52;
      const color = storm ? '#7f9186' : '#ffffe9';
      shape(c, color, p => { p.moveTo(-112, 13); p.bezierCurveTo(-143, 10, -111, -3, -83, 0); p.bezierCurveTo(-91, -25, -46, -39, -24, -20); p.bezierCurveTo(-9, -48, 49, -44, 59, -13); p.bezierCurveTo(83, -27, 113, -14, 107, 0); p.bezierCurveTo(148, -6, 154, 17, 110, 18); p.closePath(); });
      if (!storm) { c.globalAlpha = .3; ellipse(c, -3, 25, 137, 3, '#fffbe2'); }
      c.restore();
    }
    drawWater(c) {
      const world = this.world, t = world.time;
      c.save(); c.strokeStyle = '#ecedc175'; c.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const x = world.w * .31 + Math.sin(i * 3) * 90, y = 553 + i * 4;
        c.beginPath(); c.moveTo(x - 10 - Math.sin(t + i) * 3, y); c.quadraticCurveTo(x, y + .8, x + 18, y); c.stroke();
      }
      if (world.weather.wetness > .01) {
        c.globalAlpha = world.weather.wetness * .55;
        for (let i = 0; i < 4; i++) {
          const x = world.w * [.13, .50, .70, .91][i], y = [618, 570, 650, 553][i];
          ellipse(c, x, y, [80, 60, 110, 45][i], 6 + i * 1.3, '#9dbba9');
          if (['rain', 'heavy', 'thunder'].includes(world.weather.current)) {
            const phase = (t * 1.3 + i * .3) % 1;
            c.globalAlpha = world.weather.wetness * (1 - phase) * .65;
            c.strokeStyle = '#e1e8cd'; c.lineWidth = 1; ellipse(c, x, y, 8 + phase * 26, 2 + phase * 4); c.stroke();
            c.globalAlpha = world.weather.wetness * .55;
          }
        }
      }
      c.restore();
    }
    drawForeground(c) {
      const w = this.world, p = this.palette;
      c.save();
      for (let i = 0; i < this.tufts.length; i++) {
        const tuft = this.tufts[i], x = tuft.u * w.w, y = tuft.y, sway = Math.sin(w.time * 1.35 + tuft.phase) * (w.weather.current === 'tornado' ? 15 : 4);
        c.strokeStyle = i % 4 === 0 ? p.grassLight : p.treeLight; c.globalAlpha = .4 + (y - 632) / 190;
        c.lineWidth = 1.3 + tuft.height / 35; c.lineCap = 'round'; c.beginPath();
        for (let j = 0; j < tuft.blades; j++) {
          const direction = (j / (tuft.blades - 1) - .5) * 2, height = tuft.height * (1 - Math.abs(direction) * .25);
          c.moveTo(x + j, y); c.quadraticCurveTo(x + direction * 5 + sway * .3, y - height * .6, x + direction * height * .4 + sway, y - height);
        }
        c.stroke();
      }
      c.globalAlpha = 1;
      // A few broad leaves frame the lower corners, like looking out from the grass.
      this.foregroundPlant(c, 9, 718, .98, w.time, p);
      this.foregroundPlant(c, w.w - 4, 724, 1.2, w.time + 2, p);
      c.restore();
    }
    foregroundPlant(c, x, y, scale, time, p) {
      c.save(); c.translate(x, y); c.scale(scale, scale);
      const sway = Math.sin(time * .7) * 4;
      for (let i = 0; i < 11; i++) {
        const angle = (i / 10 - .5) * 2.4, h = 52 + Math.sin(i * 7) * 35;
        c.save(); c.rotate(angle);
        shape(c, i % 3 ? p.tree : p.treeLight, q => { q.moveTo(0, 0); q.bezierCurveTo(-14, -h * .4, -11 + sway, -h * .85, sway, -h); q.bezierCurveTo(2 + sway, -h * .5, 9, -h * .2, 0, 0); });
        c.restore();
      }
      c.restore();
    }
    draw() {
      const w = this.world, c = w.ctx;
      this.updateCache();
      c.setTransform(w.dpr, 0, 0, w.dpr, 0, 0); c.clearRect(0, 0, w.cssWidth, w.cssHeight);
      c.scale(w.cssHeight / w.h, w.cssHeight / w.h);
      c.drawImage(this.cache, 0, 0, w.w, w.h);
      const storm = w.weather.darkness > .5;
      for (const cloud of this.clouds) {
        const x = ((cloud.u * (w.w + 500) + w.time * (storm ? 5 : 1.6)) % (w.w + 500)) - 180;
        this.drawCloud(c, x, cloud.y, cloud.s, storm);
      }
      if (storm) {
        for (let i = 0; i < 5; i++) this.drawCloud(c, w.w * i / 4, -5, 2.5, true);
      }
      // A distant flock crosses behind the wildlife, well below the cloud layer.
      c.save(); c.strokeStyle = '#62725a'; c.globalAlpha = .5; c.lineWidth = 1.4;
      for (let i = 0; i < 6; i++) {
        const x = ((w.w * .43 + i * 22 + w.time * 3) % (w.w + 160)) - 80, y = 185 + Math.sin(i * 2) * 15, flap = Math.sin(w.time * 4 + i) * 3;
        c.beginPath(); c.moveTo(x - 5, y - flap); c.quadraticCurveTo(x - 2, y - 3, x, y); c.quadraticCurveTo(x + 2, y - 3, x + 5, y - flap); c.stroke();
      }
      c.restore();
      this.drawWater(c);
      w.drawOrder.sort((a, b) => a.y - b.y);
      for (const animal of w.drawOrder) animal.draw(c, w.time);
      if (w.weather.snow > .01) {
        c.save(); c.globalAlpha = w.weather.snow * .5;
        const r = seeded(22);
        for (let i = 0; i < 120; i++) ellipse(c, r() * w.w, 400 + r() * 300, 6 + r() * 13, 1 + r() * 2, '#f3f4df');
        c.restore();
      }
      w.weather.drawTornado(c, w);
      this.drawForeground(c);
      w.weather.ambient.draw(c); w.weather.ground.draw(c); w.weather.primary.draw(c); w.weather.drawLightning(c);
      // A gentle color glaze integrates the animals with storm light.
      if (w.weather.darkness > .05) { c.fillStyle = `rgba(30,59,56,${w.weather.darkness * .12})`; c.fillRect(0, 0, w.w, w.h); }
      if (w.weather.flash > 0) { c.fillStyle = `rgba(255,255,229,${w.weather.flash})`; c.fillRect(0, 0, w.w, w.h); }
      const vignette = c.createLinearGradient(0, 570, 0, 700); vignette.addColorStop(0, '#183b2900'); vignette.addColorStop(1, '#1738253b'); c.fillStyle = vignette; c.fillRect(0, 570, w.w, 130);
    }
  }

  class Interface {
    constructor(world) {
      this.world = world; this.lastUI = -1; this.debugVisible = false;
      this.weatherButtons = $$('.weather-button'); this.seasonButtons = $$('[data-season]');
      this.countdown = $('#season-countdown'); this.progress = $('#season-progress'); this.debug = $('#debug'); this.noteState = $('#note-state');
      this.guide = $('#field-guide');
      this.weatherButtons.forEach(button => button.addEventListener('click', () => world.weather.set(button.dataset.weather)));
      this.seasonButtons.forEach(button => button.addEventListener('click', () => world.season.set(button.dataset.season)));
      world.weather.addEventListener('change', () => this.syncClimate());
      world.season.addEventListener('change', () => {
        // Snow is deliberately a rare dry-season option. A wet-season switch selects rain
        // without touching any animal position, state timer, or animation phase.
        if (world.season.current === 'wet' && world.weather.current === 'snow') world.weather.set('rain');
        this.syncClimate();
      });
      $('#pause-button').addEventListener('click', () => this.togglePause());
      $('#speed-button').addEventListener('click', () => {
        world.speed = world.speed === 1 ? 2 : world.speed === 2 ? .5 : 1;
        $('#speed-button').textContent = `${world.speed}×`;
        $('#speed-button').setAttribute('aria-label', `Simulation speed: ${world.speed} times`);
        this.announce(`Simulation speed ${world.speed} times`);
      });
      $('#fullscreen-button').addEventListener('click', async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if ($('#scene').requestFullscreen) await $('#scene').requestFullscreen();
          else this.announce('Full screen is unavailable in this browser.');
        } catch (_) { this.announce('Full screen is unavailable in this embedded preview.'); }
      });
      const openGuide = () => { if (!this.guide.open) this.guide.showModal(); };
      $('.guide-trigger').addEventListener('click', openGuide); $('#animal-note').addEventListener('click', openGuide);
      $('#close-guide').addEventListener('click', () => this.guide.close());
      this.guide.addEventListener('click', e => {
        const r = this.guide.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.guide.close();
      });
      world.canvas.addEventListener('pointermove', e => {
        const p = this.pointer(e), animal = this.findAnimal(p);
        world.canvas.style.cursor = animal ? 'pointer' : 'default';
      });
      world.canvas.addEventListener('click', e => {
        const animal = this.findAnimal(this.pointer(e));
        if (animal) this.selectAnimal(animal);
      });
      document.addEventListener('keydown', e => {
        if (e.repeat || this.guide.open || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const types = Object.keys(WEATHER);
        if (/^[1-6]$/.test(e.key)) {
          const type = types[Number(e.key) - 1];
          if (type === 'snow' && world.season.current === 'wet') this.announce('Snow is available in the dry season.');
          else world.weather.set(type);
        } else if (e.key.toLowerCase() === 's') world.season.set(world.season.current === 'dry' ? 'wet' : 'dry');
        else if (e.code === 'Space' && !e.target.closest('button, a')) { e.preventDefault(); this.togglePause(); }
        else if (e.key.toLowerCase() === 'd') { this.debugVisible = !this.debugVisible; this.debug.hidden = !this.debugVisible; }
      });
      this.selectAnimal(world.animals[0]); this.syncClimate();
    }
    pointer(e) { const r = this.world.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * this.world.w, y: (e.clientY - r.top) / r.height * this.world.h }; }
    findAnimal(p) { return [...this.world.drawOrder].reverse().find(a => a.hit(p.x, p.y)); }
    selectAnimal(animal) {
      this.world.animals.forEach(a => { a.selected = a === animal; }); this.world.selected = animal;
      $('#note-species').textContent = animal.name.toUpperCase(); this.noteState.textContent = animal.mood;
      $('#animal-note').setAttribute('aria-label', `${animal.name}: ${animal.mood}. Open field guide`);
      this.world.dirty = true; this.announce(`${animal.name}. ${animal.mood}.`);
    }
    announce(message) { $('#announcement').textContent = message; }
    togglePause() {
      const w = this.world; w.paused = !w.paused; w.dirty = true;
      $('#pause-button use').setAttribute('href', w.paused ? '#i-play' : '#i-pause');
      $('#pause-button').setAttribute('aria-label', w.paused ? 'Resume simulation' : 'Pause simulation');
      $('#pause-button').title = w.paused ? 'Resume (Space)' : 'Pause (Space)';
      $('#pause-indicator').hidden = !w.paused; this.announce(w.paused ? 'Simulation paused.' : 'Simulation resumed.');
    }
    syncClimate() {
      const w = this.world, weather = WEATHER[w.weather.current], wet = w.season.current === 'wet';
      for (const button of this.weatherButtons) {
        const active = button.dataset.weather === w.weather.current;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
        button.disabled = wet && button.dataset.weather === 'snow';
        if (button.dataset.weather === 'snow') button.title = wet ? 'Snow is available in the dry season (4)' : 'Snow — a rare dry-season event (4)';
      }
      for (const button of this.seasonButtons) {
        const active = button.dataset.season === w.season.current;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
      }
      $('#climate-text').textContent = `${weather.label} · ${weather.temp - (wet ? 3 : 0)}°`;
      $('#current-weather-icon use').setAttribute('href', `#i-${weather.icon}`);
      $('#scene-season').textContent = wet ? 'Wet season' : 'Dry season';
      $('#ecosystem-status').textContent = weather.status;
      $('#habitat-label').textContent = wet ? 'THE GREEN SEASON' : 'GOLDEN GRASSLANDS';
      this.announce(`${weather.label}. ${wet ? 'Wet' : 'Dry'} season.`); w.dirty = true;
    }
    update(now) {
      if (now - this.lastUI < 200) return;
      this.lastUI = now;
      const w = this.world, remaining = Math.max(0, Math.ceil(w.season.duration - w.season.elapsed));
      this.countdown.textContent = `${w.season.current === 'dry' ? 'Wet' : 'Dry'} season in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      this.progress.style.width = `${(1 - w.season.elapsed / w.season.duration) * 100}%`;
      if (w.selected && this.noteState.textContent !== w.selected.mood) {
        this.noteState.textContent = w.selected.mood;
        $('#animal-note').setAttribute('aria-label', `${w.selected.name}: ${w.selected.mood}. Open field guide`);
      }
      if (this.debugVisible) {
        this.debug.textContent = `FPS ${Math.round(w.fps)} · ${w.paused ? 'PAUSED' : `${w.speed}×`}\nPARTICLES ${w.weather.particleCount} / 1825\nANIMALS ${w.animals.length} · 3 SPECIES\nBOLTS ${w.weather.strikes} · SAFE${w.weather.current === 'tornado' && w.weather.tornado.target ? `\nFOLLOWING ${w.weather.tornado.target.name.toUpperCase()}` : ''}`;
        this.debug.style.whiteSpace = 'pre';
      }
    }
  }

  class Ecosystem {
    constructor() {
      this.canvas = $('#ecosystem'); this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.w = 2100; this.h = 700; this.cssWidth = 1; this.cssHeight = 1; this.dpr = 1;
      this.time = 0; this.speed = 1; this.paused = false; this.dirty = true; this.fps = 60; this.lastTime = 0; this.raf = null;
      this.season = new SeasonManager(); this.weather = new WeatherManager(matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.renderer = new SceneRenderer(this);
      // The initial scene is prepopulated along the same left-to-right routes used on wrap.
      // Adults lead their smaller companion; leopards have independent lanes and clocks.
      this.animals = [new Elephant('elephant-1', .402, 519, 1.14, 2), new Elephant('elephant-2', .286, 493, .81, 5, true),
        new Lion('lion-1', .685, 567, 1.08, 4, true), new Lion('lion-2', .577, 551, .94, 7),
        new Leopard('leopard-1', .126, 500, .92, 3), new Leopard('leopard-2', .789, 491, .82, 9)];
      this.drawOrder = [...this.animals]; this.resize();
      this.animals.forEach(a => { a.x = a.u * this.w; });
      this.ui = new Interface(this);
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.canvas);
      this.onVisibility = () => {
        if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = null; }
        else { this.lastTime = performance.now(); if (this.raf === null) this.raf = requestAnimationFrame(this.tick); }
      };
      document.addEventListener('visibilitychange', this.onVisibility);
      this.tick = this.tick.bind(this); this.lastTime = performance.now(); this.raf = requestAnimationFrame(this.tick);
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.cssWidth = Math.max(1, r.width); this.cssHeight = Math.max(1, r.height);
      this.dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(3500000 / (this.cssWidth * this.cssHeight)));
      this.canvas.width = Math.round(this.cssWidth * this.dpr); this.canvas.height = Math.round(this.cssHeight * this.dpr);
      this.w = this.h * this.cssWidth / this.cssHeight;
      this.weather.tornado.x = this.weather.tornado.u * this.w;
      this.weather.lightning = null;
      this.animals.forEach(a => { a.x = a.u * this.w; });
      this.renderer.invalidate(); this.dirty = true;
    }
    update(dt) {
      this.time += dt; this.season.update(dt);
      for (const a of this.animals) a.update(dt, this);
      this.weather.update(dt, this);
    }
    tick(now) {
      const realDt = clamp((now - this.lastTime) / 1000, 0, .05); this.lastTime = now;
      if (realDt > 0) this.fps = lerp(this.fps, Math.min(240, 1 / realDt), .05);
      if (!this.paused) {
        // Bounded substeps keep pursuit and collisions stable at 2× or after a dropped frame.
        let remaining = realDt * this.speed;
        while (remaining > .000001) { const step = Math.min(remaining, 1 / 30); this.update(step); remaining -= step; }
      }
      if (!this.paused || this.dirty) { this.renderer.draw(); this.dirty = false; }
      this.ui.update(now); this.raf = requestAnimationFrame(this.tick);
    }
    snapshot() {
      return { time: this.time, season: this.season.current, seasonTime: this.season.elapsed, weather: this.weather.current,
        particles: this.weather.particleCount, capacity: 1825, safeBolt: !this.weather.lightning || this.weather.boltIsSafe(this, this.weather.lightning),
        animals: this.animals.map(a => ({ id: a.id, kind: a.kind, x: a.x, y: a.y, state: a.state, speed: a.velocity, climb: a.climb })) };
    }
  }

  // A single inspectable instance is useful for the D overlay and repeatable endurance audits.
  const ecosystem = new Ecosystem();
  Object.defineProperty(window, 'wildfield', { value: ecosystem, writable: false });
})();
