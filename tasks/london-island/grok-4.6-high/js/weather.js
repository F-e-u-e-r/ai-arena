/**
 * Weather particle system with a fixed-size object pool (InstancedMesh).
 * Inactive instances are scaled to 0; recycle teleports them back above the island.
 */
(function (global) {
  const THREE = global.THREE;

  const MAX_LEAVES = 220;
  const MAX_SNOW = 320;
  const MAX_MIST = 48;
  const MAX_FLIES = 40;

  function softDisc(inner, outer) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, inner, 32, 32, outer);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.4, "rgba(255,255,255,0.35)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function leafShape() {
    const s = new THREE.Shape();
    s.moveTo(0, 0.55);
    s.quadraticCurveTo(0.42, 0.28, 0.34, -0.08);
    s.quadraticCurveTo(0.14, -0.18, 0, -0.55);
    s.quadraticCurveTo(-0.14, -0.18, -0.34, -0.08);
    s.quadraticCurveTo(-0.42, 0.28, 0, 0.55);
    const g = new THREE.ShapeGeometry(s);
    g.scale(0.28, 0.28, 0.28);
    return g;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  class ParticlePool {
    constructor(mesh, count) {
      this.mesh = mesh;
      this.count = count;
      this.data = new Array(count);
      this._dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        this.data[i] = {
          active: false,
          x: 0, y: -20, z: 0,
          vx: 0, vy: 0, vz: 0,
          rx: 0, ry: 0, rz: 0,
          sx: 0, sy: 0, sz: 0,
          spinX: 0, spinY: 0, spinZ: 0,
          phase: 0,
          sway: 0,
          scale: 1
        };
        this._hide(i);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    _hide(i) {
      this._dummy.position.set(0, -40, 0);
      this._dummy.scale.set(0.0001, 0.0001, 0.0001);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }

    _write(i, p) {
      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(p.rx, p.ry, p.rz);
      this._dummy.scale.set(p.scale, p.scale, p.scale);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }

    _writeBillboard(i, p, camera) {
      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.scale.set(p.scale, p.scale, p.scale);
      this._dummy.lookAt(camera.position);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }

    acquire(initFn) {
      const d = this.data;
      for (let i = 0; i < d.length; i++) {
        if (!d[i].active) {
          d[i].active = true;
          initFn(d[i]);
          return i;
        }
      }
      const i = (Math.random() * d.length) | 0;
      initFn(d[i]);
      d[i].active = true;
      return i;
    }

    release(i) {
      this.data[i].active = false;
      this._hide(i);
    }
  }

  class WeatherSystem {
    constructor(scene) {
      this.scene = scene;
      this.group = new THREE.Group();
      this.group.name = "Weather";
      scene.add(this.group);
      this.activeLeaves = 0;
      this.activeSnow = 0;
      this.activeMist = 0;
      this.activeFlies = 0;
      this._tmpColor = new THREE.Color();
      this._leafColors = [0xe85d04, 0xdc2f02, 0xfaa307, 0x9b2226, 0xee9b00, 0xd00000];
      this._build();
    }

    _build() {
      const leafMat = new THREE.MeshToonMaterial({
        color: 0xffffff,
        gradientMap: global.Art.gradientMap,
        side: THREE.DoubleSide
      });
      const leafMesh = new THREE.InstancedMesh(leafShape(), leafMat, MAX_LEAVES);
      leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      leafMesh.castShadow = false;
      leafMesh.frustumCulled = false;
      this.group.add(leafMesh);
      this.leaves = new ParticlePool(leafMesh, MAX_LEAVES);
      for (let i = 0; i < MAX_LEAVES; i++) {
        const c = this._leafColors[i % this._leafColors.length];
        leafMesh.setColorAt(i, this._tmpColor.set(c));
      }
      leafMesh.instanceColor.needsUpdate = true;

      const snowGeo = new THREE.PlaneGeometry(0.22, 0.22);
      const snowMat = new THREE.MeshBasicMaterial({
        map: softDisc(4, 28),
        color: 0xeef6ff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const snowMesh = new THREE.InstancedMesh(snowGeo, snowMat, MAX_SNOW);
      snowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      snowMesh.frustumCulled = false;
      this.group.add(snowMesh);
      this.snow = new ParticlePool(snowMesh, MAX_SNOW);

      const mistGeo = new THREE.PlaneGeometry(2.2, 2.2);
      const mistMat = new THREE.MeshBasicMaterial({
        map: softDisc(6, 30),
        color: 0xd5e4f0,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mistMesh = new THREE.InstancedMesh(mistGeo, mistMat, MAX_MIST);
      mistMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mistMesh.frustumCulled = false;
      this.group.add(mistMesh);
      this.mist = new ParticlePool(mistMesh, MAX_MIST);

      const flyGeo = new THREE.SphereGeometry(0.045, 6, 4);
      const flyMat = new THREE.MeshBasicMaterial({ color: 0xfff3a0 });
      const flyMesh = new THREE.InstancedMesh(flyGeo, flyMat, MAX_FLIES);
      flyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(flyMesh);
      this.flies = new ParticlePool(flyMesh, MAX_FLIES);
    }

    _spawnLeaf(p) {
      p.x = rand(-11, 11);
      p.y = rand(8, 14);
      p.z = rand(-11, 11);
      p.vx = rand(-0.4, 0.4);
      p.vy = rand(-1.35, -0.75);
      p.vz = rand(-0.3, 0.3);
      p.rx = rand(0, Math.PI);
      p.ry = rand(0, Math.PI);
      p.rz = rand(0, Math.PI);
      p.spinX = rand(-2.5, 2.5);
      p.spinY = rand(-3.2, 3.2);
      p.spinZ = rand(-2.2, 2.2);
      p.phase = rand(0, Math.PI * 2);
      p.sway = rand(0.8, 1.8);
      p.scale = rand(0.75, 1.35);
    }

    _spawnSnow(p) {
      p.x = rand(-12, 12);
      p.y = rand(8, 15);
      p.z = rand(-12, 12);
      p.vx = rand(-0.25, 0.25);
      p.vy = rand(-2.4, -1.3);
      p.vz = rand(-0.25, 0.25);
      p.rx = rand(0, Math.PI);
      p.ry = rand(0, Math.PI);
      p.rz = 0;
      p.spinX = rand(-1, 1);
      p.spinY = rand(-1.8, 1.8);
      p.spinZ = 0;
      p.phase = rand(0, Math.PI * 2);
      p.sway = rand(0.6, 1.4);
      p.scale = rand(0.55, 1.2);
    }

    _spawnMist(p) {
      p.x = rand(-10, 10);
      p.y = rand(0.6, 3.4);
      p.z = rand(-10, 10);
      p.vx = rand(-0.15, 0.25);
      p.vy = rand(0.05, 0.22);
      p.vz = rand(-0.12, 0.12);
      p.rx = 0;
      p.ry = rand(0, Math.PI * 2);
      p.rz = 0;
      p.spinY = rand(-0.15, 0.15);
      p.phase = rand(0, Math.PI * 2);
      p.scale = rand(0.85, 1.6);
    }

    _spawnFly(p) {
      p.x = rand(-8, 8);
      p.y = rand(1.2, 5.5);
      p.z = rand(-8, 8);
      p.vx = rand(-0.4, 0.4);
      p.vy = rand(-0.2, 0.2);
      p.vz = rand(-0.4, 0.4);
      p.phase = rand(0, Math.PI * 2);
      p.scale = rand(0.7, 1.3);
      p.rx = p.ry = p.rz = 0;
    }

    /**
     * Spawn budget is proportional to the blended season weights.
     * Leaves tumble with independent axial spin + dual-frequency lateral sway.
     * Snow falls faster with gentler sway. Recycle when y < -2 or |xz| > 16.
     */
    update(dt, mix, nightAmount, camera) {
      const leafTarget = Math.round(mix.leaves * MAX_LEAVES);
      const snowTarget = Math.round(mix.snow * MAX_SNOW);
      const mistTarget = Math.round(mix.mist * MAX_MIST);
      const flyTarget = Math.round(mix.fireflies * nightAmount * MAX_FLIES);

      const nBurst = Math.min(10, Math.max(1, Math.round(dt * 180)));

      for (let k = 0; k < nBurst; k++) {
        if (this.activeLeaves < leafTarget) {
          const idx = this.leaves.acquire((p) => this._spawnLeaf(p));
          const c = this._leafColors[(Math.random() * this._leafColors.length) | 0];
          this.leaves.mesh.setColorAt(idx, this._tmpColor.set(c));
          this.activeLeaves++;
        }
        if (this.activeSnow < snowTarget) {
          this.snow.acquire((p) => this._spawnSnow(p));
          this.activeSnow++;
        }
        if (this.activeMist < mistTarget) {
          this.mist.acquire((p) => this._spawnMist(p));
          this.activeMist++;
        }
        if (this.activeFlies < flyTarget) {
          this.flies.acquire((p) => this._spawnFly(p));
          this.activeFlies++;
        }
      }

      this._stepLeaves(dt, leafTarget);
      this._stepSnow(dt, snowTarget, camera);
      this._stepMist(dt, mistTarget, camera);
      this._stepFlies(dt, flyTarget);
    }

    _stepLeaves(dt, target) {
      const pool = this.leaves;
      let live = 0;
      for (let i = 0; i < pool.count; i++) {
        const p = pool.data[i];
        if (!p.active) continue;
        if (live >= target) {
          pool.release(i);
          continue;
        }
        p.phase += dt;
        // Flutter: two sines on X/Z plus tumbling spin.
        p.x += (p.vx + Math.sin(p.phase * 2.1) * p.sway) * dt;
        p.z += (p.vz + Math.cos(p.phase * 1.4) * p.sway * 0.6) * dt;
        p.y += p.vy * dt;
        p.rx += p.spinX * dt;
        p.ry += p.spinY * dt;
        p.rz += p.spinZ * dt;
        if (p.y < -2 || Math.abs(p.x) > 16 || Math.abs(p.z) > 16) {
          if (live < target) this._spawnLeaf(p);
          else {
            pool.release(i);
            continue;
          }
        }
        pool._write(i, p);
        live++;
      }
      this.activeLeaves = live;
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    }

    _stepSnow(dt, target, camera) {
      const pool = this.snow;
      let live = 0;
      for (let i = 0; i < pool.count; i++) {
        const p = pool.data[i];
        if (!p.active) continue;
        if (live >= target) {
          pool.release(i);
          continue;
        }
        p.phase += dt;
        p.x += (p.vx + Math.sin(p.phase * 1.7) * p.sway * 0.55) * dt;
        p.z += (p.vz + Math.cos(p.phase * 1.3) * p.sway * 0.45) * dt;
        p.y += p.vy * dt;
        p.ry += p.spinY * dt;
        if (p.y < -2) {
          if (live < target) this._spawnSnow(p);
          else {
            pool.release(i);
            continue;
          }
        }
        pool._writeBillboard(i, p, camera);
        live++;
      }
      this.activeSnow = live;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }

    _stepMist(dt, target, camera) {
      const pool = this.mist;
      let live = 0;
      for (let i = 0; i < pool.count; i++) {
        const p = pool.data[i];
        if (!p.active) continue;
        if (live >= target) {
          pool.release(i);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.ry += dt * 0.12;
        if (p.y > 6.5 || Math.abs(p.x) > 14) this._spawnMist(p);
        pool._writeBillboard(i, p, camera);
        live++;
      }
      this.activeMist = live;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }

    _stepFlies(dt, target) {
      const pool = this.flies;
      let live = 0;
      for (let i = 0; i < pool.count; i++) {
        const p = pool.data[i];
        if (!p.active) continue;
        if (target < 1) {
          pool.release(i);
          continue;
        }
        p.phase += dt;
        p.x += Math.sin(p.phase * 2.4 + i) * 0.6 * dt;
        p.y += Math.cos(p.phase * 3.1) * 0.35 * dt;
        p.z += Math.cos(p.phase * 1.7 + i) * 0.55 * dt;
        p.scale = 0.7 + Math.abs(Math.sin(p.phase * 6.0)) * 0.7;
        pool._write(i, p);
        live++;
      }
      this.activeFlies = live;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }

    getCount() {
      return this.activeLeaves + this.activeSnow + this.activeMist + this.activeFlies;
    }
  }

  global.WeatherSystem = WeatherSystem;
})(window);
