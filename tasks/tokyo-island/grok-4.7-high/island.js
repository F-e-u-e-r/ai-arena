/* Floating island: lathe body, autumn trees, pond, lanterns, fireflies. */

class Island {
  constructor() {
    this.group = new THREE.Group();
    this.trees = [];
    this._buildBody();
    this._buildSurface();
    this._buildTrees();
    this._buildPond();
    this._buildLanterns();
    this._buildFireflies();
    this._buildSpikes();
  }

  _buildBody() {
    const pts = [];
    const under = [
      [0.25, -7.3],
      [1.7, -6.15],
      [3.5, -4.55],
      [5.7, -2.95],
      [7.7, -1.55],
      [9.5, -0.5],
      [10.75, 0.08],
      [11.3, 0.32]
    ];
    for (let i = 0; i < under.length; i++) {
      pts.push(new THREE.Vector2(under[i][0], under[i][1]));
    }
    // Overhang lip, then the dome expressed by islandSurfaceY so props sit on it.
    pts.push(new THREE.Vector2(11.42, 0.5));
    pts.push(new THREE.Vector2(10.35, 0.52));
    for (let r = 10.05; r >= 0.2; r -= 0.85) {
      pts.push(new THREE.Vector2(r, islandSurfaceY(r, 0)));
    }

    const geo = new THREE.LatheGeometry(pts, 28);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const radius = Math.hypot(x, z);
      const n = Math.sin(x * 0.85 + z * 1.1) * 0.5 + 0.5;
      const n2 = Math.sin(x * 2.4 - z * 1.7) * 0.5 + 0.5;
      if (y > 0.5 && radius < 10.7) {
        if (n > 0.72) color.set("#63c247");
        else if (n2 > 0.6) color.set("#2c7d30");
        else color.set("#3fa338");
      } else if (y > 0.12) {
        color.set(n > 0.5 ? "#c4894a" : "#8d5a32");
      } else {
        const band = 0.5 + 0.5 * Math.sin(y * 8.0 + n * 3.0);
        if (band > 0.62) color.set("#7a5b48");
        else if (band > 0.35) color.set("#5a4034");
        else color.set("#3e2c26");
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = toonMat("#ffffff", { vertexColors: true });
    const mesh = shadeMesh(new THREE.Mesh(geo, mat), true);
    this.group.add(mesh);
  }

  _buildSurface() {
    const tuftGeo = new THREE.ConeGeometry(0.09, 0.42, 4);
    tuftGeo.translate(0, 0.21, 0);
    const tuftCount = 90;
    const tuftMat = toonMat("#ffffff");
    this.tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
    this.tufts.castShadow = false;
    this.tufts.receiveShadow = false;
    this.tufts.frustumCulled = false;
    const dummy = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < tuftCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * 9.2;
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      if (this._blocked(x, z)) {
        position.set(0, -20, 0);
        scale.set(0.01, 0.01, 0.01);
      } else {
        const h = 0.7 + Math.random() * 0.9;
        position.set(x, islandSurfaceY(x, z), z);
        scale.set(1, h, 1);
      }
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      dummy.compose(position, quat, scale);
      this.tufts.setMatrixAt(i, dummy);
      color.set(Math.random() > 0.5 ? "#67c256" : "#3f8f3c");
      this.tufts.setColorAt(i, color);
    }
    this.tufts.instanceMatrix.needsUpdate = true;
    if (this.tufts.instanceColor) this.tufts.instanceColor.needsUpdate = true;
    this.group.add(this.tufts);

    const rockGeo = new THREE.DodecahedronGeometry(0.38, 0);
    const rockMat = toonMat("#7a6554");
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + 0.3;
      const radius = 9.3 + (i % 3) * 0.45;
      const rock = shadeMesh(new THREE.Mesh(rockGeo, rockMat), true);
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      rock.position.set(x, islandSurfaceY(Math.min(radius, 10), 0) - 0.15, z);
      rock.rotation.set(i, ang, i * 0.4);
      rock.scale.set(1 + (i % 3) * 0.25, 0.7, 0.85 + (i % 2) * 0.3);
      this.group.add(rock);
    }

