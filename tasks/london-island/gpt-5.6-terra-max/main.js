import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const random = (min, max) => min + Math.random() * (max - min);

const SEASONS = [
  {
    label: "SPRING · MIST",
    sky: new THREE.Color("#91bec4"),
    grass: new THREE.Color("#69a86d"),
    fog: 0.12,
    warmth: 0.72,
    particle: "mist"
  },
  {
    label: "SUMMER · CLEAR",
    sky: new THREE.Color("#65b4e9"),
    grass: new THREE.Color("#85bc59"),
    fog: 0.022,
    warmth: 1,
    particle: "none"
  },
  {
    label: "AUTUMN · LEAVES",
    sky: new THREE.Color("#d39a73"),
    grass: new THREE.Color("#9b934a"),
    fog: 0.045,
    warmth: 0.82,
    particle: "leaf"
  },
  {
    label: "WINTER · SNOW",
    sky: new THREE.Color("#9db8d7"),
    grass: new THREE.Color("#84a89c"),
    fog: 0.082,
    warmth: 0.45,
    particle: "snow"
  }
];

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0,
    flatShading: true,
    ...options
  });
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

function addCylinderBetween(group, start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const line = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material);
  line.position.copy(start).add(end).multiplyScalar(0.5);
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(line);
  return line;
}

class FloatingIsland {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.position.y = -0.25;
    scene.add(this.root);

    this.grassMaterial = standard("#70a75a");
    this.rockMaterial = standard("#765142");
    this.rockLightMaterial = standard("#9c7354");
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: "#417aa0",
      roughness: 0.32,
      metalness: 0.15,
      transparent: true,
      opacity: 0.72
    });

    const underside = mesh(new THREE.ConeGeometry(4.65, 4.4, 9), this.rockMaterial, 0, -2.12, 0);
    underside.rotation.x = Math.PI;
    this.root.add(underside);

    const rockShelf = mesh(new THREE.CylinderGeometry(4.62, 4.27, 0.44, 32), this.rockLightMaterial, 0, -0.1, 0);
    this.root.add(rockShelf);
    const meadow = mesh(new THREE.SphereGeometry(4.5, 32, 16), this.grassMaterial, 0, 0.12, 0);
    meadow.scale.y = 0.19;
    this.root.add(meadow);

    const river = mesh(new THREE.CircleGeometry(2.42, 32), this.waterMaterial, 0.2, 0.5, -0.18);
    river.rotation.x = -Math.PI / 2;
    river.scale.set(1.22, 0.43, 1);
    this.root.add(river);

    this.trees = [];
    this.addTrees();
    this.addRocks();
  }

  addTrees() {
    const trunkMaterial = standard("#644535");
    const foliage = [standard("#4b8d58"), standard("#5e9d55"), standard("#77ad59")];
    const treePositions = [
      [-3.25, 0.52, -0.65, 0.8],
      [-2.8, 0.48, 1.65, 0.57],
      [2.7, 0.47, 1.75, 0.67],
      [3.55, 0.42, 0.25, 0.52],
      [1.45, 0.45, -2.7, 0.56],
      [-1.55, 0.48, 2.75, 0.54]
    ];
    treePositions.forEach((data, index) => {
      const tree = new THREE.Group();
      tree.position.set(data[0], data[1], data[2]);
      const trunk = mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.72, 6), trunkMaterial, 0, 0.35, 0);
      const crown = mesh(new THREE.DodecahedronGeometry(0.58, 0), foliage[index % foliage.length], 0, 0.83, 0);
      crown.scale.set(1, 1.15, 0.93);
      tree.scale.setScalar(data[3]);
      tree.add(trunk, crown);
      this.root.add(tree);
      this.trees.push(crown);
    });
  }

  addRocks() {
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * TAU + 0.15;
      const radius = random(3.15, 4.15);
      const rock = mesh(
        new THREE.DodecahedronGeometry(random(0.1, 0.23), 0),
        i % 2 ? this.rockMaterial : this.rockLightMaterial,
        Math.cos(angle) * radius,
        random(0.22, 0.39),
        Math.sin(angle) * radius
      );
      rock.rotation.set(random(0, 1), random(0, 1), random(0, 1));
      this.root.add(rock);
    }
  }

  update(time, season) {
    this.root.position.y = -0.25 + Math.sin(time * 0.85) * 0.16;
    this.root.rotation.z = Math.sin(time * 0.42) * 0.012;
    this.grassMaterial.color.lerpColors(season.from.grass, season.to.grass, season.mix);
    this.trees.forEach((tree, index) => {
      tree.rotation.y = Math.sin(time * 0.55 + index) * 0.035;
    });
  }
}

