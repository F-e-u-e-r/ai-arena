// Any / Explicit Subset 的篩選與排序純邏輯抽到 filter-core（無 DOM 副作用，與 Node test runner 共用）。
import {
  facetValues, initState, isSelected,
  toggle, only, reset, addToFacet, clearFacet, candidateCounts, visible, compareText, sortedSubs
} from './filter-core.mjs?v=11';
// WS3 Model Family — canonical registry (pure, DOM-free; OD-WS3 contract).
import { familiesInTask } from './model-registry.mjs?v=11';

'use strict';

const MANIFEST_URL = 'tasks.json';
const state = { tasks: [], activeId: null };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function init() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.tasks = await res.json();
  } catch (err) {
    renderError(err);
    return;
  }
  if (!Array.isArray(state.tasks) || state.tasks.length === 0) {
    document.getElementById('main').append(el('p', 'muted', 'tasks.json 裡還沒有任何 task。'));
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}

function currentId() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ''));
  return state.tasks.some(t => t.id === id) ? id : state.tasks[0].id;
}

function render() {
  state.activeId = currentId();
  renderSidebar();
  renderMain();
}

function renderSidebar() {
  const nav = document.getElementById('task-list');
  nav.innerHTML = '';
  state.tasks.forEach(task => {
    const link = el('a', 'task-link' + (task.id === state.activeId ? ' active' : ''));
    link.href = '#' + encodeURIComponent(task.id);
    link.append(el('span', 'task-link-title', task.title || task.id));
    link.append(el('span', 'task-link-meta', (task.submissions || []).length + ' submissions'));
    nav.append(link);
  });
}

function renderMain() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const task = state.tasks.find(t => t.id === state.activeId);
  if (!task) { main.append(el('p', 'muted', '找不到這個 task。')); return; }

  const header = el('div', 'task-header');
  header.append(el('h2', 'task-title', task.title || task.id));
  if (task.description) header.append(el('p', 'task-desc', task.description));
  if (task.prompt) {
    const box = el('div', 'prompt-box');
    const bar = el('div', 'prompt-bar');
    bar.append(el('span', 'prompt-label', 'Prompt'));
    const copy = el('button', 'copy-btn', '複製');
    copy.type = 'button';
    copy.addEventListener('click', () => copyText(task.prompt, copy));
    bar.append(copy);
    box.append(bar);
    const pre = el('pre', 'prompt-text');
    pre.append(el('code', null, task.prompt));
    box.append(pre);
    header.append(box);
  }
  main.append(header);

  const subs = task.submissions || [];
  const grid = el('div', 'grid');
  // 卡片只建立一次並以 id 索引：filter 切換 hidden（不動位置、也不重載已載入的 demo），
  // sort 重排 DOM 節點順序（視覺=focus 順序）。
  const cardById = new Map();
  subs.forEach(sub => {
    const card = makeCard(task, sub);
    cardById.set(sub.id, card);
    grid.append(card);
  });

  // filter + sort 控制：submission 有兩份以上才有意義。
  if (subs.length >= 2) main.append(buildCompareControls(subs, cardById));

  // 多個 iframe demo 一次全開可能撞到瀏覽器 WebGL context 上限，所以預設點擊才載入。
  const hasIframe = subs.some(s => (s.type || task.type || 'iframe') === 'iframe');
  const hasWebGL = subs.some(s => ['webgl', 'unity'].includes(s.runtime || task.runtime));
  if (hasIframe) {
    const toolbar = el('div', 'toolbar');
    // 「載入顯示中」而非「全部載入」：這顆只載入未被 filter 隱藏的卡片。
    const loadAll = el('button', 'btn', '載入顯示中');
    loadAll.type = 'button';
    loadAll.addEventListener('click', () => {
      // 只載入目前顯示（未被 filter 隱藏）的卡片。
      grid.querySelectorAll('.card:not([hidden]) .placeholder').forEach(b => b.click());
    });
    toolbar.append(loadAll);
    toolbar.append(el(
      'span',
      'toolbar-note',
      hasWebGL
        ? '⚠ 同時載入多個 3D demo 可能超過瀏覽器 WebGL context 上限'
        : '預覽會在獨立 iframe 中執行'
    ));
    main.append(toolbar);
  }

  main.append(grid);
}

