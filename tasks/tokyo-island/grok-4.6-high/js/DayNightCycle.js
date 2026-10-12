class DayNightCycle {
  constructor(opts) {
    this.duration = 15;
    this.time = 0;
    this.speed = 1;
    this.paused = false;
    this.scene = opts.scene;
    this.decor = opts.decor;
    this.hemi = opts.hemi;
    this.ambient = opts.ambient;
    this.sunLight = opts.sunLight;
    this.glows = opts.glows;
    this.cloudMat = opts.cloudMat;

    this._cA = new THREE.Color();
    this._cB = new THREE.Color();
    this._top = new THREE.Color();
    this._bot = new THREE.Color();
    this._fog = new THREE.Color();
    this._sun = new THREE.Color();
    this._hemiSky = new THREE.Color();
    this._hemiGround = new THREE.Color();

    // Ordered keyframes on [0,1). Last key repeats the first so wrapping is smooth.
    this.keys = [
      { t: 0.0, name: "Day", top: 0x6ec4ee, bot: 0xd7eefc, fog: 0xb9e0f4, sun: 0xfff1c2, hemiS: 0xb8e4ff, hemiG: 0xc9e0a8, amb: 0.55, sunI: 1.35, hemiI: 0.85, exp: 1.08 },
      { t: 0.18, name: "Day", top: 0x6bb7e0, bot: 0xffd9a0, fog: 0xd7c4a0, sun: 0xffd27a, hemiS: 0xffd9b0, hemiG: 0xc9b080, amb: 0.48, sunI: 1.15, hemiI: 0.7, exp: 1.0 },
      { t: 0.28, name: "Dusk", top: 0xea6a4a, bot: 0xffb347, fog: 0xd07a58, sun: 0xff8a4a, hemiS: 0xff9a6a, hemiG: 0x8a4a38, amb: 0.32, sunI: 0.55, hemiI: 0.4, exp: 0.92 },
      { t: 0.4, name: "Dusk", top: 0x4a2a6a, bot: 0xc45c4a, fog: 0x4a3058, sun: 0xff6b3d, hemiS: 0x6a3a7a, hemiG: 0x3a2030, amb: 0.28, sunI: 0.35, hemiI: 0.32, exp: 0.9 },
      { t: 0.5, name: "Night", top: 0x141a3a, bot: 0x2a2458, fog: 0x1a2044, sun: 0xc5d4ff, hemiS: 0x3a4a88, hemiG: 0x1a1830, amb: 0.28, sunI: 0.42, hemiI: 0.38, exp: 0.92 },
      { t: 0.68, name: "Night", top: 0x10162e, bot: 0x22244a, fog: 0x161c38, sun: 0xb8c8f5, hemiS: 0x334070, hemiG: 0x161428, amb: 0.26, sunI: 0.38, hemiI: 0.34, exp: 0.9 },
      { t: 0.8, name: "Dawn", top: 0x6a4a8a, bot: 0xffb6c1, fog: 0x8a6a88, sun: 0xffc1d6, hemiS: 0xffb0c8, hemiG: 0x6a4860, amb: 0.28, sunI: 0.45, hemiI: 0.38, exp: 0.88 },
      { t: 0.9, name: "Dawn", top: 0x7eb8e0, bot: 0xffd8b0, fog: 0xc8dcec, sun: 0xffe0a0, hemiS: 0xc0e0ff, hemiG: 0xc0d0a0, amb: 0.45, sunI: 1.05, hemiI: 0.7, exp: 1.0 },
      { t: 1.0, name: "Day", top: 0x6ec4ee, bot: 0xd7eefc, fog: 0xb9e0f4, sun: 0xfff1c2, hemiS: 0xb8e4ff, hemiG: 0xc9e0a8, amb: 0.55, sunI: 1.35, hemiI: 0.85, exp: 1.08 },
    ];
    this.phase = 0;
    this.phaseName = "Day";
    this.lamp = 0;
    this.renderer = opts.renderer;
  }

  getPhase() {
    return wrap01(this.time / this.duration);
  }

  nudge(seconds) {
    this.time += seconds;
    if (this.time < 0) this.time += this.duration * 8;
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  cycleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
    return this.speed;
  }

  _sample(phase) {
    const keys = this.keys;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t < phase) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const span = b.t - a.t;
    const u = span <= 0 ? 0 : smoothstep(0, 1, (phase - a.t) / span);
    return { a: a, b: b, u: u };
  }

  _lampFactor(phase) {
    // Lamps ramp on as dusk begins (~0.22) and ramp off before dawn completes (~0.88).
    if (phase < 0.22) return 0;
    if (phase < 0.32) return smoothstep(0.22, 0.32, phase);
    if (phase < 0.78) return 1;
    if (phase < 0.88) return 1 - smoothstep(0.78, 0.88, phase);
    return 0;
  }

  update(dt) {
    if (!this.paused) this.time += dt * this.speed;
    const phase = this.getPhase();
    this.phase = phase;
    const s = this._sample(phase);
    const u = s.u;

    this._top.copy(this._cA.set(s.a.top)).lerp(this._cB.set(s.b.top), u);
    this._bot.copy(this._cA.set(s.a.bot)).lerp(this._cB.set(s.b.bot), u);
    this._fog.copy(this._cA.set(s.a.fog)).lerp(this._cB.set(s.b.fog), u);
    this._sun.copy(this._cA.set(s.a.sun)).lerp(this._cB.set(s.b.sun), u);
    this._hemiSky.copy(this._cA.set(s.a.hemiS)).lerp(this._cB.set(s.b.hemiS), u);
    this._hemiGround.copy(this._cA.set(s.a.hemiG)).lerp(this._cB.set(s.b.hemiG), u);

    this.decor.skyUniforms.topColor.value.copy(this._top);
    this.decor.skyUniforms.bottomColor.value.copy(this._bot);
    this.decor.fog.color.copy(this._fog);
    this.scene.background = this._fog;

    this.sunLight.color.copy(this._sun);
    this.sunLight.intensity = lerp(s.a.sunI, s.b.sunI, u);
    this.hemi.color.copy(this._hemiSky);
    this.hemi.groundColor.copy(this._hemiGround);
    this.hemi.intensity = lerp(s.a.hemiI, s.b.hemiI, u);
    this.ambient.color.copy(this._bot);
    this.ambient.intensity = lerp(s.a.amb, s.b.amb, u);
    if (this.renderer) this.renderer.toneMappingExposure = lerp(s.a.exp, s.b.exp, u);

    this.decor.setCelestial(phase, this.sunLight);
    if (this.cloudMat) {
      const night = this._lampFactor(phase);
      this.cloudMat.color.setRGB(1 - night * 0.45, 1 - night * 0.42, 1 - night * 0.35);
    }

    const lamp = this._lampFactor(phase);
    this.lamp = lamp;
    for (let i = 0; i < this.glows.length; i++) this.glows[i].setNightGlow(lamp);

    this.phaseName = u < 0.5 ? s.a.name : s.b.name;
  }
}
