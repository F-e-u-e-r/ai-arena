/**
 * Floating London Island — Four seasons + day/night
 * Classes: Island, BigBen, Landmark (Eye / Bridge), WeatherSystem, DayNightCycle, CameraOrbit
 */
import * as THREE from 'three';

const DAY_CYCLE_SEC = 15;
const SEASON_SEC = 20; // auto season length (manual override via UI)
const PARTICLE_POOL = 220;

const TOON_GRAD = (() => {
  const data = new Uint8Array([70, 140, 200, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: TOON_GRAD, ...opts });
}
function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.78, metalness: 0.05, ...opts,
  });
}

const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];

// ─── Island ──────────────────────────────────────────────────────────────────
class Island {
  constructor(scene) {
    this.group = new THREE.Group();
    this.t = 0;
    this.grassMats = [];

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(5.4, 6.6, 1.9, 12),
      toon(0x5a8f4a)
    );
    body.position.y = -0.15;
    body.castShadow = true;
    body.receiveShadow = true;
    this.grassMats.push(body.material);
    this.group.add(body);

    const under = new THREE.Mesh(
      new THREE.ConeGeometry(6.8, 3.4, 12),
      toon(0x4a3528)
    );
    under.position.y = -2.3;
    under.rotation.x = Math.PI;
    under.castShadow = true;
    this.group.add(under);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(5.1, 5.2, 0.3, 18),
      toon(0x6db04e)
    );
    top.position.y = 0.8;
    top.receiveShadow = true;
    this.grassMats.push(top.material);
    this.group.add(top);

    // Thames river strip
    this.river = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.08, 1.6),
      std(0x3a7ca5, { transparent: true, opacity: 0.75, roughness: 0.2, metalness: 0.35 })
    );
    this.river.position.set(0, 0.88, 1.8);
    this.group.add(this.river);

    // Buildings row (silhouette city)
    for (let i = 0; i < 8; i++) {
      const h = 0.6 + Math.random() * 1.4;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.45 + Math.random() * 0.3, h, 0.4),
        toon(0x8a909c)
      );
      b.position.set(-3.5 + i * 0.95, 0.95 + h / 2, -2.8 + (Math.random() - 0.5) * 0.4);
      b.castShadow = true;
      this.group.add(b);
    }

    // Trees
    [[-4, 2.5], [4.2, 2.2], [-3.8, -1.5], [3.5, -2.0]].forEach(([x, z]) => {
      this.group.add(this._tree(x, z));
    });

    // Clouds
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const cloud = this._cloud();
      cloud.position.set((Math.random() - 0.5) * 20, 5 + Math.random() * 3, (Math.random() - 0.5) * 18);
      cloud.userData.speed = 0.12 + Math.random() * 0.25;
      this.clouds.push(cloud);
      scene.add(cloud);
    }

    scene.add(this.group);
  }

  _tree(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 0.7, 6),
      toon(0x6b4226)
    );
    trunk.position.y = 1.25;
    g.add(trunk);
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      toon(0x3d8b40)
    );
    leaf.position.y = 1.85;
    leaf.castShadow = true;
    g.add(leaf);
    g.position.set(x, 0, z);
    g.userData.leafMat = leaf.material;
    return g;
  }

  _cloud() {
    const g = new THREE.Group();
    const mat = std(0xffffff, { transparent: true, opacity: 0.82 });
    [[0, 0, 0, 0.85], [0.55, 0.08, 0.1, 0.65], [-0.5, 0.05, -0.08, 0.55]].forEach(([x, y, z, s]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat);
      m.position.set(x, y, z);
      g.add(m);
    });
    return g;
  }

  /** Tint grass by season (spring green → summer vivid → autumn gold → winter dull) */
  applySeasonTint(seasonIndex, blend = 1) {
    const colors = [0x6db04e, 0x5cb85c, 0xb8963e, 0x8a9a7a];
    const c = new THREE.Color(colors[seasonIndex]);
    for (const m of this.grassMats) m.color.lerp(c, blend);
  }

  update(dt) {
    this.t += dt;
    this.group.position.y = Math.sin(this.t * 0.85) * 0.16;
    this.group.rotation.z = Math.sin(this.t * 0.4) * 0.018;
    this.river.material.opacity = 0.65 + Math.sin(this.t * 1.5) * 0.08;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 16) c.position.x = -16;
    }
  }
}

