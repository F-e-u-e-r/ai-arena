/* 15-second day → dusk → night → dawn → day cycle.
   Colors come from keyframes. The sun angle is a separate uniform orbit
   so the disc cannot pop when a color key changes. */

const CYCLE_SECONDS = 15;
const NOON_PHASE = 0.11;

function phaseName(t) {
  if (t >= 0.33 && t < 0.48) return "Dusk";
  if (t >= 0.48 && t < 0.80) return "Night";
  if (t >= 0.80 && t < 0.93) return "Dawn";
  return "Day";
}

function makeKey(t, spec) {
  return {
    t: t,
    skyTop: new THREE.Color(spec.skyTop),
    skyHorizon: new THREE.Color(spec.skyHorizon),
    skyBottom: new THREE.Color(spec.skyBottom),
    fog: new THREE.Color(spec.fog),
    ambient: new THREE.Color(spec.ambient),
    ambientIntensity: spec.ambientIntensity,
    hemiSky: new THREE.Color(spec.hemiSky),
    hemiGround: new THREE.Color(spec.hemiGround),
    hemiIntensity: spec.hemiIntensity,
    sunColor: new THREE.Color(spec.sunColor),
    sunIntensity: spec.sunIntensity,
    moonIntensity: spec.moonIntensity,
    exposure: spec.exposure,
    lamps: spec.lamps,
    stars: spec.stars,
    cloud: new THREE.Color(spec.cloud),
    water: new THREE.Color(spec.water)
  };
}

const COLOR_KEYS = ["skyTop", "skyHorizon", "skyBottom", "fog", "ambient", "hemiSky", "hemiGround", "sunColor", "cloud", "water"];
const NUMBER_KEYS = ["ambientIntensity", "hemiIntensity", "sunIntensity", "moonIntensity", "exposure", "lamps", "stars"];

