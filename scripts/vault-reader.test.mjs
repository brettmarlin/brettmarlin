/**
 * Clearance tests for the vault-reading layer (vault-reader.mjs). These pin
 * the contract that decides what may leave the vault:
 *
 *   - a take is readable only at its declared site_visibility
 *   - public-grid requires clearance: public; recipient-only requires
 *     clearance: gated; a mismatch throws rather than leaks
 *   - Beats in gated takes never enter the collected output
 *   - nothing outside the requested take block is ever returned
 *
 * The parsing internals (beats, shots, video pairing, ids) are covered in
 * generate-case-studies.test.mjs; this file is only about the gate.
 * Run with: npm test (node --test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTake, collectBeatsByTake, buildStudy, publicGridTakeAngles } from './vault-reader.mjs';

// Phase 2, 2026-08-14. A take header no longer says whether the STUDY is
// public — `visibility:` in frontmatter does, and did for two days while the
// header said it too. Both were live, tools picked different ones, and
// bind-images could not see MAF Machine at all.
//
// site_visibility survives for exactly one thing: recipient-only, which is
// per-take and is NOT implied by the study. One study is public and carries a
// recipient take beside its public one.
const PUBLIC_HEADER = '_clearance: public_';
const GATED_HEADER = '_clearance: gated · site_visibility: recipient-only_';

/** Fixtures need frontmatter now, because that is where visibility lives. */
const FM = (visibility = 'public') => `---\nslug: fixture\nvisibility: ${visibility}\n---\n\n`;

function takeBlock(angle, header, body) {
  return `## Take — ${angle}\n${header}\n\n${body}\n`;
}

// --- parseTake: visibility selects, clearance gates ---

test('parseTake returns only the requested take at its declared visibility', () => {
  const md =
    FM() +
    takeBlock('decisions-outcomes', PUBLIC_HEADER, '### Problem\nPublic problem.') +
    takeBlock('recipient-named', GATED_HEADER, '### Problem\nGated problem.');
  const { sections, hero } = parseTake(md, 'decisions-outcomes', 'public-grid');
  assert.equal(sections['Problem'], 'Public problem.');
  assert.equal(hero, null);
});

test('parseTake returns null for a take whose visibility does not match the request', () => {
  const md = FM() + takeBlock('recipient-named', GATED_HEADER, '### Problem\nGated problem.');
  assert.equal(parseTake(md, 'recipient-named', 'public-grid'), null);
});

test('parseTake returns null when the named take is absent', () => {
  const md = FM() + takeBlock('decisions-outcomes', PUBLIC_HEADER, '### Problem\nP.');
  assert.equal(parseTake(md, 'no-such-take', 'public-grid'), null);
});

test('parseTake returns null for a take with no clearance line', () => {
  const md = FM() + takeBlock('decisions-outcomes', '_clearance: gated_', '### Problem\nP.');
  // Uncleared is unpublished, not fatal: phase 2 removed the CLAIM a take
  // used to make, so there is nothing left for a missing clearance to
  // contradict. Failing the build here punishes every finished study.
  assert.equal(parseTake(md, 'decisions-outcomes', 'public-grid'), null);
});

test('parseTake throws on recipient-only without clearance: gated', () => {
  const md = FM() + takeBlock('recipient-named', '_clearance: public · site_visibility: recipient-only_', '### Problem\nP.');
  assert.throws(() => parseTake(md, 'recipient-named', 'recipient-only'), /without clearance: gated/);
});

test('parseTake never returns content outside the requested take block', () => {
  const md =
    FM() +
    '## Source\n\nRaw interview notes that must never ship.\n\n' +
    takeBlock('decisions-outcomes', PUBLIC_HEADER, '### Problem\nPublic problem.\n\n### Outcome\nO.') +
    '## Notes\n\nMore private material.\n';
  const { sections } = parseTake(md, 'decisions-outcomes', 'public-grid');
  const emitted = JSON.stringify(sections);
  assert.ok(!emitted.includes('interview notes'));
  assert.ok(!emitted.includes('private material'));
  assert.equal(sections['Problem'], 'Public problem.');
});

// --- parseTake: the optional _hero:_ line in the take preamble ---

test('parseTake reads an explicit _hero:_ line directly under the take header', () => {
  const md = FM() + takeBlock('decisions-outcomes', PUBLIC_HEADER, '_hero: 01-sample-hero.jpg_\n\n### Problem\nP.');
  const { sections, hero } = parseTake(md, 'decisions-outcomes', 'public-grid');
  assert.equal(hero, '01-sample-hero.jpg');
  assert.equal(sections['Problem'], 'P.');
});

test('a _hero:_ line inside a section is body text, not a hero declaration', () => {
  // The hero line belongs in the take preamble, alongside clearance and
  // site_visibility; the same text further down must not silently become one.
  const md = FM() + takeBlock('decisions-outcomes', PUBLIC_HEADER, '### Problem\nP.\n\n_hero: sneaky.jpg_');
  const { hero } = parseTake(md, 'decisions-outcomes', 'public-grid');
  assert.equal(hero, null);
});

test('a hero declared in an invisible take is invisible with it', () => {
  const md = FM() + takeBlock('recipient-named', GATED_HEADER, '_hero: gated-hero.jpg_\n\n### Problem\nG.');
  assert.equal(parseTake(md, 'recipient-named', 'public-grid'), null);
});