// ─── Big Ben ─────────────────────────────────────────────────────────────────
class BigBen {
  constructor(parent) {
    this.group = new THREE.Group();
    this.lights = [];
    this.emissives = [];

    const stone = toon(0xc4b49a);
    const dark = toon(0x5a5048);
    const gold = toon(0xd4a84b);

    // Tower shaft
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.2, 1.1), stone);
    shaft.position.y = 3.5;
    shaft.castShadow = true;
    this.group.add(shaft);

    // Clock faces (4 sides)
    for (let i = 0; i < 4; i++) {
      const face = new THREE.Mesh(
        new THREE.CircleGeometry(0.35, 16),
        new THREE.MeshStandardMaterial({
          color: 0xf5ecd8,
          emissive: 0xffcc66,
          emissiveIntensity: 0,
        })
      );
      const ang = (i * Math.PI) / 2;
      face.position.set(Math.sin(ang) * 0.56, 5.6, Math.cos(ang) * 0.56);
      face.lookAt(face.position.clone().multiplyScalar(2));
      this.group.add(face);
      this.emissives.push(face.material);

      // Hands
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), dark);
      hand.position.copy(face.position);
      hand.position.y += 0.05;
      hand.lookAt(0, hand.position.y, 0);
      this.group.add(hand);
    }

    // Belfry / spire
    const belfry = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.7, 1.25), stone);
    belfry.position.y = 6.4;
    this.group.add(belfry);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.3, 4), dark);
    roof.position.y = 7.4;
    roof.rotation.y = Math.PI / 4;
    this.group.add(roof);

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 6), gold);
    spire.position.y = 8.2;
    this.group.add(spire);

    // Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), stone);
    base.position.y = 1.05;
    this.group.add(base);

    // Point lights for night
    const pl = new THREE.PointLight(0xffcc66, 0, 8, 2);
    pl.position.set(0, 5.6, 0);
    this.group.add(pl);
    this.lights.push({ light: pl, max: 2.0 });

    const tip = new THREE.PointLight(0xffaa44, 0, 5, 2);
    tip.position.set(0, 8.0, 0);
    this.group.add(tip);
    this.lights.push({ light: tip, max: 1.2 });

    parent.add(this.group);
  }

  setLightStrength(s) {
    for (const { light, max } of this.lights) light.intensity = max * s;
    for (const m of this.emissives) m.emissiveIntensity = s * 1.6;
  }
}

// ─── Landmarks: London Eye + Tower Bridge ────────────────────────────────────
class Landmark {
  constructor(parent, type, x, z, rot = 0) {
    this.group = new THREE.Group();
    this.lights = [];
    this.emissives = [];
    this.spinParts = [];

    if (type === 'eye') this._buildEye();
    else this._buildBridge();

    this.group.position.set(x, 0, z);
    this.group.rotation.y = rot;
    parent.add(this.group);
  }

