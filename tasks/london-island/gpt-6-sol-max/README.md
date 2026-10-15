# Little London

A single-page, geometry-built Three.js diorama of a floating London island. Big Ben, the London Eye, Tower Bridge, the Thames, a red double-decker bus, miniature houses, trees, and clouds are assembled from native Three.js meshes. No external textures, models, fonts, audio, or backend are used.

## Start

Open `index.html` directly in a modern browser, or serve the folder as static files. An internet connection is needed for the Three.js CDN script. No build step or server is required. The page is designed for both full windows and iframe cards as small as 320 × 200 pixels.

## Library and rendering

- Three.js **r149 / 0.149.0** is loaded as a classic script from `https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js` in `index.html`.
- A transparent `THREE.WebGLRenderer` draws over a CSS sky gradient. `MeshToonMaterial`, soft shadows, a hemisphere light, and a moving directional light give the objects their cartoon appearance.
- All visual assets come from code. The only texture is a radial glow created at runtime with Canvas 2D for mist and the sun/moon halos.

## Time and seasons

- `DayNightCycle` completes a full **15-second** loop: daylight → dusk → night → dawn → daylight. It interpolates cyclic color keyframes with `smoothstep`, updating the CSS sky, fog color, hemisphere and directional light, and sun/moon positions. Big Ben's clock, the Eye's bulbs, Tower Bridge's lamps, and house windows brighten starting at dusk and fade before dawn ends.
- `SeasonSystem` selects the next season every **18 seconds** (72 seconds for a full year). Four weights ease toward the selected season over roughly 2.25 seconds. The same weights blend ground, water, tree foliage, rooftop snow, fog, mist, and particle opacity, so season changes have no hard visual cut.
- The season buttons or keys **1–4** select a season and restart its 18-second interval. The moon button or **N** smoothly jumps between day and night, then resumes the 15-second cycle.

## Weather and performance

- Autumn uses a pool of **150** maple-leaf instances with rotation and lateral sway. Winter uses **260** snow instances with slower drift. Falling particles wrap to the top when they leave the scene; meshes and geometries are never recreated during animation.
- The pools use `THREE.InstancedMesh` with dynamic instance matrices. Inactive weather is hidden and its matrices are not updated. Shared materials and cached box geometries reduce allocations and draw calls.
- Spring adds drifting procedural mist sprites and denser fog. Summer uses warmer, stronger lighting and saturated foliage. The renderer caps device pixel ratio at 1.7 for small, high-density screens.
- Animation runs through `requestAnimationFrame` with `THREE.Clock.getDelta()`. Delta time is capped after a background-tab pause to avoid a large one-frame simulation jump. Press **D** to show FPS and active particle count.

## Camera and small embeds

Drag left or right with a mouse or touch pointer to rotate the orthographic camera around the island. Pointer events keep animation running during the drag; exponential damping smooths the orbit after release. The camera frustum recalculates on resize and widens for narrow frames. At 320 × 200, the season buttons collapse to four icon controls while the title and day/night button remain visible.
