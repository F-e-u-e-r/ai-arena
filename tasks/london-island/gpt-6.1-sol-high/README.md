# Little London

A floating, gently animated London diorama built with native HTML, CSS, and Three.js. Big Ben looks over the London Eye, Tower Bridge, a turquoise Thames, a small Westminster Palace, pastel townhouses, gardens, a telephone box, and a moving double-decker bus.

## Open

Open **index.html** directly in a modern browser with WebGL enabled. No build step, package installation, backend, or server is required. An internet connection is needed to load the CDN library. A normal static host also works.

The entry point uses ordered, deferred classic scripts rather than ES modules, so opening the page through `file://` does not require local module permissions.

## Dependencies and assets

- **Three.js 0.160.0**, pinned CDN script: `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js`.
- `THREE.WebGLRenderer`, orthographic camera, `MeshStandardMaterial`, ACES filmic tone mapping, sRGB output, hemisphere/fill lighting, and soft directional shadows.
- **DM Sans** and **Libre Caslon Display**, loaded from Google Fonts; local sans-serif and Georgia fallbacks are provided.
- All models, icons, particles, and textures are made in the source. Clock faces, mist, snow sprites, the sun halo, and the floating contact shadow are drawn with Canvas 2D. The subtle grain is an embedded SVG filter. **No external models, image textures, or audio recordings are used.**

## Time and climate

`DayNightCycle` completes one continuous solar revolution every **15 active seconds**. It starts near midday. Solar elevation drives smooth daytime, golden-hour, night, and dawn blends across the CSS sky gradient, fog, hemisphere light, directional light, and stars. The sun and opposing moon follow continuous orbital positions. Big Ben's four clock faces display the same accelerated time as the interface.

Landmark windows, the clock faces, London Eye rim lamps, bridge turrets, and street lamps share emissive materials. Two local point lights add warmth. Lights fade on as dusk begins and fade out ahead of sunrise. Night lighting retains enough fill to keep the island readable.

`SeasonCycle` starts in **summer**, advances every **24 active seconds**, and loops spring → summer → autumn → winter. One four-season lap takes 96 seconds. Selecting a season restarts its 24-second stay. Automatic progression can be disabled independently of day/night.

Four normalized weights approach the selected season using `1 − exp(−0.95 × deltaTime)`. About 95% of the transition completes in 3.2 seconds. Every seasonal property uses these same weights: ground and tree color, sky palette, fog density, leaf/snow opacity, local spring mist, and snow caps. A second selection blends from the current state without a discontinuity.

- **Spring:** a cool, humid palette, denser distance fog, and twelve slowly drifting feathered mist sprites.
- **Summer:** clear air, warm sunlight, saturated greenery, and small animated river highlights.
- **Autumn:** amber trees and 230 independently tumbling, swaying maple leaves.
- **Winter:** a cool sky, pale ground, snow on roofs and trees, and 720 drifting snowflakes.

Pause freezes the seasonal clock and solar cycle. Floating, weather, the London Eye, and camera interaction remain alive. Manual season transitions still work while paused. Simulation motion uses a capped delta; the day and season clocks use active wall-clock delta, so a slow frame does not extend the 15-second day. Hidden tabs stop `requestAnimationFrame` and reset the timestamp on return rather than trying to catch up.

## Controls

| Input | Action |
| --- | --- |
| Horizontal mouse drag / one-finger drag | Orbit the island with smooth damping |
| Left / right arrow, with scene focused | Rotate the view |
| Season buttons / `1`–`4` | Choose spring, summer, autumn, winter |
| Time chip / `D` | Jump to the next quarter of the solar cycle |
| Automatic-season switch / `A` | Toggle automatic seasons |
| Pause / `Space` | Pause or resume time |
| Reset button / `R` | Return to the original camera angle |
| Speaker button | Enable quiet, procedurally generated wind ambience |
| Information button | Open controls and project information |
| `F` | Toggle FPS, render-call, particle, and geometry statistics |

Audio starts only after a user gesture, fades smoothly, and suspends when the tab is hidden. All sound is produced with the Web Audio API.

## Camera and responsive embeds

`CameraController` uses Pointer Events and pointer capture for both touch and mouse. Horizontal movement changes a target yaw; exponential damping smooths the camera while `requestAnimationFrame` continues. Elevation and camera distance are fixed to keep the miniature composition readable. No OrbitControls dependency is required.

A `ResizeObserver` and the window resize event update the renderer, orthographic frustum, and composition offset. Wider layouts leave space for the editorial introduction and forecast. Smaller layouts remove these secondary panels. At **320 × 200**, the header reduces to the brand and time chip; season selection, auto progression, and pause remain available in a compact bottom dock. Labels retain accessible names when their visible text is hidden. The scene remains draggable between overlays. Modals scroll within the viewport.

## Structure and performance

Everything lives in the requested four files. `main.js` is organized into `Island`, `BigBen`, `LondonEye`, `TowerBridge`, `WeatherSystem`, `SeasonCycle`, `DayNightCycle`, `CameraController`, `AmbientSound`, and `App` classes.

- Static architecture is merged by material during initialization. Moving wheel components, cabins, clock hands, bus, river highlights, and rocks stay independent.
- Unit geometry and a material cache reuse resources across buildings and vegetation. Seasonal materials are recolored in place.
- Leaves use a fixed **InstancedMesh** pool. Snow uses one **Points** object with a fixed typed position buffer. Both wrap above the island when they fall out of bounds. Neither creates or destroys objects during normal animation.
- Weather systems become invisible below a small opacity threshold and skip their particle updates. Particle attributes and instance matrices use dynamic-buffer usage.
- Shadows use one 2048² map. Pixel ratio is capped at 2, or 1.5 in small cards. No postprocessing passes or model downloads are required.
- DOM updates are throttled. Render statistics are optional. Resizing and season changes do not recreate scene resources.
- WebGL context loss pauses rendering and displays recovery status. Scene geometries, materials, generated textures, renderer, and audio context are disposed when leaving the page. Hidden-tab suspension avoids unnecessary GPU/audio work.
- Reduced-motion preferences reduce the island's bobbing and remove its slow rocking while preserving the required weather and day/night experience.

## Verification

JavaScript syntax was checked with `node --check main.js`. Source checks cover referenced element IDs, icon references, timing math, and the required deliverables. The implementation does not start a server. Full visual/browser verification could not be completed in the authoring sandbox because browser launch was restricted; CDN network access was also unavailable in that environment.
