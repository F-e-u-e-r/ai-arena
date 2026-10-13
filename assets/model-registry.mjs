// Canonical model registry — WS3 Model Family (OD-WS3 contract). Pure, DOM-free;
// shared by the browser (app.js) and Node's test runner (no package.json / deps).
//
// This is an EXPLICIT declared metadata mapping, never display-name substring
// inference. Resolution is by (provider, modelId) only; the display name is a UI
// label and the P0 model-facet value, never the canonical identity. A submission
// that matches no declared alias is UNKNOWN: it still renders and filters by the
// existing model facet, it is never assigned a family, and it never fails the
// build. "Unknown is allowed; invalid DECLARED metadata is not" — validateRegistry
// (run in CI against the real manifest) fails only on bad registry declarations:
// an alias collision, a member that resolves to no real submission, a canonical
// key in two families, a FAMILIES/CANONICAL_MODELS drift, or a canonical↔display
// mapping the data contradicts.
//
// First version covers exactly the three multi-member model lines (OD-WS3-1):
// Grok, GPT-5.6, Opus. No provider-level family, no single-member family, no
// hierarchical/tri-state UI.

// Canonical models: a stable registry key, the exact (provider, modelId) aliases
// that resolve to it, its UI display label (= the P0 model-facet value), and its
// family id. Pricing aliases are NOT identity: only these declared (provider,
// modelId) pairs resolve here.
export const CANONICAL_MODELS = [
  { key: 'grok-4.5', label: 'Grok 4.5', family: 'grok', aliases: [{ provider: 'xai', modelId: 'grok-4.5' }] },
  { key: 'grok-4.6', label: 'Grok 4.6', family: 'grok', aliases: [{ provider: 'xai', modelId: 'grok-4.6' }] },
  { key: 'grok-4.7', label: 'Grok 4.7', family: 'grok', aliases: [{ provider: 'xai', modelId: 'grok-4.7' }] },
  { key: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', family: 'gpt-5.6', aliases: [{ provider: 'openai', modelId: 'gpt-5.6-luna' }] },
  { key: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', family: 'gpt-5.6', aliases: [{ provider: 'openai', modelId: 'gpt-5.6-sol' }] },
  { key: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', family: 'gpt-5.6', aliases: [{ provider: 'openai', modelId: 'gpt-5.6-terra' }] },
  { key: 'claude-opus-4-6', label: 'Opus 4.6', family: 'opus', aliases: [{ provider: 'anthropic', modelId: 'claude-opus-4-6' }] },
  { key: 'claude-opus-4-8', label: 'Opus 4.8', family: 'opus', aliases: [{ provider: 'anthropic', modelId: 'claude-opus-4-8' }] },
];

// Families: declared display order + label + member canonical keys. Members are
// also derivable from CANONICAL_MODELS.family; both are declared so validateSpec
// can cross-check them and fail on any drift.
export const FAMILIES = [
  { id: 'grok', label: 'Grok', members: ['grok-4.5', 'grok-4.6', 'grok-4.7'] },
  { id: 'gpt-5.6', label: 'GPT-5.6', members: ['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra'] },
  { id: 'opus', label: 'Opus', members: ['claude-opus-4-6', 'claude-opus-4-8'] },
];

// Injective (provider, modelId) key — a JSON array encoding, so two DISTINCT tuples can
// never share a key the way a raw delimiter could (e.g. a separator byte inside a value).
const aliasKey = (provider, modelId) => JSON.stringify([String(provider), String(modelId)]);

// Pure resolver factory — testable with ANY registry (so collision fail-closed can
// be exercised with a synthetic colliding registry, not only the real one).
export function makeResolver(canonicalModels) {
  const index = new Map();          // aliasKey -> canonical key
  const collisions = new Set();     // aliasKeys claimed by >1 entry
  const labelByKey = new Map();
  for (const m of canonicalModels) {
    labelByKey.set(m.key, m.label);
    for (const a of m.aliases || []) {
      const k = aliasKey(a.provider, a.modelId);
      if (index.has(k)) collisions.add(k);
      else index.set(k, m.key);
    }
  }
  // Resolve a submission to its canonical key, or null if UNKNOWN (no modelId, or an
  // unrecognized (provider, modelId)). An alias declared by two entries is a
  // collision: resolution fails CLOSED (null) rather than arbitrarily picking one.
  const resolve = (sub) => {
    if (!sub || sub.provider == null || sub.modelId == null) return null;
    const k = aliasKey(sub.provider, sub.modelId);
    if (collisions.has(k)) return null;
    return index.get(k) ?? null;
  };
  return { resolve, collisions, labelOf: (key) => labelByKey.get(key) ?? null };
}

const REAL = makeResolver(CANONICAL_MODELS);

// Resolve a submission to its canonical key, or null if unknown / collision.
export const resolveCanonical = REAL.resolve;
// Canonical key → UI display label (the P0 model-facet value). null if unknown key.
export const canonicalLabel = REAL.labelOf;

// The family id a submission belongs to, or null (unknown models have none).
export function familyOf(sub) {
  const key = resolveCanonical(sub);
  if (key == null) return null;
  const m = CANONICAL_MODELS.find(x => x.key === key);
  return m ? m.family : null;
}

// The family's member display-names (P0 model-facet values) PRESENT in the given
// submissions, in the family's declared member order. This is what a family
// shortcut expands to: a FIXED explicit subset of the current task's actual models.
// A future model not declared here never enters this set.
export function familyFacetValues(subs, familyId) {
  const fam = FAMILIES.find(f => f.id === familyId);
  if (!fam) return [];
  const present = new Set();
  for (const sub of subs || []) {
    const key = resolveCanonical(sub);
    if (key != null && fam.members.includes(key)) present.add(key);
  }
  return fam.members.filter(k => present.has(k)).map(canonicalLabel);
}

// Families worth a bulk-select shortcut in this task: those with at least
// `minMembers` members actually present (a single present member is redundant
// with its own chip, and showing it would only add UI clutter).
export function familiesInTask(subs, minMembers = 2) {
  return FAMILIES
    .map(f => ({ id: f.id, label: f.label, values: familyFacetValues(subs, f.id) }))
    .filter(f => f.values.length >= minMembers);
}

// Validate a DECLARED registry (canonicalModels + families) against real submissions.
// Returns human-readable problems; empty means valid. CI fails if non-empty. This
// never complains about unknown submissions — only about bad registry declarations
// (OD-WS3-3: "unknown allowed; invalid declared metadata is not").
export function validateSpec(canonicalModels, families, subs) {
  const problems = [];
  const rows = subs || [];
  const { resolve, collisions } = makeResolver(canonicalModels);

  // (a) alias collisions — two canonical entries claiming the same (provider, modelId)
  for (const k of collisions) problems.push(`alias collision for (${JSON.parse(k).join(', ')})`);

  // (a2) duplicate family ids — ambiguous: familyFacetValues uses find() (first-wins) while a
  //      famById Map would be last-wins, so a duplicate id can silently omit members.
  const seenFamIds = new Set();
  for (const fam of families) {
    if (seenFamIds.has(fam.id)) problems.push(`duplicate family id '${fam.id}'`);
    seenFamIds.add(fam.id);
  }

  // (b) every canonical key in exactly one family; FAMILIES and CANONICAL_MODELS agree
  const keyToFamilies = new Map();
  for (const m of canonicalModels) {
    if (!keyToFamilies.has(m.key)) keyToFamilies.set(m.key, new Set());
    keyToFamilies.get(m.key).add(m.family);
  }
  for (const [key, fams] of keyToFamilies) {
    if (fams.size > 1) problems.push(`canonical '${key}' declared in multiple families: ${[...fams].join(', ')}`);
  }
  const famById = new Map(families.map(f => [f.id, f]));
  for (const m of canonicalModels) {
    const fam = famById.get(m.family);
    if (!fam) problems.push(`canonical '${m.key}' references unknown family '${m.family}'`);
    else if (!fam.members.includes(m.key)) problems.push(`canonical '${m.key}' (family '${m.family}') missing from FAMILIES.members`);
  }
  for (const fam of families) {
    for (const key of fam.members) {
      const m = canonicalModels.find(x => x.key === key);
      if (!m) problems.push(`family '${fam.id}' lists unknown member '${key}'`);
      else if (m.family !== fam.id) problems.push(`family '${fam.id}' lists '${key}' but it declares family '${m.family}'`);
    }
  }

  // (c) every declared canonical member must resolve from >=1 real submission, AND the
  //     real (provider, modelId) → display name must match the declared label (no data
  //     contradiction of the canonical↔UI-value mapping).
  const realByKey = new Map(); // canonical key -> Set of real display names seen
  for (const sub of rows) {
    const key = resolve(sub);
    if (key == null) continue;
    if (!realByKey.has(key)) realByKey.set(key, new Set());
    realByKey.get(key).add(sub.model);
  }
  for (const m of canonicalModels) {
    const seen = realByKey.get(m.key);
    if (!seen || seen.size === 0) {
      problems.push(`canonical '${m.key}' resolves to no real submission in the manifest`);
    } else {
      for (const disp of seen) {
        if (disp !== m.label) problems.push(`canonical '${m.key}' label '${m.label}' contradicts real display name '${disp}'`);
      }
    }
  }

  // (d) display-name ↔ canonical-identity must be UNAMBIGUOUS in the real data. A family
  //     shortcut expands to the P0 model-facet VALUE (the display name), so if a submission
  //     carries a family member's display name but a DIFFERENT (or no) canonical identity,
  //     that shortcut would pull an unverified identity into the selection. Fail closed
  //     (OD-WS3-2: if the data can't map unambiguously, stop) rather than mis-select.
  const memberLabels = new Map(); // family-member display label -> canonical key
  for (const fam of families) {
    for (const key of fam.members) {
      const m = canonicalModels.find(x => x.key === key);
      if (m) memberLabels.set(m.label, m.key);
    }
  }
  const reportedAmbig = new Set();
  for (const sub of rows) {
    const expectKey = memberLabels.get(sub.model);
    if (expectKey === undefined || reportedAmbig.has(sub.model)) continue;
    if (resolve(sub) !== expectKey) {
      reportedAmbig.add(sub.model);
      problems.push(`display name '${sub.model}' (a family member) is also carried by an identity resolving to '${resolve(sub) ?? 'unknown'}' — ambiguous display↔identity mapping`);
    }
  }

  return problems;
}

// Validate the real registry against the given manifest submissions.
export const validateRegistry = (subs) => validateSpec(CANONICAL_MODELS, FAMILIES, subs);
