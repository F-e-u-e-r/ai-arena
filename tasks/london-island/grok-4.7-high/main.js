/* Floating London — cartoon island, four seasons, 15s day/night.
 * Classic script (not ES modules) so the page runs from file://.
 * Three.js r134 UMD is loaded first and exposes the global THREE.
 */
(function () {
  'use strict';

  if (!window.THREE) {
    var missing = document.getElementById('fallback');
    if (missing) {
      missing.hidden = false;
      missing.textContent = '無法載入 Three.js（需要網路以讀取 CDN）';
    }
    return;
  }

  var DAY_LENGTH = 15;
  var SEASON_LENGTH = 10;
  var SEASON_BLEND = 2.8;
  var RIVER_X = 4.55;

  var SEASON_NAMES = ['春季', '夏季', '秋季', '冬季'];
  var PHASE_NAMES = ['白天', '黃昏', '夜晚', '黎明'];
  var Y_UP = new THREE.Vector3(0, 1, 0);
  var SCRATCH = new THREE.Color();

  var SKY_KEYS = [
    { t: 0.00, top: [0.30, 0.70, 0.95], hor: [0.74, 0.91, 1.00], bot: [0.50, 0.78, 0.93], amb: [1.00, 0.97, 0.92] },
    { t: 0.14, top: [0.34, 0.64, 0.95], hor: [1.00, 0.84, 0.66], bot: [0.62, 0.76, 0.90], amb: [1.00, 0.93, 0.80] },
    { t: 0.25, top: [0.16, 0.26, 0.55], hor: [1.00, 0.46, 0.26], bot: [0.55, 0.22, 0.34], amb: [1.00, 0.70, 0.50] },
    { t: 0.36, top: [0.07, 0.09, 0.26], hor: [0.42, 0.20, 0.36], bot: [0.10, 0.07, 0.16], amb: [0.52, 0.46, 0.70] },
    { t: 0.50, top: [0.02, 0.03, 0.09], hor: [0.07, 0.09, 0.22], bot: [0.02, 0.03, 0.07], amb: [0.42, 0.50, 0.78] },
    { t: 0.68, top: [0.03, 0.04, 0.12], hor: [0.11, 0.12, 0.28], bot: [0.04, 0.05, 0.12], amb: [0.46, 0.50, 0.74] },
    { t: 0.75, top: [0.18, 0.26, 0.52], hor: [1.00, 0.60, 0.56], bot: [0.72, 0.38, 0.46], amb: [1.00, 0.76, 0.72] },
    { t: 0.88, top: [0.38, 0.66, 0.93], hor: [1.00, 0.86, 0.76], bot: [0.60, 0.78, 0.90], amb: [1.00, 0.96, 0.90] },
    { t: 1.00, top: [0.30, 0.70, 0.95], hor: [0.74, 0.91, 1.00], bot: [0.50, 0.78, 0.93], amb: [1.00, 0.97, 0.92] }
  ];

  var PAL = {
    grass: ['#3fa534', '#4db82e', '#d4922a', '#dce8ea'],
    foliageA: ['#2f9a32', '#58c42e', '#e06a18', '#7e989c'],
    foliageB: ['#247a28', '#3ea828', '#c44820', '#6e888c'],
    foliageC: ['#52b840', '#7ed44a', '#e09030', '#9aafac'],
    water: ['#1f8eb4', '#0b86b8', '#3a7c90', '#3f86a8'],
    trunk: ['#7a5232', '#6e4a2c', '#5c3e28', '#6a5a50']
  };

  function showFallback(msg) {
    var el = document.getElementById('fallback');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
  }

  function smoothstep(e0, e1, x) {
    var u = (x - e0) / (e1 - e0);
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
    return u * u * (3 - 2 * u);
  }

  function wrap01(t) {
    t = t % 1;
    return t < 0 ? t + 1 : t;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Shortest-path blend on a looping 0..1 clock (day phase). */
  function lerpWrap(a, b, t) {
    var d = b - a;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return wrap01(a + d * t);
  }

  function mix4(out, hexes, w) {
    out.setRGB(0, 0, 0);
    for (var i = 0; i < 4; i++) {
      SCRATCH.set(hexes[i]);
      out.r += SCRATCH.r * w[i];
      out.g += SCRATCH.g * w[i];
      out.b += SCRATCH.b * w[i];
    }
    return out;
  }

  function sampleKeys(t, field, outArr) {
    var i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].t < t) i++;
    var a = SKY_KEYS[i];
    var b = SKY_KEYS[i + 1];
    var span = b.t - a.t || 1;
    var u = (t - a.t) / span;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
    var s = u * u * (3 - 2 * u);
    var av = a[field];
    var bv = b[field];
    outArr[0] = av[0] + (bv[0] - av[0]) * s;
    outArr[1] = av[1] + (bv[1] - av[1]) * s;
    outArr[2] = av[2] + (bv[2] - av[2]) * s;
  }

  function phaseIndex(t) {
    if (t >= 0.18 && t < 0.36) return 1;
    if (t >= 0.36 && t < 0.72) return 2;
    if (t >= 0.72 && t < 0.88) return 3;
    return 0;
  }

  /*
   * Landmark lamps:
   * fade in as dusk begins (t 0.18→0.26), hold through the night,
   * fade out before dawn (t 0.64→0.72). Dawn itself starts at t 0.72.
   */
  function lampFactor(t) {
    return smoothstep(0.18, 0.26, t) * (1 - smoothstep(0.64, 0.72, t));
  }

  function makeGradient() {
    var c = document.createElement('canvas');
    c.width = 4;
    c.height = 1;
    var g = c.getContext('2d');
    var cols = ['#4a4a4a', '#868686', '#c2c2c2', '#ffffff'];
    for (var i = 0; i < cols.length; i++) {
      g.fillStyle = cols[i];
      g.fillRect(i, 0, 1, 1);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.encoding = THREE.LinearEncoding;
    return tex;
  }

  function makeRadial(inner, outer) {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function makeClockTexture() {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#f6f1e4';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 4;
    g.stroke();
    g.save();
    g.translate(64, 64);
    for (var i = 0; i < 12; i++) {
      g.save();
      g.rotate((i / 12) * Math.PI * 2);
      g.fillStyle = '#1b1b1b';
      g.fillRect(-2, -56, i % 3 === 0 ? 4 : 3, i % 3 === 0 ? 14 : 8);
      g.restore();
    }
    g.fillStyle = '#c8102e';
    g.beginPath();
    g.arc(0, 0, 4.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeUnionJack() {
    var c = document.createElement('canvas');
    c.width = 80;
    c.height = 44;
    var g = c.getContext('2d');
    g.fillStyle = '#012169';
    g.fillRect(0, 0, 80, 44);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(80, 44);
    g.moveTo(80, 0); g.lineTo(0, 44);
    g.stroke();
    g.strokeStyle = '#c8102e';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(80, 44);
    g.moveTo(80, 0); g.lineTo(0, 44);
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(40, 0); g.lineTo(40, 44);
    g.moveTo(0, 22); g.lineTo(80, 22);
    g.stroke();
    g.strokeStyle = '#c8102e';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(40, 0); g.lineTo(40, 44);
    g.moveTo(0, 22); g.lineTo(80, 22);
    g.stroke();
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function mapleGeometry() {
    var s = new THREE.Shape();
    var pts = [
      [0, 0.62], [0.14, 0.30], [0.40, 0.38], [0.22, 0.10],
      [0.50, 0.02], [0.20, -0.10], [0.30, -0.40], [0.05, -0.20],
      [0, -0.34], [-0.05, -0.20], [-0.30, -0.40], [-0.20, -0.10],
      [-0.50, 0.02], [-0.22, 0.10], [-0.40, 0.38], [-0.14, 0.30]
    ];
    s.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    var geo = new THREE.ShapeGeometry(s);
    geo.scale(0.95, 0.95, 0.95);
    geo.computeVertexNormals();
    return geo;
  }

  function warpRadial(geo, amp, freq) {
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var z = pos.getZ(i);
      var r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      var ang = Math.atan2(z, x);
      var k = 1 + amp * Math.sin(ang * freq) + amp * 0.4 * Math.sin(ang * (freq + 3) + 1.7);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  function addMesh(parent, geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /* Cylinder axis is +Y. setFromUnitVectors maps +Y onto dir — not lookAt, which aims +Z. */
  function strut(parent, ax, ay, az, bx, by, bz, radius, mat) {
    var dx = bx - ax;
    var dy = by - ay;
    var dz = bz - az;
    var len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return null;
    var mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), mat);
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    var dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    mesh.quaternion.setFromUnitVectors(Y_UP, dir);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /* ------------------------------------------------------------------ */
  /* Day / night. One 0..1 clock. t=0 noon, 0.25 sunset, 0.5 midnight, 0.75 sunrise. */
  /* ------------------------------------------------------------------ */

  function DayNightCycle() {
    this.time = 0.12;
    this.seeking = false;
    this.seekFrom = 0;
    this.seekTo = 0;
    this.seekU = 1;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.colors = {
      top: new THREE.Color(),
      horizon: new THREE.Color(),
      bottom: new THREE.Color(),
      ambient: new THREE.Color(),
      sun: new THREE.Color()
    };
    this.lamp = 0;
    this.elev = 1;
    this.night = 0;
    this.daylight = 1;
    this.dusk = 0;
    this._rgb = [0, 0, 0];
    this.sample();
  }

  DayNightCycle.prototype.sample = function () {
    var t = this.time;
    /* elev = cos(2πt): +1 noon, 0 at sunset/sunrise, -1 midnight.
       Horizontal bearing uses the same angle so the sun walks east→west. */
    var ang = t * Math.PI * 2;
    var elev = Math.cos(ang);
    var horiz = Math.sqrt(Math.max(0, 1 - elev * elev));
    this.sunDir.set(Math.sin(ang) * horiz, elev, Math.cos(ang) * horiz);
    if (this.sunDir.lengthSq() < 1e-6) this.sunDir.set(0, 1, 0);
    else this.sunDir.normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1);
    this.elev = elev;
    this.daylight = smoothstep(-0.08, 0.55, elev);
    this.night = smoothstep(0.34, 0.50, t) * (1 - smoothstep(0.74, 0.90, t));
    this.dusk = Math.max(
      smoothstep(0.15, 0.24, t) * (1 - smoothstep(0.30, 0.42, t)),
      smoothstep(0.72, 0.80, t) * (1 - smoothstep(0.88, 0.97, t)) * 0.65
    );
    this.lamp = lampFactor(t);
    var rgb = this._rgb;
    sampleKeys(t, 'top', rgb);
    this.colors.top.setRGB(rgb[0], rgb[1], rgb[2]);
    sampleKeys(t, 'hor', rgb);
    this.colors.horizon.setRGB(rgb[0], rgb[1], rgb[2]);
    sampleKeys(t, 'bot', rgb);
    this.colors.bottom.setRGB(rgb[0], rgb[1], rgb[2]);
    sampleKeys(t, 'amb', rgb);
    this.colors.ambient.setRGB(rgb[0], rgb[1], rgb[2]);
    var warm = 1 - smoothstep(0.0, 0.5, Math.max(elev, 0));
    this.colors.sun.setRGB(1.0, 0.97, 0.90).lerp(SCRATCH.set('#ff742e'), warm);
  };

  DayNightCycle.prototype.update = function (dt) {
    if (this.seeking) {
      this.seekU += dt / 0.7;
      if (this.seekU >= 1) {
        this.seekU = 1;
        this.seeking = false;
        this.time = this.seekTo;
      } else {
        var s = this.seekU * this.seekU * (3 - 2 * this.seekU);
        this.time = lerpWrap(this.seekFrom, this.seekTo, s);
      }
    } else {
      this.time = wrap01(this.time + dt / DAY_LENGTH);
    }
    this.sample();
  };

  DayNightCycle.prototype.setTime = function (t, smooth) {
    var target = wrap01(t);
    if (!smooth) {
      this.seeking = false;
      this.time = target;
      this.sample();
      return;
    }
    this.seeking = true;
    this.seekFrom = this.time;
    this.seekTo = target;
    this.seekU = 0;
  };

  /* ------------------------------------------------------------------ */
  /* Fixed-capacity particle pool. Slots are recycled; nothing is allocated per spawn. */
  /* ------------------------------------------------------------------ */

  function ParticlePool(geo, mat, max, billboard) {
    this.max = max;
    this.billboard = !!billboard;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.dummy = new THREE.Object3D();
    this.free = [];
    this.state = new Array(max);
    this.dirty = false;
    for (var i = 0; i < max; i++) {
      this.state[i] = {
        active: false, x: 0, y: -80, z: 0, x0: 0, z0: 0,
        vy: 0, g: -1, drift: 0,
        rx: 0, ry: 0, rz: 0, rvx: 0, rvy: 0, rvz: 0,
        phase: 0, freq: 1, amp: 1, scale: 1
      };
      this.free.push(i);
      this._write(i, null);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = max;
  }

  ParticlePool.prototype.alive = function () {
    return this.max - this.free.length;
  };

  ParticlePool.prototype._write = function (i, camera) {
    var s = this.state[i];
    var d = this.dummy;
    if (!s.active) {
      d.position.set(0, -80, 0);
      d.quaternion.identity();
      d.scale.set(0, 0, 0);
    } else if (this.billboard && camera) {
      d.position.set(s.x, s.y, s.z);
      d.quaternion.copy(camera.quaternion);
      d.rotateZ(s.rz);
      d.scale.setScalar(s.scale);
    } else {
      d.position.set(s.x, s.y, s.z);
      d.rotation.set(s.rx, s.ry, s.rz);
      d.scale.setScalar(s.scale);
    }
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
    this.dirty = true;
  };

  ParticlePool.prototype.spawn = function (o) {
    if (!this.free.length) return -1;
    var i = this.free.pop();
    var s = this.state[i];
    s.active = true;
    s.x0 = o.x0; s.z0 = o.z0;
    s.x = o.x0; s.y = o.y; s.z = o.z0;
    s.vy = o.vy; s.g = o.g; s.drift = o.drift || 0;
    s.amp = o.amp; s.freq = o.freq; s.phase = o.phase;
    s.rx = Math.random() * 6; s.ry = Math.random() * 6; s.rz = Math.random() * 6;
    s.rvx = o.rvx || 0; s.rvy = o.rvy || 0; s.rvz = o.rvz || 0;
    s.scale = o.scale;
    return i;
  };

  ParticlePool.prototype.release = function (i) {
    var s = this.state[i];
    if (!s.active) return;
    s.active = false;
    this.free.push(i);
    this._write(i, null);
  };

  /*
   * Leaf / snow motion:
   *   x = x0 + sin(ωt + φ) * amp   lateral sway (左右擺動)
   *   rotation += spin * dt        tumble (旋轉)
   *   vy += g * dt, y += vy * dt   gravity
   * Slots that pass the lawn (or fall off the edge) return to the free list.
   */
  ParticlePool.prototype.integrate = function (dt, elapsed, gy, camera, terminal) {
    for (var i = 0; i < this.max; i++) {
      var s = this.state[i];
      if (!s.active) continue;
      s.vy = Math.max(terminal, s.vy + s.g * dt);
      s.y += s.vy * dt;
      s.x0 += s.drift * dt;
      s.x = s.x0 + Math.sin(elapsed * s.freq + s.phase) * s.amp;
      s.z = s.z0 + Math.cos(elapsed * s.freq * 0.73 + s.phase) * s.amp * 0.65;
      s.rx += s.rvx * dt;
      s.ry += s.rvy * dt;
      s.rz += s.rvz * dt;
      var nx = s.x0 / 10.2;
      var nz = s.z0 / 8.6;
      var over = nx * nx + nz * nz < 1;
      var limit = over ? gy + 0.02 : gy - 8;
      if (s.y < limit) {
        this.release(i);
        continue;
      }
      var sink = s.y - limit;
      var sc = s.scale;
      if (sink < 0.55) sc *= Math.max(0, sink / 0.55);
      var saved = s.scale;
      s.scale = sc;
      this._write(i, camera);
      s.scale = saved;
    }
  };

  function WeatherSystem(scene) {
    this.weights = new Float32Array([1, 0, 0, 0]);
    this.phase = 0;
    this.auto = true;
    this.manual = 0;
    this.leafAcc = 0;
    this.snowAcc = 0;
    this.scene = scene;

    var leafMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    var snowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: makeRadial('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
      side: THREE.DoubleSide
    });
    this.leaves = new ParticlePool(mapleGeometry(), leafMat, 110, false);
    this.snow = new ParticlePool(new THREE.PlaneGeometry(0.36, 0.36), snowMat, 150, true);
    scene.add(this.leaves.mesh);
    scene.add(this.snow.mesh);

    var LEAF_COLORS = [
      new THREE.Color('#e23b2b'),
      new THREE.Color('#f08a1e'),
      new THREE.Color('#f2c84b'),
      new THREE.Color('#8d3418')
    ];
    this._leafColors = LEAF_COLORS;
    for (var i = 0; i < 110; i++) this.leaves.mesh.setColorAt(i, LEAF_COLORS[i % 4]);
    this.leaves.mesh.instanceColor.needsUpdate = true;

    this.mist = this._soft(36, new THREE.PointsMaterial({
      color: 0xd5e9f6,
      map: makeRadial('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'),
      size: 6.5,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false
    }));
    this.fireflies = this._soft(22, new THREE.PointsMaterial({
      color: 0xffe08a,
      map: makeRadial('rgba(255,240,180,1)', 'rgba(255,240,180,0)'),
      size: 0.55,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false
    }));
    scene.add(this.mist.points);
    scene.add(this.fireflies.points);
    this._seedField(this.mist, 0.4, 3.2);
    this._seedField(this.fireflies, 0.6, 2.4);
  }

  WeatherSystem.prototype._soft = function (count, mat) {
    var positions = new Float32Array(count * 3);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return {
      count: count,
      pos: positions,
      attr: geo.attributes.position,
      points: points,
      phase: new Float32Array(count)
    };
  };

  WeatherSystem.prototype._seedField = function (field, y0, y1) {
    for (var i = 0; i < field.count; i++) {
      var a = Math.random() * Math.PI * 2;
      var rr = Math.sqrt(Math.random());
      field.pos[i * 3] = Math.cos(a) * 10 * rr;
      field.pos[i * 3 + 1] = y0 + Math.random() * (y1 - y0);
      field.pos[i * 3 + 2] = Math.sin(a) * 8 * rr;
      field.phase[i] = Math.random() * Math.PI * 2;
    }
    field.attr.needsUpdate = true;
  };

  WeatherSystem.prototype.dominant = function () {
    var m = 0;
    for (var i = 1; i < 4; i++) if (this.weights[i] > this.weights[m]) m = i;
    return m;
  };

  WeatherSystem.prototype.setSeason = function (index) {
    this.auto = false;
    this.manual = index;
  };

  WeatherSystem.prototype.setAuto = function (on) {
    this.manual = this.dominant();
    this.auto = on;
    if (on) this.phase = this.manual;
  };

  WeatherSystem.prototype._spawnColumn = function (pool, o) {
    var a = Math.random() * Math.PI * 2;
    var rr = Math.sqrt(Math.random()) * 1.08;
    o.x0 = Math.cos(a) * 11.2 * rr;
    o.z0 = Math.sin(a) * 9.2 * rr;
    o.y = 7.5 + Math.random() * 7;
    o.phase = Math.random() * Math.PI * 2;
    var i = pool.spawn(o);
    return i;
  };

  WeatherSystem.prototype.update = function (dt, elapsed, gy, camera) {
    if (this.auto) {
      this.phase = (this.phase + dt / SEASON_LENGTH) % 4;
      var i = Math.floor(this.phase) % 4;
      var f = this.phase - Math.floor(this.phase);
      var blend = SEASON_BLEND / SEASON_LENGTH;
      this.weights[0] = this.weights[1] = this.weights[2] = this.weights[3] = 0;
      if (f <= 1 - blend) {
        this.weights[i] = 1;
      } else {
        var u = (f - (1 - blend)) / blend;
        var s = u * u * (3 - 2 * u);
        this.weights[i] = 1 - s;
        this.weights[(i + 1) % 4] = s;
      }
    } else {
      var k = 1 - Math.exp(-3.2 * dt);
      var sum = 0;
      for (var n = 0; n < 4; n++) {
        var target = n === this.manual ? 1 : 0;
        this.weights[n] += (target - this.weights[n]) * k;
        sum += this.weights[n];
      }
      if (sum > 1e-5) {
        for (n = 0; n < 4; n++) this.weights[n] /= sum;
      }
    }

    var w = this.weights;
    /* Spawn rates scale with the season weight. The pool refuses extras — no unbounded growth. */
    this.leafAcc += 32 * w[2] * dt;
    this.snowAcc += 46 * w[3] * dt;
    var guard = 0;
    while (this.leafAcc >= 1 && guard++ < 10) {
      this.leafAcc -= 1;
      var li = this._spawnColumn(this.leaves, {
        vy: -0.55 - Math.random() * 0.7,
        g: -1.2,
        amp: 0.75 + Math.random() * 1.15,
        freq: 1.05 + Math.random() * 1.35,
        rvx: (Math.random() - 0.5) * 2.2,
        rvy: (Math.random() - 0.5) * 2.4,
        rvz: 1.4 + Math.random() * 2.4,
        scale: 0.8 + Math.random() * 0.65,
        drift: (Math.random() - 0.5) * 0.45
      });
      if (li >= 0) {
        this.leaves.mesh.setColorAt(li, this._leafColors[li % 4]);
        this.leaves.mesh.instanceColor.needsUpdate = true;
      } else this.leafAcc = 0;
    }
    guard = 0;
    while (this.snowAcc >= 1 && guard++ < 12) {
      this.snowAcc -= 1;
      var si = this._spawnColumn(this.snow, {
        vy: -0.35 - Math.random() * 0.55,
        g: -0.28,
        amp: 0.55 + Math.random() * 1.05,
        freq: 0.55 + Math.random() * 0.9,
        rvz: (Math.random() - 0.5) * 1.6,
        scale: 0.55 + Math.random() * 0.9,
        drift: (Math.random() - 0.5) * 0.22
      });
      if (si < 0) this.snowAcc = 0;
    }

    this.leaves.dirty = false;
    this.snow.dirty = false;
    this.leaves.integrate(dt, elapsed, gy, camera, -3.1);
    this.snow.integrate(dt, elapsed, gy, camera, -1.45);
    if (this.leaves.dirty) this.leaves.mesh.instanceMatrix.needsUpdate = true;
    if (this.snow.dirty) this.snow.mesh.instanceMatrix.needsUpdate = true;

    this._driftMist(this.mist, dt, elapsed, gy, 0.22);
    this._driftFireflies(this.fireflies, dt, elapsed, gy);
    var spring = w[0];
    var summerNight = w[1] * (1 - this._dayHint);
    this.mist.points.visible = spring > 0.04;
    this.mist.points.material.opacity = spring * 0.36;
    this.fireflies.points.visible = summerNight > 0.12;
    this.fireflies.points.material.opacity = Math.min(1, summerNight * 1.4);
  };

  WeatherSystem.prototype._driftMist = function (field, dt, elapsed, gy, speed) {
    if (!field.points.visible && this.weights[0] < 0.04) return;
    var p = field.pos;
    for (var i = 0; i < field.count; i++) {
      var ph = field.phase[i];
      p[i * 3] += Math.sin(elapsed * 0.35 + ph) * dt * 0.35;
      p[i * 3 + 2] += Math.cos(elapsed * 0.28 + ph) * dt * 0.25;
      p[i * 3 + 1] -= dt * speed;
      if (p[i * 3 + 1] < gy + 0.2) {
        var a = Math.random() * Math.PI * 2;
        var rr = Math.sqrt(Math.random());
        p[i * 3] = Math.cos(a) * 10 * rr;
        p[i * 3 + 1] = gy + 2.4 + Math.random() * 2.2;
        p[i * 3 + 2] = Math.sin(a) * 8.2 * rr;
      }
    }
    field.attr.needsUpdate = true;
  };

  WeatherSystem.prototype._driftFireflies = function (field, dt, elapsed, gy) {
    if (!field.points.visible) return;
    var p = field.pos;
    for (var i = 0; i < field.count; i++) {
      var ph = field.phase[i];
      p[i * 3] += Math.sin(elapsed * 0.7 + ph) * dt * 0.55;
      p[i * 3 + 1] += Math.cos(elapsed * 0.5 + ph * 1.3) * dt * 0.28;
      p[i * 3 + 2] += Math.cos(elapsed * 0.6 + ph) * dt * 0.4;
      if (p[i * 3 + 1] < gy + 0.35) p[i * 3 + 1] = gy + 0.35;
      if (p[i * 3 + 1] > gy + 2.6) p[i * 3 + 1] = gy + 2.6;
    }
    field.attr.needsUpdate = true;
  };

  WeatherSystem.prototype.particleCount = function () {
    var n = this.leaves.alive() + this.snow.alive();
    if (this.mist.points.visible) n += this.mist.count;
    if (this.fireflies.points.visible) n += this.fireflies.count;
    return n;
  };

  /* ------------------------------------------------------------------ */
  /* Camera. One yaw/pitch pair is the only orbit frame. */
  /* yaw = 0, pitch = 0 → camera on +Z, looking toward the target (−Z). */
  /* Drag-right decreases yaw, matching OrbitControls (theta -= Δx). */
  /* ------------------------------------------------------------------ */

  function CameraRig(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(0.2, 2.55, 0.15);
    this.yaw = 0.72;
    this.pitch = 0.48;
    this.dist = 30;
    this.baseDist = 30;
    this.minDist = 20;
    this.maxDist = 52;
    this.userTookControl = false;
    this.userZoomed = false;
  }

  CameraRig.prototype.setFrame = function (dist) {
    this.baseDist = dist;
    this.minDist = dist * 0.68;
    this.maxDist = dist * 1.45;
    if (!this.userZoomed) this.dist = dist;
    else this.dist = Math.min(this.maxDist, Math.max(this.minDist, this.dist));
  };

  CameraRig.prototype.drag = function (dx, dy) {
    this.yaw -= dx * 0.0055;
    this.pitch += dy * 0.0032;
    if (this.pitch < 0.22) this.pitch = 0.22;
    if (this.pitch > 0.92) this.pitch = 0.92;
    this.userTookControl = true;
  };

  CameraRig.prototype.zoom = function (deltaY) {
    this.dist *= Math.exp(deltaY * 0.0011);
    if (this.dist < this.minDist) this.dist = this.minDist;
    if (this.dist > this.maxDist) this.dist = this.maxDist;
    this.userZoomed = true;
    this.userTookControl = true;
  };

  CameraRig.prototype.nudge = function (dyaw, dpitch) {
    this.yaw += dyaw;
    this.pitch += dpitch;
    if (this.pitch < 0.22) this.pitch = 0.22;
    if (this.pitch > 0.92) this.pitch = 0.92;
    this.userTookControl = true;
  };

  CameraRig.prototype.update = function (dt) {
    if (!this.userTookControl) this.yaw += dt * 0.08;
    var cp = Math.cos(this.pitch);
    var sp = Math.sin(this.pitch);
    var sy = Math.sin(this.yaw);
    var cy = Math.cos(this.yaw);
    this.camera.position.set(
      this.target.x + sy * cp * this.dist,
      this.target.y + sp * this.dist,
      this.target.z + cy * cp * this.dist
    );
    this.camera.lookAt(this.target);
  };

  /* ------------------------------------------------------------------ */
  /* Landmarks */
  /* ------------------------------------------------------------------ */

  function Landmark(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.pointLights = [];
  }

  Landmark.prototype.addPoint = function (x, y, z, color, intensity, distance) {
    var l = new THREE.PointLight(color, 0, distance, 2);
    l.position.set(x, y, z);
    l.userData.base = intensity;
    this.group.add(l);
    this.pointLights.push(l);
    return l;
  };

  Landmark.prototype.setLamp = function (factor) {
    for (var i = 0; i < this.pointLights.length; i++) {
      var l = this.pointLights[i];
      l.intensity = l.userData.base * factor;
      l.visible = factor > 0.03;
    }
  };

  function makeClock(parent, M) {
    var g = new THREE.Group();
    var face = new THREE.Mesh(new THREE.CircleGeometry(0.50, 28), M.clock);
    face.position.z = 0.012;
    face.castShadow = false;
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.045, 8, 28), M.gold);
    rim.castShadow = false;
    var hour = new THREE.Group();
    var minute = new THREE.Group();
    var second = new THREE.Group();
    var hMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.28, 0.03), M.hand);
    hMesh.position.y = 0.11;
    var mMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.38, 0.03), M.hand);
    mMesh.position.y = 0.15;
    var sMesh = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.44, 0.02), M.secondHand);
    sMesh.position.y = 0.16;
    hour.add(hMesh);
    minute.add(mMesh);
    second.add(sMesh);
    hour.position.z = 0.05;
    minute.position.z = 0.07;
    second.position.z = 0.09;
    g.add(face, rim, hour, minute, second);
    parent.add(g);
    return { group: g, hour: hour, minute: minute, second: second };
  }

  function BigBen(parent, M) {
    Landmark.call(this, parent);
    var g = this.group;
    var stone = M.stone;
    addMesh(g, new THREE.BoxGeometry(2.05, 0.38, 2.05), stone, 0, 0.19, 0);
    addMesh(g, new THREE.BoxGeometry(1.72, 0.22, 1.72), M.stoneDark, 0, 0.48, 0);
    addMesh(g, new THREE.BoxGeometry(1.36, 4.15, 1.36), stone, 0, 2.66, 0);
    addMesh(g, new THREE.BoxGeometry(1.62, 1.22, 1.62), stone, 0, 5.28, 0);
    addMesh(g, new THREE.BoxGeometry(1.28, 1.18, 1.28), M.stoneDark, 0, 6.46, 0);

    var faces = [
      { x: 0, z: 1, ry: 0 },
      { x: 0, z: -1, ry: Math.PI },
      { x: 1, z: 0, ry: Math.PI / 2 },
      { x: -1, z: 0, ry: -Math.PI / 2 }
    ];
    var winGeo = new THREE.BoxGeometry(0.22, 0.32, 0.05);
    for (var f = 0; f < faces.length; f++) {
      var face = faces[f];
      for (var row = 0; row < 5; row++) {
        var w = addMesh(g, winGeo, M.window, face.x * 0.72, 1.15 + row * 0.72, face.z * 0.72);
        w.rotation.y = face.ry;
        w.castShadow = false;
      }
      var opening = addMesh(g, new THREE.BoxGeometry(0.46, 0.72, 0.08), M.opening, face.x * 0.66, 6.46, face.z * 0.66);
      opening.rotation.y = face.ry;
      opening.castShadow = false;
    }

    this.clocks = [];
    for (f = 0; f < faces.length; f++) {
      var ck = makeClock(g, M);
      ck.group.position.set(faces[f].x * 0.84, 5.28, faces[f].z * 0.84);
      ck.group.rotation.y = faces[f].ry;
      this.clocks.push(ck);
    }

    var spire = addMesh(g, new THREE.ConeGeometry(0.78, 2.15, 4), M.slate, 0, 8.05, 0);
    spire.rotation.y = Math.PI / 4;
    addMesh(g, new THREE.SphereGeometry(0.12, 10, 8), M.gold, 0, 9.22, 0);

    var flagPivot = new THREE.Group();
    flagPivot.position.set(0.16, 9.45, 0);
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), M.flag);
    flag.position.x = 0.31;
    flag.castShadow = false;
    flagPivot.add(flag);
    g.add(flagPivot);
    this.flagPivot = flagPivot;

    /* Palace of Westminster wing, so the tower is not a lone block. */
    addMesh(g, new THREE.BoxGeometry(4.6, 1.85, 2.05), stone, -3.35, 0.92, 0.05);
    addMesh(g, new THREE.BoxGeometry(4.7, 0.16, 2.25), M.slate, -3.35, 1.9, 0.05);
    var roofSnow = addMesh(g, new THREE.BoxGeometry(4.55, 0.1, 2.05), M.snow, -3.35, 2.04, 0.05);
    roofSnow.castShadow = false;
    M.snowMeshes.push(roofSnow);
    for (var s = 0; s < 4; s++) {
      var sp = addMesh(g, new THREE.ConeGeometry(0.16, 0.7, 5), M.slate, -5.15 + s * 1.15, 2.3, 0.05);
      sp.castShadow = false;
    }
    var pWin = new THREE.BoxGeometry(0.28, 0.4, 0.05);
    for (var pw = 0; pw < 5; pw++) {
      var pm = addMesh(g, pWin, M.window, -4.9 + pw * 0.78, 1.05, 1.1);
      pm.castShadow = false;
    }

    this.addPoint(0, 5.5, 1.35, 0xffc98a, 1.35, 9);
    this.addPoint(-1.2, 2.2, 1.5, 0xffc98a, 0.55, 6);
  }

  BigBen.prototype = Object.create(Landmark.prototype);
  BigBen.prototype.constructor = BigBen;

  BigBen.prototype.update = function (elapsed) {
    var ms = performance.now();
    var sec = (ms / 1000) % 60;
    var min = (ms / 60000) % 60;
    var hr = ((ms / 3600000) % 12) + min / 60;
    /* Local +Z faces the viewer. Negative Z rotation moves the hand clockwise. */
    var hz = -(hr / 12) * Math.PI * 2;
    var mz = -(min / 60) * Math.PI * 2;
    var sz = -(sec / 60) * Math.PI * 2;
    for (var i = 0; i < this.clocks.length; i++) {
      this.clocks[i].hour.rotation.z = hz;
      this.clocks[i].minute.rotation.z = mz;
      this.clocks[i].second.rotation.z = sz;
    }
    this.flagPivot.rotation.y = Math.sin(elapsed * 1.6) * 0.35;
    this.flagPivot.rotation.z = Math.sin(elapsed * 2.2) * 0.06;
  };

  function LondonEye(parent, M) {
    Landmark.call(this, parent);
    var g = this.group;
    var R = 2.15;
    this.wheel = new THREE.Group();
    this.wheel.position.y = 3.25;
    g.add(this.wheel);

    var rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.055, 8, 40), M.white);
    rim.castShadow = true;
    this.wheel.add(rim);
    var glowRim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.025, 6, 40), M.eyeGlow);
    glowRim.castShadow = false;
    this.wheel.add(glowRim);

    var hub = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), M.white);
    this.wheel.add(hub);
    var axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), M.metal);
    axle.rotation.x = Math.PI / 2;
    this.wheel.add(axle);

    this.capsules = [];
    var capsuleGeo = new THREE.BoxGeometry(0.32, 0.4, 0.24);
    var capWinGeo = new THREE.BoxGeometry(0.18, 0.14, 0.26);
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2;
      var cap = new THREE.Group();
      cap.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      var body = new THREE.Mesh(capsuleGeo, i % 2 ? M.capsuleRed : M.capsuleGold);
      body.castShadow = true;
      var win = new THREE.Mesh(capWinGeo, M.window);
      win.position.set(0, 0.02, 0);
      win.castShadow = false;
      cap.add(body, win);
      this.wheel.add(cap);
      this.capsules.push(cap);

      var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, R, 0.03), M.white);
      spoke.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0);
      spoke.rotation.z = a - Math.PI / 2;
      spoke.castShadow = false;
      this.wheel.add(spoke);

      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), M.eyeGlow);
      bulb.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.08);
      bulb.castShadow = false;
      this.wheel.add(bulb);
    }

    addMesh(g, new THREE.CylinderGeometry(1.7, 1.85, 0.1, 18), M.path, 0, 0.05, -0.35);
    strut(g, -1.05, 0.1, -1.25, -0.15, 3.25, -0.05, 0.07, M.white);
    strut(g, 1.05, 0.1, -1.25, 0.15, 3.25, -0.05, 0.07, M.white);
    strut(g, -1.05, 0.1, -1.25, 1.05, 0.1, -1.25, 0.05, M.white);
    this.addPoint(0, 3.25, 0.4, 0xfff1cc, 1.15, 8);
    this.spin = 0;
  }

  LondonEye.prototype = Object.create(Landmark.prototype);
  LondonEye.prototype.constructor = LondonEye;

  LondonEye.prototype.update = function (dt) {
    this.spin += dt * 0.22;
    this.wheel.rotation.z = this.spin;
    for (var i = 0; i < this.capsules.length; i++) {
      this.capsules[i].rotation.z = -this.spin;
    }
  };

  function TowerBridge(parent, M) {
    Landmark.call(this, parent);
    var g = this.group;
    var stone = M.stone;
    var blue = M.blue;

    function tower(x) {
      addMesh(g, new THREE.BoxGeometry(0.72, 3.15, 1.15), stone, x, 1.58, 0);
      addMesh(g, new THREE.BoxGeometry(0.88, 0.28, 1.32), M.stoneDark, x, 3.2, 0);
      var roofL = addMesh(g, new THREE.ConeGeometry(0.22, 0.7, 5), blue, x - 0.22, 3.7, 0.28);
      var roofR = addMesh(g, new THREE.ConeGeometry(0.22, 0.7, 5), blue, x + 0.22, 3.7, -0.28);
      addMesh(g, new THREE.ConeGeometry(0.18, 0.85, 5), blue, x, 3.85, 0);
      addMesh(g, new THREE.SphereGeometry(0.07, 8, 6), M.gold, x, 4.32, 0);
      var win = addMesh(g, new THREE.BoxGeometry(0.28, 0.4, 0.06), M.window, x, 2.15, 0.6);
      win.castShadow = false;
      var winB = addMesh(g, new THREE.BoxGeometry(0.28, 0.4, 0.06), M.window, x, 2.15, -0.6);
      winB.rotation.y = Math.PI;
      winB.castShadow = false;
      M.snowMeshes.push(addMesh(g, new THREE.BoxGeometry(0.5, 0.06, 0.5), M.snow, x, 3.38, 0));
      roofL.castShadow = false;
      roofR.castShadow = false;
    }
    tower(-1.75);
    tower(1.75);

    addMesh(g, new THREE.BoxGeometry(2.5, 0.16, 0.18), blue, 0, 2.85, 0.42);
    addMesh(g, new THREE.BoxGeometry(2.5, 0.16, 0.18), blue, 0, 2.85, -0.42);
    addMesh(g, new THREE.BoxGeometry(2.5, 0.1, 0.9), M.stoneDark, 0, 2.7, 0);

    /* Approaches */
    addMesh(g, new THREE.BoxGeometry(2.3, 0.16, 1.25), M.road, -3.15, 0.62, 0);
    addMesh(g, new THREE.BoxGeometry(2.3, 0.16, 1.25), M.road, 3.15, 0.62, 0);

    /* Bascules meet at the centre. Hinge is the outer end; local +X / −X runs inward.
       Positive rotation.z lifts world +X, so the right leaf (inward is −X) uses the opposite sign. */
    this.hingeL = new THREE.Group();
    this.hingeR = new THREE.Group();
    this.hingeL.position.set(-1.45, 0.62, 0);
    this.hingeR.position.set(1.45, 0.62, 0);
    var leafGeo = new THREE.BoxGeometry(1.4, 0.14, 1.25);
    var leafL = new THREE.Mesh(leafGeo, M.road);
    leafL.position.x = 0.7;
    leafL.castShadow = true;
    leafL.receiveShadow = true;
    var leafR = new THREE.Mesh(leafGeo, M.road);
    leafR.position.x = -0.7;
    leafR.castShadow = true;
    leafR.receiveShadow = true;
    this.hingeL.add(leafL);
    this.hingeR.add(leafR);
    g.add(this.hingeL);
    g.add(this.hingeR);

    var chainMat = blue;
    function chain(z) {
      var curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-4.15, 0.85, z),
        new THREE.Vector3(-2.9, 2.15, z),
        new THREE.Vector3(-1.75, 3.35, z),
        new THREE.Vector3(0, 3.55, z),
        new THREE.Vector3(1.75, 3.35, z),
        new THREE.Vector3(2.9, 2.15, z),
        new THREE.Vector3(4.15, 0.85, z)
      ]);
      var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.03, 5, false), chainMat);
      tube.castShadow = false;
      g.add(tube);
    }
    chain(0.55);
    chain(-0.55);

    var fp = new THREE.Group();
    fp.position.set(-1.75, 4.45, 0);
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), M.flag);
    flag.position.x = 0.21;
    flag.castShadow = false;
    fp.add(flag);
    g.add(fp);
    this.flagPivot = fp;

    this.addPoint(-1.75, 3.3, 0.9, 0xffe0b0, 0.7, 6);
    this.addPoint(1.75, 3.3, 0.9, 0xffe0b0, 0.7, 6);
  }

  TowerBridge.prototype = Object.create(Landmark.prototype);
  TowerBridge.prototype.constructor = TowerBridge;

  TowerBridge.prototype.update = function (elapsed) {
    var a = Math.sin(elapsed * 0.35) * 0.07;
    this.hingeL.rotation.z = a;
    this.hingeR.rotation.z = -a;
    this.flagPivot.rotation.y = Math.sin(elapsed * 1.4 + 1) * 0.4;
  };

  /* ------------------------------------------------------------------ */
  /* Island */
  /* ------------------------------------------------------------------ */

  function makeTree(M, scale) {
    var g = new THREE.Group();
    var trunk = addMesh(g, new THREE.CylinderGeometry(0.09 * scale, 0.12 * scale, 0.7 * scale, 6), M.trunk, 0, 0.35 * scale, 0);
    trunk.castShadow = true;
    var which = M.foliage[scale > 1 ? 0 : (scale > 0.9 ? 1 : 2)];
    var f1 = addMesh(g, new THREE.SphereGeometry(0.48 * scale, 8, 6), which, 0, 0.85 * scale, 0);
    f1.scale.y = 0.85;
    var f2 = addMesh(g, new THREE.SphereGeometry(0.34 * scale, 8, 6), which, 0.1 * scale, 1.2 * scale, 0);
    var cap = addMesh(g, new THREE.SphereGeometry(0.28 * scale, 8, 6), M.snow, 0, 1.35 * scale, 0);
    cap.scale.y = 0.45;
    cap.castShadow = false;
    M.snowMeshes.push(cap);
    g.userData.base = scale;
    return g;
  }

  function makeHouseRow(M) {
    var g = new THREE.Group();
    for (var i = 0; i < 3; i++) {
      var x = (i - 1) * 1.15;
      addMesh(g, new THREE.BoxGeometry(1.05, 1.15, 1.35), M.brick, x, 0.58, 0);
      addMesh(g, new THREE.BoxGeometry(1.15, 0.14, 1.5), M.slate, x, 1.2, 0);
      var snow = addMesh(g, new THREE.BoxGeometry(1.05, 0.08, 1.35), M.snow, x, 1.3, 0);
      snow.castShadow = false;
      M.snowMeshes.push(snow);
      addMesh(g, new THREE.BoxGeometry(0.12, 0.28, 0.12), M.brick, x + 0.3, 1.4, -0.3);
      var win = addMesh(g, new THREE.BoxGeometry(0.28, 0.32, 0.05), M.window, x, 0.7, 0.7);
      win.castShadow = false;
      var door = addMesh(g, new THREE.BoxGeometry(0.22, 0.4, 0.05), M.opening, x - 0.28, 0.28, 0.7);
      door.castShadow = false;
    }
    return g;
  }

  function makeBus(M) {
    var g = new THREE.Group();
    addMesh(g, new THREE.BoxGeometry(1.15, 0.55, 2.15), M.bus, 0, 0.72, 0);
    addMesh(g, new THREE.BoxGeometry(1.05, 0.48, 2.0), M.bus, 0, 1.18, -0.02);
    var stripe = addMesh(g, new THREE.BoxGeometry(1.16, 0.08, 2.16), M.gold, 0, 0.95, 0);
    stripe.castShadow = false;
    var winGeo = new THREE.BoxGeometry(1.12, 0.22, 0.46);
    var w1 = addMesh(g, winGeo, M.window, 0, 1.22, 0.55);
    var w2 = addMesh(g, winGeo, M.window, 0, 1.22, -0.15);
    var w3 = addMesh(g, winGeo, M.window, 0, 1.22, -0.8);
    w1.castShadow = w2.castShadow = w3.castShadow = false;
    var wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10);
    var wheels = [];
    var wz = [-0.7, 0.7];
    var wx = [-0.48, 0.48];
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        var wh = addMesh(g, wheelGeo, M.tire, wx[j], 0.16, wz[i]);
        wh.rotation.z = Math.PI / 2;
        wheels.push(wh);
      }
    }
    g.userData.wheels = wheels;
    return g;
  }

  function makeTaxi(M) {
    var g = new THREE.Group();
    addMesh(g, new THREE.BoxGeometry(0.7, 0.32, 1.25), M.taxi, 0, 0.36, 0);
    addMesh(g, new THREE.BoxGeometry(0.62, 0.28, 0.62), M.taxi, 0, 0.62, -0.05);
    var sign = addMesh(g, new THREE.BoxGeometry(0.16, 0.08, 0.1), M.gold, 0, 0.8, -0.05);
    sign.castShadow = false;
    var win = addMesh(g, new THREE.BoxGeometry(0.64, 0.16, 0.4), M.window, 0, 0.64, 0.05);
    win.castShadow = false;
    var wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8);
    [[-0.32, 0.4], [0.32, 0.4], [-0.32, -0.4], [0.32, -0.4]].forEach(function (p) {
      var wh = addMesh(g, wheelGeo, M.tire, p[0], 0.1, p[1]);
      wh.rotation.z = Math.PI / 2;
    });
    return g;
  }

  function makePhone(M) {
    var g = new THREE.Group();
    addMesh(g, new THREE.BoxGeometry(0.42, 0.95, 0.42), M.bus, 0, 0.48, 0);
    addMesh(g, new THREE.BoxGeometry(0.48, 0.1, 0.48), M.bus, 0, 0.98, 0);
    addMesh(g, new THREE.SphereGeometry(0.08, 8, 6), M.gold, 0, 1.12, 0);
    var door = addMesh(g, new THREE.BoxGeometry(0.22, 0.7, 0.04), M.phone, 0, 0.45, 0.22);
    door.castShadow = false;
    return g;
  }

  function makeShard(M) {
    var g = new THREE.Group();
    var levels = [[0.7, 1.15], [0.52, 1.25], [0.36, 1.2], [0.22, 0.95]];
    var y = 0;
    for (var i = 0; i < levels.length; i++) {
      var h = levels[i][1];
      var m = addMesh(g, new THREE.BoxGeometry(levels[i][0], h, levels[i][0] * 0.72), M.shard, 0, y + h / 2, 0);
      m.castShadow = false;
      y += h;
    }
    var tip = addMesh(g, new THREE.ConeGeometry(0.1, 0.7, 4), M.shard, 0, y + 0.35, 0);
    tip.castShadow = false;
    return g;
  }

  function makeBoat(M) {
    var g = new THREE.Group();
    var hull = addMesh(g, new THREE.BoxGeometry(0.42, 0.16, 0.95), M.bus, 0, 0.1, 0);
    hull.castShadow = false;
    addMesh(g, new THREE.BoxGeometry(0.28, 0.16, 0.32), M.white, 0, 0.24, -0.08);
    addMesh(g, new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6), M.brick, 0.1, 0.38, -0.2);
    return g;
  }

  function Island(parent, M) {
    this.group = new THREE.Group();
    parent.add(this.group);
    var g = this.group;

    var grass = new THREE.Mesh(new THREE.CylinderGeometry(9.55, 9.75, 0.5, 28), M.grass);
    grass.position.y = -0.25;
    grass.receiveShadow = true;
    grass.castShadow = true;
    warpRadial(grass.geometry, 0.11, 3);
    g.add(grass);

    var dirt = new THREE.Mesh(new THREE.CylinderGeometry(10.15, 9.2, 1.05, 22), M.dirt);
    dirt.position.y = -0.95;
    dirt.castShadow = true;
    dirt.receiveShadow = true;
    warpRadial(dirt.geometry, 0.11, 3);
    g.add(dirt);

    var rock = new THREE.Mesh(new THREE.CylinderGeometry(8.3, 0.7, 5.5, 7), M.rock);
    rock.position.y = -4.05;
    rock.castShadow = true;
    warpRadial(rock.geometry, 0.14, 3);
    g.add(rock);

    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(20, 15), M.blob);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -7.15;
    shadow.castShadow = false;
    shadow.receiveShadow = false;
    g.add(shadow);

    [[-7.6, 2.2], [6.5, 5.6], [-1.2, -7.2]].forEach(function (p) {
      var hill = addMesh(g, new THREE.SphereGeometry(1.35, 10, 8), M.grass, p[0], -0.05, p[1]);
      hill.scale.y = 0.28;
    });

    /* Thames: a shallow ribbon on the lawn, banks, then a waving surface. */
    var basin = addMesh(g, new THREE.BoxGeometry(2.25, 0.08, 13.2), M.basin, RIVER_X, 0.04, 0);
    basin.castShadow = false;
    addMesh(g, new THREE.BoxGeometry(0.28, 0.18, 13.2), M.stone, RIVER_X - 1.28, 0.09, 0);
    addMesh(g, new THREE.BoxGeometry(0.28, 0.18, 13.2), M.stone, RIVER_X + 1.28, 0.09, 0);

    var riverGeo = new THREE.PlaneGeometry(2.05, 13.0, 8, 24);
    riverGeo.rotateX(-Math.PI / 2);
    this.riverBase = new Float32Array(riverGeo.attributes.position.array);
    this.riverPos = riverGeo.attributes.position;
    var river = new THREE.Mesh(riverGeo, M.water);
    river.position.set(RIVER_X, 0.16, 0);
    river.receiveShadow = true;
    river.castShadow = false;
    g.add(river);
    this.river = river;

    for (var reed = 0; reed < 7; reed++) {
      var rz = -5.2 + reed * 1.55;
      var rx = RIVER_X + (reed % 2 ? 1.45 : -1.45);
      var stem = addMesh(g, new THREE.ConeGeometry(0.05, 0.38, 4), M.foliage[1], rx, 0.22, rz);
      stem.castShadow = false;
    }

    this.ben = new BigBen(g, M);
    this.ben.group.position.set(-2.35, 0, -1.55);

    this.eye = new LondonEye(g, M);
    this.eye.group.position.set(-5.65, 0, 3.85);
    /* Face the wheel's +Z toward the island centre so the rim reads as a circle. */
    var fx = -this.eye.group.position.x;
    var fz = -this.eye.group.position.z;
    this.eye.group.rotation.y = Math.atan2(fx, fz);

    this.bridge = new TowerBridge(g, M);
    this.bridge.group.position.set(RIVER_X, 0, 0.15);

    var houses = makeHouseRow(M);
    houses.position.set(-6.55, 0, -3.55);
    var hd = new THREE.Vector3(-houses.position.x, 0, -houses.position.z).normalize();
    houses.rotation.y = Math.atan2(hd.x, hd.z);
    g.add(houses);

    this.bus = makeBus(M);
    this.bus.position.set(-0.6, 0, -5.45);
    g.add(this.bus);

    var taxi = makeTaxi(M);
    taxi.position.set(2.55, 0, -5.15);
    taxi.rotation.y = Math.PI / 2;
    g.add(taxi);

    var phone = makePhone(M);
    phone.position.set(0.85, 0, 1.55);
    g.add(phone);

    var shard = makeShard(M);
    shard.position.set(1.7, 0, 6.55);
    shard.rotation.y = 0.4;
    g.add(shard);

    this.boat = makeBoat(M);
    this.boat.position.set(RIVER_X, 0.08, 2.2);
    g.add(this.boat);

    addMesh(g, new THREE.CylinderGeometry(2.05, 2.15, 0.06, 20), M.path, -2.2, 0.035, -0.9);
    addMesh(g, new THREE.BoxGeometry(6.6, 0.05, 1.15), M.path, -0.5, 0.04, -5.45);

    var trees = [
      [-7.5, 0.35, 1.05], [-7.15, 6.15, 0.9], [-2.6, 6.45, 1.1],
      [0.55, 7.05, 0.82], [7.15, 4.35, 0.95], [7.55, 1.35, 0.85],
      [7.35, -3.15, 1.0], [6.4, -6.15, 0.88], [1.15, -6.85, 1.05],
      [-3.6, -6.55, 0.95], [-7.2, -4.7, 1.0], [2.55, 4.15, 0.75]
    ];
    for (var t = 0; t < trees.length; t++) {
      var tree = makeTree(M, trees[t][2]);
      tree.position.set(trees[t][0], 0, trees[t][1]);
      g.add(tree);
    }

    var flowers = [
      [-4.3, 5.7], [-6.9, 2.3], [-3.1, 5.4], [-7.8, 4.6],
      [0.2, 5.5], [5.8, 6.4], [8.0, 3.2], [-8.0, -1.6],
      [-5.2, -2.4], [3.4, -3.6], [-0.8, 2.7], [6.2, -1.8]
    ];
    var stemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.2, 4);
    var headGeo = new THREE.SphereGeometry(0.07, 6, 5);
    for (var fi = 0; fi < flowers.length; fi++) {
      addMesh(g, stemGeo, M.trunk, flowers[fi][0], 0.1, flowers[fi][1]).castShadow = false;
      var head = addMesh(g, headGeo, M.flower, flowers[fi][0], 0.24, flowers[fi][1]);
      head.castShadow = false;
    }

    [[-0.15, 2.35], [1.4, -4.55], [-6.1, -0.35]].forEach(function (p) {
      addMesh(g, new THREE.CylinderGeometry(0.04, 0.05, 1.15, 6), M.metal, p[0], 0.58, p[1]);
      var lamp = addMesh(g, new THREE.BoxGeometry(0.18, 0.14, 0.18), M.lamp, p[0], 1.2, p[1]);
      lamp.castShadow = false;
    });

    this.satellites = [];
    [[14.2, 3.1, -3.4, 0.85, 0.2], [-13.6, 3.6, 6.2, 0.72, 1.4]].forEach(function (s) {
      var sat = new THREE.Group();
      var rk = addMesh(sat, new THREE.SphereGeometry(s[3], 7, 5), M.rock, 0, 0, 0);
      rk.scale.y = 0.55;
      var top = addMesh(sat, new THREE.SphereGeometry(s[3] * 0.72, 7, 5), M.grass, 0, s[3] * 0.25, 0);
      top.scale.y = 0.4;
      sat.position.set(s[0], s[1], s[2]);
      sat.userData.baseY = s[1];
      sat.userData.phase = s[4];
      g.add(sat);
      this.satellites.push(sat);
    }, this);

    this.group = g;
  }

  Island.prototype.surfaceY = function () {
    return this.group.position.y;
  };

  Island.prototype.update = function (dt, elapsed) {
    /* Gentle float. Rotation is decorative; props share this frame so they stay planted. */
    this.group.position.y = Math.sin(elapsed * 0.7) * 0.16;
    this.group.rotation.z = Math.sin(elapsed * 0.4) * 0.012;
    this.group.rotation.x = Math.cos(elapsed * 0.33) * 0.008;

    var busPhase = elapsed * 0.32;
    this.bus.position.x = -0.6 + Math.sin(busPhase) * 2.35;
    /* Local +Z is the bus nose. θ = π/2 faces +X; −π/2 faces −X. cos(phase) is velocity sign. */
    this.bus.rotation.y = Math.cos(busPhase) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    var wheels = this.bus.userData.wheels;
    for (var i = 0; i < wheels.length; i++) wheels[i].rotation.x = elapsed * 4;

    var boatPhase = elapsed * 0.22;
    this.boat.position.z = Math.sin(boatPhase) * 4.0;
    this.boat.position.y = 0.1 + Math.sin(elapsed * 1.5) * 0.03;
    this.boat.rotation.z = Math.sin(elapsed * 1.5) * 0.05;
    this.boat.rotation.y = Math.cos(boatPhase) >= 0 ? 0 : Math.PI;

    /* Reset from the base buffer so wave offsets cannot accumulate. */
    var base = this.riverBase;
    var pos = this.riverPos;
    for (var v = 0; v < pos.count; v++) {
      var x = base[v * 3];
      var y = base[v * 3 + 1];
      var z = base[v * 3 + 2];
      pos.setY(v, y + Math.sin(x * 2.2 + z * 0.8 + elapsed * 1.8) * 0.035 + Math.cos(z * 1.4 + elapsed * 1.3) * 0.025);
    }
    pos.needsUpdate = true;

    for (var s = 0; s < this.satellites.length; s++) {
      var sat = this.satellites[s];
      sat.position.y = sat.userData.baseY + Math.sin(elapsed * 0.85 + sat.userData.phase) * 0.22;
    }

    this.ben.update(elapsed);
    this.eye.update(dt);
    this.bridge.update(elapsed);
  };

  function buildClouds(scene, mat) {
    var puff = new THREE.SphereGeometry(1, 8, 6);
    var clouds = [];
    /* Stay inside the camera orbit and above the spire so puffs read as sky, not foreground rocks. */
    var specs = [
      [-8, 15.2, -7, 1.05, 0.32],
      [7, 16.8, 3, 0.82, 0.26],
      [4, 14.6, -11, 0.9, 0.2],
      [-11, 16.0, 4, 0.88, 0.3],
      [1, 18.2, -4, 0.95, 0.16],
      [11, 15.4, -6, 0.72, 0.28]
    ];
    for (var i = 0; i < specs.length; i++) {
      var g = new THREE.Group();
      var parts = [[0, 0, 0, 1.15], [1.05, 0.18, 0.1, 0.85], [-0.95, 0.1, -0.05, 0.75], [0.35, 0.45, 0.15, 0.62]];
      for (var p = 0; p < parts.length; p++) {
        var m = new THREE.Mesh(puff, mat);
        m.position.set(parts[p][0], parts[p][1], parts[p][2]);
        m.scale.setScalar(parts[p][3]);
        m.castShadow = false;
        g.add(m);
      }
      g.position.set(specs[i][0], specs[i][1], specs[i][2]);
      g.scale.setScalar(specs[i][3]);
      g.userData.speed = specs[i][4];
      g.userData.baseY = specs[i][1];
      scene.add(g);
      clouds.push(g);
    }
    return {
      update: function (dt, elapsed) {
        for (var c = 0; c < clouds.length; c++) {
          clouds[c].position.x += dt * clouds[c].userData.speed;
          if (clouds[c].position.x > 30) clouds[c].position.x = -30;
          clouds[c].position.y = clouds[c].userData.baseY + Math.sin(elapsed * 0.25 + c) * 0.25;
        }
      }
    };
  }

  function buildBirds(scene, mat) {
    var birds = [];
    function bird() {
      var g = new THREE.Group();
      var wingGeo = new THREE.BoxGeometry(0.32, 0.035, 0.12);
      var pivotL = new THREE.Group();
      var pivotR = new THREE.Group();
      var left = new THREE.Mesh(wingGeo, mat);
      var right = new THREE.Mesh(wingGeo, mat);
      left.position.x = -0.16;
      right.position.x = 0.16;
      left.castShadow = right.castShadow = false;
      pivotL.add(left);
      pivotR.add(right);
      g.add(pivotL, pivotR);
      g.userData.L = pivotL;
      g.userData.R = pivotR;
      g.userData.phase = Math.random() * Math.PI * 2;
      g.userData.radius = 10 + Math.random() * 3;
      g.userData.speed = 0.28 + Math.random() * 0.12;
      g.userData.y = 6.4 + Math.random() * 1.4;
      return g;
    }
    for (var i = 0; i < 3; i++) {
      var b = bird();
      scene.add(b);
      birds.push(b);
    }
    return {
      update: function (elapsed) {
        for (var n = 0; n < birds.length; n++) {
          var b = birds[n];
          var a = elapsed * b.userData.speed + b.userData.phase;
          var rad = b.userData.radius;
          b.position.set(Math.cos(a) * rad, b.userData.y + Math.sin(elapsed * 1.2 + b.userData.phase) * 0.35, Math.sin(a) * rad * 0.75);
          /* Local +Z is the nose. θ = atan2(dx, dz) maps +Z onto tangent (−sin a, cos a). */
          var tx = -Math.sin(a);
          var tz = Math.cos(a);
          b.rotation.y = Math.atan2(tx, tz);
          var flap = Math.sin(elapsed * 8 + b.userData.phase) * 0.5;
          b.userData.L.rotation.z = -0.25 - flap;
          b.userData.R.rotation.z = 0.25 + flap;
        }
      }
    };
  }

  function buildStars(parent) {
    function make(count, size) {
      var pos = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        var v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 0.85 + 0.05, Math.random() * 2 - 1).normalize().multiplyScalar(150);
        pos[i * 3] = v.x;
        pos[i * 3 + 1] = Math.abs(v.y) + 8;
        pos[i * 3 + 2] = v.z;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: size,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false
      });
      var pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      parent.add(pts);
      return pts;
    }
    return [make(120, 1.5), make(70, 2.2)];
  }

  /* ------------------------------------------------------------------ */
  /* Audio — procedural, created on the first gesture (autoplay policy). */
  /* ------------------------------------------------------------------ */

  function AudioAmbience() {
    this.ctx = null;
    this.enabled = false;
    this.birdTimer = 0;
    this._wantBirds = false;
    this.lastSync = 0;
  }

  AudioAmbience.prototype._build = function () {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    var ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(ctx.destination);
    var len = ctx.sampleRate * 2;
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windGain = this._loop(buffer, 'lowpass', 380);
    this.rustleGain = this._loop(buffer, 'bandpass', 1400);
    return true;
  };

  AudioAmbience.prototype._loop = function (buffer, type, freq) {
    var src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    var filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    var gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    if (type === 'lowpass') this.windFilter = filter;
    return gain;
  };

  AudioAmbience.prototype.toggle = function () {
    if (!this.ctx && !this._build()) return false;
    var ctx = this.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    this.enabled = !this.enabled;
    var t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? 0.5 : 0.0001, t, 0.08);
    if (this.enabled) this._armBirds();
    else this._clearBirds();
    return this.enabled;
  };

  AudioAmbience.prototype._armBirds = function () {
    this._clearBirds();
    var self = this;
    var step = function () {
      if (!self.enabled) return;
      if (self._wantBirds) self._chirp();
      self.birdTimer = setTimeout(step, self._wantBirds ? 550 + Math.random() * 1500 : 1300);
    };
    this.birdTimer = setTimeout(step, 300);
  };

  AudioAmbience.prototype._clearBirds = function () {
    if (this.birdTimer) clearTimeout(this.birdTimer);
    this.birdTimer = 0;
  };

  AudioAmbience.prototype._chirp = function () {
    var t = this.ctx.currentTime;
    this._tone(t, 1400 + Math.random() * 800, 0.12, 0.04);
    if (Math.random() > 0.45) this._tone(t + 0.13, 1700 + Math.random() * 700, 0.09, 0.028);
  };

  AudioAmbience.prototype._tone = function (t, freq, dur, vol) {
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 1.4), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = function () {
      o.disconnect();
      g.disconnect();
    };
  };

  AudioAmbience.prototype.sync = function (weights, day) {
    if (!this.ctx || !this.enabled) return;
    var now = performance.now();
    if (now - this.lastSync < 180) return;
    this.lastSync = now;
    var t = this.ctx.currentTime;
    var winter = weights[3];
    var autumn = weights[2];
    var spring = weights[0];
    var summer = weights[1];
    this.windGain.gain.setTargetAtTime(0.025 + winter * 0.07 + spring * 0.02 + (1 - day.daylight) * 0.02, t, 0.35);
    this.rustleGain.gain.setTargetAtTime(0.004 + autumn * 0.05, t, 0.35);
    if (this.windFilter) this.windFilter.frequency.setTargetAtTime(300 + winter * 520, t, 0.4);
    this._wantBirds = (spring + summer) > 0.45 && day.daylight > 0.4 && day.night < 0.35;
  };

  /* ------------------------------------------------------------------ */
  /* Boot */
  /* ------------------------------------------------------------------ */

  function boot() {
    var app = document.getElementById('app');
    var canvas = document.getElementById('view');
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    if (!renderer.getContext()) throw new Error('此環境不支援 WebGL');
    renderer.setClearColor(0x8ec8ea, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xcfe8ff, 22, 70);

    var camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 400);
    var rig = new CameraRig(camera);

    var gradient = makeGradient();
    function toon(color, extra) {
      var params = { color: color, gradientMap: gradient };
      if (extra) {
        for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) params[k] = extra[k];
      }
      return new THREE.MeshToonMaterial(params);
    }

    var clockTex = makeClockTexture();
    var M = {
      grass: toon('#5fbe45'),
      dirt: toon('#c9956b'),
      rock: toon('#7d6c78'),
      stone: toon('#f4ecdf'),
      stoneDark: toon('#e4d3b8'),
      slate: toon('#4d5968'),
      brick: toon('#c46a4a'),
      gold: toon('#e7b34a'),
      metal: toon('#8d97a3'),
      blue: toon('#1d6cb5'),
      white: toon('#f7f8fb'),
      path: toon('#e0cba8'),
      road: toon('#6d645c'),
      bus: toon('#d7263d'),
      taxi: toon('#1c1e22'),
      tire: toon('#22252b'),
      trunk: toon('#7a5232'),
      capsuleRed: toon('#d64545'),
      capsuleGold: toon('#f0d078'),
      opening: toon('#2a241c'),
      basin: toon('#1c6480'),
      window: toon('#c5e6f5'),
      eyeGlow: toon('#fff6d8'),
      shard: toon('#b7e4f2'),
      lamp: toon('#fff1cc'),
      phone: toon('#d7f1ff'),
      clock: new THREE.MeshToonMaterial({
        color: 0xffffff,
        map: clockTex,
        gradientMap: gradient,
        emissive: new THREE.Color('#ffd9a0'),
        emissiveMap: clockTex,
        emissiveIntensity: 0
      }),
      hand: new THREE.MeshBasicMaterial({ color: 0x1a1a1a }),
      secondHand: new THREE.MeshBasicMaterial({ color: 0xc8102e }),
      flag: new THREE.MeshBasicMaterial({ map: makeUnionJack(), side: THREE.DoubleSide }),
      flower: toon('#ff5d8f'),
      water: new THREE.MeshStandardMaterial({
        color: 0x2f9ec0,
        roughness: 0.18,
        metalness: 0.12,
        emissive: new THREE.Color('#12384e'),
        emissiveIntensity: 0
      }),
      snow: new THREE.MeshBasicMaterial({
        color: 0xf7fbff,
        transparent: true,
        opacity: 0,
        depthWrite: false
      }),
      blob: new THREE.MeshBasicMaterial({
        map: makeRadial('rgba(30,20,40,0.38)', 'rgba(30,20,40,0)'),
        transparent: true,
        depthWrite: false
      }),
      cloud: toon('#ffffff'),
      bird: toon('#f4f7fb'),
      foliage: [toon('#3fa83a'), toon('#2f8f30'), toon('#62c24e')],
      snowMeshes: []
    };
    M.flower.transparent = true;
    M.window.emissive = new THREE.Color('#ffc07a');
    M.eyeGlow.emissive = new THREE.Color('#fff2c4');
    M.shard.emissive = new THREE.Color('#d8f4ff');
    M.lamp.emissive = new THREE.Color('#ffd27a');
    M.phone.emissive = new THREE.Color('#ffe6a8');
    M.gold.emissive = new THREE.Color('#ffbf3c');
    M.flag.fog = false;

    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          topColor: { value: new THREE.Color() },
          horizonColor: { value: new THREE.Color() },
          bottomColor: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          moonDir: { value: new THREE.Vector3(0, -1, 0) },
          sunColor: { value: new THREE.Color('#fff1d0') },
          moonColor: { value: new THREE.Color('#d5e2ff') },
          sunGlow: { value: 1 },
          moonGlow: { value: 0 }
        },
        vertexShader: [
          'varying vec3 vWorld;',
          'void main() {',
          '  vec4 world = modelMatrix * vec4(position, 1.0);',
          '  vWorld = world.xyz;',
          '  gl_Position = projectionMatrix * viewMatrix * world;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'varying vec3 vWorld;',
          'uniform vec3 topColor;',
          'uniform vec3 horizonColor;',
          'uniform vec3 bottomColor;',
          'uniform vec3 sunDir;',
          'uniform vec3 moonDir;',
          'uniform vec3 sunColor;',
          'uniform vec3 moonColor;',
          'uniform float sunGlow;',
          'uniform float moonGlow;',
          'void main() {',
          '  vec3 dir = normalize(vWorld - cameraPosition);',
          '  /* The orbit looks down at the island, so raw dir.y stays negative.',
          '     Lift it so the frame still shows a zenith-to-horizon gradient. */',
          '  float h = dir.y * 1.35 + 0.62;',
          '  vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.62, h));',
          '  col = mix(bottomColor, col, smoothstep(-0.35, 0.10, h));',
          '  float sunD = max(dot(dir, normalize(sunDir)), 0.0);',
          '  col += sunColor * (pow(sunD, 90.0) * 1.05 + pow(sunD, 5.0) * 0.40) * sunGlow;',
          '  float moonD = max(dot(dir, normalize(moonDir)), 0.0);',
          '  col += moonColor * (pow(moonD, 70.0) * 0.55 + pow(moonD, 4.0) * 0.16) * moonGlow;',
          '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
          '}'
        ].join('\n')
      })
    );
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    scene.add(sky);

    var sunMesh = new THREE.Mesh(new THREE.SphereGeometry(4.6, 18, 14), new THREE.MeshBasicMaterial({ color: 0xfff4d2, fog: false }));
    var moonMesh = new THREE.Mesh(new THREE.SphereGeometry(3.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf2f6ff, fog: false }));
    var crater = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd5dced, fog: false }));
    crater.position.set(0.7, 0.4, 1.4);
    moonMesh.add(crater);
    var halo = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 28),
      new THREE.MeshBasicMaterial({
        map: makeRadial('rgba(255,220,140,0.95)', 'rgba(255,180,60,0)'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        opacity: 0
      })
    );
    scene.add(sunMesh, moonMesh, halo);

    var stars = buildStars(scene);

    var hemi = new THREE.HemisphereLight(0xcfefff, 0x6a8a48, 0.35);
    var ambient = new THREE.AmbientLight(0xfff4e8, 0.35);
    var sun = new THREE.DirectionalLight(0xfff5e4, 1.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun.target);
    var moonLight = new THREE.DirectionalLight(0xb7c6ff, 0);
    var rim = new THREE.DirectionalLight(0xd7ecff, 0.18);
    rim.position.set(-12, 10, -8);
    scene.add(hemi, ambient, sun, moonLight, rim);

    var island = new Island(scene, M);
    var weather = new WeatherSystem(scene);
    var clouds = buildClouds(scene, M.cloud);
    var birds = buildBirds(scene, M.bird);
    var day = new DayNightCycle();
    var audio = new AudioAmbience();

    var NIGHT_WATER = new THREE.Color('#0e3044');
    var WINTER_SKY = new THREE.Color('#b7c6d4');
    var SPRING_HAZE = new THREE.Color('#e7f3fb');
    var AUTUMN_HAZE = new THREE.Color('#f0b07a');
    var DUSK_CLOUD = new THREE.Color('#ffd0b8');
    var NIGHT_CLOUD = new THREE.Color('#243048');
    var NIGHT_BIRD = new THREE.Color('#1c2438');

    function frameDistance(fovDeg, aspect) {
      var radius = 12.4;
      var v = fovDeg * Math.PI / 180;
      var h = 2 * Math.atan(Math.tan(v / 2) * Math.max(aspect, 0.4));
      var distV = radius / Math.sin(v / 2);
      var distH = radius / Math.sin(h / 2);
      return Math.max(distV, distH) * 1.02;
    }

    function resize() {
      var w = app.clientWidth;
      var h = app.clientHeight;
      if (w < 2 || h < 2) return;
      var area = w * h;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, area < 90000 ? 1.25 : 1.6));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = h < 260 ? 54 : 46;
      camera.updateProjectionMatrix();
      rig.setFrame(frameDistance(camera.fov, camera.aspect));
    }

    function tintAndApply() {
      var w = weather.weights;
      var c = day.colors;
      c.top.lerp(WINTER_SKY, w[3] * 0.28);
      c.horizon.lerp(SPRING_HAZE, w[0] * 0.5);
      c.horizon.lerp(AUTUMN_HAZE, w[2] * 0.2);
      c.bottom.lerp(WINTER_SKY, w[3] * 0.2);

      var u = sky.material.uniforms;
      u.topColor.value.copy(c.top);
      u.horizonColor.value.copy(c.horizon);
      u.bottomColor.value.copy(c.bottom);
      u.sunColor.value.copy(day.colors.sun);
      u.sunGlow.value = smoothstep(-0.18, 0.22, day.elev);
      u.moonGlow.value = smoothstep(-0.05, 0.28, -day.elev);

      /* Visible sun and moon ride a low ring. A true zenith disc never enters
         this downward diorama view; azimuth still follows the day clock. */
      var sunAz = Math.atan2(day.sunDir.x, day.sunDir.z);
      var moonAz = Math.atan2(day.moonDir.x, day.moonDir.z);
      var sunLift = Math.max(0, day.elev);
      var moonLift = Math.max(0, -day.elev);
      sunMesh.position.set(Math.sin(sunAz) * 40, 4.6 + sunLift * 3.2, Math.cos(sunAz) * 40);
      moonMesh.position.set(Math.sin(moonAz) * 44, 4.4 + moonLift * 3.0, Math.cos(moonAz) * 44);
      u.sunDir.value.copy(sunMesh.position).sub(camera.position).normalize();
      u.moonDir.value.copy(moonMesh.position).sub(camera.position).normalize();

      var sunMul = 0.9 * w[0] + 1.16 * w[1] + 0.98 * w[2] + 0.74 * w[3];
      ambient.color.copy(c.ambient);
      ambient.intensity = (0.16 + 0.18 * day.daylight) * (0.92 + 0.1 * w[1]);
      hemi.color.copy(c.horizon);
      hemi.intensity = 0.12 + 0.14 * day.daylight;
      sun.color.copy(day.colors.sun);
      sun.intensity = smoothstep(-0.12, 0.38, day.elev) * 1.35 * sunMul;
      var keyLift = 0.42 + sunLift * 0.7;
      sun.position.set(Math.sin(sunAz) * 0.75, keyLift, Math.cos(sunAz) * 0.75).normalize().multiplyScalar(42);
      sun.target.position.set(0, island.surfaceY() + 2.2, 0);
      moonLight.color.set('#b7c6ff');
      moonLight.intensity = smoothstep(-0.02, 0.45, -day.elev) * 0.42;
      moonLight.position.copy(day.moonDir).multiplyScalar(40);
      rim.intensity = 0.08 + 0.14 * day.daylight;

      var fogScale = rig.dist / 32;
      var near = (15 * w[0] + 42 * w[1] + 26 * w[2] + 18 * w[3]) * fogScale;
      var far = (48 * w[0] + 100 * w[1] + 70 * w[2] + 56 * w[3]) * fogScale;
      scene.fog.color.copy(c.horizon);
      scene.fog.near = near;
      scene.fog.far = Math.max(far, near + 8);

      mix4(M.grass.color, PAL.grass, w);
      M.grass.color.multiplyScalar(0.55 + 0.45 * day.daylight);
      hemi.groundColor.copy(M.grass.color);
      mix4(M.foliage[0].color, PAL.foliageA, w);
      mix4(M.foliage[1].color, PAL.foliageB, w);
      mix4(M.foliage[2].color, PAL.foliageC, w);
      for (var fi = 0; fi < 3; fi++) M.foliage[fi].color.multiplyScalar(0.6 + 0.4 * day.daylight);
      mix4(M.trunk.color, PAL.trunk, w);
      mix4(M.water.color, PAL.water, w);
      M.water.color.lerp(NIGHT_WATER, day.night * 0.55);
      M.water.emissiveIntensity = day.night * 0.4;
      M.flower.opacity = w[0] * 1 + w[1] * 0.65 + w[2] * 0.3 + w[3] * 0.06;
      M.snow.opacity = w[3];
      for (var si = 0; si < M.snowMeshes.length; si++) M.snowMeshes[si].visible = w[3] > 0.03;

      M.cloud.color.set('#ffffff').lerp(DUSK_CLOUD, day.dusk * 0.85).lerp(NIGHT_CLOUD, day.night * 0.8);
      M.bird.color.set('#f4f7fb').lerp(NIGHT_BIRD, day.night * 0.75);

      var lamp = day.lamp;
      M.window.emissiveIntensity = 1.15 * lamp;
      M.clock.emissiveIntensity = 0.9 * lamp;
      M.eyeGlow.emissiveIntensity = 1.35 * lamp;
      M.shard.emissiveIntensity = 0.75 * lamp;
      M.lamp.emissiveIntensity = 1.45 * lamp;
      M.phone.emissiveIntensity = 1.05 * lamp;
      M.gold.emissiveIntensity = 0.4 * lamp;
      island.ben.setLamp(lamp);
      island.eye.setLamp(lamp);
      island.bridge.setLamp(lamp);

      var glow = u.sunGlow.value;
      sunMesh.visible = glow > 0.05;
      sunMesh.material.color.copy(day.colors.sun);
      halo.position.copy(sunMesh.position);
      halo.lookAt(camera.position);
      halo.material.opacity = 0.45 * glow;
      halo.material.color.copy(day.colors.sun);
      moonMesh.visible = u.moonGlow.value > 0.08;
      stars[0].material.opacity = day.night * (0.55 + 0.2 * Math.sin(performance.now() * 0.002));
      stars[1].material.opacity = day.night * (0.35 + 0.15 * Math.sin(performance.now() * 0.002 + 1.4));
    }

    var statusEl = document.getElementById('status');
    var statsEl = document.getElementById('stats');
    var seasonButtons = Array.prototype.slice.call(document.querySelectorAll('[data-season]'));
    var phaseButtons = Array.prototype.slice.call(document.querySelectorAll('[data-phase]'));
    var autoBtn = document.getElementById('btn-auto');
    var soundBtn = document.getElementById('btn-sound');
    var lastStatus = '';
    var lastStats = '';
    var fpsFrames = 0;
    var fpsAcc = 0;
    var fps = 0;

    function paintPressed(list, index) {
      for (var i = 0; i < list.length; i++) {
        var on = i === index;
        if (list[i].classList.contains('is-on') !== on) {
          list[i].classList.toggle('is-on', on);
          list[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      }
    }

    seasonButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        weather.setSeason(parseInt(btn.getAttribute('data-season'), 10));
        autoBtn.classList.remove('is-on');
        autoBtn.setAttribute('aria-pressed', 'false');
      });
    });
    phaseButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        day.setTime(parseFloat(btn.getAttribute('data-phase')), true);
      });
    });
    autoBtn.addEventListener('click', function () {
      weather.setAuto(!weather.auto);
      autoBtn.classList.toggle('is-on', weather.auto);
      autoBtn.setAttribute('aria-pressed', weather.auto ? 'true' : 'false');
    });
    soundBtn.addEventListener('click', function () {
      var on = audio.toggle();
      soundBtn.classList.toggle('is-on', on);
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.setAttribute('aria-label', on ? '關閉音效' : '環境音效');
    });

    window.addEventListener('keydown', function (e) {
      var code = e.code;
      if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
        weather.setSeason(parseInt(code.slice(5), 10) - 1);
        autoBtn.classList.remove('is-on');
        autoBtn.setAttribute('aria-pressed', 'false');
      } else if (code === 'Digit5') day.setTime(0.03, true);
      else if (code === 'Digit6') day.setTime(0.24, true);
      else if (code === 'Digit7') day.setTime(0.50, true);
      else if (code === 'Digit8') day.setTime(0.78, true);
      else if (code === 'KeyC') {
        weather.setAuto(!weather.auto);
        autoBtn.classList.toggle('is-on', weather.auto);
        autoBtn.setAttribute('aria-pressed', weather.auto ? 'true' : 'false');
      } else if (code === 'KeyM') {
        soundBtn.click();
      } else if (code === 'ArrowLeft') rig.nudge(0.06, 0);
      else if (code === 'ArrowRight') rig.nudge(-0.06, 0);
      else if (code === 'ArrowUp') rig.nudge(0, 0.04);
      else if (code === 'ArrowDown') rig.nudge(0, -0.04);
      else return;
      e.preventDefault();
    });

    var dragging = false;
    var lastX = 0;
    var lastY = 0;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.classList.add('is-drag');
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dx || dy) rig.drag(dx, dy);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove('is-drag');
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      rig.zoom(e.deltaY);
    }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(app);

    var clock = new THREE.Clock();
    var elapsed = 0;
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) clock.getDelta();
    });

    function frame(dt) {
      elapsed += dt;
      if (dt > 0) day.update(dt);
      if (dt > 0) island.update(dt, elapsed);
      /* Camera before particles so snow billboards use this frame's view. */
      rig.update(dt);
      if (dt > 0) {
        weather._dayHint = day.daylight;
        weather.update(dt, elapsed, island.surfaceY(), camera);
        clouds.update(dt, elapsed);
        birds.update(elapsed);
        audio.sync(weather.weights, day);
      }
      tintAndApply();

      var label = SEASON_NAMES[weather.dominant()] + ' · ' + PHASE_NAMES[phaseIndex(day.time)];
      if (label !== lastStatus) {
        statusEl.textContent = label;
        lastStatus = label;
      }
      paintPressed(seasonButtons, weather.dominant());
      paintPressed(phaseButtons, phaseIndex(day.time));
      fpsFrames++;
      fpsAcc += dt;
      if (fpsAcc >= 0.4) {
        fps = Math.round(fpsFrames / fpsAcc);
        fpsFrames = 0;
        fpsAcc = 0;
      }
      var stats = fps + 'fps · ' + weather.particleCount() + 'p';
      if (stats !== lastStats) {
        statsEl.textContent = stats;
        lastStats = stats;
      }
      renderer.render(scene, camera);
    }

    resize();
    frame(0);

    function loop() {
      var dt = Math.min(clock.getDelta(), 0.05);
      if (app.clientWidth < 2) resize();
      frame(dt);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    window.__LONDON = {
      setTime: function (t) { day.setTime(t, false); },
      setSeason: function (i) { weather.setSeason(i); },
      getState: function () {
        return {
          time: day.time,
          phase: PHASE_NAMES[phaseIndex(day.time)],
          lamp: day.lamp,
          elev: day.elev,
          season: SEASON_NAMES[weather.dominant()],
          weights: [weather.weights[0], weather.weights[1], weather.weights[2], weather.weights[3]],
          particles: weather.particleCount(),
          leaves: weather.leaves.alive(),
          snow: weather.snow.alive(),
          fps: fps,
          yaw: rig.yaw,
          auto: weather.auto,
          daylight: day.daylight
        };
      }
    };
  }

  try {
    boot();
  } catch (err) {
    console.error(err);
    showFallback('場景啟動失敗：' + (err && err.message ? err.message : err));
  }
})();
