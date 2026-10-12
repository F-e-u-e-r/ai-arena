(function (S) {
  'use strict';

  S.clamp = function (v, a, b) {
    return v < a ? a : v > b ? b : v;
  };

  S.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  S.smooth = function (t) {
    return t * t * (3 - 2 * t);
  };

  /** Frame-rate independent exponential smoothing. */
  S.expLerp = function (cur, target, dt, rate) {
    return cur + (target - cur) * (1 - Math.exp(-dt * rate));
  };

  S.hash = function (n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  /** Reused color string so a settled palette does not allocate every frame. */
  S.colorSlot = function () {
    return { r: -1, g: -1, b: -1, a: -2, s: '#000' };
  };

  S.slotCss = function (slot, c, a) {
    const r = c[0] | 0;
    const g = c[1] | 0;
    const b = c[2] | 0;
    const aa = a == null ? -1 : Math.round(a * 1000) / 1000;
    if (slot.r === r && slot.g === g && slot.b === b && slot.a === aa) return slot.s;
    slot.r = r;
    slot.g = g;
    slot.b = b;
    slot.a = aa;
    slot.s = aa === -1
      ? 'rgb(' + r + ',' + g + ',' + b + ')'
      : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    return slot.s;
  };
})(window.Savannah = window.Savannah || {});
