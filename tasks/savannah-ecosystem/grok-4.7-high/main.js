(function (S) {
  'use strict';

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const hudL = document.getElementById('hudL');
  const hudR = document.getElementById('hudR');
  const live = document.getElementById('live');
  const seasonFill = document.getElementById('seasonFill');
  const seasonBtn = document.getElementById('seasonBtn');

  const season = new S.SeasonManager();
  const weather = new S.WeatherManager();
  const wildlife = new S.Wildlife();

  const trees = [
    { nx: 0.15, scale: 1.18, climb: true, x: 0, h: 0, scalePx: 1 },
    { nx: 0.38, scale: 0.84, climb: true, x: 0, h: 0, scalePx: 1 },
    { nx: 0.63, scale: 1.24, climb: true, x: 0, h: 0, scalePx: 1 },
    { nx: 0.86, scale: 0.94, climb: true, x: 0, h: 0, scalePx: 1 }
  ];

  const env = {
    w: 1,
    h: 1,
    u: 1,
    unit: 1,
    groundY: 1,
    time: 0,
    seasonBlend: 0,
    seasonName: 'dry',
    weather: 'sunny',
    wind: 0,
    mods: { speed: 1, spacing: 1, rest: 1, action: 1, climb: 1 },
    trees: trees,
    waterNX: 0.51,
    tornadoActive: false,
    tornadoX: 0,
    reduced: false,
    spawnPuff: function (x, y) { weather.spawnPuff(x, y); },
    spawnRipple: function (x, y) { weather.spawnRipple(x, y); }
  };

  try {
    env.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (err) {
    env.reduced = false;
  }

  let cssW = 0;
  let cssH = 0;
  let fps = 0;
  let frames = 0;
  let fpsAcc = 0;
  let lastHudL = '';
  let lastHudR = '';
  let lastAnnounce = '';
  let detail = false;
  let fillPct = -1;
  let shownSeason = '';
  let last = performance.now();

  function layoutTrees() {
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      t.scalePx = env.u * t.scale;
      t.x = t.nx * env.w;
      t.h = 120 * t.scalePx;
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cssW > 0 && wildlife.placed && w !== cssW) {
      const s = w / cssW;
      wildlife.scaleX(s);
      weather.scaleX(s);
    }
    cssW = w;
    cssH = h;
    env.w = w;
    env.h = h;
  }

  function syncWeatherButtons() {
    const buttons = document.querySelectorAll('[data-weather]');
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const on = btn.getAttribute('data-weather') === weather.weather;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function syncSeason() {
    seasonBtn.setAttribute('data-season', season.name);
    const shortL = season.name === 'dry' ? 'Dry' : 'Wet';
    seasonBtn.querySelector('.lbl-short').textContent = shortL;
    seasonBtn.querySelector('.lbl-full').textContent = season.label;
    seasonFill.style.background = season.name === 'dry' ? '#e0a84a' : '#6fbf73';
    seasonBtn.setAttribute('aria-label', season.label + '. Activate to toggle season. Shortcut S');
    shownSeason = season.name;
  }

  function announce(text) {
    if (text === lastAnnounce) return;
    lastAnnounce = text;
    live.textContent = text;
  }

  function setWeather(name) {
    const before = weather.weather;
    weather.setWeather(name);
    if (weather.weather !== before) {
      syncWeatherButtons();
      announce(weather.label);
    }
  }

  document.getElementById('controls').addEventListener('click', function (ev) {
    const btn = ev.target.closest ? ev.target.closest('button') : null;
    if (!btn) return;
    if (btn.id === 'seasonBtn') {
      season.toggle();
      syncSeason();
      announce(season.label);
      return;
    }
    const name = btn.getAttribute('data-weather');
    if (name) setWeather(name);
  });

  window.addEventListener('keydown', function (ev) {
    if (ev.repeat) return;
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const map = {
      '1': 'sunny',
      '2': 'rain',
      '3': 'heavy',
      '4': 'snow',
      '5': 'thunder',
      '6': 'tornado'
    };
    if (map[ev.key]) {
      ev.preventDefault();
      setWeather(map[ev.key]);
    } else if (ev.key === 's' || ev.key === 'S') {
      ev.preventDefault();
      season.toggle();
      syncSeason();
      announce(season.label);
    } else if (ev.key === 'd' || ev.key === 'D') {
      detail = !detail;
      lastHudR = '';
    }
  });

  window.addEventListener('error', function (ev) {
    hudL.textContent = 'Error: ' + (ev.message || 'script');
  });

  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  function frame(now) {
    let deltaTime = (now - last) / 1000;
    last = now;
    if (!(deltaTime >= 0)) deltaTime = 0;
    if (deltaTime > 0.05) deltaTime = 0.05;

    const rect = canvas.getBoundingClientRect();
    const rw = Math.max(1, Math.round(rect.width));
    const rh = Math.max(1, Math.round(rect.height));
    if (rw !== cssW || rh !== cssH) resize();

    env.time += deltaTime;
    season.update(deltaTime);
    env.seasonBlend = season.blend;
    env.seasonName = season.name;
    env.weather = weather.weather;
    env.u = S.clamp(Math.min(env.w / 900, env.h / 520), 0.38, 1.15);
    env.unit = S.clamp(env.w / 960, 0.32, 1.35);
    env.groundY = env.h * 0.88;
    S.ecologyMods(env.seasonBlend, env.weather, env.mods);
    layoutTrees();
    weather.prepare(deltaTime, env);
    wildlife.update(deltaTime, env);
    weather.simulate(deltaTime, env, wildlife.all);

    frames++;
    fpsAcc += deltaTime;
    if (fpsAcc >= 0.5) {
      fps = frames / fpsAcc;
      frames = 0;
      fpsAcc = 0;
    }

    S.drawScene(ctx, env, weather, wildlife);

    const left = (season.name === 'dry' ? 'Dry' : 'Wet')
      + ' ' + Math.ceil(season.remaining) + 's · ' + weather.label;
    const stats = weather.particles.stats();
    let right = Math.round(fps) + ' fps · ' + stats.live + 'p';
    if (detail) {
      right += ' · ' + stats.created + '/' + stats.max
        + ' · bolt ' + weather.strikes + '/' + weather.skips;
    }
    if (left !== lastHudL) {
      hudL.textContent = left;
      lastHudL = left;
    }
    if (right !== lastHudR) {
      hudR.textContent = right;
      lastHudR = right;
    }
    const pct = Math.round((season.acc / season.period) * 100);
    if (pct !== fillPct) {
      seasonFill.style.width = pct + '%';
      fillPct = pct;
    }
    if (shownSeason !== season.name) {
      syncSeason();
      announce(season.label);
    }

    requestAnimationFrame(frame);
  }

  resize();
  syncWeatherButtons();
  syncSeason();
  requestAnimationFrame(frame);

  window.__savannah = {
    animals: function () {
      const out = [];
      for (let i = 0; i < wildlife.all.length; i++) {
        const a = wildlife.all[i];
        const b = a.getBounds();
        out.push({
          kind: a.kind, x: a.x, y: a.y, state: a.state, mood: a.mood,
          left: b.left, right: b.right, yOff: a.yOff
        });
      }
      return out;
    },
    weather: function () { return weather.weather; },
    season: function () { return season.name; },
    blend: function () { return season.blend; },
    tornado: function () {
      return { x: weather.tornado.x, on: weather.tornado.on, speed: weather.tornado.speed };
    },
    pool: function () { return weather.particles.stats(); },
    fps: function () { return fps; },
    bolts: function () { return weather.liveBolts(); },
    mods: function () {
      return {
        speed: env.mods.speed,
        spacing: env.mods.spacing,
        rest: env.mods.rest,
        action: env.mods.action,
        climb: env.mods.climb
      };
    },
    tryStrikes: function (n) {
      const buf = weather.boundBuf;
      const list = wildlife.all;
      const out = [];
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < list.length; i++) list[i].getBounds(buf[i]);
        const pick = S.pickSafeStrikeX(buf, list.length, env.w, 16, 18, Math.random);
        if (!pick) {
          out.push(null);
          continue;
        }
        out.push({
          x: pick.x,
          hit: S.columnHitsAnimal(pick.clampL, pick.clampR, list, 0)
        });
      }
      return out;
    },
    forceUnsafe: function () {
      const a = wildlife.all[0];
      const b = a.getBounds();
      const mid = (b.left + b.right) * 0.5;
      return weather.forceBoltAt(mid, b.left - 4, b.right + 4, env, wildlife.all);
    }
  };
})(window.Savannah);