// filter 的三個 facet：工具（client）、模型、effort。facet 內 OR、facet 間 AND。
const FILTER_FACETS = [
  { key: 'client', label: '工具' },
  { key: 'model', label: '模型' },
  { key: 'effort', label: '推理強度' }
];
// client 原始值 → 展示名；沒列在映射裡的沿用原始值（卡片 badge 仍顯示 metadata 原值）。
const CLIENT_LABELS = { 'claude-code': 'Claude', codex: 'Codex', cursor: 'Cursor', grok: 'Grok' };
// effort chip 依強度排序（不是字母序），沒見過的值排在已知檔位之後。
const EFFORT_RANK = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6, ultra: 7 };

function facetDisplay(key, value) {
  return key === 'client' ? (CLIENT_LABELS[value] || value) : value;
}

// 排序直接重排 DOM 節點順序（不是只改 CSS order），讓視覺順序 = tab / 螢幕報讀順序，
// 避免鍵盤使用者排序後焦點在網格內亂跳（CSS order 只改視覺、不改 focus 順序）。
// 搬移用 moveBefore（state-preserving atomic move），已載入的 demo 不會重載；
// 沒有 moveBefore 的瀏覽器（Safari ≤26.x、Chrome/Edge <133、Firefox <144）退回 append——
// DOM 順序一樣正確，但已載入的 demo 會重載（demo 本來就是點擊才載入，尚可接受）。
// dir：1 = 遞增、-1 = 遞減。缺值永遠排最後（不受方向影響），平手退回原始順序。
function applySort(subs, cardById, key, dir) {
  const firstCard = cardById.get(subs[0].id);
  const grid = firstCard && firstCard.parentNode;
  if (!grid) return;
  // 排序順序由 filter-core 的純函式決定（numeric-aware、缺值排最後、平手保留原序）。
  // 依序把節點移到尾端即得排序後的 DOM 次序；moveBefore(node, null) 等同 append 但保留狀態
  // （已載入的 demo 不重載，PR #24 不變量）。
  const move = typeof grid.moveBefore === 'function'
    ? (card) => grid.moveBefore(card, null)
    : (card) => grid.append(card);
  sortedSubs(subs, key, dir).forEach(sub => move(cardById.get(sub.id)));
}

