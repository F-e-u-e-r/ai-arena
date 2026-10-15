import * as THREE from 'three';

const stage = document.querySelector('#stage');
const phaseLabel = document.querySelector('#phaseLabel');
const cycleClock = document.querySelector('#cycleClock');
const cycleButton = document.querySelector('#cycleButton');
const pauseGlyph = document.querySelector('#pauseGlyph');
const orbitLeft = document.querySelector('#orbitLeft');
const orbitRight = document.querySelector('#orbitRight');

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

class DayNightCycle {
  constructor() {
    this.duration = 15;
    this.elapsed = 0;
    this.speed = 1;
    this.paused = false;
    this.keyframes = [
      { t: 0.00, top: '#69b8e6', horizon: '#c7e6df', low: '#f5c59f', fog: '#b8d9dc', sun: '#fff1cf', hemi: '#b8dff1' },
      { t: 0.20, top: '#79bce4', horizon: '#f3d5bb', low: '#ffcb9c', fog: '#e2c6be', sun: '#ffe4bd', hemi: '#c9e4f2' },
      { t: 0.34, top: '#76639a', horizon: '#ef9783', low: '#ffc17e', fog: '#d69ba3', sun: '#ffb16f', hemi: '#c4a1c1' },
      { t: 0.50, top: '#11183e', horizon: '#344773', low: '#765780', fog: '#333b68', sun: '#7783c1', hemi: '#808ab8' },
      { t: 0.67, top: '#11183e', horizon: '#344773', low: '#765780', fog: '#333b68', sun: '#7783c1', hemi: '#808ab8' },
      { t: 0.80, top: '#73639c', horizon: '#ee9c99', low: '#ffd1a0', fog: '#d0a5b3', sun: '#ffd3a3', hemi: '#c7a7ce' },
      { t: 0.92, top: '#72bce8', horizon: '#c9e9e2', low: '#f5c99f', fog: '#c3dfe0', sun: '#fff0ce', hemi: '#c3e5f2' },
      { t: 1.00, top: '#69b8e6', horizon: '#c7e6df', low: '#f5c59f', fog: '#b8d9dc', sun: '#fff1cf', hemi: '#b8dff1' },
    ].map((frame) => ({
      ...frame,
      topColor: new THREE.Color(frame.top),
      horizonColor: new THREE.Color(frame.horizon),
      lowColor: new THREE.Color(frame.low),
      fogColor: new THREE.Color(frame.fog),
      sunColor: new THREE.Color(frame.sun),
      hemiColor: new THREE.Color(frame.hemi),
    }));
  }

  update(delta) {
    if (!this.paused) this.elapsed += delta * this.speed;
    const progress = (this.elapsed % this.duration) / this.duration;
    let left = this.keyframes[0];
    let right = this.keyframes[this.keyframes.length - 1];
    for (let i = 0; i < this.keyframes.length - 1; i += 1) {
      if (progress >= this.keyframes[i].t && progress <= this.keyframes[i + 1].t) {
        left = this.keyframes[i];
        right = this.keyframes[i + 1];
        break;
      }
    }
    const span = right.t - left.t || 1;
    const mix = smooth(0, 1, (progress - left.t) / span);
    const color = (key) => left[`${key}Color`].clone().lerp(right[`${key}Color`], mix);
    const night = smooth(0.25, 0.46, progress) * (1 - smooth(0.69, 0.84, progress));
    const lights = smooth(0.22, 0.37, progress) * (1 - smooth(0.73, 0.85, progress));
    return {
      progress,
      night,
      lights,
      top: color('top'),
      horizon: color('horizon'),
      low: color('low'),
      fog: color('fog'),
      sun: color('sun'),
      hemi: color('hemi'),
      phase: progress < 0.22 || progress >= 0.88 ? 'DAYLIGHT'
        : progress < 0.39 ? 'GOLDEN HOUR'
          : progress < 0.70 ? 'BLUE HOUR'
            : 'FIRST LIGHT',
    };
  }
}

