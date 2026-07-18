'use strict';
/* =========================================================
 * 共用工具函式
 * ========================================================= */
const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
/** rand() → [0,1) ; rand(b) → [0,b) ; rand(a,b) → [a,b) */
const rand = (a, b) => (a === undefined ? Math.random() : b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const chance = (p) => Math.random() < p;
/** 以 rate(每秒) 逼近 target 的指數平滑 */
const approach = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);

/* ---- 顏色:#rrggbb ↔ [r,g,b],以及混色 ---- */
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function cssRgb(c) {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}
function cssRgba(c, a) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
/** 變暗:f ∈ [0,1] */
function shadeRgb(c, f) {
  return [c[0] * f, c[1] * f, c[2] * f];
}
