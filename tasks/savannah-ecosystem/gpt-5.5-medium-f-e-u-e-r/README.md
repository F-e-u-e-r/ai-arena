# Savannah Ecosystem

Run by opening `index.html` directly or by serving the repository with any static server.

This submission uses Canvas 2D because the task is focused on many lightweight, stylized actors and particles. The renderer stays dependency-free and draws all animals, background layers, weather, and UI state from JavaScript classes.

The system includes lions, elephants, and leopards entering from the left and wrapping after the right edge. Lions favor group movement and occasional slower patrols, elephants move slowly and drink more in dry season, and leopards move faster with periodic tree-climbing motion. Wet season increases activity, while heavy rain and storms reduce speed.

Weather uses a fixed `ParticlePool` of 900 reusable objects. Weather changes call `clear()` so old rain, snow, and dust particles are recycled instead of accumulating. Rain, heavy rain, snow, thunderstorm, and tornado all share this pool.

Thunderstorm lightning computes current animal safety zones before every strike. It samples candidate strike positions until the bolt is outside each animal radius. The tornado continuously finds the nearest animal and eases toward it slowly, while spawning pooled dust particles.

Dry and wet seasons rotate automatically every 60 seconds and can also be toggled by the season button or the `S` key. Number keys `1` through `6` switch weather.
