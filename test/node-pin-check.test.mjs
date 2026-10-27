// scripts/check-node-pin.mjs 的離線單元測試（Workstream E3）。零網路：以合成的釋出索引 / 時程餵 classifyPin。
// 契約：
//   NP-1 parsePinned 只接受精確 X.Y.Z（去空白）；範圍 / 別名 / 前綴 v 一律拒絕。
//   NP-2 current：釘住值 == 線上最新 → exit 0，無 error。
//   NP-3 patch-drift：線上有更新 patch → exit 1，列出更新版本與是否含 security 釋出。
//   NP-4 major-line-migration：today >= schedule.end → exit 1，且與 patch-drift 區分（即使同時也落後 patch）。
//   NP-5 advisory：Maintenance 期 → notice；EOL 90 天內 → warning；皆不改變結束碼。
//   NP-6 fail closed：釘住值不在官方清單、索引為空、時程缺主版本、today 格式錯 → 丟錯（不得當成 current）。
//   NP-7 formatReport 把分類對映到 GitHub 註解（::error / ::warning / ::notice），patch-drift 與 migration 文字可區分。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePinned, classifyPin, formatReport, cmpSemver, parseIsoDate, parseLatestFromShasums, EOL_WARN_DAYS, INDEX_MAX_AGE_DAYS } from '../scripts/check-node-pin.mjs';

const INDEX = [
  { version: 'v26.12.1', date: '2026-10-21', security: true, lts: false },
  { version: 'v26.0.0', date: '2026-05-05', security: false, lts: false },
  { version: 'v24.22.1', date: '2026-10-20', security: true, lts: 'Krypton' },
  { version: 'v24.22.0', date: '2026-10-14', security: false, lts: 'Krypton' },
  { version: 'v24.0.0', date: '2025-05-06', security: false, lts: false },
  { version: 'v22.23.4', date: '2026-10-20', security: true, lts: 'Jod' },
  { version: 'v22.23.3', date: '2026-09-23', security: false, lts: 'Jod' },
  { version: 'v22.23.2', date: '2026-07-28', security: true, lts: 'Jod' },
  { version: 'v22.9.0', date: '2024-09-17', security: false, lts: false }, // 排序測試：9 < 23（數值而非字串）
  { version: 'v22.0.0', date: '2024-04-24', security: false, lts: false }, // 線的最早釋出 = schedule.start（交叉驗證）
];
const SCHEDULE = {
  v22: { start: '2024-04-24', lts: '2024-10-29', maintenance: '2025-10-21', end: '2027-04-30', codename: 'Jod' },
  v24: { start: '2025-05-06', lts: '2025-10-28', maintenance: '2026-10-20', end: '2028-04-30', codename: 'Krypton' },
  v26: { start: '2026-05-05', lts: '2026-10-28', maintenance: '2027-10-20', end: '2029-04-30', codename: '' },
};
const TODAY = '2026-10-27';
// 註：多數臂以 indexMaxAgeDays: Infinity 呼叫，因為它們把 today 設在 2027/2028 做時間旅行，而 fixture 索引最新釋出是 2026-10-21；
// 新鮮度界限本身由 NP-8 (c) 以預設值驗證。活體 main() 從不傳此參數。

test('NP-1: parsePinned accepts exactly X.Y.Z (trimmed) and rejects ranges / aliases / prefixes', () => {
  assert.equal(parsePinned('22.23.4\n'), '22.23.4');
  assert.equal(parsePinned('  22.23.4  '), '22.23.4');
  for (const bad of ['22', '22.23', 'v22.23.4', 'lts/*', 'lts/jod', '22.x', '>=22', '', '22.23.4-rc1']) {
    assert.throws(() => parsePinned(bad), /精確的 X\.Y\.Z/, `must reject "${bad}"`);
  }
  assert.ok(cmpSemver('22.23.4', '22.9.0') > 0, 'semver compare is numeric, not lexical');
});

test('NP-2: current — pin equals the newest release of its major line → exit 0 (maintenance notice only)', () => {
  const r = classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: TODAY });
  assert.equal(r.category, 'current');
  assert.equal(r.exit, 0);
  assert.equal(r.latest, '22.23.4');
  assert.deepEqual(r.newer, []);
  assert.equal(r.securityBehind, false);
  assert.deepEqual(r.advisories.map((a) => a.level), ['notice'], 'v22 is in Maintenance on 2026-10-27 → notice, no warning');
  assert.doesNotMatch(formatReport(r), /::error::/);
  assert.match(formatReport(r), /::notice::node-pin-check: current/);
});

