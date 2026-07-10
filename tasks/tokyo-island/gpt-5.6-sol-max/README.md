# Tokyo Sky Garden

A self-contained Three.js scene of a floating Tokyo garden. The island includes a lattice Tokyo Tower, Mount Fuji, a torii gate, a four-level pagoda, a koi pond, maple trees, clouds, and continuously recycled falling leaves.

## Run

Open `index.html` directly, or serve the repository root with a static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/tasks/tokyo-island/gpt-5.5-xhigh/`.

## Three.js

The page loads Three.js `0.160.0` from jsDelivr as the global `THREE` build. It uses `WebGLRenderer`, `MeshToonMaterial`, `MeshStandardMaterial`, soft shadow maps, ACES tone mapping, and an animated shader sky. There are no models, textures, fonts, or other external assets.

## Time and lighting

`DayNightCycle` maps elapsed time modulo 15 seconds to a full 24-hour phase. A sine-based sun height feeds smoothstep curves for daylight and twilight, which blend sky, horizon, fog, hemisphere light, and directional light colors. The moon travels opposite the sun. Landmark emissive materials and the tower point light fade on after sunset and fade out at dawn.

## Leaf pool

`MapleLeafPool` owns one fixed `InstancedMesh` and typed arrays for position, speed, phase, spin, drift, and scale. Falling leaves are reset in place when they pass the island, so the animation creates no per-frame particle objects. The pool exposes 150 leaves in a normal viewport and lowers the active instance count to 92 in compact embeds.

## Camera and responsive behavior

`CameraController` implements pointer capture for horizontal drag orbit, wheel zoom, damping, idle rotation, keyboard arrow rotation, and `R`/the reset button. Resize handling updates camera projection, renderer size, pixel ratio, and particle count. At 320 x 200, the camera widens slightly and the HUD condenses without covering the landmarks.

All animation runs through `requestAnimationFrame` with a clamped `deltaTime`.
