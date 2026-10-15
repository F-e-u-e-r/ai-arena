# Wildfield — The living savannah

A small, illustrated window into the Serengeti, built with native HTML, CSS, and JavaScript. All scenery, animals, and effects are drawn with Canvas 2D. No libraries, images, fonts, network requests, build tools, or backend are required.

## Open it

Open **index.html** directly in a modern browser. No server or installation is necessary. Keep `style.css` and `main.js` beside it.

- Choose one of six weather buttons, or use **1–6**.
- Choose **Dry / Wet**, or press **S**. Seasons also alternate every **60 simulation seconds**. Manual switching restarts that countdown.
- **Space** pauses; the **1×** button cycles through 2×, 0.5×, and 1×. The countdown follows simulation time and pauses with the scene.
- Select an animal to see its current activity. Open **Field guide** for species notes.
- Use the expand button for full screen, where the browser or embedding permissions allow it.
- **D** toggles FPS, particle occupancy, lightning, and tornado target diagnostics.

The clock suspends while the page is hidden, so returning to the tab cannot cause a large simulation jump. A system preference for reduced motion reduces weather density and softens lightning flashes.

## Why Canvas

Canvas is well suited to hundreds of transient particles and articulated, layered silhouettes. One surface avoids a DOM element per raindrop, provides predictable drawing order, and lets scenery, lighting, wildlife, and weather share coordinates. Semantic HTML remains responsible for controls, focus, announcements, and the field guide. The canvas has a description and can receive keyboard focus; the animation itself is a visual experience.

## Architecture

`main.js` is a self-contained script rather than an ES module, allowing `file://` execution without module-origin restrictions.

| Class | Responsibility |
| --- | --- |
| `Ecosystem` | One animation loop, bounded delta time, substeps, resizing, and lifecycle |
| `Animal` | Persistent identity, normalized horizontal route, movement, selection, bounds |
| `Elephant`, `Lion`, `Leopard` | Species state machines and original procedural illustrations |
| `SeasonManager` | Automatic/manual seasons, clock, interpolated seasonal color blend |
| `WeatherManager` | Single active weather, effects, safety corridors, pursuit, surface conditions |
| `ParticlePool`, `ParticleSystem` | Fixed storage, emission budgets, integration, recycling |
| `SceneRenderer` | Cached multilayer landscape, clouds, water, wildlife, foreground, weather |
| `Interface` | DOM events, accessible button state, keyboard controls, compact HUD |

Weather and season changes dispatch events. UI state follows those events; no new animation loop or repeated listener registration occurs during switching.

## Wildlife and seasons

Six persistent animals are present: two elephants, two lions (a male and female), and two solitary leopards. The opening composition is prepopulated along their left-to-right routes. Each animal eventually exits fully at the right and re-enters fully from the left. The same object and animation phase survive every wrap and climate change.

- **Elephants** move slowly with a leader/follower spacing controller. The smaller companion follows the adult. When near the waterhole, they occasionally pause to drink; elsewhere they lift their trunks. Severe weather encourages staying with the herd and interrupts exposed drinking.
- **Lions** patrol together at a slow pace, with short timed rests. Wet-season rests are shorter. Thunder and a nearby tornado prompt alert movement.
- **Leopards** use separate lanes and clocks, travel faster, and occasionally climb when they reach an acacia. The climb has eased ascent, a perch, and descent. They do not join a herd.

Dry weather tightens the desired herd spacing. The wet season increases movement speed by 25%, spreads the herds, shortens lion rests, and gradually greens the landscape. Rain, heavy rain, cold, storms, and tornadoes each apply a different movement multiplier. Nearby tornadoes prompt an additional escape response.

The visual seasonal blend eases independently from the logical state. Sky, mountains, grass, trunks, and canopies interpolate without replacing animals. Resizing preserves each animal's fractional horizontal progress. Sky/cloud, distant mountain, rolling plains, middle-distance acacias, wildlife lanes, and foreground grasses create depth; clouds, birds, water, and grass animate at different rates.

Snow is intentionally a rare, imaginative dry-season option, not a claim about typical Serengeti climate. It is disabled in the wet season. Switching to wet while snow is active selects rain automatically, with no animal reset. Temperature readings are illustrative, not live measurements.

## Particle pooling and performance

Three pools are allocated once:

| Pool | Capacity | Contents |
| --- | ---: | --- |
| Primary weather | 1,500 | Rain, snow, tornado debris |
| Ground effects | 240 | Rain splashes |
| Ambient | 85 | Drifting illuminated motes |
| **Total** | **1,825** | Hard ceiling across all pools |

