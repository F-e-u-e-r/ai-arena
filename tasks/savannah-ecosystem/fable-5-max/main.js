'use strict';
/* =====================================================================
   非洲大草原生態系統 (Canvas 2D, 無任何外部函式庫)

   架構總覽
   ---------------------------------------------------------------
   SeasonManager   乾季/濕季狀態機：60 秒自動輪轉、3 秒平滑過渡、
                   輸出色盤混合係數與行為倍率（速度/群聚/動作頻率）。
   WeatherManager  六種天氣的狀態機：發射粒子、天空明暗、閃電排程
                   （含安全區演算法）、龍捲風實體、積水與積雪。
   ParticleSystem  依粒子種類分池的 Object Pool（雨/雪/水花/碎屑/塵土），
                   swap-with-last 回收，逐型別批次繪製。
   Animal 家族     Lion / Elephant / Leopard，各自的狀態機與繪製；
                   獅群與象群共享「錨點」以形成群體移動。
   Scenery         視差背景：天空、遠山、金合歡樹、水塘、草叢、前景草。
   App             requestAnimationFrame + deltaTime 主迴圈、resize、HUD。

   座標系統
   ---------------------------------------------------------------
   動物在「未包裹座標」xU 上持續向右前進；顯示座標
   displayX = mod(xU, span) - margin，span = 畫面寬 + 兩側緩衝，
   因此右側離開後會無縫從左側重新進場，群體錨點跨越邊界也不會斷裂。
===================================================================== */

// ------------------------------------------------ 基礎小工具
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

// 決定性的偽隨機（場景佈局在 resize 後仍保持一致）
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = Math.random; // 行為用隨機（不需決定性）

// 顏色以 [r,g,b] 陣列表示；mix3 將 a、b 依 t 混合寫入 out（避免配置）
function mix3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
function css(c, alpha) {
  return alpha === undefined
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
}
// 依光量縮放顏色（天氣越暗 light 越低）
function shade(c, f) {
  return `rgb(${(c[0] * f) | 0},${(c[1] * f) | 0},${(c[2] * f) | 0})`;
}

// ------------------------------------------------ 色彩腳本（美術方向）
const PAL = {
  dry: {
    skyTop: [126, 192, 232], skyBot: [246, 227, 183],
    grassFar: [196, 168, 94], grassNear: [219, 189, 116],
    mtnFar: [190, 160, 143], mtnNear: [168, 143, 88],
    canopy: [110, 122, 58], fgGrass: [118, 94, 44],
    water: [130, 165, 175],
  },
  wet: {
    skyTop: [78, 158, 214], skyBot: [214, 232, 205],
    grassFar: [128, 168, 80], grassNear: [156, 194, 100],
    mtnFar: [128, 146, 158], mtnNear: [108, 144, 84],
    canopy: [74, 122, 50], fgGrass: [62, 100, 42],
    water: [96, 150, 170],
  },
  stormSky: [64, 72, 86],       // 壞天氣時天空往這個深灰藍靠攏
  snowTint: [226, 234, 244],    // 積雪時地景往冷白靠攏
  tornadoTint: [160, 146, 108], // 龍捲風的土黃色調
  sun: [255, 240, 190],
  trunk: [104, 78, 52],
};

// 天氣定義：dark=天空變暗程度、cloud=雲量、wind=風（px/s，畫面尺度 1 時）
const WEATHERS = {
  sunny:   { dark: 0.00, cloud: 0.18, wind: 12,  speedMul: 1.00, label: '☀️ 晴' },
  rain:    { dark: 0.34, cloud: 0.70, wind: 42,  speedMul: 0.92, label: '🌦️ 雨' },
  heavy:   { dark: 0.55, cloud: 0.92, wind: 95,  speedMul: 0.80, label: '🌧️ 豪雨' },
  snow:    { dark: 0.22, cloud: 0.60, wind: 20,  speedMul: 0.62, label: '❄️ 雪' },
  storm:   { dark: 0.68, cloud: 1.00, wind: 75,  speedMul: 0.85, label: '⛈️ 雷暴' },
  tornado: { dark: 0.58, cloud: 0.95, wind: 130, speedMul: 1.00, label: '🌪️ 龍捲風' },
};

// =====================================================================
// SeasonManager — 乾季 / 濕季
// =====================================================================
class SeasonManager {
  constructor() {
    this.season = 'dry';   // 目前季節
    this.t = 0;            // 色盤混合係數 0=乾季 1=濕季（平滑趨近 target）
    this.target = 0;
    this.AUTO_PERIOD = 60; // 每 60 秒自動輪轉
    this.timer = this.AUTO_PERIOD;
    this.onChange = null;  // (season, isAuto) => void
  }
  toggle(isAuto) {
    this.season = this.season === 'dry' ? 'wet' : 'dry';
    this.target = this.season === 'wet' ? 1 : 0;
    this.timer = this.AUTO_PERIOD;
    if (this.onChange) this.onChange(this.season, !!isAuto);
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) this.toggle(true);
    // 3 秒左右完成季節色彩過渡
    const dir = Math.sign(this.target - this.t);
    if (dir !== 0) this.t = clamp(this.t + dir * dt / 3, 0, 1);
  }
  // 行為倍率：濕季動物更活躍、乾季更趨向群聚
  get speedMul()  { return lerp(0.92, 1.18, this.t); }
  get actionMul() { return lerp(0.75, 1.30, this.t); } // 動作（喝水/舉鼻/休息切換）頻率
  get cohesion()  { return lerp(0.72, 1.15, this.t); } // 群體間距（乾季縮小 = 更群聚）
  get restBias()  { return lerp(1.5, 0.7, this.t); }   // 乾季更常休息
}

// =====================================================================
// ParticleSystem — 依型別分池的 Object Pool
// 每個池是固定長度的物件陣列，count 之前為活躍粒子；
// 回收採 swap-with-last（O(1)），繪製時逐池批次設定樣式。
// =====================================================================
class Pool {
  constructor(cap) {
    this.items = [];
    for (let i = 0; i < cap; i++) {
      this.items.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, a: 0, b: 0, c: 0 });
    }
    this.count = 0;
  }
  spawn() {
    if (this.count >= this.items.length) return null; // 池滿：放棄本次生成
    const p = this.items[this.count++];
    p.age = 0;
    return p;
  }
  kill(i) { // 與最後一個活躍粒子交換後縮短
    const last = --this.count;
    const t = this.items[i];
    this.items[i] = this.items[last];
    this.items[last] = t;
  }
}

class ParticleSystem {
  constructor() {
    this.rain = new Pool(1500);
    this.snow = new Pool(520);
    this.splash = new Pool(360);  // 雨滴落地漣漪 / 水塘漣漪
    this.debris = new Pool(220);  // 龍捲風捲起的草屑
    this.dust = new Pool(260);    // 塵土 / 雷擊煙塵
    this.scale = 1;               // FPS 不足時自動調降生成量
  }
  get active() {
    return this.rain.count + this.snow.count + this.splash.count +
           this.debris.count + this.dust.count;
  }
  get capacity() {
    return this.rain.items.length + this.snow.items.length + this.splash.items.length +
           this.debris.items.length + this.dust.items.length;
  }

  // ---- 生成 ----
  emitRain(env, ratePerSec, dt, speed) {
    const n = ratePerSec * dt * this.scale * clamp(env.W / 900, 0.35, 1.3);
    const whole = Math.floor(n) + (R() < n % 1 ? 1 : 0);
    for (let i = 0; i < whole; i++) {
      const p = this.rain.spawn();
      if (!p) break;
      p.x = R() * (env.W + 300) - 150;
      p.y = -20 - R() * 40;
      p.vy = speed * env.su * (0.85 + R() * 0.3);
      p.vx = env.wind * 2.2;
      p.life = 9; // 由落地高度決定死亡，life 僅是保險
      p.a = env.H * (0.58 + R() * 0.38); // 目標落地 y（散布在草原帶）
    }
  }
  emitSnow(env, ratePerSec, dt) {
    const n = ratePerSec * dt * this.scale * clamp(env.W / 900, 0.35, 1.3);
    const whole = Math.floor(n) + (R() < n % 1 ? 1 : 0);
    for (let i = 0; i < whole; i++) {
      const p = this.snow.spawn();
      if (!p) break;
      p.x = R() * (env.W + 200) - 100;
      p.y = -10 - R() * 30;
      p.vy = (34 + R() * 40) * env.su;
      p.vx = env.wind * 0.6;
      p.a = env.H * (0.55 + R() * 0.42); // 落地 y
      p.b = R() * TAU;                   // 飄移相位
      p.c = 1 + R() * 1.6;               // 大小
      p.life = 30;
    }
  }
  emitSplash(x, y, big) {
    const p = this.splash.spawn();
    if (!p) return;
    p.x = x; p.y = y;
    p.life = big ? 0.55 : 0.34;
    p.c = big ? 1.6 : 1;
  }
  emitDebris(x, y, tornado) {
    const p = this.debris.spawn();
    if (!p) return;
    p.x = x; p.y = y;
    p.a = R() * TAU;            // 繞龍捲風的角度
    p.b = 10 + R() * 55;        // 半徑
    p.c = R() < 0.5 ? 0 : 1;    // 顏色（草屑/土屑）
    p.vy = (46 + R() * 70);     // 上升速度
    p.life = 2.6;
    p.vx = tornado ? 1 : 0;     // 1 = 依附龍捲風運動
  }
  emitDust(x, y, spread, up) {
    const p = this.dust.spawn();
    if (!p) return;
    p.x = x + (R() - 0.5) * spread;
    p.y = y + (R() - 0.5) * 6;
    p.vx = (R() - 0.5) * 30;
    p.vy = -(10 + R() * (up || 26));
    p.life = 0.7 + R() * 0.8;
    p.c = 1 + R() * 2.4;
  }

