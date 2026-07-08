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
    const loadAll = el('button', 'btn', '全部載入');
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

// submission 的基礎標籤：model · effort · client（都缺就退回 id）。
function submissionBaseLabel(sub) {
  return [sub.model, sub.effort, sub.client].filter(Boolean).join(' · ') || sub.id;
}

// 標籤撞名時（同一 task 內有相同 model·effort·client）才附上唯一的 id 區分。
function chipLabel(sub, subs) {
  const base = submissionBaseLabel(sub);
  const collides = subs.filter(s => submissionBaseLabel(s) === base).length > 1;
  return collides ? `${base} · ${sub.id}` : base;
}

function sortValue(sub, key) {
  if (key === 'cost') return typeof sub.costUsd === 'number' ? sub.costUsd : undefined;
  const m = sub.metrics;
  if (!m) return undefined;
  if (key === 'total') {
    // 沒有明確 totalTokens 時，用實際會計費的三個欄位相加當總量（否則此選項對現有資料無效）。
    if (typeof m.totalTokens === 'number') return m.totalTokens;
    const parts = ['inputTokens', 'outputTokens', 'cachedInputTokens']
      .map(field => m[field])
      .filter(value => typeof value === 'number');
    return parts.length ? parts.reduce((sum, value) => sum + value, 0) : undefined;
  }
  const field = { duration: 'durationMs', input: 'inputTokens', output: 'outputTokens' }[key];
  const value = field ? m[field] : undefined;
  return typeof value === 'number' ? value : undefined;
}

// 排序直接重排 DOM 節點順序（不是只改 CSS order），讓視覺順序 = tab / 螢幕報讀順序，
// 避免鍵盤使用者排序後焦點在網格內亂跳（CSS order 只改視覺、不改 focus 順序）。
// 代價：已載入的 demo 會在重排時重載——demo 本來就是點擊才載入，尚可接受。
// 一律遞增、缺值排最後、平手退回原始順序。
function applySort(subs, cardById, key) {
  const firstCard = cardById.get(subs[0].id);
  const grid = firstCard && firstCard.parentNode;
  if (!grid) return;
  const orderedIds = key === 'default'
    ? subs.map(sub => sub.id)
    : subs
        .map((sub, index) => ({ id: sub.id, index, value: sortValue(sub, key) }))
        .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity) || a.index - b.index)
        .map(entry => entry.id);
  // append 已在文件中的節點 = 移動到尾端；依序 append 即得排序後的 DOM 次序。
  orderedIds.forEach(id => grid.append(cardById.get(id)));
}

function buildCompareControls(subs, cardById) {
  const controls = el('div', 'controls');

  // --- sort ---
  const sortLabel = el('label', 'sort-ctrl');
  sortLabel.append(el('span', 'sort-label', '排序'));
  const select = document.createElement('select');
  select.className = 'sort-select';
  [
    ['default', '預設順序'],
    ['cost', '成本 ↑'],
    ['duration', '耗時 ↑'],
    ['input', 'input tokens ↑'],
    ['output', 'output tokens ↑'],
    ['total', 'total tokens ↑']
  ].forEach(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  });
  select.addEventListener('change', () => applySort(subs, cardById, select.value));
  sortLabel.append(select);
  controls.append(sortLabel);

  // --- filter chips ---
  const count = el('span', 'filter-count');
  count.setAttribute('aria-live', 'polite');
  const updateCount = () => {
    const shown = subs.filter(sub => !cardById.get(sub.id).hidden).length;
    count.textContent = `顯示 ${shown}/${subs.length}`;
  };
  // 隱藏卡片前，若焦點還在卡內（例如被 focus 的 iframe），先把焦點移到觸發的按鈕，避免焦點掉到 body。
  const setVisible = (id, visible, focusFallback) => {
    const card = cardById.get(id);
    if (!visible && focusFallback && card.contains(document.activeElement)) focusFallback.focus();
    card.hidden = !visible;
  };

  const chips = el('div', 'filter-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', '篩選要顯示的 model');
  const chipById = new Map();
  subs.forEach(sub => {
    const chip = el('button', 'chip', chipLabel(sub, subs));
    chip.type = 'button';
    chip.setAttribute('aria-pressed', 'true');
    chip.addEventListener('click', () => {
      const next = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(next));
      setVisible(sub.id, next, chip);
      updateCount();
    });
    chipById.set(sub.id, chip);
    chips.append(chip);
  });
  controls.append(chips);

  const actions = el('div', 'filter-actions');
  const setAll = (visible, trigger) => {
    subs.forEach(sub => {
      chipById.get(sub.id).setAttribute('aria-pressed', String(visible));
      setVisible(sub.id, visible, trigger);
    });
    updateCount();
  };
  const all = el('button', 'chip-action', '全選');
  all.type = 'button';
  all.addEventListener('click', () => setAll(true, all));
  const none = el('button', 'chip-action', '全不選');
  none.type = 'button';
  none.addEventListener('click', () => setAll(false, none));
  actions.append(all, none, count);
  controls.append(actions);

  updateCount();
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

// 固定四格：時間 / input tokens / output tokens / cost，缺的顯示 —，方便橫向對比。
function renderMetrics(sub) {
  const m = sub.metrics || {};
  const row = el('div', 'card-meta');
  row.append(metric('time', formatDuration(m.durationMs), '產出耗時'));
  row.append(metric('in', formatTokens(m.inputTokens), 'input tokens'));
  row.append(metric('out', formatTokens(m.outputTokens), 'output tokens'));
  row.append(metric('cost', formatCost(sub.costUsd), '依 data/pricing.json 換算的 USD'));
  return row;
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
// 升級版本時，同步更新這兩個常數（integrity = sha384 of dist/model-viewer.min.js）。
const MODEL_VIEWER_SRC = 'https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer.min.js';
const MODEL_VIEWER_SRI = 'sha384-sr9b4Ux0WhAUGclJ0ym0FSY2zSOMmNSn0bP/SA0e6bNCrpn/5W3QL8mm+LdlQMKw';
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
