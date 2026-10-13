// filter-core — Any / Explicit Subset 篩選與排序的純邏輯（無 DOM 副作用）。
// 契約來源：docs/filtering-spec.md（P0 凍結版）。此模組可被瀏覽器與 Node 內建
// test runner 共用；不碰 DOM、不讀全域狀態，所有函式皆為純函式。
//
// 狀態表示（spec §2.1）：每個 facet 的狀態為
//   'any'                （不限制；延伸到未來可能新增的值）
//   非空陣列 [v, ...]     （Explicit Subset：明確選取的現有值）
// 這正是 §2.1 定義的可序列化形狀（client:'any' | ['codex', ...]），
// 未來接 URL / localStorage persistence（OD-5，deferred）不需改模型。
// 「Explicit All ≠ Any」（§2.4、I8）即由此二態之別保證：含全部已知值的
// Subset 仍是 Subset，不會自動折疊成 Any，新值也不會被靜默加入。

// 缺值 sentinel；與 app.js 原本的 facetValue 行為一致。
export const MISSING = '—';

// 取某 submission 在某 facet 的原始值（缺值回 sentinel）。
export function facetValue(sub, key) {
  return sub[key] || MISSING;
}

// 某 facet 在給定 submissions 中出現過的 distinct 原始值（保留首見順序；
// 顯示排序由呼叫端負責）。對應 spec §2.1「只算一次」。
export function facetValues(subs, key) {
  const seen = new Set();
  const out = [];
  for (const sub of subs) {
    const v = facetValue(sub, key);
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

// 初始全域狀態：所有 facet = Any（spec §2.1）。
export function initState(facetKeys) {
  const state = {};
  for (const key of facetKeys) state[key] = 'any';
  return state;
}

// 該 facet 是否為 Any（不限制）。
export function isAny(state, key) {
  return state[key] === 'any';
}

// 值 v 是否目前被選取（∈ Subset）；驅動 chip 的 aria-pressed（I2）。
export function isSelected(state, key, value) {
  const s = state[key];
  return s !== 'any' && s.includes(value);
}

// Normal toggle（spec §2.2a 四個 transition ＋ 取消最後一項折疊回 Any，I1）。
// 回傳「新」狀態（immutable update，不改動輸入）。
export function toggle(state, key, value) {
  const s = state[key];
  let next;
  if (s === 'any') {
    next = [value];                        // Any → Subset({v})
  } else if (!s.includes(value)) {
    next = [...s, value];                  // Subset(V) → Subset(V ∪ {v})
  } else if (s.length > 1) {
    next = s.filter(v => v !== value);     // Subset(V) → Subset(V \ {v})（仍非空）
  } else {
    next = 'any';                          // 取消最後一項 → Any（I1）
  }
  return { ...state, [key]: next };
}

// Quick Isolation（spec §2.2b、FD-2）：把該 facet 設為單值 {v}、不動其他 facet（I6）。
// 已是 Subset({v}) 時為 NO-OP（回傳同一個狀態參照，非 toggle，E8）。
export function only(state, key, value) {
  const s = state[key];
  if (s !== 'any' && s.length === 1 && s[0] === value) return state; // NO-OP
  return { ...state, [key]: [value] };
}

// Reset（spec §2.2c）：所有 facet 回 Any。回傳新狀態。
export function reset(state) {
  const out = {};
  for (const key of Object.keys(state)) out[key] = 'any';
  return out;
}

// WS3 additive helper（非 P0 transition 的改寫）：把一組值「聯集」進某 facet 的 Subset
// ——Model Family 快捷的 bulk-select（OD-WS3-4）用：選取整個系列＝把目前在場的成員加入
// 既有選擇、保留跨系列／個別多選、永不移除、去重。Any → [values]；空輸入為 NO-OP（同參照）。
// 產出仍是合法的 Any|Subset(非空) 狀態，不動既有 toggle/only/reset/visible 語義。
export function addToFacet(state, key, values) {
  if (!values || values.length === 0) return state;
  const cur = state[key] === 'any' ? [] : state[key];
  const merged = [...cur];
  for (const v of values) if (!merged.includes(v)) merged.push(v);
  return merged.length ? { ...state, [key]: merged } : state;
}

// WS3 additive：清空某個 facet（回 Any）。Active Filter Summary 的「折疊標籤一次清除整列」用；
// 個別移除仍走 toggle（移除單值、最後一項折疊回 Any）。NO-OP（已是 Any）回同參照。純函式。
export function clearFacet(state, key) {
  return state[key] === 'any' ? state : { ...state, [key]: 'any' };
}

// WS3 Faceted candidate counts（OD WS3-B）：對 facetKey 的每個值 V，回傳「在其他 facet 當前
// 約束下、facetValue===V 的 submission 數」——刻意「獨立於 facetKey 自身的選擇」（facet 內 OR
// 的候選可用性，不是 OR 合併後的可見總數；可見總數仍由 visible()/visibleCount() 權威決定）。
// 回傳 Map(value → count)；未出現的值 = 0（呼叫端顯示 0，絕不以 0 靜默取消選取）。純函式。
export function candidateCounts(subs, state, facetKeys, facetKey) {
  const others = facetKeys.filter(k => k !== facetKey);
  const passesOthers = (sub) =>
    others.every(k => state[k] === 'any' || state[k].includes(facetValue(sub, k)));
  const counts = new Map();
  for (const sub of subs) {
    if (!passesOthers(sub)) continue;
    const v = facetValue(sub, facetKey);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return counts;
}

// 可見性（spec §3.1）：Any 短路為通過；否則需命中 Subset（facet 內 OR）；
// 跨 facet 為 AND（every）。
export function visible(sub, state, facetKeys) {
  return facetKeys.every(key => {
    const s = state[key];
    return s === 'any' || s.includes(facetValue(sub, key));
  });
}

// 可見卡片數（spec §3.1 / I4）= results summary，恆等於 subs.filter(visible).length。
export function visibleCount(subs, state, facetKeys) {
  let n = 0;
  for (const sub of subs) if (visible(sub, state, facetKeys)) n++;
  return n;
}

// --- 排序（自 app.js 原樣遷入，行為等價；§6 不變量 4、§7.1 numeric-aware ＋ 缺值排最後）---

// 數字感知的字母序（讓 GPT 5.5 < GPT 5.6，而不是逐字元比較）。
export function compareText(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

// submission 的基礎標籤：model · effort · client（都缺就退回 id）。sortValue('name') 用。
export function submissionBaseLabel(sub) {
  return [sub.model, sub.effort, sub.client].filter(Boolean).join(' · ') || sub.id;
}

// 排序鍵值。'name' → 基礎標籤字串；'time' → generatedAt 的 epoch ms，無法解析回 undefined。
export function sortValue(sub, key) {
  if (key === 'name') return submissionBaseLabel(sub);
  if (key === 'time') {
    const t = Date.parse(sub.generatedAt);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

// 依 key/dir 回傳排序後的 submissions（新陣列，純函式）。
// 缺值永遠排最後（不受方向影響），平手退回原始順序（stable）。dir：1 遞增、-1 遞減。
export function sortedSubs(subs, key, dir) {
  const entries = subs.map((sub, index) => ({ sub, index, value: sortValue(sub, key) }));
  entries.sort((a, b) => {
    const aMissing = a.value == null;
    const bMissing = b.value == null;
    if (aMissing || bMissing) return (aMissing - bMissing) || (a.index - b.index);
    const cmp = typeof a.value === 'string' ? compareText(a.value, b.value) : a.value - b.value;
    return (dir * cmp) || (a.index - b.index);
  });
  return entries.map(e => e.sub);
}
