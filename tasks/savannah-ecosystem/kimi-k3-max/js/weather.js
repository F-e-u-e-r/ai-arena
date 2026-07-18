'use strict';
/* =========================================================
 * 天氣 + 季節管理器
 *
 * 平滑過渡策略:
 * WeatherManager 內部維護一組「目前數值」(cur),每幀以固定速率
 * 逼近目標天氣的定義值(def)。因此任何天氣切換——包含粒子生成
 * 速率、雲量、亮度、風速——都是連續漸變,不會瞬間跳動;
 * 舊型粒子停止生成後自然死亡,由 Object Pool 回收。
 * ========================================================= */

const WEATHER_DEFS = {
  sunny: {
    name: 'Sunny', icon: '☀️', influence: 0,
    coverage: 0.15, darkness: 0, sun: 1, wind: 0.4,
    rain: 0, snow: 0, dust: 6, debris: 0,
    lightning: 0, tornado: 0, speedMul: 1, activity: 1,
    wetRate: -0.055, snowMelt: 0.05,
  },
  rain: {
    name: 'Rain', icon: '🌧️', influence: 0.7,
    coverage: 0.7, darkness: 0.22, sun: 0.15, wind: 0.8,
    rain: 240, snow: 0, dust: 0, debris: 0,
    lightning: 0, tornado: 0, speedMul: 1.1, activity: 1.05,
    wetRate: 0.11, snowMelt: 0.06,
  },
  heavy: {
    name: 'Heavy Rain', icon: '🌧️', influence: 0.85,
    coverage: 0.88, darkness: 0.42, sun: 0, wind: 1.4,
    rain: 620, snow: 0, dust: 0, debris: 0,
    lightning: 0, tornado: 0, speedMul: 0.95, activity: 0.9,
    wetRate: 0.24, snowMelt: 0.07,
  },
  snow: {
    name: 'Snow', icon: '❄️', influence: 0.8,
    coverage: 0.6, darkness: 0.1, sun: 0.2, wind: 0.6,
    rain: 0, snow: 160, dust: 0, debris: 0,
    lightning: 0, tornado: 0, speedMul: 0.7, activity: 0.75,
    wetRate: -0.02, snowMelt: -0.055, // 負值 = 累積積雪
  },
  thunder: {
    name: 'Thunderstorm', icon: '⛈️', influence: 0.9,
    coverage: 0.95, darkness: 0.58, sun: 0, wind: 1.7,
    rain: 500, snow: 0, dust: 0, debris: 0,
    lightning: 1, tornado: 0, speedMul: 1.15, activity: 1.1,
    wetRate: 0.2, snowMelt: 0.07,
  },
  tornado: {
    name: 'Tornado', icon: '🌪️', influence: 0.85,
    coverage: 0.8, darkness: 0.5, sun: 0, wind: 2.2,
    rain: 0, snow: 0, dust: 55, debris: 110,
    lightning: 0, tornado: 1, speedMul: 1.3, activity: 1.25,
    wetRate: -0.03, snowMelt: 0.06,
  },
};
const WEATHER_ORDER = ['sunny', 'rain', 'heavy', 'snow', 'thunder', 'tornado'];

/* 天氣可用性:雪只在乾季出現(濕季太暖) */
function weatherAvailable(id, season) {
  if (id === 'snow') return season === 'dry';
  return true;
}

/* 需要平滑過渡的純數值欄位 */
const WX_NUMERIC_KEYS = ['coverage', 'darkness', 'sun', 'wind', 'rain', 'snow', 'dust', 'debris',
  'lightning', 'tornado', 'speedMul', 'activity', 'wetRate', 'snowMelt'];

class WeatherManager {
  constructor() {
    this.current = 'sunny';
    this.def = WEATHER_DEFS.sunny;
    this.cur = {};
    for (const k of WX_NUMERIC_KEYS) this.cur[k] = this.def[k];
    this.cur.effect = 0;                 // 目前天氣「調色覆蓋」強度
    this.prev = { kind: null, effect: 0 }; // 上一種天氣的殘留(交叉淡化用)
    this.wetness = 0;    // 地面濕度(0..1)→ 積水窪
    this.snowCover = 0;  // 積雪覆蓋(0..1)→ 地面白化
  }
  /** 切換天氣;回傳是否成功(不可用組合會被拒絕) */
  set(id, season) {
    if (id === this.current) return true;
    if (!weatherAvailable(id, season)) return false;
    // 把目前天氣的覆蓋強度移交給 prev,讓它平滑淡出;
    // 新天氣從 cur.effect 現值繼續上升 → 雙向連續,不跳色
    this.prev = { kind: this.current, effect: this.cur.effect };
    this.current = id;
    this.def = WEATHER_DEFS[id];
    return true;
  }
  /** 季節改變時呼叫:目前天氣若不再可用 → 退回晴天 */
  enforceSeason(season) {
    if (!weatherAvailable(this.current, season)) this.set('sunny', season);
  }
  update(dt) {
    // 所有數值以指數平滑逼近目標 → 切換天氣時畫面連續漸變
    for (const k of WX_NUMERIC_KEYS) {
      this.cur[k] = approach(this.cur[k], this.def[k], dt, 1.6);
    }
    this.cur.effect = approach(this.cur.effect, this.def.influence, dt, 1.6);
    this.prev.effect = approach(this.prev.effect, 0, dt, 2.2);
    if (this.prev.effect < 0.01) this.prev.kind = null;
    this.wetness = clamp(this.wetness + this.cur.wetRate * dt, 0, 1);
    this.snowCover = clamp(this.snowCover - this.cur.snowMelt * dt, 0, 1);
  }
}

/* =========================================================
 * 季節管理器
 *
 * 季節過渡:blend ∈ [0,1](0=乾季,1=濕季)以固定速率逼近目標,
 * 約 2.5 秒完成;調色盤、動物活躍度、群聚程度、水窪大小
 * 全都以 blend 插值 → 視覺與行為同步漸變,動物不會重置。
 * 每 60 秒自動輪轉,也可手動切換(切換重置計時器)。
 * ========================================================= */
const SEASON_SECONDS = 60;

class SeasonManager {
  constructor() {
    this.season = 'dry';
    this.blend = 0;        // 目前過渡位置
    this.target = 0;
    this.timer = SEASON_SECONDS;
  }
  toggle() {
    this.season = this.season === 'dry' ? 'wet' : 'dry';
    this.target = this.season === 'wet' ? 1 : 0;
    this.timer = SEASON_SECONDS;
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) this.toggle();
    this.blend = approach(this.blend, this.target, dt, 0.45);
  }
  /** 動物活躍度:濕季更活躍 */
  get activity() { return lerp(0.8, 1.3, this.blend); }
  /** 群聚程度:乾季更群聚(offset 縮小) */
  get cluster() { return lerp(0.55, 1.05, this.blend); }
  /** 基礎速度:濕季略快 */
  get speedMul() { return lerp(0.92, 1.12, this.blend); }
}
