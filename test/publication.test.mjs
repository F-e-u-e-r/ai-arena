// 封閉世界發佈強化回歸測試（WS5-A Packet A rev.3 §6 + 跨家族審查 round-2 修正；node --test，零依賴）。
//
// 全部「先寫預期、後跑實際」。負向臂（N-*）皆以「只停用它所測的那一道防護」的隔離 known-bad
// 反證該臂具鑑別力、且防護為載重（ground-truth-gates rule 2；A-12 獨立性）：
//   guard A = build-manifest assertNoSymlinks（symlink 主防線，遞迴預掃 + 根 lstat）
//   guard A' = build-manifest assertNoSymlinks 內的「非一般檔」防護（FIFO/socket/device，排除 symlink）
//   guard B  = build-manifest classifyTreeEntry（直接子項 no-follow 型別判定）
//   guard C  = assemble-site assertRegularFileNoFollow（lstat no-follow）
//   guard D  = assemble-site assertInsideFolder（realpath containment）
//   guard E  = assemble-site assertEnumerableDir（枚舉根 lstat，拒 symlinked/非目錄根；MF2）
// round-2（跨家族 Codex gpt-5.6-luna + Grok 4.7 收斂發現，作者第一手重現後修正）：
//   N-9  = manifest id 路徑穿越（MF1：改由實體資料夾名推導，絕不 path-join metadata.id）
//   N-10 = root symlink（MF2：assertEnumerableDir / assertNoSymlinks 根 lstat）
//   N-11 = main-guard 經 symlinked 調用路徑仍執行（MF3：realpath 兩側）
// P-6（組裝後 _site 直接瀏覽器渲染）屬瀏覽器套件：見 test/browser/assembled-site.spec.mjs。

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import {
  mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync,
  readdirSync, readFileSync, existsSync, cpSync, copyFileSync, lstatSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { assertNoSymlinks, classifyTreeEntry } from '../scripts/build-manifest.mjs';
import {
  assembleSite, expectedPublicationPaths, assertRegularFileNoFollow,
  assertInsideFolder, assertEnumerableDir, enumeratePublishedTree, copyPublicationFile,
} from '../scripts/assemble-site.mjs';
import { CHROME_FILES, ASSET_FILES } from '../scripts/lib/publication-policy.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUILD_MANIFEST = fileURLToPath(new URL('../scripts/build-manifest.mjs', import.meta.url));
const ASSEMBLE = fileURLToPath(new URL('../scripts/assemble-site.mjs', import.meta.url));

// ── temp 管理 ──────────────────────────────────────────────────────────────
const tmpDirs = [];
function mktmp(prefix = 'pub-test-') {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

// ── 共用工具 ──────────────────────────────────────────────────────────────
function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
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
function cpReference() {
  const dest = mktmp('cp-ref-');
  execFileSync('cp', ['-R', 'index.html', 'assets', 'tasks', 'tasks.json', dest], { cwd: ROOT });
  return dest;
}
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
async function direntOf(dir, name) {
  return (await readdir(dir, { withFileTypes: true })).find((e) => e.name === name);
}
function syncDirent(dir, name) {
  return readdirSync(dir, { withFileTypes: true }).find((e) => e.name === name);
}

// ═══════════════════════ 正向（must PASS）═══════════════════════

test('P-1a: assembled _site path-set == cp -R (407 paths, DROPPED=0 EXTRA=0)', async () => {
  const siteDir = mktmp('p1-site-');
  const { expected } = await assembleSite({ rootDir: ROOT, outDir: siteDir });
  const sitePaths = listFiles(siteDir);
  const refPaths = listFiles(cpReference());
  assert.equal(refPaths.length, 407, 'cp -R clean-tree 參考集應為 407');
  assert.deepEqual(refPaths.filter((p) => !sitePaths.includes(p)), [], 'DROPPED 必須為空');
  assert.deepEqual(sitePaths.filter((p) => !refPaths.includes(p)), [], 'EXTRA 必須為空');
  assert.equal(sitePaths.length, 407);
  assert.equal(expected.length, 407);
});

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

test('P-2: _site counts = 1+1+7+5+393 = 407, and submissions == 75', async () => {
  const siteDir = mktmp('p2-site-');
  await assembleSite({ rootDir: ROOT, outDir: siteDir });
  const files = listFiles(siteDir);
  assert.equal(files.length, 407);
  assert.ok(files.includes('index.html') && files.includes('tasks.json'));
  assert.equal(files.filter((f) => f.startsWith('assets/')).length, 7);
  assert.equal(files.filter((f) => /^tasks\/[^/]+\/task\.json$/.test(f)).length, 5);
  assert.equal(files.filter((f) => /^tasks\/[^/]+\/[^/]+\/submission\.json$/.test(f)).length, 75);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'tasks.json'), 'utf8'));
  assert.equal(manifest.reduce((n, t) => n + (t.submissions?.length ?? 0), 0), 75);
});

