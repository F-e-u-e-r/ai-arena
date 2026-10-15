/* Tokyo, adrift. — a procedural little world. Three.js r160, no build step. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  function showError(message) {
    $("loading").classList.add("done");
    $("error-message").textContent = message;
    $("error-panel").hidden = false;
  }
  if (!window.THREE) {
    showError(
      "The sky could not load. Please connect to the internet so Three.js can arrive, then try again.",
    );
    return;
  }

  const T = window.THREE;
  const TAU = Math.PI * 2;
  const clamp = T.MathUtils.clamp;
  const mix = T.MathUtils.lerp;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  let seed = 1701;
  function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let v = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  }
  const range = (a, b) => mix(a, b, random());
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const unitOrb = new T.IcosahedronGeometry(1, 1);
  const up = new T.Vector3(0, 1, 0);

  function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent, material, x, y, z, w, h, d) {
    const object = mesh(unitBox, material, parent, x, y, z);
    object.scale.set(w, h, d);
    return object;
  }
  function orb(parent, material, x, y, z, sx, sy = sx, sz = sx) {
    const object = mesh(unitOrb, material, parent, x, y, z);
    object.scale.set(sx, sy, sz);
    object.rotation.y = random() * TAU;
    return object;
  }
  function cylinder(parent, material, x, y, z, top, bottom, height, sides = 8) {
    return mesh(
      new T.CylinderGeometry(top, bottom, height, sides),
      material,
      parent,
      x,
      y,
      z,
    );
  }
  function beam(parent, material, a, b, radius = 0.04, sides = 6) {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b);
    const direction = to.clone().sub(from);
    const object = mesh(
      new T.CylinderGeometry(radius, radius, direction.length(), sides),
      material,
      parent,
    );
    object.position.copy(from).add(to).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(up, direction.normalize());
    return object;
  }
  function triangleGeometry(positions, colors) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    if (colors)
      geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  // Bake static geometry once, grouping by material and shadow flags. Hundreds of
  // small architectural pieces become a few dozen draw calls. Animation is then
  // applied to their parent group, never by rebuilding geometry each frame.
  function batchStatic(root) {
    root.updateWorldMatrix(true, true);
    const inverse = new T.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();
    const originals = [];
    root.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh || object.userData.dynamic)
        return;
      const key = `${object.material.uuid}/${object.castShadow}/${object.receiveShadow}`;
      if (!buckets.has(key))
        buckets.set(key, {
          material: object.material,
          cast: object.castShadow,
          receive: object.receiveShadow,
          geometries: [],
        });
      let geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometry.applyMatrix4(
        new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld),
      );
      buckets.get(key).geometries.push(geometry);
      originals.push(object);
    });
    for (const item of buckets.values()) {
      const count = item.geometries.reduce(
        (sum, g) => sum + g.attributes.position.count,
        0,
      );
      const joined = new T.BufferGeometry();
      const names = item.material.vertexColors
        ? ["position", "normal", "color"]
        : ["position", "normal"];
      for (const name of names) {
        const output = new Float32Array(count * 3);
        let offset = 0;
        for (const geometry of item.geometries) {
          const attr = geometry.getAttribute(name);
          if (attr) output.set(attr.array, offset);
          else
            output.fill(
              name === "color" ? 1 : 0,
              offset,
              offset + geometry.attributes.position.count * 3,
            );
          offset += geometry.attributes.position.count * 3;
        }
        joined.setAttribute(name, new T.BufferAttribute(output, 3));
      }
      joined.computeBoundingSphere();
      const combined = new T.Mesh(joined, item.material);
      combined.castShadow = item.cast;
      combined.receiveShadow = item.receive;
      root.add(combined);
      item.geometries.forEach((g) => g.dispose());
    }
    const discarded = new Set();
    for (const object of originals) {
      object.removeFromParent();
      if (object.geometry !== unitBox && object.geometry !== unitOrb)
        discarded.add(object.geometry);
    }
    discarded.forEach((g) => g.dispose());
  }

  class Palette {
    constructor() {
      const gradient = new T.DataTexture(
        new Uint8Array([120, 185, 230, 255]),
        4,
        1,
        T.RedFormat,
      );
      gradient.minFilter = gradient.magFilter = T.NearestFilter;
      gradient.needsUpdate = true;
      this.gradient = gradient;
      const matte = (color, extra = {}) =>
        new T.MeshStandardMaterial({
          color,
          roughness: 1,
          flatShading: true,
          ...extra,
        });
      this.earth = matte("#ffffff", { vertexColors: true });
      this.ground = matte("#ffffff", { vertexColors: true });
      this.red = matte("#d8492c", {
        emissive: "#ef5720",
        emissiveIntensity: 0,
      });
      this.cream = matte("#fff4d6", {
        emissive: "#ffb65a",
        emissiveIntensity: 0,
      });
      this.roof = matte("#365956");
      this.roofEdge = matte("#253f3e");
      this.wood = matte("#744b31");
      this.darkWood = matte("#473c32");
      this.plaster = matte("#f3d39a");
      this.path = matte("#edcf96");
      this.stone = matte("#9f9b7b");
      this.gold = matte("#d29b45");
      this.water = matte("#70b9b7", {
        metalness: 0.08,
        roughness: 0.3,
        emissive: "#367e86",
        emissiveIntensity: 0.13,
      });
      this.waterFoam = matte("#e4eee0");
      this.window = matte("#f6cb83", {
        emissive: "#ffaf48",
        emissiveIntensity: 0,
      });
      this.windowDark = matte("#52635a", {
        emissive: "#f8b967",
        emissiveIntensity: 0,
      });
      this.beacon = new T.MeshBasicMaterial({
        color: "#ff7545",
        toneMapped: false,
      });
      this.foliage = [
        "#d45029",
        "#df782c",
        "#e7a238",
        "#bd4930",
        "#ddb74e",
        "#af6032",
      ].map(
        (color) => new T.MeshToonMaterial({ color, gradientMap: gradient }),
      );
      this.grass = [matte("#a39849"), matte("#bcab54"), matte("#dfb764")];
      this.cloud = new T.MeshStandardMaterial({
        color: "#fff8e9",
        roughness: 1,
        flatShading: false,
      });
      this.snow = matte("#fff7e8");
      this.mountain = matte("#ffffff", { vertexColors: true });
      this.lampMaterials = [this.red, this.cream, this.window, this.windowDark];
    }
    updateLamps(amount) {
      this.red.emissiveIntensity = amount * 0.48;
      this.cream.emissiveIntensity = amount * 0.36;
      this.window.emissiveIntensity = amount * 2.6;
      this.windowDark.emissiveIntensity = amount * 1.7;
    }
  }

  class TokyoTower {
    constructor(parent, p) {
      this.group = new T.Group();
      this.group.position.set(0.05, 0.05, -0.05);
      parent.add(this.group);
      const g = this.group;
      const profile = [
        [0.08, 1.33],
        [0.9, 1.02],
        [1.75, 0.78],
        [2.6, 0.61],
        [3.4, 0.47],
        [3.78, 0.48],
        [4.42, 0.38],
        [5.05, 0.3],
        [5.67, 0.235],
        [6.25, 0.17],
        [6.56, 0.16],
        [7.14, 0.1],
        [7.6, 0.065],
      ];
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      for (let level = 0; level < profile.length - 1; level++) {
        const [y0, r0] = profile[level],
          [y1, r1] = profile[level + 1];
        const material = [5, 7, 10].includes(level) ? p.cream : p.red;
        const thickness = mix(0.072, 0.027, level / profile.length);
        for (let c = 0; c < 4; c++) {
          const a = corners[c],
            b = corners[(c + 1) % 4];
          beam(
            g,
            material,
            [a[0] * r0, y0, a[1] * r0],
            [a[0] * r1, y1, a[1] * r1],
            thickness,
          );
          if (level > 0) {
            beam(
              g,
              material,
              [a[0] * r0, y0, a[1] * r0],
              [b[0] * r0, y0, b[1] * r0],
              thickness * 0.65,
            );
            beam(
              g,
              material,
              [a[0] * r0, y0, a[1] * r0],
              [b[0] * r1, y1, b[1] * r1],
              thickness * 0.49,
            );
            beam(
              g,
              material,
              [b[0] * r0, y0, b[1] * r0],
              [a[0] * r1, y1, a[1] * r1],
              thickness * 0.49,
            );
          }
        }
      }
      for (const [x, z] of corners) {
        box(g, p.stone, x * 1.33, 0.09, z * 1.33, 0.39, 0.18, 0.39);
        box(g, p.cream, x * 1.33, 0.2, z * 1.33, 0.25, 0.15, 0.25);
      }
      // Two observation decks and their inset window bands make the silhouette
      // unmistakably Tokyo Tower even in the 320 × 200 miniature view.
      this.deck(g, p, 3.55, 1.48, 0.3);
      this.deck(g, p, 6.42, 0.79, 0.26);
      beam(g, p.cream, [0, 0.15, 0], [0, 6.5, 0], 0.065, 4);
      for (let i = 0; i < 8; i++)
        cylinder(
          g,
          i % 2 ? p.cream : p.red,
          0,
          7.69 + i * 0.19,
          0,
          0.034,
          0.045,
          0.19,
          8,
        );
      cylinder(g, p.cream, 0, 9.28, 0, 0.009, 0.025, 0.5, 6);
      orb(g, p.beacon, 0, 9.55, 0, 0.038);
      box(g, p.plaster, 0, 0.25, -0.3, 0.9, 0.4, 0.65);
      box(g, p.roof, 0, 0.48, -0.3, 1.0, 0.12, 0.76);
      this.light = new T.PointLight("#ffad50", 0, 10, 2);
      this.light.position.set(0, 3.2, 0);
      g.add(this.light);
    }
    deck(g, p, y, width, height) {
      box(g, p.red, 0, y - height * 0.5, 0, width + 0.15, 0.09, width + 0.15);
      box(g, p.windowDark, 0, y, 0, width, height, width);
      box(g, p.cream, 0, y + height * 0.5, 0, width + 0.19, 0.1, width + 0.19);
      for (let face = 0; face < 4; face++) {
        const side = new T.Group();
        side.rotation.y = (face * Math.PI) / 2;
        g.add(side);
        for (let i = 0; i < 7; i++)
          box(
            side,
            p.cream,
            mix(-width * 0.48, width * 0.48, i / 6),
            y,
            width * 0.505,
            0.026,
            height,
            0.025,
          );
        box(
          side,
          p.red,
          0,
          y + height * 0.56,
          width * 0.58,
          width + 0.12,
          0.05,
          0.045,
        );
      }
    }
    update(lamps) {
      this.light.intensity = lamps * 18;
    }
  }

  function pagodaRoof(parent, p, y, size, height) {
    const pos = [];
    const ring = (s, h) => [
      [-s, h + 0.11, -s],
      [0, h, -s],
      [s, h + 0.11, -s],
      [s, h, 0],
      [s, h + 0.11, s],
      [0, h, s],
      [-s, h + 0.11, s],
      [-s, h, 0],
    ];
    const outer = ring(size, y),
      mid = ring(size * 0.57, y + height * 0.34),
      top = ring(size * 0.2, y + height);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      pos.push(
        ...outer[i],
        ...mid[i],
        ...outer[j],
        ...outer[j],
        ...mid[i],
        ...mid[j],
      );
      pos.push(
        ...mid[i],
        ...top[i],
        ...mid[j],
        ...mid[j],
        ...top[i],
        ...top[j],
      );
      beam(parent, p.roofEdge, outer[i], outer[j], 0.035);
    }
    mesh(triangleGeometry(pos), p.roof, parent);
    box(
      parent,
      p.roofEdge,
      0,
      y + height + 0.035,
      0,
      size * 0.42,
      0.07,
      size * 0.42,
    );
  }

  class Landmark {
    static fuji(parent, p) {
      const g = new T.Group();
      g.position.set(-2.9, 0.02, -2.75);
      g.rotation.y = 0.15;
      parent.add(g);
      const positions = [],
        colors = [],
        n = 32,
        base = 1.85,
        height = 3.06;
      const shades = [
        "#a5b4af",
        "#819f9d",
        "#95aaa9",
        "#b7bbb0",
        "#8da4a5",
      ].map((c) => new T.Color(c));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU,
          b = ((i + 1) / n) * TAU;
        const r1 = base * (1 + 0.035 * Math.sin(i * 4.3)),
          r2 = base * (1 + 0.035 * Math.sin((i + 1) * 4.3));
        positions.push(
          Math.cos(a) * r1,
          0,
          Math.sin(a) * r1,
          0,
          height,
          0,
          Math.cos(b) * r2,
          0,
          Math.sin(b) * r2,
        );
        const color = shades[i % shades.length];
        for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
      }
      mesh(triangleGeometry(positions, colors), p.mountain, g);
      const snow = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU,
          b = ((i + 1) / n) * TAU;
        const ya = 2.02 + 0.18 * Math.sin(i * 2.4) + 0.05 * Math.sin(i * 6.1),
          yb =
            2.02 +
            0.18 * Math.sin((i + 1) * 2.4) +
            0.05 * Math.sin((i + 1) * 6.1);
        const ra = base * (1 - ya / height) * 1.025,
          rb = base * (1 - yb / height) * 1.025;
        snow.push(
          Math.cos(a) * ra,
          ya,
          Math.sin(a) * ra,
          0,
          height + 0.022,
          0,
          Math.cos(b) * rb,
          yb,
          Math.sin(b) * rb,
        );
      }
      mesh(triangleGeometry(snow), p.snow, g);
      for (let i = 0; i < 7; i++)
        orb(
          g,
          p.stone,
          range(-1.6, 1.6),
          0.1,
          range(0.2, 1.2),
          range(0.15, 0.32),
          0.12,
          0.18,
        );
    }
    static pagoda(parent, p) {
      const g = new T.Group();
      g.position.set(2.68, 0.08, -1.64);
      g.rotation.y = -0.08;
      parent.add(g);
      box(g, p.stone, 0, 0.12, 0, 1.94, 0.24, 1.77);
      for (let tier = 0; tier < 3; tier++) {
        const y = 0.3 + tier * 0.86,
          w = 1.35 - tier * 0.22;
        box(g, p.plaster, 0, y + 0.25, 0, w, 0.56, w * 0.86);
        box(g, p.darkWood, 0, y + 0.06, 0, w + 0.2, 0.1, w + 0.12);
        for (let face = 0; face < 4; face++) {
          const wall = new T.Group();
          wall.rotation.y = (face * Math.PI) / 2;
          g.add(wall);
          box(wall, p.window, 0, y + 0.3, w * 0.445, w * 0.62, 0.29, 0.02);
          for (let k = -1; k <= 1; k++)
            box(
              wall,
              p.darkWood,
              k * w * 0.22,
              y + 0.3,
              w * 0.46,
              0.035,
              0.4,
              0.045,
            );
          box(wall, p.wood, 0, y + 0.49, w * 0.46, w, 0.055, 0.06);
        }
        for (const x of [-1, 1])
          for (const z of [-1, 1])
            cylinder(
              g,
              p.red,
              x * w * 0.45,
              y + 0.28,
              z * w * 0.42,
              0.046,
              0.046,
              0.58,
              6,
            );
        pagodaRoof(g, p, y + 0.56, w * 0.76, 0.43);
      }
      cylinder(g, p.gold, 0, 3.33, 0, 0.018, 0.035, 0.66, 8);
      for (let i = 0; i < 5; i++)
        cylinder(
          g,
          p.gold,
          0,
          3.12 + i * 0.11,
          0,
          0.1 - i * 0.013,
          0.1 - i * 0.013,
          0.032,
          10,
        );
      orb(g, p.gold, 0, 3.71, 0, 0.065, 0.095, 0.065);
      for (let i = 0; i < 3; i++)
        box(g, p.stone, 0, 0.04 + i * 0.05, 1.04 - i * 0.1, 1.0, 0.09, 0.25);
    }
    static torii(parent, p, x, z, scale = 1, rotation = 0) {
      const g = new T.Group();
      g.position.set(x, 0.06, z);
      g.scale.setScalar(scale);
      g.rotation.y = rotation;
      parent.add(g);
      for (const side of [-1, 1]) {
        const post = cylinder(
          g,
          p.red,
          side * 0.67,
          0.91,
          0,
          0.07,
          0.09,
          1.82,
          10,
        );
        post.rotation.z = side * -0.035;
        cylinder(g, p.roofEdge, side * 0.7, 0.18, 0, 0.105, 0.12, 0.35, 8);
        box(g, p.stone, side * 0.7, 0.045, 0, 0.29, 0.09, 0.29);
      }
      box(g, p.red, 0, 1.39, 0, 1.91, 0.13, 0.16);
      box(g, p.red, 0, 1.79, 0, 2.08, 0.16, 0.22);
      box(g, p.red, 0, 1.58, 0, 0.075, 0.45, 0.14);
      box(g, p.roofEdge, 0, 1.91, 0, 1.75, 0.1, 0.29);
      for (const side of [-1, 1]) {
        const cap = box(g, p.roofEdge, side * 0.94, 1.95, 0, 0.35, 0.105, 0.3);
        cap.rotation.z = side * 0.17;
        const red = box(g, p.red, side * 0.94, 1.85, 0, 0.35, 0.1, 0.22);
        red.rotation.z = side * 0.17;
      }
      box(g, p.gold, 0, 1.57, 0.092, 0.19, 0.24, 0.025);
    }
    static house(parent, p) {
      const g = new T.Group();
      g.position.set(-3.68, 0.07, 0.43);
      g.rotation.y = 0.28;
      parent.add(g);
      box(g, p.stone, 0, 0.07, 0, 1.52, 0.14, 1.22);
      box(g, p.plaster, 0, 0.55, 0, 1.25, 0.94, 0.95);
      for (const x of [-0.6, 0, 0.6])
        box(g, p.darkWood, x, 0.52, 0.5, 0.055, 0.92, 0.06);
      box(g, p.window, -0.31, 0.61, 0.492, 0.46, 0.42, 0.04);
      box(g, p.window, 0.31, 0.61, 0.492, 0.46, 0.42, 0.04);
      box(g, p.darkWood, 0, 0.4, 0.52, 0.2, 0.74, 0.07);
      for (let i = 0; i < 5; i++)
        box(g, p.wood, -0.47 + i * 0.24, 0.64, 0.53, 0.025, 0.5, 0.035);
      pagodaRoof(g, p, 1.01, 0.88, 0.46);
      box(g, p.red, 0, 0.89, 0.61, 1.23, 0.16, 0.02);
      for (const x of [-0.62, 0.62])
        cylinder(g, p.wood, x, 0.49, 0.76, 0.035, 0.035, 0.98, 6);
      box(g, p.wood, 0, 0.13, 0.7, 1.48, 0.12, 0.46);
    }
    static lantern(parent, p, x, z, scale = 1) {
      const g = new T.Group();
      g.position.set(x, 0.08, z);
      g.scale.setScalar(scale);
      parent.add(g);
      cylinder(g, p.stone, 0, 0.11, 0, 0.21, 0.27, 0.22, 6);
      cylinder(g, p.stone, 0, 0.4, 0, 0.072, 0.1, 0.51, 6);
      box(g, p.window, 0, 0.76, 0, 0.3, 0.32, 0.3);
      for (const x of [-0.16, 0.16])
        for (const z of [-0.16, 0.16])
          box(g, p.stone, x, 0.76, z, 0.05, 0.37, 0.05);
      cylinder(g, p.roof, 0, 1.0, 0, 0, 0.33, 0.22, 4).rotation.y = Math.PI / 4;
      orb(g, p.gold, 0, 1.16, 0, 0.04);
    }
  }

  class Island {
    constructor(scene, p) {
      this.group = new T.Group();
      scene.add(this.group);
      this.p = p;
      const staticGroup = new T.Group();
      this.group.add(staticGroup);
      this.terrain(staticGroup, p);
      this.paths(staticGroup, p);
      this.tower = new TokyoTower(staticGroup, p);
      Landmark.fuji(staticGroup, p);
      Landmark.pagoda(staticGroup, p);
      Landmark.house(staticGroup, p);
      Landmark.torii(staticGroup, p, -1.88, 2.91, 1.0, 0.06);
      Landmark.torii(staticGroup, p, -1.65, 1.9, 0.7, 0.06);
      Landmark.torii(staticGroup, p, -1.48, 1.18, 0.49, 0.06);
      this.river(staticGroup, p);
      this.bridge(staticGroup, p);
      const trees = [
        [-4.65, 1.32, 0.93],
        [-4.85, -0.6, 0.83],
        [-4.15, -2.35, 0.7],
        [-1.25, -3.74, 0.81],
        [0.35, -3.92, 0.78],
        [1.68, -3.54, 0.86],
        [4.05, -2.05, 1.0],
        [4.85, -0.5, 0.75],
        [4.58, 1.0, 0.71],
        [3.24, 3.28, 0.78],
        [1.13, 3.93, 0.87],
        [-0.3, 4.0, 0.65],
        [-3.47, 2.84, 0.93],
        [-3.48, 1.89, 0.71],
        [-0.74, -2.33, 0.6],
        [1.36, -1.55, 0.58],
      ];
      trees.forEach(([x, z, s], i) => this.tree(staticGroup, p, x, z, s, i));
      for (const [x, z, s] of [
        [-0.82, 2.95, 0.68],
        [-3.04, 3, 0.7],
        [1.34, 2.86, 0.72],
        [3.62, -0.61, 0.7],
        [2.23, -0.63, 0.6],
      ])
        Landmark.lantern(staticGroup, p, x, z, s);
      this.details(staticGroup, p);
      batchStatic(staticGroup);
      this.makeWaterfall(p);
      this.light = new T.PointLight("#ffd087", 0, 8, 2);
      this.light.position.set(2.2, 1.25, 1.4);
      this.group.add(this.light);
      this.satellites = [];
      for (const [x, y, z, s] of [
        [-5.5, -2.55, 1.3, 0.5],
        [5.1, -3.8, -0.4, 0.6],
        [-1.9, -4.25, 2.3, 0.37],
        [2.7, -4.7, 1.3, 0.28],
      ]) {
        const stone = mesh(
          new T.IcosahedronGeometry(s, 0),
          p.stone,
          scene,
          x,
          y,
          z,
        );
        stone.scale.set(1, 0.9, 1);
        stone.rotation.set(0.3, 0.5, 0.3);
        this.satellites.push({ mesh: stone, y, phase: random() * TAU });
      }
    }
    terrain(g, p) {
      const n = 48,
        rings = [],
        radii = [5.63, 5.8, 5.3, 4.32, 2.7, 0.62],
        levels = [0.035, -0.28, -1.08, -2.28, -3.44, -4.03];
      for (let k = 0; k < radii.length; k++) {
        const ring = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU,
            jitter = 1 + 0.045 * Math.sin(i * 4.42) + 0.024 * Math.cos(i * 7.1);
          ring.push([
            Math.cos(a) * radii[k] * jitter,
            levels[k] + (k > 1 ? Math.sin(i * 3.25 + k) * 0.17 : 0),
            Math.sin(a) * radii[k] * jitter * 0.83,
          ]);
        }
        rings.push(ring);
      }
      const top = [],
        topColor = [],
        earth = [],
        earthColor = [];
      const grassColors = [
        "#d9b85a",
        "#ddbc61",
        "#e3c469",
        "#cfaf53",
        "#d6b762",
      ].map((c) => new T.Color(c));
      const earthColors = [
        "#b98a61",
        "#b47d55",
        "#a76c4e",
        "#c29165",
        "#986849",
        "#ca9b6b",
        "#b98760",
      ].map((c) => new T.Color(c));
      for (let i = 0; i < n; i++) {
        top.push(0, 0.04, 0, ...rings[0][(i + 1) % n], ...rings[0][i]);
        const c = grassColors[Math.floor(random() * grassColors.length)];
        for (let j = 0; j < 3; j++) topColor.push(c.r, c.g, c.b);
      }
      for (let k = 0; k < rings.length - 1; k++)
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n,
            a = rings[k][i],
            b = rings[k][j],
            c = rings[k + 1][i],
            d = rings[k + 1][j];
          earth.push(...a, ...b, ...c, ...b, ...d, ...c);
          for (let t = 0; t < 2; t++) {
            const color = (k === 0 ? grassColors : earthColors)[
              Math.floor(
                random() * (k === 0 ? grassColors.length : earthColors.length),
              )
            ].clone();
            if (k > 2) color.multiplyScalar(0.9);
            for (let v = 0; v < 3; v++)
              earthColor.push(color.r, color.g, color.b);
          }
        }
      // Close the underside: the island remains complete from every orbit angle.
      for (let i = 0; i < n; i++) {
        earth.push(...rings[5][i], ...rings[5][(i + 1) % n], 0, -4.16, 0);
        const c = earthColors[4];
        for (let j = 0; j < 3; j++) earthColor.push(c.r, c.g, c.b);
      }
      mesh(triangleGeometry(top, topColor), p.ground, g);
      mesh(triangleGeometry(earth, earthColor), p.earth, g);
      for (let i = 0; i < 16; i++) {
        const a = random() * TAU,
          r = range(3.0, 4.8),
          y = range(-2.35, -0.85);
        const rock = orb(
          g,
          p.stone,
          Math.cos(a) * r,
          y,
          Math.sin(a) * r * 0.83,
          range(0.3, 0.65),
          range(0.25, 0.52),
          range(0.25, 0.5),
        );
        rock.rotation.z = range(-0.8, 0.8);
      }
    }
    strip(g, material, points, width, y = 0.065) {
      const curve = new T.CatmullRomCurve3(
          points.map(([x, z]) => new T.Vector3(x, y, z)),
        ),
        pos = [];
      for (let i = 0; i < 80; i++) {
        const a = curve.getPoint(i / 80),
          b = curve.getPoint((i + 1) / 80),
          ta = curve.getTangent(i / 80),
          tb = curve.getTangent((i + 1) / 80);
        const w = width * 0.5;
        const al = [a.x + ta.z * w, y, a.z - ta.x * w],
          ar = [a.x - ta.z * w, y, a.z + ta.x * w],
          bl = [b.x + tb.z * w, y, b.z - tb.x * w],
          br = [b.x - tb.z * w, y, b.z + tb.x * w];
        pos.push(...al, ...ar, ...bl, ...bl, ...ar, ...br);
      }
      mesh(triangleGeometry(pos), material, g).castShadow = false;
      return curve;
    }
    paths(g, p) {
      const points = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * TAU;
        points.push([Math.cos(a) * 3.25, Math.sin(a) * 2.52]);
      }
      this.strip(g, p.path, points, 0.46);
      this.strip(
        g,
        p.path,
        [
          [-2.08, 4.19],
          [-1.89, 3],
          [-1.62, 1.92],
          [-1.42, 0.8],
          [0, 0],
        ],
        0.72,
        0.07,
      );
      this.strip(
        g,
        p.path,
        [
          [0.9, 1.1],
          [1.9, 1.5],
          [2.6, 1.5],
          [4, 1.2],
        ],
        0.54,
        0.068,
      );
      for (let i = 0; i < 9; i++) {
        const slab = box(
          g,
          p.stone,
          -1.96 + i * 0.052,
          0.075,
          3.94 - i * 0.29,
          0.42,
          0.035,
          0.16,
        );
        slab.rotation.y = -0.14;
      }
    }
    river(g, p) {
      const points = [
        [1.5, -3.82],
        [1.86, -2.75],
        [1.76, -1.47],
        [2.38, -0.2],
        [2.92, 0.86],
        [2.7, 1.77],
        [3.44, 2.57],
        [4.51, 3.14],
      ];
      this.strip(g, p.stone, points, 0.96, 0.071);
      const curve = this.strip(g, p.water, points, 0.75, 0.092);
      for (let i = 0; i < 32; i++) {
        const t = i / 32,
          point = curve.getPoint(t),
          tangent = curve.getTangent(t);
        if (i % 3 === 0) {
          const glint = box(
            g,
            p.waterFoam,
            point.x + range(-0.18, 0.18),
            0.101,
            point.z,
            range(0.12, 0.29),
            0.009,
            0.025,
          );
          glint.rotation.y = Math.atan2(tangent.x, tangent.z);
        }
        const side = i % 2 ? 1 : -1;
        orb(
          g,
          p.stone,
          point.x + tangent.z * 0.5 * side,
          0.11,
          point.z - tangent.x * 0.5 * side,
          0.14,
          0.1,
          0.1,
        );
      }
      for (let i = 0; i < 6; i++)
        orb(
          g,
          p.waterFoam,
          4.35 + random() * 0.27,
          0.13,
          3.02 + random() * 0.26,
          0.11,
          0.06,
          0.08,
        );
    }
    bridge(g, p) {
      const bridge = new T.Group();
      bridge.position.set(2.76, 0.14, 1.4);
      bridge.rotation.y = -0.38;
      g.add(bridge);
      const height = (x) =>
        0.13 + Math.sin(((x + 0.88) / 1.76) * Math.PI) * 0.27;
      for (let i = 0; i < 14; i++) {
        const x = -0.88 + (i / 13) * 1.76,
          y = height(x);
        const plank = box(bridge, p.wood, x, y, 0, 0.14, 0.06, 0.65);
        plank.rotation.z = Math.cos(((x + 0.88) / 1.76) * Math.PI) * 0.27;
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const x = -0.87 + (i / 6) * 1.74,
            y = height(x);
          cylinder(
            bridge,
            p.red,
            x,
            y + 0.21,
            side * 0.36,
            0.027,
            0.034,
            0.47,
            6,
          );
          orb(bridge, p.gold, x, y + 0.46, side * 0.36, 0.04);
          if (i < 6) {
            const x2 = -0.87 + ((i + 1) / 6) * 1.74;
            beam(
              bridge,
              p.red,
              [x, y + 0.4, side * 0.36],
              [x2, height(x2) + 0.4, side * 0.36],
              0.035,
            );
            beam(
              bridge,
              p.red,
              [x, y + 0.19, side * 0.36],
              [x2, height(x2) + 0.19, side * 0.36],
              0.018,
            );
          }
        }
      }
    }
    tree(g, p, x, z, scale, index) {
      const tree = new T.Group();
      tree.position.set(x, 0.055, z);
      tree.scale.setScalar(scale);
      tree.rotation.y = random() * TAU;
      g.add(tree);
      cylinder(tree, p.wood, 0, 0.6, 0, 0.065, 0.11, 1.2, 7);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU,
          ex = Math.cos(a) * 0.46,
          ez = Math.sin(a) * 0.46;
        beam(tree, p.wood, [0, 0.65, 0], [ex, 1.35, ez], 0.045);
      }
      for (let i = 0; i < 8; i++) {
        const a = i * 2.3999,
          r = i === 0 ? 0 : range(0.25, 0.52),
          y = i === 0 ? 1.74 : range(1.25, 1.63);
        const color =
          p.foliage[(index + (i % 3 === 0 ? 1 : 0)) % p.foliage.length];
        const leaf = orb(
          tree,
          color,
          Math.cos(a) * r,
          y,
          Math.sin(a) * r,
          range(0.37, 0.58),
          range(0.38, 0.55),
          range(0.37, 0.55),
        );
        leaf.rotation.set(random(), random(), random());
      }
      for (let i = 0; i < 3; i++)
        orb(
          tree,
          p.foliage[(index + 1) % p.foliage.length],
          range(-0.7, 0.7),
          0.05,
          range(-0.55, 0.55),
          0.13,
          0.05,
          0.13,
        );
    }
    details(g, p) {
      for (let i = 0; i < 100; i++) {
        const a = random() * TAU,
          r = range(3.2, 5.45),
          x = Math.cos(a) * r,
          z = Math.sin(a) * r * 0.8;
        if (x > 2 && z > 2) continue;
        const tuft = new T.Group();
        tuft.position.set(x, 0.05, z);
        tuft.rotation.y = random() * TAU;
        g.add(tuft);
        for (let j = 0; j < 3; j++) {
          const blade = mesh(
            new T.ConeGeometry(0.028, 0.16 + random() * 0.1, 3),
            p.grass[i % 3],
            tuft,
            (j - 1) * 0.045,
            0.085,
            0,
          );
          blade.rotation.z = (j - 1) * -0.22;
        }
      }
      for (let i = 0; i < 27; i++) {
        const a = random() * TAU,
          r = range(4.75, 5.4);
        orb(
          g,
          p.stone,
          Math.cos(a) * r,
          0.1,
          Math.sin(a) * r * 0.8,
          range(0.12, 0.26),
          range(0.08, 0.15),
          range(0.1, 0.25),
        );
      }
      // A miniature bench for a visitor who has nowhere else to be.
      const bench = new T.Group();
      bench.position.set(0.42, 0.08, 3.14);
      bench.rotation.y = -0.16;
      g.add(bench);
      for (const x of [-0.33, 0.33]) {
        box(bench, p.darkWood, x, 0.18, 0, 0.06, 0.36, 0.33);
        box(bench, p.darkWood, x, 0.44, -0.15, 0.045, 0.5, 0.045);
      }
      for (let i = 0; i < 3; i++)
        box(bench, p.wood, 0, 0.36, -0.14 + i * 0.13, 0.88, 0.055, 0.1);
      box(bench, p.wood, 0, 0.63, -0.15, 0.9, 0.17, 0.05);
    }
    makeWaterfall(p) {
      this.fallGroup = new T.Group();
      this.fallGroup.position.set(4.48, -1.45, 3.12);
      this.fallGroup.rotation.y = 0.86;
      this.group.add(this.fallGroup);
      this.fallMaterial = new T.MeshStandardMaterial({
        color: "#8acbc8",
        roughness: 0.34,
        metalness: 0.04,
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.86,
        emissive: "#448c95",
        emissiveIntensity: 0.16,
      });
      this.fallGeo = new T.PlaneGeometry(0.71, 3.06, 6, 16);
      this.fallBase = new Float32Array(this.fallGeo.attributes.position.array);
      this.fall = mesh(this.fallGeo, this.fallMaterial, this.fallGroup);
      this.fall.castShadow = false;
      const streakMaterial = new T.MeshBasicMaterial({
        color: "#e5f9e8",
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
      });
      this.streaks = new T.InstancedMesh(unitBox, streakMaterial, 14);
      this.streaks.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.streaks.frustumCulled = false;
      this.fallGroup.add(this.streaks);
      this.dummy = new T.Object3D();
      for (let i = 0; i < 9; i++) {
        const foam = orb(
          this.fallGroup,
          p.waterFoam,
          range(-0.42, 0.42),
          -1.57 + range(-0.1, 0.06),
          range(-0.09, 0.1),
          range(0.09, 0.17),
          0.075,
          0.12,
        );
        foam.castShadow = false;
      }
    }
    update(elapsed, lamps, dt) {
      this.group.position.y =
        Math.sin(elapsed * 0.73) * (reducedMotion ? 0.045 : 0.13);
      this.group.rotation.z = Math.sin(elapsed * 0.31) * 0.007;
      this.tower.update(lamps);
      this.light.intensity = lamps * 10;
      for (const rock of this.satellites) {
        rock.mesh.position.y =
          rock.y + Math.sin(elapsed * 0.7 + rock.phase) * 0.16;
        rock.mesh.rotation.y += dt * 0.054;
      }
      const pos = this.fallGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const j = i * 3;
        pos.array[j + 2] =
          Math.sin(
            this.fallBase[j + 1] * 4 + elapsed * 3 + this.fallBase[j] * 5,
          ) * 0.024;
      }
      pos.needsUpdate = true;
      for (let i = 0; i < 14; i++) {
        const f = (elapsed * 0.46 + i / 14) % 1;
        this.dummy.position.set(
          Math.sin(i * 14.53) * 0.29,
          1.48 - f * 2.99,
          0.044,
        );
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(
          0.009 + (i % 3) * 0.007,
          0.13 + (i % 4) * 0.11,
          0.009,
        );
        this.dummy.updateMatrix();
        this.streaks.setMatrixAt(i, this.dummy.matrix);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
    }
  }

  function mapleGeometry() {
    const shape = new T.Shape();
    // A serrated, five-lobed maple silhouette, including its narrow stem.
    const points = [
      [0, -0.65],
      [0.055, -0.43],
      [0.38, -0.43],
      [0.29, -0.28],
      [0.63, -0.07],
      [0.44, -0.025],
      [0.53, 0.23],
      [0.28, 0.17],
      [0.3, 0.44],
      [0.14, 0.34],
      [0, 0.79],
      [-0.14, 0.34],
      [-0.3, 0.44],
      [-0.28, 0.17],
      [-0.53, 0.23],
      [-0.44, -0.025],
      [-0.63, -0.07],
      [-0.29, -0.28],
      [-0.38, -0.43],
      [-0.04, -0.43],
      [-0.055, -0.65],
    ];
    points.forEach(([x, y], i) =>
      i ? shape.lineTo(x, y) : shape.moveTo(x, y),
    );
    shape.closePath();
    return new T.ShapeGeometry(shape);
  }

  class MapleLeafSystem {
    constructor(scene, island, p, count = 420) {
      this.count = count;
      this.geometry = mapleGeometry();
      this.material = new T.MeshToonMaterial({
        color: "#ffffff",
        side: T.DoubleSide,
        gradientMap: p.gradient,
      });
      this.mesh = new T.InstancedMesh(this.geometry, this.material, count);
      this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      scene.add(this.mesh);
      this.dummy = new T.Object3D();
      // Fixed-size typed arrays form the particle pool. Respawning overwrites an
      // existing slot; no mesh, vector, or material is allocated in update().
      this.x = new Float32Array(count);
      this.y = new Float32Array(count);
      this.z = new Float32Array(count);
      this.speed = new Float32Array(count);
      this.phase = new Float32Array(count);
      this.scale = new Float32Array(count);
      this.spin = new Float32Array(count);
      const colors = [
        "#d3512a",
        "#e69434",
        "#bc4729",
        "#dfa83d",
        "#eeb951",
        "#a45132",
      ].map((c) => new T.Color(c));
      for (let i = 0; i < count; i++) {
        this.reset(i, true);
        this.speed[i] = range(0.43, 0.95);
        this.phase[i] = random() * TAU;
        this.scale[i] = range(0.09, 0.2);
        this.spin[i] = range(-1.6, 1.6);
        this.mesh.setColorAt(i, colors[i % colors.length]);
      }
      this.mesh.instanceColor.needsUpdate = true;
      const ground = new T.InstancedMesh(this.geometry, this.material, 190);
      for (let i = 0; i < 190; i++) {
        const a = random() * TAU,
          r = Math.sqrt(random()) * 5.3;
        this.dummy.position.set(Math.cos(a) * r, 0.079, Math.sin(a) * r * 0.79);
        this.dummy.rotation.set(-Math.PI / 2, 0, random() * TAU);
        this.dummy.scale.setScalar(range(0.07, 0.15));
        this.dummy.updateMatrix();
        ground.setMatrixAt(i, this.dummy.matrix);
        ground.setColorAt(i, colors[i % colors.length]);
      }
      ground.instanceMatrix.needsUpdate = true;
      ground.instanceColor.needsUpdate = true;
      island.add(ground);
      this.update(0, 0);
    }
    reset(i, initial = false) {
      this.x[i] = range(-9.0, 8.1);
      this.y[i] = initial ? range(-4.8, 12) : range(10.4, 12.2);
      this.z[i] = range(-6.5, 7.2);
    }
    update(dt, elapsed) {
      const slow = reducedMotion ? 0.65 : 1;
      for (let i = 0; i < this.count; i++) {
        const phase = this.phase[i],
          t = elapsed * 0.85 + phase;
        // Terminal fall speed plus a coherent breeze and a per-leaf oscillation
        // produce flutter without an unstable numerical physics simulation.
        this.y[i] -= this.speed[i] * dt * slow;
        this.x[i] += (0.17 + Math.sin(t * 0.73) * 0.18) * dt * slow;
        this.z[i] += Math.cos(t * 0.6) * 0.08 * dt * slow;
        if (this.y[i] < -5.8 || this.x[i] > 10.5) this.reset(i);
        this.dummy.position.set(
          this.x[i] + Math.sin(t * 1.9) * 0.22,
          this.y[i] + Math.sin(t * 2.2) * 0.09,
          this.z[i] + Math.cos(t * 1.3) * 0.15,
        );
        this.dummy.rotation.set(
          t * 0.8,
          elapsed * this.spin[i] + phase,
          Math.sin(t) * 0.65 + phase,
        );
        this.dummy.scale.setScalar(this.scale[i]);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function glowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext("2d"),
      gradient = ctx.createRadialGradient(48, 48, 1, 48, 48, 48);
    gradient.addColorStop(0, "rgba(255,255,255,.62)");
    gradient.addColorStop(0.22, "rgba(255,255,255,.2)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);
    return new T.CanvasTexture(canvas);
  }

  class Atmosphere {
    constructor(scene, p) {
      this.clouds = [];
      this.p = p;
      const positions = [
        [-8, -0.8, -5, 1.5],
        [7.4, 3.1, -6, 1.1],
        [-7.8, -2.4, 3, 0.92],
        [7.3, -2.2, 0.7, 1.05],
        [-0.7, -4.6, 3.5, 0.9],
        [3.9, -3.7, -5, 1.2],
        [-6.5, 5.3, -12, 0.9],
      ];
      for (const [x, y, z, s] of positions) {
        const group = new T.Group();
        scene.add(group);
        for (let i = 0; i < 6; i++) {
          const puff = mesh(
            new T.SphereGeometry(1, 12, 9),
            p.cloud,
            group,
            (i - 2.5) * 0.5,
            Math.sin(i * 1.4) * 0.13,
            Math.sin(i) * 0.17,
          );
          puff.scale.set(0.65, 0.36 + Math.sin(i * 1.3) * 0.11, 0.45);
          puff.castShadow = false;
        }
        batchStatic(group);
        group.position.set(x, y, z);
        group.scale.setScalar(s);
        this.clouds.push({ group, x, y, phase: random() * TAU });
      }
      this.glow = glowTexture();
      this.sun = new T.Group();
      scene.add(this.sun);
      const sunMat = new T.MeshBasicMaterial({
        color: "#ffce7e",
        fog: false,
        toneMapped: false,
      });
      mesh(new T.SphereGeometry(0.68, 28, 20), sunMat, this.sun).castShadow =
        false;
      this.sunGlow = new T.Sprite(
        new T.SpriteMaterial({
          map: this.glow,
          color: "#fbb164",
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          fog: false,
        }),
      );
      this.sunGlow.scale.set(5.3, 5.3, 1);
      this.sun.add(this.sunGlow);
      this.moon = new T.Group();
      scene.add(this.moon);
      mesh(
        new T.SphereGeometry(0.47, 24, 16),
        new T.MeshBasicMaterial({
          color: "#fff4d4",
          fog: false,
          toneMapped: false,
        }),
        this.moon,
      ).castShadow = false;
      const moonGlow = new T.Sprite(
        new T.SpriteMaterial({
          map: this.glow,
          color: "#badbe2",
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          fog: false,
        }),
      );
      moonGlow.scale.set(4, 4, 1);
      this.moon.add(moonGlow);
      const stars = new Float32Array(150 * 3);
      for (let i = 0; i < 150; i++) {
        stars[i * 3] = range(-32, 32);
        stars[i * 3 + 1] = range(-2, 25);
        stars[i * 3 + 2] = range(-28, -15);
      }
      const starGeo = new T.BufferGeometry();
      starGeo.setAttribute("position", new T.BufferAttribute(stars, 3));
      this.starMat = new T.PointsMaterial({
        color: "#fff1d2",
        size: 0.065,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      });
      this.stars = new T.Points(starGeo, this.starMat);
      scene.add(this.stars);
      this.lampGlows = [];
    }
    addLampGlows(island) {
      this.lampGlowMaterial = new T.SpriteMaterial({
        map: this.glow,
        color: "#ffaf46",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: T.AdditiveBlending,
      });
      for (const [x, y, z, s] of [
        [0.05, 3.58, -0.05, 2.3],
        [0.05, 6.5, -0.05, 1.25],
        [-0.82, 0.75, 2.95, 0.7],
        [1.34, 0.76, 2.86, 0.7],
        [2.68, 1.7, -1.64, 1.8],
      ]) {
        const glow = new T.Sprite(this.lampGlowMaterial);
        glow.position.set(x, y, z);
        glow.scale.set(s, s, 1);
        island.add(glow);
        this.lampGlows.push(glow);
      }
    }
    update(elapsed, phase, darkness, lamps) {
      for (const cloud of this.clouds) {
        cloud.group.position.x =
          cloud.x + Math.sin(elapsed * 0.09 + cloud.phase) * 0.65;
        cloud.group.position.y =
          cloud.y + Math.sin(elapsed * 0.16 + cloud.phase) * 0.1;
      }
      const angle = phase * TAU;
      this.sun.position.set(
        -Math.cos(angle) * 12,
        Math.sin(angle) * 5.3 + 1,
        -12,
      );
      this.moon.position.set(
        Math.cos(angle) * 12,
        -Math.sin(angle) * 5.3 + 1,
        -12,
      );
      this.sun.visible = this.sun.position.y > -0.8;
      this.moon.visible = this.moon.position.y > -0.8;
      this.starMat.opacity = darkness * 0.65;
      this.stars.rotation.y = Math.sin(elapsed * 0.015) * 0.06;
      this.lampGlowMaterial.opacity = lamps * 0.36;
    }
  }

  class DayNightCycle {
    constructor(scene, p, atmosphere) {
      this.phase = 0.28;
      this.duration = 15;
      this.speed = 1;
      this.fast = false;
      this.playing = true;
      this.scrubbing = false;
      this.darkness = 0;
      this.lamps = 0;
      this.uiTimer = 0;
      this.scene = scene;
      this.p = p;
      this.atmosphere = atmosphere;
      this.ambient = new T.HemisphereLight("#fff6df", "#826b48", 2.0);
      scene.add(this.ambient);
      this.sunLight = new T.DirectionalLight("#ffe1b0", 3.2);
      this.sunLight.position.set(-7, 13, 7);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(1536, 1536);
      Object.assign(this.sunLight.shadow.camera, {
        left: -10,
        right: 10,
        top: 13,
        bottom: -9,
        near: 1,
        far: 50,
      });
      this.sunLight.shadow.bias = -0.00035;
      this.sunLight.shadow.normalBias = 0.045;
      this.sunLight.shadow.radius = 3;
      scene.add(this.sunLight);
      scene.add(this.sunLight.target);
      this.fill = new T.DirectionalLight("#e5e8d7", 0.75);
      this.fill.position.set(8, 5, -8);
      scene.add(this.fill);
      scene.fog = new T.Fog("#eee5d6", 33, 85);
      // Cyclic palette knots, interpolated with smoothstep. The first and last
      // states match, so wrapping from phase 1 to phase 0 has no discontinuity.
      const palette = [
        [
          0,
          "#ecdbca",
          "#e7cbbb",
          "#534a48",
          "#8e7b70",
          "#bc7055",
          "#ffe5c8",
          "#c7a0a0",
          1.5,
          1.7,
          0.1,
        ],
        [
          0.13,
          "#f3eee3",
          "#eae4d5",
          "#363e37",
          "#828679",
          "#b75b3d",
          "#ffe9ba",
          "#fff8e9",
          2.0,
          3.0,
          0,
        ],
        [
          0.32,
          "#f3eee3",
          "#ece3d3",
          "#363e37",
          "#828679",
          "#b75b3d",
          "#ffe0aa",
          "#fff8e9",
          2.0,
          3.1,
          0,
        ],
        [
          0.46,
          "#efcfb9",
          "#ddae98",
          "#55423e",
          "#9a7162",
          "#b35338",
          "#ffac73",
          "#f9d9c3",
          1.6,
          2.5,
          0.1,
        ],
        [
          0.57,
          "#334653",
          "#71636c",
          "#f3e7d2",
          "#c1b7ad",
          "#ecac77",
          "#b9cedc",
          "#89979c",
          0.95,
          0.65,
          0.85,
        ],
        [
          0.69,
          "#202f40",
          "#414e5b",
          "#f0e8d7",
          "#a3b0b6",
          "#e9b47f",
          "#a8cadc",
          "#728995",
          0.84,
          0.62,
          1,
        ],
        [
          0.82,
          "#28394b",
          "#5f6275",
          "#ece6dc",
          "#aeb4c0",
          "#e8b797",
          "#c2cbe4",
          "#8a9aaa",
          0.9,
          0.65,
          1,
        ],
        [
          0.92,
          "#b2a3b1",
          "#dcc2bd",
          "#504a56",
          "#887b86",
          "#ab6859",
          "#f1c5c2",
          "#c5b9ca",
          1.2,
          1.0,
          0.3,
        ],
        [
          1,
          "#ecdbca",
          "#e7cbbb",
          "#534a48",
          "#8e7b70",
          "#bc7055",
          "#ffe5c8",
          "#c7a0a0",
          1.5,
          1.7,
          0.1,
        ],
      ];
      this.frames = palette.map((a) => ({
        t: a[0],
        colors: a.slice(1, 8).map((c) => new T.Color(c)),
        ambient: a[8],
        sun: a[9],
        dark: a[10],
      }));
      this.colors = Array.from({ length: 7 }, () => new T.Color());
      this.panelColor = new T.Color();
      this.root = document.documentElement;
      this.previousLabel = "";
      this.update(0);
    }
    get effectiveSpeed() {
      return this.speed * (this.fast ? 4 : 1);
    }
    setPhase(value) {
      this.phase = clamp(Number(value), 0, 1) % 1;
      this.uiTimer = 1;
    }
    update(dt) {
      if (this.playing && !this.scrubbing)
        this.phase =
          (this.phase + (dt * this.effectiveSpeed) / this.duration) % 1;
      let index = 0;
      while (
        index < this.frames.length - 2 &&
        this.phase > this.frames[index + 1].t
      )
        index++;
      const a = this.frames[index],
        b = this.frames[index + 1],
        u = smooth(a.t, b.t, this.phase);
      for (let i = 0; i < 7; i++)
        this.colors[i].copy(a.colors[i]).lerp(b.colors[i], u);
      this.darkness = mix(a.dark, b.dark, u);
      this.ambient.intensity = mix(a.ambient, b.ambient, u);
      this.ambient.color.copy(this.colors[5]);
      this.sunLight.intensity = mix(a.sun, b.sun, u);
      this.sunLight.color.copy(this.colors[5]);
      // Light direction travels continuously even below the horizon; moonlight
      // takes over from the same soft key at night, keeping the diorama readable.
      const theta = this.phase * TAU;
      this.sunLight.position.set(
        -Math.cos(theta) * 10,
        8 + Math.abs(Math.sin(theta)) * 10,
        7,
      );
      this.fill.intensity = mix(0.8, 0.46, this.darkness);
      this.scene.fog.color.copy(this.colors[1]);
      this.scene.fog.near = mix(33, 28, this.darkness);
      this.p.cloud.color.copy(this.colors[6]);
      // Fade lights in when dusk begins, then extinguish them BEFORE dawn.
      // Using bounded envelopes avoids boolean flicker at either threshold.
      this.lamps =
        smooth(0.385, 0.48, this.phase) * (1 - smooth(0.835, 0.89, this.phase));
      this.p.updateLamps(this.lamps);
      this.uiTimer += dt;
      if (this.uiTimer >= 1 / 24 || dt === 0) {
        this.uiTimer = 0;
        this.updateUI();
      }
    }
    phaseName() {
      if (this.phase < 0.105 || this.phase >= 0.915)
        return ["First light", "sunrise"];
      if (this.phase < 0.35) return ["Afternoon glow", "sun"];
      if (this.phase < 0.52) return ["Golden hour", "sunset"];
      if (this.phase < 0.865) return ["Under the stars", "moon"];
      return ["Before the dawn", "sunrise"];
    }
    updateUI() {
      const names = [
        "--sky-top",
        "--sky-bottom",
        "--ink",
        "--muted",
        "--accent",
      ];
      for (let i = 0; i < names.length; i++)
        this.root.style.setProperty(
          names[i],
          `#${this.colors[i].getHexString()}`,
        );
      const d = this.darkness;
      this.root.style.setProperty(
        "--panel",
        `rgba(${Math.round(mix(255, 42, d))},${Math.round(mix(250, 56, d))},${Math.round(mix(238, 66, d))},.69)`,
      );
      this.root.style.setProperty(
        "--line",
        `rgba(${Math.round(mix(94, 231, d))},${Math.round(mix(91, 225, d))},${Math.round(mix(72, 207, d))},.18)`,
      );
      this.root.style.setProperty(
        "--glow",
        `rgba(247,186,117,${0.16 * (1 - this.darkness)})`,
      );
      const [label, icon] = this.phaseName();
      if (label !== this.previousLabel) {
        $("phase-label").textContent = label;
        $("phase-icon").firstElementChild.setAttribute("href", `#i-${icon}`);
        this.previousLabel = label;
      }
      if (!this.scrubbing) $("time-slider").value = String(this.phase);
      const hour = Math.floor((this.phase * 24 + 6) % 24),
        minute = Math.floor((this.phase * 24 * 60) % 60);
      $("time-slider").setAttribute(
        "aria-valuetext",
        `${label}, ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      );
      $("timeline-fill").style.width = `${this.phase * 100}%`;
    }
  }

  class OrbitController {
    constructor(camera, element, onChange) {
      this.camera = camera;
      this.element = element;
      this.onChange = onChange;
      this.yaw = 0.48;
      this.targetYaw = 0.48;
      this.elevation = 0.38;
      this.zoom = 1;
      this.targetZoom = 1;
      this.dragging = false;
      this.pointer = null;
      this.velocity = 0;
      this.target = new T.Vector3(0, 2.1, 0);
      this.width = 1;
      this.height = 1;
      this.listeners = [];
      this.listen(element, "pointerdown", (e) => {
        if (e.button !== 0 || this.pointer !== null) return;
        this.pointer = e.pointerId;
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastTime = performance.now();
        this.velocity = 0;
        element.setPointerCapture(e.pointerId);
        element.classList.add("dragging");
      });
      this.listen(element, "pointermove", (e) => {
        if (e.pointerId !== this.pointer) return;
        const delta = e.clientX - this.lastX,
          now = performance.now();
        this.targetYaw -= delta * 0.007;
        this.velocity = clamp(
          (-delta * 0.007) / Math.max((now - this.lastTime) / 1000, 0.008),
          -3,
          3,
        );
        this.lastX = e.clientX;
        this.lastTime = now;
      });
      const end = (e) => {
        if (e.pointerId !== this.pointer) return;
        this.dragging = false;
        this.pointer = null;
        element.classList.remove("dragging");
        if (performance.now() - this.lastTime > 90) this.velocity = 0;
      };
      this.listen(element, "pointerup", end);
      this.listen(element, "pointercancel", end);
      this.listen(element, "lostpointercapture", end);
      this.listen(
        element,
        "wheel",
        (e) => {
          e.preventDefault();
          this.targetZoom = clamp(
            this.targetZoom * Math.exp(-e.deltaY * 0.0007),
            0.78,
            1.3,
          );
        },
        { passive: false },
      );
    }
    listen(target, event, fn, options) {
      target.addEventListener(event, fn, options);
      this.listeners.push([target, event, fn, options]);
    }
    reset() {
      this.targetYaw = 0.48;
      this.targetZoom = 1;
      this.velocity = 0;
    }
    resize(w, h) {
      this.width = w;
      this.height = h;
      this.project();
    }
    project() {
      const aspect = this.width / this.height,
        compact = this.height <= 440;
      let view = compact ? (this.height < 260 ? 22.5 : 20.3) : 18.7;
      // Fit by the tighter dimension. Portrait screens shift the world downward
      // to leave space for the compact title, while embeds give the island room.
      if (aspect < 0.8) view = 17.1 / aspect;
      else if (aspect < 1.2) view = 19.8;
      view /= this.zoom;
      let shift = 0;
      if (this.width > 760) shift = -view * aspect * 0.112;
      else if (this.width > 540 && !compact) shift = -view * aspect * 0.115;
      else if (this.width > 620 && compact) shift = -view * aspect * 0.1;
      else if (compact) shift = -view * aspect * 0.055;
      const vertical = compact
        ? -view * 0.065
        : aspect < 0.8
          ? view * 0.045
          : 0;
      this.camera.left = (-view * aspect) / 2 + shift;
      this.camera.right = (view * aspect) / 2 + shift;
      this.camera.top = view / 2 + vertical;
      this.camera.bottom = -view / 2 + vertical;
      this.camera.updateProjectionMatrix();
    }
    update(dt) {
      if (!this.dragging) {
        this.targetYaw += this.velocity * dt;
        this.velocity *= Math.exp(-dt * 5.6);
      }
      this.yaw = mix(this.yaw, this.targetYaw, 1 - Math.exp(-dt * 14));
      const previous = this.zoom;
      this.zoom = mix(this.zoom, this.targetZoom, 1 - Math.exp(-dt * 9));
      if (Math.abs(this.zoom - previous) > 0.00001) this.project();
      const radius = 30,
        flat = Math.cos(this.elevation) * radius;
      this.camera.position.set(
        Math.sin(this.yaw) * flat,
        this.target.y + Math.sin(this.elevation) * radius,
        Math.cos(this.yaw) * flat,
      );
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
    }
    dispose() {
      this.listeners.forEach(([target, event, fn, options]) =>
        target.removeEventListener(event, fn, options),
      );
    }
  }

  class AmbientAudio {
    constructor() {
      this.context = null;
      this.enabled = false;
      this.nextChime = 0;
      this.voices = new Set();
    }
    async toggle() {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext)
          throw new Error("Ambient audio is not supported by this browser.");
        this.context = new AudioContext();
        const ctx = this.context;
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(ctx.destination);
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
          data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          last = (last + (Math.random() * 2 - 1) * 0.018) / 1.018;
          data[i] = last * 3;
        }
        this.wind = ctx.createBufferSource();
        this.wind.buffer = buffer;
        this.wind.loop = true;
        this.filter = ctx.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.frequency.value = 700;
        this.windGain = ctx.createGain();
        this.windGain.gain.value = 0.17;
        this.wind.connect(this.filter);
        this.filter.connect(this.windGain);
        this.windGain.connect(this.master);
        this.wind.start();
      }
      this.enabled = !this.enabled;
      if (this.enabled) {
        await this.context.resume();
        this.nextChime = 0;
      }
      this.master.gain.setTargetAtTime(
        this.enabled ? 0.45 : 0,
        this.context.currentTime,
        0.35,
      );
      return this.enabled;
    }
    update(darkness) {
      if (!this.enabled || this.context.state !== "running") return;
      const ctx = this.context,
        now = ctx.currentTime;
      this.filter.frequency.setTargetAtTime(mix(860, 380, darkness), now, 0.6);
      this.windGain.gain.setTargetAtTime(mix(0.17, 0.11, darkness), now, 0.5);
      if (now >= this.nextChime) {
        this.nextChime = now + 5 + random() * 4;
        const notes = [523.25, 587.33, 659.25, 783.99, 880],
          frequency =
            notes[Math.floor(random() * notes.length)] *
            (darkness > 0.6 ? 0.5 : 1);
        const gain = ctx.createGain(),
          osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.035, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.3);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + 3.5);
        this.voices.add(osc);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
          this.voices.delete(osc);
        };
      }
    }
    async suspend() {
      if (this.context && this.context.state === "running")
        await this.context.suspend();
    }
    async resume() {
      if (this.context && this.enabled && this.context.state === "suspended")
        await this.context.resume();
    }
    dispose() {
      if (this.context) {
        this.wind.stop();
        this.voices.forEach((o) => {
          try {
            o.stop();
          } catch (_) {}
        });
        this.context.close().catch(() => {});
      }
    }
  }

  class App {
    constructor() {
      this.scene = new T.Scene();
      this.camera = new T.OrthographicCamera(-10, 10, 10, -10, 0.1, 140);
      this.renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer.domElement.setAttribute("aria-hidden", "true");
      $("scene").appendChild(this.renderer.domElement);
      this.palette = new Palette();
      this.island = new Island(this.scene, this.palette);
      this.atmosphere = new Atmosphere(this.scene, this.palette);
      this.atmosphere.addLampGlows(this.island.group);
      this.leaves = new MapleLeafSystem(
        this.scene,
        this.island.group,
        this.palette,
        420,
      );
      this.cycle = new DayNightCycle(this.scene, this.palette, this.atmosphere);
      this.orbit = new OrbitController(this.camera, $("scene"));
      this.audio = new AmbientAudio();
      this.elapsed = 0;
      this.lastTime = performance.now();
      this.frame = null;
      this.running = true;
      this.disposed = false;
      this.contextLost = false;
      this.listeners = [];
      this.toastTimer = null;
      this.statsTime = 0;
      this.statsFrames = 0;
      this.fps = 60;
      this.labelTimer = 0;
      this.projected = new T.Vector3();
      this.labelAnchor = new T.Vector3(0.93, 5.08, 0);
      this.setupUI();
      this.resize();
      this.orbit.update(1);
      this.update(0);
      this.renderer.render(this.scene, this.camera);
      $("loading").classList.add("done");
      this.tick = this.tick.bind(this);
      this.frame = requestAnimationFrame(this.tick);
      this.listen(window, "resize", () => this.resize());
      this.listen(document, "visibilitychange", () => this.visibility());
      this.listen(window, "pagehide", (e) => {
        if (e.persisted) {
          this.running = false;
          cancelAnimationFrame(this.frame);
          this.audio.suspend().catch(() => {});
        } else this.dispose();
      });
      this.listen(window, "pageshow", (e) => {
        if (e.persisted && !this.disposed) {
          this.running = true;
          this.lastTime = performance.now();
          this.audio.resume().catch(() => {});
          this.frame = requestAnimationFrame(this.tick);
        }
      });
      this.listen(this.renderer.domElement, "webglcontextlost", (e) => {
        e.preventDefault();
        this.contextLost = true;
        this.running = false;
        cancelAnimationFrame(this.frame);
        this.audio.suspend().catch(() => {});
        showError(
          "The graphics context took a little break. Try again to rebuild your island.",
        );
      });
      this.listen(this.renderer.domElement, "webglcontextrestored", () =>
        location.reload(),
      );
      // Small, read-only diagnostics for profiling without exposing mutable scene state.
      window.littleWorld = Object.freeze({
        stats: () => ({
          fps: Math.round(this.fps),
          leaves: this.leaves.count,
          drawCalls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          geometries: this.renderer.info.memory.geometries,
          textures: this.renderer.info.memory.textures,
          phase: this.cycle.phase,
          lamps: this.cycle.lamps,
          cycleSeconds: this.cycle.duration / this.cycle.effectiveSpeed,
          paused: !this.cycle.playing,
          yaw: this.orbit.yaw,
        }),
      });
    }
    listen(target, event, fn, options) {
      target.addEventListener(event, fn, options);
      this.listeners.push([target, event, fn, options]);
    }
    setupUI() {
      const dialog = $("about-dialog");
      const open = () => {
        if (!dialog.open) dialog.showModal();
      };
      this.listen($("info-button"), "click", open);
      this.listen($("explore-button"), "click", open);
      this.listen($("close-dialog"), "click", () => dialog.close());
      this.listen(dialog, "click", (e) => {
        if (e.target === dialog) {
          const r = dialog.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            dialog.close();
        }
      });
      this.listen($("play-button"), "click", () => this.toggleTime());
      this.listen($("speed-button"), "click", () => this.changeSpeed());
      this.listen($("reset-button"), "click", () => {
        this.orbit.reset();
        this.toast("Back to your little corner of the sky");
      });
      this.listen($("sound-button"), "click", () => this.toggleSound());
      const slider = $("time-slider");
      this.listen(slider, "input", () => {
        this.cycle.setPhase(slider.value);
        this.cycle.update(0);
      });
      this.listen(slider, "pointerdown", () => {
        this.cycle.scrubbing = true;
      });
      const stopScrub = () => {
        this.cycle.scrubbing = false;
      };
      this.listen(window, "pointerup", stopScrub);
      this.listen(window, "pointercancel", stopScrub);
      this.listen(slider, "blur", stopScrub);
      this.listen(window, "keydown", (e) => {
        if (dialog.open || e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target;
        if (
          target instanceof HTMLElement &&
          (target.matches("input,textarea,select") || target.isContentEditable)
        )
          return;
        if (
          e.code === "Space" &&
          target instanceof HTMLElement &&
          target.tagName === "BUTTON"
        )
          return;
        if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
          this.cycle.fast = true;
          this.updateSpeedUI();
          return;
        }
        if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
          e.preventDefault();
          this.orbit.targetYaw += e.code === "ArrowLeft" ? 0.13 : -0.13;
          return;
        }
        if (e.repeat) return;
        switch (e.code) {
          case "Space":
            e.preventDefault();
            this.toggleTime();
            break;
          case "KeyS":
            this.changeSpeed();
            break;
          case "KeyM":
            this.toggleSound();
            break;
          case "KeyR":
            this.orbit.reset();
            this.toast("View reset");
            break;
          case "KeyD":
            $("debug").hidden = !$("debug").hidden;
            break;
        }
      });
      this.listen(window, "keyup", (e) => {
        if (e.key === "Shift") {
          this.cycle.fast = false;
          this.updateSpeedUI();
        }
      });
      this.listen(window, "blur", () => {
        this.cycle.fast = false;
        this.cycle.scrubbing = false;
        this.orbit.velocity = 0;
        this.updateSpeedUI();
      });
    }
    toggleTime() {
      this.cycle.playing = !this.cycle.playing;
      const paused = !this.cycle.playing;
      $("play-button").setAttribute("aria-pressed", String(paused));
      $("play-button").setAttribute(
        "aria-label",
        `${paused ? "Resume" : "Pause"} day–night cycle`,
      );
      $("play-button").title =
        `${paused ? "Resume" : "Pause"} day–night cycle (Space)`;
      $("play-button")
        .querySelector("use")
        .setAttribute("href", `#i-${paused ? "play" : "pause"}`);
      this.toast(
        paused ? "A moment, held. Time is paused." : "Let the day drift by.",
      );
    }
    changeSpeed() {
      this.cycle.speed = this.cycle.speed === 4 ? 1 : this.cycle.speed * 2;
      this.updateSpeedUI();
      this.toast(
        `${this.cycle.speed}× speed · a day in ${15 / this.cycle.speed} seconds`,
      );
    }
    updateSpeedUI() {
      const speed = this.cycle.effectiveSpeed;
      $("speed-button").innerHTML = `${speed}<span>×</span>`;
      $("speed-button").setAttribute(
        "aria-label",
        `Change cycle speed, currently ${speed} times`,
      );
      $("duration-label").textContent = String(15 / speed);
    }
    async toggleSound() {
      const button = $("sound-button");
      if (button.disabled) return;
      button.disabled = true;
      try {
        const enabled = await this.audio.toggle();
        button.setAttribute("aria-pressed", String(enabled));
        button.setAttribute(
          "aria-label",
          `${enabled ? "Mute" : "Enable"} ambient sound`,
        );
        button
          .querySelector("use")
          .setAttribute("href", `#i-${enabled ? "sound" : "muted"}`);
        $("sound-label").textContent = enabled ? "Sound on" : "Sound off";
        this.toast(
          enabled
            ? "A soft breeze & a distant wind chime"
            : "A little peace and quiet",
        );
      } catch (error) {
        this.toast(error.message || "Audio is unavailable in this browser.");
      } finally {
        button.disabled = false;
      }
    }
    toast(message) {
      clearTimeout(this.toastTimer);
      $("toast").textContent = message;
      $("toast").classList.add("visible");
      this.toastTimer = setTimeout(
        () => $("toast").classList.remove("visible"),
        2300,
      );
    }
    resize() {
      const width = window.innerWidth,
        height = window.innerHeight;
      if (!width || !height) return;
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, width < 600 ? 1.5 : 1.75),
      );
      this.orbit.resize(width, height);
    }
    visibility() {
      if (this.disposed || this.contextLost) return;
      this.cycle.fast = false;
      this.updateSpeedUI();
      if (document.hidden) {
        this.running = false;
        cancelAnimationFrame(this.frame);
        this.audio.suspend().catch(() => {});
      } else if (!this.running) {
        this.running = true;
        this.lastTime = performance.now();
        this.audio.resume().catch(() => {});
        this.frame = requestAnimationFrame(this.tick);
      }
    }
    update(dt, cycleDt = dt) {
      this.elapsed += dt;
      this.cycle.update(cycleDt);
      this.island.update(this.elapsed, this.cycle.lamps, dt);
      this.leaves.update(dt, this.elapsed);
      this.atmosphere.update(
        this.elapsed,
        this.cycle.phase,
        this.cycle.darkness,
        this.cycle.lamps,
      );
      this.orbit.update(dt);
      this.audio.update(this.cycle.darkness);
    }
    updateLabel() {
      if (window.innerWidth <= 760 || window.innerHeight <= 440) return;
      this.projected
        .copy(this.labelAnchor)
        .applyMatrix4(this.island.group.matrixWorld)
        .project(this.camera);
      const x = (this.projected.x * 0.5 + 0.5) * window.innerWidth,
        y = (-this.projected.y * 0.5 + 0.5) * window.innerHeight;
      const front = Math.abs(Math.sin(this.orbit.yaw - 0.48)) < 0.6;
      $("world-label").style.transform = `translate(${x + 8}px,${y - 18}px)`;
      $("world-label").classList.toggle(
        "visible",
        front && x < window.innerWidth - 160 && x > window.innerWidth * 0.4,
      );
    }
    tick(now) {
      if (!this.running || this.disposed) return;
      // Use elapsed seconds, never frame counts. Clamp particle/scene physics
      // after a stall, but give the clock the full delta so a day still lasts
      // exactly 15 foreground seconds. Hidden tabs resume with a fresh baseline.
      const rawDt = Math.max((now - this.lastTime) / 1000, 0),
        dt = Math.min(rawDt, 0.05);
      this.lastTime = now;
      this.update(dt, rawDt);
      this.renderer.render(this.scene, this.camera);
      this.labelTimer += dt;
      if (this.labelTimer > 0.08) {
        this.updateLabel();
        this.labelTimer = 0;
      }
      this.statsTime += rawDt;
      this.statsFrames++;
      if (this.statsTime >= 0.75) {
        this.fps = this.statsFrames / this.statsTime;
        this.statsTime = 0;
        this.statsFrames = 0;
        if (!$("debug").hidden) {
          const info = this.renderer.info;
          $("debug").textContent =
            `${Math.round(this.fps)} FPS  ·  ${this.leaves.count} leaves\n${info.render.calls} draws  ·  ${Math.round(info.render.triangles / 1000)}k triangles\n${info.memory.geometries} geometries  ·  ${info.memory.textures} textures`;
        }
      }
      this.frame = requestAnimationFrame(this.tick);
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.running = false;
      cancelAnimationFrame(this.frame);
      clearTimeout(this.toastTimer);
      this.orbit.dispose();
      this.audio.dispose();
      this.listeners.forEach(([target, event, fn, options]) =>
        target.removeEventListener(event, fn, options),
      );
      const geometries = new Set(),
        materials = new Set(),
        textures = new Set();
      this.scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) {
          const list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach((m) => materials.add(m));
        }
      });
      materials.forEach((m) => {
        Object.values(m).forEach((v) => {
          if (v && v.isTexture) textures.add(v);
        });
        m.dispose();
      });
      geometries.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      this.cycle.sunLight.shadow.dispose();
      unitBox.dispose();
      unitOrb.dispose();
      this.renderer.dispose();
      delete window.littleWorld;
    }
  }

  try {
    new App();
  } catch (error) {
    console.error("Little world initialization:", error);
    showError(
      "This little world needs WebGL. Enable hardware acceleration in your browser and try again.",
    );
  }
})();
