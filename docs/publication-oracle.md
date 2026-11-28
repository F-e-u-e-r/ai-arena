# Publication-boundary oracle（發佈邊界位元 oracle）

`scripts/publication-oracle.mjs` 是維護者在開立「模型輸出資料 PR」之前使用的開發／benchmark 工具。它**不是**網站內容、**不是** CI gate、也**不是** required check：

- 封閉世界組裝器（`scripts/assemble-site.mjs`）只發佈 `index.html`、`tasks.json`、明列的 `assets/**` 與 `tasks/**`；`scripts/`、`test/`、`docs/` 都不會上線。
- CI 只執行它的回歸測試（`validate` job 的 `node --test test/*.test.mjs`），不會對任何 PR 執行 `verify`。
- 它只用 Node 內建模組與本機 git；不連網、不呼叫模型、不需要祕密。

## 1. 不變式

> 對每一筆新產生的 submission：發佈候選必須**恰好**包含獨立凍結的模型輸出檔（位元完全相同），再加上另行產生的 submission metadata（`submission.json`）。

git 與發佈管線都可能在不報錯的情況下改變或丟掉檔案（`.gitignore` 丟檔、`.gitattributes` 在 `git add` 或 checkout 時改寫位元、內嵌 repo 變成 gitlink、harness 的檔案混進資料夾）。這個工具不逐一補檢查，而是在兩個位置直接對凍結的位元比對，兩者缺一不可：

1. **候選 commit 的 git tree**：目的資料夾下的每個 blob 直接從物件庫讀出。`git add` 時發生的轉換在這裡看得到。
2. **發佈邊界**：確切的候選 commit 乾淨 checkout、跑完 repo 自己的發佈序列（`build-manifest --strict` → `assemble-site`）之後的 `_site/<dest>`。checkout 時才發生的轉換（例如 `ident`）與管線造成的差異只有這裡看得到。

## 2. 使用方式

必須以 `.node-version` 指定的 Node 版本執行。

```
node scripts/publication-oracle.mjs freeze --output <模型輸出目錄> --dest tasks/<task>/<folder> \
     --repo <base 的乾淨 checkout> --out <新的 manifest.json> [--report <新的 json>]

node scripts/publication-oracle.mjs verify --manifest <凍結的 manifest> --manifest-sha256 <ledger 值> \
     --metadata <凍結的 harness submission.json> --metadata-sha256 <ledger 值> \
     --repo <含候選 commit 的 git repo> --candidate <40 位元 SHA> --dest tasks/<task>/<folder> \
     [--work <新目錄>] [--report <新的 json>] [--keep]
```

| exit | 意義 |
|---|---|
| 0 | PASS |
| 1 | ORACLE MISMATCH：`_site/<dest>` 與凍結參考不符（gate `compare`）；或 `_site` 相符，但候選 tree 在目的資料夾下的路徑集合或 blob 位元與參考不符（gate `tree`） |
| 2 | INELIGIBLE：`freeze` 的早期拒絕；或 `verify` 發現參考清單含永遠不可接受的名稱 |
| 3 | PIPELINE REJECTION：候選被 git 層或管線拒絕（沒有走到 `_site` 的位元比對）；或位元相符但 tree 內有 `.gitattributes` |
| 4 | CANNOT VERIFY：輸入、綁定、執行環境或寫入位置錯誤（含暫存目錄位於候選 repo 內）；git 拒收候選的物件；步驟被中止或逾時 |

任何非零都必須阻擋發佈。判定只看 **exit status 與最後一行**（`PUBLICATION-ORACLE …`）；不要在整段輸出裡搜尋字串，`message:` 行可能含候選可以控制的文字。exit 1 必須同時搭配最後一行的 `PUBLICATION-ORACLE VERIFY: FAIL …` 才是 oracle 的判定（Node 自身啟動失敗也是 exit 1）。

建議的程序：

