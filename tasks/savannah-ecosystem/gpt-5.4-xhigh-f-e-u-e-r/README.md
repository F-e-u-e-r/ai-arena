# Savannah Ecosystem

## How to run

Open `index.html` directly, or serve the repository root with a static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/tasks/savannah-ecosystem/gpt-5.4-xhigh-f-e-u-e-r/`.

## Why Canvas

The task requires a custom 2D renderer without external libraries. Canvas 2D makes the wildlife layering, particle batching, and weather-specific drawing paths easy to control while staying lightweight for long-running animation.

## Particle management and performance

- All weather particles come from a fixed `ParticlePool`, so switches between weather states reuse particle objects instead of allocating new ones every frame.
- Weather changes immediately clear active particles through the pool reset path, which avoids stale rain/snow/tornado state from leaking across modes.
- Rain ripples and lightning strikes are small transient arrays with short lifetimes, while the heavy-load particle traffic stays inside the pool.

## Thunderstorm lightning safe-zone algorithm

`WeatherManager.pickSafeStrikeX()` samples candidate strike positions and rejects any x-value that falls inside an animal safety radius. If random samples all fail, it scans the scene in fixed steps and chooses the corridor with the highest minimum clearance from every animal. That guarantees lightning never lands on wildlife even while they move.

## Animal behavior and season logic

- Lions move as a loose pride, alternating between patrol and short rest cycles.
- Elephants stay slower, herd around an anchor, and may pause to drink near the waterhole.
- Leopards move independently, accelerate in sprint phases, and can climb when they pass near an acacia tree.
- Season state flips every 60 seconds and eases through a wetness blend instead of hard swapping colors or behavior. Wet season raises activity; dry season encourages slower, tighter grouping.
- Weather applies additional speed modifiers without resetting positions, so switching modes preserves the ongoing simulation.

## Object pooling details

The pool stores a fixed array of particle records and exposes `acquire()`, `release()`, and `reset()`. Weather systems request particles until their target density is met, update them in place, and return them to the inactive pool when they expire. This keeps memory stable during repeated weather toggles and extended runtime sessions.
