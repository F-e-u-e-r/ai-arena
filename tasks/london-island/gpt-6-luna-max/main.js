import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_NAMES = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];
const SEASON_PALETTES = [
  {
    skyTop: '#58a9cd', skyHorizon: '#d6efdf', fog: '#c9e4df', nightTop: '#1b3b64', nightHorizon: '#586f91',
    ambient: '#d4eee8', sun: '#fff0cf', grass: '#7cc781', river: '#69c9d2', cloud: '#f7fff5',
    sunset: '#ffd29d', fogDensity: 0.009, ambientPower: 0.88, sunPower: 1.22
  },
  {
    skyTop: '#369bd0', skyHorizon: '#a8e4e0', fog: '#b6dfe0', nightTop: '#1a365f', nightHorizon: '#596f94',
    ambient: '#fff0cf', sun: '#fff0b1', grass: '#69b95c', river: '#53c3dc', cloud: '#fffefa',
    sunset: '#ffbc77', fogDensity: 0.0035, ambientPower: 1.08, sunPower: 1.55
  },
  {
    skyTop: '#547f9e', skyHorizon: '#f0c08a', fog: '#e7c5a5', nightTop: '#172b52', nightHorizon: '#645a7d',
    ambient: '#f0d0ae', sun: '#ffd18d', grass: '#b0b96a', river: '#69b8c3', cloud: '#fff0dc',
    sunset: '#ff985e', fogDensity: 0.0055, ambientPower: 0.88, sunPower: 1.18
  },
  {
    skyTop: '#5d85ad', skyHorizon: '#d7e6eb', fog: '#c6d9df', nightTop: '#172747', nightHorizon: '#51627f',
    ambient: '#d3e0ef', sun: '#ffdfb3', grass: '#a9c6ac', river: '#74bbd0', cloud: '#f8fbff',
    sunset: '#ffc99a', fogDensity: 0.005, ambientPower: 0.8, sunPower: 1.08
  }
];
const PALETTE_COLORS = SEASON_PALETTES.map((palette) => {
  const cached = {};
  for (const [key, value] of Object.entries(palette)) {
    if (typeof value === 'string') cached[key] = new THREE.Color(value);
  }
  return cached;
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const color = (value) => new THREE.Color(value);

function blendPalette(weights, key) {
  const result = new THREE.Color(0, 0, 0);
  for (let i = 0; i < SEASON_PALETTES.length; i += 1) {
    const source = PALETTE_COLORS[i][key];
    result.r += source.r * weights[i];
    result.g += source.g * weights[i];
    result.b += source.b * weights[i];
  }
  return result;
}

function makeMaterial(tint, options = {}) {
  return new THREE.MeshToonMaterial({ color: tint, ...options });
}

function addMesh(parent, geometry, material, position, rotation = null, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBeam(parent, start, end, radius, material, radialSegments = 7) {
  const a = new THREE.Vector3(start[0], start[1], start[2]);
  const b = new THREE.Vector3(end[0], end[1], end[2]);
  const direction = new THREE.Vector3().subVectors(b, a);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments), material);
  beam.position.copy(a).add(b).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  beam.castShadow = true;
  beam.receiveShadow = true;
  parent.add(beam);
  return beam;
}

function addLine(parent, points, material, radius = 0.018) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point[0], point[1], point[2])));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 8), radius, 5, false), material);
  tube.castShadow = false;
  tube.receiveShadow = true;
  parent.add(tube);
  return tube;
}

