#!/usr/bin/env node
// publication-oracle.mjs — AI Arena 發佈邊界位元 oracle（開發／benchmark 用工具；不是網站內容，封閉世界組裝器不發佈 scripts/）。
// 來源：2026-11-28 經審查的第四版（sha256 95622e1e…f302a）加上 B4-1 修正。與第四版的確切差異、政策、限制與使用方式見
// docs/publication-oracle.md。
//
// 不變式：發佈候選必須「恰好」包含獨立凍結的模型輸出檔（位元完全相同），再加上另行產生的
// submission metadata（submission.json）。
//
// 子命令：
//   freeze  在封裝「之前」盤點模型輸出目錄（相對路徑／一般檔／位元長度／SHA-256，含隱藏檔），套用早期
//           可發佈性檢查，寫出凍結 manifest。早期檢查只是「及早拒絕」，不是位元完整性的權威證明。
//           （隱藏檔會被盤點、看得見，但名稱政策會拒絕它們並回報；絕不改名、刪除或修補模型產生的檔案。）
//   verify  權威檢查：對「確切候選 commit SHA」做乾淨 checkout → 執行 repo 自己的發佈序列
//           （build-manifest --strict → assemble-site，即 deploy job 的順序）→ 獨立枚舉 _site/<dest> →
//           與凍結 manifest 及凍結的 harness metadata 比對（檔案集合、位元長度、SHA-256、metadata 位元）。
//           checkout 之前另外直接檢查候選的 git tree（區分大小寫、與本機檔案系統無關）：目的資料夾下的路徑集合
//           必須恰等於參考，而且每個 blob 的位元必須等於凍結值（直接讀物件庫，不經 checkout、也不經候選的管線）；
//           整棵 tree 的路徑必須是可列印 ASCII，且不得有 symlink、只差大小寫的路徑或 .gitattributes。
//           本機檔案系統不分大小寫（且會做 Unicode 折疊）時，這些差異在工作樹與 _site 上是看不到的。
//
// Exit code（讓三種失敗層級可機器判讀；任何非 0 都必須阻擋發佈）：
//   0 PASS
//   1 ORACLE MISMATCH     組裝成功，但 _site/<dest> 與凍結參考不符；或候選 tree 在目的資料夾下的路徑集合／blob 位元與參考不符
//   2 INELIGIBLE          早期可發佈性檢查拒絕（freeze），或 verify 對參考清單重新斷言名稱政策時拒絕
//   3 PIPELINE REJECTION  候選自己被 git 層或管線拒絕：tree 含非 ASCII 路徑／symlink／只差大小寫的路徑（在 checkout 前就停）、
//                         git checkout 失敗／不乾淨、repo 發佈管線非 0（以上都沒走到比對）；或位元在本機相符、
//                         但候選 tree 內有 .gitattributes（其他平台的 checkout 可能不同，不得接受）
//   4 CANNOT VERIFY       輸入／綁定／執行環境錯誤（含輸出路徑已存在、clone 失敗——包括 git 在接收時判定物件格式不合法——
//                         或候選 commit 無法從 branch／HEAD 到達、checkout 後的 HEAD 不是候選、Node pin 不符、
//                         git 設定非隔離、git 步驟或管線步驟被中止或逾時），
//                         或任何無法完成驗證的情況
// exit 1 只有在最後一行同時是 `PUBLICATION-ORACLE VERIFY: FAIL …` 時才代表 oracle 的判定（Node 自身啟動失敗也是 1）。
// 這個檔案被 import 時不會執行任何檢查、也不設定 exit code：判定只來自直接執行的 CLI。
//
// 只用 Node 內建模組與本機 git；不連網、不呼叫模型、不需要祕密。本機組裝比對「不」證明未來 hosted
// 部署的位元（見 docs/publication-oracle.md 的限制）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TOOL = 'ai-arena-publication-oracle/5'; // 5 = 經審查的第四版 + B4-1（暫存目錄一律檢查）；manifest 格式不變
export const MANIFEST_FORMAT = 'ai-arena-publication-manifest/1';
export const EXIT = Object.freeze({ PASS: 0, MISMATCH: 1, INELIGIBLE: 2, PIPELINE: 3, CANNOT_VERIFY: 4 });

// harness 擁有的 metadata 檔名（模型輸出根目錄不得佔用，A2-1）。
export const METADATA_NAME = 'submission.json';
// Git 保留名稱：任何目錄層級都拒絕（A3-1；.gitattributes 改寫位元、.gitignore 丟檔、.git/.gitmodules 變 gitlink）。
export const RESERVED_GIT_NAMES = Object.freeze(['.git', '.gitattributes', '.gitignore', '.gitmodules']);
// 以下兩項鏡射 repo 的 scripts/lib/publication-policy.mjs（OS_CRUFT、SAFE_SEGMENT）：組裝器會依名跳過
// OS cruft、拒絕不安全分段。這裡內嵌一份只為了及早拒絕；權威判定仍是 verify 的位元比對。
export const OS_CRUFT = Object.freeze(['.DS_Store', 'Thumbs.db']);
export const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
// 隱藏分段（以 . 開頭）：deploy job 的 actions/upload-pages-artifact 在未設 include-hidden-files 時會把
// 任何以 . 開頭的檔案／目錄排除在 Pages artifact 之外（且 .git / .github 一律排除）。那一步發生在 _site
// 組裝「之後」，本機位元比對看不到，所以只能靠名稱政策擋下（H-1；Owner 2026-11-28 核定保留，見 docs/publication-oracle.md）。
export const HIDDEN_PREFIX = '.';

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
// repo 的實際發佈序列（.github/workflows/pages.yml 的 deploy job：先 strict manifest、再封閉世界組裝器）。
const PIPELINE = Object.freeze([
  ['build-manifest --strict', ['scripts/build-manifest.mjs', '--strict']],
  ['assemble-site', ['scripts/assemble-site.mjs']],
]);

class Stop extends Error {
  constructor(gate, exitCode, message) {
    super(message);
    this.gate = gate;
    this.exitCode = exitCode;
  }
}

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// 這份原始碼自己的 SHA-256：寫進每份報告，讓每一筆證據都能綁定到「哪一版驗證器」。
export const TOOL_SHA256 = (() => {
  try { return sha256Hex(fs.readFileSync(fileURLToPath(import.meta.url))); } catch { return null; }
})();
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isSafeSegment = (s) => s !== '.' && s !== '..' && SAFE_SEGMENT.test(s);
// dest 由 harness 決定；同樣不得含隱藏分段（整個資料夾會被 hosted artifact 步驟排除）。
const isDest = (d) => {
  if (typeof d !== 'string') return false;
  const seg = d.split('/');
  return seg.length === 3 && seg[0] === 'tasks' && seg.slice(1).every((s) => isSafeSegment(s) && !s.startsWith(HIDDEN_PREFIX));
};
const DEST_RULE = '--dest must be tasks/<task>/<folder> with safe, non-hidden segments';
// 結構上合法的相對路徑：以 / 分隔、無空段、無 . / ..、無 NUL（名稱是否「可發佈」另由名稱政策判定）。
const isCanonicalRelPath = (p) =>
  typeof p === 'string' && p !== '' && !p.includes('\0') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');

