/* Stylized Tokyo Tower built from tapered lattice segments and two decks. */

class TokyoTower {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.y = islandSurfaceY(0, 0);

    const plinth = shadeMesh(new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.2, 3.7), mats().stone), true);
    plinth.position.y = 0.1;
    this.group.add(plinth);

    const palette = mats();
    this.red = palette.red;
    this.cream = palette.cream;
    this.braceMat = palette.brace;
    this.ink = palette.ink;
    this.gold = palette.gold;

    this._levels = [0, 1.55, 3.1, 4.7, 6.35, 7.85, 9.25, 10.45];
    this._buildLattice();
    this._buildDecks();
    this._buildSpire();
  }

  _halfWidth(y) {
    const t = Math.min(Math.max(y / 10.45, 0), 1);
    return lerp(1.72, 0.26, t);
  }

  _corner(y, index) {
    const w = this._halfWidth(y);
    const sx = index === 0 || index === 3 ? -1 : 1;
    const sz = index === 0 || index === 1 ? -1 : 1;
    return new THREE.Vector3(sx * w, y, sz * w);
  }

  _beam(from, to, thickness, material, cast) {
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = direction.length();
    if (length < 1e-4) return null;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, length, thickness), material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    // Box length runs along local +Y. Map that axis onto the segment.
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.multiplyScalar(1 / length));
    mesh.castShadow = !!cast;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _buildLattice() {
    const levels = this._levels;
    for (let s = 0; s < levels.length - 1; s++) {
      const y0 = levels[s];
      const y1 = levels[s + 1];
      const sectionMat = s % 2 === 0 ? this.cream : this.red;
      for (let c = 0; c < 4; c++) {
        this._beam(this._corner(y0, c), this._corner(y1, c), 0.11, sectionMat, true);
        const a = this._corner(y0, c);
        const b = this._corner(y0, (c + 1) % 4);
        this._beam(a, b, 0.07, sectionMat, false);
        // One diagonal per face keeps the X-brace read without doubling draw cost.
        const topNext = this._corner(y1, (c + 1) % 4);
        this._beam(a, topNext, 0.045, this.braceMat, false);
      }
    }
    for (let c = 0; c < 4; c++) {
      const y = levels[levels.length - 1];
      const a = this._corner(y, c);
      const b = this._corner(y, (c + 1) % 4);
      this._beam(a, b, 0.07, this.red, false);
    }
  }

  _deck(y, radius, height) {
    const shell = shadeMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, height, 8), this.cream),
      true
    );
    shell.position.y = y;
    this.group.add(shell);

    const rail = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.05, 0.035, 6, 24), this.red);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = y + height * 0.55;
    this.group.add(rail);

    const glass = glowMat("#241c18", "#ffd09a", 1.15);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.28, height * 0.45, 0.06), glass);
      win.position.set(Math.cos(ang) * (radius - 0.02), y, Math.sin(ang) * (radius - 0.02));
      // local +Z is the window normal. rotation.y = ang sends +Z outward: (sin ang, 0, cos ang).
      win.rotation.y = ang;
      this.group.add(win);
    }

    const light = new THREE.PointLight(0xffc48a, 0, radius * 8, 2);
    light.position.y = y;
    nightRig.trackPoint(light, radius > 1.5 ? 4.2 : 2.4);
    this.group.add(light);
  }

  _buildDecks() {
    // Main observatory, then the smaller special observatory.
    this._deck(6.15, 2.05, 0.62);
    this._deck(8.95, 1.18, 0.42);

    const band = glowMat("#5a1c18", "#ff7a55", 0.9);
    const strip = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 8), band);
    strip.position.y = 5.55;
    this.group.add(strip);
  }

  _buildSpire() {
    const segments = [
      { y: 10.45, h: 1.15, r: 0.2, mat: this.cream },
      { y: 11.6, h: 1.05, r: 0.14, mat: this.red },
      { y: 12.65, h: 0.95, r: 0.1, mat: this.cream },
      { y: 13.6, h: 1.15, r: 0.06, mat: this.red },
      { y: 14.75, h: 1.5, r: 0.035, mat: this.cream }
    ];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const mesh = shadeMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.7, seg.r, seg.h, 6), seg.mat),
        true
      );
      mesh.position.y = seg.y + seg.h / 2;
      this.group.add(mesh);
    }
    const needle = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.7, 6), this.gold);
    needle.position.y = 16.6;
    this.group.add(needle);

    this.beaconMat = toonMat("#3a1010", { emissive: "#ff2a2a", emissiveIntensity: 0 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), this.beaconMat);
    beacon.position.y = 14.3;
    this.group.add(beacon);
    const beacon2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this.beaconMat);
    beacon2.position.y = 16.15;
    this.group.add(beacon2);

    const tip = new THREE.PointLight(0xff5533, 0, 10, 2);
    tip.position.y = 14.3;
    nightRig.trackPoint(tip, 1.1);
    this.group.add(tip);
  }

  update(elapsed) {
    // Aviation beacons blink only once the tower is lit. nightRig owns the steady lamps.
    const k = nightRig.level;
    const blink = 0.25 + 0.75 * Math.max(0, Math.sin(elapsed * 4.2));
    this.beaconMat.emissiveIntensity = k * blink * 1.8;
  }
}
