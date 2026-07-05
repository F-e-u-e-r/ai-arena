# Floating Tokyo Island

Run by opening `index.html` directly or serving the repository with a static server.

This submission uses Three.js `0.160.0` from the unpkg CDN through an import map. The scene is built from primitive geometry: a floating island, a geometric Tokyo Tower, Mt. Fuji, a torii gate, a pagoda, clouds, sun, moon, and a pooled maple leaf system.

The day-night cycle completes every 15 seconds. The cycle maps elapsed time to a circular sun and moon path, then uses smoothstep blends for sky color, fog distance, ambient light, directional light, and emissive tower lights. Lights turn on during dusk and night, then fade before dawn.

Maple leaves are preallocated once and recycled when they fall below the island. Each leaf stores speed, sway phase, and spin in `userData`, avoiding allocation during animation. The animation loop uses `requestAnimationFrame` and `deltaTime`.

Camera rotation uses Three.js `OrbitControls` with damping, pan disabled, and bounded zoom so the composition stays readable inside the 320px by 200px iframe preview.
