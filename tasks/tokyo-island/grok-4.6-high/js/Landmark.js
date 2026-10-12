class Landmark {
  constructor(kind, x, z, rotY) {
    this.kind = kind;
    this.group = new THREE.Group();
    this.group.name = kind;
    this.group.position.set(x, 0.7, z);
    this.group.rotation.y = rotY || 0;
    this.emissives = [];
    this.lamps = [];
    if (kind === "fuji") this._fuji();
    else if (kind === "torii") this._torii();
    else if (kind === "pagoda") this._pagoda();
    else if (kind === "lantern") this._lantern();
  }

  _fuji() {
    const body = toon(0x7d8ea3);
    const snow = toon(0xf4f7fb);
    const rock = toon(0x6a7584);
    const cone = mesh(new THREE.ConeGeometry(3.15, 4.4, 10), body, 0, 2.2, 0);
    addOutline(cone, 1.03);
    const cap = mesh(new THREE.ConeGeometry(1.15, 1.35, 10), snow, 0, 3.85, 0);
    const ridge = mesh(new THREE.ConeGeometry(2.2, 1.6, 8), rock, 0.35, 1.1, 0.2);
    this.group.add(cone, cap, ridge);
    this.group.scale.setScalar(0.92);
  }

  _torii() {
    const verm = toon(0xd62828);
    const black = toon(0x2b1d14);
    const gold = toon(0xe9c46a, { emissive: 0xaa7711, emissiveIntensity: 0 });
    this.emissives.push(gold);

    const left = mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.6, 8), verm, -1.05, 1.3, 0);
    const right = mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.6, 8), verm, 1.05, 1.3, 0);
    addOutline(left, 1.06);
    addOutline(right, 1.06);
    const kasagi = mesh(new THREE.BoxGeometry(3.15, 0.18, 0.42), verm, 0, 2.72, 0);
    kasagi.rotation.z = 0.04;
    const shimaki = mesh(new THREE.BoxGeometry(2.7, 0.12, 0.28), black, 0, 2.5, 0);
    const nuki = mesh(new THREE.BoxGeometry(2.35, 0.14, 0.2), verm, 0, 1.55, 0);
    const gakuzuka = mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), verm, 0, 2.05, 0);
    this.group.add(left, right, kasagi, shimaki, nuki, gakuzuka);

    const lamp = mesh(new THREE.SphereGeometry(0.12, 8, 8), gold, 0, 2.05, 0.22, false);
    this.group.add(lamp);
    const light = new THREE.PointLight(0xff6b3d, 0, 8, 2);
    light.position.set(0, 2.1, 0.4);
    this.lamps.push(light);
    this.group.add(light);
  }

  _pagoda() {
    const wood = toon(0x5c3a22);
    const roof = toon(0x8b1e1e);
    const gold = toon(0xe9c46a, { emissive: 0xaa7711, emissiveIntensity: 0 });
    const paper = toon(0xffe7b3, { emissive: 0xffc14a, emissiveIntensity: 0 });
    this.emissives.push(gold, paper);

    this.group.scale.setScalar(1.15);
    const shaft = mesh(new THREE.BoxGeometry(1.05, 3.4, 1.05), wood, 0, 1.7, 0);
    this.group.add(shaft);
    const glow = mesh(new THREE.BoxGeometry(1.08, 0.42, 1.08), paper, 0, 1.55, 0, false);
    this.group.add(glow);

    const roofs = [
      { y: 1.05, s: 2.15 },
      { y: 1.85, s: 1.75 },
      { y: 2.55, s: 1.35 },
      { y: 3.15, s: 1.0 },
    ];
    roofs.forEach(function (r) {
      const slab = mesh(new THREE.BoxGeometry(r.s, 0.1, r.s), roof, 0, r.y, 0);
      const cap = mesh(new THREE.ConeGeometry(r.s * 0.52, 0.32, 4), roof, 0, r.y + 0.18, 0);
      cap.rotation.y = Math.PI / 4;
      addOutline(slab, 1.03);
      this.group.add(slab, cap);
    }, this);

    const spire = mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.9, 6), gold, 0, 3.7, 0, false);
    const orb = mesh(new THREE.SphereGeometry(0.1, 8, 8), gold, 0, 4.2, 0, false);
    this.group.add(spire, orb);

    const light = new THREE.PointLight(0xffd27a, 0, 9, 2);
    light.position.set(0, 2.2, 0);
    this.lamps.push(light);
    this.group.add(light);
  }

  _lantern() {
    const stone = toon(0xc5bba8);
    const fire = toon(0xffe29a, { emissive: 0xffb703, emissiveIntensity: 0 });
    this.emissives.push(fire);
    this.group.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.18, 8), stone, 0, 0.12, 0));
    this.group.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.55, 6), stone, 0, 0.48, 0));
    this.group.add(mesh(new THREE.BoxGeometry(0.38, 0.32, 0.38), fire, 0, 0.88, 0, false));
    this.group.add(mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.12, 8), stone, 0, 1.08, 0));
  }

  setNightGlow(amount) {
    for (let i = 0; i < this.emissives.length; i++) {
      this.emissives[i].emissiveIntensity = amount * 1.6;
    }
    for (let i = 0; i < this.lamps.length; i++) {
      this.lamps[i].intensity = amount * 4.2;
    }
  }
}
