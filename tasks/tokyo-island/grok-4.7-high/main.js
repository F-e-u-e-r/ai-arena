/* Bootstrap, camera rig, and the animation loop.
   The loop keeps running during a drag — pointer handlers only store angles. */

(function () {
  const boot = document.getElementById("boot-error");

  function fail(message) {
    if (boot) {
      boot.hidden = false;
      boot.textContent = message;
    }
  }

  if (typeof THREE === "undefined") {
    fail("Three.js did not load. Open this page with a network connection so the CDN script can be fetched.");
    return;
  }

  const canvas = document.getElementById("scene");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
  } catch (err) {
    fail("WebGL is unavailable in this browser.");
    return;
  }

  renderer.outputEncoding = THREE.sRGBEncoding;
  // No filmic curve: cartoon colors stay saturated instead of milking out.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x2f86dc, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb7daf2, 70, 220);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.15, 900);

  /* theta = 0 and phi = π/2 place the camera at (0, 0, radius), on +Z, looking toward the origin.
     Dragging right decreases theta, matching a grab-the-scene orbit. */
  const rig = {
    theta: DEFAULT_VIEW_THETA,
    phi: 1.42,
    radius: 36,
    target: new THREE.Vector3(0, 3.2, 0),
    dragging: false,
    lastX: 0,
    lastY: 0,
    phiMin: 0.9,
    phiMax: 1.42,
    apply: function () {
      const sp = Math.sin(this.phi);
      const cp = Math.cos(this.phi);
      camera.position.set(
        this.radius * sp * Math.sin(this.theta),
        this.radius * cp,
        this.radius * sp * Math.cos(this.theta)
      );
      camera.lookAt(this.target);
    },
    fit: function (w, h) {
      const short = h <= 260;
      const compact = h <= 480;
      if (short) {
        this.radius = 50;
        this.target.y = 4.0;
        camera.fov = 42;
        this.phiMin = 1.22;
        this.phiMax = 1.5;
      } else if (compact) {
        this.radius = 42;
        this.target.y = 3.6;
        camera.fov = 44;
        this.phiMin = 1.16;
        this.phiMax = 1.52;
      } else {
        this.radius = 36;
        this.target.y = 3.2;
        camera.fov = 46;
        this.phiMin = 1.12;
        this.phiMax = 1.55;
      }
      if (this.phi < this.phiMin) this.phi = this.phiMin;
      if (this.phi > this.phiMax) this.phi = this.phiMax;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
  };

  const ambient = new THREE.AmbientLight(0xfff6ea, 0.46);
  const hemi = new THREE.HemisphereLight(0xd7efff, 0x8fb56a, 0.48);
  const sunLight = new THREE.DirectionalLight(0xfff1d2, 1.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 30;
  sunLight.shadow.camera.far = 400;
  sunLight.shadow.camera.left = -32;
  sunLight.shadow.camera.right = 32;
  sunLight.shadow.camera.top = 32;
  sunLight.shadow.camera.bottom = -32;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.04;
  sunLight.target.position.set(0, 2.2, 0);
  const moonLight = new THREE.DirectionalLight(0xb7c6ff, 0);

  scene.add(ambient, hemi, sunLight, sunLight.target, moonLight);

  const environment = new Environment(scene);
  const island = new Island();
  const tower = new TokyoTower();
  const fuji = new Landmark("fuji");
  const torii = new Landmark("torii");
  const temple = new Landmark("temple");
  island.group.add(tower.group, fuji.group, torii.group, temple.group);
  scene.add(island.group);

  const leaves = new MapleLeafSystem();
  scene.add(leaves.mesh);

  const cycle = new DayNightCycle({
    scene: scene,
    renderer: renderer,
    hemi: hemi,
    ambient: ambient,
    sunLight: sunLight,
    moonLight: moonLight,
    environment: environment
  });

  const params = new URLSearchParams(location.search);
  if (params.has("phase")) {
    const phase = parseFloat(params.get("phase"));
    if (!isNaN(phase)) cycle.time = ((phase % 1) + 1) % 1 * cycle.duration;
  }
  if (params.has("speed")) {
    const speed = parseFloat(params.get("speed"));
    if (!isNaN(speed) && speed > 0) cycle.speed = speed;
  }

  const ambience = new Ambience();
  const phaseEl = document.getElementById("phase");
  const statsEl = document.getElementById("stats");
  const soundBtn = document.getElementById("btn-sound");
  const speedBtn = document.getElementById("btn-speed");
  let shownPhase = "";

  function refreshSpeedButton() {
    const fast = cycle.speed > 1.01;
    speedBtn.textContent = fast ? cycle.speed.toFixed(0).replace(/\.0$/, "") + "×" : "1×";
    if (cycle.speed >= 3.5 && cycle.speed <= 4.5) speedBtn.textContent = "4×";
    speedBtn.setAttribute("aria-pressed", fast ? "true" : "false");
  }

  function setSpeed(next) {
    cycle.speed = Math.min(8, Math.max(1, next));
    refreshSpeedButton();
  }

  soundBtn.addEventListener("click", function () {
    const on = ambience.toggle();
    soundBtn.textContent = on ? "Mute" : "Sound";
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  speedBtn.addEventListener("click", function () {
    setSpeed(cycle.speed > 1.01 ? 1 : 4);
  });

  window.addEventListener("keydown", function (event) {
    if (event.repeat) return;
    if (event.key === "f" || event.key === "F") {
      setSpeed(cycle.speed > 1.01 ? 1 : 4);
    } else if (event.key === "]") {
      setSpeed(cycle.speed * 2);
    } else if (event.key === "[") {
      setSpeed(cycle.speed / 2);
    } else if (event.key === "m" || event.key === "M") {
      soundBtn.click();
    } else if (event.key === "ArrowLeft") {
      rig.theta += 0.12;
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      rig.theta -= 0.12;
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    rig.dragging = true;
    rig.lastX = event.clientX;
    rig.lastY = event.clientY;
    canvas.classList.add("dragging");
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", function (event) {
    if (!rig.dragging) return;
    const dx = event.clientX - rig.lastX;
    const dy = event.clientY - rig.lastY;
    rig.lastX = event.clientX;
    rig.lastY = event.clientY;
    rig.theta -= dx * 0.005;
    rig.phi = Math.min(rig.phiMax, Math.max(rig.phiMin, rig.phi + dy * 0.003));
  });

  function endDrag(event) {
    rig.dragging = false;
    canvas.classList.remove("dragging");
    if (event && canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, h < 280 ? 1.25 : 1.6);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    rig.fit(w, h);
    rig.apply();
  }
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(resize);
    observer.observe(document.documentElement);
  }
  resize();

  // Advance once so the first painted frame is already lit and full of leaves.
  let elapsed = 0;
  let last = performance.now();
  let fps = 60;
  let statWait = 0;
  const sample0 = cycle.update(0);
  island.setWater(sample0.water);
  island.setNightGlow(sample0.stars);
  leaves.update(0.016, 0, island.group.position.y);
  rig.apply();

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    // Clamp a stalled frame so a background tab cannot fast-forward the cycle or the leaves.
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    elapsed += dt;

    const sample = cycle.update(dt);
    island.setWater(sample.water);
    island.setNightGlow(sample.stars);
    island.update(elapsed, dt);
    tower.update(elapsed);
    fuji.update(elapsed);
    torii.update(elapsed);
    temple.update(elapsed);
    leaves.update(dt, elapsed, island.group.position.y);
    environment.update(dt, elapsed);
    ambience.update(sample, elapsed);
    rig.apply();
    renderer.render(scene, camera);

    if (sample.name !== shownPhase) {
      shownPhase = sample.name;
      phaseEl.textContent = sample.name;
      phaseEl.dataset.phase = sample.name.toLowerCase();
    }

    const instant = dt > 0.0001 ? 1 / dt : fps;
    fps += (instant - fps) * 0.06;
    statWait += dt;
    if (statWait > 0.3) {
      statWait = 0;
      let air = 0;
      for (let i = 0; i < leaves.count; i++) if (!leaves.settled[i]) air++;
      statsEl.textContent = Math.round(fps) + " fps · " + air + " leaves";
    }
  }

  refreshSpeedButton();
  phaseEl.textContent = sample0.name;
  phaseEl.dataset.phase = sample0.name.toLowerCase();
  shownPhase = sample0.name;
  requestAnimationFrame(frame);

  window.__tokyo = {
    cycle: cycle,
    rig: rig,
    leaves: leaves,
    island: island,
    tower: tower,
    nightRig: nightRig,
    renderer: renderer,
    scene: scene,
    camera: camera
  };
})();