function buildCompareControls(subs, cardById) {
  const controls = el('div', 'controls');

  // --- sort：key 下拉 + 升／降序切換。預設「名稱」遞增（字母序）。 ---
  // key 一律即時讀 select.value（不留 JS 副本），瀏覽器還原表單狀態時行為也一致。
  const sortState = { dir: 1 };
  const sortLabel = el('label', 'sort-ctrl');
  sortLabel.append(el('span', 'sort-label', '排序'));
  const select = document.createElement('select');
  select.className = 'sort-select';
  [
    ['name', '名稱（預設）'],
    ['time', '上傳時間']
  ].forEach(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  });
  const resort = () => applySort(subs, cardById, select.value, sortState.dir);
  select.addEventListener('change', resort);
  sortLabel.append(select);

  const dirBtn = el('button', 'dir-btn', '↑ 遞增');
  dirBtn.type = 'button';
  dirBtn.setAttribute('aria-label', '排序方向：遞增');
  dirBtn.addEventListener('click', () => {
    sortState.dir = -sortState.dir;
    const asc = sortState.dir === 1;
    dirBtn.textContent = asc ? '↑ 遞增' : '↓ 遞減';
    dirBtn.setAttribute('aria-label', '排序方向：' + (asc ? '遞增' : '遞減'));
    resort();
  });

  const sortRow = el('div', 'sort-row');
  sortRow.append(sortLabel, dirBtn);
  controls.append(sortRow);

  // --- faceted filter（Any / Explicit Subset 模型，見 docs/filtering-spec.md §2）。---
  const facetKeys = FILTER_FACETS.map(facet => facet.key);
  let filterState = initState(facetKeys);   // 初始：所有 facet = Any（不限制）
  const toggleBtns = [];                     // {key, value, btn}，供狀態變更後重繪 aria-pressed
  const countSpans = [];                     // {key, value, span}，WS3 faceted counts（跨 facet 約束下重算）

  const count = el('span', 'filter-count');
  count.setAttribute('aria-live', 'polite');
  const updateCount = () => {
    const shown = subs.filter(sub => !cardById.get(sub.id).hidden).length;
    count.textContent = `顯示 ${shown}/${subs.length}`;
  };
  // 隱藏卡片前，若焦點還在卡內（例如被 focus 的 iframe），先把焦點移到觸發的按鈕，避免焦點掉到 body。
  const setVisible = (id, isVisible, focusFallback) => {
    const card = cardById.get(id);
    if (!isVisible && focusFallback && card.contains(document.activeElement)) focusFallback.focus();
    card.hidden = !isVisible;
  };
  // filter 只切換 hidden（不重排／不重建／不重載 demo，PR #24 不變量）；可見性委派給 filter-core。
  // WS3 Active Filter Summary（OD WS3-C）：衍生自 filterState 的「已套用」摘要（不另立狀態來源）。
  const summary = el('div', 'filter-summary');
  summary.setAttribute('aria-live', 'polite');
  summary.hidden = true;
  const applyFilter = (focusFallback) => {
    subs.forEach(sub => setVisible(sub.id, visible(sub, filterState, facetKeys), focusFallback));
    updateCount();
    renderCounts();
    renderSummary();
  };
  // 依目前狀態重繪所有 chip 的 selected 樣式（Any 下全部非 pressed，I2）。
  const renderChipStates = () => {
    toggleBtns.forEach(({ key, value, btn }) =>
      btn.setAttribute('aria-pressed', String(isSelected(filterState, key, value))));
  };
  // WS3 faceted counts：每個 chip 旁顯示「在其他 facet 當前約束下」的候選可用數（獨立於自身
  // facet 的選擇）。任一 filter 變更都重算（別的 facet 會改變候選池）；0 只是資訊，永不以此
  // 取消任何選取。可見總數（顯示 X/Y）仍是權威結果。
  const renderCounts = () => {
    const byFacet = {};
    for (const facet of FILTER_FACETS) byFacet[facet.key] = candidateCounts(subs, filterState, facetKeys, facet.key);
    for (const { key, value, span } of countSpans) {
      const n = byFacet[key].get(value) || 0;
      span.textContent = String(n);
      span.classList.toggle('chip-count-zero', n === 0);
      if (span.parentElement) span.parentElement.title = n + ' 個候選（目前其他篩選條件下）';
    }
  };
  // WS3 Active Filter Summary：把目前「非 Any」的約束畫成可移除標籤——× 移除個別值（最後一項
  // 回 Any），某列選取 ≥5 時折疊成「列：N 項」單一清除（避免大量清單，OD WS3-C）。全 Any 時整列
  // 隱藏。純衍生自 filterState（不另立狀態）；移除後把焦點移到下一個 × 或重設鈕（鍵盤不丟焦點）。
  const COLLAPSE_AT = 5;
  const renderSummary = () => {
    summary.innerHTML = '';
    const active = FILTER_FACETS.filter(facet => filterState[facet.key] !== 'any');
    if (!active.length) { summary.hidden = true; return; }
    summary.hidden = false;
    summary.append(el('span', 'summary-label', '已套用：'));
    const refocus = () => { (summary.querySelector('.summary-x') || resetBtn).focus(); };
    const makeTag = (text, onRemove, removeLabel) => {
      const tag = el('span', 'summary-tag');
      tag.append(el('span', 'summary-text', text));
      const x = el('button', 'summary-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', removeLabel);
      x.title = removeLabel;
      x.addEventListener('click', () => { onRemove(); renderChipStates(); applyFilter(x); refocus(); });
      tag.append(x);
      summary.append(tag);
    };
    active.forEach(facet => {
      const vals = filterState[facet.key];
      if (vals.length >= COLLAPSE_AT) {
        makeTag(facet.label + '：' + vals.length + ' 項',
          () => { filterState = clearFacet(filterState, facet.key); },
          '清除' + facet.label + '的全部 ' + vals.length + ' 項篩選');
      } else {
        vals.forEach(value => {
          const disp = facetDisplay(facet.key, value);
          makeTag(facet.label + '：' + disp,
            () => { filterState = toggle(filterState, facet.key, value); },
            '移除 ' + facet.label + '：' + disp);
        });
      }
    });
  };

  // --- Model Family 快速選取（WS3，OD-WS3-4）---
  // 只對「本 task 實際有 ≥2 成員在場」的系列顯示（單一成員與個別 chip 重複、徒增密度）。
  // 快捷＝bulk-select convenience：把該系列目前在場成員「聯集」進 model facet（保留跨系列／
  // 個別多選、展開為固定 Explicit Subset、未來新模型不自動加入、不新增持久 family 狀態）。
  const families = familiesInTask(subs);
  if (families.length) {
    const famRow = el('div', 'facet family-row');
    famRow.append(el('span', 'facet-label', '系列'));
    const famGroup = el('div', 'family-selects');
    famGroup.setAttribute('role', 'group');
    famGroup.setAttribute('aria-label', '快速選取模型系列');
    families.forEach(fam => {
      const btn = el('button', 'family-btn', fam.label);
      btn.type = 'button';
      const desc = '選取所有 ' + fam.label + ' 模型（' + fam.values.join('、') + '）';
      btn.title = desc;
      btn.setAttribute('aria-label', desc);
      btn.addEventListener('click', () => {
        filterState = addToFacet(filterState, 'model', fam.values);  // 聯集進 model Subset
        renderChipStates();
        applyFilter(btn);
      });
      famGroup.append(btn);
    });
    famRow.append(famGroup);
    controls.append(famRow);
  }

  FILTER_FACETS.forEach(facet => {
    const values = facetValues(subs, facet.key);
    values.sort(facet.key === 'effort'
      ? (a, b) => ((EFFORT_RANK[a] ?? 99) - (EFFORT_RANK[b] ?? 99)) || compareText(a, b)
      : (a, b) => compareText(facetDisplay(facet.key, a), facetDisplay(facet.key, b)));

    const row = el('div', 'facet');
    row.append(el('span', 'facet-label', facet.label));
    const chips = el('div', 'filter-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', '篩選' + facet.label);

    values.forEach(value => {
      const display = facetDisplay(facet.key, value);
      // chip = 非互動式 wrapper，內含兩個 sibling <button>：主體 toggle ＋ 尾段 Only（§5.3，禁 nested interactive）。
      const chip = el('span', 'chip');

      const toggleBtn = el('button', 'chip-toggle', display);
      toggleBtn.type = 'button';
      toggleBtn.setAttribute('aria-pressed', 'false');   // 初始 Any → 全部非 pressed（I2）
      // WS3 faceted count：候選可用數（視覺輔助，aria-hidden；數值由 renderCounts 填入，
      // 另以 title 提供可讀說明，避免螢幕報讀器把數字當名稱的一部分重複念出）。
      const countSpan = el('span', 'chip-count');
      countSpan.setAttribute('aria-hidden', 'true');
      toggleBtn.append(countSpan);
      toggleBtn.addEventListener('click', () => {
        filterState = toggle(filterState, facet.key, value);   // §2.2a 四個 transition
        renderChipStates();
        applyFilter(toggleBtn);
      });

      // 尾段 Only：設該 facet 為單值、不動其他 facet、已隔離時 NO-OP（§2.2b、FD-2、I6）。
      const onlyBtn = el('button', 'chip-only', '◎');
      onlyBtn.type = 'button';
      onlyBtn.setAttribute('aria-label', '只看 ' + display);
      onlyBtn.title = '只看 ' + display;
      onlyBtn.addEventListener('click', () => {
        filterState = only(filterState, facet.key, value);
        renderChipStates();
        applyFilter(onlyBtn);
      });

      chip.append(toggleBtn, onlyBtn);
      chips.append(chip);
      toggleBtns.push({ key: facet.key, value, btn: toggleBtn });
      countSpans.push({ key: facet.key, value, span: countSpan });
    });
    row.append(chips);
    controls.append(row);
  });

  // 控制列：單一 Reset（取代舊「全選／全不選」）＋ 可見數 ＋ 提示（§5.4）。
  const actions = el('div', 'filter-actions');
  const resetBtn = el('button', 'chip-action', '重設篩選');
  resetBtn.type = 'button';
  resetBtn.addEventListener('click', () => {
    filterState = reset(filterState);        // §2.2c：全部回 Any
    renderChipStates();
    applyFilter(resetBtn);
  });
  // 一行 compact legend（§5.4 提示文字擴充）：明確標示「點名稱＝複選、◎＝只看此項且不影響其他列」，
  // 讓 Only 的 ◎ 不再只靠 icon／tooltip 被發現；末段沿用原跨 facet AND 提示精神。
  const hint = el('span', 'filter-hint');
  hint.append('點名稱可複選 · ');
  hint.append(el('span', 'legend-only', '◎'));
  hint.append(' 只看此項（不影響其他列）· 不同列的條件須同時符合');
  actions.append(resetBtn, count, hint);
  controls.append(summary);   // WS3「已套用」摘要（放在 facet 與 actions 之間；全 Any 時隱藏）
  controls.append(actions);

  updateCount();
  renderCounts();   // WS3：初始就填入 faceted 候選數（全 Any → 各值的原始可用數）
  renderSummary();  // WS3：初始全 Any → 摘要隱藏
  resort(); // 初始就套用預設排序（名稱 A→Z），卡片此時都已在 grid 裡。
  return controls;
}

