# Tokyo, adrift. — little worlds

A procedural, interactive autumn diorama: Tokyo Tower, Mount Fuji, a three-story pagoda, three torii gates, a tea house, stone lanterns, a bridge, and a river that falls into the clouds. All architecture, terrain, foliage, and particles are real Three.js geometry.

## Start

Open **index.html** directly in a modern browser with WebGL enabled. No build process, package installation, backend, or server is required. The page also works on ordinary static hosting and inside an iframe. An internet connection is required for the CDN library; optional Google Fonts fall back to Georgia and the system sans-serif font.

The four project files are `index.html`, `style.css`, `main.js`, and `README.md`.

## Dependencies and assets

- **Three.js 0.160.0 (r160)**, loaded as a classic deferred script from [jsDelivr](https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js). Using a global build lets the application run from a `file://` URL without module/CORS configuration. [Three.js documentation](https://threejs.org/docs/).
- **DM Sans** and **Instrument Serif**, served by [Google Fonts](https://fonts.google.com/). They are optional visual enhancements.
- No external images, textures, models, icon packages, or audio recordings. Icons are inline SVG. The subtle paper grain is an inline SVG filter. The glow texture is generated on a small canvas; the toon gradient is a four-byte `DataTexture`. Audio is synthesized locally.

## Controls

| Control                                      | Action                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Drag horizontally / swipe                    | Orbit the island with gentle inertia                                       |
| Left / right arrows                          | Rotate the camera                                                          |
| Mouse wheel / trackpad scroll over the scene | Zoom, within safe framing limits                                           |
| Timeline                                     | Scrub the day; release to resume its previous playback state               |
| Pause button / **Space**                     | Pause or resume the **day–night cycle**; the island and leaves keep moving |
| **1×** button / **S**                        | Cycle through 1×, 2×, and 4× time                                          |
| Hold **Shift**                               | Temporarily multiply the selected time speed by four                       |
| Sound button / **M**                         | Toggle synthesized wind and soft pentatonic wind chimes                    |
| Reset button / **R**                         | Restore the original camera angle and zoom                                 |
| Info button / “Meet your little world”       | Open an accessible native dialog with landmarks and controls               |
| **D**                                        | Toggle FPS, leaf count, draw calls, triangles, and GPU resource counts     |

Audio is off by default and starts only after a user gesture. The timeline's arrow-key behavior remains native; shortcuts do not intercept form controls or the open dialog.

## Architecture

`main.js` is a dependency-free, classic-script IIFE with these separate classes:

- `Palette`: shared matte/toon materials and animated emissive values.
- `Island`: faceted terrain, paths, trees, river, waterfall, bridge, small scenery, and buoyant motion.
- `TokyoTower`: tapered four-leg lattice, two observation decks, striped antenna, and nighttime illumination.
- `Landmark`: procedural Fuji, pagoda, torii gates, house, and lantern builders.
- `MapleLeafSystem`: pooled instanced airborne and ground leaves.
- `Atmosphere`: gently drifting cloud clusters, sun, moon, stars, and soft lamp glows.
- `DayNightCycle`: periodic light, atmosphere, palette, and time-control state.
- `OrbitController`: pointer capture, damped horizontal orbit, keyboard rotation, and bounded zoom.
- `AmbientAudio`: reusable Web Audio wind loop and automatically disconnected chime voices.
- `App`: renderer, UI events, resize, animation scheduling, diagnostics, and cleanup.

## Day–night cycle

The default duration is exactly **15 foreground seconds** per complete cycle. A phase in `[0, 1)` advances with `phase = (phase + deltaTime * speed / 15) % 1`. The initial phase is an autumn afternoon, then the scene passes through dusk, night, dawn, and day. The speed controls intentionally shorten this duration; pause and timeline scrubbing intentionally suspend progression.

Nine cyclic palette knots define sky gradient colors, text colors, fog, cloud color, hemisphere intensity, directional light color/intensity, and star opacity. Adjacent states interpolate with cubic smoothstep (`t²(3 − 2t)`), and the first and last palette states match. This gives continuous values and smooth boundaries without a day/night color switch. The sun and opposing moon follow a continuous trigonometric orbit. Warm fill light preserves the readability of the miniature during the night.

Tower, observation windows, pagoda windows, and lantern materials fade on between phase **0.385 and 0.48** as dusk begins. They fade off between **0.835 and 0.89**, before dawn. The same smooth envelope controls two warm point lights and inexpensive glow sprites. Stars emerge with darkness. Wind becomes softer and lower-filtered at night, and the chime melody shifts down an octave.

The animation uses `requestAnimationFrame` and seconds-based `deltaTime`. Particle and scene physics clamp their delta to 50 ms after a stalled frame, while the day–night clock receives the full foreground delta so slower devices preserve the 15-second period. Hidden tabs suspend rendering and audio; visibility restores a fresh clock baseline, preventing a large jump. Time spent in a suspended tab is intentionally excluded.

## Particles and performance

- **420 airborne maple leaves** share one `InstancedMesh`, one custom serrated maple geometry, and one two-sided toon material. **190 settled leaves** share a second static instanced mesh.
- Fixed-size typed arrays store position, terminal velocity, phase, scale, and rotation. Leaves below the scene or downwind are returned to the top by overwriting the same pool slot.
- Time-scaled fall velocity, coherent lateral breeze, per-particle sine flutter, and independent rotation produce drifting, tumbling leaves. One reusable transform object updates instance matrices; no per-frame particle object allocation occurs.
- Static buildings, tree canopies, lattice beams, grass, paths, and terrain are baked and merged by material and shadow flags at initialization. The entire island then animates through one parent transform. Cloud components are similarly merged per cluster.
- Fourteen waterfall highlights use instancing, and the waterfall surface updates a fixed vertex buffer in place.
- Geometry/material sharing, a capped device pixel ratio (1.75 desktop / 1.5 small screens), low-poly forms, a single shadow-casting directional light, and bounded particle counts keep resource use predictable. Point lights do not allocate shadow maps. There is no full-screen bloom pass.
- Palette/HUD updates are limited to 24 Hz; annotations and debug statistics update less frequently. Rendering continues while dragging and while the time cycle is paused.
- RAF, event listeners, audio nodes, geometries, materials, textures, shadow resources, and the renderer are released when leaving the page. WebGL context loss produces a visible retry state. Browser back/forward-cache restores resume the existing scene.
- Read-only profiling is available in the console via `littleWorld.stats()`; compare geometry and texture counts across repeated cycles to check resource stability.

## Camera and responsive embedding

The orthographic camera keeps the toy-like illustration proportions. A small custom controller implements pointer capture for mouse, pen, and touch, frame-rate-independent interpolation, damped release velocity, and clamped zoom. The scene continues its independent animation during every pointer interaction. Reset returns to a composed three-quarter view.

Resize updates both the renderer and camera frustum. Wide screens reserve space for the editorial title; portrait screens fit the island by width. At **320 × 200**, the large title, coordinates, decorative annotation, and auxiliary text disappear. A compact title and sound/help controls remain at the top, with pause, scrubbable timeline, speed, and reset along the bottom. Controls have separate hit areas; the scene remains draggable in the middle. The dialog scrolls within the viewport and closes with its button or Escape.

The scene respects `prefers-reduced-motion` by reducing floating amplitude and leaf speed while keeping the required animation. Buttons have accessible names, visible keyboard focus, and state attributes. No audio autoplays.

## Implementation notes

The miniature deliberately combines iconic places into an imaginary island; it is not a geographic map. Lighting uses `WebGLRenderer`, ACES filmic tone mapping, sRGB output, hemisphere/key/fill lights, soft shadow mapping, `MeshStandardMaterial`, and stepped `MeshToonMaterial` foliage. All random scenery uses a seeded generator for a consistent composition on reload.
