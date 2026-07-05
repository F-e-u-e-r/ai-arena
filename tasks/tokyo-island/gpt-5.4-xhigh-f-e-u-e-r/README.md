# Floating Tokyo Island

## How to run

Open `index.html` directly, or serve the repository root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/tasks/tokyo-island/gpt-5.4-xhigh-f-e-u-e-r/`.

## Three.js version and loading

- Three.js is loaded from `https://unpkg.com/three@0.170.0/build/three.module.js`.
- The submission uses native ES modules plus an import map, with no extra framework layer.

## Day-night timing and transition logic

- `DayNightCycle` runs a full loop every 15 seconds.
- The cycle is sampled through keyframes for day, dusk, night, and dawn, then smoothly interpolated with a cubic easing curve.
- Each update adjusts:
  - sky dome gradient colors
  - scene fog color
  - ambient / directional sun light
  - moon light and star opacity
  - tower and landmark emissive lighting
- The sun and moon are placed on opposite points of the same orbital path so their positions track the same time state.

## Particle system and optimization strategy

- Maple leaves are implemented as a fixed-size pool of plane meshes.
- Leaves are never created or destroyed after startup. When a leaf falls below the island, it is re-seeded with new orbital and fall parameters.
- Shared geometry, shared textures, and a small set of shared materials keep GPU state changes low.

## Camera rotation control

- Horizontal drag changes a target azimuth value.
- The camera does not snap directly to the pointer delta. It eases toward the target angle each frame, which keeps motion smooth while the scene continues to animate.
- When idle, the camera applies a slow autorotation so the island keeps presenting new silhouettes.
