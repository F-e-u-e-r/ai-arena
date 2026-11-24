// WS2 Part B — browser-only regression smoke (Chromium). These pin contracts that
// cannot be honestly proven by DOM-free unit tests: real layout/overflow, real
// :focus-visible rendering/clipping, rendered ARIA, and moveBefore iframe-state
// preservation. Pure filter/sort logic stays in test/filter-core.test.mjs (node:test).
//
// Fixtures are the committed manifest (tasks.json → #savannah-ecosystem) served same-origin
// by static-server.mjs. Expected counts are DERIVED from that manifest (TOTAL/GROK45/... below)
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
const effortCount = (e) => _savSubs.filter(s => s.effort === e).length;
const clientEffortCount = (lbl, e) => _savSubs.filter(s => _clientLabel(s.client) === lbl && s.effort === e).length;
const GROK45 = modelCount('Grok 4.5');

// The chip toggle whose visible label is exactly `label` (its first text node — the WS3 count span and the
// CSS ✓ are excluded), as a real-click Locator. Labels are unique across the three facets in the fixture
// (tool names / model names / effort levels never collide), which this lookup also asserts.
async function chipToggle(page, label) {
  const idx = await page.evaluate((t) => {
    const all = [...document.querySelectorAll('.chip-toggle')];
    const hits = all.map((b, i) => (b.childNodes[0].textContent.trim() === t ? i : -1)).filter(i => i >= 0);
    return hits.length === 1 ? hits[0] : -hits.length - 1;
  }, label);
  expect(idx, `exactly one chip labelled "${label}"`).toBeGreaterThanOrEqual(0);
  return page.locator('.chip-toggle').nth(idx);
}

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

  // reset (清除全部 — the single Reset, in the 已篩選 row) → every chip back to Any, full count
  await page.locator('.chip-action', { hasText: '清除全部' }).click();
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

// ---- G. 系列 row removed (2026-11-24 Owner UX pass): exactly 工具 / 模型 / 推理強度, sort row separate ----
// Supersedes the WS3 family-shortcut tests. The three labels are asserted positively (an unrendered or
// partial control block fails too, not just a leftover 系列 row), across every task that renders controls.
test('G: no 系列 row in any task — exactly 工具/模型/推理強度 facet rows, with the sort row first and separate', async ({ page }) => {
  const withControls = _manifest.filter(t => (t.submissions || []).length >= 2);   // controls need ≥2 submissions
  expect(withControls.length).toBeGreaterThan(0);
  for (const t of withControls) {
    await page.goto('/#' + encodeURIComponent(t.id));
    await expect(page.locator('.task-title')).toHaveText(t.title || t.id);
    await page.locator('.controls .chip-toggle').first().waitFor();
    const r = await page.evaluate(() => {
      const controls = document.querySelector('.controls');
      const sort = controls.querySelector('.sort-row');
      const firstFacet = controls.querySelector('.facet');
      return {
        labels: [...controls.querySelectorAll('.facet > .facet-label')].map(l => l.textContent),
        familyNodes: controls.querySelectorAll('.family-btn, .family-row, .family-selects').length,
        seriesText: controls.textContent.includes('系列'),
        sortFirst: !!sort && sort === controls.firstElementChild &&
          !!(sort.compareDocumentPosition(firstFacet) & Node.DOCUMENT_POSITION_FOLLOWING),
        sortHasChips: !!sort && !!sort.querySelector('.chip'),
      };
    });
    expect(r.labels, t.id).toEqual(['工具', '模型', '推理強度']);
    expect(r.familyNodes, t.id).toBe(0);
    expect(r.seriesText, t.id).toBe(false);
    expect(r.sortFirst, t.id).toBe(true);
    expect(r.sortHasChips, t.id).toBe(false);
  }
});

