# Little London — Above it all

A procedural, cartoon London diorama built with native HTML, CSS, JavaScript and **Three.js r160 (0.160.0)**. No framework, build step, backend, downloaded models, or external image textures.

## Open it

Open **index.html** directly in a current browser with WebGL enabled. An internet connection is required for the Three.js CDN and optional Google Fonts. A static host works too; no server is required for local use.

Three.js loads as a classic script from **cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js**, with a jsDelivr fallback for the same version. Classic scripts avoid the module restrictions of `file://` pages. Fonts are **Cormorant Garamond** and **DM Sans**, served by Google Fonts, with local serif/sans-serif fallbacks. All geometry, clock faces, particle textures and sound are generated in code. The CSS grain is an inline SVG filter.

## Explore

- **Drag** horizontally to orbit; drag vertically to adjust elevation. The scene continues animating during interaction.
- **Scroll / pinch** to zoom. Arrow keys rotate; `+` / `−` zoom.
- Click a **season** or press **1–4** to choose Spring, Summer, Autumn or Winter. Choosing a season pauses automatic seasonal changes, so you can enjoy it. Weather continues animating.
- The **Auto** control or **Space** pauses/resumes the seasonal cycle. It does not pause the island or day–night clock.
- Click the **time card** or press **D** to jump to the next lighting phase; the clock then continues normally.
- **R** resets the view; **M** toggles quiet ambient sound; **F** toggles fullscreen when the embedding page permits it.
- Click a **landmark label** for a little postcard about it. **H / ?** opens the guide; **Escape** closes it.
- **Backtick** shows FPS, active particles, draw calls and geometry count. Add `?debug` to the URL to show this on load.

## Time, seasons and lighting

`DayNightCycle` completes one solar rotation every **15 seconds of active viewing**: morning → afternoon → sunset → night → dawn → morning. A sinusoidal solar elevation drives smoothstep daylight and twilight envelopes. The sky gradient, scene fog, hemisphere light, directional light and its color blend continuously. Sun and moon move on opposing arcs, and stars fade in at night. Big Ben's four working clock faces follow simulated time.

Landmark lighting uses a separate smooth envelope. It fades in as dusk begins (cycle phase 0.385–0.475) and fades out **before dawn** (0.90–0.97). Three local point lights illuminate Big Ben, the London Eye and Tower Bridge; shared emissive materials illuminate clock faces, windows, the wheel rim and street lamps.

`SeasonController` changes seasons every **30 seconds** by default, giving each season two full solar rotations. Four normalized weights approach the selected season using frame-rate-independent exponential damping. About 95% of the transition finishes in **2.3 seconds**. The same weights blend vegetation, grass, snowfall, maple leaves, mist, atmosphere and audio:

| Season | Atmosphere | Motion and material changes |
| --- | --- | --- |
| Spring | Humid, pastel, soft morning haze | Fourteen gently drifting mist sprites and stronger distance fog; blossom-colored trees |
| Summer | Clear, warm, sunny | Stronger directional light, less fog, saturated green foliage |
| Autumn | Muted gold, crisp air | Rotating maple leaves with independent sway, breeze and fall speeds; copper foliage |
| Winter | Cool, pale, snowy | Dense gently drifting snow, cool vegetation, snow layers fading onto trees and roofs |

Both cycles and all animation use **requestAnimationFrame + deltaTime**. The timelines use actual elapsed seconds, so a day still lasts 15 seconds on slower devices. Particle and camera integration is capped after stalls. Rendering pauses in hidden tabs and resumes with a fresh timestamp; hidden time does not advance the simulation. This prevents jumps when gallery cards return to view.

## Geometry and performance

- `Island`, `BigBen`, `Westminster`, `LondonEye`, `TowerBridge`, `Cloudscape`, `WeatherSystem`, `DayNightCycle`, `SeasonController`, `CameraController` and `AmbientSound` encapsulate their behavior in `main.js`.
- Sculpted, vertex-colored island strata, a winding river and waterfall, a boat, terraced houses, a red double-decker bus, telephone box, gardens, benches, street lamps, clouds and gulls are made from basic and procedural geometry.
- Shared `MeshToonMaterial` gradient maps give vegetation and roofs a cartoon finish; rough `MeshStandardMaterial` surfaces provide warm architectural detail and soft shadows.
- Repeated static geometry is combined into **InstancedMesh** batches once at construction. Moving subtrees remain independent; the Eye's cabins follow the rotating rim while remaining upright, using just **three instanced draw calls** for all twenty capsules.
- Autumn uses one instanced, fixed **240-leaf pool** (**140** in compact initial viewports). Leaf transforms update in place. Fallen leaves recycle to the top without creating meshes.
- Winter uses a single **1,100-point buffer** (**650** in compact initial viewports), reused in place, with a generated soft snowflake texture. Both pools are allocated once, fade between seasons, and skip particle integration when invisible.
- Mist sprites reuse one generated radial texture. All four clock faces share one generated canvas texture. No render-loop texture, geometry or material creation is needed.
- Pixel ratio is capped at **1.75** (1.5 on narrow screens), shadow maps at **1024²**, and only the main directional light casts shadows. Local landmark lights do not cast additional shadow maps.
- Geometry, material and texture counts stay bounded through repeated weather cycles. The page releases GPU and audio resources on final page exit, and handles WebGL context loss/restoration.

## Camera and responsive embeds

The custom orthographic orbit controller uses Pointer Events, pointer capture and frame-rate-independent damping. It supports mouse, touch, two-finger pinch, trackpad and keyboard input without OrbitControls or another dependency. Elevation and zoom are bounded; resize uses `ResizeObserver` to update both the renderer and orthographic projection.

Desktop composition leaves room for the editorial introduction and projected landmark labels. On narrow screens the forecast condenses. At **320 × 200**, the introduction and labels disappear, the time card becomes compact, the season buttons become icons, and the Auto, reset and sound controls remain accessible without overlap. The camera reframes the island to keep all three landmarks visible. Every icon button has an accessible name; selected seasons and toggles expose their pressed state. Sound starts only after an explicit user action and is synthesized with a reusable Web Audio wind buffer and quiet tones.

## Manual verification

1. Open the file and drag while watching the Eye, clock hands, clouds and boat continue moving.
2. Select each season, allowing three seconds for its transition. Autumn should have spinning leaves; winter should have falling snow and snow caps.
3. Watch a full 15-second day–night rotation. Check warm landmark lights at dusk and their fade before dawn. Use D to inspect phases quickly.
4. Resume Auto and leave it running through multiple 120-second seasonal loops; use the debug display to inspect bounded resource counts.
5. Resize to 320 × 200. All four season icons, Auto, time, reset and sound remain usable; drag still rotates the island.

An optional `window.littleLondon` inspection API exposes `getState()`, `setSeason(0..3)`, `setTime(0..1)` and `resetView()` for manual inspection in browser developer tools.

### Verification performed

Opened directly over `file://` in Chrome. Checked all four weather states, dusk/dawn light envelopes, drag while animating, zoom, reset, sound, guide dialogs, and control hit targets at 320 × 200, 320 × 568, 390 × 844, 640 × 400 and 1440 × 900. A full **120-second automatic seasonal loop** returned to spring after eight solar rotations; samples held **60 FPS, 31 geometries and 6 textures** throughout this local run. JavaScript syntax and HTML/SVG references were checked. No application errors were logged; Three.js prints its standard classic-script deprecation notice.