class BigBen {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.position.set(-0.12, 0.42, 0.2);
    parent.add(this.root);

    const stone = standard("#d7be88");
    const darkStone = standard("#8c775c");
    const roof = standard("#48566c", { roughness: 0.45, metalness: 0.16 });
    this.litMaterials = [];

    this.root.add(mesh(new THREE.BoxGeometry(1.28, 0.34, 1.28), darkStone, 0, 0.17, 0));
    this.root.add(mesh(new THREE.BoxGeometry(0.83, 2.95, 0.83), stone, 0, 1.72, 0));
    this.root.add(mesh(new THREE.BoxGeometry(1.16, 1.08, 1.16), stone, 0, 3.62, 0));

    const roofMesh = mesh(new THREE.ConeGeometry(0.89, 1.55, 4), roof, 0, 4.91, 0);
    roofMesh.rotation.y = Math.PI / 4;
    this.root.add(roofMesh);
    this.root.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.72, 8), roof, 0, 5.91, 0));

    const faceMaterial = new THREE.MeshStandardMaterial({
      color: "#fff0bf",
      emissive: "#ffb54d",
      emissiveIntensity: 0.04,
      roughness: 0.55
    });
    this.litMaterials.push(faceMaterial);
    const faceGeometry = new THREE.CircleGeometry(0.35, 24);
    const front = mesh(faceGeometry, faceMaterial, 0, 3.67, 0.586);
    const back = mesh(faceGeometry, faceMaterial, 0, 3.67, -0.586);
    back.rotation.y = Math.PI;
    const sideA = mesh(faceGeometry, faceMaterial, 0.586, 3.67, 0);
    sideA.rotation.y = Math.PI / 2;
    const sideB = mesh(faceGeometry, faceMaterial, -0.586, 3.67, 0);
    sideB.rotation.y = -Math.PI / 2;
    this.root.add(front, back, sideA, sideB);

    const handMaterial = standard("#495462");
    const hand = mesh(new THREE.BoxGeometry(0.035, 0.23, 0.025), handMaterial, 0.08, 3.74, 0.61);
    hand.rotation.z = -0.6;
    const handTwo = mesh(new THREE.BoxGeometry(0.03, 0.17, 0.025), handMaterial, -0.08, 3.61, 0.612);
    handTwo.rotation.z = 1.05;
    this.root.add(hand, handTwo);

    for (let level = 0; level < 4; level += 1) {
      const windowMaterial = new THREE.MeshStandardMaterial({
        color: "#39475d",
        emissive: "#ffcb68",
        emissiveIntensity: 0.03,
        roughness: 0.55
      });
      this.litMaterials.push(windowMaterial);
      const window = mesh(new THREE.BoxGeometry(0.2, 0.28, 0.018), windowMaterial, 0, 0.83 + level * 0.62, 0.425);
      this.root.add(window);
    }

    this.light = new THREE.PointLight("#ffca6d", 0, 7, 2);
    this.light.position.set(0, 3.5, 0.5);
    this.root.add(this.light);
  }

  setNight(level) {
    this.litMaterials.forEach((material) => {
      material.emissiveIntensity = 0.04 + level * 2.15;
    });
    this.light.intensity = level * 2.3;
  }
}

class LondonEye {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.position.set(-3.05, 0.38, -0.32);
    this.root.rotation.y = -0.24;
    parent.add(this.root);
    this.litMaterials = [];

    const steel = standard("#d8e6e9", { roughness: 0.35, metalness: 0.4 });
    const base = standard("#586573");
    const glow = new THREE.MeshStandardMaterial({
      color: "#e9f8ee",
      emissive: "#d8bb68",
      emissiveIntensity: 0.02,
      roughness: 0.35
    });
    this.litMaterials.push(glow);

