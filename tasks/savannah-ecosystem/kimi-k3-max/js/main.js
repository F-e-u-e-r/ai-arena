'use strict';
/* =========================================================
 * 主程式:Canvas 設定、遊戲迴圈(rAF + deltaTime)、UI 與鍵盤
 * ========================================================= */

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

/* ---------- 全域環境物件(各系統間的單一事實來源) ---------- */
const env = {
  W: 0, H: 0, u: 1, horizonY: 0, time: 0,
  wind: 0, rates: { rain: 0, snow: 0, dust: 0, debris: 0 },
  speedMul: 1, activity: 1,
  animals: [], bg: null, season: null, weather: null, tornado: null,
  onFlash() {
    for (const a of env.animals) a.startleT = rand(0.35, 0.75);
  },
};

/* ---------- 系統實例 ---------- */
const bg = new Background();
const weather = new WeatherManager();
const season = new SeasonManager();
const precip = new PrecipSystem();
const tornado = new Tornado();
const lightning = new LightningSystem();
env.bg = bg; env.weather = weather; env.season = season; env.tornado = tornado;

let wildlife = null;

/* ---------- 尺寸 / DPR(RWD:嵌入 320×200 也適用) ---------- */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  env.W = window.innerWidth;
  env.H = window.innerHeight;
  env.u = env.H / 400; // 全部尺寸以畫高比例縮放
  canvas.width = Math.round(env.W * dpr);
  canvas.height = Math.round(env.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bg.layout(env.W, env.H, env.u);
  env.horizonY = bg.horizonY;
}
window.addEventListener('resize', resize);
resize();

wildlife = createWildlife(env);
env.animals = wildlife.all;

/* =========================================================
 * UI:天氣按鈕(單選)+ 季節切換 + debug
 * ========================================================= */
const hudStatus = document.getElementById('hud-status');
const hudDebug = document.getElementById('hud-debug');
const weatherRow = document.getElementById('weather-row');
const btnSeason = document.getElementById('btn-season');
const btnDebug = document.getElementById('btn-debug');
const weatherBtns = {};
let debugOn = false;

for (const id of WEATHER_ORDER) {
  const def = WEATHER_DEFS[id];
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.title = `${def.name} (${WEATHER_ORDER.indexOf(id) + 1})`;
  b.innerHTML = `${def.icon}<span>${def.name}</span>`;
  b.addEventListener('click', () => weather.set(id, season.season));
  weatherRow.appendChild(b);
  weatherBtns[id] = b;
}
btnSeason.addEventListener('click', () => season.toggle());
btnDebug.addEventListener('click', () => {
  debugOn = !debugOn;
  hudDebug.classList.toggle('hidden', !debugOn);
});

/* 鍵盤快捷鍵:1-6 天氣、S 季節、D debug */
window.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '6') {
    weather.set(WEATHER_ORDER[Number(e.key) - 1], season.season);
  } else if (e.key === 's' || e.key === 'S') {
    season.toggle();
  } else if (e.key === 'd' || e.key === 'D') {
    btnDebug.click();
  }
});

function syncUI() {
  const def = weather.def;
  const sName = season.season === 'dry' ? '乾季' : '濕季';
  const sIcon = season.season === 'dry' ? '🌾' : '🌿';
  hudStatus.textContent = `${def.icon} ${def.name} · ${sIcon} ${sName}`;
  btnSeason.innerHTML = `${sIcon} <span>${sName}</span><em>${Math.ceil(season.timer)}s</em>`;
  for (const id of WEATHER_ORDER) {
    weatherBtns[id].classList.toggle('active', id === weather.current);
    weatherBtns[id].disabled = !weatherAvailable(id, season.season);
  }
}

/* =========================================================
 * 遊戲迴圈
 * ========================================================= */
let lastTs = 0;
let fps = 60;
let uiTick = 0;

function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.05); // 分頁切回不暴衝
  lastTs = ts;
  if (dt <= 0) return;
  env.time += dt;
  fps = lerp(fps, 1 / dt, 0.05);

  /* ---- 更新(順序:季節→天氣→背景→動物→天氣現象) ---- */
  season.update(dt);
  weather.enforceSeason(season.season);
  weather.update(dt);
  env.wind = weather.cur.wind;
  env.speedMul = season.speedMul * weather.cur.speedMul;
  env.activity = season.activity * weather.cur.activity;
  env.rates.rain = weather.cur.rain;
  env.rates.snow = weather.cur.snow;
  env.rates.dust = weather.cur.dust;
  env.rates.debris = weather.cur.tornado > 0.4 ? weather.cur.debris : 0;

  bg.update(dt, env);
  tornado.update(dt, env, weather.cur.tornado > 0.4);
  for (const g of wildlife.groups) g.update(dt, env);
  for (const a of wildlife.solos) { a.place(env); a.update(dt, env); }
  for (const a of env.animals) a.place(env); // 群體成員在 group.update 後定位
  lightning.update(dt, env, weather.cur.lightning > 0.4);
  precip.update(dt, env);

  /* ---- 繪製 ---- */
  // 調色盤:季節 blend + 天氣覆蓋(舊天氣淡出 + 新天氣淡入的交叉淡化)
  const overlays = [];
  if (weather.prev.kind && weather.prev.effect > 0.01) {
    overlays.push({ kind: weather.prev.kind, t: weather.prev.effect });
  }
  if (weather.cur.effect > 0.01) {
    overlays.push({ kind: weather.current, t: weather.cur.effect });
  }
  computePalette(season.blend, overlays, bg.pal);
  bg.drawBack(ctx, env);

  // 動物:依 y 排序(遠先近後)製造前後遮擋
  const sorted = env.animals.slice().sort((a, b) => a.y - b.y);
  for (const a of sorted) a.draw(ctx, env);

  tornado.draw(ctx, env);
  precip.draw(ctx, env);
  bg.drawFront(ctx, env);

  // 整體亮度(陰天/夜晚感)
  if (weather.cur.darkness > 0.01) {
    ctx.fillStyle = `rgba(8,12,22,${weather.cur.darkness * 0.5})`;
    ctx.fillRect(0, 0, env.W, env.H);
  }
  lightning.draw(ctx, env);
  if (lightning.flash > 0.01) {
    ctx.fillStyle = `rgba(255,255,245,${lightning.flash * 0.5})`;
    ctx.fillRect(0, 0, env.W, env.H);
  }

  /* ---- HUD(節流 4Hz) ---- */
  uiTick -= dt;
  if (uiTick <= 0) {
    uiTick = 0.25;
    syncUI();
    if (debugOn) {
      hudDebug.textContent = `${Math.round(fps)} fps · 粒子 ${precip.totalCount()} · 動物 ${env.animals.length}`;
    }
  }
}
requestAnimationFrame(frame);

/* 測試/除錯用掛點(不影響正常運作) */
window.__sav = { env, weather, season, tornado, lightning, precip, wildlife, WEATHER_ORDER };
