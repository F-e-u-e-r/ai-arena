# Kōyō — A little Tokyo, a world away

A procedural, interactive Three.js diorama of an autumn Tokyo floating above the clouds. Native HTML, CSS, and JavaScript; no build step, backend, models, or image assets.

## Open

Open **index.html** directly in a current browser with WebGL enabled. The page also works on any static file host. An internet connection is required to load Three.js and the optional Google Fonts; system serif and sans-serif fonts provide fallbacks. No server is needed for local viewing.

The only JavaScript dependency is **Three.js 0.160.1**, loaded as a deferred classic script from:

`https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.min.js`

A classic script is intentional: local `file://` viewing requires neither module imports nor model/texture fetches. If the CDN cannot load, or WebGL cannot initialize, an explanatory message appears.

## The world

- A beveled grassy island with a triangulated, individually colored rock underside, hanging roots, and a slow vertical float.
- Tokyo Tower with four lattice faces, two observation decks, railings, striped antenna, and illuminated windows.
- A snowcapped Mount Fuji with a jagged snow line; a three-story pagoda with curved eaves; a red torii gate and shimenawa rope.
- Seventeen autumn trees with swaying crowns, garden paths, stone lanterns, a koi pond, ripples, and an arched wooden bridge.
- 280 rotating maple leaves, 110 fallen leaves, drifting clouds, birds, orbiting sun and moon, and night stars.
- Warm physically lit materials, soft shadows, ACES tone mapping, and a coordinated UI palette that changes with the sky.

All geometry, colors, and artwork are generated in **main.js**. There are no external textures. The subtle page grain is an inline SVG turbulence filter in **style.css**. DM Sans and Playfair Display are requested from Google Fonts.

## Interact

| Control | Action |
| --- | --- |
| Drag horizontally | Orbit the island continuously |
| Drag vertically | Gently adjust the viewing elevation within safe limits |
| Explore the island | Start/stop a slow scenic orbit; dragging stops the tour |
| `+` landmark buttons | Read about the tower, Fuji, or autumn shrine |
| Pause button / Space | Pause/resume the time cycle; leaves and island keep moving |
| Colored time slider | Scrub to any point in the day; auto time holds while dragging |
| 1× button / F | Cycle through 1×, 2×, and 4× time speeds |
| Left / Right arrows | Rotate the camera with the keyboard |
| Speaker | Enable/mute quiet, procedurally generated ambient audio |
| i / Escape | Open/close the about dialog |

Shortcuts apply when a button, link, or input is not focused, preserving native keyboard operation of those controls. The about dialog has focus management and closes on Escape or a backdrop click. Audio is off by default and only starts after a user gesture; browsers/iframes may restrict Web Audio.

Add **?debug** to the URL for a live FPS, leaf-count, and draw-call overlay.

## Day–night timing

`DayNightCycle` owns a normalized phase in `[0,1)`. Each animation frame advances it by:

```js
phase = (phase + realDelta * speed / 15) % 1;
```

At 1×, one whole day takes **15 seconds of active, unpaused time**. The clock starts at 14:24. Phase 0 corresponds to noon, .25 to sunset, .5 to midnight, and .75 to sunrise. A sequence of color/light keyframes passes through warm day, peach dusk, blue night, and rosy dawn. Cubic smoothstep interpolation blends sky, fog, hemisphere color/intensity, and directional color/intensity. The first and last keyframes match, keeping the wrap seamless. The CSS palette follows the same cycle, at a lower update rate.

Lamp intensity is the product of two smooth transitions: fade on between phase .18 and .34, fade off between .65 and .735, before dawn. This controls tower and pagoda window emission, lantern emission, and two local point lights. Tower antenna emission pulses gently at night. Sun and moon move on opposing trigonometric paths; stars fade in with the night lighting.

`requestAnimationFrame` supplies delta time. The day cycle uses elapsed time without a frame-rate-dependent increment, while particle/camera physics clamp their delta to 50 ms to avoid large jumps after a stall. Hidden tabs stop scheduling frames and suspend audio; returning resets the timestamp and resumes the simulation without a catch-up jump.

## Architecture and performance

**main.js** is organized around `Application`, `Island`, `TokyoTower`, `Landmark` (with Fuji, pagoda, torii, and garden subclasses), `MapleLeafSystem`, `Atmosphere`, `DayNightCycle`, `CameraController`, and `AmbientSound`.

- **Pooled leaves:** one `InstancedMesh`, one custom seven-lobed leaf geometry, one double-sided material, and one fixed `Float32Array` for all particle state. Each particle has its own fall speed, wind phase, scale, and tumble. A reused `Object3D` writes instance matrices. Leaves leaving the lower/side bounds reset in place above the world. The particle loop creates no new objects, meshes, materials, or buffers.
- **Static batching:** a material-based geometry merge bakes the many trusses and architectural details into fewer draws at initialization. Tree groups remain independently animated; each tree is also batched internally. Base geometries and materials are cached and reused. Fallen leaves use a separate static instance buffer.
- **Bounded GPU work:** device pixel ratio is capped at 1.8; only one directional light casts shadows, with one fixed 2048² shadow map. Leaves, clouds, and stars do not cast shadows. Local lights do not allocate shadow maps.
- **Stable operation:** scene objects are created once, particle populations stay fixed, and frame updates never append scene objects or event listeners. Marker projection runs every other frame; UI updates are throttled. A lost WebGL context pauses rendering and restoration restarts the animation. The debug overlay is optional.

## Camera and responsive embeds

`CameraController` implements damped orbiting with Pointer Events and pointer capture, supporting mouse, pen, and touch. Horizontal movement changes azimuth; vertical movement adjusts a clamped elevation. Exponential damping is calculated from delta time, so dragging never suspends the animation loop. Orbiting has no hard horizontal limit.

An orthographic camera keeps the diorama's miniature appearance. Resize updates renderer dimensions, camera bounds, and view offset. Desktop framing reserves room for the editorial introduction; portrait framing fits the island's width. Compact embeds use smaller text, an abbreviated introduction, and a **40 px** control bar at the **320 × 200** target size. Coordinates, secondary captions, and the drag hint hide when space is limited. The pause button, time slider, speed button, sound control, and about control stay available. Landmark buttons are projected from world positions and hidden outside the usable viewing area. Temporary detail/about overlays can be dismissed.

## Verification

JavaScript passes `node --check main.js`. Scene geometry, time/particle logic, responsive breakpoints, and DOM bindings were reviewed. Browser automation was attempted directly against the file URL without starting a server, but this execution environment prevents Chrome from launching; visual and live GPU verification could not be completed here.

To inspect manually: open the page, let it run for at least 30 seconds, confirm two full lighting cycles, drag during sunset, pause and scrub to night, test the landmark and sound controls, and resize to 320 × 200. Use `?debug` to watch frame rate and the constant leaf count during extended operation.
