# African Savannah Ecosystem (Canvas 2D)

A self-contained 2D savannah: six animals (2 lions, 2 elephants, 2 leopards) with species-specific behaviour, six weathers, wet/dry seasons, lightning safe-zones, and a chasing tornado — all with **object-pooled** particles.

## How to run

```bash
# any static server, or open index.html directly (no modules)
python3 -m http.server 8080
```

No libraries. Pure HTML + CSS + Canvas 2D.

## Why Canvas 2D

- Full control over per-frame particle budgets and pooling without a scene-graph tax
- Easy parallax layers, lightning bolts, and soft weather overlays
- Fits sandboxed iframe embeds with zero dependency risk

## Controls

| UI / key | Action |
| --- | --- |
| ☀️🌧️💧❄️⚡🌪️ | Weather (exclusive) |
| 🌿/🏜️ button or `S` | Toggle wet / dry season |
| `1`–`6` | Sunny → Tornado |

Season auto-rotates every **60 seconds**. Changing weather/season **never** resets animal positions.

## Animal behaviour

| Species | Habits |
| --- | --- |
| **Lion** | Pride movement (pack pull), slow patrol, occasional rest |
| **Elephant** | Herd movement, slow gait, drink / trunk lift |
| **Leopard** | Solo, fast, occasional tree climb (vertical offset) |

All enter from the left and wrap from the right.  
**Wet season** → higher activity multiplier. **Dry season** → stronger flocking + more rest in sun.

Weather modifiers: heavy rain/storm slow animals; tornado raises alert speed; dry sunny slightly slows non-leopards.

## Weather systems

- **Sunny** — dust motes in dry season  
- **Rain / Heavy** — streak particles + growing ground **puddles**  
- **Snow** — flakes; spawn rate reduced in wet season  
- **Thunderstorm** — heavy rain + lightning  
- **Tornado** — funnel sprite + debris; **slowly chases nearest animal**

Switching weather calls `ParticlePool.clear()` so old particles are recycled immediately.

## Lightning safe-zone algorithm

1. Discretize candidate X positions across the sky.  
2. Reject any candidate within `safeRadius + animal.radius` of a living animal (live positions every strike).  
3. If all rejected, pick the X that maximizes distance to the nearest animal.  
4. Bolt polylines fall to ground only at that X — sparks spawn there too.

Animals are therefore never under a strike centerline.

## Object pooling

`ParticlePool` pre-allocates up to **900** particle records:

- `acquire(init)` pops from free list (or steals oldest active at cap)
- `release` / `clear` return records without `new` in the hot path
- Kinds: rain, snow, dust, debris, spark

## Architecture

`ParticlePool` · `SeasonManager` · `WeatherManager` · `Animal` (lion/elephant/leopard) · `World`

Loop: `requestAnimationFrame` + clamped `deltaTime`.

## Embed (320×200)

- Canvas fills the viewport; DPR-aware resize  
- Icon weather strip + compact season chip at the bottom  
- Top badges for season / weather / FPS only — no large panels  

## Assets

Procedural drawing only (paths, ellipses, gradients). No external sprites.
