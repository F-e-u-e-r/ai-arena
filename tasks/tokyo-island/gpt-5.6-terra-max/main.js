import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const amount = clamp((value - from) / (to - from), 0, 1);
  return amount * amount * (3 - 2 * amount);
};
const random = (min, max) => min + Math.random() * (max - min);

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.74,
    metalness: 0,
    flatShading: true,
    ...options
  });
}

function makeMesh(geometry, mat, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, mat);
  part.position.set(x, y, z);
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function beamBetween(group, from, to, radius, mat) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const beam = makeMesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), mat);
  beam.position.copy(from).add(to).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(beam);
  return beam;
}

class Island {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.position.y = -0.48;
    scene.add(this.root);
    this.grass = material("#6da85b");
    this.dirt = material("#654750");
    this.rock = material("#8d6660");
    this.water = new THREE.MeshStandardMaterial({
      color: "#3482a7",
      roughness: 0.26,
      metalness: 0.15,
      transparent: true,
      opacity: 0.76
    });

    const lower = makeMesh(new THREE.ConeGeometry(4.7, 4.2, 10), this.dirt, 0, -2.05, 0);
    lower.rotation.x = Math.PI;
    this.root.add(lower);
    const ledge = makeMesh(new THREE.CylinderGeometry(4.7, 4.4, 0.45, 36), this.rock, 0, -0.08, 0);
    this.root.add(ledge);
    const lawn = makeMesh(new THREE.SphereGeometry(4.58, 32, 16), this.grass, 0, 0.16, 0);
    lawn.scale.y = 0.2;
    this.root.add(lawn);

    const pond = makeMesh(new THREE.CircleGeometry(1.7, 28), this.water, -0.5, 0.53, 1.1);
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(1.25, 0.58, 1);
    this.root.add(pond);
    this.pond = pond;

    this.addGardenTrees();
    this.addRocks();
  }

  addGardenTrees() {
    const trunk = material("#543f38");
    const colors = [material("#bd5d51"), material("#d7775a"), material("#ad4d59")];
    const positions = [
      [-3.34, 0.42, -0.48, 0.75],
      [-3.1, 0.42, 1.45, 0.56],
      [2.85, 0.42, 1.78, 0.64],
      [3.55, 0.42, 0.16, 0.49],
      [1.5, 0.42, -2.76, 0.5],
      [-1.7, 0.42, 2.78, 0.5]
    ];
    this.treeCrowns = [];
    positions.forEach((entry, index) => {
      const tree = new THREE.Group();
      tree.position.set(entry[0], entry[1], entry[2]);
      tree.scale.setScalar(entry[3]);
      tree.add(makeMesh(new THREE.CylinderGeometry(0.085, 0.14, 0.82, 6), trunk, 0, 0.38, 0));
      const crown = makeMesh(new THREE.DodecahedronGeometry(0.67, 0), colors[index % colors.length], 0, 0.88, 0);
      crown.scale.set(1.25, 0.9, 1);
      tree.add(crown);
      this.root.add(tree);
      this.treeCrowns.push(crown);
    });
  }

  addRocks() {
    for (let index = 0; index < 17; index += 1) {
      const angle = index / 17 * TAU;
      const radius = random(3.1, 4.2);
      const rock = makeMesh(
        new THREE.DodecahedronGeometry(random(0.1, 0.25), 0),
        index % 2 ? this.dirt : this.rock,
        Math.cos(angle) * radius,
        random(0.24, 0.38),
        Math.sin(angle) * radius
      );
      rock.rotation.set(random(0, 1), random(0, 1), random(0, 1));
      this.root.add(rock);
    }
  }

  update(time, daylight) {
    this.root.position.y = -0.48 + Math.sin(time * 0.82) * 0.16;
    this.root.rotation.z = Math.sin(time * 0.38) * 0.013;
    this.water.emissive.set("#0d2c62");
    this.water.emissiveIntensity = 0.05 + (1 - daylight) * 0.25;
    this.pond.rotation.z = time * 0.03;
    this.treeCrowns.forEach((crown, index) => {
      crown.rotation.y = Math.sin(time * 0.5 + index) * 0.08;
    });
  }
}

