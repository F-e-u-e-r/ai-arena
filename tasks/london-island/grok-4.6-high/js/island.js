/**
 * Cartoon floating island: stacked primitives, Thames ribbon, trees, clouds.
 */
(function (global) {
  const THREE = global.THREE;
  const Art = global.Art;

  class Island {
    constructor() {
      this.group = new THREE.Group();
      this.group.name = "Island";
      this._waterTime = 0;
      this._cloudAngle = 0;
      this._build();
    }

    _mesh(geo, mat, x, y, z, sx, sy, sz) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    }

    _build() {
      this.grassMat = Art.toon(0x3fa34d);
      this.dirtMat = Art.toon(0xb08968);
      this.rockMat = Art.toon(0x8d7b6a);
      this.rockDark = Art.toon(0x6a5344);
      this.waterMat = Art.std(0x2e86ab, {
        roughness: 0.22,
        metalness: 0.18,
        transparent: true,
        opacity: 0.92
      });
      this.foliageMat = Art.toon(0x2d8a3a);
      this.trunkMat = Art.toon(0x6b3f24);
      this.pathMat = Art.toon(0xd8c3a5);
      this.hedgeMat = Art.toon(0x3d8c44);

      const grass = new THREE.CylinderGeometry(10.2, 10.6, 0.7, 20);
      this._mesh(grass, this.grassMat, 0, 0.2, 0);
      const lobeA = new THREE.CylinderGeometry(4.4, 4.7, 0.65, 14);
      this._mesh(lobeA, this.grassMat, 6.4, 0.18, -3.2);
      const lobeB = new THREE.CylinderGeometry(3.8, 4.1, 0.65, 14);
      this._mesh(lobeB, this.grassMat, -6.2, 0.18, 4.1);
      const lobeC = new THREE.CylinderGeometry(3.2, 3.5, 0.6, 12);
      this._mesh(lobeC, this.grassMat, 4.6, 0.16, 5.4);

      const dirt = new THREE.CylinderGeometry(10.5, 11.2, 1.8, 20);
      this._mesh(dirt, this.dirtMat, 0, -0.9, 0);
      this._mesh(new THREE.CylinderGeometry(4.6, 5.0, 1.5, 12), this.dirtMat, 6.4, -0.85, -3.2);
      this._mesh(new THREE.CylinderGeometry(4.0, 4.3, 1.5, 12), this.dirtMat, -6.2, -0.85, 4.1);

      const cliff = new THREE.CylinderGeometry(9.6, 6.4, 4.6, 18);
      this._mesh(cliff, this.rockMat, 0, -3.4, 0);
      const tip = new THREE.ConeGeometry(5.4, 4.2, 16);
      this._mesh(tip, this.rockDark, 0, -7.2, 0);

      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const r = 8.6 + (i % 3) * 0.4;
        const hunk = new THREE.BoxGeometry(1.4 + (i % 3) * 0.3, 1.1 + (i % 2) * 0.5, 1.2);
        const m = this._mesh(hunk, i % 2 ? this.rockMat : this.rockDark, Math.cos(a) * r, -2.4, Math.sin(a) * r);
        m.rotation.set(0.15 * (i % 3), a, 0.1);
      }

      const path = new THREE.BoxGeometry(2.2, 0.08, 9.5);
      this._mesh(path, this.pathMat, 0.2, 0.56, 1.4);

      const waterGeo = new THREE.PlaneGeometry(22, 3.4, 36, 8);
      waterGeo.rotateX(-Math.PI / 2);
      this.water = new THREE.Mesh(waterGeo, this.waterMat);
      this.water.position.set(0.4, 0.58, 0.05);
      this.water.receiveShadow = true;
      this.water.castShadow = false;
      this.group.add(this.water);
      this._waterBase = Float32Array.from(waterGeo.attributes.position.array);

      const bankGeo = new THREE.BoxGeometry(20, 0.28, 0.55);
      this._mesh(bankGeo, this.dirtMat, 0.3, 0.64, 1.85);
      this._mesh(bankGeo, this.dirtMat, 0.3, 0.64, -1.75);

      this._addTrees();
      this._addBushes();
      this._addClouds();
      this._addUndersideVapour();
    }

    _addTrees() {
      const spots = [
        [-8.2, 0.5, 2.4, 1.15],
        [-4.8, 0.5, 5.6, 0.9],
        [3.4, 0.5, 6.6, 1.0],
        [8.4, 0.5, 3.1, 1.2],
        [8.8, 0.5, -5.6, 0.85],
        [-8.6, 0.5, -4.2, 1.05],
        [-2.6, 0.5, -6.4, 0.8],
        [1.8, 0.5, -6.8, 0.95],
        [9.6, 0.5, 0.8, 0.7],
        [-9.4, 0.5, 0.2, 0.75]
      ];
      const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.1, 6);
      const crownGeo = new THREE.ConeGeometry(0.85, 1.7, 7);
      const crown2 = new THREE.SphereGeometry(0.7, 8, 6);
      this._foliage = [];
      for (let i = 0; i < spots.length; i++) {
        const [x, y, z, s] = spots[i];
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.scale.setScalar(s);
        const trunk = new THREE.Mesh(trunkGeo, this.trunkMat);
        trunk.position.y = 0.55;
        trunk.castShadow = true;
        g.add(trunk);
        const c1 = new THREE.Mesh(i % 2 ? crownGeo : crown2, this.foliageMat);
        c1.position.y = i % 2 ? 1.55 : 1.45;
        c1.castShadow = true;
        g.add(c1);
        if (i % 2 === 0) {
          const c2 = new THREE.Mesh(crown2, this.foliageMat);
          c2.position.set(0.25, 1.15, 0.1);
          c2.scale.setScalar(0.7);
          c2.castShadow = true;
          g.add(c2);
        }
        this.group.add(g);
        this._foliage.push(c1);
      }
    }

    _addBushes() {
      const geo = new THREE.SphereGeometry(0.42, 7, 5);
      const pts = [
        [-2.4, 0.7, 4.2], [2.8, 0.7, 4.6], [-5.2, 0.65, -2.8],
        [5.1, 0.65, -5.2], [-1.2, 0.7, -5.4], [7.2, 0.7, 4.8]
      ];
      this._bushes = [];
      for (let i = 0; i < pts.length; i++) {
        const m = new THREE.Mesh(geo, this.hedgeMat);
        m.position.fromArray(pts[i]);
        m.scale.set(1.2 + (i % 3) * 0.2, 0.8, 1.0);
        m.castShadow = true;
        this.group.add(m);
        this._bushes.push(m);
      }
    }

    _addClouds() {
      this.clouds = new THREE.Group();
      this.clouds.position.y = 8.5;
      const puffMat = Art.toon(0xf4f7fb, { transparent: true, opacity: 0.92 });
      const geo = new THREE.SphereGeometry(1, 8, 6);
      const layouts = [
        [0, 0, 0, 1.6], [1.6, 0.15, 0.3, 1.1], [-1.5, 0.1, -0.2, 1.2], [0.3, 0.35, -1.1, 0.9]
      ];
      function cloudAt(x, y, z, s) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        g.scale.setScalar(s);
        for (let i = 0; i < layouts.length; i++) {
          const p = new THREE.Mesh(geo, puffMat);
          p.position.set(layouts[i][0], layouts[i][1], layouts[i][2]);
          p.scale.setScalar(layouts[i][3]);
          p.castShadow = false;
          g.add(p);
        }
        return g;
      }
      this.clouds.add(cloudAt(-11, 1.2, -6, 1.1));
      this.clouds.add(cloudAt(10, 2.0, 5, 0.95));
      this.clouds.add(cloudAt(-4, 3.4, 11, 0.8));
      this.clouds.add(cloudAt(12, 0.6, -9, 1.25));
      this.clouds.add(cloudAt(3, 2.8, -12, 0.7));
      this.group.add(this.clouds);
    }

    _addUndersideVapour() {
      const mat = Art.toon(0xe8eef8, { transparent: true, opacity: 0.35, depthWrite: false });
      const geo = new THREE.SphereGeometry(1.4, 8, 6);
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(geo, mat);
        const a = (i / 6) * Math.PI * 2;
        m.position.set(Math.cos(a) * 3.2, -8.4 - (i % 3) * 0.6, Math.sin(a) * 3.2);
        m.scale.set(2.4, 0.7, 2.4);
        this.group.add(m);
      }
    }

    /**
     * Thames ripple: vertical sine on stored rest positions.
     * Reuses the original attribute buffer; no per-frame allocations.
     */
    update(dt, elapsed) {
      this._waterTime += dt;
      const pos = this.water.geometry.attributes.position;
      const arr = pos.array;
      const base = this._waterBase;
      const t = this._waterTime;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i];
        const z = base[i + 2];
        arr[i + 1] = base[i + 1] + Math.sin(x * 0.55 + t * 1.6) * 0.07 + Math.sin(z * 1.3 + t * 2.1) * 0.045;
      }
      pos.needsUpdate = true;
      if ((elapsed * 10 | 0) % 4 === 0) this.water.geometry.computeVertexNormals();

      this._cloudAngle += dt * 0.05;
      this.clouds.rotation.y = this._cloudAngle;
      const kids = this.clouds.children;
      for (let i = 0; i < kids.length; i++) {
        kids[i].position.y = 8.5 + Math.sin(elapsed * 0.4 + i) * 0.35;
      }
    }

    applySeason(mix) {
      this.grassMat.color.copy(mix.grass);
      this.dirtMat.color.copy(mix.dirt);
      this.rockMat.color.copy(mix.rock);
      this.waterMat.color.copy(mix.water);
      this.foliageMat.color.copy(mix.foliage);
      this.hedgeMat.color.copy(mix.foliage);
    }
  }

  global.Island = Island;
})(window);