class Island {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Floating island';
    scene.add(this.group);
    this.grassMaterial = makeMaterial('#7cc781');
    this.riverMaterial = makeMaterial('#69c9d2', { roughness: 0.33, metalness: 0.05 });
    this.cloudMaterial = makeMaterial('#f7fff5', { transparent: true, opacity: 0.67, depthWrite: false });
    this.mistMaterial = makeMaterial('#f2fff7', { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.lampMaterials = [];
    this.pointLights = [];
    this._buildLand();
    this._buildRiver();
    this._buildTown();
    this._buildTreesAndFlowers();
    this._buildCloudsAndMist();
    this.bigBen = this._buildBigBen();
    this.eye = this._buildLondonEye();
    this.bridge = this._buildTowerBridge();
  }

  _buildLand() {
    const soil = makeMaterial('#bd8151');
    const soilLight = makeMaterial('#dcaa69');
    const rock = makeMaterial('#9c674d');
    addMesh(this.group, new THREE.CylinderGeometry(5.55, 3.05, 2.65, 12, 1), soil, [0, -1.34, 0]);
    addMesh(this.group, new THREE.CylinderGeometry(5.56, 5.48, 0.16, 12), soilLight, [0, -0.12, 0]);
    addMesh(this.group, new THREE.CylinderGeometry(3.8, 2.65, 0.75, 10, 1), rock, [0, -2.84, 0]);
    addMesh(this.group, new THREE.ConeGeometry(1.75, 1.15, 9), soil, [0.1, -3.62, -0.05]);
    const grassTop = addMesh(this.group, new THREE.CircleGeometry(5.58, 12), this.grassMaterial, [0, 0.012, 0], [-Math.PI / 2, 0, 0]);
    grassTop.receiveShadow = true;

    const strataMaterial = makeMaterial('#e1ab68');
    const strata = [
      [5.02, -0.55, 0.13], [4.55, -1.12, 0.11], [4.00, -1.70, 0.10], [3.50, -2.20, 0.09]
    ];
    for (const [radius, y, tube] of strata) {
      const ring = addMesh(this.group, new THREE.TorusGeometry(radius, tube, 5, 36), strataMaterial, [0, y, 0], [Math.PI / 2, 0, 0]);
      ring.castShadow = false;
    }

    const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
    for (let i = 0; i < 21; i += 1) {
      const angle = (i / 21) * Math.PI * 2;
      const y = -1.65 - (i % 4) * 0.34;
      const radius = 3.45 - (i % 4) * 0.25;
      const pebble = addMesh(this.group, rockGeo, i % 3 === 0 ? soilLight : rock,
        [Math.cos(angle) * radius, y, Math.sin(angle) * radius], [i * 0.4, i * 0.71, i * 0.2], [0.65 + (i % 3) * 0.12, 0.65, 0.72]);
      pebble.castShadow = true;
    }

    const vineMat = makeMaterial('#578958');
    for (let i = 0; i < 9; i += 1) {
      const a = i * (Math.PI * 2 / 9) + 0.14;
      const x = Math.cos(a) * 5.22;
      const z = Math.sin(a) * 5.22;
      addLine(this.group, [[x, -0.08, z], [x * 0.96, -0.66, z * 0.96], [x * 0.83, -1.06 - (i % 3) * 0.18, z * 0.83]], vineMat, 0.026);
    }
  }

  _buildRiver() {
    const water = new THREE.Shape();
    water.moveTo(-4.35, 2.45);
    water.quadraticCurveTo(-3.35, 1.9, -2.4, 2.2);
    water.quadraticCurveTo(-1.35, 2.58, -0.45, 2.87);
    water.quadraticCurveTo(0.55, 3.18, 1.35, 3.53);
    water.lineTo(1.78, 3.96);
    water.quadraticCurveTo(0.6, 3.65, -0.58, 3.31);
    water.quadraticCurveTo(-1.7, 2.98, -2.55, 2.65);
    water.quadraticCurveTo(-3.5, 2.35, -4.62, 2.84);
    water.closePath();
    const river = addMesh(this.group, new THREE.ShapeGeometry(water, 14), this.riverMaterial, [0, 0.035, 0], [Math.PI / 2, 0, 0]);
    river.castShadow = false;
    river.receiveShadow = false;
    const glint = makeMaterial('#c5fff0', { transparent: true, opacity: 0.5 });
    addLine(this.group, [[-3.6, 0.047, 2.42], [-2.4, 0.05, 2.47], [-1.05, 0.05, 2.92], [0.1, 0.05, 3.36], [1.0, 0.05, 3.6]], glint, 0.022);
  }

  _buildTown() {
    const houses = [
      [-3.65, -2.5, '#f1d29f', '#d77d6a', 0.82],
      [-2.8, -3.35, '#f5dfb9', '#638d9e', 0.72],
      [3.72, -2.65, '#e9c58e', '#c87561', 0.78],
      [4.05, -1.68, '#f4d7ad', '#6b969f', 0.59]
    ];
    for (const house of houses) this._addHouse(house[0], house[1], house[2], house[3], house[4]);
  }

  _addHouse(x, z, wallColor, roofColor, scale) {
    const group = new THREE.Group();
    group.position.set(x, 0.02, z);
    group.scale.setScalar(scale);
    this.group.add(group);
    const wall = makeMaterial(wallColor);
    const roof = makeMaterial(roofColor);
    addMesh(group, new THREE.BoxGeometry(0.72, 0.66, 0.65), wall, [0, 0.35, 0]);
    addMesh(group, new THREE.ConeGeometry(0.58, 0.53, 4), roof, [0, 0.91, 0], [0, Math.PI / 4, 0]);
    const door = makeMaterial('#7b5a4b');
    addMesh(group, new THREE.BoxGeometry(0.17, 0.34, 0.035), door, [0, 0.18, 0.34]);
    const windowMat = makeMaterial('#bce9ed', { emissive: '#518b94', emissiveIntensity: 0.12 });
    addMesh(group, new THREE.BoxGeometry(0.13, 0.16, 0.035), windowMat, [-0.21, 0.48, 0.34]);
    addMesh(group, new THREE.BoxGeometry(0.13, 0.16, 0.035), windowMat, [0.21, 0.48, 0.34]);
  }

  _buildTreesAndFlowers() {
    const trunkMat = makeMaterial('#87583c');
    const canopyMats = [makeMaterial('#559d63'), makeMaterial('#70b96e'), makeMaterial('#4f8d65')];
    const treePoints = [
      [-4.42, -0.55], [-4.0, 0.7], [-3.55, 3.45], [-1.85, -4.2], [0.5, -4.35],
      [3.75, -3.75], [4.55, -0.55], [4.0, 1.0], [-4.4, 1.75], [0.7, 4.15]
    ];
    for (let i = 0; i < treePoints.length; i += 1) {
      const [x, z] = treePoints[i];
      const size = 0.62 + (i % 4) * 0.08;
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      this.group.add(tree);
      addMesh(tree, new THREE.CylinderGeometry(0.07, 0.11, size * 0.92, 7), trunkMat, [0, size * 0.42, 0]);
      addMesh(tree, new THREE.IcosahedronGeometry(size * 0.52, 1), canopyMats[i % canopyMats.length], [0, size * 0.95, 0]);
      addMesh(tree, new THREE.IcosahedronGeometry(size * 0.39, 1), canopyMats[(i + 1) % canopyMats.length], [size * 0.29, size * 1.14, 0.02]);
    }

    const stem = makeMaterial('#477f57');
    const flowerColors = ['#ffdf7c', '#ed8f9c', '#f9f4d1', '#a5a5e9'];
    for (let i = 0; i < 32; i += 1) {
      const angle = i * 2.399963;
      const radius = 3.95 + (i % 5) * 0.22;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.abs(x + 0.7) < 1.1 && z < 1.8 && z > -1.8) continue;
      if (x > 0.3 && z > 1.6 && z < 3.1) continue;
      const flower = new THREE.Group();
      flower.position.set(x, 0.03, z);
      this.group.add(flower);
      addMesh(flower, new THREE.CylinderGeometry(0.012, 0.016, 0.18, 5), stem, [0, 0.09, 0]);
      const petalMat = makeMaterial(flowerColors[i % flowerColors.length]);
      addMesh(flower, new THREE.SphereGeometry(0.065, 7, 6), petalMat, [0, 0.2, 0]);
    }
  }

