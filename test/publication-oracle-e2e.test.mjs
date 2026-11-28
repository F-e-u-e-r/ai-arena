// publication-oracle-e2e.test.mjs — scripts/publication-oracle.mjs 的端到端黑箱對照（node:test；只以子行程呼叫 CLI，不 import 它）。
//
// 每一臂都在自己的拋棄式 clone 內封裝並 commit（clone 自這個 checkout 的 HEAD；移除 remote → 無法 push；測試結束即刪除），
// 再以 CLI 執行 freeze／verify：全新 clone 確切的候選 commit → 執行候選自己的 build-manifest --strict 與 assemble-site →
// 在候選的 git tree 與 _site 兩處對凍結的位元比對。
//
// 臂的編號、fixture 的位元與預期，沿用 2026-11-28 經審查的預先登錄對照臂（v5）中的同名臂（P、N3b、N4a/b、N6a/b、N7a/b、
// N10、C7、F2）；這裡只留一小組能在 CI 內快速執行的。完整的 61 臂、突變檢查與 Phase 4 保留在 handoff 封存，不在 repo 內
// （docs/publication-oracle.md）。唯一新增的是 B4-1（暫存目錄），它帶一個 known-bad 臂。
//
// 需求：釘選版本的 Node（verify 以候選的 .node-version 把關）與一個 git checkout。條件不成立時，本機明確 skip 並寫出原因；
// 在 CI（環境變數 CI 有值）絕不 skip，E2E-0 會失敗——hosted 的綠燈因此代表這些對照真的執行過。
// 本檔不斷言發佈檔案的總數：那是 test/publication.test.mjs 的靜態 tripwire 的工作。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fs.realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const ORACLE = path.join(ROOT, 'scripts', 'publication-oracle.mjs');
const NODE = process.execPath;
const PIN = fs.readFileSync(path.join(ROOT, '.node-version'), 'utf8').trim();
const DEST = 'tasks/savannah-ecosystem/zz-oracle-fixture';
const METADATA = 'submission.json';
const MANIFEST_FORMAT = 'ai-arena-publication-manifest/1';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B = (s) => Buffer.from(s, 'utf8');
const lastLine = (s) => String(s).split('\n').map((l) => l.trimEnd()).filter(Boolean).pop() ?? '';

// 子行程的最小環境：不讀使用者／系統的 git 設定（簽章、autocrlf、hooks 都不得影響封裝）；固定身份與時間。
const PATH_ENV = `${path.dirname(NODE)}${path.delimiter}${process.env.PATH ?? '/usr/bin:/bin'}`;
const cliEnv = (root, extra = {}) => ({ PATH: PATH_ENV, HOME: path.join(root, 'home'), TMPDIR: path.join(root, 'tmp'), ...extra });
const packEnv = (root) => ({
  ...cliEnv(root), XDG_CONFIG_HOME: path.join(root, 'home', '.config'),
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: os.devNull, GIT_CONFIG_GLOBAL: os.devNull, GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', TZ: 'UTC',
  GIT_AUTHOR_NAME: 'oracle-e2e-synthetic', GIT_AUTHOR_EMAIL: 'oracle-e2e@invalid', GIT_AUTHOR_DATE: '2026-11-28T00:00:00Z',
  GIT_COMMITTER_NAME: 'oracle-e2e-synthetic', GIT_COMMITTER_EMAIL: 'oracle-e2e@invalid', GIT_COMMITTER_DATE: '2026-11-28T00:00:00Z',
});
const PACK_GIT = ['-c', `core.hooksPath=${os.devNull}`, '-c', 'core.fsmonitor=false', '-c', 'gc.auto=0'];

// ───────────── 前置條件（CI 上絕不 skip）─────────────

const blocker = (() => {
  if (process.versions.node !== PIN) return `needs Node ${PIN} (the repository pin in .node-version); this is Node ${process.versions.node}`;
  const top = spawnSync('git', [...PACK_GIT, '-C', ROOT, 'rev-parse', '--show-toplevel'], { env: { PATH: PATH_ENV, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_OPTIONAL_LOCKS: '0' }, encoding: 'utf8' });
  if (top.status !== 0 || fs.realpathSync(top.stdout.trim()) !== ROOT) return 'needs a git checkout of this repository (candidates are packaged in disposable clones of its HEAD)';
  return null;
})();
const SKIP = blocker !== null && !process.env.CI ? blocker : false;
const E2E = { skip: SKIP, timeout: 300000 };

