// 發佈策略（WS5-A Packet A rev.3 §3/§4）—— 封閉世界組裝的「單一事實來源」。
//
// 這裡集中定義兩件事，供 manifest oracle（build-manifest.mjs）與組裝器
// （assemble-site.mjs）＋測試共用，避免兩邊邏輯漂移：
//   1. chrome 集（Owner 授權的控制面）：要發佈的靜態殼 + manifest + 明列的 assets。
//   2. 失敗關閉（fail-closed）的共用原語：OS cruft 忽略清單、安全路徑分段規則。
//
// 設計決策（記錄以防後續 agent 靜默反轉）：assets 採「明示列舉」而非 `cp -R assets`，
// 使「新增一個 assets/** 檔」成為刻意的控制面變更（必須同步改這份清單，會出現在 PR diff
// 裡），而不是被默默一起發佈。組裝器對任何不在此清單內的 assets/** 檔 fail-closed（N-4）。

// 應用殼。app.js 執行期只 fetch 'tasks.json'（第一手確認），index.html 由瀏覽器直接載入。
export const APP_SHELL = ['index.html'];

// manifest。build 產生 + CI 以 `git diff --exit-code` 確認已同步；執行期由 app.js fetch。
export const MANIFEST = ['tasks.json'];

// 前端 chrome assets —— 逐一列舉（§4 註 a）。新增檔 = 刻意控制面變更。
export const ASSET_FILES = [
  'assets/app.js',
  'assets/style.css',
  'assets/filter-core.mjs',
  'assets/model-registry.mjs',
  'assets/favicon.svg',
  'assets/fonts/jetbrains-mono-latin-wght-normal.woff2',
  'assets/fonts/JetBrainsMono-OFL.txt',
];

// 完整 chrome 集（9 檔）：殼 + manifest + 7 assets。順序固定、凍結以免被改動。
export const CHROME_FILES = Object.freeze([...APP_SHELL, ...MANIFEST, ...ASSET_FILES]);

// assets/ 底下允許存在的「資產目錄」實況應恰等於上列 7 檔。導出成 Set 供組裝器做封閉集比對。
export const ASSET_FILE_SET = Object.freeze(new Set(ASSET_FILES));

// OS / 編輯器 cruft：被 gitignore、clean checkout（CI）永遠不會有（A-7）。oracle 與組裝器
// 在每一層目錄枚舉時以「檔名」忽略這些項目，使本機的 macOS `.DS_Store` 不會讓本機跑誤判失敗；
// CI（clean checkout）根本不含這些檔，故「忽略」不可能在 CI 擴大發佈集。
// 刻意採「固定小清單」而非查 gitignore —— 無需 git 子行程、決定性、可單元測試（A-7 選項 b）。
export const OS_CRUFT = Object.freeze(new Set(['.DS_Store', 'Thumbs.db']));

export function isOsCruft(name) {
  return OS_CRUFT.has(name);
}

// 一個路徑「分段」（資料夾名或巢狀檔名）會成為 GitHub Pages 上的 URL path segment。
// 只允許英數字與 . _ -，且不可是 . 或 ..，避免像 %2e%2e、..\x 這種名稱被瀏覽器 URL
// 正規化成路徑穿越。沿用 build-manifest 既有 assertSafeName 的字元規則，但 A-10 把它
// 擴及「每一個被枚舉的分段」（巢狀 submission 檔名、assets 檔名），不再只檢資料夾名。
export const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function isSafeSegment(name) {
  return name !== '.' && name !== '..' && SAFE_SEGMENT.test(name);
}

// 不合規即丟出 Error（呼叫端的 try/catch 會轉成給貢獻者的逐條錯誤訊息）。
export function assertSafeSegment(name, kind) {
  if (!isSafeSegment(name)) {
    throw new Error(`unsafe ${kind} 名稱 "${name}"：只允許英數字與 . _ -（且不可是 . 或 ..）`);
  }
}