// 位置檢查以檔案系統身分（device + inode）判定，不比字串：由 child 往上逐層 stat，任何一層與 parent 是同一個
// 目錄就算在裡面。字串比對會被大小寫別名（不分大小寫的檔案系統上 /x/OUT 與 /x/out 是同一個目錄）繞過。
// child 可以是尚不存在的路徑（往上找到第一個存在的層）；呼叫端傳入的都已解析過 symlink。
function isInside(parentReal, child) {
  const parent = fs.statSync(parentReal);
  for (let cur = child; ;) {
    let st = null;
    try { st = fs.statSync(cur); } catch { /* 這一層尚不存在 */ }
    if (st && st.dev === parent.dev && st.ino === parent.ino) return true;
    const up = path.dirname(cur);
    if (up === cur) return false;
    cur = up;
  }
}
// git 探測用的 HOME：不需要存在（全域／系統設定已一律關閉），所以不必為它建立任何暫存目錄。
const NO_HOME = path.join(path.parse(process.cwd()).root, 'nonexistent', 'publication-oracle-home');
// 輸出路徑（manifest、報告、工作目錄）必須是「尚不存在」的新路徑：這支工具只建立新檔，絕不覆寫、重用或
// 刪除既有資料，也不跟隨既有的 symlink（含懸空的）。落點以父目錄的 realpath 定位，供後續的位置檢查使用。
function resolveNew(label, p) {
  const abs = path.resolve(p);
  let exists = true;
  try { fs.lstatSync(abs); } catch { exists = false; }
  if (exists) throw new Stop('input', EXIT.CANNOT_VERIFY, `${label} already exists (existing data is never overwritten, reused or deleted): ${abs}`);
  return path.join(mustRealpath(`parent directory of ${label}`, path.dirname(abs)), path.basename(abs));
}
function mustRealpath(label, p) {
  try { return fs.realpathSync(p); } catch (err) {
    throw new Stop('input', EXIT.CANNOT_VERIFY, `${label} ${JSON.stringify(p)} cannot be resolved (${err.code ?? err.message})`);
  }
}
function entryType(st) {
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isDirectory()) return 'directory';
  if (st.isFIFO()) return 'fifo';
  if (st.isSocket()) return 'socket';
  if (st.isCharacterDevice()) return 'char-device';
  if (st.isBlockDevice()) return 'block-device';
  return 'unknown';
}

// 以 O_NOFOLLOW 開檔、fstat 確認一般檔、分塊讀取雜湊；讀到的位元數必須等於 fstat 的大小。
function readRegularNoFollow(abs, { keep = false } = {}) {
  const fd = fs.openSync(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); // NONBLOCK：FIFO 不會卡住，下面的 fstat 會拒絕它
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw new Error(`not a regular file: ${abs}`);
    const hash = crypto.createHash('sha256');
    const chunk = Buffer.allocUnsafe(1 << 16);
    const kept = keep ? [] : null;
    let total = 0;
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (n === 0) break;
      hash.update(chunk.subarray(0, n));
      if (kept) kept.push(Buffer.from(chunk.subarray(0, n)));
      total += n;
    }
    if (total !== st.size) throw new Error(`file size changed while reading: ${abs}`);
    return { bytes: total, sha256: hash.digest('hex'), buffer: kept ? Buffer.concat(kept) : undefined };
  } finally {
    fs.closeSync(fd);
  }
}

// 獨立枚舉：lstat（不跟隨 symlink）遞迴走訪，不跳過任何名稱（含隱藏檔與 OS cruft）。freeze 盤點模型輸出、
// verify 枚舉 _site/<dest> 都用它；它不重用也不信任組裝器自己的枚舉或自我比對。
export function inventory(rootAbs) {
  if (!fs.lstatSync(rootAbs).isDirectory()) throw new Error(`not a directory (no-follow): ${rootAbs}`);
  const files = [];
  const emptyDirectories = [];
  const nonRegular = [];
  const walk = (dirAbs, rel) => {
    const names = fs.readdirSync(dirAbs).sort(byCodeUnit);
    if (rel !== '' && names.length === 0) emptyDirectories.push(rel);
    for (const name of names) {
      const abs = path.join(dirAbs, name);
      const relPath = rel === '' ? name : `${rel}/${name}`;
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) walk(abs, relPath);
      else if (st.isFile()) {
        const { bytes, sha256 } = readRegularNoFollow(abs);
        files.push({ path: relPath, bytes, sha256 });
      } else nonRegular.push({ path: relPath, type: entryType(st) });
    }
  };
  walk(rootAbs, '');
  files.sort((a, b) => byCodeUnit(a.path, b.path));
  emptyDirectories.sort(byCodeUnit);
  nonRegular.sort((a, b) => byCodeUnit(a.path, b.path));
  return { files, emptyDirectories, nonRegular };
}

// 名稱政策（純函式）。每個路徑分段至多歸入一條規則（依下列優先序）；違規以「到該分段為止的前綴」回報，
// 方便去重（內嵌 repo 的 .git/ 底下有幾十個檔，只需回報一次 vendor/.git）。
// 保留名稱以不分大小寫比對：封裝機器（macOS）的檔案系統不分大小寫，`.GIT` / `Submission.json` 在那裡
// 等同保留名稱；寧可多拒。OS cruft 則與組裝器一致，採完全相符（組裝器只會依這兩個確切名稱跳過）。
function segmentRule(segment) {
  if (RESERVED_GIT_NAMES.includes(segment.toLowerCase())) return 'reserved-git-name';
  if (OS_CRUFT.includes(segment)) return 'os-cruft';
  if (!isSafeSegment(segment)) return 'unsafe-segment';
  if (segment.startsWith(HIDDEN_PREFIX)) return 'hidden-segment';
  return null;
}
export function namePolicyViolations(relPath) {
  const out = [];
  const segments = relPath.split('/');
  if (segments[0].toLowerCase() === METADATA_NAME) out.push({ rule: 'reserved-metadata-name', path: segments[0] });
  segments.forEach((segment, i) => {
    const rule = segmentRule(segment);
    if (rule) out.push({ rule, path: segments.slice(0, i + 1).join('/') });
  });
  return out;
}
const byPathThenRule = (a, b) => byCodeUnit(a.path, b.path) || byCodeUnit(a.rule, b.rule);
// 對一組路徑套用名稱政策：去重、排序。
export function policyViolations(relPaths) {
  const seen = new Map();
  for (const p of relPaths) for (const v of namePolicyViolations(p)) seen.set(`${v.rule}\0${v.path}`, v);
  return [...seen.values()].sort(byPathThenRule);
}

