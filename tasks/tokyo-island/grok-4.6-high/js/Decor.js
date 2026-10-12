class Decor {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = "Decor";
    scene.add(this.group);
    this.clouds = [];
    this._buildSky(scene);
    this._buildSunMoon();
    this._buildStars();
    this._buildMountains();
    this._buildClouds();
  }

  _buildSky(scene) {
    const uniforms = {
      topColor: { value: new THREE.Color(0x7ec8e3) },
      bottomColor: { value: new THREE.Color(0xf7e7c4) },
      offset: { value: 6.0 },
      exponent: { value: 0.55 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader:
        "varying vec3 vWorldPos; void main(){ vec4 p = modelMatrix * vec4(position,1.0); vWorldPos = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }",
      fragmentShader:
        "varying vec3 vWorldPos; uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent;" +
        "void main(){ float h = normalize(vWorldPos).y; float t = clamp((h + 0.5) / 0.95, 0.0, 1.0); t = pow(t, max(exponent, 0.35)); gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0); }",
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), mat);
    this.group.add(sky);
    this.skyUniforms = uniforms;
    scene.fog = new THREE.FogExp2(0xb8d8ea, 0.012);
    this.fog = scene.fog;
  }

  _buildSunMoon() {
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe566 });
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), sunMat);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc14a, transparent: true, opacity: 0.28, depthWrite: false })
    );
    this.sun.add(glow);
    this.group.add(this.sun);

    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe8eefc });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1.7, 14, 12), moonMat);
    const crater = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xc9d2e8 })
    );
    crater.position.set(0.5, 0.4, 1.3);
    this.moon.add(crater);
    this.group.add(this.moon);
  }

  _buildStars() {
    const n = 220;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const h = 0.15 + Math.random() * 0.7;
      const r = 70;
      pos[i * 3] = Math.cos(a) * r * (0.6 + Math.random() * 0.4);
      pos[i * 3 + 1] = 8 + h * 50;
      pos[i * 3 + 2] = Math.sin(a) * r * (0.6 + Math.random() * 0.4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xfff7d6,
      size: 0.55,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.group.add(this.stars);
  }

  _buildMountains() {
    this.mtnMats = [];
    const pal = [0x3d5c58, 0x3a5368, 0x4a5a4a, 0x2f4a52];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.1;
      const r = 56 + (i % 3) * 5;
      const mat = toon(pal[i % pal.length]);
      this.mtnMats.push(mat);
      const h = 7 + (i % 4) * 2.2;
      const m = mesh(
        new THREE.ConeGeometry(5.5 + (i % 3) * 1.4, h, 5),
        mat,
        Math.cos(a) * r,
        -11.5,
        Math.sin(a) * r,
        false
      );
      m.rotation.y = a;
      this.group.add(m);
    }
  }

  _buildClouds() {
    const puff = toon(0xfff7ee);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const a = (i / 8) * TAU;
      const radius = 34 + (i % 4) * 4;
      const y = 12.5 + (i % 3) * 1.4;
      g.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
      g.add(mesh(new THREE.SphereGeometry(1.5, 8, 6), puff, 0, 0, 0, false));
      g.add(mesh(new THREE.SphereGeometry(1.15, 8, 6), puff, 1.35, -0.12, 0.18, false));
      g.add(mesh(new THREE.SphereGeometry(1.05, 8, 6), puff, -1.15, -0.16, -0.12, false));
      g.scale.set(1.15, 0.48, 0.9);
      this.group.add(g);
      this.clouds.push({ g: g, speed: 0.28 + (i % 3) * 0.1, radius: radius, angle: a, y: y });
    }
    const under = toon(0xfff4e8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      const p = mesh(new THREE.SphereGeometry(4.2, 8, 6), under, Math.cos(a) * 6.5, -13.5, Math.sin(a) * 6.5, false);
      p.scale.set(1.4, 0.35, 1.2);
      this.group.add(p);
    }
    this.cloudMat = puff;
  }

  update(dt, time) {
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.angle += dt * c.speed * 0.08;
      c.g.position.set(Math.cos(c.angle) * c.radius, c.y + Math.sin(time * 0.4 + i) * 0.25, Math.sin(c.angle) * c.radius);
    }
    this.stars.rotation.y += dt * 0.01;
  }

  setCelestial(phase, sunLight) {
    // phase 0 = noon (sun high), 0.25 = dusk (sun on horizon), 0.5 = midnight.
    const elev = Math.cos(phase * TAU);
    const azim = phase * TAU;
    const dist = 48;
    this.sun.position.set(Math.sin(azim) * dist, elev * 28 + 4, Math.cos(azim) * dist * 0.65);
    this.moon.position.set(-this.sun.position.x, -elev * 26 + 4, -this.sun.position.z);
    this.sun.visible = elev > -0.18;
    this.moon.visible = elev < 0.18;
    // DirectionalLight shines from its position toward the origin. After
    // sunset the sun is under the island, so the same light must jump to the
    // moon or the visible top of the scene is unlit.
    if (elev >= 0) sunLight.position.copy(this.sun.position);
    else sunLight.position.copy(this.moon.position);
    const night = smoothstep(0.08, 0.42, 0.5 - elev * 0.5);
    this.starMat.opacity = night * 0.95;
  }
}
