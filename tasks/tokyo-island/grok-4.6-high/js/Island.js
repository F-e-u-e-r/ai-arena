class Island {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "Island";
    this._t = 0;
    this._bob = 0.32;
    this._build();
  }

  _build() {
    const grass = toon(0x5aa64a);
    const grassDark = toon(0x3d7a38);
    const dirt = toon(0xc4a06a);
    const dirtDark = toon(0x9a7048);
    const rock = toon(0x8d7b6a);
    const rockDark = toon(0x6a5a4e);
    const sand = toon(0xe7d3a4);
    const water = toon(0x3aa7c9, { transparent: true, opacity: 0.78 });
    const wood = toon(0x6b4226);
    const stone = toon(0xb9b0a4);
    const moss = toon(0x6a9a4e);

    const top = mesh(new THREE.CylinderGeometry(11.4, 12.2, 1.1, 24), grass, 0, 0.15, 0);
    addOutline(top, 1.02);
    this.group.add(top);

    const rim = mesh(new THREE.TorusGeometry(11.6, 0.42, 8, 28), grassDark, 0, 0.55, 0);
    rim.rotation.x = Math.PI / 2;
    this.group.add(rim);

    const plateau = mesh(new THREE.CylinderGeometry(12.2, 10.4, 2.4, 24), dirt, 0, -1.35, 0);
    this.group.add(plateau);

    const mid = mesh(new THREE.CylinderGeometry(10.4, 7.2, 2.8, 20), dirtDark, 0, -3.9, 0);
    this.group.add(mid);

    const core = mesh(new THREE.CylinderGeometry(7.2, 3.6, 3.4, 16), rock, 0, -6.9, 0);
    this.group.add(core);

    const tip = mesh(new THREE.ConeGeometry(3.6, 3.2, 12), rockDark, 0, -10.0, 0);
    this.group.add(tip);

    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.4;
      const r = 8.6 + (i % 3) * 0.7;
      const h = 1.4 + (i % 4) * 0.55;
      const boulder = mesh(
        new THREE.SphereGeometry(0.55 + (i % 3) * 0.18, 7, 6),
        i % 2 ? rock : moss,
        Math.cos(a) * r,
        0.55,
        Math.sin(a) * r
      );
      boulder.scale.y = 0.55;
      this.group.add(boulder);

      const spike = mesh(
        new THREE.ConeGeometry(0.45, h, 6),
        rockDark,
        Math.cos(a + 0.2) * 5.4,
        -7.4 - (i % 3) * 0.4,
        Math.sin(a + 0.2) * 5.4
      );
      spike.rotation.z = Math.cos(a) * 0.35;
      spike.rotation.x = Math.sin(a) * 0.3;
      this.group.add(spike);
    }

    const pond = mesh(new THREE.CircleGeometry(2.15, 20), water, -4.3, 0.74, -4.6, false);
    pond.rotation.x = -Math.PI / 2;
    pond.renderOrder = 1;
    this.pond = pond;
    this.group.add(pond);

    const shore = mesh(new THREE.RingGeometry(2.05, 2.55, 20), sand, -4.3, 0.73, -4.6);
    shore.rotation.x = -Math.PI / 2;
    this.group.add(shore);

    for (let i = 0; i < 5; i++) {
      const pad = mesh(
        new THREE.CircleGeometry(0.28, 8),
        moss,
        -4.3 + Math.cos(i * 1.1) * 1.1,
        0.76,
        -4.6 + Math.sin(i * 1.4) * 0.9
      );
      pad.rotation.x = -Math.PI / 2;
      this.group.add(pad);
    }

    const deck = mesh(new THREE.BoxGeometry(1.7, 0.12, 0.55), wood, 1.1, 0.78, -3.4);
    this.group.add(deck);
    const rail = mesh(new THREE.BoxGeometry(1.7, 0.22, 0.06), wood, 1.1, 0.95, -3.64);
    this.group.add(rail);

    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const x = lerp(-6.6, 0.2, t);
      const z = lerp(6.4, 1.4, t) + Math.sin(t * 4) * 0.35;
      const slab = mesh(new THREE.BoxGeometry(0.55, 0.08, 0.38), stone, x, 0.74, z);
      slab.rotation.y = 0.4 + t * 0.5;
      this.group.add(slab);
    }

    const trees = [
      [6.6, 5.4, 1.8, 0xc1121f],
      [7.6, 4.2, 1.4, 0xe85d04],
      [5.4, 6.6, 1.2, 0xffba08],
      [-7.2, -2.2, 1.6, 0x9d0208],
      [-8.2, -0.6, 1.15, 0xd00000],
      [-6.1, -3.4, 1.05, 0xe85d04],
      [3.8, -7.2, 1.5, 0xc1121f],
      [2.2, -8.0, 1.1, 0xffba08],
      [8.4, -1.6, 1.25, 0xd00000],
      [-2.8, 7.6, 1.35, 0xe85d04],
      [0.8, 8.2, 1.0, 0xffba08],
      [-8.8, 3.2, 1.2, 0xc1121f],
    ];
    trees.forEach(function (t) {
      this.group.add(this._tree(t[0], t[1], t[2], t[3]));
    }, this);

    this.group.add(this._cherry(-1.8, -7.4));

    const waterfall = toon(0x9ad7ea, { transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    const fall = mesh(new THREE.PlaneGeometry(0.7, 3.6), waterfall, 9.6, -1.4, 2.2, false);
    fall.rotation.y = -0.6;
    this.fall = fall;
    this.group.add(fall);

    const crystal = toon(0x7ad7ff, { emissive: 0x226688, emissiveIntensity: 0.25, transparent: true, opacity: 0.85 });
    this.crystal = mesh(new THREE.OctahedronGeometry(0.55, 0), crystal, 0.2, -9.4, 0.4, false);
    this.group.add(this.crystal);
  }

  _tree(x, z, scale, leafColor) {
    const g = new THREE.Group();
    g.position.set(x, 0.7, z);
    const trunk = mesh(new THREE.CylinderGeometry(0.12 * scale, 0.2 * scale, 1.15 * scale, 6), toon(0x5c3a22), 0, 0.55 * scale, 0);
    g.add(trunk);
    const canopyMat = toon(leafColor);
    const s1 = mesh(new THREE.SphereGeometry(0.72 * scale, 8, 6), canopyMat, 0, 1.25 * scale, 0);
    const s2 = mesh(new THREE.SphereGeometry(0.52 * scale, 8, 6), canopyMat, 0.38 * scale, 1.15 * scale, 0.1);
    const s3 = mesh(new THREE.SphereGeometry(0.46 * scale, 8, 6), canopyMat, -0.32 * scale, 1.05 * scale, -0.18);
    addOutline(s1, 1.04);
    g.add(s1, s2, s3);
    return g;
  }

  _cherry(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0.7, z);
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 6), toon(0x4a3222), 0, 0.65, 0));
    const blossom = toon(0xffb3c7);
    g.add(mesh(new THREE.SphereGeometry(0.55, 8, 6), blossom, 0, 1.45, 0));
    g.add(mesh(new THREE.SphereGeometry(0.38, 8, 6), blossom, 0.4, 1.3, 0.15));
    g.add(mesh(new THREE.SphereGeometry(0.34, 8, 6), blossom, -0.32, 1.28, -0.2));
    return g;
  }

  update(dt, time) {
    this._t = time;
    // Gentle hover so the whole island (and everything parented to it) breathes.
    this.group.position.y = Math.sin(time * 0.55) * this._bob;
    this.group.rotation.z = Math.sin(time * 0.31) * 0.018;
    this.group.rotation.x = Math.cos(time * 0.27) * 0.014;
    if (this.pond) this.pond.position.y = 0.74 + Math.sin(time * 1.6) * 0.03;
    if (this.fall) this.fall.material.opacity = 0.35 + Math.sin(time * 4.2) * 0.08;
    if (this.crystal) {
      this.crystal.rotation.y += dt * 0.7;
      this.crystal.position.y = -9.4 + Math.sin(time * 1.8) * 0.12;
    }
  }
}
