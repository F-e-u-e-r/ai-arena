(function (S) {
  'use strict';

  /**
   * 季節過渡（season transition）
   *
   * `blend` eases continuously from 0 (dry) to 1 (wet). Auto-rotation flips
   * only the target every 60s of accumulated simulation time — it never
   * teleports colors, modifiers, or animal positions. Manual toggle changes
   * the same target and restarts the 60s accumulator so the cycle does not
   * immediately undo the click. Callers lerp palette and behaviour against
   * `blend`, so mid-transition frames stay coherent.
   */
  class SeasonManager {
    constructor() {
      this.name = 'dry';
      this.blend = 0;
      this.acc = 0;
      this.period = 60;
    }

    get label() {
      return this.name === 'dry' ? 'Dry Season' : 'Wet Season';
    }

    get remaining() {
      return Math.max(0, this.period - this.acc);
    }

    toggle() {
      this.name = this.name === 'dry' ? 'wet' : 'dry';
      this.acc = 0;
    }

    set(name) {
      if (name !== 'dry' && name !== 'wet') return;
      if (name !== this.name) this.toggle();
    }

    update(dt) {
      this.acc += dt;
      if (this.acc >= this.period) {
        this.acc -= this.period;
        this.name = this.name === 'dry' ? 'wet' : 'dry';
      }
      const target = this.name === 'wet' ? 1 : 0;
      this.blend = S.expLerp(this.blend, target, dt, 1.35);
    }
  }

  /**
   * Combined season + weather behaviour multipliers.
   * Wet: faster, looser groups, more drinking / climbing.
   * Dry: slower, tighter groups, more resting.
   * Weather then bends those baselines (snow slows and packs the herds,
   * thunder makes them alert, a tornado suppresses rest and scatters them).
   * Positions are never written here.
   */
  S.ecologyMods = function (seasonBlend, weather, out) {
    const wet = seasonBlend;
    let speed = 0.84 + wet * 0.42;
    let spacing = 0.70 + wet * 0.5;
    let rest = 1.4 - wet * 0.75;
    let action = 0.62 + wet * 0.78;
    let climb = 0.65 + wet * 0.7;

    if (weather === 'rain') {
      speed *= 0.82;
      spacing *= 0.9;
      rest *= 1.28;
      action *= 1.25;
    } else if (weather === 'heavy') {
      speed *= 0.64;
      spacing *= 0.8;
      rest *= 1.6;
      action *= 0.85;
      climb *= 1.25;
    } else if (weather === 'snow') {
      speed *= 0.5;
      spacing *= 0.72;
      rest *= 1.9;
      action *= 0.4;
      climb *= 0.35;
    } else if (weather === 'thunder') {
      speed *= 1.16;
      spacing *= 0.82;
      rest *= 0.32;
      action *= 1.55;
      climb *= 1.85;
    } else if (weather === 'tornado') {
      speed *= 1.4;
      spacing *= 1.32;
      rest *= 0.04;
      action *= 0.12;
      climb *= 0;
    }

    out.speed = speed;
    out.spacing = spacing;
    out.rest = rest;
    out.action = action;
    out.climb = climb;
    return out;
  };

  /**
   * Snow is scarce in the dry season (low particle density) and reaches
   * full density only as the wet season comes in. Rain is likewise lighter
   * in the dry season. Buttons stay selectable either way.
   */
  S.weatherIntensity = function (weather, seasonBlend) {
    if (weather === 'snow') return 0.22 + 0.78 * seasonBlend;
    if (weather === 'rain' || weather === 'heavy') return 0.58 + 0.42 * seasonBlend;
    if (weather === 'sunny') return 1.12 - 0.4 * seasonBlend;
    if (weather === 'thunder') return 0.75 + 0.25 * seasonBlend;
    return 1;
  };

  S.SeasonManager = SeasonManager;
})(window.Savannah = window.Savannah || {});