  // ---- 更新 ----
  update(dt, env, tornado) {
    const rain = this.rain;
    for (let i = rain.count - 1; i >= 0; i--) {
      const p = rain.items[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt;
      if (p.y >= p.a || p.age > p.life) {
        if (p.y >= p.a && R() < 0.12) this.emitSplash(p.x, p.a, false);
        rain.kill(i);
      }
    }
    const snow = this.snow;
    for (let i = snow.count - 1; i >= 0; i--) {
      const p = snow.items[i];
      p.b += dt * 2;
      p.x += (p.vx + Math.sin(p.b) * 16) * dt;
      p.y += p.vy * dt; p.age += dt;
      if (p.y >= p.a || p.age > p.life) snow.kill(i);
    }
    const splash = this.splash;
    for (let i = splash.count - 1; i >= 0; i--) {
      const p = splash.items[i];
      p.age += dt;
      if (p.age > p.life) splash.kill(i);
    }
    const debris = this.debris;
    for (let i = debris.count - 1; i >= 0; i--) {
      const p = debris.items[i];
      p.age += dt;
      // 龍捲風碎屑：繞著漏斗軸心螺旋上升
      if (p.vx === 1 && tornado && tornado.active) {
        p.a += dt * 7;
        p.b = Math.min(70, p.b + dt * 14); // 越升越高、甩得越開
        p.y -= p.vy * env.su * dt;
        p.x = tornado.x + Math.cos(p.a) * p.b * env.su * (0.35 + 0.65 * (1 - (p.y - env.H * 0.1) / (env.H * 0.7)));
      } else {
        p.y -= p.vy * env.su * dt * 0.4;
        p.x += env.wind * dt;
      }
      if (p.age > p.life || p.y < env.H * 0.08) debris.kill(i);
    }
    const dust = this.dust;
    for (let i = dust.count - 1; i >= 0; i--) {
      const p = dust.items[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= (1 - dt * 1.5);
      p.age += dt;
      if (p.age > p.life) dust.kill(i);
    }
  }

  // ---- 繪製（逐池批次） ----
  draw(ctx, env) {
    // 雨：單一 path 批次畫斜線
    if (this.rain.count) {
      ctx.strokeStyle = 'rgba(200,225,245,0.5)';
      ctx.lineWidth = Math.max(1, env.su);
      ctx.beginPath();
      for (let i = 0; i < this.rain.count; i++) {
        const p = this.rain.items[i];
        const len = p.vy * 0.024;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - len);
      }
      ctx.stroke();
    }
    // 水花漣漪：擴張的半橢圓（隨擴張淡出）
    if (this.splash.count) {
      ctx.strokeStyle = 'rgba(215,235,250,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < this.splash.count; i++) {
        const p = this.splash.items[i];
        const k = p.age / p.life;
        const r = (1.5 + k * 6.5) * p.c * env.su;
        ctx.moveTo(p.x + r, p.y);
        ctx.ellipse(p.x, p.y, r, r * 0.3, 0, 0, TAU);
      }
      ctx.stroke();
    }
    // 雪
    if (this.snow.count) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      for (let i = 0; i < this.snow.count; i++) {
        const p = this.snow.items[i];
        const r = p.c * env.su;
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, TAU);
      }
      ctx.fill();
    }
    // 碎屑（兩色批次）
    if (this.debris.count) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? 'rgba(150,132,64,0.85)' : 'rgba(96,116,48,0.85)';
        ctx.beginPath();
        for (let i = 0; i < this.debris.count; i++) {
          const p = this.debris.items[i];
          if (p.c !== pass) continue;
          const s = 2.4 * env.su;
          ctx.rect(p.x - s / 2, p.y - s / 2, s * (1 + (i % 3) * 0.4), s * 0.7);
        }
        ctx.fill();
      }
    }
    // 塵土
    if (this.dust.count) {
      for (let i = 0; i < this.dust.count; i++) {
        const p = this.dust.items[i];
        const k = 1 - p.age / p.life;
        ctx.fillStyle = `rgba(168,150,110,${0.3 * k})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.c * env.su * (1 + p.age * 2), 0, TAU);
        ctx.fill();
      }
    }
  }
}

// =====================================================================
// Tornado — 追逐最近的動物，但速度比動物慢，永遠追不上
// =====================================================================
class Tornado {
  constructor() {
    this.active = false;
    this.x = 0;
    this.lift = 1;      // 1=完全升空(隱形) 0=著地
    this.bands = [];    // 每節漏斗的平滑 x（頂部延遲擺動）
    this.N = 14;
  }
  activate(env) {
    this.active = true;
    this.x = env.W * 0.5;
    this.bands = new Array(this.N).fill(this.x);
  }
  update(dt, env, animals, particles) {
    if (!this.active) return;
    // 進場 / 退場：改變天氣時漏斗上升消散，舊粒子自然回收
    const targetLift = (env.weatherKey === 'tornado') ? 0 : 1;
    this.lift += (targetLift - this.lift) * dt * 1.6;
    if (targetLift === 1 && this.lift > 0.97) { this.active = false; return; }

    // 追逐演算法：鎖定 displayX 最近的動物，以低於動物步速的速度逼近。
    // 速度上限 14*su < 大象步速 20*su，因此永遠構成威脅但不會命中。
    let nearest = null, best = 1e9;
    for (const a of animals) {
      const d = Math.abs(a.displayX - this.x);
      if (d < best) { best = d; nearest = a; }
    }
    if (nearest) {
      // 每秒最多 14*su px，低於最慢的大象步速（20*su）→ 永遠追不上
      const maxV = 14 * env.su;
      this.x += clamp(nearest.displayX - this.x, -maxV, maxV) * dt;
    }
    this.x = clamp(this.x, env.W * 0.06, env.W * 0.94);

    // 漏斗各節以高度遞減的速度跟隨 → 頂部拖曳出鞭甩感
    for (let i = 0; i < this.N; i++) {
      const follow = 6 * (1 - (i / this.N) * 0.8);
      this.bands[i] += (this.x - this.bands[i]) * clamp(follow * dt, 0, 1);
    }
    // 捲起碎屑與底部塵土
    if (this.lift < 0.5) {
      if (R() < dt * 26) particles.emitDebris(this.x, env.H * 0.78, true);
      if (R() < dt * 18) particles.emitDust(this.x, env.H * 0.79, 60 * env.su, 40);
    }
  }
  draw(ctx, env) {
    if (!this.active) return;
    const H = env.H, su = env.su;
    const topY = H * 0.10, baseY = H * 0.785;
    const liftOff = this.lift * (baseY - topY);
    ctx.save();
    ctx.globalAlpha = 1 - this.lift * 0.85;
    // 先畫連續的漏斗剪影（左右緣連成一體），再疊旋轉節
    const edgeL = [], edgeR = [];
    const geo = [];
    for (let i = 0; i < this.N; i++) {
      const k = i / (this.N - 1);              // 0=頂 1=底
      const y = lerp(topY, baseY, k) - liftOff * (1 - k * 0.4);
      const w = lerp(92, 20, Math.pow(k, 0.72)) * su;
      const sway = Math.sin(env.t * 2.2 + i * 0.55) * (1 - k) * 12 * su;
      const x = this.bands[i] + sway;
      geo.push([x, y, w]);
      edgeL.push([x - w, y]);
      edgeR.push([x + w, y]);
    }
    ctx.fillStyle = 'rgba(122,116,104,0.55)';
    ctx.beginPath();
    ctx.moveTo(edgeL[0][0], edgeL[0][1]);
    for (const p of edgeL) ctx.lineTo(p[0], p[1]);
    for (let i = edgeR.length - 1; i >= 0; i--) ctx.lineTo(edgeR[i][0], edgeR[i][1]);
    ctx.closePath();
    ctx.fill();
    // 疊上略亮的旋轉節，做出氣旋質感
    for (let i = this.N - 1; i >= 0; i--) {
      const [x, y, w] = geo[i];
      const k = i / (this.N - 1);
      const g = 140 - k * 30;
      ctx.fillStyle = `rgba(${g + 22},${g + 16},${g + 4},0.5)`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.34 + 4, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235,228,204,0.22)';
      ctx.lineWidth = 2 * su;
      const a0 = (env.t * 5 + i * 1.3) % TAU;
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.85, (w * 0.34 + 4) * 0.8, 0, a0, a0 + 1);
      ctx.stroke();
    }
    // 底部揚塵
    if (this.lift < 0.6) {
      const bx = geo[this.N - 1][0];
      ctx.fillStyle = 'rgba(150,132,96,0.4)';
      ctx.beginPath();
      ctx.ellipse(bx, baseY + 4 * su, 42 * su, 10 * su, 0, 0, TAU);
      ctx.ellipse(bx, baseY + 2 * su, 24 * su, 7 * su, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

// =====================================================================
// WeatherManager — 天氣狀態機 + 閃電 + 積水 / 積雪
// =====================================================================
class WeatherManager {
  constructor(particles) {
    this.particles = particles;
    this.current = 'sunny';
    this.prev = 'sunny';
    this.blend = 1;             // prev→current 的過渡（1.2 秒）
    this.tornado = new Tornado();
    // 閃電
    this.nextStrike = 2;
    this.bolt = null;           // {pts, branch, age, life, x, yG}
    this.flash = 0;             // 全畫面閃光
    this.skyFlicker = 0;        // 遠處閃電微光
    this.shake = 0;
    this.scorch = null;         // 雷擊點餘燼 {x,y,age}
    // 積水（固定水窪槽位，隨雨勢成長、放晴蒸發）
    this.puddles = [];
    // 積雪 0..1
    this.snowLevel = 0;
    this.onScare = null;        // 雷擊時通知動物受驚
  }
  layoutPuddles(env, rand) {
    this.puddles = [];
    for (let i = 0; i < 6; i++) {
      this.puddles.push({
        x: env.W * (0.08 + rand() * 0.84),
        y: env.H * (0.66 + rand() * 0.26),
        rx: (16 + rand() * 26),
        level: this.puddles[i] ? this.puddles[i].level : 0,
      });
    }
  }
  set(key, env) {
    if (key === this.current) return;
    this.prev = this.current;
    this.current = key;
    this.blend = 0;
    if (key === 'tornado') this.tornado.activate(env);
  }
  // 對外暴露的混合純量
  mixed(prop) {
    return lerp(WEATHERS[this.prev][prop], WEATHERS[this.current][prop], this.blend);
  }
  update(dt, env, animals) {
    this.blend = clamp(this.blend + dt / 1.2, 0, 1);
    const cur = this.current, k = this.blend;
    const p = this.particles;

    // ---- 粒子發射（舊天氣隨 blend 淡出，粒子自然死亡回收） ----
    const rainRate = (cur === 'rain' ? 300 : cur === 'heavy' ? 720 : cur === 'storm' ? 520 : 0) * k
      + (this.prev === 'rain' ? 300 : this.prev === 'heavy' ? 720 : this.prev === 'storm' ? 520 : 0) * (1 - k);
    if (rainRate > 1) p.emitRain(env, rainRate, dt, cur === 'heavy' || cur === 'storm' ? 640 : 520);
    const snowRate = (cur === 'snow' ? 95 : 0) * k + (this.prev === 'snow' ? 95 : 0) * (1 - k);
    if (snowRate > 1) p.emitSnow(env, snowRate, dt);

    // ---- 積水 ----
    const raining = rainRate > 40;
    for (const pd of this.puddles) {
      pd.level = clamp(pd.level + (raining ? dt * (rainRate / 700) * 0.4 : -dt * 0.05), 0, 1);
      if (raining && pd.level > 0.25 && R() < dt * 1.3) {
        p.emitSplash(pd.x + (R() - 0.5) * pd.rx * env.su, pd.y, false);
      }
    }
    // ---- 積雪 ----
    const snowing = snowRate > 10;
    this.snowLevel = clamp(this.snowLevel + (snowing ? dt / 14 : -dt / 9), 0, 1);

    // ---- 閃電（僅雷暴） ----
    if (this.bolt) {
      this.bolt.age += dt;
      if (this.bolt.age > this.bolt.life) this.bolt = null;
    }
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.skyFlicker = Math.max(0, this.skyFlicker - dt * 3);
    if (this.scorch) {
      this.scorch.age += dt;
      if (this.scorch.age > 2) this.scorch = null;
    }
    if (cur === 'storm' && k > 0.5) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 1.6 + R() * 4.2;
        if (R() < 0.3) this.skyFlicker = 0.5 + R() * 0.4; // 遠雷：只有天空微光
        else this.strike(env, animals);
      }
    }

    // ---- 龍捲風 ----
    this.tornado.update(dt, env, animals, p);
  }

  /* 閃電安全區演算法：
     1. 將每隻動物投影到 x 軸，展開成區間 [displayX - r, displayX + r]，
        r = 動物半身長 × 2.5 + 固定安全邊距（確保視覺上也離得夠遠）。
     2. 區間排序後合併，取畫面內側 [6%W, 94%W] 的補集 → 安全區段。
     3. 依區段長度加權隨機取一點作為落雷 x；若無安全區段則放棄本次落雷。
     落雷當下即時計算（而非預先排程），因此動物移動不會造成誤擊。 */
  strike(env, animals) {
    const margin = 26 * env.su;
    const ivs = animals
      .map(a => [a.displayX - a.halfLen * 2.5 - margin, a.displayX + a.halfLen * 2.5 + margin])
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of ivs) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    }
    const lo = env.W * 0.06, hi = env.W * 0.94;
    const safe = [];
    let cursor = lo;
    for (const [a, b] of merged) {
      if (a > cursor) safe.push([cursor, Math.min(a, hi)]);
      cursor = Math.max(cursor, b);
      if (cursor >= hi) break;
    }
    if (cursor < hi) safe.push([cursor, hi]);
    const usable = safe.filter(s => s[1] - s[0] > 30 * env.su);
    if (!usable.length) return; // 沒有安全落點 → 這次打在遠方（僅閃光）
    let total = 0;
    for (const s of usable) total += s[1] - s[0];
    let pick = R() * total, x = usable[0][0];
    for (const s of usable) {
      const w = s[1] - s[0];
      if (pick <= w) { x = s[0] + pick; break; }
      pick -= w;
    }
    // 生成鋸齒狀主幹 + 一條分枝
    const yG = env.H * (0.68 + R() * 0.2);
    const y0 = env.H * 0.06;
    const pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const wob = (R() - 0.5) * env.W * 0.05 * (1 - Math.abs(t - 0.5));
      pts.push([x + wob * (i === n ? 0.2 : 1), lerp(y0, yG, t)]);
    }
    pts[n][0] = x;
    const bi = 3 + (R() * 3 | 0);
    const branch = [[...pts[bi]]];
    for (let i = 1; i <= 3; i++) {
      branch.push([branch[i - 1][0] + (R() - 0.2) * 30 * env.su, branch[i - 1][1] + 26 * env.su]);
    }
    this.bolt = { pts, branch, age: 0, life: 0.38, x, yG };
    this.flash = 0.75;
    this.shake = 1;
    this.scorch = { x, y: yG, age: 0 };
    if (this.onScare) this.onScare(x);
  }

  drawPuddles(ctx, env) {
    for (const pd of this.puddles) {
      if (pd.level < 0.03) continue;
      const rx = pd.rx * env.su * (0.4 + 0.6 * pd.level);
      ctx.fillStyle = css(env.pal.water, 0.34 + 0.3 * pd.level);
      ctx.beginPath();
      ctx.ellipse(pd.x, pd.y, rx, rx * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.beginPath();
      ctx.ellipse(pd.x - rx * 0.2, pd.y - rx * 0.06, rx * 0.5, rx * 0.11, 0, 0, TAU);
      ctx.fill();
    }
  }
  drawBolt(ctx, env) {
    if (this.scorch) {
      const k = 1 - this.scorch.age / 2;
      ctx.fillStyle = `rgba(255,180,80,${0.25 * k})`;
      ctx.beginPath();
      ctx.ellipse(this.scorch.x, this.scorch.y, 18 * env.su * (1 + this.scorch.age), 5 * env.su, 0, 0, TAU);
      ctx.fill();
    }
    if (!this.bolt) return;
    const b = this.bolt;
    const k = 1 - b.age / b.life;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? `rgba(150,190,255,${0.4 * k})` : `rgba(240,248,255,${0.95 * k})`;
      ctx.lineWidth = (pass === 0 ? 7 : 2.2) * env.su;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(b.pts[0][0], b.pts[0][1]);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.branch[0][0], b.branch[0][1]);
      for (let i = 1; i < b.branch.length; i++) ctx.lineTo(b.branch[i][0], b.branch[i][1]);
      ctx.lineWidth *= 0.6;
      ctx.stroke();
    }
    // 落點光暈
    ctx.fillStyle = `rgba(255,255,230,${0.5 * k})`;
    ctx.beginPath();
    ctx.arc(b.x, b.yG, 10 * env.su * (1 + b.age * 3), 0, TAU);
    ctx.fill();
  }
}

// =====================================================================
// 動物基底
// =====================================================================
let ANIMAL_SEQ = 1;
class Animal {
  constructor(xU, laneF, sizeUnits) {
    this.id = ANIMAL_SEQ++;
    this.xU = xU;            // 未包裹座標（持續遞增）
    this.laneF = laneF;      // 0..1 深度（決定 y 與縮放）
    this.sizeUnits = sizeUnits;
    this.phase = R() * TAU;  // 步態相位
    this.state = 'walk';
    this.stateT = 0;
    this.speed = 0;
    this.displayX = 0;
    this.y = 0;
    this.u = 1;              // 每 px 的單位縮放（draw 用）
    this.halfLen = 30;
    this.mood = '';
    this.startle = 0;
    this.panic = 1;
    this.seed = R() * 1000;
  }
  // 由子類提供 baseSpeed 與 update 行為
  common(dt, env) {
    const span = env.span;
    this.displayX = ((this.xU % span) + span) % span - env.margin;
    this.y = env.bandY(this.laneF);
    this.u = (0.55 + this.laneF * 0.6) * env.su * this.sizeUnits;
    this.halfLen = 34 * this.u;
    this.startle = Math.max(0, this.startle - dt);
    // 龍捲風接近 → 恐慌加速
    this.panic = 1;
    if (env.tornado.active && env.tornado.lift < 0.5) {
      const d = Math.abs(this.displayX - env.tornado.x);
      const range = 240 * env.su;
      if (d < range) this.panic = lerp(2.1, 1, d / range);
    }
    this.phase += dt * (this.speed / Math.max(8, 11 * this.u));
  }
  envSpeed(env) { // 季節 × 天氣 × 恐慌 綜合行為倍率
    return env.season.speedMul * env.weatherSpeedMul * this.panic *
      (this.startle > 0 ? 1.5 : 1);
  }
  drawMood(ctx, env) {
    if (!this.mood || env.W < 460) return;
    ctx.font = `${Math.max(10, 12 * this.u) | 0}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(this.mood, this.displayX + 10 * this.u, this.y - 56 * this.u);
  }
  shadow(ctx, w, light) {
    ctx.fillStyle = `rgba(28,36,18,${0.16 + 0.1 * light})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, w * 0.2, 0, 0, TAU);
    ctx.fill();
  }
}

// 粗短圓端肢體
function limb(ctx, x0, y0, x1, y1, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
function blob(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

// =====================================================================
// Lion — 群體移動（跟隨獅群錨點）、偶爾趴下休息
// =====================================================================
class Lion extends Animal {
  constructor(pride, offset, laneF, male) {
    super(pride.xU + offset, laneF, male ? 1.06 : 0.96);
    this.pride = pride;
    this.offset = offset;
    this.male = male;
    this.restCd = 4 + R() * 8;
  }
  update(dt, env) {
    this.stateT -= dt;
    if (this.state === 'walk') {
      // 追蹤錨點：落後就快走、超前就放慢（乾季 cohesion 小 → 靠更近）
      const target = this.pride.xU + this.offset * env.season.cohesion;
      const err = target - this.xU;
      this.speed = clamp(this.pride.speed + err * 0.5, 0, 66 * env.su) * this.envSpeed(env);
      this.xU += this.speed * dt;
      this.restCd -= dt * env.season.restBias;
      if (this.restCd <= 0 && Math.abs(err) < 40 * env.su && !env.tornado.active) {
        this.state = 'rest';
        this.stateT = 3 + R() * 3.5;
      }
      this.mood = this.panic > 1.2 ? '😨' : '';
    } else { // rest
      this.speed = 0;
      this.mood = '💤';
      if (this.stateT <= 0 || this.panic > 1.2 || this.startle > 0) {
        this.state = 'walk';
        this.restCd = (5 + R() * 10) / env.season.actionMul;
      }
    }
    this.common(dt, env);
  }
  draw(ctx, env) {
    const L = env.light;
    const BODY = shade([201, 154, 91], L), SHD = shade([171, 122, 64], L);
    const BELLY = shade([229, 199, 152], L), MANE = shade([136, 88, 42], L);
    const MANE2 = shade([114, 70, 30], L);
    ctx.save();
    ctx.translate(this.displayX, this.y);
    ctx.scale(this.u, this.u);
    this.shadow(ctx, 34, env.light);
    const rest = this.state === 'rest';
    const bob = rest ? 0 : Math.sin(this.phase * 2) * 1.2;
    const by = rest ? -20 : -33 + bob; // 身體中心高度
    if (!rest) {
      // 遠側腿（暗色）→ 身體 → 近側腿
      const st = 10, lift = 3.4;
      const legY = -26 + bob * 0.5;
      limb(ctx, 15, legY, 15 + Math.sin(this.phase + 2.6) * st, -Math.max(0, -Math.cos(this.phase + 2.6)) * lift, 6.4, SHD);
      limb(ctx, -16, legY, -16 + Math.sin(this.phase + 4.2) * st, -Math.max(0, -Math.cos(this.phase + 4.2)) * lift, 6.4, SHD);
      blob(ctx, 0, by, 30, 14.5, BODY);
      blob(ctx, 3, by + 8, 21, 7, BELLY);
      limb(ctx, 17, legY, 17 + Math.sin(this.phase) * st, -Math.max(0, -Math.cos(this.phase)) * lift, 7, BODY);
      limb(ctx, -14, legY, -14 + Math.sin(this.phase + 1.6) * st, -Math.max(0, -Math.cos(this.phase + 1.6)) * lift, 7, BODY);
    } else {
      blob(ctx, 0, by, 31, 12.5, BODY);
      blob(ctx, 3, by + 6, 22, 6, BELLY);
      // 前伸的前掌
      limb(ctx, 20, -6, 33, -4, 6.5, BODY);
    }
    // 尾巴
    const ts = Math.sin(env.t * 2 + this.seed) * 4;
    ctx.strokeStyle = BODY; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-28, by - 2);
    ctx.quadraticCurveTo(-40, by + 2, -44, by + 12 + ts);
    ctx.stroke();
    blob(ctx, -44.5, by + 13 + ts, 3.4, 3.4, MANE);
    // 頭（公獅有鬃毛）
    const hx = rest ? 30 : 30, hy = rest ? by - 10 : -46 + bob;
    if (this.male) {
      blob(ctx, hx - 2, hy + 1, 14.5, 14.5, MANE);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.3;
        blob(ctx, hx - 2 + Math.cos(a) * 12.5, hy + 1 + Math.sin(a) * 12.5, 4.6, 4.6, i % 2 ? MANE : MANE2);
      }
    }
    blob(ctx, hx, hy, 9.5, 9, BODY);
    blob(ctx, hx + 7.5, hy + 2.5, 5.2, 4, BELLY);   // 口鼻
    blob(ctx, hx + 10.8, hy + 1.4, 1.6, 1.3, '#442');// 鼻
    if (!this.male) {
      blob(ctx, hx - 4, hy - 8.4, 3.4, 3.4, BODY);   // 耳
      blob(ctx, hx - 4, hy - 8.4, 1.7, 1.7, SHD);
    }
    ctx.fillStyle = '#31240f';
    ctx.beginPath(); ctx.arc(hx + 3.6, hy - 1.8, 1.35, 0, TAU); ctx.fill();
    ctx.restore();
    this.drawMood(ctx, env);
  }
}

// =====================================================================
// Elephant — 象群緩慢移動、水塘邊喝水、偶爾舉鼻
// =====================================================================
class Elephant extends Animal {
  constructor(herd, offset, laneF, sizeUnits) {
    super(herd.xU + offset, laneF, sizeUnits);
    this.herd = herd;
    this.offset = offset;
    this.drinkCd = 6 + R() * 8;
    this.trunkCd = 4 + R() * 6;
    this.pose = 0; // 0 正常 / 0..1 喝水進度 or 舉鼻進度
  }
  update(dt, env) {
    this.stateT -= dt;
    const wh = env.scenery.waterhole;
    if (this.state === 'walk') {
      const target = this.herd.xU + this.offset * env.season.cohesion;
      const err = target - this.xU;
      this.speed = clamp(this.herd.speed + err * 0.4, 0, 40 * env.su) * this.envSpeed(env);
      this.xU += this.speed * dt;
      this.drinkCd -= dt * env.season.actionMul;
      this.trunkCd -= dt * env.season.actionMul;
      this.pose = Math.max(0, this.pose - dt * 2);
      // 走到水塘前緣 → 喝水
      if (this.drinkCd <= 0 && Math.abs(this.displayX + 40 * this.u - wh.x) < wh.rxPx * 0.8 && this.panic === 1) {
        this.state = 'drink';
        this.stateT = 3.5 + R() * 2.5;
      } else if (this.trunkCd <= 0) {
        this.state = 'trunk';
        this.stateT = 1.8;
      }
      this.mood = this.panic > 1.2 ? '😨' : '';
    } else if (this.state === 'drink') {
      this.speed = 0;
      this.pose = clamp(this.pose + dt * 2, 0, 1);
      this.mood = '💧';
      if (R() < dt * 2.5) env.particles.emitSplash(this.displayX + 56 * this.u, wh.y, false);
      if (this.stateT <= 0 || this.panic > 1.2) {
        this.state = 'walk';
        this.drinkCd = (14 + R() * 10) / env.season.actionMul;
      }
    } else { // trunk：舉鼻
      this.speed = 0;
      this.pose = clamp(this.pose + dt * 2.4, 0, 1);
      this.mood = '🎺';
      if (this.stateT <= 0) {
        this.state = 'walk';
        this.trunkCd = (9 + R() * 9) / env.season.actionMul;
      }
    }
    this.common(dt, env);
  }
  draw(ctx, env) {
    const L = env.light;
    const BODY = shade([158, 166, 178], L), SHD = shade([128, 136, 150], L);
    const EAR = shade([142, 150, 164], L), TUSK = shade([240, 236, 220], L);
    ctx.save();
    ctx.translate(this.displayX, this.y);
    ctx.scale(this.u, this.u);
    this.shadow(ctx, 44, env.light);
    const bob = this.speed > 1 ? Math.sin(this.phase * 2) * 1 : 0;
    const drink = this.state === 'drink' ? this.pose : 0;
    const up = this.state === 'trunk' ? this.pose : 0;
    // 腿（柱狀，小步幅）
    const st = 6, legY = -34 + bob;
    limb(ctx, 20, legY, 20 + Math.sin(this.phase + 2.6) * st, 0, 10, SHD);
    limb(ctx, -22, legY, -22 + Math.sin(this.phase + 4.2) * st, 0, 10, SHD);
    // 身體
    blob(ctx, 0, -40 + bob, 41, 23, BODY);
    blob(ctx, -4, -30 + bob, 30, 12, shade([172, 180, 192], L));
    limb(ctx, 24, legY, 24 + Math.sin(this.phase) * st, 0, 11, BODY);
    limb(ctx, -18, legY, -18 + Math.sin(this.phase + 1.6) * st, 0, 11, BODY);
    // 尾
    ctx.strokeStyle = SHD; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-39, -48 + bob);
    ctx.quadraticCurveTo(-46, -38, -44, -26 + Math.sin(env.t * 2 + this.seed) * 3);
    ctx.stroke();
    // 頭（喝水時下沉）
    const hx = 37, hy = -47 + bob + drink * 7;
    blob(ctx, hx, hy, 16, 14.5, BODY);
    // 耳（緩慢搧動）
    ctx.save();
    ctx.translate(hx - 6, hy - 2);
    ctx.rotate(Math.sin(env.t * 1.3 + this.seed) * 0.10 - 0.05);
    blob(ctx, 0, 0, 11, 14, EAR);
    blob(ctx, 0.5, 1, 5.5, 8.5, SHD);
    ctx.restore();
    // 象牙（幼象沒有）
    if (this.sizeUnits > 1) {
      ctx.strokeStyle = TUSK; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx + 8, hy + 7);
      ctx.quadraticCurveTo(hx + 15, hy + 12, hx + 18, hy + 8);
      ctx.stroke();
    }
    // 象鼻：三段漸細，姿勢由 drink / up 內插
    const baseX = hx + 12, baseY = hy + 3;
    let midX = baseX + 8, midY = baseY + 14, tipX = baseX + 10, tipY = baseY + 26;
    const sway = this.speed > 1 ? Math.sin(this.phase) * 2.4 : Math.sin(env.t * 1.5) * 1.4;
    midX += sway * 0.5; tipX += sway;
    if (drink > 0) { // 探向水面
      midX = lerp(midX, baseX + 16, drink); midY = lerp(midY, baseY + 16, drink);
      tipX = lerp(tipX, baseX + 22, drink); tipY = lerp(tipY, baseY + 30 - drink * 2, drink);
    }
    if (up > 0) { // 高高舉起
      midX = lerp(midX, baseX + 12, up); midY = lerp(midY, baseY - 6, up);
      tipX = lerp(tipX, baseX + 6, up);  tipY = lerp(tipY, baseY - 22, up);
    }
    ctx.strokeStyle = BODY; ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.quadraticCurveTo(baseX + 6, baseY + 6, midX, midY); ctx.stroke();
    ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(tipX, tipY); ctx.stroke();
    // 眼
    ctx.fillStyle = '#2b2b33';
    ctx.beginPath(); ctx.arc(hx + 5, hy - 4, 1.5, 0, TAU); ctx.fill();
    ctx.restore();
    this.drawMood(ctx, env);
  }
}

// =====================================================================
// Leopard — 單獨、快速且隱密：疾行/潛行交替，偶爾爬上金合歡樹
// =====================================================================
class Leopard extends Animal {
  constructor(xU, laneF) {
    super(xU, laneF, 0.85);
    this.mode = 'dash';
    this.modeT = 2 + R() * 2;
    this.climbCd = 6 + R() * 6;
    this.climbPhase = 0; // 0..1 上樹, 1..2 停留, 2..3 下樹
    // 斑點（決定性散佈在身體橢圓內）
    const sr = mulberry32((this.seed * 1e4) | 0);
    this.spots = [];
    for (let i = 0; i < 12; i++) {
      this.spots.push([(sr() - 0.5) * 40, -22 + (sr() - 0.5) * 12, 1.2 + sr() * 0.9]);
    }
  }
  update(dt, env) {
    const tree = env.scenery.climbTree;
    this.climbCd -= dt;
    if (this.state === 'climb') {
      this.speed = 0;
      const speed = this.climbPhase < 1 ? 0.9 : this.climbPhase < 2 ? 0.22 * env.season.actionMul : 1.1;
      this.climbPhase += dt * speed;
      this.mood = this.climbPhase < 2 ? '🌿' : '';
      if (this.climbPhase >= 3 || (this.panic > 1.3 && this.climbPhase > 2)) {
        this.state = 'walk';
        this.mode = 'dash';
        this.modeT = 2;
        this.climbCd = 16 + R() * 14;
      }
      this.common(dt, env);
      return;
    }
    this.modeT -= dt;
    if (this.modeT <= 0) {
      this.mode = this.mode === 'dash' ? 'prowl' : 'dash';
      this.modeT = this.mode === 'dash' ? 1.8 + R() * 2.4 : (1 + R() * 1.6) / env.season.actionMul;
    }
    const base = this.mode === 'dash' ? 88 : 24;
    this.speed = base * env.su * this.envSpeed(env);
    this.xU += this.speed * dt;
    this.mood = this.panic > 1.2 ? '😨' : (this.mode === 'prowl' ? '🐾' : '');
    this.common(dt, env);
    // 接近可攀爬的樹 → 有機率上樹（龍捲風時不上樹）
    if (this.climbCd <= 0 && !env.tornado.active &&
        Math.abs(this.displayX - (tree.x - 8 * env.su)) < 14 * env.su && R() < 0.6) {
      this.state = 'climb';
      this.climbPhase = 0;
      // 對齊樹幹（displayX → xU 的校正）
      this.xU += (tree.x - 8 * env.su) - this.displayX;
    }
  }
  draw(ctx, env) {
    const L = env.light;
    const BODY = shade([222, 178, 104], L), BELLY = shade([243, 226, 180], L);
    const SPOT = shade([94, 62, 30], L);
    const tree = env.scenery.climbTree;
    ctx.save();
    if (this.state === 'climb') {
      // 三階段：沿樹幹上 → 趴在橫枝 → 沿樹幹下
      const ph = this.climbPhase;
      const groundY = tree.baseY, branchY = tree.branchY;
      let k = ph < 1 ? smoothstep(ph) : ph < 2 ? 1 : smoothstep(1 - (ph - 2));
      const cx = tree.x + (ph >= 1 && ph < 2 ? 18 * tree.s : -3 * tree.s);
      const cy = lerp(groundY, branchY, k);
      ctx.translate(cx, cy);
      ctx.scale(this.u, this.u);
      if (ph >= 1 && ph < 2) {
        // 趴在枝上：身體水平、尾巴垂下晃動
        blob(ctx, 0, -6, 24, 8.5, BODY);
        blob(ctx, 20, -10, 6.5, 6, BODY);
        blob(ctx, 24.5, -8.6, 3.2, 2.4, BELLY);
        ctx.fillStyle = '#332512';
        ctx.beginPath(); ctx.arc(22.5, -11.5, 1.1, 0, TAU); ctx.fill();
        blob(ctx, 17, -15.5, 2.4, 2.4, BODY);
        limb(ctx, 8, -3, 9, 8, 4, BODY);   // 垂下的前腿
        limb(ctx, -6, -3, -5, 9, 4, BODY);
        ctx.strokeStyle = BODY; ctx.lineWidth = 3; ctx.lineCap = 'round';
        const ts = Math.sin(env.t * 3 + this.seed) * 3;
        ctx.beginPath();
        ctx.moveTo(-22, -6);
        ctx.quadraticCurveTo(-28, 4, -26 + ts, 16);
        ctx.stroke();
        for (const s of this.spots) {
          ctx.fillStyle = SPOT;
          ctx.beginPath(); ctx.arc(s[0] * 0.7, -6 + s[1] * 0.35 + 5, s[2] * 0.9, 0, TAU); ctx.fill();
        }
      } else {
        // 攀爬中：身體貼樹幹傾斜
        ctx.rotate(-1.1);
        blob(ctx, 0, -14, 22, 8, BODY);
        blob(ctx, 18, -18, 6, 5.5, BODY);
        limb(ctx, 10, -8, 16, 2, 3.6, BODY);
        limb(ctx, -8, -8, -4, 3, 3.6, BODY);
        for (const s of this.spots) {
          ctx.fillStyle = SPOT;
          ctx.beginPath(); ctx.arc(s[0] * 0.6, -14 + s[1] * 0.3 + 7, s[2] * 0.8, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
      return;
    }
    ctx.translate(this.displayX, this.y);
    ctx.scale(this.u, this.u);
    this.shadow(ctx, 27, env.light);
    const prowl = this.mode === 'prowl';
    const stretch = prowl ? 1 : 1 + Math.sin(this.phase * 2) * 0.06;
    const bodyY = prowl ? -16 : -21 + Math.abs(Math.sin(this.phase)) * -2.5;
    // 腿（細長）
    const st = prowl ? 7 : 15, lift = prowl ? 2 : 5;
    const SHD = shade([196, 150, 82], L);
    limb(ctx, 13, bodyY + 6, 13 + Math.sin(this.phase + 2.6) * st, -Math.max(0, -Math.cos(this.phase + 2.6)) * lift, 4, SHD);
    limb(ctx, -14, bodyY + 6, -14 + Math.sin(this.phase + 4.2) * st, -Math.max(0, -Math.cos(this.phase + 4.2)) * lift, 4, SHD);
    ctx.save();
    ctx.scale(stretch, 1);
    blob(ctx, 0, bodyY, 25, 9.5, BODY);
    blob(ctx, 2, bodyY + 4.5, 18, 4.5, BELLY);
    ctx.restore();
    limb(ctx, 15, bodyY + 6, 15 + Math.sin(this.phase) * st, -Math.max(0, -Math.cos(this.phase)) * lift, 4.4, BODY);
    limb(ctx, -12, bodyY + 6, -12 + Math.sin(this.phase + 1.6) * st, -Math.max(0, -Math.cos(this.phase + 1.6)) * lift, 4.4, BODY);
    // 長尾（末端上勾）
    ctx.strokeStyle = BODY; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    const ts = Math.sin(env.t * 2.4 + this.seed) * 3;
    ctx.beginPath();
    ctx.moveTo(-23, bodyY - 2);
    ctx.quadraticCurveTo(-36, bodyY - 4, -40, bodyY - 14 + ts);
    ctx.stroke();
    blob(ctx, -40.5, bodyY - 16 + ts, 2.4, 2.4, SPOT);
    // 頭
    const hx = 24, hy = bodyY - 7 + (prowl ? 3 : 0);
    blob(ctx, hx, hy, 7, 6.4, BODY);
    blob(ctx, hx + 5.6, hy + 1.6, 3.6, 2.6, BELLY);
    blob(ctx, hx + 8.4, hy + 0.8, 1.2, 1, '#37280f');
    blob(ctx, hx - 2.6, hy - 5.8, 2.5, 2.5, BODY);
    blob(ctx, hx - 2.6, hy - 5.8, 1.2, 1.2, SPOT);
    ctx.fillStyle = '#2c2110';
    ctx.beginPath(); ctx.arc(hx + 2.6, hy - 1.6, 1.1, 0, TAU); ctx.fill();
    // 斑點
    ctx.fillStyle = SPOT;
    ctx.beginPath();
    for (const s of this.spots) {
      const sx = s[0] * 0.55, sy = bodyY + s[1] * 0.42 + 9;
      ctx.moveTo(sx + s[2], sy);
      ctx.arc(sx, sy, s[2], 0, TAU);
    }
    ctx.fill();
    ctx.restore();
    this.drawMood(ctx, env);
  }
}

// =====================================================================
// Scenery — 天空 / 遠山 / 樹 / 水塘 / 草叢（resize 時重建）
// =====================================================================
class Scenery {
  build(W, H, su) {
    const rand = mulberry32(20260705);
    this.mtnFar = this.ridge(rand, W, H * 0.50, H * 0.13, 10);
    this.mtnNear = this.ridge(rand, W, H * 0.505, H * 0.055, 16);
    // 吉力馬札羅式主峰（平頂 + 雪帽）
    this.kili = { x: W * 0.74, w: W * 0.30, h: H * 0.16 };
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: rand() * W, y: H * (0.06 + rand() * 0.22),
        s: (0.6 + rand() * 0.9) * su, v: 0.5 + rand() * 0.8, seed: rand() * 9,
      });
    }
    this.tufts = [];
    const n = clamp((W / 9) | 0, 50, 150);
    for (let i = 0; i < n; i++) {
      this.tufts.push({
        x: rand() * W, y: H * (0.56 + rand() * 0.40),
        s: (0.5 + rand()) * su, seed: rand() * TAU,
      });
    }
    this.fgTufts = [];
    for (let i = 0; i < (n / 2) | 0; i++) {
      this.fgTufts.push({ x: rand() * W, y: H * (0.965 + rand() * 0.035), s: (1.2 + rand()) * su, seed: rand() * TAU });
    }
    this.waterhole = { x: W * 0.70, y: H * 0.815, rxPx: clamp(W * 0.085, 40, 130) * 1, ry: 0.30 };
    this.rocks = [
      { x: W * 0.485, y: H * 0.70, s: su * (0.8 + rand() * 0.4) },
      { x: W * 0.06, y: H * 0.90, s: su * 1.15 },
    ];
    // 三棵金合歡樹；第一棵是花豹可以攀爬的大樹
    const t1 = { x: W * 0.26, baseY: H * 0.885, s: su * 1.25, big: true };
    t1.branchY = t1.baseY - 64 * t1.s; // 花豹趴臥的橫枝高度（與 drawTree 的枝條對齊）
    this.climbTree = t1;
    this.trees = [
      t1,
      { x: W * 0.865, baseY: H * 0.68, s: su * 0.8 },
      { x: W * 0.115, baseY: H * 0.625, s: su * 0.62 },
    ];
    this.sun = { x: W * 0.17, y: H * 0.15 };
    this.birds = [];
    for (let i = 0; i < 3; i++) {
      this.birds.push({ x: rand() * W, y: H * (0.1 + rand() * 0.18), v: (14 + rand() * 12) * su, seed: rand() * 9 });
    }
  }
  ridge(rand, W, baseY, amp, n) {
    const pts = [[-40, baseY]];
    for (let i = 0; i <= n; i++) {
      pts.push([(W + 80) * (i / n) - 40, baseY - rand() * amp - (i % 2) * amp * 0.35]);
    }
    pts.push([W + 40, baseY]);
    return pts;
  }
  drawSkyBand(ctx, env) {
    const { W, H } = env;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    g.addColorStop(0, css(env.pal.skyTop));
    g.addColorStop(1, css(env.pal.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.56);
    // 太陽（雲多或天暗時淡出）
    const sunA = (1 - env.dark) * (1 - env.cloud * 0.55);
    if (sunA > 0.04) {
      const sg = ctx.createRadialGradient(this.sun.x, this.sun.y, 2, this.sun.x, this.sun.y, 60 * env.su);
      sg.addColorStop(0, css(PAL.sun, 0.9 * sunA));
      sg.addColorStop(0.35, css(PAL.sun, 0.4 * sunA));
      sg.addColorStop(1, css(PAL.sun, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(this.sun.x - 60 * env.su, this.sun.y - 60 * env.su, 120 * env.su, 120 * env.su);
      ctx.fillStyle = css([255, 250, 225], 0.95 * sunA);
      ctx.beginPath(); ctx.arc(this.sun.x, this.sun.y, 15 * env.su, 0, TAU); ctx.fill();
    }
    // 鳥（好天氣才出來）
    if (env.dark < 0.25) {
      ctx.strokeStyle = 'rgba(60,60,70,0.65)';
      ctx.lineWidth = 1.4 * env.su;
      ctx.lineCap = 'round';
      for (const b of this.birds) {
        b.x += b.v * env.dt;
        if (b.x > W + 30) { b.x = -30; b.y = H * (0.08 + R() * 0.2); }
        const f = Math.sin(env.t * 7 + b.seed) * 4 * env.su;
        ctx.beginPath();
        ctx.moveTo(b.x - 6 * env.su, b.y - f);
        ctx.quadraticCurveTo(b.x, b.y + 3 * env.su, b.x, b.y);
        ctx.quadraticCurveTo(b.x, b.y + 3 * env.su, b.x + 6 * env.su, b.y - f);
        ctx.stroke();
      }
    }
  }
  drawClouds(ctx, env) {
    const cCol = [];
    mix3(cCol, [255, 255, 255], [104, 112, 124], env.dark);
    for (const c of this.clouds) {
      c.x += (6 + env.wind * 0.35) * c.v * env.dt;
      const span = env.W + 240;
      if (c.x - 120 > env.W) c.x -= span;
      const s = c.s * (1 + env.cloud * 0.5);
      ctx.fillStyle = css(cCol, 0.5 + env.cloud * 0.4);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 46 * s, 15 * s, 0, 0, TAU);
      ctx.ellipse(c.x - 26 * s, c.y + 5 * s, 26 * s, 11 * s, 0, 0, TAU);
      ctx.ellipse(c.x + 28 * s, c.y + 4 * s, 30 * s, 12 * s, 0, 0, TAU);
      ctx.fill();
    }
  }
  drawMountains(ctx, env) {
    const { H } = env;
    // 主峰（比稜線更深一階，確保任何天氣下都能從天空分離出來）
    const k = this.kili;
    const kc = mix3([], env.pal.mtnFar, [88, 80, 100], 0.3);
    ctx.fillStyle = css(kc);
    ctx.beginPath();
    ctx.moveTo(k.x - k.w / 2, H * 0.505);
    ctx.lineTo(k.x - k.w * 0.14, H * 0.505 - k.h);
    ctx.lineTo(k.x + k.w * 0.14, H * 0.505 - k.h);
    ctx.lineTo(k.x + k.w / 2, H * 0.505);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css([245, 248, 252], 0.92);
    ctx.beginPath();
    ctx.moveTo(k.x - k.w * 0.155, H * 0.505 - k.h * 0.97);
    ctx.lineTo(k.x - k.w * 0.14, H * 0.505 - k.h);
    ctx.lineTo(k.x + k.w * 0.14, H * 0.505 - k.h);
    ctx.lineTo(k.x + k.w * 0.155, H * 0.505 - k.h * 0.97);
    ctx.lineTo(k.x + k.w * 0.06, H * 0.505 - k.h * 0.80);
    ctx.lineTo(k.x - k.w * 0.03, H * 0.505 - k.h * 0.86);
    ctx.closePath();
    ctx.fill();
    // 兩道稜線
    ctx.fillStyle = css(env.pal.mtnFar);
    this.fillRidge(ctx, this.mtnFar, env.H * 0.56);
    ctx.fillStyle = css(env.pal.mtnNear);
    this.fillRidge(ctx, this.mtnNear, env.H * 0.56);
  }
  fillRidge(ctx, pts, bottomY) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], bottomY);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(pts[pts.length - 1][0], bottomY);
    ctx.closePath();
    ctx.fill();
  }
  drawGround(ctx, env) {
    const { W, H } = env;
    const g = ctx.createLinearGradient(0, H * 0.50, 0, H);
    g.addColorStop(0, css(env.pal.grassFar));
    g.addColorStop(1, css(env.pal.grassNear));
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.50, W, H * 0.5);
    // 積雪：由地平線往下鋪一層冷白
    if (env.snowLevel > 0.02) {
      const sg = ctx.createLinearGradient(0, H * 0.50, 0, H);
      sg.addColorStop(0, css(PAL.snowTint, 0.85 * env.snowLevel));
      sg.addColorStop(1, css(PAL.snowTint, 0.55 * env.snowLevel));
      ctx.fillStyle = sg;
      ctx.fillRect(0, H * 0.50, W, H * 0.5);
    }
    // 地平線亮帶（乾季的金色薄霧）
    ctx.fillStyle = css(env.pal.skyBot, 0.35 * (1 - env.dark));
    ctx.fillRect(0, H * 0.50, W, H * 0.045);
  }
  drawWaterhole(ctx, env) {
    const wh = this.waterhole;
    const rx = wh.rxPx * lerp(0.82, 1.05, env.season.t); // 濕季水面較大
    // 岸邊
    ctx.fillStyle = css([150, 128, 92], 0.5 * env.light);
    ctx.beginPath();
    ctx.ellipse(wh.x, wh.y, rx * 1.12, rx * wh.ry * 1.25, 0, 0, TAU);
    ctx.fill();
    const g = ctx.createLinearGradient(0, wh.y - rx * wh.ry, 0, wh.y + rx * wh.ry);
    g.addColorStop(0, css(mix3([], env.pal.water, env.pal.skyBot, 0.35)));
    g.addColorStop(1, css(env.pal.water));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(wh.x, wh.y, rx, rx * wh.ry, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(wh.x - rx * 0.25, wh.y - rx * wh.ry * 0.25, rx * 0.42, rx * wh.ry * 0.3, 0, 0, TAU);
    ctx.fill();
  }
  drawTufts(ctx, env, list, colorArr, alpha) {
    ctx.strokeStyle = css(colorArr, alpha);
    ctx.lineWidth = Math.max(1, 1.3 * env.su);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const t of list) {
      const sway = Math.sin(env.t * 1.6 + t.seed) * (2 + env.wind * 0.05) * env.su;
      for (let i = -1; i <= 1; i++) {
        const h = (7 + Math.abs(i) * -2) * t.s;
        ctx.moveTo(t.x + i * 2 * t.s, t.y);
        ctx.quadraticCurveTo(t.x + i * 2 * t.s + sway * 0.4, t.y - h * 0.6, t.x + i * 3 * t.s + sway, t.y - h);
      }
    }
    ctx.stroke();
  }
  drawRock(ctx, r, env) {
    const L = env.light;
    ctx.fillStyle = shade([148, 140, 132], L);
    ctx.beginPath();
    ctx.ellipse(r.x, r.y - 8 * r.s, 20 * r.s, 12 * r.s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shade([176, 168, 158], L);
    ctx.beginPath();
    ctx.ellipse(r.x - 5 * r.s, r.y - 12 * r.s, 10 * r.s, 6 * r.s, 0, 0, TAU);
    ctx.fill();
    if (env.snowLevel > 0.1) {
      ctx.fillStyle = css(PAL.snowTint, env.snowLevel * 0.9);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y - 16 * r.s, 15 * r.s, 4 * r.s, 0, 0, TAU);
      ctx.fill();
    }
  }
  drawTree(ctx, tr, env) {
    const L = env.light, s = tr.s;
    ctx.save();
    ctx.translate(tr.x, tr.baseY);
    // 影
    ctx.fillStyle = `rgba(30,36,16,${0.15 * L + 0.04})`;
    ctx.beginPath(); ctx.ellipse(4 * s, 0, 34 * s, 6 * s, 0, 0, TAU); ctx.fill();
    // 樹幹（微彎、分岔）
    ctx.strokeStyle = shade(PAL.trunk, L);
    ctx.lineCap = 'round';
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-4 * s, -40 * s, 2 * s, -70 * s);
    ctx.stroke();
    ctx.lineWidth = 3.4 * s;
    ctx.beginPath();
    ctx.moveTo(-1 * s, -42 * s);
    ctx.quadraticCurveTo(-16 * s, -60 * s, -26 * s, -72 * s);
    ctx.stroke();
    if (tr.big) { // 花豹的橫枝
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.moveTo(0, -56 * s);
      ctx.quadraticCurveTo(14 * s, -66 * s, 30 * s, -70 * s);
      ctx.stroke();
    }
    // 平頂樹冠（金合歡）
    const c = mix3([], env.pal.canopy, PAL.snowTint, env.snowLevel * 0.25);
    ctx.fillStyle = shade(c, L);
    ctx.beginPath();
    ctx.ellipse(0, -84 * s, 44 * s, 12 * s, 0, 0, TAU);
    ctx.ellipse(-20 * s, -78 * s, 24 * s, 9 * s, 0, 0, TAU);
    ctx.ellipse(22 * s, -79 * s, 26 * s, 9 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = css([255, 255, 255], 0.10 * L);
    ctx.beginPath();
    ctx.ellipse(-6 * s, -88 * s, 30 * s, 6 * s, 0, 0, TAU);
    ctx.fill();
    if (env.snowLevel > 0.1) {
      ctx.fillStyle = css(PAL.snowTint, env.snowLevel * 0.85);
      ctx.beginPath();
      ctx.ellipse(0, -88 * s, 40 * s, 6 * s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  drawForeground(ctx, env) {
    this.drawTufts(ctx, env, this.fgTufts, env.pal.fgGrass, 0.8);
  }
}

// =====================================================================
// App — 組裝一切
// =====================================================================
class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.ctx = this.canvas.getContext('2d');
    this.particles = new ParticleSystem();
    this.season = new SeasonManager();
    this.weather = new WeatherManager(this.particles);
    this.scenery = new Scenery();
    this.entities = [];   // 可深度排序的實體（動物 + 樹 + 岩石）
    this.animals = [];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 共享的 env（每幀重用，避免配置）
    this.env = {
      W: 0, H: 0, su: 1, dt: 0, t: 0,
      span: 0, margin: 0,
      bandY: (f) => this.env.H * 0.60 + f * this.env.H * 0.335,
      pal: { skyTop: [0,0,0], skyBot: [0,0,0], grassFar: [0,0,0], grassNear: [0,0,0],
             mtnFar: [0,0,0], mtnNear: [0,0,0], canopy: [0,0,0], fgGrass: [0,0,0], water: [0,0,0] },
      light: 1, dark: 0, cloud: 0, wind: 0, snowLevel: 0,
      weatherKey: 'sunny', weatherSpeedMul: 1,
      season: this.season, scenery: this.scenery,
      particles: this.particles, tornado: this.weather.tornado,
    };

    this.buildWorld();
    this.bindUI();
    this.resize();
    addEventListener('resize', () => this.resize());

    this.last = performance.now();
    this.fps = 60;
    this.fpsLow = 0;
    this.debugTimer = 0;
    requestAnimationFrame((n) => this.frame(n));
  }

  buildWorld() {
    // 獅群（1 公 2 母）與象群（2 大 1 幼）共用移動錨點；花豹單獨行動
    this.pride = { xU: 300, speed: 30 };
    this.herd = { xU: 900, speed: 20 };
    this.animals = [
      new Lion(this.pride, 0, 0.62, true),
      new Lion(this.pride, -85, 0.45, false),
      new Lion(this.pride, -150, 0.78, false),
      new Elephant(this.herd, 0, 0.55, 1.55),
      new Elephant(this.herd, -210, 0.72, 1.4),
      new Elephant(this.herd, -95, 0.64, 0.85),  // 幼象跟在中間
      new Leopard(1500, 0.30),
      new Leopard(600, 0.92),
    ];
    this.weather.onScare = (x) => {
      for (const a of this.animals) {
        if (Math.abs(a.displayX - x) < 320 * this.env.su) a.startle = 1.4;
      }
    };
    this.season.onChange = (season, isAuto) => this.onSeasonChange(season, isAuto);
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = this.canvas.clientWidth || innerWidth;
    const H = this.canvas.clientHeight || innerHeight;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const env = this.env;
    const oldW = env.W;
    env.W = W; env.H = H;
    env.su = clamp(H / 520, 0.34, 1.5);
    env.margin = 150 * env.su;
    env.span = W + env.margin * 2;
    this.scenery.build(W, H, env.su);
    this.weather.layoutPuddles(env, mulberry32(7));
    // 重建深度排序清單
    this.entities = [
      ...this.scenery.trees.map(t => ({ sortY: t.baseY, draw: (c, e) => this.scenery.drawTree(c, t, e) })),
      ...this.scenery.rocks.map(r => ({ sortY: r.y, draw: (c, e) => this.scenery.drawRock(c, r, e) })),
      ...this.animals.map(a => ({ sortY: 0, a, draw: (c, e) => a.draw(c, e) })),
    ];
    // 依寬度比例平移動物，避免 resize 後擠在一起
    if (oldW > 0 && Math.abs(oldW - W) > 2) {
      const k = W / oldW;
      this.pride.xU *= k; this.herd.xU *= k;
      for (const a of this.animals) a.xU *= k;
    }
  }

  onSeasonChange(season, isAuto) {
    const btn = document.getElementById('season-btn');
    btn.querySelector('.ico').textContent = season === 'dry' ? '🌾' : '🌿';
    btn.querySelector('.lbl').textContent = season === 'dry' ? '乾季' : '濕季';
    // 天氣可用性：降雪視為乾季（旱冬）限定 → 濕季停用按鈕；雪天進入濕季時自動轉雨
    this.updateWeatherAvailability();
    if (season === 'wet' && this.weather.current === 'snow') {
      this.setWeather('rain');
      this.toast('🌧️ 濕季來臨，降雪轉為降雨');
    } else {
      this.toast(season === 'dry'
        ? `🌾 乾季${isAuto ? '（自動輪轉）' : ''}：草原轉金黃，動物更趨群聚`
        : `🌿 濕季${isAuto ? '（自動輪轉）' : ''}：大地轉綠，動物更活躍`);
    }
    this.updateStatus();
  }
  updateWeatherAvailability() {
    const snowBtn = document.querySelector('[data-weather="snow"]');
    snowBtn.disabled = this.season.season === 'wet';
  }

  setWeather(key) {
    if (this.season.season === 'wet' && key === 'snow') {
      this.toast('❄️ 濕季不會降雪（僅乾季可用）');
      return;
    }
    this.weather.set(key, this.env);
    document.querySelectorAll('.wbtn').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.weather === key ? 'true' : 'false'));
    this.updateStatus();
  }
  updateStatus() {
    const s = this.season.season === 'dry' ? '🌾 乾季' : '🌿 濕季';
    document.getElementById('status-line').textContent =
      `${WEATHERS[this.weather.current].label} · ${s}`;
  }
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), 2800);
  }

  bindUI() {
    document.querySelectorAll('.wbtn').forEach(b =>
      b.addEventListener('click', () => this.setWeather(b.dataset.weather)));
    document.getElementById('season-btn').addEventListener('click', () => this.season.toggle(false));
    const dbtn = document.getElementById('debug-btn');
    const dbg = document.getElementById('debug');
    const toggleDebug = () => {
      dbg.hidden = !dbg.hidden;
      dbtn.setAttribute('aria-pressed', dbg.hidden ? 'false' : 'true');
    };
    dbtn.addEventListener('click', toggleDebug);
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const keys = { '1': 'sunny', '2': 'rain', '3': 'heavy', '4': 'snow', '5': 'storm', '6': 'tornado' };
      if (keys[e.key]) this.setWeather(keys[e.key]);
      else if (e.key === 's' || e.key === 'S') this.season.toggle(false);
      else if (e.key === 'd' || e.key === 'D') toggleDebug();
    });
    setTimeout(() => document.getElementById('title').classList.add('dim'), 4500);
    this.updateWeatherAvailability();
    this.updateStatus();
  }

  frame(now) {
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = clamp(rawDt, 0, 0.05); // 分頁切回時避免大步進
    if (rawDt > 0) this.fps = lerp(this.fps, 1 / rawDt, 0.06);
    this.update(dt, now / 1000);
    this.draw();
    requestAnimationFrame((n) => this.frame(n));
  }

  update(dt, t) {
    const env = this.env;
    env.dt = dt; env.t = t;
    this.season.update(dt);
    // 效能守門：長期低於 42fps 時調降粒子生成
    if (this.fps < 42) { this.fpsLow += dt; } else { this.fpsLow = 0; }
    if (this.fpsLow > 2 && this.particles.scale > 0.4) {
      this.particles.scale *= 0.75;
      this.fpsLow = 0;
    }
    if (this.reduced) this.particles.scale = Math.min(this.particles.scale, 0.5);

    // 由天氣/季節組出這一幀的環境
    const w = this.weather;
    env.weatherKey = w.current;
    env.dark = w.mixed('dark');
    env.cloud = w.mixed('cloud');
    env.wind = w.mixed('wind') * env.su;
    env.weatherSpeedMul = w.mixed('speedMul');
    env.light = 1 - env.dark * 0.55;
    env.snowLevel = w.snowLevel;
    const st = this.season.t;
    const p = env.pal;
    mix3(p.skyTop, PAL.dry.skyTop, PAL.wet.skyTop, st);
    mix3(p.skyBot, PAL.dry.skyBot, PAL.wet.skyBot, st);
    mix3(p.grassFar, PAL.dry.grassFar, PAL.wet.grassFar, st);
    mix3(p.grassNear, PAL.dry.grassNear, PAL.wet.grassNear, st);
    mix3(p.mtnFar, PAL.dry.mtnFar, PAL.wet.mtnFar, st);
    mix3(p.mtnNear, PAL.dry.mtnNear, PAL.wet.mtnNear, st);
    mix3(p.canopy, PAL.dry.canopy, PAL.wet.canopy, st);
    mix3(p.fgGrass, PAL.dry.fgGrass, PAL.wet.fgGrass, st);
    mix3(p.water, PAL.dry.water, PAL.wet.water, st);
    // 天空往壞天氣灰壓暗；龍捲風再帶土黃
    mix3(p.skyTop, p.skyTop, PAL.stormSky, env.dark * 0.9);
    mix3(p.skyBot, p.skyBot, PAL.stormSky, env.dark * 0.75);
    if (env.weatherKey === 'tornado') {
      mix3(p.skyBot, p.skyBot, PAL.tornadoTint, 0.5 * w.blend);
      mix3(p.skyTop, p.skyTop, PAL.tornadoTint, 0.28 * w.blend);
    }
    // 地面與遠山隨光量壓暗（否則暴風雨時山體會融進天空）
    const gl = 0.72 + env.light * 0.28;
    for (const key of ['grassFar', 'grassNear', 'mtnFar', 'mtnNear']) {
      p[key][0] *= gl; p[key][1] *= gl; p[key][2] *= gl;
    }
    mix3(p.mtnFar, p.mtnFar, [70, 66, 84], env.dark * 0.4);
    mix3(p.mtnNear, p.mtnNear, [58, 64, 56], env.dark * 0.4);

    // 群體錨點前進（乾季整體慢一點）
    const herdMul = env.season.speedMul * env.weatherSpeedMul;
    this.pride.speed = 30 * env.su * herdMul;
    this.herd.speed = 20 * env.su * herdMul;
    this.pride.xU += this.pride.speed * dt;
    this.herd.xU += this.herd.speed * dt;

    for (const a of this.animals) a.update(dt, env);
    w.update(dt, env, this.animals);
    this.particles.update(dt, env, w.tornado);

    // HUD（4Hz 更新即可）
    this.debugTimer -= dt;
    if (this.debugTimer <= 0) {
      this.debugTimer = 0.25;
      const sp = document.getElementById('season-progress');
      sp.style.setProperty('--p', (1 - this.season.timer / this.season.AUTO_PERIOD).toFixed(3));
      const dbg = document.getElementById('debug');
      if (!dbg.hidden) {
        dbg.textContent =
          `FPS ${this.fps.toFixed(0)}\n` +
          `粒子 ${this.particles.active}/${this.particles.capacity} (×${this.particles.scale.toFixed(2)})\n` +
          `動物 ${this.animals.length} · ${WEATHERS[this.weather.current].label} · ${this.season.season === 'dry' ? '乾季' : '濕季'}`;
      }
    }
  }

  draw() {
    const ctx = this.ctx, env = this.env;
    const { W, H } = env;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // 雷擊震動
    if (this.weather.shake > 0 && !this.reduced) {
      const s = this.weather.shake * 3.5 * env.su;
      ctx.translate((R() - 0.5) * s, (R() - 0.5) * s);
    }
    this.scenery.drawSkyBand(ctx, env);
    // 遠雷微光
    if (this.weather.skyFlicker > 0) {
      ctx.fillStyle = `rgba(200,215,255,${this.weather.skyFlicker * 0.25})`;
      ctx.fillRect(0, 0, W, H * 0.55);
    }
    this.scenery.drawMountains(ctx, env);
    this.scenery.drawClouds(ctx, env);
    this.scenery.drawGround(ctx, env);
    this.scenery.drawWaterhole(ctx, env);
    this.weather.drawPuddles(ctx, env);
    // 中景草叢（實體後面那層）
    this.scenery.drawTufts(ctx, env, this.scenery.tufts, env.pal.fgGrass, 0.4);

    // 依 y 深度排序繪製實體（動物 sortY 每幀更新；攀爬中的花豹排在樹之後）
    for (const e of this.entities) {
      if (e.a) e.sortY = e.a.state === 'climb' ? this.scenery.climbTree.baseY + 1 : e.a.y;
    }
    this.entities.sort((a, b) => a.sortY - b.sortY);
    for (const e of this.entities) e.draw(ctx, env);

    this.weather.tornado.draw(ctx, env);
    this.particles.draw(ctx, env);
    this.weather.drawBolt(ctx, env);
    this.scenery.drawForeground(ctx, env);

    // 全畫面閃光
    if (this.weather.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.weather.flash * 0.55})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    ctx.restore();
    // 暗角
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.55, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(10,16,22,${0.16 + env.dark * 0.12})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}

window.__savannah = new App(); // 除錯用握把（不影響功能）
