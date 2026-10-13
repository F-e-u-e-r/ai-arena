// WS2 Part B — browser-only regression smoke (Chromium). These pin contracts that
// cannot be honestly proven by DOM-free unit tests: real layout/overflow, real
// :focus-visible rendering/clipping, rendered ARIA, and moveBefore iframe-state
// preservation. Pure filter/sort logic stays in test/filter-core.test.mjs (node:test).
//
// Fixtures are the committed, deterministic manifest (tasks.json → #savannah-ecosystem,
// 17 submissions, 5 clients, 13 models) served same-origin by static-server.mjs.
import { test, expect } from '@playwright/test';

const TASK = '/#savannah-ecosystem';

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
  await expect(count).toHaveText('顯示 17/17');

  // toggle select → pressed + count narrows
  await grok.click();
  await expect(grok).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText('顯示 1/17');

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
  await expect(count).toHaveText('顯示 17/17');
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
  await expect(count).toHaveText('顯示 3/17');
  const pressed1 = await page.locator('.chip-toggle[aria-pressed="true"]')
    .evaluateAll(bs => bs.map(b => b.childNodes[0].textContent.trim()));  // label node, excludes the count span
  expect(pressed1.sort()).toEqual(['Grok 4.5', 'Grok 4.6', 'Grok 4.7']);

  // cross-family union: + GPT-5.6 preserves Grok (OD-WS3-4)
  await page.locator('.family-btn', { hasText: 'GPT-5.6' }).click();
  await expect(count).toHaveText('顯示 9/17');
  const pressed2 = await page.locator('.chip-toggle[aria-pressed="true"]')
    .evaluateAll(bs => bs.map(b => b.childNodes[0].textContent.trim()));
  for (const m of ['Grok 4.5', 'Grok 4.6', 'Grok 4.7', 'GPT-5.6 Luna', 'GPT-5.6 Sol', 'GPT-5.6 Terra']) {
    expect(pressed2).toContain(m);
  }
  // clicking Grok again when all members present is an idempotent no-op (no dup, count stable)
  await page.locator('.family-btn', { hasText: 'Grok' }).click();
  await expect(count).toHaveText('顯示 9/17');

  // reset → Any
  await page.locator('.chip-action', { hasText: '重設篩選' }).click();
  await expect(count).toHaveText('顯示 17/17');
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
    tog('工具', 'Cursor');          // select a client with a single submission
    tog('推理強度', 'high');        // constrain by effort=high — Cursor has no high submission
    const cursorBtn = [...row('工具').querySelectorAll('.chip-toggle')].find(b => b.childNodes[0].textContent.trim() === 'Cursor');
    return {
      initialClient,
      clientUnderHigh: counts('工具'),
      cursorPressed: cursorBtn.getAttribute('aria-pressed'),
      visible: document.querySelector('.filter-count').textContent,
    };
  });
  // initial = raw availability (all Any)
  expect(snap.initialClient['Codex']).toBe(8);
  expect(snap.initialClient['Grok']).toBe(3);
  // under effort=high only codex/grok have high submissions; others drop to 0 (independent of client selection)
  expect(snap.clientUnderHigh['Codex']).toBe(3);
  expect(snap.clientUnderHigh['Grok']).toBe(3);
  expect(snap.clientUnderHigh['Cursor']).toBe(0);
  // the selected zero-count Cursor is NOT deselected → a legitimate zero result, counter authoritative
  expect(snap.cursorPressed).toBe('true');
  expect(snap.visible).toBe('顯示 0/17');
});
