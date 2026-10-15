# Tokyo in the Sky

A small, animated floating Tokyo island made with native HTML, CSS, and Three.js. The scene includes Tokyo Tower, Mount Fuji, a torii gate, a pagoda, autumn trees, cloud banks, and falling maple leaves. All geometry and colors are created in code; there are no external models or image textures.

## Launch

Open `index.html` in a modern browser with an internet connection. The page also works from any static file host. No build step, backend, or server is required. Three.js **0.152.2** is loaded from the Cloudflare CDN using a classic script tag, so local `file://` opening works without module CORS restrictions. Google Fonts are optional; the page falls back to system sans-serif fonts if they are unavailable.

## Controls

- Drag horizontally with a mouse or finger to orbit the island. The island and leaves continue to animate while dragging.
- Click the `1×` button to cycle through normal, 2×, and 4× time. The `F` key does the same.
- Click pause/play or press Space to pause or resume animation. Left and Right arrow keys rotate the camera.

The camera uses pointer capture and a damped azimuth target. Vertical orbit is intentionally fixed so the island remains framed in a compact iframe. The canvas has `touch-action: none` for reliable touch dragging. Window resize updates the renderer and camera aspect ratio; narrow portrait viewports use a wider field of view and greater camera distance.

## Day and night

`DayNightCycle` advances an elapsed time accumulator with frame `deltaTime`. Its phase is `(elapsed % 15) / 15`, giving a full **15-second** loop at 1×. A palette of dawn, day, dusk, night, and pre-dawn keyframes drives the sky gradient, background, fog, ambient light, and sun color and intensity. Each interval uses a smoothstep interpolation to prevent hard changes. The sun and moon travel on opposing circular paths. A second smoothstep envelope fades landmark PointLights and emissive windows on during dusk and off before dawn. The 2× and 4× settings scale only the time accumulator.

## Maple leaves and performance

`MapleLeafSystem` defines one procedural maple silhouette and draws **150 leaves in one `InstancedMesh`**. Each instance has its own fall speed, drift, sway, spin, phase, size, and color. The per-frame loop updates instance matrices in place. Leaves that pass below the scene or drift outside its bounds are recycled back to the top; the mesh and geometry are never rebuilt during animation. Shadow casting is disabled for leaves and cloud puffs, while the main scene uses a single 1024-pixel shadow map. `deltaTime` is capped after tab suspension to avoid large simulation jumps. Device pixel ratio is capped at 2.

## Scene construction

The island is a hand-built set of low-poly rock rings with a grassy top. Tokyo Tower uses tapered rods and cross braces, while the other landmarks use simple cylinders, boxes, and custom snow geometry. Toon materials and a warm, changing light palette create the cartoon look. The sky is a small gradient shader on a large sphere, with point stars at night. No external visual assets or textures are used.

At the target **320 × 200** gallery preview size, the HUD collapses to a small title and compact time controls along the lower edge, leaving the center of the scene available for interaction.
