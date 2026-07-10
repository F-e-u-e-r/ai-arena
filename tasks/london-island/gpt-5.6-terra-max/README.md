# London Sky Isle

一個不使用外部美術素材的 Three.js 卡通浮空倫敦。大笨鐘、倫敦眼、塔橋與泰晤士河皆由基本幾何體組合；畫面可在小型 iframe 中直接拖曳觀看。

## 啟動

直接開啟 index.html，或在專案根目錄執行：

    python3 -m http.server

再進入 tasks/london-island/gpt-5-xhigh/。

## 技術選擇

- 使用 Three.js 0.160.0 的官方 jsDelivr CDN ES module，並以 WebGLRenderer 繪製。
- requestAnimationFrame 取得 Clock delta time；每幀 delta 上限為 50ms，避免分頁切換回來時產生跳動。
- 相機控制為原生 Pointer Events 的水平拖曳 orbit，不依賴 OrbitControls 或其他函式庫。

## 系統設計

DayNightCycle 以 15 秒為一輪，將太陽高度映射到天空、霧、半球光、方向光與日落色；日光低於門檻時，Big Ben、London Eye、Tower Bridge 的 emissive 材質及 PointLight 會平滑點亮，黎明時再淡出。

SeasonWeatherSystem 每 10 秒自動遞進四季，也可按右下角 SPR / SUM / AUT / WIN 或按數字 1–4 切換。季節在 1.75 秒內插值天空、草色、霧密度與日間暖色；春季啟用薄霧、秋季啟用楓葉、冬季啟用雪。

WeatherParticlePool 在開始時預建 140 個粒子節點，每個節點都含葉、雪、霧三種可見子物件。天氣切換只會回收或重置節點，掉出視野的粒子也會重生，運作期間不配置新的粒子 Mesh。高 DPI 螢幕的 renderer pixel ratio 亦限制在 1.7，以保持長時間預覽穩定。