1. 模型 run 一結束就 `freeze`（模型工作目錄在 run 開始時必須是空的；harness 的 log、計時、rollout 一律寫在它之外）。exit 2 的輸出**不得**封裝，也不得靠改名、刪檔來「修」。
2. 把 `manifest-sha256` 與 harness metadata 的 sha256 記進 run ledger。驗證時傳入 ledger 的值，不重新計算。
3. 在隔離的 clone 中封裝並 commit：確認目的資料夾在 base 上不存在（no-overwrite）、位元複製模型輸出、寫入 harness metadata、重生 `tasks.json`。
4. `verify`。`--repo` 建議用只含 main 與候選的拋棄式 clone；`--work`、`--report` 與暫存目錄（`TMPDIR`）都必須在候選 repo 之外。
5. 合併後，以 merge commit 的 tree 對照報告的 `candidateTree`，或對 merge commit 重跑 `verify`（squash merge 會產生新的 commit）。

靜態發佈計數 tripwire（`test/publication.test.mjs` 裡寫死的數字）不是這個工具的工作：資料 PR 仍須把它更新為獨立推導出來的新值。

## 3. 政策（Owner 2026-11-28 核定保留）

以下都是 **AI Arena 專屬**的 fail-closed 發佈政策，不是其他 repo 的通用規則：

| 規則 | 內容 | 結果 |
|---|---|---|
| H-1 | 模型輸出的路徑不得有以 `.` 開頭的分段。hosted 的 Pages artifact 步驟（`actions/upload-pages-artifact`，未設 `include-hidden-files`）依其定義會丟棄這類檔案，而那發生在 `_site` 之後，位元比對看不到 | `freeze` exit 2；`verify` 對參考清單重新斷言，exit 2 |
| T-1 | 候選的整棵 tree 不得有 symlink | exit 3，不執行管線 |
| T-2 | 候選的整棵 tree 不得有只差大小寫的路徑 | exit 3，不 checkout |
| T-3 | 候選的整棵 tree 不得有 `.gitattributes`（不分大小寫） | 位元比對照跑；即使相符也是 exit 3 |
| T-4 | 候選的整棵 tree 的路徑必須是可列印 ASCII | exit 3，不 checkout |
| 物件格式 | clone 候選時由 git 檢查每個收到的物件（`fetch.fsckObjects`）；格式不合法就拒收 | exit 4 |

另外，保留名稱在任何目錄層級都拒絕：`.git`、`.gitattributes`、`.gitignore`、`.gitmodules`；模型輸出的根目錄不得有 `submission.json`（那是 harness 擁有的 metadata 檔名）。

副作用（刻意的 fail-closed）：T-1 到 T-4 與物件格式檢查看的是**整棵候選 tree 與 `--repo` 內所有 branch 可達的物件**，不只目的資料夾。main 日後若自己加入 `.gitattributes`、symlink 或任何非 ASCII 檔名，或 `--repo` 的別處有格式不合法的物件，所有候選都會被拒。

## 4. 它證明什麼、不證明什麼

`verify` exit 0 證明的是**執行它的那台機器**上的三件事：候選 tree 在目的資料夾下恰好是凍結清單加上 `submission.json`，每個 blob 的位元等於凍結值；乾淨 checkout 加上 repo 自己的發佈序列之後，`_site/<dest>` 的檔案集合與每個位元都等於凍結參考；整棵 tree 通過第 3 節的規則。

已知且已接受的限制：