    const leftLeg = mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.25, 6), base, -0.52, 1.07, 0);
    leftLeg.rotation.z = -0.37;
    const rightLeg = mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.25, 6), base, 0.52, 1.07, 0);
    rightLeg.rotation.z = 0.37;
    this.root.add(leftLeg, rightLeg);

    const wheel = mesh(new THREE.TorusGeometry(1.38, 0.09, 8, 36), glow, 0, 2.35, 0);
    this.root.add(wheel);
    const hub = mesh(new THREE.SphereGeometry(0.13, 12, 8), steel, 0, 2.35, 0.02);
    this.root.add(hub);

    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * TAU;
      const end = new THREE.Vector3(Math.cos(angle) * 1.27, 2.35 + Math.sin(angle) * 1.27, 0);
      addCylinderBetween(this.root, new THREE.Vector3(0, 2.35, 0), end, 0.018, steel);
      if (i % 2 === 0) {
        const cabin = mesh(new THREE.BoxGeometry(0.18, 0.17, 0.18), glow, Math.cos(angle) * 1.4, 2.35 + Math.sin(angle) * 1.4, 0);
        this.root.add(cabin);
      }
    }

    this.light = new THREE.PointLight("#ffe1a0", 0, 4, 1.8);
    this.light.position.set(0, 2.35, 0.45);
    this.root.add(this.light);
  }

  setNight(level) {
    this.litMaterials.forEach((material) => {
      material.emissiveIntensity = 0.02 + level * 1.8;
    });
    this.light.intensity = level * 1.25;
  }

  update(time) {
    this.root.rotation.z = Math.sin(time * 0.28) * 0.018;
  }
}

class TowerBridge {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.position.set(2.88, 0.4, -0.67);
    this.root.rotation.y = -0.08;
    this.root.scale.setScalar(0.86);
    parent.add(this.root);
    this.litMaterials = [];

    const stone = standard("#d1c7ae");
    const roof = standard("#596278", { roughness: 0.42, metalness: 0.16 });
    const deck = standard("#57657a", { roughness: 0.47, metalness: 0.2 });
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: "#f2df9d",
      emissive: "#ffc95e",
      emissiveIntensity: 0.02,
      roughness: 0.5
    });
    this.litMaterials.push(lightMaterial);

    this.root.add(mesh(new THREE.BoxGeometry(3.75, 0.18, 0.63), deck, 0, 0.86, 0));
    [-1.18, 1.18].forEach((x) => {
      this.root.add(mesh(new THREE.BoxGeometry(0.66, 2.42, 0.7), stone, x, 1.83, 0));
      const cap = mesh(new THREE.ConeGeometry(0.49, 0.67, 4), roof, x, 3.39, 0);
      cap.rotation.y = Math.PI / 4;
      this.root.add(cap);
      [-0.23, 0.23].forEach((offset) => {
        const window = mesh(new THREE.BoxGeometry(0.12, 0.18, 0.015), lightMaterial, x + offset, 1.85, 0.36);
        this.root.add(window);
      });
    });
    this.root.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 0.71), stone, 0, 2.48, 0));

    const cable = standard("#d9e4e2", { roughness: 0.4, metalness: 0.45 });
    const cablePoints = [
      [new THREE.Vector3(-1.18, 3.25, 0), new THREE.Vector3(0, 1.06, 0)],
      [new THREE.Vector3(1.18, 3.25, 0), new THREE.Vector3(0, 1.06, 0)],
      [new THREE.Vector3(-1.18, 3.25, 0), new THREE.Vector3(-2.0, 1.06, 0)],
      [new THREE.Vector3(1.18, 3.25, 0), new THREE.Vector3(2.0, 1.06, 0)]
    ];
    cablePoints.forEach((pair) => addCylinderBetween(this.root, pair[0], pair[1], 0.025, cable));

    this.light = new THREE.PointLight("#ffd783", 0, 5, 2);
    this.light.position.set(0, 2.4, 0.7);
    this.root.add(this.light);
  }

  setNight(level) {
    this.litMaterials.forEach((material) => {
      material.emissiveIntensity = 0.02 + level * 1.8;
    });
    this.light.intensity = level * 1.5;
  }
}

function mapleGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.46);
  shape.lineTo(0.11, 0.22);
  shape.lineTo(0.34, 0.31);
  shape.lineTo(0.25, 0.08);
  shape.lineTo(0.5, -0.03);
  shape.lineTo(0.17, -0.08);
  shape.lineTo(0.22, -0.36);
  shape.lineTo(0, -0.2);
  shape.lineTo(-0.22, -0.36);
  shape.lineTo(-0.17, -0.08);
  shape.lineTo(-0.5, -0.03);
  shape.lineTo(-0.25, 0.08);
  shape.lineTo(-0.34, 0.31);
  shape.lineTo(-0.11, 0.22);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

class WeatherParticlePool {
  constructor(scene, count) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.free = [];
    this.active = [];
    this.mode = "none";
    const leafGeometry = mapleGeometry();
    const snowGeometry = new THREE.IcosahedronGeometry(0.09, 1);
    const mistGeometry = new THREE.SphereGeometry(0.72, 10, 6);
    const leafColors = ["#d65d37", "#ec9d35", "#b9472e", "#f1bd55"];

    for (let i = 0; i < count; i += 1) {
      const node = new THREE.Group();
      const leaf = new THREE.Mesh(
        leafGeometry,
        new THREE.MeshBasicMaterial({
          color: leafColors[i % leafColors.length],
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide
        })
      );
      const snow = new THREE.Mesh(
        snowGeometry,
        new THREE.MeshBasicMaterial({ color: "#f3fbff", transparent: true, opacity: 0.87 })
      );
      const mist = new THREE.Mesh(
        mistGeometry,
        new THREE.MeshBasicMaterial({ color: "#d8eced", transparent: true, opacity: 0.12, depthWrite: false })
      );
      leaf.visible = false;
      snow.visible = false;
      mist.visible = false;
      node.visible = false;
      node.add(leaf, snow, mist);
      this.group.add(node);
      this.free.push({
        node,
        leaf,
        snow,
        mist,
        seed: Math.random() * TAU,
        speed: 0.6,
        drift: 0.4
      });
    }
  }

  activate(record, mode) {
    record.node.visible = true;
    record.leaf.visible = mode === "leaf";
    record.snow.visible = mode === "snow";
    record.mist.visible = mode === "mist";
    record.node.position.set(random(-7.2, 7.2), mode === "mist" ? random(0.6, 3.6) : random(0.7, 7.2), random(-5.2, 3.4));
    record.node.rotation.set(random(0, TAU), random(0, TAU), random(0, TAU));
    record.speed = mode === "snow" ? random(0.55, 1.15) : random(0.75, 1.55);
    record.drift = random(0.45, 1.3);
    const scale = mode === "mist" ? random(1.4, 3.3) : random(0.42, 1.05);
    record.node.scale.setScalar(scale);
  }

  release(record) {
    record.node.visible = false;
    this.free.push(record);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    while (this.active.length) this.release(this.active.pop());
    this.mode = mode;
  }

  update(delta, mode, time) {
    // Modes reuse the same prebuilt nodes; reaching the bottom only resets a node
    // at the top, so changing weather never allocates a new weather Mesh.
    this.setMode(mode);
    const wanted = mode === "leaf" ? 108 : mode === "snow" ? 124 : mode === "mist" ? 23 : 0;
    while (this.active.length < wanted && this.free.length) {
      const record = this.free.pop();
      this.activate(record, mode);
      this.active.push(record);
    }
    while (this.active.length > wanted) this.release(this.active.pop());

    this.active.forEach((record) => {
      const node = record.node;
      if (mode === "mist") {
        node.position.x += Math.sin(time * 0.35 + record.seed) * delta * 0.11;
        node.position.z += delta * 0.08;
        node.rotation.y += delta * 0.04;
        if (node.position.z > 4.2) this.activate(record, mode);
        return;
      }

      node.position.y -= record.speed * delta;
      node.position.x += Math.sin(time * 1.9 + record.seed + node.position.y) * record.drift * delta;
      node.position.z += Math.cos(time + record.seed) * delta * 0.09;
      node.rotation.x += delta * (mode === "leaf" ? 2.8 : 0.9);
      node.rotation.y += delta * (mode === "leaf" ? 1.8 : 0.5);
      if (node.position.y < -2.5 || Math.abs(node.position.x) > 8.5) this.activate(record, mode);
    });
  }
}

