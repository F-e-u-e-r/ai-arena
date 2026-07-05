import('https://unpkg.com/three@0.160.0/build/three.module.js').then((THREE) => {

const canvas = document.getElementById('scene');
const phaseLabel = document.getElementById('phase');
const fpsLabel = document.getElementById('fps');
const leafCountLabel = document.getElementById('leafCount');
const speedToggle = document.getElementById('speedToggle');

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function makeToon(color, options = {}) {
  return new THREE.MeshToonMaterial({
    color,
    emissive: options.emissive || 0x000000,
    emissiveIntensity: options.emissiveIntensity || 0,
    transparent: options.transparent || false,
    opacity: options.opacity ?? 1
  });
}

function beamBetween(start, end, radius, material, radialSegments = 8) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.castShadow = true;
  return mesh;
}

class DragCameraController {
  constructor(canvasElement, root) {
    this.canvas = canvasElement;
    this.root = root;
    this.targetYaw = -0.35;
    this.currentYaw = this.targetYaw;
    this.dragging = false;
    this.lastX = 0;
    this.idleTime = 0;

    this.canvas.addEventListener('pointerdown', event => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('pointermove', event => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastX;
      this.lastX = event.clientX;
      this.targetYaw += dx * 0.009;
      this.idleTime = 0;
    });

    const stopDrag = event => {
      this.dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };

    this.canvas.addEventListener('pointerup', stopDrag);
    this.canvas.addEventListener('pointercancel', stopDrag);
  }

  update(deltaTime) {
    this.idleTime += deltaTime;
    if (!this.dragging && this.idleTime > 3) {
      this.targetYaw += deltaTime * 0.055;
    }
    this.currentYaw += (this.targetYaw - this.currentYaw) * Math.min(1, deltaTime * 8);
    this.root.rotation.y = this.currentYaw;
  }
}

class DayNightCycle {
  constructor(scene, ambient, keyLight, sun, moon, fog, tower) {
    this.scene = scene;
    this.ambient = ambient;
    this.keyLight = keyLight;
    this.sun = sun;
    this.moon = moon;
    this.fog = fog;
    this.tower = tower;
    this.speed = 1;
    this.duration = 15;
    this.skyColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.keyframes = [
      { p: 0.00, name: 'Day', sky: 0x98ddff, fog: 0xc6f0ff, ambient: 1.15, key: 2.2 },
      { p: 0.25, name: 'Dusk', sky: 0xffb06b, fog: 0xf6a46e, ambient: 0.74, key: 1.25 },
      { p: 0.50, name: 'Night', sky: 0x101a3b, fog: 0x182047, ambient: 0.34, key: 0.18 },
      { p: 0.75, name: 'Dawn', sky: 0xf8b08a, fog: 0xd89ac7, ambient: 0.68, key: 0.95 },
      { p: 1.00, name: 'Day', sky: 0x98ddff, fog: 0xc6f0ff, ambient: 1.15, key: 2.2 }
    ];
  }

  setFast(enabled) {
    this.speed = enabled ? 4 : 1;
  }

  sample(phase) {
    for (let i = 0; i < this.keyframes.length - 1; i += 1) {
      const a = this.keyframes[i];
      const b = this.keyframes[i + 1];
      if (phase >= a.p && phase <= b.p) {
        const t = smoothstep(a.p, b.p, phase);
        return { a, b, t };
      }
    }
    return { a: this.keyframes[0], b: this.keyframes[1], t: 0 };
  }

  update(elapsedTime) {
    const phase = (elapsedTime * this.speed / this.duration) % 1;
    const { a, b, t } = this.sample(phase);
    this.skyColor.copy(new THREE.Color(a.sky)).lerp(new THREE.Color(b.sky), t);
    this.fogColor.copy(new THREE.Color(a.fog)).lerp(new THREE.Color(b.fog), t);
    this.scene.background = this.skyColor;
    this.fog.color.copy(this.fogColor);
    this.ambient.intensity = lerp(a.ambient, b.ambient, t);
    this.keyLight.intensity = lerp(a.key, b.key, t);

    const sunAngle = phase * TAU - Math.PI * 0.42;
    this.sun.position.set(Math.cos(sunAngle) * 10, Math.sin(sunAngle) * 8 + 2, -7);
    this.sun.visible = this.sun.position.y > -1.8;
    this.keyLight.position.copy(this.sun.position).multiplyScalar(0.75);

    const moonAngle = sunAngle + Math.PI;
    this.moon.position.set(Math.cos(moonAngle) * 11, Math.sin(moonAngle) * 7 + 2.8, -8);
    this.moon.visible = this.moon.position.y > -1.4;

    // Dusk-to-night lighting is driven by phase, not by discrete timers, so lamps fade on and off smoothly.
    const lampPower = smoothstep(0.18, 0.29, phase) * (1 - smoothstep(0.68, 0.78, phase));
    this.tower.setLampPower(lampPower);
    phaseLabel.textContent = t < 0.5 ? a.name : b.name;
  }
}

class TokyoTower {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Tokyo Tower';
    this.lamps = [];
    this.litMaterials = [];
    this.red = makeToon(0xd73528, { emissive: 0x290300 });
    this.white = makeToon(0xfff2d6, { emissive: 0x22150a });
    this.windowMaterial = makeToon(0xffb347, { emissive: 0xffaa36, emissiveIntensity: 0 });
    this.litMaterials.push(this.red, this.white, this.windowMaterial);
    this.build();
  }

  build() {
    const levels = [
      { y: 0, r: 0.58 },
      { y: 0.56, r: 0.38 },
      { y: 1.17, r: 0.22 },
      { y: 1.72, r: 0.08 }
    ];

    for (let i = 0; i < levels.length - 1; i += 1) {
      const bottom = levels[i];
      const top = levels[i + 1];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const start = new THREE.Vector3(bottom.r * sx, bottom.y, bottom.r * sz);
          const end = new THREE.Vector3(top.r * sx, top.y, top.r * sz);
          this.group.add(beamBetween(start, end, 0.028, i % 2 ? this.white : this.red));
        }
      }
      this.addRing(bottom.y, bottom.r, i % 2 ? this.red : this.white);
    }
    this.addRing(levels.at(-1).y, levels.at(-1).r, this.red);

    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 8), this.white);
    deck.position.y = 0.93;
    deck.castShadow = true;
    this.group.add(deck);

    const upperDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8), this.red);
    upperDeck.position.y = 1.43;
    upperDeck.castShadow = true;
    this.group.add(upperDeck);

    this.group.add(beamBetween(new THREE.Vector3(0, 1.72, 0), new THREE.Vector3(0, 2.25, 0), 0.025, this.white));
    this.group.add(beamBetween(new THREE.Vector3(0, 2.25, 0), new THREE.Vector3(0, 2.58, 0), 0.012, this.red));

    for (let i = 0; i < 10; i += 1) {
      const angle = i / 10 * TAU;
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.025), this.windowMaterial);
      window.position.set(Math.cos(angle) * 0.36, 0.94, Math.sin(angle) * 0.36);
      window.lookAt(0, 0.94, 0);
      this.group.add(window);
    }

    for (const position of [
      new THREE.Vector3(0.28, 0.92, 0.28),
      new THREE.Vector3(-0.28, 0.92, -0.28),
      new THREE.Vector3(0.11, 1.48, -0.12)
    ]) {
      const light = new THREE.PointLight(0xff9f38, 0, 4.2, 2);
      light.position.copy(position);
      this.lamps.push(light);
      this.group.add(light);
    }
  }

  addRing(y, r, material) {
    const corners = [
      new THREE.Vector3(-r, y, -r),
      new THREE.Vector3(r, y, -r),
      new THREE.Vector3(r, y, r),
      new THREE.Vector3(-r, y, r)
    ];
    for (let i = 0; i < corners.length; i += 1) {
      this.group.add(beamBetween(corners[i], corners[(i + 1) % corners.length], 0.02, material));
    }
  }

  setLampPower(power) {
    this.lamps.forEach(light => {
      light.intensity = power * 1.9;
    });
    this.litMaterials.forEach(material => {
      material.emissiveIntensity = power * 0.55;
    });
    this.windowMaterial.emissiveIntensity = power * 1.8;
  }
}

