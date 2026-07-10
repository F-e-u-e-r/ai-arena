# Tokyo Maple Float

沒有外部圖像資產的 Three.js 卡通東京浮島。島中央是有格構斜撐與觀景台的東京鐵塔，周圍包含富士山與山腳神社、鳥居、三層塔、花園與池塘；大量楓葉持續飄落。

## 啟動

直接開啟 index.html，或在專案根目錄執行：

    python3 -m http.server

然後進入 tasks/tokyo-island/gpt-5-xhigh/。

## Three.js 與控制

作品以 Three.js 0.160.0 官方 jsDelivr CDN ES module 和 WebGLRenderer 繪製。相機使用原生 Pointer Events 的 orbit 控制：在畫布上左右拖曳即可旋轉視角，動畫不會在拖曳時暫停。T 鍵或右下 TIME 按鈕能將日夜循環切換為 4 倍速。

## 日夜與燈光

DayNightCycle 將 15 秒循環的太陽高度平滑映射到背景、霧、半球光、方向光、太陽與月亮位置。接近日落時，東京鐵塔、富士山神社、鳥居燈籠、三層塔的 emissive 材質與 PointLight 漸亮；日出前會淡出。整個島也有小幅、delta time 驅動的浮動。

## 楓葉與效能

MapleLeafSystem 一開始預建 150 個葉片節點，維持 136 個 active 葉子。葉子落出視野時會直接在上方重設，而不是建立或銷毀 Mesh；旋轉、左右擺動與下落速度都由各節點的 seed 和 delta time 控制。renderer 的 pixel ratio 上限為 1.7，避免高密度螢幕和 320 × 200 iframe 預覽產生不必要負擔。
