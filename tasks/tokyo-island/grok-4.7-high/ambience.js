/* Procedural day/night bed via the Web Audio API. No audio files.
   Stays silent until a user gesture (the Sound button or the M key). */

class Ambience {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.master = null;
    this.filter = null;
    this.oscs = [];
    this.cricketGain = null;
  }

  toggle() {
    if (!this.ctx) this._build();
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.on = !this.on;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.on ? 0.22 : 0, now, 0.05);
    return this.on;
  }

  _build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = Math.max(-1, Math.min(1, brown * 3.2));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    const wind = ctx.createGain();
    wind.gain.value = 0.55;
    noise.connect(filter);
    filter.connect(wind);
    wind.connect(master);
    noise.start();
    this.filter = filter;

    const notes = [220, 277.18, 329.63];
    this.oscs = [];
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = notes[i];
      osc.detune.value = (i - 1) * 6;
      const gain = ctx.createGain();
      gain.gain.value = 0.016;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      this.oscs.push({ o: osc, g: gain, base: notes[i] });
    }

    const cricket = ctx.createOscillator();
    cricket.type = "triangle";
    cricket.frequency.value = 4380;
    const cricketFilter = ctx.createBiquadFilter();
    cricketFilter.type = "highpass";
    cricketFilter.frequency.value = 1800;
    const cricketGain = ctx.createGain();
    cricketGain.gain.value = 0;
    cricket.connect(cricketFilter);
    cricketFilter.connect(cricketGain);
    cricketGain.connect(master);
    cricket.start();
    this.cricketGain = cricketGain;
  }

  /** Wind opens up in daylight; the pad drops in pitch at night; crickets follow the stars. */
  update(sample, elapsed) {
    if (!this.ctx) return;
    const night = sample.stars;
    const now = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(380 + (1 - night) * 1500, now, 0.35);
    const pitch = 1 - night * 0.38;
    for (let i = 0; i < this.oscs.length; i++) {
      const osc = this.oscs[i];
      osc.o.frequency.setTargetAtTime(osc.base * pitch, now, 0.4);
    }
    const chirp = (elapsed % 0.64) < 0.06 ? night * 0.035 : 0;
    this.cricketGain.gain.setTargetAtTime(chirp, now, 0.015);
  }
}
