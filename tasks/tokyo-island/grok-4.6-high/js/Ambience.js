class Ambience {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.gain = null;
    this.filter = null;
    this.cricketGain = null;
    this._started = false;
  }

  async toggle() {
    try {
      if (!this._started) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      this.ctx = ctx;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();

      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 9;
      const cricket = ctx.createGain();
      cricket.gain.value = 0;
      const ping = ctx.createOscillator();
      ping.type = "sine";
      ping.frequency.value = 3400;
      const pingGain = ctx.createGain();
      pingGain.gain.value = 0.0;
      osc.connect(cricket);
      cricket.connect(pingGain.gain);
      ping.connect(pingGain);
      pingGain.connect(ctx.destination);
      osc.start();
      ping.start();

      this.filter = filter;
      this.gain = gain;
      this.cricketGain = cricket;
      this.pingGain = pingGain;
      this._started = true;
      this.enabled = true;
      if (ctx.resume) await ctx.resume();
      return this.enabled;
    }
    this.enabled = !this.enabled;
    if (this.ctx && this.ctx.resume && this.enabled) await this.ctx.resume();
    if (this.ctx && this.ctx.suspend && !this.enabled) await this.ctx.suspend();
    return this.enabled;
    } catch (err) {
      this.enabled = false;
      return false;
    }
  }

  update(phase, lamp) {
    if (!this._started || !this.enabled) return;
    const day = 1 - lamp;
    this.filter.frequency.value = lerp(420, 1400, day);
    this.gain.gain.value = lerp(0.035, 0.055, day);
    this.cricketGain.gain.value = lamp * 0.012;
  }
}
