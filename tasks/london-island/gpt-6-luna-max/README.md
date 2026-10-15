# Little London — Sky Island

A self-contained Three.js scene of a tiny, floating London. Big Ben, the London Eye, Tower Bridge, a ribbon of Thames-blue water, and a little neighbourhood drift through changing weather and a fast day-night cycle.

## Run it

Open `index.html` in a modern browser with an internet connection. Three.js and its OrbitControls module are loaded from jsDelivr; no build step, server, or backend is required. Some browsers restrict ES modules opened from `file://`; if that applies, open the folder with any static file server and visit `index.html`.

## Controls

- Drag with a mouse or one finger to orbit. Pinch or use the wheel to zoom.
- The four season buttons select spring, summer, autumn, or winter. The selected weather blends in over a few seconds; the scene then continues its automatic seasonal cycle.
- The half-moon button eases the scene to night or day. The normal day-night cycle resumes after the short transition.

The header and bottom status chips are sized to fit an iframe preview as small as 320 × 200. The canvas resizes to its container, and the controls remain touch-friendly at narrow widths.

## Scene and timing

`main.js` keeps the scene in small classes: `Island` builds and animates the island and landmarks, `WeatherSystem` owns pooled weather particles, and `DayNightCycle` updates the sky, fog, lighting, sun, moon, and stars. Three.js r160 is loaded as an ES module from jsDelivr in `index.html`; OrbitControls is imported from the matching Three.js addons path. Geometry and materials are created in code; there are no external image textures.

One full day-night rotation takes **15 seconds**. The sun moves around a high arc; sunrise and sunset are softened with smooth lighting and sky blends. Twilight gradually raises the emissive clock, bridge, and London Eye lights, and the lights fade back out before dawn. The sun and moon trade places, and stars fade in after dark.

Each season lasts **28 seconds**, making an automatic four-season year **112 seconds** long. A season selection resets that season's timer. Palette weights approach the new season exponentially and are normalized every frame, so the grass, water, sky, fog density, cloud tint, and ambient lighting change without a hard cut. Spring adds low drifting mist, summer increases warmth and brightness, autumn releases leaves, and winter brings snow.

## Animation and performance

The render loop uses `requestAnimationFrame` and a clamped delta time. The island bobs and gently turns, the Eye wheel rotates, clouds and mist drift, and all seasonal effects continue while the camera is being dragged.

Leaves and snow use fixed-capacity `InstancedMesh` pools (220 leaves and 320 snowflakes). Each particle updates its transform in place; particles that fall below the island are moved back above it. Their geometry and draw-call count stay fixed during long runs, and they do not cast shadows. Static geometry is reused where possible, renderer pixel ratio is capped, and only the sun casts the scene's soft shadow map.

OrbitControls provides damped mouse, touch, and wheel interaction. Panning is disabled, zoom distance and vertical orbit are bounded, and a `ResizeObserver` keeps the camera aspect and WebGL drawing buffer in step with the iframe size.
