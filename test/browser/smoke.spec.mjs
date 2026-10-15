// WS2 Part B — browser-only regression smoke (Chromium). These pin contracts that
// cannot be honestly proven by DOM-free unit tests: real layout/overflow, real
// :focus-visible rendering/clipping, rendered ARIA, and moveBefore iframe-state
// preservation. Pure filter/sort logic stays in test/filter-core.test.mjs (node:test).
//
// Fixtures are the committed manifest (tasks.json → #savannah-ecosystem) served same-origin
// by static-server.mjs. Expected counts are DERIVED from that manifest (TOTAL/GROK/... below)
// with plain filters independent of filter-core, so they track the data (adding submissions
// never silently breaks them) while still discriminating a real filter/count regression.
import { test, expect } from '@playwright/test';

const TASK = '/#savannah-ecosystem';

// --- WS-GPT6: ground truth DERIVED from the committed manifest (not hardcoded) ---
import { readFileSync } from 'node:fs';
const _manifest = JSON.parse(readFileSync(new URL('../../tasks.json', import.meta.url)));
const _savSubs = (_manifest.tasks || _manifest).find(t => (t.id || t.slug) === 'savannah-ecosystem').submissions;
const TOTAL = _savSubs.length;
// mirrors CLIENT_LABELS in assets/app.js (a plain script, not an importable module)
const _CLIENT_LABELS = { 'claude-code': 'Claude', codex: 'Codex', cursor: 'Cursor', grok: 'Grok' };
const _clientLabel = (c) => _CLIENT_LABELS[c] || c;
const modelCount = (name) => _savSubs.filter(s => s.model === name).length;
const clientCount = (lbl) => _savSubs.filter(s => _clientLabel(s.client) === lbl).length;
const clientEffortCount = (lbl, e) => _savSubs.filter(s => _clientLabel(s.client) === lbl && s.effort === e).length;
const GROK = ['Grok 4.5', 'Grok 4.6', 'Grok 4.7'].reduce((n, m) => n + modelCount(m), 0);
const GPT56 = ['GPT-5.6 Luna', 'GPT-5.6 Sol', 'GPT-5.6 Terra'].reduce((n, m) => n + modelCount(m), 0);
const GROK45 = modelCount('Grok 4.5');
const GROK47 = modelCount('Grok 4.7');

// ---- A. 320px responsive overflow (WS1 contract) ---------------------------
test('A: no horizontal page overflow at a 320px viewport (not masked by overflow clipping)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(TASK);
  await page.locator('.card').first().waitFor();
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      innerW: window.innerWidth,
      rootOverflowX: getComputedStyle(de).overflowX,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      // widest element edge past the viewport (cards and their inner content)
      cardsPastEdge: [...document.querySelectorAll('.card')]
        .filter(c => c.getBoundingClientRect().right > window.innerWidth + 0.5).length,
    };
  });
  expect(m.innerW).toBe(320);                        // the viewport is actually at the tested width
  // the scrollWidth check must not be masked by a global overflow-x:hidden (owner: do not
  // globally hide overflow to conceal the defect), so assert the page is not clipping x.
  expect(m.rootOverflowX).not.toBe('hidden');
  expect(m.bodyOverflowX).not.toBe('hidden');
  expect(m.scrollW).toBeLessThanOrEqual(m.clientW);  // no horizontal scroll area
  expect(m.cardsPastEdge).toBe(0);                   // every card geometry inside the viewport
});

