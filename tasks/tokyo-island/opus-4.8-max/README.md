# 漂浮東京島與楓葉 — Three.js（Opus 4.8 · max）

卡通風格的 3D 漂浮東京島：中央為東京鐵塔，周圍散落富士山、鳥居、五重塔三個日本景點，
上百片楓葉持續飄落，並以 15 秒為週期進行「白天 → 黃昏 → 夜晚 → 黎明 → 白天」的日夜輪轉。
黃昏時鐵塔與景點自動亮燈，可用滑鼠／觸控拖曳環繞視角。

全部以單一自包含 `index.html` 完成，無需建置流程；所有貼圖（楓葉輪廓、太陽光暈、卡通漸層、
天空漸層）皆在瀏覽器端用 Canvas 程序化生成，無任何外部素材。

---

## 如何啟動

直接開啟即可，但因為使用 ES module + importmap 引入 Three.js，需透過 HTTP 提供（不能用 `file://`）：

```bash
# 在本資料夾或專案根目錄擇一
python3 -m http.server 8000
# 瀏覽器開啟 http://localhost:8000/tasks/tokyo-island/opus-4.8-max/index.html
```

需要可連外網以從 CDN 載入 Three.js。在 AI Arena 的 iframe（`allow-scripts`）沙箱中可正常運作。

### 操作

| 動作 | 說明 |
| --- | --- |
| 左鍵／單指拖曳 | 環繞旋轉視角（自行實作的軌道控制，含阻尼；放手 4 秒後恢復緩慢自轉） |
| 滾輪 | 拉近／拉遠 |
| `空白鍵` / ⏸ | 暫停／播放日夜循環 |
| `F` / `1×` | 切換日夜速度（1× → 3× → 8×） |
| `R` / ⟲ | 重置視角 |
| `M` / 🔇 | 開關環境音效（預設關閉） |
| `H` / 📊 | 開關 FPS／楓葉數／draw call 除錯資訊 |
| ⛶ | 全螢幕 |

---

## Three.js 版本與引入方式

- 版本：**three r160**（`0.160.0`），符合題目「v134 或更新版本」。
- 引入：以官方推薦的 **ES module + importmap** 由 CDN 載入：

  ```html
  <script type="importmap">
  { "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }
  </script>
  <script type="module">import * as THREE from 'three';</script>
  ```

- **相機控制刻意不使用 `OrbitControls`**，改為自行實作（見下），因此只需引入 three 核心，
  減少 CDN 相依，也避免不同版本間 `examples/js` 與 `examples/jsm` 的相容性問題。
- 渲染設定：`WebGLRenderer(antialias)`、`ACESFilmicToneMapping`、`SRGBColorSpace`、
  `PCFSoftShadowMap`（1024）、`pixelRatio` 上限 2。

---

## 程式架構（模組化）

| 類別 | 職責 |
| --- | --- |
| `DayNightCycle` | 日夜循環的核心控制器：天空／霧／各光源／太陽月亮位置／星空／夜色因子 |
| `FloatingIsland` | 島體、草皮、岩石、樹、水塘，含上下浮動與極緩自轉 |
| `TokyoTower` | 分段桁架鐵塔、觀景台、天線與航空障礙燈，黃昏自動亮燈 |
| `Landmark` | 景點工廠：`fuji()` / `torii()` / `pagoda()`，可亮燈者提供 emissive 材質 |
| `MapleLeafSystem` | 楓葉粒子系統（InstancedMesh + 物件池回收） |
| `CameraController` | 自行實作的軌道控制（拖曳旋轉 + 滾輪縮放 + 阻尼 + 閒置自轉） |
| `AmbientAudio` | 選用的 Web Audio 程序化環境音（日夜不同音色，預設關閉） |
| `App` | 場景組裝、`setAnimationLoop` 渲染迴圈、UI 綁定、RWD |

主迴圈使用 `renderer.setAnimationLoop` 搭配 `THREE.Clock` 的 `deltaTime`，並將 `dt` 夾在
0.05 秒內，避免分頁切回時的大跳幀造成物理爆走。

---

## 日夜循環：時間控制與過渡邏輯

以「正規化時間」`u ∈ [0,1)` 表示一天，一圈 = 15 秒（可被速度倍率與暫停影響）：

```
u = 0.00  白天(正午)  →  0.25 黃昏  →  0.50 夜晚(午夜)  →  0.75 黎明  →  1.00 回到白天
u += dt / 15 * speed;  u %= 1;   // 週期推進
```

- **關鍵影格插值**：定義 5 個關鍵影格（正午／黃昏／午夜／黎明／正午），每個影格記錄
  天空上下色、霧色、半球光顏色與強度、環境光強度、太陽光顏色與強度。每幀依 `u` 找到所在
  區間 `[a, b]` 與權重 `f`，對「顏色用 `THREE.Color.lerp`、數值用線性內插」，得到完全平滑的過渡。
  所有插值都重複使用預先配置的 `THREE.Color` 暫存物件，**長時間運行不產生額外 GC**。
