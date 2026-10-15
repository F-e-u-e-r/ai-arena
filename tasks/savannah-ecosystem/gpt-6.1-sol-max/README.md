# Wildland — A living savanna

A self-contained, illustrated African savanna built with native HTML, CSS, and JavaScript. Nine animals, six weather conditions, two seasons, and original procedural Canvas artwork. No libraries, external fonts, images, backend, or network requests.

## Open it

Open **index.html** directly in a modern browser. There is no installation or build step. The classic deferred script also works with `file://` URLs. A static server is optional; none is required.

- Choose Sunny, Rain, Heavy rain, Snow, Thunderstorm, or Tornado below the scene.
- Switch Dry / Wet manually, or let the season turn every **60 simulation seconds**.
- Select an animal to follow its current behavior. Focus the Canvas and press Enter to cycle through animals. Click empty ground or press Escape to release the selection.
- Pause or resume, change speed between 1× / 2× / 4×, and expand the scene. Expanded view retains the weather and season controls; Escape returns to the page.
- Open **Field guide** for wildlife notes. Click the footer status or press D for FPS, pool usage, season timing, and weather diagnostics.

Keyboard: **1–6** selects weather, **S** changes season, **Space** pauses, **D** toggles diagnostics. Native button keyboard activation and the guide dialog retain their usual behavior. Snow is disabled in the wet season; an existing snowfall becomes rain when the wet season begins. This intentionally rare, imaginative snowfall satisfies the weather experiment rather than representing a typical lowland savanna event.

## Why Canvas

Canvas 2D lets the landscape, articulated animals, depth sorting, rain, snow, and funnel share a single lightweight renderer. Custom paths, muted gradients, layered mountain silhouettes, an irregular waterhole, acacia canopies, grass, ripples, moving clouds, birds, and a subtle reusable grain pattern create the illustration without asset downloads. HTML controls and the native guide dialog provide accessible text, focus states, pressed states, keyboard use, and touch interaction around the Canvas.

## Structure

Everything is in `main.js`, with separate classes and explicit responsibilities:

| Class | Responsibility |
| --- | --- |
| `Ecosystem` | One animation loop, delta time, simulation time, resizing, visibility, pause, and speed |
| `Animal`, `Lion`, `Elephant`, `Leopard` | Shared movement/bounds plus species-specific state machines and articulated drawing |
| `SeasonManager` | 60-second cycle and continuous dry/wet interpolation |
| `WeatherManager` | One active weather, environment transitions, water/snow accumulation, tornado pursuit |
| `LightningController` | Conservative safe-corridor calculation and per-frame validation |
| `ParticlePool`, `ParticleSystem` | Fixed particle storage, bounded emission, reuse, batching, splashes |
| `Landscape`, `Renderer` | Cached background layers, procedural artwork, moving layers, depth sorting |
| `Interface`, `EventBus` | DOM controls, field guide, animal selection, announcements, state synchronization |

## Wildlife and seasons

There are **three lions, three elephants, and three leopards**. The landscape starts prewarmed: each animal has already traveled a different distance from the left entrance. All move right and reenter fully offscreen from the left only after completely leaving the right edge. Cycling weather or season never recreates an animal or resets horizontal progress. Resizing preserves that progress and ongoing actions; the vertical projection adapts to the new viewport.

- **Lions** patrol slowly as a pride. They occasionally settle for short rests, more frequently during the dry season. Their tails, steps, faces, and the male's mane are drawn separately.
- **Elephants** move as a slow family group, with an adult, a smaller adult, and a calf. Near the waterhole they can drink; elsewhere they lift their trunks. Ears, toes, trunks, tusks, legs, and skin folds have independent detail.
- **Leopards** travel independently and more quickly, sometimes crouching into a stealthy gait or sprinting. Near climbable acacias, a state sequence raises and rotates them up the trunk, pauses on the tree, and lowers them again. Their rosettes are generated once per animal.
- Group species adjust speed toward their nearest family member ahead on the circular world. Dry weather and threatening skies tighten spacing. Leopards do not use this flocking rule.
- Wetness gradually increases activity, widens group spacing, changes the action cadence, greens the landscape, and expands the waterhole. Each weather also changes speed and behavior: light rain encourages activity, cold and heavy rain slow travel, and storms/tornadoes interrupt rests and prompt quicker movement. Climbing leopards descend during threatening weather.

Season changes interpolate from the **current visual wetness** to the new target using an eight-second cubic smoothstep. Interrupting a transition starts from its current value, preventing palette jumps. Weather darkness, cloud cover, and wind approach their targets independently. Actual weather availability changes immediately with the selected season. Pausing freezes the entire simulation, including the seasonal timer; speed controls scale its clock.

## Particle management and performance