class TokyoTower {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.position.set(0.12, 0.4, -0.12);
    parent.add(this.root);
    this.litMaterials = [];
    const orange = material("#e65a3b", { roughness: 0.52, metalness: 0.18 });
    const cream = material("#fff2d0", { roughness: 0.62 });
    const base = material("#a84032", { roughness: 0.62 });
    const light = new THREE.MeshStandardMaterial({
      color: "#ffd579",
      emissive: "#ffba47",
      emissiveIntensity: 0.04,
      roughness: 0.38
    });
    this.litMaterials.push(light);

    const basePoints = [
      new THREE.Vector3(-0.72, 0, -0.72),
      new THREE.Vector3(0.72, 0, -0.72),
      new THREE.Vector3(-0.72, 0, 0.72),
      new THREE.Vector3(0.72, 0, 0.72)
    ];
    const waistPoints = [
      new THREE.Vector3(-0.28, 3.2, -0.28),
      new THREE.Vector3(0.28, 3.2, -0.28),
      new THREE.Vector3(-0.28, 3.2, 0.28),
      new THREE.Vector3(0.28, 3.2, 0.28)
    ];
    basePoints.forEach((point, index) => {
      beamBetween(this.root, point, waistPoints[index], 0.06, orange);
      this.root.add(makeMesh(new THREE.SphereGeometry(0.1, 8, 6), base, point.x, point.y + 0.05, point.z));
    });
    for (let level = 0; level < 5; level += 1) {
      const y = 0.55 + level * 0.53;
      const radius = 0.61 - level * 0.07;
      this.root.add(makeMesh(new THREE.BoxGeometry(radius * 2, 0.06, radius * 2), orange, 0, y, 0));
      const left = new THREE.Vector3(-radius, y, 0);
      const right = new THREE.Vector3(radius, y + 0.53, 0);
      beamBetween(this.root, left, right, 0.027, cream);
      beamBetween(this.root, new THREE.Vector3(radius, y, 0), new THREE.Vector3(-radius, y + 0.53, 0), 0.027, cream);
      beamBetween(this.root, new THREE.Vector3(0, y, -radius), new THREE.Vector3(0, y + 0.53, radius), 0.027, cream);
      beamBetween(this.root, new THREE.Vector3(0, y, radius), new THREE.Vector3(0, y + 0.53, -radius), 0.027, cream);
    }
    this.root.add(makeMesh(new THREE.CylinderGeometry(0.47, 0.47, 0.32, 8), cream, 0, 3.25, 0));
    this.root.add(makeMesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 8), orange, 0, 3.48, 0));
    this.root.add(makeMesh(new THREE.CylinderGeometry(0.075, 0.11, 2.3, 8), cream, 0, 4.68, 0));
    this.root.add(makeMesh(new THREE.ConeGeometry(0.08, 0.55, 8), orange, 0, 6.1, 0));

    for (let level = 0; level < 4; level += 1) {
      const window = makeMesh(new THREE.BoxGeometry(0.35, 0.055, 0.07), light, 0, 0.92 + level * 0.61, 0.64 - level * 0.065);
      this.root.add(window);
    }
    this.light = new THREE.PointLight("#ffb55d", 0, 7, 1.8);
    this.light.position.set(0, 3.8, 0.6);
    this.root.add(this.light);
  }

  setNight(level) {
    this.litMaterials.forEach((mat) => {
      mat.emissiveIntensity = 0.04 + level * 2.4;
    });
    this.light.intensity = level * 3.1;
  }
}

class MountFuji {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.position.set(-2.8, 0.36, -0.55);
    this.root.scale.setScalar(0.98);
    parent.add(this.root);
    const mountain = material("#586b91");
    const snow = material("#f3f3e8");
    this.root.add(makeMesh(new THREE.ConeGeometry(1.62, 2.18, 9), mountain, 0, 1.08, 0));
    const cap = makeMesh(new THREE.ConeGeometry(0.78, 0.68, 9), snow, 0, 2.2, 0);
    this.root.add(cap);
    const shrine = material("#d85642");
    const glow = new THREE.MeshStandardMaterial({
      color: "#ffd798",
      emissive: "#f8b74f",
      emissiveIntensity: 0.03,
      roughness: 0.55
    });
    this.litMaterials = [glow];
    const hut = new THREE.Group();
    hut.position.set(1.37, 0.27, 0.4);
    hut.add(makeMesh(new THREE.BoxGeometry(0.65, 0.38, 0.58), shrine, 0, 0.2, 0));
    hut.add(makeMesh(new THREE.ConeGeometry(0.53, 0.38, 4), material("#453951"), 0, 0.56, 0));
    hut.add(makeMesh(new THREE.BoxGeometry(0.16, 0.18, 0.015), glow, 0, 0.22, 0.3));
    this.root.add(hut);
    this.light = new THREE.PointLight("#ffc06c", 0, 3.5, 1.8);
    this.light.position.set(1.36, 0.8, 0.7);
    this.root.add(this.light);
  }

  setNight(level) {
    this.litMaterials.forEach((mat) => {
      mat.emissiveIntensity = 0.03 + level * 1.8;
    });
    this.light.intensity = level * 1.2;
  }
}