- **本機組裝不等於實際的 hosted 發佈。** hosted runner 的 `actions/checkout`（runner 自己的 git 版本與設定）、`actions/upload-pages-artifact`、`actions/deploy-pages` 與 Pages 的提供方式，都在這個工具看得到的範圍之外。
- **git 的版本沒有釘選**，只記在報告裡。物件格式檢查的強度取決於安裝的 git。
- **空目錄**不比對：一般的 git 操作不記錄空目錄，它們也不會被發佈。`freeze` 會把它們列為 note。
- **指向空 tree 的條目**看不到：以底層指令可以在 tree 物件裡放一個指向空 tree 的條目；它不含任何檔案、不會被發佈，`git ls-tree -r` 不列出它，所以路徑集合、T-2、T-4 都看不到它。
- **檔案權限**不比對：只要求目的資料夾下的條目是一般 blob（`100644` 或 `100755`）。
- **它會執行候選 commit 自己的管線程式。** 威脅模型是「git／發佈管線意外改變凍結位元」，不是惡意的維護者。資料 PR 不應改動 `scripts/` 或 `.node-version`。
- **一次只驗一個目的資料夾。** 發佈集合的其他部分、目的資料夾在 base 上是否已存在、既有 submission 是否被修改，都由封閉世界組裝器、靜態計數 tripwire 與 PR 的 diff 審查負責。
- **凍結參考的獨立性有一部分是程序責任。** 工具只強制「位元等於呼叫端提供的 pin」與「參考不在候選 repo 內」；它無法證明凍結發生在封裝之前。凍結**之前**就混進模型工作目錄的 harness 檔案會被當成模型輸出。
- 候選 commit 必須可從 `--repo` 的 branch 或 HEAD 到達；只被 tag 指到的 commit 無法驗證。
- 不帶 `TMPDIR` 的 git 指令（`verify` 的邊界探測、`freeze` 的 check-ignore）若自己需要暫存位置，用的是系統預設位置（macOS 的使用者暫存目錄，取不到時是 `/tmp`）。系統預設暫存位置本身若落在候選 repo 或模型輸出目錄之內（例如把 repo 建在 `/tmp` 本身），不在保護範圍。
- 設想的平台只有 macOS（本機）與 Linux（hosted）；沒有人測過 Windows 特有的名稱別名。

## 5. 來源與相對於審查版本的差異

| | sha256 |
|---|---|
| 審查版本（第四版；`TOOL` = `ai-arena-publication-oracle/4`） | `95622e1ee7ec167531e6c1152675cfd282715b761483c518bcd9be12d96f302a` |
| repo 內的 `scripts/publication-oracle.mjs`（`TOOL` = `ai-arena-publication-oracle/5`） | <!-- adopted-sha256:begin -->`9ef022734b8508cdfd110187c83b2eecfd4e11866b87e2f9272a6b63d19e407e`<!-- adopted-sha256:end --> |
| 審查版本的單元測試（43 個） | `04db77d74adba4d539472edc83cc05fc7fdbd62f05757387cc58f17aa879e41f` |

第四版在隔離環境中完成，2026-11-28 的最終審查為 GPT-5.6 Sol／max 與 GPT-5.6 Luna／max 皆 `PROCEED`（同一個模型家族；Grok 審查由 Owner 豁免，所以不能稱為跨家族審查）。採納時對驗證器的修改只有下列幾項，沒有重構、沒有改動任何比對邏輯：

