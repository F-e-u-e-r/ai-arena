// filter-core 純邏輯回歸測試（node --test，零依賴）。
// 對應 docs/filtering-spec.md §7.1 的凍結邏輯類別（P0 範圍：不含 P1 的
// Model Family bulk-select 與候選 count）。每個 assert 皆「先寫預期、再比實際」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  facetValues, initState, isAny, isSelected,
  toggle, only, reset, visible, visibleCount,
  compareText, sortValue, sortedSubs
} from '../assets/filter-core.mjs';

const FACETS = ['client', 'model', 'effort'];
const SUBS = [
  { id: 's1', client: 'codex',       model: 'GPT-5.5',  effort: 'high' },
  { id: 's2', client: 'codex',       model: 'GPT-5.6',  effort: 'low'  },
  { id: 's3', client: 'claude-code', model: 'Opus 4.8', effort: 'high' },
  { id: 's4', client: 'grok',        model: 'Grok 4.7', effort: 'max'  },
  { id: 's5', client: 'claude-code', model: 'Opus 4.8'                 }, // effort 缺 → '—'
];
const visibleIds = (state, subs = SUBS) =>
  subs.filter(s => visible(s, state, FACETS)).map(s => s.id);

// (1) Normal-toggle 四個 transition ＋ 取消最後一項折疊回 Any（§2.2a、I1）。
test('1: normal-toggle transitions Any→{A}→{A,B}→{B}→Any', () => {
  let s = initState(FACETS);
  assert.deepEqual(s, { client: 'any', model: 'any', effort: 'any' }); // 初始全 Any
  s = toggle(s, 'client', 'codex');
  assert.deepEqual(s.client, ['codex']);                 // Any → {A}
  s = toggle(s, 'client', 'claude-code');
  assert.deepEqual(s.client, ['codex', 'claude-code']);  // {A} → {A,B}
  s = toggle(s, 'client', 'codex');
  assert.deepEqual(s.client, ['claude-code']);           // {A,B} → {B}
  s = toggle(s, 'client', 'claude-code');
  assert.equal(s.client, 'any');                         // {B} → Any（I1：無空集）

  const base = initState(FACETS);
  toggle(base, 'client', 'codex');
  assert.equal(base.client, 'any');                      // toggle 不改動輸入（immutable）

  const t = toggle(initState(FACETS), 'model', 'GPT-5.6');
  assert.equal(isSelected(t, 'model', 'GPT-5.6'), true);
  assert.equal(isSelected(t, 'model', 'GPT-5.5'), false);
});

// (2) Multi-select：facet 內 OR、facet 間 AND（§3.1）。
test('2: multi-select OR within facet, AND across facets', () => {
  assert.deepEqual(                                       // OR：codex ∪ grok
    visibleIds({ client: ['codex', 'grok'], model: 'any', effort: 'any' }),
    ['s1', 's2', 's4']);
  assert.deepEqual(                                       // AND：codex ∧ high
    visibleIds({ client: ['codex'], model: 'any', effort: ['high'] }),
    ['s1']);
  assert.deepEqual(                                       // Any 短路通過
    visibleIds({ client: 'any', model: 'any', effort: ['high'] }),
    ['s1', 's3']);
});

// (3) Only：設單值、不動他 facet、已隔離時 NO-OP（§2.2b、FD-2、I6、E8）。
test('3: Only isolates one facet, idempotent, never a toggle', () => {
  const s = { client: ['codex', 'grok'], model: ['GPT-5.6'], effort: 'any' };
  const after = only(s, 'client', 'codex');
  assert.deepEqual(after.client, ['codex']);             // 設為單值
  assert.deepEqual(after.model, ['GPT-5.6']);            // 他 facet 不變（I6）
  assert.equal(after.effort, 'any');                     // 他 facet 不變（I6）
  assert.deepEqual(s.client, ['codex', 'grok']);         // 不改動輸入

  assert.deepEqual(only(initState(FACETS), 'effort', 'high').effort, ['high']); // 自 Any 也可

  const iso = only(initState(FACETS), 'client', 'codex');
  assert.equal(only(iso, 'client', 'codex'), iso);       // 已是 {codex} → 回傳同參照（NO-OP、E8）
  assert.notEqual(only(iso, 'client', 'codex').client, 'any'); // Only 不得回到 Any
});

// (4) Reset：所有 facet 回 Any（§2.2c、I2）。
test('4: reset returns every facet to Any', () => {
  const mixed = { client: ['codex'], model: ['GPT-5.6', 'Opus 4.8'], effort: ['high'] };
  const r = reset(mixed);
  assert.deepEqual(r, { client: 'any', model: 'any', effort: 'any' });
  for (const key of FACETS) assert.equal(isAny(r, key), true);
  assert.equal(isSelected(r, 'client', 'codex'), false); // 無任何值呈 selected
});

