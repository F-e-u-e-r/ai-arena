'use strict';
/* =========================================================
 * 環境:調色盤(季節×天氣混合)、視差背景、閃電、龍捲風
 * ========================================================= */

/* ---------- 季節基礎色(乾季 → 濕季) ---------- */
const PAL_DRY = {
  skyTop: '#6fb3e0', skyBot: '#f2d49a',
  mtnFar: '#b3a3bd', mtnNear: '#8d7a93',
  grassA: '#cba64f', grassB: '#a87f38',
  ground: '#8a6a3f', water: '#7fb6c9',
  canopy: '#7a8a3c', trunk: '#6e4f2f',
};
const PAL_WET = {
  skyTop: '#3f9fe8', skyBot: '#c8eedd',
  mtnFar: '#7d9cc6', mtnNear: '#57779f',
  grassA: '#63b455', grassB: '#3c8a3a',
  ground: '#6a5132', water: '#55a6cc',
  canopy: '#4e8a3c', trunk: '#5d4128',
};
/* 天氣覆蓋色(依 def.influence × 平滑 mix 混入季節色) */
const PAL_WX = {
  sunny:   null, // 不覆蓋
  rain:    { skyTop: '#8fa3b5', skyBot: '#b6c3cc', mtnFar: '#8b96a8', mtnNear: '#6d7a8c', grassA: '#8a9455', grassB: '#6d7a44', ground: '#5f5648', water: '#6f9fb5', canopy: '#5d7040', trunk: '#5a4a3a' },
  heavy:   { skyTop: '#66788c', skyBot: '#8d9daa', mtnFar: '#6d788a', mtnNear: '#566274', grassA: '#6d7a48', grassB: '#566238', ground: '#4a443c', water: '#5d8499', canopy: '#4a5c36', trunk: '#4a3e32' },
  snow:    { skyTop: '#c3ccd8', skyBot: '#e6ecf2', mtnFar: '#aab4c4', mtnNear: '#8d99ab', grassA: '#b9bda8', grassB: '#a3a891', ground: '#9aa0a8', water: '#a8c4d4', canopy: '#9aa892', trunk: '#7a7068' },
  thunder: { skyTop: '#3a4152', skyBot: '#5d6478', mtnFar: '#4a5164', mtnNear: '#3a4152', grassA: '#5a6448', grassB: '#48523a', ground: '#413c34', water: '#4d6a80', canopy: '#3f4c34', trunk: '#38302a' },
  tornado: { skyTop: '#5d6b5a', skyBot: '#8a9478', mtnFar: '#5f6b5c', mtnNear: '#4a5548', grassA: '#6d7346', grassB: '#565c38', ground: '#4c463a', water: '#5d7a72', canopy: '#4c5636', trunk: '#443c30' },
};

/* 預先轉成 [r,g,b] 陣列,避免每幀重複 parseInt */
function toRgbMap(obj) {
  const out = {};
  for (const k in obj) out[k] = hexRgb(obj[k]);
  return out;
}
const PAL_DRY_A = toRgbMap(PAL_DRY);
const PAL_WET_A = toRgbMap(PAL_WET);
const PAL_WX_A = {};
for (const k in PAL_WX) PAL_WX_A[k] = PAL_WX[k] ? toRgbMap(PAL_WX[k]) : null;

/**
 * 計算目前調色盤:
 * 1) 季節 blend 在乾/濕季兩套色之間插值;
 * 2) 再依序套用天氣覆蓋層(可多層,支援切換時的交叉淡化:
 *    舊天氣 effect 衰減中 + 新天氣 effect 上升中,顏色不會瞬間跳變)。
 */
function computePalette(seasonBlend, overlays, out) {
  for (const k in PAL_DRY_A) {
    let c = mixRgb(PAL_DRY_A[k], PAL_WET_A[k], seasonBlend);
    for (const ov of overlays) {
      const wx = PAL_WX_A[ov.kind];
      if (wx && ov.t > 0.001) c = mixRgb(c, wx[k], clamp(ov.t, 0, 1));
    }
    out[k] = c;
  }
  return out;
}