class Island {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.y = 0.14;
    scene.add(this.group);
    this.materials = {};
    this.buildBody();
    this.buildLandmarks();
    this.buildGarden();
  }

  toon(color, options = {}) {
    return new THREE.MeshToonMaterial({ color, ...options });
  }

  add(geometry, material, position, scale, parent = this.group, cast = true) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    if (scale) object.scale.set(...scale);
    object.castShadow = cast;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  buildBody() {
    const earth = this.toon('#624b58');
    const strata = this.toon('#9a625d');
    const deepStrata = this.toon('#4c4359');
    const grass = this.toon('#7baf83');
    const edgeGrass = this.toon('#a9c786');
    this.add(new THREE.CylinderGeometry(2.8, 1.48, 1.35, 10, 1), earth, [0, -0.67, 0], null);
    this.add(new THREE.CylinderGeometry(2.82, 2.72, 0.14, 10), deepStrata, [0, -0.11, 0], null);
    this.add(new THREE.CylinderGeometry(2.88, 2.78, 0.12, 10), strata, [0, -0.01, 0], null);
    this.add(new THREE.CylinderGeometry(2.91, 2.82, 0.12, 10), grass, [0, 0.08, 0], null);
    this.add(new THREE.CircleGeometry(2.86, 64), grass, [0, 0.145, 0], [1, 1, 1]).rotation.x = -Math.PI / 2;
    const rim = this.add(new THREE.TorusGeometry(2.82, 0.055, 5, 56), edgeGrass, [0, 0.135, 0], null, this.group, false);
    rim.rotation.x = Math.PI / 2;

    const rockColors = ['#73505a', '#875b5d', '#55485a', '#a16a60'];
    for (let i = 0; i < 20; i += 1) {
      const angle = (i / 20) * Math.PI * 2;
      const y = -0.35 - (i % 4) * 0.22;
      const radius = 2.73 - (y + 0.35) * 0.78;
      const rock = this.add(
        new THREE.IcosahedronGeometry(0.27 + (i % 3) * 0.035, 0),
        this.toon(rockColors[i % rockColors.length]),
        [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
        [1.12, 0.68 + (i % 2) * 0.15, 0.9],
      );
      rock.rotation.set(i * 0.31, angle, i * 0.17);
    }

    // A few floating stone chips make the island silhouette feel weightless.
    for (let i = 0; i < 7; i += 1) {
      const a = i * Math.PI * 2 / 7;
      const chip = this.add(new THREE.DodecahedronGeometry(0.17, 0), this.toon(i % 2 ? '#79606c' : '#a17069'),
        [Math.cos(a) * (1.45 + (i % 2) * 0.28), -1.38 - (i % 3) * 0.18, Math.sin(a) * (1.45 + (i % 2) * 0.28)],
        [1.2, 0.65, 0.85]);
      chip.rotation.set(a, a * 0.7, 0.4);
    }
  }

  buildLandmarks() {
    this.buildTokyoTower();
    this.buildFuji();
    this.buildTorii();
    this.buildPagoda();
  }

  buildTokyoTower() {
    const tower = new THREE.Group();
    tower.position.set(0, 0.15, -0.22);
    this.group.add(tower);
    const vermilion = this.toon('#df584b');
    const cream = this.toon('#fff0d4');
    const dark = this.toon('#693e50');
    const gold = this.toon('#ffd17e', { emissive: '#ff9e48', emissiveIntensity: 0.15 });
    this.materials.towerGlow = gold;

    const beam = (a, b, radius, material) => {
      const start = new THREE.Vector3(...a);
      const end = new THREE.Vector3(...b);
      const direction = new THREE.Vector3().subVectors(end, start);
      const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material);
      part.position.copy(start).add(end).multiplyScalar(0.5);
      part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      part.castShadow = true;
      part.receiveShadow = true;
      tower.add(part);
      return part;
    };
    const levels = [
      { y: 0.06, w: 1.30 }, { y: 0.48, w: 1.08 }, { y: 0.90, w: 0.87 },
      { y: 1.32, w: 0.68 }, { y: 1.74, w: 0.49 }, { y: 2.16, w: 0.33 },
      { y: 2.56, w: 0.21 }, { y: 2.84, w: 0.15 },
    ];
    const corners = (level) => [
      [-level.w / 2, level.y, -level.w / 2], [level.w / 2, level.y, -level.w / 2],
      [level.w / 2, level.y, level.w / 2], [-level.w / 2, level.y, level.w / 2],
    ];
    levels.forEach((level, i) => {
      const ring = corners(level);
      for (let c = 0; c < 4; c += 1) beam(ring[c], ring[(c + 1) % 4], i === 0 ? 0.055 : 0.035, i % 2 === 0 ? vermilion : cream);
      if (i < levels.length - 1) {
        const next = corners(levels[i + 1]);
        for (let c = 0; c < 4; c += 1) {
          beam(ring[c], next[c], 0.042, vermilion);
          // Alternating diagonal braces create the familiar open lattice tower.
          beam(ring[c], next[(c + 1) % 4], 0.022, i % 2 ? vermilion : cream);
        }
      }
    });

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 1.42), dark);
    base.position.y = 0.06;
    base.castShadow = true;
    tower.add(base);
    for (const [y, width] of [[1.83, 0.6], [2.25, 0.43]]) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.105, width), cream);
      deck.position.y = y;
      deck.castShadow = true;
      deck.receiveShadow = true;
      tower.add(deck);
      const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.07, 0.045, width + 0.07), vermilion);
      band.position.y = y + 0.075;
      tower.add(band);
      for (let i = 0; i < 4; i += 1) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.018), gold);
        const a = i * Math.PI / 2 + Math.PI / 4;
        window.position.set(Math.cos(a) * width * 0.28, y + 0.015, Math.sin(a) * width * 0.28);
        tower.add(window);
      }
    }

    beam([0, 2.82, 0], [0, 3.64, 0], 0.032, vermilion);
    beam([0, 3.02, 0], [0, 3.18, 0], 0.042, cream);
    beam([0, 3.34, 0], [0, 3.49, 0], 0.038, cream);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), gold);
    beacon.position.y = 2.92;
    tower.add(beacon);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), gold);
    top.position.y = 3.65;
    tower.add(top);

    const beaconLight = new THREE.PointLight('#ffad67', 0, 7, 2);
    beaconLight.position.set(0, 2.25, 0);
    tower.add(beaconLight);
    this.materials.towerLight = beaconLight;
    this.tower = tower;
  }

  buildFuji() {
    const fuji = new THREE.Group();
    fuji.position.set(-1.95, 0.13, -1.38);
    this.group.add(fuji);
    const mountain = this.add(new THREE.ConeGeometry(0.85, 1.55, 7, 1), this.toon('#597995'), [0, 0.78, 0], null, fuji);
    mountain.rotation.y = 0.22;
    const snow = this.add(new THREE.ConeGeometry(0.48, 0.54, 7, 1), this.toon('#fff0df'), [0, 1.32, 0], null, fuji);
    snow.rotation.y = 0.22;
    const foot = this.add(new THREE.CylinderGeometry(0.8, 0.85, 0.13, 7), this.toon('#a0b78c'), [0, 0.12, 0], null, fuji);
    foot.rotation.y = 0.22;
  }

  buildTorii() {
    const gate = new THREE.Group();
    gate.position.set(1.92, 0.14, -1.34);
    this.group.add(gate);
    const red = this.toon('#d9584a');
    const dark = this.toon('#744250');
    const postGeo = new THREE.CylinderGeometry(0.065, 0.085, 1.36, 8);
    for (const x of [-0.48, 0.48]) {
      const post = this.add(postGeo, red, [x, 0.73, 0], null, gate);
      post.rotation.z = x < 0 ? -0.035 : 0.035;
      this.add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), dark, [x, 0.11, 0], null, gate);
    }
    const top = this.add(new THREE.BoxGeometry(1.55, 0.14, 0.2), dark, [0, 1.42, 0], null, gate);
    top.rotation.z = 0.015;
    this.add(new THREE.BoxGeometry(1.22, 0.105, 0.16), red, [0, 1.26, 0], null, gate);
    this.add(new THREE.BoxGeometry(0.74, 0.1, 0.15), red, [0, 0.96, 0], null, gate);
    for (const x of [-0.61, 0.61]) this.add(new THREE.SphereGeometry(0.085, 8, 6), this.toon('#f2bf79'), [x, 1.42, 0], null, gate);
  }

  buildPagoda() {
    const pagoda = new THREE.Group();
    pagoda.position.set(1.83, 0.13, 1.42);
    this.group.add(pagoda);
    const wood = this.toon('#7e4a50');
    const roof = this.toon('#354359');
    const roofEdge = this.toon('#f0a66f');
    const glow = this.toon('#ffd39a', { emissive: '#ff9d51', emissiveIntensity: 0.12 });
    this.materials.landmarkGlow = glow;
    this.add(new THREE.BoxGeometry(0.76, 0.16, 0.64), wood, [0, 0.2, 0], null, pagoda);
    for (const x of [-0.25, 0.25]) for (const z of [-0.2, 0.2]) {
      this.add(new THREE.CylinderGeometry(0.035, 0.045, 0.54, 6), this.toon('#eed0a0'), [x, 0.52, z], null, pagoda);
    }
    this.add(new THREE.BoxGeometry(0.47, 0.43, 0.38), wood, [0, 0.55, 0], null, pagoda);
    const window = this.add(new THREE.BoxGeometry(0.28, 0.2, 0.025), glow, [0, 0.55, 0.205], null, pagoda, false);
    window.material.side = THREE.DoubleSide;
    const levels = [
      { y: 0.86, w: 0.86 }, { y: 1.24, w: 0.68 }, { y: 1.56, w: 0.51 },
    ];
    levels.forEach((level, i) => {
      const cap = this.add(new THREE.CylinderGeometry(level.w * 0.48, level.w * 0.72, 0.16, 4), roof,
        [0, level.y, 0], null, pagoda);
      cap.rotation.y = Math.PI / 4;
      const trim = this.add(new THREE.CylinderGeometry(level.w * 0.54, level.w * 0.76, 0.045, 4), roofEdge,
        [0, level.y - 0.045, 0], null, pagoda, false);
      trim.rotation.y = Math.PI / 4;
      if (i < 2) this.add(new THREE.BoxGeometry(level.w * 0.42, 0.23, level.w * 0.42), wood,
        [0, level.y + 0.17, 0], null, pagoda);
    });
    const finial = this.add(new THREE.CylinderGeometry(0.015, 0.035, 0.35, 6), roofEdge, [0, 1.84, 0], null, pagoda);
    finial.rotation.z = 0.01;
  }

  buildGarden() {
    const stone = this.toon('#d5b58e');
    const path = [2.42, 2.0, 1.58, 1.17, 0.78, 0.42];
    path.forEach((z, i) => {
      const x = Math.sin(i * 0.72) * 0.18;
      const step = this.add(new THREE.CylinderGeometry(0.15, 0.17, 0.045, 7), stone,
        [x, 0.17, z], [1.05, 1, 0.85], this.group, false);
      step.rotation.y = i * 0.45;
    });

    const treePositions = [
      [-2.34, 0.16, 0.82, '#bd685b'], [-2.51, 0.15, -0.14, '#e0a16c'],
      [2.55, 0.14, 0.34, '#c4675d'], [-0.95, 0.15, 2.15, '#9c745f'],
    ];
    treePositions.forEach(([x, y, z, color], index) => {
      const tree = new THREE.Group();
      tree.position.set(x, y, z);
      this.group.add(tree);
      this.add(new THREE.CylinderGeometry(0.055, 0.08, 0.57, 6), this.toon('#74534c'), [0, 0.29, 0], null, tree);
      for (let j = 0; j < 3; j += 1) {
        const crown = this.add(new THREE.IcosahedronGeometry(0.29 + j * 0.035, 1), this.toon(color),
          [(j - 1) * 0.17, 0.57 + j * 0.13, (j % 2) * 0.12], [1.05, 0.86, 0.95], tree);
        crown.rotation.set(index * 0.2, j, index * 0.13);
      }
    });

    const lanternMat = this.toon('#ffd79c', { emissive: '#ffa851', emissiveIntensity: 0.08 });
    this.materials.gardenGlow = lanternMat;
    const lanterns = [[-2.12, 1.66], [2.25, 0.92], [-2.12, -0.9], [0.94, 2.34]];
    lanterns.forEach(([x, z]) => {
      const lamp = new THREE.Group();
      lamp.position.set(x, 0.15, z);
      this.group.add(lamp);
      this.add(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 5), this.toon('#73514e'), [0, 0.21, 0], null, lamp);
      this.add(new THREE.BoxGeometry(0.22, 0.2, 0.2), lanternMat, [0, 0.48, 0], null, lamp, false);
      this.add(new THREE.ConeGeometry(0.17, 0.11, 4), this.toon('#5c4652'), [0, 0.635, 0], null, lamp);
    });

    // Small shoreline plants break up the grass edge without hiding the landmarks.
    for (let i = 0; i < 16; i += 1) {
      const a = i * Math.PI * 2 / 16;
      const plant = this.add(new THREE.ConeGeometry(0.095, 0.26, 4), this.toon(i % 2 ? '#729a72' : '#91b27a'),
        [Math.cos(a) * 2.56, 0.25, Math.sin(a) * 2.56], [0.75, 1, 0.75], this.group, false);
      plant.rotation.z = Math.cos(a) * 0.22;
      plant.rotation.x = Math.sin(a) * 0.22;
    }
  }

  update(time) {
    this.group.position.y = 0.14 + Math.sin(time * 1.05) * 0.12;
    this.group.rotation.y = Math.sin(time * 0.17) * 0.025;
  }
}

