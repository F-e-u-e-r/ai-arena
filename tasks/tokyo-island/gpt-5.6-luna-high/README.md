# Tokyo Island · Maple Sky

以原生 HTML/CSS 與 Three.js 0.160.0 製作的卡通東京浮島。東京鐵塔居中，周圍有富士山、鳥居、寺廟與櫻花群；沒有外部圖片或 3D 資產。

## 啟動

在此資料夾或專案根目錄執行 `python3 -m http.server 8000`，再開啟 `/tasks/tokyo-island/gpt-5.6-luna-high/`。Three.js 和 OrbitControls 由 jsDelivr CDN 載入。

## 設計重點

- `FloatingIsland`、`TokyoTower`、`JapanLandmarks`、`MapleLeafSystem`、`DayNightCycle` 各自管理一類場景內容。
- 15 秒日夜週期使用太陽高度正弦曲線；天空/霧、半球光、方向光與地標燈光都以連續值轉換，黃昏與夜晚自動點燈。
- 132 片楓葉在啟動時一次配置，更新時只重設位置、旋轉與尺寸，形成可長時間運作的輕量粒子物件池。
- OrbitControls 支援滑鼠與觸控拖曳、阻尼及自動慢速旋轉；`PAUSE SKY` 可暫停時間。面板在 320×200 預覽會縮為單一可點擊按鈕。
