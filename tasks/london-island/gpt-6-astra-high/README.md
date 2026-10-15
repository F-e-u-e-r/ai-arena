# Little Worlds — London, all year round

A responsive, illustrated 3D postcard: a gently floating London island, a clock-faced Big Ben, a turning London Eye with level passenger capsules, and a miniature Tower Bridge over the Thames. Look for the double-decker bus, telephone box, riverboat, gardens, tiny cafés, waterfall, and clouds.

## Open the experience

Open **index.html** directly in a current WebGL-enabled browser. No build, package installation, backend, or server is required. Internet access is needed for the Three.js CDN and optional Google Fonts. The page can also be embedded in a static-site iframe.

The page uses **Three.js 0.160.1**, loaded as the classic global build from `https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.min.js`. Classic scripts deliberately allow direct `file://` use without ES-module origin restrictions. All rendering uses `THREE.WebGLRenderer`; no other rendering framework is used.

## Controls

| Action | Control |
| --- | --- |
| Rotate horizontally | Mouse or one-finger drag |
| Zoom | Wheel or two-finger pinch |
| Reset view | Double click |
| Select spring / summer / autumn / winter | Season buttons or **1–4** |
| Toggle automatic seasons | Auto-cycle button or **A** |
| Travel to day / night | Moon button or **D** |
| Toggle procedural ambience | Speaker button or **M** |
| Show FPS, active particle count, draw calls and triangle count | **F** |
| About and shortcuts | **i** button |

Selecting a season turns off auto-cycle, allowing you to stay in that season. The day/night cycle continues. Auto-cycle can be resumed at any time. The smallest cards retain all four season buttons, day/night, sound, camera dragging, and the information dialog. Below 300px tall, the automatic-season toggle becomes a compact status-dot button at the left of the dock; the **A** shortcut is also available.

## Time and transitions

- **DayNightCycle** completes a full day → dusk → night → dawn → day every **15 seconds** of visible simulation time. Solar altitude follows a cosine wave. Smoothstep curves interpolate the sky, fog colour, hemisphere and directional illumination, and interface colours. Sun and moon follow opposing orbits; stars fade in at night.
- Landmark windows, the four clock faces, Eye rim, street lamps and bridge windows use shared emissive materials. They begin glowing at dusk and fade out before dawn. A warm point light adds a small local glow. Night retains soft blue illumination so the miniature remains readable.
- The time button smoothly advances to the opposite time of day, then continues the 15-second cycle. It does not freeze the clock.
- **SeasonCycle** advances every **24 seconds**, giving a **96-second year**. The first **4.5 seconds** of each new season blend from the previous state using smoothstep weights. Interrupted manual changes capture current weights, avoiding discontinuities. The colour of the lawn, foliage, sky and blossoms, mist opacity, snow cover, and particle visibility all blend.
- Spring has low drifting mist, pastel blossoms and greater fog density. Summer has warmer, stronger sunlight and rich green foliage. Autumn brings russet trees and rotating maple leaves. Winter brings pale foliage, snow on the ground and trees, atmospheric haze and plentiful snowfall.
- Animation uses a single **requestAnimationFrame** loop with seconds-based delta time. Integration is capped at 50ms to prevent large physics jumps. Hidden tabs pause the simulation and audio; returning resets the frame timestamp. Thus a suspended tab never has to simulate a backlog of falling particles.

## Geometry, rendering and performance

- **Island**, **BigBen**, **LondonEye**, **TowerBridge**, **Atmosphere**, **WeatherSystem**, **SeasonCycle**, **DayNightCycle**, **CameraControls**, and **AmbientAudio** separate scene construction from time-driven behaviour.
- Most objects use `MeshToonMaterial` and a four-step gradient texture. Water and illuminated windows use `MeshStandardMaterial`. ACES filmic tone mapping, soft directional shadows, hemisphere fill, and cool rim light give the models their illustrated appearance.
- The island uses corresponding low-poly polygon rings to form its tapered layered cliff. The organic surface, river, leaves, and architectural components are generated from basic geometry. Clock dials, soft mist and snow sprites are drawn into tiny in-memory canvases.
- Repeated static meshes are consolidated into **InstancedMesh** batches grouped by shared material and geometry. This keeps small architectural details without one draw call per window or tree crown. Moving landmarks and vehicles retain independent transforms.
- Autumn uses a fixed pool of **180 instanced maple leaves**. Each leaf has independent fall speed, phase, scale, rotation and sinusoidal drift. One reusable transform object updates instance matrices.
- Winter uses one **Points** draw call with **760 snow particles** and a reusable position buffer. Both pools respawn below the island at the top of the volume. Inactive systems skip their physics and rendering. No meshes or particle geometries are created during the frame loop.
- Spring uses **18 pooled soft mist sprites**. Particle materials disable depth writing to avoid occluding the scene. Particle opacity fades during seasonal transitions; both pools can briefly coexist.
- Geometry and materials are reused, GPU resources are not recreated at season boundaries, and pixel ratio is capped at **2**. One shadow-casting directional light uses a fixed **2048 × 2048** shadow map; the decorative point light does not cast shadows.
- The animation loop maintains a fixed scene graph. `F` exposes renderer draw calls, triangle count and active-particle count to support extended-run inspection. WebGL failure displays a clear fallback message.

## Camera and responsive embedding

The custom orbit control uses Pointer Events, pointer capture, and delta-based exponential damping. Only the horizontal orbit angle changes, preserving a useful view of the miniature while all animations continue. Zoom is limited to 0.72–1.55. Pointer cancellation and lost capture clear gesture state.

An orthographic camera preserves the toy-like proportions. Its frustum responds to the viewport aspect ratio. Large screens offset the model beside the editorial title; narrow or short screens center it. The UI progressively removes decorative content and reduces the season dock to one compact row. At **320 × 200**, the title, location, footer and secondary labels are hidden; the brand, season choices and day/night control remain usable without covering the main island.

## Sound and assets

Ambient sound is optional and begins only after a user gesture. A looping procedural noise buffer, low-pass filter and two quiet sine tones create river/wind ambience. The filter changes with season and night. Audio is suspended when the tab is hidden.

**No external image, texture, model or audio assets are used.** All visual assets and audio are generated by the code. The optional typefaces are **DM Sans** and **Playfair Display**, served by Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`), with local Arial/Georgia fallbacks. Interface icons are inline SVG.

## Verification checklist

Open at desktop size and at 320 × 200. Drag while watching the Eye, bus and floating island. Select each season and allow 4.5 seconds for the blend. Check glowing landmarks after dusk and fading lights before dawn. Resume auto-cycle and observe the complete 96-second year. Toggle FPS details to compare particle counts and draw calls over several years. Check sound after a click, then hide and restore the tab. This project has no build step or automated browser-test dependency.
