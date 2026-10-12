# 漂浮東京島

卡通風格的浮空小島：東京鐵塔、富士山、鳥居、寺廟，以及會旋轉飄落的楓葉。日夜每 15 秒轉一圈。用瀏覽器直接打開即可，沒有建置步驟，也沒有後端。

## 如何啟動

需要一次網路連線，用來載入 Three.js。本地腳本沒有使用 ES module，所以可以直接開檔。

- 雙擊或用瀏覽器打開 `index.html`
- 或在此目錄執行靜態伺服器：`python3 -m http.server 8765`，再開 `http://127.0.0.1:8765/`

預覽最小約 320×200（16:10）。這個尺寸只留底部的階段、聲音、倍速，以及右上角的幀率。視窗夠大（寬 ≥ 900 且高 ≥ 520）時，左上角才會出現操作提示。

可選網址參數：`?phase=0.62` 跳到該時段（0–1），`?speed=4` 改變循環速度。

## Three.js 版本與引入方式

- **版本**：r149（`three@0.149.0`）
- **方式**：classic UMD，全域 `THREE`
- **CDN**：`https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js`
- **渲染器**：`WebGLRenderer`，`outputEncoding = sRGBEncoding`，`toneMapping = NoToneMapping`（卡通色不經過電影色調映射），陰影為 `PCFSoftShadowMap`

不用 ES module。Chrome 以 `file://` 開啟頁面時會擋住 module script，classic script 則可以。r149 是仍提供乾淨 UMD 組建的版本。

沒有外部貼圖。卡通色階、太陽／月亮光暈、楓葉遮罩都是程式裡的 canvas 畫出來的。

## 程式怎麼拆

| 檔案 | 職責 |
| --- | --- |
| `materials.js` | 共用色票、`MeshToonMaterial` 四階漸層、島上座標、`NightRig` |
| `island.js` | `Island`：島體、草地、池塘、樹木、石燈、螢火蟲、上下浮動 |
| `tokyo-tower.js` | `TokyoTower`：紅白桁架、展望台、夜間點光源 |
| `landmarks.js` | `Landmark`：富士山、鳥居、寺廟 |
| `maple-leaves.js` | `MapleLeafSystem`：楓葉物件池 |
| `day-night.js` | `DayNightCycle`：15 秒鍵值過渡、太陽與月亮 |
| `environment.js` | `Environment`：天空、星空、雲、遠山、鳥 |
| `ambience.js` | `Ambience`：Web Audio 風聲與蟲鳴，隨日夜改變 |
| `main.js` | 場景、相機、輸入、`requestAnimationFrame` 迴圈 |

## 日夜循環

`CYCLE_SECONDS = 15`。每幀 `time += deltaTime * speed`，再對 15 取餘數。`phase = time / 15`，從 0 走到 1 就是白天 → 黃昏 → 夜晚 → 黎明 → 白天。

顏色、環境光、半球光、方向光強度、霧、水面、星星與燈光強度都寫在鍵值上。相鄰兩鍵用 smoothstep 內插，所以天空和燈光不會在鍵值邊界跳動。時間點大約是：

| phase | 名稱 | 燈光 `lamps` |
| --- | --- | --- |
| 0.00–0.33 | Day | 0 |
| 0.33–0.48 | Dusk | 自 0.36 的 0.25 升到 0.48 的 1 |
| 0.48–0.80 | Night | 維持 1，0.74 之後在黎明前收到 0 |
| 0.80–0.93 | Dawn | 0（燈光已滅，日出在約 0.86） |
| 0.93–1.00 | Day | 0 |

`lamps` 交給 `NightRig`。它同時拉高東京鐵塔、鳥居燈籠、寺廟窗戶、石燈的自發光，以及對應的 `PointLight`。黃昏鍵一開始燈就亮，黎明名稱出現時強度已經回到 0。

太陽與月亮不是鍵值，而是一條獨立的軌道，避免換色時圓盤跳位。`phase = 0.11` 是正午，`0.36` 日落，`0.61` 午夜，`0.86` 日出。軌道壓得很低（正午約 12.6°），因為預設相機略為俯視，畫面上的天空只有地平線那一帶。方位以 `DEFAULT_VIEW_THETA`（和預設相機同一個 yaw）的對側為中心，日落往畫面右側、日出往左側。月亮在相反的半圈，距離再乘 0.92。

高度角會換成「相對天頂的比例」再交給兩盞方向光：太陽在地平線附近用 `smoothstep(-0.12, 0.08, elev)` 淡出，月亮用 `smoothstep(-0.12, 0.12, elev)` 淡入。兩盞燈交叉，影子方向不會在日落瞬間彈一下。圓盤低於地平線就隱藏，天空 shader 仍用同一個方向畫光暈。

## 楓葉與效能

`MapleLeafSystem` 只用一個 `InstancedMesh`，固定 200 片，算是物件池。位置、自旋、相位都在 `Float32Array`，迴圈裡不配置新物件。落到島面（半徑約 1.5–10.2、貼著解析的地表）會停幾秒再從上方重生；掉到島下太深也會重生。

每片是一張帶透明遮罩的平面（五片葉瓣加葉柄），`alphaTest` 裁切，不做半透明排序。落下時有左右正弦擺動，以及 X/Y 自轉、Z 軸搖晃。

其他控制：

- `deltaTime` 上限 0.05 秒，分頁切到背景再回來不會一次快轉整天或灌進大量位移
- 楓葉與細桁架不投射陰影；陰影貼圖 1024，正交範圍只蓋住島
- 視窗高度小於 280 時，裝置像素比上限 1.25，否則 1.6
- 天空、雲用 `MeshBasicMaterial` 或自訂 shader，不進陰影

## 相機

軌道只在 `main.js` 的 `CameraRig.apply` 算一次：

```text
x = radius * sin(phi) * sin(theta)
y = radius * cos(phi)
z = radius * sin(phi) * cos(theta)
```

`theta = 0`、`phi = π/2` 時相機在 +Z。滑鼠（或觸控）在畫布上按住拖曳：往右拖會減少 `theta`，往上拖會增加 `phi` 並夾在範圍內。拖曳只改角度。`requestAnimationFrame` 不會停，島、葉子、日夜都繼續走。

視窗或 iframe 尺寸一變就重設視野、距離與注視高度，讓 320×200 仍看得到整座島與塔。

## 操作

- 拖曳：環視
- 左右方向鍵：每次轉一點
- `F` 或倍速按鈕：1× 與 4× 切換（`[` `]` 可在 1×–8× 之間加減）
- `M` 或 Sound：開始或停止環境音。在使用者點過之前不會建立音訊，也不會出聲