  _buildEye() {
    const metal = toon(0xb0b8c4);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0xd0e8f8,
      emissive: 0x88ccff,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.9,
    });

    // Support A-frame
    for (const sx of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 3.2, 0.15),
        metal
      );
      leg.position.set(sx, 2.4, 0.6);
      leg.rotation.z = sx > 0 ? 0.25 : -0.25;
      this.group.add(leg);
    }

    // Wheel
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.06, 8, 40),
      metal
    );
    wheel.add(rim);

    // Spokes
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 3.5, 0.04),
        metal
      );
      spoke.rotation.z = a;
      wheel.add(spoke);
    }

    // Capsules
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.22, 0.35),
        cabinMat.clone()
      );
      cap.position.set(Math.cos(a) * 1.8, Math.sin(a) * 1.8, 0);
      wheel.add(cap);
      this.emissives.push(cap.material);
    }

    wheel.position.set(0, 3.5, 0);
    this.group.add(wheel);
    this.spinParts.push(wheel);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 12), metal);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 3.5, 0);
    this.group.add(hub);

    const pl = new THREE.PointLight(0x88ccff, 0, 7, 2);
    pl.position.set(0, 3.5, 0.5);
    this.group.add(pl);
    this.lights.push({ light: pl, max: 1.8 });
  }

  _buildBridge() {
    const stone = toon(0xd8c8a8);
    const blue = toon(0x3a5a8c);
    const road = toon(0x555560);

    // Twin towers
    for (const sx of [-1.4, 1.4]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.8, 0.7), stone);
      tower.position.set(sx, 2.3, 0);
      tower.castShadow = true;
      this.group.add(tower);

      const top = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.85), blue);
      top.position.set(sx, 3.85, 0);
      this.group.add(top);

      // Spirelets
      for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), stone);
        sp.position.set(sx + dx, 4.2, dz);
        this.group.add(sp);
      }

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshStandardMaterial({
          color: 0xffcc66,
          emissive: 0xffaa33,
          emissiveIntensity: 0,
        })
      );
      bulb.position.set(sx, 3.5, 0.4);
      this.group.add(bulb);
      this.emissives.push(bulb.material);

      const pl = new THREE.PointLight(0xffcc66, 0, 5, 2);
      pl.position.copy(bulb.position);
      this.group.add(pl);
      this.lights.push({ light: pl, max: 1.3 });
    }

    // Walkways / bascules
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 0.9), road);
    deck.position.set(0, 1.7, 0);
    this.group.add(deck);

    // High-level walkways
    const high = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 0.35), blue);
    high.position.set(0, 3.5, 0);
    this.group.add(high);

    // Suspension chains (simple curves via thin boxes)
    for (const side of [-1, 1]) {
      const chain = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.06, 0.06),
        blue
      );
      chain.position.set(0, 2.6, side * 0.35);
      chain.rotation.z = side * 0.08;
      this.group.add(chain);
    }
  }

  setLightStrength(s) {
    for (const { light, max } of this.lights) light.intensity = max * s;
    for (const m of this.emissives) m.emissiveIntensity = s * 1.5;
  }

  update(dt) {
    for (const p of this.spinParts) p.rotation.z += dt * 0.35;
  }
}

// ─── Weather / Season Particle System ────────────────────────────────────────
/**
 * Seasons:
 *  0 Spring — humidity fog particles (slow, soft)
 *  1 Summer — sparse heat haze (few warm sparks)
 *  2 Autumn — maple leaves (spin + sway)
 *  3 Winter — snowflakes
 */