class SeasonWeatherSystem {
  constructor(scene) {
    this.pool = new WeatherParticlePool(scene, 140);
    this.from = SEASONS[0];
    this.to = SEASONS[0];
    this.fromIndex = 0;
    this.toIndex = 0;
    this.mix = 1;
    this.clock = 0;
    this.manualHold = 0;
  }

  setSeason(index, manual = false) {
    const next = SEASONS[index % SEASONS.length];
    if (next === this.to) return;
    this.from = this.mix < 0.5 ? this.from : this.to;
    this.fromIndex = this.mix < 0.5 ? this.fromIndex : this.toIndex;
    this.to = next;
    this.toIndex = index % SEASONS.length;
    this.mix = 0;
    if (manual) this.manualHold = 16;
  }

  update(delta, time) {
    this.clock += delta;
    this.manualHold = Math.max(0, this.manualHold - delta);
    // A manual choice temporarily owns the climate; otherwise the four-state
    // clock advances every ten seconds and interpolation provides the hand-off.
    if (this.manualHold === 0) {
      const index = Math.floor(this.clock / 10) % SEASONS.length;
      this.setSeason(index);
    }
    this.mix = Math.min(1, this.mix + delta / 1.75);
    const mode = this.mix < 0.55 ? this.from.particle : this.to.particle;
    this.pool.update(delta, mode, time);
  }

  get particleCount() {
    return this.pool.active.length;
  }
}

class DayNightCycle {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.13;
    this.dayColor = new THREE.Color();
    this.nightColor = new THREE.Color("#09152c");
    this.sunsetColor = new THREE.Color("#e78b65");
    this.fogColor = new THREE.Color();
    scene.background = this.nightColor.clone();
    this.ambient = new THREE.HemisphereLight("#f7e4bb", "#263a65", 1);
    this.directional = new THREE.DirectionalLight("#fff0bb", 2.3);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(1024, 1024);
    this.directional.shadow.camera.left = -11;
    this.directional.shadow.camera.right = 11;
    this.directional.shadow.camera.top = 11;
    this.directional.shadow.camera.bottom = -11;
    scene.add(this.ambient, this.directional);
    scene.fog = new THREE.FogExp2("#8eb9c2", 0.045);

    this.skyOrbit = new THREE.Group();
    scene.add(this.skyOrbit);
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.54, 20, 12), new THREE.MeshBasicMaterial({ color: "#ffe5a0" }));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 10), new THREE.MeshBasicMaterial({ color: "#dce9ff" }));
    this.skyOrbit.add(this.sun, this.moon);
  }

  update(delta, weather, landmarks) {
    // One normalized 15-second solar orbit drives all correlated visual state:
    // sky, fog, direct light, the two celestial bodies, and landmark lighting.
    this.time = (this.time + delta / 15) % 1;
    const angle = this.time * TAU;
    const height = Math.sin(angle);
    const daylight = smoothstep(-0.14, 0.34, height);
    const horizonGlow = Math.max(0, 1 - Math.abs(height) / 0.32) * (1 - daylight * 0.16);
    const nightLevel = 1 - smoothstep(0.04, 0.32, daylight);

    this.dayColor.lerpColors(weather.from.sky, weather.to.sky, weather.mix);
    this.scene.background.copy(this.nightColor).lerp(this.dayColor, daylight);
    this.scene.background.lerp(this.sunsetColor, horizonGlow * 0.42);
    this.fogColor.copy(this.scene.background).lerp(new THREE.Color("#dce8e8"), weather.from.fog * (1 - weather.mix) + weather.to.fog * weather.mix);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.fog.density = 0.014 + ((weather.from.fog * (1 - weather.mix) + weather.to.fog * weather.mix) * 0.4) + (1 - daylight) * 0.014;

    this.ambient.intensity = 0.2 + daylight * 1.05;
    this.ambient.color.set("#dfefff").lerp(new THREE.Color("#ffe5ae"), daylight);
    this.directional.intensity = 0.12 + daylight * (weather.from.warmth * (1 - weather.mix) + weather.to.warmth * weather.mix) * 2.1;
    this.directional.color.set("#8aa8e5").lerp(new THREE.Color("#fff0bb"), daylight);
    this.directional.position.set(Math.cos(angle) * 9, height * 10 + 2, Math.sin(angle) * 6);
    this.sun.position.copy(this.directional.position).multiplyScalar(0.88);
    this.moon.position.set(-this.sun.position.x, -this.sun.position.y + 2.2, -this.sun.position.z);
    this.sun.visible = height > -0.2;
    this.moon.visible = height < 0.3;

    landmarks.forEach((landmark) => landmark.setNight(nightLevel));
    if (daylight > 0.74) return "DAY";
    if (height > 0) return "DUSK";
    if (daylight < 0.18) return "NIGHT";
    return "DAWN";
  }
}

