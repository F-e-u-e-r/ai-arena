// CI 設定契約（Workstream E，2026-10-27）：Node 釘住單一來源 + 明確 runner 標籤 + SHA 釘住 + 排程檢查器隔離。
// 零依賴、離線；對 workflow 檔做「行為導向」的文字稽核（我們的 YAML 刻意保持簡單：一層 jobs、步驟用 `- name:` /
// `- uses:` 開頭、with 鍵一行一個）。所有檢查都抽成純函式（auditPagesWorkflow / auditPinCheckWorkflow），CI-6 以
// 文字變異的 known-bad 臂證明每條檢查都會 RED（非恆真）。
//   CI-1 .node-version 為精確 X.Y.Z 且主版本 == APPROVED_MAJOR（22）。刻意升主版本線必須有意識地改這個常數
//        （本 workstream 明示不得靜默從 22 升 24）。
//   CI-2 pages.yml：每個 setup-node 步驟都 `node-version-file: ".node-version"`、無任何 `node-version:` 字面；
//        三個 job 各恰有一個 setup-node（全部吃同一來源）。
//   CI-3 pages.yml + node-pin-check.yml：每個 `runs-on:` 都是明確的 `ubuntu-26.04`（不用滾動的 -latest 別名）。
//   CI-4 每個 `uses:` 都是 40-hex SHA 釘住並帶 `# vX.Y.Z` 註解（鏡射 repo 設定 sha_pinning_required=true）。
//   CI-5 node-pin-check.yml 隔離：只有 schedule + workflow_dispatch 觸發；permissions 只有 contents: read；
//        無 pages / id-token 權限；無 configure-pages / upload-pages-artifact / deploy-pages 動作；同樣消費 .node-version；
//        有 timeout-minutes。
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

// ── 純函式稽核 ───────────────────────────────────────────────────────────────
function lines(text) { return text.split('\n'); }
function indentOf(l) { return l.match(/^ */)[0].length; }

