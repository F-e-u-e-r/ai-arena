// publication-oracle.test.mjs — scripts/publication-oracle.mjs 的函式層級測試（node:test；只用 Node 內建模組與本機 git）。
// 這裡測「比對器／清單解析／名稱政策／盤點／輸入與寫入安全」各自的邊界；端到端（git → 乾淨 checkout →
// repo 發佈管線 → _site）由 test/publication-oracle-e2e.test.mjs 以黑箱 CLI 驗證，兩者互不取代。
// 執行：node --test test/*.test.mjs   （本檔預期 fail 0、skipped 0；不需要釘選版本的 Node）
//
// 來源：2026-11-28 經審查的 unit.test.mjs（43 個測試，sha256 04db77d7…e41f）原樣採納，只改 import 路徑，並在 tool identity
// 測試加上「docs 記錄的雜湊必須等於原始碼」的檢查；另外新增 B4-1 的四個測試（標題含「B4-1」）。
// 與審查版本的差異說明見 docs/publication-oracle.md §5。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TOOL, TOOL_SHA256, MANIFEST_FORMAT, EXIT, METADATA_NAME, RESERVED_GIT_NAMES, GIT_SAFE,
  inventory, namePolicyViolations, policyViolations, hermeticEnv,
  buildManifest, serializeManifest, parseManifest, compareTrees, freeze, verify, analyzeTree, enumerateDest, lastLine,
} from '../scripts/publication-oracle.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const DEST = 'tasks/savannah-ecosystem/zz-unit-fixture';
const META = Buffer.from('{"provider":"synthetic","model":"UNIT"}\n');

// 每個測試一個全新的暫存目錄（名稱由本測試建立；結束時只刪自己建立的這一個）。
function tmp(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-unit-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}
// 由 {path: Buffer|string} 產生「期望清單」與「實際枚舉」兩種形狀。
const entries = (map) => Object.keys(map).sort().map((p) => ({ path: p, bytes: Buffer.byteLength(map[p]), sha256: sha(Buffer.from(map[p])) }));
function actualOf(map, { metadata = META, present = true, emptyDirectories = [], nonRegular = [] } = {}) {
  const all = metadata === null ? { ...map } : { ...map, [METADATA_NAME]: metadata };
  return { present, files: entries(all), emptyDirectories, nonRegular, metadataBytes: metadata === null ? null : Buffer.from(metadata) };
}
const MODEL = { 'index.html': '<!doctype html>\n', 'main.js': 'export const a = 1;\n', 'src/lib/util.js': 'export const u = 2;\n' };

// ───────────── compareTrees：權威位元比對 ─────────────

test('compareTrees: identical file set + bytes + metadata -> match', () => {
  const c = compareTrees(entries(MODEL), META, actualOf(MODEL));
  assert.equal(c.status, 'match');
  assert.deepEqual([c.missing, c.extra, c.sizeMismatch, c.hashMismatch, c.otherEntries], [[], [], [], [], []]);
  assert.equal(c.expectedFiles, 4);
  assert.equal(c.actualFiles, 4);
  assert.deepEqual({ present: c.metadata.present, equal: c.metadata.equal }, { present: true, equal: true });
});

test('compareTrees: an unexpected extra published file -> mismatch (extra)', () => {
  const c = compareTrees(entries(MODEL), META, actualOf({ ...MODEL, 'extra.js': 'x\n' }));
  assert.equal(c.status, 'mismatch');
  assert.deepEqual(c.extra, ['extra.js']);
  assert.deepEqual([c.missing, c.sizeMismatch, c.hashMismatch], [[], [], []]);
});

test('compareTrees: a missing expected file -> mismatch (missing)', () => {
  const { 'main.js': _dropped, ...rest } = MODEL;
  const c = compareTrees(entries(MODEL), META, actualOf(rest));
  assert.equal(c.status, 'mismatch');
  assert.deepEqual(c.missing, ['main.js']);
  assert.deepEqual(c.extra, []);
});

test('compareTrees: same length, one byte changed -> mismatch (hash only)', () => {
  const c = compareTrees(entries(MODEL), META, actualOf({ ...MODEL, 'main.js': 'export const a = 2;\n' }));
  assert.equal(c.status, 'mismatch');
  assert.deepEqual(c.sizeMismatch, []);
  assert.deepEqual(c.hashMismatch.map((m) => m.path), ['main.js']);
});

test('compareTrees: different length -> mismatch (size and hash)', () => {
  const c = compareTrees(entries(MODEL), META, actualOf({ ...MODEL, 'main.js': 'export const a = 1;\r\n' }));
  assert.equal(c.status, 'mismatch');
  assert.deepEqual(c.sizeMismatch, [{ path: 'main.js', expected: 20, actual: 21 }]);
  assert.deepEqual(c.hashMismatch.map((m) => m.path), ['main.js']);
});

test('compareTrees: non-regular entries or empty directories in the published tree -> mismatch (otherEntries)', () => {
  const a = actualOf(MODEL, { nonRegular: [{ path: 'link.html', type: 'symlink' }], emptyDirectories: ['vendor'] });
  const c = compareTrees(entries(MODEL), META, a);
  assert.equal(c.status, 'mismatch');
  assert.deepEqual(c.otherEntries, [{ path: 'link.html', type: 'symlink' }, { path: 'vendor', type: 'empty-directory' }]);
  assert.deepEqual([c.missing, c.extra, c.sizeMismatch, c.hashMismatch], [[], [], [], []]);
});

test('compareTrees: destination absent -> mismatch (everything missing, metadata absent)', () => {
  const c = compareTrees(entries(MODEL), META, { present: false, files: [], emptyDirectories: [], nonRegular: [], metadataBytes: null });
  assert.equal(c.status, 'mismatch');
  assert.equal(c.destPresent, false);
  assert.deepEqual(c.missing, ['index.html', 'main.js', 'src/lib/util.js']);
  assert.deepEqual({ present: c.metadata.present, equal: c.metadata.equal }, { present: false, equal: false });
});

test('compareTrees: harness metadata absent -> mismatch', () => {
  const c = compareTrees(entries(MODEL), META, actualOf(MODEL, { metadata: null }));
  assert.equal(c.status, 'mismatch');
  assert.equal(c.metadata.present, false);
});

test('compareTrees: harness metadata bytes modified (same length) -> mismatch', () => {
  const tampered = Buffer.from(META.toString().replace('UNIT', 'UNIX'));
  assert.equal(tampered.length, META.length);
  const c = compareTrees(entries(MODEL), META, actualOf(MODEL, { metadata: tampered }));
  assert.equal(c.status, 'mismatch');
  assert.deepEqual({ present: c.metadata.present, equal: c.metadata.equal }, { present: true, equal: false });
  assert.deepEqual([c.missing, c.extra, c.sizeMismatch, c.hashMismatch], [[], [], [], []]);
});

test('compareTrees: a metadata file listed without its bytes read back is never "equal"', () => {
  const a = actualOf(MODEL);
  a.metadataBytes = null;
  assert.equal(compareTrees(entries(MODEL), META, a).status, 'mismatch');
});

test('compareTrees: model output that itself contains root submission.json (A2-1) can never match', () => {
  const model = { ...MODEL, [METADATA_NAME]: '{"note":"model-authored"}\n' };
  // 封裝時 harness metadata 覆蓋了模型的同名檔：發佈樹裡的 submission.json 是 harness 的位元。
  const c = compareTrees(entries(model), META, actualOf(MODEL));
  assert.equal(c.status, 'mismatch');
  assert.deepEqual(c.hashMismatch.map((m) => m.path), [METADATA_NAME]);
  assert.equal(c.metadata.equal, true);
  assert.equal(c.expectedFiles, 4); // 不重複計數同一路徑
});

