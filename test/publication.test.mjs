// 封閉世界發佈強化回歸測試（WS5-A Packet A rev.3 §6；node --test，零依賴）。
//
// 全部「先寫預期、後跑實際」。負向臂（N-*）皆以「只停用它所測的那一道防護」的隔離 known-bad
// 反證該臂具鑑別力、且防護為載重（ground-truth-gates rule 2；A-12 獨立性）：
//   - guard A = build-manifest 的 assertNoSymlinks（symlink 主防線，遞迴預掃）
//   - guard B = build-manifest 的 classifyTreeEntry（no-follow 型別判定：雜散/非一般/symlink）
//   - guard C = assemble-site 的 assertRegularFileNoFollow / copyPublicationFile（lstat no-follow）
//   - guard D = assemble-site 的 assertInsideFolder（realpath containment）
// A-15：assertNoSymlinks 在「自身函式邊界」測、classifyTreeEntry 的 no-follow 另獨立測；停用其一
//        不需、也不弱化另一道。A-16：guard C 以「指向夾內一般檔的 symlink」測 no-follow（containment
//        不會遮蔽該變異）；guard D 以「夾外目標」獨立測。
// P-6（組裝後 _site 直接瀏覽器渲染）屬瀏覽器套件：見 test/browser/assembled-site.spec.mjs。

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import {
  mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync,
  readdirSync, readFileSync, existsSync, cpSync, copyFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { assertNoSymlinks, classifyTreeEntry } from '../scripts/build-manifest.mjs';
import {
  assembleSite, expectedPublicationPaths, assertRegularFileNoFollow,
  assertInsideFolder, copyPublicationFile,
} from '../scripts/assemble-site.mjs';
import { CHROME_FILES, ASSET_FILES } from '../scripts/lib/publication-policy.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUILD_MANIFEST = fileURLToPath(new URL('../scripts/build-manifest.mjs', import.meta.url));

// ── temp 管理 ──────────────────────────────────────────────────────────────
const tmpDirs = [];
function mktmp(prefix = 'pub-test-') {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

// ── 共用工具 ──────────────────────────────────────────────────────────────
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function listFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  })(dir);
  return out.sort();
}
// 用真實 cp -R 在 clean 樹上做出 deploy 的參考發佈集（與 pages.yml 的 cp -R 完全相同）。
function cpReference() {
  const dest = mktmp('cp-ref-');
  execFileSync('cp', ['-R', 'index.html', 'assets', 'tasks', 'tasks.json', dest], { cwd: ROOT });
  return dest;
}
// 建一棵隔離、schema-valid 的 mini-repo fixture（複製真實 chrome + schema + data + 指定 task）。
function makeFixture(tasks = ['spinning-cube']) {
  const root = mktmp('fixture-root-');
  copyFileSync(path.join(ROOT, 'index.html'), path.join(root, 'index.html'));
  cpSync(path.join(ROOT, 'assets'), path.join(root, 'assets'), { recursive: true });
  cpSync(path.join(ROOT, 'schema'), path.join(root, 'schema'), { recursive: true });
  if (existsSync(path.join(ROOT, 'data'))) cpSync(path.join(ROOT, 'data'), path.join(root, 'data'), { recursive: true });
  mkdirSync(path.join(root, 'tasks'), { recursive: true });
  for (const t of tasks) cpSync(path.join(ROOT, 'tasks', t), path.join(root, 'tasks', t), { recursive: true });
  return root;
}
// 在 fixture 樹上跑「真實」的 build-manifest（ARENA_ROOT 覆寫 root），回傳 {status, stderr}。
function runOracle(root, args = []) {
  try {
    const stdout = execFileSync('node', [BUILD_MANIFEST, '--output', path.join(root, 'tasks.json'), ...args], {
      env: { ...process.env, ARENA_ROOT: root }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(e.message ?? e) };
  }
}
// 取某目錄下指定名稱的 Dirent（供 classifyTreeEntry 單元測試）。
async function direntOf(dir, name) {
  return (await readdir(dir, { withFileTypes: true })).find((e) => e.name === name);
}

// ═══════════════════════ 正向（must PASS）═══════════════════════

// P-1a：對真實樹跑組裝器，_site 路徑集 == clean cp -R 的 407 條路徑（DROPPED=0 / EXTRA=0）。
test('P-1a: assembled _site path-set == cp -R (407 paths, DROPPED=0 EXTRA=0)', async () => {
  const siteDir = mktmp('p1-site-');
  const { expected } = await assembleSite({ rootDir: ROOT, outDir: siteDir });
  const sitePaths = listFiles(siteDir);
  const refPaths = listFiles(cpReference());
  assert.equal(refPaths.length, 407, 'cp -R clean-tree 參考集應為 407');
  const dropped = refPaths.filter((p) => !sitePaths.includes(p)); // 在 cp -R、不在組裝器
  const extra = sitePaths.filter((p) => !refPaths.includes(p));    // 在組裝器、不在 cp -R
  assert.deepEqual(dropped, [], 'DROPPED 必須為空');
  assert.deepEqual(extra, [], 'EXTRA 必須為空');
  assert.equal(sitePaths.length, 407);
  assert.equal(expected.length, 407, 'assembleSite 回報的預期集也應為 407');
});

// P-1b：同時對真實樹跑組裝器與 cp -R，對全部 407 檔逐檔 byte 比對（§0 的「位元相同」只由此證成）。
test('P-1b: all 407 published files are byte-identical to cp -R (per-file sha256)', async () => {
  const siteDir = mktmp('p1b-site-');
  await assembleSite({ rootDir: ROOT, outDir: siteDir });
  const refDir = cpReference();
  const sitePaths = listFiles(siteDir);
  assert.equal(sitePaths.length, 407);
  const siteHashes = Object.fromEntries(sitePaths.map((p) => [p, sha256(path.join(siteDir, p))]));
  const refHashes = Object.fromEntries(listFiles(refDir).map((p) => [p, sha256(path.join(refDir, p))]));
  assert.deepEqual(siteHashes, refHashes, '每個保留發佈檔的內容必須與 cp -R 位元相同');
});

// P-2：計數（1 index + 1 tasks.json + 7 assets + 5 task.json + 393 submission 檔 = 407；submission==75）。
test('P-2: _site counts = 1+1+7+5+393 = 407, and submissions == 75', async () => {
  const siteDir = mktmp('p2-site-');
  await assembleSite({ rootDir: ROOT, outDir: siteDir });
  const files = listFiles(siteDir);
  assert.equal(files.length, 407);
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('tasks.json'));
  assert.equal(files.filter((f) => f.startsWith('assets/')).length, 7);
  assert.equal(files.filter((f) => /^tasks\/[^/]+\/task\.json$/.test(f)).length, 5);
  assert.equal(files.filter((f) => /^tasks\/[^/]+\/[^/]+\/submission\.json$/.test(f)).length, 75);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'tasks.json'), 'utf8'));
  assert.equal(manifest.reduce((n, t) => n + (t.submissions?.length ?? 0), 0), 75);
});

