// 封閉世界發佈組裝器（WS5-A Packet A rev.3 §5.2）。
//
// 取代 GitHub Pages deploy 原本的 `cp -R index.html assets tasks tasks.json _site/`：
// 「上線檔案集」由 manifest（tasks.json）+ publication-policy 衍生，而非裸磁碟 walk。
//   - chrome（9）：index.html + tasks.json + 7 個明列 assets（publication-policy.mjs）。
//   - 每個 task 的 tasks/<taskId>/task.json（build-only；app.js 執行期只 fetch tasks.json）。
//   - 每筆 submission：tasks/<taskId>/<submissionId>/ 底下遞迴一般檔（夾由「身分」推導、不解析
//     manifest 的 path 欄位 — A-5）。
// 前置：workflow 會先跑 `node scripts/build-manifest.mjs --strict`（deploy/validate 皆有），
// 故本檔讀取的 tasks.json 為最新且已驗證；本檔只「讀」tasks.json，不自行重建。
//
// 防護各自獨立、可在自身邊界單元測試（A-12/A-15/A-16）：
//   guard C = assertRegularFileNoFollow（lstat no-follow，拒 symlink/非一般檔）；由 copyPublicationFile
//             與枚舉共用。known-bad = lstat→stat（跟隨）。
//   guard D = assertInsideFolder（realpath containment，拒夾外目標）。known-bad = 移除 rel 檢查。
// copyPublicationFile 刻意「只含 guard C、不含 guard D」，使 N-5b 的 lstat→stat 變異不會被 containment
// 遮蔽（A-16）：以「指向夾內一般檔的 symlink」測 no-follow；containment 另以「夾外目標」獨立測。
//
// 殘餘（§3，明示不關閉）：submission 夾內未被 manifest 參照的檔（如 pwn.html）仍會被發佈（N-8）。
// 這屬獨立的 publication-content-policy / origin-isolation 議題，非 provenance；SHA-256 provenance
// 本身不驗證內容安全（A-14）。本封包僅如實文件化，不實作 submission file-manifest、不碰 WS5-B。

import { readdir, readFile, lstat, realpath, mkdir, copyFile, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CHROME_FILES, ASSET_FILES, ASSET_FILE_SET, isOsCruft, assertSafeSegment,
} from './lib/publication-policy.mjs';

const rootDirDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 相對某個 base 的 forward-slash 路徑（跨平台一致，供集合比對與 URL）。
function relForward(baseDir, absPath) {
  return path.relative(baseDir, absPath).split(path.sep).join('/');
}

function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

// Guard C（A-12/A-16）：以 lstat（不跟隨 symlink）確認來源是一般檔。symlink 或非一般檔（FIFO/
// socket/device）一律 fail-closed。回傳 lstat 結果。known-bad（N-5b）= 把 lstat 換成 stat（跟隨）：
// 指向一般檔的 symlink 會被當成一般檔而通過（跟隨複製目標）。本函式只做 no-follow 型別判定、不做
// containment，故該變異不被 guard D 遮蔽（A-16）。
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

// Guard D（A-16）：以 realpath 確認 targetAbs 嚴格落在 folderAbs 之內（descendant）。夾外目標 fail。
// 與 guard C 獨立：本函式不判型、只判 containment；known-bad = 移除 rel 檢查即接受夾外目標。
// 以路徑分段（path.relative）判斷，不用字串 startsWith，避免把 ..foo 這種合法名稱誤判。
export async function assertInsideFolder(folderAbs, targetAbs) {
  const folderReal = await realpath(folderAbs);
  const targetReal = await realpath(targetAbs);
  const rel = path.relative(folderReal, targetReal);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`refusing to publish file outside its folder (containment): ${targetAbs}`);
  }
}

// 抽出的「複製單一來源項」常式（A-12/§5.2，N-5b 直接單元測試對象）：guard C no-follow + 位元複製
// （copyFile 保留內容位元 → 支撐 P-1b）。刻意不含 guard D（見檔首說明）。
export async function copyPublicationFile(srcAbs, destAbs) {
  await assertRegularFileNoFollow(srcAbs);
  await mkdir(path.dirname(destAbs), { recursive: true });
  await copyFile(srcAbs, destAbs);
}

