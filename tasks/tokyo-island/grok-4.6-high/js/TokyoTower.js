class TokyoTower {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "TokyoTower";
    this.group.position.set(0.15, 0.7, 0.1);
    this.emissives = [];
    this.lamps = [];
    this._build();
  }

  _build() {
    const red = toon(0xd62828);
    const white = toon(0xfff4e4);
    const steel = toon(0x6d645c);
    const nightWin = toon(0xffe29a, { emissive: 0xffc14a, emissiveIntensity: 0 });
    this.emissives.push(nightWin);

    const stripes = [
      { y: 0.55, h: 1.1, r1: 1.55, r2: 1.25, mat: red },
      { y: 1.55, h: 0.9, r1: 1.25, r2: 1.02, mat: white },
      { y: 2.4, h: 0.8, r1: 1.02, r2: 0.84, mat: red },
      { y: 3.15, h: 0.7, r1: 0.84, r2: 0.7, mat: white },
      { y: 3.85, h: 0.7, r1: 0.7, r2: 0.56, mat: red },
      { y: 4.55, h: 0.7, r1: 0.56, r2: 0.44, mat: white },
      { y: 5.2, h: 0.6, r1: 0.44, r2: 0.34, mat: red },
    ];
    stripes.forEach(function (s) {
      const m = mesh(new THREE.CylinderGeometry(s.r2, s.r1, s.h, 8), s.mat, 0, s.y, 0);
      addOutline(m, 1.035);
      this.group.add(m);
    }, this);

    const legs = [
      [1.35, 1.35],
      [1.35, -1.35],
      [-1.35, 1.35],
      [-1.35, -1.35],
    ];
    legs.forEach(function (p) {
      const leg = mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.6, 5), steel, p[0] * 0.85, 0.55, p[1] * 0.85);
      leg.rotation.z = p[0] > 0 ? -0.55 : 0.55;
      leg.rotation.x = p[1] > 0 ? 0.55 : -0.55;
      this.group.add(leg);
    }, this);

    const deck1 = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.38, 10), white, 0, 3.55, 0);
    const deck2 = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 10), white, 0, 5.55, 0);
    this.group.add(deck1, deck2);

    const windows1 = mesh(new THREE.CylinderGeometry(0.96, 0.96, 0.12, 10), nightWin, 0, 3.55, 0, false);
    const windows2 = mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.1, 10), nightWin, 0, 5.55, 0, false);
    this.group.add(windows1, windows2);

    const spire = mesh(new THREE.CylinderGeometry(0.05, 0.22, 2.4, 6), red, 0, 6.85, 0);
    const tip = mesh(new THREE.SphereGeometry(0.12, 8, 8), white, 0, 8.12, 0, false);
    const antenna = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5), steel, 0, 8.52, 0, false);
    this.group.add(spire, tip, antenna);

    const lampMat = toon(0xfff1c1, { emissive: 0xffb703, emissiveIntensity: 0 });
    this.emissives.push(lampMat);
    const bulb1 = mesh(new THREE.SphereGeometry(0.1, 8, 8), lampMat, 0.7, 3.8, 0.7, false);
    const bulb2 = mesh(new THREE.SphereGeometry(0.08, 8, 8), lampMat, -0.45, 5.75, 0.4, false);
    this.group.add(bulb1, bulb2);

    const p1 = new THREE.PointLight(0xffc14a, 0, 12, 2);
    p1.position.set(0, 3.7, 0);
    const p2 = new THREE.PointLight(0xffe08a, 0, 9, 2);
    p2.position.set(0, 5.7, 0);
    this.lamps.push(p1, p2);
    this.group.add(p1, p2);
  }

  setNightGlow(amount) {
    for (let i = 0; i < this.emissives.length; i++) {
      this.emissives[i].emissiveIntensity = amount * (i === 0 ? 1.4 : 2.1);
    }
    this.lamps[0].intensity = amount * 5.2;
    this.lamps[1].intensity = amount * 3.4;
  }
}