function makeCard(task, sub) {
  const type = sub.type || task.type || 'iframe';
  const card = el('div', 'card');

  const head = el('div', 'card-head');
  head.append(el('span', 'model', sub.model || 'Unknown'));
  if (sub.provider) head.append(el('span', 'badge provider', sub.provider));
  if (sub.effort) head.append(el('span', 'badge effort ' + effortClass(sub.effort), sub.effort));
  if (sub.client) head.append(el('span', 'badge client ' + clientClass(sub.client), sub.client));
  if (sub.label) head.append(el('span', 'badge', sub.label));
  const byline = submissionByline(sub);
  if (byline) head.append(byline);
  card.append(head);

  const body = el('div', 'card-body');
  renderMedia(body, type, sub);
  card.append(body);

  card.append(renderMetrics(sub));
  return card;
}

// 固定兩排：第一排 時間 / input tokens / output tokens / cost，第二排 skills / sub-agents
// （執行設定，各跨兩欄）。缺的顯示 —，方便橫向對比。
function renderMetrics(sub) {
  const m = sub.metrics || {};
  const row = el('div', 'card-meta');
  row.append(metric('time', formatDuration(m.durationMs), '產出耗時'));
  row.append(metric('in', formatTokens(m.inputTokens), 'input tokens'));
  row.append(metric('out', formatTokens(m.outputTokens), 'output tokens'));
  row.append(metric('cost', formatCost(sub.costUsd), '依 data/pricing.json 換算的 USD'));
  // 「Nil」= 明確回報未使用；缺欄位（顯示 —）= 未回報。tooltip 帶上完整值，
  // 因為 .metric-v 會把過長的清單截成省略號。
  row.append(runConfigMetric('skills', sub.skills, '執行時掛載的 skills'));
  row.append(runConfigMetric('sub-agents', sub.subagents, '用於 cross-check 的 sub-agents'));
  return row;
}

