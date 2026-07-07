# AI Arena — Roadmap

A PR-driven, fully static, provider-neutral gallery for comparing AI model
outputs. The moat is **"accept untrusted external contributions safely with
zero backend."** Everything below protects or extends that.

**Guardrails (non-goals).** Keep these unless there's a deliberate decision to
change them:

- **Zero backend / zero runtime dependencies.** The site is static files; the
  build scripts use only Node's standard library. New tooling should stay
  dependency-free.
- **PR-visible == gallery-loaded.** The exact files a reviewer sees in a PR are
  the files the gallery renders. No submission may pull in remote content that
  bypasses review, the secret scan, or the protocol allowlist.
- **Untrusted content stays sandboxed.** Submissions run inside a `null`-origin
  `sandbox` iframe. Nothing from a submission executes on the gallery's origin.

Legend: ✅ shipped · 🔜 now · ⏭ next · 🗓 later

---

## ✅ Shipped

Security & data-integrity hardening (from the Fable code review):

- **iframe `src` bypass closed.** `build-manifest.mjs` rejects any iframe
  submission that sets `src`; `app.js` `renderMedia` prefers `path`. The build
  (and therefore CI) now guarantees PR-visible == gallery-loaded.
- **model-viewer pinned + SRI.** `@4.3.1` with an integrity hash and
  `crossorigin=anonymous`, replacing a floating unpkg version.
- **Declarative submission/task schema.** `schema/submission.schema.json` and
  `schema/task.schema.json` (JSON Schema draft-07) are the single source of
  truth for the contribution contract, enforced at build time by a tiny
  zero-dependency validator (`scripts/lib/validate-json-schema.mjs`). Editors
  that honor `$schema` give contributors live validation.
- **Pricing-coverage gate.** `build-manifest.mjs --strict` fails when a
  submission has token metrics but no resolvable price (default stays warn-only).
- **Display/robustness.** `formatDuration` carries into hours; `isExternal`
  requires a full `https://` scheme.

---

## 🔜 Now (finish the contribution-pipeline hardening)

1. **Turn on the pricing gate in CI.** Add `--strict` to the `validate` job once
   modelId coverage is confirmed, so a new model without a price fails loudly
   instead of silently showing `—`.
   - *Accept:* a submission with tokens + an unpriced `modelId` fails CI with a
     clear message naming the id.
2. **modelId normalization.** Resolve `provider/model` ↔ short-id aliases from a
   single table (pricing.json already carries `aliasFor`) so cost lookup is not
   position-sensitive.
   - *Accept:* `claude-fable-5` and `anthropic/claude-fable-5` resolve to the
     same price via one code path; a unit test covers both.
3. **Tighten the schema + surface it to contributors.** Consider
   `additionalProperties:false` (with a friendly "unknown field / likely typo"
   message) and document `"$schema": "…"` usage in `CONTRIBUTING.md`
   (+ `CONTRIBUTING.zh-TW.md`).
   - *Accept:* a typo'd field (`modleId`) is reported by name; CONTRIBUTING shows
     the one-line `$schema` snippet.

---

## ⏭ Next (make "comparison" genuinely useful)

4. **Side-by-side / diff view.** For multiple submissions under one task: synced
   scrolling, a side-by-side code view, and a filter to show only selected
   models.
   - *Accept:* pick 2–3 submissions and view them aligned; toggling a model
     hides/shows its column without reload.
5. **Sort & leaderboard.** Sort submissions by cost / duration / tokens; a
   cross-task "price-performance" board (data already computed as `costUsd`).
   - *Accept:* one click reorders cards by any metric; a board ranks models
     across tasks.
6. **WebGL context management.** Cap simultaneously loaded iframes and recycle
   the oldest so "Load all" doesn't black out 3D demos past the browser's
   context limit.
   - *Accept:* "Load all" on a WebGL task keeps demos rendering; oldest frames
     unload past the cap.
7. **Accessibility & responsive.** Collapsible sidebar on narrow screens,
   keyboard navigation, `prefers-color-scheme` dark mode.
   - *Accept:* usable at 360px width and via keyboard only; dark mode follows the
     OS setting.

---

## 🗓 Later (scale & automation)

8. **Automated metrics extraction.** Extend beyond Claude Code
   (`metrics-from-claude-code.mjs`) with parsers for codex / OpenRouter / other
   clients so contributors hand-enter fewer numbers.
9. **Pricing auto-sync.** A scheduled GitHub Action pulls prices (e.g. from
   OpenRouter) and updates `data/pricing.json` + `verifiedAt`, replacing manual
   verification.
10. **Visual regression / auto-screenshots.** Use Playwright in CI to screenshot
    each submission — as gallery thumbnails (preview before load) and for
    regression diffs.
11. **Contribution trust tiers.** Badge new-contributor submissions as
    "unreviewed," or gate deploy behind a maintainer label, composing with the
    schema + secret scan into a full untrusted-input → static-site pipeline.

---

*Sourced from the Fable security & correctness review. Priority: finish **Now**
(security + data correctness — cheap, high-value) before **Next**. The **Next**
items (4–7) have the most leverage if this grows into a serious model-evaluation
platform; keep it lightweight otherwise.*