// P-3：強化後的 oracle 對真實樹產生的 tasks.json 與現committed位元相同（continue→reject 在真實樹 no-op）。
test('P-3: hardened build-manifest reproduces committed tasks.json byte-for-byte (no-op on clean tree)', () => {
  const out = path.join(mktmp('p3-'), 'tasks.json');
  const r = execFileSync('node', [BUILD_MANIFEST, '--output', out], { encoding: 'utf8' }); // ARENA_ROOT 未設 → 真實樹
  assert.match(r, /5 tasks, 75 submissions/);
  assert.equal(sha256(out), sha256(path.join(ROOT, 'tasks.json')), '強化後 tasks.json 必須與 committed 位元相同');
});

// P-4：乾淨 fixture → oracle 成功、組裝成功、組裝後集合比對通過。
test('P-4: clean fixture assembles successfully and the set comparison passes', async () => {
  const root = makeFixture(['spinning-cube', 'bouncing-balls']);
  const oracle = runOracle(root);
  assert.equal(oracle.status, 0, `oracle 在乾淨 fixture 應成功，stderr=${oracle.stderr}`);
  const siteDir = mktmp('p4-site-');
  const { expected, actual } = await assembleSite({ rootDir: root, outDir: siteDir });
  assert.equal(expected.length, actual.length, '組裝後 _site 集合必須等於預期集（忠實度）');
  assert.ok(expected.includes('index.html') && expected.includes('tasks.json'));
  assert.ok(expected.some((f) => /^tasks\/spinning-cube\/.+\/submission\.json$/.test(f)));
});

