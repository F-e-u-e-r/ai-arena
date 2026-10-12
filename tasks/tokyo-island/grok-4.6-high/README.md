# Floating Tokyo Island

Cartoon 3D scene of a hovering autumn isle with Tokyo Tower, Mt. Fuji, a vermilion torii, a pagoda, and falling maple leaves. Day and night loop every 15 seconds.

## How to start

Open `index.html` in a browser (double-click, or drag onto a window). No build step and no backend.

A static server is optional:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

Needs WebGL and a network fetch of Three.js from jsDelivr (CDN).

## Three.js version and how it is loaded

- **three@0.160.1** via classic `<script>` (UMD global `THREE`)
- CDN: `https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.min.js`
- OrbitControls is **not** used. Yaw/pitch orbit is implemented in `js/CameraRig.js` so the page still works from `file://` without ES modules.

All materials are `MeshToonMaterial` with a 4-step `DataTexture` gradient. Leaf silhouettes are a canvas alpha map generated at runtime. No external image textures.

## Day / night cycle (15 seconds)

`DayNightCycle` advances `time` with `requestAnimationFrame` delta (capped at 50 ms). Phase is:

```
phase = (time / 15) % 1
```

Keyframes (smoothstep between neighbors, last key copies the first so wrap-around is continuous):

| phase | name | what happens |
|------:|------|----------------|
| 0.00 | Day | high sun, bright hemi/dir lights |
| 0.18 | Day | warmer afternoon |
| 0.28 | Dusk | sun on horizon, sky orange/violet |
| 0.40 | Dusk | lamps already full |
| 0.50–0.68 | Night | moon up, stars visible, low ambient |
| 0.80 | Dawn | pink horizon |
| 0.90 | Dawn | lamps fading, sun rising |
| 1.00 | Day | wrap |

Sun elevation is `cos(phase * 2π)` (noon at 0, dusk at 0.25, midnight at 0.5, dawn at 0.75). The moon sits opposite. Fog, sky-dome uniforms, directional color/intensity, hemisphere, ambient, and tone-mapping exposure all lerp on the same phase.

**Lamps** (PointLights + emissive toon materials on the tower, torii, and pagoda):

```
0            0.22 ramp-on 0.32          0.78 ramp-off 0.88        1
|-----------|--------------------------|-------------------------|
 day, off        dusk → night, on            dawn, off
```

Pause with Space / ⏸. Speed 1× / 2× / 4× with the speed button or keys `1` `2` `4`. `[` / `]` skip 1.5 s.

## Maple leaves and performance

`MapleLeafSystem` is one `InstancedMesh` (about 200 leaves, 110 on tiny viewports). Each slot holds a plain state struct (`x,y,z`, velocity, euler spin, sway phase). Nothing is allocated in the frame loop.

- Gravity + wind + two sine terms for left/right flutter
- Independent spin on X/Y/Z
- When `y < -8` or the leaf leaves a 22-unit box, **the same slot is respawned** above the island (object pool)

Other budget choices: pixel ratio capped (2, or 1.25 in the 320×200 embed), shadows off under 320×240 CSS pixels, leaf `depthWrite` off, frustum culling disabled only on the leaf mesh so recycled instances never pop.

## Camera orbit

`CameraRig` listens for pointer/touch on the canvas (HUD buttons are ignored). Horizontal drag changes **yaw**; a smaller vertical drag changes **pitch** (clamped). Wheel dollies radius. After release, residual velocity damps out. The animation loop never stops while dragging.

Camera is placed from the same yaw/pitch/radius every frame:

```
pos = target + (sin(yaw)·cos(pitch), sin(pitch), cos(yaw)·cos(pitch)) * radius
camera.lookAt(target)
```

On short viewports (height ≤ 220 or width ≤ 360) FOV widens to 58° and radius increases so the island stays readable in a 320×200, 16:10 iframe.

## HUD (embed-safe)

Target minimum embed: **320×200**. Title hides. Four 26 px icon buttons stay in the top-right and do not overlap. Phase chip is a small pill at bottom-left. Help/FPS lives in a drawer behind ℹ. The 2 px cycle bar does not cover the scene.

## Keyboard

| key | action |
|-----|--------|
| Space | pause / resume cycle |
| 1 / 2 / 4 | cycle speed |
| [ / ] | skip time |
| M | ambient audio (Web Audio, starts on gesture) |
| I | help drawer |

## Audio

`Ambience` builds looping brown-ish noise + a night cricket layer with the Web Audio API. It only constructs an `AudioContext` after the ♪ button (or `M`) because browsers block autoplay. Filter cutoff and cricket gain follow the day/night lamp factor. No audio files.

## Layout of the code

| file | role |
|------|------|
| `index.html` | shell, CDN Three.js, HUD |
| `style.css` | fullscreen canvas + compact HUD |
| `main.js` | renderer, loop (`rAF` + `deltaTime`), wiring |
| `js/utils.js` | toon gradient, maple alpha, math |
| `js/Island.js` | floating terrain, trees, pond |
| `js/TokyoTower.js` | striped tower + deck lights |
| `js/Landmark.js` | Fuji, torii, pagoda, lanterns |
| `js/MapleLeafSystem.js` | instanced leaf pool |
| `js/Decor.js` | sky dome, sun/moon, stars, clouds, far peaks |
| `js/DayNightCycle.js` | 15 s lighting state machine |
| `js/CameraRig.js` | drag orbit |
| `js/Ambience.js` | procedural wind / night |

The island group bobs on Y (and a tiny tilt). Tower, landmarks, and trees are children, so they float with it.