class MapleLeafSystem {
  constructor(scene, count = 108) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.22);
    shape.lineTo(-0.10, -0.05); shape.lineTo(-0.30, -0.13); shape.lineTo(-0.23, 0.02);
    shape.lineTo(-0.42, 0.08); shape.lineTo(-0.22, 0.17); shape.lineTo(-0.28, 0.35);
    shape.lineTo(-0.08, 0.27); shape.lineTo(0, 0.46); shape.lineTo(0.08, 0.27);
    shape.lineTo(0.28, 0.35); shape.lineTo(0.22, 0.17); shape.lineTo(0.42, 0.08);
    shape.lineTo(0.23, 0.02); shape.lineTo(0.30, -0.13); shape.lineTo(0.10, -0.05);
    shape.closePath();
    this.geometry = new THREE.ShapeGeometry(shape, 1);
    this.material = new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.colors = ['#d64e45', '#ec754f', '#f5a052', '#b84552', '#f1c16e'].map((c) => new THREE.Color(c));
    this.items = [];
    for (let i = 0; i < count; i += 1) {
      const item = this.spawn(i, true);
      this.items.push(item);
      this.mesh.setColorAt(i, this.colors[i % this.colors.length]);
      this.apply(i, item, 0);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  random(min, max) { return min + Math.random() * (max - min); }

  spawn(index, initial = false) {
    const angle = this.random(0, Math.PI * 2);
    const radius = this.random(3.2, 5.2);
    return {
      baseX: Math.cos(angle) * radius,
      baseZ: Math.sin(angle) * radius,
      y: initial ? this.random(-0.8, 7.2) : this.random(5.6, 8.6),
      speed: this.random(0.38, 0.9),
      sway: this.random(0.35, 0.82),
      phase: this.random(0, Math.PI * 2),
      spin: this.random(-1.3, 1.3),
      size: this.random(0.62, 1.22),
      tilt: this.random(-0.8, 0.8),
      index,
    };
  }

  apply(index, item, time) {
    const { dummy } = this;
    dummy.position.set(
      item.baseX + Math.sin(time * 1.25 + item.phase) * item.sway,
      item.y,
      item.baseZ + Math.cos(time * 0.88 + item.phase) * item.sway * 0.62,
    );
    dummy.rotation.set(
      item.tilt + Math.sin(time * 1.8 + item.phase) * 0.55,
      time * item.spin + item.phase,
      Math.sin(time * 1.45 + item.phase) * 0.52,
    );
    dummy.scale.set(item.size, item.size, item.size);
    dummy.updateMatrix();
    this.mesh.setMatrixAt(index, dummy.matrix);
  }

  update(delta, time) {
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[i];
      item.y -= item.speed * delta;
      if (item.y < -1.9) this.items[i] = this.spawn(i);
      this.apply(i, this.items[i], time);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function makeCloud(scene, x, y, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  group.userData.baseX = x;
  const material = new THREE.MeshToonMaterial({ color: '#fff4e6', transparent: true, opacity: 0.76, depthWrite: false });
  const puffs = [
    [-0.68, 0, 0, 0.62], [-0.22, 0.24, 0, 0.82], [0.36, 0.08, 0, 0.66], [0.78, -0.06, 0, 0.43],
  ];
  puffs.forEach(([px, py, pz, size]) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), material);
    puff.position.set(px, py, pz);
    puff.scale.y = 0.65;
    group.add(puff);
  });
  scene.add(group);
  return group;
}

