# Floating London Island — Four Seasons

Cartoon 3D London island rendered with **Three.js WebGLRenderer**. Open `index.html` directly (or any static server). No backend, no build step.

## How to run

1. Open `index.html` in a modern browser (Chrome, Firefox, Safari, Edge).
2. Optional: `python3 -m http.server 8080` then visit `http://localhost:8080`.
3. Drag left/right to orbit. Buttons along the bottom switch season, skip day phase, pause, and toggle audio.

Keyboard: `1–4` seasons, `D` cycle dawn/day/dusk/night, `N` night, `Space` pause.

## Three.js version

- **three@0.160.1** via jsDelivr CDN (global UMD build so `file://` works)
  - `https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.min.js`
- Camera orbit is a small custom `OrbitCamera` in `js/orbit.js` (r160 removed `examples/js/controls/OrbitControls.js`)

No other 3D libraries. No external textures; clock faces and the toon gradient are canvas/DataTextures generated at runtime.

## Day/night (15s) and seasons

**Day/night** — `DayNightCycle` in `js/daynight.js`

- `timeOfDay` in `[0, 1)` wraps every **15 seconds** (`DAY_PERIOD`).
- `0` midnight → `0.25` dawn → `0.50` noon → `0.75` dusk.
- Celestial angle: `theta = (timeOfDay - 0.25) * 2π`. Dawn places the sun on the +X horizon; noon lifts it to +Y. The moon sits at `theta + π`.
- Sky dome uniforms, hemisphere/ambient/directional lights, fog colour/density, and exposure **lerp** across 8 palette keys (including a wrap from last→first at midnight).
- Landmark lamps (PointLights + MeshToonMaterial emissive on Big Ben, London Eye, Tower Bridge): **fade on as dusk begins** (`smoothstep 0.70→0.76`), stay on through midnight, **fade off just before dawn** (`1 - smoothstep 0.18→0.24`).

**Seasons** — independent clock in `main.js`

- Each season holds **22s**, with a **5.5s** smoothstep blend into the next: Spring (humidity/mist) → Summer (hot, strong sun) → Autumn (maple leaves) → Winter (snow).
- Grass, rock, water, foliage, fog, and particle spawn weights lerp with the blend.
- Manual jumps (`1–4` or the HUD icons) snap `yearTime` into the stable middle of that season.

## Particles and performance

`WeatherSystem` (`js/weather.js`) uses **fixed InstancedMesh pools** (no per-frame `new`):

| Kind     | Pool | Behaviour |
|----------|------|-----------|
| Maple    | 220  | Tumble (3-axis spin) + dual-frequency X/Z sway; recycle below `y = -2` |
| Snow     | 320  | Faster fall, lighter sway, billboarded discs |
| Mist     | 90   | Soft planes drifting up (spring humidity) |
| Fireflies| 40   | Summer × night only |

Inactive instances are scaled to ~0. Spawn rate tracks blended season weights so autumn→winter does not leak leaves. Shared geometries, pixel ratio cap (1–1.75), 1024 shadow map, deltaTime clamped to 50ms.

## Camera

Custom `OrbitCamera` on the canvas: left-drag (or one-finger drag) yaws/pitches, wheel zooms. Spherical damping keeps the view gliding while dragging. Polar angle is clamped so the camera cannot flip under the island. The `requestAnimationFrame` loop **never pauses** during pointer interaction. On 320×200 viewports FOV widens and min-radius increases so Big Ben, the Eye and the Bridge stay in frame.

## Modules

| File | Role |
|------|------|
| `js/orbit.js` | Drag-to-orbit camera with damping |
| `js/materials.js` | MeshToonMaterial factory + 4-stop gradient map + season palettes |
| `js/island.js` | Floating landmass, Thames ripples, trees, clouds |
| `js/bigben.js` | Elizabeth Tower, canvas clocks, lamps |
| `js/landmarks.js` | London Eye, Tower Bridge, bus + phone box |
| `js/weather.js` | Particle pools |
| `js/daynight.js` | Sky, sun/moon, lights, 15s clock |
| `js/audio.js` | Optional Web Audio wind/drone (starts muted) |
| `main.js` | Renderer, rAF loop, HUD, keyboard |

## Tiny preview (320×200, 16:10)

HUD is a 22px status row + 24–28px icon toolbar. Controls never stack or overflow; labels ellipsize. The canvas is full-bleed; overlays do not cover the island.
