# Floating Tokyo Island (Three.js)

Cartoon-style floating island featuring Tokyo Tower, Mount Fuji, a vermillion torii, and a small temple. Maple leaves fall with sway/rotation, and a 15-second day–night cycle drives sky, lights, and landmark illumination.

## How to run

Open `index.html` via a static server (ES modules + CDN):

```bash
# from this folder
python3 -m http.server 8080
# → http://localhost:8080
```

Or open from the AI Arena gallery iframe (works at 320×200).

## Three.js version

- **three@0.160.0** via unpkg CDN
- Import map in `index.html` → `three` + `three/addons/`
- Renderer: `THREE.WebGLRenderer` with soft shadows
- Materials: primarily `MeshToonMaterial` (+ gradient map) for a cel-shaded look; leaves use `MeshStandardMaterial`

## Day / night cycle

| Segment | Phase `t` | Visual |
| --- | --- | --- |
| Day | 0.00–0.25 | Bright sky, strong sun |
| Dusk | 0.25–0.40 | Warm orange blend; lights ramp up mid-dusk |
| Night | 0.40–0.75 | Deep blue sky; landmark PointLights full |
| Dawn | 0.75–0.90 | Soft rose sky; **lights fade before dawn ends** |
| Morning | 0.90–1.00 | Return to day |

- Full cycle: **15 seconds** (`DAY_CYCLE_SEC`)
- Sun / moon orbit on opposite sides of a circle; directional light tracks the sun
- Ambient intensity, fog color/near/far, and sky background all lerp between keyframes
- Shortcuts: `1`/`2`/`3`/`4` = 1×/2×/4×/8× speed; `Space` resets to day

## Particle system (maple leaves)

- Fixed pool of **180** leaf meshes (shared `PlaneGeometry`, per-leaf materials for color variety)
- Spawn from pool → update physics → recycle when below island or lifetime ends
- Motion: gravity-like fall + sinusoidal horizontal sway + spin
- No per-frame allocations in the hot path (pool reuse only)

## Camera control

Custom **horizontal orbit** (not OrbitControls dependency):

- Pointer drag left/right → yaw (`theta`) around the island
- Optional wheel zoom (clamped radius 8–22)
- Animation continues while dragging (`requestAnimationFrame` + `deltaTime`)

## Architecture

| Class | Role |
| --- | --- |
| `Island` | Terrain, trees, water ring, cloud drift, bobbing |
| `TokyoTower` | Lattice tower + night PointLights / emissives |
| `Landmark` | Fuji / torii / temple builders + night lights |
| `MapleLeafSystem` | Object pool + leaf physics |
| `DayNightCycle` | Phase clock, sky/light interpolation |
| `CameraOrbit` | Drag-to-rotate camera |

## Embed (320×200)

- Canvas fills the iframe; FOV widens slightly when height &lt; 240px
- HUD is a thin top strip (phase badge + FPS); hint text hides on small viewports
- No modal panels; primary interaction is drag on the canvas

## Assets

No external textures or audio — pure procedural geometry and materials.
