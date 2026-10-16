# AI Arena — Brand Tokens (WS4 Option A)

Human-readable token spec for the AI Arena gallery. **Not an npm package** — Arena and
Portfolio stay decoupled; this file is the shared reference, copied by hand when either side
changes. The source of truth for the live values is `:root` in `assets/style.css`; this doc
records the values, their provenance, and the decisions behind them.

Aligns Arena **to** the Portfolio brand (`github.com/F-e-u-e-r/portfolio`, visual language
FROZEN). Arena is Build Stream row 4 + a Knowledge-graph node in Portfolio, so the tie is real,
not cosmetic. WS4 never modifies the Portfolio repo.

## Palette

| Token | Value | Role | Provenance |
|-------|-------|------|------------|
| `--bg` | `#0a0d0c` | page background | Owner-approved Arena green-black |
| `--panel` | `#111715` | primary surface (cards, panels) | Owner-approved Arena green-black |
| `--panel-2` | `#172019` | nested surface (inputs, chips) | Owner-approved Arena green-black |
| `--border` | `rgba(170,205,190,.16)` | green-alpha hairline | Portfolio `--border-subtle` |
| `--text` | `#e8efeb` | body / primary text | Portfolio `--c-fg` |
| `--muted` | `#9aa8a2` | muted / secondary text | Portfolio `--c-fg-muted` |
| `--accent` | `#35e0a1` | **emerald** — interactive / selected only | Portfolio `--c-accent` |
| `--accent-muted` | `#27a97c` | **muted emerald** — WS4-B brand mark `>_` + return-arrow glyph | Portfolio `--c-accent-muted` |
| `--accent-2` | `#ff5ea8` | error / status pink | **Arena functional — NOT brand-recoloured** |

**Emerald is reserved for interactive / selected state** (buttons, selected chip fill, hover
borders, focus rings, active-task marker, play affordance). It is not a decorative fill.

**Text on emerald fills is dark** (`var(--bg)` `#0a0d0c`, ≈11.3:1), never white (≈1.7:1 — WCAG
fail). Applies to `.btn`, the selected `.chip-toggle`, and `.placeholder .play`.

### Functional colours — deliberately preserved, NOT recoloured to brand
- **Effort badges**: low `#2f855a` · medium `#2563eb` · high `#d97706` · xhigh `#dc2626` ·
  ultracode `#7c3aed` · max rainbow gradient. These encode a real ordinal dimension.
- **Client badges**: per-client identity colours (claude-code / codex / opencode / cursor /
  kiro / api). These encode provenance.
- **Error pink** `--accent-2` (`.error-box h2`). A status colour, not a brand accent.
- **Media letterbox** `#000` (`.card-body`, media backgrounds), overlay frame buttons
  (black-alpha + white over arbitrary iframe content).

## Typography

- **Sans (native) face** — body, prose, titles, **model names**, badges. Unchanged system stack:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "PingFang TC", …`.
- **Mono** `--font-mono` = `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`.
  Applied to technical chrome only: sidebar title, task-link meta, prompt label + prompt text,
  metric keys + values, chip counts, filter count, generated-at timestamp. This mirrors
  Portfolio ("native face for text, mono for metadata/labels/code") and keeps the card-head and
  4-column metrics row from widening into extra wraps.
- **JetBrains Mono** is self-hosted (Fontsource 5.3.0, variable weight `100 800`, **latin subset
  only**, OFL-1.1). File `assets/fonts/jetbrains-mono-latin-wght-normal.woff2`; licence
  `assets/fonts/JetBrainsMono-OFL.txt` ("Copyright 2020 The JetBrains Mono Project Authors").
- **Font URLs are relative** (`url('./fonts/…')` in CSS, `href="assets/fonts/…"` preload in
  `index.html`) so they resolve under the `/ai-arena/` GitHub-Pages project subpath. Portfolio's
  root-absolute `/fonts/…` would 404 off-root — do not transplant it.

## Borders
Arena uses the single subtle hairline `--border` (`rgba(170,205,190,.16)`). Portfolio also
defines `--border-strong` `rgba(170,205,190,.40)`; Arena has no element that needs the stronger
weight yet (the prior design used one uniform border), so it is intentionally not added here —
introduce it only when a concrete element needs it.

## Header / brand lockup (WS4-B)
The site header carries a Portfolio-aligned brand lockup and a return link to the parent Portfolio
site (`https://portfolio.secc.dev/`). Arena is a node in Portfolio's Build Stream, so the tie is
real; the header echoes Portfolio's brand language without copying its full chrome.

- **`.brand__mark` = `>_`** — mirrors Portfolio's `.brand__mark`: a bordered pill, mono, weight 700,
  `color: var(--accent-muted)` (muted emerald, NOT full `--accent` — emerald stays reserved for
  interactive/selected). It is `aria-hidden` (the `<h1>` carries the accessible name).
- **`.brand__name` = "AI Arena"** — the single `<h1>`; stays the prominent product name (22px,
  unchanged from the prior header).