test('P-3: hardened build-manifest reproduces committed tasks.json byte-for-byte (no-op on clean tree)', () => {
  const out = path.join(mktmp('p3-'), 'tasks.json');
  const r = execFileSync('node', [BUILD_MANIFEST, '--output', out], { encoding: 'utf8' });
  assert.match(r, /5 tasks, 75 submissions/);
  assert.equal(sha256(out), sha256(path.join(ROOT, 'tasks.json')), '強化後 tasks.json 必須與 committed 位元相同');
});

test('P-4: clean fixture assembles successfully and the set comparison passes', async () => {
  const root = makeFixture(['spinning-cube', 'bouncing-balls']);
  const oracle = runOracle(root);
  assert.equal(oracle.status, 0, `oracle 在乾淨 fixture 應成功，stderr=${oracle.stderr}`);
  const siteDir = mktmp('p4-site-');
  const { expected, actual } = await assembleSite({ rootDir: root, outDir: siteDir });
  assert.equal(expected.length, actual.length);
  assert.ok(expected.includes('index.html') && expected.includes('tasks.json'));
  assert.ok(expected.some((f) => /^tasks\/spinning-cube\/.+\/submission\.json$/.test(f)));
});

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

test('N-1: task dir without task.json → oracle fails (reverting fix would accept — two-sided)', () => {
  const root = makeFixture(['spinning-cube']);
  mkdirSync(path.join(root, 'tasks', 'not-a-submission'));
  writeFileSync(path.join(root, 'tasks', 'not-a-submission', 'index.html'), '<x>');
  const bad = runOracle(root);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /缺少 task\.json/);
  rmSync(path.join(root, 'tasks', 'not-a-submission'), { recursive: true, force: true });
  cpSync(path.join(ROOT, 'tasks', 'bouncing-balls'), path.join(root, 'tasks', 'bouncing-balls'), { recursive: true });
  assert.equal(runOracle(root).status, 0);
});

test('N-2: top-level stray file → oracle fails; guard B classifyTreeEntry discriminates', () => {
  const root = makeFixture(['spinning-cube']);
  writeFileSync(path.join(root, 'tasks', 'loose.html'), '<stray>');
  const bad = runOracle(root);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /雜散檔或非一般檔/);
  const dir = mktmp('n2-'); writeFileSync(path.join(dir, 'loose.html'), 'x'); mkdirSync(path.join(dir, 'realdir'));
  assert.throws(() => classifyTreeEntry(syncDirent(dir, 'loose.html'), 'task'), /雜散檔或非一般檔/);
  assert.equal(classifyTreeEntry(syncDirent(dir, 'realdir'), 'task'), 'dir');
});

test('N-3: submission dir without submission.json → oracle fails (two-sided)', () => {
  const root = makeFixture(['spinning-cube']);
  const stray = path.join(root, 'tasks', 'spinning-cube', 'no-meta-sub');
  mkdirSync(stray); writeFileSync(path.join(stray, 'index.html'), '<x>');
  const bad = runOracle(root);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /缺少 submission\.json/);
  rmSync(stray, { recursive: true, force: true });
  assert.equal(runOracle(root).status, 0);
});

