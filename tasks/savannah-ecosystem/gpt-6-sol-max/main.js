"use strict";

// Wildlands is deliberately self contained: one Canvas, one animation clock, and
// a small collection of long lived systems. No images or runtime libraries.
const WORLD_HEIGHT = 700;
const WEATHER = Object.freeze({
  sunny: { label: "GOLDEN HOUR", story: "The plains are waking", spawn: 8, limit: 36 },
  rain: { label: "SOFT RAIN", story: "Rain gathers over the grass", spawn: 175, limit: 250 },
  heavy: { label: "HEAVY RAIN", story: "The waterholes begin to rise", spawn: 380, limit: 470 },
  snow: { label: "RARE SNOW", story: "An unlikely cold front arrives", spawn: 75, limit: 135 },
  thunder: { label: "THUNDERSTORM", story: "Thunder rolls beyond the herd", spawn: 260, limit: 360 },
  tornado: { label: "TORNADO WATCH", story: "Dust follows the moving herd", spawn: 145, limit: 280 }
});

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);
function hexMix(a, b, t) {
  const aa = a.replace("#", ""), bb = b.replace("#", "");
  const ar = parseInt(aa.slice(0, 2), 16), ag = parseInt(aa.slice(2, 4), 16), ab = parseInt(aa.slice(4, 6), 16);
  const br = parseInt(bb.slice(0, 2), 16), bg = parseInt(bb.slice(2, 4), 16), bl = parseInt(bb.slice(4, 6), 16);
  const channel = (start, end) => Math.round(lerp(start, end, t)).toString(16).padStart(2, "0");
  const rgb = channel(ar, br) + channel(ag, bg) + channel(ab, bl);
  if (aa.length === 8 && bb.length === 8) {
    const alpha = channel(parseInt(aa.slice(6, 8), 16), parseInt(bb.slice(6, 8), 16));
    return `#${rgb}${alpha}`;
  }
  return `#${rgb}`;
}
function seeded(seed) {
  let value = seed >>> 0;
  return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 4294967296; };
}

