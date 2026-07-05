# Floating Tokyo Island - GPT-5.5 xhigh

## Run

Open `index.html` directly, or serve the repository with:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/tasks/tokyo-island/openai-gpt-5.5-xhigh-codex/`.

## Three.js

The scene uses Three.js `0.160.0` from `https://unpkg.com/three@0.160.0/build/three.module.js` through dynamic import. No other libraries, frameworks, textures, or external assets are used.

## Day/Night Cycle

`DayNightCycle` maps elapsed time into a normalized 15 second phase and samples keyframes for day, dusk, night, dawn, and back to day. Sky color, fog color, ambient light, directional light, sun position, and moon position interpolate with `smoothstep` to avoid hard visual jumps. Tower and landmark lamps fade in at dusk and fade out before dawn using phase-based thresholds rather than timers.

## Particles and Performance

`MapleLeafSystem` creates one fixed `InstancedMesh` with 180 maple leaves. Each leaf stores position, velocity, spin, sway, and scale in a preallocated object. When a leaf exits the scene it is reset to the top of the volume instead of being destroyed, so the animation does not allocate new meshes during long runs.

## Camera Control

The scene uses a small custom pointer controller instead of OrbitControls. Horizontal pointer movement changes the target yaw while the render loop continues to advance all animations. After a short idle delay, the island resumes a slow automatic orbit.
