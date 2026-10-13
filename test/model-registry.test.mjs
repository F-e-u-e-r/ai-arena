// WS3 Model Family registry — validation against the REAL manifest (OD-WS3-5),
// zero-dep node:test. "Unknown is allowed; invalid DECLARED metadata is not."
// Resolution is (provider, modelId) only; display name is a UI label, never identity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CANONICAL_MODELS, FAMILIES, resolveCanonical, canonicalLabel, familyOf,
  familyFacetValues, familiesInTask, validateRegistry, validateSpec, makeResolver,
} from '../assets/model-registry.mjs';
import { initState, toggle, visible } from '../assets/filter-core.mjs';

const FACETS = ['client', 'model', 'effort'];
const manifest = JSON.parse(readFileSync(new URL('../tasks.json', import.meta.url), 'utf8'));
const ALL_SUBS = manifest.flatMap(t => t.submissions || []);
const taskSubs = (id) => (manifest.find(t => t.id === id)?.submissions) || [];

// (1) the three declared families and exactly their members (no provider-level, no singleton)
test('1: three model-line families with their declared members', () => {
  assert.deepEqual(FAMILIES.map(f => f.id), ['grok', 'gpt-5.6', 'opus']);
  assert.deepEqual(FAMILIES.find(f => f.id === 'grok').members, ['grok-4.5', 'grok-4.6', 'grok-4.7']);
  assert.deepEqual(FAMILIES.find(f => f.id === 'gpt-5.6').members, ['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra']);
  assert.deepEqual(FAMILIES.find(f => f.id === 'opus').members, ['claude-opus-4-6', 'claude-opus-4-8']);
  assert.ok(FAMILIES.every(f => f.members.length >= 2)); // no single-member family (OD-WS3-1)
});

// (2) known aliases resolve to the right canonical key + label (checked against real data)
test('2: known (provider, modelId) aliases resolve correctly; every real family member matches its label', () => {
  assert.equal(resolveCanonical({ provider: 'xai', modelId: 'grok-4.6' }), 'grok-4.6');
  assert.equal(canonicalLabel('grok-4.6'), 'Grok 4.6');
  assert.equal(resolveCanonical({ provider: 'openai', modelId: 'gpt-5.6-sol' }), 'gpt-5.6-sol');
  assert.equal(resolveCanonical({ provider: 'anthropic', modelId: 'claude-opus-4-8' }), 'claude-opus-4-8');
  assert.equal(familyOf({ provider: 'xai', modelId: 'grok-4.7' }), 'grok');
  // every real submission that resolves must have the declared label equal to its display name
  for (const sub of ALL_SUBS) {
    const key = resolveCanonical(sub);
    if (key) assert.equal(canonicalLabel(key), sub.model, `canonical ${key} label must equal ${sub.model}`);
  }
});

// (3) unknown / missing-modelId submissions fail soft: null canonical, no family, still real data
test('3: unknown or missing-modelId submissions resolve to null (fail-soft, no family)', () => {
  assert.equal(resolveCanonical({ provider: 'cursor', model: 'Composer 2.5' }), null); // no modelId
  assert.equal(resolveCanonical({ provider: 'xai', modelId: 'grok-9.9' }), null);        // unknown version
  assert.equal(resolveCanonical({ provider: 'openai', modelId: 'gpt-5.5' }), null);       // singleton, not a family member
  assert.equal(resolveCanonical(null), null);
  assert.equal(resolveCanonical({ provider: 'xai' }), null);                              // missing modelId
  const composer = ALL_SUBS.find(s => s.model === 'Composer 2.5');
  assert.ok(composer, 'Composer 2.5 exists in the manifest');
  assert.equal(familyOf(composer), null);                                                // unknown model gets no family
});

// (4) an alias claimed by two canonical entries fails CLOSED (no arbitrary pick)
test('4: alias collision fails closed and is reported by validation', () => {
  const colliding = [
    { key: 'a', label: 'A', family: 'f', aliases: [{ provider: 'p', modelId: 'x' }] },
    { key: 'b', label: 'B', family: 'f', aliases: [{ provider: 'p', modelId: 'x' }] }, // same alias
  ];
  const { resolve, collisions } = makeResolver(colliding);
  assert.equal(resolve({ provider: 'p', modelId: 'x' }), null); // not 'a', not 'b' — fail closed
  assert.ok(collisions.size >= 1);
  const problems = validateSpec(colliding, [{ id: 'f', label: 'F', members: ['a', 'b'] }], [{ provider: 'p', modelId: 'x', model: 'A' }]);
  assert.ok(problems.some(p => /collision/.test(p)), 'collision reported');
});

