# Savannah Field Notes

這是原生 Canvas 2D API 實作的非洲大草原生態系；沒有框架、3D 引擎、圖片、Sprite 或外部函式庫。畫面保留小型 iframe 所需空間，底部七個緊湊按鈕可切換六種天氣與乾濕季。

## 啟動

直接開啟 index.html，或在專案根目錄執行：

    python3 -m http.server

然後開啟 tasks/savannah-ecosystem/gpt-5-xhigh/。

## 為何使用 Canvas

Canvas 很適合這個由大量輕量 2D 線條、形狀、粒子組成的場景：一張 canvas 就能以固定的 960 × 600 世界座標進行分層繪製，實際畫布依 iframe 尺寸與 device pixel ratio 縮放，因此 320 × 200 仍維持完整構圖。

## 生態與季節

場上固定有兩隻獅子、兩隻大象、兩隻豹。牠們都從左往右循環：獅子一起慢速巡邏或休息，大象會走路、喝水或抬鼻，豹會潛行、短跑，並以垂直位移表現攀樹。乾季活動較低且獅子更常休息；濕季活動更高。季節每 60 秒自動切換，也可用右下 DRY/WET 或 S 鍵切換；切換不會重設動物位置。

## 天氣與效率

Sunny、Rain、Heavy Rain、Snow、Thunderstorm、Tornado 都可從底部控制列選擇（數字 1–6 是快捷鍵）。濕季會暫時停用少見的 Snow。WeatherManager 切換天氣時呼叫 ParticlePool.clear，將舊粒子回收；ParticlePool 在載入時預建 500 個 plain objects，雨、雪、沙塵與龍捲風碎屑都只會重用這些物件，避免長時間配置與 GC 尖峰。

雷暴的 findSafeLightningX 每次閃電都掃描候選位置，依所有動物的即時 x 座標與體寬選出最大淨空位置；雷電終點也停在動物平面上方。龍捲風則每幀找出最近動物，以刻意低於逃跑動物的速度靠近，形成可讀的追逐效果。
