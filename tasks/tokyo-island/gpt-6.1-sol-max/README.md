# Momiji — A little Tokyo

A procedural, interactive autumn diorama made with vanilla HTML, CSS, JavaScript, and **Three.js r158 (0.158.0)**. A floating island carries Tokyo Tower, Mount Fuji, a two-storey shrine, a torii gate, a tiny shopping street, and a koi pond crossed by a cedar bridge.

## Open

Open **`index.html` directly in a modern browser** with WebGL enabled. No build, package installation, backend, or server is required. A static host works too.

An internet connection is needed for the pinned Three.js browser build, loaded from [jsDelivr](https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js), and the optional Google Fonts (DM Sans and Cormorant Garamond). System fonts are used if fonts are unavailable. A connection or WebGL error displays a retry message.

## Interact

- **Drag left/right** to orbit. Vertical dragging gently adjusts elevation. Mouse wheel adjusts distance. Touch uses the same pointer controls.
- **Landmark buttons** move smoothly to views of Tokyo Tower, Mount Fuji, and the shrine. “Explore the island” cycles through these views.
- **Pause / Space** freezes the time of day; leaves, water, and the floating island continue moving.
- **Timeline** scrubs a complete day, beginning at 06:00. Playback continues after release unless paused.
- **Speed button** cycles 1× → 2× → 0.5×. **Hold Shift** for temporary 4× acceleration.
- **Arrow keys** rotate; **R** resets the view. **D** toggles FPS, leaf count, draw calls, and GPU geometry count.
- **Sound** enables a quiet, synthesized autumn ambience. Daytime birds give way to soft night tones. Audio starts only after a user gesture; there are no external audio files.
- The **information button** opens the introduction and keyboard reference. Escape closes it.

## Day and night

At the default 1× speed, `DayNightCycle` completes one full 24-hour rotation in **15 seconds**. A normalized phase advances by `deltaTime / 15`. It starts at 09:36 and loops continuously through daylight, sunset, night, and dawn.

Nine keyframes describe sky gradient colors, hemisphere light, sunlight intensity, and light color. Smoothstep interpolation produces continuous transitions with zero slopes at the keyframes. A full-screen shader draws the sky every frame; fog and the page palette follow the same interpolated atmosphere. Sun and moon positions follow opposite elliptical paths; stars fade in with darkness.

Lanterns, tower observation windows, and shrine windows use shared emissive materials. Three restrained, shadow-free point lights add local warmth. Emission and point-light power fade up from phase 0.665–0.745 at dusk and fade out from 0.18–0.235 before dawn. This avoids a sudden lighting switch.

## Scene organization

`main.js` is deliberately a classic deferred script, so the entry point also works with `file://` without ES module CORS restrictions.

- `Palette`: shared toon materials, a four-step shading ramp, water and emissive materials.
- `StaticBatch`: bakes static meshes into geometry batches grouped by material and shadow settings.
- `TokyoTower`: tapered structural legs, diagonal bracing, four arches, observation decks, and striped antenna.
- `Landmark`: procedural Fuji, shrine, and torii geometry.
- `Island`: irregular faceted terrain, paths, garden, shops, trees, pond, and local lights.
- `MapleLeafSystem`: fixed-capacity instanced particle pool.
- `Atmosphere`: drifting clouds, stars, sun, and moon.
- `DayNightCycle`: phase, palette interpolation, and lighting state.
- `CameraController`: pointer orbit, damping, inertial release, framing, and landmark transitions.
- `AmbientAudio`: reusable Web Audio wind/pad graph and short, cleaned-up bird/chime voices.
- `App`: renderer lifecycle, input, resizing, and the single animation loop.

## Particle and rendering performance

The 380 maple leaves (240 on initially small viewports) use **one `InstancedMesh`** and one custom, slightly folded maple-leaf geometry. Instance colors provide six autumn shades. Positions, fall speeds, sway, sizes, and angular velocities live in a fixed `Float32Array`; one transform object is reused to write matrices. Leaves below the island are recycled into the upper volume without creating or deleting objects.

Particles integrate downward motion, a slow crosswind, sinusoidal sway, and independent tumbling using seconds. The same `requestAnimationFrame` loop and bounded `deltaTime` drive the scene. Geometry and materials are created once. There are no per-frame geometry allocations or accumulating particle objects.

Hundreds of architectural beams and foliage pieces are merged into static material batches. Clouds share geometry and material; only the sun casts shadow maps. Leaves, clouds, stars, and local point lights do not cast shadows. Pixel ratio is capped at 1.75, and the shadow frustum tightly surrounds the island. DOM time/palette updates are throttled to 10 Hz, and projected labels to every third frame.

The loop and audio suspend when the page is hidden; elapsed hidden time is discarded on return. GPU resources, observer, animation frame, audio context, and loading timer are released on page exit. Short-lived audio voices disconnect on completion. The optional debug panel exposes FPS, draw calls, and geometry counts for observing stability.

## Camera and responsive embedding

The camera uses native pointer events and pointer capture, so drag interactions continue outside the canvas and work for mouse, pen, and touch. Horizontal deltas change orbit yaw; vertical deltas adjust a bounded elevation. Exponential damping uses delta time for consistent motion. Animation is never stopped by dragging.

A `ResizeObserver` and viewport resize handler update the renderer, camera aspect, and framing. Wide layouts offset the camera projection to make room for editorial text. Compact layouts center the island and remove the editorial blocks. The **320 × 200** layout keeps a small wordmark and information control at the top, three icon-only landmark controls at the left, reset at the right, and a compact play/time/timeline/sound strip at the bottom. No text panel covers the main scene.

## Assets

All 3D geometry is generated in code, primarily using boxes, cylinders, low-poly icosahedra, custom geometry, and triangulated shapes. The shop signs and sun halo are drawn to canvas. Icons and paper grain use inline SVG. **No external images, textures, models, or audio samples are used.** The only remote resources are Three.js and the optional fonts named above.

## Verification

Verified by opening `index.html` through `file://` in Chromium at 1440 × 900, 320 × 200, and 390 × 780. Browser checks covered the full 15-second loop, automatic night lighting and pre-dawn shutoff, animation while dragging or pausing time, landmark views, speed controls, audio, and the information dialog. Compact controls were checked for visibility, viewport bounds, and overlaps. Geometry, material, and leaf counts remained constant during the runtime check; no browser errors occurred.

To repeat manually, observe a full 15-second loop, drag during playback, scrub to night, pause, reset, and select each landmark. Resize to 320 × 200 to verify the compact controls. Toggle D to inspect FPS and the fixed particle/geometry counts. No server is needed for these checks.