  _buildCloudsAndMist() {
    this.clouds = [];
    const cloudPositions = [[-8, 8.3, -8], [6.8, 9.7, -12], [10, 5.9, -14], [-10.5, 5.5, -12]];
    for (let i = 0; i < cloudPositions.length; i += 1) {
      const cloud = new THREE.Group();
      cloud.position.set(cloudPositions[i][0], cloudPositions[i][1], cloudPositions[i][2]);
      const puffs = [[0, 0, 0, 1.1], [0.8, 0.12, 0, 0.8], [-0.8, 0.06, 0, 0.72], [0.2, 0.42, 0, 0.72]];
      for (const puff of puffs) {
        const puffMesh = addMesh(cloud, new THREE.SphereGeometry(puff[3], 12, 10), this.cloudMaterial, [puff[0], puff[1], puff[2]], null, [1.35, 0.62, 0.78]);
        puffMesh.castShadow = false;
        puffMesh.receiveShadow = false;
      }
      this.group.add(cloud);
      this.clouds.push({ group: cloud, homeX: cloud.position.x, homeY: cloud.position.y, phase: i * 1.7 });
    }

    this.mist = [];
    for (let i = 0; i < 6; i += 1) {
      const wisp = addMesh(this.group, new THREE.SphereGeometry(1, 16, 10), this.mistMaterial,
        [-4.8 + i * 1.8, 0.3 + (i % 2) * 0.17, 2.1 + (i % 3) * 0.48], null,
        [1.25 + (i % 2) * 0.35, 0.16, 0.55]);
      wisp.castShadow = false;
      wisp.receiveShadow = false;
      this.mist.push({ mesh: wisp, phase: i * 1.31, homeX: wisp.position.x });
    }
  }

  _buildBigBen() {
    const tower = new THREE.Group();
    tower.position.set(-0.94, 0.02, -0.2);
    tower.rotation.y = 0.08;
    this.group.add(tower);
    const stone = makeMaterial('#edc68a');
    const stoneLight = makeMaterial('#ffe0a9');
    const trim = makeMaterial('#bd8858');
    const roof = makeMaterial('#4e7776');
    const dark = makeMaterial('#43545c');
    const clockFace = makeMaterial('#fff3cc', { emissive: '#f8bf65', emissiveIntensity: 0 });
    const clockRim = makeMaterial('#a26a40', { emissive: '#ffb955', emissiveIntensity: 0 });
    const handMat = makeMaterial('#4f5151', { emissive: '#ffc86d', emissiveIntensity: 0 });
    this.lampMaterials.push(clockFace, clockRim, handMat);

    addMesh(tower, new THREE.BoxGeometry(1.08, 0.3, 1.08), trim, [0, 0.15, 0]);
    addMesh(tower, new THREE.BoxGeometry(0.78, 3.2, 0.78), stone, [0, 1.9, 0]);
    addMesh(tower, new THREE.BoxGeometry(0.9, 0.2, 0.9), stoneLight, [0, 3.45, 0]);
    addMesh(tower, new THREE.BoxGeometry(0.92, 0.94, 0.92), stoneLight, [0, 4.02, 0]);
    addMesh(tower, new THREE.BoxGeometry(1.08, 0.17, 1.08), trim, [0, 4.55, 0]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addMesh(tower, new THREE.BoxGeometry(0.12, 3.0, 0.12), stoneLight, [sx * 0.34, 1.85, sz * 0.34]);
        addMesh(tower, new THREE.BoxGeometry(0.11, 0.5, 0.11), trim, [sx * 0.4, 4.68, sz * 0.4]);
      }
    }
    const roofShape = new THREE.ConeGeometry(0.57, 1.18, 8);
    addMesh(tower, roofShape, roof, [0, 5.18, 0], [0, Math.PI / 8, 0]);
    addMesh(tower, new THREE.ConeGeometry(0.18, 0.52, 8), dark, [0, 6.0, 0]);
    addMesh(tower, new THREE.SphereGeometry(0.1, 10, 8), makeMaterial('#f8d487'), [0, 6.28, 0]);