test('N-4: assets/pwn.html → assembler fails on assets-closed-set; set-comparison alone is blind', async () => {
  const root = makeFixture(['spinning-cube']);
  assert.equal(runOracle(root).status, 0);
  writeFileSync(path.join(root, 'assets', 'pwn.html'), '<pwn>');
  await assert.rejects(assembleSite({ rootDir: root, outDir: mktmp('n4-') }), /封閉集不符（N-4）/);
  const manifest = JSON.parse(readFileSync(path.join(root, 'tasks.json'), 'utf8'));
  // assets/pwn.html 不是 chrome 衍生 → 不在預期集（故組裝後「集合比對」兩側皆無、看不見它；
  // 真正擋它的是 assertAssetsClosed，上面已證）。
  const expected = await expectedPublicationPaths(root, manifest).catch(() => null);
  // expectedPublicationPaths 本身不掃 assets（assets 封閉集在 assembleSite 內另行檢查），故此處僅確認
  // 預期集不含 pwn.html。
  assert.ok(expected === null || !expected.includes('assets/pwn.html'));
});

// N-5a（A-15：guard A assertNoSymlinks，自身函式邊界，隔離反證）
test('N-5a: assertNoSymlinks rejects a symlink (guard A); mutant with ONLY the symlink check removed accepts', async () => {
  const dir = mktmp('n5a-'); mkdirSync(path.join(dir, 'nested'));
  symlinkSync(os.tmpdir(), path.join(dir, 'nested', 'evil')); // symlink → 目錄
  await assert.rejects(assertNoSymlinks(dir), 'guard A 必須 fail-closed');
  // known-bad：忠實複製 assertNoSymlinks，只移除「symlink 防護」一條（保留根 lstat、目錄遞迴、
  // 非一般檔防護[排除 symlink]）。因非一般檔防護排除 symlink，移除 symlink 防護後 symlink 被放行。
  const mutant = async (d) => {
    if (lstatSync(d).isSymbolicLink()) throw new Error('root symlink'); // 保留根 lstat
    for (const e of await readdir(d, { withFileTypes: true })) {
      // （symlink 防護已移除）
      if (e.isDirectory()) { await mutant(path.join(d, e.name)); continue; }
      if (!e.isFile() && !e.isSymbolicLink()) throw new Error('non-regular'); // 保留、且排除 symlink
    }
  };
  await mutant(dir); // 不丟出 → 證明 symlink 防護是 guard A 的載重點（且與非一般檔防護獨立）
});

// N-5a-ii（A-15：guard B 的 no-follow，獨立於 guard A）
test('N-5a-ii: classifyTreeEntry (guard B no-follow) rejects a symlink; stat-follow mutant accepts', async () => {
  const dir = mktmp('n5aii-'); const target = mktmp('n5aii-target-');
  symlinkSync(target, path.join(dir, 'linkdir'));
  const ent = await direntOf(dir, 'linkdir');
  assert.throws(() => classifyTreeEntry(ent, 'task'), /symlink/);
  const followMutant = async (d, name, level) => {
    const st = await stat(path.join(d, name)); // follow!
    if (st.isDirectory()) return 'dir';
    if (level === 'submission' && name === 'task.json' && st.isFile()) return 'task-json';
    throw new Error('stray');
  };
  assert.equal(await followMutant(dir, 'linkdir', 'task'), 'dir');
});

