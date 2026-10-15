# Wildlight — Savannah Field Notes

A self-contained Canvas 2D ecosystem study. Open `index.html` directly in a modern browser; no build step, server, backend, or external assets are required.

## Controls

- Choose one of the six weather icons in the lower toolbar.
- Use the season button to switch between dry and wet season. It also advances automatically every 60 seconds.
- Keyboard shortcuts: `1` sunny, `2` rain, `3` heavy rain, `4` snow, `5` thunderstorm, `6` tornado, `S` season.

The layout adapts to narrow embedded previews. At phone widths, weather names collapse to icon buttons and the HUD trims down, leaving the scene and touch targets visible.

## Design notes

### Canvas choice and scene composition

Canvas is a good fit for a continuously animated landscape: one render loop can layer the sky, drifting cloud bands, distant hills and acacias, foreground grass, wildlife, and weather effects without creating hundreds of DOM nodes. Drawing uses a 1000 × 500 virtual scene mapped to the responsive canvas size, with a pixel-ratio cap of 2 for crisp output without excessive backing-store memory.

### Wildlife and seasonal behavior

`Animal` instances hold independent position, gait, and behavior state. The scene has two lions, two elephants, and two leopards. Lions move slowly in a pair and periodically rest. Elephants move as a slow herd, animate their trunks, and occasionally pause to drink. Leopards have a quicker gait and occasionally rise vertically in a climbing state during the dry season. Each animal wraps from the right edge to the left while retaining its motion state.

Wet season shifts the palette toward cooler greens, adds activity and faster movement. Dry season warms the ground, slows movement, and tightens herd travel. `SeasonManager` blends the seasonal palette over three seconds, while the 60-second clock continues across manual changes. Weather also changes activity and speed, sky tint, precipitation, ground puddles, and tornado behavior.

### Weather and particle performance

`WeatherManager` owns the selected weather, effects, rain puddle level, tornado, and thunder timing. Changing weather clears the old effect particles back into the pool before spawning the next kind. `ParticlePool` preallocates 1,200 reusable particle records. `acquire()` reinitializes a free record; `releaseAt()` removes it with a swap-delete and returns it to the free list. The pool has a fixed upper bound, and the animation loop clamps delta time after a paused tab so one long frame cannot cause a large simulation jump.

The tornado moves slowly toward the nearest animal while aiming to keep a small buffer. Its dust funnel and orbiting debris are drawn independently from the animal silhouettes.

### Lightning safety

At each thunderstorm strike, the renderer samples candidate x positions along the horizon. For every candidate it measures the distance to every animal's current position, including a vertical-position contribution. Candidates within a 125-unit safety radius are rejected; the strike uses the remaining location with the greatest clearance. If the whole horizon is too close to an animal, that flash is skipped. Lightning is therefore placed from current coordinates and cannot cross an animal.

## Implementation

- `index.html` is the page entry point and contains the accessible weather/season controls.
- `style.css` defines the responsive 16:10 experience frame and compact embedded controls.
- `main.js` contains the Canvas renderer, animal state, season manager, weather manager, and particle pool.

No third-party libraries, fonts, sprites, or remote resources are used.
