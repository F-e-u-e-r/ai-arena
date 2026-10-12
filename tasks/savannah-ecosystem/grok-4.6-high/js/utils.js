/* Shared math, color, and seeded-random helpers. No allocations in hot paths
   beyond the small rgb objects created during season palette blends. */
(function (global) {
  "use strict";

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function randInt(a, b) {
    return (a + Math.random() * (b - a + 1)) | 0;
  }

  function chance(p) {
    return Math.random() < p;
  }

  function wrap(v, min, max) {
    const r = max - min;
    if (r <= 0) return min;
    v = ((v - min) % r + r) % r + min;
    return v;
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function hexToRgb(hex) {
    const h = hex.charAt(0) === "#" ? hex.slice(1) : hex;
    const n = parseInt(h.length === 3
      ? h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2)
      : h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToCss(c, a) {
    if (a === undefined || a >= 1) return "rgb(" + (c.r | 0) + "," + (c.g | 0) + "," + (c.b | 0) + ")";
    return "rgba(" + (c.r | 0) + "," + (c.g | 0) + "," + (c.b | 0) + "," + a + ")";
  }

  function lerpRgb(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    };
  }

  function mulberry32(seed) {
    let a = seed | 0;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  global.Utils = {
    clamp: clamp,
    lerp: lerp,
    smoothstep: smoothstep,
    rand: rand,
    randInt: randInt,
    chance: chance,
    wrap: wrap,
    dist: dist,
    hexToRgb: hexToRgb,
    rgbToCss: rgbToCss,
    lerpRgb: lerpRgb,
    mulberry32: mulberry32
  };
})(window);