class DayNightCycle {
  constructor(options) {
    this.duration = CYCLE_SECONDS;
    this.time = 0.2 * CYCLE_SECONDS;
    this.speed = 1;
    this.phase = 0;
    this.scene = options.scene;
    this.renderer = options.renderer;
    this.hemi = options.hemi;
    this.ambient = options.ambient;
    this.sunLight = options.sunLight;
    this.moonLight = options.moonLight;
    this.environment = options.environment;

    this.keys = [
      makeKey(0.0, {
        skyTop: "#2f86dc", skyHorizon: "#9ed4f6", skyBottom: "#5e94c4", fog: "#b7daf2",
        ambient: "#fff6ea", ambientIntensity: 0.32,
        hemiSky: "#c5e6ff", hemiGround: "#6ea84a", hemiIntensity: 0.34,
        sunColor: "#fff3d2", sunIntensity: 1.35, moonIntensity: 0.02,
        exposure: 1, lamps: 0, stars: 0, cloud: "#fffdf8", water: "#1f86c8"
      }),
      makeKey(0.3, {
        skyTop: "#3b93e2", skyHorizon: "#b7def6", skyBottom: "#6aa4cc", fog: "#c5e4f6",
        ambient: "#fff1e0", ambientIntensity: 0.32,
        hemiSky: "#d0ebff", hemiGround: "#74a84e", hemiIntensity: 0.32,
        sunColor: "#ffe6c2", sunIntensity: 1.25, moonIntensity: 0.04,
        exposure: 1, lamps: 0, stars: 0, cloud: "#fff8f2", water: "#248cc8"
      }),
      makeKey(0.36, {
        skyTop: "#5d6cb0", skyHorizon: "#ff8b4a", skyBottom: "#6a3d62", fog: "#e09070",
        ambient: "#ffb088", ambientIntensity: 0.28,
        hemiSky: "#ff9a78", hemiGround: "#6a5344", hemiIntensity: 0.26,
        sunColor: "#ff8a45", sunIntensity: 0.95, moonIntensity: 0.12,
        exposure: 0.98, lamps: 0.25, stars: 0.05, cloud: "#ffb199", water: "#e07a62"
      }),
      makeKey(0.48, {
        skyTop: "#241c4a", skyHorizon: "#c45a48", skyBottom: "#1a1430", fog: "#3a3058",
        ambient: "#6a6494", ambientIntensity: 0.16,
        hemiSky: "#6a5a90", hemiGround: "#2a2438", hemiIntensity: 0.14,
        sunColor: "#ff7744", sunIntensity: 0.35, moonIntensity: 0.28,
        exposure: 0.9, lamps: 1, stars: 0.55, cloud: "#6a5a78", water: "#6a4068"
      }),
      makeKey(0.62, {
        skyTop: "#070b1e", skyHorizon: "#1a2c5c", skyBottom: "#07091a", fog: "#12182e",
        ambient: "#243056", ambientIntensity: 0.16,
        hemiSky: "#243864", hemiGround: "#14121c", hemiIntensity: 0.12,
        sunColor: "#9ab0dd", sunIntensity: 0.05, moonIntensity: 0.26,
        exposure: 0.86, lamps: 1, stars: 1, cloud: "#3a4a72", water: "#1a3566"
      }),
      makeKey(0.74, {
        skyTop: "#12182e", skyHorizon: "#2a3a60", skyBottom: "#10131c", fog: "#1a2238",
        ambient: "#31405c", ambientIntensity: 0.16,
        hemiSky: "#24344e", hemiGround: "#16141e", hemiIntensity: 0.14,
        sunColor: "#8899bb", sunIntensity: 0.08, moonIntensity: 0.32,
        exposure: 0.84, lamps: 1, stars: 0.7, cloud: "#44506e", water: "#243e68"
      }),
      makeKey(0.8, {
        skyTop: "#2a3058", skyHorizon: "#f0a090", skyBottom: "#3a4868", fog: "#c09098",
        ambient: "#e8b0a8", ambientIntensity: 0.36,
        hemiSky: "#f0b0a8", hemiGround: "#4a403c", hemiIntensity: 0.34,
        sunColor: "#ffb090", sunIntensity: 0.45, moonIntensity: 0.12,
        exposure: 0.94, lamps: 0, stars: 0.15, cloud: "#f0b0a8", water: "#e08998"
      }),
      makeKey(0.92, {
        skyTop: "#79c6f4", skyHorizon: "#ffe0c4", skyBottom: "#c5d8ea", fog: "#e4eef6",
        ambient: "#fff0e0", ambientIntensity: 0.44,
        hemiSky: "#d5ecff", hemiGround: "#8aaf6c", hemiIntensity: 0.46,
        sunColor: "#fff0d0", sunIntensity: 1.15, moonIntensity: 0.04,
        exposure: 1.03, lamps: 0, stars: 0, cloud: "#fff6ee", water: "#4aa0d4"
      }),
      makeKey(1.0, {
        skyTop: "#2f86dc", skyHorizon: "#9ed4f6", skyBottom: "#5e94c4", fog: "#b7daf2",
        ambient: "#fff6ea", ambientIntensity: 0.32,
        hemiSky: "#c5e6ff", hemiGround: "#6ea84a", hemiIntensity: 0.34,
        sunColor: "#fff3d2", sunIntensity: 1.35, moonIntensity: 0.02,
        exposure: 1, lamps: 0, stars: 0, cloud: "#fffdf8", water: "#1f86c8"
      })
    ];

    this.sample = makeKey(0, {
      skyTop: "#000", skyHorizon: "#000", skyBottom: "#000", fog: "#000",
      ambient: "#000", ambientIntensity: 0,
      hemiSky: "#000", hemiGround: "#000", hemiIntensity: 0,
      sunColor: "#fff", sunIntensity: 0, moonIntensity: 0,
      exposure: 1, lamps: 0, stars: 0, cloud: "#fff", water: "#000"
    });
    this.sample.name = "Day";

    this.sunPos = new THREE.Vector3();
    this.moonPos = new THREE.Vector3();
    this.sunElev = 1;
    this.moonElev = -1;
    this._bodies = {
      sunPos: this.sunPos,
      moonPos: this.moonPos,
      sunElev: 1,
      moonElev: -1
    };
  }