// P-5：組裝器輸出為 repo root 的「位元相同子集」→ 既有 browser-smoke（服務 repo root）的渲染對已發佈
// 子集等價。以可執行檢查證成：每個 _site 檔的位元 == repo root 同路徑檔的位元。
test('P-5: _site is a byte-identical SUBSET of repo root (coverage argument, made executable)', async () => {
  const siteDir = mktmp('p5-site-');
  await assembleSite({ rootDir: ROOT, outDir: siteDir });
  for (const rel of listFiles(siteDir)) {
    const inRoot = path.join(ROOT, rel);
    assert.ok(existsSync(inRoot), `發佈檔必須存在於 repo root：${rel}`);
    assert.equal(sha256(path.join(siteDir, rel)), sha256(inRoot), `發佈檔必須與 repo root 位元相同：${rel}`);
  }
});

// ═══════════════════════ 負向（must be REJECTED / EXCLUDED；含隔離 known-bad）═══════════════════════

// N-1：task 層目錄缺 task.json → oracle fail（原 continue→fail）。兩側鑑別：加回 task.json 即通過。
test('N-1: task dir without task.json → oracle fails (reverting fix would accept — two-sided)', () => {
  const root = makeFixture(['spinning-cube']);
  mkdirSync(path.join(root, 'tasks', 'not-a-submission'));
  writeFileSync(path.join(root, 'tasks', 'not-a-submission', 'index.html'), '<x>');
  const bad = runOracle(root);
  assert.equal(bad.status, 1, 'oracle 必須對無 task.json 的目錄 fail-closed');
  assert.match(bad.stderr, /缺少 task\.json/, '需為 N-1 專屬訊息（唯一訊號）');
  // known-good 對照（證明非「一律拒絕」的套套邏輯）：把缺陷目錄補上合法 task 即通過。
  rmSync(path.join(root, 'tasks', 'not-a-submission'), { recursive: true, force: true });
  cpSync(path.join(ROOT, 'tasks', 'bouncing-balls'), path.join(root, 'tasks', 'bouncing-balls'), { recursive: true });
  assert.equal(runOracle(root).status, 0, '補上合法 task 後 oracle 應通過');
});

// N-2：tasks/ 頂層雜散檔 → oracle fail。known-bad（guard B 層）：classifyTreeEntry 對一般檔必拒；
// 對目錄回 'dir'（證明它不是一律拒絕）。
test('N-2: top-level stray file → oracle fails; guard B classifyTreeEntry discriminates', async () => {
  const root = makeFixture(['spinning-cube']);
  writeFileSync(path.join(root, 'tasks', 'loose.html'), '<stray>');
  const bad = runOracle(root);
  assert.equal(bad.status, 1, 'oracle 必須對頂層雜散檔 fail-closed');
  assert.match(bad.stderr, /雜散檔或非一般檔/, '需為 guard B 專屬訊息');
  // guard B 自身邊界：一般檔（stray）丟出；目錄回 'dir'（兩側鑑別）。
  const dir = mktmp('n2-'); writeFileSync(path.join(dir, 'loose.html'), 'x'); mkdirSync(path.join(dir, 'realdir'));
  assert.throws(() => classifyTreeEntry(syncDirent(dir, 'loose.html'), 'task'), /雜散檔或非一般檔/);
  assert.equal(classifyTreeEntry(syncDirent(dir, 'realdir'), 'task'), 'dir');
});

// N-3：submission 夾缺 submission.json 但有 index.html → oracle fail（原 continue→fail）。兩側鑑別。
test('N-3: submission dir without submission.json → oracle fails (two-sided)', () => {
  const root = makeFixture(['spinning-cube']);
  const stray = path.join(root, 'tasks', 'spinning-cube', 'no-meta-sub');
  mkdirSync(stray); writeFileSync(path.join(stray, 'index.html'), '<x>');
  const bad = runOracle(root);
  assert.equal(bad.status, 1, 'oracle 必須對無 submission.json 的目錄 fail-closed');
  assert.match(bad.stderr, /缺少 submission\.json/, '需為 N-3 專屬訊息');
  rmSync(stray, { recursive: true, force: true });
  assert.equal(runOracle(root).status, 0, '移除缺陷目錄後 oracle 應通過');
});