// ---- B. Placeholder keyboard-focus ring is inset, visible, not clipped (WS1) ----
test('B: placeholder :focus-visible is a visible inset ring inside the card containment', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 820 });
  await page.goto(TASK);
  const ph = page.locator('.card .placeholder').first();
  await ph.waitFor();
  const res = await ph.evaluate((el) => {
    el.focus({ focusVisible: true });
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let n = el.parentElement, clip = null;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowY === 'hidden') { clip = n; break; }
      n = n.parentElement;
    }
    const cr = clip ? clip.getBoundingClientRect() : null;
    return {
      focusVisible: el.matches(':focus-visible'),
      outlineStyle: cs.outlineStyle,
      outlineWidth: parseFloat(cs.outlineWidth) || 0,
      outlineOffset: parseFloat(cs.outlineOffset) || 0,
      outlineColor: cs.outlineColor,
      flushWithClip: cr ? (Math.abs(r.left - cr.left) < 1 && Math.abs(r.right - cr.right) < 1) : false,
    };
  });
  expect(res.focusVisible).toBe(true);
  expect(res.outlineStyle).not.toBe('none');
  expect(res.outlineWidth).toBeGreaterThan(0);
  // the ring must be a visible colour, not transparent / zero-alpha (an invisible ring
  // would still satisfy width/offset but fail the actual focus-visibility contract)
  expect(res.outlineColor).not.toBe('transparent');
  expect(res.outlineColor).not.toMatch(/rgba?\([^)]*,\s*0(\.0+)?\)\s*$/);
  expect(res.flushWithClip).toBe(true);               // confirms the clip hazard is real
  // The WS1 fix: a NEGATIVE outline-offset draws the ring inside the border box, so the
  // overflow:hidden ancestor cannot clip it. Reverting the fix leaves offset 0 → RED.
  expect(res.outlineOffset).toBeLessThan(0);
  expect(Math.abs(res.outlineOffset)).toBeGreaterThanOrEqual(res.outlineWidth - 0.01);
});

// ---- C. Filter ARIA: aria-pressed, Only REPLACES (discriminating) + cross-facet, reset→Any ----
test('C: filter chips reflect aria-pressed; Only replaces (not toggles) and preserves other facets; reset→Any', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  const grok = page.locator('.chip-toggle', { hasText: 'Grok 4.5' }).first();
  const count = page.locator('.filter-count');
  await grok.waitFor();

  // canonical Any: nothing pressed
  await expect(grok).toHaveAttribute('aria-pressed', 'false');
  await expect(count).toHaveText(`顯示 ${TOTAL}/${TOTAL}`);

  // toggle select → pressed + count narrows
  await grok.click();
  await expect(grok).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText(`顯示 ${GROK45}/${TOTAL}`);

  // Discriminating Only: first select client A, then Only client B. `only` must REPLACE
  // {A}→{B}; a toggle-wired handler would yield {A,B}. (From the Any initial state only()
  // and toggle() coincide, so the facet must already hold a *different* value first.)
  const onlyCheck = await page.evaluate(() => {
    const clientRow = [...document.querySelectorAll('.facet')]
      .find(f => f.querySelector('.facet-label')?.textContent?.includes('工具'));
    const chips = [...clientRow.querySelectorAll('.chip')];
    const aToggle = chips[0].querySelector('.chip-toggle');
    const bToggle = chips[1].querySelector('.chip-toggle');
    const bOnly = chips[1].querySelector('.chip-only');
    const lbl = (b) => b.childNodes[0].textContent.trim();   // chip label text node (excludes the WS3 count span)
    const aName = lbl(aToggle);
    const bName = lbl(bToggle);
    aToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // client facet = {A}
    const aSelected = aToggle.getAttribute('aria-pressed') === 'true';
    bOnly.dispatchEvent(new MouseEvent('click', { bubbles: true }));     // Only B → must be {B}
    const pressed = [...clientRow.querySelectorAll('.chip-toggle')]
      .filter(t => t.getAttribute('aria-pressed') === 'true').map(lbl);
    const grokBtn = [...document.querySelectorAll('.chip-toggle')].find(b => lbl(b) === 'Grok 4.5');
    return { aName, bName, aSelected, pressed, grokStillPressed: grokBtn.getAttribute('aria-pressed') === 'true' };
  });
  expect(onlyCheck.aSelected).toBe(true);                     // precondition: a *different* client was selected
  expect(onlyCheck.pressed).toEqual([onlyCheck.bName]);       // Only REPLACED {A} with {B} (not {A,B}, not a toggle)
  expect(onlyCheck.grokStillPressed).toBe(true);              // Only on client left the model facet intact (I6)

  // reset → every chip back to Any, full count
  await page.locator('.chip-action', { hasText: '重設篩選' }).click();
  await expect(grok).toHaveAttribute('aria-pressed', 'false');
  await expect(count).toHaveText(`顯示 ${TOTAL}/${TOTAL}`);
});