class Landmark {
  static fuji() {
    const group = new THREE.Group();
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.88, 4), makeToon(0x5e80b8));
    mountain.rotation.y = Math.PI * 0.25;
    mountain.position.y = 0.36;
    mountain.castShadow = true;
    group.add(mountain);

    const snow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.31, 4), makeToon(0xfff5ef));
    snow.rotation.y = Math.PI * 0.25;
    snow.position.y = 0.81;
    group.add(snow);
    group.position.set(-1.25, 0.08, -0.55);
    group.scale.setScalar(0.88);
    return group;
  }

  static torii() {
    const group = new THREE.Group();
    const red = makeToon(0xc9271b, { emissive: 0x240200 });
    const dark = makeToon(0x271413);
    group.add(beamBetween(new THREE.Vector3(-0.38, 0, 0), new THREE.Vector3(-0.38, 0.62, 0), 0.04, red));
    group.add(beamBetween(new THREE.Vector3(0.38, 0, 0), new THREE.Vector3(0.38, 0.62, 0), 0.04, red));
    group.add(beamBetween(new THREE.Vector3(-0.54, 0.64, 0), new THREE.Vector3(0.54, 0.64, 0), 0.05, red));
    group.add(beamBetween(new THREE.Vector3(-0.68, 0.77, 0), new THREE.Vector3(0.68, 0.77, 0), 0.045, dark));
    group.position.set(1.2, 0.1, 0.68);
    group.rotation.y = -0.35;
    return group;
  }

  static temple() {
    const group = new THREE.Group();
    const wood = makeToon(0xb05c27);
    const roofMat = makeToon(0x27394c);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.32, 0.48), wood);
    base.position.y = 0.18;
    base.castShadow = true;
    group.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.28, 4), roofMat);
    roof.rotation.y = Math.PI * 0.25;
    roof.scale.z = 0.72;
    roof.position.y = 0.49;
    roof.castShadow = true;
    group.add(roof);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), makeToon(0xffc15d, { emissive: 0xff9a27, emissiveIntensity: 0.2 }));
    lantern.position.set(0, 0.34, 0.27);
    group.add(lantern);
    group.position.set(0.95, 0.1, -0.72);
    group.rotation.y = 0.45;
    return group;
  }
}