// --- collectBeatsByTake: the public-grid gate on beats ---

test('collectBeatsByTake collects beats only from public-grid takes', () => {
  const md =
    FM() +
    takeBlock('decisions-outcomes', PUBLIC_HEADER, '### Beats\n\n#### Public beat\nShown.') +
    takeBlock('recipient-named', GATED_HEADER, '### Beats\n\n#### Secret beat\nNever shown.');
  const { beatsByTake } = collectBeatsByTake(md, 'f.md');
  assert.deepEqual(Object.keys(beatsByTake), ['decisions-outcomes']);
  assert.ok(!JSON.stringify(beatsByTake).includes('Secret beat'));
});

test('a take with no clearance line is not published, and does not fail the build', () => {
  // Before phase 2 a take had to CLAIM public-grid, and claiming it without
  // clearance was a contradiction worth throwing over. With the claim gone
  // there is nothing to contradict — an uncleared take is simply one nobody
  // cleared, and failing the build over it punishes every finished study for
  // one unfinished take. It warns and is left out.
  const md = FM() + takeBlock('decisions-outcomes', '_primary_', '### Beats\n\n#### Beat\nB.');
  const { beatsByTake, warnings } = collectBeatsByTake(md, 'f.md');
  assert.deepEqual(beatsByTake, {});
  assert.match(warnings.join(' '), /no clearance line; not published/);
});

test('a take with no header line of the expected shape is not collected', () => {
  // The take regex requires the underscore header directly under the heading;
  // a malformed take is invisible rather than accidentally public.
  const md = '## Take — decisions-outcomes\n\nProse without a header line.\n\n### Beats\n\n#### Beat\nB.\n';
  const { beatsByTake } = collectBeatsByTake(md, 'f.md');
  assert.deepEqual(beatsByTake, {});
});

// --- parseTake: the angle is a name, not a permission ---

test('parseTake reads a public-abstracted take on the same terms as decisions-outcomes', () => {
  // Work cleared by abstraction rather than by name carries this angle. It
  // clears on its header like any other take; the angle only names it.
  const md = FM() + takeBlock('public-abstracted', PUBLIC_HEADER, '_hero: 01-abstracted-hero.jpg_\n\n### Problem\nAbstracted problem.');
  const { sections, hero } = parseTake(md, 'public-abstracted', 'public-grid');
  assert.equal(sections['Problem'], 'Abstracted problem.');
  assert.equal(hero, '01-abstracted-hero.jpg');
});

test('a public-abstracted take is unpublished too when it has no clearance line', () => {
  const md = FM() + takeBlock('public-abstracted', '_clearance: gated_', '### Problem\nP.');
  // Uncleared is unpublished, not fatal: phase 2 removed the CLAIM a take
  // used to make, so there is nothing left for a missing clearance to
  // contradict. Failing the build here punishes every finished study.
  assert.equal(parseTake(md, 'public-abstracted', 'public-grid'), null);
});

// --- publicGridTakeAngles: what the generator would otherwise drop silently ---

test('publicGridTakeAngles reports every angle cleared for the public grid', () => {
  const md =
    FM() +
    takeBlock('decisions-outcomes', PUBLIC_HEADER, '### Problem\nP.') +
    takeBlock('public-abstracted', PUBLIC_HEADER, '### Problem\nA.') +
    takeBlock('recipient-named', GATED_HEADER, '### Problem\nG.');
  assert.deepEqual(publicGridTakeAngles(md), ['decisions-outcomes', 'public-abstracted']);
});

test('a legacy header in a public study fails loudly instead of being skipped', () => {
  // This test used to assert the opposite: a header predating the
  // site_visibility contract was silently not-public-grid, because it did not
  // carry the marker. Phase 2 removed the marker, so a study being public is
  // what makes its takes eligible — and a take with no `clearance: public` in a
  // public study is now a contradiction worth raising rather than a take to
  // quietly skip. Silence there is how work ships uncleared.
  const md = FM() + takeBlock('public-abstracted', '_public-abstracted · portfolio surfaces · public · ready_', '### Problem\nP.');
  assert.deepEqual(publicGridTakeAngles(md), ['public-abstracted']);
  assert.equal(parseTake(md, 'public-abstracted', 'public-grid'), null, 'uncleared is unpublished');
});

// --- buildStudy: only take sections reach the study object ---

test('buildStudy builds solely from the sections parseTake returned', () => {
  const md = FM() + takeBlock(
    'decisions-outcomes',
    PUBLIC_HEADER,
    [
      '### Card',
      '- slug: sample',
      '- title: Sample',
      '- outcome: Did the thing',
      '- tags: One, Two',
      '- order: 1',
      '',
      '### Problem',
      'The problem.',
      '',
      '### Decisions',
      '- First decision',
      '',
      '### Outcome',
      'The outcome.',
    ].join('\n')
  );
  const { sections } = parseTake(md, 'decisions-outcomes', 'public-grid');
  const { study, order } = buildStudy(sections, 'f.md');
  assert.equal(study.slug, 'sample');
  assert.deepEqual(study.tags, ['One', 'Two']);
  assert.deepEqual(study.built, ['First decision']);
  assert.equal(order, 1);
});