1. **B4-1（行為修正）。** 第四版只在沒有 `--work` 時檢查暫存目錄；指定 `--work` 時，`TMPDIR` 仍會傳給 git 與候選管線的子行程，卻沒有被檢查，子行程可以把暫存檔寫進候選 repo（採納時已第一手重現：管線的暫存檔確實被寫進候選 repo，而 `verify` 回報 PASS）。現在：
   - 暫存目錄（`os.tmpdir()`，先解析 symlink 與相對路徑）**一律**以與 `--work`／`--report` 相同的方式檢查（device+inode，逐層往上）。位於候選 repo、它的工作樹頂層、共用的 git 目錄或任何 linked worktree 之內——包括經由 symlink、大小寫別名、`TMP`／`TEMP` 指進去——都是 exit 4（gate `input`）：在 clone、checkout 與管線之前就停，那個目錄內不會被寫入任何東西。無法解析的暫存目錄也是 exit 4。
   - 輸入階段通過之後，子行程拿到的 `TMPDIR` 就是**被檢查過的那一個已解析目錄**（`hermeticEnv(home, tmpDir)`），不再是未經檢查的原字串。暫存目錄是安全的絕對路徑時，使用的仍是同一個目錄。看得出差別的只有兩種不尋常的設定：`TMPDIR` 未設定而 `TMP`／`TEMP` 有設定（子行程原本會落到 `/tmp`）；以及 `TMPDIR` 是相對路徑（子行程原本各自依自己的工作目錄解析——採納時實測，第四版在這種設定下會因管線找不到目錄而回報 exit 3，把環境問題算成候選被拒）。現在子行程一律與驗證器使用同一個目錄。
   - **任何子行程都不會拿到未經檢查的 `TMPDIR`。** 定出 repo 邊界用的三個唯讀 git 探測（它們在暫存目錄檢查之前執行）與 `freeze` 的 `git check-ignore` 完全不帶 `TMPDIR`；第四版會把呼叫端的 `TMPDIR` 原樣傳給它們。這不是理論問題：採納時實測到，macOS 的 `git` 是 xcrun 的轉接程式，它取不到系統的使用者暫存目錄時（例如在沙箱內執行）會把快取檔 `xcrun_db` 寫進 `$TMPDIR`，第四版因此會在候選 repo 或模型輸出目錄內留下這個檔。
   - 拒絕訊息不再建議「pass --work」（那已經不是解法）。
   - `freeze` 的行為契約不變：`TMPDIR` 在模型輸出目錄內時仍然成功，而且不寫入任何東西（既有的測試與封存的重放 fixture 都這樣要求）。改變的只有上一點——它的 git 子行程不再收到呼叫端的 `TMPDIR`——所以這個契約在 macOS 的沙箱內也成立。
2. `TOOL` 由 `/4` 改為 `/5`（報告因此分辨得出是哪一版；manifest 格式 `ai-arena-publication-manifest/1` 不變，第四版凍結的 manifest 仍然有效）。
3. 三處註解更正：檔頭不再說「尚未併入 repo」；兩處原本指向 bundle `README` 的參照改指向本文件，並註明 H-1 已由 Owner 核定。

驗證器的完整差異（`diff -u 第四版 採納版`；為了不在本文件留下行尾空白，原本只含一個空格的空白上下文行在這裡是空行）：

