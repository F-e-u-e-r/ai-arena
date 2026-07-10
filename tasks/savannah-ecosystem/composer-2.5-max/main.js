const WEATHERS = ['sunny', 'rain', 'heavy', 'snow', 'storm', 'tornado'];
const WEATHER_LABELS = {
  sunny: '☀', rain: '🌧', heavy: '⛈', snow: '❄', storm: '⚡', tornado: '🌪',
};
const SEASON_CYCLE_SEC = 60;

// --- Object pool: reuse particle objects instead of allocating each frame ---
class ObjectPool {
  constructor(factory, initial = 64) {
    this.factory = factory;
    this.free = [];
    this.active = [];
    for (let i = 0; i < initial; i++) this.free.push(factory());
  }

  acquire() {
    const obj = this.free.pop() || this.factory();
    this.active.push(obj);
    return obj;
  }

  release(obj) {
    const i = this.active.indexOf(obj);
    if (i >= 0) this.active.splice(i, 1);
    obj.alive = false;
    this.free.push(obj);
  }

  clear() {
    while (this.active.length) this.release(this.active[0]);
  }

  get count() { return this.active.length; }
}

class ParticleSystem {
  constructor() {
    this.pool = new ObjectPool(() => ({
      alive: false, x: 0, y: 0, vx: 0, vy: 0, size: 2, life: 0, type: 'rain',
    }), 200);
  }

  spawnRain(x, y, heavy) {
    const p = this.pool.acquire();
    p.alive = true;
    p.x = x; p.y = y;
    p.vx = (Math.random() - 0.5) * (heavy ? 40 : 15);
    p.vy = 180 + Math.random() * (heavy ? 220 : 80);
    p.size = heavy ? 2.5 : 1.5;
    p.life = 3 + Math.random() * 2;
    p.type = 'rain';
  }

  spawnSnow(x, y) {
    const p = this.pool.acquire();
    p.alive = true;
    p.x = x; p.y = y;
    p.vx = (Math.random() - 0.5) * 20;
    p.vy = 30 + Math.random() * 25;
    p.size = 2 + Math.random() * 2;
    p.life = 8 + Math.random() * 4;
    p.type = 'snow';
  }

  spawnDebris(x, y, angle, speed) {
    const p = this.pool.acquire();
    p.alive = true;
    p.x = x; p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - 40;
    p.size = 3 + Math.random() * 3;
    p.life = 1.5 + Math.random();
    p.type = 'debris';
  }

  update(dt, w, h) {
    for (let i = this.pool.active.length - 1; i >= 0; i--) {
      const p = this.pool.active[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'snow') p.x += Math.sin(p.y * 0.05) * 15 * dt;
      if (p.life <= 0 || p.y > h + 10 || p.x < -20 || p.x > w + 20) {
        this.pool.release(p);
      }
    }
  }

  draw(ctx) {
    for (const p of this.pool.active) {
      ctx.globalAlpha = Math.min(1, p.life);
      if (p.type === 'rain') {
        ctx.strokeStyle = 'rgba(180,210,255,0.7)';
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.type === 'snow') {
        ctx.fillStyle = '#f0f8ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#6a5030';
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
      }
      ctx.globalAlpha = 1;
    }
  }

  get count() { return this.pool.count; }
}

class SeasonManager {
  constructor() {
    this.season = 'dry';
    this.blend = 1;
    this.timer = 0;
    this.manual = false;
  }

  update(dt) {
    if (!this.manual) {
      this.timer += dt;
      if (this.timer >= SEASON_CYCLE_SEC) {
        this.timer = 0;
        this.season = this.season === 'dry' ? 'wet' : 'dry';
        this.blend = 0;
      }
    }
    this.blend = Math.min(1, this.blend + dt * 0.8);
  }

  setSeason(s) {
    this.season = s;
    this.manual = true;
    this.blend = 0;
  }