test('E2E-0: preconditions — pinned Node and a git checkout; on CI the end-to-end controls are never skipped', { skip: SKIP }, () => {
  assert.equal(blocker, null, blocker ?? '');
});

// ───────────── fixtures（全部標明為合成；位元由這裡定義，與審查時的對照臂相同）─────────────

const NOTE = 'SYNTHETIC FIXTURE — NOT A MODEL OUTPUT';
const INDEX = B(`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${NOTE}</title>\n<link rel="stylesheet" href="style.css"></head>\n<body><main><h1>${NOTE}</h1><p>Publication-oracle arm fixture. Never published.</p></main>\n<script src="main.js"></script></body></html>\n`);
const MAINJS = B(`// ${NOTE}\ndocument.body.dataset.fixture = "synthetic";\n`);
const MAINJS_CRLF = B(`// ${NOTE}\r\ndocument.body.dataset.fixture = "synthetic";\r\n`);
const IDENT = B("// $Id$\nexport const marker = 'ident-literal';\n");
const BLOB = Buffer.concat([Buffer.from(Array.from({ length: 256 }, (_, i) => i)), Buffer.from([13, 10, 13, 10, 0, 255, 254])]);
const MIN = { 'index.html': INDEX, 'main.js': MAINJS };
const P = {
  'index.html': INDEX, 'style.css': B(`/* ${NOTE} */\nbody { margin: 0; }\n`), 'main.js': MAINJS, 'README.md': B(`# ${NOTE}\n`),
  'src/lib/util.js': B(`// ${NOTE}\nexport const util = () => 42;\n`), 'assets/data/blob.bin': BLOB,
  'docs/crlf-notes.txt': B('line one\r\nline two\r\n'), 'src/ident-literal.js': IDENT,
  'empty.dat': Buffer.alloc(0), 'no-trailing-newline.txt': B('no trailing newline'),
};
// harness 產生的 metadata（凍結位元）。
const HARNESS_METADATA = {
  $schema: '../../../schema/submission.schema.json', provider: 'synthetic', model: 'SYNTHETIC FIXTURE', effort: 'max', client: 'codex',
  skills: 'Nil', subagents: 'Nil', author: 'synthetic-fixture', generatedAt: '2026-11-26T00:00:00Z', label: 'SYNTHETIC — DO NOT PUBLISH',
  metrics: { durationMs: 1 },
};
const metadataBytes = (o) => B(`${JSON.stringify(o, null, 2)}\n`);
const HARNESS = metadataBytes(HARNESS_METADATA);

// ───────────── 封裝與呼叫（對驗證器完全黑箱）─────────────

function git(c, cwd, ...args) {
  const r = spawnSync('git', [...PACK_GIT, ...(cwd ? ['-C', cwd] : []), ...args], { env: packEnv(c.root), maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}
const gitText = (c, cwd, ...args) => git(c, cwd, ...args).toString('utf8').trim();
// 測試自己獨立的走訪與 canonical manifest 序列化（用來產生「刻意繞過早期檢查」的凍結清單，以及確認模型輸出沒有被動過）。
function fingerprint(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const name of fs.readdirSync(d).sort()) {
      const abs = path.join(d, name);
      const r = rel === '' ? name : `${rel}/${name}`;
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) walk(abs, r); else out.push([r, st.isFile() ? sha(fs.readFileSync(abs)) : 'non-regular']);
    }
  };
  walk(dir, '');
  return JSON.stringify(out);
}
function independentManifest(model) {
  const files = Object.keys(model).sort().map((p) => ({ path: p, bytes: model[p].length, sha256: sha(model[p]) }));
  return B(`${JSON.stringify({ format: MANIFEST_FORMAT, dest: DEST, files, emptyDirectories: [] }, null, 2)}\n`);
}
function cli(root, args, { env = {}, oracle = ORACLE } = {}) {
  const r = spawnSync(NODE, [oracle, ...args], { env: cliEnv(root, env), encoding: 'utf8', timeout: 280000 });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', marker: lastLine(r.stdout ?? '') };
}

