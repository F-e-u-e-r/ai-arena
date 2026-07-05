# 漂浮東京島與楓葉（Three.js）— Sonnet 5 · max effort

## 如何啟動

單一 self-contained `index.html`，直接用瀏覽器開啟，或在本目錄跑一個 static server：

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000/
```

不需要建置流程、不需要安裝任何套件。

## Three.js 版本與引入方式

透過 `importmap` 從 CDN 載入 ES module 版本，不需要 bundler：

```html
<script type="importmap">
{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }
</script>
```

程式碼中 `import * as THREE from 'three'` 會解析到上面這個 CDN URL。沒有使用任何外部貼圖／模型／音檔，楓葉形狀與卡通漸層貼圖都是程式內以 `THREE.Shape` 與 `<canvas>` 即時產生。

## 架構總覽

| 類別 / 模組 | 職責 |
| --- | --- |
| `Island` | 岩石底座、懸浮碎石、草地、灌木；每幀做上下浮動 + 極輕微翻滾 |
| `TokyoTower` | 分層漸縮的紅白鐵塔，含頂端警示燈（`beacon`）與夜間泛光 `PointLight` |
| `Landmark` | 可配置的日本景點，`type` 為 `fuji` / `torii` / `pagoda` 三種變化 |
| `MapleLeafSystem` | `InstancedMesh` + 物件池管理的楓葉粒子系統 |
| `DayNightCycle` | 15 秒日夜循環的關鍵影格內插、太陽／月亮位置、燈光開關 |
| `OrbitLite` | 自行實作的拖曳旋轉相機控制（球座標 + 慣性） |

`Island` 是所有地面建物（鐵塔、三個景點、兩棵楓樹）的父節點，因此浮動動畫會讓整座島與其上建物一起晃動，而不是各自獨立飄浮。楓葉、太陽／月亮、星星、雲層、遠山、天空穹頂則是獨立掛在 `scene` 下的世界座標元素。

## 日夜循環的時間控制與過渡邏輯

一個完整循環固定為 15 秒（`CYCLE_LEN`），以正規化相位 `phase = (cycleSeconds % 15) / 15 ∈ [0,1)` 驅動所有時間相關效果。

`DayNightCycle` 內建一組關鍵影格時間軸（白天 → 黃昏 → 暮光紫 → 夜晚 → 暮光紫 → 黎明 → 白天），每一段用 `smoothstep` 內插到下一格：

```
t=0.00 白天 ── t=0.28 白天 ── t=0.40 黃昏 ── t=0.46 暮光紫 ── t=0.56 夜晚
── t=0.75 夜晚 ── t=0.80 暮光紫 ── t=0.86 黎明 ── t=0.97 白天 ── t=1.00 白天
```

**為什麼中間插入「暮光紫」？** 一開始直接讓黃昏（橘色）以 RGB 線性內插到夜晚（深藍），會在中途出現一段不好看的泥灰棕色 —— 因為橘色與深藍在色相上距離很遠，線性插值的路徑會穿過低彩度的中間色。加入一個色相上更居中的紫色關鍵影格後，過渡路徑變成「橘 → 紫 → 藍」，兩段都是相鄰色相，視覺上乾淨很多。

每幀 `DayNightCycle.update()` 會：
1. 用 `sampleAt(phase)` 找出目前落在哪兩個關鍵影格之間，取得已 `smoothstep` 過的局部 t。
2. 內插天空穹頂的 top/bottom 顏色、`Fog` 顏色、`HemisphereLight` 顏色與強度、太陽／月亮方向光的顏色與強度、星星的 opacity。
3. 用同一個 `phase` 算出太陽與月亮在同一個大圓上的相反位置（相位差 180°），兩者的方向光位置與視覺球體位置分開計算（見下方效能筆記），確保永遠只有一個在地平線之上提供主要光源。
4. 依 `CYCLE` 常數算出 `lightsOn`（0..1）：黃昏開始（`DAY_END`）後淡入，於 `DUSK_PEAK` 前完成「亮燈」；黎明峰值（`DAWN_PEAK`）後開始淡出，於 `LIGHTS_OFF`（早於白天完全回歸）前完成「熄燈」。鐵塔與三個景點的 `PointLight`／`emissiveIntensity` 都由這個統一係數驅動。

### 效能筆記：陰影相機的 near/far

太陽／月亮的「視覺球體」半徑刻意設得比「光源本身」的距離大很多（`SUN_R=85` vs `LIGHT_R=26`）——兩者用同一個角度計算方向，只是距離不同。這是因為 `DirectionalLight` 的陰影相機是以 orthographic frustum 環繞光源實際位置計算，如果讓方向光跟著視覺上很遙遠的太陽球體跑（例如 85 單位），陰影相機的 `near/far` 就必須跟著抓到很遠的範圍，換算下來精度浪費、也容易需要手動重算 `updateProjectionMatrix()` 才不會用到建構子預設的 frustum。拆開兩者後，光源固定在 26 單位的小半徑上，陰影 frustum 只需要 `near≈10 / far≈42` 就能穩定罩住整座島。

## 粒子系統與效能優化策略

楓葉系統 `MapleLeafSystem` 是本題效能的核心：

- **物件池**：用固定長度的 `Float32Array`（位置、下落速度、自轉、擺盪相位/振幅、縮放…）儲存 260 片葉子的狀態，整個程式生命週期沒有任何一片葉子被「建立」或「刪除」——落到島體底部以下就地重寫同一個陣列索引的狀態，重新從頂端「重生」。
- **`InstancedMesh` 而非 260 個獨立 Mesh**：一次 draw call 畫完全部葉子，GPU 成本幾乎與葉子數量無關。
- **`frustumCulled = false`**：因為實例散佈的世界範圍遠大於幾何體本身算出來的包圍球，若不關掉會在葉子還在畫面內時就被錯誤裁剪消失。
- **每幀重複使用暫存物件**（`Matrix4`／`Quaternion`／`Euler`／`Vector3`）：組合每片葉子的變換矩陣時不 `new` 任何東西，避免長時間運行後由大量短命物件造成的 GC 停頓。
- **不投影／不接影**：葉子數量多但體積小，關掉陰影對視覺影響很小，換來明顯效能餘裕。
- **`requestAnimationFrame` + `THREE.Clock`**：主迴圈用顯式 `requestAnimationFrame` 搭配 `clock.getDelta()`，並將單幀 `dt` 限制在 50ms 以內，避免分頁切到背景再切回來時，累積的巨大 `dt` 造成葉子瞬間掉出畫面或日夜循環跳格。

葉子形狀本身是用 `THREE.Shape` 以二次貝茲曲線描出的五裂楓葉輪廓（`ShapeGeometry`），沒有使用任何外部貼圖。卡通材質的漸層貼圖（`MeshToonMaterial.gradientMap`）也是用一個 4 像素寬的 `<canvas>` 即時產生。

## 相機旋轉控制的實作方式

沒有使用 three.js 官方 `OrbitControls`，改自行實作 `OrbitLite`：

- 以球座標（`theta` 方位角、`phi` 極角、`radius` 距離）描述相機相對於目標點的位置。
- 監聽 `pointerdown` / `pointermove` / `pointerup` / `pointercancel`（Pointer Events 統一處理滑鼠與觸控，行動裝置也能拖曳），拖曳中用 `setPointerCapture` 確保滑鼠移出 canvas 範圍時仍能持續收到事件。
- 放開拖曳後，最後一刻的角速度會以阻尼係數逐幀衰減，帶來一小段「甩動」慣性再靜止，手感比瞬間停止更自然。
- `phi` 限制在 `[0.55, 1.5]` 弳度之間，避免使用者把相機拖到地平線以下或死板的正上方。
- 滾輪縮放 `radius`（`[10, 30]` 範圍），純粹是加分項，不影響拖曳旋轉的核心需求。
- 拖曳狀態與動畫迴圈完全independent：`OrbitLite.update()` 每幀都會被呼叫，不論使用者是否正在拖曳，場景（楓葉、日夜循環、島體浮動）都持續播放動畫。

## Responsive Embed（320×200 / 16:10）

- HUD（FPS／楓葉數／日夜標籤）、底部操作提示、右上角音效開關全部是 `position:fixed` 疊加層，字級用 `@media (max-height:220px), (max-width:360px)` 在極小尺寸下自動縮小。
- 三者分別位於左上、右上、下方三個不同角落，即使字級縮小也不會互相重疊或蓋住 3D 場景主體。
- 唯一的「操作」是在畫面任意處拖曳旋轉，不受尺寸影響；音效開關是唯一需要點擊的按鈕，固定在右上角、尺寸維持在可觸控範圍。
- `resize` 事件 + `ResizeObserver` 雙重保險，確保 iframe 尺寸被父頁面動態調整時，canvas／camera aspect 都能即時同步更新。

## 加分項目對照

- ✅ `MeshToonMaterial` + 自製 4 階漸層貼圖，卡通渲染感
- ✅ 簡單雲層（低多邊形球體簇，緩慢飄移）
- ✅ 遠景山脈（靜態環狀山影，靠 `Fog` 融入地平線）
- ✅ 鍵盤快捷鍵：按 `T` 切換日夜循環 1x / 7x 加速，方便快速預覽整個循環
- ✅ FPS／楓葉粒子數 / 目前日夜狀態的 debug HUD
- ✅ RWD：`resize` + `ResizeObserver` 自動適配畫面比例
- ✅ 依日夜變化的環境音效（Web Audio API，兩顆低頻正弦波 + lowpass filter，濾波器截止頻率隨白天/夜晚調整）——預設關閉，需點擊右上角圖示才會啟動 `AudioContext`（遵循瀏覽器自動播放限制，也避免在 gallery 網格中預設發出聲音打擾使用者）
