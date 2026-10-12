/* Fixed-size maple leaf pool. Slots are reset in place — nothing is allocated after init. */

const LEAF_COUNT = 200;
const LEAF_COLORS = ["#e23b32", "#ef6a28", "#f2b43a", "#c42b3a", "#ff8a3d", "#d3542a", "#f6d76a"];

/** Procedural maple silhouette. alphaMap samples the green channel, so the fill is white. */
function mapleAlphaMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 160;
  const g = canvas.getContext("2d");
  g.translate(64, 70);
  g.fillStyle = "#ffffff";
  // Five rounded lobes plus a stem. Reads as a maple leaf even when tiny.
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    g.beginPath();
    g.ellipse(Math.cos(a) * 16, Math.sin(a) * 16, 15, 30, a + Math.PI / 2, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 2, 16, 0, Math.PI * 2);
  g.fill();
  g.fillRect(-3.5, 20, 7, 42);
  g.beginPath();
  g.arc(0, 62, 4, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function mapleLeafGeometry() {
  const geo = new THREE.PlaneGeometry(0.72, 0.9);
  return geo;
}

class MapleLeafSystem {
  constructor() {
    this.count = LEAF_COUNT;
    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.z = new Float32Array(this.count);
    this.ox = new Float32Array(this.count);
    this.oz = new Float32Array(this.count);
    this.fall = new Float32Array(this.count);
    this.freq = new Float32Array(this.count);
    this.phase = new Float32Array(this.count);
    this.amp = new Float32Array(this.count);
    this.spinX = new Float32Array(this.count);
    this.spinY = new Float32Array(this.count);
    this.rotX = new Float32Array(this.count);
    this.rotY = new Float32Array(this.count);
    this.rotZ = new Float32Array(this.count);
    this.scale = new Float32Array(this.count);
    this.settled = new Uint8Array(this.count);
    this.rest = new Float32Array(this.count);

    const leafMat = mats().leaf;
    leafMat.alphaMap = mapleAlphaMap();
    leafMat.alphaTest = 0.45;
    leafMat.side = THREE.DoubleSide;
    this.mesh = new THREE.InstancedMesh(mapleLeafGeometry(), leafMat, this.count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._color = new THREE.Color();
    this.wind = 0;

    for (let i = 0; i < this.count; i++) {
      this._reset(i, false);
      this._color.set(LEAF_COLORS[i % LEAF_COLORS.length]);
      this.mesh.setColorAt(i, this._color);
    }
    // A handful start already on the grass so the island isn't bare on frame 1.
    for (let i = 0; i < 28; i++) this._settleAt(i, 4 + (i % 5));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  _reset(i, fromTop) {
    const ang = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 15.5;
    this.ox[i] = Math.cos(ang) * radius;
    this.oz[i] = Math.sin(ang) * radius;
    this.x[i] = this.ox[i];
    this.z[i] = this.oz[i];
    this.y[i] = fromTop ? 13 + Math.random() * 12 : Math.random() * 22 - 1;
    this.fall[i] = 0.7 + Math.random() * 1.25;
    this.freq[i] = 0.75 + Math.random() * 1.7;
    this.phase[i] = Math.random() * Math.PI * 2;
    this.amp[i] = 0.3 + Math.random() * 0.85;
    this.spinX[i] = (Math.random() - 0.5) * 2.6;
    this.spinY[i] = (Math.random() - 0.5) * 3.4;
    this.rotX[i] = Math.random() * Math.PI * 2;
    this.rotY[i] = Math.random() * Math.PI * 2;
    this.rotZ[i] = Math.random() * Math.PI * 2;
    this.scale[i] = 0.5 + Math.random() * 0.75;
    this.settled[i] = 0;
    this.rest[i] = 0;
  }

  _settleAt(i, rest) {
    const ang = Math.random() * Math.PI * 2;
    const radius = 2.1 + Math.random() * 6.8;
    const x = Math.cos(ang) * radius;
    const z = Math.sin(ang) * radius;
    this.ox[i] = x;
    this.oz[i] = z;
    this.x[i] = x;
    this.z[i] = z;
    this.settled[i] = 1;
    this.rest[i] = rest;
    this.rotX[i] = -Math.PI / 2;
  }

  /**
   * Leaf motion, all in place:
   * - origin (ox, oz) drifts with a slow shared wind, then wraps back into the spawn disc
   * - horizontal flutter is a sine around that origin (the left-right sway)
   * - vertical speed breathes with a second sine so the fall isn't a straight line
   * - spin integrates on X/Y; Z rocks with the flutter
   * - crossing the island skin settles the leaf; falling past the underside recycles it
   */
  update(dt, elapsed, islandY) {
    this.wind += dt * 0.12;
    const windX = Math.cos(this.wind) * 0.35;
    const windZ = Math.sin(this.wind * 0.8) * 0.35;
    const pond = SCENE.pond;

    for (let i = 0; i < this.count; i++) {
      if (this.settled[i]) {
        this.rest[i] -= dt;
        if (this.rest[i] <= 0) {
          this._reset(i, true);
        } else {
          const surf = islandY + islandSurfaceY(this.x[i], this.z[i]) + 0.045;
          this.y[i] = surf;
          this.rotZ[i] = Math.sin(elapsed * 1.4 + this.phase[i]) * 0.25;
          this.rotX[i] = -Math.PI / 2 + Math.sin(elapsed * 0.8 + this.phase[i]) * 0.08;
        }
      } else {
        this.ox[i] += windX * dt;
        this.oz[i] += windZ * dt;
        if (this.ox[i] > 16) this.ox[i] = -16;
        else if (this.ox[i] < -16) this.ox[i] = 16;
        if (this.oz[i] > 16) this.oz[i] = -16;
        else if (this.oz[i] < -16) this.oz[i] = 16;

        const flutter = Math.sin(elapsed * this.freq[i] + this.phase[i]);
        this.x[i] = this.ox[i] + flutter * this.amp[i];
        this.z[i] = this.oz[i] + Math.sin(elapsed * this.freq[i] * 0.73 + this.phase[i] + 1.7) * this.amp[i] * 0.65;
        const breathe = Math.sin(elapsed * this.freq[i] * 2 + this.phase[i]) * 0.22;
        this.y[i] -= (this.fall[i] + breathe) * dt;
        this.rotX[i] += this.spinX[i] * dt;
        this.rotY[i] += this.spinY[i] * dt;
        this.rotZ[i] = flutter * 0.9;

        const localY = this.y[i] - islandY;
        const surf = islandSurfaceY(this.x[i], this.z[i]);
        const radius = Math.hypot(this.x[i], this.z[i]);
        const inPond = Math.hypot(this.x[i] - pond.x, this.z[i] - pond.z) < pond.r;
        if (radius < 10.2 && localY <= surf + 0.02 && localY > surf - 1.4 && radius > 1.5) {
          this.settled[i] = 1;
          this.rest[i] = inPond ? 2.5 + (i % 4) : 3.5 + (i % 5);
          this.y[i] = islandY + surf + 0.045;
        } else if (localY < -8.5) {
          this._reset(i, true);
        }
      }

      this._p.set(this.x[i], this.y[i], this.z[i]);
      this._e.set(this.rotX[i], this.rotY[i], this.rotZ[i]);
      this._q.setFromEuler(this._e);
      const s = this.scale[i];
      this._s.set(s, s, s);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
