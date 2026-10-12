/* Parallax savannah: sky, sun, layered hills, acacia/baobab trees,
   watering hole, animated grass, distant herd silhouettes, birds. */
(function (global) {
  "use strict";

  const U = function () { return global.Utils; };

  function World() {
    this.w = 800;
    this.h = 500;
    this.groundY = 360;
    this.t = 0;
    this.pan = 0;
    this.trees = [];
    this.grass = [];
    this.clouds = [];
    this.birds = [];
    this.water = { xFrac: 0.30, rx: 70, ry: 16 };
    this.compact = false;
    this.rng = U().mulberry32(20261012);
    this._initDecor();
  }

  World.prototype._initDecor = function () {
    const rng = this.rng;
    this.trees = [];
    const spots = [0.10, 0.22, 0.41, 0.55, 0.72, 0.88];
    for (let i = 0; i < spots.length; i++) {
      this.trees.push({
        xFrac: spots[i] + (rng() - 0.5) * 0.03,
        hFrac: 0.16 + rng() * 0.08,
        canopy: 0.032 + rng() * 0.018,
        type: rng() > 0.28 ? "acacia" : "baobab",
        lean: (rng() - 0.5) * 0.08
      });
    }
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: rng() * 800,
        y: 20 + rng() * 80,
        s: 0.6 + rng() * 1.1,
        v: 6 + rng() * 14,
        layer: rng() > 0.5 ? 0 : 1
      });
    }
    this.birds = [];
    for (let i = 0; i < 5; i++) {
      this.birds.push({
        x: rng() * 800,
        y: 40 + rng() * 70,
        v: 18 + rng() * 22,
        phase: rng() * 6
      });
    }
  };

  World.prototype._rebuildGrass = function () {
    const n = this.compact ? 48 : Math.min(160, Math.floor(this.w / 7));
    this.grass = [];
    const rng = U().mulberry32(99);
    for (let i = 0; i < n; i++) {
      this.grass.push({
        x: (i + rng()) / n * this.w,
        h: 8 + rng() * 16,
        phase: rng() * 6,
        thick: 0.8 + rng() * 1.4
      });
    }
  };

  World.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    this.groundY = h * 0.70;
    this.compact = w < 420 || h < 260;
    this.water.rx = Math.max(28, w * 0.09);
    this.water.ry = Math.max(6, h * 0.028);
    this._rebuildGrass();
  };

  World.prototype.waterX = function () {
    return this.w * this.water.xFrac;
  };

  World.prototype.update = function (dt, wind) {
    this.t += dt;
    this.pan += dt * (6 + wind * 0.04);
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.x += c.v * (c.layer ? 0.55 : 1) * dt;
      if (c.x > this.w + 80) c.x = -80;
    }
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.x += b.v * dt;
      b.phase += dt * 8;
      if (b.x > this.w + 20) {
        b.x = -20;
        b.y = 30 + Math.random() * this.h * 0.22;
      }
    }
  };

  World.prototype.drawSky = function (ctx, season, weather) {
    const pal = season.palette;
    const g = ctx.createLinearGradient(0, 0, 0, this.groundY);
    g.addColorStop(0, U().rgbToCss(pal.skyTop));
    g.addColorStop(0.45, U().rgbToCss(pal.skyMid));
    g.addColorStop(1, U().rgbToCss(pal.skyHorizon));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    const sunY = this.groundY * (season.toName === "dry" ? 0.22 : 0.30);
    const sunX = this.w * 0.78;
    const sunR = Math.max(14, this.h * 0.055);
    const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 4.5);
    halo.addColorStop(0, U().rgbToCss(pal.sunHalo, 0.55));
    halo.addColorStop(0.35, U().rgbToCss(pal.sunHalo, 0.12));
    halo.addColorStop(1, U().rgbToCss(pal.sunHalo, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, this.w, this.groundY);
    ctx.fillStyle = U().rgbToCss(pal.sun);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    if (weather.type === "sunny" && season.mods.sunnyFit > 0.9) {
      ctx.strokeStyle = U().rgbToCss(pal.sun, 0.18);
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const a = this.t * 0.15 + i * Math.PI / 5;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(a) * sunR * 1.4, sunY + Math.sin(a) * sunR * 1.4);
        ctx.lineTo(sunX + Math.cos(a) * sunR * 2.6, sunY + Math.sin(a) * sunR * 2.6);
        ctx.stroke();
      }
    }
  };

  World.prototype._cloud = function (ctx, c, alpha) {
    ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
    ctx.beginPath();
    const s = c.s * Math.max(16, this.h * 0.04);
    ctx.ellipse(c.x, c.y, s * 1.8, s * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - s * 0.9, c.y + s * 0.15, s, s * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + s, c.y + s * 0.1, s * 1.1, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  World.prototype._hillLayer = function (ctx, offset, yBase, amp, color, seed) {
    const rng = U().mulberry32(seed);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, this.h);
    ctx.lineTo(0, yBase);
    const step = 18;
    for (let x = 0; x <= this.w + step; x += step) {
      const u = (x + offset) * 0.01;
      const y = yBase
        + Math.sin(u + rng() * 0.2) * amp
        + Math.sin(u * 2.3) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(this.w, this.h);
    ctx.closePath();
    ctx.fill();
  };

  World.prototype._drawAcacia = function (ctx, x, baseY, h, canopyW, pal, lean) {
    const trunkH = h * 0.78;
    const topX = x + lean * 18;
    const topY = baseY - trunkH;
    ctx.strokeStyle = U().rgbToCss(pal.soil);
    ctx.lineWidth = Math.max(2, h * 0.045);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + lean * 24, baseY - trunkH * 0.55, topX, topY);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.4, h * 0.025);
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(topX - canopyW * 0.55, topY - h * 0.04);
    ctx.moveTo(topX, topY);
    ctx.lineTo(topX + canopyW * 0.5, topY - h * 0.03);
    ctx.stroke();
    ctx.fillStyle = U().rgbToCss(pal.canopy, 0.95);
    ctx.beginPath();
    ctx.ellipse(topX, topY - h * 0.02, canopyW, Math.max(7, h * 0.07), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = U().rgbToCss(pal.tree, 0.45);
    ctx.beginPath();
    ctx.ellipse(topX - canopyW * 0.15, topY, canopyW * 0.72, Math.max(5, h * 0.05), -0.12, 0, Math.PI * 2);
    ctx.fill();
  };

  World.prototype._drawBaobab = function (ctx, x, baseY, h, canopyW, pal) {
    const trunkW = Math.max(10, h * 0.22);
    ctx.fillStyle = U().rgbToCss(pal.soil);
    ctx.beginPath();
    ctx.moveTo(x - trunkW, baseY);
    ctx.bezierCurveTo(x - trunkW * 1.15, baseY - h * 0.25, x - trunkW * 0.7, baseY - h * 0.55, x - trunkW * 0.45, baseY - h * 0.7);
    ctx.lineTo(x + trunkW * 0.45, baseY - h * 0.7);
    ctx.bezierCurveTo(x + trunkW * 0.7, baseY - h * 0.55, x + trunkW * 1.15, baseY - h * 0.25, x + trunkW, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = U().rgbToCss(pal.tree, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 2, baseY - h * 0.1);
    ctx.quadraticCurveTo(x - 6, baseY - h * 0.4, x + 1, baseY - h * 0.65);
    ctx.stroke();
    ctx.fillStyle = U().rgbToCss(pal.canopy);
    const cy = baseY - h * 0.78;
    ctx.beginPath();
    ctx.ellipse(x, cy, canopyW * 0.55, canopyW * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - canopyW * 0.4, cy + 4, canopyW * 0.32, canopyW * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + canopyW * 0.38, cy + 3, canopyW * 0.34, canopyW * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  World.prototype.drawHills = function (ctx, season) {
    const pal = season.palette;
    this._hillLayer(ctx, this.pan * 0.12, this.groundY * 0.52, 18, U().rgbToCss(pal.hillFar, 0.9), 3);
    this._hillLayer(ctx, this.pan * 0.28, this.groundY * 0.60, 22, U().rgbToCss(pal.hillMid), 7);
    this._drawDistantHerd(ctx, season);
    this._hillLayer(ctx, this.pan * 0.48, this.groundY * 0.68, 14, U().rgbToCss(pal.hillNear), 11);
  };

  World.prototype._drawDistantHerd = function (ctx, season) {
    const y = this.groundY * 0.64;
    const pal = season.palette;
    ctx.fillStyle = U().rgbToCss(pal.tree, 0.35);
    const off = U().wrap(this.pan * 0.2, 0, this.w + 40);
    for (let i = 0; i < 9; i++) {
      const x = U().wrap(off + i * this.w * 0.09, -20, this.w + 20);
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 5, y, 2, 5);
      ctx.fillRect(x + 3, y, 2, 5);
      ctx.beginPath();
      ctx.ellipse(x + 6, y - 2, 3, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  World.prototype.drawWater = function (ctx, season) {
    const x = this.waterX();
    const y = this.groundY + 6;
    const pal = season.palette;
    ctx.fillStyle = U().rgbToCss(pal.water, 0.8);
    ctx.beginPath();
    ctx.ellipse(x, y, this.water.rx, this.water.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = U().rgbToCss(pal.skyHorizon, 0.35);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(x - this.water.rx * 0.25, y - 2, this.water.rx * 0.4, this.water.ry * 0.3, -0.2, 0, Math.PI * 2);
    ctx.fill();
  };

  World.prototype.drawTrees = function (ctx, season) {
    const pal = season.palette;
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      const x = t.xFrac * this.w;
      const h = t.hFrac * this.h;
      const cw = t.canopy * this.w;
      if (t.type === "acacia") this._drawAcacia(ctx, x, this.groundY + 2, h, cw, pal, t.lean);
      else this._drawBaobab(ctx, x, this.groundY + 2, h, cw, pal);
    }
  };

  World.prototype.nearestTree = function (x) {
    let best = null;
    let bd = 1e9;
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      const tx = t.xFrac * this.w;
      const d = Math.abs(tx - x);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return { tree: best, dist: bd, x: best ? best.xFrac * this.w : 0, h: best ? best.hFrac * this.h : 0 };
  };

  World.prototype.drawGround = function (ctx, season) {
    const pal = season.palette;
    const g = ctx.createLinearGradient(0, this.groundY, 0, this.h);
    g.addColorStop(0, U().rgbToCss(pal.grassA));
    g.addColorStop(0.45, U().rgbToCss(pal.grassB));
    g.addColorStop(1, U().rgbToCss(pal.soil));
    ctx.fillStyle = g;
    ctx.fillRect(0, this.groundY, this.w, this.h - this.groundY);
  };

  World.prototype.drawGrass = function (ctx, season, wind) {
    const pal = season.palette;
    ctx.strokeStyle = U().rgbToCss(pal.grassTip, 0.8);
    ctx.lineCap = "round";
    for (let i = 0; i < this.grass.length; i++) {
      const g = this.grass[i];
      const sway = Math.sin(this.t * 1.6 + g.phase) * (4 + wind * 0.04);
      ctx.lineWidth = g.thick;
      ctx.beginPath();
      ctx.moveTo(g.x, this.h);
      ctx.quadraticCurveTo(g.x + sway * 0.4, this.h - g.h * 0.5, g.x + sway, this.h - g.h);
      ctx.stroke();
    }
  };

  World.prototype.drawBirds = function (ctx) {
    ctx.strokeStyle = "rgba(20,16,12,0.55)";
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const fl = Math.sin(b.phase) * 5;
      ctx.beginPath();
      ctx.moveTo(b.x - 6, b.y + fl * 0.2);
      ctx.quadraticCurveTo(b.x, b.y - 3 - fl, b.x + 6, b.y + fl * 0.2);
      ctx.stroke();
    }
  };

  World.prototype.drawHeat = function (ctx, season, weather) {
    if (weather.type !== "sunny" || season.toName !== "dry") return;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = "#ffd89a";
    for (let i = 0; i < 5; i++) {
      const y = this.groundY - 20 - i * 8 + Math.sin(this.t * 2 + i) * 3;
      ctx.beginPath();
      ctx.ellipse(this.w * 0.5, y, this.w * 0.48, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  World.prototype.drawVignette = function (ctx) {
    const g = ctx.createRadialGradient(this.w * 0.5, this.h * 0.45, this.h * 0.2, this.w * 0.5, this.h * 0.5, this.w * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(20,10,0,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  };

  World.prototype.draw = function (ctx, season, weather) {
    this.drawSky(ctx, season, weather);
    for (let i = 0; i < this.clouds.length; i++) {
      if (this.clouds[i].layer === 0) this._cloud(ctx, this.clouds[i], weather.type === "thunderstorm" ? 0.55 : 0.38);
    }
    this.drawHills(ctx, season);
    this.drawGround(ctx, season);
    this.drawWater(ctx, season);
    this.drawTrees(ctx, season);
    this.drawBirds(ctx);
    this.drawHeat(ctx, season, weather);
    for (let i = 0; i < this.clouds.length; i++) {
      if (this.clouds[i].layer === 1) this._cloud(ctx, this.clouds[i], weather.type === "thunderstorm" ? 0.4 : 0.22);
    }
  };

  global.World = World;
})(window);
