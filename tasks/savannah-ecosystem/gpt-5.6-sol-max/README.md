# Savannah Field Notes

A self-contained Canvas 2D ecosystem with lions, elephants, leopards, dry and wet seasons, six selectable weather systems, parallax scenery, pooled particles, safe lightning, and a pursuing tornado.

## Run

Open `index.html` directly, or serve the repository root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/tasks/savannah-ecosystem/gpt-5.5-xhigh/`.

## Why Canvas 2D

Canvas 2D keeps the illustrated animal shapes, layered landscape, weather strokes, and responsive coordinate system in one native rendering surface with no external assets or libraries. The simulation stores positions in normalized world coordinates, so the same behaviors and safe-zone calculations work from a 320 x 200 iframe to a full browser window.

## Wildlife behavior

The scene maintains nine animals: three lions, three elephants, and three leopards. All move left to right and wrap back to a still-visible position at the left edge without resetting the other simulation state, keeping at least six silhouettes on screen throughout the cycle.

- Lions share nearby dry-season lanes, patrol slowly, and enter timed rest states.
- Elephants keep a slow herd pace, pause to drink near the waterhole, and alternate relaxed and raised-trunk motion.
- Leopards move independently at higher speed and perform a timed vertical climb near either acacia tree.

Wet season raises general activity and spreads animals toward their home lanes. Dry season slows movement and pulls each social species closer to its herd lane. Rain, heavy rain, snow, thunder, and tornado weather apply distinct speed factors; animals flee fastest during a tornado.

## Seasons and weather

`SeasonManager` flips the automatic dry/wet target every 60 seconds and exponentially eases the shared `wetMix` value. Manual season selection holds for 15 seconds before automatic rotation resumes. The blend changes sky, mountains, grass, trees, waterhole size, rain density, temperature, and movement behavior without repositioning any animal.

The six weather modes are Sunny, Rain, Heavy Rain, Snow, Thunderstorm, and Tornado. Rain modes add expanding ground ripples; storm palettes and cloud cover darken progressively; snow changes fall physics and ground atmosphere.

## Object pooling

`ParticlePool` allocates 420 fixed slots backed by typed arrays. Weather changes reconfigure those slots and update `activeCount`; old rain, snow, dust, or debris state is overwritten in place rather than left active or garbage-collected. The animation loop creates no particle objects.

## Lightning safety and tornado pursuit

For each lightning strike, `chooseSafeStrike` scores 27 fixed ground candidates. Each score is the minimum horizontal clearance from every current animal after subtracting a species-specific safety radius. The bolt uses the candidate with the largest clearance, so it cannot terminate on an animal even while the herd is moving.

The tornado scans all current animal positions every frame, selects the nearest squared distance, and moves toward that target at `0.011` normalized world units per second. This is deliberately below every animal's tornado-adjusted escape speed, producing pursuit without collision. Funnel debris uses the same fixed particle pool.

All simulation and rendering runs through `requestAnimationFrame` with clamped `deltaTime`. Weather keys `1` through `6` and season key `S` supplement the on-screen controls.
