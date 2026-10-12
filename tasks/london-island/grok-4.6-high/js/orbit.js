/**
 * Lightweight orbit camera (file:// safe, no examples/js).
 * Left-drag / one-finger drag yaws and pitches; wheel zooms.
 * Damping keeps the view gliding while the rAF loop keeps animating.
 */
(function (global) {
  const THREE = global.THREE;

  class OrbitCamera {
    constructor(camera, dom, target) {
      this.camera = camera;
      this.dom = dom;
      this.target = target.clone();
      this.spherical = new THREE.Spherical();
      this.delta = new THREE.Spherical();
      this.offset = new THREE.Vector3();
      this.spherical.setFromVector3(this.offset.copy(camera.position).sub(this.target));
      this.rotateSpeed = 0.0055;
      this.zoomSpeed = 0.0014;
      this.damping = 0.12;
      this.minPolar = 0.38;
      this.maxPolar = Math.PI / 2.05;
      this.minRadius = 14;
      this.maxRadius = 48;
      this._dragging = false;
      this._lastX = 0;
      this._lastY = 0;
      this._pid = null;

      this._onDown = this._onDown.bind(this);
      this._onMove = this._onMove.bind(this);
      this._onUp = this._onUp.bind(this);
      this._onWheel = this._onWheel.bind(this);
      dom.addEventListener("pointerdown", this._onDown);
      window.addEventListener("pointerup", this._onUp);
      window.addEventListener("pointercancel", this._onUp);
      dom.addEventListener("wheel", this._onWheel, { passive: false });
    }

    _onDown(e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      this._dragging = true;
      this._pid = e.pointerId;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      try { this.dom.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    _onMove(e) {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      // Drag right → theta decreases (camera orbits clockwise from above).
      this.delta.theta -= dx * this.rotateSpeed;
      this.delta.phi -= dy * this.rotateSpeed;
    }

    _onUp(e) {
      if (!this._dragging) return;
      if (this._pid != null && e.pointerId !== this._pid && e.type !== "pointercancel") return;
      this._dragging = false;
      this._pid = null;
    }

    _onWheel(e) {
      e.preventDefault();
      this.spherical.radius = THREE.MathUtils.clamp(
        this.spherical.radius * (1 + e.deltaY * this.zoomSpeed),
        this.minRadius,
        this.maxRadius
      );
    }

    enableMoveListen() {
      this.dom.addEventListener("pointermove", this._onMove);
    }

    update() {
      this.spherical.theta += this.delta.theta;
      this.spherical.phi = THREE.MathUtils.clamp(
        this.spherical.phi + this.delta.phi,
        this.minPolar,
        this.maxPolar
      );
      this.spherical.radius = THREE.MathUtils.clamp(
        this.spherical.radius,
        this.minRadius,
        this.maxRadius
      );
      this.spherical.makeSafe();
      this.delta.theta *= 1 - this.damping;
      this.delta.phi *= 1 - this.damping;

      this.offset.setFromSpherical(this.spherical);
      this.camera.position.copy(this.target).add(this.offset);
      this.camera.lookAt(this.target);
    }
  }

  global.OrbitCamera = OrbitCamera;
})(window);
