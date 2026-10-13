// WS2 Part B — browser-only regression smoke (Chromium). These pin contracts that
// cannot be honestly proven by DOM-free unit tests: real layout/overflow, real
// :focus-visible rendering/clipping, rendered ARIA, and moveBefore iframe-state
// preservation. Pure filter/sort logic stays in test/filter-core.test.mjs (node:test).
//
// Fixtures are the committed, deterministic manifest (tasks.json → #savannah-ecosystem,
// 17 submissions) served same-origin by test/browser/static-server.mjs.
import { test, expect } from '@playwright/test';

const TASK = '/#savannah-ecosystem';

// ---- A. 320px responsive overflow (WS1 contract) ---------------------------
test('A: no horizontal page overflow at a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(TASK);
  await page.locator('.card').first().waitFor();
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    innerW: window.innerWidth,
    cardsPastEdge: [...document.querySelectorAll('.card')]
      .filter(c => c.getBoundingClientRect().right > window.innerWidth + 0.5).length,
  }));
  expect(m.scrollW).toBeLessThanOrEqual(m.clientW);  // no horizontal scroll area
  expect(m.cardsPastEdge).toBe(0);                   // every card geometry inside the viewport
});

// ---- B. Placeholder keyboard-focus ring is inset, not clipped (WS1 contract) ----
test('B: placeholder :focus-visible uses an inset ring inside the card containment', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 820 });
  await page.goto(TASK);
  const ph = page.locator('.card .placeholder').first();
  await ph.waitFor();
  const res = await ph.evaluate((el) => {
    el.focus({ focusVisible: true });
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // nearest overflow:hidden ancestor (the card-body / card that would clip an outward ring)
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
      // placeholder fills card-body at inset:0, so its box coincides with the clip box
      flushWithClip: cr ? (Math.abs(r.left - cr.left) < 1 && Math.abs(r.right - cr.right) < 1) : false,
    };
  });
  expect(res.focusVisible).toBe(true);
  expect(res.outlineStyle).not.toBe('none');
  expect(res.outlineWidth).toBeGreaterThan(0);
  expect(res.flushWithClip).toBe(true);               // confirms the clip hazard is real
  // The WS1 fix: a NEGATIVE outline-offset draws the ring inside the border box, so the
  // overflow:hidden ancestor cannot clip it. Reverting the fix leaves offset 0 → RED.
  expect(res.outlineOffset).toBeLessThan(0);
  expect(Math.abs(res.outlineOffset)).toBeGreaterThanOrEqual(res.outlineWidth - 0.01);
});

// ---- C. Filter ARIA: aria-pressed, Only cross-facet preservation, reset → Any ----
test('C: filter chips reflect aria-pressed; Only preserves other facets; reset restores Any', async ({ page }) => {
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

  // Only on a *client* value must NOT clear the model (Grok 4.5) selection (cross-facet I6)
  const preserved = await page.evaluate(() => {
    const facets = [...document.querySelectorAll('.facet')];
    const clientRow = facets.find(f => f.querySelector('.facet-label')?.textContent?.includes('工具'));
    const firstOnly = clientRow.querySelector('.chip-only');
    const clientVal = clientRow.querySelector('.chip-toggle').textContent.trim();
    firstOnly.dispatchEvent(new MouseEvent('click', { bubbles: true })); // synthetic: no focus steal
    const grokBtn = [...document.querySelectorAll('.chip-toggle')].find(b => b.textContent.trim() === 'Grok 4.5');
    const clientPressedCount = [...clientRow.querySelectorAll('.chip-toggle')]
      .filter(b => b.getAttribute('aria-pressed') === 'true').length;
    return { grokStillPressed: grokBtn.getAttribute('aria-pressed') === 'true', clientPressedCount, clientVal };
  });
  expect(preserved.grokStillPressed).toBe(true);   // Only on client left the model facet intact
  expect(preserved.clientPressedCount).toBe(1);    // Only isolated exactly one client value

  // reset → every chip back to Any, full count
  await page.locator('.chip-action', { hasText: '重設篩選' }).click();
  await expect(grok).toHaveAttribute('aria-pressed', 'false');
  await expect(count).toHaveText('顯示 17/17');
});

