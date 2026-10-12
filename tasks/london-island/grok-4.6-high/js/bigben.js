/**
 * Cartoon Big Ben / Elizabeth Tower from boxes, cylinders, and canvas clock faces.
 */
(function (global) {
  const THREE = global.THREE;
  const Art = global.Art;

  function makeClockFace() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#f3ead6";
    g.beginPath();
    g.arc(128, 128, 122, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#3b2a1a";
    g.lineWidth = 8;
    g.stroke();
    g.fillStyle = "#3b2a1a";
    g.font = "bold 28px serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const nums = ["XII", "III", "VI", "IX"];
    const pos = [[128, 38], [218, 132], [128, 220], [38, 132]];
    for (let i = 0; i < 4; i++) g.fillText(nums[i], pos[i][0], pos[i][1]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const inner = i % 3 === 0 ? 96 : 104;
      g.beginPath();
      g.moveTo(128 + Math.sin(a) * inner, 128 - Math.cos(a) * inner);
      g.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114);
      g.lineWidth = i % 3 === 0 ? 5 : 2;
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  class BigBen {
    constructor() {
      this.group = new THREE.Group();
      this.group.name = "BigBen";
      this.group.position.set(0.15, 0.55, 3.35);
      this._hands = [];
      this._lamps = [];
      this._build();
    }

    _add(geo, mat, x, y, z, rx, ry, rz) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.set(rx, ry || 0, rz || 0);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    }

    _build() {
      const stone = Art.toon(0xd8c7a1);
      const stoneDark = Art.toon(0xb79b74);
      const gold = Art.toon(0xe0b84a);
      const roof = Art.toon(0x4a3a2a);
      const iron = Art.toon(0x3a322c);
      this.clockMat = Art.toonEmissive(0xf3ead6, 0xffd27a, { map: makeClockFace() });
      this.windowMat = Art.toonEmissive(0x6ec6ff, 0xffc14d);

      this._add(new THREE.BoxGeometry(3.1, 0.55, 3.1), stoneDark, 0, 0.28, 0);
      this._add(new THREE.BoxGeometry(2.55, 1.1, 2.55), stone, 0, 1.05, 0);
      this._add(new THREE.BoxGeometry(2.15, 6.4, 2.15), stone, 0, 4.2, 0);

      for (let i = 0; i < 4; i++) {
        const y = 1.9 + i * 1.35;
        this._add(new THREE.BoxGeometry(2.25, 0.12, 2.25), stoneDark, 0, y, 0);
        const wx = i % 2 === 0 ? 1.09 : 0;
        const wz = i % 2 === 0 ? 0 : 1.09;
        const w1 = this._add(new THREE.BoxGeometry(0.38, 0.7, 0.08), this.windowMat, wx, y + 0.5, wz || 1.09 * (i === 3 ? -1 : 1));
        if (i % 2 === 1) w1.rotation.y = Math.PI / 2;
        this._lamps.push(w1);
      }

      this._add(new THREE.BoxGeometry(2.7, 2.35, 2.7), stone, 0, 8.55, 0);
      this._add(new THREE.BoxGeometry(2.9, 0.18, 2.9), gold, 0, 7.45, 0);
      this._add(new THREE.BoxGeometry(2.9, 0.18, 2.9), gold, 0, 9.7, 0);

      const faceGeo = new THREE.CircleGeometry(0.72, 24);
      const offsets = [[0, 0, 1.37], [0, 0, -1.37], [1.37, 0, 0], [-1.37, 0, 0]];
      const rots = [[0, 0, 0], [0, Math.PI, 0], [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0]];
      for (let i = 0; i < 4; i++) {
        const face = this._add(faceGeo, this.clockMat, offsets[i][0], 8.55, offsets[i][2], rots[i][0], rots[i][1], rots[i][2]);
        face.castShadow = false;
        const hands = new THREE.Group();
        hands.position.set(offsets[i][0], 8.55, offsets[i][2]);
        hands.rotation.y = rots[i][1];
        const hour = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.04), iron);
        hour.position.z = 0.04;
        hour.position.y = 0.16;
        const minute = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.55, 0.03), iron);
        minute.position.z = 0.05;
        minute.position.y = 0.22;
        const pivotH = new THREE.Group();
        const pivotM = new THREE.Group();
        pivotH.add(hour);
        pivotM.add(minute);
        hands.add(pivotH, pivotM);
        this.group.add(hands);
        this._hands.push({ hour: pivotH, minute: pivotM });
      }

      this._add(new THREE.CylinderGeometry(1.15, 1.35, 0.7, 8), stoneDark, 0, 10.2, 0);
      this._add(new THREE.ConeGeometry(1.25, 1.6, 8), roof, 0, 11.3, 0);
      this._add(new THREE.CylinderGeometry(0.12, 0.16, 1.5, 6), gold, 0, 12.3, 0);
      this._add(new THREE.SphereGeometry(0.18, 8, 6), gold, 0, 13.1, 0);

      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this._add(new THREE.ConeGeometry(0.18, 0.7, 5), roof, Math.cos(a) * 1.2, 10.05, Math.sin(a) * 1.2);
      }

      this.light = new THREE.PointLight(0xffc14d, 0, 16, 2);
      this.light.position.set(0, 8.6, 0);
      this.group.add(this.light);
    }

    /**
     * Map day-night 0..1 (midnight origin) onto analogue hands:
     * 1.0 = 24h, hour hand twice around, minute hand 24 times.
     */
    update(timeOfDay) {
      const hours = timeOfDay * 24;
      const hourAngle = -(hours / 12) * Math.PI * 2;
      const minuteAngle = -(hours * 60 % 60) / 60 * Math.PI * 2;
      for (let i = 0; i < this._hands.length; i++) {
        this._hands[i].hour.rotation.z = hourAngle;
        this._hands[i].minute.rotation.z = minuteAngle;
      }
    }

    setLights(amount) {
      this.clockMat.emissiveIntensity = amount * 0.85;
      this.windowMat.emissiveIntensity = amount * 1.4;
      this.light.intensity = amount * 10;
    }
  }

  global.BigBen = BigBen;
})(window);