// (5) 跨 facet 衝突 → 合法 0 results，狀態不回滾、selection 不被刪（§3.1、OD-2、I3、E6）。
test('5: conflicting cross-facet constraints yield a legitimate zero result', () => {
  const s = { client: ['codex'], model: ['Opus 4.8'], effort: 'any' }; // 無 submission 同時成立
  assert.deepEqual(visibleIds(s), []);                   // 0 可見，合法
  assert.equal(visibleCount(SUBS, s, FACETS), 0);
  assert.deepEqual(s, { client: ['codex'], model: ['Opus 4.8'], effort: 'any' }); // 狀態未被更動
});

// (6) Explicit All ≠ Any（引入 V 外新值；§2.4、FD-4、I8、E4/E5）。
test('6: Explicit-All differs from Any when a new facet value appears', () => {
  const effortVals = facetValues(SUBS, 'effort');        // ['high','low','max','—']
  const explicitAll = { client: 'any', model: 'any', effort: [...effortVals] };
  const anyState    = { client: 'any', model: 'any', effort: 'any' };
  const sNew = { id: 's6', client: 'codex', model: 'GPT-5.6', effort: 'ultra' }; // V 外新值
  const subsPlus = [...SUBS, sNew];

  assert.equal(visible(sNew, anyState, FACETS), true);   // Any：新值可見（開放語義 E5）
  assert.equal(visible(sNew, explicitAll, FACETS), false); // Subset(全部已知)：新值不可見（E4）
  assert.deepEqual(explicitAll.effort, effortVals);      // V 不被自動擴張（I8）
  assert.equal(explicitAll.effort.includes('ultra'), false);

  assert.equal(visibleCount(subsPlus, anyState, FACETS), SUBS.length + 1);  // Any 多看見新值
  assert.equal(visibleCount(subsPlus, explicitAll, FACETS), SUBS.length);   // Explicit-All 不含新值
});

// (7) 正確的可見結果計數（results summary = subs.filter(visible).length；§3.1、I4）。
test('7: correct filtered-result counts', () => {
  assert.equal(visibleCount(SUBS, initState(FACETS), FACETS), 5);                          // 全 Any
  assert.equal(visibleCount(SUBS, { client: ['claude-code'], model: 'any', effort: 'any' }, FACETS), 2); // s3,s5
  assert.equal(visibleCount(SUBS, { client: ['codex'], model: 'any', effort: ['high'] }, FACETS), 1);    // s1
  assert.equal(visibleCount(SUBS, { client: ['grok'], model: 'any', effort: ['high'] }, FACETS), 0);     // 衝突
  const st = { client: ['codex', 'claude-code'], model: 'any', effort: 'any' };
  assert.equal(visibleCount(SUBS, st, FACETS), SUBS.filter(s => visible(s, st, FACETS)).length); // 恆等
});

// (8) 排序不受 filter 影響：numeric-aware、缺值排最後、stable；sort/filter 正交（§6 不變量 4、§7.1）。
test('8: sorting is numeric-aware, missing-last, stable, orthogonal to filtering', () => {
  assert.ok(compareText('GPT-5.5', 'GPT-5.6') < 0);      // 5.5 < 5.6（數字感知）
  assert.ok(compareText('GPT-5.6', 'GPT-5.5') > 0);
  assert.ok(compareText('v5.10', 'v5.9') > 0);           // 數字序：10 > 9（非逐字元）
  assert.equal(compareText('abc', 'abc'), 0);

  assert.equal(sortValue({ model: 'Opus 4.8', effort: 'high', client: 'claude-code' }, 'name'),
    'Opus 4.8 · high · claude-code');
  assert.equal(typeof sortValue({ generatedAt: '2026-07-04T10:00:00Z' }, 'time'), 'number');
  assert.equal(sortValue({ generatedAt: 'not-a-date' }, 'time'), undefined); // 無法解析 → undefined

  const rows = [
    { id: 'a', generatedAt: '2026-07-02T00:00:00Z' },
    { id: 'b' },                                          // 缺 time
    { id: 'c', generatedAt: '2026-07-01T00:00:00Z' },
    { id: 'd' },                                          // 缺 time（原序在 b 之後）
  ];
  assert.deepEqual(sortedSubs(rows, 'time', 1).map(r => r.id), ['c', 'a', 'b', 'd']);  // 遞增：缺值最後、b 先於 d
  assert.deepEqual(sortedSubs(rows, 'time', -1).map(r => r.id), ['a', 'c', 'b', 'd']); // 遞減：缺值仍最後
  const before = rows.map(r => r.id);
  sortedSubs(rows, 'time', 1);
  assert.deepEqual(rows.map(r => r.id), before);          // 純函式：不改動輸入

  // sort/filter 正交：對已排序清單做 filter，倖存者維持排序後的相對順序。
  const sortedIds = sortedSubs(SUBS, 'name', 1).map(s => s.id);
  const st = { client: 'any', model: 'any', effort: ['high'] }; // 留 s1,s3
  const survivorsInSortOrder = sortedIds.filter(id =>
    visible(SUBS.find(s => s.id === id), st, FACETS));
  assert.deepEqual(survivorsInSortOrder, sortedIds.filter(id => id === 's1' || id === 's3'));
});
