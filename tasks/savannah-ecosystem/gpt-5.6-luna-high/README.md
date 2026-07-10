# Savannah Field · Ecosystem

這是完全原生的 Canvas 2D 非洲大草原生態系統，沒有使用任何框架、函式庫或外部圖片。六隻動物（兩獅、兩象、兩豹）持續由左向右穿越，抵達右側後回到左側；季節、天氣與動作狀態會即時影響牠們。

## 啟動

在此資料夾或專案根目錄執行 `python3 -m http.server 8000`，再開啟 `/tasks/savannah-ecosystem/gpt-5.6-luna-high/`。也可直接開啟 `index.html`。

## 核心系統

- `Animal` 是共同基底，`Lion`、`Elephant`、`Leopard` 覆寫繪圖與行為；獅群/象群以慢速群聚前進，豹有高速隱密移動與週期性攀爬。
- `WeatherManager` 管理 Sunny、Rain、Heavy Rain、Snow、Thunderstorm、Tornado。所有雨滴、雪、塵粒都來自 `ParticlePool`，天氣切換時清空 active list 回收到 free list，避免逐幀配置物件。
- 雷暴每次選擇一條與所有動物即時位置距離最大的候選 x 軸，形成安全雷擊走廊；龍捲風則以低速追逐最近動物。兩個演算法都不會重置動物位置。
- 乾/濕季每 60 秒自動輪換，也可按面板按鈕切換；背景色、草原色和動物速度/群聚活性使用平滑過渡。主迴圈使用 `requestAnimationFrame` 與 capped `deltaTime`。
- 畫布採 1000×625 虛擬座標並依 device pixel ratio resize，控制列在 320×200 嵌入尺寸會縮排為兩行，六種天氣與季節仍可操作。