class Island {
  constructor() {
    this.group = new THREE.Group();
    this.tower = new TokyoTower();
    this.floatOffset = Math.random() * TAU;
    this.build();
  }

  build() {
    const soil = makeToon(0x9b5c2e);
    const darkSoil = makeToon(0x6d3a1f);
    const grass = makeToon(0x72bd53);
    const path = makeToon(0xd7b77a);

    const belly = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.3, 18), soil);
    belly.position.y = -0.62;
    belly.rotation.y = Math.PI / 18;
    belly.castShadow = true;
    this.group.add(belly);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.98, 1.78, 0.3, 18), darkSoil);
    rim.position.y = 0.05;
    rim.castShadow = true;
    this.group.add(rim);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 1.98, 0.18, 18), grass);
    top.position.y = 0.2;
    top.receiveShadow = true;
    this.group.add(top);

    const pathMesh = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.025, 8, 72, Math.PI * 1.45), path);
    pathMesh.rotation.x = Math.PI / 2;
    pathMesh.rotation.z = -0.55;
    pathMesh.position.y = 0.305;
    this.group.add(pathMesh);

    this.tower.group.position.set(0, 0.32, 0.02);
    this.tower.group.scale.setScalar(0.78);
    this.group.add(this.tower.group);
    this.group.add(Landmark.fuji(), Landmark.torii(), Landmark.temple());

    for (let i = 0; i < 20; i += 1) {
      const angle = i / 20 * TAU;
      const radius = 1.25 + Math.random() * 0.5;
      const tree = this.makeTree(0.18 + Math.random() * 0.12);
      tree.position.set(Math.cos(angle) * radius, 0.28, Math.sin(angle) * radius);
      tree.scale.setScalar(0.85 + Math.random() * 0.35);
      this.group.add(tree);
    }
  }

  makeTree(height) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, height, 6), makeToon(0x70431f));
    trunk.position.y = height / 2;
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(height * 0.58, 0), makeToon(0xf06a43));
    crown.position.y = height + 0.08;
    group.add(trunk, crown);
    return group;
  }

  update(elapsedTime) {
    this.group.position.y = Math.sin(elapsedTime * 1.2 + this.floatOffset) * 0.08;
    this.group.rotation.z = Math.sin(elapsedTime * 0.7) * 0.025;
  }
}

