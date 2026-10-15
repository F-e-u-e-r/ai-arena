# Tokyo Sky Island

A small, self-contained Three.js diorama: Tokyo Tower rises from a floating garden with Mount Fuji, a torii gate, and a three-tier pagoda. Maple leaves drift around it while the sky makes a full day-to-night turn every 15 seconds.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static file server. The scene has no build step or backend. Three.js is loaded as an ES module from jsDelivr, so the browser needs network access to that CDN. No external textures or image assets are used.

## Rendering and scene design

- `index.html` loads Three.js **0.160.0** through an import map and then loads `main.js` as a native module.
- The scene uses `WebGLRenderer`, toon materials, an orthographic camera, soft directional shadows, fog, and a shader sky dome. The island, tower lattice, landmarks, garden, clouds, sun, moon, and stars are assembled from Three.js geometry.
- Tokyo Tower uses stacked tapered frames and diagonal braces. The other landmarks are a faceted Fuji, vermilion torii, and a small pagoda. Warm emissive windows and lamps brighten as evening arrives.

## Day and night

`DayNightCycle` maps elapsed time onto a 15-second loop. Color keyframes cover daylight, golden hour, blue hour, first light, and the return to daylight. Smoothstep interpolation blends the sky shader, fog, hemisphere light, and directional light. Sun and moon positions trace opposite arcs; stars fade in at night. A separate dusk-to-dawn envelope drives the tower, pagoda, garden lamps, and tower point light. The cycle can be paused with the top-right button or the Space key. `+` and `-` change its speed.

## Leaves and performance

`MapleLeafSystem` renders 108 leaves in one `InstancedMesh`, rather than creating a mesh and draw call for each leaf. Each pooled instance has its own fall speed, sway, spin, size, and color. When a leaf passes below the island it is respawned above the scene with new horizontal coordinates. The simulation uses `requestAnimationFrame` and a clamped `deltaTime`; no geometry or materials are allocated during particle updates. Pixel ratio is capped at 1.7 and the shadow map is limited to 1024².

## Camera and compact preview

Horizontal pointer dragging rotates the camera around the island and continues to work on touch screens. The lower corner buttons rotate in either direction; the arrow keys do the same. The camera and renderer respond to the stage size, and the HUD uses compact corner controls so the central diorama remains visible in a 320 × 200, 16:10 embed.