  // Dry = warm gold tones; wet = lush green, higher animal activity
  getPalette() {
    const dry = { sky: [0.55, 0.72, 0.95], grass: [0.62, 0.55, 0.28], hill: [0.45, 0.38, 0.22] };
    const wet = { sky: [0.42, 0.65, 0.88], grass: [0.35, 0.62, 0.32], hill: [0.28, 0.48, 0.25] };
    const t = this.season === 'wet' ? this.blend : 1 - this.blend;
    const src = this.season === 'wet' ? wet : dry;
    const dst = this.season === 'wet' ? dry : wet;
    return {
      sky: lerpColor(dst.sky, src.sky, t),
      grass: lerpColor(dst.grass, src.grass, t),
      hill: lerpColor(dst.hill, src.hill, t),
      activity: this.season === 'wet' ? 1.25 : 0.85,
      cluster: this.season === 'dry' ? 1.3 : 0.9,
    };
  }
}

class WeatherManager {
  constructor(particles) {
    this.weather = 'sunny';
    this.particles = particles;
    this.spawnAcc = 0;
    this.puddles = 0;
    this.lightningTimer = 2;
    this.lightningFlash = 0;
    this.lightningBolt = null;
    this.tornado = { x: 0, y: 0, active: false, angle: 0 };
    this.transition = 1;
    this.prevWeather = 'sunny';
  }

  setWeather(w) {
    if (w === this.weather) return;
    this.prevWeather = this.weather;
    this.weather = w;
    this.transition = 0;
    this.particles.clear();
    this.puddles = 0;
    this.tornado.active = w === 'tornado';
    if (this.tornado.active) {
      this.tornado.x = innerWidth * 0.3;
      this.tornado.y = innerHeight * 0.55;
    }
  }

  update(dt, w, h, animals, season) {
    this.transition = Math.min(1, this.transition + dt * 2);
    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4);

    if (this.weather === 'rain' || this.weather === 'heavy') {
      this.spawnAcc += dt;
      const rate = this.weather === 'heavy' ? 0.008 : 0.02;
      while (this.spawnAcc > rate) {
        this.spawnAcc -= rate;
        this.particles.spawnRain(Math.random() * w, -5, this.weather === 'heavy');
      }
      this.puddles = Math.min(1, this.puddles + dt * 0.15);
    } else if (this.weather === 'snow' && season.season === 'dry') {
      this.spawnAcc += dt;
      while (this.spawnAcc > 0.04) {
        this.spawnAcc -= 0.04;
        this.particles.spawnSnow(Math.random() * w, -5);
      }
    } else {
      this.puddles = Math.max(0, this.puddles - dt * 0.2);
    }