// N-4：assets/pwn.html（清單外 assets）→ 組裝器 assertAssetsClosed fail（且 --check 在 PR 即 fail）。
// A-13 關鍵：組裝後「集合比對」看不見它（它不在預期集、也不會被複製）；assertAssetsClosed 才是偵測者。
test('N-4: assets/pwn.html → assembler fails on assets-closed-set; set-comparison alone is blind', async () => {
  const root = makeFixture(['spinning-cube']);
  assert.equal(runOracle(root).status, 0);                 // oracle 不掃 assets → 不會擋
  writeFileSync(path.join(root, 'assets', 'pwn.html'), '<pwn>');
  await assert.rejects(assembleSite({ rootDir: root, outDir: mktmp('n4-') }), /封閉集不符（N-4）/);
  // A-13 demonstration：若「集合比對」是唯一防線則偵測不到 —— pwn.html 不是 manifest 衍生，
  // 不在預期集、也不會被複製 → _site 與預期集「兩側皆無」→ 比對通過（盲）。證明 closed-set 檢查為載重。
  const manifest = JSON.parse(readFileSync(path.join(root, 'tasks.json'), 'utf8'));
  const expected = await expectedPublicationPaths(root, manifest);
  assert.ok(!expected.includes('assets/pwn.html'), '雜散 assets 不在 manifest 衍生的預期集內（故集合比對盲）');
});

// N-5a（A-15：oracle guard A，於自身函式邊界）：assertNoSymlinks 對含 symlink 的目錄 fail-closed；
// known-bad = 移除 isSymbolicLink 檢查的本地變體 → 不再 fail（證明該檢查為載重、且只碰 guard A）。
test('N-5a: assertNoSymlinks rejects a symlink (guard A boundary); mutant without the check accepts', async () => {
  const dir = mktmp('n5a-'); mkdirSync(path.join(dir, 'nested'));
  symlinkSync(os.tmpdir(), path.join(dir, 'nested', 'evil')); // 任一 symlink entry
  await assert.rejects(assertNoSymlinks(dir), /symlink|escapes the repository/, 'guard A 必須 fail-closed');
  // known-bad：複製 assertNoSymlinks 但「只」拿掉 isSymbolicLink 檢查（隔離變異，不碰其他防護）。
  const mutant = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) await mutant(path.join(d, e.name)); // 無 isSymbolicLink → 不擋
    }
  };
  await mutant(dir); // 不丟出 → 證明 isSymbolicLink 檢查是 guard A 的載重點
});

// N-5a-ii（A-15：oracle guard B 的 no-follow，獨立於 guard A）：classifyTreeEntry 對 symlink Dirent 拒；
// known-bad = 改用 stat（跟隨）判型 → symlink→dir 被當 'dir' 接受。只碰 guard B。
test('N-5a-ii: classifyTreeEntry (guard B no-follow) rejects a symlink; stat-follow mutant accepts', async () => {
  const dir = mktmp('n5aii-'); const target = mktmp('n5aii-target-');
  symlinkSync(target, path.join(dir, 'linkdir')); // symlink → 真實目錄
  const ent = await direntOf(dir, 'linkdir');
  assert.throws(() => classifyTreeEntry(ent, 'task'), /symlink/, 'guard B 以 no-follow 型別拒 symlink');
  // known-bad：以 stat（跟隨）判型的本地變體。
  const followMutant = async (d, name, level) => {
    const st = await stat(path.join(d, name)); // follow!
    if (st.isDirectory()) return 'dir';
    if (level === 'submission' && name === 'task.json' && st.isFile()) return 'task-json';
    throw new Error('stray');
  };
  assert.equal(await followMutant(dir, 'linkdir', 'task'), 'dir', 'stat-follow 會把 symlink→dir 當成 dir 接受');
});

