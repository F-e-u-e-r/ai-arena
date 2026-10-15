# Savanna — A living landscape

A self-contained, illustrated African savannah built with native HTML, CSS, and JavaScript. The scene, wildlife, and weather are rendered using the Canvas 2D API. No dependencies, build step, external fonts, image downloads, backend, or network requests are required.

## Open the ecosystem

Open **index.html** directly in a modern browser. Keep `style.css` and `main.js` in the same directory. A static host also works, but is unnecessary. No server was started for this project.

## Controls

| Control | Action |
| --- | --- |
| Weather buttons / keys **1–6** | Sunny, Rain, Heavy rain, Snow, Thunderstorm, Tornado |
| Dry / Wet buttons or **S** | Change season |
| Pause button / **Space** | Freeze or resume the ecosystem and season timer |
| Expand button / **Escape** | Fill or leave the current browser viewport; works inside an iframe without fullscreen permissions |
| Tap an animal | See its species and current behavior |
| Field guide | Read about the wildlife and controls |
| System stats / **D** | Toggle FPS, live particle count, capacity, and animal count |

Snow is a deliberately imaginative experiment, available only in the dry season. Choosing the wet season while snow is active changes the weather to rain. The field guide explains this exception to the otherwise naturalistic setting.

## Canvas and visual design

Canvas gives one coordinated drawing surface for layered terrain, articulated animals, procedural trees, hundreds of animated grass blades, and precipitation. It avoids hundreds of moving DOM elements and makes collision geometry and drawing share one coordinate system.

Original artwork includes a softly lit sky, drifting clouds, distant ridgelines, several layers of acacia trees, a watering hole, a winding path, rocks, edge grasses, airborne pollen, and birds. Elephants have swinging legs, flapping ears, ivory tusks, and articulated trunks. Lions have mane, muzzle, tail, and gait details; leopards have individually generated rosettes and long tails. Everything is procedural Canvas artwork. The interface uses locally embedded SVG icons. No third-party sprites or visual assets are used.

The world is 1,400 logical units wide; its logical height follows the canvas aspect ratio. Device pixel ratio is capped at 2. `ResizeObserver` resizes the backing canvas without recreating animals or changing their horizontal positions. Responsive controls switch to an icon strip and compact Dry/Wet selector at short viewport heights. At **320 × 200**, the habitat occupies the main area and all eight primary controls fit along the bottom; decorative headers, footer, and coordinates disappear.

## System architecture

- **Ecosystem** owns the animation loop, wildlife, UI binding, resizing, and draw order.
- **Animal** implements common locomotion, looping, group spacing, bounds, state timing, and mood descriptions.
- **Lion**, **Elephant**, and **Leopard** specialize behavior and drawing.
- **SeasonManager** owns a 60-second active-time cycle and smooth wetness transitions.
- **WeatherManager** owns the mutually exclusive weather state, wind, puddles, lightning, and tornado pursuit.
- **ParticleSystem** updates precipitation, pollen, dust, splashes, and debris.
- **ParticlePool** provides fixed-capacity allocation and constant-time recycling.
- **Landscape** owns stable procedural geometry and season/weather palettes.

Weather and season changes dispatch `change` events; the UI subscribes once. Timed behavior uses simulation time rather than accumulating `setInterval` or `setTimeout` callbacks.

## Wildlife and seasons

Eight animals are present: **three lions, three elephants, and two leopards**. They originate offscreen to the left; an entrance pre-roll establishes the initial composition before the first painted frame. After each animal has fully exited on the right, it wraps beyond the left edge. Weather and season changes never recreate animals or reset their positions.

- Lions patrol at a moderate pace. Followers adjust speed toward a target spacing behind the pride leader. In calm weather they occasionally rest; dry-season rests are more frequent.
- Elephants are larger and slower. Two followers track the matriarch, including a calf. They pause to drink near the watering hole or raise their trunks elsewhere.
- Leopards move independently and faster, with a low gait. At an acacia they transition through **climbing → perched → descending → stalking**. Their vertical displacement is calculated from the tree branch height.
- Wet weather increases activity; heavy rain and storms interrupt resting/drinking and accelerate shelter-seeking movement. A tornado produces the strongest escape response. Snow slows wildlife.
- The dry season tightens family spacing. The wet season increases activity and group spacing, deepens the greens, and changes sky and terrain colors. Storms tighten groups again.