// N-5b（A-16：guard C lstat no-follow，以夾內 symlink 測）。round-2 審查修正：guard C 的隔離改為「直接
// 測 assertRegularFileNoFollow」—— 因 copyPublicationFile 另有 O_NOFOLLOW backstop（對 symlink 丟 ELOOP），
// 若測 copyPublicationFile 則 lstat→stat 變異會被 O_NOFOLLOW 遮蔽、無法乾淨隔離 guard C（Codex round-2）。
test('N-5b: assertRegularFileNoFollow (guard C lstat no-follow) rejects an in-folder symlink; stat mutant follows; copy rejects end-to-end', async () => {
  const folder = mktmp('n5b-folder-'); const outDir = mktmp('n5b-out-');
  writeFileSync(path.join(folder, 'real.txt'), 'payload');
  symlinkSync('real.txt', path.join(folder, 'link.txt')); // 夾內目標
  // guard C 自身邊界（不經 copyPublicationFile 的 O_NOFOLLOW backstop）
  await assert.rejects(assertRegularFileNoFollow(path.join(folder, 'link.txt')), /symlink \(no-follow\)/);
  await assertRegularFileNoFollow(path.join(folder, 'real.txt')); // 一般檔 → 不丟（正向對照）
  // known-bad：lstat→stat（跟隨）→ symlink 目標為一般檔 → 接受（證明 lstat no-follow 為載重點）。
  const statMutant = async (p) => {
    const st = await stat(p); // follow!
    if (st.isSymbolicLink()) throw new Error('symlink');
    if (!st.isFile()) throw new Error('non-regular');
  };
  await statMutant(path.join(folder, 'link.txt')); // 不丟 → guard C 的 lstat 是載重點
  // 端到端：copyPublicationFile（guard C lstat + O_NOFOLLOW backstop）對 symlink fail-closed、不複製目標。
  await assert.rejects(copyPublicationFile(path.join(folder, 'link.txt'), path.join(outDir, 'link.txt')),
    /symlink \(no-follow\)|ELOOP/);
  await copyPublicationFile(path.join(folder, 'real.txt'), path.join(outDir, 'real.txt'));
  assert.equal(readFileSync(path.join(outDir, 'real.txt'), 'utf8'), 'payload'); // 一般檔照常位元複製
});

// N-5b-ii（A-16：guard D containment，以夾外目標測；MF5：faithful mutant，非空函式）
test('N-5b-ii: assertInsideFolder (guard D) rejects out-of-folder; mutant with ONLY the rel-check removed accepts', async () => {
  const base = mktmp('n5bii-'); const folder = path.join(base, 'sub'); mkdirSync(folder);
  const inFile = path.join(folder, 'a.txt'); writeFileSync(inFile, 'x');
  const outFile = path.join(base, 'outside.txt'); writeFileSync(outFile, 'y');
  await assertInsideFolder(folder, inFile); // 夾內 → 不丟（正向對照）
  await assert.rejects(assertInsideFolder(folder, outFile), /containment/);
  // known-bad：忠實複製 assertInsideFolder（realpath 兩側），只移除最後的 rel 丟出 → 接受夾外目標。
  const { realpath } = await import('node:fs/promises');
  const mutant = async (folderAbs, targetAbs) => {
    await realpath(folderAbs); await realpath(targetAbs); // 同樣 realpath 兩側，但不做 rel 檢查
  };
  await mutant(folder, outFile); // 不丟 → 證明 rel 檢查是 guard D 的載重點
});

// N-5c（端到端）：完整實作拒 symlink（oracle guard A + assembler guard C）
test('N-5c: full pipeline rejects a symlink end-to-end (oracle guard A AND assembler guard C)', async () => {
  const root = makeFixture(['spinning-cube']);
  symlinkSync(path.join(root, 'tasks', 'spinning-cube'), path.join(root, 'tasks', 'linky'));
  const oracle = runOracle(root);
  assert.equal(oracle.status, 1);
  assert.match(oracle.stderr, /symlink/, 'oracle 以清楚的 symlink 訊息擋下（ARENA_ROOT 下 webPath 不逃逸）');
  const folder = mktmp('n5c-folder-');
  writeFileSync(path.join(folder, 'index.html'), '<x>');
  symlinkSync('/etc/hosts', path.join(folder, 'evil'));
  await assert.rejects(assertRegularFileNoFollow(path.join(folder, 'evil')), /symlink \(no-follow\)/);
});

