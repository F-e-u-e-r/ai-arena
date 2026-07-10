# London Island · Four Seasons

一個無外部素材的 Three.js 卡通漂浮倫敦島。中央大笨鐘、倫敦眼與塔橋由基本幾何體組合，畫面可直接以靜態伺服器提供。

## 啟動

在此資料夾或專案根目錄執行 `python3 -m http.server 8000`，再開啟 `/tasks/london-island/gpt-5.6-luna-high/`。Three.js 0.160.0 與 OrbitControls 由 jsDelivr CDN 載入。

## 設計重點

- `Island`、`BigBen`、`Landmark`、`WeatherSystem` 與 `DayNightCycle` 分離，主迴圈使用 `requestAnimationFrame` 和上限為 50ms 的 `deltaTime`。
- 日夜循環固定 15 秒：以正弦曲線計算太陽高度，平滑插值天空、霧、半球光和方向光；黃昏到夜間自動啟用地標燈光。
- 春季使用低透明度霧球，秋季啟用楓葉、冬季啟用雪花；150 個預先建立的 mesh 以重設座標的方式循環使用，沒有逐幀建立/刪除粒子。
- OrbitControls 提供滑鼠/觸控拖曳旋轉與阻尼；resize 會同步更新相機比例。底部面板在 320×200 iframe 仍保留四個可點擊季節按鈕。
