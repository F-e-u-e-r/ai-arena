# Floating London Island — Four Seasons & Day/Night (Three.js)

卡通風漂浮倫敦島：大笨鐘、倫敦眼、倫敦塔橋，配上四季氣候（春霧、夏日、秋楓、冬雪）
與 15 秒完整日夜輪轉。原生 HTML + CSS + Three.js，無其他框架、無後端。

## 如何啟動

直接用瀏覽器開啟 `index.html` 即可（需要網路連線載入 Three.js CDN）。
或使用任一 static server：

```bash
npx serve .          # 或
python3 -m http.server 8000
```

## Three.js 版本與引入方式

- **版本**：`three@0.160.0`（> v134 要求）
- **引入**：`index.html` 內以 `<script type="importmap">` 將 `three` 指向
  `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`，
  程式以 ES module（`import * as THREE from 'three'`）撰寫。
  僅使用核心模組；**相機控制為自行實作**（未載入 OrbitControls）。
- **檔案安排**：`main.js` 為完整可讀源碼；`index.html` 內嵌同一份程式
  （由 `main.js` 直接複製）。原因：AI Arena gallery 以
  `sandbox="allow-scripts"` iframe（null origin）嵌入作品，外部 ES module
  檔案會被 CORS 政策擋下，內嵌是讓預覽在沙箱中可執行的標準做法
  （`style.css` 為 `<link>` 載入，不受 CORS 限制，維持獨立檔案）。
- 所有貼圖皆為**程序化生成**（Canvas 繪製楓葉剪影、柔霧漸層），無外部素材。

## 日夜循環（`DayNightCycle`）

- 正規化時間 `t ∈ [0,1)`，每幀 `t += dt / 15` → **15 秒完整輪轉**。
- 定義 8 個**關鍵影格**（白天 → 黃昏 → 夜晚 → 黎明 → 白天），每格記錄：
  天空頂/底色、太陽光色與強度、半球光、環境光、星星透明度、tone mapping 曝光。
  依 `t` 找相鄰兩格，以 `smoothstep` 插值 → 天空、霧色、光照全部自然漸變。
- **太陽/月亮軌道**：`φ = (t − 0.11)·2π`，太陽沿傾斜圓軌道繞場景一圈，
  月亮恆在正對面。日光方向光在地平線以下平滑熄滅、月光（冷藍色）在夜間淡入。
- **亮燈控制**：`lampFactor` 在 `t ∈ [0.30, 0.34]`（黃昏開始）淡入為 1、
  在 `t ∈ [0.76, 0.80]`（黎明前）淡出為 0。大笨鐘鐘面與窗戶、倫敦眼座艙、
  塔橋金頂、路燈、巴士車窗的自發光（emissive），以及三盞 PointLight
  （大笨鐘暖金、倫敦眼冰藍、塔橋暖金）皆統一乘上此係數 →
  黃昏自動亮燈、黎明前自動熄燈。
- 大笨鐘**時鐘指針**同樣以 `t` 驅動旋轉。

## 四季氣候（`SeasonSystem`）

- 連續季節相位 `p ∈ [0,4)`，自動模式每季 20 秒（全年 80 秒）。
- 每季前 80% 維持該季調色盤，**最後 20% 以 smoothstep 對下一季 crossfade**。
  混合的參數包含：草地色、樹葉色（春=櫻花粉、夏=深綠、秋=橘紅、冬=積雪白）、
  霧的 near/far（春季霧最濃 → 濕潤水氣感）、光色調（夏暖冬冷）、
  河水色與波幅（冬季結冰趨於靜止）、以及三種天氣粒子的生成權重。
  所有屬性走同一條混合曲線，確保整個氣候一起平滑過渡。
- **手動切換**（UI 按鈕 / 快捷鍵 `1`–`4`，`A` 回自動）：相位朝目標季節
  以固定速度緩動，因此手動切換同樣是漸變而非跳變。
- 季節表現：
  - **春**：濃霧（fog near 拉近）+ 9 片 billboard 晨霧緩慢漂移
  - **夏**：霧最遠、暖色光、飽和綠意
  - **秋**：楓葉粒子（旋轉 + 左右正弦擺動）大量飄落
  - **冬**：雪花粒子飄落、草地與樹葉轉為積雪白、河面結冰

## 粒子系統與效能優化

- 楓葉（160）與雪花（520）各用一個 **`InstancedMesh` 物件池**：
  記憶體一次配置、粒子永不增刪，每幀僅 compose `instanceMatrix`，
  **主迴圈零配置（zero-allocation）→ 無 GC 卡頓、長時間運行穩定**。
- **回收機制**：「目標活躍數 = 池上限 × 季節權重」。權重上升時閒置粒子
  從高空重新投放；下降時粒子落到回收線後改為 scale=0 隱藏，
  數量隨季節過渡自然增減，不會瞬間出現/消失。
- 粒子物理：垂直下落 + 水平雙軸正弦擺動 + 自體旋轉（擺動同步帶動翻轉），
  每顆有隨機落速/擺頻/相位。
- 楓葉貼圖為 Canvas 程序化楓葉剪影，經 `instanceColor` 產生五色變化
  （一次 draw call 畫完全部楓葉）。
- 其他：`deltaTime` 夾限 0.05s（背景分頁回復不瞬移）、pixelRatio 上限 2、
  單一 1024 shadow map、共用 4 階 toon gradient、HUD 僅在內容改變時寫 DOM。

## 相機旋轉控制（自行實作 `CameraRig`）

- Pointer Events：拖曳改變 yaw（左右）與 pitch（上下，夾限 0.05–1.1 rad），
  滾輪縮放距離（20–60）。`touch-action: none` 讓觸控裝置同樣可拖曳。
- 相機位置由球座標計算後 `lookAt` 島心；渲染迴圈獨立於輸入事件，
  **拖曳過程中場景持續動畫**。
- 閒置 5 秒後自動緩慢環繞（gallery 預覽時畫面不會靜止）。

## 卡通美術

- 全場景 `MeshToonMaterial` + 共用 4 階漸層貼圖（強烈色階卡通渲染），
  搭配 flat shading 低多邊形造型與 ACES tone mapping。
- 加分項：卡通雲層環繞、泰晤士河微波水面（冬季結冰）、往返行駛的
  紅色雙層巴士、紅色電話亭、漂浮碎石、星空、FPS/粒子數 debug、RWD。

## Responsive Embed（320×200）

- HUD 全部貼邊角：狀態（左上）、debug（右上）、季節控制列（底部置中）。
- `max-width: 420px` media query 下 HUD 縮小、debug 與提示讓位給主場景；
  季節按鈕仍為 24px 可點擊圓鈕，不重疊、不溢出。