// N-6（MF4：全樹非一般檔）：FIFO 在直接子層（guard B）、assembler（guard C）、及「巢狀」（guard A' 全樹）皆被擋
test('N-6: non-regular file (FIFO) rejected at guard B, guard C, and guard A\' (nested, tree-wide)', async () => {
  const dir = mktmp('n6-');
  try { execFileSync('mkfifo', [path.join(dir, 'pipe')]); } catch { return; } // 無 mkfifo 環境略過
  // guard B（直接子項）
  assert.throws(() => classifyTreeEntry(syncDirent(dir, 'pipe'), 'task'), /雜散檔或非一般檔/);
  // guard C（assembler）
  await assert.rejects(assertRegularFileNoFollow(path.join(dir, 'pipe')), /non-regular file/);
  // guard A'（MF4 全樹）：巢狀 FIFO（如 submission.json 為 FIFO）→ assertNoSymlinks 遞迴時擋下。
  // 註：在 build-manifest 的 rootDir 之外（temp fixture）跑時，fail() 內的 webPath(full) 會先丟
  // 「escapes the repository」—— 仍是 fail-closed，只是訊息為 webPath 的逃逸訊息。清楚的「非一般檔」
  // 訊息由下方 in-context（ARENA_ROOT，webPath 不逃逸）oracle 驗。
  const tree = mktmp('n6-tree-'); mkdirSync(path.join(tree, 'sub'));
  execFileSync('mkfifo', [path.join(tree, 'sub', 'submission.json')]);
  await assert.rejects(assertNoSymlinks(tree), /非一般檔|escapes the repository/, 'guard A\' 應 fail-closed 巢狀 FIFO');
  // in-context（ARENA_ROOT）：巢狀 FIFO 使完整 oracle fail（清楚「非一般檔」訊息），且在 readJson 之前
  // （assertNoSymlinks 先跑）→ 不會卡在讀 FIFO（finding 9 關閉）。
  const ofix = makeFixture(['spinning-cube']);
  execFileSync('mkfifo', [path.join(ofix, 'tasks', 'spinning-cube', 'opus-4.8-high', 'evil.fifo')]);
  const ores = runOracle(ofix);
  assert.equal(ores.status, 1); assert.match(ores.stderr, /非一般檔/, '完整 oracle 以清楚訊息擋巢狀 FIFO');
  // 隔離反證：忠實複製 assertNoSymlinks，只移除「非一般檔防護」一條 → 巢狀 FIFO 被放行（symlink 防護不碰）。
  const mutant = async (d) => {
    if (lstatSync(d).isSymbolicLink()) throw new Error('root symlink');
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isSymbolicLink()) throw new Error('symlink'); // 保留 symlink 防護
      if (e.isDirectory()) { await mutant(path.join(d, e.name)); continue; }
      // （非一般檔防護已移除）
    }
  };
  await mutant(tree); // 不丟 → 證明非一般檔防護為載重、且與 symlink 防護獨立
});

// N-7（A-13）：夾外雜散 → oracle 與 assembler 枚舉皆為來源側偵測者；雙向集合比對只驗忠實度（非來源乾淨）
test('N-7: folder-external stray → detected by the oracle AND the assembler enumeration; set comparison is fidelity-only (A-13)', async () => {
  const root = makeFixture(['spinning-cube']);
  const stray = path.join(root, 'tasks', 'spinning-cube', 'stray-not-in-manifest');
  mkdirSync(stray); writeFileSync(path.join(stray, 'junk.html'), '<x>');
  // (a) oracle（來源 gate 1）
  assert.equal(runOracle(root).status, 1, 'oracle 擋夾外雜散');
  // (b) assembler 枚舉（來源 gate 2，MF1 後）：以乾淨 manifest 餵入 assembleSite，仍因實體枚舉擋下
  const clean = makeFixture(['spinning-cube']);
  assert.equal(runOracle(clean).status, 0);
  cpSync(path.join(clean, 'tasks.json'), path.join(root, 'tasks.json')); // 用乾淨 manifest（繞過 oracle）
  await assert.rejects(assembleSite({ rootDir: root, outDir: mktmp('n7-') }), /submission 資料夾缺少 submission\.json/,
    'assembler 自身的 fail-closed 枚舉亦擋夾外雜散（不倚賴集合比對）');
  // (c) A-13：擋它的是枚舉（oracle + assembler），不是「雙向集合比對」—— 比對只驗忠實度（輸出==預期）。
  // 夾外雜散不在預期集、也不會被複製；若只靠集合比對，它同時排除於兩側而不可見。
  // 註（round-2/3 審查對帳）：封包原 A-13「oracle 為唯一偵測者」是 MF1 之前的描述。MF1 後 assembler 以
  // 實體枚舉獨立 fail-close，成為**第二**來源側偵測者（縱深強化；此為刻意強化，**非**回歸成 oracle-only）。
  // A-13 的實質——「diffSets 的雙向集合比對只驗 assembler 忠實度（_site==預期），對同時排除於兩集合的
  // 夾外雜散無鑑別力」——是 diffSets 的**設計性質（by construction）**：本測試**不**把雜散「路由穿過比對」
  // 去「演示盲性」（兩道來源閘會先擋，見 (a)(b)）；該性質由構造論證、並反映在 pages.yml 註解歸功於枚舉而
  // 非比對。Codex round-3 以 rubric 的「oracle-only」字面視此為矛盾，但該字面已被 MF1 取代，照其方向回歸
  // oracle-only 將重開 assembler 盲信 manifest 的洞（round-1 要求關閉者）；Grok 已獨立確認本歸因正確。
});

