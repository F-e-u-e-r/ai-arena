class CameraRig {
  constructor(camera, dom, target) {
    this.camera = camera;
    this.dom = dom;
    this.target = target || new THREE.Vector3(0, 2.2, 0);
    this.yaw = 0.78;
    this.pitch = 0.3;
    this.radius = 24;
    this.minPitch = 0.18;
    this.maxPitch = 1.05;
    this.minRadius = 14;
    this.maxRadius = 40;
    this.dragging = false;
    this._px = 0;
    this._py = 0;
    this._vyaw = 0;
    this._vpitch = 0;
    this._bind();
  }

  _bind() {
    const el = this.dom;
    const onDown = function (e) {
      if (e.target && e.target.closest && e.target.closest(".hud button, .panel")) return;
      this.dragging = true;
      el.classList.add("is-dragging");
      const p = e.touches ? e.touches[0] : e;
      this._px = p.clientX;
      this._py = p.clientY;
      if (el.setPointerCapture && e.pointerId != null) {
        try {
          el.setPointerCapture(e.pointerId);
        } catch (err) {}
      }
      e.preventDefault();
    }.bind(this);

    const onMove = function (e) {
      if (!this.dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - this._px;
      const dy = p.clientY - this._py;
      this._px = p.clientX;
      this._py = p.clientY;
      // Horizontal drag is the required yaw orbit. Vertical drag is a small pitch assist.
      this.yaw -= dx * 0.0075;
      this.pitch += dy * 0.0045;
      this.pitch = clamp(this.pitch, this.minPitch, this.maxPitch);
      this._vyaw = -dx * 0.012;
      this._vpitch = dy * 0.006;
      e.preventDefault();
    }.bind(this);

    const onUp = function () {
      this.dragging = false;
      el.classList.remove("is-dragging");
    }.bind(this);

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);

    el.addEventListener(
      "wheel",
      function (e) {
        this.radius = clamp(this.radius + e.deltaY * 0.02, this.minRadius, this.maxRadius);
        e.preventDefault();
      }.bind(this),
      { passive: false }
    );
  }

  fitViewport(w, h) {
    this.radius = h < 260 ? 28 : 24;
    this.pitch = h < 260 ? 0.36 : 0.3;
  }

  update(dt) {
    if (!this.dragging) {
      this.yaw += this._vyaw * dt * 8;
      this.pitch = clamp(this.pitch + this._vpitch * dt * 8, this.minPitch, this.maxPitch);
      this._vyaw *= Math.pow(0.08, dt * 4);
      this._vpitch *= Math.pow(0.08, dt * 4);
    }
    const cosP = Math.cos(this.pitch);
    const t = this.target;
    this.camera.position.set(
      t.x + Math.sin(this.yaw) * this.radius * cosP,
      t.y + Math.sin(this.pitch) * this.radius,
      t.z + Math.cos(this.yaw) * this.radius * cosP
    );
    this.camera.lookAt(t);
  }
}
