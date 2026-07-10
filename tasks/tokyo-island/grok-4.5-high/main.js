/**
 * Floating Tokyo Island — Three.js cartoon scene
 * Modules: Island, TokyoTower, Landmark, MapleLeafSystem, DayNightCycle, CameraOrbit
 */
import * as THREE from 'three';

// ─── Constants ───────────────────────────────────────────────────────────────
const DAY_CYCLE_SEC = 15;
const LEAF_POOL = 180;
const TOON_GRAD = (() => {
  const data = new Uint8Array([80, 160, 220, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: TOON_GRAD,
    ...opts,
  });
}

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75,
    metalness: 0.05,
    ...opts,
  });
}

// ─── Island ──────────────────────────────────────────────────────────────────
class Island {
  constructor(scene) {
    this.group = new THREE.Group();
    this.baseY = 0;
    this.t = 0;

    // Rock body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 6.4, 1.8, 10),
      toon(0x6b8f4e)
    );
    body.position.y = -0.2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Dirt underside
    const under = new THREE.Mesh(
      new THREE.ConeGeometry(6.6, 3.2, 10),
      toon(0x5a3d28)
    );
    under.position.y = -2.2;
    under.rotation.x = Math.PI;
    under.castShadow = true;
    this.group.add(under);

    // Grass top disc
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(4.9, 5.0, 0.28, 16),
      toon(0x7cbc4a)
    );
    top.position.y = 0.75;
    top.receiveShadow = true;
    this.group.add(top);

    // Path
    const path = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.06, 5.5),
      std(0xc4a574)
    );
    path.position.set(0, 0.9, 0.2);
    path.receiveShadow = true;
    this.group.add(path);

    // Trees (simple cones)
    const treePositions = [
      [-3.2, 1.5], [3.0, 1.8], [-2.4, -2.2], [2.6, -2.5], [-1.0, 3.0], [1.2, -3.2],
    ];
    for (const [x, z] of treePositions) {
      this.group.add(this._tree(x, z, 0.7 + Math.random() * 0.5));
    }

    // Water ring (subtle)
    const water = new THREE.Mesh(
      new THREE.TorusGeometry(6.8, 0.35, 8, 32),
      std(0x4aa8c8, { transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.3 })
    );
    water.rotation.x = Math.PI / 2;
    water.position.y = -1.4;
    this.water = water;
    this.group.add(water);

    // Clouds
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      const cloud = this._cloud();
      cloud.position.set(
        (Math.random() - 0.5) * 18,
        4 + Math.random() * 3,
        (Math.random() - 0.5) * 18
      );
      cloud.userData.speed = 0.15 + Math.random() * 0.2;
      this.clouds.push(cloud);
      scene.add(cloud);
    }

    scene.add(this.group);
  }

  _tree(x, z, h) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, h * 0.5, 6),
      toon(0x6b4226)
    );
    trunk.position.y = h * 0.25 + 0.9;
    trunk.castShadow = true;
    g.add(trunk);
    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(0.45 * h, h * 0.9, 7),
      toon(0x3d8b40)
    );
    foliage.position.y = h * 0.85 + 0.9;
    foliage.castShadow = true;
    g.add(foliage);
    g.position.set(x, 0, z);
    return g;
  }

  _cloud() {
    const g = new THREE.Group();
    const mat = std(0xffffff, { transparent: true, opacity: 0.85 });
    const sizes = [0.9, 0.7, 0.6];
    const offsets = [[0, 0, 0], [0.6, 0.1, 0.1], [-0.55, 0.05, -0.1]];
    sizes.forEach((s, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat);
      m.position.set(...offsets[i]);
      g.add(m);
    });
    return g;
  }

  update(dt) {
    this.t += dt;
    // Gentle bob
    this.group.position.y = this.baseY + Math.sin(this.t * 0.9) * 0.18;
    this.group.rotation.z = Math.sin(this.t * 0.45) * 0.02;
    this.group.rotation.x = Math.cos(this.t * 0.35) * 0.015;
    if (this.water) this.water.rotation.z += dt * 0.15;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 14) c.position.x = -14;
    }
  }
}

