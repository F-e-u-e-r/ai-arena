# London Above the Clouds

卡通式漂浮倫敦縮景，包含大笨鐘、倫敦眼、塔橋、泰晤士河、四季氣候與 15 秒日夜循環。所有造型均由程式與 Three.js 基本幾何建立，沒有外部圖片或模型素材。

## 啟動

直接開啟 `index.html`，或在 repository 根目錄執行 `python3 -m http.server 8000` 後造訪 `http://localhost:8000/tasks/london-island/gpt-5-high/`。Three.js `0.160.0` 由 jsDelivr CDN 的一般 `<script>` 標籤引入。

## 系統設計

- `Island` 建立島體、泰晤士河及浮動根節點；`BigBen`、`LondonEye`、`TowerBridge` 各自封裝造型與夜間自發光材質。
- `DayNightCycle` 以 15 秒為一週，對四個色彩關鍵影格做平滑插值，同時移動太陽、月亮、調整霧、環境光與主光；黃昏到黎明間用 smootherstep 漸亮地標。
- `WeatherSystem` 每 12 秒自動換季，也可用底部按鈕指定。霧、暖光、葉片與雪量在轉場中連續混合。
- 秋葉和雪使用固定容量的 `InstancedMesh` 物件池。粒子落出島底即原地重設，不建立或銷毀 Mesh；每幀僅更新可見 instance matrix。
- 相機控制直接使用 Pointer Events；水平拖曳改變軌道角度，垂直拖曳微調俯角，動畫迴圈不因拖曳中斷。未操作時有極慢自動環繞。

渲染使用 `requestAnimationFrame` 與 `THREE.Clock.getDelta()`，delta 上限設為 50ms，避免背景分頁恢復時物理跳躍。resize 會重算相機比例與像素比；320×200 時 HUD 自動縮成四個圖示按鈕。