// ---- D. Sort direction ARIA + real reorder (membership preserved, no aria-pressed) ----
test('D: sort direction toggle updates its ARIA label and reorders, with no aria-pressed on the button', async ({ page }) => {
  await page.goto(TASK);
  const dirBtn = page.locator('.dir-btn');
  await dirBtn.waitFor();
  await expect(dirBtn).toHaveAttribute('aria-label', /遞增/);
  // documented PR #24 invariant: the direction button is a label toggle, NOT an aria-pressed control
  expect(await dirBtn.getAttribute('aria-pressed')).toBeNull();

  const before = await page.locator('.card:not([hidden]) .model').allTextContents();
  await dirBtn.click();
  await expect(dirBtn).toHaveAttribute('aria-label', /遞減/);
  expect(await dirBtn.getAttribute('aria-pressed')).toBeNull();
  const after = await page.locator('.card:not([hidden]) .model').allTextContents();

  expect(after).not.toEqual(before);                        // order actually changed
  expect([...after].sort()).toEqual([...before].sort());    // same membership, just reordered (not dropped/added)
});

// ---- E. Focus guard: hiding the focused card moves focus to the control, not <body> ----
test('E: filtering out the focused card moves focus to the trigger, never to <body>', async ({ page }) => {
  await page.goto(TASK);
  await page.locator('.card .placeholder').first().waitFor();
  const res = await page.evaluate(() => {
    const card0 = document.querySelector('.card');                 // Composer 2.5 (a non-Grok card)
    card0.querySelector('.placeholder').focus();                   // focus lands INSIDE the card
    const focusedInCardBefore = card0.contains(document.activeElement);
    const grok = [...document.querySelectorAll('.chip-toggle')].find(b => b.childNodes[0].textContent.trim() === 'Grok 4.5');
    // synthetic click runs the filter handler WITHOUT the browser moving focus to the button,
    // so focus is still inside card0 when applyFilter hides it — the exact precondition the guard covers.
    grok.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return {
      focusedInCardBefore,
      card0Hidden: card0.hidden,
      activeIsBody: document.activeElement === document.body,
      activeIsTrigger: document.activeElement === grok,
    };
  });
  expect(res.focusedInCardBefore).toBe(true);
  expect(res.card0Hidden).toBe(true);              // the focused card was the one filtered out
  expect(res.activeIsBody).toBe(false);            // guard: focus not dropped to <body>
  expect(res.activeIsTrigger).toBe(true);          // guard: focus moved to the triggering control
});

// ---- F1. Real sort path preserves an already-loaded submission iframe (no reload) ----
test('F1: sorting preserves the loaded submission iframe (no reload) through moveBefore', async ({ page }) => {
  await page.goto(TASK);
  const supported = await page.evaluate(() => typeof document.body.moveBefore === 'function');
  test.skip(!supported, 'moveBefore unsupported in this browser — app falls back to append (reload)');

  // The gallery renders cards only AFTER init()'s async fetch('tasks.json') resolves, which lands
  // well past page.goto's 'load' event. Without an explicit wait, the document.querySelector(
  // '.card .placeholder') in the next turn can run first and return null → .click() throws (the
  // transient race this test was prone to). Wait on the real element — never a sleep (owner F1.3) —
  // and confirm it is actionable, because the in-page DOM .click() below bypasses Playwright's own
  // actionability auto-wait. This does NOT split the click/listener attach: those stay in one
  // synchronous evaluate turn below so the initial load still cannot fire before the listener.
  const placeholder = page.locator('.card .placeholder').first();
  await placeholder.waitFor({ state: 'visible' });
  await expect(placeholder).toBeEnabled();

  // Click the placeholder AND attach the load counter in the SAME synchronous turn (the click
  // handler builds the iframe synchronously), so the initial load cannot fire before the listener.
  await page.evaluate(() => {
    document.querySelector('.card .placeholder').click();          // sync handler creates the iframe
    const f = document.querySelector('.card iframe');
    f.__marker = 'KEEP-' + Math.random().toString(36).slice(2);
    window.__iframeMarker = f.__marker;
    f.__loads = 0;
    f.addEventListener('load', () => { f.__loads++; });
  });
  // MANDATORY: the initial load must fire (throws on timeout) so the baseline is real.
  await page.waitForFunction(() => {
    const f = [...document.querySelectorAll('.card iframe')].find(x => x.__marker === window.__iframeMarker);
    return f && f.__loads >= 1;
  }, { timeout: 10000 });

  await page.locator('.dir-btn').click();                           // real sort → applySort → moveBefore
  // Generous settle window: a recreate/append reinsert reloads the iframe and fires another
  // 'load'; wait well beyond the reorder so even a delayed reload under CI load is observed.
  await page.waitForTimeout(1500);

  const res = await page.evaluate(() => {
    const f = [...document.querySelectorAll('.card iframe')].find(x => x.__marker === window.__iframeMarker);
    return {
      markerSurvived: !!f,                 // same DOM node (JS marker persists) → not recreated
      connected: f ? f.isConnected : false,
      loads: f ? f.__loads : -1,           // exactly 1 (the initial) → no reload; ≥2 → it reloaded
    };
  });
  expect(res.markerSurvived).toBe(true);
  expect(res.connected).toBe(true);
  expect(res.loads).toBe(1);                       // only the initial load — moveBefore did NOT reload it (PR #24)
});

