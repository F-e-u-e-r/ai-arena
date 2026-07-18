'use strict';
/* =========================================================
 * 野生動物:獅子(群居)/ 大象(家族群)/ 豹(獨行)
 *
 * 行為模型:
 * - 群體(AnimalGroup):領頭者決定群體 x 與狀態(WALK/REST/DRINK),
 *   成員以 offset 跟隨,offset 受季節 cluster 因子縮放
 *   (乾季更群聚、濕季更分散)。
 * - 個體(豹):自己的狀態機(WALK/CLIMB/SIT),靠近金合歡樹時
 *   有機率攀爬(垂直動畫)。
 * - 逃逸:龍捲風靠近時全場動物朝反方向加速(可短暫向左),
 *   不停止、不重置位置;閃電時受驚加速。
 * ========================================================= */

const ST = { WALK: 'walk', REST: 'rest', DRINK: 'drink', CLIMB_UP: 'up', SIT: 'sit', CLIMB_DOWN: 'down' };
const WRAP_MARGIN_U = 45; // 出場/進場邊界(u)

/* ---------- 腿:單一關節腿,walkPhase 驅動前後擺動 ---------- */
function drawLeg(ctx, hipX, hipY, len, swing, lw, color) {
  const footX = hipX + swing;
  const footY = 0;
  const kneeX = hipX + swing * 0.4;
  const kneeY = -len * 0.55 - Math.abs(swing) * 0.25;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
  ctx.stroke();
}

class Animal {
  constructor(kind, lane, opts = {}) {
    this.kind = kind;
    this.lane = lane;
    this.x = opts.x !== undefined ? opts.x : rand(-30, 30);
    this.variant = rand(0.92, 1.08);       // 個體大小差異
    this.baseSpeed = opts.speed;           // u/s
    this.phase = rand(TAU);                // 步態相位
    this.state = ST.WALK;
    this.stateT = 0;
    this.lieT = 0;                         // 0 站立 ↔ 1 躺臥(平滑)
    this.drinkT = 0;                       // 大象:鼻子入水程度
    this.trunkT = 0;                       // 大象:抬鼻計時
    this.climbH = 0;                       // 豹:0 地面 ↔ 1 樹上
    this.tree = null;
    this.climbCd = rand(6, 14);
    this.startleT = 0;
    this.fleeT = 0;
    this.fleeDir = 1;
    this.restDelay = 0;
    this.mood = '';
    this.scale = 1;
    this.y = 0;
    this.halfW = 10;
    this.tailPhase = rand(TAU);
  }

  /* 每幀開頭:由 lane 推算縮放與地面 y(偽 3D 深度) */
  place(env) {
    this.scale = (0.6 + this.lane * 0.7) * this.variant;
    this.y = env.horizonY + (env.H - env.horizonY) * (0.12 + this.lane * 0.82);
    this.su = this.scale * env.u; // 單位空間 → px
    this.halfWpx = this.halfW * this.su; // 閃電安全區用的實際半寬(px)
  }

  /* 逃逸/受驚:回傳速度倍率與方向(不停止、不重置) */
  _fleeBoost(dt, env) {
    this.fleeT = Math.max(0, this.fleeT - dt);
    this.startleT = Math.max(0, this.startleT - dt);
    const tor = env.tornado;
    if (tor && tor.mix > 0.4 && Math.abs(this.x - tor.x) < tor.scareRadius) {
      this.fleeT = 0.35;
      this.fleeDir = Math.sign(this.x - tor.x) || 1;
    }
    if (this.fleeT > 0) return 1.8 * this.fleeDir;
    if (this.startleT > 0) return 1.5;
    return 1;
  }

  _moodForState() {
    if (this.fleeT > 0) return '💨';
    if (this.startleT > 0) return '❗';
    switch (this.state) {
      case ST.REST: return '💤';
      case ST.DRINK: return '💧';
      case ST.CLIMB_UP: case ST.CLIMB_DOWN: case ST.SIT: return '🌳';
      default: return this.trunkT > 0 ? '💦' : '';
    }
  }