// 一臂的起點：全新的暫存根目錄、模型輸出（在 clone 之外）、凍結的 harness metadata、以及這個 checkout HEAD 的拋棄式 clone。
function startArm(t, model) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-e2e-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const d of ['home', 'tmp', 'frozen']) fs.mkdirSync(path.join(root, d));
  const c = { root, model, out: path.join(root, 'model-output'), clone: path.join(root, 'candidate-repo'), seq: 0 };
  for (const [rel, bytes] of Object.entries(model)) {
    fs.mkdirSync(path.dirname(path.join(c.out, rel)), { recursive: true });
    fs.writeFileSync(path.join(c.out, rel), bytes, { flag: 'wx' });
  }
  c.modelFingerprint = fingerprint(c.out);
  c.metadataFile = path.join(root, 'frozen', METADATA);
  fs.writeFileSync(c.metadataFile, HARNESS, { flag: 'wx' });
  c.metadataSha = sha(HARNESS);
  c.manifestFile = path.join(root, 'frozen', 'manifest.json');
  git(c, null, 'clone', '--quiet', '--no-local', '--template=', '--', ROOT, c.clone);
  git(c, c.clone, 'remote', 'remove', 'origin'); // 沒有 remote → 這個 clone 無法 push
  git(c, c.clone, 'checkout', '--quiet', '-b', 'e2e-arm');
  assert.equal(gitText(c, c.clone, 'status', '--porcelain=v1'), '', 'the packaging clone starts clean');
  return c;
}
// freeze：在封裝之前凍結模型輸出（--repo 是剛 clone 出來、尚未改動的乾淨 checkout）。
function freeze(c) {
  const f = cli(c.root, ['freeze', '--output', c.out, '--dest', DEST, '--repo', c.clone, '--out', c.manifestFile]);
  assert.equal(fingerprint(c.out), c.modelFingerprint, 'freeze never modifies the model output');
  return f;
}
// 封裝：no-overwrite guard → 位元複製模型輸出 → 寫入 harness metadata → 重生 tasks.json →（可選）改動候選的管線 → commit。
function packageCandidate(c, { stagedMetadata = HARNESS, afterStage, afterRegen } = {}) {
  c.manifestSha = sha(fs.readFileSync(c.manifestFile));
  c.destAbs = path.join(c.clone, ...DEST.split('/'));
  assert.equal(fs.existsSync(c.destAbs), false, 'no-overwrite guard: the destination folder must not exist on the base');
  fs.cpSync(c.out, c.destAbs, { recursive: true, verbatimSymlinks: true });
  fs.writeFileSync(path.join(c.destAbs, METADATA), stagedMetadata);
  if (afterStage) afterStage(c);
  const regen = spawnSync(NODE, ['scripts/build-manifest.mjs', '--strict'], { cwd: c.clone, env: cliEnv(c.root), encoding: 'utf8' });
  assert.equal(regen.status, 0, `packaging: build-manifest --strict failed: ${regen.stderr}`);
  if (afterRegen) afterRegen(c);
  git(c, c.clone, 'add', '-A');
  git(c, c.clone, 'commit', '--quiet', '-m', 'synthetic publication-oracle e2e candidate (disposable clone; never pushed)');
  c.candidate = gitText(c, c.clone, 'rev-parse', 'HEAD');
  return c;
}
function verify(c, { env = {}, oracle = ORACLE } = {}) {
  const n = (c.seq += 1);
  const work = path.join(c.root, `verify-work-${n}`);
  const reportFile = path.join(c.root, `verify-report-${n}.json`);
  const r = cli(c.root, ['verify', '--manifest', c.manifestFile, '--manifest-sha256', c.manifestSha, '--metadata', c.metadataFile, '--metadata-sha256', c.metadataSha,
    '--repo', c.clone, '--candidate', c.candidate, '--dest', DEST, '--work', work, '--report', reportFile], { env, oracle });
  let report = null;
  try { report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { /* 沒有報告：下面的斷言會失敗並印出 stdout */ }
  return { ...r, work, report };
}
// 判定 = exit status + 終態標記 + 報告的 failing gate；並確認產生這份報告的就是這個 checkout 的驗證器（不是別處的副本）。
const ORACLE_SHA = sha(fs.readFileSync(ORACLE));
function verdict(v, exit, gate) {
  assert.equal(v.status, exit, `exit status\n${v.stdout}\n${v.stderr}`);
  assert.ok(v.report, `a report file was written\n${v.stdout}`);
  assert.equal(v.report.toolSha256, ORACLE_SHA, 'the report comes from scripts/publication-oracle.mjs of this checkout');
  assert.equal(v.report.failingGate, gate);
  assert.equal(v.report.exitCode, exit);
  assert.ok(v.marker.startsWith(exit === 0 ? 'PUBLICATION-ORACLE VERIFY: PASS ' : `PUBLICATION-ORACLE VERIFY: FAIL gate=${gate} exit=${exit} `), `terminal marker: ${v.marker}`);
  assert.equal(fs.existsSync(v.work), false, 'the work directory is removed (no --keep)');
}
const stages = (v) => { const s = v.report.stages; return [s.input.status, s.referencePolicy.status, s.tree.status, s.checkout.status, s.runtime.status, s.pipeline.status, s.compare.status]; };
const blobAt = (c, rel) => git(c, c.clone, 'cat-file', 'blob', `${c.candidate}:${DEST}/${rel}`);
// 在候選的組裝器「跑完之後」直接改動 _site/<dest>：附加在檔尾（組裝器以 top-level await 執行 main），不依賴它內部的任何一行；
// commit 內目的資料夾的檔案不受影響。
function tamperAssembledSite(c, statements) {
  fs.appendFileSync(path.join(c.clone, 'scripts', 'assemble-site.mjs'),
    `\n// SYNTHETIC TAMPERING — disposable test candidate only\nif (!process.argv.includes('--check')) { const fsx = await import('node:fs'); const d = new URL('../_site/${DEST}/', import.meta.url); ${statements} }\n`);
}
const earlyRejected = (f, rule, name) => {
  assert.equal(f.status, 2, f.stdout);
  assert.equal(f.marker, 'PUBLICATION-ORACLE FREEZE: REJECTED exit=2 violations=1');
  assert.ok(f.stdout.includes(`INELIGIBLE ${rule}: ${JSON.stringify(name)}`), f.stdout);
};

// ───────────── 正向對照 ─────────────

test('E2E-P: positive control — a clean synthetic submission (nested, CRLF text, binary, empty, no trailing newline) passes; nothing outside the work directory is written', E2E, (t) => {
  assert.equal(blocker, null, blocker ?? '');
  const c = startArm(t, P);
  const f = freeze(c);
  assert.equal(f.status, 0, f.stdout);
  assert.match(f.marker, /^PUBLICATION-ORACLE FREEZE: OK files=10 bytes=\d+ manifest-sha256=[0-9a-f]{64}$/);
  assert.ok(fs.readFileSync(c.manifestFile).equals(independentManifest(P)), 'the frozen manifest equals the independently serialized one');
  packageCandidate(c);
  const statusBefore = gitText(c, c.clone, 'status', '--porcelain=v1', '--untracked-files=all');
  const v = verify(c);
  verdict(v, 0, null);
  assert.equal(v.marker, `PUBLICATION-ORACLE VERIFY: PASS candidate=${c.candidate} tree=${gitText(c, c.clone, 'rev-parse', `${c.candidate}^{tree}`)} dest=${DEST} files=10+1`);
  assert.deepEqual(stages(v), ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'match']);
  const cmp = v.report.stages.compare;
  assert.deepEqual([cmp.expectedFiles, cmp.actualFiles, cmp.missing, cmp.extra, cmp.sizeMismatch, cmp.hashMismatch, cmp.otherEntries], [11, 11, [], [], [], [], []]);
  assert.deepEqual([cmp.metadata.present, cmp.metadata.equal], [true, true]);
  assert.equal(v.report.stages.runtime.nodePin, PIN);
  assert.equal(v.report.runtime.node, PIN);
  assert.equal(v.report.stages.pipeline.tasksJsonMatchesCommitted, true);
  assert.equal(fingerprint(c.out), c.modelFingerprint, 'the model output is untouched');
  assert.equal(gitText(c, c.clone, 'status', '--porcelain=v1', '--untracked-files=all'), statusBefore, 'the candidate repository is untouched');
});