// ---- G2. Counts derive from the canonical records: removing 系列 (never a facet) changed no count ----
test('G2: all-Any chip counts equal the per-value manifest tallies and each facet row sums to the task total', async ({ page }) => {
  await page.goto(TASK);
  await page.locator('.chip-count').first().waitFor();
  const shown = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.controls .facet')].map(f => [
    f.querySelector('.facet-label').textContent,
    Object.fromEntries([...f.querySelectorAll('.chip-toggle')].map(b =>
      [b.childNodes[0].textContent.trim(), Number(b.querySelector('.chip-count').textContent)])),
  ])));
  const tally = (key) => _savSubs.reduce((m, s) => { const k = key(s) || '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
  expect(shown['工具']).toEqual(tally(s => _clientLabel(s.client)));
  expect(shown['模型']).toEqual(tally(s => s.model));
  expect(shown['推理強度']).toEqual(tally(s => s.effort));
  for (const row of ['工具', '模型', '推理強度']) {
    expect(Object.values(shown[row]).reduce((a, b) => a + b, 0), `${row} partitions every record`).toBe(TOTAL);
  }
  await expect(page.locator('.filter-count')).toHaveText(`顯示 ${TOTAL}/${TOTAL}`);
});

// ---- M. 工具 / 模型 / 推理強度 each filter; same-facet multi-select ORs; cross-facet ANDs (P0 semantics) ----
test('M: each of 工具/模型/推理強度 filters; same-facet multi-select is OR; cross-facet is AND', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  const count = page.locator('.filter-count');
  await page.locator('.chip-toggle').first().waitFor();

  await (await chipToggle(page, 'Codex')).click();                                   // 工具
  await expect(count).toHaveText(`顯示 ${clientCount('Codex')}/${TOTAL}`);
  await (await chipToggle(page, 'Codex')).click();                                   // last value → Any
  await expect(count).toHaveText(`顯示 ${TOTAL}/${TOTAL}`);

  await (await chipToggle(page, 'high')).click();                                    // 推理強度
  await expect(count).toHaveText(`顯示 ${effortCount('high')}/${TOTAL}`);
  await (await chipToggle(page, 'high')).click();

  await (await chipToggle(page, 'GPT-6 Astra')).click();                             // 模型
  await expect(count).toHaveText(`顯示 ${modelCount('GPT-6 Astra')}/${TOTAL}`);
  await (await chipToggle(page, 'Grok 4.7')).click();                                // same-facet OR
  await expect(count).toHaveText(`顯示 ${modelCount('GPT-6 Astra') + modelCount('Grok 4.7')}/${TOTAL}`);
  await (await chipToggle(page, 'max')).click();                                     // cross-facet AND
  const expected = _savSubs.filter(s => ['GPT-6 Astra', 'Grok 4.7'].includes(s.model) && s.effort === 'max');
  expect(expected.length).toBeGreaterThan(0);                                        // non-vacuous intersection …
  expect(expected.length).toBeLessThan(modelCount('GPT-6 Astra') + modelCount('Grok 4.7')); // … that actually narrows
  await expect(count).toHaveText(`顯示 ${expected.length}/${TOTAL}`);
  expect((await page.locator('.card:not([hidden]) .model').allTextContents()).sort())   // the cards, not just the counter
    .toEqual(expected.map(s => s.model).sort());
});