  _drawMood(ctx) {
    if (!this.mood) return;
    // 以「固定螢幕大小」繪製:字型大小用縮放反推,小嵌入窗也可讀
    ctx.font = `${11 / this.su}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(this.mood, 0, this._moodY());
  }
  _moodY() { return -26; }
}

/* =========================================================
 * 獅子:群體移動、偶爾休息或慢速巡邏,速度較慢
 * ========================================================= */
class Lion extends Animal {
  constructor(lane, opts = {}) {
    super('lion', lane, { speed: 13, ...opts });
    this.male = !!opts.male;
    this.halfW = 13;
  }
  update(dt, env, moving) {
    this.phase += dt * (1.5 + this.moveAmp * 7);
    this.lieT = approach(this.lieT, this.state === ST.REST && this.restDelay <= 0 ? 1 : 0, dt, 3.5);
    this.restDelay = Math.max(0, this.restDelay - dt);
    this.mood = this._moodForState();
  }
  _moodY() { return -24; }
  draw(ctx, env) {
    const s = this.su;
    const lie = this.lieT;
    const bodyY = -9 - 5.5 + lie * 6.5;   // 躺下時身體貼地
    const swing = Math.sin(this.phase) * 2.6 * (1 - lie) * this.moveAmp;
    const swing2 = Math.sin(this.phase + Math.PI) * 2.6 * (1 - lie) * this.moveAmp;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(s, s);
    ctx.lineCap = 'round';

    const body = '#c99a58', belly = '#ddb87e', dark = '#a87c42';
    const mane = '#7b4a26', maneDark = '#5f3a1e';

    // 尾巴(擺動 + 末端毛球)
    const tw = Math.sin(env.time * 2.2 + this.tailPhase) * 2.2;
    ctx.strokeStyle = body;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-12.5, bodyY - 2);
    ctx.quadraticCurveTo(-18, bodyY - 4 + tw, -19.5, bodyY + 1 + tw);
    ctx.stroke();
    ctx.fillStyle = maneDark;
    ctx.beginPath(); ctx.arc(-19.5, bodyY + 1 + tw, 1.7, 0, TAU); ctx.fill();

    // 遠側兩腿(較暗)
    if (lie < 0.6) {
      drawLeg(ctx, -7, bodyY + 3, 9, swing2 * 0.8, 2.1, dark);
      drawLeg(ctx, 6.5, bodyY + 3, 9, swing * 0.8, 2.1, dark);
    }
    // 身體
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, bodyY, 13, 6.5 - lie, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(-1, bodyY + 2.5, 9.5, 4, 0, 0, TAU); ctx.fill();
    // 近側兩腿
    if (lie < 0.6) {
      drawLeg(ctx, -5.5, bodyY + 3.5, 9, swing, 2.4, body);
      drawLeg(ctx, 8, bodyY + 3.5, 9, swing2, 2.4, body);
    }
    // 頭部:公獅有鬃毛(鬃毛在頭後,頭部畫在最上層)
    const hx = 12.5, hy = bodyY - 4.5 - lie * 1.5;
    if (this.male) {
      ctx.fillStyle = mane;
      ctx.beginPath(); ctx.arc(hx - 5.5, hy - 0.5, 6.4, 0, TAU); ctx.fill();
      ctx.fillStyle = maneDark;
      ctx.beginPath(); ctx.arc(hx - 6.5, hy + 1, 4.6, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(hx, hy, 4.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 2.2, hy - 3.6, 1.3, 0, TAU); ctx.fill(); // 耳
    ctx.beginPath(); ctx.arc(hx + 1.8, hy - 3.8, 1.3, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.arc(hx + 2.8, hy + 1.3, 2, 0, TAU); ctx.fill(); // 吻部
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(hx + 4.2, hy + 0.4, 0.65, 0, TAU); ctx.fill(); // 鼻
    if (this.state === ST.REST) { // 閉眼
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(hx + 0.6, hy - 1); ctx.lineTo(hx + 2.2, hy - 1); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(hx + 1.2, hy - 1.2, 0.55, 0, TAU); ctx.fill();
    }
    this._drawMood(ctx);
    ctx.restore();
  }
}

/* =========================================================
 * 大象:成群緩慢移動、偶爾喝水或抬鼻,體型最大
 * ========================================================= */
class Elephant extends Animal {
  constructor(lane, opts = {}) {
    super('elephant', lane, { speed: 7.5, ...opts });
    this.halfW = 22;
    this.earPhase = rand(TAU);
  }
  update(dt, env, moving) {
    this.phase += dt * (1 + this.moveAmp * 3.5);
    this.drinkT = approach(this.drinkT, this.state === ST.DRINK ? 1 : 0, dt, 2.5);
    this.trunkT = Math.max(0, this.trunkT - dt);
    // 行走中偶爾抬鼻(頻率跟隨活躍度)
    if (this.state === ST.WALK && this.trunkT <= 0 && chance(dt * 0.09 * env.activity)) {
      this.trunkT = rand(1.5, 2.5);
    }
    this.mood = this._moodForState();
  }
  _moodY() { return -42; }
  draw(ctx, env) {
    const s = this.su;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(s, s);
    ctx.lineCap = 'round';

    const body = '#9b9ba4', dark = '#7f7f8a', darker = '#6d6d78';
    const bodyY = -15 - 10;
    const swing = Math.sin(this.phase) * 1.8 * this.moveAmp;
    const swing2 = Math.sin(this.phase + Math.PI) * 1.8 * this.moveAmp;

    // 尾巴
    const tw = Math.sin(env.time * 1.8 + this.tailPhase) * 2;
    ctx.strokeStyle = dark; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-21.5, bodyY - 3);
    ctx.quadraticCurveTo(-25, bodyY + 4 + tw, -24, bodyY + 9 + tw);
    ctx.stroke();
    ctx.fillStyle = darker;
    ctx.beginPath(); ctx.arc(-24, bodyY + 9.5 + tw, 1.4, 0, TAU); ctx.fill();

    // 遠側腿
    drawLeg(ctx, -13, bodyY + 6, 15, swing2 * 0.8, 4.2, dark);
    drawLeg(ctx, 11, bodyY + 6, 15, swing * 0.8, 4.2, dark);
    // 身體
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, bodyY, 22, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(-2, bodyY + 5, 17, 7.5, 0, 0, TAU); ctx.fill();
    // 近側腿
    drawLeg(ctx, -10, bodyY + 7, 15, swing, 4.8, body);
    drawLeg(ctx, 14, bodyY + 7, 15, swing2, 4.8, body);

    // 耳朵(搧動)
    const flap = 1 + Math.sin(env.time * 1.8 + this.earPhase) * 0.13;
    ctx.fillStyle = '#8d8d98';
    ctx.beginPath(); ctx.ellipse(13.5, bodyY - 3, 6.5 * flap, 8, 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c9a0a0';
    ctx.beginPath(); ctx.ellipse(13.8, bodyY - 2.6, 4.2 * flap, 5.6, 0.15, 0, TAU); ctx.fill();
    // 頭
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(19.5, bodyY - 2, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a3a44';
    ctx.beginPath(); ctx.arc(22.5, bodyY - 4.5, 0.8, 0, TAU); ctx.fill();
    // 象牙
    ctx.strokeStyle = '#efe8d8'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(24.5, bodyY + 2.5); ctx.quadraticCurveTo(28, bodyY + 4.5, 29.5, bodyY + 2.8); ctx.stroke();

    /* 象鼻:依 drinkT / trunkT 在「下垂 ↔ 喝水 ↔ 高舉」間平滑插值 */
    const hang = { x: 27.5 + Math.sin(env.time * 1.3 + this.tailPhase) * 1.2, y: -3 };
    const drink = { x: 29, y: 1.5 };
    const up = { x: 28.5, y: bodyY - 14 };
    let tip;
    if (this.trunkT > 0) tip = up;
    else tip = { x: lerp(hang.x, drink.x, this.drinkT), y: lerp(hang.y, drink.y, this.drinkT) };
    const bx = 25.5, by = bodyY - 4;
    const mx = (bx + tip.x) / 2 + 1.5, my = (by + tip.y) / 2;
    ctx.strokeStyle = body; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(mx, my, tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo((mx + tip.x) / 2, (my + tip.y) / 2, tip.x, tip.y); ctx.stroke();
    // 抬鼻噴水(小水滴弧)
    if (this.trunkT > 0) {
      ctx.strokeStyle = 'rgba(160,200,230,0.75)';
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) {
        const a = -0.9 + i * 0.35 + Math.sin(env.time * 6) * 0.08;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.quadraticCurveTo(tip.x + Math.cos(a) * 5, tip.y + Math.sin(a) * 5 - 2, tip.x + Math.cos(a) * 8, tip.y + Math.sin(a) * 8 + 4);
        ctx.stroke();
      }
    }
    this._drawMood(ctx);
    ctx.restore();
  }
}

/* =========================================================
 * 豹:單獨、快速且隱密移動,偶爾攀爬金合歡樹
 * ========================================================= */
class Leopard extends Animal {
  constructor(lane, opts = {}) {
    super('leopard', lane, { speed: 24, ...opts });
    this.halfW = 11;
    // 預先決定的斑點位置(避免每幀亂數閃爍)
    this.spots = [];
    for (let i = 0; i < 13; i++) {
      this.spots.push({ x: rand(-9, 8), y: rand(-2.8, 2.2), r: rand(0.5, 0.9), ring: chance(0.4) });
    }
  }
  _moodY() { return -18; }
  update(dt, env) {
    this.climbCd -= dt;
    const boost = this._fleeBoost(dt, env);
    const calm = !env.weather.def.lightning && !env.weather.def.tornado;
    this.moveAmp = 1;

    switch (this.state) {
      case ST.WALK: {
        // 隱密快速移動;濕季更活躍(由 env.speedMul 反映)
        this.x += this.baseSpeed * env.speedMul * boost * env.u * dt;
        this.phase += dt * (2 + Math.abs(boost) * 4);
        // 靠近樹且冷卻結束 → 攀爬(雪天與風雨天不爬)
        if (calm && this.climbCd <= 0) {
          for (const t of env.bg.trees) {
            if (Math.abs(this.x - t.x) < env.u * 7 && chance(0.55 * env.activity)) {
              this.state = ST.CLIMB_UP;
              this.tree = t;
              break;
            }
          }
        }
        break;
      }
      case ST.CLIMB_UP: {
        // 垂直攀爬:貼到樹幹並向上
        this.x = approach(this.x, this.tree.x, dt, 6);
        this.climbH = approach(this.climbH, 1, dt, 1.4);
        this.phase += dt * 8;
        this.moveAmp = 0.7;
        if (this.climbH > 0.97) { this.state = ST.SIT; this.stateT = rand(2.5, 5.5); }
        break;
      }
      case ST.SIT: {
        this.stateT -= dt;
        this.moveAmp = 0;
        if (this.stateT <= 0) this.state = ST.CLIMB_DOWN;
        break;
      }
      case ST.CLIMB_DOWN: {
        this.climbH = approach(this.climbH, 0, dt, 1.8);
        this.moveAmp = 0.7;
        if (this.climbH < 0.03) {
          this.climbH = 0;
          this.state = ST.WALK;
          this.climbCd = rand(10, 22);
          this.tree = null;
        }
        break;
      }
    }
    // 無縫循環:右側離場 → 左側重新進入
    const margin = WRAP_MARGIN_U * env.u;
    if (this.x > env.W + margin) this.x = -margin;
    if (this.x < -margin) this.x = -margin; // 逃逸左移不越界
    this.mood = this._moodForState();
  }
  draw(ctx, env) {
    const s = this.su;
    ctx.save();
    if (this.climbH > 0 && this.tree) {
      // 樹上:位置沿樹幹垂直插值,身體隨攀爬旋轉
      const ty = lerp(this.y, this.tree.branchY, this.climbH);
      ctx.translate(this.tree.x + 2 * this.su, ty);
      ctx.rotate(-Math.PI / 2.3 * Math.sin(this.climbH * Math.PI));
      ctx.scale(s, s);
    } else {
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
    }
    ctx.lineCap = 'round';

    const body = '#d9a84e', belly = '#ecd3a0', dark = '#b0803a', spotC = '#6b4a22';
    const bodyY = -6.5 - 3.5;
    const crouch = this.state === ST.WALK ? Math.sin(this.phase * 0.5) * 0.5 : 0;
    const swing = Math.sin(this.phase) * 3 * this.moveAmp;
    const swing2 = Math.sin(this.phase + Math.PI) * 3 * this.moveAmp;

    // 長尾巴(尾端上翹)
    const tw = Math.sin(env.time * 2.6 + this.tailPhase) * 2.4;
    ctx.strokeStyle = body; ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-10.5, bodyY - 1);
    ctx.quadraticCurveTo(-16, bodyY - 2 + tw * 0.4, -17.5, bodyY - 6 + tw);
    ctx.stroke();
    ctx.strokeStyle = spotC; ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-16.4, bodyY - 4.4 + tw * 0.8);
    ctx.quadraticCurveTo(-17.2, bodyY - 5.4 + tw, -17.5, bodyY - 6 + tw);
    ctx.stroke();

    // 遠側腿
    drawLeg(ctx, -6, bodyY + 2, 6.5, swing2 * 0.8, 1.7, dark);
    drawLeg(ctx, 5.5, bodyY + 2, 6.5, swing * 0.8, 1.7, dark);
    // 身體(低伏 + 斑點)
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, bodyY + crouch, 11, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(-0.5, bodyY + 1.6 + crouch, 8, 2.4, 0, 0, TAU); ctx.fill();
    for (const sp of this.spots) {
      ctx.fillStyle = spotC;
      ctx.beginPath(); ctx.arc(sp.x, bodyY + sp.y + crouch, sp.r, 0, TAU); ctx.fill();
      if (sp.ring) {
        ctx.strokeStyle = spotC; ctx.lineWidth = 0.45;
        ctx.beginPath(); ctx.arc(sp.x, bodyY + sp.y + crouch, sp.r + 0.55, 0.4, 2.6); ctx.stroke();
      }
    }
    // 近側腿
    drawLeg(ctx, -4.5, bodyY + 2.5, 6.5, swing, 1.9, body);
    drawLeg(ctx, 7, bodyY + 2.5, 6.5, swing2, 1.9, body);
    // 頭
    const hx = 10, hy = bodyY - 2.6 + crouch;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 1.8, hy - 2.6, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx + 1.4, hy - 2.8, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.arc(hx + 2.1, hy + 0.9, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(hx + 3.1, hy + 0.3, 0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx + 0.9, hy - 0.9, 0.45, 0, TAU); ctx.fill();

    this._drawMood(ctx);
    ctx.restore();
  }
}

/* =========================================================
 * 群體(獅群 / 象群):領頭者狀態機 + 成員跟隨
 * ========================================================= */
class AnimalGroup {
  constructor(kind, members, spacingU) {
    this.kind = kind;
    this.members = members;
    this.spacingU = spacingU;
    this.x = members[0].x;
    this.state = ST.WALK;
    this.stateT = 0;
    this.thinkT = rand(3, 7);
    this.speedJit = 1;
    this.v = 0; // 目前速度(平滑加減速)
    members.forEach((m, i) => {
      m.offset = -i * spacingU;     // 跟在領頭者後方
      m.restDelay = i * 0.45;       // 依序躺下,不會同時倒
      m.moveAmp = 1;
    });
  }

  update(dt, env) {
    const lead = this.members[0];
    const boost = lead._fleeBoost(dt, env);
    const calm = !env.weather.def.lightning && !env.weather.def.tornado;

    /* ---- 領頭者思考:依物種習性轉換狀態 ---- */
    if (this.state === ST.WALK && boost === 1) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = rand(4, 9);
        this.speedJit = rand(0.8, 1.2);
        if (this.kind === 'lion') {
          // 獅子:休息機率乾季較高(保存體力),風暴/龍捲風不休息
          const restP = 0.42 * lerp(1.25, 0.55, env.season.blend);
          if (calm && chance(restP)) {
            this.state = ST.REST;
            this.stateT = rand(3, 7);
          }
        } else if (this.kind === 'elephant') {
          // 大象:經過水窪時喝水(乾季更渴),風雨天不停留
          const nearWater = Math.abs(this.x - env.bg.waterhole.x) < env.u * 40;
          const drinkP = 0.65 * lerp(1.3, 0.8, env.season.blend);
          if (calm && nearWater && chance(drinkP)) {
            this.state = ST.DRINK;
            this.stateT = rand(4, 6.5);
          }
        }
      }
    } else if (this.state === ST.REST || this.state === ST.DRINK) {
      this.stateT -= dt;
      if (this.stateT <= 0 || boost !== 1) this.state = ST.WALK; // 受驚立刻起身
    }

    /* ---- 群體移動(平滑加減速) ---- */
    const targetV = (this.state === ST.WALK ? lead.baseSpeed * env.speedMul * this.speedJit : 0) * boost;
    this.v = approach(this.v, targetV, dt, 2.2);
    this.x += this.v * env.u * dt;

    // 無縫循環:整群右出 → 左進(保留成員間距)
    const span = this.spacingU * (this.members.length - 1) * env.u;
    const margin = WRAP_MARGIN_U * env.u;
    if (this.x > env.W + margin + span) this.x -= env.W + margin * 2 + span;
    if (this.x < -margin - span) this.x = -margin - span;

    /* ---- 成員跟隨:offset 受季節群聚因子縮放 ---- */
    const cluster = env.season.cluster;
    for (const m of this.members) {
      const targetX = this.x + m.offset * env.u * cluster;
      // 環繞時距離突變 → 直接吸附,避免成員橫越畫面追隊伍
      if (Math.abs(m.x - targetX) > env.W * 0.5) m.x = targetX;
      else m.x = approach(m.x, targetX, dt, 4);
      m.state = this.state === ST.WALK ? ST.WALK : (boost !== 1 ? ST.WALK : this.state);
      m.moveAmp = clamp(Math.abs(this.v) / (m.baseSpeed || 1), 0, 1.2);
      m.fleeT = lead.fleeT; m.fleeDir = lead.fleeDir; m.startleT = lead.startleT;
      m.update(dt, env, this.v);
    }
  }
}

/* ---------- 建立全場野生動物(≥6:獅×3、象×3、豹×2) ---------- */
function createWildlife(env) {
  const W = env.W;
  const pride = new AnimalGroup('lion', [
    new Lion(0.50, { x: W * 0.30, male: true }),
    new Lion(0.56, { x: W * 0.30 }),
    new Lion(0.53, { x: W * 0.30 }),
  ], 15);
  const herd = new AnimalGroup('elephant', [
    new Elephant(0.18, { x: W * 0.66 }),
    new Elephant(0.25, { x: W * 0.66 }),
    new Elephant(0.21, { x: W * 0.66 }),
  ], 30);
  const leopards = [
    new Leopard(0.80, { x: W * 0.48 }),
    new Leopard(0.89, { x: -WRAP_MARGIN_U * env.u }), // 開場即從左側進入
  ];
  const all = [...pride.members, ...herd.members, ...leopards];
  return { groups: [pride, herd], solos: leopards, all };
}
