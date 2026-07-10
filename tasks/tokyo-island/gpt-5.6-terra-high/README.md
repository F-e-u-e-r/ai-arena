# Tokyo Autumn Island

直接開啟 `index.html` 或使用 static server。場景只使用原生 HTML/CSS/JS 與 jsDelivr CDN 的 Three.js r160；所有美術均為程式化基本幾何。

FloatingIsland、TokyoTower、Torii、FujiTemple、MaplePool 是各自的場景模組。日夜循環採 15 秒正弦時間軸，同步插值天空、光照、霧、太陽/月亮和夜燈。右下角月形按鈕可把循環加速四倍。

MaplePool 在啟動時建立 260 枚葉片，葉片離開島下緣時回收重設，避免每幀配置。所有動畫都以 requestAnimationFrame 與 delta time 更新。水平滑鼠／觸控拖曳轉動島嶼；精簡 HUD 在 320×200 仍保留操作空間。