// ---- F2. moveBefore preserves a same-origin iframe's execution-context sentinel ----
// The real submission iframe is sandboxed (opaque origin) so its contentWindow is not
// introspectable; per the owner contract we build a minimal same-origin srcdoc fixture to
// run the strongest MOVE-vs-RECREATE signal — a sentinel inside the frame — with a
// deterministic negative control (plain re-insert awaits its reload, then has lost it).
test('F2: moveBefore keeps an iframe execution-context sentinel that a plain re-insert loses', async ({ page }) => {
  await page.goto('/');
  const supported = await page.evaluate(() => typeof document.body.moveBefore === 'function');
  test.skip(!supported, 'moveBefore unsupported in this browser');

  const res = await page.evaluate(async () => {
    const grid = document.createElement('div');
    const mk = () => {
      const card = document.createElement('div');
      const f = document.createElement('iframe');
      f.srcdoc = '<!doctype html><meta charset=utf-8><title>fixture</title>'; // same-origin (inherits parent)
      card.appendChild(f);
      grid.appendChild(card);
      return { card, f };
    };
    const a = mk(), b = mk();
    document.body.appendChild(grid);
    await new Promise((r) => {
      let n = 0; const done = () => { if (++n >= 2) r(); };
      a.f.addEventListener('load', done, { once: true });
      b.f.addEventListener('load', done, { once: true });
      setTimeout(r, 2000);
    });
    // sentinel inside each frame's execution context (readable because same-origin)
    a.f.contentWindow.__sentinel = 'A-ALIVE';
    b.f.contentWindow.__sentinel = 'B-ALIVE';

    grid.moveBefore(a.card, null);                 // the state-preserving atomic move app.js uses
    const afterMove = a.f.contentWindow.__sentinel;

    // control: a plain re-insert reloads b's iframe; AWAIT that reload, then read the sentinel.
    let bReloaded = false;
    await new Promise((resolve) => {
      b.f.addEventListener('load', () => { bReloaded = true; resolve(); }, { once: true });
      grid.appendChild(b.card);
      setTimeout(resolve, 3000); // safety cap
    });
    let afterReinsert;
    try { afterReinsert = b.f.contentWindow.__sentinel; } catch { afterReinsert = 'THREW'; }

    grid.remove();
    return { afterMove, afterReinsert, bReloaded };
  });
  expect(res.afterMove).toBe('A-ALIVE');           // moveBefore preserved the execution context
  expect(res.bReloaded).toBe(true);                // the negative control actually reloaded (deterministic)
  expect(res.afterReinsert).not.toBe('B-ALIVE');   // and so lost its sentinel → oracle discriminates MOVE from RECREATE
});