// ───────────── A3-1：git 在 add／checkout 時改變位元 ─────────────

test('E2E-N6 (A3-1, CRLF): .gitattributes eol=lf rewrites CRLF at git add — refused early by freeze (N6a); with the early check bypassed, verify reports the mismatch (N6b)', E2E, (t) => {
  assert.equal(blocker, null, blocker ?? '');
  const model = { 'index.html': INDEX, 'main.js': MAINJS_CRLF, '.gitattributes': B('*.js text eol=lf\n') };
  const c = startArm(t, model);
  earlyRejected(freeze(c), 'reserved-git-name', '.gitattributes');
  assert.equal(fs.existsSync(c.manifestFile), false, 'no manifest is written for an ineligible output');
  fs.writeFileSync(c.manifestFile, independentManifest(model), { flag: 'wx' }); // 刻意繞過早期檢查
  packageCandidate(c);
  const v = verify(c);
  verdict(v, 1, 'compare');
  const cmp = v.report.stages.compare;
  assert.deepEqual(cmp.sizeMismatch, [{ path: 'main.js', expected: MAINJS_CRLF.length, actual: MAINJS_CRLF.length - 2 }]);
  assert.deepEqual(cmp.hashMismatch.map((m) => m.path), ['main.js']);
  assert.deepEqual([cmp.missing, cmp.extra, cmp.metadata.equal], [[], [], true]);
  assert.deepEqual(v.report.stages.referencePolicy.violations, [{ rule: 'reserved-git-name', path: '.gitattributes' }]);
  // 測試自己直接讀物件庫：位元在 git add 時就變了（凍結 ≠ commit 內的 blob），tree 層的位元綁定也看得到。
  assert.ok(blobAt(c, 'main.js').equals(MAINJS), 'the committed blob is the LF form, not the frozen CRLF bytes');
  assert.deepEqual([...new Set(v.report.stages.tree.dest.blobMismatch.map((m) => m.path))], ['main.js']);
});