class DragOrbit {
  constructor(canvas, camera, target) {
    this.canvas = canvas;
    this.camera = camera;
    this.target = target;
    this.azimuth = 0.5;
    this.pitch = 0.2;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.radius = 14.2;
    canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      this.azimuth -= (event.clientX - this.lastX) * 0.012;
      this.pitch = clamp(this.pitch + (event.clientY - this.lastY) * 0.004, -0.16, 0.58);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });
    const stop = () => {
      this.dragging = false;
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  }

  update() {
    const horizontal = Math.cos(this.pitch) * this.radius;
    this.camera.position.set(
      Math.sin(this.azimuth) * horizontal,
      5.3 + Math.sin(this.pitch) * this.radius,
      Math.cos(this.azimuth) * horizontal
    );
    this.camera.lookAt(this.target);
  }
}

class LondonWorld {
  constructor() {
    this.canvas = document.querySelector("#scene");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.orbit = new DragOrbit(this.canvas, this.camera, new THREE.Vector3(0, 1.2, 0));
    this.island = new FloatingIsland(this.scene);
    this.bigBen = new BigBen(this.island.root);
    this.eye = new LondonEye(this.island.root);
    this.bridge = new TowerBridge(this.island.root);
    this.weather = new SeasonWeatherSystem(this.scene);
    this.cycle = new DayNightCycle(this.scene);
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.phaseElement = document.querySelector("#day-phase");
    this.seasonElement = document.querySelector("#season-name");
    this.particleElement = document.querySelector("#particle-count");

    this.addClouds();
    this.bindSeasonControls();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  addClouds() {
    this.clouds = new THREE.Group();
    this.scene.add(this.clouds);
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: "#f8fbff",
      transparent: true,
      opacity: 0.62,
      roughness: 0.92,
      flatShading: true
    });
    for (let i = 0; i < 14; i += 1) {
      const puff = mesh(new THREE.SphereGeometry(random(0.25, 0.6), 12, 8), cloudMaterial, random(-10, 10), random(4.5, 8.5), random(-8, 2));
      puff.scale.z = 0.65;
      this.clouds.add(puff);
    }
  }

  bindSeasonControls() {
    const buttons = [...document.querySelectorAll("[data-season]")];
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.season);
        this.weather.setSeason(index, true);
        buttons.forEach((item, itemIndex) => {
          const active = itemIndex === index;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
      });
    });
    window.addEventListener("keydown", (event) => {
      const key = Number(event.key);
      if (key >= 1 && key <= 4) {
        const button = buttons[key - 1];
        button.click();
      }
    });
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  frame() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    this.weather.update(delta, this.elapsed);
    this.island.update(this.elapsed, this.weather);
    this.eye.update(this.elapsed);
    const phase = this.cycle.update(delta, this.weather, [this.bigBen, this.eye, this.bridge]);
    this.clouds.rotation.y = this.elapsed * 0.008;
    this.clouds.children.forEach((cloud, index) => {
      cloud.position.y += Math.sin(this.elapsed * 0.2 + index) * delta * 0.04;
    });
    this.orbit.update();
    this.phaseElement.textContent = phase;
    this.seasonElement.textContent = this.weather.mix < 0.5 ? this.weather.from.label : this.weather.to.label;
    this.particleElement.textContent = this.weather.particleCount + " FX";
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.frame());
  }

  start() {
    this.frame();
  }
}

new LondonWorld().start();