// ─── Tokyo Tower ─────────────────────────────────────────────────────────────
class TokyoTower {
  constructor(parent) {
    this.group = new THREE.Group();
    this.lights = [];
    this.emissives = [];

    const red = toon(0xc41e3a);
    const white = toon(0xf5f0e8);
    const dark = toon(0x3a3a42);

    // Base legs (simplified lattice)
    const legGeo = new THREE.BoxGeometry(0.18, 3.2, 0.18);
    const positions = [
      [-0.55, 0.55], [0.55, 0.55], [-0.55, -0.55], [0.55, -0.55],
    ];
    for (const [x, z] of positions) {
      const leg = new THREE.Mesh(legGeo, red);
      leg.position.set(x, 2.5, z);
      leg.castShadow = true;
      this.group.add(leg);
    }

    // Tapered main shaft sections
    const sections = [
      { y: 4.4, w: 0.95, h: 1.2, mat: red },
      { y: 5.5, w: 0.72, h: 1.0, mat: white },
      { y: 6.5, w: 0.55, h: 1.0, mat: red },
      { y: 7.4, w: 0.4, h: 0.9, mat: white },
      { y: 8.2, w: 0.28, h: 0.8, mat: red },
    ];
    for (const s of sections) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(s.w, s.h, s.w),
        s.mat
      );
      mesh.position.y = s.y;
      mesh.castShadow = true;
      this.group.add(mesh);
    }

    // Observation decks
    const deck1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.75, 0.35, 8),
      dark
    );
    deck1.position.y = 5.0;
    this.group.add(deck1);

    const deck2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.42, 0.28, 8),
      dark
    );
    deck2.position.y = 7.0;
    this.group.add(deck2);

    // Antenna tip
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.08, 1.4, 6),
      toon(0xd0d0d8)
    );
    tip.position.y = 9.3;
    this.group.add(tip);

    // Night lights (PointLights + emissive spheres)
    const nightSpecs = [
      { pos: [0, 5.05, 0], color: 0xffb347, intensity: 1.6, dist: 6 },
      { pos: [0, 7.05, 0], color: 0xffcc66, intensity: 1.2, dist: 5 },
      { pos: [0, 9.4, 0], color: 0xff5533, intensity: 0.9, dist: 4 },
    ];
    for (const spec of nightSpecs) {
      const pl = new THREE.PointLight(spec.color, 0, spec.dist, 2);
      pl.position.set(...spec.pos);
      this.group.add(pl);
      this.lights.push({ light: pl, max: spec.intensity });

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshStandardMaterial({
          color: spec.color,
          emissive: spec.color,
          emissiveIntensity: 0,
        })
      );
      bulb.position.set(...spec.pos);
      this.group.add(bulb);
      this.emissives.push(bulb.material);
    }

    // Ground platform
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.2, 0.25, 8),
      toon(0x888890)
    );
    base.position.y = 0.95;
    this.group.add(base);

    this.group.position.set(0, 0, 0);
    parent.add(this.group);
  }

  /** strength 0..1 — lights on from dusk to before dawn */
  setLightStrength(s) {
    for (const { light, max } of this.lights) {
      light.intensity = max * s;
    }
    for (const mat of this.emissives) {
      mat.emissiveIntensity = s * 1.4;
    }
  }
}

// ─── Landmarks (Fuji + Torii + Temple) ───────────────────────────────────────
class Landmark {
  constructor(parent, type, x, z, rot = 0) {
    this.group = new THREE.Group();
    this.lights = [];
    this.emissives = [];

    if (type === 'fuji') this._buildFuji();
    else if (type === 'torii') this._buildTorii();
    else this._buildTemple();

    this.group.position.set(x, 0, z);
    this.group.rotation.y = rot;
    parent.add(this.group);
  }