test('E2E-N7 (A3-1, ident): the committed blob equals the frozen bytes and only the clean checkout differs — refused early by freeze (N7a); bypassed, only the comparison of the assembled output sees it (N7b)', E2E, (t) => {
  assert.equal(blocker, null, blocker ?? '');
  const model = { ...MIN, 'src/ident-literal.js': IDENT, '.gitattributes': B('*.js ident\n') };
  const c = startArm(t, model);
  earlyRejected(freeze(c), 'reserved-git-name', '.gitattributes');
  fs.writeFileSync(c.manifestFile, independentManifest(model), { flag: 'wx' });
  packageCandidate(c);
  const v = verify(c);
  verdict(v, 1, 'compare');
  const cmp = v.report.stages.compare;
  assert.deepEqual(cmp.sizeMismatch, [{ path: 'src/ident-literal.js', expected: IDENT.length, actual: IDENT.length + 43 }]); // `$Id$` → `$Id: <40 hex> $`
  assert.deepEqual(cmp.hashMismatch.map((m) => m.path), ['src/ident-literal.js']);
  assert.deepEqual([cmp.missing, cmp.extra, cmp.metadata.equal], [[], [], true]);
  // commit 內的位元完全正確：只比對 commit 會通過，checkout 之後才看得到差異。
  assert.ok(blobAt(c, 'src/ident-literal.js').equals(IDENT), 'the committed blob equals the frozen bytes');
  assert.deepEqual(v.report.stages.tree.dest.blobMismatch, []);
});

