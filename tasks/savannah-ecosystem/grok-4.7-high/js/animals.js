(function (S) {
  'use strict';

  const MOOD = {
    walk: ['', '#8FBF6A'],
    rest: ['resting', '#E6C36A'],
    patrol: ['patrol', '#E2B15C'],
    drink: ['drinking', '#7EB6D6'],
    trunk: ['trunk up', '#E0A05A'],
    stalk: ['stalking', '#C6A56E'],
    dash: ['dashing', '#E08A3C'],
    climb: ['climbing', '#C79AE0'],
    drop: ['fleeing', '#E07A68'],
    alert: ['alert', '#E07A68']
  };

  const SPOTS = [
    [-28, -34, 2.6], [-16, -40, 2.3], [-4, -33, 2.8], [10, -39, 2.2],
    [20, -32, 2.4], [-22, -27, 2.1], [-8, -26, 2.5], [6, -28, 1.9],
    [16, -26, 2.2], [-12, -36, 1.7]
  ];

  class Animal {
    constructor(cfg) {
      this.kind = cfg.kind;
      this.nx = cfg.nx;
      this.depth = cfg.depth;
      this.sizeJitter = cfg.sizeJitter || 1;
      this.x = 0;
      this.y = 0;
      this.yOff = 0;
      this.rot = 0;
      this.vx = 0;
      this.phase = Math.random() * 6.2832;
      this.drawScale = 1;
      this.state = 'walk';
      this.mood = 'walk';
      this.moodLabel = '';
      this.moodColor = '#8FBF6A';
      this.bodyW = 100;
      this.bodyH = 70;
      this.puffT = Math.random() * 0.4;
      this.ignoreCohesion = false;
      this.slowMul = 1;
      this.crouch = 0;
    }

    layout(env) {
      const depthScale = 0.82 + this.depth * 0.42;
      this.drawScale = env.u * depthScale * this.sizeJitter;
      this.y = env.groundY - this.depth * env.h * 0.07;
    }

    getBounds(out) {
      const b = out || { left: 0, right: 0, top: 0, bottom: 0 };
      const sc = this.drawScale || 1;
      const reach = Math.abs(Math.sin(this.rot || 0)) * this.bodyH * sc * 0.55;
      b.left = this.x - this.bodyW * sc * 0.58 - reach;
      b.right = this.x + this.bodyW * sc * 0.48 + reach;
      b.bottom = this.y + 4;
      b.top = this.y + (this.yOff || 0) - this.bodyH * sc;
      return b;
    }

    setMood(key) {
      const m = MOOD[key] || MOOD.walk;
      this.mood = key;
      this.moodLabel = m[0];
      this.moodColor = m[1];
    }

    stepPhase(dt) {
      this.phase += dt * (2.1 + Math.min(48, Math.abs(this.vx)) * 0.045);
    }

    puff(dt, env) {
      if (Math.abs(this.vx) < 8) return;
      if (this.state === 'rest' || this.state === 'climb' || this.state === 'drink') return;
      this.puffT -= dt;
      if (this.puffT <= 0) {
        this.puffT = 0.3 + Math.random() * 0.22;
        env.spawnPuff(this.x - this.bodyW * this.drawScale * 0.15, this.y);
      }
    }

    wrap(env) {
      if (this.state === 'climb') return;
      if (this.x > env.w + 90) this.x = -90;
    }
  }

  function limb(ctx, x, phase, len, thick, color, amp) {
    const swing = Math.sin(phase) * 0.42 * amp;
    ctx.save();
    ctx.translate(x, -len);
    ctx.rotate(swing);
    ctx.fillStyle = color;
    ctx.fillRect(-thick * 0.5, 0, thick, len);
    ctx.beginPath();
    ctx.ellipse(0, len, thick * 0.8, Math.max(1.4, thick * 0.38), 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  class Lion extends Animal {
    constructor(cfg) {
      super(cfg);
      this.kind = 'lion';
      this.sex = cfg.sex;
      this.bodyW = 122;
      this.bodyH = 80;
    }

    draw(ctx, env) {
      const male = this.sex === 'male';
      const amp = this.state === 'rest' ? 0.08 : 1;
      const bob = Math.sin(this.phase) * (this.state === 'rest' ? 0.4 : 1.4);
      ctx.save();
      ctx.translate(this.x, this.y + this.yOff + bob);
      ctx.rotate(this.rot || 0);
      ctx.scale(this.drawScale, this.drawScale);

      const coat = male ? '#C9843A' : '#D7A15A';
      const dark = male ? '#A86A2C' : '#C48C44';
      const belly = '#F3D7AE';

      const wag = Math.sin(env.time * 3.2 + this.phase) * 7;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-46, -42);
      ctx.quadraticCurveTo(-62, -28, -58 + wag * 0.3, -12 + wag * 0.15);
      ctx.stroke();
      ctx.fillStyle = male ? '#6A3816' : dark;
      ctx.beginPath();
      ctx.ellipse(-58 + wag * 0.35, -10 + wag * 0.1, 5, 7, 0.4, 0, 6.2832);
      ctx.fill();

      limb(ctx, -30, this.phase + 1.2, 32, 6, dark, amp);
      limb(ctx, -12, this.phase + 2.8, 32, 6, dark, amp);
      limb(ctx, 10, this.phase, 30, 5.5, coat, amp);
      limb(ctx, 24, this.phase + 1.7, 30, 5.5, coat, amp);

      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.ellipse(-2, -42, male ? 40 : 36, 18, 0, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = belly;
      ctx.beginPath();
      ctx.ellipse(0, -34, 22, 9, 0, 0, 6.2832);
      ctx.fill();

      if (male) {
        ctx.fillStyle = '#7A3E16';
        ctx.beginPath();
        ctx.ellipse(30, -50, 24, 22, 0.15, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = '#9A5220';
        ctx.beginPath();
        ctx.ellipse(34, -54, 15, 13, 0.1, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = '#5E2E10';
        for (let i = 0; i < 7; i++) {
          const ang = -1.1 + i * 0.42;
          ctx.beginPath();
          ctx.ellipse(30 + Math.cos(ang) * 20, -50 + Math.sin(ang) * 16, 6.5, 9, ang, 0, 6.2832);
          ctx.fill();
        }
      }

      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.ellipse(42, -48, 14, 12, 0.1, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#F0D2B0';
      ctx.beginPath();
      ctx.ellipse(48, -44, 7, 5, 0.2, 0, 6.2832);
      ctx.fill();

      if (!male) {
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(34, -60, 4.5, 6.5, -0.4, 0, 6.2832);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(46, -62, 4, 6, 0.25, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = '#E7B8A0';
        ctx.beginPath();
        ctx.ellipse(34, -60, 2.2, 3.4, -0.4, 0, 6.2832);
        ctx.fill();
      }

      const blink = ((env.time + this.phase) % 4.5) < 0.12;
      ctx.fillStyle = '#2A1A10';
      if (!blink) {
        ctx.beginPath();
        ctx.ellipse(48, -50, 1.7, 2.1, 0, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(47.4, -51, 1, 1);
      } else {
        ctx.fillRect(46, -50, 4, 1);
      }
      ctx.fillStyle = '#3A2418';
      ctx.beginPath();
      ctx.ellipse(54, -45, 2.8, 2, 0.2, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }
  }

  class Elephant extends Animal {
    constructor(cfg) {
      super(cfg);
      this.kind = 'elephant';
      this.bodyW = 176;
      this.bodyH = 112;
      this.liftT = 0;
      this.liftMax = 1;
      this.liftVis = 0;
      this.drinkT = 0;
      this.drinkVis = 0;
      this.cooldown = 2 + Math.random() * 5;
    }

    draw(ctx, env) {
      const amp = this.state === 'drink' ? 0.12 : 1;
      const bob = Math.sin(this.phase) * (amp > 0.5 ? 1.2 : 0.3);
      ctx.save();
      ctx.translate(this.x, this.y + this.yOff + bob);
      ctx.rotate(this.rot || 0);
      ctx.scale(this.drawScale, this.drawScale);

      const body = '#A29E98';
      const dark = '#7A7670';
      const light = '#C4C0B8';

      const wag = Math.sin(env.time * 2.4 + this.phase) * 5;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-62, -56);
      ctx.quadraticCurveTo(-78, -36, -70 + wag, -8);
      ctx.stroke();
      ctx.fillStyle = '#5C5844';
      ctx.beginPath();
      ctx.ellipse(-70 + wag, -6, 5, 7, 0, 0, 6.2832);
      ctx.fill();

      limb(ctx, -42, this.phase + Math.PI, 46, 11, dark, amp);
      limb(ctx, -16, this.phase + 1.1, 46, 11, dark, amp);
      limb(ctx, 16, this.phase, 44, 10, body, amp);
      limb(ctx, 40, this.phase + 2.1, 44, 10, body, amp);

      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(-4, -64, 58, 34, 0, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.ellipse(-10, -74, 36, 14, 0, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70, 64, 58, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(-6, -64, 30, 0.3, 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-2, -60, 22, 0.5, 1.7);
      ctx.stroke();

      const flap = Math.sin(env.time * 1.6 + this.phase) * 0.1;
      ctx.save();
      ctx.translate(20, -78);
      ctx.rotate(-0.35 + flap);
      ctx.fillStyle = '#8E8A84';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 34, 0, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#C9A89C';
      ctx.beginPath();
      ctx.ellipse(3, 4, 14, 20, 0.1, 0, 6.2832);
      ctx.fill();
      ctx.restore();

      const drink = this.drinkVis || 0;
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(48, -70 - drink * 2, 24, 22, 0.08, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(46, -72, 20, 18, 0.05, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = '#F4EFE4';
      ctx.beginPath();
      ctx.moveTo(58, -58);
      ctx.quadraticCurveTo(80, -48, 74, -34 + drink * 4);
      ctx.quadraticCurveTo(66, -44, 56, -56);
      ctx.fill();

      const blink = ((env.time + this.phase) % 5) < 0.1;
      ctx.fillStyle = '#1B1916';
      if (!blink) {
        ctx.beginPath();
        ctx.ellipse(58, -78, 2.3, 2.8, 0, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(57, -79.2, 1.2, 1.2);
      } else {
        ctx.fillRect(56, -78, 5, 1.1);
      }

      const lift = this.liftVis || 0;
      const sway = Math.sin(env.time * 2 + this.phase) * 5 * (1 - drink);
      ctx.strokeStyle = '#8C8882';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(64, -62);
      const tipX = 82 + sway - drink * 24 + lift * 4;
      const tipY = -18 + drink * 16 - lift * 50;
      const cx = 96 - drink * 28 - lift * 8;
      const cy = -40 - lift * 24 + drink * 8;
      ctx.quadraticCurveTo(cx, cy, tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60, 54, 48, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(70, -58);
      ctx.quadraticCurveTo(cx - 2, cy + 2, tipX - 1, tipY + 1);
      ctx.stroke();
      ctx.fillStyle = '#4A463C';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.3, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }
  }

  class Leopard extends Animal {
    constructor(cfg) {
      super(cfg);
      this.kind = 'leopard';
      this.bodyW = 128;
      this.bodyH = 66;
      this.stateT = 2 + Math.random() * 3;
      this.cooldown = 1 + Math.random() * 3;
      this.climbT = 0;
      this.climbH = 0;
      this.tree = null;
    }

    draw(ctx, env) {
      const stalk = this.state === 'stalk';
      const amp = this.state === 'climb' || this.state === 'drop' ? 0.15 : stalk ? 0.35 : 1;
      const bob = Math.sin(this.phase) * (amp > 0.5 ? 1.3 : 0.3);
      ctx.save();
      ctx.translate(this.x, this.y + this.yOff + bob);
      ctx.rotate(this.rot || 0);
      ctx.scale(this.drawScale, this.drawScale * (1 - (this.crouch || 0) * 0.16));
      ctx.translate(0, (this.crouch || 0) * 10);

      const coat = '#E2B15C';
      const dark = '#C4923E';
      const belly = '#F6E6C4';
      const spot = '#3A2918';

      const wag = Math.sin(env.time * 2.6 + this.phase) * 8;
      ctx.strokeStyle = coat;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-40, -32);
      ctx.quadraticCurveTo(-58, -20 + wag * 0.2, -70, -28 + wag);
      ctx.stroke();
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.ellipse(-72, -28 + wag, 3.5, 3.5, 0, 0, 6.2832);
      ctx.fill();

      limb(ctx, -24, this.phase + 0.6, 26, 4.2, dark, amp);
      limb(ctx, -8, this.phase + 2.2, 26, 4.2, dark, amp);
      limb(ctx, 14, this.phase, 24, 3.8, coat, amp);
      limb(ctx, 28, this.phase + 1.5, 24, 3.8, coat, amp);

      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.ellipse(-2, -34, 38, 15, 0, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = belly;
      ctx.beginPath();
      ctx.ellipse(0, -28, 22, 7, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = spot;
      for (let i = 0; i < SPOTS.length; i++) {
        const s = SPOTS[i];
        ctx.beginPath();
        ctx.ellipse(s[0], s[1], s[2], s[2] * 0.78, 0.4, 0, 6.2832);
        ctx.fill();
      }

      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.ellipse(36, -38, 12, 10, 0.15, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = belly;
      ctx.beginPath();
      ctx.ellipse(42, -35, 6, 4, 0.2, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.ellipse(28, -48, 3.6, 5, -0.5, 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(40, -50, 3.2, 4.6, 0.3, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = spot;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(30 + i * 4, -40, 1.3, 0, 6.2832);
        ctx.fill();
      }

      const blink = ((env.time + this.phase) % 3.8) < 0.1;
      ctx.fillStyle = '#2A1C10';
      if (!blink) {
        ctx.beginPath();
        ctx.ellipse(42, -40, 1.5, 1.9, 0, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = '#F0D060';
        ctx.fillRect(41.5, -40.8, 0.9, 0.9);
      } else {
        ctx.fillRect(40, -40, 4, 0.9);
      }
      ctx.fillStyle = '#3A2418';
      ctx.beginPath();
      ctx.moveTo(46, -36);
      ctx.lineTo(50, -34);
      ctx.lineTo(46, -33);
      ctx.fill();
      ctx.restore();
    }
  }

  function slotMul(a, lead, slot, spacing, env) {
    if (a.ignoreCohesion || lead.ignoreCohesion) return 1;
    const desiredX = lead.x - slot * spacing;
    const behind = desiredX - a.x;
    if (behind < -env.w * 0.45) return 1;
    if (behind > 36) return 1.48;
    if (behind < -24) return 0.68;
    return 1;
  }

  class Wildlife {
    constructor() {
      this.lions = [
        new Lion({ nx: 0.28, depth: 0.56, sex: 'male', sizeJitter: 1.05 }),
        new Lion({ nx: 0.18, depth: 0.48, sex: 'female', sizeJitter: 0.94 }),
        new Lion({ nx: 0.11, depth: 0.62, sex: 'female', sizeJitter: 0.88 })
      ];
      this.elephants = [
        new Elephant({ nx: 0.58, depth: 0.9, sizeJitter: 1.06 }),
        new Elephant({ nx: 0.44, depth: 0.74, sizeJitter: 0.78 })
      ];
      this.leopards = [
        new Leopard({ nx: 0.74, depth: 0.28, sizeJitter: 0.98 }),
        new Leopard({ nx: 0.9, depth: 0.36, sizeJitter: 0.84 })
      ];
      this.all = this.lions.concat(this.elephants, this.leopards);
      this.all.sort(function (a, b) { return a.depth - b.depth; });
      this.pride = 'walk';
      this.prideMul = 1;
      this.prideT = 4;
      this.placed = false;
    }

    place(w) {
      if (this.placed) return;
      for (let i = 0; i < this.all.length; i++) this.all[i].x = this.all[i].nx * w;
      this.placed = true;
    }

    scaleX(s) {
      for (let i = 0; i < this.all.length; i++) this.all[i].x *= s;
    }

    _advance(a, desired, dt, env) {
      a.vx += (desired - a.vx) * Math.min(1, dt * 3.4);
      a.x += a.vx * dt;
      a.stepPhase(dt);
      a.puff(dt, env);
      a.wrap(env);
    }

    update(dt, env) {
      this.place(env.w);
      const mods = env.mods;
      for (let i = 0; i < this.all.length; i++) this.all[i].layout(env);

      if (env.weather === 'tornado' && this.pride === 'rest') {
        this.pride = 'walk';
        this.prideMul = 1.3;
        this.prideT = 2;
      }
      this.prideT -= dt;
      if (this.prideT <= 0) {
        if (env.weather === 'tornado') {
          this.pride = 'walk';
          this.prideMul = 1.3;
          this.prideT = 2 + Math.random() * 2;
        } else {
          const restW = 0.55 * mods.rest;
          const patrolW = 0.38;
          const walkW = 0.6;
          let r = Math.random() * (restW + patrolW + walkW);
          if ((r -= restW) < 0) {
            this.pride = 'rest';
            this.prideMul = 0;
            this.prideT = 2.1 + Math.random() * 2.4;
          } else if ((r -= patrolW) < 0) {
            this.pride = 'patrol';
            this.prideMul = 0.4;
            this.prideT = 2.8 + Math.random() * 2.2;
          } else {
            this.pride = 'walk';
            this.prideMul = 1;
            this.prideT = 4 + Math.random() * 3;
          }
        }
      }

      const lionSpace = 148 * env.unit * mods.spacing;
      const lionBase = 52 * env.unit * mods.speed * this.prideMul;
      for (let i = 0; i < this.lions.length; i++) {
        const lion = this.lions[i];
        lion.state = this.pride;
        let mul = 1;
        if (i > 0) mul = slotMul(lion, this.lions[0], i, lionSpace, env);
        let desired = lionBase * mul;
        if (env.tornadoActive && Math.abs(lion.x - env.tornadoX) < 110 + env.w * 0.03) desired *= 1.6;
        if (env.weather === 'thunder' && this.pride !== 'rest') lion.setMood('alert');
        else if (env.tornadoActive) lion.setMood('alert');
        else lion.setMood(this.pride === 'walk' ? 'walk' : this.pride);
        this._advance(lion, desired, dt, env);
      }

      const elSpace = 220 * env.unit * mods.spacing;
      for (let i = 0; i < this.elephants.length; i++) {
        const el = this.elephants[i];
        el.liftT -= dt;
        if (el.liftT < 0) el.liftT = 0;
        el.drinkVis = S.expLerp(el.drinkVis, el.state === 'drink' ? 1 : 0, dt, 5);
        el.liftVis = el.liftT > 0 ? Math.sin((1 - el.liftT / el.liftMax) * Math.PI) : S.expLerp(el.liftVis, 0, dt, 6);
        if ((env.weather === 'tornado' || env.weather === 'snow') && el.state === 'drink') {
          el.state = 'walk';
          el.drinkT = 0;
        }
        el.ignoreCohesion = el.state === 'drink';
        el.cooldown -= dt;

        if (el.state === 'drink') {
          el.drinkT -= dt;
          if (el.drinkT <= 0) {
            el.state = 'walk';
            el.cooldown = 8 + Math.random() * 6;
          }
        } else if (env.weather !== 'tornado' && env.weather !== 'snow') {
          const waterX = env.waterNX * env.w;
          const near = Math.abs(el.x - waterX) < 40 + 24 * env.u;
          if (near && el.cooldown <= 0) {
            const rate = 1.15 * mods.action * (env.weather === 'rain' || env.weather === 'heavy' ? 1.7 : 1);
            if (Math.random() < dt * rate) {
              el.state = 'drink';
              el.drinkT = (2.6 + Math.random() * 1.5) * (1.2 - env.seasonBlend * 0.35);
            }
          }
          if (el.state !== 'drink' && el.liftT <= 0 && Math.random() < dt * 0.16 * mods.action) {
            el.liftMax = 1.2 + Math.random();
            el.liftT = el.liftMax;
          }
        }

        let slow = el.state === 'drink' ? 0.16 : 1;
        let mul = 1;
        if (i > 0) mul = slotMul(el, this.elephants[0], i, elSpace, env);
        let desired = 34 * env.unit * mods.speed * slow * mul;
        if (env.tornadoActive && Math.abs(el.x - env.tornadoX) < 120 + env.w * 0.03) desired = 34 * env.unit * mods.speed * 1.7;
        if (el.state === 'drink') el.setMood('drink');
        else if (el.liftVis > 0.45) el.setMood(env.weather === 'thunder' ? 'alert' : 'trunk');
        else if (env.tornadoActive) el.setMood('alert');
        else el.setMood('walk');
        this._advance(el, desired, dt, env);
        if (el.state === 'drink' && Math.random() < dt * 4) {
          env.spawnRipple(env.waterNX * env.w + (Math.random() - 0.5) * 16, env.groundY + 3);
        }
      }

      for (let i = 0; i < this.leopards.length; i++) {
        const leo = this.leopards[i];
        leo.cooldown -= dt;
        leo.crouch = S.expLerp(leo.crouch, leo.state === 'stalk' ? 1 : 0, dt, 6);

        if (env.weather === 'tornado' && (leo.state === 'climb' || leo.state === 'stalk')) {
          leo.state = 'drop';
          leo.stateT = 0.45;
        }

        if (leo.state === 'climb' && leo.tree) {
          leo.climbT += dt;
          const up = 0.75;
          const hold = 0.35 + (1 - env.seasonBlend) * 1.35;
          const down = 0.75;
          const total = up + hold + down;
          let s;
          if (leo.climbT < up) s = leo.climbT / up;
          else if (leo.climbT < up + hold) s = 1;
          else if (leo.climbT < total) s = 1 - (leo.climbT - up - hold) / down;
          else s = 0;
          leo.climbH = Math.min(leo.tree.h * 0.62, env.h * 0.42);
          leo.yOff = -s * leo.climbH;
          leo.rot = -s * 1.25;
          leo.x = leo.tree.x - 6 * env.u;
          leo.vx = 0;
          leo.setMood('climb');
          leo.stepPhase(dt);
          if (leo.climbT >= total) {
            leo.state = 'walk';
            leo.yOff = 0;
            leo.rot = 0;
            leo.cooldown = (4.5 + Math.random() * 5) / Math.max(0.3, mods.climb);
            leo.stateT = 2 + Math.random() * 2;
          }
          continue;
        }

        if (leo.state === 'drop') {
          leo.yOff = S.expLerp(leo.yOff, 0, dt, 9);
          leo.rot = S.expLerp(leo.rot, 0, dt, 9);
          leo.stateT -= dt;
          leo.setMood('drop');
          if (leo.stateT <= 0 && Math.abs(leo.yOff) < 1.5) {
            leo.yOff = 0;
            leo.rot = 0;
            leo.state = 'dash';
            leo.stateT = 1.1;
          }
        } else {
          if (leo.cooldown <= 0 && mods.climb > 0 && leo.state !== 'dash' && env.trees) {
            const trees = env.trees;
            for (let t = 0; t < trees.length; t++) {
              const tree = trees[t];
              if (!tree.climb) continue;
              const dx = tree.x - leo.x;
              let taken = false;
              for (let k = 0; k < this.leopards.length; k++) {
                const other = this.leopards[k];
                if (other !== leo && other.tree === tree && (other.state === 'climb' || other.state === 'drop')) taken = true;
              }
              if (!taken && dx > 0 && dx < 42 + 20 * env.u && Math.random() < dt * 1.5 * mods.climb) {
                leo.state = 'climb';
                leo.tree = tree;
                leo.climbT = 0;
                leo.climbH = Math.min(tree.h * 0.62, env.h * 0.42);
                break;
              }
            }
          }
          if (leo.state !== 'climb') {
            leo.stateT -= dt;
            if (leo.stateT <= 0) {
              if (env.weather === 'tornado') {
                leo.state = Math.random() < 0.6 ? 'dash' : 'walk';
                leo.stateT = 1.2 + Math.random();
              } else {
                const stalkW = 0.45 * (env.weather === 'sunny' ? 1.2 : 0.8);
                const dashW = 0.28 * mods.action;
                const walkW = 0.55;
                let r = Math.random() * (stalkW + dashW + walkW);
                if ((r -= stalkW) < 0) {
                  leo.state = 'stalk';
                  leo.stateT = 1.4 + Math.random() * 1.4;
                } else if ((r -= dashW) < 0) {
                  leo.state = 'dash';
                  leo.stateT = 0.8 + Math.random() * 0.8;
                } else {
                  leo.state = 'walk';
                  leo.stateT = 2.2 + Math.random() * 2.4;
                }
              }
            }
          }
        }

        if (leo.state === 'climb') continue;
        let sm = 1;
        if (leo.state === 'stalk') sm = 0.38;
        else if (leo.state === 'dash') sm = 1.8;
        else if (leo.state === 'drop') sm = 0.2;
        let desired = 100 * env.unit * mods.speed * sm;
        if (env.tornadoActive && leo.state !== 'drop' && Math.abs(leo.x - env.tornadoX) < 120) desired *= 1.45;
        if (env.tornadoActive && leo.state !== 'climb') leo.setMood(leo.state === 'drop' ? 'drop' : 'alert');
        else leo.setMood(leo.state);
        this._advance(leo, desired, dt, env);
      }
    }

    draw(ctx, env) {
      for (let i = 0; i < this.all.length; i++) drawShadow(ctx, this.all[i]);
      for (let i = 0; i < this.all.length; i++) {
        const a = this.all[i];
        a.draw(ctx, env);
        drawMood(ctx, a, env);
      }
    }
  }

  function drawShadow(ctx, a) {
    const lift = Math.min(1, Math.abs(a.yOff) / 80);
    const rx = Math.max(3, a.bodyW * a.drawScale * 0.32 * (1 - lift * 0.7));
    const ry = Math.max(1.6, (2.4 + a.drawScale * 5) * (1 - lift * 0.55));
    ctx.save();
    ctx.globalAlpha = 0.24 * (1 - lift * 0.45);
    ctx.fillStyle = '#2A1C0C';
    ctx.beginPath();
    ctx.ellipse(a.x + 2, a.y + 2, rx, ry, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  function drawMood(ctx, a, env) {
    const sc = a.drawScale;
    const x = a.x + 8 * sc;
    const y = a.y + a.yOff - a.bodyH * sc - 6;
    if (y < 10) return;
    ctx.save();
    ctx.fillStyle = a.moodColor;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.2, 3.1 * Math.min(1, sc + 0.3)), 0, 6.2832);
    ctx.fill();
    if (env.w >= 720 && env.u >= 0.55 && a.moodLabel) {
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(a.moodLabel).width;
      ctx.fillStyle = 'rgba(24, 16, 8, 0.62)';
      ctx.fillRect(x - tw * 0.5 - 4, y - 16, tw + 8, 12);
      ctx.fillStyle = '#FFF8EC';
      ctx.fillText(a.moodLabel, x, y - 5);
    }
    ctx.restore();
  }

  S.Lion = Lion;
  S.Elephant = Elephant;
  S.Leopard = Leopard;
  S.Wildlife = Wildlife;
})(window.Savannah = window.Savannah || {});