// (5) invalid DECLARED registry entries make validation fail (CI red)
test('5: invalid declared registry entries fail validation', () => {
  // a member that resolves to no real submission
  let p = validateSpec(
    [{ key: 'ghost', label: 'Ghost', family: 'g', aliases: [{ provider: 'none', modelId: 'none' }] }],
    [{ id: 'g', label: 'G', members: ['ghost'] }], ALL_SUBS);
  assert.ok(p.some(x => /no real submission/.test(x)), 'phantom member reported');
  // the same canonical key in two families
  p = validateSpec(
    [{ key: 'k', label: 'Grok 4.5', family: 'grok', aliases: [{ provider: 'xai', modelId: 'grok-4.5' }] },
     { key: 'k', label: 'Grok 4.5', family: 'opus', aliases: [{ provider: 'xai', modelId: 'grok-4.5' }] }],
    [{ id: 'grok', label: 'Grok', members: ['k'] }, { id: 'opus', label: 'Opus', members: ['k'] }], ALL_SUBS);
  assert.ok(p.some(x => /multiple families/.test(x)), 'two-family key reported');
  // a label the real data contradicts
  p = validateSpec(
    [{ key: 'grok-4.5', label: 'WRONG NAME', family: 'grok', aliases: [{ provider: 'xai', modelId: 'grok-4.5' }] }],
    [{ id: 'grok', label: 'Grok', members: ['grok-4.5'] }], ALL_SUBS);
  assert.ok(p.some(x => /contradicts real display name/.test(x)), 'label mismatch reported');
  // FAMILIES / CANONICAL_MODELS drift (member not in canonical)
  p = validateSpec(
    [{ key: 'grok-4.5', label: 'Grok 4.5', family: 'grok', aliases: [{ provider: 'xai', modelId: 'grok-4.5' }] }],
    [{ id: 'grok', label: 'Grok', members: ['grok-4.5', 'grok-4.6'] }], ALL_SUBS);
  assert.ok(p.some(x => /unknown member/.test(x)), 'FAMILIES drift reported');
});

// (6) the REAL registry validates against the manifest; family values are current-task-only
test('6: real registry validates on real data; family expansion is per-task actual members', () => {
  assert.deepEqual(validateRegistry(ALL_SUBS), []); // the shipped registry is clean on the real manifest
  const sav = taskSubs('savannah-ecosystem');
  assert.deepEqual(familyFacetValues(sav, 'grok'), ['Grok 4.5', 'Grok 4.6', 'Grok 4.7']);
  assert.deepEqual(familyFacetValues(sav, 'opus'), ['Opus 4.6', 'Opus 4.8']);
  const lon = taskSubs('london-island');
  assert.deepEqual(familyFacetValues(lon, 'opus'), []);                       // london has no Opus
  assert.deepEqual(familiesInTask(lon).map(f => f.id).sort(), ['gpt-5.6', 'grok']);
  const spin = taskSubs('spinning-cube');
  assert.deepEqual(familiesInTask(spin), []);                                 // only 1 Opus member present → no shortcut
  assert.deepEqual(familyFacetValues(spin, 'opus'), ['Opus 4.8']);           // the lone present member, but <2 so not offered
});

// (7) a family expansion composes with individual-model multi-select, cross-family (OD-WS3-4)
test('7: family expansion + individual model multi-select coexist under P0 OR/AND', () => {
  const sav = taskSubs('savannah-ecosystem');
  const grokValues = familyFacetValues(sav, 'grok');                          // ['Grok 4.5','Grok 4.6','Grok 4.7']
  let st = initState(FACETS);
  for (const v of grokValues) st = toggle(st, 'model', v);                    // "select Grok family" = add each member
  assert.deepEqual([...st.model].sort(), [...grokValues].sort());
  st = toggle(st, 'model', 'GPT-5.6 Sol');                                    // add a cross-family individual model
  for (const v of grokValues) assert.ok(st.model.includes(v));               // grok selections preserved
  assert.ok(st.model.includes('GPT-5.6 Sol'));
  const shown = sav.filter(s => visible(s, st, FACETS)).map(s => s.model);
  for (const v of [...grokValues, 'GPT-5.6 Sol']) assert.ok(shown.includes(v)); // OR selects all of them
});

// (8) a new (undeclared) model never enters a family expansion (no silent subset growth)
test('8: a future undeclared model does not silently join a family expansion', () => {
  const sav = taskSubs('savannah-ecosystem');
  const withNew = [...sav, { id: 'x', provider: 'xai', model: 'Grok 5.0', modelId: 'grok-5.0' }];
  assert.deepEqual(familyFacetValues(withNew, 'grok'), ['Grok 4.5', 'Grok 4.6', 'Grok 4.7']); // unchanged
  assert.ok(!familyFacetValues(withNew, 'grok').includes('Grok 5.0'));
  assert.equal(familyOf({ provider: 'xai', modelId: 'grok-5.0' }), null);     // renders normally, no family
});

// (9) P0 model-facet value contract preserved: every family expansion value is a real facet value
test('9: family expansion drives the existing model facet with real values (valid P0 Subset)', () => {
  for (const id of ['savannah-ecosystem', 'tokyo-island', 'london-island']) {
    const subs = taskSubs(id);
    const modelFacet = new Set(subs.map(s => s.model || '—'));                // the P0 model-facet values
    for (const fam of familiesInTask(subs)) {
      assert.ok(fam.values.length >= 2);
      for (const v of fam.values) assert.ok(modelFacet.has(v), `${id}/${fam.id}: '${v}' must be a real model-facet value`);
    }
  }
});