<!-- verifier-diff:begin -->
```diff
--- reviewed-v4/publication-oracle.mjs
+++ scripts/publication-oracle.mjs
@@ -1,5 +1,7 @@
 #!/usr/bin/env node
-// publication-oracle.mjs — AI Arena 發佈邊界位元 oracle（最小候選實作；尚未併入 repo、未經 hosted CI 驗證）。
+// publication-oracle.mjs — AI Arena 發佈邊界位元 oracle（開發／benchmark 用工具；不是網站內容，封閉世界組裝器不發佈 scripts/）。
+// 來源：2026-11-28 經審查的第四版（sha256 95622e1e…f302a）加上 B4-1 修正。與第四版的確切差異、政策、限制與使用方式見
+// docs/publication-oracle.md。
 //
 // 不變式：發佈候選必須「恰好」包含獨立凍結的模型輸出檔（位元完全相同），再加上另行產生的
 // submission metadata（submission.json）。
@@ -31,7 +33,7 @@
 // 這個檔案被 import 時不會執行任何檢查、也不設定 exit code：判定只來自直接執行的 CLI。
 //
 // 只用 Node 內建模組與本機 git；不連網、不呼叫模型、不需要祕密。本機組裝比對「不」證明未來 hosted
-// 部署的位元（見 README 的限制）。
+// 部署的位元（見 docs/publication-oracle.md 的限制）。

 import fs from 'node:fs';
 import os from 'node:os';
@@ -40,7 +42,7 @@
 import { spawnSync } from 'node:child_process';
 import { fileURLToPath } from 'node:url';

-export const TOOL = 'ai-arena-publication-oracle/4';
+export const TOOL = 'ai-arena-publication-oracle/5'; // 5 = 經審查的第四版 + B4-1（暫存目錄一律檢查）；manifest 格式不變
 export const MANIFEST_FORMAT = 'ai-arena-publication-manifest/1';
 export const EXIT = Object.freeze({ PASS: 0, MISMATCH: 1, INELIGIBLE: 2, PIPELINE: 3, CANNOT_VERIFY: 4 });

@@ -54,7 +56,7 @@
 export const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
 // 隱藏分段（以 . 開頭）：deploy job 的 actions/upload-pages-artifact 在未設 include-hidden-files 時會把
 // 任何以 . 開頭的檔案／目錄排除在 Pages artifact 之外（且 .git / .github 一律排除）。那一步發生在 _site
-// 組裝「之後」，本機位元比對看不到，所以只能靠名稱政策擋下（H-1；見 README 的限制與 Owner 待決事項）。
+// 組裝「之後」，本機位元比對看不到，所以只能靠名稱政策擋下（H-1；Owner 2026-11-28 核定保留，見 docs/publication-oracle.md）。
 export const HIDDEN_PREFIX = '.';

 const SHA40 = /^[0-9a-f]{40}$/;
@@ -214,7 +216,12 @@

 // 隔離的子行程環境：只給白名單變數。全域／系統 git 設定（filter driver、全域 ignore／attributes、hooks）
 // 一律不讀；也不帶 ARENA_ROOT / NODE_OPTIONS / NODE_PATH（build-manifest 會依 ARENA_ROOT 改根目錄）。
-export function hermeticEnv(homeDir) {
+// TMPDIR（B4-1）：子行程絕不會拿到「未經檢查」的 TMPDIR。verify 通過輸入階段之後傳入已通過位置檢查的暫存目錄
+// （tmpDir），git 與候選管線的子行程用到的就是那一個目錄。沒有傳入 tmpDir 的呼叫（freeze 的 check-ignore、verify 在
+// 定出 repo 邊界之前的三個唯讀探測）完全不帶 TMPDIR：這些 git 指令本身不需要暫存目錄，而 macOS 的 git 是 xcrun 的
+// 轉接程式，它在取不到系統的使用者暫存目錄時（例如在沙箱內）會把快取檔 xcrun_db 寫進 $TMPDIR——不能讓它寫進
+// 呼叫端指定、尚未檢查的位置（可能就在候選 repo 或模型輸出目錄內）。
+export function hermeticEnv(homeDir, tmpDir = null) {
   const env = {
     PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? '/usr/bin:/bin'}`,
     HOME: homeDir,
@@ -229,7 +236,7 @@
     LC_ALL: 'C',
     TZ: 'UTC',
   };
-  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
+  if (tmpDir !== null) env.TMPDIR = tmpDir;
   return env;
 }
 // 命令列層級（優先於任何 local 設定）關閉可執行設定：hooks、fsmonitor、自動 gc。
@@ -514,8 +521,11 @@
     if (opts.report) report.reportFile = outsideRepo('--report', resolveNew('--report', opts.report), neverWrite);
     const workTarget = opts.work ? outsideRepo('--work', resolveNew('--work', opts.work), neverWrite) : null;
     if (workTarget !== null && workTarget === report.reportFile) { report.reportFile = null; throw new Stop('input', EXIT.CANNOT_VERIFY, '--work and --report must be different paths'); }
