/* Simplified Japanese landmarks: Fuji, a vermilion torii, and a small shrine. */

class Landmark {
  constructor(type) {
    this.group = new THREE.Group();
    this.type = type;
    this.flickerLights = [];
    this.seed = Math.random() * Math.PI * 2;
    if (type === "fuji") this._buildFuji();
    else if (type === "torii") this._buildTorii();
    else if (type === "temple") this._buildTemple();
  }

  _sit(x, z) {
    this.group.position.set(x, islandSurfaceY(x, z), z);
  }

  /** Aim the group's local +Z at the island center. θ = atan2(dx, dz). */
  _faceOrigin() {
    const dx = -this.group.position.x;
    const dz = -this.group.position.z;
    this.group.rotation.y = Math.atan2(dx, dz);
  }

  _pad(radius, height, color) {
    const pad = shadeMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, height, 10), toonMat(color)),
      true
    );
    pad.position.y = height * 0.15;
    this.group.add(pad);
    return height * 0.55;
  }

  _buildFuji() {
    const spot = SCENE.fuji;
    this._sit(spot.x, spot.z);
    const ground = this._pad(3.45, 0.42, "#6aaa52");

    const body = shadeMesh(new THREE.Mesh(new THREE.ConeGeometry(3.05, 5.15, 8), mats().fuji), true);
    body.position.y = ground + 5.15 / 2 - 0.05;
    this.group.add(body);

    // Snow cap is a fatter, shorter cone so it sits on the slope instead of z-fighting.
    const snow = shadeMesh(new THREE.Mesh(new THREE.ConeGeometry(1.42, 2.15, 8), mats().snow), true);
    snow.position.y = ground + 5.15 - 1.05;
    snow.rotation.y = Math.PI / 8;
    this.group.add(snow);

    const ridge = toonMat("#6e849c");
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const streak = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.08), ridge);
      streak.position.set(Math.cos(ang) * 0.85, ground + 2.3, Math.sin(ang) * 0.85);
      streak.rotation.y = ang;
      this.group.add(streak);
    }

    const scrub = toonMat("#4f8f3c");
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.4;
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), scrub);
      bush.position.set(Math.cos(ang) * 2.5, ground + 0.15, Math.sin(ang) * 2.5);
      bush.scale.y = 0.55;
      this.group.add(bush);
    }
  }

  _toriiGroup(scale) {
    const g = new THREE.Group();
    g.scale.setScalar(scale);
    const red = mats().red;
    const ink = mats().ink;

    function pillar(x) {
      const column = shadeMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.45, 8), red), true);
      column.position.set(x, 1.28, 0);
      g.add(column);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.38, 8), ink);
      sleeve.position.set(x, 0.2, 0);
      g.add(sleeve);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.4), mats().stone);
      foot.position.set(x, 0.06, 0);
      g.add(foot);
    }
    pillar(-0.74);
    pillar(0.74);

    const kasagi = shadeMesh(new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 0.26), red), true);
    kasagi.position.y = 2.52;
    g.add(kasagi);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.07, 0.32), red);
    cap.position.y = 2.62;
    g.add(cap);

    // Upturned ends. Negative Z-rotation lifts the -X tip (see frame note in the file header usage).
    const endGeo = new THREE.BoxGeometry(0.46, 0.07, 0.3);
    const endL = new THREE.Mesh(endGeo, red);
    endL.position.set(-1.12, 2.7, 0);
    endL.rotation.z = -0.42;
    const endR = new THREE.Mesh(endGeo, red);
    endR.position.set(1.12, 2.7, 0);
    endR.rotation.z = 0.42;
    g.add(endL);
    g.add(endR);

    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.2), red);
    shimaki.position.y = 2.36;
    g.add(shimaki);

    const nuki = shadeMesh(new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.1, 0.16), red), true);
    nuki.position.y = 1.82;
    g.add(nuki);

    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.06), ink);
    plaque.position.y = 2.12;
    g.add(plaque);
    const plaqueGold = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.02), mats().gold);
    plaqueGold.position.set(0, 2.12, 0.035);
    g.add(plaqueGold);

    return g;
  }

  _buildTorii() {
    const spot = SCENE.torii;
    this._sit(spot.x, spot.z);
    this._faceOrigin();
    this.group.add(this._toriiGroup(1));

    const lantern = this._hangingLantern();
    lantern.position.set(0, 1.55, 0.22);
    this.group.add(lantern);
  }

  _hangingLantern() {
    const g = new THREE.Group();
    const chamber = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.2, 0.18),
      glowMat("#2a2018", "#ffb15e", 0.85)
    );
    g.add(chamber);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.1, 4), mats().roof);
    cap.position.y = 0.14;
    cap.rotation.y = Math.PI / 4;
    g.add(cap);
    const light = new THREE.PointLight(0xffb15e, 0, 4.2, 2);
    nightRig.trackPoint(light, 0.55);
    this.flickerLights.push(light);
    g.add(light);
    return g;
  }

  _buildTemple() {
    const spot = SCENE.temple;
    this._sit(spot.x, spot.z);
    this._faceOrigin();
    const baseY = this._pad(1.7, 0.28, "#d9d0c0");

    const step = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.15), mats().stone);
    step.position.y = baseY + 0.08;
    this.group.add(step);

    const floorY = baseY + 0.22;
    const wall = shadeMesh(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.72, 0.95), toonMat("#f3efe4")), true);
    wall.position.y = floorY + 0.46;
    this.group.add(wall);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.06), mats().ink);
    door.position.set(0, floorY + 0.36, 0.48);
    this.group.add(door);

    const pillarGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6);
    const corners = [[-0.62, -0.42], [0.62, -0.42], [-0.62, 0.42], [0.62, 0.42]];
    for (let i = 0; i < corners.length; i++) {
      const pillar = shadeMesh(new THREE.Mesh(pillarGeo, mats().red), true);
      pillar.position.set(corners[i][0], floorY + 0.45, corners[i][1]);
      this.group.add(pillar);
    }

    const windowMat = glowMat("#2a2018", "#ffc48a", 1.0);
    for (let s = -1; s <= 1; s += 2) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.04), windowMat);
      win.position.set(s * 0.38, floorY + 0.5, 0.49);
      this.group.add(win);
    }

    this._roof(1.65, 0.58, floorY + 0.95);
    // Second story
    const upper = shadeMesh(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.55), toonMat("#f7f3ea")), true);
    upper.position.y = floorY + 1.45;
    this.group.add(upper);
    this._roof(1.05, 0.42, floorY + 1.72);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mats().gold);
    finial.position.y = floorY + 2.05;
    this.group.add(finial);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), mats().gold);
    spike.position.y = floorY + 2.2;
    this.group.add(spike);

    const light = new THREE.PointLight(0xffc48a, 0, 7, 2);
    light.position.set(0, floorY + 0.7, 0.3);
    nightRig.trackPoint(light, 1.15);
    this.flickerLights.push(light);
    this.group.add(light);

    const mini = this._toriiGroup(0.4);
    mini.position.set(0, 0, 1.35);
    this.group.add(mini);
  }

  _roof(radius, height, y) {
    const trim = shadeMesh(new THREE.Mesh(new THREE.ConeGeometry(radius * 1.08, height * 0.55, 4), mats().roofTrim), true);
    trim.position.y = y;
    trim.rotation.y = Math.PI / 4;
    this.group.add(trim);
    const tile = shadeMesh(new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), mats().roof), true);
    tile.position.y = y + height * 0.18;
    tile.rotation.y = Math.PI / 4;
    this.group.add(tile);
  }

  update(elapsed) {
    if (!this.flickerLights.length) return;
    const k = nightRig.level;
    const flick = 0.82 + 0.18 * Math.sin(elapsed * 8.5 + this.seed);
    for (let i = 0; i < this.flickerLights.length; i++) {
      const light = this.flickerLights[i];
      light.intensity = light.userData.nightBase * k * flick;
    }
  }
}