// ---- D. Sort direction ARIA + visible reorder ------------------------------
test('D: sort direction toggle updates its ARIA label and actually reorders', async ({ page }) => {
  await page.goto(TASK);
  const dirBtn = page.locator('.dir-btn');
  await dirBtn.waitFor();
  await expect(dirBtn).toHaveAttribute('aria-label', /遞增/);
  const firstBefore = await page.locator('.card:not([hidden]) .model').first().textContent();
  await dirBtn.click();
  await expect(dirBtn).toHaveAttribute('aria-label', /遞減/);
  const firstAfter = await page.locator('.card:not([hidden]) .model').first().textContent();
  expect(firstAfter).not.toBe(firstBefore);        // ascending vs descending changed the visible order
});

// ---- E. Focus guard: hiding the focused card moves focus to the control, not body ----
test('E: filtering out the focused card moves focus to the trigger, never to <body>', async ({ page }) => {
  await page.goto(TASK);
  await page.locator('.card .placeholder').first().waitFor();
  const res = await page.evaluate(() => {
    const card0 = document.querySelector('.card');                 // Composer 2.5 (a non-Grok card)
    card0.querySelector('.placeholder').focus();                   // focus lands INSIDE the card
    const focusedInCardBefore = card0.contains(document.activeElement);
    const grok = [...document.querySelectorAll('.chip-toggle')].find(b => b.textContent.trim() === 'Grok 4.5');
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

  await page.locator('.card .placeholder').first().click();        // load first card's iframe
  await page.locator('.card iframe').first().waitFor();
  // tag the iframe node (JS property survives a MOVE but not a RECREATE) + count reloads
  await page.evaluate(() => {
    const f = document.querySelector('.card iframe');
    f.__marker = 'KEEP-' + Math.random().toString(36).slice(2);
    window.__iframeMarker = f.__marker;
    f.__reloads = 0;
    f.addEventListener('load', () => { f.__reloads++; });
  });
  // let the initial load fire, then zero the baseline
  await page.waitForFunction(() => {
    const f = [...document.querySelectorAll('.card iframe')].find(x => x.__marker === window.__iframeMarker);
    return f && f.__reloads >= 1;
  }, { timeout: 5000 }).catch(() => { /* some frames fire load before the listener; baseline-reset still valid */ });
  await page.evaluate(() => {
    const f = [...document.querySelectorAll('.card iframe')].find(x => x.__marker === window.__iframeMarker);
    if (f) f.__reloads = 0;
  });

  await page.locator('.dir-btn').click();                           // real sort → applySort → moveBefore
  await page.waitForTimeout(400);                                   // allow any (unexpected) reload to surface

  const res = await page.evaluate(() => {
    const f = [...document.querySelectorAll('.card iframe')].find(x => x.__marker === window.__iframeMarker);
    return {
      markerSurvived: !!f,                 // same DOM node (JS marker persists) → not recreated
      connected: f ? f.isConnected : false,
      reloads: f ? f.__reloads : -1,       // 0 → moveBefore preserved it; ≥1 → it reloaded (append fallback / recreate)
    };
  });
  expect(res.markerSurvived).toBe(true);
  expect(res.connected).toBe(true);
  expect(res.reloads).toBe(0);                     // the PR #24 moveBefore no-reload invariant
});

// ---- F2. moveBefore preserves a same-origin iframe's execution-context sentinel ----
// The real submission iframe is sandboxed (opaque origin) so its contentWindow is not
// introspectable; per the owner contract we build a minimal same-origin srcdoc fixture to
// run the strongest MOVE-vs-RECREATE signal — a sentinel inside the frame — with a negative
// control (plain re-insert) that reloads and loses it.
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

    grid.appendChild(b.card);                       // control: plain re-insert reloads the iframe
    await new Promise((r) => setTimeout(r, 300));
    let afterReinsert;
    try { afterReinsert = b.f.contentWindow.__sentinel; } catch { afterReinsert = 'THREW'; }

    grid.remove();
    return { afterMove, afterReinsert };
  });
  expect(res.afterMove).toBe('A-ALIVE');           // moveBefore preserved the execution context
  expect(res.afterReinsert).not.toBe('B-ALIVE');   // plain re-insert reloaded it → sentinel gone (oracle discriminates)
});
