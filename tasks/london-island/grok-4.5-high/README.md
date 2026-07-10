# Floating London Island (Three.js)

Cartoon floating island with **Big Ben**, the **London Eye**, and **Tower Bridge**. Four London-inspired seasons (spring fog, summer heat, autumn leaves, winter snow) blend smoothly while a **15-second** day–night cycle drives sky, sun/moon, and automatic landmark lighting.

## How to run

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Works in the AI Arena 320×200 iframe preview.

## Three.js

- **three@0.160.0** (unpkg CDN + import map)
- `WebGLRenderer`, soft shadows, `MeshToonMaterial` (cel gradient) for cartoon look
- No other 3D engines or frameworks

## Seasons & day/night

### Seasons (auto every 20s, or manual UI / keys `1–4`)

| Season | Atmosphere | Particles |
| --- | --- | --- |
| Spring | Pale humid sky, denser fog | Soft fog spheres |
| Summer | Warmer sky, stronger key light | Sparse heat haze |
| Autumn | Neutral | Spinning maple leaves with sway |
| Winter | Cooler, light fog | Dense snowflakes |

Season changes use a transition factor so old particles recycle and new ones ramp in—no hard cut.

### Day cycle (15s)

`DAY → DUSK → NIGHT → DAWN → DAY`

- Sky, ambient, directional light, and fog all interpolate
- **Dusk**: Big Ben clocks, Eye cabins, and Bridge lanterns ramp on (`PointLight` + emissive)
- **Dawn**: lights fade **before** dawn completes
- Sun / moon opposite on an orbit; directional light tracks the sun
- `⏱️` button or `D` key doubles day speed (1→2→4→1); `Space` resets phase

## Particle pool

- Fixed pool of **220** meshes; shared geometries per kind (leaf plane / snow disc / fog sphere / haze)
- Acquire → integrate velocity + sway → recycle when lifetime/bounds expire or season no longer wants that kind
- No runtime `new Mesh` in the animation loop

## Camera

Custom horizontal orbit: pointer drag changes yaw; wheel zooms (clamped). Scene keeps animating while dragging.

## Architecture

`Island`, `BigBen`, `Landmark` (Eye / Bridge), `WeatherSystem`, `DayNightCycle`, `CameraOrbit`

## Embed UX

- Bottom icon strip for seasons (always tappable at 320×200)
- Compact top badges for season / phase / FPS
- No large panels covering the island

## Assets

Procedural geometry only — no external textures.