Every 60 seconds of active simulation the season switches. Manual season changes restart this timer. Palette changes use exponential interpolation, `1 - exp(-rate × deltaTime)`, so their duration is independent of frame rate. Rain gradually enlarges puddles, which evaporate after the rain stops. Snow cover fades in and melts smoothly. Switching weather immediately recycles the old particles while environmental color and wetness transition gradually.

## Lightning safety algorithm

1. Compute a conservative bounding box for **every animal**, accounting for species, scale, current location, and climbing displacement.
2. Expand the horizontal intervals by 26 world units, clamp them to the scene, and sort by left edge.
3. Sweep the intervals, merging overlapping protected regions and finding sufficiently wide uncovered corridors.
4. Choose a safe corridor and constrain **every vertex** of a zigzag lightning bolt inside it. Straight segments cannot leave that corridor; the visible glow is included in the margins.
5. Revalidate the bolt against all animal bounds **after wildlife movement and before every rendered flash frame**. If an animal approaches the corridor, immediately discard the entire bolt and flash.
6. Skip the strike when there is no safe corridor. Resizing also clears any active bolt.

Using a protected column across the entire canvas height is more conservative than checking only the ground impact. This protects against branches crossing an animal as well as direct impacts. Lightning has no unconstrained branches. Reduced-motion preferences suppress the full-scene lightning flash.

## Tornado pursuit

Each frame, the funnel chooses the nearest visible animal using Euclidean distance. Its normalized movement vector advances toward that target at **9 world units per second**, slower than the wildlife's storm movement. It does not teleport when the target changes. Stacked animated elliptical bands form the funnel, while nearby pooled debris receives inward and rotational acceleration. Targets that wrap offscreen are excluded until they enter again.

## Object pooling and performance

The particle pool preallocates **1,800 reusable records**. A spawn pops a record from the free stack and resets every field. When a particle expires, swap-removal returns it to the free stack in O(1), without array splicing. A full pool simply drops extra emissions. A weather switch drains the active array back to the free stack and clears emission debt. Rain transforms its existing particle into a short-lived ground splash, so an impact requires no extra allocation.

The invariant is always:

```text
active particles + free particles = 1800
```

Additional safeguards:

- One `requestAnimationFrame` loop with `deltaTime`, capped at 50 ms to prevent runaway catch-up after a stall.
- Hidden documents skip simulation and drawing; resuming resets the previous timestamp. Pause also freezes season timers.
- Fixed wildlife, cloud, foliage, grass, and spot arrays; no population growth or history buffers.
- Pool particles expire by lifetime and/or bounds. Weather changes clear all old primary and secondary particles.
- No per-weather listeners, timers, or animation loops; UI listeners are registered once.
- Stable procedural vegetation and rosettes are generated once, not randomly rebuilt each frame.
- FPS and countdown DOM updates are throttled; the tooltip only updates while selected.
- Canvas resolution is capped at 2× rather than unrestricted device pixel ratio.

Small temporary arrays and color strings used in drawing are garbage-collectable and are never retained. The design bounds retained memory; actual frame rate remains dependent on the browser and hardware.

For a quick browser inspection, `window.savanna.stats` exposes a fresh, frozen statistics snapshot. It does not expose mutable simulation objects.

## Accessibility and compatibility

Semantic buttons expose selection via `aria-pressed`; every compact icon button retains a title and accessible name. The Canvas has a textual description, weather/season updates use a polite live region, keyboard focus is visible, and the field guide uses a native modal dialog. Pause remains available in the smallest embed. The app uses current standard browser APIs (`CanvasRenderingContext2D`, `ResizeObserver`, `EventTarget`, and `HTMLDialogElement`).

## Verification

- `node --check main.js` passed.
- An accelerated **40-minute simulation** (48,000 updates at 50 ms) exercised all six weather modes, both seasons, and every species state. It checked finite positions, preserved positions on season changes, particle ownership/capacity, and every active lightning corridor. The pool stayed below 740 active particles in that run and retained exactly 1,800 unique records.
- Additional checks passed for 1,000 generated lightning strikes, tornado movement direction and speed, immediate weather-particle cleanup, and automatic season rollover.
- HTML icon references, primary control counts, CSS brace balance, and the four-file delivery set were checked.
- Browser visual verification was attempted without a server, but local browser execution was blocked by the execution environment. The accelerated checks validate simulation behavior and bounded allocation; they are not a claim of measured 40-minute browser frame-rate performance.