    if (this.weather === 'storm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 2.5 + Math.random() * 3;
        this.lightningBolt = computeSafeLightning(w, h, animals);
        if (this.lightningBolt) this.lightningFlash = 1;
      }
    }

    if (this.tornado.active) {
      const target = findNearestAnimal(this.tornado.x, this.tornado.y, animals);
      if (target) {
        const dx = target.x - this.tornado.x;
        const dy = target.y - this.tornado.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = 35;
        this.tornado.x += (dx / dist) * speed * dt;
        this.tornado.y += (dy / dist) * speed * dt * 0.3;
      }
      this.tornado.angle += dt * 8;
      if (Math.random() < dt * 12) {
        const a = this.tornado.angle + Math.random() * Math.PI;
        this.particles.spawnDebris(this.tornado.x, this.tornado.y, a, 60 + Math.random() * 80);
      }
    }

    this.particles.update(dt, w, h);
  }

  draw(ctx, w, h) {
    if (this.puddles > 0.01 && (this.weather === 'rain' || this.weather === 'heavy')) {
      ctx.fillStyle = `rgba(60,90,120,${this.puddles * 0.25})`;
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
    }
    this.particles.draw(ctx);

    if (this.lightningFlash > 0 && this.lightningBolt) {
      ctx.globalAlpha = this.lightningFlash * 0.9;
      ctx.strokeStyle = '#e8f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.lightningBolt.x1, this.lightningBolt.y1);
      let x = this.lightningBolt.x1;
      let y = this.lightningBolt.y1;
      for (const seg of this.lightningBolt.segs) {
        x += seg.dx;
        y += seg.dy;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = this.lightningFlash * 0.35;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    if (this.tornado.active) {
      const { x, y, angle } = this.tornado;
      for (let i = 0; i < 6; i++) {
        const a = angle + i * 1.1;
        const r = 12 + i * 8;
        ctx.strokeStyle = `rgba(80,70,60,${0.5 - i * 0.06})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y + i * 6, r * 0.4, r, a, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

// Lightning safe zone: pick cloud-to-ground path that stays clear of all animal bounding circles
function computeSafeLightning(w, h, animals) {
  const margin = 45;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x1 = margin + Math.random() * (w - margin * 2);
    const y1 = 0;
    const segs = [];
    let x = x1;
    let y = y1;
    let valid = true;
    while (y < h * 0.75) {
      const dx = (Math.random() - 0.5) * 40;
      const dy = 25 + Math.random() * 35;
      segs.push({ dx, dy });
      x += dx;
      y += dy;
      for (const a of animals) {
        const r = a.radius + 28;
        if (Math.hypot(x - a.x, y - a.y) < r) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
    }
    if (valid && segs.length > 2) return { x1, y1, segs };
  }
  return null;
}

function findNearestAnimal(tx, ty, animals) {
  let best = null;
  let bestD = Infinity;
  for (const a of animals) {
    const d = Math.hypot(a.x - tx, a.y - ty);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

function lerpColor(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

function rgb(c) {
  return `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
}

// --- Wildlife base ---
class Animal {
  constructor(type, x, y, lane) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.lane = lane;
    this.vx = 0;
    this.state = 'walk';
    this.stateTimer = 0;
    this.anim = Math.random() * 10;
    this.radius = type === 'elephant' ? 28 : type === 'lion' ? 18 : 14;
    this.mood = 'calm';
  }

  wrap(w) {
    if (this.x > w + this.radius + 20) {
      this.x = -this.radius - 20;
    }
  }
}

class Lion extends Animal {
  constructor(x, y, lane, groupId) {
    super('lion', x, y, lane);
    this.groupId = groupId;
    this.baseSpeed = 28;
  }

  update(dt, w, season, weather, lions) {
    const pals = lions.filter(l => l.groupId === this.groupId);
    const centerX = pals.reduce((s, l) => s + l.x, 0) / pals.length;
    const cluster = season.cluster;

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = Math.random() < 0.15 ? 'rest' : 'walk';
      this.stateTimer = 2 + Math.random() * 4;
    }

    const weatherMod = weather.weather === 'rain' ? 0.7 : weather.weather === 'storm' ? 0.5 : 1;
    const speed = this.baseSpeed * season.getPalette().activity * weatherMod;

    if (this.state === 'rest') {
      this.vx = speed * 0.15;
      this.mood = 'resting';
    } else {
      this.vx = speed * (0.8 + Math.random() * 0.1);
      this.mood = 'patrol';
      this.x += (centerX - this.x) * 0.02 * cluster * dt;
    }

    this.x += this.vx * dt;
    this.anim += dt * (this.state === 'rest' ? 2 : 6);
    this.wrap(w);
  }

  draw(ctx) {
    const bob = Math.sin(this.anim) * 2;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.fillStyle = '#c89030';
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a07020';
    ctx.beginPath();
    ctx.arc(14, -4, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#402010';
    ctx.beginPath();
    ctx.arc(18, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a07020';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(10 * i, -10);
      ctx.lineTo(14 * i, -18);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '8px sans-serif';
    ctx.fillText(this.mood, -12, -22);
    ctx.restore();
  }
}

class Elephant extends Animal {
  constructor(x, y, lane) {
    super('elephant', x, y, lane);
    this.baseSpeed = 18;
  }

  update(dt, w, season, weather) {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.state = Math.random() < 0.2 ? 'drink' : 'walk';
      this.stateTimer = 3 + Math.random() * 5;
    }

    const mod = season.getPalette().activity * (weather.weather === 'heavy' ? 0.6 : 1);
    if (this.state === 'drink') {
      this.vx = this.baseSpeed * 0.1 * mod;
      this.mood = 'drinking';
    } else {
      this.vx = this.baseSpeed * mod;
      this.mood = 'herd';
    }
    this.x += this.vx * dt;
    this.anim += dt * 4;
    this.wrap(w);
  }

  draw(ctx) {
    const trunkUp = this.state === 'drink' ? Math.sin(this.anim) * 8 - 5 : Math.sin(this.anim) * 3;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#707880';
    ctx.beginPath();
    ctx.ellipse(0, 2, 32, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(22, -2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#606870';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(28, 4);
    ctx.quadraticCurveTo(38, 4 + trunkUp, 34, 14 + trunkUp);
    ctx.stroke();
    ctx.fillStyle = '#505860';
    ctx.fillRect(-18, -8, 8, 14);
    ctx.fillRect(-8, -8, 8, 14);
    ctx.restore();
  }
}

class Leopard extends Animal {
  constructor(x, y, lane) {
    super('leopard', x, y, lane);
    this.baseSpeed = 55;
    this.climbTree = null;
  }

  update(dt, w, h, season, weather, trees) {
    this.stateTimer -= dt;
    if (this.state === 'climb') {
      this.y -= 25 * dt;
      this.vx = 8;
      if (this.y < (this.climbTree?.y ?? h * 0.5) - 40) {
        this.state = 'walk';
        this.y = this.lane;
        this.climbTree = null;
      }
    } else {
      if (this.stateTimer <= 0 && trees.length && Math.random() < 0.08) {
        this.state = 'climb';
        this.climbTree = trees[Math.floor(Math.random() * trees.length)];
        this.x = this.climbTree.x;
        this.stateTimer = 2;
        this.mood = 'climbing';
      } else if (this.stateTimer <= 0) {
        this.state = 'stalk';
        this.stateTimer = 1.5 + Math.random() * 2;
      }

      const mod = season.getPalette().activity * (weather.weather === 'sunny' ? 1.2 : 0.9);
      this.vx = this.baseSpeed * mod * (this.state === 'stalk' ? 1.1 : 0.7);
      this.x += this.vx * dt;
      this.mood = this.state === 'climb' ? 'climbing' : 'stalking';
    }
    this.anim += dt * 10;
    this.wrap(w);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#d0a040';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#302010';
    for (let i = 0; i < 4; i++) ctx.fillRect(-10 + i * 6, -2, 2, 2);
    ctx.fillStyle = '#c09030';
    ctx.beginPath();
    ctx.arc(12, -3, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- Parallax background ---
function drawBackground(ctx, w, h, season, weather, time) {
  const pal = season.getPalette();
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, rgb(pal.sky));
  sky.addColorStop(1, rgb(pal.sky.map(v => v * 0.85)));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const cloudAlpha = weather.weather === 'sunny' ? 0.5 : 0.8;
  ctx.fillStyle = `rgba(255,255,255,${cloudAlpha})`;
  for (let i = 0; i < 4; i++) {
    const cx = ((time * 8 + i * 120) % (w + 100)) - 50;
    const cy = 30 + i * 18;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 40, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const hillY = h * 0.55;
  ctx.fillStyle = rgb(pal.hill.map(v => v * 0.7));
  ctx.beginPath();
  ctx.moveTo(0, hillY);
  for (let x = 0; x <= w; x += 40) {
    ctx.lineTo(x, hillY - 20 - Math.sin(x * 0.008 + 1) * 15);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  const grassY = h * 0.72;
  const grassGrad = ctx.createLinearGradient(0, grassY, 0, h);
  grassGrad.addColorStop(0, rgb(pal.grass));
  grassGrad.addColorStop(1, rgb(pal.grass.map(v => v * 0.75)));
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, grassY, w, h - grassY);

  ctx.strokeStyle = rgb(pal.grass.map(v => v * 1.1));
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 8) {
    const gx = i + Math.sin(time * 3 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(gx, grassY + 5);
    ctx.lineTo(gx + 2, grassY - 5 - Math.random() * 5);
    ctx.stroke();
  }
}

function drawTrees(ctx, trees) {
  for (const t of trees) {
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(t.x - 4, t.y - 50, 8, 50);
    ctx.fillStyle = '#2a6028';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 55, 18, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Main ---
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');

const particles = new ParticleSystem();
const seasonMgr = new SeasonManager();
const weatherMgr = new WeatherManager(particles);

let animals = [];
let trees = [];
let w = 0;
let h = 0;

function initScene() {
  w = canvas.width = canvas.clientWidth;
  h = canvas.height = canvas.clientHeight;

  animals = [
    new Lion(-80, h * 0.78, h * 0.78, 0),
    new Lion(-200, h * 0.78, h * 0.78, 0),
    new Lion(-350, h * 0.8, h * 0.8, 1),
    new Elephant(-120, h * 0.82, h * 0.82),
    new Elephant(-300, h * 0.82, h * 0.82),
    new Leopard(-50, h * 0.76, h * 0.76),
    new Leopard(-400, h * 0.77, h * 0.77),
  ];

  trees = [];
  for (let i = 0; i < 5; i++) {
    trees.push({ x: 80 + i * (w / 5), y: h * 0.72 });
  }
}

const drawer = document.getElementById('drawer');
const ctrlToggle = document.getElementById('ctrl-toggle');
const weatherBtns = document.getElementById('weather-btns');
const seasonBtns = document.getElementById('season-btns');
const debugEl = document.getElementById('debug');

ctrlToggle.addEventListener('click', () => drawer.classList.toggle('collapsed'));

for (const wKey of WEATHERS) {
  const btn = document.createElement('button');
  btn.textContent = WEATHER_LABELS[wKey];
  btn.title = wKey;
  btn.addEventListener('click', () => {
    weatherMgr.setWeather(wKey);
    weatherBtns.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.title === wKey));
  });
  weatherBtns.appendChild(btn);
}
weatherBtns.querySelector('[title="sunny"]').classList.add('active');

for (const [key, label] of [['dry', 'Dry'], ['wet', 'Wet']]) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.addEventListener('click', () => {
    seasonMgr.setSeason(key);
    seasonBtns.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.textContent === label));
  });
  seasonBtns.appendChild(btn);
}
seasonBtns.querySelector('button').classList.add('active');

const weatherKeys = { 1: 'sunny', 2: 'rain', 3: 'heavy', 4: 'snow', 5: 'storm', 6: 'tornado' };
addEventListener('keydown', (e) => {
  const wKey = weatherKeys[e.key];
  if (wKey) {
    weatherMgr.setWeather(wKey);
    weatherBtns.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.title === wKey));
  }
  if (e.key === 'd') seasonMgr.setSeason('dry');
  if (e.key === 'w') seasonMgr.setSeason('wet');
});

addEventListener('resize', initScene);
initScene();

let last = performance.now();
let frames = 0;
let fpsAcc = 0;
let elapsed = 0;

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;

  seasonMgr.update(dt);
  weatherMgr.update(dt, w, h, animals, seasonMgr);

  const lions = animals.filter(a => a.type === 'lion');
  for (const a of animals) {
    if (a instanceof Lion) a.update(dt, w, seasonMgr, weatherMgr, lions);
    else if (a instanceof Elephant) a.update(dt, w, seasonMgr, weatherMgr);
    else if (a instanceof Leopard) a.update(dt, w, h, seasonMgr, weatherMgr, trees);
  }

  drawBackground(ctx, w, h, seasonMgr, weatherMgr, elapsed);
  drawTrees(ctx, trees);
  for (const a of animals) a.draw(ctx);
  weatherMgr.draw(ctx, w, h);

  frames++;
  fpsAcc += dt;
  if (fpsAcc >= 0.5) {
    debugEl.textContent = `FPS ${Math.round(frames / fpsAcc)} · particles ${particles.count} · ${seasonMgr.season}`;
    frames = 0;
    fpsAcc = 0;
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);