A pool owns a fixed array of reusable particle objects and an active-count index. Acquisition initializes every field of the next inactive object. Removal swaps the last active object into the removed slot and decrements the count: O(1), no splicing, no new particle objects. Backward iteration avoids skipping swapped elements. Full pools decline emission. Particle lifetimes and position bounds ensure release.

Switching weather synchronously clears the primary and splash active counts and their fractional emission budgets. The old particles are immediately available for reuse. Ambient motes belong to their own pool. Puddles and light snow cover are bounded scalar accumulators that build up and recede naturally; they are not unbounded collections.

Additional strategies:

- One `requestAnimationFrame` loop uses real delta time, capped at 50 ms. Simulation substeps are at most 1/30 second, including at 2× speed.
- A single offscreen canvas caches the complex landscape. It redraws only on resize or quantized palette changes; seasonal transitions use 35 color steps.
- The visible backing store uses at most 2× device pixel ratio and a 3.5-million-pixel budget.
- HUD text refreshes at most five times per second. Paused scenes only redraw when dirty.
- Grass positions, leopard rosettes, and cloud descriptors are bounded and generated once. Seeded landscape texture remains stable between color updates.
- Visibility changes suspend/resume the same loop, without accumulating hidden-tab time. One `ResizeObserver` handles layout changes.
- Lightning has at most one short-lived polyline; no historical events, trails, or debug logs accumulate.

These fixed capacities and stable instance counts prevent growth over extended sessions. Console inspection is available through `window.wildfield`; `wildfield.snapshot()` returns a plain state summary suitable for an endurance audit.

## Lightning safety algorithm

Safety is conservative and based on **all six instantaneous animal positions**, not a predetermined strike zone:

1. Take each animal's full horizontal silhouette, accounting for scale and extra room for the trunk, tusks, mane, and tail.
2. Pad it by 38 world units plus its projected movement over 0.3 seconds (longer than the 0.21-second bolt lifetime).
3. Sort these intervals, merge their occupied extent while scanning, and find empty horizontal corridors inside the canvas.
4. Select an empty corridor. Constrain every point of the jagged lightning polyline and its rendered stroke to that corridor. There are no unconstrained branches.
5. Validate the complete bolt envelope against all padded intervals before displaying it and again **every simulation step while it is visible**. If an animal enters its corridor, discard the bolt immediately. Resizing also discards an existing bolt.
6. If no sufficiently wide corridor exists, show only a subtle cloud illumination and skip the ground strike.

Blocking the entire vertical column, rather than testing just the strike endpoint, also protects tall elephants and climbing leopards. Wildlife positions update before weather validation, so each rendered bolt has been checked against the positions drawn that frame.

## Tornado pursuit

Each step finds the nearest on-screen animal using squared Euclidean distance. The funnel moves along the normalized vector toward that animal at 6 world units per second, below every animal's ordinary walking speed. A 55-unit stand-off radius avoids resting directly on the target. Target selection is live, so wrapping animals or nearer passers-by can change the pursuit. Pooled particles orbit outward and rise with the funnel; layered translucent ellipses form the body.

## Responsive embedding

The world is always 700 logical units tall, with width derived from the scene's aspect ratio. Illustrations keep their proportions instead of stretching. At short viewport heights, the heading, footer, and extra caption are hidden, and the page becomes a fixed-height compact observatory. At **320 × 200**, the six weather controls become icon buttons, both season choices remain visible, and pause/speed/fullscreen stay within the scene. Every icon button retains an accessible label or text content and a title. The canvas remains the largest region, with no drawer covering it by default.

## Art and sources

All illustrations, paths, animal details, weather icons, and the acacia brand mark were created for this implementation. No external sprites, stock assets, or third-party code are used. Typography uses system sans-serif and Georgia.

## Verification

Checked directly through `file://` in Chromium without running a server. Browser checks covered all six weather buttons, both seasons, snow availability, position/state persistence on switching, pause, speed, keyboard shortcuts, and opening/closing the guide. No JavaScript errors were observed.

An accelerated **30-minute simulation audit** ran 54,000 updates at 1/30 second, with 150 weather selections and repeated seasonal changes. It exercised resting, drinking, trunk lifting, climbing, wrapping, and tornado pursuit. Pool objects and animal identities remained stable, occupancy stayed below the fixed capacity, and every visible lightning frame passed the clearance check. This audits simulation stability; it is not a claim of a 30-minute real-time rendering benchmark.

Layout and control hit-testing were checked at 320 × 200, 400 × 250, 640 × 400, 390 × 844, 768 × 1024, and 1440 × 900. Compact views had no page overflow, and all weather/season controls were reachable without opening a panel.
