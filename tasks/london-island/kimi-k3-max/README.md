# 漂浮倫敦島與四季天氣 (Three.js) — Kimi K3

卡通風格 3D 浮空倫敦島：大笨鐘、倫敦眼、倫敦塔橋，四季天氣（春霧 / 夏日 / 秋楓 / 冬雪）平滑過渡，15 秒日夜循環與自動亮燈。

## 如何啟動

- **直接開啟**：用瀏覽器打開 `index.html` 即可（Three.js 走 https CDN，`file://` 下可正常運作）。
- **或**用 static server：`npx serve .` / `python3 -m http.server`，再開 `tasks/london-island/kimi-k3/`。
- 需要網路（Three.js 由 unpkg CDN 載入），無後端、無其他相依。

## Three.js 版本與引入方式

- **r160 UMD**：`<script src="https://unpkg.com/three@0.160.0/build/three.min.js">`
- 刻意使用 **classic script（非 ES module）**：ES module 在 `file://` 下會被瀏覽器 CORS 擋住，classic script 讓「直接開啟 index.html」與 gallery 的 http(s) iframe 兩種方式都能跑。色彩空間 / encoding 等版本差異以 feature-detect 處理（相容 r134+）。

## 日夜循環與四季氣候：時間控制與過渡邏輯

### 日夜（`DayNightCycle`，15 秒 / 週期）
- `t ∈ [0,1)`，`t=0` 日出、`0.25` 正午、`0.5` 日落、`0.75` 午夜；太陽 / 月亮沿同一軌道相對運行。
- 天空漸層、太陽色溫、方向光 / 半球光強度定義在 **8 個環狀 keyframe**（`SKY_KEYS`），每幀取所在區間做線性插值 → 全程平滑無跳變。
- **方向光只有一支**：白天追太陽、夜裡追月亮（切換點在地平線以下），影子方向永遠合理且只需一份 shadow map。
- **自動亮燈**：`lampFactor = 1 - smoothstep(0.02, 0.10, sunHeight)`。黃昏太陽下沉穿越地平線附近時平滑 0→1（大笨鐘鐘面、倫敦眼輪框、塔橋燈帶 emissive + PointLight 漸亮）；黎明前太陽回升時反向關燈。
- 彩蛋：大笨鐘四面時鐘的指針顯示的是**場景時間**（15 秒走 24 小時）。

### 四季（`SeasonSystem`，45 秒 / 季，6 秒 crossfade）
- 狀態機持有 4 維**季節權重**；切季時從目前權重快照 smoothstep 淡入新一季的 one-hot 向量。
- 所有季節參數（霧遠近、日照強度 `warm`、草地 / 樹木 / 河水顏色、三種粒子強度）都是**權重加權混合的連續值** → 過渡期楓葉與雪會自然交叉淡化，不會瞬間切換。
- 春季：晨霧（大片柔邊 sprite 漂移）+ 場景 fog 加密 + 櫻花粉樹；夏季：日照 ×1.32、視野清澈、色彩飽和；秋季：楓葉系統全開、草木轉金；冬季：降雪、霜白色調、河面轉淡藍結冰色。
- 按鈕 / 鍵盤 `1-4` 手動切季（之後停用自動輪轉），`A` 或 Auto 鈕恢復自動；`N` / 🌗 鈕跳到下一個日夜階段。

## 粒子系統與效能優化策略

- **楓葉：單一 `InstancedMesh`（固定 pool 220）** — 1 次 draw call；物件池永不增刪，非秋季以矩陣縮放為 0 隱藏，回秋季再放大 → 零 GC 壓力。每片葉子有獨立下墜速度、sin 橫向擺動（振幅 / 頻率隨機）與三軸自轉；落到地面以下即在天空範圍內回收重生（無縫循環）。楓葉外形為程式產生的五裂片 `Shape`。
- **雪：`Points` + 固定 `Float32Array` buffer（700 點）**，落地循環回頂；透明度跟隨冬季權重，權重歸零直接 `visible = false` 跳過更新。
- **春霧：`Points` 大柔邊 sprite（70 點）** 緩慢漂移，透明度 0.13 上限配合場景 fog。
- 柔邊貼圖由 **canvas 執行期產生**（radial gradient），全場無外部素材。
- 主迴圈 `requestAnimationFrame` + `deltaTime`（clamp 50ms，切分頁回來不暴衝）；迴圈內**零物件配置**（Vector3 / Color / Matrix4 全部預建重用）；像素比上限 2；PointLight 僅 3 盞（大笨鐘 / 倫敦眼 / 塔橋）且夜間才開；懸索等小物件關閉投影。

## 相機旋轉控制的實作方式

- **自實作 `CameraRig`**（非 OrbitControls，減少相依並完全掌控手感的球面座標環繞）：
  - 滑鼠 / 觸控**拖曳**改變方位角 θ 與極角 φ（φ 限制在 25.8°–83°，不會翻到島底）；`setPointerCapture` 保證拖出視窗仍連貫。
  - 放開後保留**慣性速度**，每幀指數阻尼衰減；閒置 3 秒後緩慢自動旋轉（一拖曳立即接管）。
  - **滾輪縮放**（`passive: false` + `preventDefault` 避免頁面捲動），半徑限制 19–58。
  - 拖曳與動畫共用同一個 rAF 迴圈 → 拖曳過程中場景持續動畫。

## 檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 頁面骨架、HUD markup、CDN 引入 |
| `style.css` | HUD / 按鈕 / 小尺寸 embed 的收折樣式 |
| `main.js` | 全部場景邏輯（class 分區註解） |

## 操作

- 拖曳旋轉視角、滾輪縮放；按鈕或 `1-4` 切季、`A` 自動輪轉、`N` 跳轉日夜。
- HUD 顯示目前季節 / 日夜階段 / FPS 與粒子數（debug）。
- 320×200（16:10）iframe 預覽下，標題與 debug 自動收折、按鈕縮為 emoji，場景與全部控制仍可用。
- 除錯用 URL 參數：`?ff=<秒>` 載入時快轉日夜與季節狀態（例如 `?ff=8` 夜晚、`?ff=95` 秋季、`?ff=135` 冬季），供截圖測試與預覽特定狀態。
