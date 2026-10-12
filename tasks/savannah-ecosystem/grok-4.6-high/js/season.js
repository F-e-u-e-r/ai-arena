/* Dry / wet season manager. Auto-rotates every 60s; palette and behavior
   modifiers blend smoothly so animals never pop or reset. */
(function (global) {
  "use strict";

  const U = function () { return global.Utils; };

  const PALETTES = {
    dry: {
      skyTop: "#3a6ea5",
      skyMid: "#e39a4a",
      skyHorizon: "#f6d7a0",
      sun: "#ffd56a",
      sunHalo: "#ffb347",
      hillFar: "#c48a4a",
      hillMid: "#b06a32",
      hillNear: "#8d4e22",
      grassA: "#c6a23a",
      grassB: "#8a7a24",
      grassTip: "#e8d27a",
      soil: "#7a5330",
      water: "#4a7a88",
      tree: "#2c4a22",
      canopy: "#3d5c28",
      ambient: "#f0c070",
      overlay: { r: 255, g: 190, b: 80 }
    },
    wet: {
      skyTop: "#1e4d78",
      skyMid: "#4f8fbf",
      skyHorizon: "#c5e2c8",
      sun: "#f4e9b0",
      sunHalo: "#dce8a8",
      hillFar: "#5a7a48",
      hillMid: "#3f6a38",
      hillNear: "#2f542c",
      grassA: "#4f9a3c",
      grassB: "#2d6b2a",
      grassTip: "#9ad46a",
      soil: "#4a3a28",
      water: "#2f6f86",
      tree: "#1d3a1c",
      canopy: "#2f6a30",
      ambient: "#8ecf90",
      overlay: { r: 80, g: 140, b: 110 }
    }
  };

  const MODS = {
    dry: { speed: 0.78, cluster: 1.45, activity: 0.7, rest: 1.55, climb: 0.65, snowFit: 0.42, rainFit: 0.55, stormFit: 0.7, tornadoFit: 1.05, sunnyFit: 1.2 },
    wet: { speed: 1.22, cluster: 0.55, activity: 1.35, rest: 0.55, climb: 1.25, snowFit: 1.0, rainFit: 1.25, stormFit: 1.25, tornadoFit: 0.9, sunnyFit: 0.85 }
  };

  function rgbize(pal) {
    const out = {};
    for (const k in pal) {
      if (typeof pal[k] === "string" && pal[k].charAt(0) === "#") out[k] = U().hexToRgb(pal[k]);
      else out[k] = pal[k];
    }
    return out;
  }

  const RGB = { dry: rgbize(PALETTES.dry), wet: rgbize(PALETTES.wet) };

  function SeasonManager() {
    this.name = "dry";
    this.fromName = "dry";
    this.toName = "dry";
    this.blend = 1;
    this.duration = 2.4;
    this.autoPeriod = 60;
    this.autoT = 0;
    this.palette = {};
    this.mods = {};
    this._snapPalette(this.palette, RGB.dry);
    this._snapMods(this.mods, MODS.dry);
    this.fromPal = {};
    this.toPal = RGB.dry;
    this.fromMods = {};
    this.toMods = MODS.dry;
    this._snapPalette(this.fromPal, RGB.dry);
    this._snapMods(this.fromMods, MODS.dry);
  }

  SeasonManager.prototype._snapPalette = function (dst, src) {
    for (const k in src) {
      const v = src[k];
      if (v && typeof v === "object" && "r" in v) dst[k] = { r: v.r, g: v.g, b: v.b };
      else dst[k] = v;
    }
  };

  SeasonManager.prototype._snapMods = function (dst, src) {
    for (const k in src) dst[k] = src[k];
  };

  /**
   * Season transition: snapshot the currently blended palette/modifiers as
   * `from`, set `to` to the destination season, and run blend 0→1 over
   * `duration` seconds with smoothstep. Animal positions are untouched —
   * only speed, clustering and rest frequency lerp. The 60s auto-rotate
   * timer resets on a manual toggle so a viewer can sit with one season.
   */
  SeasonManager.prototype.setSeason = function (name, resetTimer) {
    if (name !== "dry" && name !== "wet") return;
    if (name === this.toName && this.blend >= 1) {
      if (resetTimer) this.autoT = 0;
      return;
    }
    this.fromName = this.blend >= 1 ? this.toName : this.name;
    this._snapPalette(this.fromPal, this.palette);
    this._snapMods(this.fromMods, this.mods);
    this.toName = name;
    this.toPal = RGB[name];
    this.toMods = MODS[name];
    this.blend = 0;
    this.name = name;
    if (resetTimer) this.autoT = 0;
  };

  SeasonManager.prototype.toggle = function () {
    this.setSeason(this.toName === "dry" ? "wet" : "dry", true);
  };

  SeasonManager.prototype.update = function (dt) {
    this.autoT += dt;
    if (this.autoT >= this.autoPeriod) {
      this.autoT = 0;
      this.setSeason(this.toName === "dry" ? "wet" : "dry", false);
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.duration);
    }
    const t = U().smoothstep(this.blend);
    const a = this.fromPal;
    const b = this.toPal;
    const p = this.palette;
    for (const k in b) {
      const bv = b[k];
      const av = a[k] || bv;
      if (bv && typeof bv === "object" && "r" in bv) {
        if (!p[k]) p[k] = { r: 0, g: 0, b: 0 };
        p[k].r = av.r + (bv.r - av.r) * t;
        p[k].g = av.g + (bv.g - av.g) * t;
        p[k].b = av.b + (bv.b - av.b) * t;
      } else {
        p[k] = bv;
      }
    }
    const fm = this.fromMods;
    const tm = this.toMods;
    for (const k in tm) {
      this.mods[k] = (fm[k] !== undefined ? fm[k] : tm[k]) + (tm[k] - (fm[k] !== undefined ? fm[k] : tm[k])) * t;
    }
    this.name = t < 0.5 ? this.fromName : this.toName;
  };

  SeasonManager.prototype.remaining = function () {
    return Math.max(0, this.autoPeriod - this.autoT);
  };

  SeasonManager.prototype.label = function () {
    return this.toName === "dry" ? "Dry Season" : "Wet Season";
  };

  SeasonManager.prototype.css = function (key, a) {
    return U().rgbToCss(this.palette[key], a);
  };

  global.SeasonManager = SeasonManager;
})(window);