// ───────────── 兩處比對各自必要：只存在於 commit 的差異、只存在於發佈輸出的差異 ─────────────

test('E2E-C7 (commit-blob discrimination): one bit differs in the commit while the candidate pipeline writes the frozen bytes into _site — the assembled files match, the tree-level byte binding rejects', E2E, (t) => {
  assert.equal(blocker, null, blocker ?? '');
  const c = startArm(t, P);
  assert.equal(freeze(c).status, 0);
  packageCandidate(c, {
    afterStage: (x) => { const f = path.join(x.destAbs, 'main.js'); const b = fs.readFileSync(f); b[b.length - 2] ^= 0x01; fs.writeFileSync(f, b); },
    afterRegen: (x) => tamperAssembledSite(x, `fsx.writeFileSync(new URL('main.js', d), Buffer.from('${MAINJS.toString('base64')}', 'base64'));`),
  });
  const v = verify(c);
  verdict(v, 1, 'tree');
  assert.deepEqual(stages(v), ['ok', 'ok', 'mismatch', 'ok', 'ok', 'ok', 'match']);
  assert.deepEqual([...new Set(v.report.stages.tree.dest.blobMismatch.map((m) => m.path))], ['main.js']);
  assert.match(v.report.messages.join('\n'), /does not hold exactly the reference paths with the reference bytes/);
  assert.equal(blobAt(c, 'main.js').equals(MAINJS), false, 'the committed blob really differs from the frozen bytes');
});

test('E2E-N3b (final-publication-byte discrimination): the commit holds exactly the frozen bytes and the candidate pipeline flips one bit in _site — only the comparison of the assembled output rejects', E2E, (t) => {
  assert.equal(blocker, null, blocker ?? '');
  const c = startArm(t, P);
  assert.equal(freeze(c).status, 0);
  packageCandidate(c, { afterRegen: (x) => tamperAssembledSite(x, "const f = new URL('main.js', d); const b = fsx.readFileSync(f); b[b.length - 2] ^= 1; fsx.writeFileSync(f, b);") });
  const v = verify(c);
  verdict(v, 1, 'compare');
  assert.deepEqual(stages(v), ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'mismatch']);
  const cmp = v.report.stages.compare;
  assert.deepEqual([cmp.missing, cmp.extra, cmp.sizeMismatch, cmp.hashMismatch.map((m) => m.path), cmp.metadata.equal], [[], [], [], ['main.js'], true]);
  assert.deepEqual(v.report.stages.tree.dest.blobMismatch, []);
  assert.ok(blobAt(c, 'main.js').equals(MAINJS), 'the committed blob equals the frozen bytes');
});

// ───────────── metadata 的歸屬與不覆寫 ─────────────

test('E2E-N4/N10 (metadata ownership): root submission.json belongs to the harness — a model-authored one is refused by freeze (N4a) and can never match (N4b); modified harness metadata is a mismatch (N10)', E2E, (t) => {
  assert.equal(blocker, null, blocker ?? '');
  const model = { ...MIN, [METADATA]: B('{"note":"model-authored file named submission.json"}\n') };
  const a = startArm(t, model);
  earlyRejected(freeze(a), 'reserved-metadata-name', METADATA);
  fs.writeFileSync(a.manifestFile, independentManifest(model), { flag: 'wx' });
  packageCandidate(a); // harness metadata 覆蓋了模型的同名檔（A2-1）
  const v4b = verify(a);
  verdict(v4b, 1, 'compare');
  assert.deepEqual(v4b.report.stages.referencePolicy.violations, [{ rule: 'reserved-metadata-name', path: METADATA }]);
  assert.deepEqual(v4b.report.stages.compare.hashMismatch.map((m) => m.path), [METADATA]);
  assert.equal(v4b.report.stages.compare.metadata.equal, true);

  const b = startArm(t, MIN);
  assert.equal(freeze(b).status, 0);
  const tampered = metadataBytes({ ...HARNESS_METADATA, metrics: { durationMs: 2 } });
  assert.equal(tampered.length, HARNESS.length);
  packageCandidate(b, { stagedMetadata: tampered });
  const v10 = verify(b);
  verdict(v10, 1, 'compare');
  const cmp = v10.report.stages.compare;
  assert.deepEqual([cmp.missing, cmp.extra, cmp.sizeMismatch, cmp.hashMismatch, cmp.metadata.present, cmp.metadata.equal], [[], [], [], [], true, false]);
});