class MapleLeafSystem {
  constructor(scene, count = 180) {
    this.count = count;
    this.leaves = [];
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.scale = new THREE.Vector3();
    const geometry = this.createLeafGeometry();
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      vertexColors: true
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    for (let i = 0; i < count; i += 1) {
      this.leaves.push({});
      this.reset(i, false);
      const color = new THREE.Color().setHSL(0.03 + Math.random() * 0.08, 0.86, 0.45 + Math.random() * 0.18);
      this.mesh.setColorAt(i, color);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  createLeafGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.16);
    shape.lineTo(0.045, 0.055);
    shape.lineTo(0.16, 0.08);
    shape.lineTo(0.082, 0.006);
    shape.lineTo(0.132, -0.11);
    shape.lineTo(0.024, -0.052);
    shape.lineTo(0, -0.18);
    shape.lineTo(-0.024, -0.052);
    shape.lineTo(-0.132, -0.11);
    shape.lineTo(-0.082, 0.006);
    shape.lineTo(-0.16, 0.08);
    shape.lineTo(-0.045, 0.055);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.translate(0, -0.015, 0);
    return geometry;
  }

  reset(index, fromTop) {
    const leaf = this.leaves[index];
    leaf.x = (Math.random() - 0.5) * 7.5;
    leaf.y = fromTop ? 4.2 + Math.random() * 1.8 : -0.4 + Math.random() * 5.8;
    leaf.z = (Math.random() - 0.5) * 5.2;
    leaf.vx = -0.22 + Math.random() * 0.44;
    leaf.vy = 0.34 + Math.random() * 0.46;
    leaf.vz = -0.1 + Math.random() * 0.2;
    leaf.scale = 0.42 + Math.random() * 0.55;
    leaf.spinX = -2 + Math.random() * 4;
    leaf.spinY = -2 + Math.random() * 4;
    leaf.spinZ = -3 + Math.random() * 6;
    leaf.rotX = Math.random() * TAU;
    leaf.rotY = Math.random() * TAU;
    leaf.rotZ = Math.random() * TAU;
    leaf.sway = Math.random() * TAU;
  }