  _buildFuji() {
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 2.4, 8),
      toon(0x6a7a8a)
    );
    mountain.position.set(0, 2.0, 0);
    mountain.castShadow = true;
    this.group.add(mountain);

    const snow = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 0.9, 8),
      toon(0xf0f4ff)
    );
    snow.position.set(0, 2.95, 0);
    this.group.add(snow);

    // Soft base glow for night
    const pl = new THREE.PointLight(0xaaccff, 0, 4, 2);
    pl.position.set(0, 2.5, 0);
    this.group.add(pl);
    this.lights.push({ light: pl, max: 0.8 });
  }

  _buildTorii() {
    const vermillion = toon(0xd94a2b);
    const black = toon(0x222228);

    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 2.0, 8);
    for (const sx of [-0.7, 0.7]) {
      const post = new THREE.Mesh(postGeo, vermillion);
      post.position.set(sx, 1.9, 0);
      post.castShadow = true;
      this.group.add(post);
    }

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.18, 0.28),
      vermillion
    );
    lintel.position.set(0, 2.85, 0);
    this.group.add(lintel);

    const topBeam = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.14, 0.32),
      vermillion
    );
    topBeam.position.set(0, 3.1, 0);
    this.group.add(topBeam);

    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.4, 0.08),
      black
    );
    plaque.position.set(0, 2.55, 0);
    this.group.add(plaque);

    const pl = new THREE.PointLight(0xff6633, 0, 5, 2);
    pl.position.set(0, 2.7, 0.4);
    this.group.add(pl);
    this.lights.push({ light: pl, max: 1.4 });

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 6),
      new THREE.MeshStandardMaterial({
        color: 0xff6633,
        emissive: 0xff4422,
        emissiveIntensity: 0,
      })
    );
    bulb.position.set(0, 2.7, 0.35);
    this.group.add(bulb);
    this.emissives.push(bulb.material);
  }

  _buildTemple() {
    const wood = toon(0x8b5a2b);
    const roof = toon(0x3d5a3a);
    const paper = toon(0xfff4d6);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.4), wood);
    base.position.y = 1.15;
    base.castShadow = true;
    this.group.add(base);

    const walls = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.1), paper);
    walls.position.y = 1.85;
    this.group.add(walls);

    const roofMesh = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 0.7, 4),
      roof
    );
    roofMesh.position.y = 2.6;
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.castShadow = true;
    this.group.add(roofMesh);

    // Lanterns
    for (const sx of [-0.7, 0.7]) {
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({
          color: 0xffcc66,
          emissive: 0xffaa33,
          emissiveIntensity: 0,
        })
      );
      lantern.position.set(sx, 1.6, 0.6);
      this.group.add(lantern);
      this.emissives.push(lantern.material);

      const pl = new THREE.PointLight(0xffaa44, 0, 3.5, 2);
      pl.position.copy(lantern.position);
      this.group.add(pl);
      this.lights.push({ light: pl, max: 1.0 });
    }
  }

  setLightStrength(s) {
    for (const { light, max } of this.lights) light.intensity = max * s;
    for (const mat of this.emissives) mat.emissiveIntensity = s * 1.5;
  }
}

// ─── Maple Leaf Particle Pool ────────────────────────────────────────────────
class MapleLeafSystem {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.pool = [];
    this.colors = [0xd94f2b, 0xe67e22, 0xc0392b, 0xf39c12, 0xa04000];

    // Shared geometry — single plane, rotated for variety in instances
    this.geo = new THREE.PlaneGeometry(0.22, 0.28);

    for (let i = 0; i < LEAF_POOL; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: this.colors[i % this.colors.length],
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = true;
      scene.add(mesh);
      this.pool.push(this._makeParticle(mesh));
    }

    // Pre-spawn a dense canopy of leaves
    for (let i = 0; i < LEAF_POOL; i++) this._spawn(true);
  }

  _makeParticle(mesh) {
    return {
      mesh,
      vx: 0, vy: 0, vz: 0,
      rotSpeed: 0,
      swayPhase: 0,
      swayAmp: 0,
      life: 0,
      maxLife: 0,
      active: false,
    };
  }

  _spawn(randomY = false) {
    const p = this.pool.pop();
    if (!p) return;
    const mesh = p.mesh;
    mesh.visible = true;
    mesh.position.set(
      (Math.random() - 0.5) * 14,
      randomY ? 1 + Math.random() * 10 : 8 + Math.random() * 3,
      (Math.random() - 0.5) * 14
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.material.color.setHex(this.colors[(Math.random() * this.colors.length) | 0]);

    p.vx = (Math.random() - 0.5) * 0.6;
    p.vy = -(0.4 + Math.random() * 0.7);
    p.vz = (Math.random() - 0.5) * 0.5;
    p.rotSpeed = (Math.random() - 0.5) * 3;
    p.swayPhase = Math.random() * Math.PI * 2;
    p.swayAmp = 0.4 + Math.random() * 0.6;
    p.life = 0;
    p.maxLife = 10 + Math.random() * 8;
    p.active = true;
    this.active.push(p);
  }

  _recycle(p, index) {
    p.active = false;
    p.mesh.visible = false;
    this.active.splice(index, 1);
    this.pool.push(p);
  }

  update(dt) {
    // Keep density high
    while (this.active.length < LEAF_POOL * 0.9 && this.pool.length) {
      this._spawn(false);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      p.swayPhase += dt * 2.2;

      // Falling with horizontal sway + slight wind
      p.mesh.position.x += (p.vx + Math.sin(p.swayPhase) * p.swayAmp) * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += (p.vz + Math.cos(p.swayPhase * 0.7) * p.swayAmp * 0.5) * dt;

      p.mesh.rotation.x += p.rotSpeed * dt;
      p.mesh.rotation.z += p.rotSpeed * 0.6 * dt;
      p.mesh.rotation.y += Math.sin(p.swayPhase) * dt;

      // Recycle when below island or too old
      if (p.mesh.position.y < -1.5 || p.life > p.maxLife) {
        this._recycle(p, i);
      }
    }
  }

  get count() {
    return this.active.length;
  }
}