class ToriiGate {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.position.set(3.18, 0.4, -0.24);
    this.root.rotation.y = -0.22;
    parent.add(this.root);
    const vermilion = material("#de4b36", { roughness: 0.55 });
    const dark = material("#573647");
    const lamp = new THREE.MeshStandardMaterial({
      color: "#ffe2a3",
      emissive: "#ffbd59",
      emissiveIntensity: 0.03,
      roughness: 0.4
    });
    this.litMaterials = [lamp];
    [-0.75, 0.75].forEach((x) => {
      this.root.add(makeMesh(new THREE.CylinderGeometry(0.105, 0.12, 2.25, 8), vermilion, x, 1.12, 0));
      this.root.add(makeMesh(new THREE.CylinderGeometry(0.16, 0.13, 0.12, 8), dark, x, 2.25, 0));
      const lantern = makeMesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), lamp, x, 0.56, 0.25);
      this.root.add(lantern);
    });
    this.root.add(makeMesh(new THREE.BoxGeometry(2.1, 0.16, 0.25), vermilion, 0, 2.14, 0));
    const top = makeMesh(new THREE.BoxGeometry(2.42, 0.18, 0.33), vermilion, 0, 2.43, 0);
    top.rotation.z = -0.035;
    this.root.add(top);
    this.light = new THREE.PointLight("#ffbd67", 0, 3.5, 1.5);
    this.light.position.set(0, 1.1, 0.5);
    this.root.add(this.light);
  }

  setNight(level) {
    this.litMaterials.forEach((mat) => {
      mat.emissiveIntensity = 0.03 + level * 2;
    });
    this.light.intensity = level * 1.4;
  }
}

class Pagoda {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.position.set(1.6, 0.4, 2.0);
    this.root.rotation.y = 0.36;
    this.root.scale.setScalar(0.65);
    parent.add(this.root);
    const wood = material("#71423d");
    const roof = material("#3f394f");
    const glow = new THREE.MeshStandardMaterial({
      color: "#ffe0a3",
      emissive: "#ffb85b",
      emissiveIntensity: 0.02,
      roughness: 0.48
    });
    this.litMaterials = [glow];
    for (let level = 0; level < 3; level += 1) {
      const y = level * 0.7 + 0.34;
      const size = 1.2 - level * 0.18;
      this.root.add(makeMesh(new THREE.BoxGeometry(size, 0.52, size), wood, 0, y, 0));
      const roofPart = makeMesh(new THREE.ConeGeometry(size * 0.88, 0.34, 4), roof, 0, y + 0.42, 0);
      roofPart.rotation.y = Math.PI / 4;
      this.root.add(roofPart);
      this.root.add(makeMesh(new THREE.BoxGeometry(0.18, 0.23, 0.015), glow, 0, y, size * 0.51));
    }
    this.root.add(makeMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8), roof, 0, 2.45, 0));
    this.light = new THREE.PointLight("#ffcc79", 0, 3, 1.4);
    this.light.position.set(0, 1.4, 0.7);
    this.root.add(this.light);
  }

  setNight(level) {
    this.litMaterials.forEach((mat) => {
      mat.emissiveIntensity = 0.02 + level * 1.7;
    });
    this.light.intensity = level * 1.2;
  }
}

function mapleShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.5);
  shape.lineTo(0.11, 0.23);
  shape.lineTo(0.36, 0.36);
  shape.lineTo(0.27, 0.09);
  shape.lineTo(0.53, -0.03);
  shape.lineTo(0.18, -0.08);
  shape.lineTo(0.25, -0.4);
  shape.lineTo(0, -0.22);
  shape.lineTo(-0.25, -0.4);
  shape.lineTo(-0.18, -0.08);
  shape.lineTo(-0.53, -0.03);
  shape.lineTo(-0.27, 0.09);
  shape.lineTo(-0.36, 0.36);
  shape.lineTo(-0.11, 0.23);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