    for (const side of ['front', 'back', 'left', 'right']) {
      const faceGroup = new THREE.Group();
      faceGroup.position.set(0, 4.02, side === 'front' ? 0.474 : side === 'back' ? -0.474 : 0);
      if (side === 'back') faceGroup.rotation.y = Math.PI;
      if (side === 'left') { faceGroup.position.set(-0.474, 4.02, 0); faceGroup.rotation.y = -Math.PI / 2; }
      if (side === 'right') { faceGroup.position.set(0.474, 4.02, 0); faceGroup.rotation.y = Math.PI / 2; }
      tower.add(faceGroup);
      addMesh(faceGroup, new THREE.CylinderGeometry(0.32, 0.32, 0.045, 32), clockFace, [0, 0, 0], [Math.PI / 2, 0, 0]);
      const bezel = addMesh(faceGroup, new THREE.TorusGeometry(0.32, 0.035, 7, 32), clockRim, [0, 0, 0.035]);
      bezel.rotation.z = 0;
      addMesh(faceGroup, new THREE.SphereGeometry(0.035, 8, 7), clockRim, [0, 0, 0.04]);
      for (let mark = 0; mark < 12; mark += 1) {
        const a = mark * Math.PI / 6;
        addMesh(faceGroup, new THREE.SphereGeometry(0.018, 6, 5), clockRim, [Math.sin(a) * 0.25, Math.cos(a) * 0.25, 0.04]);
      }
      const minute = addMesh(faceGroup, new THREE.BoxGeometry(0.018, 0.22, 0.015), handMat, [0, 0.075, 0.052]);
      const hour = addMesh(faceGroup, new THREE.BoxGeometry(0.026, 0.15, 0.018), handMat, [0.025, -0.025, 0.055]);
      minute.rotation.z = 0.15;
      hour.rotation.z = -0.78;
    }

