// 封閉世界發佈組裝器（WS5-A Packet A rev.3 §5.2）。
//
// 取代 GitHub Pages deploy 原本的 `cp -R index.html assets tasks tasks.json _site/`：
// 「上線檔案集」由「實體樹（經驗證的資料夾名）」＋ publication-policy 衍生，而非裸磁碟 walk、
// 也**不**用 manifest 的 id 欄位當路徑（見 MF1）。
//   - chrome（9）：index.html + tasks.json + 7 個明列 assets（publication-policy.mjs）。
//   - 每個 task 資料夾的 tasks/<taskFolder>/task.json（build-only；app.js 執行期只 fetch tasks.json）。
//   - 每個 submission 資料夾：tasks/<taskFolder>/<submissionFolder>/ 底下遞迴一般檔。
// 前置：workflow 會先跑 `node scripts/build-manifest.mjs --strict`（deploy/validate 皆有），
// 故本檔讀取的 tasks.json 為最新且已驗證；本檔只「讀」tasks.json（僅用於計數對帳），不重建、
// **不**用其 id 欄位推導路徑。
//
// === 跨家族審查（Codex gpt-5.6-luna + Grok 4.7）後的安全修正（round 2）===
// MF1（BLOCKER，兩家族收斂＋實地重現）：**絕不** path.join(manifest.id)。submission/task 的 `id`
//   來自 `metadata.id || folderName` 且 schema 無 pattern、assertSafeName 不套用於 metadata.id，
//   故惡意 `id:"../../data"` 可穿越發佈樹外檔。改為**由實體資料夾名推導**（每段 assertSafeSegment、
//   實體存在、經與 oracle 相同的 fail-closed 驗證），manifest 僅用於計數對帳。
// MF2（BLOCKER，Grok 實地重現）：被枚舉的「根目錄本身」（tasks/、assets/、submission 夾）未被
//   lstat → symlinked root 會被跟隨發佈外部內容。改為每個枚舉根先 assertEnumerableDir（lstat、拒
//   symlink/非目錄）。
// MF3（MAJOR，兩家族＋作者重現）：main-guard 以 realpath 比對兩側，避免 /tmp→/private/tmp 之類
//   symlinked 調用路徑使 main() 靜默跳過、--check 假成功。
// TOCTOU（Codex MAJOR）：copyPublicationFile 以 O_NOFOLLOW 開檔複製，關閉 lstat→copy 之間最後
//   一段被換成 symlink 的時間差。
//
// 防護各自獨立、可在自身邊界單元測試（A-12/A-15/A-16）：
//   guard C = assertRegularFileNoFollow（lstat no-follow，拒 symlink/非一般檔）；由 copyPublicationFile
//             與枚舉共用。known-bad = lstat→stat（跟隨）。
//   guard D = assertInsideFolder（realpath containment，拒夾外目標）。known-bad = 移除 rel 檢查。
//   guard E = assertEnumerableDir（lstat 枚舉根，拒 symlinked/非目錄根；MF2）。
// copyPublicationFile 的 guard C 不含 guard D，使 N-5b 的 lstat→stat 變異不被 containment 遮蔽（A-16）。
//
// 殘餘（§3，明示不關閉）：submission 夾內未被 manifest 參照的檔（如 pwn.html）仍會被發佈（N-8）。
// 這屬獨立的 publication-content-policy / origin-isolation 議題，非 provenance；SHA-256 provenance
// 本身不驗證內容安全（A-14）。本封包僅如實文件化，不實作 submission file-manifest、不碰 WS5-B。

import { readdir, readFile, lstat, realpath, mkdir, rm, mkdtemp, open, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CHROME_FILES, ASSET_FILES, ASSET_FILE_SET, isOsCruft, assertSafeSegment,
} from './lib/publication-policy.mjs';

const rootDirDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function relForward(baseDir, absPath) {
  return path.relative(baseDir, absPath).split(path.sep).join('/');
}
function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