class MapleLeafSystem {
  constructor(scene, count) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.active = [];
    this.free = [];
    this.time = 0;
    const shape = mapleShape();
    const colors = ["#d64d3b", "#e77d3d", "#f1b14e", "#b93948", "#ef5b3f"];
    for (let index = 0; index < count; index += 1) {
      const node = new THREE.Group();
      const leaf = new THREE.Mesh(
        shape,
        new THREE.MeshBasicMaterial({
          color: colors[index % colors.length],
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.94
        })
      );
      node.visible = false;
      node.add(leaf);
      this.root.add(node);
      this.free.push({
        node,
        seed: random(0, TAU),
        speed: 1,
        sway: 1,
        spin: 1
      });
    }
    this.setCount(136);
  }

  activate(item) {
    item.node.visible = true;
    item.node.position.set(random(-7.4, 7.4), random(0.5, 8), random(-6.5, 3.6));
    item.node.rotation.set(random(0, TAU), random(0, TAU), random(0, TAU));
    item.speed = random(0.72, 1.65);
    item.sway = random(0.45, 1.45);
    item.spin = random(1.1, 3.4);
    item.node.scale.setScalar(random(0.32, 0.85));
  }

  setCount(count) {
    while (this.active.length < count && this.free.length) {
      const item = this.free.pop();
      this.activate(item);
      this.active.push(item);
    }
    while (this.active.length > count) {
      const item = this.active.pop();
      item.node.visible = false;
      this.free.push(item);
    }
  }

  update(delta, time) {
    this.time = time;
    // Every leaf stays in the active pool. Its seed gives a different fall,
    // spin and side-to-side sway; out-of-view leaves are reset in place.
    this.active.forEach((item) => {
      const node = item.node;
      node.position.y -= item.speed * delta;
      node.position.x += Math.sin(time * 1.8 + item.seed + node.position.y) * item.sway * delta;
      node.position.z += Math.cos(time * 0.8 + item.seed) * delta * 0.16;
      node.rotation.x += item.spin * delta;
      node.rotation.y += item.spin * 0.67 * delta;
      node.rotation.z = Math.sin(time * 1.7 + item.seed) * 0.9;
      if (node.position.y < -2.5 || Math.abs(node.position.x) > 8.5) this.activate(item);
    });
  }
}

class DayNightCycle {
  constructor(scene) {
    this.scene = scene;
    this.progress = 0.07;
    this.night = new THREE.Color("#0a1233");
    this.day = new THREE.Color("#8ac7e6");
    this.dusk = new THREE.Color("#ed8d72");
    this.fogColor = new THREE.Color();
    scene.background = this.night.clone();
    this.ambient = new THREE.HemisphereLight("#f7dcbe", "#202454", 1);
    this.sunLight = new THREE.DirectionalLight("#fff0b8", 2.3);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.left = -11;
    this.sunLight.shadow.camera.right = 11;
    this.sunLight.shadow.camera.top = 11;
    this.sunLight.shadow.camera.bottom = -11;
    scene.add(this.ambient, this.sunLight);
    scene.fog = new THREE.FogExp2("#8cc0d3", 0.03);

    this.orbit = new THREE.Group();
    scene.add(this.orbit);
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), new THREE.MeshBasicMaterial({ color: "#ffe7a3" }));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 10), new THREE.MeshBasicMaterial({ color: "#e6edff" }));
    this.orbit.add(this.sun, this.moon);
  }

  update(delta, landmarks) {
    // A signed sun height from the 15-second orbit is smoothly remapped into
    // the renderer's sky, fog, lights, sun/moon visibility and night lamps.
    this.progress = (this.progress + delta / 15) % 1;
    const angle = this.progress * TAU;
    const sunHeight = Math.sin(angle);
    const daylight = smoothstep(-0.17, 0.33, sunHeight);
    const sunset = Math.max(0, 1 - Math.abs(sunHeight) / 0.31) * (1 - daylight * 0.14);
    const nightLevel = 1 - smoothstep(0.05, 0.36, daylight);

    this.scene.background.copy(this.night).lerp(this.day, daylight).lerp(this.dusk, sunset * 0.48);
    this.fogColor.copy(this.scene.background).lerp(new THREE.Color("#c9dff2"), daylight * 0.35);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.fog.density = 0.016 + (1 - daylight) * 0.015;
    this.ambient.intensity = 0.2 + daylight * 1.08;
    this.ambient.color.set("#b8ccff").lerp(new THREE.Color("#ffe5b3"), daylight);
    this.sunLight.intensity = 0.1 + daylight * 2.35;
    this.sunLight.color.set("#98a9ed").lerp(new THREE.Color("#fff1b7"), daylight);
    this.sunLight.position.set(Math.cos(angle) * 10, sunHeight * 10 + 2.5, Math.sin(angle) * 6);
    this.sun.position.copy(this.sunLight.position).multiplyScalar(0.9);
    this.moon.position.set(-this.sun.position.x, -this.sun.position.y + 2, -this.sun.position.z);
    this.sun.visible = sunHeight > -0.22;
    this.moon.visible = sunHeight < 0.27;
    landmarks.forEach((landmark) => landmark.setNight(nightLevel));

    let phase = "DAY";
    if (daylight < 0.18) phase = "NIGHT";
    else if (sunHeight > 0 && daylight < 0.8) phase = "DUSK";
    else if (sunHeight <= 0) phase = "DAWN";
    return { phase, daylight };
  }
}