/* =========================================================
 * 背景:天空 / 太陽 / 雲(視差)/ 遠山 / 草原 / 水窪 / 金合歡樹 / 鳥
 * ========================================================= */
class Background {
  constructor() {
    this.t = 0;
    this.pal = {};           // 目前調色盤(computePalette 寫入)
    this._skyKey = '';
    this._skyGrad = null;
    this._gndKey = '';
    this._gndGrad = null;
  }

  /* 視窗改變時重建所有與尺寸相關的配置(RWD) */
  layout(W, H, u) {
    this.horizonY = H * 0.60;

    // 遠山兩層(遠:高而淡;近:低而深)——山稜用隨機折線
    this.ridgeFar = this._makeRidge(W, this.horizonY, H * 0.30, 13, 0.5);
    this.ridgeNear = this._makeRidge(W, this.horizonY, H * 0.15, 10, 0.9);

    // 金合歡樹(豹的攀爬目標)——就地更新欄位,不重建物件:
    // 豹攀爬中若遇 resize,持有的 tree 參照仍然有效
    const defs = [0.16, 0.5, 0.86];
    if (!this.trees) {
      this.trees = defs.map(() => ({ x: 0, baseY: 0, h: 0, branchY: 0, phase: rand(TAU) }));
    }
    defs.forEach((fx, i) => {
      const t = this.trees[i];
      t.x = W * fx;
      t.baseY = this.horizonY + (H - this.horizonY) * (0.28 + 0.08 * (i % 2));
      t.h = u * (34 + i * 5);
      t.branchY = t.baseY - t.h * 0.62;
    });

    // 草叢(依寬度決定數量,小螢幕自動減量)
    const n = Math.min(150, Math.max(50, (W / 8) | 0));
    this.grass = [];
    for (let i = 0; i < n; i++) {
      this.grass.push({
        x: rand(W), lane: rand(0.05, 0.95),
        h: u * rand(3, 7), phase: rand(TAU), tint: rand(0.85, 1.1),
      });
    }
    // 前景長草(畫在動物前面,製造景深)
    this.frontGrass = [];
    for (let i = 0; i < 26; i++) {
      this.frontGrass.push({ x: rand(W), h: u * rand(8, 15), phase: rand(TAU) });
    }
    // 濕季小花
    this.flowers = [];
    for (let i = 0; i < 30; i++) {
      this.flowers.push({ x: rand(W), lane: rand(0.2, 0.9), c: ['#ff8ab0', '#ffd23f', '#ffffff'][i % 3] });
    }
    // 水窪(大象喝水點)
    this.waterhole = { x: W * 0.7, y: this.horizonY + (H - this.horizonY) * 0.62 };
    // 雨天積水窪(固定 5 處,透明度跟隨 wetness)
    this.puddles = [];
    for (let i = 0; i < 5; i++) {
      this.puddles.push({
        x: rand(W * 0.1, W * 0.9),
        y: this.horizonY + (H - this.horizonY) * rand(0.55, 0.92),
        rx: u * rand(10, 24), ry: u * rand(2.5, 5),
      });
    }
    // 雲:三種速度 → 視差
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      this.clouds.push({
        x: rand(W), y: H * rand(0.05, 0.32),
        s: u * rand(9, 20), v: u * rand(1.5, 5), seed: rand(TAU),
      });
    }
    // 鳥(晴天/濕季才出現)
    this.birds = [];
    for (let i = 0; i < 3; i++) {
      this.birds.push({ x: rand(W), y: H * rand(0.12, 0.3), v: u * rand(14, 22), phase: rand(TAU) });
    }
    this._skyKey = this._gndKey = '';
  }

  _makeRidge(W, baseY, maxH, points, rough) {
    const pts = [];
    for (let i = 0; i <= points; i++) {
      const x = (W * i) / points;
      const y = baseY - maxH * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + rough * 3)) ) * rand(0.7, 1);
      pts.push({ x, y });
    }
    pts[0].y = baseY - maxH * 0.3;
    pts[points].y = baseY - maxH * 0.35;
    return pts;
  }

  update(dt, env) {
    this.t += dt;
    const windF = 0.3 + env.weather.cur.wind * 0.5;
    for (const c of this.clouds) {
      c.x += c.v * windF * dt;
      if (c.x - c.s * 3 > env.W) c.x = -c.s * 3;
    }
    const birdsOut = env.weather.cur.coverage < 0.45 && env.weather.cur.sun > 0.25;
    for (const b of this.birds) {
      b.active = birdsOut;
      if (!birdsOut) continue;
      b.x += b.v * dt;
      if (b.x > env.W + 20) { b.x = -20; b.y = env.H * rand(0.12, 0.3); }
    }
  }

  /* 天空漸層做快取:顏色沒變就不重建 gradient 物件 */
  _skyGradient(ctx, env) {
    const p = this.pal;
    const key = `${p.skyTop}|${p.skyBot}|${env.H}`;
    if (key !== this._skyKey) {
      this._skyKey = key;
      const g = ctx.createLinearGradient(0, 0, 0, this.horizonY);
      g.addColorStop(0, cssRgb(p.skyTop));
      g.addColorStop(1, cssRgb(p.skyBot));
      this._skyGrad = g;
    }
    return this._skyGrad;
  }

  drawBack(ctx, env) {
    const { W, H, u } = env;
    const p = this.pal;
    const wx = env.weather.cur;
    const hy = this.horizonY;

    /* ---- 天空 ---- */
    ctx.fillStyle = this._skyGradient(ctx, env);
    ctx.fillRect(0, 0, W, hy + 1);

    /* ---- 太陽(光線緩慢旋轉;陰天時淡出) ---- */
    const sunA = wx.sun * (1 - wx.darkness * 0.9);
    if (sunA > 0.02) {
      const sx = W * 0.78, sy = H * 0.16, sr = u * 15;
      ctx.save();
      ctx.globalAlpha = sunA;
      const glow = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 3.2);
      glow.addColorStop(0, 'rgba(255,244,200,0.9)');
      glow.addColorStop(1, 'rgba(255,244,200,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - sr * 3.2, sy - sr * 3.2, sr * 6.4, sr * 6.4);
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,190,0.7)';
      ctx.lineWidth = u * 1.2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = this.t * 0.15 + (i * TAU) / 8;
        ctx.moveTo(sx + Math.cos(a) * sr * 1.35, sy + Math.sin(a) * sr * 1.35);
        ctx.lineTo(sx + Math.cos(a) * sr * 1.8, sy + Math.sin(a) * sr * 1.8);
      }
      ctx.stroke();
      ctx.restore();
    }

    /* ---- 雲(依 coverage 決定可見數量與暗度,視差漂移) ---- */
    const visible = Math.ceil(this.clouds.length * clamp(wx.coverage, 0, 1));
    const cloudDark = clamp(wx.darkness * 1.4 + wx.coverage * 0.25, 0, 0.9);
    for (let i = 0; i < visible; i++) {
      const c = this.clouds[i];
      const base = mixRgb([255, 255, 255], [70, 75, 90], cloudDark);
      ctx.fillStyle = cssRgba(base, 0.92);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.s * 1.6, c.s * 0.55, 0, 0, TAU);
      ctx.ellipse(c.x - c.s * 0.9, c.y + c.s * 0.12, c.s * 0.9, c.s * 0.42, 0, 0, TAU);
      ctx.ellipse(c.x + c.s * 0.8, c.y + c.s * 0.1, c.s, c.s * 0.45, 0, 0, TAU);
      ctx.fill();
    }

    /* ---- 遠山兩層(雪季山頂積雪) ---- */
    this._drawRidge(ctx, this.ridgeFar, hy, p.mtnFar, env.weather.snowCover * 0.7, u);
    this._drawRidge(ctx, this.ridgeNear, hy, p.mtnNear, env.weather.snowCover * 0.5, u);

    /* ---- 地面 ---- */
    const gndKey = `${p.grassA}|${p.grassB}|${H}`;
    if (gndKey !== this._gndKey) {
      this._gndKey = gndKey;
      const g = ctx.createLinearGradient(0, hy, 0, H);
      g.addColorStop(0, cssRgb(p.grassA));
      g.addColorStop(1, cssRgb(p.grassB));
      this._gndGrad = g;
    }
    ctx.fillStyle = this._gndGrad;
    ctx.fillRect(0, hy, W, H - hy);

    /* ---- 水窪(濕季變大、雨天略增;大象喝水點) ---- */
    const wh = this.waterhole;
    const wr = u * (26 + 14 * env.season.blend) * (1 + env.weather.wetness * 0.15);
    ctx.fillStyle = cssRgb(shadeRgb(p.ground, 0.9));
    ctx.beginPath(); ctx.ellipse(wh.x, wh.y, wr * 1.18, wr * 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = cssRgb(p.water);
    ctx.beginPath(); ctx.ellipse(wh.x, wh.y, wr, wr * 0.24, 0, 0, TAU); ctx.fill();
    // 水面高光 + 漣漪
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(0.7, u * 0.7);
    ctx.beginPath();
    ctx.ellipse(wh.x - wr * 0.2, wh.y - wr * 0.05, wr * 0.4, wr * 0.08, 0, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
    const rip = (this.t * 0.4) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.3 * (1 - rip)})`;
    ctx.beginPath(); ctx.ellipse(wh.x, wh.y, wr * rip, wr * 0.24 * rip, 0, 0, TAU); ctx.stroke();

    /* ---- 雨天積水(次要效果:跟隨 wetness 淡入) ---- */
    if (env.weather.wetness > 0.05) {
      for (const pd of this.puddles) {
        ctx.fillStyle = cssRgba(p.water, env.weather.wetness * 0.55);
        ctx.beginPath(); ctx.ellipse(pd.x, pd.y, pd.rx, pd.ry, 0, 0, TAU); ctx.fill();
      }
    }

    /* ---- 濕季小花 ---- */
    if (env.season.blend > 0.4) {
      for (const f of this.flowers) {
        const fy = hy + (H - hy) * (0.1 + f.lane * 0.8);
        ctx.fillStyle = f.c;
        ctx.globalAlpha = (env.season.blend - 0.4) * 1.4;
        ctx.beginPath(); ctx.arc(f.x, fy, u * 1.1, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* ---- 草叢(批次成兩個 path:遠/近,隨風搖擺) ---- */
    const sway = wx.wind * u * 2.2;
    ctx.lineWidth = Math.max(0.7, u * 0.8);
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = cssRgb(shadeRgb(pass === 0 ? p.grassA : p.grassB, pass === 0 ? 0.95 : 1));
      ctx.beginPath();
      for (const g of this.grass) {
        if ((pass === 0) !== (g.lane < 0.5)) continue;
        const gy = hy + (H - hy) * (0.08 + g.lane * 0.84);
        const bend = Math.sin(this.t * 1.6 + g.phase) * sway;
        ctx.moveTo(g.x, gy);
        ctx.quadraticCurveTo(g.x + bend * 0.4, gy - g.h * 0.6, g.x + bend, gy - g.h);
      }
      ctx.stroke();
    }

    /* ---- 金合歡樹 ---- */
    for (const t of this.trees) this._drawTree(ctx, t, p, env);

    /* ---- 鳥(簡單兩筆振翅) ---- */
    ctx.strokeStyle = 'rgba(40,40,50,0.8)';
    ctx.lineWidth = Math.max(0.8, u * 0.9);
    ctx.beginPath();
    for (const b of this.birds) {
      if (!b.active) continue;
      const w = Math.sin(this.t * 9 + b.phase) * u * 2.2;
      ctx.moveTo(b.x - u * 3, b.y);
      ctx.quadraticCurveTo(b.x - u * 1.2, b.y - u * 2 - w, b.x, b.y);
      ctx.quadraticCurveTo(b.x + u * 1.2, b.y - u * 2 - w, b.x + u * 3, b.y);
    }
    ctx.stroke();

    /* ---- 積雪覆蓋(雪季白化) ---- */
    if (env.weather.snowCover > 0.02) {
      ctx.fillStyle = `rgba(240,244,250,${env.weather.snowCover * 0.55})`;
      ctx.fillRect(0, hy, W, H - hy);
    }
  }

  _drawRidge(ctx, pts, baseY, color, snow, u) {
    ctx.fillStyle = cssRgb(color);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, baseY);
    for (const pt of pts) ctx.lineTo(pt.x, pt.y);
    ctx.lineTo(pts[pts.length - 1].x, baseY);
    ctx.closePath();
    ctx.fill();
    if (snow > 0.05) {
      ctx.strokeStyle = `rgba(245,248,252,${snow})`;
      ctx.lineWidth = u * 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
  }

  _drawTree(ctx, t, p, env) {
    const u = env.u;
    const swayX = Math.sin(this.t * 0.9 + t.phase) * u * 1.2;
    // 樹幹(兩筆分叉)
    ctx.strokeStyle = cssRgb(p.trunk);
    ctx.lineCap = 'round';
    ctx.lineWidth = u * 2.6;
    ctx.beginPath();
    ctx.moveTo(t.x, t.baseY);
    ctx.quadraticCurveTo(t.x - u * 2, t.baseY - t.h * 0.4, t.x - u * 5 + swayX, t.baseY - t.h * 0.62);
    ctx.moveTo(t.x, t.baseY);
    ctx.quadraticCurveTo(t.x + u * 2, t.baseY - t.h * 0.45, t.x + u * 5 + swayX, t.baseY - t.h * 0.66);
    ctx.stroke();
    // 平頂樹冠(金合歡特色)
    const cy = t.baseY - t.h * 0.72;
    ctx.fillStyle = cssRgb(p.canopy);
    ctx.beginPath();
    ctx.ellipse(t.x + swayX, cy, t.h * 0.52, t.h * 0.16, 0, 0, TAU);
    ctx.ellipse(t.x - t.h * 0.22 + swayX, cy + t.h * 0.05, t.h * 0.3, t.h * 0.11, 0, 0, TAU);
    ctx.ellipse(t.x + t.h * 0.24 + swayX, cy + t.h * 0.04, t.h * 0.28, t.h * 0.1, 0, 0, TAU);
    ctx.fill();
    if (env.weather.snowCover > 0.25) {
      ctx.fillStyle = `rgba(245,248,252,${env.weather.snowCover * 0.6})`;
      ctx.beginPath();
      ctx.ellipse(t.x + swayX, cy - t.h * 0.03, t.h * 0.45, t.h * 0.08, 0, Math.PI, TAU);
      ctx.fill();
    }
  }

  /* 前景長草:畫在動物與粒子之前? 之後 → 製造景深 */
  drawFront(ctx, env) {
    const { H, u } = env;
    const sway = env.weather.cur.wind * u * 3;
    ctx.strokeStyle = cssRgb(shadeRgb(this.pal.grassB, 0.75));
    ctx.lineWidth = Math.max(0.8, u);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const g of this.frontGrass) {
      const gy = H + 2;
      const bend = Math.sin(this.t * 1.4 + g.phase) * sway;
      ctx.moveTo(g.x, gy);
      ctx.quadraticCurveTo(g.x + bend * 0.4, gy - g.h * 0.55, g.x + bend, gy - g.h);
    }
    ctx.stroke();
  }
}

/* =========================================================
 * 閃電系統
 *
 * 安全區演算法(pickSafeStrikeX):
 * 1. 把畫面水平切成 N 個候選落雷點;
 * 2. 對每個候選點,計算它與「所有動物」的淨水平距離
 *    (|x − animal.x| − 動物半寬),取最小值作為該點危險度;
 * 3. 選危險度最大(= 離所有動物最遠)的點,加少量抖動避免死板;
 * 4. 若最佳點仍小於最小安全距離 SAFE → 回傳 -1,本輪**不落雷**
 *    (改打雲內閃光),因此閃電**永遠不會擊中動物**。
 * ========================================================= */
function pickSafeStrikeX(animals, W, u) {
  const SAFE = Math.max(46, u * 80); // 最小安全距離(px)
  const MARGIN = W * 0.05;
  const N = 28;
  let bestX = -1, bestScore = -Infinity, bestTrueD = -Infinity;
  for (let i = 0; i <= N; i++) {
    const x = MARGIN + ((W - 2 * MARGIN) * i) / N;
    let d = Infinity;
    for (const a of animals) {
      const dist = Math.abs(x - a.x) - (a.halfWpx || a.halfW);
      if (dist < d) d = dist;
    }
    // 用「真實距離 + 小抖動」排序避免落點死板,
    // 但最終以**真實距離**驗證,保證安全距離不因抖動縮水
    const score = d + rand(10);
    if (score > bestScore) { bestScore = score; bestX = x; bestTrueD = d; }
  }
  return bestTrueD >= SAFE ? bestX : -1;
}

class LightningSystem {
  constructor() {
    this.timer = rand(1.5, 3);
    this.bolts = [];   // 少量物件,不需池化
    this.flash = 0;    // 螢幕閃光包絡(0..1)
  }
  update(dt, env, active) {
    this.flash = Math.max(0, this.flash - dt * 2.6);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
    if (!active) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = rand(2.2, 5.5);
      const x = pickSafeStrikeX(env.animals, env.W, env.u);
      if (x >= 0) {
        this._strike(x, env);
        this.flash = 1;
        env.onFlash(); // 動物受驚
      } else {
        this.flash = 0.65; // 找不到安全落點 → 雲內閃光(無落地雷)
      }
    }
  }
  /* 中點位移法生成曲折雷電 + 1~2 條分支 */
  _strike(x, env) {
    const y0 = env.H * 0.28;
    const y1 = env.horizonY + env.H * rand(0.02, 0.1);
    const segs = [{ x1: x, y1: y0, x2: x, y2: y1 }];
    for (let it = 0; it < 4; it++) {
      for (let i = segs.length - 1; i >= 0; i--) {
        const s = segs[i];
        const mx = (s.x1 + s.x2) / 2 + rand(-1, 1) * env.u * 9 * (1 - (s.y1 - y0) / (y1 - y0) * 0.4);
        const my = (s.y1 + s.y2) / 2;
        segs.splice(i, 1, { x1: s.x1, y1: s.y1, x2: mx, y2: my }, { x1: mx, y1: my, x2: s.x2, y2: s.y2 });
      }
    }
    const branches = [];
    const nb = Math.random() < 0.6 ? 1 : 2;
    for (let b = 0; b < nb; b++) {
      const src = segs[(rand(segs.length * 0.4, segs.length * 0.8)) | 0];
      branches.push({ x1: src.x1, y1: src.y1, x2: src.x1 + rand(-1, 1) * env.u * 22, y2: src.y1 + env.H * rand(0.05, 0.12) });
    }
    this.bolts.push({ segs, branches, life: 0.22, maxLife: 0.22 });
  }
  draw(ctx, env) {
    for (const b of this.bolts) {
      const a = clamp(b.life / b.maxLife, 0, 1);
      // 外層暈光 + 內層亮芯
      ctx.lineCap = 'round';
      for (const pass of [[env.u * 3.4, 0.25], [env.u * 1.4, 0.95]]) {
        ctx.strokeStyle = `rgba(255,255,235,${a * pass[1]})`;
        ctx.lineWidth = Math.max(0.8, pass[0]);
        ctx.beginPath();
        for (const s of b.segs) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
        for (const s of b.branches) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
        ctx.stroke();
      }
    }
  }
}

/* =========================================================
 * 龍捲風
 *
 * 追逐演算法:
 * 每幀找出水平距離最近的動物,以其方向為目標速度;
 * 實際速度用 lerp 逼近目標(模擬慣性,不會瞬間轉向),
 * 且 chase 速度刻意慢於動物逃跑速度 → 「追得到方向、追不到獵物」。
 * ========================================================= */
class Tornado {
  constructor() {
    this.x = 0;
    this.vx = 0;
    this.mix = 0;      // 0..1 成形程度
    this.phase = 0;
    this.baseY = 0;
    this.scareRadius = 0;
    this._init = false;
  }
  update(dt, env, active) {
    this.mix = approach(this.mix, active ? 1 : 0, dt, 0.9);
    if (this.mix < 0.02) { this._init = false; return; }
    if (!this._init) { this.x = env.W * 0.5; this._init = true; }
    this.phase += dt * 7;
    this.baseY = env.horizonY + (env.H - env.horizonY) * 0.78;

    // 追逐最近動物
    let best = Infinity, tx = null;
    for (const a of env.animals) {
      const d = Math.abs(a.x - this.x);
      if (d < best) { best = d; tx = a.x; }
    }
    if (tx !== null) {
      const chase = env.u * 11; // 慢於動物逃跑速度(≈ u*20+)
      const desired = Math.sign(tx - this.x) * chase;
      this.vx = lerp(this.vx, desired, Math.min(1, dt * 0.7));
    }
    this.x = clamp(this.x + this.vx * dt, env.W * 0.06, env.W * 0.94);
    this.scareRadius = env.u * 120;
  }
  draw(ctx, env) {
    if (this.mix < 0.02) return;
    const u = env.u;
    const H = env.H;
    const topY = H * 0.28;
    const layers = 14;
    // 頂部烏雲(漏斗從雲底伸出)
    ctx.fillStyle = `rgba(66,70,82,${0.55 * this.mix})`;
    ctx.beginPath();
    ctx.ellipse(this.x, topY, u * 62 * this.mix, u * 13, 0, 0, TAU);
    ctx.ellipse(this.x - u * 30 * this.mix, topY + u * 4, u * 34 * this.mix, u * 9, 0, 0, TAU);
    ctx.fill();
    // 漏斗主體:層層橢圓由底到頂放大 + 水平搖擺;
    // 暗核心 + 亮沙塵邊,製造旋轉體積感
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1); // 0=底, 1=頂
      const y = lerp(this.baseY, topY, t);
      const w = lerp(u * 7, u * 52, Math.pow(t, 1.6)) * this.mix;
      const wob = Math.sin(this.phase * 0.9 + i * 0.55) * u * 3.2 * (0.2 + t);
      ctx.fillStyle = `rgba(94,86,70,${(0.4 + t * 0.22) * this.mix})`;
      ctx.beginPath();
      ctx.ellipse(this.x + wob, y, w, u * 6.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(168,152,118,${(0.24 + t * 0.12) * this.mix})`;
      ctx.beginPath();
      ctx.ellipse(this.x + wob - w * 0.28, y - u * 1.4, w * 0.52, u * 4, 0, 0, TAU);
      ctx.fill();
    }
    // 底部塵埃圈(被捲起的沙塵)
    ctx.fillStyle = `rgba(150,128,92,${0.42 * this.mix})`;
    ctx.beginPath();
    ctx.ellipse(this.x, this.baseY + u * 1.5, u * 32 * this.mix, u * 6.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(120,102,72,${0.3 * this.mix})`;
    ctx.beginPath();
    ctx.ellipse(this.x, this.baseY + u * 1, u * 18 * this.mix, u * 4, 0, 0, TAU);
    ctx.fill();
  }
}