`ParticlePool` preallocates **1,800 objects**. A free stack and dense active array share these same objects. Acquiring a particle pops from the free stack. Expiration swaps the last active object into the removed slot and returns the expired object to the free stack, so removal is O(1). A full pool skips emissions rather than allocating. Every reused field is initialized for its new effect.

Weather switches synchronously recycle **all** active particles, reset the fractional emitter, and clear old lightning. Newly selected effects can prefill a small number of their own particles for immediate feedback. Rain can turn the same particle into a splash, avoiding another allocation. Water and snow are bounded scalar environmental accumulations that drain or melt after their weather ends. They do not store particles or historical puddle objects. Tornado debris orbits around the moving funnel and expires into the same pool.

Additional long-running safeguards:

- One `requestAnimationFrame` chain and delta time, capped at 50 ms before time scaling. Hidden-tab time is discarded instead of replaying a backlog.
- Emission has a per-frame work budget; excess whole emissions are dropped, with only the fractional remainder carried forward.
- Rain shares one batched path/stroke; pool storage is fixed regardless of switching or elapsed time.
- Static sky and terrain use two reusable offscreen canvases, redrawn at most about 7 times per second when a quantized environment value changes. Clouds, trees, grass, water ripples, and animals animate independently.
- Device pixel ratio is capped at 2. ResizeObserver resizes existing buffers without adding listeners or animation loops.
- Grass, foliage, clouds, stones, grain, and animal spots are generated once. Arrays of clouds/birds wrap rather than accumulate; simulation phases wrap as well.
- HUD text updates at 4 Hz, while selected-animal positioning stays smooth. There are no accumulating intervals, timeouts, histories, object URLs, or DOM particle nodes.
- Reduced-motion preferences disable pointer parallax and lower decorative particle density. Pause remains available at every supported size.

## Lightning safety

Choosing an empty endpoint alone does not protect a leopard climbing through the bolt. Instead, each visible animal's **full rotated/scaled bounding box**, including tail, mane, raised trunk, and climb height, is projected onto the x-axis and padded by 43 world units. These forbidden intervals are sorted and merged. Only remaining gaps wide enough for the entire bolt are eligible.

A zigzag is generated inside one clear vertical corridor. Its lateral jitter and its 21-unit outer glow are constrained to that corridor; it has no escaping branches. The ground contact ring is smaller than the protected glow. If no corridor exists, the strike is suppressed. **After animals move, every live bolt is revalidated on every frame.** A newly obstructed corridor is recalculated before rendering. Offscreen animals whose padded bounds overlap the viewport are included. Global sky illumination is only an atmospheric flash.

## Tornado pursuit

Each update finds the nearest visible animal by squared distance. The funnel moves along a normalized vector toward that animal's ground position, with a step capped to avoid overshooting. Its speed is the lesser of 9 world units/second and 58% of the target's actual speed, keeping it slower than moving wildlife. A stationary climbing target makes the funnel pause its pursuit until the animal descends. Swirling rings, lifted pooled debris, and a moving ground shadow remain animated. There is no damage system.

## Small iframe layout

The compact layout covers **320 × 200** and similarly short gallery cards. It removes the large introduction, footer, and explanatory HUD text; the landscape gets the remaining height. Six icon-and-label weather buttons and a two-way Dry/Wet switch stay visible in one bottom row. Pause and expand sit in the scene corner. No drawers are needed for primary controls. The guide scrolls internally, and animal tooltips are clamped inside the scene. A normal full-page viewport shows the complete editorial layout.

## Inspecting the simulation

`Wildland.inspect()` in the browser console returns a detached diagnostic snapshot: per-animal positions, states, bounds and lap counts; pool active/free/capacity; seasonal timing; lightning safety; and the current tornado target/speed. `Wildland.setWeather(name)`, `setSeason('dry' | 'wet')`, `pause()`, `resume()`, and `setSpeed(1 | 2 | 4)` use the same managers as the interface.

Useful checks: alternate weather repeatedly and verify `active + free === capacity`; leave a thunderstorm running and verify `lightning.safe`; resize or switch seasons and check continuous animal x positions; follow a leopard near an acacia; verify the full compact control row at 320 × 200. The monitor reports measured runtime FPS, rather than a fixed value. A 30-minute interactive soak should be performed on the target device when assessing device-specific performance.

## Validation

Validation during implementation included a deterministic 30-minute simulation (54,000 updates), 1,129 weather changes, all nine animal states, strict pool accounting, tornado speed checks, and 10,000 additional randomized lightning layouts. These checks passed. Browser launch was restricted by the execution workspace, so a rendered browser soak and viewport screenshots were not available here.

## Credits

All illustrations, animal paths, procedural textures, and interface icons are original to this implementation. No sprites or third-party assets are used.