  /**
   * Smoothstep blend between the surrounding keyframes.
   * Lamps ramp on from dusk (t≈0.36) and are back to 0 by t=0.80,
   * which is before the dawn color finishes arriving — lights out before sunrise.
   */
  _blend(phase) {
    const keys = this.keys;
    let i = 0;
    while (i < keys.length - 2 && phase >= keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const span = (b.t - a.t) || 1;
    const u = smoothstep(0, 1, (phase - a.t) / span);
    const out = this.sample;
    for (let k = 0; k < COLOR_KEYS.length; k++) {
      const name = COLOR_KEYS[k];
      out[name].copy(a[name]).lerp(b[name], u);
    }
    for (let k = 0; k < NUMBER_KEYS.length; k++) {
      const name = NUMBER_KEYS[k];
      out[name] = lerp(a[name], b[name], u);
    }
    out.name = phaseName(phase);
    return out;
  }

  /**
   * One revolution per cycle. ang = 0 at noon (phase 0.11):
   *   sunset at 0.36 (dusk), midnight at 0.61, sunrise at 0.86 (dawn).
   * The disc stays low, on the far side of DEFAULT_VIEW_THETA, because the
   * camera looks slightly down and only the horizon band is on screen.
   * elev stored for the light gates is that angle / (π/2): about +0.14 at noon,
   * 0 on the horizon, negative at night. The moon is half a turn away.
   */
  _placeBodies(phase) {
    const ang = (phase - NOON_PHASE) * Math.PI * 2;
    const orbit = 180;
    const peak = 0.22;
    const sweep = 0.46;
    const place = (angle, scale, target, elevName) => {
      const elevRad = Math.cos(angle) * peak;
      // +azimuth is screen-left for the default camera (forward × up = right,
      // and increasing atan2(x,z) steps the opposite way). Sunset (sin > 0)
      // therefore uses a minus so the sun leaves toward screen-right.
      const az = DEFAULT_VIEW_THETA + Math.PI - Math.sin(angle) * sweep;
      const c = Math.cos(elevRad);
      target.set(
        Math.sin(az) * orbit * scale * c,
        Math.sin(elevRad) * orbit * scale,
        Math.cos(az) * orbit * scale * c
      );
      this[elevName] = elevRad / (Math.PI / 2);
    };
    place(ang, 1, this.sunPos, "sunElev");
    place(ang + Math.PI, 0.92, this.moonPos, "moonElev");
    this._bodies.sunElev = this.sunElev;
    this._bodies.moonElev = this.moonElev;
  }

  update(dt) {
    this.time += dt * this.speed;
    if (this.time >= this.duration) {
      this.time %= this.duration;
    } else if (this.time < 0) {
      this.time = (this.time % this.duration) + this.duration;
    }
    this.phase = this.time / this.duration;
    const sample = this._blend(this.phase);
    this._placeBodies(this.phase);

    this.scene.fog.color.copy(sample.fog);
    this.scene.background = null;
    this.ambient.color.copy(sample.ambient);
    this.ambient.intensity = sample.ambientIntensity;
    this.hemi.color.copy(sample.hemiSky);
    this.hemi.groundColor.copy(sample.hemiGround);
    this.hemi.intensity = sample.hemiIntensity;

    // Sun light fades as the disc drops below the horizon; moon light fades in from the opposite side.
    // Two lights avoid a shadow-direction pop at sunset.
    const sunGate = smoothstep(-0.12, 0.08, this.sunElev);
    const moonGate = smoothstep(-0.12, 0.12, this.moonElev);
    this.sunLight.color.copy(sample.sunColor);
    this.sunLight.intensity = sample.sunIntensity * sunGate;
    this.sunLight.position.copy(this.sunPos);
    this.moonLight.intensity = sample.moonIntensity * moonGate;
    this.moonLight.position.copy(this.moonPos);

    this.renderer.toneMappingExposure = sample.exposure;
    this.environment.apply(sample, this._bodies);
    nightRig.set(sample.lamps);
    return sample;
  }
}
