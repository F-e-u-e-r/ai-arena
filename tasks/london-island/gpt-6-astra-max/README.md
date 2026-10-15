# Little Worlds — A Little London

A handcrafted, interactive London diorama made with native HTML, CSS, and Three.js. All architecture, terrain, vegetation, clouds, and props are procedural geometry. All particle and clock textures are generated with the Canvas API. There are no model downloads, external image textures, frameworks, build tools, or backend services.

## Run

Open **index.html** directly in a modern browser with WebGL enabled. A normal static hosting service also works; a local server is not necessary. Internet access is required to load the CDN dependency and optional fonts. No server was run during implementation.

- **Three.js 0.160.0 (r160)**: classic browser build loaded from `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js`, with the same version on cdnjs as a fallback. Classic scripts permit direct `file://` use without module CORS restrictions.
- Optional fonts: **DM Sans** and **Playfair Display**, loaded from Google Fonts. System sans-serif and Georgia fallbacks are provided.
- No external image textures, audio recordings, or 3D models are used. No API keys are needed.

## Explore

| Control | Action |
| --- | --- |
| Drag horizontally / touch and drag | Orbit the island; animations continue |
| Drag vertically | Adjust elevation within comfortable limits |
| Mouse wheel, + / − buttons or keys | Zoom within safe bounds |
| Reset button / R | Return to the opening perspective |
| Spring / Summer / Autumn / Winter; keys 1–4 | Smoothly select a season and disable automatic seasonal advance |
| Auto cycle switch / A | Resume or pause automatic season changes |
| Time-of-day icon / D | Smoothly advance to the next daylight, sunset, night, or dawn moment |
| Pause button / Space | Pause just the day–night clock; the island, weather, and wheel keep moving |
| Left / right arrow keys | Rotate the view without a pointer |
| Speaker button / M | Enable or mute synthesized wind and birdsong |
| Landmark labels | Read a small landmark story |
| Information button | Open instructions; Escape closes the dialog |
| F | Toggle FPS, active particle count, and draw-call diagnostics |

The weather and temperature are illustrative, not a live forecast. Audio is off by default and created only after a user gesture.

## Time, seasons, and lighting

`DayNightCycle` advances a normalized phase by **deltaTime / 15**, completing a full dawn → day → dusk → night → dawn cycle in **15 seconds**. It opens in daylight. The clock-face hands, sun, and moon follow this phase. Color keyframes use cubic smoothstep interpolation; sky color, fog, hemisphere lighting, directional lighting, and the UI palette all blend continuously. Night stays legible with cool fill light.

A bounded intensity envelope turns on clock-face emission, observation-wheel illumination, building windows, street lamps, and three landmark point lights as dusk begins. It fades them out before dawn. Lights and materials are reused throughout the cycle. A manual time jump blends forward over 0.85 seconds. Pausing time does not pause other animation.

`WeatherSystem` changes season automatically every **24 seconds**, giving a **96-second** four-season loop. Every change interpolates four normalized weights over **3 seconds**. Interrupted changes start from the current blended weights, preventing jumps. These same weights control foliage, blossoms, grass, water, sky tint, fog, rooftop snow, particle density, and audio ambience:

- **Spring:** pink blossoms, green foliage, humid distance fog, and 18 slowly drifting, feathered mist sprites.
- **Summer:** stronger warm sunlight, saturated greenery, clear air, and bright blue water.
- **Autumn:** amber foliage and up to 230 independently tumbling, swaying maple leaves.
- **Winter:** pale terrain and foliage, snow on architectural ledges, cold mist, and up to 1,250 falling snowflakes.

The animation loop uses `requestAnimationFrame` and elapsed seconds. Time of day uses actual elapsed visible time, while physics steps are capped at 50 ms to prevent unstable motion after a slow frame. When the document is hidden, animation and audio suspend; returning resets the frame timestamp so there is no large catch-up step.

## Architecture and performance

All application code is in `main.js`, organized as independent classes:

- `ArtKit`: cached primitive geometry and materials, generated textures, and static geometry batching.
- `Island`: faceted floating terrain, animated river and boat, terraces, bus, telephone box, trees, and street details.
- `BigBen`, `LondonEye`, `TowerBridge`: recognizable architecture; clock hands and wheel are separate animated subtrees. Wheel pods counter-rotate to remain upright.
- `Atmosphere`: drifting clouds and fog, sun, moon, stars, birds, and a soft floating shadow.
- `WeatherSystem`: seasonal state, color blending, and fixed particle pools.
- `DayNightCycle`: exact cycle timing, light envelopes, and palette interpolation.
- `OrbitController`: pointer capture, damped camera motion, zoom, and framing.
- `AmbientAudio`: a reusable filtered noise source and one reusable oscillator; no audio assets.
- `LondonApp`: rendering, UI, resize, visibility, lifecycle, and cleanup.

**Particle recycling:** autumn uses one `InstancedMesh` with fixed typed-array state and one reusable transform object. Winter uses one `Points` draw with a fixed position buffer. Particles wrap back above the island rather than being allocated or removed. Draw counts and opacity blend with the weather. Small screens allocate reduced pools of 110 leaves and 650 snowflakes. Inactive particle systems skip their physics and GPU uploads.

**Rendering budget:** static architectural meshes are merged by material, while moving parts remain separate. Primitive geometries and materials are shared. Water movement runs in the vertex shader; its wave uniform is updated without rewriting geometry, and 45 animated ripple marks share one instanced draw. Shadows use one directional map (2048 on desktop, 1024 on small screens); point lights do not cast shadows. Device pixel ratio is capped at 1.75. UI updates are throttled independently of rendering. All pools, lights, scene objects, and texture counts remain bounded across season changes.

Resize uses a `ResizeObserver` on the scene container. Pointer, UI, and lifecycle listeners share an `AbortController`. On permanent page exit, RAF, timers, observer, audio, shadow maps, geometries, textures, materials, and the renderer are disposed. WebGL context loss is handled with a status message and automatic resumption after restoration.

For embedding diagnostics, `window.littleLondon.getState()` returns seasonal weights, cycle state, lighting level, particle counts, FPS, draw calls, triangles, GPU resource counts, and camera state. `setSeason(0..3)` and `resetView()` are also available.

## Responsive embedding

The entire experience fits its viewport without page scrolling. An orthographic camera preserves the miniature look and resizes its frustum to keep the island framed. At **320 × 200**, the introductory copy, labels, footer, and secondary status details disappear. The four season buttons, automatic-season switch, time shortcut, zoom/reset controls, and information button remain usable without overlap. The sound control and time-pause control move to keyboard access at the smallest size; the primary scene interaction remains available by touch or pointer. The information dialog scrolls inside the viewport when needed.

At larger sizes, the editorial introduction, live atmospheric description, landmark labels, compass, and more complete time controls appear. Semantic buttons, visible focus outlines, touch pointer support, accessible pressed/switch states, and a native modal dialog provide keyboard and assistive-technology access.

## Validation

JavaScript syntax, CSS parsing, SVG references, and UI selector references were checked. The production timing and particle algorithms passed a 960-second simulation with rendering objects stubbed: all four seasons advanced, normalized weights stayed continuous across interrupted transitions, particle arrays remained fixed and finite, and the day cycle completed in 15 seconds. Camera frustum and zoom-bound checks passed for desktop, portrait, and 320 × 200 dimensions.

The environment's macOS sandbox blocked Chromium from launching, so a browser screenshot and live GPU performance measurements could not be obtained. The simulation verifies application logic, not visual rendering or device-specific frame rates.

## Sources

- [Three.js r160](https://github.com/mrdoob/three.js/tree/r160), MIT license.
- [Three.js documentation](https://threejs.org/docs/) for the renderer, materials, instanced geometry, and buffer geometry APIs.
- [DM Sans](https://fonts.google.com/specimen/DM+Sans) and [Playfair Display](https://fonts.google.com/specimen/Playfair+Display), available under the SIL Open Font License.

The miniature is an artistic interpretation, not a geographically accurate model of London.
