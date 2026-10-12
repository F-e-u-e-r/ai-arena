/* Sky dome, sun, moon, stars, drifting clouds, distant ranges, and birds. */

class Environment {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this._buildSky();
    this._buildBodies();
    this._buildStars();
    this._buildClouds();
    this._buildMountains();
    this._buildBirds();

    this._sunDir = new THREE.Vector3();
    this._moonDir = new THREE.Vector3();
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(420, 28, 18);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color("#2f86dc") },
        horizonColor: { value: new THREE.Color("#9ed4f6") },
        bottomColor: { value: new THREE.Color("#5e94c4") },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        moonDir: { value: new THREE.Vector3(0, -1, 0) },
        sunColor: { value: new THREE.Color("#fff1d0") },
        sunGlow: { value: 1 },
        moonGlow: { value: 0 }
      },
      vertexShader: [
        "varying vec3 vWorld;",
        "void main() {",
        "  vec4 worldPos = modelMatrix * vec4(position, 1.0);",
        "  vWorld = worldPos.xyz;",
        "  gl_Position = projectionMatrix * viewMatrix * worldPos;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 topColor;",
        "uniform vec3 horizonColor;",
        "uniform vec3 bottomColor;",
        "uniform vec3 sunDir;",
        "uniform vec3 moonDir;",
        "uniform vec3 sunColor;",
        "uniform float sunGlow;",
        "uniform float moonGlow;",
        "varying vec3 vWorld;",
        "void main() {",
        "  vec3 dir = normalize(vWorld - cameraPosition);",
        "  float h = dir.y;",
        "  vec3 col = mix(bottomColor, horizonColor, smoothstep(-0.45, 0.08, h));",
        "  col = mix(col, topColor, smoothstep(0.0, 0.72, h));",
        "  float sd = max(dot(dir, sunDir), 0.0);",
        "  col += sunColor * pow(sd, 180.0) * sunGlow * 1.15;",
        "  col += sunColor * pow(sd, 14.0) * sunGlow * 0.18;",
        "  float md = max(dot(dir, moonDir), 0.0);",
        "  col += vec3(0.82, 0.88, 1.0) * pow(md, 40.0) * moonGlow * 0.55;",
        "  gl_FragColor = vec4(col, 1.0);",
        "  #include <tonemapping_fragment>",
        "  #include <encodings_fragment>",
        "}"
      ].join("\n")
    });
    const sky = new THREE.Mesh(geo, this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.group.add(sky);
  }

  _buildBodies() {
    const disc = discTexture();
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(7.5, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#ffe7b0", fog: false })
    );
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: disc,
      color: "#ffd27a",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    }));
    this.sunHalo.scale.set(36, 36, 1);
    this.sun.add(this.sunHalo);
    this.group.add(this.sun);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#f4f1e4", fog: false })
    );
    const crater = new THREE.Mesh(
      new THREE.SphereGeometry(5.05, 12, 10),
      new THREE.MeshBasicMaterial({ color: "#d5d0c4", fog: false })
    );
    crater.position.set(1.3, 0.6, 1.6);
    crater.scale.set(1, 1, 0.35);
    this.moon.add(crater);
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: disc,
      color: "#c9d6ff",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      opacity: 0.85
    }));
    this.moonHalo.scale.set(28, 28, 1);
    this.moon.add(this.moonHalo);
    this.group.add(this.moon);
  }

  _buildStars() {
    const count = 280;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Horizon band. A high camera pitch never reaches zenith, so stars
      // overhead would stay off screen for the whole session.
      const az = Math.random() * Math.PI * 2;
      const elev = 0.02 + Math.random() * 0.28;
      const radius = 230;
      const c = Math.cos(elev);
      positions[i * 3] = Math.sin(az) * c * radius;
      positions[i * 3 + 1] = Math.sin(elev) * radius;
      positions[i * 3 + 2] = Math.cos(az) * c * radius;
      const tint = Math.random();
      if (tint > 0.82) {
        colors[i * 3] = 0.7;
        colors[i * 3 + 1] = 0.82;
        colors[i * 3 + 2] = 1;
      } else if (tint > 0.64) {
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 0.94;
        colors[i * 3 + 2] = 0.78;
      } else {
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.6,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    }));
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  _buildClouds() {
    this.cloudMat = new THREE.MeshBasicMaterial({ color: "#fffdf8", fog: true });
    this.cloudShadeMat = new THREE.MeshBasicMaterial({ color: "#e4e0d8", fog: true });
    const puffGeo = new THREE.SphereGeometry(1, 8, 6);
    // Far side of the island only. Clouds drift in +X; anything with z > 0
    // swings through the gap between the default camera and the tower.
    const layout = [
      { x: -36, y: 7.2, z: -40, s: 4.4, speed: 0.16 },
      { x: 16, y: 6.2, z: -48, s: 3.8, speed: 0.14 },
      { x: -6, y: 9.0, z: -34, s: 3.1, speed: 0.18 },
      { x: 42, y: 5.4, z: -30, s: 4.0, speed: 0.13 },
      { x: -50, y: 6.8, z: -22, s: 3.6, speed: 0.12 },
      { x: 4, y: 8.4, z: -56, s: 3.4, speed: 0.15 },
      { x: -20, y: 5.6, z: -52, s: 4.2, speed: 0.17 },
      { x: 28, y: 7.6, z: -38, s: 3.2, speed: 0.16 },
      { x: 58, y: 6.4, z: -24, s: 3.6, speed: 0.11 },
      { x: -64, y: 8.2, z: -28, s: 3.3, speed: 0.1 }
    ];
    this.clouds = [];
    for (let i = 0; i < layout.length; i++) {
      const spec = layout[i];
      const group = new THREE.Group();
      const puffs = 4 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const s = spec.s * (0.45 + ((i * 3 + p) % 5) * 0.1);
        const puff = new THREE.Mesh(puffGeo, this.cloudMat);
        puff.position.set((p - puffs * 0.5) * spec.s * 0.32, ((p % 2) - 0.5) * spec.s * 0.1, ((p % 3) - 1) * spec.s * 0.14);
        puff.scale.set(s, s * 0.58, s * 0.86);
        group.add(puff);
        const shade = new THREE.Mesh(puffGeo, this.cloudShadeMat);
        shade.position.copy(puff.position);
        shade.position.y -= s * 0.32;
        shade.scale.set(s * 0.86, s * 0.36, s * 0.75);
        group.add(shade);
      }
      group.position.set(spec.x, spec.y, spec.z);
      this.group.add(group);
      this.clouds.push({ group: group, baseY: spec.y, speed: spec.speed, phase: i * 1.7 });
    }
  }

  _buildMountains() {
    const matNear = toonMat("#6a8eae");
    const matFar = toonMat("#9eb6cc");
    const specs = [
      { a: 0.4, r: 108, h: 24, rad: 18, far: false },
      { a: 1.5, r: 124, h: 30, rad: 22, far: false },
      { a: 2.4, r: 116, h: 20, rad: 16, far: false },
      { a: 3.3, r: 130, h: 28, rad: 24, far: false },
      { a: 4.4, r: 112, h: 18, rad: 15, far: false },
      { a: 5.4, r: 120, h: 26, rad: 20, far: false },
      { a: 0.9, r: 175, h: 34, rad: 30, far: true },
      { a: 2.8, r: 188, h: 40, rad: 34, far: true },
      { a: 4.7, r: 170, h: 30, rad: 26, far: true }
    ];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const geo = new THREE.ConeGeometry(spec.rad, spec.h, 6);
      geo.translate(0, spec.h / 2, 0);
      const mesh = new THREE.Mesh(geo, spec.far ? matFar : matNear);
      mesh.position.set(Math.cos(spec.a) * spec.r, spec.far ? -16 : -10, Math.sin(spec.a) * spec.r);
      mesh.rotation.y = spec.a;
      this.group.add(mesh);
    }
  }

  _buildBirds() {
    const wingGeo = new THREE.BoxGeometry(0.55, 0.035, 0.22);
    const bodyGeo = new THREE.SphereGeometry(0.12, 6, 5);
    const beakGeo = new THREE.ConeGeometry(0.04, 0.16, 4);
    const bodyMat = toonMat("#f4f7fb");
    const beakMat = toonMat("#e7a23a");
    this.birds = [];
    for (let i = 0; i < 5; i++) {
      const bird = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.scale.set(1.4, 0.7, 0.8);
      bird.add(body);
      const beak = new THREE.Mesh(beakGeo, beakMat);
      beak.rotation.x = Math.PI / 2;
      beak.position.z = 0.16;
      bird.add(beak);
      const wingL = new THREE.Mesh(wingGeo, bodyMat);
      wingL.position.set(-0.32, 0.02, 0);
      const wingR = new THREE.Mesh(wingGeo, bodyMat);
      wingR.position.set(0.32, 0.02, 0);
      bird.add(wingL);
      bird.add(wingR);
      this.group.add(bird);
      this.birds.push({
        group: bird,
        wingL: wingL,
        wingR: wingR,
        angle: (i / 5) * Math.PI * 2,
        radius: 12 + (i % 3) * 2.4,
        height: 6.2 + (i % 2) * 1.6,
        speed: 0.28 + i * 0.035,
        flap: 7 + i * 0.4
      });
    }
  }

  /**
   * Apply the day-night sample. Sun and moon positions are computed once
   * by DayNightCycle and passed in — this class does not invent a second orbit.
   */
  apply(sample, bodies) {
    const u = this.skyMat.uniforms;
    u.topColor.value.copy(sample.skyTop);
    u.horizonColor.value.copy(sample.skyHorizon);
    u.bottomColor.value.copy(sample.skyBottom);
    u.sunColor.value.copy(sample.sunColor);
    this._sunDir.copy(bodies.sunPos).normalize();
    this._moonDir.copy(bodies.moonPos).normalize();
    u.sunDir.value.copy(this._sunDir);
    u.moonDir.value.copy(this._moonDir);
    u.sunGlow.value = smoothstep(-0.25, 0.12, bodies.sunElev);
    u.moonGlow.value = smoothstep(-0.2, 0.15, bodies.moonElev) * sample.stars;

    this.sun.position.copy(bodies.sunPos);
    this.sun.material.color.copy(sample.sunColor);
    this.sun.visible = bodies.sunElev > -0.08;
    this.sunHalo.material.color.copy(sample.sunColor);

    this.moon.position.copy(bodies.moonPos);
    this.moon.visible = bodies.moonElev > -0.06;

    this.stars.material.opacity = sample.stars;
    this.cloudMat.color.copy(sample.cloud);
    this.cloudShadeMat.color.copy(sample.cloud).multiplyScalar(0.72);
  }

  update(dt, elapsed) {
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      cloud.group.position.x += cloud.speed * dt;
      if (cloud.group.position.x > 72) cloud.group.position.x = -72;
      cloud.group.position.y = cloud.baseY + Math.sin(elapsed * 0.18 + cloud.phase) * 0.45;
    }

    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i];
      bird.angle += bird.speed * dt;
      const a = bird.angle;
      // Position on a horizontal circle. Tangent (velocity) is (-sin a, 0, cos a).
      // Local +Z is the beak. rotation.y = atan2(dx, dz) aims +Z along that tangent.
      const dx = -Math.sin(a);
      const dz = Math.cos(a);
      bird.group.position.set(Math.cos(a) * bird.radius, bird.height + Math.sin(a * 2) * 0.55, Math.sin(a) * bird.radius);
      bird.group.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(elapsed * bird.flap + i);
      bird.wingL.rotation.z = 0.35 + flap * 0.55;
      bird.wingR.rotation.z = -0.35 - flap * 0.55;
    }
  }
}
