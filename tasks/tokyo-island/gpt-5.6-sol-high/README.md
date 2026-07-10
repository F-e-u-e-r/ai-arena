# 東京、紅葉の中 — Tokyo in the Falling Red

純程式建立的卡通漂浮東京縮景：東京鐵塔、富士山、五重塔與鳥居環繞在秋色小島上，220 片楓葉持續飄落。沒有外部圖片、紋理或模型。

## 啟動

可直接開啟 `index.html`；亦可在 repository 根目錄執行 `python3 -m http.server 8000`，再開啟 `http://localhost:8000/tasks/tokyo-island/gpt-5-high/`。Three.js `0.160.0` 透過 jsDelivr CDN 以一般 script 引入，未使用其他引擎或框架。

## 架構與動畫

- `FloatingIsland` 管理島體、道路、庭園、浮動與輕微傾斜；`TokyoTower`、`Fuji`、`Pagoda`、`Torii` 封裝景點造型與夜間燈光材質。
- `MapleLeafSystem` 使用單一固定容量 `InstancedMesh`。220 個粒子狀態只在初始化建立；葉片低於島底時更新原物件的位置、速度與旋轉，不增加 Mesh 或配置新粒子。自訂 `ShapeGeometry` 讓葉形在小預覽仍有辨識度。
- `DayNightCycle` 在 15 秒內走完白天、黃昏、夜晚與黎明，利用 smootherstep 在天空、霧、半球光、主光與曝光的關鍵影格間插值。太陽/月亮沿相反軌道移動，夜間係數連續控制東京鐵塔、五重塔、鳥居與燈籠的自發光。
- `CameraRig` 使用 Pointer Events，自行實作水平軌道和受限俯角；拖曳不會暫停動畫，閒置後會恢復極慢環繞。右上時間按鈕可快轉週期，鍵盤 Space 亦可使用。

主迴圈使用 `requestAnimationFrame` 與 `THREE.Clock.getDelta()`，delta 上限為 50ms。resize 同步更新 renderer、相機比例及像素比；320×200 時標題、時間與拖曳控制自動精簡。
