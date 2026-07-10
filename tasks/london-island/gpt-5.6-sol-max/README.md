# London Weather Works

A self-contained cartoon Three.js scene featuring a floating London island, Big Ben, the London Eye, Tower Bridge, the Thames, a moving double-decker bus, a river boat, clouds, and four blended seasonal weather states.

## Run

Open `index.html` directly, or serve the repository root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/tasks/london-island/gpt-5.5-xhigh/`.

## Three.js

Three.js `0.160.0` is loaded from jsDelivr as the global `THREE` build. Rendering uses `WebGLRenderer`, toon and standard materials, an animated shader sky, exponential fog, soft shadows, ACES tone mapping, and instanced weather meshes. No external textures, models, fonts, or runtime libraries are used.

## Day, night, and seasons

`DayNightCycle` maps 15 seconds to one full day. Sun height drives smooth sky, fog, hemisphere light, directional light, star, moon, and emissive landmark transitions. Big Ben, the London Eye cabins, Tower Bridge windows, lamps, and vehicles illuminate at dusk and fade out before daylight.

`SeasonCycle` divides a 48-second automatic loop into four 12-second seasons. The final 28 percent of each season is a smoothstep crossfade into the next. Grass, foliage, sky, fog, sunlight, snow cover, mist, and particle strength all read the same four normalized weights. Clicking a season holds that target for eight seconds, then returns to the automatic cycle without a hard visual jump.

## Weather pools

Rain, maple leaves, and snow each use a fixed `InstancedMesh` plus typed arrays for all particle state. Instances reset in place below the island and no geometry or particle object is created in the animation loop. Weather crossfades by changing active instance counts. Compact embeds reduce each pool to 64 percent capacity. Spring also blends nine pooled mist banks, while summer clears precipitation.

## Camera and responsive behavior

`CameraController` provides pointer-captured horizontal drag orbit, wheel zoom, damping, idle rotation, keyboard reset, and the reset icon. Resize handling updates the renderer, projection, field of view, pixel ratio, and weather capacity. The four season buttons switch to compact two-letter labels at 320 x 200 while remaining directly clickable.

All animation runs through `requestAnimationFrame` with a clamped `deltaTime`.