class EventBus {
  constructor() { this.listeners = new Map(); }
  on(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  emit(name, detail) { for (const callback of this.listeners.get(name) || []) callback(detail); }
}

class SeasonManager {
  constructor(bus) {
    this.bus = bus;
    this.name = "dry";
    this.mix = 0;
    this.remaining = 60;
  }
  toggle() {
    this.name = this.name === "dry" ? "wet" : "dry";
    this.remaining = 60;
    this.bus.emit("season", this.name);
  }
  update(dt) {
    this.remaining -= dt;
    if (this.remaining <= 0) this.toggle();
    // The target changes at once for behavior, while landscape colors ease
    // toward it over several seconds. Wildlife coordinates are untouched.
    const target = this.name === "wet" ? 1 : 0;
    this.mix += (target - this.mix) * Math.min(1, dt * 0.54);
    if (Math.abs(this.mix - target) < .001) this.mix = target;
  }
}

class ParticlePool {
  constructor(capacity = 800) {
    this.capacity = capacity;
    this.free = [];
    this.active = [];
    for (let i = 0; i < capacity; i++) this.free.push(this.make());
  }
  make() { return { kind: "", x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 0, alpha: 1, angle: 0, radius: 0, phase: 0 }; }
  obtain(kind) {
    if (!this.free.length) return null;
    const particle = this.free.pop();
    particle.kind = kind;
    particle.age = 0;
    particle.alpha = 1;
    this.active.push(particle);
    return particle;
  }
  release(index) {
    const particle = this.active[index];
    const last = this.active.pop();
    if (index < this.active.length) this.active[index] = last;
    this.free.push(particle);
  }
  clear() {
    while (this.active.length) this.free.push(this.active.pop());
  }
}

class WeatherManager {
  constructor(bus, pool) {
    this.bus = bus;
    this.pool = pool;
    this.type = "sunny";
    this.intensity = 1;
    this.spawnRemainder = 0;
    this.time = 0;
    this.flash = 0;
    this.boltLife = 0;
    this.boltX = null;
    this.skyBoltX = null;
    this.boltPoints = [];
    this.nextLightning = 4;
    this.tornadoX = null;
  }
  set(type, season) {
    if (!WEATHER[type] || (type === "snow" && season.name === "wet") || type === this.type) return false;
    this.type = type;
    // All old weather particles are returned to the fixed pool immediately.
    this.pool.clear();
    this.spawnRemainder = 0;
    this.intensity = 0;
    this.flash = 0;
    this.boltLife = 0;
    this.boltX = null;
    this.skyBoltX = null;
    this.nextLightning = rand(2.4, 4.8);
    this.tornadoX = null;
    this.bus.emit("weather", type);
    return true;
  }
  createParticle(W) {
    const type = this.type;
    const kind = type === "sunny" ? "mote" : type === "snow" ? "flake" : type === "tornado" ? "dust" : "rain";
    const p = this.pool.obtain(kind);
    if (!p) return;
    p.x = rand(-25, W + 25);
    p.y = kind === "dust" ? rand(380, 565) : kind === "mote" ? rand(140, 590) : rand(-40, -5);
    p.phase = rand(0, Math.PI * 2);
    p.angle = rand(0, Math.PI * 2);
    p.radius = rand(10, 85);
    if (kind === "rain") {
      p.vx = type === "heavy" || type === "thunder" ? -115 : -70;
      p.vy = type === "heavy" || type === "thunder" ? rand(730, 1050) : rand(560, 760);
      p.life = 2.1; p.size = rand(11, 20); p.alpha = rand(.35, .85);
    } else if (kind === "flake") {
      p.vx = rand(-19, 2); p.vy = rand(38, 85); p.life = 12;
      p.size = rand(2.1, 4.8); p.alpha = rand(.48, .9);
    } else if (kind === "dust") {
      p.x = (this.tornadoX ?? W * .67) + rand(-75, 75);
      p.vx = rand(-25, 25); p.vy = rand(-75, -18); p.life = rand(.6, 2.1);
      p.size = rand(1.5, 6.5); p.alpha = rand(.25, .65);
    } else {
      p.vx = rand(-9, 9); p.vy = rand(-17, -4); p.life = rand(4, 10);
      p.size = rand(.8, 2.3); p.alpha = rand(.15, .48);
    }
  }
  isStrikeSafe(x, animals, W) {
    if (x === null) return false;
    // Every frame of a visible bolt checks current positions. The extra 105
    // world units cover its jagged core, branches, and movement during a flash.
    // Wrapped copies at the scene edges count as occupied ground too.
    return animals.every(animal => {
      const distance = Math.min(Math.abs(x - animal.x), Math.abs(x - animal.x + W), Math.abs(x - animal.x - W));
      return distance > animal.hitRadius + 105;
    });
  }
  findSafeStrike(W, animals) {
    // Sample the entire visible ground; use only columns outside every animal's
    // live horizontal safety zone. If none exists, show a sky flash without a bolt.
    const candidates = [];
    for (let x = 95; x <= W - 95; x += 24) if (this.isStrikeSafe(x, animals, W)) candidates.push(x);
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  }
  makeBolt() {
    this.boltPoints.length = 0;
    let offset = 0;
    for (let i = 0; i <= 10; i++) {
      if (i > 0 && i < 10) offset = clamp(offset + rand(-18, 18), -42, 42);
      this.boltPoints.push({ x: offset, y: 43 + i * 44 });
    }
  }
  update(dt, W, animals, season) {
    this.time += dt;
    this.intensity = Math.min(1, this.intensity + dt * .9);
    if (this.type === "tornado") {
      if (this.tornadoX === null) this.tornadoX = W * .72;
      let target = null, best = Infinity;
      for (const animal of animals) {
        const distance = Math.abs(animal.x - this.tornadoX);
        if (distance < best) { best = distance; target = animal; }
      }
      // A funnel follows the nearest animal, but its capped speed lets the
      // wildlife visibly outrun or drift away from it.
      if (target) this.tornadoX += clamp(target.x - this.tornadoX, -18 * dt, 18 * dt);
      this.tornadoX = clamp(this.tornadoX, 65, W - 65);
    }
    if (this.type === "thunder") {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.nextLightning = rand(2.6, 5.4);
        this.boltX = this.findSafeStrike(W, animals);
        this.skyBoltX = rand(W * .2, W * .8);
        this.makeBolt();
        this.flash = .24;
        this.boltLife = .18;
      }
      this.flash = Math.max(0, this.flash - dt);
      this.boltLife = Math.max(0, this.boltLife - dt);
    }
    const settings = WEATHER[this.type];
    const cap = settings.limit;
    this.spawnRemainder += settings.spawn * this.intensity * dt;
    const amount = Math.min(60, Math.floor(this.spawnRemainder));
    this.spawnRemainder -= amount;
    for (let i = 0; i < amount && this.pool.active.length < cap; i++) this.createParticle(W);
    const particles = this.pool.active;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.kind === "dust") {
        p.angle += dt * 4.6;
        p.radius += dt * 18;
        p.x = (this.tornadoX ?? W * .7) + Math.sin(p.angle) * p.radius;
        p.y += p.vy * dt;
      } else if (p.kind === "flake") {
        p.x += (p.vx + Math.sin(this.time * 2 + p.phase) * 13) * dt;
        p.y += p.vy * dt;
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      if (p.kind === "rain" && p.y > 575 && Math.random() < .16) {
        p.kind = "ripple"; p.y = clamp(p.y, 555, 632); p.vx = p.vy = 0;
        p.age = 0; p.life = .48; p.size = 2;
      }
      if (p.age >= p.life || p.y > 705 || p.x < -65 || p.x > W + 65) this.pool.release(i);
    }
  }
  drawTornado(ctx) {
    if (this.type !== "tornado" || this.tornadoX === null) return;
    const x = this.tornadoX, t = this.time;
    ctx.save();
    ctx.globalAlpha = this.intensity;
    const gradient = ctx.createLinearGradient(x - 90, 160, x + 70, 550);
    gradient.addColorStop(0, "#e9d6ad99"); gradient.addColorStop(.5, "#777d7099"); gradient.addColorStop(1, "#5b624fb8");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x - 105, 172);
    ctx.bezierCurveTo(x - 35, 260, x - 55, 330, x - 23, 445);
    ctx.quadraticCurveTo(x + 14, 510, x + 3, 550);
    ctx.quadraticCurveTo(x + 47, 520, x + 24, 451);
    ctx.bezierCurveTo(x + 8, 340, x + 68, 260, x + 105, 172);
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 12; i++) {
      const y = 188 + i * 29;
      const radius = lerp(91, 17, i / 12);
      ctx.strokeStyle = i % 2 ? "#e9dcc288" : "#40534f8c";
      ctx.lineWidth = lerp(8, 2, i / 12);
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(t * 3 + i * .8) * 7, y, radius, 11, Math.sin(t + i) * .07, i % 2 ? .1 : Math.PI, i % 2 ? Math.PI * 1.55 : Math.PI * 2.5);
      ctx.stroke();
    }
    ctx.fillStyle = "#816d51a3";
    ctx.beginPath(); ctx.ellipse(x, 550, 61, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  drawParticles(ctx) {
    const type = this.type;
    ctx.save();
    if (type === "rain" || type === "heavy" || type === "thunder") {
      ctx.strokeStyle = type === "rain" ? "#c7e7e0ab" : "#c3d6d8a8";
      ctx.lineWidth = type === "rain" ? 1.45 : 1.7;
      ctx.beginPath();
      for (const p of this.pool.active) if (p.kind === "rain") {
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.size * .28, p.y + p.size);
      }
      ctx.stroke();
    }
    for (const p of this.pool.active) {
      if (p.kind === "rain") continue;
      if (p.kind === "ripple") {
        ctx.strokeStyle = `rgba(235,246,230,${(.5 * (1 - p.age / p.life)).toFixed(2)})`;
        ctx.lineWidth = 1.3; ctx.beginPath();
        ctx.ellipse(p.x, p.y, 3 + p.age * 36, 1 + p.age * 8, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === "flake") {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#f7fbf5"; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === "dust") {
        ctx.globalAlpha = p.alpha * this.intensity;
        ctx.fillStyle = p.size > 4 ? "#e6c997" : "#f2e1bb";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === "mote") {
        ctx.globalAlpha = p.alpha * (.65 + .35 * Math.sin(this.time * 2 + p.phase));
        ctx.fillStyle = "#fff5c7"; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  drawLightning(ctx, W, animals) {
    if (this.type !== "thunder") return;
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(234,244,251,${this.flash * .7})`;
      ctx.fillRect(0, 0, W, WORLD_HEIGHT);
    }
    if (this.boltLife <= 0) return;
    // Recheck every animal right before painting: moving wildlife can never
    // enter a displayed strike column, even after the bolt was first chosen.
    if (this.boltX !== null && !this.isStrikeSafe(this.boltX, animals, W)) {
      this.boltX = this.findSafeStrike(W, animals);
    }
    const grounded = this.boltX !== null;
    // When ground has no safe column, a shorter fork ends high in the sky.
    const x = grounded ? this.boltX : this.skyBoltX, pts = this.boltPoints;
    const pointCount = grounded ? pts.length : 6;
    ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const [width, color] of [[21, "#e8f5ff6b"], [10, "#d8edff"], [3.5, "#ffffff"]]) {
      ctx.lineWidth = width; ctx.strokeStyle = color; ctx.beginPath();
      ctx.moveTo(x + pts[0].x, pts[0].y);
      for (let i = 1; i < pointCount; i++) ctx.lineTo(x + pts[i].x, pts[i].y);
      ctx.stroke();
    }
    if (grounded) {
      ctx.strokeStyle = "#e5f4ffbd"; ctx.lineWidth = 3;
      for (const branch of [4, 7]) {
        ctx.beginPath(); ctx.moveTo(x + pts[branch].x, pts[branch].y);
        ctx.lineTo(x + pts[branch].x + (branch === 4 ? -41 : 43), pts[branch].y + 30);
        ctx.lineTo(x + pts[branch].x + (branch === 4 ? -49 : 52), pts[branch].y + 70);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

class Animal {
  constructor(x, y, scale, baseSpeed) {
    this.x = x; this.y = y; this.scale = scale; this.baseSpeed = baseSpeed;
    this.phase = rand(0, 6.28); this.state = "walk"; this.stateTime = 0;
    this.stateDuration = rand(5, 9); this.hitRadius = 56 * scale;
    this.mate = null; this.gap = 0; this.climbOffset = 0;
  }
  wrap(W) {
    if (this.x >= W) this.x -= W;
  }
  groupAdjust(W, season) {
    if (!this.mate) return 1;
    const circumference = W;
    let difference = this.mate.x - this.x - this.gap * (season.name === "dry" ? .72 : 1);
    if (difference < -circumference / 2) difference += circumference;
    if (difference > circumference / 2) difference -= circumference;
    return clamp(1 + difference * .0038, .7, 1.38);
  }
  weatherFactor(weather) {
    return { sunny: 1, rain: .9, heavy: .68, snow: .55, thunder: .73, tornado: 1.25 }[weather.type];
  }
  stateLabel() { return this.state.toUpperCase(); }
  drawShadow(ctx, width) {
    ctx.fillStyle = "#3a3b2650"; ctx.beginPath();
    ctx.ellipse(this.x + 3, this.y + 2, width * this.scale, 8 * this.scale, 0, 0, Math.PI * 2); ctx.fill();
  }
}

class Lion extends Animal {
  constructor(x, y, scale, male = true) {
    super(x, y, scale, male ? 31 : 34); this.male = male;
    this.state = "patrol"; this.stateDuration = rand(7, 13); this.hitRadius = 62 * scale;
  }
  update(dt, env) {
    const { season, weather, W } = env;
    this.phase += dt * (this.state === "rest" ? 1.2 : 5.2);
    this.stateTime += dt;
    if (this.stateTime > this.stateDuration) {
      this.stateTime = 0;
      if (this.state === "rest") { this.state = "patrol"; this.stateDuration = rand(7, 13); }
      else {
        const restChance = season.name === "dry" ? .62 : .31;
        this.state = Math.random() < restChance || weather.type === "heavy" ? "rest" : "patrol";
        this.stateDuration = this.state === "rest" ? rand(2.4, 4.8) : rand(6, 12);
      }
    }
    const activity = this.state === "rest" ? .18 : 1;
    this.x += this.baseSpeed * this.weatherFactor(weather) * (season.name === "wet" ? 1.21 : .9) * activity * this.groupAdjust(W, season) * dt;
    this.wrap(W);
  }
  stateLabel() { return this.state === "rest" ? "RESTING" : "PATROLLING"; }
  draw(ctx) {
    this.drawShadow(ctx, 59);
    ctx.save(); ctx.translate(this.x, this.y - (this.state === "rest" ? 3 : Math.abs(Math.sin(this.phase)) * 2)); ctx.scale(this.scale, this.scale);
    const gait = this.state === "rest" ? 0 : Math.sin(this.phase) * 8;
    // Tail and tuft sit behind the warm gold body.
    ctx.strokeStyle = "#9c6832"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-45, -40); ctx.bezierCurveTo(-81, -45, -75, -11, -92, -17 + Math.sin(this.phase * .55) * 6); ctx.stroke();
    ctx.fillStyle = "#583e2e"; ctx.beginPath(); ctx.ellipse(-93, -17 + Math.sin(this.phase * .55) * 6, 12, 6, -.4, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#a96f32";
    for (const [lx, offset] of [[-29, gait], [31, -gait]]) {
      ctx.beginPath(); ctx.roundRect(lx - 8, -24, 16, 32 + offset * .35, 6); ctx.fill();
      ctx.fillStyle = "#bb8240"; ctx.beginPath(); ctx.ellipse(lx + 1, 0 + offset * .35, 12, 5, 0, 0, 6.28); ctx.fill(); ctx.fillStyle = "#a96f32";
    }
    ctx.fillStyle = "#c78b45"; ctx.beginPath();
    ctx.ellipse(-3, -40, 52, 28, .02, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#dea353"; ctx.beginPath(); ctx.ellipse(-5, -51, 42, 15, -.08, 0, 6.28); ctx.fill();
    if (this.male) {
      ctx.fillStyle = "#7b4628";
      for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(38 + Math.cos(a) * 22, -48 + Math.sin(a) * 25, 13, 17, a, 0, 6.28); ctx.fill(); }
      ctx.fillStyle = "#98582d"; ctx.beginPath(); ctx.ellipse(40, -49, 27, 31, -.1, 0, 6.28); ctx.fill();
    }
    ctx.fillStyle = "#d69b51"; ctx.beginPath(); ctx.ellipse(50, -50, 23, 20, -.13, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#b4773c"; ctx.beginPath(); ctx.arc(this.male ? 35 : 43, -66, 8, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#dbaa65"; ctx.beginPath(); ctx.arc(this.male ? 35 : 43, -66, 4, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#f1ce8d"; ctx.beginPath(); ctx.ellipse(63, -42, 16, 10, .13, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#563c2b"; ctx.beginPath(); ctx.moveTo(75, -46); ctx.lineTo(80, -42); ctx.lineTo(73, -40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#241f1c"; ctx.beginPath(); ctx.ellipse(59, -54, 2.5, 2, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#6b4930"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(72, -37); ctx.quadraticCurveTo(62, -34, 57, -38); ctx.stroke();
    ctx.fillStyle = "#bd8242"; ctx.beginPath(); ctx.roundRect(-40, -22, 16, 25 - gait * .3, 5); ctx.roundRect(18, -21, 17, 25 + gait * .3, 5); ctx.fill();
    ctx.restore();
  }
}

class Elephant extends Animal {
  constructor(x, y, scale) {
    super(x, y, scale, 24); this.state = "walk"; this.stateDuration = rand(9, 15); this.hitRadius = 78 * scale;
  }
  update(dt, env) {
    const { season, weather, W } = env;
    this.phase += dt * (this.state === "drink" ? 1.3 : 3.2);
    this.stateTime += dt;
    if (this.stateTime > this.stateDuration) {
      this.stateTime = 0;
      if (this.state !== "walk") { this.state = "walk"; this.stateDuration = rand(8, 14); }
      else {
        const byWater = Math.abs(this.x - W * .67) < W * .16;
        if (byWater && Math.random() < (season.name === "dry" ? .8 : .62)) this.state = "drink";
        else this.state = Math.random() < .45 ? "trumpet" : "walk";
        this.stateDuration = this.state === "walk" ? rand(8, 12) : rand(2, 4.4);
      }
    }
    const pace = this.state === "drink" ? .12 : this.state === "trumpet" ? .55 : 1;
    this.x += this.baseSpeed * this.weatherFactor(weather) * (season.name === "wet" ? 1.14 : .83) * pace * this.groupAdjust(W, season) * dt;
    this.wrap(W);
  }
  stateLabel() { return this.state === "drink" ? "DRINKING" : this.state === "trumpet" ? "TRUMPETING" : "MIGRATING"; }
  draw(ctx) {
    this.drawShadow(ctx, 75);
    ctx.save(); ctx.translate(this.x, this.y + Math.sin(this.phase) * 1.5); ctx.scale(this.scale, this.scale);
    const gait = this.state === "drink" ? 0 : Math.sin(this.phase) * 6;
    ctx.strokeStyle = "#53615e"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-65, -68); ctx.quadraticCurveTo(-90, -63, -83, -30 + Math.sin(this.phase) * 5); ctx.stroke();
    ctx.fillStyle = "#586c68";
    for (const [lx, off] of [[-47, gait], [39, -gait]]) {
      ctx.beginPath(); ctx.roundRect(lx - 12, -52, 23, 54 + off * .35, 6); ctx.fill();
      ctx.fillStyle = "#c4c8b2"; for (let n = 0; n < 3; n++) { ctx.beginPath(); ctx.roundRect(lx - 10 + n * 7, -1 + off * .35, 5, 4, 2); ctx.fill(); } ctx.fillStyle = "#586c68";
    }
    ctx.fillStyle = "#657976"; ctx.beginPath(); ctx.ellipse(-15, -69, 75, 49, -.05, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#81908a"; ctx.beginPath(); ctx.ellipse(-29, -87, 48, 19, -.15, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#566c68"; ctx.beginPath(); ctx.ellipse(46, -72, 42, 39, .1, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#465c5b"; ctx.beginPath(); ctx.ellipse(17, -67, 30, 37, .25, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#b59182"; ctx.beginPath(); ctx.ellipse(16, -66, 19, 26, .23, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#6c807a"; ctx.beginPath(); ctx.ellipse(21, -72, 13, 19, .25, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#e8dfbc"; ctx.beginPath(); ctx.moveTo(71, -47); ctx.quadraticCurveTo(95, -42, 102, -65); ctx.quadraticCurveTo(87, -50, 69, -54); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#526765"; ctx.lineWidth = 21; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const trunkLift = this.state === "trumpet" ? -48 : this.state === "drink" ? 17 : Math.sin(this.phase * .7) * 7;
    ctx.beginPath(); ctx.moveTo(75, -71); ctx.bezierCurveTo(101, -56, 87, -31, 89, -17 + trunkLift); ctx.quadraticCurveTo(92, 4 + trunkLift, 108, -1 + trunkLift); ctx.stroke();
    ctx.strokeStyle = "#879b91"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(78, -69); ctx.quadraticCurveTo(96, -57, 90, -43); ctx.stroke();
    ctx.fillStyle = "#1f3434"; ctx.beginPath(); ctx.arc(67, -83, 2.6, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#f6ead0"; ctx.beginPath(); ctx.arc(68, -84, .85, 0, 6.28); ctx.fill();
    if (this.state === "drink") {
      ctx.fillStyle = "#a2d5cf";
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(107 + i * 4, -1 + i * 7 + Math.sin(this.phase * 2 + i) * 3, 2.8 - i * .5, 0, 6.28); ctx.fill(); }
    }
    ctx.fillStyle = "#637874"; ctx.beginPath(); ctx.roundRect(-56, -49, 25, 50 - gait * .3, 6); ctx.roundRect(26, -48, 25, 51 + gait * .3, 6); ctx.fill();
    ctx.restore();
  }
}

class Leopard extends Animal {
  constructor(x, y, scale, id) {
    super(x, y, scale, id === 0 ? 60 : 67); this.id = id; this.state = "prowl";
    this.stateDuration = rand(7, 12); this.hitRadius = 57 * scale; this.climbCooldown = rand(2, 7);
  }
  update(dt, env) {
    const { season, weather, W, climbTrees } = env;
    this.phase += dt * (this.state === "sprint" ? 11 : 7);
    this.stateTime += dt; this.climbCooldown = Math.max(0, this.climbCooldown - dt);
    if (this.state === "climb") {
      const progress = clamp(this.stateTime / this.stateDuration, 0, 1);
      this.climbOffset = Math.sin(progress * Math.PI) * 96;
      this.x += this.baseSpeed * .035 * dt;
      if (progress >= 1) { this.state = "prowl"; this.stateTime = 0; this.stateDuration = rand(7, 12); this.climbCooldown = rand(13, 22); this.climbOffset = 0; }
    } else {
      if (this.climbCooldown <= 0 && weather.type !== "tornado") {
        for (const treeX of climbTrees) {
          if (Math.abs(this.x - treeX) < 26 && Math.random() < (weather.type === "thunder" ? .004 : .025)) {
            this.state = "climb"; this.stateTime = 0; this.stateDuration = rand(3, 5); break;
          }
        }
      }
      if (this.state !== "climb" && this.stateTime > this.stateDuration) {
        this.stateTime = 0;
        this.state = this.state === "sprint" ? "prowl" : Math.random() < (season.name === "wet" ? .46 : .27) ? "sprint" : "prowl";
        this.stateDuration = this.state === "sprint" ? rand(2, 4) : rand(5, 11);
      }
      const stealth = weather.type === "thunder" || weather.type === "heavy" ? .75 : 1;
      const pace = this.state === "sprint" ? 1.7 : 1;
      this.x += this.baseSpeed * this.weatherFactor(weather) * (season.name === "wet" ? 1.28 : .86) * stealth * pace * dt;
    }
    this.wrap(W);
  }
  stateLabel() { return this.state === "climb" ? "CLIMBING" : this.state === "sprint" ? "DARTING" : "STALKING"; }
  draw(ctx) {
    this.drawShadow(ctx, 51);
    ctx.save(); ctx.translate(this.x, this.y - this.climbOffset - (this.state === "sprint" ? Math.abs(Math.sin(this.phase)) * 4 : 0)); ctx.scale(this.scale, this.scale);
    const gait = this.state === "climb" ? 5 : Math.sin(this.phase) * (this.state === "sprint" ? 13 : 7);
    ctx.strokeStyle = "#ad7533"; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-47, -36); ctx.bezierCurveTo(-78, -45, -84, -28, -91, -48 + Math.sin(this.phase * .65) * 7); ctx.stroke();
    ctx.fillStyle = "#493329"; ctx.beginPath(); ctx.ellipse(-91, -48 + Math.sin(this.phase * .65) * 7, 7, 4.5, -.4, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#ad7232";
    for (const [lx, off] of [[-33, gait], [28, -gait]]) {
      ctx.beginPath(); ctx.roundRect(lx - 6, -27, 12, 28 + off * .3, 4); ctx.fill();
    }
    ctx.fillStyle = "#d9a451"; ctx.beginPath(); ctx.ellipse(-7, -36, 52, 22, -.04, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#eed193"; ctx.beginPath(); ctx.ellipse(-6, -27, 43, 7, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#cf9443"; ctx.beginPath(); ctx.ellipse(42, -42, 20, 15, -.15, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.moveTo(30, -52); ctx.lineTo(32, -67); ctx.lineTo(42, -56); ctx.fill();
    ctx.beginPath(); ctx.moveTo(47, -54); ctx.lineTo(52, -66); ctx.lineTo(59, -49); ctx.fill();
    ctx.fillStyle = "#efcd88"; ctx.beginPath(); ctx.ellipse(54, -35, 14, 8, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#392b24"; ctx.beginPath(); ctx.arc(49, -45, 2.2, 0, 6.28); ctx.arc(66, -39, 2, 0, 6.28); ctx.fill();
    // Rosette clusters are drawn in local coordinates, so their pattern moves
    // with the cat without allocating sprites or canvases per frame.
    ctx.strokeStyle = "#5d3b29"; ctx.lineWidth = 2.5;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) {
      const sx = -45 + col * 13 + (row % 2) * 5, sy = -48 + row * 9;
      if ((sx * sx / 2700) + ((sy + 36) * (sy + 36) / 440) > 1) continue;
      ctx.beginPath(); ctx.arc(sx, sy, 2.2 + (col % 3) * .35, .2, 4.8); ctx.stroke();
    }
    ctx.fillStyle = "#bd853c"; ctx.beginPath(); ctx.roundRect(-39, -25, 12, 27 - gait * .3, 4); ctx.roundRect(20, -26, 12, 27 + gait * .3, 4); ctx.fill();
    ctx.restore();
  }
}

class Landscape {
  constructor() {
    const random = seeded(72814);
    this.grass = Array.from({ length: 220 }, () => ({ u: random(), y: 405 + random() * 295, h: 8 + random() * 25, lean: random() * 2 - 1, shade: random(), phase: random() * 6.28 }));
    this.stars = Array.from({ length: 65 }, () => ({ u: random(), v: random() * .46, size: .5 + random() * 1.2 }));
  }
  acacia(ctx, x, groundY, scale, season, time, near = false) {
    ctx.save(); ctx.translate(x, groundY); ctx.scale(scale, scale);
    const trunk = near ? "#473f31" : hexMix("#6c5b43", "#496358", season);
    const leaf = near ? hexMix("#4c5638", "#2d5a43", season) : hexMix("#69744d", "#4b7960", season);
    ctx.strokeStyle = trunk; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-6, -61, 6, -98, 1, -165); ctx.stroke();
    ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, -108); ctx.quadraticCurveTo(-50, -147, -90, -142); ctx.moveTo(0, -129); ctx.quadraticCurveTo(50, -160, 93, -147); ctx.stroke();
    ctx.fillStyle = leaf;
    for (const [cx, cy, rx, ry] of [[-75,-154,58,19],[-25,-167,73,24],[42,-166,71,23],[91,-150,53,17]]) {
      ctx.beginPath(); ctx.ellipse(cx, cy + Math.sin(time*.5 + cx) * 1.2, rx, ry, 0, 0, 6.28); ctx.fill();
    }
    ctx.fillStyle = near ? "#667249" : hexMix("#87905a", "#6c9a70", season);
    for (const [cx, cy, rx] of [[-63,-170,34],[9,-183,49],[68,-168,37]]) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, 6, 0, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }
  cloud(ctx, x, y, scale, dark, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    ctx.fillStyle = dark ? "#485c618c" : "#ffedc3b0";
    for (const [cx,cy,rx,ry] of [[-59,10,57,15],[-28,1,46,20],[16,-6,65,25],[67,8,56,16]]) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }
  drawBackground(ctx, W, season, weather, time) {
    const wet = season.mix, type = weather.type;
    const storm = type === "heavy" ? .44 : type === "thunder" ? .7 : type === "tornado" ? .52 : type === "rain" ? .22 : type === "snow" ? .24 : 0;
    let skyTop = hexMix(hexMix("#537879", "#4e8a99", wet), "#334b5b", storm);
    let skyMid = hexMix(hexMix("#dba976", "#a3c6bf", wet), "#64767d", storm);
    let skyBottom = hexMix(hexMix("#f4d099", "#dedbb8", wet), "#9ba8a4", storm);
    if (type === "snow") {
      skyTop = hexMix(skyTop, "#7895a9", .82);
      skyMid = hexMix(skyMid, "#bbced1", .83);
      skyBottom = hexMix(skyBottom, "#e9e8dc", .78);
    }
    const sky = ctx.createLinearGradient(0, 0, 0, 510);
    sky.addColorStop(0, skyTop); sky.addColorStop(.56, skyMid); sky.addColorStop(1, skyBottom);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 700);
    const sunX = W * .765, sunY = 161;
    if (type !== "thunder" && type !== "heavy" && type !== "tornado") {
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 215);
      sunGlow.addColorStop(0, "#fff5c075"); sunGlow.addColorStop(.38, "#fff0ae38"); sunGlow.addColorStop(1, "#fff1aa00");
      ctx.fillStyle = sunGlow; ctx.fillRect(sunX - 215, sunY - 215, 430, 430);
      ctx.globalAlpha = type === "snow" ? .42 : .88;
      ctx.fillStyle = "#fff0bd"; ctx.beginPath(); ctx.arc(sunX, sunY, 58, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#fff0cc16";
    for (const star of this.stars) { ctx.beginPath(); ctx.arc(star.u * W, star.v * 700, star.size, 0, 6.28); ctx.fill(); }
    const cloudShade = storm > .25;
    for (let i = 0; i < 5; i++) {
      const speed = 4 + i * 2 + (type === "tornado" ? 12 : 0);
      const x = ((W * (i * .27 - .08) + time * speed) % (W + 380)) - 160;
      this.cloud(ctx, x, 105 + (i % 3) * 51, .65 + i * .16, cloudShade, type === "sunny" ? .52 : .78);
    }
    if (storm > .2) for (let i = 0; i < 5; i++) this.cloud(ctx, W * (i * .25) - 90 + time * (i % 2 ? 4 : -3), 75 + i % 2 * 43, 1.6, true, storm * .8);
    // Mist and successive ridges give the large animals a believable scale.
    ctx.fillStyle = hexMix("#d2aa83", "#87a99f", wet); ctx.globalAlpha = .55;
    ctx.beginPath(); ctx.moveTo(0, 361); ctx.bezierCurveTo(W*.16, 316, W*.2, 374, W*.34, 334); ctx.bezierCurveTo(W*.5, 297, W*.6, 362, W*.75, 327); ctx.bezierCurveTo(W*.91, 297, W, 333, W, 330); ctx.lineTo(W, 480); ctx.lineTo(0, 480); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = hexMix("#9e916b", "#5d8a79", wet);
    ctx.beginPath(); ctx.moveTo(0, 402); ctx.bezierCurveTo(W*.13, 350, W*.24, 402, W*.37, 372); ctx.bezierCurveTo(W*.49, 343, W*.57, 405, W*.71, 365); ctx.bezierCurveTo(W*.83, 339, W*.93, 378, W, 356); ctx.lineTo(W, 480); ctx.lineTo(0, 480); ctx.fill();
    ctx.fillStyle = hexMix("#b2a06c", "#6b9b76", wet);
    ctx.beginPath(); ctx.moveTo(0, 440); ctx.quadraticCurveTo(W*.24, 397, W*.49, 430); ctx.quadraticCurveTo(W*.73, 391, W, 420); ctx.lineTo(W, 570); ctx.lineTo(0, 570); ctx.fill();
    const earth = ctx.createLinearGradient(0, 440, 0, 700);
    earth.addColorStop(0, hexMix("#c0ab6e", "#7fa477", wet));
    earth.addColorStop(.62, hexMix("#aa8950", "#658e61", wet));
    earth.addColorStop(1, hexMix("#775b3e", "#42694f", wet));
    ctx.fillStyle = earth; ctx.beginPath(); ctx.moveTo(0, 478); ctx.bezierCurveTo(W*.29, 447, W*.61, 466, W, 449); ctx.lineTo(W, 700); ctx.lineTo(0, 700); ctx.fill();
    ctx.fillStyle = "#f8e9b13b";
    ctx.beginPath(); ctx.moveTo(0, 508); ctx.bezierCurveTo(W*.25, 486, W*.44, 511, W*.68, 495); ctx.bezierCurveTo(W*.82, 485, W*.94, 485, W, 482); ctx.lineTo(W, 491); ctx.bezierCurveTo(W*.6, 523, W*.25, 499, 0, 519); ctx.fill();
    if (type === "snow") {
      ctx.fillStyle = "#e8eee3a8";
      ctx.beginPath(); ctx.moveTo(0, 473); ctx.bezierCurveTo(W*.22, 458, W*.5, 476, W*.72, 459); ctx.quadraticCurveTo(W*.88, 452, W, 467); ctx.lineTo(W, 483); ctx.bezierCurveTo(W*.63, 474, W*.31, 485, 0, 489); ctx.fill();
      ctx.fillStyle = "#eaf1e288";
      for (const [u,y,r] of [[.12,555,62],[.34,606,78],[.57,545,43],[.83,604,92],[.95,522,55]]) {
        ctx.beginPath(); ctx.ellipse(W*u, y, r, 8, 0, 0, 6.28); ctx.fill();
      }
    }
    this.acacia(ctx, W*.12, 451, .74, wet, time);
    this.acacia(ctx, W*.38, 425, .42, wet, time);
    this.acacia(ctx, W*.76, 455, .68, wet, time);
    this.acacia(ctx, W*.94, 479, 1.02, wet, time, true);
    this.drawWater(ctx, W, wet, type, time);
    this.drawGrass(ctx, W, wet, time, false);
    this.drawBirds(ctx, W, time, type);
  }
  drawWater(ctx, W, wet, type, time) {
    const rain = type === "rain" || type === "heavy" || type === "thunder";
    const width = Math.min(W * .19, 290) * (wet ? 1.18 : .86) * (rain ? 1.1 : 1);
    const x = W * .65, y = 602;
    ctx.fillStyle = hexMix("#7d6e4e", "#4c735b", wet);
    ctx.beginPath(); ctx.ellipse(x, y + 2, width + 18, 51, -.03, 0, 6.28); ctx.fill();
    const water = ctx.createLinearGradient(0, y - 43, 0, y + 38);
    water.addColorStop(0, hexMix("#90ada1", "#8abeb8", wet));
    water.addColorStop(1, hexMix("#4f746d", "#4d8c87", wet));
    ctx.fillStyle = water; ctx.beginPath(); ctx.ellipse(x, y, width, 39, -.03, 0, 6.28); ctx.fill();
    if (type === "snow") {
      ctx.fillStyle = "#dceeed8a";
      ctx.beginPath(); ctx.ellipse(x, y - 2, width * .92, 29, -.03, 0, 6.28); ctx.fill();
    }
    ctx.strokeStyle = "#e9e1b17d"; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const dx = (i - 3) * width * .25;
      const dy = Math.sin(i * 4.2 + time * 1.3) * 3;
      ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 12 + i % 3 * 7, 2.5, 0, .15, Math.PI * .9); ctx.stroke();
    }
    if (rain) {
      ctx.fillStyle = "#a8c4ba4d";
      for (const [px, py, rx] of [[W*.19,590,62],[W*.86,571,54],[W*.43,620,36]]) { ctx.beginPath(); ctx.ellipse(px, py, rx, 10, 0, 0, 6.28); ctx.fill(); }
    }
  }
  drawGrass(ctx, W, wet, time, foreground) {
    for (const blade of this.grass) {
      if (foreground ? blade.y < 615 : blade.y >= 615) continue;
      const x = blade.u * W, y = blade.y;
      const h = blade.h * (y < 500 ? .65 : y > 610 ? 1.3 : 1);
      const sw = Math.sin(time * 1.4 + blade.phase) * 3;
      ctx.strokeStyle = blade.shade > .6 ? hexMix("#e2c17896", "#aed29b9e", wet) : hexMix("#6f75467d", "#315d4b91", wet);
      ctx.lineWidth = blade.y > 610 ? 2.2 : 1.3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + blade.lean * 5 + sw, y - h*.6, x + blade.lean * 8 + sw, y - h); ctx.stroke();
      if (blade.shade > .89) {
        ctx.fillStyle = hexMix("#d4ad6999", "#90b985a8", wet);
        ctx.beginPath(); ctx.ellipse(x + blade.lean * 8 + sw, y - h, 2.6, 6, -.3, 0, 6.28); ctx.fill();
      }
    }
  }
  drawBirds(ctx, W, time, type) {
    if (type === "heavy" || type === "thunder" || type === "tornado") return;
    ctx.strokeStyle = "#53645b82"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const x = W*.49 + (i - 2)*22 + Math.sin(time*.3)*18, y = 247 + i%3*10;
      ctx.beginPath(); ctx.moveTo(x-7,y); ctx.quadraticCurveTo(x-3,y-5,x,y); ctx.quadraticCurveTo(x+4,y-5,x+8,y); ctx.stroke();
    }
  }
}

class SavannahApp {
  constructor() {
    this.canvas = document.getElementById("savannah");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.scene = document.querySelector(".scene");
    this.bus = new EventBus();
    this.season = new SeasonManager(this.bus);
    this.pool = new ParticlePool(800);
    this.weather = new WeatherManager(this.bus, this.pool);
    this.landscape = new Landscape();
    this.W = 1500; this.time = 0; this.last = 0; this.fps = 60; this.hudClock = 0;
    this.animals = [];
    this.buildWildlife();
    this.bindControls();
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.scene);
    } else window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => { this.last = 0; });
    requestAnimationFrame(time => this.frame(time));
  }
  buildWildlife() {
    const lionLead = new Lion(this.W*.32, 578, .92, true);
    const lionMate = new Lion(this.W*.19, 562, .78, false);
    lionMate.mate = lionLead; lionMate.gap = 155;
    const elephantLead = new Elephant(this.W*.68, 532, .88);
    const elephantMate = new Elephant(this.W*.54, 512, .76);
    elephantMate.mate = elephantLead; elephantMate.gap = 170;
    const leopardOne = new Leopard(this.W*.43, 495, .76, 0);
    const leopardTwo = new Leopard(this.W*.85, 540, .78, 1);
    this.animals = [lionLead, lionMate, elephantLead, elephantMate, leopardOne, leopardTwo];
    this.renderOrder = this.animals.slice();
  }
  bindControls() {
    const buttons = [...document.querySelectorAll("[data-weather]")];
    const seasonButton = document.getElementById("seasonButton");
    const announce = document.getElementById("announcement");
    const refresh = () => {
      for (const button of buttons) {
        const selected = button.dataset.weather === this.weather.type;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
        button.disabled = button.dataset.weather === "snow" && this.season.name === "wet";
      }
      const wet = this.season.name === "wet";
      document.getElementById("seasonLabel").textContent = wet ? "Wet season" : "Dry season";
      document.getElementById("seasonIcon").textContent = wet ? "≈" : "☀";
      seasonButton.setAttribute("aria-label", `Switch to ${wet ? "dry" : "wet"} season`);
      document.getElementById("sceneCondition").textContent = WEATHER[this.weather.type].label;
      document.getElementById("sceneStory").textContent = WEATHER[this.weather.type].story;
      document.body.classList.toggle("wet-season", wet);
    };
    for (const button of buttons) button.addEventListener("click", () => this.weather.set(button.dataset.weather, this.season));
    seasonButton.addEventListener("click", () => this.season.toggle());
    this.bus.on("weather", type => { refresh(); announce.textContent = `${WEATHER[type].label.toLowerCase()} over the savannah`; });
    this.bus.on("season", name => {
      if (name === "wet" && this.weather.type === "snow") this.weather.set("rain", this.season);
      refresh(); announce.textContent = `${name} season has begun`;
    });
    window.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.key.toLowerCase() === "s") this.season.toggle();
      const choice = ["sunny", "rain", "heavy", "snow", "thunder", "tornado"][Number(event.key) - 1];
      if (choice) this.weather.set(choice, this.season);
    });
    refresh();
  }
  resize() {
    const rect = this.scene.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const oldW = this.W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.W = rect.width / rect.height * WORLD_HEIGHT;
    if (oldW && this.animals) for (const animal of this.animals) animal.x *= this.W / oldW;
    if (this.weather.tornadoX !== null) this.weather.tornadoX *= this.W / oldW;
    this.ctx.setTransform(this.canvas.height / WORLD_HEIGHT, 0, 0, this.canvas.height / WORLD_HEIGHT, 0, 0);
  }
  frame(timestamp) {
    if (!this.last) this.last = timestamp;
    const dt = clamp((timestamp - this.last) / 1000, 0, .05);
    this.last = timestamp;
    this.time += dt;
    this.season.update(dt);
    if (!this.environment) this.environment = { W: this.W, season: this.season, weather: this.weather, climbTrees: [0, 0, 0] };
    const environment = this.environment;
    environment.W = this.W;
    environment.climbTrees[0] = this.W * .12;
    environment.climbTrees[1] = this.W * .76;
    environment.climbTrees[2] = this.W * .94;
    for (const animal of this.animals) animal.update(dt, environment);
    this.weather.update(dt, this.W, this.animals, this.season);
    this.draw();
    this.hudClock += dt;
    if (this.hudClock > .45) {
      this.fps = this.fps * .55 + (dt ? 1 / dt : 60) * .45;
      document.getElementById("fpsValue").textContent = String(Math.round(this.fps));
      document.getElementById("particleValue").textContent = String(this.pool.active.length);
      const remaining = Math.ceil(this.season.remaining);
      document.getElementById("seasonCountdown").textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
      this.hudClock = 0;
    }
    requestAnimationFrame(time => this.frame(time));
  }
  draw() {
    const ctx = this.ctx, W = this.W;
    this.landscape.drawBackground(ctx, W, this.season, this.weather, this.time);
    this.weather.drawTornado(ctx);
    this.renderOrder.sort((a,b) => (a.y - a.climbOffset) - (b.y - b.climbOffset));
    for (const animal of this.renderOrder) {
      animal.draw(ctx);
      // Draw a second view near a world edge. The animal itself is never
      // duplicated; its periodic image makes right-to-left travel seamless.
      const originalX = animal.x;
      if (originalX > W - 125) animal.x = originalX - W;
      else if (originalX < 125) animal.x = originalX + W;
      if (animal.x !== originalX) animal.draw(ctx);
      animal.x = originalX;
    }
    this.landscape.drawGrass(ctx, W, this.season.mix, this.time, true);
    this.weather.drawParticles(ctx);
    this.weather.drawLightning(ctx, W, this.animals);
    if (this.weather.type === "snow") {
      ctx.fillStyle = "#e7f1e531";
      ctx.beginPath(); ctx.moveTo(0, 655); ctx.quadraticCurveTo(W*.45, 634, W, 661); ctx.lineTo(W, 700); ctx.lineTo(0, 700); ctx.fill();
    }
    const vignette = ctx.createRadialGradient(W*.5, 340, W*.2, W*.5, 350, W*.76);
    vignette.addColorStop(0, "#161c1600"); vignette.addColorStop(1, "#24221942");
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, 700);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("savannah");
  if (canvas.getContext) new SavannahApp();
});