test('E2E-F2 (no overwrite): an existing frozen reference, report or work directory is never overwritten, reused or deleted', E2E, (t) => {
  assert.equal(blocker, null, blocker ?? '');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-e2e-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const d of ['home', 'tmp', 'model-output', 'not-a-repository', 'existing-work']) fs.mkdirSync(path.join(root, d));
  fs.writeFileSync(path.join(root, 'model-output', 'index.html'), INDEX);
  const before = fingerprint(path.join(root, 'model-output'));
  const KEEP = 'PRE-EXISTING — MUST NOT CHANGE\n';
  const existing = path.join(root, 'existing.json');
  fs.writeFileSync(existing, KEEP);
  fs.writeFileSync(path.join(root, 'existing-work', 'sentinel.txt'), KEEP);
  // freeze：--out 已存在（輸入檢查在盤點與任何 git 指令之前就停，所以 --repo 不需要是 repo）。
  const f = cli(root, ['freeze', '--output', path.join(root, 'model-output'), '--dest', DEST, '--repo', path.join(root, 'not-a-repository'), '--out', existing]);
  assert.equal(f.status, 4, f.stdout);
  assert.equal(f.marker, 'PUBLICATION-ORACLE FREEZE: REJECTED exit=4 violations=0');
  assert.ok(f.stdout.includes('--out already exists'), f.stdout);
  // verify：--report／--work 已存在（同樣停在輸入階段）。
  const manifest = path.join(root, 'manifest.json');
  fs.writeFileSync(manifest, independentManifest(MIN));
  const meta = path.join(root, METADATA);
  fs.writeFileSync(meta, HARNESS);
  const base = ['verify', '--manifest', manifest, '--manifest-sha256', sha(fs.readFileSync(manifest)), '--metadata', meta, '--metadata-sha256', sha(HARNESS),
    '--repo', path.join(root, 'not-a-repository'), '--candidate', '0123456789abcdef0123456789abcdef01234567', '--dest', DEST];
  for (const [flag, target] of [['--report', existing], ['--work', path.join(root, 'existing-work')]]) {
    const v = cli(root, [...base, flag, target]);
    assert.equal(v.status, 4, v.stdout);
    assert.ok(v.marker.startsWith('PUBLICATION-ORACLE VERIFY: FAIL gate=input exit=4 '), v.marker);
    assert.ok(v.stdout.includes(`${flag} already exists`), v.stdout);
  }
  assert.equal(fs.readFileSync(existing, 'utf8'), KEEP);
  assert.deepEqual(fs.readdirSync(path.join(root, 'existing-work')), ['sentinel.txt']);
  assert.equal(fs.readFileSync(path.join(root, 'existing-work', 'sentinel.txt'), 'utf8'), KEEP);
  assert.equal(fingerprint(path.join(root, 'model-output')), before);
});

// ───────────── B4-1：暫存目錄一律檢查（即使明確指定了 --work）─────────────
// 候選自己的 build-manifest 會往 os.tmpdir() 寫一個檔，所以「管線的子行程把暫存檔寫到哪裡」是直接觀察到的，不是推論。
// known-bad 臂把兩處都退回第四版的行為（只有沒指定 --work 時才檢查；子行程沿用呼叫端的 TMPDIR）：同一個呼叫就會通過，
// 暫存檔被寫進候選 repo。暫存目錄裡允許出現其他暫存檔（macOS 的 git 轉接程式在沙箱內會把快取檔放在那裡），所以這裡只斷言
// 管線的那一個檔在哪裡、不在哪裡。