- **`.brand__by` = "Eric · Feuer"** — muted, mono attribution (matches Portfolio's wordmark).
- **`.portfolio-link` = "← Portfolio"** — a real anchor to `https://portfolio.secc.dev/`. The `←`
  is a decorative, `aria-hidden` return affordance; the accessible name is set via `aria-label`.
  Same-tab navigation (a back/return link, not a `target="_blank"` popup). Quiet by default (muted +
  hairline border), emerald on hover, and an emerald `:focus-visible` ring (≈11:1 on the dark header,
  WCAG 1.4.11). Keyboard-focusable as a native anchor.
- **No full Portfolio nav / hamburger / contact CTA.** Portfolio's header also has primary nav
  (Case Studies / Knowledge / About), a contact `<details>`, and a mobile hamburger; Arena omits all
  three — the only header link is `← Portfolio`.
- **Responsive**: the bar is `flex` + `flex-wrap`; from ~390px down the `← Portfolio` link wraps to
  its own line rather than forcing horizontal overflow. Verified 320/390/768/1280/1440px.

## Decisions (WS4-A) — rejected alternatives and why
- **Surfaces use Arena's own `#0a0d0c/#111715/#172019`, not Portfolio's `#080b0a/#111815`.**
  Rejected exact transplant: the Owner-approved Option A pinned these slightly-distinct Arena
  values (the dark focus-ring contrast analysis is computed against `#0a0d0c`).
- **`--border` = `.16` alpha, single token.** Rejected a solid green border and `--border-strong`:
  `.16` composited over the dark surfaces lands at ≈ the prior solid `#262d3a` weight, so border
  prominence is preserved with no new token lacking a consumer.
- **Mono scope excludes model names + badges.** Rejected all-mono: mono widens glyphs; keeping
  the card title + functional badge pills in sans protects the comparison-grid density the Owner
  flagged as a WS4 acceptance item.
- **latin subset only.** Rejected shipping latin-ext: Arena's mono text is ASCII + Latin-1
  (covered by the latin unicode-range); CJK and extended Latin fall back gracefully. Saves payload.
- **Selected-chip focus ring flips white → dark in the same change as the emerald recolour.**
  Rejected deferring it: a white ring on the new emerald fill is ~1.70:1 (WCAG 1.4.11 fail); there
  must be no intermediate "emerald fill + old white ring" state.

## Decisions (WS4-B) — rejected alternatives and why
- **`>_` uses `--accent-muted`, not `--accent`.** Rejected full emerald for the brand mark:
  Portfolio renders its own mark in the muted accent and reserves full accent for active/interactive
  state; matching that keeps `--accent` meaningful as the interactive signal.
- **`← Portfolio` navigates same-tab (no `target="_blank"`).** Rejected a new tab: `←` is a
  return-to-parent affordance, so same-tab is correct; a new tab is for an external reference, which
  this is not.
- **Header stays non-sticky.** Rejected copying Portfolio's `position: sticky` header: Arena's prior
  header was static; making it sticky changes scroll behaviour and is out of WS4-B scope.
- **No favicon change *in WS4-B*.** `assets/favicon.svg` was left as the pre-WS4 blue/pink mark —
  recolouring it was outside WS4-B's header scope and deferred as a follow-up. **Done in WS4-C below.**

## Decisions (WS4-C) — favicon
- **`assets/favicon.svg` is now the Portfolio-aligned `>_` mark** — emerald `>_` on Arena green-black,
  replacing the pre-WS4 blue/pink "AI" glyph. Pure inline SVG (two stroked paths: a `>` chevron + an
  `_` underscore) on a rounded near-black square. No font and no runtime dependency; the `>_` is a
  generic terminal-prompt glyph drawn here as strokes — **not** a copy of Portfolio's AGPL mascot/sprite.
- **The favicon `>_` uses full `--accent` `#35e0a1`, NOT `--accent-muted`** (which the in-page
  `.brand__mark` uses). Rejected matching the muted in-page mark: the "emerald = interactive, muted =
  brand mark" split is an *in-page* semantic (emerald must stand out as the clickable/selected signal
  next to other UI). A browser-tab favicon has no adjacent interactive UI, so that reservation does not
  apply; there, legibility at 16px wins. Full emerald on `#0a0d0c` is ≈11.5:1 vs ≈6.6:1 for muted — the
  higher contrast is what carries the mark at 16–32px (the old blue mark was ≈6.0:1).
- **Background is Arena green-black `#0a0d0c`** (the `--bg` token), not the old favicon's blue-black
  `#0b0d12`, so the mark sits on the real brand surface. The rounded square is kept so the icon reads on
  any tab-bar background (light or dark).
- **Cache-bust via `?v=2` on the `<link rel="icon">`** (matching the repo's `?v=N` convention for
  `style.css` / `app.js`), so browsers holding the old favicon re-fetch. The href stays **relative**
  (`assets/favicon.svg?v=2`) to resolve under the `/ai-arena/` Pages subpath.