// ---- G. Model Family bulk-select (WS3): per-task shortcuts, union, cross-family, reset ----
test('G: family shortcut bulk-selects a model line, preserves cross-family selection, reset clears', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK); // savannah — all three families present (>=2 members each)
  const count = page.locator('.filter-count');
  await page.locator('.family-btn').first().waitFor();

  // exactly the three declared families, in order
  const famLabels = (await page.locator('.family-btn').allTextContents()).map(s => s.trim());
  expect(famLabels).toEqual(['Grok', 'GPT-5.6', 'Opus']);
  // a family button is a bulk action, NOT a stateful toggle — it carries no aria-pressed
  expect(await page.locator('.family-btn', { hasText: 'Grok' }).getAttribute('aria-pressed')).toBeNull();

  // Grok family → its three members selected, count narrows
  await page.locator('.family-btn', { hasText: 'Grok' }).click();
  await expect(count).toHaveText(`顯示 ${GROK}/${TOTAL}`);
  const pressed1 = await page.locator('.chip-toggle[aria-pressed="true"]')
    .evaluateAll(bs => bs.map(b => b.childNodes[0].textContent.trim()));  // label node, excludes the count span
  expect(pressed1.sort()).toEqual(['Grok 4.5', 'Grok 4.6', 'Grok 4.7']);

  // cross-family union: + GPT-5.6 preserves Grok (OD-WS3-4)
  await page.locator('.family-btn', { hasText: 'GPT-5.6' }).click();
  await expect(count).toHaveText(`顯示 ${GROK + GPT56}/${TOTAL}`);
  const pressed2 = await page.locator('.chip-toggle[aria-pressed="true"]')
    .evaluateAll(bs => bs.map(b => b.childNodes[0].textContent.trim()));
  for (const m of ['Grok 4.5', 'Grok 4.6', 'Grok 4.7', 'GPT-5.6 Luna', 'GPT-5.6 Sol', 'GPT-5.6 Terra']) {
    expect(pressed2).toContain(m);
  }
  // clicking Grok again when all members present is an idempotent no-op (no dup, count stable)
  await page.locator('.family-btn', { hasText: 'Grok' }).click();
  await expect(count).toHaveText(`顯示 ${GROK + GPT56}/${TOTAL}`);

  // reset → Any
  await page.locator('.chip-action', { hasText: '重設篩選' }).click();
  await expect(count).toHaveText(`顯示 ${TOTAL}/${TOTAL}`);
  expect(await page.locator('.chip-toggle[aria-pressed="true"]').count()).toBe(0);
});

// ---- G2. The family row is per-task: absent when no family has >=2 members present ----
test('G2: a task with fewer than two members of any family shows no family row', async ({ page }) => {
  await page.goto('/#spinning-cube'); // only Opus 4.8 present (a single family member)
  await page.locator('.card').first().waitFor();
  expect(await page.locator('.family-btn').count()).toBe(0);
  expect(await page.locator('.family-row').count()).toBe(0);
});

// ---- H. Faceted candidate counts (WS3): per-value availability under OTHER facets ----
test('H: faceted counts reflect other-facet constraints; a zero count never deselects', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  await page.locator('.chip-count').first().waitFor();
  const snap = await page.evaluate(() => {
    const row = (lbl) => [...document.querySelectorAll('.facet')].find(f => f.querySelector('.facet-label')?.textContent === lbl);
    const counts = (lbl) => Object.fromEntries([...row(lbl).querySelectorAll('.chip-toggle')]
      .map(b => [b.childNodes[0].textContent.trim(), Number(b.querySelector('.chip-count').textContent)]));
    const tog = (lbl, txt) => [...row(lbl).querySelectorAll('.chip-toggle')]
      .find(b => b.childNodes[0].textContent.trim() === txt).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const initialClient = counts('工具');
    const initialEffort = counts('推理強度');
    tog('工具', 'Cursor');          // select a client with a single submission (Composer 2.5 = max)
    const effortAfterCursor = counts('推理強度');  // counts must recompute after THIS change, not only the next
    tog('推理強度', 'high');        // constrain by effort=high — Cursor has no high submission
    const cursorBtn = [...row('工具').querySelectorAll('.chip-toggle')].find(b => b.childNodes[0].textContent.trim() === 'Cursor');
    return {
      initialClient, initialEffort, effortAfterCursor,
      clientUnderHigh: counts('工具'),
      cursorPressed: cursorBtn.getAttribute('aria-pressed'),
      visible: document.querySelector('.filter-count').textContent,
    };
  });
  // initial = raw availability (all Any)
  expect(snap.initialClient['Codex']).toBe(clientCount('Codex'));
  expect(snap.initialClient['Grok']).toBe(clientCount('Grok'));
  // recomputation happens after EACH change: effort counts constrained by client=Cursor (max only)
  expect(snap.effortAfterCursor).not.toEqual(snap.initialEffort);
  expect(snap.effortAfterCursor['high']).toBe(clientEffortCount('Cursor', 'high'));  // was 6 at all-Any; Cursor has no high
  expect(snap.effortAfterCursor['max']).toBe(clientEffortCount('Cursor', 'max'));   // Cursor's single submission is max
  // under effort=high only codex/grok have high submissions; others drop to 0 (independent of client selection)
  expect(snap.clientUnderHigh['Codex']).toBe(clientEffortCount('Codex', 'high'));
  expect(snap.clientUnderHigh['Grok']).toBe(clientEffortCount('Grok', 'high'));
  expect(snap.clientUnderHigh['Cursor']).toBe(clientEffortCount('Cursor', 'high'));
  // the selected zero-count Cursor is NOT deselected → a legitimate zero result, counter authoritative
  expect(snap.cursorPressed).toBe('true');
  expect(snap.visible).toBe(`顯示 0/${TOTAL}`);
});