function runConfigMetric(key, value, label) {
  const title = label + '：' + (value == null ? '未回報' : value) + '（Nil = 明確未使用）';
  const cell = metric(key, value, title);
  cell.classList.add('metric-wide');
  return cell;
}

function metric(key, value, title) {
  const cell = el('div', 'metric');
  if (title) cell.title = title;
  cell.append(el('span', 'metric-k', key));
  cell.append(el('span', 'metric-v', value == null ? '—' : value));
  return cell;
}

function clientClass(client) {
  return 'client-' + String(client).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function effortClass(effort) {
  return 'effort-' + String(effort).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

function authorLink(author) {
  if (!author) return null;
  const handle = String(author).replace(/^@/, '');
  const a = el('a', 'author', '@' + handle);
  // 只有合法的 GitHub handle 才變成連結，避免注入奇怪的 href。
  if (/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(handle)) {
    a.href = 'https://github.com/' + handle;
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

function submissionByline(sub) {
  const generatedAt = formatUtcMinute(sub.generatedAt);
  const author = authorLink(sub.author);
  if (!generatedAt && !author) return null;

  const byline = el('div', 'submission-byline');
  if (generatedAt) {
    const time = el('time', 'generated-at', generatedAt + (author ? ' ' : ''));
    const parsed = new Date(sub.generatedAt);
    time.dateTime = parsed.toISOString();
    time.title = 'Generated at ' + generatedAt + ' UTC';
    byline.append(time);
  }
  if (author) byline.append(author);
  return byline;
}

function formatUtcMinute(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate())
  ].join('-') + ' ' + pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes());
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDuration(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return null;
  if (ms < 1000) return ms + ' ms';
  const s = ms / 1000;
  if (s < 60) return (s < 10 ? s.toFixed(1) : Math.round(s)) + ' s';
  const totalSec = Math.round(s);
  const m = Math.floor(totalSec / 60);
  if (m < 60) return m + 'm ' + (totalSec % 60) + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

function formatTokens(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  return n.toLocaleString('en-US');
}

function formatCost(usd) {
  if (typeof usd !== 'number' || !isFinite(usd)) return null;
  if (usd === 0) return '$0';
  if (usd >= 1) return '$' + usd.toFixed(2);
  if (usd >= 0.01) return '$' + usd.toFixed(3);
  return '$' + usd.toFixed(4);
}

function copyText(text, btn) {
  const restore = () => {
    btn.textContent = '複製';
    btn.disabled = false;
  };
  const done = () => {
    btn.textContent = '已複製';
    btn.disabled = true;
    setTimeout(restore, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (_) { /* 忽略：使用者可手動選取 */ }
  ta.remove();
}

function renderMedia(body, type, sub) {
  // iframe 一律以 path（repo 內容）為準，不讓 src 有優先權——與 build-manifest.mjs
  // 禁止 iframe src 的規則對齊，作為前端的第二層防護。其他 media 型別才用 src。
  const src = (type === 'iframe' ? (sub.path || sub.src) : (sub.src || sub.path)) || '';
  switch (type) {
    case 'image': {
      const img = el('img');
      img.loading = 'lazy';
      img.src = src;
      img.alt = sub.model || 'output';
      body.append(img);
      break;
    }
    case 'video': {
      const v = document.createElement('video');
      v.controls = true;
      v.preload = 'none';
      if (sub.poster) v.poster = sub.poster;
      const s = document.createElement('source');
      s.src = src;
      v.append(s);
      body.append(v);
      break;
    }
    case 'model-viewer': {
      ensureModelViewer();
      const mv = document.createElement('model-viewer');
      mv.setAttribute('src', src);
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('auto-rotate', '');
      mv.setAttribute('reveal', 'interaction');
      mv.setAttribute('loading', 'lazy');
      if (sub.poster) mv.setAttribute('poster', sub.poster);
      body.append(mv);
      break;
    }
    case 'iframe':
    default:
      lazyIframe(body, src);
  }
}

function lazyIframe(body, src) {
  const ph = el('button', 'placeholder');
  ph.type = 'button';
  ph.append(el('span', 'play', '▶'));
  ph.append(el('span', 'ph-text', '載入預覽'));
  ph.append(el('span', 'ph-sub', '點擊執行 demo'));
  ph.addEventListener('click', () => {
    body.innerHTML = '';

    const bar = el('div', 'frame-bar');
    const open = el('a', 'frame-btn', '↗ 開新分頁');
    open.href = src;
    open.target = '_blank';
    open.rel = 'noopener';
    const reload = el('button', 'frame-btn', '↻ 重載');
    reload.type = 'button';
    bar.append(open, reload);

    const frame = document.createElement('iframe');
    frame.src = src;
    frame.loading = 'lazy';
    frame.title = src;
    // sandbox：隔離各份產出，避免它影響到 gallery 本身。allow-scripts 足以跑 Three.js / Canvas。
    frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    reload.addEventListener('click', () => { frame.src = frame.src; });

    body.append(bar, frame);
  });
  body.append(ph);
}

// 這支 script 跑在 gallery 自身的 origin（不像 submission 是隔離在 sandbox iframe 內），
// 所以 pin 到明確版本並加 SRI：即使 unpkg 或套件被投毒，雜湊對不上瀏覽器就會拒絕執行。
// 升級版本時，同步更新這兩個常數（integrity = sha384 of dist/model-viewer.min.js，
// 計算：`openssl dgst -sha384 -binary dist/model-viewer.min.js | openssl base64 -A`），並更新
// test/fixtures/model-viewer-<ver>.* ；test/model-viewer-sri.test.mjs 會用 fixture 位元組重算
// 雜湊比對這個常數，瀏覽器測試 test/browser/model-viewer-sri.spec.mjs 則驗證真的載得進來。
// 歷史：2026-07-08 的常數取自 4.0.0 的檔案而 URL 釘 4.3.1，瀏覽器一律拒載；2026-10-27 修正（PR #47）並同日
// 升級至 4.4.0（digest 由 npm tarball / unpkg / jsDelivr 三路位元相同的 dist/model-viewer.min.js 重算；見 fixture provenance）。
const MODEL_VIEWER_SRC = 'https://unpkg.com/@google/model-viewer@4.4.0/dist/model-viewer.min.js';
const MODEL_VIEWER_SRI = 'sha384-wjsPzEO+lXOf7d9csIDfAQpPt2OKuUU3m0K9qsdKIuzX4N8czSF6hdh23eAbZa3p';
let mvLoaded = false;
function ensureModelViewer() {
  if (mvLoaded) return;
  mvLoaded = true;
  const s = document.createElement('script');
  s.type = 'module';
  s.src = MODEL_VIEWER_SRC;
  s.integrity = MODEL_VIEWER_SRI;
  s.crossOrigin = 'anonymous';
  document.head.append(s);
}

function renderError(err) {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const box = el('div', 'error-box');
  box.append(el('h2', null, '無法載入 tasks.json'));
  const p = el('p');
  if (location.protocol === 'file:') {
    p.append(document.createTextNode('你正在用 file:// 直接開啟，瀏覽器會擋掉 fetch 本地檔案。請改用 local server：在專案資料夾執行 '));
    p.append(el('code', null, 'python3 -m http.server 8000'));
    p.append(document.createTextNode(' 再開 http://localhost:8000'));
  } else {
    p.textContent = '錯誤：' + err.message;
  }
  box.append(p);
  main.append(box);
}

init();
