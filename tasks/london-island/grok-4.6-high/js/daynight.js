/**
 * 15-second day/night orbit plus sky dome, sun, moon, and landmark lamp gating.
 */
(function (global) {
  const THREE = global.THREE;

  const TAU = Math.PI * 2;
  const DAY_PERIOD = 15;

  // Keyframes in timeOfDay [0,1) where 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk.
  const KEYS = [
    { t: 0.00, top: 0x05061a, hor: 0x10183a, bot: 0x070712, sun: 0x1a1a40, amb: 0.16, dir: 0.05, name: "Night" },
    { t: 0.18, top: 0x1a1440, hor: 0x3a2a5a, bot: 0x140e28, sun: 0x8866aa, amb: 0.22, dir: 0.15, name: "Night" },
    { t: 0.24, top: 0x4a3a78, hor: 0xff9a6c, bot: 0x2a1a38, sun: 0xffb07a, amb: 0.45, dir: 0.7, name: "Dawn" },
    { t: 0.32, top: 0x6eb0e8, hor: 0xc8e4f8, bot: 0x87b8d8, sun: 0xfff0c8, amb: 0.7, dir: 1.6, name: "Day" },
    { t: 0.50, top: 0x4aa3e8, hor: 0xb8dcfa, bot: 0x7ec0e8, sun: 0xfff6d8, amb: 0.85, dir: 2.2, name: "Day" },
    { t: 0.70, top: 0x3a5a98, hor: 0xff8a4a, bot: 0x6a3a58, sun: 0xff7a3a, amb: 0.5, dir: 1.1, name: "Dusk" },
    { t: 0.82, top: 0x1a1448, hor: 0x6a2a6a, bot: 0x120c28, sun: 0xaa5588, amb: 0.28, dir: 0.25, name: "Night" },
    { t: 0.90, top: 0x07081c, hor: 0x12183c, bot: 0x060610, sun: 0x22224a, amb: 0.16, dir: 0.06, name: "Night" }
  ];

  function wrapLerp(t) {
    let i = 0;
    while (i < KEYS.length - 1 && KEYS[i + 1].t <= t) i++;
    const a = KEYS[i];
    const b = KEYS[(i + 1) % KEYS.length];
    const bT = b.t < a.t ? b.t + 1 : b.t;
    const tt = a.t === bT ? 0 : (t < a.t ? t + 1 - a.t : t - a.t) / (bT - a.t);
    return { a, b, t: THREE.MathUtils.clamp(tt, 0, 1) };
  }

  class DayNightCycle {
    constructor(scene, renderer) {
      this.scene = scene;
      this.renderer = renderer;
      this.timeOfDay = 0.38;
      this.period = DAY_PERIOD;
      this.paused = false;
      this.top = new THREE.Color();
      this.hor = new THREE.Color();
      this.bot = new THREE.Color();
      this.sunCol = new THREE.Color();
      this._cA = new THREE.Color();
      this._cB = new THREE.Color();
      this.phaseName = "Day";
      this.nightAmount = 0;
      this._build(scene);
    }

    _build(scene) {
      this.hemi = new THREE.HemisphereLight(0xb8d8ff, 0x6a8a4a, 0.7);
      scene.add(this.hemi);

      this.ambient = new THREE.AmbientLight(0xffffff, 0.45);
      scene.add(this.ambient);

      this.sunLight = new THREE.DirectionalLight(0xfff1c8, 2);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
      this.sunLight.shadow.camera.near = 4;
      this.sunLight.shadow.camera.far = 70;
      this.sunLight.shadow.camera.left = -18;
      this.sunLight.shadow.camera.right = 18;
      this.sunLight.shadow.camera.top = 16;
      this.sunLight.shadow.camera.bottom = -16;
      this.sunLight.shadow.bias = -0.0008;
      scene.add(this.sunLight);
      scene.add(this.sunLight.target);

      this.moonLight = new THREE.DirectionalLight(0xb8c8ff, 0.15);
      scene.add(this.moonLight);

      this.sun = new THREE.Mesh(
        new THREE.SphereGeometry(1.35, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xfff3c0 })
      );
      const corona = new THREE.Mesh(
        new THREE.SphereGeometry(1.9, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false })
      );
      this.sun.add(corona);
      scene.add(this.sun);

      this.moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0xe8eefc })
      );
      const crater = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xc5cde0 })
      );
      crater.position.set(0.35, 0.2, 0.55);
      this.moon.add(crater);
      scene.add(this.moon);

      this.skyUniforms = {
        uTop: { value: new THREE.Color(0x4aa3e8) },
        uHorizon: { value: new THREE.Color(0xb8dcfa) },
        uBottom: { value: new THREE.Color(0x7ec0e8) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xfff1c8) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uMoonGlow: { value: 0 }
      };
      const skyMat = new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: [
          "varying vec3 vWorld;",
          "void main() {",
          "  vec4 w = modelMatrix * vec4(position, 1.0);",
          "  vWorld = w.xyz;",
          "  gl_Position = projectionMatrix * viewMatrix * w;",
          "}"
        ].join("\n"),
        fragmentShader: [
          "uniform vec3 uTop;",
          "uniform vec3 uHorizon;",
          "uniform vec3 uBottom;",
          "uniform vec3 uSunDir;",
          "uniform vec3 uSunColor;",
          "uniform vec3 uMoonDir;",
          "uniform float uMoonGlow;",
          "varying vec3 vWorld;",
          "void main() {",
          "  vec3 dir = normalize(vWorld);",
          "  float h = dir.y;",
          "  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.72, h));",
          "  col = mix(uBottom, col, smoothstep(-0.45, 0.08, h));",
          "  float sun = pow(max(dot(dir, uSunDir), 0.0), 72.0);",
          "  float halo = pow(max(dot(dir, uSunDir), 0.0), 8.0);",
          "  col += uSunColor * sun * 1.4 + uSunColor * halo * 0.18;",
          "  float moon = pow(max(dot(dir, uMoonDir), 0.0), 220.0);",
          "  col += vec3(0.82, 0.88, 1.0) * moon * uMoonGlow;",
          "  gl_FragColor = vec4(col, 1.0);",
          "}"
        ].join("\n"),
        side: THREE.BackSide,
        depthWrite: false,
        fog: false
      });
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), skyMat);
      scene.add(this.sky);

      const starGeo = new THREE.BufferGeometry();
      const starCount = 420;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * TAU;
        const phi = Math.acos(2 * v - 1);
        const r = 160;
        starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
        starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      this.starMat = new THREE.PointsMaterial({
        color: 0xf4f7ff,
        size: 0.9,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        sizeAttenuation: false
      });
      this.stars = new THREE.Points(starGeo, this.starMat);
      scene.add(this.stars);

      scene.fog = new THREE.FogExp2(0xb9d8f0, 0.012);
    }

    /**
     * Landmark lamps: ON as dusk begins (0.70→0.76 fade-in), OFF just before dawn
     * (0.18→0.24 fade-out). Values wrap across midnight so the night plateau is 1.
     */
    _lampAmount(t) {
      // MathUtils.smoothstep(x, min, max) — x is the sample, not GLSL order.
      if (t >= 0.70) return THREE.MathUtils.smoothstep(t, 0.70, 0.76);
      if (t <= 0.18) return 1;
      if (t < 0.24) return 1 - THREE.MathUtils.smoothstep(t, 0.18, 0.24);
      return 0;
    }

    setTime(t) {
      this.timeOfDay = ((t % 1) + 1) % 1;
    }

    skipTo(name) {
      const map = { dawn: 0.24, day: 0.42, dusk: 0.76, night: 0.0 };
      if (name in map) this.timeOfDay = map[name];
    }

    /**
     * Celestial angle: theta = (timeOfDay - 0.25) * TAU
     * dawn (0.25) → sun on +X horizon; noon (0.5) → sun at +Y.
     * Moon sits at theta + PI. Palette keys lerp, wrapping midnight.
     */
    update(dt, seasonMix) {
      if (!this.paused) this.timeOfDay = (this.timeOfDay + dt / this.period) % 1;
      const t = this.timeOfDay;
      const blend = wrapLerp(t);
      const k = blend.t;
      const A = blend.a;
      const B = blend.b;

      this.top.copy(this._cA.set(A.top).lerp(this._cB.set(B.top), k));
      this.hor.copy(this._cA.set(A.hor).lerp(this._cB.set(B.hor), k));
      this.bot.copy(this._cA.set(A.bot).lerp(this._cB.set(B.bot), k));
      this.sunCol.copy(this._cA.set(A.sun).lerp(this._cB.set(B.sun), k));
      const amb = A.amb + (B.amb - A.amb) * k;
      const dir = A.dir + (B.dir - A.dir) * k;
      this.phaseName = k <= 0.5 ? A.name : B.name;

      const theta = (t - 0.25) * TAU;
      const radius = 28;
      const sunX = Math.cos(theta) * radius;
      const sunY = Math.sin(theta) * radius;
      const sunZ = Math.sin(theta * 0.35) * 6;
      this.sun.position.set(sunX, sunY, sunZ);
      this.moon.position.set(-sunX, -sunY, -sunZ);
      this.sun.visible = sunY > -2;
      this.moon.visible = -sunY > -2;

      this.sunLight.position.copy(this.sun.position);
      this.sunLight.target.position.set(0, 2, 0);
      this.moonLight.position.copy(this.moon.position);

      const sunH = THREE.MathUtils.clamp(sunY / radius, 0, 1);
      const moonH = THREE.MathUtils.clamp(-sunY / radius, 0, 1);

      this.sunLight.color.copy(this.sunCol).lerp(seasonMix.sunTint, 0.35);
      this.sunLight.intensity = dir * (0.35 + 0.65 * sunH) * (0.85 + seasonMix.exposure * 0.15);
      this.moonLight.intensity = 0.45 * moonH;
      this.ambient.color.copy(seasonMix.ambient).lerp(this.hor, 0.35);
      this.ambient.intensity = amb * 0.7 * seasonMix.exposure;
      this.hemi.color.copy(seasonMix.hemiSky).lerp(this.top, 0.4);
      this.hemi.groundColor.copy(seasonMix.hemiGround);
      this.hemi.intensity = 0.35 + amb * 0.4;

      this.skyUniforms.uTop.value.copy(this.top);
      this.skyUniforms.uHorizon.value.copy(this.hor);
      this.skyUniforms.uBottom.value.copy(this.bot);
      this.skyUniforms.uSunColor.value.copy(this.sunCol);
      this.skyUniforms.uSunDir.value.copy(this.sun.position).normalize();
      this.skyUniforms.uMoonDir.value.copy(this.moon.position).normalize();
      this.skyUniforms.uMoonGlow.value = moonH;

      this.starMat.opacity = moonH * 0.9;
      this.stars.rotation.y += dt * 0.01;

      const fogCol = this._cA.copy(seasonMix.fog).lerp(this.hor, 0.45);
      this.scene.fog.color.copy(fogCol);
      this.scene.fog.density = seasonMix.fogDensity * (0.85 + moonH * 0.55);
      this.scene.background = this.hor;

      this.renderer.toneMappingExposure = seasonMix.exposure * (0.9 + sunH * 0.2);

      this.nightAmount = this._lampAmount(t);
      return this.nightAmount;
    }
  }

  global.DayNightCycle = DayNightCycle;
  global.DAY_PERIOD = DAY_PERIOD;
})(window);