class DragOrbit {
  constructor(canvas, camera, target) {
    this.canvas = canvas;
    this.camera = camera;
    this.target = target;
    this.azimuth = 0.46;
    this.pitch = 0.18;
    this.radius = 14.1;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      this.azimuth -= (event.clientX - this.lastX) * 0.012;
      this.pitch = clamp(this.pitch + (event.clientY - this.lastY) * 0.004, -0.17, 0.56);
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
    const distance = Math.cos(this.pitch) * this.radius;
    this.camera.position.set(
      Math.sin(this.azimuth) * distance,
      5.25 + Math.sin(this.pitch) * this.radius,
      Math.cos(this.azimuth) * distance
    );
    this.camera.lookAt(this.target);
  }
}

class TokyoWorld {
  constructor() {
    this.canvas = document.querySelector("#scene");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.orbit = new DragOrbit(this.canvas, this.camera, new THREE.Vector3(0, 1.3, 0));
    this.island = new Island(this.scene);
    this.tower = new TokyoTower(this.island.root);
    this.fuji = new MountFuji(this.island.root);
    this.torii = new ToriiGate(this.island.root);
    this.pagoda = new Pagoda(this.island.root);
    this.maples = new MapleLeafSystem(this.scene, 150);
    this.cycle = new DayNightCycle(this.scene);
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.timeScale = 1;
    this.phaseElement = document.querySelector("#day-phase");
    this.leafElement = document.querySelector("#leaf-count");
    this.timeButton = document.querySelector("#time-button");

    this.addClouds();
    this.bindControls();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  addClouds() {
    this.clouds = new THREE.Group();
    this.scene.add(this.clouds);
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: "#f7ecf4",
      transparent: true,
      opacity: 0.56,
      roughness: 0.9,
      flatShading: true
    });
    for (let index = 0; index < 17; index += 1) {
      const puff = makeMesh(
        new THREE.SphereGeometry(random(0.24, 0.63), 12, 8),
        cloudMaterial,
        random(-10, 10),
        random(4.6, 8.7),
        random(-8, 2.5)
      );
      puff.scale.z = 0.62;
      this.clouds.add(puff);
    }
  }

  bindControls() {
    this.timeButton.addEventListener("click", () => {
      this.timeScale = this.timeScale === 1 ? 4 : 1;
      this.timeButton.textContent = "TIME ×" + this.timeScale;
      this.timeButton.classList.toggle("fast", this.timeScale > 1);
    });
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "t") this.timeButton.click();
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
    this.maples.update(delta, this.elapsed);
    const cycle = this.cycle.update(delta * this.timeScale, [this.tower, this.fuji, this.torii, this.pagoda]);
    this.island.update(this.elapsed, cycle.daylight);
    this.clouds.rotation.y = this.elapsed * 0.008;
    this.clouds.children.forEach((cloud, index) => {
      cloud.position.y += Math.sin(this.elapsed * 0.18 + index) * delta * 0.035;
    });
    this.orbit.update();
    this.phaseElement.textContent = cycle.phase;
    this.leafElement.textContent = this.maples.active.length + " MAPLES";
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.frame());
  }

  start() {
    this.frame();
  }
}

new TokyoWorld().start();