    const stoneGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.08, 7);
    const stoneMat = toonMat("#d2c3a4");
    const torii = SCENE.torii;
    for (let i = 1; i <= 5; i++) {
      const t = i / 6.4;
      const x = torii.x * (1 - t);
      const z = torii.z * (1 - t);
      const step = new THREE.Mesh(stoneGeo, stoneMat);
      step.position.set(x, islandSurfaceY(x, z) + 0.03, z);
      step.rotation.y = i;
      this.group.add(step);
    }

    const flowerColors = ["#f2d23a", "#f07aa8", "#ffffff", "#ff8a3d"];
    const petalGeo = new THREE.SphereGeometry(0.08, 6, 5);
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const radius = 2.4 + Math.random() * 6.2;
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      if (this._blocked(x, z)) continue;
      const flower = new THREE.Mesh(petalGeo, toonMat(flowerColors[i % flowerColors.length]));
      flower.position.set(x, islandSurfaceY(x, z) + 0.08, z);
      flower.scale.y = 0.6;
      this.group.add(flower);
    }
  }

  _blocked(x, z) {
    if (Math.hypot(x, z) < 1.7) return true;
    const pond = SCENE.pond;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 0.25) return true;
    const fuji = SCENE.fuji;
    if (Math.hypot(x - fuji.x, z - fuji.z) < 3.3) return true;
    const temple = SCENE.temple;
    if (Math.hypot(x - temple.x, z - temple.z) < 1.8) return true;
    return false;
  }

  _buildTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 1.15, 6);
    const puffGeo = new THREE.IcosahedronGeometry(0.52, 0);
    const leafColors = ["#e23d32", "#ef7428", "#f2c14e", "#c4323a", "#e25a28", "#d35400"];
    const puffMats = [];
    for (let i = 0; i < leafColors.length; i++) puffMats.push(toonMat(leafColors[i]));

    for (let t = 0; t < SCENE.trees.length; t++) {
      const spec = SCENE.trees[t];
      const tree = new THREE.Group();
      tree.position.set(spec.x, islandSurfaceY(spec.x, spec.z), spec.z);
      tree.scale.setScalar(spec.s);
      const trunk = shadeMesh(new THREE.Mesh(trunkGeo, mats().trunk), true);
      trunk.position.y = 0.58;
      trunk.rotation.z = (t % 2 === 0 ? 0.06 : -0.05);
      tree.add(trunk);
      for (let p = 0; p < 6; p++) {
        const puff = shadeMesh(new THREE.Mesh(puffGeo, puffMats[(t + p) % puffMats.length]), true);
        const ang = (p / 6) * Math.PI * 2;
        puff.position.set(Math.cos(ang) * 0.32, 1.25 + (p % 3) * 0.22, Math.sin(ang) * 0.32);
        puff.scale.set(0.85 + (p % 3) * 0.15, 0.72, 0.85);
        tree.add(puff);
      }
      this.group.add(tree);
      this.trees.push(tree);
    }
  }

  _buildPond() {
    const pond = SCENE.pond;
    const y = islandSurfaceY(pond.x, pond.z) + 0.035;
    const water = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 28), mats().water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(pond.x, y, pond.z);
    water.receiveShadow = true;
    this.group.add(water);
    this.waterMat = mats().water;

    const padGeo = new THREE.CircleGeometry(0.22, 8);
    const padMat = toonMat("#3e8f45");
    this.pads = [];
    for (let i = 0; i < 4; i++) {
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = y + 0.02;
      this.group.add(pad);
      this.pads.push({ mesh: pad, ang: i * 1.5, rad: 0.35 + (i % 3) * 0.22 });
    }

    const fish = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toonMat("#ef7a32"));
    body.scale.set(1.5, 0.7, 0.8);
    fish.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), toonMat("#d3542a"));
    // Cone tip is local +Y. rotation.x = -90° maps +Y onto -Z, so the tail points backward.
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -0.16;
    fish.add(tail);
    fish.position.y = y + 0.05;
    this.group.add(fish);
    this.fish = fish;
    this._pondY = y;
  }

  _buildLanterns() {
    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.55, 6);
    const roofGeo = new THREE.ConeGeometry(0.22, 0.16, 4);
    const stone = mats().stone;
    const roofMat = mats().roof;
    for (let i = 0; i < SCENE.lanterns.length; i++) {
      const spec = SCENE.lanterns[i];
      const lantern = new THREE.Group();
      const y = islandSurfaceY(spec.x, spec.z);
      lantern.position.set(spec.x, y, spec.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 6), stone);
      base.position.y = 0.05;
      lantern.add(base);
      const post = new THREE.Mesh(postGeo, stone);
      post.position.y = 0.36;
      lantern.add(post);
      const chamber = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        glowMat("#2c241c", "#ffb15e", 1.05)
      );
      chamber.position.y = 0.72;
      lantern.add(chamber);
      const cap = new THREE.Mesh(roofGeo, roofMat);
      cap.position.y = 0.92;
      cap.rotation.y = Math.PI / 4;
      lantern.add(cap);
      const light = new THREE.PointLight(0xffb15e, 0, 5.5, 2);
      light.position.y = 0.72;
      nightRig.trackPoint(light, 0.7);
      lantern.add(light);
      this.group.add(lantern);
    }
  }

  _buildFireflies() {
    const count = 36;
    const positions = new Float32Array(count * 3);
    this._flyBase = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const radius = 2.2 + Math.random() * 6.5;
      const x = Math.cos(ang) * radius;
      const z = Math.sin(ang) * radius;
      const y = islandSurfaceY(x, z) + 0.4 + Math.random() * 1.4;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      this._flyBase[i * 3] = x;
      this._flyBase[i * 3 + 1] = y;
      this._flyBase[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      color: "#d8ff8a",
      size: 3.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false
    }));
    this.fireflies.frustumCulled = false;
    this.group.add(this.fireflies);
    this._flyPos = positions;
  }

  _buildSpikes() {
    const geo = new THREE.ConeGeometry(0.42, 1.5, 5);
    const mat = toonMat("#5c4638");
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + 0.5;
      const radius = 3.2 + (i % 3) * 1.7;
      const spike = new THREE.Mesh(geo, mat);
      const h = 1.2 + (i % 4) * 0.35;
      spike.scale.y = h / 1.5;
      spike.position.set(Math.cos(ang) * radius, -1.55 - h * 0.15, Math.sin(ang) * radius);
      spike.rotation.x = Math.PI;
      this.group.add(spike);
    }
  }

  setWater(color) {
    this.waterMat.color.copy(color);
  }

  setNightGlow(stars) {
    this.fireflies.material.opacity = stars * 0.95;
  }

  update(elapsed, dt) {
    // Gentle float. Children (tower, landmarks, trees) ride along.
    this.group.position.y = Math.sin(elapsed * 0.55) * 0.28;
    this.group.rotation.z = Math.sin(elapsed * 0.31) * 0.012;
    this.group.rotation.x = Math.cos(elapsed * 0.23) * 0.01;

    for (let i = 0; i < this.trees.length; i++) {
      this.trees[i].rotation.z = Math.sin(elapsed * 1.15 + i) * 0.025;
    }

    const pond = SCENE.pond;
    for (let i = 0; i < this.pads.length; i++) {
      const pad = this.pads[i];
      const a = pad.ang + elapsed * 0.15;
      pad.mesh.position.x = pond.x + Math.cos(a) * pad.rad;
      pad.mesh.position.z = pond.z + Math.sin(a) * pad.rad;
    }

    // Fish faces its velocity. Circle (cos t, sin t) has tangent (-sin t, cos t).
    // Local +Z is the nose, so rotation.y = atan2(dx, dz) = -t.
    const swim = elapsed * 0.7;
    this.fish.position.x = pond.x + Math.cos(swim) * 0.62;
    this.fish.position.z = pond.z + Math.sin(swim) * 0.4;
    this.fish.rotation.y = -swim;

    const attr = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < this._flyBase.length / 3; i++) {
      const bob = Math.sin(elapsed * 1.6 + i) * 0.18;
      attr.setY(i, this._flyBase[i * 3 + 1] + bob);
      attr.setX(i, this._flyBase[i * 3] + Math.sin(elapsed * 0.8 + i) * 0.12);
    }
    attr.needsUpdate = true;
  }
}
