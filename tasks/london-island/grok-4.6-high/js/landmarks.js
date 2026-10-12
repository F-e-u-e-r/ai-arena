/**
 * London Eye, Tower Bridge, and a few cartoon London props.
 */
(function (global) {
  const THREE = global.THREE;
  const Art = global.Art;

  class LondonEye {
    constructor() {
      this.group = new THREE.Group();
      this.group.name = "LondonEye";
      this.group.position.set(-7.5, 0.55, -3.6);
      this.group.rotation.y = 0.95;
      this._capsules = [];
      this._build();
    }

    _build() {
      const steel = Art.toon(0xcfd6de);
      const steelDark = Art.toon(0x6d767f);
      const gold = Art.toon(0xe0b84a);
      this.capsuleMat = Art.toonEmissive(0xb8d4ea, 0xffe08a);
      this.rimMat = Art.toonEmissive(0xdfe6ee, 0xffc14d);

      const legGeo = new THREE.BoxGeometry(0.28, 5.6, 0.28);
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, steelDark);
        leg.position.set(s * 1.15, 2.6, 0.9);
        leg.rotation.z = s * 0.22;
        leg.rotation.x = 0.28;
        leg.castShadow = true;
        this.group.add(leg);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 1.6), steelDark);
      base.position.set(0, 0.15, 0.4);
      base.castShadow = true;
      this.group.add(base);

      this.wheel = new THREE.Group();
      this.wheel.position.set(0, 4.55, 0);
      this.group.add(this.wheel);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.5, 12), gold);
      hub.rotation.x = Math.PI / 2;
      this.wheel.add(hub);

      const R = 3.55;
      const rim = new THREE.TorusGeometry(R, 0.09, 8, 48);
      const rimMesh = new THREE.Mesh(rim, this.rimMat);
      this.wheel.add(rimMesh);

      const spokeGeo = new THREE.CylinderGeometry(0.04, 0.04, R, 4);
      const podGeo = new THREE.SphereGeometry(0.22, 8, 6);
      const N = 18;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const spoke = new THREE.Mesh(spokeGeo, steel);
        spoke.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0);
        spoke.rotation.z = a + Math.PI / 2;
        this.wheel.add(spoke);
        const pod = new THREE.Mesh(podGeo, this.capsuleMat);
        pod.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
        pod.castShadow = true;
        this.wheel.add(pod);
        this._capsules.push(pod);
      }

      this.light = new THREE.PointLight(0xffc14d, 0, 12, 2);
      this.light.position.set(0, 4.55, 0.4);
      this.group.add(this.light);
    }

    update(dt) {
      this.wheel.rotation.z -= dt * 0.22;
    }

    setLights(amount) {
      this.capsuleMat.emissiveIntensity = amount * 1.1;
      this.rimMat.emissiveIntensity = amount * 0.7;
      this.light.intensity = amount * 8;
    }
  }

  class TowerBridge {
    constructor() {
      this.group = new THREE.Group();
      this.group.name = "TowerBridge";
      this.group.position.set(6.4, 0.55, 0);
      // River runs along +X; rotate so the span crosses it on Z.
      this.group.rotation.y = Math.PI / 2;
      this._build();
    }

    _tower(x) {
      const stone = this.stone;
      const stoneDark = this.stoneDark;
      const roof = this.roof;
      const gold = this.gold;
      const g = new THREE.Group();
      g.position.x = x;

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 1.7), stoneDark);
      base.position.y = 0.55;
      base.castShadow = true;
      g.add(base);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.35, 4.2, 1.35), stone);
      shaft.position.y = 3.15;
      shaft.castShadow = true;
      g.add(shaft);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.5), gold);
      belt.position.y = 5.3;
      g.add(belt);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.3, 1.55), stone);
      top.position.y = 6.0;
      top.castShadow = true;
      g.add(top);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, 8), roof);
      spire.position.y = 7.35;
      spire.castShadow = true;
      g.add(spire);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 5), gold);
      pin.position.y = 8.15;
      g.add(pin);

      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.7, 0.08), this.windowMat);
        w.position.set(0, 3.4, s * 0.7);
        g.add(w);
        const w2 = w.clone();
        w2.position.y = 4.4;
        g.add(w2);
      }
      return g;
    }

    _build() {
      this.stone = Art.toon(0xe2d3b5);
      this.stoneDark = Art.toon(0xb79b74);
      this.roof = Art.toon(0x5c3d2e);
      this.gold = Art.toon(0xe0b84a);
      this.road = Art.toon(0x6d6a68);
      this.iron = Art.toon(0x4a5560);
      this.windowMat = Art.toonEmissive(0x7ec8e8, 0xffc14d);
      this.lampMat = Art.toonEmissive(0xffe08a, 0xffc14d);

      const span = 3.35;
      this.group.add(this._tower(-span));
      this.group.add(this._tower(span));

      const deck = new THREE.Mesh(new THREE.BoxGeometry(span * 2 - 1.2, 0.18, 1.15), this.road);
      deck.position.y = 2.35;
      deck.castShadow = true;
      this.group.add(deck);

      const walk = new THREE.Mesh(new THREE.BoxGeometry(span * 2 - 1.3, 0.12, 0.55), this.iron);
      walk.position.y = 5.55;
      this.group.add(walk);

      const chainGeo = new THREE.BoxGeometry(span - 0.4, 0.08, 0.08);
      for (const z of [-0.4, 0.4]) {
        for (const side of [-1, 1]) {
          const chain = new THREE.Mesh(chainGeo, this.iron);
          chain.position.set(side * (span * 0.5), 3.9, z);
          chain.rotation.z = side * 0.55;
          this.group.add(chain);
        }
      }

      const approach = new THREE.BoxGeometry(1.8, 0.16, 1.05);
      const a1 = new THREE.Mesh(approach, this.road);
      a1.position.set(-span - 1.4, 1.35, 0);
      a1.rotation.z = 0.42;
      a1.castShadow = true;
      this.group.add(a1);
      const a2 = a1.clone();
      a2.position.x = span + 1.4;
      a2.rotation.z = -0.42;
      this.group.add(a2);

      for (const x of [-span, span]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.lampMat);
        lamp.position.set(x, 6.05, 0.7);
        this.group.add(lamp);
      }

      this.light = new THREE.PointLight(0xffc14d, 0, 14, 2);
      this.light.position.set(0, 5.6, 0);
      this.group.add(this.light);
    }

    setLights(amount) {
      this.windowMat.emissiveIntensity = amount * 1.3;
      this.lampMat.emissiveIntensity = amount * 1.6;
      this.light.intensity = amount * 9;
    }
  }

  class LondonProps {
    constructor() {
      this.group = new THREE.Group();
      this.group.name = "Props";
      this._build();
    }

    _build() {
      const red = Art.toon(0xc0392b);
      const dark = Art.toon(0x2c2c2c);
      const gold = Art.toon(0xe0b84a);
      const glass = Art.toonEmissive(0x8fd3ff, 0xffe08a);
      this.glass = glass;

      const booth = new THREE.Group();
      booth.position.set(-2.4, 0.55, 5.2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.35, 0.7), red);
      body.position.y = 0.7;
      body.castShadow = true;
      booth.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.16, 0.82), red);
      roof.position.y = 1.42;
      booth.add(roof);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), glass);
      pane.position.set(0, 0.85, 0.36);
      booth.add(pane);
      this.group.add(booth);

      const bus = new THREE.Group();
      bus.position.set(-4.6, 0.55, 1.8);
      bus.rotation.y = 0.35;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.85), red);
      lower.position.y = 0.5;
      lower.castShadow = true;
      bus.add(lower);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.85), red);
      upper.position.set(-0.05, 1.12, 0);
      upper.castShadow = true;
      bus.add(upper);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.28, 0.06), glass);
      win.position.set(-0.05, 1.14, 0.43);
      bus.add(win);
      for (const x of [-0.7, 0.55]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 10), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.18, 0.4);
        bus.add(wheel);
        const w2 = wheel.clone();
        w2.position.z = -0.4;
        bus.add(w2);
      }
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.18), gold);
      light.position.set(1.12, 0.48, 0.28);
      bus.add(light);
      this.group.add(bus);
    }

    setLights(amount) {
      this.glass.emissiveIntensity = amount * 0.9;
    }
  }

  global.LondonEye = LondonEye;
  global.TowerBridge = TowerBridge;
  global.LondonProps = LondonProps;
})(window);