class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.season = 0;
    this.targetSeason = 0;
    this.transition = 1; // 0..1 blend into target
    this.active = [];
    this.pool = [];
    this.fogDensityBoost = 0;

    this.leafColors = [0xd94f2b, 0xe67e22, 0xc0392b, 0xf39c12];
    this.geoLeaf = new THREE.PlaneGeometry(0.2, 0.26);
    this.geoSnow = new THREE.CircleGeometry(0.08, 6);
    this.geoFog = new THREE.SphereGeometry(0.35, 6, 4);
    this.geoHaze = new THREE.SphereGeometry(0.12, 6, 4);

    for (let i = 0; i < PARTICLE_POOL; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 1,
      });
      const mesh = new THREE.Mesh(this.geoLeaf, mat);
      mesh.visible = false;
      mesh.frustumCulled = true;
      scene.add(mesh);
      this.pool.push({
        mesh, kind: 'leaf',
        vx: 0, vy: 0, vz: 0,
        rot: 0, sway: 0, amp: 0,
        life: 0, maxLife: 1, active: false,
      });
    }
  }

  setSeason(index) {
    index = ((index % 4) + 4) % 4;
    if (index === this.targetSeason) return;
    this.targetSeason = index;
    this.transition = 0;
  }

  _acquire(kind) {
    const p = this.pool.pop();
    if (!p) return null;
    p.kind = kind;
    p.active = true;
    p.life = 0;
    const mesh = p.mesh;
    mesh.visible = true;

    // Swap geometry reference by kind
    if (kind === 'leaf') mesh.geometry = this.geoLeaf;
    else if (kind === 'snow') mesh.geometry = this.geoSnow;
    else if (kind === 'fog') mesh.geometry = this.geoFog;
    else mesh.geometry = this.geoHaze;

    mesh.position.set(
      (Math.random() - 0.5) * 14,
      kind === 'fog' ? 1 + Math.random() * 4 : 7 + Math.random() * 4,
      (Math.random() - 0.5) * 14
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

    if (kind === 'leaf') {
      mesh.material.color.setHex(this.leafColors[(Math.random() * this.leafColors.length) | 0]);
      mesh.material.opacity = 0.95;
      p.vx = (Math.random() - 0.5) * 0.7;
      p.vy = -(0.45 + Math.random() * 0.65);
      p.vz = (Math.random() - 0.5) * 0.5;
      p.rot = (Math.random() - 0.5) * 3;
      p.amp = 0.5 + Math.random() * 0.5;
      p.maxLife = 12;
    } else if (kind === 'snow') {
      mesh.material.color.setHex(0xffffff);
      mesh.material.opacity = 0.85;
      p.vx = (Math.random() - 0.5) * 0.35;
      p.vy = -(0.25 + Math.random() * 0.4);
      p.vz = (Math.random() - 0.5) * 0.3;
      p.rot = (Math.random() - 0.5) * 1.5;
      p.amp = 0.3 + Math.random() * 0.4;
      p.maxLife = 14;
    } else if (kind === 'fog') {
      mesh.material.color.setHex(0xc8d8e8);
      mesh.material.opacity = 0.12 + Math.random() * 0.12;
      p.vx = (Math.random() - 0.5) * 0.15;
      p.vy = (Math.random() - 0.5) * 0.05;
      p.vz = (Math.random() - 0.5) * 0.15;
      p.rot = 0.2;
      p.amp = 0.2;
      p.maxLife = 8 + Math.random() * 6;
      mesh.scale.setScalar(1.5 + Math.random() * 2);
    } else {
      // haze
      mesh.material.color.setHex(0xffe0a0);
      mesh.material.opacity = 0.15;
      p.vx = (Math.random() - 0.5) * 0.2;
      p.vy = 0.1 + Math.random() * 0.2;
      p.vz = (Math.random() - 0.5) * 0.2;
      p.rot = 0.5;
      p.amp = 0.1;
      p.maxLife = 4;
      mesh.scale.setScalar(0.8);
    }

    p.sway = Math.random() * Math.PI * 2;
    this.active.push(p);
    return p;
  }

  _recycle(p, i) {
    p.active = false;
    p.mesh.visible = false;
    p.mesh.scale.set(1, 1, 1);
    this.active.splice(i, 1);
    this.pool.push(p);
  }

  /** Desired active counts per season */
  _targets(season) {
    switch (season) {
      case 0: return { fog: 70, leaf: 0, snow: 0, haze: 0 };
      case 1: return { fog: 0, leaf: 0, snow: 0, haze: 25 };
      case 2: return { fog: 0, leaf: 160, snow: 0, haze: 0 };
      case 3: return { fog: 15, leaf: 0, snow: 150, haze: 0 };
      default: return { fog: 0, leaf: 0, snow: 0, haze: 0 };
    }
  }

  update(dt) {
    // Smooth season transition
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt * 0.5);
      if (this.transition >= 1) this.season = this.targetSeason;
    }
    const season = this.transition < 1 ? this.targetSeason : this.season;
    const targets = this._targets(season);

    // Count by kind
    const counts = { fog: 0, leaf: 0, snow: 0, haze: 0 };
    for (const p of this.active) counts[p.kind]++;

    // Spawn toward targets (scaled by transition for outgoing season particles recycle naturally)
    for (const kind of Object.keys(targets)) {
      const want = Math.floor(targets[kind] * (0.4 + 0.6 * this.transition));
      while (counts[kind] < want && this.pool.length) {
        this._acquire(kind);
        counts[kind]++;
      }
    }

    // Cull particles not belonging to current season faster
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      const wanted = targets[p.kind] > 0;
      p.life += dt;
      p.sway += dt * 2;

      p.mesh.position.x += (p.vx + Math.sin(p.sway) * p.amp) * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += (p.vz + Math.cos(p.sway * 0.7) * p.amp * 0.4) * dt;
      p.mesh.rotation.x += p.rot * dt;
      p.mesh.rotation.z += p.rot * 0.5 * dt;

      const outOfBounds =
        p.mesh.position.y < -1.5 ||
        p.mesh.position.y > 14 ||
        p.life > p.maxLife ||
        (!wanted && p.life > 1.5);

      if (outOfBounds) this._recycle(p, i);
    }

    // Spring humidity → extra fog density for DayNightCycle
    this.fogDensityBoost = season === 0 ? 0.55 * this.transition : season === 3 ? 0.2 : 0;
    // Summer warmth multiplier for lights
    this.summerBoost = season === 1 ? 0.35 * this.transition : 0;
  }

  get count() {
    return this.active.length;
  }
}

