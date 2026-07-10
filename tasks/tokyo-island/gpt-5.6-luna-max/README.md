# Tokyo Island / Maple Hour

一個單頁、無後端的 Three.js 卡通東京浮空島。東京鐵塔位於中央，周圍安排富士山、鳥居、三層小寺塔、池塘與楓樹；所有美術均由基本幾何體及程式化材質組合，沒有外部圖片或紋理。

## 啟動

可直接開啟 `index.html`。若瀏覽器限制本機檔案的 CDN 載入，請在此資料夾使用靜態伺服器：

```bash
python3 -m http.server 8000
```

再開啟 `http://localhost:8000/`。

## 核心設計

- Three.js `0.152.2` 由 jsDelivr CDN 載入，使用原生 `WebGLRenderer`、`MeshToonMaterial` 與陰影；相機旋轉由檔案內的原生 pointer orbit 控制器實作，不依賴其他 3D/遊戲引擎。
- `DayNightCycle` 以 15 秒為完整週期，利用連續 phase 與 smoothstep 在白天、黃昏、夜晚和黎明間混合天空色、霧、太陽/月亮位置、環境光及東京鐵塔/城市燈光。CYCLE 按鈕或 Space 可暫停/繼續。
- `MapleLeafSystem` 一次建立 180 個楓葉 mesh，動畫只更新位置、旋轉和比例；落到底部後重設到天空，避免長時間運轉時建立/銷毀物件造成 GC 尖峰。
- 浮空島以 `sin(elapsed)` 上下漂浮，楓葉在下降時加入左右擺動、深度漂移與三軸旋轉。原生 pointer orbit 控制器支援滑鼠和觸控拖曳，並保留阻尼。
- 使用 `requestAnimationFrame` 與 `THREE.Clock.getDelta()`，delta 上限為 50ms。HUD 只保留小型狀態列，320×200 的 16:10 iframe 仍能看見主塔、島體和楓葉。