// ───────────── 凍結 manifest：canonical 序列化與嚴格解析 ─────────────

function canonical(map = MODEL, dest = DEST, emptyDirectories = []) {
  return { format: MANIFEST_FORMAT, dest, files: entries(map), emptyDirectories };
}

test('manifest: buildManifest + serializeManifest round-trips through parseManifest', () => {
  const m = buildManifest({ files: entries(MODEL), emptyDirectories: ['empty'], nonRegular: [] }, DEST);
  const text = serializeManifest(m);
  assert.ok(text.endsWith('\n'));
  assert.deepEqual(parseManifest(Buffer.from(text)), m);
  assert.deepEqual(Object.keys(m), ['format', 'dest', 'files', 'emptyDirectories']);
});

test('manifest: parseManifest rejects every non-canonical or malformed form', () => {
  const bad = (mutate, re) => {
    const m = canonical();
    const out = mutate(m);
    const buf = Buffer.isBuffer(out) ? out : Buffer.from(serializeManifest(out ?? m));
    assert.throws(() => parseManifest(buf), re);
  };
  bad(() => Buffer.from('not json'), /not valid JSON/);
  bad(() => Buffer.from('[]\n'), /top level must be an object/);
  bad((m) => ({ ...m, extra: 1 }), /unexpected top-level keys/);
  bad((m) => ({ format: m.format, files: m.files, dest: m.dest, emptyDirectories: [] }), /unexpected top-level keys/); // 鍵順序也固定
  bad((m) => { m.format = 'other/1'; }, /unsupported format/);
  bad((m) => { m.dest = 'tasks/x/.hidden'; }, /dest must be/);
  bad((m) => { m.dest = 'tasks/x'; }, /dest must be/);
  bad((m) => { m.dest = 'assets/x/y'; }, /dest must be/);
  bad((m) => { m.files.reverse(); }, /strictly sorted/);
  bad((m) => { m.files.push({ ...m.files[m.files.length - 1] }); }, /strictly sorted/); // 重複路徑
  bad((m) => { m.files[0].path = '../escape.js'; }, /non-canonical path/);
  bad((m) => { m.files[0].path = '/abs.js'; }, /non-canonical path/);
  bad((m) => { m.files[0].path = 'a//b.js'; }, /non-canonical path/);
  bad((m) => { m.files[0].bytes = -1; }, /invalid bytes/);
  bad((m) => { m.files[0].bytes = 1.5; }, /invalid bytes/);
  bad((m) => { m.files[0].sha256 = 'ABC'; }, /invalid sha256/);
  bad((m) => { m.files[0].mode = '100644'; }, /file entry must be/);
  bad((m) => { m.emptyDirectories = ['../x']; }, /non-canonical emptyDirectories/);
  bad((m) => Buffer.from(JSON.stringify(m)), /canonical serialized form/); // 空白不同
  bad((m) => Buffer.from(`${serializeManifest(m)}\n`), /canonical serialized form/); // 多一個換行
});

// ───────────── 名稱政策（早期拒絕；verify 會對參考清單重新斷言）─────────────

test('name policy: git-reserved names are rejected at any directory level, case-insensitively, reported once per prefix', () => {
  assert.deepEqual(RESERVED_GIT_NAMES, ['.git', '.gitattributes', '.gitignore', '.gitmodules']);
  assert.deepEqual(namePolicyViolations('.gitattributes'), [{ rule: 'reserved-git-name', path: '.gitattributes' }]);
  assert.deepEqual(namePolicyViolations('sub/.gitignore'), [{ rule: 'reserved-git-name', path: 'sub/.gitignore' }]);
  assert.deepEqual(namePolicyViolations('a/b/.gitmodules'), [{ rule: 'reserved-git-name', path: 'a/b/.gitmodules' }]);
  assert.deepEqual(namePolicyViolations('vendor/.git/objects/ab/cdef'), [{ rule: 'reserved-git-name', path: 'vendor/.git' }]);
  assert.deepEqual(namePolicyViolations('.GIT/config'), [{ rule: 'reserved-git-name', path: '.GIT' }]);
  assert.deepEqual(namePolicyViolations('Sub/.GitAttributes'), [{ rule: 'reserved-git-name', path: 'Sub/.GitAttributes' }]);
  const many = policyViolations(['vendor/.git/HEAD', 'vendor/.git/config', 'vendor/.git/refs/heads/main', 'vendor/lib.js']);
  assert.deepEqual(many, [{ rule: 'reserved-git-name', path: 'vendor/.git' }]);
});

test('name policy: root submission.json is the harness-owned metadata name; nested ones are ordinary files', () => {
  assert.deepEqual(namePolicyViolations('submission.json'), [{ rule: 'reserved-metadata-name', path: 'submission.json' }]);
  assert.deepEqual(namePolicyViolations('Submission.JSON'), [{ rule: 'reserved-metadata-name', path: 'Submission.JSON' }]);
  assert.deepEqual(namePolicyViolations('data/submission.json'), []);
  assert.deepEqual(namePolicyViolations('submission.json.bak'), []);
});

test('name policy: hidden, OS-cruft and unsafe segments; one rule per segment with a fixed precedence', () => {
  assert.deepEqual(namePolicyViolations('.hidden-config'), [{ rule: 'hidden-segment', path: '.hidden-config' }]);
  assert.deepEqual(namePolicyViolations('a/.cache/x.js'), [{ rule: 'hidden-segment', path: 'a/.cache' }]);
  assert.deepEqual(namePolicyViolations('.DS_Store'), [{ rule: 'os-cruft', path: '.DS_Store' }]);
  assert.deepEqual(namePolicyViolations('img/Thumbs.db'), [{ rule: 'os-cruft', path: 'img/Thumbs.db' }]);
  assert.deepEqual(namePolicyViolations('.ds_store'), [{ rule: 'hidden-segment', path: '.ds_store' }]); // cruft 採完全相符
  assert.deepEqual(namePolicyViolations('my file.txt'), [{ rule: 'unsafe-segment', path: 'my file.txt' }]);
  assert.deepEqual(namePolicyViolations('café.js'), [{ rule: 'unsafe-segment', path: 'café.js' }]);
  assert.deepEqual(namePolicyViolations('.git.'), [{ rule: 'hidden-segment', path: '.git.' }]); // 非保留名，但仍是隱藏分段
  assert.deepEqual(namePolicyViolations('x/.hidden/y/.git'), [
    { rule: 'hidden-segment', path: 'x/.hidden' },
    { rule: 'reserved-git-name', path: 'x/.hidden/y/.git' },
  ]);
  assert.deepEqual(namePolicyViolations('index.html'), []);
  assert.deepEqual(namePolicyViolations('src/lib/util-1.2_x.js'), []);
});

test('name policy: policyViolations de-duplicates and sorts by path then rule', () => {
  const v = policyViolations(['z/.git/a', 'a b.txt', 'z/.git/b', '.DS_Store', 'ok.js']);
  assert.deepEqual(v, [
    { rule: 'os-cruft', path: '.DS_Store' },
    { rule: 'unsafe-segment', path: 'a b.txt' },
    { rule: 'reserved-git-name', path: 'z/.git' },
  ]);
});

// ───────────── inventory：獨立枚舉（lstat、不跟隨、不跳過任何名稱）─────────────