test('NP-3: patch-drift — a newer patch exists on the same line → exit 1, lists the skipped releases and security flag', () => {
  const r = classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.2', index: INDEX, schedule: SCHEDULE, today: TODAY });
  assert.equal(r.category, 'patch-drift');
  assert.equal(r.exit, 1);
  assert.deepEqual(r.newer, ['22.23.4', '22.23.3']);
  assert.equal(r.securityBehind, true, '22.23.4 is a security release → flagged');
  assert.match(formatReport(r), /::error::node-pin-check: patch-drift/);
  assert.match(formatReport(r), /含 security 釋出：是/);
  // 同線無 security 釋出的落後 → 仍 patch-drift，但 security 標記為否（區分急迫性，不改分類）。
  const r2 = classifyPin({ indexMaxAgeDays: Infinity, pinned: '24.22.0', index: INDEX, schedule: SCHEDULE, today: '2026-10-15' });
  assert.equal(r2.category, 'patch-drift');
  assert.equal(r2.securityBehind, true, '24.22.1 is security=true');
  const idxNoSec = INDEX.map((x) => (x.version === 'v24.22.1' ? { ...x, security: false } : x));
  assert.equal(classifyPin({ indexMaxAgeDays: Infinity, pinned: '24.22.0', index: idxNoSec, schedule: SCHEDULE, today: '2026-10-15' }).securityBehind, false);
});

test('NP-4: major-line-migration — the pinned line is past its EOL → exit 1 and NOT reported as patch-drift', () => {
  const r = classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.2', index: INDEX, schedule: SCHEDULE, today: '2027-05-01' });
  assert.equal(r.category, 'major-line-migration', 'EOL takes precedence even when also behind a patch');
  assert.equal(r.exit, 1);
  assert.ok(r.daysToEol < 0);
  assert.match(formatReport(r), /::error::node-pin-check: major-line-migration/);
  assert.doesNotMatch(formatReport(r), /patch-drift/);
  // EOL 邊界（審查 F1，fail closed）：EOL 當天（today == end）即為 major-line-migration；前一天仍 current（剩 1 天 → warning）。
  const dayBefore = classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: '2027-04-29' });
  assert.equal(dayBefore.category, 'current');
  assert.equal(dayBefore.daysToEol, 1);
  assert.ok(dayBefore.advisories.some((a) => a.level === 'warning'));
  const eolDay = classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: '2027-04-30' });
  assert.equal(eolDay.category, 'major-line-migration');
  assert.equal(eolDay.daysToEol, 0);
  assert.equal(eolDay.exit, 1);
  assert.equal(classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: '2027-05-01' }).category, 'major-line-migration');
});

test('NP-5: advisories — EOL within 90 days → warning; Maintenance → notice; neither changes the exit code', () => {
  const r = classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: '2027-02-15' }); // 74 days to 2027-04-30
  assert.equal(r.category, 'current');
  assert.equal(r.exit, 0);
  assert.ok(r.daysToEol <= EOL_WARN_DAYS && r.daysToEol >= 0);
  assert.deepEqual(r.advisories.map((a) => a.level).sort(), ['notice', 'warning']);
  assert.match(formatReport(r), /::warning::node-pin-check: Node v22 將於 2027-04-30 EOL/);
  // 尚未進入 Maintenance、EOL 很遠 → 無 advisory
  const r2 = classifyPin({ indexMaxAgeDays: Infinity, pinned: '24.22.1', index: INDEX, schedule: SCHEDULE, today: '2026-06-01' });
  assert.deepEqual(r2.advisories, []);
  assert.equal(r2.category, 'current');
});