// ─── Day / Night Cycle ───────────────────────────────────────────────────────
/**
 * phase t ∈ [0,1) over DAY_CYCLE_SEC:
 *   0.00–0.25 day, 0.25–0.40 dusk, 0.40–0.75 night, 0.75–0.90 dawn, 0.90–1.00 day
 * Lighting strength for landmarks: on during dusk→night, off before dawn ends.
 */
class DayNightCycle {
  constructor(scene, renderer, sun, moon, ambient, dirLight) {
    this.scene = scene;
    this.renderer = renderer;
    this.sun = sun;
    this.moon = moon;
    this.ambient = ambient;
    this.dirLight = dirLight;
    this.t = 0; // 0..1
    this.speed = 1;
    this.fog = scene.fog;

    this.skyColors = {
      day: new THREE.Color(0x87c8f0),
      dusk: new THREE.Color(0xe07a4a),
      night: new THREE.Color(0x0b1020),
      dawn: new THREE.Color(0xf0a878),
    };
    this._sky = new THREE.Color();
    this._fogCol = new THREE.Color();
  }

  setSpeed(mult) {
    this.speed = mult;
  }

  /**
   * Interpolate sky/lights from normalized day phase.
   * LightStrength for city lights: ramps up at dusk, full at night, ramps down at dawn.
   */
  update(dt) {
    this.t = (this.t + (dt * this.speed) / DAY_CYCLE_SEC) % 1;

    const phase = this.t;
    let skyA, skyB, blend;
    let ambI, dirI, dirColor;
    let lightStrength; // landmark lights

    if (phase < 0.25) {
      // Day
      skyA = this.skyColors.day;
      skyB = this.skyColors.day;
      blend = 0;
      ambI = 0.75;
      dirI = 1.6;
      dirColor = 0xfff5e0;
      lightStrength = 0;
    } else if (phase < 0.40) {
      // Dusk transition
      const u = (phase - 0.25) / 0.15;
      skyA = this.skyColors.day;
      skyB = this.skyColors.dusk;
      blend = u;
      ambI = 0.75 - u * 0.35;
      dirI = 1.6 - u * 1.0;
      dirColor = 0xffa060;
      lightStrength = Math.min(1, Math.max(0, (u - 0.15) / 0.5)); // lights start mid-dusk
      if (u > 0.3) lightStrength = Math.min(1, (u - 0.3) / 0.5);
    } else if (phase < 0.75) {
      // Night
      const u = (phase - 0.40) / 0.35;
      skyA = this.skyColors.dusk;
      skyB = this.skyColors.night;
      blend = Math.min(1, u * 2);
      ambI = 0.28;
      dirI = 0.25;
      dirColor = 0x8899cc;
      lightStrength = 1;
    } else if (phase < 0.90) {
      // Dawn — lights off before dawn completes
      const u = (phase - 0.75) / 0.15;
      skyA = this.skyColors.night;
      skyB = this.skyColors.dawn;
      blend = u;
      ambI = 0.28 + u * 0.35;
      dirI = 0.25 + u * 0.9;
      dirColor = 0xffc090;
      // Lights fade early in dawn (before dawn ends)
      lightStrength = Math.max(0, 1 - u * 2.2);
    } else {
      // Morning → day
      const u = (phase - 0.90) / 0.10;
      skyA = this.skyColors.dawn;
      skyB = this.skyColors.day;
      blend = u;
      ambI = 0.63 + u * 0.12;
      dirI = 1.15 + u * 0.45;
      dirColor = 0xfff5e0;
      lightStrength = 0;
    }

    this._sky.copy(skyA).lerp(skyB, blend);
    this.scene.background = this._sky;
    if (this.fog) {
      this._fogCol.copy(this._sky).multiplyScalar(0.85);
      this.fog.color.copy(this._fogCol);
      this.fog.near = 12 + (1 - lightStrength) * 4;
      this.fog.far = 32 + lightStrength * 6;
    }

    this.ambient.intensity = ambI;
    this.dirLight.intensity = dirI;
    this.dirLight.color.setHex(typeof dirColor === 'number' ? dirColor : 0xffffff);

    // Sun / moon orbit: angle from +Y, full circle over day
    // phase 0 = noon-ish sun high; phase 0.5 = midnight moon high
    const sunAngle = phase * Math.PI * 2 - Math.PI / 2;
    const radius = 16;
    this.sun.position.set(
      Math.cos(sunAngle) * radius,
      Math.sin(sunAngle) * radius * 0.7,
      Math.sin(sunAngle * 0.3) * 4
    );
    this.moon.position.set(
      Math.cos(sunAngle + Math.PI) * radius,
      Math.sin(sunAngle + Math.PI) * radius * 0.7,
      Math.cos(sunAngle * 0.3) * 4
    );

    // Hide celestial body below horizon slightly
    this.sun.visible = this.sun.position.y > -1;
    this.moon.visible = this.moon.position.y > -1;

    // Directional light follows sun
    this.dirLight.position.copy(this.sun.position);

    this.lightStrength = lightStrength;
    this.phaseName = this._name(phase);
    return lightStrength;
  }