    const clockLamp = new THREE.PointLight('#ffc875', 0, 5, 2);
    clockLamp.position.set(0, 4.0, 0.7);
    tower.add(clockLamp);
    this.pointLights.push(clockLamp);
    for (let y = 0.9; y < 3.2; y += 0.72) {
      for (const x of [-0.24, 0.24]) {
        addMesh(tower, new THREE.BoxGeometry(0.075, 0.12, 0.025), makeMaterial('#93b6b2'), [x, y, 0.402]);
      }
    }
    return tower;
  }

  _buildLondonEye() {
    const group = new THREE.Group();
    group.position.set(2.78, 0.03, -1.52);
    group.rotation.y = -0.05;
    this.group.add(group);
    const steel = makeMaterial('#537c83');
    const steelLight = makeMaterial('#9ac0bd');
    const deck = makeMaterial('#597a75');
    const wheel = new THREE.Group();
    wheel.position.set(0, 2.0, 0);
    group.add(wheel);
    const ring = addMesh(wheel, new THREE.TorusGeometry(1.24, 0.075, 8, 64), steel, [0, 0, 0]);
    ring.castShadow = true;
    addMesh(wheel, new THREE.TorusGeometry(1.12, 0.025, 5, 64), steelLight, [0, 0, 0]);
    addMesh(wheel, new THREE.SphereGeometry(0.17, 16, 12), makeMaterial('#e8d09e'), [0, 0, 0.03]);
    for (let i = 0; i < 16; i += 1) {
      const a = i * Math.PI * 2 / 16;
      addBeam(wheel, [0, 0, 0], [Math.cos(a) * 1.18, Math.sin(a) * 1.18, 0], 0.019, steelLight, 5);
    }
    const cabinMat = makeMaterial('#f4dca7', { emissive: '#ffba62', emissiveIntensity: 0 });
    const cabinAccent = makeMaterial('#d47763', { emissive: '#ff9c55', emissiveIntensity: 0 });
    this.lampMaterials.push(cabinMat, cabinAccent);
    const cabins = [];
    for (let i = 0; i < 12; i += 1) {
      const a = i * Math.PI * 2 / 12;
      const cabin = new THREE.Group();
      cabin.position.set(Math.cos(a) * 1.24, Math.sin(a) * 1.24, 0.035);
      wheel.add(cabin);
      addMesh(cabin, new THREE.BoxGeometry(0.16, 0.23, 0.13), i % 3 === 0 ? cabinAccent : cabinMat, [0, -0.025, 0]);
      addMesh(cabin, new THREE.BoxGeometry(0.17, 0.035, 0.15), steel, [0, 0.1, 0]);
      cabins.push(cabin);
    }

    addMesh(group, new THREE.BoxGeometry(3.1, 0.18, 0.52), deck, [0, 0.2, 0]);
    addBeam(group, [-0.9, 0.18, 0], [-0.14, 1.98, 0], 0.08, steel, 8);
    addBeam(group, [0.9, 0.18, 0], [0.14, 1.98, 0], 0.08, steel, 8);
    addBeam(group, [-0.6, 0.2, 0], [0.04, 1.97, 0], 0.045, steelLight, 7);
    addBeam(group, [0.6, 0.2, 0], [-0.04, 1.97, 0], 0.045, steelLight, 7);
    for (const x of [-1.3, 1.3]) {
      addMesh(group, new THREE.SphereGeometry(0.07, 8, 6), makeMaterial('#ffdda0', { emissive: '#ffad4f', emissiveIntensity: 0 }), [x, 0.34, 0.1]);
      const light = new THREE.PointLight('#ffc56f', 0, 2.2, 2);
      light.position.set(x, 0.5, 0.1);
      group.add(light);
      this.pointLights.push(light);
    }
    const lamp = new THREE.PointLight('#ffbb69', 0, 4, 2);
    lamp.position.set(0, 2.0, 0.3);
    group.add(lamp);
    this.pointLights.push(lamp);
    this.eyeWheel = wheel;
    this.eyeCabins = cabins;
    return group;
  }

  _buildTowerBridge() {
    const group = new THREE.Group();
    group.position.set(2.16, 0.02, 2.1);
    group.rotation.y = -0.06;
    this.group.add(group);
    const stone = makeMaterial('#90aaa1');
    const stoneLight = makeMaterial('#c8d0b0');
    const roof = makeMaterial('#557c80');
    const deck = makeMaterial('#596f70');
    const archMat = makeMaterial('#436267');
    addMesh(group, new THREE.BoxGeometry(3.48, 0.2, 0.56), deck, [0, 0.4, 0]);

    for (const x of [-1.12, 1.12]) {
      addMesh(group, new THREE.BoxGeometry(0.56, 1.27, 0.55), stone, [x, 0.98, 0]);
      addMesh(group, new THREE.BoxGeometry(0.66, 0.16, 0.64), stoneLight, [x, 1.65, 0]);
      addMesh(group, new THREE.ConeGeometry(0.42, 0.47, 4), roof, [x, 1.98, 0], [0, Math.PI / 4, 0]);
      addMesh(group, new THREE.BoxGeometry(0.14, 0.34, 0.04), makeMaterial('#637e7d'), [x, 0.98, 0.29]);
      addMesh(group, new THREE.BoxGeometry(0.13, 0.18, 0.045), makeMaterial('#ffe2a2', { emissive: '#ffb64d', emissiveIntensity: 0 }), [x, 0.66, 0.3]);
      const lamp = new THREE.PointLight('#ffbf76', 0, 2.8, 2);
      lamp.position.set(x, 0.86, 0.55);
      group.add(lamp);
      this.pointLights.push(lamp);
    }

    addBeam(group, [-0.84, 1.58, 0.03], [0.84, 1.58, 0.03], 0.045, stoneLight, 7);
    addLine(group, [[-1.12, 1.63, 0.08], [-0.74, 1.22, 0.08], [-0.35, 1.0, 0.08], [0, 0.96, 0.08], [0.35, 1.0, 0.08], [0.74, 1.22, 0.08], [1.12, 1.63, 0.08]], stoneLight, 0.045);
    addLine(group, [[-1.12, 1.52, -0.12], [-0.76, 1.13, -0.12], [-0.36, 0.94, -0.12], [0, 0.9, -0.12], [0.36, 0.94, -0.12], [0.76, 1.13, -0.12], [1.12, 1.52, -0.12]], archMat, 0.035);
    const topRail = makeMaterial('#e7cf9c');
    addMesh(group, new THREE.BoxGeometry(3.35, 0.08, 0.08), topRail, [0, 0.56, 0.3]);
    const bridgeLampMat = makeMaterial('#fff0bf', { emissive: '#ffb64e', emissiveIntensity: 0 });
    this.lampMaterials.push(bridgeLampMat);
    for (const x of [-1.55, -0.52, 0.52, 1.55]) {
      addMesh(group, new THREE.CylinderGeometry(0.024, 0.032, 0.42, 6), deck, [x, 0.67, 0.32]);
      addMesh(group, new THREE.SphereGeometry(0.075, 8, 6), bridgeLampMat, [x, 0.9, 0.32]);
    }
    const bridgeGlow = new THREE.PointLight('#ffcb82', 0, 4, 2);
    bridgeGlow.position.set(0, 1.0, 0.8);
    group.add(bridgeGlow);
    this.pointLights.push(bridgeGlow);
    return group;
  }

  update(time, dt, seasonWeights, nightGlow) {
    this.group.position.y = 1.72 + Math.sin(time * 0.72) * 0.19;
    this.group.rotation.y = Math.sin(time * 0.19) * 0.035;
    this.group.rotation.z = Math.sin(time * 0.31) * 0.012;
    this.eyeWheel.rotation.z = Math.sin(time * 0.16) * 0.08;
    for (let i = 0; i < this.eyeCabins.length; i += 1) {
      this.eyeCabins[i].rotation.z = -this.eyeWheel.rotation.z;
    }
    const grass = blendPalette(seasonWeights, 'grass');
    const river = blendPalette(seasonWeights, 'river');
    const cloud = blendPalette(seasonWeights, 'cloud');
    this.grassMaterial.color.copy(grass);
    this.riverMaterial.color.copy(river);
    this.cloudMaterial.color.copy(cloud);
    this.mistMaterial.opacity = seasonWeights[0] * 0.12;
    for (const item of this.clouds) {
      item.group.position.x = item.homeX + Math.sin(time * 0.055 + item.phase) * 0.75;
      item.group.position.y = item.homeY + Math.sin(time * 0.3 + item.phase) * 0.11;
    }
    for (const item of this.mist) {
      item.mesh.position.x = item.homeX + Math.sin(time * 0.27 + item.phase) * 0.38;
      item.mesh.position.y = 0.32 + Math.sin(time * 0.58 + item.phase) * 0.12;
      item.mesh.material.opacity = seasonWeights[0] * (0.09 + Math.sin(time * 0.43 + item.phase) * 0.018);
    }
    for (const material of this.lampMaterials) material.emissiveIntensity = nightGlow * 1.35;
    for (const light of this.pointLights) light.intensity = nightGlow * 0.8;
  }
}

