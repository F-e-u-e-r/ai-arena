# Tokyo in the Clouds

A small, self-contained Three.js scene: a floating Japanese garden island with a toy-scale Tokyo Tower, Mount Fuji, torii gate, pagoda, drifting clouds, falling maple leaves, and a fast day/night loop.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static HTTP server. The page loads Three.js 0.160.0 from jsDelivr; an internet connection is needed for that CDN request (and the optional Google Fonts). There is no build step or backend.

## Scene and day/night cycle

`Island`, the landmark builder functions, `MapleLeafSystem`, and `DayNightCycle` keep scene setup and animation responsibilities separate. The island floats on a slow sine wave. Tower braces, layered terrain, stylized landmarks, hand-shaped leaf geometry, and shared materials give the scene its illustrated toy look.

The cycle lasts 15 seconds at 1× speed. `DayNightCycle` advances by the frame's delta time, locates the current section between dawn, day, dusk, and night keyframes, then cosine-eases the sky and fog colors and the ambient/directional light intensities. The sun and moon travel on opposite arcs. Landmark point lights fade up around dusk and remain softly visible at night, then fade down before dawn. Use the lower-left pause and speed buttons to pause or cycle through 1×, 2×, and 0.5×. Space toggles pause; left/right arrow keys change speed.

## Leaves and performance

The 110 maple leaves use two `InstancedMesh` batches and one shared `ShapeGeometry`, with per-leaf fall speed, sway, spin, depth, and scale. Leaves below the island are reset above the scene and reused; no geometry or material is allocated during an animation frame. Clouds and stars are also built once and reused. Rendering caps device pixel ratio at 1.6, and leaf motion and island animation use clamped delta time so brief background-tab pauses do not create large simulation jumps.

## Camera and responsive layout

Pointer dragging on the canvas changes the camera's orbital yaw and pitch; the render loop continues during a drag. Pointer events support mouse and touch. A `ResizeObserver` updates the camera aspect and renderer dimensions as the iframe changes size. The HUD uses compact overlays and remains legible at a 320×200, 16:10 preview; the scene itself occupies the full card.

All scene art is generated from Three.js geometry and code. No external image textures are used.
