# African Savannah Ecosystem

A self-contained 2D savannah animation: Canvas-drawn wildlife, six weathers, dry/wet seasons, pooled particles, and controls that still work in a 320×200 iframe card.

No build step, no backend, no libraries.

## How to start

Open `index.html` in a browser (double-click or drag onto a window).

A static server is optional:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

**Controls**

| Action | UI | Keyboard |
| --- | --- | --- |
| Sunny / Rain / Heavy rain / Snow / Thunder / Tornado | weather buttons | `1` `2` `3` `4` `5` `6` |
| Toggle dry ↔ wet season | season button | `S` |
| Force dry / wet | — | `D` / `V` |

Seasons also rotate automatically every **60 seconds**. Switching weather or season never resets animal positions.

## Why Canvas

Hundreds of raindrops, snowflakes, debris motes, lightning polylines and per-frame animal poses cannot live in the DOM without layout cost. Canvas 2D lets one `requestAnimationFrame` pass composite sky, parallax hills, trees, wildlife, particles and overlays with a single bitmap. Vector paths (no sprite sheets) keep the page file://-friendly and offline.

## Particle management and performance

- **`requestAnimationFrame` + clamped `deltaTime`** (max 50 ms) so a background tab does not explode motion on resume.
- **Object pooling** for every particle (see below). Weather changes call `particles.clear()`, which releases the live list back to the free list instead of dropping references.
- Spawn **budget** scales with canvas area (~220 particles in a 320×200 embed, up to ~1400 on a large window).
- Splashes are rate-limited; puddles are a tiny capped array that fades out when rain stops.
- Device pixel ratio is capped at 2. Grass blade count shrinks on compact viewports.
- Animals are eight procedural figures (3 lions, 3 elephants, 2 leopards) sorted by `y` for depth — no texture uploads.

## Lightning safe-zone algorithm

On each thunderstorm strike:

1. Treat every animal as a **forbidden disk** of radius `max(36, bodyW * 0.7) + 28`.
2. Sample vertical columns every 14 px across the ground (with side margins).
3. Score a column by its **minimum distance to any animal** (maximin). Columns inside a disk are illegal.
4. Prefer the best **legal** column; if the herd packs the whole width, still pick the maximin column.
5. Build a jagged bolt polyline. If a segment would clip an animal AABB, **jog horizontally** around that box before continuing down.

The bolt therefore never paints through a body, even in the packed fallback. Strike cooldown is 1.8–4.2 s, shortened slightly in the wet season.

## Animal habits and season logic

All animals walk **left → right** and wrap: when they pass the right edge they re-enter from the left with state intact.

| Species | Count | Habits |
| --- | --- | --- |
| Lion | 3 (pride, one male with mane) | Slow walk / patrol, occasional rest. Cohesion toward nearby lions. |
| Elephant | 3 (herd, one matriarch) | Slow amble. Drink at the watering hole (trunk down) or trumpet (trunk up). |
| Leopard | 2 (solitary) | Stalk, short dashes, climb the nearest acacia/baobab with a vertical animation. Keep distance from other animals. |

**Dry season:** golden grass and amber sky, slower movement, **stronger clustering**, more resting, less climbing. Snow intensity is reduced (rare on a dry savannah).

**Wet season:** green hills and cooler sky, **higher speed and activity**, looser groups, more climbing and drinking. Rain and thunderstorms run denser particle fields.

Season palettes and modifiers **lerp over 2.4 s** with smoothstep so the world does not pop. The 60 s auto-timer resets on a manual toggle.

A tornado **chases the nearest animal** at ~30 px/s with exponential velocity smoothing and a sine wobble — slower than a leopard dash. Nearby animals get a small flee impulse; they are never teleported.

## Object pooling details

`ObjectPool` (`js/pool.js`) holds `free` and `live` arrays.

- `acquire(init)` pops a free `Particle` or constructs one until `max`.
- Each particle has `alive`. When `life` hits 0 (or rain hits the ground), `alive = false`.
- `recycleDead` is a **single compacting pass**: survivors stay in `live`, the rest are `reset()` and pushed to `free`. No `splice` in the hot loop.
- `releaseAll` on weather change returns every live particle in O(n). Fields are zeroed so a recycled raindrop cannot keep tornado orbit state.

Warmup creates 128 particles up front so the first storm does not hitch.

## Responsive embed (320×200, 16:10)

The canvas is full-bleed. HUD pills sit top-left/right; weather/season controls are a single translucent bar at the bottom (~22 px tall). Ground sits at 70% of height so animals stay above the bar. Below 480×280 px, season **labels hide** (icon only) and HUD type drops to 9 px. Buttons stay ≥26×22 and do not wrap or overflow.

## Art notes

All figures are procedural Canvas paths (no external sprites). Palette is Serengeti-inspired: dry-season ochre and acacia silhouettes, wet-season sap green and a fuller watering hole. Parallax hills, drifting clouds, foreground grass, heat haze (sunny + dry), and distant herd silhouettes are decorative only — they are not extra `Animal` instances.

## File map

```
index.html        entry
style.css         overlay HUD / compact iframe rules
main.js           rAF orchestrator
js/utils.js       lerp, color, seeded random
js/pool.js        ObjectPool
js/particles.js   pooled ParticleSystem
js/season.js      dry/wet blend + 60s rotate
js/weather.js     six weathers, lightning, tornado
js/world.js       parallax environment
js/animals.js     Lion, Elephant, Leopard
js/ui.js          buttons + keyboard
```