// ---- N. Only: quiet but ALWAYS present (OD-3 禁 hover-only / §5.3 常駐可見), brighter on hover/focus,
//          keyboard-operable, isolates one facet ----
test('N: Only stays present at reduced weight, brightens on chip hover/keyboard focus, and works from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  await page.locator('.chip-only').first().waitFor();
  await page.mouse.move(0, 0);

  // structure: every chip = sibling toggle + Only in a non-interactive wrapper; Only named 「只看 {值}」
  const chips = await page.evaluate(() => [...document.querySelectorAll('.controls .chip')].map(c => ({
    kids: [...c.children].map(k => k.tagName + '.' + k.className),
    label: c.querySelector('.chip-toggle').childNodes[0].textContent.trim(),
    onlyName: c.querySelector('.chip-only') && c.querySelector('.chip-only').getAttribute('aria-label'),
    nested: c.querySelectorAll('button button').length,
  })));
  expect(chips.length).toBeGreaterThan(0);
  for (const c of chips) {
    expect(c.kids).toEqual(['BUTTON.chip-toggle', 'BUTTON.chip-only']);
    expect(c.onlyName).toBe('只看 ' + c.label);
    expect(c.nested).toBe(0);
  }

  // WCAG contrast of the Only glyph / the label, each composited over the chip's own opaque surface
  const look = (label) => page.evaluate((label) => {
    const parse = (c) => { const p = c.match(/rgba?\(([^)]+)\)/)[1].split(/\s*,\s*/).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
    const over = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
    const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const btn = [...document.querySelectorAll('.chip-toggle')].find(b => b.childNodes[0].textContent.trim() === label);
    const chip = btn.parentElement, only = chip.querySelector('.chip-only');
    const os = getComputedStyle(only), bg = parse(getComputedStyle(chip).backgroundColor);
    const r = only.getBoundingClientRect();
    return {
      shown: os.display !== 'none' && os.visibility === 'visible' && Number(os.opacity) === 1,
      w: r.width, h: r.height,
      onlyRatio: ratio(over(parse(os.color), bg), bg),
      labelRatio: ratio(over(parse(getComputedStyle(btn).color), bg), bg),
      sepAlpha: parse(os.borderLeftColor)[3],
    };
  }, label);

  const rest = await look('Codex');
  expect(rest.shown).toBe(true);                                // never hidden — not hover-only
  expect(rest.w).toBeGreaterThanOrEqual(24);                    // WCAG 2.5.8 target
  expect(rest.h).toBeGreaterThanOrEqual(24);
  expect(rest.onlyRatio).toBeGreaterThanOrEqual(3);             // WCAG 1.4.11 non-text contrast, even at rest
  expect(rest.onlyRatio).toBeLessThan(rest.labelRatio);         // secondary to the chip label
  expect(rest.sepAlpha).toBe(0);                                // no separator line at rest (less noise)

  await (await chipToggle(page, 'Codex')).hover();              // hovering the chip (its label) …
  const hovered = await look('Codex');
  expect(hovered.onlyRatio).toBeGreaterThan(rest.onlyRatio);    // … brightens the Only glyph
  expect(hovered.sepAlpha).toBeGreaterThan(0);                  // … and draws its separator
  await page.mouse.move(0, 0);

  // keyboard: Tab-focus the toggle (focus-visible) → its Only brightens; Tab → Only; Enter isolates; Enter again NO-OP
  await (await chipToggle(page, 'Codex')).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect((await look('Codex')).onlyRatio).toBeGreaterThan(rest.onlyRatio);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).toBe('只看 Codex');
  await (await chipToggle(page, 'Claude')).click();             // client = {Claude} first, so Only must REPLACE it
  await page.locator('.chip-only[aria-label="只看 Codex"]').focus();
  await page.keyboard.press('Enter');
  const pressedClients = () => page.locator('.facet', { has: page.locator('.facet-label', { hasText: '工具' }) })
    .locator('.chip-toggle[aria-pressed="true"]').evaluateAll(bs => bs.map(b => b.childNodes[0].textContent.trim()));
  expect(await pressedClients()).toEqual(['Codex']);
  await expect(page.locator('.filter-count')).toHaveText(`顯示 ${clientCount('Codex')}/${TOTAL}`);
  await page.keyboard.press('Enter');                           // already isolated → NO-OP, not a toggle back to Any
  expect(await pressedClients()).toEqual(['Codex']);
  await expect(page.locator('.filter-count')).toHaveText(`顯示 ${clientCount('Codex')}/${TOTAL}`);

  // touch / narrow: no hover to reveal it, so the Only tail is a 34px target with its separator at rest
  await page.setViewportSize({ width: 390, height: 900 });
  await page.mouse.move(0, 0);
  const touch = await look('Cursor');
  expect(touch.shown).toBe(true);
  expect(touch.w).toBeGreaterThanOrEqual(34);
  expect(touch.h).toBeGreaterThanOrEqual(34);
  expect(touch.sepAlpha).toBeGreaterThan(0);
});