test('E2E-B4-1: with --work, a temporary directory inside the candidate repository is refused at the input gate — nothing is cloned or run and nothing is written there; outside it the run passes and the pipeline uses that directory; the known-bad arm writes into the candidate repository', E2E, (t) => {
  assert.equal(blocker, null, blocker ?? '');
  const MARK = 'zz-b41-pipeline-tempfile.txt';
  const c = startArm(t, MIN);
  assert.equal(freeze(c).status, 0);
  packageCandidate(c, { afterRegen: (x) => {
    const file = path.join(x.clone, 'scripts', 'build-manifest.mjs');
    fs.writeFileSync(file, `import { writeFileSync as b41Write } from 'node:fs'; import { tmpdir as b41Tmp } from 'node:os'; import { join as b41Join } from 'node:path';\n`
      + `b41Write(b41Join(b41Tmp(), '${MARK}'), 'written by the candidate pipeline into os.tmpdir()\\n'); // SYNTHETIC — disposable test candidate only\n${fs.readFileSync(file, 'utf8')}`);
  } });
  const unsafe = path.join(c.clone, 'zz-tmp-inside-candidate'); // 候選 repo 工作樹內的（未追蹤）目錄
  const safe = path.join(c.root, 'safe-tmp');
  for (const d of [unsafe, safe]) fs.mkdirSync(d);
  const refusal = /temporary directory \(TMPDIR\) is inside the candidate repository/;

  // (1) 對照：安全的暫存目錄 + --work → PASS，而且管線的暫存檔就落在那個目錄（證明這個探測看得到寫入）。
  const ok = verify(c, { env: { TMPDIR: safe } });
  verdict(ok, 0, null);
  assert.equal(fs.existsSync(path.join(safe, MARK)), true, 'the pipeline temp file is in the safe temporary directory');
  assert.deepEqual(fs.readdirSync(unsafe), []);
  fs.rmSync(path.join(safe, MARK));

  // (2) 暫存目錄在候選 repo 內 + --work → 在輸入階段被拒絕：沒有 clone、沒有執行管線，那個目錄內沒有任何東西被寫入。
  // (2b) 經由 repo 之外、指進 repo 的 symlink 也一樣。
  fs.symlinkSync(unsafe, path.join(c.root, 'tmp-alias'));
  for (const dir of [unsafe, path.join(c.root, 'tmp-alias')]) {
    const bad = verify(c, { env: { TMPDIR: dir } });
    verdict(bad, 4, 'input');
    assert.match(bad.report.messages.join('\n'), refusal);
    assert.equal(bad.report.stages.checkout.status, 'not-run');
    assert.deepEqual(fs.readdirSync(unsafe), [], 'nothing was written into the refused directory');
    assert.equal(fs.existsSync(path.join(safe, MARK)), false, 'the pipeline did not run');
  }

  // (3) known-bad 臂：把兩處退回第四版的行為，其餘不變（每個錨點都必須在原始碼中恰好出現一次）。
  let source = fs.readFileSync(ORACLE, 'utf8');
  for (const [fixed, v4] of [
    ["const tmpRoot = outsideRepo('the temporary directory (TMPDIR)',", "const tmpRoot = workTarget !== null ? null : outsideRepo('the temporary directory (TMPDIR)',"],
    ['  if (tmpDir !== null) env.TMPDIR = tmpDir;\n', '  if (tmpDir !== null) env.TMPDIR = tmpDir; else if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;\n'],
  ]) {
    assert.equal(source.split(fixed).length - 1, 1, `the known-bad anchor must occur exactly once in the verifier: ${fixed.trim()}`);
    source = source.replace(fixed, () => v4);
  }
  const knownBad = path.join(c.root, 'known-bad-verifier.mjs');
  fs.writeFileSync(knownBad, source, { flag: 'wx' });
  const kb = verify(c, { env: { TMPDIR: unsafe }, oracle: knownBad });
  assert.equal(kb.status, 0, `the known-bad verifier is expected to accept this call\n${kb.stdout}`);
  assert.ok(kb.marker.startsWith('PUBLICATION-ORACLE VERIFY: PASS '), kb.marker);
  assert.equal(fs.existsSync(path.join(unsafe, MARK)), true, 'the known-bad verifier lets the candidate pipeline write into the candidate repository');
});
