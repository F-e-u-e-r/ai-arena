# Little London — Seasons in the Sky

A single-page Three.js miniature of London floating above the clouds. It is built from procedural geometry and has no image or model dependencies.

## Run

Open `index.html` in a modern browser. The page imports Three.js as an ES module from jsDelivr, so an internet connection is needed. A static server also works if the browser restricts local ES modules.

## Rendering and scene

- Three.js **r160** (`three@0.160.0`), imported through the HTML import map. Rendering uses `WebGLRenderer`, ACES filmic tone mapping, and `MeshToonMaterial` for the miniature's graphic finish.
- The island, Elizabeth Tower, London Eye, Tower Bridge, houses, trees, clouds, sun, and moon are assembled from Three.js geometry. The island bobs gently, the Eye turns, bridge leaves sway, and clouds drift.
- The layout fills its iframe and responds to resize. The scene remains the focus at 320 × 200; compact season buttons stay visible at the bottom.

## Seasons and day/night

The automatic season advances every **22 seconds** through spring, summer, autumn, and winter. Selecting a season starts a smooth 2.4 second eased transition and pauses the automatic season cycle; press the circular play button to resume. Spring adds drizzle and closer fog, summer uses a brighter sky, autumn enables drifting leaves, and winter enables snow.

The full day/night phase takes **15 seconds**. A normalized sine arc moves the sun and moon; smoothstep on the sun height eases sky color, fog, hemisphere and directional lighting through dusk, night, and dawn. Landmark point lights and clock-face emission rise as daylight fades and switch off toward dawn.

## Particles and performance

Leaves, snow, and spring drizzle use fixed-size `InstancedMesh` pools. Each particle updates a reusable transform and wraps back to the top of its bounded volume when it falls below the island. There are no per-frame allocations of meshes and no particle creation or disposal during season changes. Renderer pixel ratio is capped at 1.65 to control fill cost on small or high-density screens.

## Camera controls

Drag with a mouse or touch to orbit horizontally and slightly adjust elevation; the render loop continues while dragging. The wheel adjusts distance. Season buttons and the play/pause button are native, touch-friendly controls.