// 隔離的子行程環境：只給白名單變數。全域／系統 git 設定（filter driver、全域 ignore／attributes、hooks）
// 一律不讀；也不帶 ARENA_ROOT / NODE_OPTIONS / NODE_PATH（build-manifest 會依 ARENA_ROOT 改根目錄）。
// TMPDIR（B4-1）：子行程絕不會拿到「未經檢查」的 TMPDIR。verify 通過輸入階段之後傳入已通過位置檢查的暫存目錄
// （tmpDir），git 與候選管線的子行程用到的就是那一個目錄。沒有傳入 tmpDir 的呼叫（freeze 的 check-ignore、verify 在
// 定出 repo 邊界之前的三個唯讀探測）完全不帶 TMPDIR：這些 git 指令本身不需要暫存目錄，而 macOS 的 git 是 xcrun 的
// 轉接程式，它在取不到系統的使用者暫存目錄時（例如在沙箱內）會把快取檔 xcrun_db 寫進 $TMPDIR——不能讓它寫進
// 呼叫端指定、尚未檢查的位置（可能就在候選 repo 或模型輸出目錄內）。
export function hermeticEnv(homeDir, tmpDir = null) {
  const env = {
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? '/usr/bin:/bin'}`,
    HOME: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: os.devNull,
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1', // refs/replace 不得把候選換成別的物件
    GIT_OPTIONAL_LOCKS: '0', // 唯讀指令不做順手的 index 重寫（驗證器絕不寫入候選 repo）
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
    TZ: 'UTC',
  };
  if (tmpDir !== null) env.TMPDIR = tmpDir;
  return env;
}
// 命令列層級（優先於任何 local 設定）關閉可執行設定：hooks、fsmonitor、自動 gc。
export const GIT_SAFE = Object.freeze([
  '-c', `core.hooksPath=${os.devNull}`,
  '-c', 'core.fsmonitor=false',
  '-c', 'gc.auto=0',
  '-c', 'advice.detachedHead=false',
]);

function run(cmd, args, { cwd, env, input, timeoutMs = 120000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs });
  return { status: r.status, signal: r.signal, error: r.error ? String(r.error.message) : null, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
// 子行程輸出的最後一行；控制字元（含 CR）一律換成 ?，候選的管線輸出不能在我們的輸出中偽造出另一行。
export const lastLine = (s) => (s.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '?');

// git 失敗時的 error:／fatal: 行（控制字元換成 ?；最多 400 字元）。沒有這類行時退回最後一行。
const errorLines = (s) => s.split('\n').map((l) => l.trim()).filter((l) => /^(error|fatal):/.test(l)).join(' | ').replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 400) || lastLine(s);

// 目的路徑是否被 repo 的 ignore 規則命中（S-1：被 ignore 的檔會在 git add 時靜默消失）。
// 以 `git check-ignore --no-index` 判定（路徑不需存在）；絕不在模型輸出目錄內執行 git。
function ignoredByRepo(repoAbs, dest, relPaths, env) {
  const input = relPaths.map((p) => `${dest}/${p}\0`).join('');
  const r = run('git', [...GIT_SAFE, '-C', repoAbs, 'check-ignore', '--no-index', '-v', '-z', '--stdin'], { env, input });
  if (r.status !== 0 && r.status !== 1) {
    throw new Stop('input', EXIT.CANNOT_VERIFY, `git check-ignore failed (exit ${r.status ?? r.signal}): ${lastLine(r.stderr)}`);
  }
  const fields = r.stdout.split('\0'); // <source> NUL <linenum> NUL <pattern> NUL <pathname> NUL …
  const out = [];
  for (let i = 0; i + 3 < fields.length; i += 4) {
    const [source, line, pattern, pathname] = fields.slice(i, i + 4);
    if (pattern.startsWith('!')) continue; // 否定樣式 = 明確不忽略
    out.push({ rule: 'ignored-by-repo', path: pathname.slice(dest.length + 1), detail: `${source}:${line}:${pattern}` });
  }
  return out;
}

// 早期可發佈性檢查（rev.4 X-4(a) + Git 保留名稱 + 隱藏分段）。回傳全部違規；不改名、不刪檔、不修補。
export function checkEligibility(inv, { dest, repo, env }) {
  const entries = [...inv.files.map((f) => f.path), ...inv.emptyDirectories, ...inv.nonRegular.map((e) => e.path)];
  const violations = policyViolations(entries);
  for (const e of inv.nonRegular) violations.push({ rule: 'non-regular-entry', path: e.path, detail: e.type });
  violations.push(...ignoredByRepo(repo, dest, inv.files.map((f) => f.path), env));
  return violations.sort(byPathThenRule);
}

export function buildManifest(inv, dest) {
  return {
    format: MANIFEST_FORMAT,
    dest,
    files: inv.files.map(({ path: p, bytes, sha256 }) => ({ path: p, bytes, sha256 })),
    emptyDirectories: [...inv.emptyDirectories],
  };
}
export const serializeManifest = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

// 嚴格解析凍結 manifest：鍵集合固定、路徑已排序且不重複、且位元必須是 canonical 序列化
// （排除重複鍵等 JSON 歧義；位元本身再由呼叫端提供的 sha256 pin 綁定）。
export function parseManifest(buf) {
  let m;
  try { m = JSON.parse(buf.toString('utf8')); } catch { throw new Error('not valid JSON'); }
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw new Error('top level must be an object');
  if (Object.keys(m).join(',') !== 'format,dest,files,emptyDirectories') throw new Error('unexpected top-level keys');
  if (m.format !== MANIFEST_FORMAT) throw new Error(`unsupported format ${JSON.stringify(m.format)}`);
  if (!isDest(m.dest)) throw new Error('dest must be tasks/<task>/<folder>');
  if (!Array.isArray(m.files) || !Array.isArray(m.emptyDirectories)) throw new Error('files / emptyDirectories must be arrays');
  let prev = null;
  for (const f of m.files) {
    if (f === null || typeof f !== 'object' || Object.keys(f).join(',') !== 'path,bytes,sha256') throw new Error('file entry must be {path, bytes, sha256}');
    if (!isCanonicalRelPath(f.path)) throw new Error(`non-canonical path ${JSON.stringify(f.path)}`);
    if (!Number.isSafeInteger(f.bytes) || f.bytes < 0) throw new Error(`invalid bytes for ${f.path}`);
    if (typeof f.sha256 !== 'string' || !SHA256_HEX.test(f.sha256)) throw new Error(`invalid sha256 for ${f.path}`);
    if (prev !== null && !(prev < f.path)) throw new Error('files must be strictly sorted by path (no duplicates)');
    prev = f.path;
  }
  if (!m.emptyDirectories.every(isCanonicalRelPath)) throw new Error('non-canonical emptyDirectories entry');
  if (!Buffer.from(serializeManifest(m)).equals(buf)) throw new Error('not in canonical serialized form');
  return m;
}

// 比對（純函式）：預期 = 凍結清單的每個檔 + harness metadata；實際 = 對 _site/<dest> 的獨立枚舉。
// 以「期望清單」而非 map 判定：清單若含根 submission.json，模型檔期望與 metadata 期望各自獨立成立。
export function compareTrees(expectedFiles, metadataBuf, actual) {
  const actualByPath = new Map(actual.files.map((f) => [f.path, f]));
  const expectedPaths = new Set(expectedFiles.map((f) => f.path));
  expectedPaths.add(METADATA_NAME);
  const missing = [];
  const sizeMismatch = [];
  const hashMismatch = [];
  for (const e of expectedFiles) {
    const a = actualByPath.get(e.path);
    if (!a) { missing.push(e.path); continue; }
    if (a.bytes !== e.bytes) sizeMismatch.push({ path: e.path, expected: e.bytes, actual: a.bytes });
    if (a.sha256 !== e.sha256) hashMismatch.push({ path: e.path, expected: e.sha256, actual: a.sha256 });
  }
  const meta = actualByPath.get(METADATA_NAME);
  const metadata = {
    present: Boolean(meta),
    equal: Boolean(meta) && Buffer.isBuffer(actual.metadataBytes) && actual.metadataBytes.equals(metadataBuf),
    expectedBytes: metadataBuf.length,
    expectedSha256: sha256Hex(metadataBuf),
    actualBytes: meta ? meta.bytes : null,
    actualSha256: meta ? meta.sha256 : null,
  };
  const extra = actual.files.map((f) => f.path).filter((p) => !expectedPaths.has(p));
  const otherEntries = [
    ...actual.nonRegular,
    ...actual.emptyDirectories.map((p) => ({ path: p, type: 'empty-directory' })),
  ];
  const match = actual.present && missing.length === 0 && extra.length === 0 && sizeMismatch.length === 0
    && hashMismatch.length === 0 && otherEntries.length === 0 && metadata.present && metadata.equal;
  return {
    status: match ? 'match' : 'mismatch',
    destPresent: actual.present,
    expectedFiles: expectedPaths.size,
    actualFiles: actual.files.length,
    missing, extra, sizeMismatch, hashMismatch, metadata, otherEntries,
  };
}

// 由 _site 根往下逐段 lstat（每段都必須是實體目錄），再獨立枚舉 dest；另讀回 metadata 位元供逐位元比對。
// 每一段的名稱都必須「逐字」出現在上一層的 readdir 結果中：不靠檔案系統把大小寫不同的名稱當成同一個。
export function enumerateDest(siteAbs, dest) {
  let cur = siteAbs;
  const absent = { present: false, files: [], emptyDirectories: [], nonRegular: [], metadataBytes: null };
  for (const seg of dest.split('/')) {
    if (!fs.readdirSync(cur).includes(seg)) return absent;
    cur = path.join(cur, seg);
    const st = fs.lstatSync(cur);
    if (!st.isDirectory()) {
      return { present: false, files: [], emptyDirectories: [], nonRegular: [{ path: path.relative(siteAbs, cur), type: entryType(st) }], metadataBytes: null };
    }
  }
  const inv = inventory(cur);
  const hasMeta = inv.files.some((f) => f.path === METADATA_NAME);
  const metadataBytes = hasMeta ? readRegularNoFollow(path.join(cur, METADATA_NAME), { keep: true }).buffer : null;
  return { present: true, ...inv, metadataBytes };
}

// 候選 commit 的 git tree 分析（純函式）。tree 的路徑區分大小寫、與本機檔案系統無關，所以這裡看得到
// 「不分大小寫的 checkout」會合併或隱藏的差異。entries = [{ mode, oid, path }]（git ls-tree -r 的結果）。
// nonAscii：含非可列印 ASCII 字元的路徑。這類名稱在本機檔案系統上的折疊規則（例如 APFS 把 ſ 視為 s、ß 視為 ss）
// 比任何我們能在這裡重現的規則都廣，所以呼叫端一律拒絕；路徑全為 ASCII 之後，下面的大小寫碰撞與
// .gitattributes 檢查（都以 ASCII 小寫比較）才是完備的。
export function analyzeTree(entries, dest, expectedPaths) {
  const nonAscii = entries.filter((e) => /[^\x20-\x7e]/.test(e.path)).map((e) => e.path).sort(byCodeUnit);
  const symlinks = entries.filter((e) => e.mode === '120000').map((e) => e.path).sort(byCodeUnit);
  const gitattributes = entries.filter((e) => e.path.split('/').pop().toLowerCase() === '.gitattributes').map((e) => e.path).sort(byCodeUnit);
  const fold = (p) => p.normalize('NFC').toLowerCase();
  const seen = new Map();
  const collisions = new Set();
  for (const e of entries) {
    const segments = e.path.split('/');
    for (let i = 1; i <= segments.length; i += 1) { // 檔案與每一層目錄前綴都要檢查
      const prefix = segments.slice(0, i).join('/');
      const first = seen.get(fold(prefix));
      if (first === undefined) seen.set(fold(prefix), prefix);
      else if (first !== prefix) collisions.add([first, prefix].sort(byCodeUnit).join(' <> '));
    }
  }
  const under = entries.filter((e) => e.path.startsWith(`${dest}/`)).map((e) => ({ mode: e.mode, oid: e.oid, path: e.path.slice(dest.length + 1) }));
  const actual = new Set(under.map((e) => e.path));
  const expected = new Set(expectedPaths);
  const missing = [...expected].filter((p) => !actual.has(p)).sort(byCodeUnit);
  const extra = [...actual].filter((p) => !expected.has(p)).sort(byCodeUnit);
  const isBlob = (e) => e.mode === '100644' || e.mode === '100755';
  const nonBlob = under.filter((e) => !isBlob(e)).map((e) => ({ mode: e.mode, path: e.path })).sort((a, b) => byCodeUnit(a.path, b.path));
  return {
    entries: entries.length, nonAscii, symlinks, caseCollisions: [...collisions].sort(byCodeUnit), gitattributes,
    dest: { expected: expected.size, actual: actual.size, missing, extra, nonBlob, match: missing.length === 0 && extra.length === 0 && nonBlob.length === 0 },
    destBlobs: under.filter((e) => isBlob(e) && expected.has(e.path)).map((e) => ({ path: e.path, oid: e.oid })), // 供呼叫端做位元綁定；不寫進報告
  };
}
const parseLsTree = (z) => z.split('\0').filter(Boolean).map((rec) => {
  const tab = rec.indexOf('\t');
  const [mode, , oid] = rec.slice(0, tab).split(' ');
  return { mode, oid, path: rec.slice(tab + 1) };
});

// ───────────────────────────── freeze ─────────────────────────────

export function freeze(opts) {
  const report = { tool: TOOL, toolSha256: TOOL_SHA256, command: 'freeze', verdict: 'REJECTED', exitCode: EXIT.CANNOT_VERIFY, dest: opts.dest ?? null, files: null, bytes: null, manifestSha256: null, violations: [], emptyDirectories: [], inventory: null, messages: [], reportFile: null };
  try {
    for (const k of ['output', 'dest', 'repo', 'out']) {
      if (typeof opts[k] !== 'string' || opts[k] === '') throw new Stop('input', EXIT.CANNOT_VERIFY, `missing required option --${k}`);
    }
    const outputReal = mustRealpath('--output', opts.output);
    if (!fs.statSync(outputReal).isDirectory()) throw new Stop('input', EXIT.CANNOT_VERIFY, '--output must be a directory (the model output directory)');
    // 凍結工具絕不寫入模型輸出目錄（報告與 manifest 都一樣）；報告路徑通過檢查後才會被寫入。
    const notInOutput = (label, p) => {
      if (isInside(outputReal, p)) throw new Stop('input', EXIT.CANNOT_VERIFY, `${label} must not be written inside the model output directory`);
      return p;
    };
    if (opts.report) report.reportFile = notInOutput('--report', resolveNew('--report', opts.report));
    if (!isDest(opts.dest)) throw new Stop('input', EXIT.CANNOT_VERIFY, DEST_RULE);
    const repoReal = mustRealpath('--repo', opts.repo);
    const outFile = notInOutput('--out', resolveNew('--out', opts.out));
    if (report.reportFile === outFile) { report.reportFile = null; throw new Stop('input', EXIT.CANNOT_VERIFY, '--out and --report must be different files'); }
    // 步驟 1：先盤點（含隱藏檔）；完整清單一律寫進報告，即使接下來被判定不可發佈。
    const inv = inventory(outputReal);
    report.inventory = inv;
    report.files = inv.files.length;
    report.bytes = inv.files.reduce((n, f) => n + f.bytes, 0);
    report.emptyDirectories = inv.emptyDirectories;
    report.violations = checkEligibility(inv, { dest: opts.dest, repo: repoReal, env: hermeticEnv(NO_HOME) });
    if (report.violations.length > 0) {
      report.exitCode = EXIT.INELIGIBLE;
    } else {
      const text = serializeManifest(buildManifest(inv, opts.dest));
      fs.writeFileSync(outFile, text, { flag: 'wx' });
      report.manifestSha256 = sha256Hex(Buffer.from(text));
      report.verdict = 'OK';
      report.exitCode = EXIT.PASS;
    }
  } catch (err) {
    report.verdict = 'REJECTED';
    report.exitCode = err instanceof Stop ? err.exitCode : EXIT.CANNOT_VERIFY;
    report.messages.push(err instanceof Stop ? err.message : `internal error: ${err.stack ?? err}`);
  }
  return report;
}

function printFreeze(report) {
  const out = [`publication-oracle freeze  dest=${report.dest}`, `  tool: ${report.tool} sha256=${report.toolSha256}`];
  for (const m of report.messages) out.push(`  error: ${m}`);
  for (const v of report.violations) out.push(`  INELIGIBLE ${v.rule}: ${JSON.stringify(v.path)}${v.detail ? ` (${v.detail})` : ''}`);
  for (const d of report.emptyDirectories) out.push(`  note: empty directory cannot be carried by git or published: ${JSON.stringify(d)}`);
  if (report.exitCode === EXIT.PASS) {
    out.push(`PUBLICATION-ORACLE FREEZE: OK files=${report.files} bytes=${report.bytes} manifest-sha256=${report.manifestSha256}`);
  } else {
    out.push(`PUBLICATION-ORACLE FREEZE: REJECTED exit=${report.exitCode} violations=${report.violations.length}`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

// ───────────────────────────── verify ─────────────────────────────

export function verify(opts) {
  const st = {
    input: { status: 'not-run' },
    referencePolicy: { status: 'not-run', violations: [] },
    checkout: { status: 'not-run' },
    tree: { status: 'not-run' },
    runtime: { status: 'not-run' },
    pipeline: { status: 'not-run', steps: [] },
    compare: { status: 'not-run' },
  };
  const report = {
    tool: TOOL, toolSha256: TOOL_SHA256, command: 'verify', verdict: 'FAIL', exitCode: EXIT.CANNOT_VERIFY, failingGate: 'internal',
    candidate: opts.candidate ?? null, candidateTree: null, dest: opts.dest ?? null,
    reference: { manifestSha256: opts.manifestSha256 ?? null, metadataSha256: opts.metadataSha256 ?? null, files: null },
    runtime: { node: process.versions.node, git: null, platform: `${process.platform}-${process.arch}` },
    stages: st, messages: [], reportFile: null,
  };
  let workDir = null;
  let stage = 'input';
  try {
    // 1. 輸入與綁定：確切 40-hex 候選、dest、兩個凍結參考的位元 pin、參考的獨立性（不得取自候選）。
    st.input.status = 'failed';
    for (const k of ['manifest', 'manifestSha256', 'metadata', 'metadataSha256', 'repo', 'candidate', 'dest']) {
      if (typeof opts[k] !== 'string' || opts[k] === '') throw new Stop('input', EXIT.CANNOT_VERIFY, `missing required option for ${k}`);
    }
    const repoReal = mustRealpath('--repo', opts.repo);
    // 先定出候選 repo 的邊界：驗證器絕不寫入其中（報告、工作目錄），凍結參考也不得位於其中。
    // 邊界 = --repo 本身、它的工作樹頂層、共用的 git 目錄、以及同一個 repo 的其他 linked worktree。
    const probe = (args) => run('git', [...GIT_SAFE, '-C', repoReal, ...args], { env: hermeticEnv(NO_HOME) });
    const boundaries = [repoReal];
    const addBoundary = (p) => { try { boundaries.push(fs.realpathSync(path.resolve(repoReal, p))); } catch { /* 不存在的路徑不構成邊界 */ } };
    for (const args of [['rev-parse', '--show-toplevel'], ['rev-parse', '--git-common-dir']]) {
      const r0 = probe(args);
      if (r0.status === 0 && r0.stdout.trim()) addBoundary(r0.stdout.trim());
    }
    const worktrees = probe(['worktree', 'list', '--porcelain']);
    if (worktrees.status === 0) for (const l of worktrees.stdout.split('\n')) if (l.startsWith('worktree ')) addBoundary(l.slice(9));
    const outsideRepo = (label, p, why) => {
      if (boundaries.some((b) => isInside(b, p))) throw new Stop('input', EXIT.CANNOT_VERIFY, `${label} ${why}`);
      return p;
    };
    const neverWrite = 'must be outside the candidate repository (the verifier never writes into it)';
    if (opts.report) report.reportFile = outsideRepo('--report', resolveNew('--report', opts.report), neverWrite);
    const workTarget = opts.work ? outsideRepo('--work', resolveNew('--work', opts.work), neverWrite) : null;
    if (workTarget !== null && workTarget === report.reportFile) { report.reportFile = null; throw new Stop('input', EXIT.CANNOT_VERIFY, '--work and --report must be different paths'); }
    // 暫存目錄一律檢查，不論是否指定 --work（B4-1）。沒有 --work 時工作目錄建在它底下；指定了 --work 時，git 與候選
    // 管線的子行程仍會在 TMPDIR 建立暫存檔，所以它同樣不得位於候選 repo 的邊界之內。先解析 symlink 與相對路徑，再以
    // device+inode 判定（與 --work／--report 相同），別名因此同樣被拒絕；無法解析的暫存目錄一律是無法驗證（exit 4）。
    // 到這裡為止只執行過上面三個定邊界用的唯讀探測，而它們不帶 TMPDIR（見 hermeticEnv）。
    const tmpRoot = outsideRepo('the temporary directory (TMPDIR)', mustRealpath('the temporary directory', os.tmpdir()), 'is inside the candidate repository; point TMPDIR elsewhere (neither the verifier nor the processes it starts may write into it)');

    if (!SHA40.test(opts.candidate)) throw new Stop('input', EXIT.CANNOT_VERIFY, '--candidate must be a full 40-hex commit SHA (no abbreviation, ref name or HEAD)');
    if (!isDest(opts.dest)) throw new Stop('input', EXIT.CANNOT_VERIFY, DEST_RULE);
    if (!SHA256_HEX.test(opts.manifestSha256) || !SHA256_HEX.test(opts.metadataSha256)) throw new Stop('input', EXIT.CANNOT_VERIFY, 'sha256 pins must be 64 lowercase hex characters');
    const notFromCandidate = 'lives inside the candidate repository; the frozen reference must not be derived from the candidate';
    const manifestReal = outsideRepo('--manifest', mustRealpath('--manifest', opts.manifest), notFromCandidate);
    const metadataReal = outsideRepo('--metadata', mustRealpath('--metadata', opts.metadata), notFromCandidate);
    const readReference = (label, file) => {
      try { return readRegularNoFollow(file, { keep: true }).buffer; } catch (err) {
        throw new Stop('input', EXIT.CANNOT_VERIFY, `${label} is not a readable regular file (${err.code ?? err.message})`);
      }
    };
    const manifestBuf = readReference('--manifest', manifestReal);
    if (sha256Hex(manifestBuf) !== opts.manifestSha256) throw new Stop('input', EXIT.CANNOT_VERIFY, 'manifest bytes do not match --manifest-sha256 (not the frozen reference)');
    let manifest;
    try { manifest = parseManifest(manifestBuf); } catch (err) { throw new Stop('input', EXIT.CANNOT_VERIFY, `invalid manifest: ${err.message}`); }
    if (manifest.dest !== opts.dest) throw new Stop('input', EXIT.CANNOT_VERIFY, `manifest is frozen for ${manifest.dest}, not ${opts.dest}`);
    const metadataBuf = readReference('--metadata', metadataReal);
    if (sha256Hex(metadataBuf) !== opts.metadataSha256) throw new Stop('input', EXIT.CANNOT_VERIFY, 'metadata bytes do not match --metadata-sha256 (not the frozen reference)');
    report.reference.files = manifest.files.length;

    if (workTarget) { fs.mkdirSync(workTarget); workDir = workTarget; } else {
      workDir = fs.realpathSync(fs.mkdtempSync(path.join(tmpRoot, 'publication-oracle-')));
    }
    const home = path.join(workDir, 'home');
    fs.mkdirSync(home);
    const env = hermeticEnv(home, tmpRoot); // 子行程的 TMPDIR = 上面檢查過的那一個目錄（已解析），不是未經檢查的原字串
    const git = (args, o = {}) => run('git', [...GIT_SAFE, ...args], { env, ...o });
    const gv = git(['--version']);
    if (gv.status !== 0) throw new Stop('input', EXIT.CANNOT_VERIFY, `git is not available: ${gv.error ?? lastLine(gv.stderr)}`);
    report.runtime.git = gv.stdout.trim();
    const resolved = git(['-C', repoReal, 'rev-parse', '--verify', '--quiet', `${opts.candidate}^{commit}`]);
    if (resolved.status !== 0 || resolved.stdout.trim() !== opts.candidate) {
      throw new Stop('input', EXIT.CANNOT_VERIFY, `candidate ${opts.candidate} is not a commit in --repo`);
    }
    st.input.status = 'ok';

    // 2. 對參考清單重新斷言名稱政策（保留名稱永遠拿不到 PASS）。違規不中止：後面的位元比對仍獨立計算並回報。
    const refViolations = policyViolations([...manifest.files.map((f) => f.path), ...manifest.emptyDirectories]);
    st.referencePolicy = { status: refViolations.length ? 'violation' : 'ok', violations: refViolations };

    // 3. 乾淨 checkout 確切候選 SHA：全新 clone（無 template → 無 hooks）、隔離設定、絕不遞迴 submodule。
    //    --no-local：走一般傳輸（upload-pack → index-pack）而不是直接複製物件檔，所以每個物件的名稱都由
    //    接收端依內容重新計算（候選 SHA → tree → blob 的雜湊綁定由 git 實際驗證），也只會收到從 branch／
    //    HEAD 可達的 commit；候選若只存在於物件庫（不可達）或只被 tag 指到，就不會被傳輸 → 無法驗證。
    //    fetch.fsckObjects：接收時由 git 自己檢查每個物件的格式。格式不合法的 tree（例如同一個名稱列了兩次，
    //    git ls-tree 與 checkout 對它的解讀可能不同）會被拒收 → 無法驗證。
    stage = 'checkout';
    st.checkout.status = 'failed';
    const checkout = path.join(workDir, 'checkout');
    let r = git(['-c', 'fetch.fsckObjects=true', 'clone', '--quiet', '--no-local', '--no-checkout', '--no-tags', '--template=', '--', repoReal, checkout]);
    if (r.status !== 0) throw new Stop('checkout', EXIT.CANNOT_VERIFY, `git clone failed (exit ${r.status ?? r.signal}): ${errorLines(r.stderr)}`);
    if (git(['-C', checkout, 'cat-file', '-e', `${opts.candidate}^{commit}`]).status !== 0) {
      throw new Stop('checkout', EXIT.CANNOT_VERIFY, 'git clone did not transfer the candidate commit (it must be reachable from a branch or HEAD of --repo)');
    }
    // 在 checkout「之前」確認 git 設定是隔離的：checkout 才是會套用 .gitattributes 轉換的步驟，
    // 所以必須先證明此時看得到的設定只有新 clone 的 local 設定與本工具的命令列設定（沒有任何 filter driver）。
    const scopes = git(['-C', checkout, 'config', '--list', '--show-scope', '--name-only']);
    const scopeSet = [...new Set(scopes.stdout.split('\n').filter(Boolean).map((l) => l.split('\t')[0]))].sort();
    if (scopes.status !== 0 || scopeSet.length === 0 || scopeSet.some((s) => s !== 'local' && s !== 'command')) {
      throw new Stop('checkout', EXIT.CANNOT_VERIFY, `git configuration is not hermetic (scopes: ${scopeSet.join(', ') || 'unknown'})`);
    }
    st.checkout.status = 'cloned';

    // 3b. 候選的 git tree：在 checkout 與管線「之前」直接檢查（物件已由接收端重新雜湊）。
    //     非 ASCII 路徑：本機檔案系統對這類名稱的折疊（大小寫、Unicode 正規化）無法在這裡重現 → 無從驗證。
    //     symlink：repo 的管線會寫入 tasks.json，commit 成 symlink 的話會寫穿到 checkout 之外 → 絕不執行管線。
    //     只差大小寫的路徑：不分大小寫的 checkout 無法忠實呈現這棵 tree → 無從驗證。
    //     以上三種在這裡就停止（exit 3）。目的資料夾的路徑集合、blob 位元與 .gitattributes 的結果留到最後的判定
    //     （讓 _site 的位元比對照常執行並回報）。
    stage = 'tree';
    st.tree.status = 'failed';
    const lt = git(['-C', checkout, 'ls-tree', '-r', '-z', '--full-tree', `${opts.candidate}^{commit}`]); // ^{commit}：只當成物件名稱，不當成 ref 名稱
    if (lt.status !== 0) throw new Stop('tree', EXIT.CANNOT_VERIFY, `git ls-tree failed (exit ${lt.status ?? lt.signal}): ${lastLine(lt.stderr)}`);
    const { destBlobs, ...tree } = analyzeTree(parseLsTree(lt.stdout), opts.dest, [...manifest.files.map((f) => f.path), METADATA_NAME]);
    tree.dest.blobMismatch = [];
    Object.assign(st.tree, tree);
    const some = (list) => `${list.slice(0, 5).map((p) => JSON.stringify(p)).join(', ')}${list.length > 5 ? `, … (${list.length} in total)` : ''}`;
    if (tree.nonAscii.length > 0) {
      st.tree.status = 'rejected';
      throw new Stop('tree', EXIT.PIPELINE, `the candidate tree contains paths with non-ASCII or control characters; how this filesystem folds such names cannot be modelled here, so the tree cannot be verified: ${some(tree.nonAscii)}`);
    }
    if (tree.symlinks.length > 0) {
      st.tree.status = 'rejected';
      throw new Stop('tree', EXIT.PIPELINE, `the candidate tree contains symlink entries; the repository pipeline is not run on it: ${some(tree.symlinks)}`);
    }
    if (tree.caseCollisions.length > 0) {
      st.tree.status = 'rejected';
      throw new Stop('tree', EXIT.PIPELINE, `the candidate tree contains paths that differ only in letter case; a case-insensitive checkout cannot represent it: ${some(tree.caseCollisions)}`);
    }
    // 位元綁定（tree 層）：目的資料夾下每個預期路徑的 blob 必須等於凍結值——manifest 的長度與 SHA-256；submission.json
    // 另須逐位元等於凍結的 harness metadata。內容直接取自物件庫（已由接收端重新雜湊），不經 checkout、不經候選的管線。
    const wanted = new Map(manifest.files.map((f) => [f.path, f]));
    for (const b of destBlobs) {
      const out = spawnSync('git', [...GIT_SAFE, '-C', checkout, 'cat-file', 'blob', b.oid], { env, maxBuffer: 1024 * 1024 * 1024, timeout: 120000 });
      if (out.status !== 0 || !Buffer.isBuffer(out.stdout)) throw new Stop('tree', EXIT.CANNOT_VERIFY, `cannot read the blob of ${JSON.stringify(b.path)} (${b.oid}) from the candidate`);
      const actual = sha256Hex(out.stdout);
      const want = wanted.get(b.path);
      if (want && (out.stdout.length !== want.bytes || actual !== want.sha256)) tree.dest.blobMismatch.push({ path: b.path, against: 'manifest', expected: want.sha256, actual });
      if (b.path === METADATA_NAME && !out.stdout.equals(metadataBuf)) tree.dest.blobMismatch.push({ path: b.path, against: 'metadata', expected: sha256Hex(metadataBuf), actual });
    }
    tree.dest.match = tree.dest.match && tree.dest.blobMismatch.length === 0;
    st.tree.status = !tree.dest.match ? 'mismatch' : tree.gitattributes.length > 0 ? 'violation' : 'ok';

    // 3c. checkout 確切的候選 SHA。
    stage = 'checkout';
    st.checkout.status = 'failed';
    //     以 <sha>^{commit} 指定：git checkout 對「名稱」會優先找同名的本機 branch，候選 repo 若有一個名稱恰好是
    //     這 40 個字元的 branch，`checkout <sha>` 會切到那個 branch 指的 commit。加上 ^{commit} 就只會被當成物件名稱。
    //     git 步驟沒有 exit status（被 signal 中止或逾時）= 無法完成驗證，不是候選被拒。
    r = git(['-C', checkout, 'checkout', '--quiet', '--detach', `${opts.candidate}^{commit}`]);
    if (r.status === null) throw new Stop('checkout', EXIT.CANNOT_VERIFY, `git checkout did not complete (${r.signal ?? r.error ?? 'no exit status'})`);
    if (r.status !== 0) throw new Stop('checkout', EXIT.PIPELINE, `git checkout failed (exit ${r.status}): ${lastLine(r.stderr)}`);
    const head = git(['-C', checkout, 'rev-parse', 'HEAD']).stdout.trim();
    if (head !== opts.candidate) throw new Stop('checkout', EXIT.CANNOT_VERIFY, `checked-out HEAD ${head || '(unresolved)'} is not the candidate`);
    const treeSha = git(['-C', checkout, 'rev-parse', 'HEAD^{tree}']).stdout.trim();
    if (!SHA40.test(treeSha)) throw new Stop('checkout', EXIT.CANNOT_VERIFY, 'cannot resolve the candidate tree');
    report.candidateTree = treeSha;
    const status = git(['-C', checkout, 'status', '--porcelain=v1', '--ignored', '--untracked-files=all']);
    if (status.status === null) throw new Stop('checkout', EXIT.CANNOT_VERIFY, `git status did not complete (${status.signal ?? status.error ?? 'no exit status'})`);
    if (status.status !== 0 || status.stdout !== '') {
      throw new Stop('checkout', EXIT.PIPELINE, `checkout is not clean on this platform: ${JSON.stringify(status.stdout.slice(0, 400))}`);
    }
    st.checkout = { status: 'ok', head, tree: treeSha, clean: true, configScopes: scopeSet };

    // 4. 執行環境：管線必須以候選自己 pin 的 Node 版本執行（CI 也是由 .node-version 決定）。
    stage = 'runtime';
    st.runtime.status = 'failed';
    let pin;
    try { pin = fs.readFileSync(path.join(checkout, '.node-version'), 'utf8').trim(); } catch { throw new Stop('runtime', EXIT.CANNOT_VERIFY, 'candidate has no readable .node-version'); }
    if (pin !== process.versions.node) throw new Stop('runtime', EXIT.CANNOT_VERIFY, `running Node ${process.versions.node}, but the candidate pins ${pin}`);
    st.runtime = { status: 'ok', nodePin: pin };

    // 5. repo 的實際發佈序列（cwd = 乾淨 checkout，與 deploy job 相同順序）。任何一步非 0 → 管線拒絕。
    stage = 'pipeline';
    st.pipeline.status = 'failed';
    for (const [name, args] of PIPELINE) {
      const p = run(process.execPath, args, { cwd: checkout, env, timeoutMs: 600000 });
      st.pipeline.steps.push({ step: name, exit: p.status, signal: p.signal, stdout: lastLine(p.stdout), stderr: lastLine(p.stderr) });
      // 被 signal 中止或逾時的步驟沒有「拒絕」候選：那是無法完成驗證，不是管線的判定。
      if (p.status === null) throw new Stop('pipeline', EXIT.CANNOT_VERIFY, `${name} did not complete (${p.signal ?? p.error ?? 'no exit status'}); nothing can be concluded about the candidate`);
      if (p.status !== 0) throw new Stop('pipeline', EXIT.PIPELINE, `${name} failed (exit ${p.status}): ${lastLine(p.stderr) || lastLine(p.stdout) || ''}`);
    }
    const site = path.join(checkout, '_site');
    let siteStat = null;
    try { siteStat = fs.lstatSync(site); } catch { /* 下面一併處理 */ }
    if (!siteStat || !siteStat.isDirectory()) throw new Stop('pipeline', EXIT.PIPELINE, 'assembler exited 0 but _site is not a directory (incomplete assembly)');
    // 僅供參考、不影響判定：重生的 tasks.json 是否等於候選 commit 的版本（CI 的 validate job 會強制這一點）。
    st.pipeline.tasksJsonMatchesCommitted = git(['-C', checkout, 'diff', '--quiet', '--exit-code', '--', 'tasks.json']).status === 0;
    st.pipeline.status = 'ok';

    // 6–7. 獨立枚舉 _site/<dest>，與凍結參考比對。
    stage = 'compare';
    const cmp = compareTrees(manifest.files, metadataBuf, enumerateDest(site, opts.dest));
    st.compare = cmp;

    // 判定順序：_site 的位元比對 → tree 層級的路徑集合與 blob 位元 → 參考清單的名稱政策 → tree 內的 .gitattributes → PASS。
    if (cmp.status !== 'match') { report.exitCode = EXIT.MISMATCH; report.failingGate = 'compare'; }
    else if (!tree.dest.match) { report.exitCode = EXIT.MISMATCH; report.failingGate = 'tree'; report.messages.push('the candidate tree under the destination does not hold exactly the reference paths with the reference bytes, although the locally assembled files match'); }
    else if (refViolations.length > 0) { report.exitCode = EXIT.INELIGIBLE; report.failingGate = 'reference-policy'; }
    else if (tree.gitattributes.length > 0) { report.exitCode = EXIT.PIPELINE; report.failingGate = 'tree'; report.messages.push(`the bytes match on this machine, but the candidate tree contains .gitattributes (${some(tree.gitattributes)}); a checkout on another platform may differ, so the candidate is not accepted`); }
    else { report.exitCode = EXIT.PASS; report.failingGate = null; report.verdict = 'PASS'; }
  } catch (err) {
    report.verdict = 'FAIL';
    if (err instanceof Stop) {
      report.exitCode = err.exitCode;
      report.failingGate = err.gate;
      report.messages.push(err.message);
    } else {
      report.exitCode = EXIT.CANNOT_VERIFY;
      report.failingGate = 'internal';
      report.messages.push(`internal error during ${stage}: ${err.stack ?? err}`);
      if (st[stage] && st[stage].status !== 'ok') st[stage].status = 'failed';
    }
  } finally {
    if (workDir && !opts.keep) fs.rmSync(workDir, { recursive: true, force: true });
  }
  return report;
}

function printVerify(report) {
  const st = report.stages;
  const out = [
    `publication-oracle verify  candidate=${report.candidate} dest=${report.dest}`,
    `  tool: ${report.tool} sha256=${report.toolSha256}`,
    `  reference: manifest-sha256=${report.reference.manifestSha256} files=${report.reference.files ?? '?'} metadata-sha256=${report.reference.metadataSha256}`,
    `  runtime: node ${report.runtime.node}, ${report.runtime.git ?? 'git ?'}, ${report.runtime.platform}`,
    `  [input] ${st.input.status}`,
    `  [reference-policy] ${st.referencePolicy.status}`,
  ];
  for (const v of st.referencePolicy.violations) out.push(`      ${v.rule}: ${JSON.stringify(v.path)}`);
  const t = st.tree;
  out.push(`  [tree] ${t.status}${t.dest ? ` entries=${t.entries} dest-expected=${t.dest.expected} dest-actual=${t.dest.actual} dest-missing=${t.dest.missing.length} dest-extra=${t.dest.extra.length} dest-non-blob=${t.dest.nonBlob.length} dest-blob-mismatch=${t.dest.blobMismatch.length} non-ascii=${t.nonAscii.length} symlinks=${t.symlinks.length} case-collisions=${t.caseCollisions.length} gitattributes=${t.gitattributes.length}` : ''}`);
  if (t.dest) {
    for (const p of t.dest.missing.slice(0, 20)) out.push(`      tree missing: ${JSON.stringify(p)}`);
    for (const p of t.dest.extra.slice(0, 20)) out.push(`      tree extra: ${JSON.stringify(p)}`);
    for (const e of t.dest.nonBlob.slice(0, 20)) out.push(`      tree non-blob: ${JSON.stringify(e.path)} (mode ${e.mode})`);
    for (const m of t.dest.blobMismatch.slice(0, 20)) out.push(`      tree blob: ${JSON.stringify(m.path)} differs from the frozen ${m.against} (expected ${m.expected} actual ${m.actual})`);
    for (const p of t.gitattributes.slice(0, 20)) out.push(`      tree .gitattributes: ${JSON.stringify(p)}`);
  }
  out.push(`  [checkout] ${st.checkout.status}${st.checkout.status === 'ok' ? ` HEAD=${st.checkout.head} tree=${st.checkout.tree} clean config-scopes=${st.checkout.configScopes.join('+')}` : ''}`);
  out.push(`  [runtime] ${st.runtime.status}${st.runtime.nodePin ? ` .node-version=${st.runtime.nodePin}` : ''}`);
  out.push(`  [pipeline] ${st.pipeline.status}${st.pipeline.status === 'ok' ? ` (info: regenerated tasks.json ${st.pipeline.tasksJsonMatchesCommitted ? '==' : '!='} committed)` : ''}`);
  for (const s of st.pipeline.steps) out.push(`      ${s.step}: exit ${s.exit ?? s.signal} — ${s.exit === 0 ? s.stdout : (s.stderr || s.stdout)}`);
  const c = st.compare;
  if (c.status !== 'match' && c.status !== 'mismatch') out.push(`  [compare] ${c.status}`);
  else {
    out.push(`  [compare] ${c.status} dest-present=${c.destPresent} expected=${c.expectedFiles} actual=${c.actualFiles} missing=${c.missing.length} extra=${c.extra.length} size-mismatch=${c.sizeMismatch.length} hash-mismatch=${c.hashMismatch.length} other-entries=${c.otherEntries.length} metadata=${c.metadata.present ? (c.metadata.equal ? 'equal' : 'DIFFERENT') : 'ABSENT'}`);
    for (const p of c.missing) out.push(`      missing: ${JSON.stringify(p)}`);
    for (const p of c.extra) out.push(`      extra: ${JSON.stringify(p)}`);
    for (const m of c.sizeMismatch) out.push(`      size: ${JSON.stringify(m.path)} expected ${m.expected} actual ${m.actual}`);
    for (const m of c.hashMismatch) out.push(`      sha256: ${JSON.stringify(m.path)} expected ${m.expected} actual ${m.actual}`);
    for (const e of c.otherEntries) out.push(`      other: ${JSON.stringify(e.path)} (${e.type})`);
  }
  for (const m of report.messages) out.push(`  message: ${m}`);
  if (report.exitCode === EXIT.PASS) {
    out.push(`PUBLICATION-ORACLE VERIFY: PASS candidate=${report.candidate} tree=${report.candidateTree} dest=${report.dest} files=${report.reference.files}+1`);
  } else {
    out.push(`PUBLICATION-ORACLE VERIFY: FAIL gate=${report.failingGate} exit=${report.exitCode} candidate=${report.candidate} dest=${report.dest}`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

// ───────────────────────────── CLI ─────────────────────────────

const OPTIONS = Object.freeze({
  freeze: { output: 'value', dest: 'value', repo: 'value', out: 'value', report: 'value' },
  verify: { manifest: 'value', 'manifest-sha256': 'value', metadata: 'value', 'metadata-sha256': 'value', repo: 'value', candidate: 'value', dest: 'value', work: 'value', report: 'value', keep: 'flag' },
});
const camel = (k) => k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

function parseArgs(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].startsWith('--') ? argv[i].slice(2) : null;
    if (key === null || !Object.hasOwn(allowed, key)) throw new Error(`unknown argument: ${argv[i]}`);
    if (Object.hasOwn(out, camel(key))) throw new Error(`duplicate option: ${argv[i]}`);
    if (allowed[key] === 'flag') { out[camel(key)] = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`missing value for ${argv[i]}`);
    out[camel(key)] = argv[i + 1];
    i += 1;
  }
  return out;
}

function main(argv) {
  process.exitCode = EXIT.CANNOT_VERIFY; // fail-closed 預設：只有走完全部檢查才會被改寫
  const command = argv[0];
  if (command !== 'freeze' && command !== 'verify') {
    process.stdout.write('usage: publication-oracle.mjs freeze --output <dir> --dest tasks/<task>/<folder> --repo <baseline checkout> --out <new manifest.json> [--report <new json>]\n'
      + '       publication-oracle.mjs verify --manifest <file> --manifest-sha256 <hex> --metadata <file> --metadata-sha256 <hex> --repo <git repo root> --candidate <40-hex sha> --dest tasks/<task>/<folder> [--work <new dir>] [--report <new json>] [--keep]\n'
      + `PUBLICATION-ORACLE: FAIL gate=input exit=${EXIT.CANNOT_VERIFY}\n`);
    return;
  }
  let opts;
  try { opts = parseArgs(argv.slice(1), OPTIONS[command]); } catch (err) {
    process.stdout.write(`  error: ${err.message}\nPUBLICATION-ORACLE ${command.toUpperCase()}: ${command === 'freeze' ? 'REJECTED' : 'FAIL gate=input'} exit=${EXIT.CANNOT_VERIFY}\n`);
    return;
  }
  const report = command === 'freeze' ? freeze(opts) : verify(opts);
  // 報告只寫到已通過位置檢查的路徑（reportFile）；被拒絕的 --report 位置絕不寫入。wx：只建立新檔。
  if (report.reportFile) {
    try { fs.writeFileSync(report.reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' }); } catch (err) {
      report.verdict = command === 'freeze' ? 'REJECTED' : 'FAIL';
      report.exitCode = report.exitCode === EXIT.PASS ? EXIT.CANNOT_VERIFY : report.exitCode;
      report.failingGate = report.failingGate ?? 'internal';
      report.messages.push(`cannot write --report: ${err.message}`);
    }
  }
  (command === 'freeze' ? printFreeze : printVerify)(report);
  process.exitCode = report.exitCode;
}

function invokedDirectly() {
  try { return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1] || ''); } catch { return false; }
}
if (invokedDirectly()) {
  process.stdout.on('error', () => {}); // 讀取端提早關閉（EPIPE）不得把 exit code 改成 Node 的未捕捉錯誤代碼 1
  try { main(process.argv.slice(2)); } catch (err) {
    // 未預期的例外不得落入 Node 預設的 exit 1（那是 ORACLE MISMATCH 的代碼）。
    process.stdout.write(`  internal error: ${err.stack ?? err}\nPUBLICATION-ORACLE: FAIL gate=internal exit=${EXIT.CANNOT_VERIFY}\n`);
    process.exitCode = EXIT.CANNOT_VERIFY;
  }
}
