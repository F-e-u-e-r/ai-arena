/**
 * Scene bootstrap: renderer, camera, modules, rAF loop with deltaTime.
 */
(function () {
  const canvas = document.getElementById("scene");
  const fallback = document.getElementById("fallback");
  const seasonLabel = document.getElementById("seasonLabel");
  const phaseLabel = document.getElementById("phaseLabel");
  const debugEl = document.getElementById("debug");
  const btnPause = document.getElementById("btnPause");
  const btnMute = document.getElementById("btnMute");
  const btnDay = document.getElementById("btnDay");

  if (typeof THREE === "undefined" || typeof THREE.WebGLRenderer !== "function") {
    fallback.hidden = false;
    return;
  }

  const SEASON_SECS = 22;
  const BLEND_SECS = 5.5;
  const DAY_STEPS = ["dawn", "day", "dusk", "night"];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
  } catch (err) {
    fallback.hidden = false;
    return;
  }

  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x87b8d8, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(20, 11.5, 24);

  const controls = new OrbitCamera(camera, canvas, new THREE.Vector3(0, 3.4, 0));
  controls.enableMoveListen();

  const world = new THREE.Group();
  world.name = "FloatingWorld";
  scene.add(world);

  const island = new Island();
  const bigBen = new BigBen();
  const eye = new LondonEye();
  const bridge = new TowerBridge();
  const props = new LondonProps();
  world.add(island.group, bigBen.group, eye.group, bridge.group, props.group);

  const dayNight = new DayNightCycle(scene, renderer);
  const weather = new WeatherSystem(scene);
  const audio = new AmbientAudio();

  let yearTime = SEASON_SECS * 0.2;
  let paused = false;
  let elapsed = 0;
  let lastT = performance.now();
  let fpsEma = 60;
  let dayStep = 1;

  function seasonMix() {
    const cycle = SEASON_SECS * 4;
    const t = ((yearTime % cycle) + cycle) % cycle;
    const idx = Math.min(3, Math.floor(t / SEASON_SECS));
    const local = t - idx * SEASON_SECS;
    const next = (idx + 1) % 4;
    const k = THREE.MathUtils.smoothstep(local, SEASON_SECS - BLEND_SECS, SEASON_SECS);
    const mix = Art.lerpSeason(Art.SEASONS[idx], Art.SEASONS[next], k);
    mix.index = k > 0.5 ? next : idx;
    mix.name = k > 0.5 ? Art.SEASONS[next].name : Art.SEASONS[idx].name;
    mix.climate = k > 0.5 ? Art.SEASONS[next].climate : Art.SEASONS[idx].climate;
    return mix;
  }

  function jumpSeason(index) {
    yearTime = index * SEASON_SECS + 2.5;
    syncSeasonButtons(index);
  }

  function syncSeasonButtons(index) {
    const buttons = document.querySelectorAll("[data-season]");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("is-active", Number(buttons[i].dataset.season) === index);
    }
  }

  function fit() {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    const short = Math.min(w, h);
    const pr = short < 260 ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = h < 230 ? 54 : w / h < 1.15 ? 48 : 42;
    camera.updateProjectionMatrix();
    if (short < 280) {
      controls.minRadius = 18;
      camera.position.z = Math.max(camera.position.z, 26);
    }
  }

  function tick(now) {
    const raw = (now - lastT) / 1000;
    lastT = now;
    const dt = Math.min(0.05, Math.max(0, raw));
    elapsed += dt;
    fpsEma = fpsEma * 0.9 + (dt > 0 ? 1 / dt : 60) * 0.1;

    if (!paused) yearTime += dt;

    const mix = seasonMix();
    island.applySeason(mix);
    island.update(dt, elapsed);

    world.position.y = Math.sin(elapsed * 0.55) * 0.28;
    world.rotation.z = Math.sin(elapsed * 0.23) * 0.012;
    world.rotation.x = Math.cos(elapsed * 0.19) * 0.008;

    const lamps = dayNight.update(dt, mix);
    bigBen.setLights(lamps);
    eye.setLights(lamps);
    bridge.setLights(lamps);
    props.setLights(lamps);
    bigBen.update(dayNight.timeOfDay);
    eye.update(dt);
    weather.update(dt, mix, lamps, camera);
    audio.update(mix, dayNight.timeOfDay, lamps);

    controls.update();
    renderer.render(scene, camera);

    seasonLabel.textContent = mix.name + " · " + mix.climate;
    phaseLabel.textContent = dayNight.phaseName;
    debugEl.textContent = Math.round(fpsEma) + " FPS · " + weather.getCount() + " px";
    syncSeasonButtons(mix.index);

    requestAnimationFrame(tick);
  }

  document.querySelectorAll("[data-season]").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      jumpSeason(Number(btn.dataset.season));
    });
  });

  btnPause.addEventListener("click", function (ev) {
    ev.stopPropagation();
    paused = !paused;
    dayNight.paused = paused;
    btnPause.textContent = paused ? "▶" : "⏸";
    btnPause.setAttribute("aria-pressed", String(paused));
  });

  btnMute.addEventListener("click", function (ev) {
    ev.stopPropagation();
    const on = audio.toggle();
    btnMute.textContent = on ? "🔊" : "🔇";
    btnMute.setAttribute("aria-pressed", String(on));
  });

  btnDay.addEventListener("click", function (ev) {
    ev.stopPropagation();
    dayStep = (dayStep + 1) % DAY_STEPS.length;
    dayNight.skipTo(DAY_STEPS[dayStep]);
  });

  window.addEventListener("keydown", function (e) {
    if (e.code === "Digit1") jumpSeason(0);
    else if (e.code === "Digit2") jumpSeason(1);
    else if (e.code === "Digit3") jumpSeason(2);
    else if (e.code === "Digit4") jumpSeason(3);
    else if (e.code === "KeyD") {
      dayStep = (dayStep + 1) % DAY_STEPS.length;
      dayNight.skipTo(DAY_STEPS[dayStep]);
    } else if (e.code === "KeyN") {
      dayNight.skipTo("night");
      dayStep = 3;
    } else if (e.code === "Space") {
      e.preventDefault();
      btnPause.click();
    }
  });

  window.addEventListener("resize", fit);
  fit();
  syncSeasonButtons(0);
  requestAnimationFrame(tick);

  window.__london = {
    scene: scene,
    camera: camera,
    renderer: renderer,
    dayNight: dayNight,
    weather: weather,
    jumpSeason: jumpSeason
  };
})();