// 以「`- uses:` / `- name:` 開頭的行」切出步驟區塊（含其後更深縮排的行）。
export function stepBlocks(text) {
  const ls = lines(text); const blocks = []; let cur = null;
  for (const l of ls) {
    if (/^\s*- (name|uses):/.test(l)) { if (cur) blocks.push(cur); cur = { indent: indentOf(l), text: [l] }; continue; }
    if (cur && (l.trim() === '' || indentOf(l) > cur.indent || /^\s*#/.test(l))) { cur.text.push(l); continue; }
    if (cur) { blocks.push(cur); cur = null; }
  }
  if (cur) blocks.push(cur);
  return blocks.map((b) => b.text.join('\n'));
}

export function auditUsesPinning(text) {
  const problems = [];
  for (const l of lines(text)) {
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
  const found = lines(text).filter((l) => /^\s*runs-on:/.test(l));
  if (!found.length) problems.push('no runs-on found');
  for (const l of found) {
    const v = l.replace(/^\s*runs-on:\s*/, '').trim().replace(/^["']|["']$/g, '');
    if (v !== RUNNER_LABEL) problems.push(`runs-on must be the explicit GA label ${RUNNER_LABEL}, got: ${v}`);
  }
  return problems;
}

export function auditSetupNode(text, { expectedSteps }) {
  const problems = [];
  const steps = stepBlocks(text).filter((b) => /uses:\s*actions\/setup-node@/.test(b));
  if (steps.length !== expectedSteps) problems.push(`expected ${expectedSteps} setup-node steps, found ${steps.length}`);
  for (const s of steps) {
    if (!/^\s*node-version-file:\s*["']?\.node-version["']?\s*$/m.test(s)) problems.push('setup-node step does not consume node-version-file: .node-version');
    if (/^\s*node-version:/m.test(s)) problems.push('setup-node step still carries a literal node-version: (second source of truth)');
    if (/^\s*check-latest:\s*true/m.test(s)) problems.push('setup-node step sets check-latest: true (reproducibility contract forbids it)');
  }
  if (/^\s*node-version:/m.test(text)) problems.push('workflow contains a literal node-version: key somewhere');
  return problems;
}

// jobs: 區塊內 2 空白縮排的鍵 = job 名稱（on: / permissions: 等頂層區塊不計）。
export function jobNames(text) {
  const m = text.match(/^jobs:\n([\s\S]*)$/m);
  return m ? (m[1].match(/^  [a-z][a-z0-9-]*:\s*$/gm) || []).map((j) => j.trim().replace(':', '')) : [];
}

export function auditPagesWorkflow(text) {
  const jobs = jobNames(text).length;
  return [
    ...auditUsesPinning(text),
    ...auditRunsOn(text),
    ...auditSetupNode(text, { expectedSteps: 3 }),
    ...(jobs === 3 ? [] : [`expected 3 jobs (validate, browser-smoke, deploy), found ${jobs}`]),
  ];
}

export function auditPinCheckWorkflow(text) {
  const problems = [...auditUsesPinning(text), ...auditRunsOn(text), ...auditSetupNode(text, { expectedSteps: 1 })];
  // on: 區塊只允許 schedule / workflow_dispatch（絕不 push / pull_request → 不會跑在 PR 上、也不會與 Pages 的觸發重疊）
  const onBlock = text.match(/^on:\n((?:[ \t]+.*\n?)+)/m);
  if (!onBlock) problems.push('no on: block');
  else {
    const triggers = (onBlock[1].match(/^  ([a-z_]+):/gm) || []).map((t) => t.trim().replace(':', ''));
    const extra = triggers.filter((t) => !['schedule', 'workflow_dispatch'].includes(t));
    if (extra.length) problems.push(`pin-check must only be triggered by schedule/workflow_dispatch, found: ${extra.join(', ')}`);
    if (!triggers.includes('schedule')) problems.push('pin-check lacks a schedule trigger');
  }
  const perms = text.match(/^permissions:\n((?:[ \t]+.*\n?)+)/m);
  if (!perms) problems.push('pin-check lacks an explicit permissions: block');
  else if (perms[1].trim() !== 'contents: read') problems.push(`pin-check permissions must be exactly "contents: read", got: ${perms[1].trim().replace(/\n/g, ' | ')}`);
  if (/\b(pages|id-token|contents):\s*write\b/.test(text)) problems.push('pin-check must not hold any write permission');
  if (/(configure-pages|upload-pages-artifact|deploy-pages|environment:)/.test(text)) problems.push('pin-check must not contain Pages/deploy steps or an environment');
  if (!/^\s*timeout-minutes:\s*\d+/m.test(text)) problems.push('pin-check job lacks timeout-minutes');
  if (!/run:\s*node scripts\/check-node-pin\.mjs/.test(text)) problems.push('pin-check does not run scripts/check-node-pin.mjs');
  return problems;
}

// 套用必須真的生效的變異（與 model-viewer-sri.test.mjs 同慣例）
function mutate(source, from, to) {
  const out = source.replace(from, to);
  assert.notEqual(out, source, `mutation did not apply: ${String(from).slice(0, 60)}`);
  return out;
}

// ── 契約 ────────────────────────────────────────────────────────────────────
test('CI-1: .node-version is an exact X.Y.Z on the approved major line', () => {
  const v = NODE_VERSION_FILE.trim();
  assert.match(v, /^\d+\.\d+\.\d+$/, '.node-version must be an exact patch version (no ranges, aliases or v-prefix)');
  assert.equal(Number(v.split('.')[0]), APPROVED_MAJOR, `CI Node line is ${APPROVED_MAJOR}; moving to another major is an Owner decision — update APPROVED_MAJOR consciously`);
  assert.equal(NODE_VERSION_FILE, `${v}\n`, 'file is exactly the version plus one trailing newline');
});

test('CI-2: every setup-node step in pages.yml consumes .node-version (3 jobs, single source, no literal node-version)', () => {
  assert.deepEqual(auditSetupNode(PAGES, { expectedSteps: 3 }), []);
  assert.doesNotMatch(PAGES, /22\.23\.4/, 'the patch literal must not appear in the workflow any more (single source = .node-version)');
});

test('CI-3: every runs-on in pages.yml and node-pin-check.yml is the explicit ubuntu-26.04 label', () => {
  assert.deepEqual(auditRunsOn(PAGES), []);
  assert.deepEqual(auditRunsOn(PIN_CHECK), []);
  // 非註解行不得出現滾動別名（註解可以提到它來解釋為何不用）
  const codeLines = (PAGES + '\n' + PIN_CHECK).split('\n').filter((l) => !/^\s*#/.test(l));
  assert.equal(codeLines.filter((l) => /ubuntu-latest/.test(l)).length, 0, 'no non-comment line may reference ubuntu-latest');
  assert.deepEqual(jobNames(PAGES), ['validate', 'browser-smoke', 'deploy']);
  assert.deepEqual(jobNames(PIN_CHECK), ['check']);
});

test('CI-4: every uses: in both workflows is a GitHub-owned action pinned to a 40-hex SHA with a # vX.Y.Z comment', () => {
  assert.deepEqual(auditUsesPinning(PAGES), []);
  assert.deepEqual(auditUsesPinning(PIN_CHECK), []);
  assert.deepEqual(auditPagesWorkflow(PAGES), []);
});

test('CI-5: node-pin-check.yml is isolated — schedule/dispatch only, contents: read only, no Pages/deploy, consumes .node-version, has a timeout', () => {
  assert.deepEqual(auditPinCheckWorkflow(PIN_CHECK), []);
  // 兩個 workflow 的 setup-node 釘到同一個 action SHA（同一條供應鏈）
  const sha = (t) => t.match(/actions\/setup-node@([0-9a-f]{40})/)[1];
  assert.equal(sha(PIN_CHECK), sha(PAGES));
});

test('CI-6: known-bad arms — each audit rule can actually fail', () => {
  // (a) literal node-version re-introduced → CI-2 RED
  const literal = mutate(PAGES, /node-version-file: "\.node-version"/, 'node-version: "22.23.4"');
  assert.ok(auditSetupNode(literal, { expectedSteps: 3 }).some((p) => /does not consume|literal node-version/.test(p)));
  // (b) check-latest: true added → RED
  const cl = mutate(PAGES, /node-version-file: "\.node-version"\n/, 'node-version-file: ".node-version"\n          check-latest: true\n');
  assert.ok(auditSetupNode(cl, { expectedSteps: 3 }).some((p) => /check-latest/.test(p)));
  // (c) a job dropped its setup-node → count RED
  const fewer = mutate(PAGES, /      - name: Set up Node\.js\n        uses: actions\/setup-node@[0-9a-f]{40} # v\d+\.\d+\.\d+\n        with:\n          node-version-file: "\.node-version"\n\n      - name: Configure Pages/, '      - name: Configure Pages');
  assert.ok(auditSetupNode(fewer, { expectedSteps: 3 }).some((p) => /expected 3 setup-node steps, found 2/.test(p)));
  // (d) rolling alias → CI-3 RED
  const latest = mutate(PAGES, /runs-on: ubuntu-26\.04/, 'runs-on: ubuntu-latest');
  assert.ok(auditRunsOn(latest).some((p) => /explicit GA label/.test(p)));
  // (e) tag-pinned action → CI-4 RED
  const tag = mutate(PAGES, /actions\/checkout@[0-9a-f]{40} # v7\.0\.1/, 'actions/checkout@v7');
  assert.ok(auditUsesPinning(tag).some((p) => /not pinned to a 40-hex/.test(p)));
  // (f) third-party action → RED
  const third = mutate(PAGES, /actions\/checkout@/, 'someone/checkout@');
  assert.ok(auditUsesPinning(third).some((p) => /not a GitHub-owned action/.test(p)));
  // (g) pin-check gains a push trigger / a write permission / a deploy step → CI-5 RED
  const pushTrig = mutate(PIN_CHECK, /  workflow_dispatch:\n/, '  workflow_dispatch:\n  push:\n    branches: ["main"]\n');
  assert.ok(auditPinCheckWorkflow(pushTrig).some((p) => /only be triggered by schedule/.test(p)));
  const writePerm = mutate(PIN_CHECK, /permissions:\n  contents: read\n/, 'permissions:\n  contents: write\n');
  assert.ok(auditPinCheckWorkflow(writePerm).some((p) => /write permission|exactly "contents: read"/.test(p)));
  const deployStep = mutate(PIN_CHECK, /run: node scripts\/check-node-pin\.mjs\n/, 'run: node scripts/check-node-pin.mjs\n      - uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1\n');
  assert.ok(auditPinCheckWorkflow(deployStep).some((p) => /Pages\/deploy/.test(p)));
  const noTimeout = mutate(PIN_CHECK, /    timeout-minutes: 5\n/, '');
  assert.ok(auditPinCheckWorkflow(noTimeout).some((p) => /timeout-minutes/.test(p)));
  // (h) .node-version drift to another major / a range → CI-1 RED (pure checks on the value)
  assert.notEqual(Number('24.22.1'.split('.')[0]), APPROVED_MAJOR);
  assert.doesNotMatch('22', /^\d+\.\d+\.\d+$/);
});