-    // 沒有指定 --work 時工作目錄建在暫存目錄下：它同樣不得位於候選 repo 內。
-    const tmpRoot = workTarget === null ? outsideRepo('the temporary directory (TMPDIR)', mustRealpath('the temporary directory', os.tmpdir()), 'is inside the candidate repository; pass --work or point TMPDIR elsewhere (the verifier never writes into it)') : null;
+    // 暫存目錄一律檢查，不論是否指定 --work（B4-1）。沒有 --work 時工作目錄建在它底下；指定了 --work 時，git 與候選
+    // 管線的子行程仍會在 TMPDIR 建立暫存檔，所以它同樣不得位於候選 repo 的邊界之內。先解析 symlink 與相對路徑，再以
+    // device+inode 判定（與 --work／--report 相同），別名因此同樣被拒絕；無法解析的暫存目錄一律是無法驗證（exit 4）。
+    // 到這裡為止只執行過上面三個定邊界用的唯讀探測，而它們不帶 TMPDIR（見 hermeticEnv）。
+    const tmpRoot = outsideRepo('the temporary directory (TMPDIR)', mustRealpath('the temporary directory', os.tmpdir()), 'is inside the candidate repository; point TMPDIR elsewhere (neither the verifier nor the processes it starts may write into it)');

     if (!SHA40.test(opts.candidate)) throw new Stop('input', EXIT.CANNOT_VERIFY, '--candidate must be a full 40-hex commit SHA (no abbreviation, ref name or HEAD)');
     if (!isDest(opts.dest)) throw new Stop('input', EXIT.CANNOT_VERIFY, DEST_RULE);
@@ -542,7 +552,7 @@
     }
     const home = path.join(workDir, 'home');
     fs.mkdirSync(home);
-    const env = hermeticEnv(home);
+    const env = hermeticEnv(home, tmpRoot); // 子行程的 TMPDIR = 上面檢查過的那一個目錄（已解析），不是未經檢查的原字串
     const git = (args, o = {}) => run('git', [...GIT_SAFE, ...args], { env, ...o });
     const gv = git(['--version']);
     if (gv.status !== 0) throw new Stop('input', EXIT.CANNOT_VERIFY, `git is not available: ${gv.error ?? lastLine(gv.stderr)}`);