test('inventory: lists every regular file (hidden and nested included) with byte length and sha256, sorted', (t) => {
  const dir = tmp(t);
  const bin = Buffer.from([0, 255, 13, 10, 0]);
  write(dir, 'b.txt', 'bee\n');
  write(dir, '.hidden', 'h');
  write(dir, 'a/b/c.bin', bin);
  write(dir, 'empty.dat', '');
  const inv = inventory(dir);
  assert.deepEqual(inv.files, [
    { path: '.hidden', bytes: 1, sha256: sha(Buffer.from('h')) },
    { path: 'a/b/c.bin', bytes: 5, sha256: sha(bin) },
    { path: 'b.txt', bytes: 4, sha256: sha(Buffer.from('bee\n')) },
    { path: 'empty.dat', bytes: 0, sha256: sha(Buffer.alloc(0)) },
  ]);
  assert.deepEqual(inv.emptyDirectories, []);
  assert.deepEqual(inv.nonRegular, []);
});

test('inventory: symlinks are recorded as non-regular and never followed; empty directories are recorded', (t) => {
  const dir = tmp(t);
  write(dir, 'real/inside.txt', 'x');
  write(dir, 'file.txt', 'y');
  fs.symlinkSync('real', path.join(dir, 'dirlink'));
  fs.symlinkSync('file.txt', path.join(dir, 'filelink'));
  fs.symlinkSync('does-not-exist', path.join(dir, 'dangling'));
  fs.mkdirSync(path.join(dir, 'hollow/inner'), { recursive: true });
  const inv = inventory(dir);
  assert.deepEqual(inv.files.map((f) => f.path), ['file.txt', 'real/inside.txt']);
  assert.deepEqual(inv.nonRegular, [
    { path: 'dangling', type: 'symlink' },
    { path: 'dirlink', type: 'symlink' },
    { path: 'filelink', type: 'symlink' },
  ]);
  assert.deepEqual(inv.emptyDirectories, ['hollow/inner']);
});

test('inventory: a FIFO is recorded as non-regular without being opened (no hang)', (t) => {
  const dir = tmp(t);
  write(dir, 'ok.txt', 'ok');
  execFileSync('mkfifo', [path.join(dir, 'pipe')]);
  const inv = inventory(dir);
  assert.deepEqual(inv.files.map((f) => f.path), ['ok.txt']);
  assert.deepEqual(inv.nonRegular, [{ path: 'pipe', type: 'fifo' }]);
});

test('inventory: refuses a root that is not a real directory', (t) => {
  const dir = tmp(t);
  const file = write(dir, 'f.txt', 'x');
  fs.symlinkSync(dir, path.join(dir, 'self'));
  assert.throws(() => inventory(file), /not a directory/);
  assert.throws(() => inventory(path.join(dir, 'self')), /not a directory/);
});

// ───────────── 隔離的子行程環境 ─────────────