// ---- I. Active filter summary (WS3): derived removable tags, last→Any, collapse, reset ----
test('I: active filter summary — removable constraints, × removes one (last→Any), collapse, reset clears', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  const summary = page.locator('.filter-summary');
  await page.locator('.chip-toggle').first().waitFor();
  await expect(summary).toBeHidden();                         // all Any → no summary

  const r = await page.evaluate(() => {
    const tog = (t) => [...document.querySelectorAll('.chip-toggle')]
      .find(b => b.childNodes[0].textContent.trim() === t).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const fam = (t) => [...document.querySelectorAll('.family-btn')]
      .find(b => b.textContent.trim() === t).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const tags = () => [...document.querySelectorAll('.summary-tag .summary-text')].map(t => t.textContent);
    const removeTag = (needle) => [...document.querySelectorAll('.summary-tag')]
      .find(t => t.querySelector('.summary-text').textContent.includes(needle))
      .querySelector('.summary-x').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const pressed = (label) => [...document.querySelectorAll('.chip-toggle')]
      .find(b => b.childNodes[0].textContent.trim() === label).getAttribute('aria-pressed');

    tog('Codex'); fam('Grok');                                // client {Codex} + model {Grok 4.5,4.6,4.7}
    const afterSelect = tags();
    removeTag('模型：Grok 4.6');                               // remove one model via its summary ×
    const grok46pressed = pressed('Grok 4.6');
    const afterRemoveOne = tags();
    removeTag('工具：Codex');                                  // remove the only client → client back to Any
    const codexPressed = pressed('Codex');
    const afterRemoveLastClient = tags();
    const countAfterRemove = document.querySelector('.filter-count').textContent; // removal re-applies the filter
    const activeAfterRemove = document.activeElement.className;                   // focus must not fall to <body>
    return { afterSelect, grok46pressed, afterRemoveOne, codexPressed, afterRemoveLastClient, countAfterRemove, activeAfterRemove };
  });
  expect(r.afterSelect).toEqual(['工具：Codex', '模型：Grok 4.5', '模型：Grok 4.6', '模型：Grok 4.7']);
  expect(r.grok46pressed).toBe('false');                      // removing a summary tag unselects the main chip
  expect(r.afterRemoveOne).toEqual(['工具：Codex', '模型：Grok 4.5', '模型：Grok 4.7']);
  expect(r.codexPressed).toBe('false');
  expect(r.afterRemoveLastClient).toEqual(['模型：Grok 4.5', '模型：Grok 4.7']); // client gone (Any), models remain
  expect(r.countAfterRemove).toBe(`顯示 ${GROK45 + GROK47}/${TOTAL}`);                // removing Codex changed the visible result (not just the tags)
  expect(r.activeAfterRemove).toBe('summary-x');              // focus moved to the next × (not lost to <body>)

  // collapse: >=5 model values collapse to a single "模型：N 項" tag, whose × clears the facet
  const coll = await page.evaluate(() => {
    const fam = (t) => [...document.querySelectorAll('.family-btn')]
      .find(b => b.textContent.trim() === t).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fam('Grok'); fam('GPT-5.6');                              // >=5 model values → collapsed tag
    const collapsedTags = [...document.querySelectorAll('.summary-tag .summary-text')].map(t => t.textContent);
    [...document.querySelectorAll('.summary-tag')]            // click the collapsed × → clears the whole model facet
      .find(t => /^模型：\d+ 項$/.test(t.querySelector('.summary-text').textContent))
      .querySelector('.summary-x').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return {
      collapsedTags,
      afterCollapsedClear: [...document.querySelectorAll('.summary-tag .summary-text')].map(t => t.textContent),
      modelsPressed: document.querySelectorAll('.chip-toggle[aria-pressed="true"]').length,
    };
  });
  expect(coll.collapsedTags.some(t => /^模型：\d+ 項$/.test(t))).toBe(true);
  expect(coll.afterCollapsedClear).toEqual([]);               // the collapsed × cleared the model facet (→ Any)
  expect(coll.modelsPressed).toBe(0);

  await page.locator('.chip-action', { hasText: '重設篩選' }).click();
  await expect(summary).toBeHidden();                         // reset clears the summary
});

