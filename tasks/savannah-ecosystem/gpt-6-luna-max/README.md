# Field Notes — Savannah Ecosystem

A self-contained African savannah scene built with native HTML, CSS, and the Canvas 2D API. The animals, trees, terrain, clouds, and weather are original vector drawings made in Canvas; there are no external assets, libraries, services, or backend requirements.

## Start

Open `index.html` directly in a modern browser. The page also works from any static file server. It is sized for a 16:10 embed and keeps its scene and controls usable at 320 × 200.

Choose one of the six weather icons along the bottom. The season button switches between dry and wet season, and the season changes automatically every 60 seconds. Keyboard shortcuts are `1`–`6` for weather and `S` for season.

## Rendering and structure

Canvas is used because the landscape and wildlife need many coordinated moving shapes with a consistent painter's order. One animation loop uses `requestAnimationFrame` and a clamped delta time. The canvas is resolution-scaled for device pixel ratio and resized through `ResizeObserver`.

The code is organized into `SeasonManager`, `WeatherManager`, `ParticleSystem`, `WildlifeSystem`, `SavannahRenderer`, and species classes (`Lion`, `Elephant`, `Leopard`). The renderer draws a sky gradient, drifting cloud layers, distant ridges, acacia silhouettes, a waterhole, grasses, the animals, and weather. Palette colors ease toward their next seasonal/weather targets instead of popping.

## Animal behavior and seasons

Two lions travel together at a slow pace and alternate between patrol and short rests. Two elephants maintain a slow herd pace, lift and curl their trunks, and periodically drink; dry season makes drinking more frequent. Two leopards move alone, switch between stealth and quick dashes, and climb the featured acacia with a vertical animation. Every animal advances continuously across the scene and wraps from the right edge to the left; weather/season changes never reset its position.

Wet season increases activity and greenery. Dry season tightens herd movement and increases lion resting and elephant visits to water. Heavy rain and storms slow travel further. The snow option remains selectable in either season, but appears less often in the wet season to reflect its rarity in this setting.

## Weather, particles, and performance

`ParticleSystem` preallocates 1,100 reusable particle records. Emitters take records from a free stack; expired particles are removed by swapping with the last active entry and returned to the stack. Switching weather clears the active list back into that pool before the new emitter starts. Rain and snow rates are bounded, and emission simply stops when the pool is full. That avoids unbounded object creation during long sessions.

Rain darkens the ground and gradually raises puddle reflections. Snow uses slow drifting flakes. Tornado dust circles a funnel that follows whichever animal is currently nearest, at a capped 16 world units per second, so the chase remains slow. The scene and particle pool are reused for the full lifetime of the page.

## Lightning safety

Thunderstorm lightning picks from 48 candidate x-coordinates. For each candidate it measures horizontal clearance from every animal, subtracting 62% of that animal's body width. A bolt is created only if the best candidate still clears a further 64 world units. The active bolt rechecks the same clearance every frame because animals keep moving during the flash; if it is no longer safe, the renderer finds a new safe coordinate or omits the bolt. The flash and bolt are drawn in the sky layer before any animal, and the bolt is limited to the sky/horizon band.
