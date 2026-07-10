(() => {
  'use strict';

  const loadingPanel = document.querySelector('#loading');
  const errorPanel = document.querySelector('#error');
  if (!window.THREE) {
    loadingPanel.hidden = true;
    errorPanel.hidden = false;
    return;
  }

  const canvas = document.querySelector('#scene');
  const resetButton = document.querySelector('#reset-view');
  const timeLabel = document.querySelector('#time-label');
  const timeValue = document.querySelector('#time-value');
  const timeOrb = document.querySelector('#time-orb');
  const seasonLabel = document.querySelector('#season-label');
  const particleCount = document.querySelector('#particle-count');
  const seasonButtons = [...document.querySelectorAll('[data-season]')];

  const TAU = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothstep = (min, max, value) => {
    const x = clamp((value - min) / (max - min), 0, 1);
    return x * x * (3 - 2 * x);
  };

  function seededRandom(seed = 1) {
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
    return new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options });
  }

  function mesh(geometry, material, cast = true, receive = true) {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = cast;
    item.receiveShadow = receive;
    return item;
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

  function weightedColor(target, colors, weights) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < colors.length; i += 1) {
      r += colors[i].r * weights[i];
      g += colors[i].g * weights[i];
      b += colors[i].b * weights[i];
    }
    return target.setRGB(r, g, b);
  }

  class CameraController {
    constructor(camera, element) {
      this.camera = camera;
      this.element = element;
      this.yaw = -0.34;
      this.targetYaw = this.yaw;
      this.radius = 24;
      this.targetRadius = this.radius;
      this.target = new THREE.Vector3(0, 3.05, 0);
      this.dragging = false;
      this.lastX = 0;
      this.idle = 0;

      element.addEventListener('pointerdown', (event) => {
        this.dragging = true;
        this.lastX = event.clientX;
        this.idle = 0;
        element.setPointerCapture(event.pointerId);
      });
      element.addEventListener('pointermove', (event) => {
        if (!this.dragging) return;
        const dx = event.clientX - this.lastX;
        this.lastX = event.clientX;
        this.targetYaw -= dx * 0.009;
      });
      const release = (event) => {
        this.dragging = false;
        if (event.pointerId !== undefined && element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
      };
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('wheel', (event) => {
        event.preventDefault();
        this.targetRadius = clamp(this.targetRadius + event.deltaY * 0.012, 18, 30);
        this.idle = 0;
      }, { passive: false });
    }

    reset() {
      this.targetYaw = -0.34;
      this.targetRadius = 24;
      this.idle = 0;
    }

    update(deltaTime) {
      this.idle += deltaTime;
      if (!this.dragging && this.idle > 4) this.targetYaw += deltaTime * 0.05;
      const damping = 1 - Math.exp(-deltaTime * 8);
      this.yaw += (this.targetYaw - this.yaw) * damping;
      this.radius += (this.targetRadius - this.radius) * damping;
      this.camera.position.set(Math.sin(this.yaw) * this.radius, 11.4, Math.cos(this.yaw) * this.radius);
      this.camera.lookAt(this.target);
    }
  }

  class SeasonCycle {
    constructor(buttons) {
      this.buttons = buttons;
      this.weights = [1, 0, 0, 0];
      this.desired = [1, 0, 0, 0];
      this.autoTime = 0;
      this.manualSeason = 0;
      this.manualRemaining = 0;
      this.dominant = 0;
      this.names = ['Spring mist', 'Summer sun', 'Autumn leaves', 'Winter snow'];

      for (const button of buttons) {
        button.addEventListener('click', () => this.choose(Number(button.dataset.season)));
      }
    }

    choose(index) {
      this.manualSeason = index;
      this.manualRemaining = 8;
      this.autoTime = index * 12;
      this.desired.fill(0);
      this.desired[index] = 1;
      this.updateButtons(index);
    }

    updateButtons(index) {
      for (let i = 0; i < this.buttons.length; i += 1) {
        this.buttons[i].setAttribute('aria-pressed', String(i === index));
      }
    }

    update(deltaTime) {
      this.autoTime += deltaTime;
      if (this.manualRemaining > 0) {
        this.manualRemaining -= deltaTime;
        this.desired.fill(0);
        this.desired[this.manualSeason] = 1;
      } else {
        // Each 12-second season reserves its final 3 seconds for a smooth crossfade.
        const seasonPosition = (this.autoTime % 48) / 12;
        const index = Math.floor(seasonPosition);
        const local = seasonPosition - index;
        const next = (index + 1) % 4;
        const blend = smoothstep(0.72, 1, local);
        this.desired.fill(0);
        this.desired[index] = 1 - blend;
        this.desired[next] = blend;
      }

      const damping = 1 - Math.exp(-deltaTime * 3.2);
      for (let i = 0; i < 4; i += 1) this.weights[i] += (this.desired[i] - this.weights[i]) * damping;
      this.dominant = this.weights.indexOf(Math.max(...this.weights));
      this.updateButtons(this.dominant);
      return this.weights;
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
      this.nightAmount = 0;
      this.top = new THREE.Color();
      this.bottom = new THREE.Color();
      this.fogColor = new THREE.Color();
      this.seasonTop = new THREE.Color();
      this.seasonBottom = new THREE.Color();
      this.seasonTopColors = ['#78b7c0', '#3e9dd0', '#7399aa', '#a3bac8'].map((c) => new THREE.Color(c));
      this.seasonBottomColors = ['#d7e4d9', '#f5df9e', '#e9bb91', '#d9e5e9'].map((c) => new THREE.Color(c));
      this.nightTop = new THREE.Color('#081425');
      this.nightBottom = new THREE.Color('#253b51');
      this.duskTop = new THREE.Color('#6a4b69');
      this.duskBottom = new THREE.Color('#f29a68');
      this.sunDay = new THREE.Color('#fff1bd');
      this.sunDusk = new THREE.Color('#ff8057');
    }

    update(elapsed, seasonWeights) {
      const phase = (elapsed % 15) / 15;
      const angle = phase * TAU;
      const sunHeight = Math.sin(angle);
      const dayAmount = smoothstep(-0.16, 0.24, sunHeight);
      const twilight = 1 - smoothstep(0.06, 0.5, Math.abs(sunHeight));
      this.nightAmount = 1 - dayAmount;

      weightedColor(this.seasonTop, this.seasonTopColors, seasonWeights);
      weightedColor(this.seasonBottom, this.seasonBottomColors, seasonWeights);
      this.top.copy(this.nightTop).lerp(this.seasonTop, dayAmount).lerp(this.duskTop, twilight * 0.62);
      this.bottom.copy(this.nightBottom).lerp(this.seasonBottom, dayAmount).lerp(this.duskBottom, twilight * 0.84);
      this.fogColor.copy(this.bottom).lerp(this.top, 0.18);
      this.sky.material.uniforms.topColor.value.copy(this.top);
      this.sky.material.uniforms.bottomColor.value.copy(this.bottom);
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.density = 0.008 + seasonWeights[0] * 0.016 + seasonWeights[3] * 0.003 + this.nightAmount * 0.002;

      this.sun.position.set(Math.cos(angle) * 38, sunHeight * 31, -18);
      this.moon.position.copy(this.sun.position).multiplyScalar(-1);
      this.sun.visible = sunHeight > -0.24;
      this.moon.visible = sunHeight < 0.34;
      this.sunLight.position.copy(this.sun.position).multiplyScalar(0.45);
      this.sunLight.intensity = 0.2 + dayAmount * (2.25 - seasonWeights[0] * 0.55 - seasonWeights[3] * 0.35);
      this.sunLight.color.copy(this.sunDusk).lerp(this.sunDay, dayAmount);
      this.ambientLight.intensity = 0.72 + dayAmount * 0.72;
      this.ambientLight.color.set(dayAmount > 0.45 ? '#dcefff' : '#91a1ce');

      const lampAmount = smoothstep(0.2, 0.72, this.nightAmount);
      for (const material of this.lightMaterials) material.emissiveIntensity = lampAmount * 2.15;
      this.stars.material.opacity = smoothstep(0.2, 0.9, this.nightAmount) * 0.8;

      const hourFloat = (phase * 24 + 6) % 24;
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

  class LondonIsland {
    constructor(scene) {
      this.group = new THREE.Group();
      this.group.name = 'Floating London Island';
      scene.add(this.group);
      this.lightMaterials = [];
      this.clockHands = [];
      this.foliageMaterial = toon('#79aa67');
      this.grassMaterial = toon('#79a765');
      this.snowMaterial = toon('#f0f2e8', { transparent: true, opacity: 0 });
      this.waterMaterial = standard('#3d9aaa', { roughness: 0.22, transparent: true, opacity: 0.86 });
      this.seasonGrass = ['#7fae74', '#6e9c55', '#a88752', '#8d9a83'].map((c) => new THREE.Color(c));
      this.seasonFoliage = ['#76b985', '#4f8d4e', '#c76642', '#94a49a'].map((c) => new THREE.Color(c));
      this.tempColor = new THREE.Color();
      this.wheel = null;
      this.bus = null;
      this.boat = null;

      this.materials = {
        rock: toon('#776254'), rockDark: toon('#51453f'), edge: toon('#4f744e'),
        sandstone: toon('#c6aa76'), stoneLight: toon('#e1cf9f'), charcoal: toon('#29363d'),
        bridgeBlue: toon('#4b7380'), bridgeDark: toon('#31525d'), roof: toon('#34505a'),
        red: toon('#c83f3d'), redDark: toon('#852e34'), cream: toon('#efe5cf'),
        road: toon('#4b5455'), wood: toon('#65483b'), hedge: toon('#46734e')
      };

      this.buildIsland();
      this.buildBigBen();
      this.buildLondonEye();
      this.buildTowerBridge();
      this.buildCityDetails();
    }

    lightMaterial(color = '#ffd270', base = '#65553b') {
      const material = standard(base, { emissive: color, emissiveIntensity: 0, roughness: 0.48 });
      this.lightMaterials.push(material);
      return material;
    }

    buildIsland() {
      const rock = mesh(new THREE.CylinderGeometry(3.6, 8.7, 4.5, 14, 4), this.materials.rock);
      rock.position.y = -0.25;
      this.group.add(rock);
      const rockBand = mesh(new THREE.CylinderGeometry(5.4, 8.35, 1.25, 14), this.materials.rockDark);
      rockBand.position.y = -2.3;
      this.group.add(rockBand);
      const grass = mesh(new THREE.CylinderGeometry(8.85, 8.65, 0.7, 14), this.grassMaterial);
      grass.position.y = 2.2;
      this.group.add(grass);
      const rim = mesh(new THREE.TorusGeometry(8.64, 0.2, 5, 14), this.materials.edge);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.97;
      this.group.add(rim);

      for (const [x, y, z, size] of [[-3, -3.6, -1.8, 1.1], [2.5, -3.8, -2.2, .9], [0, -4.2, 2.4, 1.2], [-4.5, -3.1, 2, .7], [4.5, -3.2, 1.2, .75]]) {
        const shard = mesh(new THREE.ConeGeometry(size, size * 2.9, 5), this.materials.rockDark);
        shard.position.set(x, y, z);
        this.group.add(shard);
      }

      const vertices = [];
      const indices = [];
      const segments = 18;
      for (let i = 0; i <= segments; i += 1) {
        const z = -8.2 + (i / segments) * 16.4;
        const x = 2.75 + Math.sin(z * 0.48) * 0.52;
        vertices.push(x - 0.82, 2.56, z, x + 0.82, 2.56, z);
        if (i < segments) {
          const a = i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const riverGeometry = new THREE.BufferGeometry();
      riverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      riverGeometry.setIndex(indices);
      riverGeometry.computeVertexNormals();
      this.group.add(mesh(riverGeometry, this.waterMaterial, false, true));

      const snowPatch = mesh(new THREE.CircleGeometry(8.3, 14), this.snowMaterial, false, true);
      snowPatch.rotation.x = -Math.PI / 2;
      snowPatch.position.y = 2.54;
      this.group.add(snowPatch);
    }

    buildBigBen() {
      const tower = new THREE.Group();
      tower.name = 'Big Ben';
      tower.position.set(-0.45, 2.56, 0.2);
      this.group.add(tower);
      const clockLight = this.lightMaterial('#ffd976', '#eee2ba');

      addBox(tower, [2.05, 0.58, 2.05], [0, 0.29, 0], this.materials.sandstone);
      addBox(tower, [1.55, 4.9, 1.55], [0, 2.98, 0], this.materials.sandstone);
      for (let y = 1.0; y < 5.2; y += 0.72) {
        for (const x of [-0.52, 0, 0.52]) addBox(tower, [0.16, 0.35, 0.08], [x, y, 0.79], this.materials.charcoal);
      }
      addBox(tower, [1.78, 1.42, 1.78], [0, 5.75, 0], this.materials.stoneLight);

      const face = mesh(new THREE.CircleGeometry(0.61, 24), clockLight, false, false);
      face.position.set(0, 5.77, 0.901);
      tower.add(face);
      const bezel = mesh(new THREE.TorusGeometry(0.63, 0.06, 6, 24), this.materials.charcoal);
      bezel.position.copy(face.position);
      tower.add(bezel);
      const hands = new THREE.Group();
      hands.position.set(0, 5.77, 0.97);
      addBox(hands, [0.08, 0.46, 0.05], [0, 0.18, 0], this.materials.charcoal);
      addBox(hands, [0.38, 0.06, 0.05], [0.15, 0, 0], this.materials.charcoal);
      tower.add(hands);
      this.clockHands.push(hands);

      const roof = mesh(new THREE.ConeGeometry(1.27, 1.75, 4), this.materials.roof);
      roof.position.y = 7.17;
      roof.rotation.y = Math.PI / 4;
      tower.add(roof);
      addBox(tower, [0.1, 1.65, 0.1], [0, 8.42, 0], this.materials.charcoal);
      const beacon = mesh(new THREE.SphereGeometry(0.12, 9, 7), this.lightMaterial('#ffc75d'));
      beacon.position.y = 9.28;
      tower.add(beacon);

      addBox(tower, [5.35, 1.38, 1.5], [-2.65, 0.73, 0.15], this.materials.sandstone);
      for (let x = -4.7; x < -0.8; x += 0.58) addBox(tower, [0.26, 0.35, 0.05], [x, 0.83, 0.93], clockLight);
    }

    buildLondonEye() {
      const eye = new THREE.Group();
      eye.name = 'London Eye';
      eye.position.set(-4.95, 2.65, -1.15);
      this.group.add(eye);
      this.wheel = new THREE.Group();
      this.wheel.position.y = 3.05;
      eye.add(this.wheel);
      const eyeMaterial = this.materials.cream;
      const cabinLight = this.lightMaterial('#bfeaff', '#55707a');
      this.wheel.add(mesh(new THREE.TorusGeometry(2.42, 0.1, 7, 36), eyeMaterial));
      for (let i = 0; i < 14; i += 1) {
        const angle = (i / 14) * TAU;
        addBeam(this.wheel, new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(angle) * 2.32, Math.sin(angle) * 2.32, 0), 0.035, eyeMaterial);
        const cabin = addBox(this.wheel, [0.33, 0.45, 0.3], [Math.cos(angle) * 2.42, Math.sin(angle) * 2.42, 0], cabinLight);
        cabin.rotation.z = angle;
      }
      addBox(eye, [0.42, 0.4, 0.42], [0, 3.05, 0], this.materials.charcoal);
      addBeam(eye, new THREE.Vector3(-1.65, 0, 0.1), new THREE.Vector3(0, 3.05, 0), 0.16, this.materials.cream);
      addBeam(eye, new THREE.Vector3(1.65, 0, 0.1), new THREE.Vector3(0, 3.05, 0), 0.16, this.materials.cream);
    }

    buildTowerBridge() {
      const bridge = new THREE.Group();
      bridge.name = 'Tower Bridge';
      bridge.position.set(3.05, 2.57, 0.15);
      bridge.scale.setScalar(0.88);
      this.group.add(bridge);
      const windowLight = this.lightMaterial('#ffd98b', '#536f75');

      addBox(bridge, [5.65, 0.34, 0.72], [0, 0.6, 0], this.materials.bridgeDark);
      addBox(bridge, [1.25, 0.12, 0.8], [0, 0.84, 0], this.materials.road, [0, 0, 0.13]);
      for (const x of [-1.45, 1.45]) {
        addBox(bridge, [0.92, 2.65, 1.05], [x, 1.72, 0], this.materials.stoneLight);
        addBox(bridge, [1.13, 0.28, 1.24], [x, 2.72, 0], this.materials.bridgeBlue);
        const roof = mesh(new THREE.ConeGeometry(0.76, 0.92, 4), this.materials.roof);
        roof.position.set(x, 3.3, 0);
        roof.rotation.y = Math.PI / 4;
        bridge.add(roof);
        for (const z of [-0.54, 0.54]) {
          addBox(bridge, [0.25, 0.38, 0.04], [x, 1.82, z], windowLight);
        }
      }
      addBox(bridge, [2.2, 0.32, 0.62], [0, 2.45, 0], this.materials.bridgeBlue);

      const cables = [[-2.8, 0.95, -1.45, 2.7], [-1.45, 2.7, 0, 1.25], [0, 1.25, 1.45, 2.7], [1.45, 2.7, 2.8, 0.95]];
      for (const [x1, y1, x2, y2] of cables) {
        const steps = 5;
        let previous = new THREE.Vector3(x1, y1, 0.48);
        for (let s = 1; s <= steps; s += 1) {
          const t = s / steps;
          const next = new THREE.Vector3(THREE.MathUtils.lerp(x1, x2, t), THREE.MathUtils.lerp(y1, y2, t) - Math.sin(t * Math.PI) * 0.34, 0.48);
          addBeam(bridge, previous, next, 0.045, this.materials.cream);
          previous = next;
        }
      }
    }

    buildCityDetails() {
      const treeSpots = [[-6.3, 2.9, .8], [-6.6, -3.9, .72], [-2.9, 5.3, .76], [1.1, -5.8, .75], [5.8, 4.0, .66], [6.8, -2.6, .7]];
      for (const [x, z, scale] of treeSpots) {
        const tree = new THREE.Group();
        tree.position.set(x, 2.53, z);
        tree.scale.setScalar(scale);
        this.group.add(tree);
        const trunk = mesh(new THREE.CylinderGeometry(0.16, 0.25, 1.5, 6), this.materials.wood);
        trunk.position.y = 0.72;
        tree.add(trunk);
        for (const offset of [[0, 1.55, 0], [-.4, 1.38, 0], [.4, 1.38, .05], [0, 1.35, .36]]) {
          const crown = mesh(new THREE.DodecahedronGeometry(0.62, 0), this.foliageMaterial);
          crown.position.set(offset[0], offset[1], offset[2]);
          tree.add(crown);
        }
      }

      this.bus = new THREE.Group();
      addBox(this.bus, [1.3, 0.86, 0.55], [0, .48, 0], this.materials.red);
      addBox(this.bus, [1.22, 0.62, 0.54], [0, 1.16, 0], this.materials.redDark);
      const busWindow = this.lightMaterial('#b8e8ee', '#3b5963');
      for (const x of [-.38, 0, .38]) addBox(this.bus, [.27, .27, .02], [x, 1.2, .29], busWindow);
      for (const x of [-.4, .4]) {
        const wheel = mesh(new THREE.CylinderGeometry(.14, .14, .08, 10), this.materials.charcoal);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, .2, .31);
        this.bus.add(wheel);
      }
      this.bus.scale.setScalar(.72);
      this.group.add(this.bus);

      this.boat = new THREE.Group();
      const hull = mesh(new THREE.ConeGeometry(.48, 1.25, 4), this.materials.redDark);
      hull.rotation.set(Math.PI / 2, 0, Math.PI / 4);
      hull.scale.z = .45;
      this.boat.add(hull);
      addBox(this.boat, [.55, .32, .42], [0, .27, 0], this.materials.cream);
      this.boat.position.y = 2.75;
      this.group.add(this.boat);

      const lampMaterial = this.lightMaterial('#ffd06d');
      for (const z of [-5.3, -3.2, 3.1, 5.2]) {
        addBox(this.group, [.07, .82, .07], [1.45, 2.93, z], this.materials.charcoal);
        addBox(this.group, [.24, .28, .2], [1.45, 3.37, z], lampMaterial);
      }
    }

    update(deltaTime, elapsed, weights) {
      this.group.position.y = Math.sin(elapsed * 0.78) * 0.2;
      weightedColor(this.tempColor, this.seasonGrass, weights);
      this.grassMaterial.color.copy(this.tempColor);
      weightedColor(this.tempColor, this.seasonFoliage, weights);
      this.foliageMaterial.color.copy(this.tempColor);
      this.snowMaterial.opacity = weights[3] * 0.72;
      this.waterMaterial.opacity = 0.8 + Math.sin(elapsed * 1.7) * 0.05;
      if (this.wheel) this.wheel.rotation.z -= deltaTime * 0.11;
      for (const hand of this.clockHands) hand.rotation.z = -elapsed * 0.08;
      if (this.bus) {
        const a = elapsed * 0.15;
        this.bus.position.set(Math.cos(a) * 6.45, 2.56, Math.sin(a) * 6.45);
        this.bus.rotation.y = -a + Math.PI / 2;
      }
      if (this.boat) {
        this.boat.position.x = 2.75 + Math.sin(elapsed * 0.28) * 0.45;
        this.boat.position.z = ((elapsed * 0.8 + 8) % 14) - 7;
      }
    }
  }

  class FallingPool {
    constructor(scene, type, maxCount, random) {
      this.type = type;
      this.maxCount = maxCount;
      this.activeCount = 0;
      this.random = random;
      this.dummy = new THREE.Object3D();
      this.x = new Float32Array(maxCount);
      this.y = new Float32Array(maxCount);
      this.z = new Float32Array(maxCount);
      this.speed = new Float32Array(maxCount);
      this.phase = new Float32Array(maxCount);
      this.scale = new Float32Array(maxCount);

      let geometry;
      let material;
      if (type === 'rain') {
        geometry = new THREE.BoxGeometry(0.025, 0.58, 0.025);
        material = new THREE.MeshBasicMaterial({ color: '#c5edf2', transparent: true, opacity: 0.5, toneMapped: false });
      } else if (type === 'snow') {
        geometry = new THREE.IcosahedronGeometry(0.105, 0);
        material = new THREE.MeshBasicMaterial({ color: '#f8ffff', transparent: true, opacity: 0.9, toneMapped: false });
      } else {
        const shape = new THREE.Shape();
        shape.moveTo(0, .3); shape.lineTo(.12, .08); shape.lineTo(.31, .12); shape.lineTo(.17, -.04);
        shape.lineTo(.22, -.25); shape.lineTo(0, -.11); shape.lineTo(-.22, -.25); shape.lineTo(-.17, -.04);
        shape.lineTo(-.31, .12); shape.lineTo(-.12, .08); shape.closePath();
        geometry = new THREE.ShapeGeometry(shape);
        material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false, fog: false });
      }

      this.mesh = new THREE.InstancedMesh(geometry, material, maxCount);
      this.mesh.name = `Pooled ${type} particles`;
      this.mesh.count = 0;
      this.mesh.frustumCulled = false;
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(this.mesh);
      const colors = ['#d9583e', '#e77a3f', '#f0a84d', '#bd4938'];
      for (let i = 0; i < maxCount; i += 1) {
        this.reset(i, true);
        if (type === 'leaf') this.mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      }
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    reset(index, initial) {
      const angle = this.random() * TAU;
      const radius = 1.5 + this.random() * 9.7;
      this.x[index] = Math.cos(angle) * radius;
      this.z[index] = Math.sin(angle) * radius;
      this.y[index] = initial ? 2.8 + this.random() * 14 : 14 + this.random() * 4;
      this.speed[index] = this.type === 'rain' ? 7 + this.random() * 4 : (this.type === 'snow' ? .65 + this.random() * .8 : .7 + this.random() * 1.15);
      this.phase[index] = this.random() * TAU;
      this.scale[index] = .55 + this.random() * .7;
    }

    setStrength(strength, compact) {
      const capacity = compact ? Math.floor(this.maxCount * .64) : this.maxCount;
      this.activeCount = Math.floor(capacity * clamp(strength, 0, 1));
      this.mesh.count = this.activeCount;
    }

    update(deltaTime, elapsed) {
      for (let i = 0; i < this.activeCount; i += 1) {
        this.y[i] -= this.speed[i] * deltaTime;
        if (this.type !== 'rain') {
          this.x[i] += (0.2 + Math.sin(elapsed * .9 + this.phase[i]) * .28) * deltaTime;
          this.z[i] += Math.cos(elapsed * .65 + this.phase[i]) * .12 * deltaTime;
        }
        if (this.y[i] < 1.75) this.reset(i, false);
        this.dummy.position.set(this.x[i], this.y[i], this.z[i]);
        if (this.type === 'leaf') {
          this.dummy.rotation.set(elapsed + this.phase[i], elapsed * 1.4 + this.phase[i], Math.sin(elapsed * 1.8 + this.phase[i]));
        } else if (this.type === 'snow') {
          this.dummy.rotation.set(this.phase[i], elapsed + this.phase[i], 0);
        } else {
          this.dummy.rotation.set(0, 0, -0.08);
        }
        this.dummy.scale.setScalar(this.scale[i]);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  class WeatherSystem {
    constructor(scene) {
      const random = seededRandom(20260711);
      this.rain = new FallingPool(scene, 'rain', 62, random);
      this.leaves = new FallingPool(scene, 'leaf', 125, random);
      this.snow = new FallingPool(scene, 'snow', 165, random);
      this.compact = false;
      this.mist = new THREE.Group();
      this.mistMaterials = [];
      scene.add(this.mist);
      for (let i = 0; i < 9; i += 1) {
        const material = new THREE.MeshBasicMaterial({ color: '#e3ece7', transparent: true, opacity: 0, depthWrite: false });
        const bank = mesh(new THREE.SphereGeometry(1.8 + (i % 3) * .5, 10, 7), material, false, false);
        bank.scale.set(2.6, .28, .72);
        bank.position.set(-10 + i * 2.6, 3.2 + (i % 2) * .5, -3 + (i % 4) * 2.4);
        this.mist.add(bank);
        this.mistMaterials.push(material);
      }
    }

    setCompact(value) {
      this.compact = value;
    }

    update(deltaTime, elapsed, weights, dominant) {
      this.rain.setStrength(weights[0] * .72, this.compact);
      this.leaves.setStrength(weights[2], this.compact);
      this.snow.setStrength(weights[3], this.compact);
      this.rain.update(deltaTime, elapsed);
      this.leaves.update(deltaTime, elapsed);
      this.snow.update(deltaTime, elapsed);
      for (let i = 0; i < this.mist.children.length; i += 1) {
        const bank = this.mist.children[i];
        this.mistMaterials[i].opacity = weights[0] * .1;
        bank.position.x += deltaTime * (.12 + i * .008);
        if (bank.position.x > 13) bank.position.x = -13;
      }
      const active = this.rain.activeCount + this.leaves.activeCount + this.snow.activeCount;
      const nouns = ['droplets', 'clear sky', 'maple leaves', 'snowflakes'];
      particleCount.textContent = dominant === 1 ? 'clear sky' : `${active} ${nouns[dominant]}`;
    }
  }

  function createSky() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { topColor: { value: new THREE.Color('#78b7c0') }, bottomColor: { value: new THREE.Color('#d7e4d9') } },
      vertexShader: `varying vec3 vWorld; void main(){ vec4 p=modelMatrix*vec4(position,1.0); vWorld=p.xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vWorld; void main(){ float h=smoothstep(-24.0,55.0,vWorld.y); gl_FragColor=vec4(mix(bottomColor,topColor,h),1.0); }`
    });
    return mesh(new THREE.SphereGeometry(82, 24, 16), material, false, false);
  }

  function createStars(random) {
    const positions = [];
    for (let i = 0; i < 180; i += 1) {
      const theta = random() * TAU;
      const phi = Math.acos(THREE.MathUtils.lerp(-.15, 1, random()));
      positions.push(70 * Math.sin(phi) * Math.cos(theta), 70 * Math.cos(phi), 70 * Math.sin(phi) * Math.sin(theta));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#fff6cf', size: .34, transparent: true, opacity: 0, depthWrite: false }));
  }

  function createClouds(scene) {
    const clouds = [];
    const material = toon('#f2f0e7', { transparent: true, opacity: .82, depthWrite: false });
    for (const [index, spot] of [[0, [-15, 11, -9, 1.2]], [1, [12, 14, -13, 1.45]], [2, [-9, 16, 7, .9]], [3, [17, 9.5, 7, 1.1]]]) {
      const cloud = new THREE.Group();
      cloud.position.set(spot[0], spot[1], spot[2]);
      cloud.scale.setScalar(spot[3]);
      for (const blob of [[0, 0, 1], [1, 0, .75], [-1, -.05, .68], [.35, .42, .72]]) {
        const puff = mesh(new THREE.SphereGeometry(blob[2], 10, 7), material, false, false);
        puff.position.set(blob[0], blob[1], 0);
        puff.scale.z = .68;
        cloud.add(puff);
      }
      scene.add(cloud);
      clouds.push({ group: cloud, speed: .18 + index * .035 });
    }
    return clouds;
  }

  try {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#c9ded8', .012);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const camera = new THREE.PerspectiveCamera(38, 1, .1, 180);
    const controls = new CameraController(camera, canvas);
    const sky = createSky();
    const stars = createStars(seededRandom(161803));
    scene.add(sky, stars);

    const ambientLight = new THREE.HemisphereLight('#dcefff', '#665a68', 1.2);
    const nightFill = new THREE.AmbientLight('#8097c4', .4);
    const sunLight = new THREE.DirectionalLight('#fff1bd', 2.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.left = -15;
    sunLight.shadow.camera.right = 15;
    sunLight.shadow.camera.top = 17;
    sunLight.shadow.camera.bottom = -13;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 60;
    scene.add(ambientLight, nightFill, sunLight);

    const sun = mesh(new THREE.SphereGeometry(2.05, 18, 12), new THREE.MeshBasicMaterial({ color: '#ffe09a' }), false, false);
    const moon = mesh(new THREE.SphereGeometry(1.45, 18, 12), new THREE.MeshBasicMaterial({ color: '#d9e8f3' }), false, false);
    scene.add(sun, moon);

    const island = new LondonIsland(scene);
    const seasons = new SeasonCycle(seasonButtons);
    const weather = new WeatherSystem(scene);
    const clouds = createClouds(scene);
    const dayNight = new DayNightCycle(scene, sky, sunLight, ambientLight, sun, moon, stars, island.lightMaterials);
    const cityGlow = new THREE.PointLight('#ffc86b', 0, 14, 2);
    cityGlow.position.set(0, 7, 0);
    scene.add(cityGlow);

    function resize() {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const compact = width <= 520 || height <= 300;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.35 : 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = compact ? 43 : 38;
      camera.updateProjectionMatrix();
      weather.setCompact(compact);
    }
    resize();
    window.addEventListener('resize', resize);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(document.querySelector('#app'));

    resetButton.addEventListener('click', () => controls.reset());
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'r') controls.reset();
      const number = Number(event.key);
      if (number >= 1 && number <= 4) seasons.choose(number - 1);
    });

    const clock = new THREE.Clock();
    let elapsed = 0;
    let frame = 0;
    function animate() {
      requestAnimationFrame(animate);
      const deltaTime = Math.min(clock.getDelta(), .05);
      elapsed += deltaTime;
      const weights = seasons.update(deltaTime);
      controls.update(deltaTime);
      island.update(deltaTime, elapsed, weights);
      weather.update(deltaTime, elapsed, weights, seasons.dominant);
      const time = dayNight.update(elapsed, weights);
      cityGlow.intensity = dayNight.nightAmount * 1.2;
      for (let i = 0; i < clouds.length; i += 1) {
        clouds[i].group.position.x += clouds[i].speed * deltaTime;
        if (clouds[i].group.position.x > 22) clouds[i].group.position.x = -22;
      }
      if (frame % 6 === 0) {
        timeLabel.textContent = time.label;
        timeValue.textContent = time.value;
        timeOrb.style.backgroundColor = `#${time.color.getHexString()}`;
        timeOrb.style.boxShadow = `0 0 8px #${time.color.getHexString()}`;
        seasonLabel.textContent = seasons.names[seasons.dominant];
      }
      frame += 1;
      renderer.render(scene, camera);
    }

    controls.update(.016);
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
