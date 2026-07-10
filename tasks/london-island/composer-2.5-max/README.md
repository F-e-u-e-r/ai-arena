# London Island — Composer 2.5

卡通風格 3D 漂浮倫敦島：大笨鐘、倫敦眼、塔橋、四季天氣與 15 秒日夜循環。

## 啟動

```bash
# 在專案根目錄或本資料夾
npx serve tasks/london-island/grok-4.2-max
# 或直接以瀏覽器開啟 index.html
```

## Three.js

- 版本：**0.160.0**（≥ v134）
- 引入：ES module import map + unpkg CDN

```html
"three": "https://unpkg.com/three@0.160.0/build/three.module.js"
```

## 日夜循環（15 秒）

`DayNightCycle` 以 `phase`（0–1）驅動，每幀 `phase += deltaTime / 15`。

| Phase | 時段 |
|-------|------|
| 0.00 | 正午 |
| 0.25 | 黃昏 |
| 0.50 | 午夜 |
| 0.75 | 黎明 |

- 天空、霧氣、環境光、定向光依 phase 分段 lerp 漸變
- 太陽／月亮沿圓軌道移動
- **黃昏（phase ≥ 0.22）** 至 **黎明前（phase < 0.78）** 自動點亮大笨鐘、倫敦眼、塔橋的 PointLight 與 emissive 材質

## 四季天氣（40 秒／季）

| 季節 | 效果 |
|------|------|
| 春 | 濃霧（fog density ↑） |
| 夏 | 晴朗強光 |
| 秋 | 楓葉粒子飄落 |
| 冬 | 雪花粒子 |

季節可透過 HUD 或鍵盤 `1–4` 手動切換；切換時清空粒子池避免殘留。

## 粒子物件池

`ParticlePool` 預配置 120 片楓葉 + 150 片雪花，spawn 時從 idle 池取用，落地或生命結束後回收（`visible = false`），避免 GC 壓力。

## 相機控制

使用 Three.js `OrbitControls`（水平拖曳旋轉），`enableDamping` 保持拖曳時動畫不中斷。空白鍵可加速日夜循環。

## 嵌入預覽（320×200）

HUD 預設收合為 ☰ 圖示，展開後可切換季節與時間倍速；debug 列顯示 FPS／粒子數，不遮擋主場景。