test('NP-6: fail closed — unknown pin, empty index, missing schedule line, bad today → throw (never "current")', () => {
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.9', index: INDEX, schedule: SCHEDULE, today: TODAY }), /不在官方 v22\.x 釋出清單/);
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '20.19.0', index: INDEX, schedule: SCHEDULE, today: TODAY }), /找不到 v20\.x/);
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: [], schedule: SCHEDULE, today: TODAY }), /非空陣列/);
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { v24: SCHEDULE.v24 }, today: TODAY }), /缺 v22\.end/);
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: 'today' }), /YYYY-MM-DD/);
  // 無效日期（審查 F1）：格式合規但不存在的日期（2027-13-01、2027-02-30）會被 Date 變成 NaN 或正規化 → 必須丟錯，
  // 不得靜默落到 current（fail-open）。today / end / maintenance / 其他線的 lts 皆受保護。
  assert.throws(() => parseIsoDate('2027-13-01', 'x'), /不是有效日期/);
  assert.throws(() => parseIsoDate('2027-02-30', 'x'), /不是有效日期/);
  assert.equal(parseIsoDate('2027-04-30', 'x').toISOString().slice(0, 10), '2027-04-30');
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { ...SCHEDULE, v22: { ...SCHEDULE.v22, end: '2027-13-01' } }, today: TODAY }), /v22\.end 不是有效日期/);
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { ...SCHEDULE, v22: { ...SCHEDULE.v22, maintenance: 'soon' } }, today: TODAY }), /v22\.maintenance 必須是 YYYY-MM-DD/);
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: '2026-02-30' }), /today 不是有效日期/);
  // 合理性界限（Grok F7 → R2 F4）：end 被改成遙遠未來（壓掉 migration 訊號）或早於 start → 丟錯（fail closed）
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { ...SCHEDULE, v22: { ...SCHEDULE.v22, end: '2099-01-01' } }, today: TODAY }), /跨度 .* 天不合理/);
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { ...SCHEDULE, v22: { ...SCHEDULE.v22, end: '2024-12-01' } }, today: '2024-11-01' }), /跨度 .* 天不合理/);
  // 缺 start 不得跳過（R2 F4）→ 丟錯；start/end 一起往後搬（2096→2099，跨度合規）→ 與 index 最早釋出日不符 → 丟錯
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { ...SCHEDULE, v22: { lts: '2024-10-29', maintenance: '2025-10-21', end: '2027-04-30' } }, today: TODAY }), /缺 v22\.start/);
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { ...SCHEDULE, v22: { ...SCHEDULE.v22, start: '2096-04-07', end: '2099-01-01' } }, today: '2028-01-01' }), /與官方釋出索引最早釋出日 .* 不符/);
  // 索引缺少該線最早釋出（截斷的索引）→ start 與可見最早日不符 → 丟錯（fail closed，不靜默當 current）
  const truncated = INDEX.filter((r) => r.version !== 'v22.0.0' && r.version !== 'v22.9.0');
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: truncated, schedule: SCHEDULE, today: TODAY }), /不符/);
  // Node 政策交叉驗證（Grok R3 F3）：end 在跨度上限內但晚於政策 EOL（2027-04-30）→ 丟錯；提前（v16 式縮短）→ 允許；
  // 奇數（非 LTS）主版本 → 拒絕
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { ...SCHEDULE, v22: { ...SCHEDULE.v22, end: '2027-11-15' } }, today: '2027-05-01' }), /晚於 Node 釋出政策的 EOL 2027-04-30/);
  const shortened = classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: { ...SCHEDULE, v22: { ...SCHEDULE.v22, end: '2027-01-31' } }, today: TODAY });
  assert.equal(shortened.category, 'current'); assert.equal(shortened.eol, '2027-01-31');
  const oddIndex = [...INDEX, { version: 'v23.10.0', date: '2025-03-13', security: false, lts: false }, { version: 'v23.0.0', date: '2024-10-16', security: false, lts: false }];
  const oddSchedule = { ...SCHEDULE, v23: { start: '2024-10-16', lts: '', maintenance: '2025-04-01', end: '2025-06-01' } };
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '23.10.0', index: oddIndex, schedule: oddSchedule, today: '2025-01-01' }), /奇數（非 LTS）主版本線/);
  // 真實 v22 時程（2024-04-24 → 2027-04-30 = 1101 天；start == v22.0.0 釋出日）在界限內
  assert.equal(classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: TODAY }).category, 'current');
  // known-bad 臂（F1 機制）：忠實複製 EOL 判定、只拿掉日期驗證 → 無效 end 使比較全為假 → 落到 current（fail-open）。
  const naiveEol = (today, end) => {
    const days = Math.floor((new Date(`${end}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86_400_000); // 無驗證
    return days <= 0 ? 'major-line-migration' : 'current';
  };
  assert.equal(naiveEol(TODAY, '2027-13-01'), 'current', 'mutant: NaN comparison silently yields current');
  // known-bad 臂（oracle 鑑別力）：一個「查不到就當 current」的變異必須被上面的斷言抓到 —— 用忠實複製、只移除
  // 「釘住值必須存在於清單」那一道的變異來證明該檢查是載重的。
  const mutant = ({ pinned, index }) => {
    const major = Number(pinned.split('.')[0]);
    const line = index.filter((r) => r.version.startsWith(`v${major}.`)).map((r) => r.version.slice(1)).sort((a, b) => cmpSemver(b, a));
    // （「pinned ∈ line」檢查已移除）
    return line.filter((v) => cmpSemver(v, pinned) > 0).length ? 'patch-drift' : 'current';
  };
  assert.equal(mutant({ pinned: '22.99.0', index: INDEX }), 'current', 'mutant silently accepts a non-existent pin as current');
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.99.0', index: INDEX, schedule: SCHEDULE, today: TODAY }), /不在官方/);
});

test('NP-8 (Codex F2): a stale or truncated index cannot report current — third-source cross-check with dist/latest-v<major>.x and an index-freshness bound', () => {
  // (a) 截斷索引：移除比 pin 新的釋出 → index 推得 latest == pin；若無交叉驗證會回 current。帶入 dist 的真實 latest → 丟錯。
  const truncated = INDEX.filter((r) => r.version !== 'v22.23.4');
  assert.equal(classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.3', index: truncated, schedule: SCHEDULE, today: TODAY }).category, 'current', 'precondition: without the third source the truncated index looks current');
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.3', index: truncated, schedule: SCHEDULE, today: TODAY, latestFromDist: '22.23.4' }), /不一致/);
  // (b) 一致時照常分類；格式異常的 dist 版本 → 丟錯
  assert.equal(classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: TODAY, latestFromDist: '22.23.4' }).category, 'current');
  assert.throws(() => classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: TODAY, latestFromDist: 'v22.23.4' }), /版本格式異常/);
  // (c) 整份索引過期（最新釋出 > INDEX_MAX_AGE_DAYS 天前）→ 丟錯，不得當 current
  const staleToday = '2027-02-01'; // INDEX 最新為 2026-10-21 → 103 天
  assert.ok(INDEX_MAX_AGE_DAYS < 103);
  assert.throws(() => classifyPin({ pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: staleToday }), /過期快照/); // 預設界限
  assert.equal(classifyPin({ indexMaxAgeDays: Infinity, pinned: '22.23.4', index: INDEX, schedule: SCHEDULE, today: staleToday }).category, 'current', 'only an explicit Infinity (offline time-travel tests) disables the bound');
  // (d) SHASUMS 解析：唯一版本 → 回傳；混雜/缺失 → 丟錯
  assert.equal(parseLatestFromShasums('abc  node-v22.23.4-linux-x64.tar.gz\ndef  node-v22.23.4-darwin-arm64.tar.gz\n'), '22.23.4');
  assert.throws(() => parseLatestFromShasums('abc  node-v22.23.4-linux-x64.tar.gz\ndef  node-v22.23.3-darwin-arm64.tar.gz\n'), /唯一版本/);
  assert.throws(() => parseLatestFromShasums('<html>not a shasums file</html>'), /唯一版本/);
});

test('NP-7: the repository .node-version itself parses and classifies against the snapshot index (offline sanity)', () => {
  // 只驗格式與分類器對真實釘住值可用；真實的「是否落後」由排程 workflow 以官方來源判定（網路相依，不在離線範圍）。
  const pinned = parsePinned(readFileSync(new URL('../.node-version', import.meta.url), 'utf8'));
  assert.match(pinned, /^22\.\d+\.\d+$/, 'approved line is Node 22 (see test/ci-config.test.mjs CI-1)');
  const r = classifyPin({ pinned, index: INDEX, schedule: SCHEDULE, today: TODAY });
  assert.ok(['current', 'patch-drift'].includes(r.category), 'a real pin on the approved line classifies without throwing');
});
