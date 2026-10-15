# Tokyo Sky Garden

A small, procedural autumn world built with native HTML, CSS, and Three.js. A floating garden brings together a lattice Tokyo Tower, Mount Fuji, a three-tier pagoda, a torii, maple trees, stone lanterns, a koi pond, and an arched bridge.

## Open the garden

Open **index.html** directly in a modern browser with WebGL enabled. There is no build step, package installation, backend, or server requirement. The four deliverable files must stay together.

An internet connection is needed for **Three.js 0.160.0**, loaded as a classic deferred script from:

`https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js`

Classic scripts allow direct `file://` use without module-fetch restrictions. Fonts (DM Sans, DM Mono, and Cormorant Garamond) come from Google Fonts, with local sans-serif, monospace, and Georgia fallbacks. If Three.js cannot load or WebGL is unavailable, the page displays an explanatory fallback.

## Explore

- **Drag horizontally** with a mouse, pen, or touch to rotate the camera. Arrow keys also rotate it.
- **Scroll** or press **+ / −** to zoom within a comfortable range.
- Select **Day, Dusk, Night, or Dawn** to jump to that point of the cycle.
- **Pause / Space** holds the light in place. The island, clouds, and leaves continue moving.
- **1× / F** cycles through 1×, 2×, and 4× time speeds. The default full cycle is exactly **15 seconds** of visible animation time; faster modes take 7.5 or 3.75 seconds.
- **Reset / R** restores the initial camera angle and zoom.
- **Take a slow look** starts a gentle full orbit. Dragging immediately takes over.
- The **maple badge** toggles airborne leaves.
- **Sound / M** enables a quiet, locally synthesized breeze and occasional chimes. Audio is off until a user gesture; it changes timbre and register at night.
- **Info** opens the controls guide. **D** toggles FPS, leaf count, draw calls, geometry count, and cycle diagnostics.

## Architecture

`main.js` is organized into `Island`, `TokyoTower`, `Landmark`, `MapleLeafSystem`, `Sky`, `DayNightCycle`, `CameraOrbit`, and `AmbientAudio` classes, followed by UI and lifecycle wiring. All artwork is generated from geometry in code. There are **no external textures, models, photographs, or audio files**.

The renderer is `THREE.WebGLRenderer`, with sRGB output, ACES filmic tone mapping, antialiasing, and a single 1024 × 1024 soft directional shadow map. Low-poly, flat-shaded `MeshStandardMaterial` surfaces give the world its miniature, cartoon character. Hemisphere and fill lighting preserve readable shaded faces. Static objects receive and cast shadows; lanterns and observation decks emit warm light at dusk.

## Day and night

The normalized phase is advanced by `deltaTime * speed / 15`, modulo 1. Phase 0 is noon, .25 is dusk, .5 is midnight, and .75 is dawn. A set of palette anchors covers daylight, golden hour, dusk, blue night, and sunrise. Smoothstep interpolation in Three.js linear color space smoothly blends sky, fog, light colors, intensities, and surrounding typography.

A separate, interpolated night factor begins rising at dusk. It drives shared emissive window, lantern, and structural-strip materials, plus two small point lights. It fades to zero before dawn. The sun and moon follow opposing circular trajectories; stars become visible as night falls. The atmospheric fog also changes with the light.

The single `requestAnimationFrame` loop calculates real delta time for the cycle. Physics delta is capped at 50 ms so a dropped frame does not teleport leaves. The day phase wraps modulo one and ripple phases also wrap, keeping their state bounded. The document visibility handler suspends rendering and audio in background tabs, then resumes without accumulating a large jump.

## Leaves and performance

- **180 recognizable maple-shaped leaves** occupy one `InstancedMesh`, with per-instance autumn colors. This is one draw call for the entire leaf system.
- A fixed `Float32Array` holds particle positions, speed, size, and independent oscillation phases. A reusable dummy transform writes instance matrices without allocating per-frame vectors or meshes.
- Leaves fall with delta-time integration, gentle lateral wind, sinusoidal sway, and independent tumbling. A leaf below the island or outside the wind boundary is reset **in its existing slot** at the top of the volume.
- Static scenery is baked into geometry batches by shared material, bringing hundreds of architectural details down to a modest set of draw calls. Shared primitive geometries and cached materials avoid duplicate resources.
- Device pixel ratio is capped at 1.75. Clouds, ripples, and rock fragments reuse fixed meshes. No objects are added during the render loop.
- Synthesized chimes disconnect and release their audio nodes after each note. Hidden tabs suspend rendering and audio. Page teardown disposes geometries, materials, the renderer, observers, timers, and audio resources. WebGL context loss and restoration are handled.
- Press **D**, or inspect the read-only `window.garden.stats`, to observe resource counts while the scene runs.

## Camera and responsive embeds

A custom horizontal orbit controller uses pointer capture, so dragging remains continuous when the pointer crosses the canvas edge. It changes the camera's azimuth around the island and exponentially damps toward the target, using delta time. Animation is independent of the gesture, so the world continues moving throughout a drag. Mouse-wheel zoom is bounded; reset returns to the original view.

An orthographic camera keeps the diorama's miniature proportions. A `ResizeObserver` recalculates its frustum using both the scene's height and width, including **320 × 200** iframe previews. CSS uses both width and height breakpoints: in short previews, descriptive text is removed, time-of-day buttons become icons, and secondary utilities collapse. The island, orbit interaction, pause, phase selection, speed, leaf toggle, and information button stay available. Portrait layouts place the garden below the compact title. There is no horizontal scrolling.

## Files

- `index.html` — semantic layout, SVG control icons, CDN loader, and accessible information dialog.
- `style.css` — editorial styling, palette variables, responsive layouts, and compact embed controls.
- `main.js` — procedural modeling, rendering, animation, pooling, input, audio, and cleanup.
- `README.md` — setup and implementation notes.