// N-5b（A-16：assembler guard C，獨立；以「指向夾內一般檔的 symlink」測 no-follow，containment 不遮蔽）：
// copyPublicationFile 拒 symlink 來源；known-bad = lstat→stat 的本地變體 → 跟隨複製夾內目標。
test('N-5b: copyPublicationFile (guard C lstat no-follow) rejects an in-folder symlink; stat mutant follows', async () => {
  const folder = mktmp('n5b-folder-'); const outDir = mktmp('n5b-out-');
  writeFileSync(path.join(folder, 'real.txt'), 'payload');
  symlinkSync('real.txt', path.join(folder, 'link.txt')); // 夾內目標（A-16：containment 不會遮蔽 lstat→stat）
  await assert.rejects(copyPublicationFile(path.join(folder, 'link.txt'), path.join(outDir, 'link.txt')),
    /symlink \(no-follow\)/, 'guard C 必須拒 symlink 來源');
  // 正向對照：一般檔來源可複製（證明非一律拒絕）。
  await copyPublicationFile(path.join(folder, 'real.txt'), path.join(outDir, 'real.txt'));
  assert.equal(readFileSync(path.join(outDir, 'real.txt'), 'utf8'), 'payload');
  // known-bad：lstat→stat 的本地變體 → 跟隨 symlink 複製夾內目標。
  const copyFollowMutant = async (src, dest) => {
    const st = await stat(src); // follow!
    if (!st.isFile()) throw new Error('not a file');
    copyFileSync(src, dest);
  };
  await copyFollowMutant(path.join(folder, 'link.txt'), path.join(outDir, 'followed.txt'));
  assert.equal(readFileSync(path.join(outDir, 'followed.txt'), 'utf8'), 'payload', 'stat-follow 變體會跟隨複製目標');
});

// N-5b-ii（A-16：assembler guard D containment，獨立；以「夾外目標」測）：assertInsideFolder 拒夾外、
// 允許夾內；known-bad = 移除 rel 檢查 → 接受夾外。
test('N-5b-ii: assertInsideFolder (guard D containment) rejects out-of-folder; mutant without check accepts', async () => {
  const base = mktmp('n5bii-'); const folder = path.join(base, 'sub'); mkdirSync(folder);
  const inFile = path.join(folder, 'a.txt'); writeFileSync(inFile, 'x');
  const outFile = path.join(base, 'outside.txt'); writeFileSync(outFile, 'y');
  await assertInsideFolder(folder, inFile); // 夾內 → 不丟（正向對照）
  await assert.rejects(assertInsideFolder(folder, outFile), /containment/, 'guard D 必須拒夾外目標');
  const mutant = async () => {}; // known-bad：無 containment 檢查
  await mutant(); // 不丟 → 證明 rel 檢查為載重點
});

// N-5c（端到端）：完整實作（oracle + assembler 兩防護俱在）拒 symlink 攻擊。
test('N-5c: full pipeline rejects a symlink end-to-end (oracle guard A AND assembler guard C)', async () => {
  // (i) 完整 oracle：tasks/ 內植入 symlink → assertNoSymlinks（guard A）在讀任何 metadata 前即擋。
  const root = makeFixture(['spinning-cube']);
  symlinkSync(path.join(root, 'tasks', 'spinning-cube'), path.join(root, 'tasks', 'linky'));
  const oracle = runOracle(root);
  assert.equal(oracle.status, 1, '完整 oracle 必須拒 symlink');
  assert.match(oracle.stderr, /symlink/, 'guard A 訊號');
  // (ii) 即便假想繞過 oracle，assembler 列舉 submission 夾內 symlink（guard C）仍擋。
  const folder = mktmp('n5c-folder-');
  writeFileSync(path.join(folder, 'index.html'), '<x>');
  symlinkSync('/etc/hosts', path.join(folder, 'evil')); // 夾內 symlink
  await assert.rejects(assertRegularFileNoFollow(path.join(folder, 'evil')), /symlink \(no-follow\)/);
});

// N-6：非一般檔（FIFO）→ oracle guard B 與 assembler guard C 各以 no-follow 型別拒（各層獨立）。
test('N-6: non-regular file (FIFO) → rejected at both guard B (oracle) and guard C (assembler)', async () => {
  const dir = mktmp('n6-');
  try { execFileSync('mkfifo', [path.join(dir, 'pipe')]); }
  catch { return; } // 無 mkfifo 的環境略過（CI ubuntu 有）
  const ent = await direntOf(dir, 'pipe');
  assert.throws(() => classifyTreeEntry(ent, 'task'), /雜散檔或非一般檔/, 'guard B 拒非一般檔');
  await assert.rejects(assertRegularFileNoFollow(path.join(dir, 'pipe')), /non-regular file/, 'guard C 拒非一般檔');
});