  update(deltaTime, elapsedTime) {
    for (let i = 0; i < this.count; i += 1) {
      const leaf = this.leaves[i];
      leaf.y -= leaf.vy * deltaTime;
      leaf.x += (leaf.vx + Math.sin(elapsedTime * 1.4 + leaf.sway) * 0.23) * deltaTime;
      leaf.z += (leaf.vz + Math.cos(elapsedTime * 1.1 + leaf.sway) * 0.16) * deltaTime;
      leaf.rotX += leaf.spinX * deltaTime;
      leaf.rotY += leaf.spinY * deltaTime;
      leaf.rotZ += leaf.spinZ * deltaTime;

      if (leaf.y < -1.7 || Math.abs(leaf.x) > 5.2 || Math.abs(leaf.z) > 4.2) {
        this.reset(i, true);
      }

      this.position.set(leaf.x, leaf.y, leaf.z);
      this.euler.set(leaf.rotX, leaf.rotY, leaf.rotZ);
      this.quaternion.setFromEuler(this.euler);
      this.scale.setScalar(leaf.scale);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class Clouds {
  constructor(scene) {
    this.group = new THREE.Group();
    this.parts = [];
    const material = makeToon(0xffffff, { transparent: true, opacity: 0.86 });
    for (let i = 0; i < 8; i += 1) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28 + Math.random() * 0.18, 10, 8), material);
        puff.position.set(j * 0.25, Math.random() * 0.12, Math.random() * 0.08);
        puff.scale.y = 0.62;
        cloud.add(puff);
      }
      cloud.position.set(-4 + Math.random() * 8, 1.8 + Math.random() * 1.4, -3.5 - Math.random() * 2.5);
      cloud.scale.setScalar(0.6 + Math.random() * 0.55);
      this.parts.push({ cloud, speed: 0.04 + Math.random() * 0.05 });
      this.group.add(cloud);
    }
    scene.add(this.group);
  }

  update(deltaTime) {
    for (const part of this.parts) {
      part.cloud.position.x += part.speed * deltaTime;
      if (part.cloud.position.x > 5) part.cloud.position.x = -5;
    }
  }
}

class App {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.fog = new THREE.Fog(0x98ddff, 8, 20);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    this.camera.position.set(0, 2.2, 6.4);
    this.camera.lookAt(0, 0.4, 0);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.ambient = new THREE.AmbientLight(0xfff4e8, 1.1);
    this.scene.add(this.ambient);
    this.keyLight = new THREE.DirectionalLight(0xfff0d4, 2.2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 24;
    this.scene.add(this.keyLight);

    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffdb72 }));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: 0xdfe9ff }));
    this.scene.add(this.sun, this.moon);

    this.island = new Island();
    this.root.add(this.island.group);
    this.leaves = new MapleLeafSystem(this.scene);
    this.clouds = new Clouds(this.scene);
    this.controller = new DragCameraController(canvas, this.root);
    this.cycle = new DayNightCycle(this.scene, this.ambient, this.keyLight, this.sun, this.moon, this.fog, this.island.tower);
    this.fast = false;
    this.lastTime = performance.now();
    this.fpsTime = 0;
    this.frames = 0;

    leafCountLabel.textContent = `${this.leaves.count} leaves`;
    speedToggle.addEventListener('click', () => this.toggleSpeed());
    window.addEventListener('keydown', event => {
      if (event.key.toLowerCase() === 'f') this.toggleSpeed();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame(time => this.tick(time));
  }

  toggleSpeed() {
    this.fast = !this.fast;
    this.cycle.setFast(this.fast);
    speedToggle.textContent = this.fast ? 'Cycle x4' : 'Cycle x1';
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  tick(time) {
    const deltaTime = Math.min(0.05, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;
    const elapsedTime = time / 1000;

    this.cycle.update(elapsedTime);
    this.controller.update(deltaTime);
    this.island.update(elapsedTime);
    this.leaves.update(deltaTime, elapsedTime);
    this.clouds.update(deltaTime);
    this.renderer.render(this.scene, this.camera);

    this.frames += 1;
    this.fpsTime += deltaTime;
    if (this.fpsTime >= 0.5) {
      fpsLabel.textContent = `${Math.round(this.frames / this.fpsTime)} fps`;
      this.frames = 0;
      this.fpsTime = 0;
    }

    requestAnimationFrame(nextTime => this.tick(nextTime));
  }
}

new App();
}).catch((error) => {
  console.error('Failed to load Three.js', error);
});