  _name(p) {
    if (p < 0.25) return 'DAY';
    if (p < 0.40) return 'DUSK';
    if (p < 0.75) return 'NIGHT';
    if (p < 0.90) return 'DAWN';
    return 'DAY';
  }
}

// ─── Simple horizontal orbit (mouse / touch) ─────────────────────────────────
class CameraOrbit {
  constructor(camera, target = new THREE.Vector3(0, 2.5, 0)) {
    this.camera = camera;
    this.target = target;
    this.theta = 0.55; // horizontal angle
    this.phi = 0.42;   // elevation
    this.radius = 14;
    this.dragging = false;
    this.lastX = 0;
    this.sensitivity = 0.007;

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
      // Horizontal drag → yaw around island
      this.theta -= dx * this.sensitivity;
    });
    const end = () => { this.dragging = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);

    // Optional wheel zoom (clamped)
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.radius = THREE.MathUtils.clamp(this.radius + e.deltaY * 0.01, 8, 22);
    }, { passive: false });
  }

  update() {
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    this.camera.position.set(
      this.target.x + x,
      this.target.y + y,
      this.target.z + z
    );
    this.camera.lookAt(this.target);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87c8f0, 14, 36);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
const orbit = new CameraOrbit(camera);

const ambient = new THREE.AmbientLight(0xb0c4de, 0.7);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
dirLight.position.set(10, 14, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 40;
dirLight.shadow.camera.left = -12;
dirLight.shadow.camera.right = 12;
dirLight.shadow.camera.top = 12;
dirLight.shadow.camera.bottom = -12;
scene.add(dirLight);

// Sun & moon meshes
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(0.7, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffe566 })
);
scene.add(sun);
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.45, 12, 10),
  new THREE.MeshBasicMaterial({ color: 0xdde6ff })
);
scene.add(moon);

const island = new Island(scene);
const tower = new TokyoTower(island.group);
const landmarks = [
  new Landmark(island.group, 'fuji', -3.5, -2.8, 0.3),
  new Landmark(island.group, 'torii', 3.2, -2.2, -0.4),
  new Landmark(island.group, 'temple', 2.8, 2.6, 0.6),
];
const leaves = new MapleLeafSystem(scene);
const dayNight = new DayNightCycle(scene, renderer, sun, moon, ambient, dirLight);

// Distant soft ground for depth
const farGround = new THREE.Mesh(
  new THREE.CircleGeometry(40, 32),
  std(0x1a2030, { transparent: true, opacity: 0.4 })
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -4;
scene.add(farGround);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Wider FOV on very short embeds so the island stays in frame
  camera.fov = h < 240 ? 55 : 45;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Keyboard: 1–4 = cycle speed, Space = reset
window.addEventListener('keydown', (e) => {
  if (e.key === '1') dayNight.setSpeed(1);
  else if (e.key === '2') dayNight.setSpeed(2);
  else if (e.key === '3') dayNight.setSpeed(4);
  else if (e.key === '4') dayNight.setSpeed(8);
  else if (e.key === ' ') {
    dayNight.t = 0;
    dayNight.setSpeed(1);
  }
});

const phaseLabel = document.getElementById('phase-label');
const statsEl = document.getElementById('stats');

let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 60;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const lightS = dayNight.update(dt);
  tower.setLightStrength(lightS);
  for (const lm of landmarks) lm.setLightStrength(lightS);

  island.update(dt);
  leaves.update(dt);
  orbit.update();

  renderer.render(scene, camera);

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
    phaseLabel.textContent = dayNight.phaseName;
    statsEl.textContent = `${fps} fps · ${leaves.count} leaves · ×${dayNight.speed}`;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