test('hermeticEnv: whitelist only — no ambient git/node configuration leaks into child processes', () => {
  const saved = {};
  const leak = { ARENA_ROOT: '/x', NODE_OPTIONS: '--require /x', NODE_PATH: '/x', GIT_DIR: '/x', GIT_WORK_TREE: '/x', GIT_CONFIG_COUNT: '1', LANG: 'xx_XX' };
  for (const k of Object.keys(leak)) { saved[k] = process.env[k]; process.env[k] = leak[k]; }
  try {
    const env = hermeticEnv('/tmp/h');
    for (const k of Object.keys(leak)) assert.equal(Object.hasOwn(env, k), false, `${k} must not be passed through`);
    assert.equal(env.HOME, '/tmp/h');
    assert.equal(env.XDG_CONFIG_HOME, '/tmp/h/.config');
    assert.equal(env.GIT_CONFIG_GLOBAL, os.devNull);
    assert.equal(env.GIT_CONFIG_SYSTEM, os.devNull);
    assert.deepEqual([env.GIT_CONFIG_NOSYSTEM, env.GIT_ATTR_NOSYSTEM, env.GIT_NO_REPLACE_OBJECTS, env.GIT_TERMINAL_PROMPT], ['1', '1', '1', '0']);
    assert.ok(env.PATH.startsWith(path.dirname(process.execPath)));
    const allowed = new Set(['PATH', 'HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_ATTR_NOSYSTEM', 'GIT_NO_REPLACE_OBJECTS', 'GIT_OPTIONAL_LOCKS', 'GIT_TERMINAL_PROMPT', 'LC_ALL', 'TZ', 'TMPDIR']);
    assert.deepEqual(Object.keys(env).filter((k) => !allowed.has(k)), []);
  } finally {
    for (const k of Object.keys(leak)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});

// ───────────── freeze()：早期可發佈性檢查與寫入安全 ─────────────

// 測試自己建立的最小 git repo（隔離設定、無 template → 無 hooks），只用來提供 ignore 規則。
function ignoreRepo(t, gitignore) {
  const root = tmp(t);
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(root, 'home'));
  const r = spawnSync('git', [...GIT_SAFE, 'init', '--quiet', '--template=', repo], { env: hermeticEnv(path.join(root, 'home')), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  fs.writeFileSync(path.join(repo, '.gitignore'), gitignore);
  return { root, repo };
}

test('freeze: a clean output yields the canonical manifest and leaves the model output untouched', (t) => {
  const { root, repo } = ignoreRepo(t, '*.log\n');
  const output = path.join(root, 'out');
  for (const [p, c] of Object.entries(MODEL)) write(output, p, c);
  const before = inventory(output);
  const out = path.join(root, 'manifest.json');
  const rep = freeze({ output, dest: DEST, repo, out });
  assert.equal(rep.exitCode, EXIT.PASS, JSON.stringify(rep.messages));
  assert.equal(rep.verdict, 'OK');
  assert.deepEqual(rep.violations, []);
  assert.equal(rep.files, 3);
  const bytes = fs.readFileSync(out);
  assert.equal(bytes.toString(), serializeManifest(canonical()));
  assert.equal(rep.manifestSha256, sha(bytes));
  assert.equal(rep.tool, TOOL);
  assert.deepEqual(inventory(output), before);
});

test('freeze: files matched by the repo ignore rules are rejected; a negated pattern is not a match', (t) => {
  const { root, repo } = ignoreRepo(t, '*.log\n!keep.log\n');
  const output = path.join(root, 'out');
  write(output, 'index.html', 'x');
  write(output, 'debug.log', 'd');
  write(output, 'keep.log', 'k');
  const out = path.join(root, 'manifest.json');
  const rep = freeze({ output, dest: DEST, repo, out });
  assert.equal(rep.exitCode, EXIT.INELIGIBLE);
  assert.deepEqual(rep.violations, [{ rule: 'ignored-by-repo', path: 'debug.log', detail: '.gitignore:1:*.log' }]);
  assert.equal(fs.existsSync(out), false, 'no manifest may be written for an ineligible output');
  assert.equal(rep.inventory.files.length, 3, 'the full inventory is still reported');
});

test('freeze: input and write-safety errors are "cannot verify" (exit 4) and never write anything', (t) => {
  const { root, repo } = ignoreRepo(t, '');
  const output = path.join(root, 'out');
  write(output, 'index.html', 'x');
  const before = inventory(output);
  const good = { output, dest: DEST, repo, out: path.join(root, 'm.json') };
  const fails = (opts, re) => {
    const rep = freeze(opts);
    assert.equal(rep.exitCode, EXIT.CANNOT_VERIFY, JSON.stringify(rep.messages));
    assert.equal(rep.verdict, 'REJECTED');
    assert.match(rep.messages.join('\n'), re);
    return rep;
  };
  fails({ ...good, dest: undefined }, /missing required option --dest/);
  fails({ ...good, dest: 'tasks/x/.hidden' }, /--dest must be/);
  fails({ ...good, dest: 'tasks/../x' }, /--dest must be/);
  fails({ ...good, output: path.join(output, 'index.html') }, /--output must be a directory/);
  fails({ ...good, output: path.join(root, 'nope') }, /cannot be resolved/);
  fails({ ...good, out: path.join(output, 'm.json') }, /must not be written inside the model output directory/);
  const rr = fails({ ...good, report: path.join(output, 'r.json') }, /must not be written inside the model output directory/);
  assert.equal(rr.reportFile, null);
  const existing = write(root, 'existing.json', 'KEEP');
  fails({ ...good, out: existing }, /already exists/);
  assert.equal(fs.readFileSync(existing, 'utf8'), 'KEEP');
  fs.symlinkSync(path.join(output, 'via-link.json'), path.join(root, 'out-link'));
  fails({ ...good, out: path.join(root, 'out-link') }, /already exists/); // 懸空 symlink 也不跟隨
  assert.equal(fs.existsSync(good.out), false);
  assert.deepEqual(inventory(output), before);
});

// ───────────── verify()：輸入／綁定階段（在任何 clone 之前就必須拒絕）─────────────

test('verify: binding and write-safety errors stop at the input gate with exit 4', (t) => {
  const root = tmp(t);
  const repo = path.join(root, 'candidate');
  fs.mkdirSync(repo);
  write(repo, 'README.md', 'KEEP');
  const manifestText = serializeManifest(canonical());
  const manifest = write(root, 'frozen/manifest.json', manifestText);
  const metadata = write(root, 'frozen/submission.json', META);
  const good = {
    manifest, manifestSha256: sha(Buffer.from(manifestText)), metadata, metadataSha256: sha(META),
    repo, candidate: '0123456789abcdef0123456789abcdef01234567', dest: DEST,
  };
  const fails = (opts, re, gate = 'input') => {
    const rep = verify(opts);
    assert.equal(rep.exitCode, EXIT.CANNOT_VERIFY, JSON.stringify(rep.messages));
    assert.equal(rep.verdict, 'FAIL');
    assert.equal(rep.failingGate, gate);
    assert.match(rep.messages.join('\n'), re);
    assert.equal(rep.stages.compare.status, 'not-run');
    return rep;
  };
  fails({ ...good, candidate: undefined }, /missing required option for candidate/);
  fails({ ...good, candidate: 'HEAD' }, /full 40-hex commit SHA/);
  fails({ ...good, candidate: good.candidate.slice(0, 12) }, /full 40-hex commit SHA/);
  fails({ ...good, candidate: good.candidate.toUpperCase() }, /full 40-hex commit SHA/);
  fails({ ...good, dest: 'tasks/savannah-ecosystem' }, /--dest must be/);
  fails({ ...good, dest: 'tasks/tokyo-island/zz-unit-fixture' }, /manifest is frozen for/);
  fails({ ...good, manifestSha256: 'f'.repeat(64) }, /do not match --manifest-sha256/);
  fails({ ...good, metadataSha256: 'f'.repeat(64) }, /do not match --metadata-sha256/);
  fails({ ...good, manifestSha256: 'XYZ' }, /64 lowercase hex/);
  // 參考不得位於候選 repo 內（獨立性）。
  const inside = write(repo, '.oracle-ref/manifest.json', manifestText);
  fails({ ...good, manifest: inside }, /lives inside the candidate repository/);
  fs.symlinkSync(inside, path.join(root, 'manifest-link.json')); // 經 symlink 指進 repo 也一樣
  fails({ ...good, manifest: path.join(root, 'manifest-link.json') }, /lives inside the candidate repository/);
  // 非 canonical 的 manifest 即使 pin 相符也不接受。
  const loose = Buffer.from(JSON.stringify(canonical()));
  const looseFile = write(root, 'frozen/loose.json', loose);
  fails({ ...good, manifest: looseFile, manifestSha256: sha(loose) }, /invalid manifest/);
  // 驗證器絕不寫入候選 repo，也絕不覆寫或跟隨既有路徑。
  const w1 = fails({ ...good, report: path.join(repo, 'report.json') }, /must be outside the candidate repository/);
  assert.equal(w1.reportFile, null);
  fs.symlinkSync(path.join(repo, 'README.md'), path.join(root, 'report-link.json'));
  fails({ ...good, report: path.join(root, 'report-link.json') }, /already exists/);
  fs.symlinkSync(path.join(repo, 'not-yet.json'), path.join(root, 'dangling-link.json'));
  fails({ ...good, report: path.join(root, 'dangling-link.json') }, /already exists/);
  fails({ ...good, work: path.join(repo, 'work') }, /must be outside the candidate repository/);
  fs.mkdirSync(path.join(root, 'existing-work'));
  fails({ ...good, work: path.join(root, 'existing-work') }, /already exists/);
  // 走到最後一項輸入檢查：候選不是 --repo 內的 commit（這裡 --repo 甚至不是 git repo）。
  fails(good, /is not a commit in --repo/);
  assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), 'KEEP');
  assert.deepEqual(fs.readdirSync(repo).sort(), ['.oracle-ref', 'README.md']);
});

// ───────────── 候選 git tree 的分析（區分大小寫、與本機檔案系統無關）─────────────
// 這一組是 2026-11-28 凍結前對抗式審查的回歸測試（BR-1／BR-2／BR-3／BR-5）：不分大小寫的檔案系統上，
// 工作樹與 _site 看不到這些差異，只有 tree 看得到。

const D = 'tasks/savannah-ecosystem/zz-unit-fixture';
const blob = (p, mode = '100644') => ({ mode, path: p });
const EXPECTED = ['index.html', 'main.js', 'submission.json'];
const BASE_TREE = [blob('index.html'), blob('tasks.json'), blob('scripts/build-manifest.mjs'), blob('tasks/savannah-ecosystem/task.json')];
const destTree = (names) => names.map((n) => blob(`${D}/${n}`));

test('analyzeTree: the destination holds exactly the reference paths -> match, nothing flagged', () => {
  const t = analyzeTree([...BASE_TREE, ...destTree(EXPECTED), blob(`${D}/run.sh`, '100755')], D, [...EXPECTED, 'run.sh']);
  assert.deepEqual(t.dest, { expected: 4, actual: 4, missing: [], extra: [], nonBlob: [], match: true });
  assert.deepEqual([t.symlinks, t.caseCollisions, t.gitattributes], [[], [], []]);
  assert.equal(t.entries, 8);
});

test('analyzeTree: a destination that differs only in letter case is NOT the destination (BR-1)', () => {
  const upper = EXPECTED.map((n) => blob(`tasks/savannah-ecosystem/ZZ-UNIT-FIXTURE/${n}`));
  const t = analyzeTree([...BASE_TREE, ...upper], D, EXPECTED);
  assert.equal(t.dest.match, false);
  assert.deepEqual(t.dest.missing, EXPECTED);
  assert.deepEqual(t.dest.extra, []);
  assert.equal(t.dest.actual, 0);
});

test('analyzeTree: extra tree entries under the destination are reported even if the pipeline would not publish them', () => {
  const t = analyzeTree([...BASE_TREE, ...destTree([...EXPECTED, '.DS_Store', 'notes/extra.txt'])], D, EXPECTED);
  assert.equal(t.dest.match, false);
  assert.deepEqual(t.dest.extra, ['.DS_Store', 'notes/extra.txt']);
  assert.deepEqual(t.dest.missing, []);
});

test('analyzeTree: paths that differ only in letter case are collisions — files and directories (BR-2)', () => {
  const dupFile = analyzeTree([...BASE_TREE, ...destTree([...EXPECTED, 'MAIN.js'])], D, EXPECTED);
  assert.deepEqual(dupFile.caseCollisions, [`${D}/MAIN.js <> ${D}/main.js`]);
  assert.deepEqual(dupFile.dest.extra, ['MAIN.js']);
  const dupDir = analyzeTree([...BASE_TREE, ...destTree(['index.html', 'Lib/a.js', 'lib/b.js'])], D, ['index.html', 'Lib/a.js', 'Lib/b.js']);
  assert.deepEqual(dupDir.caseCollisions, [`${D}/Lib <> ${D}/lib`]);
  assert.deepEqual(dupDir.dest.missing, ['Lib/b.js']);
  assert.deepEqual(dupDir.dest.extra, ['lib/b.js']);
  const elsewhere = analyzeTree([...BASE_TREE, blob('Scripts/x.mjs'), ...destTree(EXPECTED)], D, EXPECTED);
  assert.deepEqual(elsewhere.caseCollisions, ['Scripts <> scripts']);
  assert.deepEqual(analyzeTree([blob('a/b.txt'), blob('a/c.txt'), blob('A.txt')], D, []).caseCollisions, []);
});

test('analyzeTree: symlink entries anywhere in the tree are listed (BR-5); gitlinks under the destination are non-blob', () => {
  const t = analyzeTree([...BASE_TREE.filter((e) => e.path !== 'tasks.json'), blob('tasks.json', '120000'), ...destTree(EXPECTED), blob(`${D}/vendor`, '160000')], D, EXPECTED);
  assert.deepEqual(t.symlinks, ['tasks.json']);
  assert.deepEqual(t.dest.nonBlob, [{ mode: '160000', path: 'vendor' }]);
  assert.deepEqual(t.dest.extra, ['vendor']);
  assert.equal(t.dest.match, false);
});

test('analyzeTree: .gitattributes is found at any level and in any letter case (BR-3)', () => {
  const t = analyzeTree([...BASE_TREE, blob('.gitattributes'), blob('tasks/.GitAttributes'), blob('docs/gitattributes'), blob('x/.gitattributes.bak'), ...destTree(EXPECTED)], D, EXPECTED);
  assert.deepEqual(t.gitattributes, ['.gitattributes', 'tasks/.GitAttributes']);
  assert.equal(t.dest.match, true);
});

test('enumerateDest: every destination segment must match a directory entry name exactly (BR-1)', (t) => {
  const site = tmp(t);
  write(site, 'tasks/savannah-ecosystem/ZZ-Unit-Fixture/index.html', 'x');
  write(site, 'tasks/savannah-ecosystem/ZZ-Unit-Fixture/submission.json', META);
  const exact = enumerateDest(site, 'tasks/savannah-ecosystem/ZZ-Unit-Fixture');
  assert.equal(exact.present, true);
  assert.deepEqual(exact.files.map((x) => x.path), ['index.html', 'submission.json']);
  assert.ok(exact.metadataBytes.equals(META));
  for (const wrong of ['tasks/savannah-ecosystem/zz-unit-fixture', 'tasks/Savannah-Ecosystem/ZZ-Unit-Fixture', 'Tasks/savannah-ecosystem/ZZ-Unit-Fixture', 'tasks/savannah-ecosystem/missing']) {
    assert.deepEqual(enumerateDest(site, wrong), { present: false, files: [], emptyDirectories: [], nonRegular: [], metadataBytes: null }, wrong);
  }
});

// ───────────── 位置檢查不得被別名繞過；不在模型輸出或候選 repo 內建立任何暫存目錄（BR-4）─────────────

test('freeze: a letter-case alias of the model output directory cannot be used to write inside it', (t) => {
  const { root, repo } = ignoreRepo(t, '');
  const output = path.join(root, 'out');
  write(output, 'index.html', 'x');
  const before = inventory(output);
  const alias = path.join(root, 'OUT'); // 不分大小寫的檔案系統上是同一個目錄；區分大小寫時不存在
  const rep = freeze({ output, dest: DEST, repo, out: path.join(alias, 'manifest.json'), report: path.join(alias, 'report.json') });
  assert.equal(rep.exitCode, EXIT.CANNOT_VERIFY, JSON.stringify(rep.messages));
  // 不分大小寫時別名解析得到，必須是「位置檢查」拒絕它；區分大小寫時別名不存在，拒絕的理由是路徑無法解析。
  assert.match(rep.messages.join('\n'), fs.existsSync(alias) ? /must not be written inside the model output directory/ : /cannot be resolved/);
  assert.equal(rep.reportFile, null);
  assert.deepEqual(inventory(output), before);
});

test('freeze: creates no temporary directory, so a TMPDIR inside the model output cannot pollute the inventory', (t) => {
  const { root, repo } = ignoreRepo(t, '');
  const output = path.join(root, 'out');
  write(output, 'index.html', 'x');
  write(output, 'assets/a.txt', 'a');
  const before = inventory(output);
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = path.join(output, 'assets');
  let rep;
  try { rep = freeze({ output, dest: DEST, repo, out: path.join(root, 'm.json') }); } finally { if (saved === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = saved; }
  assert.equal(rep.exitCode, EXIT.PASS, JSON.stringify(rep.messages));
  assert.deepEqual(rep.emptyDirectories, []);
  assert.deepEqual(parseManifest(fs.readFileSync(path.join(root, 'm.json'))).emptyDirectories, []);
  assert.deepEqual(inventory(output), before);
  assert.deepEqual(fs.readdirSync(path.join(output, 'assets')), ['a.txt']);
});

test('freeze: --out and --report naming the same file is an input error and writes nothing', (t) => {
  const { root, repo } = ignoreRepo(t, '');
  const output = path.join(root, 'out');
  write(output, 'index.html', 'x');
  const same = path.join(root, 'same.json');
  const rep = freeze({ output, dest: DEST, repo, out: same, report: same });
  assert.equal(rep.exitCode, EXIT.CANNOT_VERIFY);
  assert.match(rep.messages.join('\n'), /must be different files/);
  assert.equal(rep.reportFile, null);
  assert.equal(fs.existsSync(same), false);
});

test('verify: aliases, temporary directories and FIFOs cannot defeat the input gate', { timeout: 20000 }, (t) => {
  const root = tmp(t);
  const repo = path.join(root, 'candidate');
  write(repo, 'README.md', 'KEEP');
  const manifestText = serializeManifest(canonical());
  const good = {
    manifest: write(root, 'frozen/manifest.json', manifestText), manifestSha256: sha(Buffer.from(manifestText)),
    metadata: write(root, 'frozen/submission.json', META), metadataSha256: sha(META),
    repo, candidate: '0123456789abcdef0123456789abcdef01234567', dest: DEST,
  };
  const fails = (opts, re) => {
    const rep = verify(opts);
    assert.equal(rep.exitCode, EXIT.CANNOT_VERIFY, JSON.stringify(rep.messages));
    assert.equal(rep.failingGate, 'input');
    if (re) assert.match(rep.messages.join('\n'), re);
    return rep;
  };
  // 參考檔經由候選 repo 的大小寫別名傳入（區分大小寫的檔案系統上該路徑不存在，同樣是 exit 4）。
  write(repo, '.oracle-ref/manifest.json', manifestText);
  write(repo, '.oracle-ref/submission.json', META);
  const aliasRoot = path.join(root, 'CANDIDATE');
  const alias = path.join(aliasRoot, '.oracle-ref');
  // 每一項都要求「只有位置檢查才會產生」的訊息：少了位置檢查，這些呼叫會一路走到「不是 --repo 內的 commit」，
  // 同樣是 exit 4／gate input，所以只斷言 exit code 是分辨不出來的。
  const aliasResolves = fs.existsSync(aliasRoot);
  const refMessage = aliasResolves ? /lives inside the candidate repository/ : /cannot be resolved/;
  const writeMessage = aliasResolves ? /must be outside the candidate repository/ : /cannot be resolved/;
  fails({ ...good, manifest: path.join(alias, 'manifest.json') }, refMessage);
  fails({ ...good, metadata: path.join(alias, 'submission.json') }, refMessage);
  fails({ ...good, work: path.join(aliasRoot, 'work') }, writeMessage);
  fails({ ...good, report: path.join(aliasRoot, 'report.json') }, writeMessage);
  // 沒有 --work 時，暫存目錄不得位於候選 repo 內。
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = repo;
  try { fails(good, /temporary directory \(TMPDIR\) is inside the candidate repository/); } finally { if (saved === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = saved; }
  // --work 與 --report 不得是同一個路徑。
  const same = path.join(root, 'same');
  const sameRep = fails({ ...good, work: same, report: same }, /must be different paths/);
  assert.equal(sameRep.reportFile, null);
  assert.equal(fs.existsSync(same), false);
  // FIFO 當作參考：立即拒絕，不會卡在 open。
  execFileSync('mkfifo', [path.join(root, 'manifest.fifo')]);
  fails({ ...good, manifest: path.join(root, 'manifest.fifo') }, /--manifest is not a readable regular file/);
  assert.deepEqual(fs.readdirSync(repo).sort(), ['.oracle-ref', 'README.md']);
});

test('analyzeTree: paths with non-ASCII or control characters are listed (B2-1: this filesystem folds more than ASCII case)', () => {
  const t = analyzeTree([...BASE_TREE, blob('\u017f.js'), blob('s.js'), blob('.gitattribute\u017f'), blob('docs/caf\u00e9.md'), blob('a\tb.txt'), ...destTree(EXPECTED)], D, EXPECTED);
  assert.deepEqual(t.nonAscii, ['.gitattribute\u017f', 'a\tb.txt', 'docs/caf\u00e9.md', '\u017f.js']);
  // 這正是缺口所在：ASCII 小寫比較認不出這兩種折疊，所以必須由 nonAscii 規則擋下。
  assert.deepEqual(t.gitattributes, []);
  assert.deepEqual(t.caseCollisions, []);
  assert.deepEqual(analyzeTree([...BASE_TREE, ...destTree(EXPECTED)], D, EXPECTED).nonAscii, []);
});

test('analyzeTree: hands back the destination blobs that must be byte-bound to the reference (B2-2)', () => {
  const entries = [...BASE_TREE, { mode: '100644', oid: 'a'.repeat(40), path: `${D}/index.html` }, { mode: '100755', oid: 'b'.repeat(40), path: `${D}/main.js` },
    { mode: '100644', oid: 'c'.repeat(40), path: `${D}/submission.json` }, { mode: '100644', oid: 'd'.repeat(40), path: `${D}/extra.js` }, { mode: '160000', oid: 'e'.repeat(40), path: `${D}/vendor` }];
  const t = analyzeTree(entries, D, EXPECTED);
  assert.deepEqual(t.destBlobs, [{ path: 'index.html', oid: 'a'.repeat(40) }, { path: 'main.js', oid: 'b'.repeat(40) }, { path: 'submission.json', oid: 'c'.repeat(40) }]); // 只含「預期路徑」的一般 blob
  assert.deepEqual(t.dest.extra, ['extra.js', 'vendor']);
});

test('lastLine: the last non-empty line, with control characters neutralised (BR-8)', () => {
  assert.equal(lastLine('a\nb\n\n'), 'b');
  assert.equal(lastLine(''), '');
  assert.equal(lastLine('x\rPUBLICATION-ORACLE VERIFY: PASS\n'), 'x?PUBLICATION-ORACLE VERIFY: PASS');
  assert.equal(lastLine('tab\there\u0007\u001b[31m'), 'tab?here??[31m');
});

test('freeze: --repo is validated even when the model output is empty (BR-10)', (t) => {
  const { root, repo } = ignoreRepo(t, '');
  const output = path.join(root, 'out');
  fs.mkdirSync(output);
  const plain = path.join(root, 'not-a-repository');
  fs.mkdirSync(plain);
  const bad = freeze({ output, dest: DEST, repo: plain, out: path.join(root, 'm1.json') });
  assert.equal(bad.exitCode, EXIT.CANNOT_VERIFY);
  assert.match(bad.messages.join('\n'), /git check-ignore failed/);
  assert.equal(fs.existsSync(path.join(root, 'm1.json')), false);
  const ok = freeze({ output, dest: DEST, repo, out: path.join(root, 'm2.json') });
  assert.equal(ok.exitCode, EXIT.PASS, JSON.stringify(ok.messages));
  assert.equal(ok.files, 0);
});

test('verify: a linked worktree and the git directory of the candidate repository count as inside it (BR-4e)', (t) => {
  const root = tmp(t);
  fs.mkdirSync(path.join(root, 'home'));
  const env = { ...hermeticEnv(path.join(root, 'home')), GIT_AUTHOR_NAME: 'unit', GIT_AUTHOR_EMAIL: 'unit@invalid', GIT_COMMITTER_NAME: 'unit', GIT_COMMITTER_EMAIL: 'unit@invalid' };
  const g = (...a) => { const r = spawnSync('git', [...GIT_SAFE, ...a], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const repo = path.join(root, 'repo');
  g('init', '--quiet', '--template=', '-b', 'main', repo);
  write(repo, 'a.txt', 'a');
  g('-C', repo, 'add', '--', 'a.txt');
  g('-C', repo, 'commit', '--quiet', '-m', 'one');
  const linked = path.join(root, 'linked-worktree');
  g('-C', repo, 'worktree', 'add', '--quiet', '-b', 'side', linked);
  const manifestText = serializeManifest(canonical());
  const good = {
    manifest: write(root, 'frozen/manifest.json', manifestText), manifestSha256: sha(Buffer.from(manifestText)),
    metadata: write(root, 'frozen/submission.json', META), metadataSha256: sha(META), repo, candidate: g('-C', repo, 'rev-parse', 'HEAD'), dest: DEST,
  };
  const cases = [
    [{ report: path.join(linked, 'report.json') }, /--report must be outside the candidate repository/],
    [{ work: path.join(linked, 'work') }, /--work must be outside the candidate repository/],
    [{ report: path.join(repo, '.git', 'report.json') }, /--report must be outside the candidate repository/],
    [{ manifest: write(linked, 'ref/manifest.json', manifestText) }, /--manifest lives inside the candidate repository/],
  ];
  for (const [opts, re] of cases) {
    const rep = verify({ ...good, ...opts });
    assert.equal(rep.exitCode, EXIT.CANNOT_VERIFY, JSON.stringify(rep.messages));
    assert.equal(rep.failingGate, 'input');
    assert.match(rep.messages.join('\n'), re);
  }
  assert.equal(fs.existsSync(path.join(linked, 'report.json')), false);
  assert.equal(fs.existsSync(path.join(linked, 'work')), false);
});

// ───────────── B4-1：暫存目錄一律檢查（即使明確指定了 --work）─────────────
// 第四版只在「沒有 --work」時檢查暫存目錄；指定 --work 時 TMPDIR 仍會傳給 git 與候選管線的子行程，卻沒有被檢查。
// 它也把呼叫端的 TMPDIR 原樣傳給檢查之前就執行的 git 指令（verify 的邊界探測、freeze 的 check-ignore）。
// 這一組的每個拒絕都要求「只有暫存目錄檢查才會產生」的訊息（少了它，這些呼叫會通過輸入階段，在更後面才停），
// 並確認危險的副作用沒有發生：--work 沒有被建立，被拒絕的目錄內也沒有任何新檔案。
// 管線真的把暫存檔寫進候選 repo 的那個後果，由 test/publication-oracle-e2e.test.mjs 的 B4-1 對照（含 known-bad 臂）觀察。

// 暫時改寫環境變數後執行 fn（值為 undefined 表示刪除）。Node 的 os.tmpdir() 依序查 TMPDIR、TMP、TEMP。
function withEnv(patch, fn) {
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
// 測試自己建立的小型 git repo（一個 commit、一個 linked worktree；沒有 .node-version，所以通過輸入階段的呼叫會停在 runtime）。
function tinyRepo(t) {
  const root = tmp(t);
  fs.mkdirSync(path.join(root, 'home'));
  const env = { ...hermeticEnv(path.join(root, 'home')), GIT_AUTHOR_NAME: 'unit', GIT_AUTHOR_EMAIL: 'unit@invalid', GIT_COMMITTER_NAME: 'unit', GIT_COMMITTER_EMAIL: 'unit@invalid' };
  const g = (...a) => { const r = spawnSync('git', [...GIT_SAFE, ...a], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const repo = path.join(root, 'repo');
  g('init', '--quiet', '--template=', '-b', 'main', repo);
  write(repo, 'a.txt', 'a');
  g('-C', repo, 'add', '--', 'a.txt');
  g('-C', repo, 'commit', '--quiet', '-m', 'one');
  const linked = path.join(root, 'linked-worktree');
  g('-C', repo, 'worktree', 'add', '--quiet', '-b', 'side', linked);
  const manifestText = serializeManifest(canonical());
  const good = {
    manifest: write(root, 'frozen/manifest.json', manifestText), manifestSha256: sha(Buffer.from(manifestText)),
    metadata: write(root, 'frozen/submission.json', META), metadataSha256: sha(META), repo, candidate: g('-C', repo, 'rev-parse', 'HEAD'), dest: DEST,
  };
  return { root, repo, linked, good };
}
const TMP_INSIDE = /temporary directory \(TMPDIR\) is inside the candidate repository/;
// 以 env 指定的暫存目錄、加上明確的 --work 執行 verify，並斷言它在輸入階段被「暫存目錄檢查」拒絕，且沒有留下任何東西。
let workSeq = 0;
function refusedAsTmp(root, good, env, watched, re = TMP_INSIDE) {
  const work = path.join(root, `work-refused-${workSeq += 1}`);
  const before = fs.readdirSync(watched).sort();
  const rep = withEnv(env, () => verify({ ...good, work }));
  const label = JSON.stringify(env);
  assert.equal(rep.exitCode, EXIT.CANNOT_VERIFY, `${label}: ${JSON.stringify(rep.messages)}`);
  assert.equal(rep.failingGate, 'input', label);
  assert.match(rep.messages.join('\n'), re, label);
  assert.equal(rep.stages.checkout.status, 'not-run', label); // 沒有啟動任何會用到 TMPDIR 的子行程
  assert.equal(fs.existsSync(work), false, `${label}: --work must not be created`);
  assert.deepEqual(fs.readdirSync(watched).sort(), before, `${label}: nothing may be written under the refused temporary directory`);
}

test('verify: an explicit --work does not exempt the temporary directory — inside the candidate repository, its git directory or a linked worktree it is refused (B4-1)', (t) => {
  const { root, repo, linked, good } = tinyRepo(t);
  for (const dir of [path.join(repo, 'tmp-inside'), path.join(repo, '.git', 'tmp-inside'), path.join(linked, 'tmp-inside')]) fs.mkdirSync(dir);
  for (const dir of [repo, path.join(repo, 'tmp-inside'), path.join(repo, '.git'), path.join(repo, '.git', 'tmp-inside'), linked, path.join(linked, 'tmp-inside')]) {
    refusedAsTmp(root, good, { TMPDIR: dir }, dir);
  }
  // os.tmpdir() 在 TMPDIR 未設定（或為空字串）時改用 TMP、再來是 TEMP：經由這兩個名稱指進候選 repo 也一樣被拒絕。
  const inside = path.join(repo, 'tmp-inside');
  refusedAsTmp(root, good, { TMPDIR: undefined, TMP: inside, TEMP: undefined }, inside);
  refusedAsTmp(root, good, { TMPDIR: '', TMP: undefined, TEMP: inside }, inside);
});

test('verify: with --work, an alias of a directory inside the candidate repository is refused as the temporary directory, and an unresolvable one cannot be verified (B4-1)', (t) => {
  const { root, repo, good } = tinyRepo(t);
  const inside = path.join(repo, 'tmp-inside');
  fs.mkdirSync(inside);
  fs.symlinkSync(inside, path.join(root, 'tmp-link')); // repo 之外的 symlink，指進 repo
  refusedAsTmp(root, good, { TMPDIR: path.join(root, 'tmp-link') }, inside);
  fs.symlinkSync(repo, path.join(root, 'repo-link')); // 上層是 symlink
  refusedAsTmp(root, good, { TMPDIR: path.join(root, 'repo-link', 'tmp-inside') }, inside);
  refusedAsTmp(root, good, { TMPDIR: `${inside}${path.sep}` }, inside); // 結尾的分隔字元
  refusedAsTmp(root, good, { TMPDIR: path.join(repo, 'tmp-inside', '..', 'tmp-inside') }, inside); // 未正規化的路徑
  // 大小寫別名：不分大小寫的檔案系統上解析得到，必須由位置檢查拒絕；區分大小寫時該路徑不存在，拒絕的理由是無法解析。
  const aliasRoot = path.join(root, 'REPO');
  refusedAsTmp(root, good, { TMPDIR: path.join(aliasRoot, 'tmp-inside') }, inside, fs.existsSync(aliasRoot) ? TMP_INSIDE : /the temporary directory .* cannot be resolved/);
  // 不存在的暫存目錄（含「日後可能被建立在 repo 內」的路徑）：無法解析就是無法驗證，不會被當成安全。
  refusedAsTmp(root, good, { TMPDIR: path.join(repo, 'not-created-yet') }, repo, /the temporary directory .* cannot be resolved/);
  refusedAsTmp(root, good, { TMPDIR: path.join(root, 'no-such-directory') }, root, /the temporary directory .* cannot be resolved/);
});

test('verify: with --work, a temporary directory outside the candidate repository still passes the input gate; hermeticEnv hands child processes the checked directory and never the ambient TMPDIR (B4-1)', (t) => {
  const { root, good } = tinyRepo(t);
  const safe = path.join(root, 'safe-tmp');
  fs.mkdirSync(safe);
  fs.symlinkSync(safe, path.join(root, 'safe-link')); // 指向 repo 之外的別名是安全的
  for (const [i, dir] of [safe, path.join(root, 'safe-link')].entries()) {
    const rep = withEnv({ TMPDIR: dir }, () => verify({ ...good, work: path.join(root, `work-ok-${i}`) }));
    assert.equal(rep.stages.input.status, 'ok', JSON.stringify(rep.messages));
    assert.equal(rep.stages.checkout.status, 'ok'); // 已經走過 clone 與 checkout（子行程實際啟動過）
    // 這個小 repo 沒有 .node-version，所以在輸入、clone、tree、checkout 之後停在 runtime；重點是它沒有被暫存目錄檢查擋下。
    assert.equal(rep.failingGate, 'runtime', JSON.stringify(rep.messages));
    assert.doesNotMatch(rep.messages.join('\n'), /temporary directory/);
  }
  // hermeticEnv 的契約：子行程只會拿到「明確傳入、已檢查」的暫存目錄；呼叫端環境裡的 TMPDIR／TMP／TEMP 一律不往下傳
  // （第四版會把呼叫端的 TMPDIR 原樣傳下去）。
  for (const ambient of [{ TMPDIR: '/ambient/tmpdir', TMP: '/ambient/tmp', TEMP: '/ambient/temp' }, { TMPDIR: undefined, TMP: undefined, TEMP: undefined }]) {
    withEnv(ambient, () => {
      assert.equal(hermeticEnv('/h', '/checked/tmp').TMPDIR, '/checked/tmp');
      assert.equal(Object.hasOwn(hermeticEnv('/h'), 'TMPDIR'), false);
      for (const env of [hermeticEnv('/h', '/checked/tmp'), hermeticEnv('/h')]) assert.deepEqual([Object.hasOwn(env, 'TMP'), Object.hasOwn(env, 'TEMP')], [false, false]);
    });
  }
});

// git 的替身：先做 macOS 的 git 轉接程式（xcrun）在取不到系統暫存目錄時會做的事——往 $TMPDIR 寫一個快取檔——並把自己收到的
// TMPDIR 記下來，再照常執行真正的 git。只有放進 PATH 的那一次呼叫看得到它。這讓「git 子行程拿到哪個 TMPDIR」在任何平台上
// 都觀察得到（真正的 xcrun 行為只在 macOS 的沙箱內出現）。
const SHIM_CACHE = 'zz-git-shim-cache';
const realGit = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map((d) => path.join(d, 'git')).find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
// hermeticEnv 把 Node 自己的目錄放在 PATH 最前面：Node 與 git 若裝在同一個目錄，替身就插不進去。
const canInterposeGit = Boolean(realGit) && !fs.existsSync(path.join(path.dirname(process.execPath), 'git'));
function gitDouble(root) {
  const dir = path.join(root, 'git-double-bin');
  const log = path.join(root, 'git-double.log');
  for (const p of [realGit, log]) assert.equal(p.includes("'"), false, 'paths must be safe to single-quote');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\nif [ -n "\${TMPDIR:-}" ]; then echo cache > "$TMPDIR/${SHIM_CACHE}" 2>/dev/null; fi\nprintf '%s\\n' "TMPDIR=\${TMPDIR-<unset>}" >> '${log}'\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  const taken = () => { const lines = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []; fs.rmSync(log, { force: true }); return lines; };
  return { withDouble: (env, fn) => withEnv({ ...env, PATH: `${dir}${path.delimiter}${process.env.PATH}` }, fn), taken };
}

test('verify and freeze never hand an unchecked TMPDIR to a git process: a git that drops a cache file into $TMPDIR (as the macOS git shim can) writes nothing into the candidate repository or the model output (B4-1)',
  { skip: !canInterposeGit && !process.env.CI && 'cannot interpose a git test double here (no git on PATH, or node and git share a directory)' }, (t) => {
    assert.equal(canInterposeGit, true, 'a git test double must be interposable (on CI this test is never skipped)');
    const { root, repo, good } = tinyRepo(t);
    const { withDouble, taken } = gitDouble(root);
    const inside = path.join(repo, 'tmp-inside');
    fs.mkdirSync(inside);
    // (1) verify，暫存目錄在候選 repo 內（有、沒有 --work 各一次）：被拒絕；在那之前執行過的邊界探測都沒有拿到 TMPDIR，
    //     所以替身的快取檔沒有被寫進候選 repo。
    for (const work of [null, path.join(root, 'work-double-1')]) {
      const rep = withDouble({ TMPDIR: inside }, () => verify({ ...good, ...(work ? { work } : {}) }));
      assert.equal(rep.exitCode, EXIT.CANNOT_VERIFY, JSON.stringify(rep.messages));
      assert.equal(rep.failingGate, 'input');
      assert.match(rep.messages.join('\n'), TMP_INSIDE);
      const calls = taken();
      assert.ok(calls.length >= 1, 'the boundary probes went through the test double');
      assert.deepEqual([...new Set(calls)], ['TMPDIR=<unset>']);
      assert.deepEqual(fs.readdirSync(inside), [], 'no cache file inside the candidate repository');
      if (work) assert.equal(fs.existsSync(work), false);
    }
    // (2) verify，安全的暫存目錄 + --work：邊界探測仍然不帶 TMPDIR；之後的每一個 git 行程拿到的恰好是檢查過的那個目錄。
    const safe = path.join(root, 'safe-tmp');
    fs.mkdirSync(safe);
    const ok = withDouble({ TMPDIR: safe }, () => verify({ ...good, work: path.join(root, 'work-double-2') }));
    assert.equal(ok.stages.input.status, 'ok', JSON.stringify(ok.messages));
    const calls = taken();
    const checked = `TMPDIR=${fs.realpathSync(safe)}`;
    assert.deepEqual(calls.slice(0, 3), ['TMPDIR=<unset>', 'TMPDIR=<unset>', 'TMPDIR=<unset>']); // 三個邊界探測在最前面
    assert.ok(calls.length > 3 && calls.slice(3).every((c) => c === checked), `every later git process gets the checked directory: ${JSON.stringify([...new Set(calls.slice(3))])}`);
    assert.ok(fs.existsSync(path.join(safe, SHIM_CACHE)), 'the cache file lands in the checked temporary directory');
    // (3) freeze，TMPDIR 在模型輸出目錄內：成功，模型輸出沒有被動過，git 沒有拿到 TMPDIR。
    const output = path.join(root, 'out');
    write(output, 'index.html', 'x');
    write(output, 'assets/a.txt', 'a');
    const before = inventory(output);
    const fr = withDouble({ TMPDIR: path.join(output, 'assets') }, () => freeze({ output, dest: DEST, repo, out: path.join(root, 'm-double.json') }));
    assert.equal(fr.exitCode, EXIT.PASS, JSON.stringify(fr.messages));
    assert.deepEqual(taken(), ['TMPDIR=<unset>']);
    assert.deepEqual(inventory(output), before);
  });

// ───────────── 自我識別與 exit code 對映 ─────────────

test('tool identity: TOOL_SHA256 is the sha256 of the verifier source; exit codes are distinct and fixed', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../scripts/publication-oracle.mjs', import.meta.url)));
  assert.equal(TOOL_SHA256, sha(source));
  // 來源紀錄與原始碼必須一致：docs/publication-oracle.md §5 記錄的就是這份原始碼的 sha256。改動驗證器的人必須同時更新
  // 那一節的雜湊與差異（它是相對於審查版本的差異紀錄），不能只改程式。
  const doc = fs.readFileSync(fileURLToPath(new URL('../docs/publication-oracle.md', import.meta.url)), 'utf8');
  // 只認「repo 內的驗證器」那一格（以標記框住）：文件同時列出審查版本的雜湊，不能讓那一個也算數。
  const recorded = doc.match(/<!-- adopted-sha256:begin -->`([0-9a-f]{64})`<!-- adopted-sha256:end -->/);
  assert.ok(recorded, 'docs/publication-oracle.md §5 must carry the marked sha256 of the adopted verifier');
  assert.equal(recorded[1], TOOL_SHA256, 'docs/publication-oracle.md §5 must record the sha256 of this exact verifier source');
  assert.deepEqual({ ...EXIT }, { PASS: 0, MISMATCH: 1, INELIGIBLE: 2, PIPELINE: 3, CANNOT_VERIFY: 4 });
  assert.equal(METADATA_NAME, 'submission.json');
});
