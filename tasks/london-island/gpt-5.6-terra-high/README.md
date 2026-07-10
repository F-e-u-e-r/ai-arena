# London in the Clouds

開啟 `index.html`，或以任意 static server 提供此資料夾。使用 CDN 載入 Three.js r160（WebGLRenderer 與 MeshToonMaterial）。

場景由 Island、BigBen、LondonEye、TowerBridge 與 WeatherSystem 組成。日夜使用 15 秒正弦週期，連續驅動天空、環境光、太陽/月亮、霧和建築 emissive 燈光；四季按鈕切換後以顏色／霧密度平滑過渡。

WeatherSystem 預先配置 320 個粒子 Mesh，依季節啟用楓葉或雪花，落出島下方即重新定位，不配置新物件。春季使用較高密度的柔霧，夏季則清澈明亮。滑鼠或觸控水平拖曳會旋轉世界；rAF 以 `Clock.getDelta()` 做所有時間更新。介面在 320×200 時縮小字級與控制鍵，保留場景和互動。
