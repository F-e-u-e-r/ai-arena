/* Native Canvas 2D only: the simulation is intentionally self-contained. */
const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d');
const VW = 1000, VH = 625, GROUND = 472;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const palettes = {
  dry: { sky: [214, 158, 105], horizon: [239, 194, 123], ground: [175, 128, 61], grass: [106, 113, 43], accent: [243, 179, 79] },
  wet: { sky: [112, 159, 159], horizon: [191, 194, 135], ground: [76, 118, 62], grass: [46, 102, 60], accent: [182, 220, 128] }
};

class ParticlePool {
  constructor(size = 520) { this.free = []; this.active = []; for (let i = 0; i < size; i++) this.free.push({}); }
  acquire() { const p = this.free.pop(); if (!p) return null; this.active.push(p); return p; }
  release(p) { const i = this.active.indexOf(p); if (i !== -1) this.active.splice(i, 1); this.free.push(p); }
  clear() { while (this.active.length) this.free.push(this.active.pop()); }
  update(dt, fn) { for (let i = this.active.length - 1; i >= 0; i--) { const p = this.active[i]; p.life -= dt; if (p.life <= 0) this.release(p); else fn(p, dt); } }
}

class WeatherManager {
  constructor() { this.pool = new ParticlePool(); this.weather = 'sunny'; this.spawnClock = 0; this.flash = 0; this.safeX = 500; this.tornado = { x: -100, strength: 0 }; }
  setWeather(name) { this.weather = name; this.pool.clear(); this.spawnClock = 0; this.flash = 0; this.tornado.strength = name === 'tornado' ? 1 : 0; }
  chooseSafeLightning(animals) {
    // Score candidates by distance to every live animal, so the bolt always has a moving safety corridor.
    let best = 500, bestScore = -1; for (let x = 45; x < 956; x += 23) { const score = Math.min(...animals.map(a => Math.hypot(x - a.x, GROUND - a.y))); if (score > bestScore) { bestScore = score; best = x; } } this.safeX = best;
  }
  spawn(x, y, vx, vy, life, kind, size) { const p = this.pool.acquire(); if (!p) return; Object.assign(p, { x, y, vx, vy, life, maxLife: life, kind, size, rot: rand(0, TAU), seed: Math.random() * 10 }); }
  update(dt, animals, time) {
    const storm = this.weather === 'rain' || this.weather === 'heavy-rain' || this.weather === 'thunderstorm'; const rate = this.weather === 'heavy-rain' ? 150 : this.weather === 'rain' ? 72 : storm ? 86 : this.weather === 'snow' ? 34 : this.weather === 'tornado' ? 26 : 9;
    this.spawnClock += dt * rate; while (this.spawnClock > 1) { this.spawnClock--; if (this.weather === 'snow') this.spawn(rand(-20, 1020), -10, rand(-16, 16), rand(30, 65), 12, 'snow', rand(2, 5)); else if (storm) this.spawn(rand(-20, 1020), -10, rand(-15, 15), rand(360, 520), 2.4, 'rain', rand(5, 12)); else if (this.weather === 'tornado') this.spawn(rand(0, 1000), rand(250, 460), rand(-5, 5), rand(-15, 15), 2, 'dust', rand(2, 5)); else this.spawn(rand(0, 1000), rand(360, 500), rand(-5, 5), rand(-12, -4), 2.5, 'dust', rand(1, 3)); }
    if (this.weather === 'thunderstorm' && Math.random() < dt * .08) { this.chooseSafeLightning(animals); this.flash = .28; }
    this.flash = Math.max(0, this.flash - dt);
    this.pool.update(dt, (p, step) => { p.x += p.vx * step; p.y += p.vy * step; p.rot += step * 2; if (p.kind === 'snow') p.x += Math.sin(time * 1.4 + p.seed) * step * 22; if (p.kind === 'dust') p.vy -= step * 4; if (p.y > GROUND && p.kind === 'rain') p.life = 0; });
    if (this.weather === 'tornado') { const target = animals.reduce((near, a) => Math.abs(a.x - this.tornado.x) < Math.abs(near.x - this.tornado.x) ? a : near, animals[0]); this.tornado.x = mix(this.tornado.x, target.x, dt * .13); this.tornado.x = clamp(this.tornado.x, 65, 935); }
  }
  draw(ctx, time) {
    ctx.save(); if (this.weather === 'heavy-rain' || this.weather === 'rain' || this.weather === 'thunderstorm') { ctx.strokeStyle = this.weather === 'heavy-rain' ? '#b4d2d499' : '#d7e4dc88'; ctx.lineWidth = this.weather === 'heavy-rain' ? 2 : 1; }
    for (const p of this.pool.active) { ctx.save(); ctx.translate(p.x, p.y); if (p.kind === 'rain') { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-p.vx * .018, 12); ctx.stroke(); } else if (p.kind === 'snow') { ctx.fillStyle = '#f2f7eadd'; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill(); } else { ctx.fillStyle = p.kind === 'dust' ? '#d1b57955' : '#ffffff33'; ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2); } ctx.restore(); }
    if (this.weather === 'tornado') { const x = this.tornado.x; const grad = ctx.createLinearGradient(x, 265, x, 480); grad.addColorStop(0, '#c6ad8b22'); grad.addColorStop(1, '#6e604e99'); ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(x - 13, 265); ctx.bezierCurveTo(x - 35, 330, x - 52, 395, x - 70, 473); ctx.lineTo(x + 70, 473); ctx.bezierCurveTo(x + 47, 395, x + 30, 330, x + 13, 265); ctx.closePath(); ctx.fill(); for (let i = 0; i < 9; i++) { ctx.strokeStyle = '#ead3a744'; ctx.beginPath(); ctx.arc(x, 470 - i * 20, 14 + i * 5, 0, Math.PI * 1.55); ctx.stroke(); } }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,248,216,${this.flash * .3})`; ctx.fillRect(0, 0, VW, VH); ctx.strokeStyle = '#fff8d8'; ctx.lineWidth = 3; ctx.shadowColor = '#fff4a4'; ctx.shadowBlur = 18; ctx.beginPath(); let y = 30; ctx.moveTo(this.safeX, y); for (let i = 0; i < 7; i++) { y += rand(24, 42); ctx.lineTo(this.safeX + rand(-30, 30), y); } ctx.stroke(); ctx.shadowBlur = 0; }
    ctx.restore();
  }
}

class Animal {
  constructor(kind, x, y, scale = 1) { this.kind = kind; this.x = x; this.y = y; this.baseY = y; this.scale = scale; this.speed = kind === 'lion' ? 20 : kind === 'elephant' ? 12 : 34; this.phase = Math.random() * TAU; this.state = 'moving'; this.mood = 'CALM'; }
  update(dt, time, season, weather) { const weatherFactor = weather === 'sunny' ? 1 : weather === 'rain' ? 1.05 : weather === 'heavy-rain' ? .68 : weather === 'snow' ? .48 : weather === 'tornado' ? .8 : .76; const seasonFactor = season === 'wet' ? 1.15 : .86; this.x += this.speed * weatherFactor * seasonFactor * dt; if (this.x > VW + 90) this.x = -90; const stride = Math.sin(time * (this.kind === 'elephant' ? 3 : 5) + this.phase); this.state = weather === 'heavy-rain' ? 'SHELTERING' : stride > .7 ? 'PAUSING' : 'MOVING'; this.mood = season === 'wet' ? 'ACTIVE' : this.state === 'SHELTERING' ? 'HUSHED' : 'CALM'; }
  draw(ctx, time) { ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.scale, this.scale); this.render(ctx, time); ctx.restore(); }
  render() {}
}

class Lion extends Animal {
  constructor(x, y, scale) { super('lion', x, y, scale); }
  render(ctx, time) { const leg = Math.sin(time * 5 + this.phase) * 4; ctx.strokeStyle = '#56342d'; ctx.lineWidth = 5; ctx.lineCap = 'round'; for (const lx of [-17, 12]) { ctx.beginPath(); ctx.moveTo(lx, 10); ctx.lineTo(lx + leg * (lx < 0 ? 1 : -1), 29); ctx.stroke(); } ctx.fillStyle = '#b8733f'; ctx.beginPath(); ctx.ellipse(0, 0, 30, 16, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#7b432f'; ctx.beginPath(); ctx.arc(-24, -5, 16, 0, TAU); ctx.fill(); ctx.fillStyle = '#cc9151'; ctx.beginPath(); ctx.arc(-25, -5, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a2020'; ctx.beginPath(); ctx.arc(-29, -7, 2, 0, TAU); ctx.fill(); ctx.strokeStyle = '#56342d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(25, -6); ctx.quadraticCurveTo(42, -15, 43 + Math.sin(time * 2) * 3, -24); ctx.stroke(); this.badge(ctx); }
  badge(ctx) { ctx.fillStyle = '#fff4d855'; ctx.font = '7px sans-serif'; ctx.fillText(this.mood, -25, 42); }
}

class Elephant extends Animal {
  constructor(x, y, scale) { super('elephant', x, y, scale); }
  render(ctx, time) { const lift = Math.max(0, Math.sin(time * 1.4 + this.phase)) * 7; const leg = Math.sin(time * 3 + this.phase) * 3; ctx.strokeStyle = '#4c4d43'; ctx.lineWidth = 7; ctx.lineCap = 'round'; for (const lx of [-22, -5, 10, 24]) { ctx.beginPath(); ctx.moveTo(lx, 15); ctx.lineTo(lx + leg, 38 - (lx % 2 ? leg : 0)); ctx.stroke(); } ctx.fillStyle = '#70766b'; ctx.beginPath(); ctx.ellipse(0, 0, 38, 23, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(31, -8, 19, 0, TAU); ctx.fill(); ctx.fillStyle = '#9b9d89'; ctx.beginPath(); ctx.ellipse(41, -12, 13, 20, -.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#70766b'; ctx.beginPath(); ctx.moveTo(45, 0); ctx.quadraticCurveTo(55, 10 + lift, 44, 24 + lift); ctx.strokeStyle = '#70766b'; ctx.lineWidth = 8; ctx.stroke(); ctx.fillStyle = '#202725'; ctx.beginPath(); ctx.arc(35, -13, 2.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff4d855'; ctx.font = '7px sans-serif'; ctx.fillText(this.state === 'PAUSING' ? 'DRINKING' : this.mood, -22, 52); }
}

class Leopard extends Animal {
  constructor(x, y, scale) { super('leopard', x, y, scale); this.climb = false; }
  update(dt, time, season, weather) { super.update(dt, time, season, weather); this.climb = Math.sin(time * .35 + this.phase) > .78; this.y = this.baseY - (this.climb ? Math.abs(Math.sin(time * 2 + this.phase)) * 65 : 0); }
  render(ctx, time) { const leg = Math.sin(time * 8 + this.phase) * 6; ctx.strokeStyle = '#282b25'; ctx.lineWidth = 4; for (const lx of [-15, 12]) { ctx.beginPath(); ctx.moveTo(lx, 3); ctx.lineTo(lx + leg, 20); ctx.stroke(); } ctx.fillStyle = '#c18c47'; ctx.beginPath(); ctx.ellipse(0, -2, 28, 11, -.08, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-26, -7, 10, 0, TAU); ctx.fill(); ctx.fillStyle = '#322c24'; for (const p of [[-7,-7], [3,1], [-17,3], [9,-5], [-27,-9]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, TAU); ctx.fill(); } ctx.beginPath(); ctx.moveTo(-32, -16); ctx.lineTo(-37, -26); ctx.lineTo(-25, -18); ctx.fill(); ctx.strokeStyle = '#c18c47'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(23, -4); ctx.quadraticCurveTo(43, -20, 40, -34); ctx.stroke(); ctx.fillStyle = '#fff4d877'; ctx.font = '7px sans-serif'; ctx.fillText(this.climb ? 'CLIMBING' : 'STEALTH', -22, 34); }
}

class SavannahScene {
  constructor() { this.animals = [new Lion(-60, 441, 1.05), new Lion(150, 430, .88), new Elephant(-220, 421, 1.08), new Elephant(300, 422, .92), new Leopard(-400, 445, .82), new Leopard(560, 443, .74)]; this.weather = new WeatherManager(); this.season = 'dry'; this.seasonMix = 0; this.seasonClock = 0; this.time = 0; this.clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 190 + 30, y: rand(70, 160), s: rand(.7, 1.4) })); }
  setSeason(season) { this.season = season; }
  update(dt) { this.time += dt; this.seasonClock += dt; if (this.seasonClock > 60) { this.seasonClock = 0; this.setSeason(this.season === 'dry' ? 'wet' : 'dry'); updateSeasonUI(this.season); } this.seasonMix = mix(this.seasonMix, this.season === 'wet' ? 1 : 0, 1 - Math.pow(.0005, dt)); for (const a of this.animals) a.update(dt, this.time, this.season, this.weather.weather); this.weather.update(dt, this.animals, this.time); }
  palette() { const a = palettes.dry, b = palettes.wet, t = this.seasonMix; return Object.fromEntries(Object.keys(a).map(k => [k, a[k].map((v, i) => Math.round(mix(v, b[k][i], t)))])); }
  draw() { const p = this.palette(); ctx.save(); ctx.clearRect(0, 0, VW, VH); this.drawSky(p); this.drawLand(p); for (const a of this.animals) a.draw(ctx, this.time); this.weather.draw(ctx, this.time); ctx.restore(); }
  drawSky(p) { const sky = ctx.createLinearGradient(0, 0, 0, GROUND); sky.addColorStop(0, rgba(p.sky)); sky.addColorStop(.72, rgba(p.horizon)); sky.addColorStop(1, '#e7bd78'); ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, GROUND); ctx.fillStyle = '#fff3bcaa'; ctx.beginPath(); ctx.arc(785, 100 + Math.sin(this.time * .08) * 15, 38, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff7d922'; ctx.beginPath(); ctx.arc(785, 100 + Math.sin(this.time * .08) * 15, 55, 0, TAU); ctx.fill(); for (const c of this.clouds) { const x = (c.x + this.time * (this.season === 'wet' ? 4 : 2)) % 1120 - 80; ctx.fillStyle = this.season === 'wet' ? '#9db5b28c' : '#fff0ce70'; ctx.beginPath(); ctx.ellipse(x, c.y, 52 * c.s, 14 * c.s, 0, 0, TAU); ctx.ellipse(x + 30 * c.s, c.y + 4, 32 * c.s, 13 * c.s, 0, 0, TAU); ctx.fill(); } }
  drawLand(p) { ctx.fillStyle = '#607347'; ctx.beginPath(); ctx.moveTo(0, 363); for (let x = 0; x <= VW; x += 25) ctx.lineTo(x, 362 + Math.sin(x * .012) * 30 + Math.sin(x * .04) * 9); ctx.lineTo(VW, GROUND); ctx.lineTo(0, GROUND); ctx.fill(); ctx.fillStyle = '#5b743e'; ctx.beginPath(); ctx.moveTo(0, 412); for (let x = 0; x <= VW; x += 26) ctx.lineTo(x, 413 + Math.sin(x * .018) * 22); ctx.lineTo(VW, VH); ctx.lineTo(0, VH); ctx.fill(); ctx.fillStyle = rgba(p.ground); ctx.fillRect(0, GROUND, VW, VH - GROUND); for (let i = 0; i < 30; i++) { const x = (i * 67 + 23) % VW; const y = GROUND + (i * 29) % 120; ctx.strokeStyle = rgba(p.grass, .5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x - 3, y); ctx.moveTo(x, y + 14); ctx.lineTo(x + 4, y + 1); ctx.stroke(); } this.drawAcacia(145, 332, 1.05); this.drawAcacia(870, 357, .78); this.drawAcacia(730, 388, .55); }
  drawAcacia(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.strokeStyle = '#4a4230'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 130); ctx.lineTo(8, 35); ctx.lineTo(-14, 2); ctx.moveTo(7, 42); ctx.lineTo(45, 8); ctx.stroke(); ctx.fillStyle = '#364b35'; for (const [dx, dy, rx] of [[-30, 0, 45], [11, -5, 55], [47, 2, 35], [10, -21, 34]]) { ctx.beginPath(); ctx.ellipse(dx, dy, rx, 15, 0, 0, TAU); ctx.fill(); } ctx.restore(); }
}

const scene = new SavannahScene();
let dpr = 1;
function resize() { dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; }
function updateSeasonUI(season) { const label = season === 'wet' ? 'WET SEASON' : 'DRY SEASON'; document.querySelector('#seasonReadout').textContent = label; document.querySelector('#seasonButton').firstChild.textContent = `${label} `; }
document.querySelectorAll('.weather').forEach(button => button.addEventListener('click', () => { scene.weather.setWeather(button.dataset.weather); document.querySelectorAll('.weather').forEach(b => b.classList.toggle('active', b === button)); document.querySelector('#weatherReadout').textContent = button.dataset.weather.replace('-', ' ').toUpperCase(); }));
document.querySelector('#seasonButton').addEventListener('click', () => { scene.setSeason(scene.season === 'dry' ? 'wet' : 'dry'); scene.seasonClock = 0; updateSeasonUI(scene.season); });
addEventListener('resize', resize); resize();
let previous = performance.now();
function frame(now) { requestAnimationFrame(frame); const dt = Math.min((now - previous) / 1000, .05); previous = now; scene.update(dt); ctx.setTransform(dpr * innerWidth / VW, 0, 0, dpr * innerHeight / VH, 0, 0); scene.draw(); document.querySelector('#animalReadout').textContent = `06 ANIMALS · ${scene.weather.pool.active.length} PARTICLES`; }
requestAnimationFrame(frame);
