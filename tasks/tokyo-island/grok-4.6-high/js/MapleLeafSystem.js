class MapleLeafSystem {
  constructor(scene, count) {
    this.count = count;
    this.dummy = new THREE.Object3D();
    this.states = new Array(count);
    this.colors = [0xc1121f, 0xe85d04, 0xffba08, 0x9d0208, 0xd00000, 0xf4a261];

    const geo = new THREE.PlaneGeometry(0.42, 0.5);
    const mat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      gradientMap: TOON_GRADIENT,
      alphaMap: makeMapleAlpha(),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;

    for (let i = 0; i < count; i++) {
      this.states[i] = {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        rvx: 0,
        rvy: 0,
        rvz: 0,
        sway: 0,
        swaySpeed: 0,
        scale: 1,
      };
      this._respawn(i, true);
      this.mesh.setColorAt(i, new THREE.Color(this.colors[i % this.colors.length]));
    }
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  _respawn(i, scatterY) {
    const s = this.states[i];
    const a = Math.random() * TAU;
    const r = 2 + Math.random() * 13;
    s.x = Math.cos(a) * r;
    s.z = Math.sin(a) * r;
    s.y = scatterY ? lerp(-4, 16, Math.random()) : lerp(11, 17.5, Math.random());
    s.vx = (Math.random() - 0.5) * 0.6;
    s.vy = -(0.7 + Math.random() * 1.15);
    s.vz = (Math.random() - 0.5) * 0.6;
    s.rx = Math.random() * TAU;
    s.ry = Math.random() * TAU;
    s.rz = Math.random() * TAU;
    s.rvx = (Math.random() - 0.5) * 4.5;
    s.rvy = (Math.random() - 0.5) * 6.0;
    s.rvz = (Math.random() - 0.5) * 3.2;
    s.sway = Math.random() * TAU;
    s.swaySpeed = 1.2 + Math.random() * 2.4;
    s.scale = 0.55 + Math.random() * 0.75;
  }

  update(dt, time) {
    // Object-pool physics: instances are never allocated/freed. A leaf that
    // falls below the island is reset in place (same slot, new spawn pose).
    const dummy = this.dummy;
    const wind = Math.sin(time * 0.35) * 0.55;
    for (let i = 0; i < this.count; i++) {
      const s = this.states[i];
      const sway = Math.sin(time * s.swaySpeed + s.sway);
      const flutter = Math.cos(time * s.swaySpeed * 1.7 + s.sway);
      s.x += (s.vx + wind + sway * 0.85) * dt;
      s.z += (s.vz + flutter * 0.55) * dt;
      s.y += s.vy * dt;
      s.rx += s.rvx * dt;
      s.ry += s.rvy * dt;
      s.rz += (s.rvz + sway * 1.8) * dt;
      if (s.y < -8 || Math.abs(s.x) > 22 || Math.abs(s.z) > 22) this._respawn(i, false);
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(s.rx, s.ry, s.rz);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
