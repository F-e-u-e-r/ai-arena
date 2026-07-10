# London in the Clouds

一個單頁、無後端的 Three.js 卡通浮空倫敦島。場景以基本幾何體組合出大笨鐘、倫敦眼、倫敦塔橋、河流與小型城市景觀，沒有使用外部圖片或紋理。

## 啟動

可直接開啟 `index.html`；若瀏覽器限制本機檔案的 CDN 載入，也可在此資料夾啟動任一靜態伺服器，例如：

```bash
python3 -m http.server 8000
```

再開啟 `http://localhost:8000/`。

## 核心設計

- Three.js `0.152.2` 由 jsDelivr CDN 載入，使用 `WebGLRenderer`、`MeshToonMaterial` 與陰影；相機旋轉由檔案內的原生 pointer orbit 控制器實作，因此不依賴另一個控制器函式庫。
- `DayNightCycle` 以 15 秒完成一輪，使用連續的 phase 及 smoothstep 混合天空色、霧、環境光、太陽/月亮位置與地標燈光。黃昏後大笨鐘、倫敦眼和塔橋的材質及 PointLight 會逐步亮起。
- `WeatherSystem` 預先建立 145 片楓葉、175 個雪花 mesh，透過重設位置重複利用，不在動畫迴圈中建立或銷毀物件。四季切換有 2.4 秒交叉淡化；春季另外使用透明薄霧平面和 FogExp2。
- 場景根節點以 `sin(elapsed)` 做輕微上下浮動；倫敦眼持續旋轉。滑鼠左右拖曳、觸控拖曳由原生 pointer orbit 控制器處理，並保留平滑阻尼讓動畫不會因拖曳停止。
- 以 `requestAnimationFrame` 搭配 `THREE.Clock.getDelta()` 驅動，delta 上限為 50ms，避免切換分頁回來時粒子跳躍。

底部的四個季節按鈕可手動切換，`A` 鍵或 AUTO 按鈕可開關每 12 秒自動換季；`1` 到 `4` 也可快速選擇季節。預覽尺寸針對 320×200、16:10 iframe 做了精簡 HUD。