// N-8（rev.2 文件化殘餘，A-14 歸類）：合法 submission 夾「內」未參照檔仍被發佈（記錄界線，非偽稱關閉）
test('N-8: folder-INTERNAL unreferenced file IS still published — documented residual, NOT closed (A-14)', async () => {
  const root = makeFixture(['spinning-cube']);
  assert.equal(runOracle(root).status, 0);
  const subDir = path.join(root, 'tasks', 'spinning-cube', 'opus-4.8-high');
  assert.ok(existsSync(subDir));
  writeFileSync(path.join(subDir, 'pwn.html'), '<pwn>');
  const siteDir = mktmp('n8-site-');
  const { expected } = await assembleSite({ rootDir: root, outDir: siteDir });
  assert.ok(expected.includes('tasks/spinning-cube/opus-4.8-high/pwn.html'),
    'N-8 殘餘：夾內未參照檔仍被發佈（content-policy/origin-isolation 議題，非 provenance；A-14）');
  assert.ok(existsSync(path.join(siteDir, 'tasks/spinning-cube/opus-4.8-high/pwn.html')));
});

// N-9（round-2 MF1，兩家族收斂＋重現）：惡意 manifest id 不造成路徑穿越（改由實體資料夾名推導）
test('N-9: a malicious submission/task id does NOT traverse — paths derive from physical folders, never metadata.id (MF1)', async () => {
  const root = makeFixture(['spinning-cube']);
  // 注入惡意 id 於 submission 與 task 兩者（schema 無 pattern、assertSafeName 不套用於 metadata.id →
  // oracle 會接受並寫進 manifest）。
  const subMeta = path.join(root, 'tasks', 'spinning-cube', 'opus-4.8-high', 'submission.json');
  const sj = JSON.parse(readFileSync(subMeta, 'utf8')); sj.id = '../../../../data'; writeFileSync(subMeta, JSON.stringify(sj, null, 2));
  const taskMeta = path.join(root, 'tasks', 'spinning-cube', 'task.json');
  const tj = JSON.parse(readFileSync(taskMeta, 'utf8')); tj.id = '../../../../etc'; writeFileSync(taskMeta, JSON.stringify(tj, null, 2));
  assert.equal(runOracle(root).status, 0, 'oracle 仍接受（id 非它的路徑）');
  const manifest = JSON.parse(readFileSync(path.join(root, 'tasks.json'), 'utf8'));
  assert.ok(manifest.some((t) => t.id === '../../../../etc'), '前提：manifest 的確帶惡意 task id');
  assert.ok(manifest.some((t) => (t.submissions || []).some((s) => s.id === '../../../../data')), '前提：manifest 的確帶惡意 submission id');
  // 真正關鍵：assembler 忽略 manifest id，只用實體資料夾名 → 無穿越。
  const siteDir = mktmp('n9-site-');
  const { expected } = await assembleSite({ rootDir: root, outDir: siteDir });
  // (a) expected（= dest 相對路徑）無穿越/絕對 → dest=path.join(outDir,rel) 不可能逸出 siteDir（Codex round-2）。
  for (const rel of expected) {
    assert.ok(!rel.includes('..') && !path.isAbsolute(rel), `expected 路徑不得穿越/絕對：${rel}`);
  }
  // (b) 實際 _site 內容只在 chrome 或 tasks/ 底下，絕無樹外 data/ 或 etc/。
  for (const p of listFiles(siteDir)) {
    assert.ok(!p.includes('..'), `不得有穿越路徑：${p}`);
    assert.ok(p === 'index.html' || p === 'tasks.json' || p.startsWith('assets/') || p.startsWith('tasks/'),
      `只允許 chrome 或 tasks/ 底下：${p}`);
    assert.ok(!p.startsWith('data/') && !p.startsWith('etc/'), `絕不得發佈樹外路徑：${p}`);
  }
  assert.ok(expected.includes('tasks/spinning-cube/opus-4.8-high/submission.json'), '實體 submission 夾照常發佈');
});