// ---- J. WS4-A: selected-chip focus ring flips white→dark on the emerald fill ----
// After the emerald recolour a white inset ring on a SELECTED chip is ~1.70:1 (WCAG 1.4.11
// fail), so the selected .chip-toggle must switch to a dark ring (= var(--bg)); unselected
// controls keep white. Colour-dependent by design: pins the WS4-A a11y fix from silent revert.
test('J: selected chip focus ring is dark (var(--bg)) on emerald; unselected control stays white', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  const chip = page.locator('.chip-toggle').first();
  await chip.waitFor();

  // select, then establish keyboard focus on it so :focus-visible actually matches
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await chip.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');

  const sel = await page.evaluate(() => {
    const a = document.activeElement;
    // resolve --bg (hex) to the rgb form getComputedStyle reports for outline-color
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.body.appendChild(probe);
    const bgRgb = getComputedStyle(probe).color;
    probe.remove();
    return {
      cls: a.className,
      pressed: a.getAttribute('aria-pressed'),
      focusVisible: a.matches(':focus-visible'),
      outline: getComputedStyle(a).outlineColor,
      bgRgb,
    };
  });
  expect(sel.cls).toContain('chip-toggle');
  expect(sel.pressed).toBe('true');
  expect(sel.focusVisible).toBe(true);                       // keyboard focus → :focus-visible really matched
  expect(sel.outline).toBe(sel.bgRgb);                       // dark ring = var(--bg)
  expect(sel.outline).not.toBe('rgb(255, 255, 255)');        // explicitly NOT the white ring

  // control: the adjacent unselected control (chip-only) keeps the white ring on its dark bg
  await page.keyboard.press('Tab');
  const un = await page.evaluate(() => {
    const a = document.activeElement;
    return { focusVisible: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineColor };
  });
  expect(un.focusVisible).toBe(true);
  expect(un.outline).toBe('rgb(255, 255, 255)');
});

// ---- K. WS4-A: self-hosted JetBrains Mono loads and drives the technical chrome ----
// Pins that the relative-URL self-hosted woff2 actually loads (a broken path/MIME → false)
// and is applied to metrics/labels while model names deliberately stay on the native face.
test('K: self-hosted JetBrains Mono loads and applies to metrics/labels (model names stay sans)', async ({ page }) => {
  await page.goto(TASK);
  await page.locator('.chip-toggle').first().waitFor();      // gallery rendered
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    const famOf = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily : null; };
    return {
      jbmLoaded: [...document.fonts].some(f => f.family.includes('JetBrains Mono') && f.status === 'loaded'),
      metricV: famOf('.metric-v'),
      promptLabel: famOf('.prompt-label'),
      model: famOf('.model'),
    };
  });
  expect(r.jbmLoaded).toBe(true);                            // the self-hosted woff2 actually loaded from the relative URL
  expect(r.metricV).toContain('JetBrains Mono');             // mono drives metric values
  expect(r.promptLabel).toContain('JetBrains Mono');         // and micro-labels
  expect(r.model).not.toContain('JetBrains Mono');           // model names stay on the native sans face
});