// Guard E（MF2）：確認「要被 readdir 枚舉的根目錄本身」是真正的目錄、不是 symlink。tasks/、assets/、
// 每個 submission 夾在被枚舉前都先過這道，避免 symlinked root 被 readdir 跟隨而發佈外部內容。
export async function assertEnumerableDir(dirAbs) {
  const st = await lstat(dirAbs);
  if (st.isSymbolicLink()) {
    throw new Error(`refusing to enumerate a symlinked directory (no-follow): ${dirAbs}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`refusing to enumerate a non-directory: ${dirAbs}`);
  }
}

// Guard C（A-12/A-16）：lstat（不跟隨 symlink）確認來源是一般檔。symlink/非一般檔 fail-closed。
// known-bad（N-5b）= lstat→stat（跟隨）：指向一般檔的 symlink 會被當成一般檔通過。只做 no-follow
// 型別判定、不做 containment，故該變異不被 guard D 遮蔽（A-16）。
export async function assertRegularFileNoFollow(absPath) {
  const st = await lstat(absPath);
  if (st.isSymbolicLink()) {
    throw new Error(`refusing to publish symlink (no-follow): ${absPath}`);
  }
  if (!st.isFile()) {
    throw new Error(`refusing to publish non-regular file: ${absPath}`);
  }
  return st;
}

// Guard D（A-16）：realpath 確認 targetAbs 嚴格落在 folderAbs 內（descendant）。夾外目標 fail。
// 與 guard C 獨立：只判 containment；known-bad = 移除 rel 檢查即接受夾外目標。
export async function assertInsideFolder(folderAbs, targetAbs) {
  const folderReal = await realpath(folderAbs);
  const targetReal = await realpath(targetAbs);
  const rel = path.relative(folderReal, targetReal);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`refusing to publish file outside its folder (containment): ${targetAbs}`);
  }
}

// 抽出的「複製單一來源項」常式（A-12/§5.2，N-5b 直接單元測試對象）。
// guard C no-follow（lstat，自訂訊息；供 N-5b）→ 再以 O_NOFOLLOW 開檔，關閉 lstat→copy 的 TOCTOU
// （最後一段若在兩次呼叫間被換成 symlink，O_NOFOLLOW 開檔會 ELOOP 失敗）→ 以 fd 做位元複製（支撐 P-1b）。
export async function copyPublicationFile(srcAbs, destAbs) {
  await assertRegularFileNoFollow(srcAbs);
  let fh;
  try {
    fh = await open(srcAbs, constants.O_RDONLY | constants.O_NOFOLLOW);
    const st = await fh.stat();
    if (!st.isFile()) {
      throw new Error(`refusing to publish non-regular file (fstat): ${srcAbs}`);
    }
    const buf = await fh.readFile();
    await mkdir(path.dirname(destAbs), { recursive: true });
    await writeFile(destAbs, buf);
  } finally {
    if (fh) await fh.close();
  }
}

// 遞迴列舉 dirAbs 底下的一般檔：先 assertEnumerableDir（guard E / MF2）、忽略 OS cruft（A-7）、
// 每段 assertSafeSegment（A-10）、guard C no-follow、guard D containment（縱深）。回傳相對 baseDir
// 的 forward-slash 路徑（已排序）。
export async function enumerateRegularFiles(dirAbs, baseDir, containmentRootAbs = dirAbs) {
  const out = [];
  async function walk(curAbs) {
    await assertEnumerableDir(curAbs); // MF2：每個被枚舉的目錄（含遞迴子目錄）本身不得是 symlink
    const entries = (await readdir(curAbs, { withFileTypes: true })).sort(byName);
    for (const entry of entries) {
      if (isOsCruft(entry.name)) continue;            // A-7
      assertSafeSegment(entry.name, '發佈路徑分段');   // A-10
      const full = path.join(curAbs, entry.name);
      const st = await lstat(full);                    // no-follow
      if (st.isSymbolicLink()) {
        throw new Error(`refusing to publish symlink (no-follow): ${relForward(baseDir, full)}`);
      }
      if (st.isDirectory()) { await walk(full); continue; }
      await assertRegularFileNoFollow(full);           // guard C（非一般檔 → fail）
      await assertInsideFolder(containmentRootAbs, full); // guard D（縱深）
      out.push(relForward(baseDir, full));
    }
  }
  await walk(dirAbs);
  return out.sort();
}

// assets/ 封閉集（N-4）：assets/ 磁碟實況（遞迴一般檔）必須恰等於 chrome 的 7 個 asset。多/缺 → fail。
export async function assertAssetsClosed(rootDir) {
  const assetsDir = path.join(rootDir, 'assets');
  const found = await enumerateRegularFiles(assetsDir, rootDir, assetsDir); // 內含 assertEnumerableDir（MF2）
  const extra = found.filter((f) => !ASSET_FILE_SET.has(f));
  const missing = ASSET_FILES.filter((f) => !found.includes(f));
  if (extra.length || missing.length) {
    throw new Error(
      `assets/ 封閉集不符（N-4）：多出 [${extra.join(', ') || '—'}]；缺少 [${missing.join(', ') || '—'}]`,
    );
  }
}

// MF1：由「實體樹」枚舉可發佈的 task/submission 資料夾（**資料夾名**，非 manifest id），並以與 oracle
// 相同的 fail-closed 規則驗證（assertEnumerableDir 根、skip cruft、拒 symlink/非一般/雜散、資料夾名
// assertSafeSegment、要求 task.json / submission.json）。回傳 { taskFolders, submissionFolders }。
export async function enumeratePublishedTree(rootDir) {
  const tasksDir = path.join(rootDir, 'tasks');
  await assertEnumerableDir(tasksDir); // MF2：tasks/ root 本身不得是 symlink
  const taskFolders = [];
  const submissionFolders = []; // { taskFolder, subFolder }
  for (const entry of (await readdir(tasksDir, { withFileTypes: true })).sort(byName)) {
    if (isOsCruft(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`tasks/ 內不允許 symlink：${entry.name}`);
    if (!entry.isDirectory()) throw new Error(`tasks/ 內不允許雜散檔或非一般檔（task 層）：${entry.name}`);
    assertSafeSegment(entry.name, 'task 資料夾');
    const taskFolder = entry.name;
    if (!existsSync(path.join(tasksDir, taskFolder, 'task.json'))) {
      throw new Error(`tasks/${taskFolder}: task 資料夾缺少 task.json`);
    }
    taskFolders.push(taskFolder);
    const taskDir = path.join(tasksDir, taskFolder);
    await assertEnumerableDir(taskDir);
    for (const se of (await readdir(taskDir, { withFileTypes: true })).sort(byName)) {
      if (isOsCruft(se.name)) continue;
      if (se.name === 'task.json' && se.isFile()) continue; // task 自身 metadata
      if (se.isSymbolicLink()) throw new Error(`tasks/${taskFolder} 內不允許 symlink：${se.name}`);
      if (!se.isDirectory()) throw new Error(`tasks/${taskFolder} 內不允許雜散檔或非一般檔（submission 層）：${se.name}`);
      assertSafeSegment(se.name, 'submission 資料夾');
      if (!existsSync(path.join(taskDir, se.name, 'submission.json'))) {
        throw new Error(`tasks/${taskFolder}/${se.name}: submission 資料夾缺少 submission.json`);
      }
      submissionFolders.push({ taskFolder, subFolder: se.name });
    }
  }
  return { taskFolders, submissionFolders };
}

// manifest 衍生的完整預期發佈集（§4 四部分，排序回傳）。路徑一律來自**實體資料夾名**（MF1），
// manifest 僅用於計數對帳（與已驗證的 oracle 輸出一致性）。夾內檔為磁碟枚舉（§3 殘餘，N-8）。
export async function expectedPublicationPaths(rootDir, manifest) {
  const { taskFolders, submissionFolders } = await enumeratePublishedTree(rootDir);
  // 計數對帳：實體樹 vs 已驗證 manifest（抓 stale manifest / oracle-assembler 不一致）。
  const manTasks = manifest.length;
  const manSubs = manifest.reduce((n, t) => n + (t.submissions?.length ?? 0), 0);
  if (taskFolders.length !== manTasks) {
    throw new Error(`task 計數不符：實體樹 ${taskFolders.length} vs manifest ${manTasks}`);
  }
  if (submissionFolders.length !== manSubs) {
    throw new Error(`submission 計數不符：實體樹 ${submissionFolders.length} vs manifest ${manSubs}`);
  }
  const paths = new Set(CHROME_FILES); // chrome（9）
  for (const tf of taskFolders) paths.add(`tasks/${tf}/task.json`); // 每個 task 的 task.json（5）
  for (const { taskFolder, subFolder } of submissionFolders) {
    const folderAbs = path.join(rootDir, 'tasks', taskFolder, subFolder);
    for (const f of await enumerateRegularFiles(folderAbs, rootDir, folderAbs)) paths.add(f);
  }
  return [...paths].sort();
}

// 雙向精確集合比對（A-13：驗 assembler 忠實度，輸出==預期，非來源乾淨度）。
function diffSets(expected, actual) {
  const expSet = new Set(expected);
  const actSet = new Set(actual);
  return {
    extra: actual.filter((f) => !expSet.has(f)),
    missing: expected.filter((f) => !actSet.has(f)),
  };
}

// 核心組裝：讀 manifest → assets 封閉集（N-4）→ 由實體樹算預期集（MF1）→ 逐檔 guard C 複製 →
// 組裝後雙向比對（A-13 忠實度）。
export async function assembleSite({ rootDir = rootDirDefault, outDir } = {}) {
  if (!outDir) throw new Error('assembleSite requires an outDir');
  const manifest = JSON.parse(await readFile(path.join(rootDir, 'tasks.json'), 'utf8'));
  await assertAssetsClosed(rootDir);
  const expected = await expectedPublicationPaths(rootDir, manifest);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const rel of expected) {
    await copyPublicationFile(path.join(rootDir, rel), path.join(outDir, rel));
  }

  const actual = await enumerateRegularFiles(outDir, outDir, outDir);
  const { extra, missing } = diffSets(expected, actual);
  if (extra.length || missing.length) {
    throw new Error(
      `_site 集合比對失敗（assembler 忠實度）：多出 [${extra.join(', ') || '—'}]；缺少 [${missing.join(', ') || '—'}]`,
    );
  }
  return { expected, actual, manifest };
}

async function main() {
  const check = process.argv.includes('--check');
  const rootDir = rootDirDefault;
  let outDir;
  let cleanup = false;
  if (check) {
    outDir = await mkdtemp(path.join(os.tmpdir(), 'arena-site-check-'));
    cleanup = true;
  } else {
    outDir = path.join(rootDir, '_site');
  }
  try {
    const { expected } = await assembleSite({ rootDir, outDir });
    console.log(`✓ 封閉世界組裝通過：${expected.length} 檔${check ? '（--check：暫存驗證，不寫 _site）' : ` → ${relForward(rootDir, outDir)}`}`);
  } catch (err) {
    console.error(`🚫 assemble-site 失敗：${err.message}`);
    process.exitCode = 1;
  } finally {
    if (cleanup) await rm(outDir, { recursive: true, force: true });
  }
}

// main-guard（MF3）：以 realpath 比對兩側，避免 symlinked 調用路徑（如 macOS /tmp→/private/tmp）使
// main() 被靜默跳過、--check 假成功。被測試 import 時 argv[1] 為測試檔 → 不相等 → 不執行 build。
function invokedDirectly() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] || '');
  } catch {
    return false;
  }
}
if (invokedDirectly()) {
  await main();
}