class WeatherSystem {
  constructor(scene, count = 220) {
    this.scene = scene;
    this.count = count;
    this.leafGeometry = this._makeLeafGeometry();
    this.leafMaterial = new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0, vertexColors: false });
    this.snowGeometry = new THREE.IcosahedronGeometry(0.07, 0);
    this.snowMaterial = new THREE.MeshToonMaterial({ color: '#f3fbff', transparent: true, opacity: 0, roughness: 0.8 });
    this.leaves = new THREE.InstancedMesh(this.leafGeometry, this.leafMaterial, count);
    this.snow = new THREE.InstancedMesh(this.snowGeometry, this.snowMaterial, count + 100);
    this.leaves.name = 'Reusable autumn leaf particles';
    this.snow.name = 'Reusable snow particles';
    this.leaves.frustumCulled = false;
    this.snow.frustumCulled = false;
    this.leaves.castShadow = false;
    this.leaves.receiveShadow = false;
    this.snow.castShadow = false;
    this.snow.receiveShadow = false;
    scene.add(this.leaves, this.snow);
    this.leafStates = [];
    this.snowStates = [];
    this.dummy = new THREE.Object3D();
    this._seedParticles();
  }

  _makeLeafGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.2);
    shape.quadraticCurveTo(-0.12, -0.08, -0.19, -0.05);
    shape.lineTo(-0.1, 0.015);
    shape.quadraticCurveTo(-0.2, 0.1, -0.14, 0.15);
    shape.lineTo(-0.045, 0.11);
    shape.quadraticCurveTo(-0.035, 0.22, 0.025, 0.19);
    shape.quadraticCurveTo(0.055, 0.12, 0.11, 0.1);
    shape.quadraticCurveTo(0.23, 0.1, 0.2, 0.035);
    shape.lineTo(0.12, -0.015);
    shape.quadraticCurveTo(0.15, -0.12, 0.08, -0.14);
    shape.lineTo(0.015, -0.11);
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 5);
  }

  _seedParticles() {
    let seed = 914203;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const leafColors = ['#cc4f35', '#e77936', '#f3a23e', '#b84343', '#dc7e4d'];
    for (let i = 0; i < this.count; i += 1) {
      const state = {
        x: (random() - 0.5) * 12.5, y: random() * 10.5 - 0.4, z: (random() - 0.5) * 9,
        speed: 0.48 + random() * 0.82, phase: random() * Math.PI * 2, sway: 0.25 + random() * 0.68,
        spin: (random() - 0.5) * 2.6, scale: 0.58 + random() * 0.82
      };
      this.leafStates.push(state);
      this.leaves.setColorAt(i, color(leafColors[i % leafColors.length]));
      this._placeLeaf(i, state, 0, 0);
    }
    for (let i = 0; i < this.count + 100; i += 1) {
      const state = {
        x: (random() - 0.5) * 12.2, y: random() * 10.5 - 0.4, z: (random() - 0.5) * 9,
        speed: 0.5 + random() * 0.8, phase: random() * Math.PI * 2, sway: 0.1 + random() * 0.42,
        scale: 0.42 + random() * 0.82
      };
      this.snowStates.push(state);
      this._placeSnow(i, state, 0, 0);
    }
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    this.leaves.instanceMatrix.needsUpdate = true;
    this.snow.instanceMatrix.needsUpdate = true;
  }

  _placeLeaf(index, state, time, islandY) {
    const x = state.x + Math.sin(time * 0.9 + state.phase) * state.sway;
    this.dummy.position.set(x, state.y + islandY * 0.25, state.z);
    this.dummy.rotation.set(Math.sin(time * 1.1 + state.phase) * 0.9, Math.cos(time * 0.7 + state.phase) * 0.65, time * state.spin + state.phase);
    const scale = state.scale;
    this.dummy.scale.set(scale, scale, scale * 0.18);
    this.dummy.updateMatrix();
    this.leaves.setMatrixAt(index, this.dummy.matrix);
  }

  _placeSnow(index, state, time, islandY) {
    const x = state.x + Math.sin(time * 0.72 + state.phase) * state.sway;
    const z = state.z + Math.cos(time * 0.5 + state.phase) * state.sway * 0.42;
    this.dummy.position.set(x, state.y + islandY * 0.2, z);
    this.dummy.rotation.set(time * 0.22 + state.phase, time * 0.32, time * 0.16);
    const scale = state.scale;
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.updateMatrix();
    this.snow.setMatrixAt(index, this.dummy.matrix);
  }

  update(dt, time, seasonWeights, islandY) {
    this.leafMaterial.opacity = seasonWeights[2] * 0.97;
    this.snowMaterial.opacity = seasonWeights[3] * 0.92;
    this.leaves.visible = seasonWeights[2] > 0.008;
    this.snow.visible = seasonWeights[3] > 0.008;
    for (let i = 0; i < this.leafStates.length; i += 1) {
      const state = this.leafStates[i];
      state.y -= state.speed * dt;
      if (state.y < -1.4) {
        state.y = 8.3 + Math.random() * 4.2;
        state.x = (Math.random() - 0.5) * 12.5;
        state.z = (Math.random() - 0.5) * 9;
      }
      this._placeLeaf(i, state, time, islandY);
    }
    for (let i = 0; i < this.snowStates.length; i += 1) {
      const state = this.snowStates[i];
      state.y -= state.speed * dt;
      if (state.y < -1.2) {
        state.y = 8.6 + Math.random() * 4.4;
        state.x = (Math.random() - 0.5) * 12.2;
        state.z = (Math.random() - 0.5) * 9;
      }
      this._placeSnow(i, state, time, islandY);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    this.snow.instanceMatrix.needsUpdate = true;
  }
}

