/**
 * Procedural London-weather bed via Web Audio API (no external samples).
 * Starts silent until the user taps the mute button (autoplay policy).
 */
(function (global) {
  class AmbientAudio {
    constructor() {
      this.enabled = false;
      this.ctx = null;
      this._ready = false;
    }

    toggle() {
      if (!this._ready) this._init();
      this.enabled = !this.enabled;
      if (this.enabled) this.ctx.resume();
      else this.ctx.suspend();
      return this.enabled;
    }

    _init() {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 800;
      band.Q.value = 0.6;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      noise.connect(band);
      band.connect(this.windGain);
      this.windGain.connect(ctx.destination);
      noise.start();

      this.osc = ctx.createOscillator();
      this.osc.type = "sine";
      this.osc.frequency.value = 110;
      this.osc2 = ctx.createOscillator();
      this.osc2.type = "triangle";
      this.osc2.frequency.value = 165;
      this.drone = ctx.createGain();
      this.drone.gain.value = 0;
      this.osc.connect(this.drone);
      this.osc2.connect(this.drone);
      this.drone.connect(ctx.destination);
      this.osc.start();
      this.osc2.start();

      this._ready = true;
    }

    update(mix, timeOfDay, nightAmount) {
      if (!this._ready || !this.enabled) return;
      const now = this.ctx.currentTime;
      const wind = 0.012 + mix.snow * 0.03 + mix.leaves * 0.025 + mix.mist * 0.02;
      this.windGain.gain.setTargetAtTime(wind, now, 0.4);
      const drone = 0.008 + nightAmount * 0.012 + mix.snow * 0.006;
      this.drone.gain.setTargetAtTime(drone, now, 0.5);
      this.osc.frequency.setTargetAtTime(98 + nightAmount * 30, now, 0.6);
    }
  }

  global.AmbientAudio = AmbientAudio;
})(window);