// 遞迴列舉 dirAbs 底下的一般檔：忽略 OS cruft（A-7）、每段 assertSafeSegment（A-10）、guard C
// no-follow（不跟隨 symlink、拒非一般檔）、guard D containment（縱深）。回傳相對 baseDir 的
// forward-slash 路徑（已排序）。containmentRootAbs 預設為 dirAbs。
export async function enumerateRegularFiles(dirAbs, baseDir, containmentRootAbs = dirAbs) {
  const out = [];
  async function walk(curAbs) {
    const entries = (await readdir(curAbs, { withFileTypes: true })).sort(byName);
    for (const entry of entries) {
      if (isOsCruft(entry.name)) continue;            // A-7
      assertSafeSegment(entry.name, '發佈路徑分段');   // A-10：每個被枚舉的分段都檢查
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

// assets/ 封閉集（N-4）：assets/ 磁碟實況（遞迴一般檔）必須恰等於 chrome 的 7 個 asset。
// 多（如 assets/pwn.html）或缺 → fail-closed。這是讓「清單外 assets 檔」在 PR `--check` 即 fail
// 的關鍵；單靠組裝後集合比對不會偵測它（它不在預期集、也不會被複製，比對兩側皆無 → 看不見）。
export async function assertAssetsClosed(rootDir) {
  const assetsDir = path.join(rootDir, 'assets');
  const found = await enumerateRegularFiles(assetsDir, rootDir, assetsDir);
  const extra = found.filter((f) => !ASSET_FILE_SET.has(f));
  const missing = ASSET_FILES.filter((f) => !found.includes(f));
  if (extra.length || missing.length) {
    throw new Error(
      `assets/ 封閉集不符（N-4）：多出 [${extra.join(', ') || '—'}]；缺少 [${missing.join(', ') || '—'}]`,
    );
  }
}

// manifest 衍生的完整預期發佈集（§4 四部分，排序回傳）。submission 夾由身分推導（不解析 path）；
// 夾內檔為磁碟枚舉（§3 殘餘，N-8）。
export async function expectedPublicationPaths(rootDir, manifest) {
  const paths = new Set();
  for (const f of CHROME_FILES) paths.add(f);                 // chrome（9）
  for (const task of manifest) {                              // 每個 task 的 task.json（5）
    const taskJsonRel = `tasks/${task.id}/task.json`;
    if (!existsSync(path.join(rootDir, taskJsonRel))) {
      throw new Error(`expected task.json missing: ${taskJsonRel}`);
    }
    paths.add(taskJsonRel);
  }
  for (const task of manifest) {                              // 每筆 submission 夾內遞迴一般檔
    for (const sub of task.submissions || []) {
      const folderAbs = path.join(rootDir, 'tasks', task.id, sub.id);
      if (!existsSync(folderAbs)) {
        throw new Error(`expected submission folder missing (A-5): tasks/${task.id}/${sub.id}`);
      }
      for (const f of await enumerateRegularFiles(folderAbs, rootDir, folderAbs)) paths.add(f);
    }
  }
  return [...paths].sort();
}

// 雙向精確集合比對（A-13：驗 assembler 忠實度，輸出==預期，非來源乾淨度）。
function diffSets(expected, actual) {
  const expSet = new Set(expected);
  const actSet = new Set(actual);
  return {
    extra: actual.filter((f) => !expSet.has(f)),     // _site 有、預期無（多複製）
    missing: expected.filter((f) => !actSet.has(f)), // 預期有、_site 無（漏複製）
  };
}

// 核心組裝：讀 manifest → assets 封閉集（N-4）→ 算預期集 → 逐檔 guard C 複製 → 組裝後雙向比對。
export async function assembleSite({ rootDir = rootDirDefault, outDir } = {}) {
  if (!outDir) throw new Error('assembleSite requires an outDir');
  const manifest = JSON.parse(await readFile(path.join(rootDir, 'tasks.json'), 'utf8'));
  await assertAssetsClosed(rootDir);                          // N-4
  const expected = await expectedPublicationPaths(rootDir, manifest);

  await rm(outDir, { recursive: true, force: true });         // 乾淨 outDir
  await mkdir(outDir, { recursive: true });
  for (const rel of expected) {
    await copyPublicationFile(path.join(rootDir, rel), path.join(outDir, rel)); // guard C + 位元複製
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

const invokedDirectly = import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href;
if (invokedDirectly) {
  await main();
}