class DayNightCycle {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.elapsed = 3.75;
    this.phase = 0.25;
    this.transition = null;
    this.skyUniforms = {
      uTop: { value: color('#58a9cd') },
      uHorizon: { value: color('#d6efdf') },
      uLow: { value: color('#a8c7c3') }
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(120, 32, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: this.skyUniforms,
        vertexShader: [
          'varying vec3 vDirection;',
          'void main() {',
          '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
          '  vDirection = normalize(worldPosition.xyz - cameraPosition);',
          '  gl_Position = projectionMatrix * viewMatrix * worldPosition;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uTop;',
          'uniform vec3 uHorizon;',
          'uniform vec3 uLow;',
          'varying vec3 vDirection;',
          'void main() {',
          '  float h = vDirection.y;',
          '  float upper = smoothstep(-0.02, 0.82, h);',
          '  float lower = smoothstep(-0.58, 0.02, h);',
          '  vec3 sky = mix(uLow, uHorizon, lower);',
          '  sky = mix(sky, uTop, upper);',
          '  gl_FragColor = vec4(sky, 1.0);',
          '  #include <tonemapping_fragment>',
          '  #include <colorspace_fragment>',
          '}'
        ].join('\n')
      })
    );
    this.sky.renderOrder = -100;
    scene.add(this.sky);

    this.ambient = new THREE.HemisphereLight('#d4eee8', '#88614b', 1.2);
    scene.add(this.ambient);
    this.sunLight = new THREE.DirectionalLight('#fff0cf', 1.5);
    this.sunLight.position.set(-6, 12, 7);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1536, 1536);
    this.sunLight.shadow.camera.left = -10;
    this.sunLight.shadow.camera.right = 10;
    this.sunLight.shadow.camera.top = 12;
    this.sunLight.shadow.camera.bottom = -8;
    this.sunLight.shadow.bias = -0.00025;
    this.sunLight.shadow.normalBias = 0.025;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), makeMaterial('#fff0b7', { emissive: '#ffcf72', emissiveIntensity: 1.6 }));
    this.sunGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffdc9b', transparent: true, opacity: 0.19, depthWrite: false }));
    this.sunGlow.scale.set(1.85, 1.85, 1.85);
    this.sun.add(this.sunGlow);
    scene.add(this.sun);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(0.47, 20, 16), makeMaterial('#e5f0ee', { emissive: '#94b9d1', emissiveIntensity: 0.6 }));
    const moonMark = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 14), makeMaterial('#819bb0'));
    moonMark.position.set(0.19, -0.04, 0.25);
    this.moon.add(moonMark);
    scene.add(this.moon);

    const starPositions = [];
    let seed = 782341;
    const random = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 120; i += 1) {
      const theta = random() * Math.PI * 2;
      const y = 0.05 + random() * 0.93;
      const r = 65 + random() * 15;
      const horizontal = Math.sqrt(1 - y * y);
      starPositions.push(Math.cos(theta) * horizontal * r, y * r, Math.sin(theta) * horizontal * r);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#e5f2ff', size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(this.stars);
    this.timeOfDay = 0;
  }

  jumpToNight(isNight) {
    const target = isNight ? 0.75 : 0.25;
    const delta = ((target - this.phase + 1.5) % 1) - 0.5;
    this.transition = { from: this.phase, delta, target, elapsed: 0, duration: 1.25 };
  }

  update(dt, seasonWeights, renderer) {
    if (this.transition) {
      this.transition.elapsed += dt;
      const progress = clamp01(this.transition.elapsed / this.transition.duration);
      const eased = progress * progress * (3 - 2 * progress);
      this.phase = (this.transition.from + this.transition.delta * eased + 1) % 1;
      if (progress >= 1) {
        this.phase = this.transition.target;
        this.transition = null;
        this.elapsed = this.phase * 15;
      }
    } else {
      this.elapsed = (this.elapsed + dt) % 15;
      this.phase = this.elapsed / 15;
    }

    const angle = this.phase * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const day = smoothstep(-0.2, 0.24, sunHeight);
    const twilight = 1 - smoothstep(0.08, 0.55, Math.abs(sunHeight));
    const night = 1 - day;
    const glow = smoothstep(0.3, 0.86, night);
    const topSeason = blendPalette(seasonWeights, 'skyTop');
    const horizonSeason = blendPalette(seasonWeights, 'skyHorizon');
    const nightTop = blendPalette(seasonWeights, 'nightTop');
    const nightHorizon = blendPalette(seasonWeights, 'nightHorizon');
    const sunset = blendPalette(seasonWeights, 'sunset');
    const baseTop = nightTop.clone().lerp(topSeason, day);
    const baseHorizon = nightHorizon.clone().lerp(horizonSeason, day);
    baseTop.lerp(sunset, twilight * 0.64);
    baseHorizon.lerp(sunset, twilight * 0.84);
    const low = baseHorizon.clone().lerp(nightTop, 0.42 * night);
    this.skyUniforms.uTop.value.copy(baseTop);
    this.skyUniforms.uHorizon.value.copy(baseHorizon);
    this.skyUniforms.uLow.value.copy(low);

    const fog = blendPalette(seasonWeights, 'fog').lerp(color('#152b4d'), night * 0.45);
    this.scene.fog.color.copy(fog);
    let density = 0;
    let ambientPower = 0;
    let sunPower = 0;
    for (let i = 0; i < SEASON_PALETTES.length; i += 1) {
      density += SEASON_PALETTES[i].fogDensity * seasonWeights[i];
      ambientPower += SEASON_PALETTES[i].ambientPower * seasonWeights[i];
      sunPower += SEASON_PALETTES[i].sunPower * seasonWeights[i];
    }
    this.scene.fog.density = density * (0.52 + night * 0.26);
    const ambientColor = blendPalette(seasonWeights, 'ambient').lerp(color('#5c77a2'), night * 0.86);
    this.ambient.color.copy(ambientColor);
    this.ambient.intensity = (0.14 + day * ambientPower) * 1.08;
    const sunlight = blendPalette(seasonWeights, 'sun').lerp(sunset, twilight * 0.72).lerp(color('#92b5ed'), night * 0.9);
    this.sunLight.color.copy(sunlight);
    this.sunLight.intensity = (0.08 + day * sunPower) * (1 - night * 0.74);
    this.sunLight.position.set(Math.cos(angle) * 16, 7.2 + sunHeight * 8.5, -13);
    this.sunLight.target.position.set(0, 1.8, 0);
    this.sun.position.copy(this.sunLight.position);
    this.sun.visible = sunHeight > -0.04;
    const moonAngle = angle + Math.PI;
    this.moon.position.set(Math.cos(moonAngle) * 15, 7.2 + Math.sin(moonAngle) * 8.5, -14);
    this.moon.visible = sunHeight < 0.04;
    this.stars.material.opacity = smoothstep(0.24, 0.82, night) * 0.82;
    this.sunGlow.material.opacity = 0.13 + twilight * 0.22;
    this.timeOfDay = { phase: this.phase, day, twilight, night, glow, sunHeight };
    return this.timeOfDay;
  }
}