// ---- O. Selected state is unmistakable (fill + ✓ + whole-chip border); hover is outline-only; counts secondary ----
test('O: a selected chip shows fill + ✓ + chip-wide border; hover is outline-only; counts are muted, smaller, ·-separated', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  await page.locator('.chip-toggle').first().waitFor();
  const accent = await page.evaluate(() => {
    const p = document.createElement('span'); p.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    document.body.appendChild(p); const v = getComputedStyle(p).color; p.remove(); return v;
  });
  const st = (label) => page.evaluate((label) => {
    const btn = [...document.querySelectorAll('.chip-toggle')].find(b => b.childNodes[0].textContent.trim() === label);
    const cs = getComputedStyle(btn), cc = getComputedStyle(btn.parentElement);
    const count = btn.querySelector('.chip-count'), ks = getComputedStyle(count);
    return {
      pressed: btn.getAttribute('aria-pressed'), fill: cs.backgroundColor, text: cs.color,
      check: getComputedStyle(btn, '::before').visibility, chipBorder: cc.borderTopColor,
      labelSize: parseFloat(cs.fontSize), countSize: parseFloat(ks.fontSize), countColor: ks.color,
      countText: count.textContent, countSep: getComputedStyle(count, '::before').content,
    };
  }, label);

  await (await chipToggle(page, 'Codex')).click();
  await page.mouse.move(0, 0);                                  // measure the selected state, not hover
  const sel = await st('Codex');
  const un = await st('Claude');
  expect(sel.pressed).toBe('true');
  expect(sel.fill).toBe(accent);                                // solid emerald fill …
  expect(sel.check).toBe('visible');                            // … plus ✓ (never colour alone)
  expect(sel.chipBorder).toBe(accent);                          // … and the whole chip (incl. Only tail) reads selected
  expect(un.pressed).toBe('false');
  expect(un.fill).not.toBe(accent);
  expect(un.check).toBe('hidden');
  expect(un.chipBorder).not.toBe(accent);

  await (await chipToggle(page, 'Claude')).hover();             // hover an UNSELECTED chip
  const hov = await st('Claude');
  expect(hov.pressed).toBe('false');
  expect(hov.chipBorder).toBe(accent);                          // hover cue = outline …
  expect(hov.fill).not.toBe(accent);                            // … never the selected fill
  expect(hov.check).toBe('hidden');                             // … never the ✓

  // counts are metadata: smaller than the label, a different (muted) colour, '·'-separated, digits-only DOM text
  expect(un.countSize).toBeLessThan(un.labelSize);
  expect(un.countColor).not.toBe(un.text);
  expect(un.countSep).toContain('·');
  expect(un.countText).toMatch(/^\d+$/);
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

// ---- I. 已篩選 summary (2026-11-24 Owner UX pass): only when active; value tokens; × removes one value
//          (last → Any) and re-filters; ≥5 collapse; 清除全部 = the single Reset, clears EVERY facet;
//          focus never drops to <body> while the row (and its buttons) disappears ----
test('I: 已篩選 summary — only when active; × removes one value and re-filters; collapse; 清除全部 resets every facet', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  const summary = page.locator('.filter-summary');
  const count = page.locator('.filter-count');
  const clearAll = page.locator('.chip-action', { hasText: '清除全部' });
  const tokens = () => page.locator('.summary-tag .summary-text').allTextContents();
  const pressed = () => page.locator('.chip-toggle[aria-pressed="true"]')
    .evaluateAll(bs => bs.map(b => b.childNodes[0].textContent.trim()));
  const active = () => page.evaluate(() => ({
    cls: document.activeElement.className,
    label: document.activeElement.classList.contains('chip-toggle') ? document.activeElement.childNodes[0].textContent.trim() : null,
  }));
  await page.locator('.chip-toggle').first().waitFor();
  await expect(summary).toBeHidden();                           // all Any → no summary …
  await expect(clearAll).toBeHidden();                          // … and no standing reset control

  for (const v of ['Codex', 'GPT-6 Astra', 'max']) await (await chipToggle(page, v)).click();
  await expect(summary).toBeVisible();
  await expect(summary.locator('.summary-label')).toHaveText('已篩選');
  expect(await tokens()).toEqual(['Codex', 'GPT-6 Astra', 'max']);  // value-only tokens, in facet order
  expect(await page.locator('.summary-x').evaluateAll(xs => xs.map(x => x.getAttribute('aria-label'))))
    .toEqual(['移除 工具：Codex', '移除 模型：GPT-6 Astra', '移除 推理強度：max']);   // facet kept in the accessible name
  const n = (pred) => _savSubs.filter(pred).length;
  await expect(count).toHaveText(`顯示 ${n(s => s.client === 'codex' && s.model === 'GPT-6 Astra' && s.effort === 'max')}/${TOTAL}`);

  // × on max → effort back to Any: the main chip unpresses and the RESULT widens (not just the tokens)
  await page.locator('.summary-x[aria-label="移除 推理強度：max"]').click();
  await expect(count).toHaveText(`顯示 ${n(s => s.client === 'codex' && s.model === 'GPT-6 Astra')}/${TOTAL}`);
  expect(await tokens()).toEqual(['Codex', 'GPT-6 Astra']);
  expect(await pressed()).toEqual(['Codex', 'GPT-6 Astra']);
  expect((await active()).cls).toBe('summary-x');               // focus → the next ×

  // remove the rest → row gone, all Any, focus lands on the removed value's chip (never <body>)
  await page.locator('.summary-x[aria-label="移除 模型：GPT-6 Astra"]').click();
  await page.locator('.summary-x[aria-label="移除 工具：Codex"]').click();
  await expect(summary).toBeHidden();
  await expect(count).toHaveText(`顯示 ${TOTAL}/${TOTAL}`);
  expect(await active()).toEqual({ cls: 'chip-toggle', label: 'Codex' });

  // collapse: ≥5 selected models → one 「模型：5 項」 token; its × clears the whole model facet
  for (const v of ['GPT-6 Astra', 'GPT-6 Luna', 'GPT-6 Sol', 'GPT-6.1 Sol', 'Grok 4.7']) await (await chipToggle(page, v)).click();
  expect(await tokens()).toEqual(['模型：5 項']);
  await page.locator('.summary-x').click();
  await expect(summary).toBeHidden();
  expect(await pressed()).toEqual([]);

  // 清除全部 resets ALL three dimensions at once
  for (const v of ['Grok', 'Grok 4.7', 'high']) await (await chipToggle(page, v)).click();
  expect(await pressed()).toEqual(['Grok', 'Grok 4.7', 'high']);
  await clearAll.click();
  expect(await pressed()).toEqual([]);
  await expect(summary).toBeHidden();
  await expect(count).toHaveText(`顯示 ${TOTAL}/${TOTAL}`);
  expect((await active()).cls).toBe('chip-toggle');             // focus moved to the first chip, not <body>
});