// N-10（round-2 MF2，Grok 實地重現）：symlinked tasks/ 或 assets/ 根 → fail-closed（不跟隨發佈外部內容）
test('N-10: a symlinked tasks/ or assets/ root is rejected (MF2 assertEnumerableDir / assertNoSymlinks root lstat)', async () => {
  // assets/ 根為 symlink → assembler assertAssetsClosed→assertEnumerableDir 擋
  const root = makeFixture(['spinning-cube']);
  assert.equal(runOracle(root).status, 0);
  rmSync(path.join(root, 'assets'), { recursive: true, force: true });
  symlinkSync(path.join(ROOT, 'assets'), path.join(root, 'assets')); // symlink → 外部真實 assets（內容合法）
  await assert.rejects(assembleSite({ rootDir: root, outDir: mktmp('n10-') }), /symlinked directory/,
    'symlinked assets/ 根即使內容合法也 fail-closed（guard E）');
  // symlinked tasks/ 根經 assembleSite 亦擋（enumeratePublishedTree 的 assertEnumerableDir(tasksDir)；Codex round-2）
  const rootT = makeFixture(['spinning-cube']);
  assert.equal(runOracle(rootT).status, 0);
  rmSync(path.join(rootT, 'tasks'), { recursive: true, force: true });
  symlinkSync(path.join(ROOT, 'tasks'), path.join(rootT, 'tasks'));
  await assert.rejects(assembleSite({ rootDir: rootT, outDir: mktmp('n10t-') }), /symlinked directory/,
    'symlinked tasks/ 根在 assembler 側亦 fail-closed');
  // guard E 自身邊界
  const d = mktmp('n10e-'); const t = mktmp('n10e-t-'); symlinkSync(t, path.join(d, 'link'));
  await assert.rejects(assertEnumerableDir(path.join(d, 'link')), /symlinked directory/);
  await assertEnumerableDir(t); // 真實目錄 → 不丟（正向對照）
  // oracle 側：symlinked tasks/ 根 → assertNoSymlinks 根 lstat 擋
  const root2 = makeFixture(['spinning-cube']);
  rmSync(path.join(root2, 'tasks'), { recursive: true, force: true });
  symlinkSync(path.join(ROOT, 'tasks'), path.join(root2, 'tasks'));
  const o = runOracle(root2);
  assert.equal(o.status, 1); assert.match(o.stderr, /symlink/, 'oracle 擋 symlinked tasks/ 根');
});

