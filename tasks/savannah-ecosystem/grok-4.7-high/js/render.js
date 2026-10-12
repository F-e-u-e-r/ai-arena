(function (S) {
  'use strict';

  const CLOUDS = [
    { x0: 0.04, y: 0.14, s: 1.2, sp: 0.011 },
    { x0: 0.26, y: 0.08, s: 0.82, sp: 0.017 },
    { x0: 0.48, y: 0.18, s: 1.35, sp: 0.008 },
    { x0: 0.7, y: 0.11, s: 0.95, sp: 0.014 },
    { x0: 0.92, y: 0.16, s: 1.05, sp: 0.01 },
    { x0: 1.15, y: 0.07, s: 0.72, sp: 0.019 }
  ];

  const BIRDS = [
    { x0: 0.12, y: 0.16, sp: 0.02, ph: 0.4, sc: 1 },
    { x0: 0.4, y: 0.11, sp: 0.028, ph: 1.6, sc: 0.75 },
    { x0: 0.66, y: 0.2, sp: 0.016, ph: 2.4, sc: 1.05 },
    { x0: 0.88, y: 0.13, sp: 0.024, ph: 3.3, sc: 0.7 }
  ];

  const FAR_TREES = [
    { nx: 0.06, s: 0.52 },
    { nx: 0.5, s: 0.46 },
    { nx: 0.97, s: 0.58 }
  ];

  let hillKey = '';
  let hillFar = [];
  let hillNear = [];

  function ridge(w, n, seed) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = (w * i) / (n - 1);
      const h = 0.32 + Math.sin(i * 1.7 + seed) * 0.28 + S.hash(i * 4 + seed * 13) * 0.4;
      pts.push(x, h);
    }
    return pts;
  }

  function ensureHills(w) {
    const key = String(w | 0);
    if (key === hillKey) return;
    hillKey = key;
    hillFar = ridge(w, 9, 1.3);
    hillNear = ridge(w, 7, 2.7);
  }

  function fillRidge(ctx, pts, base, amp, bottom) {
    ctx.beginPath();
    ctx.moveTo(0, bottom);
    ctx.lineTo(pts[0], base - pts[1] * amp);
    for (let i = 2; i < pts.length; i += 2) {
      const x = pts[i];
      const y = base - pts[i + 1] * amp;
      const px = pts[i - 2];
      const py = base - pts[i - 1] * amp;
      const mx = (px + x) * 0.5;
      const my = (py + y) * 0.5;
      ctx.quadraticCurveTo(px, py, mx, my);
    }
    ctx.lineTo(pts[pts.length - 2], base - pts[pts.length - 1] * amp);
    ctx.lineTo(pts[pts.length - 2], bottom);
    ctx.closePath();
    ctx.fill();
  }

  function drawCloud(ctx, x, y, s, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, 38 * s, 16 * s, 0, 0, 6.2832);
    ctx.ellipse(x + 28 * s, y + 4 * s, 28 * s, 14 * s, 0, 0, 6.2832);
    ctx.ellipse(x - 26 * s, y + 6 * s, 24 * s, 12 * s, 0, 0, 6.2832);
    ctx.ellipse(x + 4 * s, y - 10 * s, 22 * s, 14 * s, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  function drawAcacia(ctx, x, ground, scale, canopy, part) {
    ctx.save();
    ctx.translate(x, ground);
    ctx.scale(scale, scale);
    if (part !== 'canopy') {
      ctx.fillStyle = '#6A422C';
      ctx.beginPath();
      ctx.moveTo(-5, 2);
      ctx.quadraticCurveTo(-12, -48, -1, -96);
      ctx.lineTo(4, -96);
      ctx.quadraticCurveTo(10, -46, 7, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1, -70);
      ctx.quadraticCurveTo(24, -86, 40, -76);
      ctx.lineTo(38, -72);
      ctx.quadraticCurveTo(20, -78, 2, -62);
      ctx.fill();
    }
    if (part !== 'trunk') {
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.ellipse(8, -108, 64, 15, 0, 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-20, -118, 38, 12, -0.05, 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(36, -116, 34, 11, 0.08, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = 'rgba(20, 30, 10, 0.15)';
      ctx.beginPath();
      ctx.ellipse(8, -100, 46, 7, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  function strokeBolt(ctx, pts, n) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  function drawTornado(ctx, env, weather) {
    if (!weather.tornado.on) return;
    const x = weather.tornado.x;
    const g = env.groundY;
    const top = env.h * 0.1;
    ctx.save();
    ctx.fillStyle = 'rgba(92, 78, 48, 0.18)';
    ctx.beginPath();
    ctx.moveTo(x - 12, g);
    ctx.quadraticCurveTo(x - 36 * env.u, (g + top) * 0.5, x - 58 * env.u, top);
    ctx.lineTo(x + 58 * env.u, top);
    ctx.quadraticCurveTo(x + 36 * env.u, (g + top) * 0.5, x + 12, g);
    ctx.fill();
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const y = g - t * (g - top);
      const rad = (7 + t * 58) * Math.max(0.65, env.u);
      const wob = Math.sin(env.time * 5.2 + i * 0.65) * (3 + t * 9);
      ctx.globalAlpha = 0.16 + t * 0.28;
      ctx.strokeStyle = i % 2 === 0 ? '#E7DCC8' : '#B7A588';
      ctx.lineWidth = 1.6 + t * 2.4;
      ctx.beginPath();
      ctx.ellipse(x + wob, y, rad, 4.5 + t * 9, 0, 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#C6A56E';
    const skirt = 28 + Math.sin(env.time * 4) * 5;
    ctx.beginPath();
    ctx.ellipse(x, g + 1, skirt * Math.max(0.7, env.u), 8, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  S.drawScene = function (ctx, env, weather, wildlife) {
    const w = env.w;
    const h = env.h;
    const ground = env.groundY;
    ensureHills(w);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, weather.css('skyTop'));
    sky.addColorStop(0.55, weather.css('skyMid'));
    sky.addColorStop(1, weather.css('skyHor'));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sunX = w * (0.8 - env.seasonBlend * 0.32);
    const sunY = ground * (0.4 - env.seasonBlend * 0.2);
    if (weather.sunAlpha > 0.2) {
      ctx.save();
      ctx.globalAlpha = weather.sunAlpha;
      if (weather.sunAlpha > 0.55) {
        ctx.save();
        ctx.translate(sunX, sunY);
        ctx.rotate(env.time * 0.05);
        ctx.fillStyle = 'rgba(255, 220, 150, 0.16)';
        const ray = 78 + env.u * 36;
        for (let i = 0; i < 8; i++) {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          ctx.moveTo(18, 0);
          ctx.lineTo(ray, 5);
          ctx.lineTo(ray, -5);
          ctx.fill();
        }
        ctx.restore();
      }
      const rg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70 * env.u + 20);
      rg.addColorStop(0, weather.css('sun'));
      rg.addColorStop(0.35, 'rgba(255, 220, 150, 0.85)');
      rg.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 74 * env.u + 18, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = '#FFF6D8';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 14 * env.u + 6, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(40, 28, 20, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < BIRDS.length; i++) {
      const b = BIRDS[i];
      const drift = (env.wind || 0) * 0.0004;
      const x = ((b.x0 + env.time * (b.sp + drift)) % 1.25) * w - w * 0.08;
      const y = b.y * h + Math.sin(env.time * 0.7 + b.ph) * 6;
      const flap = Math.sin(env.time * 7 + b.ph) * 5 * b.sc;
      ctx.beginPath();
      ctx.moveTo(x - 7 * b.sc, y + flap);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 7 * b.sc, y + flap);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = weather.css('hillFar');
    fillRidge(ctx, hillFar, ground * 0.72, ground * 0.22, h);
    ctx.fillStyle = weather.css('hillNear');
    fillRidge(ctx, hillNear, ground * 0.8, ground * 0.16, h);

    const cloudColor = weather.css('cloud');
    const windBoost = 1 + (env.wind || 0) / 80;
    for (let i = 0; i < CLOUDS.length; i++) {
      const c = CLOUDS[i];
      const x = ((c.x0 + env.time * c.sp * windBoost) % 1.45) * w - w * 0.15;
      let y = c.y * h;
      let s = c.s * (0.75 + env.u * 0.4);
      let a = weather.cloudAlpha * (0.55 + 0.2 * (i % 3));
      if (env.weather === 'thunder' || env.weather === 'heavy') {
        y += 10;
        s *= 1.25;
        a = Math.min(1, a + 0.15);
      }
      drawCloud(ctx, x, y, s, cloudColor, a);
    }

    for (let i = 0; i < FAR_TREES.length; i++) {
      const t = FAR_TREES[i];
      drawAcacia(ctx, t.nx * w, ground - h * 0.015, env.u * t.s, weather.css('treeFar'), 'all');
    }

    ctx.fillStyle = weather.css('grassA');
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, ground - 16);
    for (let x = 0; x <= w; x += 22) {
      const y = ground - 16 + Math.sin(x * 0.018 + env.time * 0.7) * (2.5 + env.wind * 0.01);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = weather.css('grassB');
    ctx.fillRect(0, ground + 4, w, h);
    ctx.fillStyle = weather.css('grassC');
    ctx.fillRect(0, ground + Math.max(14, h * 0.045), w, h);

    ctx.fillStyle = weather.css('grassA');
    for (let i = 0; i < 28; i++) {
      const tx = S.hash(i * 4.7) * w;
      const th = 7 + S.hash(i * 2.3) * 12 * env.u;
      const ty = ground - 2 - S.hash(i * 9.1) * 10;
      const sway = Math.sin(env.time * 1.3 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 2);
      ctx.quadraticCurveTo(tx + sway, ty - th * 0.4, tx + sway * 1.6, ty - th);
      ctx.lineTo(tx + 2, ty + 2);
      ctx.closePath();
      ctx.fill();
    }

    if (weather.groundWet > 0.03) {
      ctx.fillStyle = 'rgba(16, 36, 28, ' + (0.3 * weather.groundWet) + ')';
      ctx.fillRect(0, ground - 4, w, h - ground + 4);
    }

    if (env.seasonBlend > 0.12) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (env.seasonBlend - 0.12) * 1.3);
      ctx.fillStyle = weather.css('flower');
      for (let i = 0; i < 16; i++) {
        const fx = S.hash(i * 5.1) * w;
        const fy = ground + 6 + S.hash(i * 8.7) * Math.max(8, (h - ground) * 0.42);
        ctx.beginPath();
        ctx.arc(fx, fy, 1.4 + S.hash(i * 2.2) * 1.5, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    }

    const wx = env.waterNX * w;
    const wy = ground + 8;
    const wr = (26 + env.seasonBlend * 20) * Math.max(0.55, env.u);
    ctx.fillStyle = 'rgba(90, 70, 40, 0.35)';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 3, wr * 1.15, wr * 0.42, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = weather.css('water');
    ctx.beginPath();
    ctx.ellipse(wx, wy, wr, wr * 0.36, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(wx - wr * 0.25, wy - wr * 0.05, wr * 0.35, wr * 0.1, -0.4 + Math.sin(env.time * 2) * 0.1, 0, 6.2832);
    ctx.fill();

    const puddles = weather.puddles;
    for (let i = 0; i < puddles.length; i++) {
      const p = puddles[i];
      if (p.amp < 0.05) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(0.75, p.amp);
      ctx.fillStyle = weather.css('water');
      ctx.beginPath();
      ctx.ellipse(p.nx * w, ground + 5 + (i % 3) * 3, p.rx * (0.7 + p.amp * 0.5) * env.u, p.ry * env.u, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    const rockColor = weather.css('rock');
    drawRock(ctx, w * 0.33, ground + 2, env.u, 1, rockColor);
    drawRock(ctx, w * 0.8, ground + 4, env.u, 0.75, rockColor);

    const trees = env.trees;
    const canopy = weather.css('tree');
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      drawAcacia(ctx, t.x, ground + 2, t.scalePx, canopy, 'all');
    }

    weather.particles.draw(ctx, env, 'back');
    wildlife.draw(ctx, env);

    const bolts = weather.bolts;
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      if (!b.on) continue;
      const fade = Math.max(0, b.life / b.max);
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = fade * 0.45;
      ctx.strokeStyle = '#D6E4FF';
      ctx.lineWidth = 8;
      strokeBolt(ctx, b.points, b.n);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#FFF8DC';
      ctx.lineWidth = 2.4;
      strokeBolt(ctx, b.points, b.n);
      if (b.forkN > 1) {
        ctx.globalAlpha = fade * 0.85;
        ctx.lineWidth = 1.5;
        strokeBolt(ctx, b.fork, b.forkN);
      }
      ctx.restore();
    }

    drawTornado(ctx, env, weather);
    weather.particles.draw(ctx, env, 'front');

    ctx.save();
    ctx.strokeStyle = weather.css('grassC');
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const step = Math.max(8, 10);
    for (let x = 0; x <= w; x += step) {
      const hh = 8 + S.hash(x * 0.13) * (12 + env.u * 14);
      const sway = Math.sin(env.time * (1.1 + env.wind * 0.008) + x * 0.05) * (1.6 + env.wind * 0.025);
      const yb = h + 2;
      ctx.moveTo(x, yb);
      ctx.quadraticCurveTo(x + sway, yb - hh * 0.55, x + sway * 1.5, yb - hh);
    }
    ctx.stroke();
    ctx.restore();

    if (weather.flash > 0.02) {
      ctx.fillStyle = 'rgba(255,255,255,' + (weather.flash * 0.22) + ')';
      ctx.fillRect(0, 0, w, h);
    }
  };

  function drawRock(ctx, x, y, u, s, color) {
    const k = Math.max(0.45, u) * s;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 22 * k, y);
    ctx.lineTo(x - 10 * k, y - 16 * k);
    ctx.lineTo(x + 4 * k, y - 22 * k);
    ctx.lineTo(x + 18 * k, y - 10 * k);
    ctx.lineTo(x + 24 * k, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(x - 8 * k, y - 8 * k);
    ctx.lineTo(x + 2 * k, y - 16 * k);
    ctx.lineTo(x + 6 * k, y - 8 * k);
    ctx.fill();
  }
})(window.Savannah = window.Savannah || {});
