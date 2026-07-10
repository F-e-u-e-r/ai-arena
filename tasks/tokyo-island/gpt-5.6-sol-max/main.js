(() => {
  'use strict';

  const errorPanel = document.querySelector('#error');
  const loadingPanel = document.querySelector('#loading');

  if (!window.THREE) {
    loadingPanel.hidden = true;
    errorPanel.hidden = false;
    return;
  }

  const canvas = document.querySelector('#scene');
  const timeLabel = document.querySelector('#time-label');
  const timeValue = document.querySelector('#time-value');
  const timeOrb = document.querySelector('#time-orb');
  const leafCount = document.querySelector('#leaf-count');
  const resetButton = document.querySelector('#reset-view');

  const TAU = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothstep = (min, max, value) => {
    const x = clamp((value - min) / (max - min), 0, 1);
    return x * x * (3 - 2 * x);
  };

  function seededRandom(seed = 0x5f3759df) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function toon(color, options = {}) {
    return new THREE.MeshToonMaterial({ color, ...options });
  }

  function standard(color, options = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options });
  }

  function mesh(geometry, material, cast = true, receive = true) {
    const result = new THREE.Mesh(geometry, material);
    result.castShadow = cast;
    result.receiveShadow = receive;
    return result;
  }

  function addBox(parent, size, position, material, rotation) {
    const item = mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    item.position.set(position[0], position[1], position[2]);
    if (rotation) item.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(item);
    return item;
  }

  function addBeam(parent, start, end, width, material) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const item = mesh(new THREE.BoxGeometry(width, direction.length(), width), material);
    item.position.copy(start).add(end).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(UP, direction.normalize());
    parent.add(item);
    return item;
  }

  class CameraController {
    constructor(camera, domElement) {
      this.camera = camera;
      this.domElement = domElement;
      this.yaw = -0.42;
      this.targetYaw = this.yaw;
      this.radius = 23;
      this.targetRadius = this.radius;
      this.target = new THREE.Vector3(0, 3.1, 0);
      this.dragging = false;
      this.lastX = 0;
      this.idle = 0;

      domElement.addEventListener('pointerdown', (event) => {
        this.dragging = true;
        this.lastX = event.clientX;
        this.idle = 0;
        domElement.setPointerCapture(event.pointerId);
      });
      domElement.addEventListener('pointermove', (event) => {
        if (!this.dragging) return;
        const delta = event.clientX - this.lastX;
        this.lastX = event.clientX;
        this.targetYaw -= delta * 0.009;
      });
      const release = (event) => {
        this.dragging = false;
        if (event.pointerId !== undefined && domElement.hasPointerCapture(event.pointerId)) {
          domElement.releasePointerCapture(event.pointerId);
        }
      };
      domElement.addEventListener('pointerup', release);
      domElement.addEventListener('pointercancel', release);
      domElement.addEventListener('wheel', (event) => {
        event.preventDefault();
        this.targetRadius = clamp(this.targetRadius + event.deltaY * 0.012, 17, 29);
        this.idle = 0;
      }, { passive: false });
    }

    reset() {
      this.targetYaw = -0.42;
      this.targetRadius = 23;
      this.idle = 0;
    }

    update(deltaTime) {
      this.idle += deltaTime;
      if (!this.dragging && this.idle > 4) this.targetYaw += deltaTime * 0.055;
      const damping = 1 - Math.exp(-deltaTime * 8);
      this.yaw += (this.targetYaw - this.yaw) * damping;
      this.radius += (this.targetRadius - this.radius) * damping;

      const x = Math.sin(this.yaw) * this.radius;
      const z = Math.cos(this.yaw) * this.radius;
      this.camera.position.set(x, 11.2, z);
      this.camera.lookAt(this.target);
    }
  }

  class DayNightCycle {
    constructor(scene, sky, sunLight, ambientLight, sun, moon, stars, lightMaterials) {
      this.scene = scene;
      this.sky = sky;
      this.sunLight = sunLight;
      this.ambientLight = ambientLight;
      this.sun = sun;
      this.moon = moon;
      this.stars = stars;
      this.lightMaterials = lightMaterials;
      this.phase = 0;
      this.nightAmount = 0;
      this.top = new THREE.Color();
      this.bottom = new THREE.Color();
      this.fog = new THREE.Color();
      this.palette = {
        nightTop: new THREE.Color('#071126'),
        nightBottom: new THREE.Color('#243453'),
        dayTop: new THREE.Color('#42a8dc'),
        dayBottom: new THREE.Color('#c7eff2'),
        duskTop: new THREE.Color('#62426f'),
        duskBottom: new THREE.Color('#ff9a68'),
        sunDay: new THREE.Color('#fff1bf'),
        sunDusk: new THREE.Color('#ff7b4d')
      };
    }

    update(elapsed) {
      // One phase maps to a full 24-hour day; 0 starts at 06:00 and the loop is 15 seconds.
      this.phase = (elapsed % 15) / 15;
      const angle = this.phase * TAU;
      const sunHeight = Math.sin(angle);
      const dayAmount = smoothstep(-0.16, 0.24, sunHeight);
      const twilight = 1 - smoothstep(0.06, 0.5, Math.abs(sunHeight));
      this.nightAmount = 1 - dayAmount;

      this.top.copy(this.palette.nightTop).lerp(this.palette.dayTop, dayAmount);
      this.top.lerp(this.palette.duskTop, twilight * 0.62);
      this.bottom.copy(this.palette.nightBottom).lerp(this.palette.dayBottom, dayAmount);
      this.bottom.lerp(this.palette.duskBottom, twilight * 0.88);
      this.fog.copy(this.bottom).lerp(this.top, 0.18);

      this.sky.material.uniforms.topColor.value.copy(this.top);
      this.sky.material.uniforms.bottomColor.value.copy(this.bottom);
      this.scene.fog.color.copy(this.fog);
      this.scene.fog.density = 0.009 + this.nightAmount * 0.003;

      this.sun.position.set(Math.cos(angle) * 38, sunHeight * 31, -18);
      this.moon.position.copy(this.sun.position).multiplyScalar(-1);
      this.sun.visible = sunHeight > -0.24;
      this.moon.visible = sunHeight < 0.34;

      this.sunLight.position.copy(this.sun.position).multiplyScalar(0.45);
      this.sunLight.intensity = 0.18 + dayAmount * 2.25;
      this.sunLight.color.copy(this.palette.sunDusk).lerp(this.palette.sunDay, dayAmount);
      this.ambientLight.intensity = 0.72 + dayAmount * 0.72;
      this.ambientLight.color.set(dayAmount > 0.45 ? '#d9edff' : '#91a1d3');

      const lampAmount = smoothstep(0.2, 0.72, this.nightAmount);
      for (const material of this.lightMaterials) material.emissiveIntensity = lampAmount * 2.2;
      this.stars.material.opacity = smoothstep(0.2, 0.9, this.nightAmount) * 0.82;

      return this.getClock();
    }

    getClock() {
      const hourFloat = (this.phase * 24 + 6) % 24;
      const hour = Math.floor(hourFloat);
      const minute = Math.floor((hourFloat - hour) * 60);
      let label = 'Night';
      if (hour >= 5 && hour < 8) label = 'Daybreak';
      else if (hour >= 8 && hour < 17) label = 'Daylight';
      else if (hour >= 17 && hour < 20) label = 'Golden hour';
      return {
        label,
        value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        color: this.sunLight.color
      };
    }
  }

  class TokyoIsland {
    constructor(scene) {
      this.group = new THREE.Group();
      this.group.name = 'Floating Tokyo Island';
      this.lightMaterials = [];
      this.waterMaterials = [];
      scene.add(this.group);

      this.materials = {
        rock: toon('#7c6251'),
        rockDark: toon('#58483f'),
        grass: toon('#6fa85e'),
        grassEdge: toon('#4f7f48'),
        cream: toon('#f4ead1'),
        red: toon('#e24d45'),
        redDark: toon('#a82e34'),
        charcoal: toon('#26363b'),
        wood: toon('#694336'),
        roof: toon('#33454b'),
        snow: toon('#f6fbf7'),
        mountain: toon('#6e8790'),
        path: toon('#d8c5a5'),
        blossom: toon('#ef8f80'),
        maple: toon('#d85d3d'),
        water: standard('#4eb2bf', { roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.82 })
      };

      this.buildIsland();
      this.buildTokyoTower();
      this.buildFuji();
      this.buildTorii();
      this.buildPagoda();
      this.buildGarden();
    }

    makeLightMaterial(color = '#ffd36d') {
      const material = standard('#675334', {
        emissive: color,
        emissiveIntensity: 0,
        roughness: 0.5
      });
      this.lightMaterials.push(material);
      return material;
    }

    buildIsland() {
      const rock = mesh(new THREE.CylinderGeometry(3.3, 8.1, 4.4, 12, 4), this.materials.rock);
      rock.position.y = -0.3;
      this.group.add(rock);

      const rockBand = mesh(new THREE.CylinderGeometry(5.3, 7.8, 1.2, 12), this.materials.rockDark);
      rockBand.position.y = -2.25;
      this.group.add(rockBand);

      const top = mesh(new THREE.CylinderGeometry(8.25, 8.05, 0.68, 12), this.materials.grass);
      top.position.y = 2.17;
      this.group.add(top);

      const edge = mesh(new THREE.TorusGeometry(8.03, 0.2, 5, 12), this.materials.grassEdge);
      edge.rotation.x = Math.PI / 2;
      edge.position.y = 1.95;
      this.group.add(edge);

      const shardPositions = [
        [-2.8, -3.7, -1.4, 1.1], [2.2, -3.7, -2.1, 0.85], [0.1, -4.2, 2.1, 1.2],
        [-4.3, -3.2, 1.7, 0.72], [4.2, -3.1, 1.1, 0.7]
      ];
      for (const [x, y, z, size] of shardPositions) {
        const shard = mesh(new THREE.ConeGeometry(size, 2.9 * size, 5), this.materials.rockDark);
        shard.position.set(x, y, z);
        shard.rotation.z = (x + z) * 0.06;
        this.group.add(shard);
      }

      const pond = mesh(new THREE.CircleGeometry(2.05, 20), this.materials.water, false, true);
      pond.rotation.x = -Math.PI / 2;
      pond.scale.set(1.35, 0.72, 1);
      pond.position.set(-3.35, 2.53, 2.75);
      this.group.add(pond);
      this.waterMaterials.push(pond.material);

      for (let i = 0; i < 9; i += 1) {
        const stone = mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.11, 8), this.materials.path);
        const t = i / 8;
        stone.position.set(-1.15 + t * 4.9, 2.56, 1.15 + Math.sin(t * Math.PI) * 0.65);
        stone.scale.z = 0.72;
        this.group.add(stone);
      }
    }

    buildTokyoTower() {
      const tower = new THREE.Group();
      tower.name = 'Tokyo Tower';
      tower.position.set(0, 2.55, -0.25);
      this.group.add(tower);

      const legBottom = 1.65;
      const legMid = 0.62;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < corners.length; i += 1) {
        const [sx, sz] = corners[i];
        addBeam(
          tower,
          new THREE.Vector3(sx * legBottom, 0, sz * legBottom),
          new THREE.Vector3(sx * legMid, 4.4, sz * legMid),
          0.22,
          i % 2 ? this.materials.cream : this.materials.red
        );
        addBeam(
          tower,
          new THREE.Vector3(sx * legMid, 4.35, sz * legMid),
          new THREE.Vector3(sx * 0.23, 7.15, sz * 0.23),
          0.17,
          i % 2 ? this.materials.red : this.materials.cream
        );
      }

      const levels = [1.25, 2.45, 3.55, 4.7, 5.75, 6.75];
      for (let i = 0; i < levels.length; i += 1) {
        const y = levels[i];
        const width = THREE.MathUtils.lerp(2.75, 0.62, y / 7.2);
        addBox(tower, [width, 0.1, 0.12], [0, y, 0], i % 2 ? this.materials.cream : this.materials.red);
        addBox(tower, [0.12, 0.1, width], [0, y, 0], i % 2 ? this.materials.cream : this.materials.red);
      }

      for (let side = -1; side <= 1; side += 2) {
        addBeam(tower, new THREE.Vector3(-1.25, 1.1, side * 1.2), new THREE.Vector3(1.05, 3.2, side * 0.92), 0.09, this.materials.redDark);
        addBeam(tower, new THREE.Vector3(1.25, 1.1, side * 1.2), new THREE.Vector3(-1.05, 3.2, side * 0.92), 0.09, this.materials.cream);
      }

      const deckLight = this.makeLightMaterial('#ffd27c');
      addBox(tower, [1.75, 0.48, 1.75], [0, 4.35, 0], this.materials.charcoal);
      for (let side = -1; side <= 1; side += 2) {
        addBox(tower, [1.48, 0.18, 0.04], [0, 4.38, side * 0.89], deckLight);
        addBox(tower, [0.04, 0.18, 1.48], [side * 0.89, 4.38, 0], deckLight);
      }
      addBox(tower, [0.72, 0.35, 0.72], [0, 7.1, 0], this.materials.charcoal);
      addBox(tower, [0.08, 2.4, 0.08], [0, 8.45, 0], this.materials.red);
      addBox(tower, [0.04, 0.95, 0.04], [0, 10.1, 0], this.materials.cream);

      const beaconMaterial = this.makeLightMaterial('#ff785f');
      const beacon = mesh(new THREE.SphereGeometry(0.12, 10, 8), beaconMaterial);
      beacon.position.y = 10.62;
      tower.add(beacon);
    }

    buildFuji() {
      const fuji = new THREE.Group();
      fuji.name = 'Mount Fuji';
      fuji.position.set(-4.65, 2.5, -2.65);
      fuji.scale.set(1.15, 1, 0.9);
      this.group.add(fuji);

      const mountain = mesh(new THREE.ConeGeometry(2.45, 4.05, 8), this.materials.mountain);
      mountain.position.y = 1.8;
      fuji.add(mountain);
      const snow = mesh(new THREE.ConeGeometry(0.91, 1.18, 8), this.materials.snow);
      snow.position.y = 3.47;
      fuji.add(snow);
      const foothill = mesh(new THREE.CylinderGeometry(2.35, 2.55, 0.2, 8), this.materials.grassEdge);
      foothill.position.y = -0.1;
      fuji.add(foothill);
    }

    buildTorii() {
      const torii = new THREE.Group();
      torii.name = 'Torii Gate';
      torii.position.set(4.75, 2.55, -2.65);
      torii.rotation.y = -0.2;
      this.group.add(torii);

      addBox(torii, [0.3, 2.8, 0.3], [-1.05, 1.35, 0], this.materials.red);
      addBox(torii, [0.3, 2.8, 0.3], [1.05, 1.35, 0], this.materials.red);
      addBox(torii, [2.85, 0.28, 0.42], [0, 2.35, 0], this.materials.redDark);
      const lintel = addBox(torii, [3.45, 0.3, 0.52], [0, 2.85, 0], this.materials.red);
      lintel.geometry.translate(0, 0.05, 0);
      addBox(torii, [0.58, 0.46, 0.18], [0, 2.55, 0.31], this.materials.charcoal);

      const lantern = this.makeLightMaterial('#ffcf73');
      for (const x of [-1.55, 1.55]) {
        addBox(torii, [0.08, 1.05, 0.08], [x, 0.52, 0.2], this.materials.charcoal);
        addBox(torii, [0.28, 0.34, 0.28], [x, 1.05, 0.2], lantern);
      }
    }

    buildPagoda() {
      const pagoda = new THREE.Group();
      pagoda.name = 'Five-storey Pagoda';
      pagoda.position.set(4.0, 2.52, 2.6);
      pagoda.scale.setScalar(0.78);
      this.group.add(pagoda);

      const windowLight = this.makeLightMaterial('#ffd27c');
      for (let level = 0; level < 4; level += 1) {
        const y = level * 1.02;
        const scale = 1 - level * 0.12;
        addBox(pagoda, [1.35 * scale, 0.72, 1.35 * scale], [0, y + 0.42, 0], level % 2 ? this.materials.cream : this.materials.redDark);
        for (const side of [-1, 1]) {
          addBox(pagoda, [0.34, 0.28, 0.03], [0, y + 0.45, side * 0.69 * scale], windowLight);
        }
        const roof = mesh(new THREE.ConeGeometry(1.25 * scale, 0.5, 4), this.materials.roof);
        roof.position.y = y + 0.98;
        roof.rotation.y = Math.PI / 4;
        pagoda.add(roof);
      }
      addBox(pagoda, [0.08, 1.25, 0.08], [0, 4.52, 0], this.materials.charcoal);
      const finial = mesh(new THREE.SphereGeometry(0.12, 8, 6), this.makeLightMaterial('#ffd974'));
      finial.position.y = 5.16;
      pagoda.add(finial);
    }

    buildGarden() {
      const treeSpots = [
        [-5.9, 0.25, 1.2, '#df5a3d'], [-2.1, -4.5, 0.9, '#ee8650'], [2.2, -4.9, 0.85, '#c9453e'],
        [6.0, 0.35, 0.72, '#f0a557'], [-5.35, 4.15, 0.85, '#df7460'], [1.35, 4.95, 0.7, '#ef8f80']
      ];
      for (const [x, z, scale, color] of treeSpots) {
        const tree = new THREE.Group();
        tree.position.set(x, 2.52, z);
        tree.scale.setScalar(scale);
        this.group.add(tree);
        const trunk = mesh(new THREE.CylinderGeometry(0.16, 0.25, 1.7, 6), this.materials.wood);
        trunk.position.y = 0.82;
        tree.add(trunk);
        const crownMaterial = toon(color);
        for (const offset of [[0, 1.75, 0], [-0.46, 1.58, 0.08], [0.45, 1.58, 0.04], [0.05, 1.55, 0.45]]) {
          const crown = mesh(new THREE.DodecahedronGeometry(0.68, 0), crownMaterial);
          crown.position.set(offset[0], offset[1], offset[2]);
          tree.add(crown);
        }
      }

      for (let i = 0; i < 14; i += 1) {
        const angle = (i / 14) * TAU + 0.18;
        const radius = 7.55;
        const flower = mesh(new THREE.SphereGeometry(0.1, 6, 5), i % 3 ? this.materials.blossom : this.materials.cream);
        flower.position.set(Math.cos(angle) * radius, 2.63, Math.sin(angle) * radius);
        this.group.add(flower);
      }
    }

    update(elapsed) {
      this.group.position.y = Math.sin(elapsed * 0.82) * 0.2;
      for (const material of this.waterMaterials) material.opacity = 0.76 + Math.sin(elapsed * 1.8) * 0.06;
    }
  }

  class MapleLeafPool {
    constructor(scene, maxCount = 150) {
      this.maxCount = maxCount;
      this.activeCount = maxCount;
      this.random = seededRandom(20260710);
      this.time = 0;
      this.dummy = new THREE.Object3D();
      this.positionX = new Float32Array(maxCount);
      this.positionY = new Float32Array(maxCount);
      this.positionZ = new Float32Array(maxCount);
      this.speed = new Float32Array(maxCount);
      this.phase = new Float32Array(maxCount);
      this.spin = new Float32Array(maxCount);
      this.drift = new Float32Array(maxCount);
      this.scale = new Float32Array(maxCount);

      const shape = new THREE.Shape();
      shape.moveTo(0, 0.34);
      shape.lineTo(0.11, 0.12);
      shape.lineTo(0.34, 0.14);
      shape.lineTo(0.18, -0.02);
      shape.lineTo(0.26, -0.27);
      shape.lineTo(0, -0.12);
      shape.lineTo(-0.26, -0.27);
      shape.lineTo(-0.18, -0.02);
      shape.lineTo(-0.34, 0.14);
      shape.lineTo(-0.11, 0.12);
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false
      });
      this.mesh = new THREE.InstancedMesh(geometry, material, maxCount);
      this.mesh.name = 'Pooled maple leaves';
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = true;
      scene.add(this.mesh);

      const colors = ['#de4b37', '#f1783e', '#f4ad4f', '#c83d3a'];
      for (let i = 0; i < maxCount; i += 1) {
        this.reset(i, true);
        this.mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      }
      this.mesh.instanceColor.needsUpdate = true;
    }

    reset(index, initial = false) {
      const angle = this.random() * TAU;
      const radius = 2.2 + this.random() * 8.8;
      this.positionX[index] = Math.cos(angle) * radius;
      this.positionZ[index] = Math.sin(angle) * radius;
      this.positionY[index] = initial ? 2.8 + this.random() * 14 : 14 + this.random() * 4;
      this.speed[index] = 0.55 + this.random() * 1.35;
      this.phase[index] = this.random() * TAU;
      this.spin[index] = (this.random() - 0.5) * 2.8;
      this.drift[index] = 0.4 + this.random() * 1.15;
      this.scale[index] = 0.42 + this.random() * 0.55;
    }

    setCompact(compact) {
      this.activeCount = compact ? 92 : this.maxCount;
      this.mesh.count = this.activeCount;
      leafCount.textContent = `${this.activeCount} maple leaves`;
    }

    update(deltaTime, elapsed) {
      this.time += deltaTime;
      const islandY = Math.sin(elapsed * 0.82) * 0.2;
      for (let i = 0; i < this.activeCount; i += 1) {
        this.positionY[i] -= this.speed[i] * deltaTime;
        this.positionX[i] += (0.26 + Math.sin(this.time * this.drift[i] + this.phase[i]) * 0.22) * deltaTime;
        this.positionZ[i] += Math.cos(this.time * 0.72 + this.phase[i]) * 0.11 * deltaTime;
        if (this.positionY[i] < 1.7 + islandY) this.reset(i, false);

        this.dummy.position.set(this.positionX[i], this.positionY[i], this.positionZ[i]);
        this.dummy.rotation.set(
          this.phase[i] + this.time * this.spin[i] * 0.45,
          this.time * this.spin[i],
          Math.sin(this.time * 1.7 + this.phase[i]) * 0.9
        );
        const pulse = this.scale[i] * (0.88 + Math.sin(this.time * 2 + this.phase[i]) * 0.12);
        this.dummy.scale.setScalar(pulse);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function createSky() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#42a8dc') },
        bottomColor: { value: new THREE.Color('#c7eff2') }
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorld = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorld;
        void main() {
          float h = smoothstep(-24.0, 55.0, vWorld.y);
          gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
        }
      `
    });
    return mesh(new THREE.SphereGeometry(82, 24, 16), material, false, false);
  }

  function createStars(random) {
    const positions = [];
    for (let i = 0; i < 180; i += 1) {
      const theta = random() * TAU;
      const phi = Math.acos(THREE.MathUtils.lerp(-0.15, 1, random()));
      const radius = 70;
      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: '#fff7cf', size: 0.34, transparent: true, opacity: 0, depthWrite: false });
    return new THREE.Points(geometry, material);
  }

  function createClouds(scene) {
    const clouds = [];
    const material = toon('#f5f2e7', { transparent: true, opacity: 0.88, depthWrite: false });
    const spots = [[-15, 10.5, -9, 1.2], [12, 13, -13, 1.5], [-9, 15.5, 7, 0.9], [17, 9, 7, 1.1]];
    for (let c = 0; c < spots.length; c += 1) {
      const [x, y, z, scale] = spots[c];
      const cloud = new THREE.Group();
      cloud.position.set(x, y, z);
      cloud.scale.setScalar(scale);
      for (const blob of [[0, 0, 0, 1], [1, 0, 0, 0.75], [-1, -0.05, 0, 0.68], [0.35, 0.42, 0, 0.72]]) {
        const puff = mesh(new THREE.SphereGeometry(blob[3], 10, 7), material, false, false);
        puff.position.set(blob[0], blob[1], blob[2]);
        puff.scale.z = 0.68;
        cloud.add(puff);
      }
      scene.add(cloud);
      clouds.push({ group: cloud, speed: 0.2 + c * 0.035 });
    }
    return clouds;
  }

  try {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#b9e4e7', 0.009);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 180);
    const controls = new CameraController(camera, canvas);

    const sky = createSky();
    scene.add(sky);
    const stars = createStars(seededRandom(104729));
    scene.add(stars);

    const ambientLight = new THREE.HemisphereLight('#d9edff', '#66536c', 1.2);
    scene.add(ambientLight);
    const nightFill = new THREE.AmbientLight('#8097c4', 0.5);
    scene.add(nightFill);
    const sunLight = new THREE.DirectionalLight('#fff1bf', 2.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.left = -14;
    sunLight.shadow.camera.right = 14;
    sunLight.shadow.camera.top = 16;
    sunLight.shadow.camera.bottom = -12;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 60;
    scene.add(sunLight);

    const sun = mesh(new THREE.SphereGeometry(2.05, 18, 12), new THREE.MeshBasicMaterial({ color: '#ffe09a' }), false, false);
    const moon = mesh(new THREE.SphereGeometry(1.45, 18, 12), new THREE.MeshBasicMaterial({ color: '#d9e8f3' }), false, false);
    scene.add(sun, moon);

    const island = new TokyoIsland(scene);
    const leaves = new MapleLeafPool(scene);
    const clouds = createClouds(scene);
    const cycle = new DayNightCycle(scene, sky, sunLight, ambientLight, sun, moon, stars, island.lightMaterials);

    const nightLamp = new THREE.PointLight('#ffbd66', 0, 13, 2);
    nightLamp.position.set(0, 7.2, -0.25);
    scene.add(nightLamp);

    function resize() {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const compact = width <= 520 || height <= 300;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.35 : 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = compact ? 42 : 38;
      camera.updateProjectionMatrix();
      leaves.setCompact(compact);
    }

    resize();
    window.addEventListener('resize', resize);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(document.querySelector('#app'));

    resetButton.addEventListener('click', () => controls.reset());
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'r') controls.reset();
      if (event.key === 'ArrowLeft') controls.targetYaw += 0.2;
      if (event.key === 'ArrowRight') controls.targetYaw -= 0.2;
    });

    const clock = new THREE.Clock();
    let elapsed = 0;
    let frame = 0;
    function animate() {
      requestAnimationFrame(animate);
      const deltaTime = Math.min(clock.getDelta(), 0.05);
      elapsed += deltaTime;

      controls.update(deltaTime);
      island.update(elapsed);
      leaves.update(deltaTime, elapsed);
      const time = cycle.update(elapsed);
      nightLamp.intensity = cycle.nightAmount * 1.4;
      for (let i = 0; i < clouds.length; i += 1) {
        const cloud = clouds[i];
        cloud.group.position.x += cloud.speed * deltaTime;
        if (cloud.group.position.x > 22) cloud.group.position.x = -22;
        cloud.group.position.y += Math.sin(elapsed * 0.4 + i) * 0.002;
      }

      if (frame % 6 === 0) {
        timeLabel.textContent = time.label;
        timeValue.textContent = time.value;
        timeOrb.style.backgroundColor = `#${time.color.getHexString()}`;
        timeOrb.style.boxShadow = `0 0 8px #${time.color.getHexString()}`;
      }
      frame += 1;
      renderer.render(scene, camera);
    }

    controls.update(0.016);
    renderer.render(scene, camera);
    requestAnimationFrame(() => loadingPanel.classList.add('ready'));
    animate();
  } catch (error) {
    console.error(error);
    loadingPanel.hidden = true;
    errorPanel.hidden = false;
    errorPanel.querySelector('span').textContent = error.message || 'The scene could not be initialized.';
  }
})();