// ---- Q. Zero results (a legal cross-facet conflict, §3.1/E6): selections stay, the 已篩選 row and 清除全部
//          stay reachable, and an empty-state message explains — no silent deselection ----
test('Q: a zero-result combination keeps its selections, explains itself, and 清除全部 recovers', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  const empty = page.locator('.filter-empty');
  await page.locator('.chip-toggle').first().waitFor();
  await expect(empty).toBeHidden();                             // never shown while results exist
  expect(clientCount('Cursor')).toBeGreaterThan(0);             // precondition: both values exist …
  expect(effortCount('high')).toBeGreaterThan(0);
  expect(clientEffortCount('Cursor', 'high')).toBe(0);          // … but never together
  await (await chipToggle(page, 'Cursor')).click();
  await (await chipToggle(page, 'high')).click();
  await expect(page.locator('.filter-count')).toHaveText(`顯示 0/${TOTAL}`);
  expect(await page.locator('.card:not([hidden])').count()).toBe(0);
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('沒有符合目前篩選條件的結果');
  expect(await page.locator('.chip-toggle[aria-pressed="true"]').evaluateAll(bs => bs.map(b => b.childNodes[0].textContent.trim())))
    .toEqual(['Cursor', 'high']);                              // not silently deselected
  await expect(page.locator('.filter-summary')).toBeVisible();
  const clearAll = page.locator('.chip-action', { hasText: '清除全部' });
  await expect(clearAll).toBeVisible();
  await clearAll.click();
  await expect(empty).toBeHidden();
  await expect(page.locator('.filter-count')).toHaveText(`顯示 ${TOTAL}/${TOTAL}`);
});

