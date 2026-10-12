/**
 * Shared toon materials, palettes, and small geometry helpers.
 * MeshToonMaterial + a 4-stop nearest gradient map gives hard cartoon bands.
 */
(function (global) {
  const THREE = global.THREE;

  function makeToonGradient() {
    const data = new Uint8Array([
      72, 72, 78, 255,
      128, 128, 136, 255,
      188, 188, 196, 255,
      255, 255, 255, 255
    ]);
    const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  const gradientMap = makeToonGradient();

  function toon(color, extras) {
    const mat = new THREE.MeshToonMaterial(Object.assign({
      color: new THREE.Color(color),
      gradientMap: gradientMap
    }, extras || {}));
    return mat;
  }

  function toonEmissive(color, emissive, extras) {
    return toon(color, Object.assign({
      emissive: new THREE.Color(emissive),
      emissiveIntensity: 0
    }, extras || {}));
  }

  function std(color, extras) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color: new THREE.Color(color),
      roughness: 0.65,
      metalness: 0.05
    }, extras || {}));
  }

  const SEASONS = [
    {
      id: "spring",
      name: "Spring",
      climate: "Humidity",
      grass: 0x7dce7a,
      dirt: 0xb08968,
      rock: 0x8d7b6a,
      water: 0x5dade2,
      foliage: 0x63c46e,
      fog: 0xc5d8e6,
      fogDensity: 0.026,
      ambient: 0xc9ddd6,
      hemiSky: 0xd7e8ef,
      hemiGround: 0x7aa37a,
      sunTint: 0xfff1c9,
      exposure: 1.05,
      mist: 1,
      leaves: 0,
      snow: 0,
      fireflies: 0.15
    },
    {
      id: "summer",
      name: "Summer",
      climate: "Hot",
      grass: 0x3fa34d,
      dirt: 0xc4a574,
      rock: 0x9a7b5c,
      water: 0x2e86ab,
      foliage: 0x2d8a3a,
      fog: 0xb9d8f0,
      fogDensity: 0.007,
      ambient: 0xffe6b0,
      hemiSky: 0x9ad0ff,
      hemiGround: 0x6a9a4a,
      sunTint: 0xfff4cc,
      exposure: 1.28,
      mist: 0,
      leaves: 0,
      snow: 0,
      fireflies: 1
    },
    {
      id: "autumn",
      name: "Autumn",
      climate: "Leaves",
      grass: 0xc4a35a,
      dirt: 0x8d5a3a,
      rock: 0x7a5c48,
      water: 0x4a7d93,
      foliage: 0xd35400,
      fog: 0xe6c9a0,
      fogDensity: 0.014,
      ambient: 0xf0c48a,
      hemiSky: 0xf0c38a,
      hemiGround: 0x8a5a32,
      sunTint: 0xffd19a,
      exposure: 1.08,
      mist: 0.1,
      leaves: 1,
      snow: 0,
      fireflies: 0
    },
    {
      id: "winter",
      name: "Winter",
      climate: "Snow",
      grass: 0xe8eef4,
      dirt: 0xc5cdd6,
      rock: 0x8d97a5,
      water: 0x7f9db5,
      foliage: 0xdfe7ef,
      fog: 0xd4e0ee,
      fogDensity: 0.02,
      ambient: 0xc9d6e8,
      hemiSky: 0xc8d6ea,
      hemiGround: 0x8a98aa,
      sunTint: 0xe8f0ff,
      exposure: 0.98,
      mist: 0.35,
      leaves: 0,
      snow: 1,
      fireflies: 0
    }
  ];

  function lerpColor(out, a, b, t) {
    out.set(a).lerp(new THREE.Color(b), t);
    return out;
  }

  function lerpSeason(a, b, t) {
    const mix = {};
    const keys = ["fogDensity", "exposure", "mist", "leaves", "snow", "fireflies"];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      mix[k] = a[k] + (b[k] - a[k]) * t;
    }
    mix.grass = new THREE.Color(a.grass).lerp(new THREE.Color(b.grass), t);
    mix.dirt = new THREE.Color(a.dirt).lerp(new THREE.Color(b.dirt), t);
    mix.rock = new THREE.Color(a.rock).lerp(new THREE.Color(b.rock), t);
    mix.water = new THREE.Color(a.water).lerp(new THREE.Color(b.water), t);
    mix.foliage = new THREE.Color(a.foliage).lerp(new THREE.Color(b.foliage), t);
    mix.fog = new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t);
    mix.ambient = new THREE.Color(a.ambient).lerp(new THREE.Color(b.ambient), t);
    mix.hemiSky = new THREE.Color(a.hemiSky).lerp(new THREE.Color(b.hemiSky), t);
    mix.hemiGround = new THREE.Color(a.hemiGround).lerp(new THREE.Color(b.hemiGround), t);
    mix.sunTint = new THREE.Color(a.sunTint).lerp(new THREE.Color(b.sunTint), t);
    mix.from = a;
    mix.to = b;
    mix.t = t;
    return mix;
  }

  global.Art = {
    gradientMap,
    toon,
    toonEmissive,
    std,
    SEASONS,
    lerpColor,
    lerpSeason
  };
})(window);
