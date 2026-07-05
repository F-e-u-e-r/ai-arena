import * as THREE from 'three';

const DAY_LENGTH = 15;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function mixColors(a, b, t) {
  return new THREE.Color(
    lerp(a.r, b.r, t),
    lerp(a.g, b.g, t),
    lerp(a.b, b.b, t)
  );
}

function sampleKeys(keys, t) {
  const wrapped = (t % 1 + 1) % 1;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const current = keys[index];
    const next = keys[index + 1];
    if (wrapped >= current.t && wrapped <= next.t) {
      const local = smooth((wrapped - current.t) / (next.t - current.t || 1));
      return {
        top: mixColors(current.top, next.top, local),
        bottom: mixColors(current.bottom, next.bottom, local),
        fog: mixColors(current.fog, next.fog, local),
        ambient: lerp(current.ambient, next.ambient, local),
        sun: lerp(current.sun, next.sun, local),
        moon: lerp(current.moon, next.moon, local),
        towerLights: lerp(current.towerLights, next.towerLights, local)
      };
    }
  }
  return keys[0];
}

function makeLeafTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.translate(64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.bezierCurveTo(12, -34, 16, -20, 8, -10);
  ctx.bezierCurveTo(22, -12, 32, -4, 28, 10);
  ctx.bezierCurveTo(16, 10, 10, 18, 12, 34);
  ctx.bezierCurveTo(0, 24, -8, 18, -12, 34);
  ctx.bezierCurveTo(-10, 18, -16, 10, -28, 10);
  ctx.bezierCurveTo(-32, -4, -22, -12, -8, -10);
  ctx.bezierCurveTo(-16, -20, -12, -34, 0, -42);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(0, 40);
  ctx.moveTo(0, -10);
  ctx.lineTo(14, 8);
  ctx.moveTo(0, -6);
  ctx.lineTo(-14, 10);
  ctx.moveTo(0, 8);
  ctx.lineTo(10, 24);
  ctx.moveTo(0, 12);
  ctx.lineTo(-10, 24);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#84d6ff') },
      bottomColor: { value: new THREE.Color('#ffe2a1') }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, 18.0, 0.0)).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(0.0, 1.0, h)), 1.0);
      }
    `
  });
}

class OrbitRig {
  constructor(camera, element) {
    this.camera = camera;
    this.element = element;
    this.radius = 10.8;
    this.elevation = 4.6;
    this.azimuth = 0.65;
    this.targetAzimuth = 0.65;
    this.dragging = false;
    this.lastX = 0;
    this.autoRotate = 0.08;

    element.addEventListener('pointerdown', event => {
      this.dragging = true;
      this.lastX = event.clientX;
      element.setPointerCapture(event.pointerId);
    });

    element.addEventListener('pointermove', event => {
      if (!this.dragging) return;
      const delta = event.clientX - this.lastX;
      this.lastX = event.clientX;
      this.targetAzimuth -= delta * 0.008;
    });

    const stopDrag = event => {
      if (this.dragging) {
        this.dragging = false;
        element.releasePointerCapture(event.pointerId);
      }
    };

    element.addEventListener('pointerup', stopDrag);
    element.addEventListener('pointercancel', stopDrag);
  }

  reset() {
    this.targetAzimuth = 0.65;
  }

  update(dt, target) {
    if (!this.dragging) this.targetAzimuth += dt * this.autoRotate;
    this.azimuth = lerp(this.azimuth, this.targetAzimuth, 1 - Math.exp(-dt * 6));
    this.camera.position.set(
      Math.cos(this.azimuth) * this.radius,
      this.elevation + Math.sin(this.azimuth * 0.8) * 0.4,
      Math.sin(this.azimuth) * this.radius
    );
    this.camera.lookAt(target);
  }
}

class TokyoTower {
  constructor(gradientMap) {
    this.group = new THREE.Group();
    this.group.position.set(0, 1.1, 0);
    this.lightMaterials = [];
    this.pointLights = [];

    const red = new THREE.MeshToonMaterial({ color: '#f06448', gradientMap });
    const white = new THREE.MeshToonMaterial({ color: '#f7f3ec', gradientMap });
    const lit = new THREE.MeshToonMaterial({
      color: '#fff1c4',
      emissive: '#ffb948',
      emissiveIntensity: 0,
      gradientMap
    });
    this.lightMaterials.push(lit);

    const legGeometry = new THREE.BoxGeometry(0.18, 3.6, 0.18);
    const legPositions = [
      [-0.55, 1.8, -0.55],
      [0.55, 1.8, -0.55],
      [-0.32, 1.8, 0.52],
      [0.32, 1.8, 0.52]
    ];
    for (const [x, y, z] of legPositions) {
      const leg = new THREE.Mesh(legGeometry, red);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      this.group.add(leg);
    }

    const crossGeometry = new THREE.BoxGeometry(0.08, 0.08, 1.18);
    for (let y = 0.7; y <= 3.2; y += 0.45) {
      const front = new THREE.Mesh(crossGeometry, white);
      front.position.set(0, y, 0.56);
      front.rotation.y = Math.PI / 2;
      front.castShadow = true;
      this.group.add(front);

      const back = front.clone();
      back.position.z = -0.56;
      this.group.add(back);

      const side = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), white);
      side.position.set(0, y, 0);
      side.castShadow = true;
      this.group.add(side);
    }

    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.92, 0.32, 6), white);
    deck.position.y = 3.25;
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.group.add(deck);

    const upperDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.56, 0.24, 6), white);
    upperDeck.position.y = 4.08;
    upperDeck.castShadow = true;
    this.group.add(upperDeck);

    const antennaBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.8, 6), red);
    antennaBase.position.y = 5.15;
    antennaBase.castShadow = true;
    this.group.add(antennaBase);

    const antennaTip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.2, 5), white);
    antennaTip.position.y = 6.54;
    antennaTip.castShadow = true;
    this.group.add(antennaTip);

    for (let index = 0; index < 3; index += 1) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.2 - index * 0.18, 0.12, 1.2 - index * 0.18), lit);
      band.position.y = 2.3 + index * 0.9;
      band.castShadow = true;
      band.receiveShadow = true;
      this.group.add(band);
    }

    const beacon = new THREE.PointLight('#ff8f4b', 0, 5.5, 2);
    beacon.position.set(0, 6.9, 0);
    this.pointLights.push(beacon);
    this.group.add(beacon);
  }

  setLightLevel(level) {
    for (const material of this.lightMaterials) {
      material.emissiveIntensity = level * 2.2;
    }
    for (const light of this.pointLights) {
      light.intensity = level * 2.8;
    }
  }
}

class LandmarkLights {
  constructor() {
    this.materials = [];
    this.lights = [];
  }

  pushMaterial(material) {
    this.materials.push(material);
  }

  pushLight(light) {
    this.lights.push(light);
  }

  setLevel(level) {
    for (const material of this.materials) {
      material.emissiveIntensity = level * 1.8;
    }
    for (const light of this.lights) {
      light.intensity = level * 1.4;
    }
  }
}

class FloatingIsland {
  constructor(gradientMap, landmarkLights) {
    this.group = new THREE.Group();
    this.anchor = new THREE.Group();
    this.anchor.add(this.group);
    this.landmarkLights = landmarkLights;
    this.time = 0;

    const grass = new THREE.MeshToonMaterial({ color: '#6dbb62', gradientMap });
    const grassSide = new THREE.MeshToonMaterial({ color: '#5aa05a', gradientMap });
    const rock = new THREE.MeshToonMaterial({ color: '#776d73', gradientMap });
    const soil = new THREE.MeshToonMaterial({ color: '#9d7a55', gradientMap });
    const path = new THREE.MeshToonMaterial({ color: '#e2cfb1', gradientMap });

    const top = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.2, 1.2, 8), grass);
    top.position.y = 0.2;
    top.castShadow = true;
    top.receiveShadow = true;
    this.group.add(top);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.5, 0.26, 8), grassSide);
    rim.position.y = -0.3;
    rim.castShadow = true;
    this.group.add(rim);

    const underside = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4.2, 8), soil);
    underside.position.y = -2.55;
    underside.castShadow = true;
    underside.receiveShadow = true;
    this.group.add(underside);

    for (let index = 0; index < 10; index += 1) {
      const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + Math.random() * 0.18, 0), rock);
      const angle = index / 10 * Math.PI * 2;
      shard.position.set(Math.cos(angle) * (2 + Math.random() * 1.5), -3 + Math.random() * 0.6, Math.sin(angle) * (2 + Math.random() * 1.5));
      shard.rotation.set(Math.random(), Math.random(), Math.random());
      shard.castShadow = true;
      this.group.add(shard);
    }

    const pathRing = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.16, 8, 26), path);
    pathRing.rotation.x = Math.PI / 2;
    pathRing.position.y = 0.82;
    this.group.add(pathRing);

    const tower = new TokyoTower(gradientMap);
    this.tower = tower;
    this.group.add(tower.group);

    const fuji = this.buildFuji(gradientMap);
    fuji.position.set(-2.45, 0.78, 1.35);
    this.group.add(fuji);

    const torii = this.buildTorii(gradientMap, landmarkLights);
    torii.position.set(2.45, 0.72, -1.1);
    torii.rotation.y = -0.4;
    this.group.add(torii);

    const temple = this.buildTemple(gradientMap, landmarkLights);
    temple.position.set(-1.15, 0.74, -2.35);
    temple.rotation.y = 0.72;
    this.group.add(temple);

    for (let index = 0; index < 14; index += 1) {
      const tree = this.buildTree(gradientMap);
      const angle = index / 14 * Math.PI * 2;
      const radius = 2.8 + Math.sin(index) * 0.32;
      tree.position.set(Math.cos(angle) * radius, 0.78, Math.sin(angle) * radius);
      tree.scale.setScalar(0.9 + Math.random() * 0.35);
      this.group.add(tree);
    }
  }

  buildFuji(gradientMap) {
    const group = new THREE.Group();
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 1.8, 7),
      new THREE.MeshToonMaterial({ color: '#6f80b5', gradientMap })
    );
    mountain.castShadow = true;
    mountain.receiveShadow = true;
    group.add(mountain);

    const snowcap = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 0.52, 7),
      new THREE.MeshToonMaterial({ color: '#f6fbff', gradientMap })
    );
    snowcap.position.y = 0.72;
    snowcap.castShadow = true;
    group.add(snowcap);
    return group;
  }

  buildTorii(gradientMap, landmarkLights) {
    const group = new THREE.Group();
    const red = new THREE.MeshToonMaterial({ color: '#c94d40', gradientMap });
    const dark = new THREE.MeshToonMaterial({ color: '#3f2f32', gradientMap });
    const lantern = new THREE.MeshToonMaterial({
      color: '#ffe5a3',
      emissive: '#ffb84d',
      emissiveIntensity: 0,
      gradientMap
    });
    landmarkLights.pushMaterial(lantern);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.18), red);
    beam.position.y = 1.2;
    beam.castShadow = true;
    group.add(beam);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.26), dark);
    cap.position.y = 1.36;
    cap.castShadow = true;
    group.add(cap);

    for (const x of [-0.64, 0.64]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.42, 0.18), red);
      post.position.set(x, 0.56, 0);
      post.castShadow = true;
      group.add(post);

      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), lantern);
      lamp.position.set(x * 0.68, 0.6, 0.22);
      lamp.castShadow = true;
      group.add(lamp);
    }

    const light = new THREE.PointLight('#ffbe6b', 0, 3.8, 2);
    light.position.set(0, 0.9, 0.18);
    landmarkLights.pushLight(light);
    group.add(light);
    return group;
  }

  buildTemple(gradientMap, landmarkLights) {
    const group = new THREE.Group();
    const wall = new THREE.MeshToonMaterial({ color: '#efe3c8', gradientMap });
    const roof = new THREE.MeshToonMaterial({ color: '#39485d', gradientMap });
    const wood = new THREE.MeshToonMaterial({ color: '#724d38', gradientMap });
    const lantern = new THREE.MeshToonMaterial({
      color: '#fff0bf',
      emissive: '#ffac4b',
      emissiveIntensity: 0,
      gradientMap
    });
    landmarkLights.pushMaterial(lantern);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 1), wall);
    base.position.y = 0.44;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const roofMain = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.58, 4), roof);
    roofMain.rotation.y = Math.PI * 0.25;
    roofMain.position.y = 1.02;
    roofMain.castShadow = true;
    group.add(roofMain);

    const porch = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 1.2), wood);
    porch.position.set(0, 0.12, 0);
    porch.receiveShadow = true;
    group.add(porch);

    for (const x of [-0.36, 0.36]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), wood);
      col.position.set(x, 0.4, 0.38);
      col.castShadow = true;
      group.add(col);
    }

    for (const x of [-0.34, 0.34]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), lantern);
      lamp.position.set(x, 0.48, 0.62);
      lamp.castShadow = true;
      group.add(lamp);
    }

    const light = new THREE.PointLight('#ffc16f', 0, 3.5, 2);
    light.position.set(0, 0.78, 0.65);
    landmarkLights.pushLight(light);
    group.add(light);
    return group;
  }

  buildTree(gradientMap) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.74, 6),
      new THREE.MeshToonMaterial({ color: '#5e4135', gradientMap })
    );
    trunk.position.y = 0.38;
    trunk.castShadow = true;
    group.add(trunk);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 7, 6),
      new THREE.MeshToonMaterial({ color: '#d55e4f', gradientMap })
    );
    canopy.position.y = 0.88;
    canopy.castShadow = true;
    group.add(canopy);

    return group;
  }

  update(dt) {
    this.time += dt;
    this.anchor.position.y = Math.sin(this.time * 0.7) * 0.15;
    this.anchor.rotation.z = Math.sin(this.time * 0.26) * 0.015;
    this.anchor.rotation.x = Math.sin(this.time * 0.22) * 0.012;
  }
}

class MapleLeafSystem {
  constructor(scene, gradientMap) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.texture = makeLeafTexture();
    this.leaves = [];
    this.colors = ['#ff8f42', '#d84f4c', '#f1c15e'].map(color => new THREE.Color(color));
    this.geometry = new THREE.PlaneGeometry(0.34, 0.34);
    this.materials = this.colors.map(color => new THREE.MeshBasicMaterial({
      map: this.texture,
      color,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    }));

    for (let index = 0; index < 180; index += 1) {
      const mesh = new THREE.Mesh(this.geometry, this.materials[index % this.materials.length]);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      const state = { mesh };
      this.leaves.push(state);
      this.resetLeaf(state, true);
    }
  }

  resetLeaf(state, immediate = false) {
    const radius = 2 + Math.random() * 5.6;
    const angle = Math.random() * Math.PI * 2;
    state.orbit = angle;
    state.radius = radius;
    state.y = immediate ? Math.random() * 5.4 + 0.5 : 5.8 + Math.random() * 2.6;
    state.spinX = Math.random() * Math.PI * 2;
    state.spinY = Math.random() * Math.PI * 2;
    state.spinSpeedX = 1.2 + Math.random() * 2.2;
    state.spinSpeedY = 0.8 + Math.random() * 1.8;
    state.fallSpeed = 0.7 + Math.random() * 1.15;
    state.sway = 0.2 + Math.random() * 0.38;
    state.phase = Math.random() * Math.PI * 2;
    state.mesh.scale.setScalar(0.78 + Math.random() * 0.72);
  }

  // The leaf system is a fixed-size pool: meshes are created once and recycled
  // by re-seeding position/velocity when they fall below the island instead of
  // allocating or destroying geometry during long runs.
  update(dt) {
    for (const leaf of this.leaves) {
      leaf.y -= leaf.fallSpeed * dt;
      leaf.phase += dt * 1.6;
      leaf.orbit += dt * 0.22;
      leaf.spinX += dt * leaf.spinSpeedX;
      leaf.spinY += dt * leaf.spinSpeedY;

      const x = Math.cos(leaf.orbit) * leaf.radius + Math.sin(leaf.phase * 1.3) * leaf.sway;
      const z = Math.sin(leaf.orbit) * leaf.radius + Math.cos(leaf.phase * 1.1) * leaf.sway;
      leaf.mesh.position.set(x, leaf.y, z);
      leaf.mesh.rotation.set(leaf.spinX, leaf.spinY, leaf.phase * 1.4);

      if (leaf.y < -2.8) {
        this.resetLeaf(leaf);
      }
    }
  }
}

class DayNightCycle {
  constructor(scene, sky, ambient, sunLight, moonLight, sunMesh, moonMesh, stars, tower, landmarkLights) {
    this.scene = scene;
    this.sky = sky;
    this.ambient = ambient;
    this.sunLight = sunLight;
    this.moonLight = moonLight;
    this.sunMesh = sunMesh;
    this.moonMesh = moonMesh;
    this.stars = stars;
    this.tower = tower;
    this.landmarkLights = landmarkLights;
    this.elapsed = 0;
    this.speedMultiplier = 1;

    this.keys = [
      {
        t: 0,
        top: new THREE.Color('#88d8ff'),
        bottom: new THREE.Color('#ffe0a6'),
        fog: new THREE.Color('#b5dbff'),
        ambient: 1.1,
        sun: 2.1,
        moon: 0.08,
        towerLights: 0
      },
      {
        t: 0.25,
        top: new THREE.Color('#f37d62'),
        bottom: new THREE.Color('#ffb677'),
        fog: new THREE.Color('#ffb18a'),
        ambient: 0.8,
        sun: 1.15,
        moon: 0.12,
        towerLights: 0.6
      },
      {
        t: 0.5,
        top: new THREE.Color('#101d4f'),
        bottom: new THREE.Color('#394a7c'),
        fog: new THREE.Color('#1e2b65'),
        ambient: 0.36,
        sun: 0.15,
        moon: 1.4,
        towerLights: 1
      },
      {
        t: 0.75,
        top: new THREE.Color('#7896db'),
        bottom: new THREE.Color('#ffc195'),
        fog: new THREE.Color('#8ea6d9'),
        ambient: 0.72,
        sun: 0.85,
        moon: 0.42,
        towerLights: 0.3
      },
      {
        t: 1,
        top: new THREE.Color('#88d8ff'),
        bottom: new THREE.Color('#ffe0a6'),
        fog: new THREE.Color('#b5dbff'),
        ambient: 1.1,
        sun: 2.1,
        moon: 0.08,
        towerLights: 0
      }
    ];
  }

  toggleSpeed() {
    this.speedMultiplier = this.speedMultiplier === 1 ? 3.2 : 1;
  }

  get phase() {
    const t = (this.elapsed / DAY_LENGTH) % 1;
    if (t < 0.25) return 'Day';
    if (t < 0.5) return 'Dusk';
    if (t < 0.75) return 'Night';
    return 'Dawn';
  }

  update(dt) {
    this.elapsed = (this.elapsed + dt * this.speedMultiplier) % DAY_LENGTH;
    const t = this.elapsed / DAY_LENGTH;
    const sample = sampleKeys(this.keys, t);
    this.sky.uniforms.topColor.value.copy(sample.top);
    this.sky.uniforms.bottomColor.value.copy(sample.bottom);
    this.scene.background = sample.bottom.clone();
    this.scene.fog.color.copy(sample.fog);
    this.ambient.intensity = sample.ambient;
    this.sunLight.intensity = sample.sun;
    this.moonLight.intensity = sample.moon;
    this.tower.setLightLevel(sample.towerLights);
    this.landmarkLights.setLevel(sample.towerLights);

    const angle = t * Math.PI * 2 - Math.PI * 0.5;
    const radius = 20;
    this.sunMesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * 10 + 10, Math.sin(angle) * radius * 0.3);
    this.moonMesh.position.set(Math.cos(angle + Math.PI) * radius, Math.sin(angle + Math.PI) * 10 + 10, Math.sin(angle + Math.PI) * radius * 0.3);
    this.sunLight.position.copy(this.sunMesh.position);
    this.moonLight.position.copy(this.moonMesh.position);
    this.sunMesh.material.opacity = clamp(sample.sun / 2.2, 0, 1);
    this.moonMesh.material.opacity = clamp(sample.moon / 1.4, 0, 1);
    this.stars.material.opacity = clamp((sample.moon - 0.2) / 1.2, 0, 0.95);
  }
}

function createGradientMap() {
  const data = new Uint8Array([
    0, 0, 0, 255,
    126, 126, 126, 255,
    255, 255, 255, 255
  ]);
  const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function createStars() {
  const count = 300;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 44 + Math.random() * 22;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.55;
    positions[index * 3] = Math.cos(theta) * Math.sin(phi) * radius;
    positions[index * 3 + 1] = Math.cos(phi) * radius + 16;
    positions[index * 3 + 2] = Math.sin(theta) * Math.sin(phi) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#f3f6ff',
    size: 0.28,
    transparent: true,
    opacity: 0
  });
  return new THREE.Points(geometry, material);
}

function createCloudRing(gradientMap) {
  const group = new THREE.Group();
  const material = new THREE.MeshToonMaterial({ color: '#f8f2ff', gradientMap });
  for (let clusterIndex = 0; clusterIndex < 9; clusterIndex += 1) {
    const cluster = new THREE.Group();
    const angle = clusterIndex / 9 * Math.PI * 2;
    cluster.position.set(Math.cos(angle) * 8.8, 2 + Math.sin(clusterIndex * 0.7) * 0.5, Math.sin(angle) * 8.8);
    cluster.rotation.y = angle;
    cluster.userData.speed = 0.06 + Math.random() * 0.06;
    cluster.userData.baseY = cluster.position.y;

    for (let puffIndex = 0; puffIndex < 4; puffIndex += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.24, 10, 9), material);
      puff.position.set((puffIndex - 1.5) * 0.42, Math.sin(puffIndex) * 0.14, Math.random() * 0.2);
      puff.scale.y = 0.72;
      cluster.add(puff);
    }

    group.add(cluster);
  }
  return group;
}

function createBackgroundIslands(gradientMap) {
  const group = new THREE.Group();
  const rock = new THREE.MeshToonMaterial({ color: '#5b6378', gradientMap });
  const grass = new THREE.MeshToonMaterial({ color: '#6d8d72', gradientMap });

  for (let index = 0; index < 8; index += 1) {
    const island = new THREE.Group();
    const angle = index / 8 * Math.PI * 2;
    island.position.set(Math.cos(angle) * 18, -3.8 + Math.sin(index) * 0.4, Math.sin(angle) * 18);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.3, 0.4, 6), grass);
    top.castShadow = true;
    island.add(top);

    const base = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.5, 6), rock);
    base.position.y = -0.95;
    base.castShadow = true;
    island.add(base);
    group.add(island);
  }
  return group;
}

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#b5dbff', 10, 32);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
const orbitRig = new OrbitRig(camera, renderer.domElement);

const gradientMap = createGradientMap();
const ambient = new THREE.AmbientLight('#d8ecff', 1.1);
scene.add(ambient);

const sunLight = new THREE.DirectionalLight('#fff1d2', 2.1);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -10;
sunLight.shadow.camera.right = 10;
sunLight.shadow.camera.top = 10;
sunLight.shadow.camera.bottom = -10;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 40;
scene.add(sunLight);

const moonLight = new THREE.DirectionalLight('#9eb5ff', 0.1);
scene.add(moonLight);

const sky = createSkyMaterial();
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), sky);
scene.add(skyMesh);

const stars = createStars();
scene.add(stars);

const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1.15, 18, 16),
  new THREE.MeshBasicMaterial({ color: '#ffd67a', transparent: true, opacity: 1 })
);
scene.add(sunMesh);

const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.84, 18, 16),
  new THREE.MeshBasicMaterial({ color: '#dbe8ff', transparent: true, opacity: 0.1 })
);
scene.add(moonMesh);

const landmarkLights = new LandmarkLights();
const island = new FloatingIsland(gradientMap, landmarkLights);
scene.add(island.anchor);

const cloudRing = createCloudRing(gradientMap);
scene.add(cloudRing);

const distantIslands = createBackgroundIslands(gradientMap);
scene.add(distantIslands);

const leaves = new MapleLeafSystem(scene, gradientMap);
scene.add(leaves.group);

const groundGlow = new THREE.Mesh(
  new THREE.CircleGeometry(10, 36),
  new THREE.MeshBasicMaterial({ color: '#b7ddff', transparent: true, opacity: 0.06 })
);
groundGlow.rotation.x = -Math.PI / 2;
groundGlow.position.y = -4.4;
scene.add(groundGlow);

const cycle = new DayNightCycle(
  scene,
  sky,
  ambient,
  sunLight,
  moonLight,
  sunMesh,
  moonMesh,
  stars,
  island.tower,
  landmarkLights
);

const statsEl = document.getElementById('stats');
let debugVisible = true;
let fps = 60;
const clock = new THREE.Clock();
const target = new THREE.Vector3(0, 1.1, 0);

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

window.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'f') {
    cycle.toggleSpeed();
  } else if (event.key.toLowerCase() === 'r') {
    orbitRig.reset();
  } else if (event.key.toLowerCase() === 'd') {
    debugVisible = !debugVisible;
  }
});

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  fps = lerp(fps, 1 / Math.max(dt, 1 / 240), 0.08);
  cycle.update(dt);
  orbitRig.update(dt, target);
  island.update(dt);
  leaves.update(dt);

  for (const cluster of cloudRing.children) {
    cluster.rotation.y += dt * cluster.userData.speed;
    cluster.position.y = cluster.userData.baseY + Math.sin(clock.elapsedTime * 0.4 + cluster.position.x) * 0.08;
  }

  distantIslands.rotation.y += dt * 0.04;
  renderer.render(scene, camera);

  if (debugVisible) {
    statsEl.innerHTML = [
      `Phase: ${cycle.phase}`,
      `Cycle speed: ${cycle.speedMultiplier.toFixed(1)}x`,
      `Leaves: ${leaves.leaves.length}`,
      `FPS: ${fps.toFixed(1)}`
    ].join('<br>');
  } else {
    statsEl.innerHTML = [
      `Phase: ${cycle.phase}`,
      `Cycle speed: ${cycle.speedMultiplier.toFixed(1)}x`
    ].join('<br>');
  }

  requestAnimationFrame(animate);
}

resize();
animate();