// ---- R. Sorting is independent of filter state; the direction toggle still reverses ----
test('R: sort key/direction change only the order — filtered set, selections and count are untouched', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(TASK);
  await page.locator('.chip-toggle').first().waitFor();
  await (await chipToggle(page, 'Codex')).click();
  const snap = () => page.evaluate(() => ({
    order: [...document.querySelectorAll('.grid .card:not([hidden])')]
      .map(c => c.querySelector('.model').textContent + ' · ' + c.querySelector('.badge.effort').textContent),
    pressed: [...document.querySelectorAll('.chip-toggle[aria-pressed="true"]')].map(b => b.childNodes[0].textContent.trim()),
    count: document.querySelector('.filter-count').textContent,
  }));
  const a = await snap();
  expect(a.order.length).toBe(clientCount('Codex'));
  expect(new Set(a.order).size).toBe(a.order.length);          // distinct name keys → reversal must be exact
  await page.locator('.dir-btn').click();
  await expect(page.locator('.dir-btn')).toHaveAttribute('aria-label', /遞減/);
  const b = await snap();
  expect(b.order).toEqual([...a.order].reverse());
  expect(b.pressed).toEqual(a.pressed);
  expect(b.count).toBe(a.count);
  await page.locator('.sort-select').selectOption('time');
  const c = await snap();
  expect([...c.order].sort()).toEqual([...a.order].sort());    // same membership under another key
  expect(c.pressed).toEqual(a.pressed);
  expect(c.count).toBe(a.count);
  await (await chipToggle(page, 'max')).click();                // filtering after sorting keeps sorted order
  const d = await snap();
  expect(d.order).toEqual(c.order.filter(x => x.endsWith(' · max')));
  expect(d.order.length).toBeGreaterThan(0);
});