// ─── Day / Night ─────────────────────────────────────────────────────────────
class DayNightCycle {
  constructor(scene, sun, moon, ambient, dirLight) {
    this.scene = scene;
    this.sun = sun;
    this.moon = moon;
    this.ambient = ambient;
    this.dirLight = dirLight;
    this.t = 0;
    this.speed = 1;
    this.fog = scene.fog;
    this.lightStrength = 0;
    this.phaseName = 'DAY';

    this.sky = {
      day: new THREE.Color(0x7ec8f0),
      dusk: new THREE.Color(0xd4684a),
      night: new THREE.Color(0x0a1020),
      dawn: new THREE.Color(0xe89870),
    };
    this._c = new THREE.Color();
  }

  update(dt, weather) {
    this.t = (this.t + (dt * this.speed) / DAY_CYCLE_SEC) % 1;
    const phase = this.t;

    let a, b, u, ambI, dirI, dirHex, lights;

    if (phase < 0.25) {
      a = this.sky.day; b = this.sky.day; u = 0;
      ambI = 0.72; dirI = 1.55; dirHex = 0xfff4e0; lights = 0;
      this.phaseName = 'DAY';
    } else if (phase < 0.40) {
      u = (phase - 0.25) / 0.15;
      a = this.sky.day; b = this.sky.dusk;
      ambI = 0.72 - u * 0.35; dirI = 1.55 - u * 1.05; dirHex = 0xff9050;
      lights = Math.max(0, (u - 0.25) / 0.55);
      this.phaseName = 'DUSK';
    } else if (phase < 0.75) {
      u = Math.min(1, (phase - 0.40) / 0.2);
      a = this.sky.dusk; b = this.sky.night;
      ambI = 0.25; dirI = 0.22; dirHex = 0x8899bb; lights = 1;
      this.phaseName = 'NIGHT';
    } else if (phase < 0.90) {
      u = (phase - 0.75) / 0.15;
      a = this.sky.night; b = this.sky.dawn;
      ambI = 0.25 + u * 0.35; dirI = 0.22 + u * 0.9; dirHex = 0xffb888;
      lights = Math.max(0, 1 - u * 2.2); // off before dawn ends
      this.phaseName = 'DAWN';
    } else {
      u = (phase - 0.90) / 0.10;
      a = this.sky.dawn; b = this.sky.day;
      ambI = 0.6 + u * 0.12; dirI = 1.12 + u * 0.43; dirHex = 0xfff4e0; lights = 0;
      this.phaseName = 'DAY';
    }

    this._c.copy(a).lerp(b, phase >= 0.25 && phase < 0.40 ? (phase - 0.25) / 0.15
      : phase >= 0.40 && phase < 0.75 ? Math.min(1, (phase - 0.40) / 0.2)
      : phase >= 0.75 && phase < 0.90 ? (phase - 0.75) / 0.15
      : phase >= 0.90 ? (phase - 0.90) / 0.10
      : 0);

    // Spring humidity: desaturate / pale sky
    if (weather && weather.fogDensityBoost > 0) {
      this._c.lerp(new THREE.Color(0xb8c8d4), weather.fogDensityBoost * 0.45);
    }
    // Summer: warmer
    if (weather && weather.summerBoost > 0) {
      this._c.lerp(new THREE.Color(0xffe0a8), weather.summerBoost * 0.35);
      dirI += weather.summerBoost * 0.5;
    }

    this.scene.background = this._c;
    if (this.fog) {
      this.fog.color.copy(this._c).multiplyScalar(0.9);
      const baseNear = 12 - (weather?.fogDensityBoost || 0) * 6;
      const baseFar = 34 - (weather?.fogDensityBoost || 0) * 10;
      this.fog.near = baseNear;
      this.fog.far = baseFar;
    }

    this.ambient.intensity = ambI;
    this.dirLight.intensity = dirI;
    this.dirLight.color.setHex(dirHex);

    const ang = phase * Math.PI * 2 - Math.PI / 2;
    const R = 16;
    this.sun.position.set(Math.cos(ang) * R, Math.sin(ang) * R * 0.65, 3);
    this.moon.position.set(Math.cos(ang + Math.PI) * R, Math.sin(ang + Math.PI) * R * 0.65, -2);
    this.sun.visible = this.sun.position.y > -1.5;
    this.moon.visible = this.moon.position.y > -1.5;
    this.dirLight.position.copy(this.sun.position);

    this.lightStrength = lights;
    return lights;
  }
}

