# 漂浮東京島與楓葉（Three.js）

由 Claude Fable 5（effort: max）以原生 HTML + CSS + Three.js 生成。
所有物件皆以基本幾何體（Cylinder / Cone / Box / Sphere / Plane）組合，
未使用任何外部模型或紋理 —— 楓葉與光暈貼圖都是執行期用 Canvas 2D 畫出來的。

## 如何啟動

```bash
# 直接開啟
open index.html

# 或使用簡單 static server
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

### 為什麼 JS 內聯在 index.html？

Gallery 以 `sandbox="allow-scripts"`（無 `allow-same-origin`）嵌入作品，此時
iframe 的 origin 是 `null`；**ES module** 載入本地 `main.js` 一律走 CORS 模式，
而一般 static server（如 `python3 -m http.server`）不會回 `Access-Control-Allow-Origin`
→ 模組會被瀏覽器封鎖。因此把主程式以 inline `<script type="module">` 放進
`index.html`（inline module 不需要 fetch 本地檔案），唯一的網路請求是
unpkg CDN（有 `ACAO: *`）。這讓作品在 **file://、任意 static server、
GitHub Pages 與 sandbox iframe** 下皆可執行；`style.css` 為一般樣式表
（no-cors），維持獨立檔案。程式內部仍是模組化的 class 結構（見下）。

## Three.js 版本與引入方式

- **three@0.170.0**（> v134 要求），透過 CDN importmap 引入：
  ```html
  <script type="importmap">
  { "imports": { "three": "https://unpkg.com/three@0.170.0/build/three.module.js" } }
  </script>
  ```
- 僅使用核心模組（`WebGLRenderer` 渲染），未引入任何 addons —— 相機控制為自行實作。

## 操作

| 操作 | 說明 |
| --- | --- |
| 滑鼠左右拖曳 | 環繞旋轉視角（含慣性；上下拖曳微調俯仰） |
| 滾輪 / 雙指捏合 | 縮放距離 |
| 雙擊 | 回到預設視角 |
| 底部 `1×` 按鈕或 `F` / `1` `2` `3` | 日夜循環加速（1× / 4× / 8×） |
| `D` 或 ⓘ | FPS / draw calls debug 資訊 |

閒置 4 秒後相機會自動緩慢環繞（gallery 待機展示用），一有互動立即交還控制權。

## 日夜循環的時間控制與過渡邏輯

- 完整輪轉週期 **15 秒**（`DayNightCycle.PERIOD`），`t ∈ [0,1)`：
  `0` 正午 → `0.25` 日落 → `0.5` 午夜 → `0.75` 日出 → 回到正午。
- 所有視覺通道由**關鍵影格色盤**（10 個 key）驅動，取樣時以 smoothstep 內插，
  因此天空三段漸層、霧色、平行光顏色/強度、半球光、星星透明度全部自然平滑過渡，
  不會有任何跳變。顏色物件在初始化時解析完畢，取樣過程零配置。
- **太陽與月亮**沿一條傾斜圓軌道對向運行（`sunDir = f(t)`，`moonDir ≈ -sunDir`）。
  天空 shader 以 `pow(dot(視線, 方向), 高次)` 畫出光暈圓盤，位置隨 t 連續變化。
  平行光（含陰影）白天跟隨太陽，日落後切為月光方向 —— 切換發生在兩者強度都
  接近 0 的時刻，因此不會看到影子跳動。
- **燈光開關是色盤的一個通道（`lamp`）**：`t = 0.24 → 0.31` 漸亮（黃昏開始，
  東京鐵塔窗帶 / 五重塔窗光 / 石燈籠自發光 + 2 盞 PointLight + 加法光暈 sprite
  一起淡入），`t = 0.60 → 0.675` 漸熄（黎明前）。天線頂端的紅色航空警示燈
  夜間以 sin 呼吸閃爍。

## 粒子系統與效能優化策略（楓葉物件池）

- 楓葉使用**單一 `InstancedMesh`**（650 個實例；小視窗自動降為 380），
  整個系統只佔 **1 個 draw call**。
- 實例數固定不增減 —— 這就是物件池：每片葉子的狀態存在平行 `Float32Array`
  （位置/落速/擺幅/相位/自旋/縮放/停留計時），更新迴圈**零配置**。
- 生命週期：高空重生 → 飄落（`y -= vy·dt`，x/z 以正弦左右擺動、雙軸自旋）→
  - 落在島面（半徑 < 8.8）：攤平並**跟著島的浮動停留 2~5 秒**，再回收重生；
  - 掉出世界（y < −16）：立即回收重生。
- 楓葉貼圖是執行期畫的 96×96 五瓣楓葉 Canvas（`alphaTest` 裁切，免排序），
  以 `setColorAt` 給每片實例五種秋色之一。
- 其他效能措施：`pixelRatio` 上限 2、小視窗陰影貼圖 1024、共用 3 階
  `gradientMap` 的 MeshToonMaterial、`deltaTime` 上限 50ms（分頁切回不暴衝）。

## 相機旋轉控制的實作方式

未使用 OrbitControls，`CameraRig` 以球座標自行實作：

- `pointerdown/move/up`（含 `setPointerCapture`）：單指/滑鼠拖曳改變方位角
  `theta`（水平環繞）與極角 `phi`（限制在 0.22π~0.48π 之間，避免翻轉）；
  放開後 `vTheta` 以指數衰減延續慣性。
- 兩指捏合與滾輪縮放 `radius`（15~42 clamp）；雙擊重設視角。
- 每幀由 `(radius, phi, theta)` 反推 `camera.position` 並 `lookAt` 島心上方。
- 相機更新在同一個 `requestAnimationFrame` 主迴圈內，**拖曳過程中所有動畫
  （楓葉、浮島、日夜、雲）持續進行**。

## 場景內容（驗收對照）

- 浮空島：草皮/土層/頂點抖動的嶙峋岩錐 + 3 顆漂浮小岩塊，島體正弦浮動。
- 東京鐵塔：四支斜塔腳、橙白相間塔身、雙展望台（夜間窗帶自發光）、天線
  與紅色警示燈；夜間橙色 landmark 泛光。
- 日本景點 ×3：迷你富士山（雪帽）、紅鳥居、三重塔（金色相輪、夜間窗光），
  另有 5 棵秋色楓樹、2 座石燈籠、灌木與石板廣場。
- 卡通渲染：全場景 MeshToonMaterial + 3 階 gradientMap，ACESFilmic tone mapping。
- 雲層：7 組棉花雲繞島漂移（加分項）。

## Responsive Embed（320×200 驗證）

- HUD 僅三個元件（相位進度環 + 速度鈕 + debug 鈕），小尺寸自動縮小，
  不重疊、不溢出、不遮擋島體。
- 小視窗自動降低楓葉數與陰影解析度，維持流暢。

## 長時間運行

- 楓葉狀態為預先配置的 TypedArray，主迴圈無物件配置；
  無 `setInterval`；材質/幾何皆在啟動時建立，不會累積資源。