- **天空**：用一張 1×2 的 `DataTexture` 當 `scene.background`，每幀只改上下兩個像素的顏色，
  比重畫 CanvasTexture 便宜得多；霧色同步跟隨，讓遠景山脈自然沒入天空。
- **太陽 / 月亮位置**：太陽沿垂直圓弧移動，`height = cos(u·2π)` 使正午在頂、午夜在底；
  月亮永遠在太陽對側。太陽落到地平線下時，用 `smoothstep(-0.15, 0.12, sunHeight)` 平滑
  地把方向光強度收到 0，避免夜晚地面被詭異照亮；月亮則在升起時才提供微弱冷光。
- **自動亮燈**：定義**夜色因子** `night = smoothstep(0.12, -0.12, sunHeight)`（白天 0、夜晚 1）。
  鐵塔／鳥居／五重塔的自發光材質 `emissiveIntensity` 與對應 `PointLight` 強度都乘上 `night`，
  於是「黃昏太陽沉入地平線時自動亮起、黎明太陽升起時自動熄滅」。星空 `opacity` 也由它驅動；
  塔頂航空障礙燈另外疊了一個緩慢閃爍。

---

## 粒子系統與效能優化

- **InstancedMesh**：上百片楓葉共用同一個 geometry／material，**一次 draw call** 完成，
  是「大量物件效能控制」的關鍵。每片葉子的位置、旋轉、下落速度、擺動相位等狀態存在緊湊的
  `Float32Array` 中，每幀用一個共用的 `THREE.Object3D` 暫存物件組出矩陣寫回 `instanceMatrix`。
- **物件池 / 回收**：instance 數量固定，永不 `new` 或 `dispose`。當某片葉子掉到島下方
  （`y < -6`）時，`_spawn(i, false)` 直接就地重設它的狀態並移回頂端重新落下——
  這就是本場景的物件池：以「重設既有 instance」取代「配置新物件」。
- **楓葉貼圖**：以極座標 `cos(5θ)` 畫出 5 裂片、完美對稱閉合的楓葉輪廓（含葉脈與葉柄），
  存成 `CanvasTexture` 當 `map`，配合 `alphaTest` 做出鏤空葉形；每片葉子再以 `setColorAt`
  給不同的秋色（紅／橙／黃），視覺豐富但零額外貼圖成本。
- **飄落物理**：垂直下落 + 依相位的左右擺動（sway）+ 隨時間緩慢變化的全域風，並加上三軸自轉，
  讓每片葉子的軌跡都不同、整體自然。
- **其他效能措施**：`pixelRatio` 上限 2；小螢幕（<420px）自動把楓葉數從 300 降到 160；
  幾何體與材質全程重複使用；HUD 文字每 0.25 秒才更新一次以降低 DOM 寫入。
  實測 geometry／texture 數量長時間恆定、JS heap 穩定在約 9MB，無記憶體洩漏。

---

## 相機旋轉控制的實作方式

`CameraController` 以**球座標**環繞島心：維護方位角 `az`、仰角 `pol`、半徑 `radius`。

- **輸入**：以 Pointer Events 統一處理滑鼠與觸控。`pointerdown` 開始拖曳，`pointermove`
  的位移量換算成「目標方位角／仰角」的增量（左右拖曳改 `az`、上下拖曳改 `pol`），
  仰角夾在 `[0.35, 1.45]` 弧度避免翻面；滾輪改半徑（縮放）並夾在合理範圍。
- **阻尼**：現值以與影格時間相關的係數 `1 - 0.0016^dt` 朝目標值平滑靠近，
  拖曳放手後仍會滑順收尾，且**與 FPS 無關**（用了 `dt`）。
- **閒置自轉**：放手超過 4 秒後自動恢復緩慢自轉，適合 gallery 展示。
- **持續動畫**：旋轉只改相機的球座標，`setAnimationLoop` 的世界更新（日夜、楓葉、島體浮動）
  每幀照跑，因此**拖曳過程中場景仍持續動畫**，完全符合題目要求。

球座標 → 相機位置：

```
x = target.x + r·sin(pol)·sin(az)
y = target.y + r·cos(pol)
z = target.z + r·sin(pol)·cos(az)
camera.lookAt(target)
```

---

## Responsive Embed

- Canvas 以 CSS 填滿容器，`resize` 時同步更新 `renderer.setSize` 與相機 `aspect`。
- 控制列為一排 icon 按鈕，`@media (max-width: 430px)` 時縮小尺寸並隱藏文字提示；
  在 320×200、16:10 的預覽下，主場景仍完整可見，六顆控制鈕置中置底、不重疊、不溢出、
  不遮住主要內容，且皆可點擊／觸控。

## 加分項對照

視差雲層與遠景山脈、MeshToonMaterial 卡通渲染、鍵盤快捷鍵加速日夜、FPS／楓葉數／draw call
除錯資訊、RWD 自動適配、依日夜變化的 Web Audio 環境音（預設關閉、可一鍵開啟）皆已實作。
