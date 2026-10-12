(function () {
  const canvas = document.getElementById("scene");
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x7ec8e3, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);

  const hemi = new THREE.HemisphereLight(0xb8e4ff, 0xc9e0a8, 0.85);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xf7e7c4, 0.55);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xfff1c2, 1.35);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 4;
  sunLight.shadow.camera.far = 90;
  sunLight.shadow.camera.left = -18;
  sunLight.shadow.camera.right = 18;
  sunLight.shadow.camera.top = 16;
  sunLight.shadow.camera.bottom = -16;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);

  const island = new Island();
  scene.add(island.group);

  const tower = new TokyoTower();
  island.group.add(tower.group);

  const fuji = new Landmark("fuji", -6.4, 5.6, 0.4);
  const torii = new Landmark("torii", 6.2, -4.6, -0.7);
  const pagoda = new Landmark("pagoda", 7.1, 1.6, 0.35);
  const lanterns = [
    new Landmark("lantern", -5.4, 6.6, 0),
    new Landmark("lantern", 5.4, -5.6, 0.4),
    new Landmark("lantern", -3.2, -5.8, 0),
  ];
  island.group.add(fuji.group, torii.group, pagoda.group);
  lanterns.forEach(function (l) {
    island.group.add(l.group);
  });

  const compact = Math.min(window.innerWidth, window.innerHeight) < 280;
  const leaves = new MapleLeafSystem(scene, compact ? 110 : 200);

  const decor = new Decor(scene);
  const cycle = new DayNightCycle({
    scene: scene,
    renderer: renderer,
    decor: decor,
    hemi: hemi,
    ambient: ambient,
    sunLight: sunLight,
    glows: [tower, torii, pagoda].concat(lanterns),
    cloudMat: decor.cloudMat,
  });

  const rig = new CameraRig(camera, canvas, new THREE.Vector3(0, 1.7, 0));
  const ambience = new Ambience();

  const hud = {
    fill: document.getElementById("cycleFill"),
    chip: document.getElementById("phaseChip"),
    stats: document.getElementById("stats"),
    panel: document.getElementById("panel"),
    btnPause: document.getElementById("btnPause"),
    btnSpeed: document.getElementById("btnSpeed"),
    btnAudio: document.getElementById("btnAudio"),
    btnInfo: document.getElementById("btnInfo"),
    frames: 0,
    fps: 0,
    lastFps: performance.now(),
  };

  function resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const compactView = h <= 220 || w <= 360;
    camera.aspect = w / h;
    camera.fov = compactView ? 58 : 46;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compactView ? 1.25 : 2));
    renderer.setSize(w, h, false);
    renderer.shadowMap.enabled = w * h > 320 * 240;
    sunLight.castShadow = renderer.shadowMap.enabled;
    rig.fitViewport(w, h);
  }
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(document.documentElement);
  }
  resize();

  hud.btnPause.addEventListener("click", function (e) {
    e.stopPropagation();
    const paused = cycle.togglePause();
    hud.btnPause.textContent = paused ? "▶" : "⏸";
    hud.btnPause.setAttribute("aria-label", paused ? "Resume cycle" : "Pause cycle");
  });
  hud.btnSpeed.addEventListener("click", function (e) {
    e.stopPropagation();
    hud.btnSpeed.textContent = cycle.cycleSpeed() + "×";
  });
  hud.btnAudio.addEventListener("click", function (e) {
    e.stopPropagation();
    ambience.toggle().then(function (on) {
      hud.btnAudio.classList.toggle("is-on", on);
      hud.btnAudio.textContent = on ? "♫" : "♪";
    });
  });
  hud.btnInfo.addEventListener("click", function (e) {
    e.stopPropagation();
    const open = hud.panel.hasAttribute("hidden");
    if (open) hud.panel.removeAttribute("hidden");
    else hud.panel.setAttribute("hidden", "");
    hud.btnInfo.setAttribute("aria-pressed", open ? "true" : "false");
  });

  window.addEventListener("keydown", function (e) {
    if (e.code === "Space") {
      e.preventDefault();
      hud.btnPause.click();
    } else if (e.key === "1") {
      cycle.speed = 1;
      hud.btnSpeed.textContent = "1×";
    } else if (e.key === "2") {
      cycle.speed = 2;
      hud.btnSpeed.textContent = "2×";
    } else if (e.key === "4") {
      cycle.speed = 4;
      hud.btnSpeed.textContent = "4×";
    } else if (e.key === "[") {
      cycle.nudge(-1.5);
    } else if (e.key === "]") {
      cycle.nudge(1.5);
    } else if (e.key === "m" || e.key === "M") {
      hud.btnAudio.click();
    } else if (e.key === "i" || e.key === "I") {
      hud.btnInfo.click();
    }
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    island.update(dt, now * 0.001);
    leaves.update(dt, now * 0.001);
    decor.update(dt, now * 0.001);
    cycle.update(dt);
    rig.update(dt);
    ambience.update(cycle.phase, cycle.lamp);
    renderer.render(scene, camera);

    hud.frames++;
    if (now - hud.lastFps >= 500) {
      hud.fps = Math.round((hud.frames * 1000) / (now - hud.lastFps));
      hud.frames = 0;
      hud.lastFps = now;
      hud.stats.textContent = "FPS " + hud.fps + " · leaves " + leaves.count;
    }
    hud.fill.style.width = (cycle.phase * 100).toFixed(1) + "%";
    hud.chip.textContent = cycle.phaseName;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__tokyo = {
    cycle: cycle,
    leaves: leaves,
    camera: camera,
    renderer: renderer,
    rig: rig,
    scene: scene,
    island: island,
    tower: tower,
  };
})();
