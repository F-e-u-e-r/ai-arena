# Savannah Ecosystem - GPT-5.5 xhigh

## Run

Open `index.html` directly, or serve the repository with:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/tasks/savannah-ecosystem/openai-gpt-5.5-xhigh-codex/`.

## Why Canvas

Canvas 2D is used because the task is a single animated ecosystem with many small particles, stylized animals, and direct pixel-level weather effects. It avoids DOM churn, works in the gallery iframe sandbox, and keeps all drawing in one deterministic `requestAnimationFrame` loop.

## Particle Management

All weather effects use one fixed `ParticlePool` with 950 preallocated `WeatherParticle` objects. Rain, heavy rain, snow, splash, and tornado dust acquire inactive objects from the pool and mark them inactive when their life expires or they leave the world. Weather changes call `clearWeather()`, which deactivates old weather-owned particles instead of allocating or leaking new objects.

## Lightning Safety

Thunderstorm lightning is treated as a vertical strike column. On every strike, the system samples candidate x positions across the scene and scores each candidate against every live animal's current x position plus its species safe radius. The candidate with the greatest clearance is chosen, so lightning responds to animal movement and avoids direct hits.

## Animal Behavior

The wildlife system keeps persistent `Animal` instances for lions, elephants, and leopards. Lions pack-move, patrol, and rest; elephants herd, drink, and raise trunks; leopards sprint stealthily and occasionally climb with vertical motion. All animals move left to right and loop from the left edge after exiting the right edge.

Dry season lowers speed and increases grouping. Wet season increases movement and makes drinking or active states more likely. Weather changes apply speed multipliers but never reset animal positions.

## Season and Tornado Logic

`SeasonManager` automatically toggles dry and wet season every 60 seconds and blends palettes and behavior factors over three seconds. Manual season toggling uses the same transition path.

The tornado queries the nearest animal each frame and steers toward it with a capped velocity. This creates visible pursuit while preserving long-running stability and avoiding abrupt state jumps.