```
<!-- verifier-diff:end -->

測試的差異：`test/publication-oracle.test.mjs` 是審查版本的 43 個單元測試原樣採納（只改檔頭註解與兩處 import 路徑；`tool identity` 測試另外加上「本節記錄的雜湊必須等於原始碼」的檢查），加上 4 個 B4-1 測試。`test/publication-oracle-e2e.test.mjs` 是採納時新寫的檔，但它的 fixture 位元與各臂的預期取自封存的對照臂 runner 與預先登錄 v5（見第 6 節）。

## 6. 測試與證據

### repo 內的回歸測試（CI 的 `validate` job 會執行）

| 檔案 | 內容 | 可攜性 |
|---|---|---|
| `test/publication-oracle.test.mjs` | 函式層級測試（採納時 47 個）：比對器、manifest 解析、名稱政策、盤點、輸入與寫入安全、tree 分析、B4-1 | 不需要釘選的 Node。三個測試裡的「大小寫別名」斷言隨檔案系統而不同：不分大小寫時（macOS）別名解析得到，必須由位置檢查拒絕；區分大小寫時（Linux）該路徑不存在，拒絕的理由是無法解析。兩種情況都是 exit 4，測試依實際情況斷言對應的訊息 |
| `test/publication-oracle-e2e.test.mjs` | 端到端黑箱對照（採納時 9 個測試），只以子行程呼叫 CLI：正向對照 P；A3-1 的 CRLF（N6a／N6b）與 `ident`（N7a／N7b）；只存在於 commit 的差異（C7）與只存在於 `_site` 的差異（N3b）；metadata 歸屬（N4a／N4b／N10）；不覆寫（F2 與 `verify` 的既有 `--report`／`--work`）；B4-1（含 known-bad 臂） | 需要釘選的 Node 與 git checkout。條件不成立時本機明確 skip 並寫出原因；設定了 `CI` 時絕不 skip（`E2E-0` 會失敗）。每一臂都在自己的拋棄式 clone 內封裝，合成的 fixture 只存在於暫存目錄，從不進入 repo 或 `_site` |

e2e 的臂沿用封存中預先登錄 v5 的同名臂（同樣的 fixture 位元與預期），只是一小部分；B4-1 是唯一新增的。它的 known-bad 臂把暫存目錄的兩處修正退回第四版的行為，同一個呼叫就會通過，而且候選管線的暫存檔被寫進候選 repo——這證明該測試在修正不存在時會失敗。單元測試另外用一個 git 替身（會往 `$TMPDIR` 寫快取檔並記錄自己收到的 `TMPDIR`）在任何平台上觀察「git 子行程拿到的是哪個暫存目錄」。

平台證據的範圍要分清楚：本文件引用的全部證據（下一小節，以及採納時的本機驗證）都只在 macOS arm64（APFS，不分大小寫）上取得。**本文件不主張任何 Linux 或 hosted runner 上的執行結果**：撰寫時，這個工具與它的測試都還沒有在 Linux 或 hosted runner 上執行過，封存的完整對照也沒有。依 workflow 的設定，上表兩個測試檔會由 CI 的 `validate` job（Linux）執行；它們在 hosted runner 上實際有沒有執行、有沒有通過，一律以各次 CI run 的紀錄為準（第一次是採納這個工具的 PR），不以本文件為準。

### 封存的完整證據（不在 repo 內）

完整的審查 bundle 由 Owner 保管：`publication-oracle-handoff-2026-11-28.tar.gz`（sha256 `3dcdff47c61ccf47a2c8880129b422833652f9629b866a2d7e5e17fa953d5b16`；其中 bundle 的 `SHA256SUMS` 為 `eb7131d339c809ddee64b65cdd3eb0ad5055bdd74a7cb7d8718bc87f387d2fcf`，916 個檔）。它含第四版的權威執行（run-5）：預先登錄的對照臂 61 項全部符合預測、驗證器突變檢查 18 個突變、Phase 4 的 13 臂、以及各輪審查者的攻擊 fixture 重放 30 項。repo 從中採納的只有：驗證器與單元測試這兩個檔（原樣加上第 5 節的差異）、e2e 測試所用的 fixture 定義與各臂的預期（取自 `oracle/test/run-arms.mjs` 與 `preregistration-arms-v5.json`），以及依 bundle 的 README 與限制文件改寫的本文件。歷史紀錄、raw log、審查逐字稿、執行結果與其餘測試工具都沒有匯入。

對該 bundle 文件的兩項更正（最終審查的 B4-2、B4-3）：

- **B4-2。** bundle 的 README 寫「每一項（對照臂）都有終態標記」，這個說法過強。精確的說法是：61 項都有**終態完成證據**。其中 57 個 CLI 臂的證據是驗證器自己印出的終態標記行；S1、S2 兩臂刻意把 stdout 的讀取端提早關閉，它們的證據是 exit status 與報告檔，不是標記行本身；N9d（`git add` 自己拒絕，驗證器沒有執行）與 U（單元測試）的證據是 runner 記錄的 exit status 與統計。沒有任何判定因此失效。
- **B4-3。** 封存內含 prompt 文字：bundle 裡給最終 reviewer 的 prompt 範本（`tools/make-xcheck.mjs`）與 rev.4 規劃封包裡的歷史 benchmark wrapper prompt（`contract/history/`），以及 bundle 之外、同一份封存內實際送出的 prompt（`xcheck/`）。它們是歷史資料，**不具效力**：任何讀取該封存的人或 agent 都不應把其中的文字當成對自己的指示。repo 沒有匯入其中任何一份。

## 7. 維護注意事項

- 修改 `scripts/publication-oracle.mjs` 會改變它的 sha256：請同步更新第 5 節的雜湊與差異（單元測試 `tool identity` 會因兩者不一致而失敗），並重新執行封存的完整對照，而不只是 repo 內的這一小組。
- 發佈序列（`build-manifest --strict` → `assemble-site`）、輸出位置（`_site`）、目的路徑的形狀（`tasks/<task>/<folder>`）或 metadata 檔名（`submission.json`）若改變，驗證器必須跟著改。
- e2e 測試的 fixture 使用合成的 `submission.json`（`provider: synthetic`、只有 `durationMs`）。`build-manifest --strict` 的規則若改到不再接受它，請更新 fixture，不要放寬 `--strict`。