// N-11（round-2 MF3，兩家族＋作者重現）：經 symlinked 調用路徑仍執行 main（realpath 兩側），非靜默 no-op
test('N-11: invoking the scripts through a symlinked path still runs main() (MF3 realpath both sides)', () => {
  const d = mktmp('n11-');
  const linkAsm = path.join(d, 'asm-link.mjs'); symlinkSync(ASSEMBLE, linkAsm);
  // 經 symlink 調用 assemble-site --check：應實際執行（印出「封閉世界」行），而非舊 bug 的靜默 exit 0。
  const out = execFileSync('node', [linkAsm, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /封閉世界組裝通過：407 檔/, 'symlinked 調用路徑下 main() 仍執行（非靜默 no-op）');
  // build-manifest 同理：經 symlink 調用應產生 tasks.json 並印出摘要。
  const linkBm = path.join(d, 'bm-link.mjs'); symlinkSync(BUILD_MANIFEST, linkBm);
  const o = execFileSync('node', [linkBm, '--output', path.join(d, 'out.json')], { cwd: ROOT, encoding: 'utf8' });
  assert.match(o, /5 tasks, 75 submissions/);
  assert.ok(existsSync(path.join(d, 'out.json')), 'symlinked 調用下 build 仍實際執行並寫出檔案');
});

// N-12（round-2 Codex MAJOR，作者重現）：task.json / submission.json 必須是「一般檔」——目錄（或 symlink）
// 被拒（舊 existsSync 會把目錄當成「存在」而放行其巢狀內容；isRegularFileSync 以 lstat isFile 擋）。
test('N-12: task.json / submission.json must be a regular file (a directory is rejected, not treated as present)', async () => {
  const clean = makeFixture(['spinning-cube']); assert.equal(runOracle(clean).status, 0);
  // submission.json 為「目錄」（含巢狀內容）→ assembler 拒（不發佈 submission.json/ 內容）
  const root = makeFixture(['spinning-cube']);
  const sub = path.join(root, 'tasks', 'spinning-cube', 'opus-4.8-high');
  rmSync(path.join(sub, 'submission.json')); mkdirSync(path.join(sub, 'submission.json'));
  writeFileSync(path.join(sub, 'submission.json', 'inner.txt'), 'leak');
  cpSync(path.join(clean, 'tasks.json'), path.join(root, 'tasks.json')); // 乾淨 manifest，模擬 assembler 獨立驗證
  await assert.rejects(assembleSite({ rootDir: root, outDir: mktmp('n12s-') }), /缺少 submission\.json（或其非一般檔）/);
  // 隔離反證：舊 existsSync 對目錄為真（會放行巢狀 inner.txt）；isRegularFileSync（lstat isFile）擋。
  assert.equal(existsSync(path.join(sub, 'submission.json')), true, 'existsSync 對目錄為真（舊 bug 會放行）');
  assert.equal(lstatSync(path.join(sub, 'submission.json')).isFile(), false, 'lstat isFile 對目錄為假（本修正據此擋）');
  // task.json 為「目錄」→ 亦拒
  const root2 = makeFixture(['spinning-cube']);
  rmSync(path.join(root2, 'tasks', 'spinning-cube', 'task.json')); mkdirSync(path.join(root2, 'tasks', 'spinning-cube', 'task.json'));
  cpSync(path.join(clean, 'tasks.json'), path.join(root2, 'tasks.json'));
  await assert.rejects(assembleSite({ rootDir: root2, outDir: mktmp('n12t-') }), /缺少 task\.json（或其非一般檔）/);
  // submission.json 為 symlink（指向他處一般檔）→ 亦拒（lstat isFile 對 symlink 為假；round-3 Grok NIT）
  const root3 = makeFixture(['spinning-cube']);
  const sub3 = path.join(root3, 'tasks', 'spinning-cube', 'opus-4.8-high', 'submission.json');
  const decoy = path.join(mktmp('n12-decoy-'), 'x.json'); writeFileSync(decoy, '{}');
  rmSync(sub3); symlinkSync(decoy, sub3);
  cpSync(path.join(clean, 'tasks.json'), path.join(root3, 'tasks.json'));
  await assert.rejects(assembleSite({ rootDir: root3, outDir: mktmp('n12sl-') }), /缺少 submission\.json（或其非一般檔）/);
  // submission.json 為 FIFO → 亦拒（非一般檔）
  const root4 = makeFixture(['spinning-cube']);
  const sub4 = path.join(root4, 'tasks', 'spinning-cube', 'opus-4.8-high', 'submission.json');
  rmSync(sub4);
  try { execFileSync('mkfifo', [sub4]); } catch { return; } // 無 mkfifo 環境略過 FIFO 分支
  cpSync(path.join(clean, 'tasks.json'), path.join(root4, 'tasks.json'));
  await assert.rejects(assembleSite({ rootDir: root4, outDir: mktmp('n12f-') }), /缺少 submission\.json（或其非一般檔）/);
});
