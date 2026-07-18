# 漂浮東京島與楓葉（Floating Tokyo Island）

卡通風 3D 動畫場景：浮空島 + 東京鐵塔 + 富士山 / 鳥居 / 三重塔，
大量楓葉飄落，每 15 秒完成一次日夜輪轉，支援滑鼠拖曳旋轉視角。

## 如何啟動

- **直接開啟**：雙擊 `index.html` 即可（使用 classic script + UMD CDN，無 ES module 的 file:// 限制）。
- **Static server**：
  ```bash
  cd tasks/tokyo-island/kimi-k3
  python3 -m http.server 8080   # 或 npx serve .
  # 開啟 http://localhost:8080
  ```
- 需要網路連線以下載 Three.js CDN；無後端依賴。

## Three.js 版本與引入方式

- 版本：**r134（0.134.0）**，符合題目「v134 或更新版本」。
- 引入：unpkg UMD build（`build/three.min.js` + `examples/js/controls/OrbitControls.js`）的 classic `<script>`。
- 為什麼用 UMD 而非 ES module：本作品會嵌入 AI Arena gallery 的
  `sandbox="allow-scripts"` iframe（opaque origin），也可能被直接以
  `file://` 開啟；classic script 在這兩種情境都不受 module/CORS 限制。

## 日夜循環：時間控制與過渡邏輯

- `cycleT = (time / 15) % 1 ∈ [0,1)`，每 15 秒一輪；
  相位為 白天(0–0.40) → 黃昏(0.40–0.55) → 夜晚(0.55–0.86) → 黎明(0.86–0.97) → 白天。
- 以 **8 個 keyframe stop** 描述各時間點的天空色、霧色、半球光（天空/地面/強度）、
  方向光（顏色/強度/仰角）、環境光強度、亮燈因子 lamp、星星因子 star。
- 每幀找出 cycleT 所在區間，用 **smoothstep(u)** 做 `lerpColors` / `lerp` 插值，
  两端速度趨零，過渡自然不硬切。
- **太陽 / 月亮**：只使用一盞 `DirectionalLight` 分飾兩角 —— 白天是高仰角暖色太陽，
  夜晚平滑轉為低強度冷色月光；方位角固定 −40°、只插值仰角，因此光源方向永遠連續、不跳變。
  視覺上的日月圓盤是不受光照的 `MeshBasicMaterial`（外加 additive 光暈），
  依 star 因子淡入淡出；星星為單一 `Points`（420 顆），opacity 由 star 控制。
- **自動亮燈**：黃昏 keyframe 起 lamp > 0，夜晚 = 1，黎明回落至 0。
  `TokyoTower.setLamp` 控制塔腰 `PointLight` 強度、白色橫紋的自發光（白天 emissive=0
  呈現原白色）、塔頂 beacon 閃爍；`Landmark.setLamp` 控制鳥居石燈籠與三重塔窗戶的自發光。

## 粒子系統與效能優化

- 240 片楓葉 = **1 個 `InstancedMesh`（1 次 draw call）**，共享一張
  `MeshToonMaterial`，葉色用 `instanceColor` 隨機（5 種楓紅 / 橘 / 金）。
- **物件池**：池大小固定，葉子落出底界（y < −8.5）即重置回頂部並重抽參數，
  不 new、不 splice，長時間運行記憶體恆定。
- 狀態採 **SoA（平行 Float32Array）**；逐幀用的 Vector3/Quaternion/Euler/Matrix4
  全部預建重用，**主迴圈零配置（zero-allocation）**。
- 掉落物理：等速下落 + 正弦左右搖擺（振幅/頻率/相位各自隨機）+ 三軸等角速度翻轉
  + 全域微風漂移。
- 其他：`requestAnimationFrame` + `deltaTime`（上限 50ms，切分頁回來不暴衝）、
  `pixelRatio` 上限 2（小螢幕 1.5）、陰影相機只罩島嶼範圍（1024 shadow map）、
  DOM 更新節流（相位改變才寫、數據 500ms 一次）。

## 相機旋轉控制

- `OrbitControls`（r134 UMD）：開啟阻尼（dampingFactor 0.08），**僅旋轉**
  （`enableZoom/enablePan = false`，避免嵌入時與頁面滾動衝突），
  極角限制 0.16π–0.62π（不飛頂、不鑽底）。
- 閒置時 `autoRotate` 緩慢展示；`start` 事件立即暫停，`end` 後 2.5 秒恢復。
  動畫主迴圈與拖曳完全解耦，**拖曳中場景持續動畫**。
- `frameCamera()` 依寬高比調整距離：aspect < 1.55 時自動拉遠（最多 46），
  確保 320×200（16:10）嵌入預覽也能看到整座島；resize 時保持當前旋轉方向。

## 嵌入預覽（Responsive Embed）

- HUD 全部 `pointer-events: none`（按鈕除外），小預覽整面仍可拖曳。
- viewport ≤ 520px 寬或 ≤ 260px 高時：隱藏 FPS 資訊與操作提示、
  縮小字級與按鈕（26px），只保留標題 / 相位 / 兩顆控制鈕。
- 錯誤處理：CDN 失敗或 WebGL context lost 時顯示可點擊重新整理的遮罩，不會黑畫面。

## 快捷鍵 / 加分項目

- `F`：日夜循環 ×4 / 恢復（對應 ⏩ 按鈕）；`D`：顯示 / 隱藏 FPS・葉數・draw calls（對應 ℹ️ 按鈕）。
- 已實作加分：MeshToonMaterial 四階 gradientMap 卡通渲染、環島雲層（含島下雲）、
  快捷鍵加速循環、FPS/粒子數 debug、RWD resize 自適應。

## 檔案結構

```
index.html   — 頁面、HUD、CDN 引入、全域錯誤遮罩
style.css    — HUD 樣式與小尺寸嵌入的收合規則
main.js      — 全部場景邏輯（ToonKit / DayNightCycle / Island /
               TokyoTower / Landmark / MapleLeafSystem / CloudLayer / Hud / App）
README.md    — 本文件
submission.json — AI Arena 提交 metadata
```

## 素材聲明

無任何外部紋理或模型：所有物件皆為 Three.js 基本幾何體程序化組裝，
楓葉外形為手寫 `THREE.Shape`（5 裂星形 + 葉柄）。