function init() {
  const mount = document.getElementById('scene');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c9e4df', 0.004);
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 260);
  camera.position.set(0, 7.35, 17.1);
  camera.lookAt(0, 3.15, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(mount.clientWidth, mount.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = 11;
  controls.maxDistance = 24;
  controls.minPolarAngle = 0.72;
  controls.maxPolarAngle = 1.62;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.7;
  controls.target.set(0, 3.15, 0);
  controls.update();

  const island = new Island(scene);
  const weather = new WeatherSystem(scene, 220);
  const cycle = new DayNightCycle(scene, camera);
  const seasonWeights = [1, 0, 0, 0];
  let targetSeason = 0;
  let seasonClock = 0;
  let elapsed = 0;
  let jumpNight = false;
  const seasonDuration = 28;
  const seasonBlendRate = 3.2;
  const clock = new THREE.Clock();
  const seasonLabel = document.getElementById('season-label');
  const dayLabel = document.getElementById('day-label');
  const dayToggle = document.getElementById('day-toggle');
  const seasonButtons = Array.from(document.querySelectorAll('.season-button'));
  const orbitHint = document.getElementById('orbit-hint');
  const loading = document.getElementById('loading');
  let hintTimer = window.setTimeout(() => orbitHint.classList.add('is-hidden'), 6500);
  renderer.domElement.addEventListener('pointerdown', () => {
    if (hintTimer) window.clearTimeout(hintTimer);
    orbitHint.classList.add('is-hidden');
  }, { passive: true, once: true });

  function setSeason(index) {
    targetSeason = (index + SEASONS.length) % SEASONS.length;
    seasonClock = 0;
    seasonLabel.textContent = SEASON_NAMES[targetSeason];
    for (let i = 0; i < seasonButtons.length; i += 1) {
      seasonButtons[i].setAttribute('aria-pressed', String(i === targetSeason));
    }
  }
  seasonButtons.forEach((button) => {
    button.addEventListener('click', () => setSeason(SEASONS.indexOf(button.dataset.season)));
  });
  setSeason(0);
  dayToggle.addEventListener('click', () => {
    jumpNight = !jumpNight;
    cycle.jumpToNight(jumpNight);
    dayToggle.setAttribute('aria-label', jumpNight ? 'Skip to daytime' : 'Skip to nighttime');
    dayToggle.setAttribute('aria-pressed', String(jumpNight));
  });

  function resize() {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(width, height, false);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  window.addEventListener('orientationchange', resize, { passive: true });

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    seasonClock += dt;
    if (seasonClock >= seasonDuration) setSeason(targetSeason + 1);
    const targetWeights = seasonWeights.map((_, index) => index === targetSeason ? 1 : 0);
    const blend = 1 - Math.exp(-dt * seasonBlendRate);
    for (let i = 0; i < seasonWeights.length; i += 1) {
      seasonWeights[i] = lerp(seasonWeights[i], targetWeights[i], blend);
    }
    // Renormalize the easing weights so every season transition keeps a stable total climate influence.
    const weightTotal = seasonWeights.reduce((sum, value) => sum + value, 0) || 1;
    for (let i = 0; i < seasonWeights.length; i += 1) seasonWeights[i] /= weightTotal;

    const skyState = cycle.update(dt, seasonWeights, renderer);
    island.update(elapsed, dt, seasonWeights, skyState.glow);
    weather.update(dt, elapsed, seasonWeights, island.group.position.y);
    const daylightLabel = skyState.night > 0.78 ? 'NIGHT' : skyState.twilight > 0.43 ? 'GOLDEN HOUR' : 'DAYLIGHT';
    dayLabel.textContent = daylightLabel;
    controls.update();
    renderer.render(scene, camera);
    if (loading.classList.contains('is-gone') === false && elapsed > 0.8) loading.classList.add('is-gone');
  }

  animate();
  window.addEventListener('beforeunload', () => {
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
  }, { once: true });
}

try {
  init();
} catch (error) {
  console.error('Unable to start the Little London scene:', error);
  const loading = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');
  if (loading) loading.classList.add('is-gone');
  if (errorMessage) errorMessage.hidden = false;
}