// ─── Camera ──────────────────────────────────────────────────────────────────
class CameraOrbit {
  constructor(camera, target = new THREE.Vector3(0, 2.8, 0)) {
    this.camera = camera;
    this.target = target;
    this.theta = 0.7;
    this.phi = 0.45;
    this.radius = 15;
    this.dragging = false;
    this.lastX = 0;

    const el = document.getElementById('c');
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.theta -= dx * 0.007;
    });
    const end = () => { this.dragging = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.radius = THREE.MathUtils.clamp(this.radius + e.deltaY * 0.01, 9, 24);
    }, { passive: false });
  }

  update() {
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + z);
    this.camera.lookAt(this.target);
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x7ec8f0, 12, 34);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
const orbit = new CameraOrbit(camera);

const ambient = new THREE.AmbientLight(0xb0c4de, 0.7);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -14;
dirLight.shadow.camera.right = 14;
dirLight.shadow.camera.top = 14;
dirLight.shadow.camera.bottom = -14;
dirLight.shadow.camera.far = 45;
scene.add(dirLight);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(0.65, 14, 12),
  new THREE.MeshBasicMaterial({ color: 0xffe566 })
);
scene.add(sun);
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.42, 12, 10),
  new THREE.MeshBasicMaterial({ color: 0xdde6ff })
);
scene.add(moon);

const island = new Island(scene);
const bigBen = new BigBen(island.group);
const eye = new Landmark(island.group, 'eye', -3.6, 2.2, 0.2);
const bridge = new Landmark(island.group, 'bridge', 3.4, 1.6, -0.35);
const weather = new WeatherSystem(scene);
const dayNight = new DayNightCycle(scene, sun, moon, ambient, dirLight);

// Auto season clock
let seasonTimer = 0;
let autoSeason = true;

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = h < 240 ? 56 : 45;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// UI
const seasonLabel = document.getElementById('season-label');
const phaseLabel = document.getElementById('phase-label');
const statsEl = document.getElementById('stats');
const buttons = [...document.querySelectorAll('[data-season]')];

function selectSeason(idx, fromAuto = false) {
  weather.setSeason(idx);
  island.applySeasonTint(idx, 0.35);
  buttons.forEach((b) => b.classList.toggle('active', +b.dataset.season === idx));
  seasonLabel.textContent = SEASONS[idx];
  if (!fromAuto) {
    autoSeason = true; // keep auto but reset timer on manual pick
    seasonTimer = 0;
  }
}

buttons.forEach((b) => {
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    selectSeason(+b.dataset.season);
  });
});

document.getElementById('btn-cycle').addEventListener('click', (e) => {
  e.stopPropagation();
  dayNight.speed = dayNight.speed >= 4 ? 1 : dayNight.speed * 2;
});

// Keyboard: 1-4 seasons, D day speed, Space reset
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '4') selectSeason(+e.key - 1);
  if (e.key === 'd' || e.key === 'D') {
    dayNight.speed = dayNight.speed >= 4 ? 1 : dayNight.speed * 2;
  }
  if (e.key === ' ') {
    dayNight.t = 0;
    dayNight.speed = 1;
  }
});

selectSeason(0);

let last = performance.now();
let fpsA = 0, fpsN = 0, fps = 60;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Auto-rotate seasons every SEASON_SEC
  if (autoSeason) {
    seasonTimer += dt;
    if (seasonTimer >= SEASON_SEC) {
      seasonTimer = 0;
      selectSeason((weather.targetSeason + 1) % 4, true);
    }
  }

  island.applySeasonTint(weather.targetSeason, dt * 0.4);
  weather.update(dt);
  const lightS = dayNight.update(dt, weather);
  bigBen.setLightStrength(lightS);
  eye.setLightStrength(lightS);
  bridge.setLightStrength(lightS);
  eye.update(dt);
  island.update(dt);
  orbit.update();

  renderer.render(scene, camera);

  fpsA += dt; fpsN++;
  if (fpsA >= 0.5) {
    fps = Math.round(fpsN / fpsA);
    fpsA = 0; fpsN = 0;
    phaseLabel.textContent = dayNight.phaseName;
    seasonLabel.textContent = SEASONS[weather.targetSeason];
    statsEl.textContent = `${fps}fps · ${weather.count}p · day×${dayNight.speed}`;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
