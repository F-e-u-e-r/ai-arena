# Living Savannah

A single-page, hand-drawn Canvas 2D African savannah. Six animals share a continuous scene with six weather modes and a dry/wet season cycle. No framework, game engine, library, backend, or image asset is required.

## Start

Open `index.html` directly in a modern browser. There is no build step or server requirement. Click a weather button to switch between Sunny, Rain, Heavy Rain, Snow, Thunderstorm, and Tornado. Click the season button in the header to switch Dry/Wet Season; it also switches automatically every 60 seconds. Keyboard shortcuts: `1`–`6` for weather, `S` for season, `D` for the FPS/particle overlay.

## Why Canvas

Canvas 2D lets the background, animals, weather, lightning, and hundreds of particles share one coordinate system and one animation loop. Shapes are drawn from paths and gradients, so the scene works as a standalone local file without fetching sprites. The art includes layered hills, animated clouds and grass, acacia trees, a changing waterhole, species details, atmospheric shading, and weather-specific effects.

## Architecture and animal behavior

- `Animal` owns position, gait phase, state timer, and the common movement loop. `Lion`, `Elephant`, and `Leopard` specialize state selection and drawing. There are two of each species from the first frame.
- Lions patrol together and enter short, very slow rests. Elephants travel as a pair, occasionally drink near the waterhole or lift their trunks. Leopards travel independently, alternate stalking and fast dashes, and occasionally climb a tree with a short vertical arc.
- Each animal moves from left to right. Crossing the right edge wraps it to a position just beyond the left edge. Weather and season changes never recreate the animals or change their coordinates.
- `SeasonManager` changes season every 60 visible simulation seconds or on demand. Its `blend` gradually interpolates sky, hills, grass, trees, and waterhole size. In wet season animals generally move faster and spread out more. In dry season herds move closer, lions rest more, and elephants drink more often. Weather further changes speed and action frequency: heavy rain and snow slow movement; a thunderstorm makes leopards dart; a tornado encourages escape movement. Snow remains selectable in both seasons, but is sparser in the dry season.

## Weather, pooling, and long-running performance

`WeatherManager` is the single source of truth for active weather. It owns lightning, tornado motion, and one `ParticleSystem`. A weather switch immediately returns all active particles to the pool and clears weather-specific effects. No old precipitation remains after switching.

`ParticleSystem` uses an object pool with a hard capacity of 900 particles. Emission first pops a recycled `Particle`; it allocates only while below the cap. Expired particles are removed by swap-and-pop, avoiding per-frame array shifting, and returned to the free list. Each animation frame uses `requestAnimationFrame` and a clamped `deltaTime` to avoid large jumps after tab suspension. Device pixel ratio is capped at 2, and resizing preserves animal positions relative to the scene. The debug overlay reports FPS, active particles, and total allocated particles.

## Lightning safe corridor

Before drawing a bolt, `WeatherManager.safeStrikeX()` scans candidate x coordinates. A candidate is accepted only if its entire vertical corridor is farther than each live animal's horizontal bounding radius plus 64 world units. The generated bolt is allowed at most 17 units of horizontal zigzag inside that corridor. While it is visible, the corridor is checked against all animals again on every frame; the bolt disappears immediately if one approaches. If no safe corridor exists, that strike is skipped. This deliberately conservative 2D test keeps lightning away from animals at every height.

## Tornado pursuit

On each frame the tornado finds the closest animal using current positions, then moves toward that animal with a capped horizontal speed of 17 world units per second. The cap makes its chase visible without teleporting or matching a leopard's sprint. Recycled debris particles orbit the moving funnel.

## Responsive embed

The canvas uses a fixed logical height with a width derived from its actual aspect ratio. The shell has a compact layout for a 320 × 200 iframe: a short header with the season switch, a visible scene, and a single row of six touchable weather controls. Extra labels and the large scene HUD recede at this size. All controls remain keyboard accessible.