// ---- S. Layout: ≥481px each facet's chips start on the label's line in one aligned column shared with the
//          sort control (hanging indent); ≤480px the label sits above; never any horizontal overflow ----
test('S: labels align with their rows (aligned content column ≥481px, stacked ≤480px); no horizontal overflow', async ({ page }) => {
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('about:blank');                             // a same-URL hash goto would NOT reload (state would leak)
    await page.goto(TASK);
    await page.locator('.controls .chip').first().waitFor();
    for (const v of ['Codex', 'GPT-6 Astra', 'max']) await (await chipToggle(page, v)).click();   // 已篩選 row present too
    const r = await page.evaluate(() => {
      const rect = (e) => e.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.controls .facet, .controls .filter-summary')].map(row => {
        const label = row.querySelector('.facet-label, .summary-label');
        const first = row.querySelector('.chip, .summary-tag');
        return { label: label ? label.textContent : null, labelRight: label && rect(label).right,
          labelBottom: label && rect(label).bottom, firstTop: first && rect(first).top, firstLeft: first && rect(first).left };
      });
      const de = document.documentElement;
      return {
        rows, sortLeft: rect(document.querySelector('.sort-select')).left,
        pageOverflow: de.scrollWidth > de.clientWidth,
        controlsOverflow: [...document.querySelectorAll('.controls *')].some(e => rect(e).right > window.innerWidth + 0.5),
      };
    });
    expect(r.pageOverflow, `${width}px page overflow`).toBe(false);
    expect(r.controlsOverflow, `${width}px controls overflow`).toBe(false);
    expect(r.rows.map(x => x.label), `${width}px rows`).toEqual(['工具', '模型', '推理強度', '已篩選']);
    for (const x of r.rows) {
      if (width > 480) {
        expect(x.firstTop, `${width}px ${x.label}: first item on the label's line`).toBeLessThan(x.labelBottom);
        expect(x.firstLeft, `${width}px ${x.label}: content right of the label`).toBeGreaterThan(x.labelRight);
        expect(Math.abs(x.firstLeft - r.rows[0].firstLeft), `${width}px ${x.label}: one aligned column`).toBeLessThan(1);
      } else {
        expect(x.firstTop, `${width}px ${x.label}: label above its items`).toBeGreaterThanOrEqual(x.labelBottom - 1);
      }
    }
    if (width > 480) expect(Math.abs(r.sortLeft - r.rows[0].firstLeft), `${width}px sort aligned with chips`).toBeLessThan(1);
  }
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
    // resolve --bg / --accent (hex) to the rgb form getComputedStyle reports
    const toRgb = (hex) => { const p = document.createElement('span'); p.style.color = hex; document.body.appendChild(p); const v = getComputedStyle(p).color; p.remove(); return v; };
    const root = getComputedStyle(document.documentElement);
    return {
      cls: a.className,
      pressed: a.getAttribute('aria-pressed'),
      focusVisible: a.matches(':focus-visible'),
      outline: getComputedStyle(a).outlineColor,
      fill: getComputedStyle(a).backgroundColor,
      bgRgb: toRgb(root.getPropertyValue('--bg').trim()),
      accentRgb: toRgb(root.getPropertyValue('--accent').trim()),
    };
  });
  expect(sel.cls).toContain('chip-toggle');
  expect(sel.pressed).toBe('true');
  expect(sel.focusVisible).toBe(true);                       // keyboard focus → :focus-visible really matched
  expect(sel.fill).toBe(sel.accentRgb);                      // the SELECTED chip is emerald-filled (so the ring is tested on emerald, not dark-on-dark)
  expect(sel.outline).toBe(sel.bgRgb);                       // dark ring = var(--bg), against that emerald fill
  expect(sel.outline).not.toBe('rgb(255, 255, 255)');        // explicitly NOT the white ring
  expect(sel.outline).not.toBe(sel.fill);                    // ring and fill differ (a visible ring)

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
    // read the @font-face src straight from CSSOM (so a root-absolute URL is caught even on the
    // repo-root test server, where it would still load but would 404 under the /ai-arena/ subpath)
    let faceSrc = null;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        if (rule.constructor?.name === 'CSSFontFaceRule' &&
            (rule.style.getPropertyValue('font-family') || '').includes('JetBrains Mono')) {
          faceSrc = rule.style.getPropertyValue('src');
        }
      }
    }
    const pre = document.querySelector('link[rel="preload"][as="font"]');
    return {
      jbmLoaded: [...document.fonts].some(f => f.family.includes('JetBrains Mono') && f.status === 'loaded'),
      metricV: famOf('.metric-v'),
      promptLabel: famOf('.prompt-label'),
      model: famOf('.model'),
      faceSrc,
      preloadHref: pre ? pre.getAttribute('href') : null,     // raw attribute (not the resolved absolute URL)
    };
  });
  expect(r.jbmLoaded).toBe(true);                            // the self-hosted woff2 actually loaded
  expect(r.metricV).toContain('JetBrains Mono');             // mono drives metric values
  expect(r.promptLabel).toContain('JetBrains Mono');         // and micro-labels
  expect(r.model).not.toContain('JetBrains Mono');           // model names stay on the native sans face
  // subpath safety: @font-face src and preload href MUST be relative, else they 404 under /ai-arena/
  expect(r.faceSrc).toContain('./fonts/');                   // relative @font-face url
  expect(r.faceSrc).not.toMatch(/url\(\s*["']?\//);          // never a root-absolute url(/...)
  expect(r.preloadHref).toBeTruthy();
  expect(r.preloadHref.startsWith('/')).toBe(false);         // preload href is relative…
  expect(r.preloadHref.startsWith('http')).toBe(false);      // …and not an absolute URL
});

// ---- L. WS4-B Portfolio-aligned header: brand lockup + accessible return link --------------
// Fails on the pre-WS4-B header (no .site-header__bar / .portfolio-link), so it discriminates the
// change rather than asserting a tautology.
test('L: header has the >_ / AI Arena / Eric · Feuer lockup and a keyboard-focusable ← Portfolio link, with no full nav', async ({ page }) => {
  await page.goto(TASK);
  await page.locator('.site-header__bar').waitFor();

  const dom = await page.evaluate(() => {
    const header = document.querySelector('.site-header');
    const mark = document.querySelector('.brand__mark');
    const name = document.querySelector('.brand__name');
    const by = document.querySelector('.brand__by');
    const link = document.querySelector('.portfolio-link');
    return {
      h1Count: document.querySelectorAll('h1').length,
      nameTag: name ? name.tagName : null,
      nameText: name ? name.textContent.replace(/ /g, ' ').trim() : null,
      markText: mark ? mark.textContent.trim() : null,
      byText: by ? by.textContent.replace(/ /g, ' ').trim() : null,
      linkTag: link ? link.tagName : null,
      linkHref: link ? link.href : null,
      linkAccName: link ? (link.getAttribute('aria-label') || link.textContent.trim()) : null,
      linkTarget: link ? link.target : null,
      // compact header must NOT transplant Portfolio's full nav / contact CTA
      headerHasContactCTA: /contact|mailto:/i.test(header ? header.innerHTML : ''),
      headerNavLinkCount: header ? header.querySelectorAll('nav a, .nav a, .menu a').length : -1,
      headerLinkCount: header ? header.querySelectorAll('a').length : -1,
      // no hamburger / contact <details> / menu chrome of any kind
      headerButtonCount: header ? header.querySelectorAll('button, summary, [class*="hamburger"], [class*="menu"]').length : -1,
      // decorative glyphs must be out of the a11y tree so the link's accessible name is clean
      linkAriaLabel: link ? link.getAttribute('aria-label') : null,
      markAriaHidden: mark ? mark.getAttribute('aria-hidden') : null,
      arrowAriaHidden: link && link.querySelector('.portfolio-link__arrow')
        ? link.querySelector('.portfolio-link__arrow').getAttribute('aria-hidden') : null,
    };
  });

  // brand lockup — AI Arena stays the prominent product name (the single h1)
  expect(dom.h1Count).toBe(1);
  expect(dom.nameTag).toBe('H1');
  expect(dom.nameText).toBe('AI Arena');
  expect(dom.markText).toBe('>_');                   // terminal brand glyph (mirrors Portfolio)
  expect(dom.byText).toBe('Eric · Feuer');           // brand attribution

  // return link — real anchor, correct external target, clear accessible name, same-tab back-nav
  expect(dom.linkTag).toBe('A');
  expect(dom.linkHref).toBe('https://portfolio.secc.dev/');
  // accessible name comes from an EXPLICIT aria-label (not the visible-text fallback), and the
  // decorative >_ / ← are aria-hidden — so dropping the label or un-hiding a glyph fails this.
  expect(dom.linkAriaLabel).toBeTruthy();
  expect(dom.linkAriaLabel).toContain('Portfolio');
  expect(dom.markAriaHidden).toBe('true');
  expect(dom.arrowAriaHidden).toBe('true');
  expect(dom.linkTarget === '' || dom.linkTarget === '_self').toBe(true);   // ← is a return affordance, not a popup

  // no full Portfolio nav / hamburger / contact CTA; the only header link is ← Portfolio
  expect(dom.headerHasContactCTA).toBe(false);
  expect(dom.headerNavLinkCount).toBe(0);
  expect(dom.headerLinkCount).toBe(1);
  expect(dom.headerButtonCount).toBe(0);

  // keyboard reachable with a visible focus ring
  let tries = 0, onLink = false;
  while (tries++ < 12) {
    await page.keyboard.press('Tab');
    onLink = await page.evaluate(() => document.activeElement?.classList.contains('portfolio-link'));
    if (onLink) break;
  }
  expect(onLink).toBe(true);
  const focus = await page.evaluate(() => {
    const ae = document.activeElement;
    const cs = getComputedStyle(ae);
    return { fv: ae.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor };
  });
  expect(focus.fv).toBe(true);                       // :focus-visible applies on keyboard focus
  expect(focus.style).not.toBe('none');              // a ring is drawn…
  expect(focus.width).toBeGreaterThanOrEqual(2);     // …at ≥2px
  expect(focus.color).toBe('rgb(53, 224, 161)');     // emerald ring (var(--accent)), visible on the dark header

  // responsive: the header never forces horizontal overflow and ← Portfolio stays on-screen at the
  // target widths (it wraps to its own line on the narrow ones, sits on the bar on the wide ones).
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const link = document.querySelector('.portfolio-link').getBoundingClientRect();
      return {
        overflow: de.scrollWidth > de.clientWidth,
        linkInView: link.right <= window.innerWidth + 0.5 && link.left >= -0.5,
      };
    });
    expect(r.overflow, `no horizontal overflow at ${width}px`).toBe(false);
    expect(r.linkInView, `← Portfolio within viewport at ${width}px`).toBe(true);
  }
});
