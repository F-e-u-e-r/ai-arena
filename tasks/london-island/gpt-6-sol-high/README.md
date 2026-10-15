# London, Afloat

A small, procedural Three.js London floating above the clouds. Big Ben, the London Eye, Tower Bridge, houses, trees, a winding Thames, clouds, sun, moon, and weather are made from geometry and canvas textures created at runtime. No external visual assets or backend are used.

## Start

Open `index.html` directly in a modern browser with internet access. The only required remote file is Three.js **0.152.2**, loaded from jsDelivr in a classic script tag. The Google Fonts stylesheet is optional; local font fallbacks are provided. A static file server also works, but is not required.

## Controls

- Drag horizontally with a mouse or touch pointer to orbit the island. Inertia gently settles after release; animation continues during dragging.
- Use the four season buttons, or keys `1`–`4`, to choose a season. Manual selection pauses automatic seasons.
- Use the `Ⅱ` / `▶` button or `Space` to pause or resume automatic seasons.
- Use the moon/sun button or `N` to ease toward night or day.

The controls stay visible in a 320 × 200 iframe. At narrow widths, labels and secondary copy collapse while all four seasons and both utility buttons remain clickable.

## Time and transitions

The day/night phase makes **one full revolution every 15 seconds**. Color and intensity keys define dawn, daylight, dusk, and night. Smooth interpolation drives the sky dome, fog color, hemisphere and directional lights, stars, and the sun and moon positions. Emissive windows, clock faces, the Eye rim, bridge accents, and three small point lights brighten as dusk starts and fade before dawn.

Each automatic season lasts **14 seconds**, so a complete year takes 56 seconds. The final 20% of each season crossfades into the next using a smoothstep curve. That same weight blend changes tree color, mist density, snow/leaf opacity, fog, and summer sunlight. Manual selection interpolates toward the selected season; resuming automatic playback starts from the displayed season. Spring is humid and misty; summer is bright and warm; autumn drops rotating, swaying leaves; winter drops snow.

## Particles and performance

Autumn has 135 reusable leaf instances; winter has 210 reusable snow instances. Both pools are allocated once as `InstancedMesh` objects. The animation updates their matrices, wraps particles back above the scene once they fall, and skips an inactive weather pool. Leaves use a small custom shape and per-instance color; snow uses low-detail icosahedrons. The render loop uses `requestAnimationFrame` with a capped delta time, caps device pixel ratio, shares most geometry materials, and uses one 512² shadow map. No per-frame mesh creation or resource accumulation occurs.

The page resizes its WebGL renderer and camera aspect ratio with the viewport. Camera orbit uses Pointer Events and pointer capture, so touch dragging and mouse dragging share the same code. The 512² shadow map refreshes every eight frames; slow island movement makes that cadence unobtrusive.
