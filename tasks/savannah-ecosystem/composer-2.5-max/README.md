# Savannah Ecosystem — Composer 2.5

原生 Canvas 2D 非洲大草原生態系統：7 隻動物、6 種天氣、乾濕季循環。

## 啟動

```bash
npx serve tasks/savannah-ecosystem/grok-4.2-max
```

## 為何選 Canvas 2D

本題要求零外部函式庫；Canvas 2D 足以繪製視差背景、動物造型與大量天氣粒子，且 API 輕量、易於物件池管理。

## 動物習性

| 物種 | 數量 | 行為 |
|------|------|------|
| 獅子 ×3 | 群體 | 同 groupId 聚集移動，偶爾休息慢速巡邏 |
| 大象 ×2 | 成群 | 緩慢移動，偶爾抬鼻「喝水」 |
| 豹 ×2 | 單獨 | 快速潛行，偶爾攀爬樹木（垂直位移） |

所有動物由左側進入、右側離開後從左側重新出現。乾季群聚係數較高、濕季活動倍率較高。

## 季節（60 秒自動輪轉）

- **乾季**：暖色天空／金黃草地
- **濕季**：翠綠色調、動物更活躍

`SeasonManager.blend` 平滑過渡色盤；可按 Dry／Wet 手動覆寫。

## 天氣

Sunny、Rain、Heavy Rain、Snow（乾季）、Thunderstorm、Tornado。切換時 `ParticleSystem.clear()` 回收舊粒子。

## 雷暴安全區演算法

`computeSafeLightning` 隨機產生雲→地的折線路徑，每段檢查是否進入任一動物的 `(radius + 28px)` 安全圓；若碰撞則重試（最多 24 次）。閃電永遠不會擊中動物。

## 龍捲風追逐

啟用 Tornado 時，`findNearestAnimal` 鎖定最近動物，以較慢速度（35 px/s）靠近；同時用 `spawnDebris` 捲起地面粒子。

## Object Pooling

`ObjectPool` + `ParticleSystem`：雨、雪、龍捲風碎屑共用池（初始 200），`acquire`／`release` 避免每幀 new 物件。天氣切換時 `clear()` 一次回收全部 active 粒子。

## 嵌入預覽

底部 ☰ 展開天氣 chip 與季節按鈕；鍵盤 `1–6` 切天氣、`d`／`w` 切季節。Debug 列顯示 FPS、粒子數、當前季節。