// N-7（A-13）：合法 submission + 夾外未被 manifest 涵蓋的雜散目錄 → oracle 為「唯一偵測者」。
// 更正：雙向集合比對並非縱深次防線 —— 夾外雜散不是 manifest 衍生，根本不進預期集/不被複製 →
// 同時排除於 _site 與預期集 → 比對看不見它（不得宣稱「集合比對會擋」）。
test('N-7: folder-external stray → ONLY the oracle detects it; set comparison is blind (A-13)', async () => {
  const root = makeFixture(['spinning-cube']);
  // (a) oracle 為唯一偵測者：夾外雜散目錄（無 submission.json）→ oracle fail。
  const stray = path.join(root, 'tasks', 'spinning-cube', 'stray-not-in-manifest');
  mkdirSync(stray); writeFileSync(path.join(stray, 'junk.html'), '<x>');
  assert.equal(runOracle(root).status, 1, 'oracle 必須擋夾外雜散（唯一來源側偵測者）');
  // (b) A-13：證明「集合比對」對此雜散無鑑別力 —— 以乾淨樹的 manifest 計算預期集，雜散不在其中。
  const clean = makeFixture(['spinning-cube']);
  assert.equal(runOracle(clean).status, 0);
  const manifest = JSON.parse(readFileSync(path.join(clean, 'tasks.json'), 'utf8'));
  mkdirSync(path.join(clean, 'tasks', 'spinning-cube', 'stray-not-in-manifest'));
  writeFileSync(path.join(clean, 'tasks', 'spinning-cube', 'stray-not-in-manifest', 'junk.html'), '<x>');
  const expected = await expectedPublicationPaths(clean, manifest);
  assert.ok(!expected.some((f) => f.includes('stray-not-in-manifest')),
    '夾外雜散不在 manifest 衍生預期集 → 組裝器不複製 → 集合比對兩側皆無 → 看不見（故不得宣稱比對會擋）');
});

// N-8（rev.2 文件化殘餘，A-14 歸類）：合法 submission 夾「內」未被 manifest 參照的 pwn.html 仍會被
// 發佈。此為已知界線（direct-URL same-origin 導覽），屬獨立 publication-content-policy / origin-
// isolation 議題，非 provenance（SHA-256 provenance 本身不驗證內容安全）。本封包範圍外 —— 僅以
// 「記錄當前行為」方式文件化，不宣稱關閉、不寫「會失敗（被拒）」斷言（否則偽稱關閉）。
test('N-8: folder-INTERNAL unreferenced file IS still published — documented residual, NOT closed (A-14)', async () => {
  const root = makeFixture(['spinning-cube']);
  assert.equal(runOracle(root).status, 0);
  // 選一個真實 submission 夾，塞入未被 submission.json 參照的 pwn.html（合法夾內檔）。
  const subDir = path.join(root, 'tasks', 'spinning-cube', 'opus-4.8-high');
  assert.ok(existsSync(subDir));
  writeFileSync(path.join(subDir, 'pwn.html'), '<pwn>');
  const siteDir = mktmp('n8-site-');
  const { expected } = await assembleSite({ rootDir: root, outDir: siteDir });
  // 記錄已知界線：pwn.html 仍被發佈（與現行 cp -R 相同；本封包未使之惡化，亦未關閉）。
  assert.ok(expected.includes('tasks/spinning-cube/opus-4.8-high/pwn.html'),
    'N-8 殘餘：夾內未參照檔仍被發佈（content-policy/origin-isolation 議題，非 provenance；A-14）');
  assert.ok(existsSync(path.join(siteDir, 'tasks/spinning-cube/opus-4.8-high/pwn.html')));
});

// classifyTreeEntry 的同步 Dirent 取得工具（N-2 用）。
function syncDirent(dir, name) {
  return readdirSync(dir, { withFileTypes: true }).find((e) => e.name === name);
}
