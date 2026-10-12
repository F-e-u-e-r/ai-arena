/* Wildlife: Lion pride, elephant herd, solitary leopards.
   All travel left → right and wrap. Weather/season change speed and
   grouping only — never positions. */
(function (global) {
  "use strict";

  const U = function () { return global.Utils; };

  let UID = 1;

  function Animal(opts) {
    this.id = UID++;
    this.species = opts.species;
    this.name = opts.name;
    this.sex = opts.sex || "f";
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.lane = opts.lane || 0;
    this.vx = opts.vx || 20;
    this.baseSpeed = opts.baseSpeed || 24;
    this.scale = opts.scale || 1;
    this.bodyW = opts.bodyW || 28;
    this.bodyH = opts.bodyH || 18;
    this.hitR = this.bodyW * 0.55 + 8;
    this.hitH = this.bodyH + 10;
    this.state = "walk";
    this.stateT = 0;
    this.stateDur = 3;
    this.phase = Math.random() * Math.PI * 2;
    this.mood = "calm";
    this.facing = 1;
    this.anim = 0;
    this.climbH = 0;
    this.climbTarget = 0;
    this.resting = false;
  }

  Animal.prototype.wrap = function (w) {
    const m = this.bodyW * this.scale + 18;
    if (this.x > w + m) {
      this.x = -m;
      if (this.state === "climb") this._setState("walk", U().rand(2, 5));
    }
  };

  Animal.prototype._setState = function (name, dur) {
    this.state = name;
    this.stateT = 0;
    this.stateDur = dur;
  };

  Animal.prototype._speedMul = function (env) {
    return env.season.mods.speed * env.weather.speedMul();
  };

  Animal.prototype._ground = function (env) {
    this.y = env.world.groundY + this.lane;
  };

  Animal.prototype.updateCommon = function (dt, env) {
    this.stateT += dt;
    this.phase += dt * (this.resting ? 1.2 : 6);
    this.anim += dt;
    this._ground(env);
    this.hitR = this.bodyW * this.scale * 0.55 + 10;
    this.hitH = this.bodyH * this.scale + 12;
  };

  Animal.prototype.drawShadow = function (ctx, w) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 7, w, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  Animal.prototype.drawMood = function (ctx, env) {
    if (env.world.compact) return;
    ctx.save();
    ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(20,12,6,0.55)";
    ctx.fillText(this.mood, 0, -this.bodyH * this.scale - 16);
    ctx.restore();
  };

  /* ---------- LION : pride, slow patrol, rest ---------- */

  function Lion(opts) {
    Animal.call(this, Object.assign({
      species: "lion",
      baseSpeed: 26,
      bodyW: 34,
      bodyH: 18,
      scale: opts.sex === "m" ? 1.12 : 1
    }, opts));
    this._setState("walk", U().rand(3, 7));
  }
  Lion.prototype = Object.create(Animal.prototype);
  Lion.prototype.constructor = Lion;

  Lion.prototype.update = function (dt, env, pack) {
    this.updateCommon(dt, env);
    const restBias = env.season.mods.rest;
    if (this.stateT >= this.stateDur) {
      if (this.state === "rest") this._setState(U().chance(0.4) ? "patrol" : "walk", U().rand(4, 8));
      else if (U().chance(0.28 * restBias)) this._setState("rest", U().rand(2.2, 4.5) * restBias);
      else this._setState(U().chance(0.45) ? "patrol" : "walk", U().rand(3.5, 8));
    }

    this.resting = this.state === "rest";
    let spd = this.baseSpeed * this._speedMul(env);
    if (this.state === "patrol") spd *= 0.7;
    if (this.state === "rest") spd *= 0.08;
    this.vx = spd;
    this.x += this.vx * dt;

    /* Pride cohesion: steer toward the mean x of nearby lions, stronger
       in the dry season (cluster mod). Desired gap keeps them from stacking. */
    const cluster = env.season.mods.cluster;
    let cx = 0;
    let n = 0;
    for (let i = 0; i < pack.length; i++) {
      const o = pack[i];
      if (o === this || o.species !== "lion") continue;
      if (Math.abs(o.x - this.x) < 260) {
        cx += o.x;
        n++;
      }
    }
    if (n && this.state !== "rest") {
      cx /= n;
      const gap = (this.id % 3 - 1) * 58;
      this.x += (cx + gap - this.x) * 0.32 * cluster * dt;
    }

    if (env.weather.tornado && Math.abs(this.x - env.weather.tornado.x) < 90) {
      this.x += (this.x >= env.weather.tornado.x ? 1 : -1) * 18 * dt;
      this.mood = "alert";
    } else if (this.state === "rest") this.mood = "drowsy";
    else if (this.state === "patrol") this.mood = "watchful";
    else this.mood = "pride";

    this.wrap(env.world.w);
  };

  Lion.prototype.draw = function (ctx, env) {
    const g = Math.sin(this.phase);
    const rest = this.state === "rest" ? 1 : 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing * this.scale, this.scale);
    this.drawShadow(ctx, 20);
    const bob = rest ? 5 : g * 0.8;

    const leg = function (x0, swing) {
      ctx.strokeStyle = "#b07a32";
      ctx.lineWidth = 3.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, -5 + bob);
      ctx.lineTo(x0 + swing * (1 - rest), 7 - rest * 4);
      ctx.stroke();
    };
    leg(-11, g * 3.2);
    leg(-5, -g * 3.2);
    leg(8, -g * 2.6);
    leg(13, g * 2.6);

    ctx.fillStyle = "#d4a04c";
    ctx.beginPath();
    ctx.ellipse(1, -11 + bob, 17, 8 - rest * 2, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ead08a";
    ctx.beginPath();
    ctx.ellipse(3, -8 + bob, 11, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#d4a04c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, -12 + bob);
    ctx.quadraticCurveTo(-26, -20 + g * 4, -29, -9 + g * 5);
    ctx.stroke();
    ctx.fillStyle = "#4a2c0c";
    ctx.beginPath();
    ctx.ellipse(-29, -9 + g * 5, 3.1, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.sex === "m") {
      ctx.fillStyle = "#6b3a10";
      ctx.beginPath();
      ctx.arc(14, -18 + bob, 11.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a5018";
      ctx.beginPath();
      ctx.arc(16, -20 + bob, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#e2b45c";
    ctx.beginPath();
    ctx.ellipse(16, -16 + bob, 8, 7, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c48a3a";
    ctx.beginPath();
    ctx.ellipse(14, -22 + bob, 2.4, 3.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(19, -22 + bob, 2.4, 3.2, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.ellipse(19.5, -17.5 + bob, 1.15, 1.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(19.8, -18 + bob, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2210";
    ctx.beginPath();
    ctx.moveTo(23, -14 + bob);
    ctx.lineTo(25.5, -13.2 + bob);
    ctx.lineTo(23, -12.4 + bob);
    ctx.fill();

    this.drawMood(ctx, env);
    ctx.restore();
  };

  /* ---------- ELEPHANT : herd, drink, trumpet ---------- */

  function Elephant(opts) {
    Animal.call(this, Object.assign({
      species: "elephant",
      baseSpeed: 17,
      bodyW: 52,
      bodyH: 28,
      scale: opts.matriarch ? 1.18 : 1
    }, opts));
    this.matriarch = !!opts.matriarch;
    this.trunk = 0;
    this._setState("amble", U().rand(5, 10));
  }
  Elephant.prototype = Object.create(Animal.prototype);
  Elephant.prototype.constructor = Elephant;

  Elephant.prototype.update = function (dt, env, pack) {
    this.updateCommon(dt, env);
    const waterX = env.world.waterX();
    const nearWater = Math.abs(this.x - waterX) < 48;
    const act = env.season.mods.activity;

    if (this.stateT >= this.stateDur) {
      if (this.state === "drink" || this.state === "trumpet") {
        this._setState("amble", U().rand(5, 11));
      } else if (nearWater && U().chance(0.45 * act)) {
        this._setState("drink", U().rand(2.2, 3.8));
      } else if (U().chance(0.18 * act)) {
        this._setState("trumpet", 1.35);
      } else {
        this._setState("amble", U().rand(5, 12));
      }
    }

    this.resting = this.state === "drink";
    let spd = this.baseSpeed * this._speedMul(env);
    if (this.state === "drink") spd = 3;
    if (this.state === "trumpet") spd *= 0.5;
    this.vx = spd;
    this.x += this.vx * dt;

    const cluster = env.season.mods.cluster;
    let cx = 0;
    let n = 0;
    for (let i = 0; i < pack.length; i++) {
      const o = pack[i];
      if (o === this || o.species !== "elephant") continue;
      if (Math.abs(o.x - this.x) < 320) {
        cx += o.x;
        n++;
      }
    }
    if (n && this.state === "amble") {
      cx /= n;
      const gap = (this.matriarch ? -40 : (this.id % 2 ? 46 : 18));
      this.x += (cx + gap - this.x) * 0.4 * cluster * dt;
    }

    if (this.state === "drink") this.trunk = U().lerp(this.trunk, 1, 1 - Math.exp(-4 * dt));
    else if (this.state === "trumpet") this.trunk = U().lerp(this.trunk, -1, 1 - Math.exp(-6 * dt));
    else this.trunk = U().lerp(this.trunk, Math.sin(this.phase * 0.35) * 0.25, 1 - Math.exp(-3 * dt));

    if (env.weather.tornado && Math.abs(this.x - env.weather.tornado.x) < 110) {
      this.x += (this.x >= env.weather.tornado.x ? 1 : -1) * 10 * dt;
      this.mood = "uneasy";
    } else if (this.state === "drink") this.mood = "drinking";
    else if (this.state === "trumpet") this.mood = "calling";
    else this.mood = "grazing";

    this.wrap(env.world.w);
  };

  Elephant.prototype.draw = function (ctx, env) {
    const g = Math.sin(this.phase);
    const bob = this.state === "drink" ? 2 : g * 0.6;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing * this.scale, this.scale);
    this.drawShadow(ctx, 28);

    const leg2 = function (x0, swing) {
      ctx.fillStyle = "#8a8a90";
      ctx.fillRect(x0 - 3.4, -4 + bob, 6.8, 13.5 + (swing > 0 ? 1 : 0));
      ctx.fillStyle = "#5e5e64";
      ctx.fillRect(x0 - 3.4, 8.5 + bob, 6.8, 2.2);
    };
    leg2(-16, g);
    leg2(-7, -g);
    leg2(8, -g);
    leg2(16, g);

    ctx.fillStyle = "#9a9aa2";
    ctx.beginPath();
    ctx.ellipse(0, -16 + bob, 24, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7e7e86";
    ctx.beginPath();
    ctx.ellipse(-2, -10 + bob, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8d8d95";
    ctx.beginPath();
    ctx.ellipse(-18, -28 + bob, 10, 16, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a8a8b0";
    ctx.beginPath();
    ctx.ellipse(-16, -26 + bob, 6, 12, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#9a9aa2";
    ctx.beginPath();
    ctx.ellipse(20, -22 + bob, 12, 11, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e8e0d0";
    ctx.beginPath();
    ctx.moveTo(24, -18 + bob);
    ctx.quadraticCurveTo(32, -12 + bob, 30, -4 + bob);
    ctx.lineTo(27, -4 + bob);
    ctx.quadraticCurveTo(28, -12 + bob, 22, -16 + bob);
    ctx.fill();

    const tk = this.trunk;
    ctx.strokeStyle = "#8a8a92";
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(28, -16 + bob);
    if (tk > 0.2) {
      ctx.bezierCurveTo(36, -4 + bob, 30, 8 + bob, 22, 10 + bob);
    } else if (tk < -0.2) {
      ctx.bezierCurveTo(40, -28 + bob, 44, -36 + bob, 38, -42 + bob);
    } else {
      ctx.bezierCurveTo(38, -8 + bob, 36, 2 + bob, 32, 6 + bob);
    }
    ctx.stroke();

    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.ellipse(24, -24 + bob, 1.4, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#7a7a82";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-22, -8 + bob);
    ctx.quadraticCurveTo(-24, 0, -18, 6 + bob);
    ctx.stroke();

    this.drawMood(ctx, env);
    ctx.restore();
  };

  /* ---------- LEOPARD : solitary, dash, climb ---------- */

  function Leopard(opts) {
    Animal.call(this, Object.assign({
      species: "leopard",
      baseSpeed: 48,
      bodyW: 30,
      bodyH: 14,
      scale: 0.95
    }, opts));
    this._setState("stalk", U().rand(3, 6));
  }
  Leopard.prototype = Object.create(Animal.prototype);
  Leopard.prototype.constructor = Leopard;

  Leopard.prototype.update = function (dt, env, pack) {
    this.updateCommon(dt, env);
    const climbBias = env.season.mods.climb;
    const near = env.world.nearestTree(this.x);

    if (this.state === "climb") {
      const up = this.stateT < this.stateDur * 0.4;
      const down = this.stateT > this.stateDur * 0.7;
      if (up) this.climbH = U().lerp(this.climbH, this.climbTarget, 1 - Math.exp(-2.4 * dt));
      else if (down) this.climbH = U().lerp(this.climbH, 0, 1 - Math.exp(-2.8 * dt));
      this.vx = 2;
      this.x += this.vx * dt;
      if (this.stateT >= this.stateDur) {
        this.climbH = 0;
        this._setState("stalk", U().rand(3, 6));
      }
      this.mood = "climbing";
      this.wrap(env.world.w);
      return;
    }

    if (this.stateT >= this.stateDur) {
      if (this.state === "dash") this._setState("stalk", U().rand(2.5, 5));
      else if (near.dist < 28 && U().chance(0.4 * climbBias) && near.tree) {
        this.climbTarget = Math.max(28, near.h * 0.55);
        this.x = near.x;
        this._setState("climb", U().rand(3.2, 5.0));
      } else if (U().chance(0.35 * env.season.mods.activity)) {
        this._setState("dash", U().rand(0.8, 1.6));
      } else {
        this._setState("stalk", U().rand(3, 7));
      }
    }

    let spd = this.baseSpeed * this._speedMul(env);
    if (this.state === "stalk") spd *= 0.42;
    if (this.state === "dash") spd *= 1.65;
    this.vx = spd;
    this.x += this.vx * dt;

    for (let i = 0; i < pack.length; i++) {
      const o = pack[i];
      if (o === this) continue;
      const d = o.x - this.x;
      if (Math.abs(d) < 70 && o.species !== "leopard") {
        this.x -= Math.sign(d || 1) * 12 * dt;
      }
      if (o.species === "leopard" && Math.abs(d) < 140) {
        this.x -= Math.sign(d || 1) * 20 * dt;
      }
    }

    if (env.weather.tornado && Math.abs(this.x - env.weather.tornado.x) < 80) {
      this.x += (this.x >= env.weather.tornado.x ? 1 : -1) * 40 * dt;
      this.mood = "fleeing";
    } else if (this.state === "dash") this.mood = "hunting";
    else this.mood = "stalking";

    this.wrap(env.world.w);
  };

  Leopard.prototype.draw = function (ctx, env) {
    const g = Math.sin(this.phase * (this.state === "dash" ? 1.8 : 1));
    const climb = this.state === "climb";
    ctx.save();
    ctx.translate(this.x, this.y - this.climbH);
    if (climb) ctx.rotate(-Math.PI / 2 * Math.min(1, this.climbH / 20));
    ctx.scale(this.facing * this.scale, this.scale);
    this.drawShadow(ctx, climb ? 8 : 16);

    const leg = function (x0, swing) {
      ctx.strokeStyle = "#c48a3a";
      ctx.lineWidth = 2.3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, -3);
      ctx.lineTo(x0 + swing, 6);
      ctx.stroke();
    };
    if (!climb) {
      leg(-9, g * 4);
      leg(-4, -g * 4);
      leg(8, -g * 3.4);
      leg(12, g * 3.4);
    }

    ctx.fillStyle = "#e0a04a";
    ctx.beginPath();
    ctx.ellipse(1, -9, 15, 6.2, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a3a14";
    for (let i = 0; i < 9; i++) {
      const sx = -10 + i * 2.6;
      const sy = -11 + (i % 2) * 3;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 1.15, 1.45, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#e0a04a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.quadraticCurveTo(-24, -16 + g * 3, -28, -6 + g * 4);
    ctx.stroke();
    ctx.fillStyle = "#c48a3a";
    ctx.beginPath();
    ctx.ellipse(-28, -6 + g * 4, 2.2, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e8b45c";
    ctx.beginPath();
    ctx.ellipse(14, -13, 6.5, 5.4, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d09040";
    ctx.beginPath();
    ctx.moveTo(11, -18);
    ctx.lineTo(13, -22);
    ctx.lineTo(15, -18);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, -17.5);
    ctx.lineTo(18.5, -21.5);
    ctx.lineTo(20, -16.5);
    ctx.fill();
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.ellipse(16.5, -13.5, 1.05, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(16.8, -14, 0.35, 0, Math.PI * 2);
    ctx.fill();

    this.drawMood(ctx, env);
    ctx.restore();
  };

  /* ---------- system ---------- */

  function WildlifeSystem() {
    this.animals = [];
    this._draw = [];
  }

  WildlifeSystem.prototype.spawn = function (world) {
    this.animals.length = 0;
    const gy = world.groundY;
    const w = world.w;
    this.animals.push(new Lion({ name: "Asha", sex: "f", x: w * 0.18, y: gy, lane: 4, baseSpeed: 25 }));
    this.animals.push(new Lion({ name: "Kito", sex: "m", x: w * 0.26, y: gy, lane: 8, baseSpeed: 24 }));
    this.animals.push(new Lion({ name: "Nala", sex: "f", x: w * 0.12, y: gy, lane: 0, baseSpeed: 27 }));
    this.animals.push(new Elephant({ name: "Tembo", matriarch: true, x: w * 0.42, y: gy, lane: 12, baseSpeed: 16 }));
    this.animals.push(new Elephant({ name: "Zuri", x: w * 0.50, y: gy, lane: 16, baseSpeed: 17 }));
    this.animals.push(new Elephant({ name: "Boko", x: w * 0.35, y: gy, lane: 10, baseSpeed: 18 }));
    this.animals.push(new Leopard({ name: "Sable", x: w * 0.68, y: gy, lane: -6, baseSpeed: 50 }));
    this.animals.push(new Leopard({ name: "Nyx", x: w * 0.82, y: gy, lane: -10, baseSpeed: 46 }));
  };

  WildlifeSystem.prototype.resize = function (oldW, oldH, world) {
    if (!oldW) return;
    const sx = world.w / oldW;
    for (let i = 0; i < this.animals.length; i++) {
      this.animals[i].x *= sx;
    }
  };

  WildlifeSystem.prototype.update = function (dt, env) {
    const pack = this.animals;
    for (let i = 0; i < pack.length; i++) pack[i].update(dt, env, pack);
  };

  WildlifeSystem.prototype.draw = function (ctx, env) {
    const list = this._draw;
    list.length = 0;
    for (let i = 0; i < this.animals.length; i++) list.push(this.animals[i]);
    list.sort(function (a, b) { return a.y - b.y; });
    for (let i = 0; i < list.length; i++) list[i].draw(ctx, env);
  };

  WildlifeSystem.prototype.counts = function () {
    const c = { lion: 0, elephant: 0, leopard: 0 };
    for (let i = 0; i < this.animals.length; i++) c[this.animals[i].species]++;
    return c;
  };

  global.Animal = Animal;
  global.Lion = Lion;
  global.Elephant = Elephant;
  global.Leopard = Leopard;
  global.WildlifeSystem = WildlifeSystem;
})(window);