function makeSky(scene) {
  const skyGeometry = new THREE.SphereGeometry(100, 32, 24);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color('#69b8e6') },
      uHorizon: { value: new THREE.Color('#c7e6df') },
      uLow: { value: new THREE.Color('#f5c59f') },
    },
    vertexShader: `
      varying float vSkyHeight;
      void main() {
        vSkyHeight = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uLow;
      varying float vSkyHeight;
      void main() {
        vec3 upper = mix(uHorizon, uTop, smoothstep(0.02, 0.78, vSkyHeight));
        vec3 sky = mix(uLow, upper, smoothstep(-0.26, 0.10, vSkyHeight));
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.frustumCulled = false;
  scene.add(sky);

  const starPositions = [];
  for (let i = 0; i < 250; i += 1) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = 55;
    const s = Math.sqrt(1 - u * u);
    starPositions.push(r * s * Math.cos(theta), r * u, r * s * Math.sin(theta));
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: '#fff2d4', size: 0.12, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  const sunMaterial = new THREE.MeshBasicMaterial({ color: '#ffe1a2', transparent: true, opacity: 1, depthWrite: false });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.02, 20, 16), sunMaterial);
  sun.renderOrder = 1;
  scene.add(sun);
  const haloMaterial = new THREE.MeshBasicMaterial({ color: '#ffd09b', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.BackSide });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 16), haloMaterial);
  sun.add(halo);

  const moonMaterial = new THREE.MeshBasicMaterial({ color: '#fff2d4', transparent: true, opacity: 0, depthWrite: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 14), moonMaterial);
  moon.renderOrder = 1;
  scene.add(moon);
  const moonHalo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 18, 14), new THREE.MeshBasicMaterial({
    color: '#c8dcff', transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide,
  }));
  moon.add(moonHalo);

  const clouds = [
    makeCloud(scene, -7.2, 5.3, -5.5, 1.05), makeCloud(scene, 6.8, 6.5, -8, 0.8),
    makeCloud(scene, -3.7, 7.1, -11, 0.66), makeCloud(scene, 3.2, 4.9, -10, 0.58),
  ];
  return { material: skyMaterial, stars: starMaterial, sun, sunMaterial, haloMaterial, moon, moonMaterial, moonHalo: moonHalo.material, clouds };
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#b8d9dc', 20, 66);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(stage.clientWidth || window.innerWidth, stage.clientHeight || window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(-6.8, 6.8, 4.25, -4.25, 0.1, 160);
const cameraTarget = new THREE.Vector3(0, 0.52, 0);
let azimuth = 0.64;
const cameraRadius = 15.6;
const cameraHeight = 8.3;

const hemisphere = new THREE.HemisphereLight('#c8e9ff', '#80606b', 1.45);
scene.add(hemisphere);
const sunLight = new THREE.DirectionalLight('#fff1cf', 1.9);
sunLight.position.set(-6, 12, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -8;
sunLight.shadow.camera.right = 8;
sunLight.shadow.camera.top = 9;
sunLight.shadow.camera.bottom = -8;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 35;
sunLight.shadow.bias = -0.00035;
sunLight.shadow.normalBias = 0.035;
scene.add(sunLight);

const sky = makeSky(scene);
const island = new Island(scene);
const leaves = new MapleLeafSystem(scene, 108);
const cycle = new DayNightCycle();
const clock = new THREE.Clock();
let animationTime = 0;

function updateCamera() {
  const aspect = Math.max(0.1, stage.clientWidth / Math.max(1, stage.clientHeight));
  const viewHeight = aspect < 1.15 ? 8.7 : 8.3;
  const viewWidth = viewHeight * aspect;
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  camera.position.set(Math.sin(azimuth) * cameraRadius, cameraHeight, Math.cos(azimuth) * cameraRadius);
  camera.lookAt(cameraTarget);
}

function applyCycle(theme) {
  sky.material.uniforms.uTop.value.copy(theme.top);
  sky.material.uniforms.uHorizon.value.copy(theme.horizon);
  sky.material.uniforms.uLow.value.copy(theme.low);
  scene.fog.color.copy(theme.fog);
  hemisphere.color.copy(theme.hemi);
  hemisphere.groundColor.copy(theme.low);
  hemisphere.intensity = THREE.MathUtils.lerp(0.58, 1.45, 1 - theme.night);
  sunLight.color.copy(theme.sun);
  sunLight.intensity = THREE.MathUtils.lerp(0.18, 1.75, 1 - theme.night);

  const angle = Math.PI / 2 + theme.progress * Math.PI * 2;
  const sunY = 8.5 * Math.sin(angle);
  sky.sun.position.set(15 * Math.cos(angle), sunY, -19);
  sky.sunMaterial.color.copy(theme.sun);
  sky.sunMaterial.opacity = smooth(-1.2, 2.2, sunY);
  sky.haloMaterial.opacity = 0.05 + theme.lights * 0.15;
  const moonAngle = angle + Math.PI;
  const moonY = 8.5 * Math.sin(moonAngle);
  sky.moon.position.set(13 * Math.cos(moonAngle), moonY, -18);
  sky.moonMaterial.opacity = smooth(-0.6, 2.0, moonY) * (0.45 + theme.night * 0.55);
  sky.moonHalo.opacity = sky.moonMaterial.opacity * 0.16;
  sky.stars.opacity = theme.night * 0.82;
  sky.clouds.forEach((cloud, i) => {
    cloud.position.x = cloud.userData.baseX + Math.sin(animationTime * 0.12 + i * 1.7) * 0.46;
    cloud.children[0].material.color.copy(theme.horizon).lerp(new THREE.Color('#fff4e6'), 0.62);
    cloud.children[0].material.opacity = THREE.MathUtils.lerp(0.44, 0.76, 1 - theme.night);
  });

  const glow = theme.lights;
  island.materials.towerGlow.emissiveIntensity = 0.08 + glow * 2.15;
  island.materials.landmarkGlow.emissiveIntensity = 0.05 + glow * 1.4;
  island.materials.gardenGlow.emissiveIntensity = 0.04 + glow * 1.7;
  island.materials.towerLight.intensity = glow * 10;
  phaseLabel.textContent = theme.phase;
  cycleClock.textContent = cycle.paused ? 'PAUSED' : `${Math.ceil((1 - theme.progress) * 15)} SEC LOOP`;
  pauseGlyph.textContent = cycle.paused ? '▶' : 'Ⅱ';
  cycleButton.classList.toggle('is-paused', cycle.paused);
  cycleButton.setAttribute('aria-label', cycle.paused ? 'Resume day and night cycle' : 'Pause day and night cycle');
}

let dragging = false;
let lastPointerX = 0;
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = true;
  lastPointerX = event.clientX;
  renderer.domElement.setPointerCapture(event.pointerId);
  stage.classList.add('is-dragging');
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const deltaX = event.clientX - lastPointerX;
  lastPointerX = event.clientX;
  azimuth -= deltaX * 0.008;
  updateCamera();
});
const endDrag = () => {
  dragging = false;
  stage.classList.remove('is-dragging');
};
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);
renderer.domElement.addEventListener('lostpointercapture', endDrag);

orbitLeft.addEventListener('click', () => { azimuth += 0.36; updateCamera(); });
orbitRight.addEventListener('click', () => { azimuth -= 0.36; updateCamera(); });
cycleButton.addEventListener('click', () => { cycle.paused = !cycle.paused; });
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return;
  if (event.key === 'ArrowLeft') { azimuth += 0.16; updateCamera(); }
  if (event.key === 'ArrowRight') { azimuth -= 0.16; updateCamera(); }
  if (event.code === 'Space') { event.preventDefault(); cycle.paused = !cycle.paused; }
  if (event.key === '+' || event.key === '=') cycle.speed = Math.min(4, cycle.speed + 0.5);
  if (event.key === '-' || event.key === '_') cycle.speed = Math.max(0.5, cycle.speed - 0.5);
});

const resizeObserver = new ResizeObserver(() => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  updateCamera();
});
resizeObserver.observe(stage);
window.addEventListener('beforeunload', () => resizeObserver.disconnect(), { once: true });
updateCamera();

function animate() {
  requestAnimationFrame(animate);
  // Clamp long frame gaps (tab switches) so particles and the clock never jump.
  const delta = Math.min(clock.getDelta(), 0.05);
  animationTime += delta;
  const theme = cycle.update(delta);
  island.update(animationTime);
  leaves.update(delta, animationTime);
  const angle = Math.PI / 2 + theme.progress * Math.PI * 2;
  sunLight.position.set(8 * Math.cos(angle), Math.max(2.5, 9 * Math.sin(angle)), 7);
  applyCycle(theme);
  renderer.render(scene, camera);
}

animate();
