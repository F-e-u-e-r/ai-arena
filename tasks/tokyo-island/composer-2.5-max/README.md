# Tokyo Island — Composer 2.5

卡通風格 3D 漂浮東京島：東京鐵塔、富士山、鳥居、寺廟與楓葉飄落、15 秒日夜循環。

## 啟動

```bash
npx serve tasks/tokyo-island/grok-4.2-max
```

## Three.js

- 版本：**0.160.0**
- CDN import map + `OrbitControls` addon

## 日夜循環（15 秒）

`DayNightCycle.phase` 每 15 秒完整一輪（白天→黃昏→夜晚→黎明→白天）。

- 天空與霧氣顏色四段 lerp
- 太陽／月亮軌道同步
- phase 0.22–0.78 區間：東京鐵塔、鳥居、寺廟自動亮燈（PointLight + emissive）

空白鍵或 HUD 按鈕可切換 1×／2×／4× 時間倍速。

## 楓葉粒子系統

`MapleLeafSystem` 使用 `ParticlePool`（140 片）：

- ShapeGeometry 楓葉造型 + MeshToonMaterial
- 每片具 sway 擺動、spin 旋轉、重力下落
- 離開場景或生命結束後回收到池，長時間運行無配置風暴

## 相機

`OrbitControls` 支援滑鼠左右拖曳旋轉；拖曳期間島嶼浮動、楓葉、日夜循環持續運行。

## 嵌入預覽

HUD 收合為右下角 ☰，展開顯示時間倍速與 FPS／葉片數 debug。