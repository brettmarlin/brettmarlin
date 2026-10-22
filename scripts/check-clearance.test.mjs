/**
 * Coverage for the clearance guard. The core is pure over strings — index
 * parsing, whole-word matching, and the surface-by-status rules — so every test
 * runs against inline fixtures with no vault and no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIndex,
  scanBundle,
  failsOn,
  matcherFor,
  findHits,
  parseAwaitingDecision,
  snippet,
} from './check-clearance.mjs';

// Wrap a body of yaml entity lines in the section + fence the guard looks for.
const indexMd = (entityLines) =>
  `# Consent Clearances\n\nsome prose\n\n## Machine-readable index\n\nblah\n\n\`\`\`yaml\nversion: 1\nupdated: 2026-08-05\nentities:\n${entityLines}\n\`\`\`\n`;

// One study block in the shape the generator emits, so slug attribution works.
const study = (slug, body) => `  {\n    slug: "${slug}",\n    body: "${body}",\n  },`;

const ONE_OF_EACH = [
  '  - { name: "Carta",           kind: employer,          status: public }',
  '  - { name: "Convoy Defense",  kind: active-engagement, status: gated }',
  '  - { name: "Dawn Shakh",      kind: person,            status: internal }',
  '  - { name: "Anduril",         kind: third-party,       status: redacted }',
  '  - { name: "Wobble",          kind: employer,          status: unreviewed }',
].join('\n');

test('parseIndex reads a well-formed block, including comments and a wrapped note entry', () => {
  const md = indexMd([
    '  # a comment inside the list',
    '  - { name: "Carta", kind: employer, status: public }',
    '  - { name: "Nike",  kind: placeholder-data, scope: Mixpanel, status: public, decided: 2026-08-05,',
    '      note: "Dummy data inside a mockup, not a relationship." }',
    '  - { name: "Procter & Gamble", kind: third-party, scope: StudioNow, status: public }',
  ].join('\n'));
  const { entities, version, updated } = parseIndex(md);
  assert.equal(version, '1');
  assert.equal(updated, '2026-08-05');
  assert.equal(entities.length, 3);
  assert.equal(entities[1].name, 'Nike');
  assert.equal(entities[1].scope, 'Mixpanel');
  assert.match(entities[1].note, /Dummy data/);
  assert.equal(entities[2].name, 'Procter & Gamble');
});

test('surface × status: public-grid disallows everything but public', () => {
  assert.equal(failsOn('public', 'public-grid'), false);
  assert.equal(failsOn('gated', 'public-grid'), true);
  assert.equal(failsOn('internal', 'public-grid'), true);
  assert.equal(failsOn('redacted', 'public-grid'), true);
  assert.equal(failsOn('unreviewed', 'public-grid'), true);
});

test('surface × status: recipient allows gated but nothing stricter', () => {
  assert.equal(failsOn('public', 'recipient'), false);
  assert.equal(failsOn('gated', 'recipient'), false);
  assert.equal(failsOn('internal', 'recipient'), true);
  assert.equal(failsOn('redacted', 'recipient'), true);
  assert.equal(failsOn('unreviewed', 'recipient'), true);
});

test('an unreviewed name in public output is a violation (build would block)', () => {
  const { entities } = parseIndex(indexMd(ONE_OF_EACH));
  const bundle = study('demo', 'Built at Wobble before the redesign.');
  const v = scanBundle({ bundleText: bundle, entities, surface: 'public-grid' });
  assert.equal(v.length, 1);
  assert.equal(v[0].name, 'Wobble');
  assert.equal(v[0].status, 'unreviewed');
  assert.equal(v[0].slug, 'demo');
});

test('an internal name in public output is a violation', () => {
  const { entities } = parseIndex(indexMd(ONE_OF_EACH));
  const bundle = study('demo', 'Dawn Shakh led the hire.');
  const v = scanBundle({ bundleText: bundle, entities });
  assert.equal(v.length, 1);
  assert.equal(v[0].name, 'Dawn Shakh');
  assert.equal(v[0].status, 'internal');
});

test('a public name in public output is never a violation', () => {
  const { entities } = parseIndex(indexMd(ONE_OF_EACH));
  const bundle = study('demo', 'The Carta engagement shipped.');
  assert.equal(scanBundle({ bundleText: bundle, entities }).length, 0);
});

test('a gated name passes in a recipient view and fails in public-grid', () => {
  const { entities } = parseIndex(indexMd(ONE_OF_EACH));
  const bundle = study('demo', 'The Convoy Defense deployment was air-gapped.');
  assert.equal(scanBundle({ bundleText: bundle, entities, surface: 'recipient' }).length, 0);
  const pub = scanBundle({ bundleText: bundle, entities, surface: 'public-grid' });
  assert.equal(pub.length, 1);
  assert.equal(pub[0].name, 'Convoy Defense');
});

test('a violation carries the surrounding sentence, so a false positive is obvious', () => {
  const { entities } = parseIndex(indexMd(ONE_OF_EACH));
  const bundle = study('demo', 'The Convoy Defense deployment was air-gapped.');
  const [v] = scanBundle({ bundleText: bundle, entities });
  assert.match(v.snippet, /Convoy Defense/);
  assert.match(v.snippet, /air-gapped/);
});

// --- whole-word matching -----------------------------------------------------

test('whole-word: "Patched" does not match "Patch"', () => {
  const re = matcherFor('Patch');
  assert.equal(re.test('The system was Patched overnight.'), false);
});

test('whole-word: "Patch" matches as a standalone token, case-insensitively', () => {
  assert.equal(matcherFor('Patch').test('routed to patch and Huffington Post'), true);
  assert.equal(matcherFor('Patch').test('the Patch network'), true);
});

test('whole-word: a name is matched when hugged by punctuation', () => {
  const hits = findHits('a { x: "shipped to Patch." }', { name: 'Patch', status: 'unreviewed' });
  assert.equal(hits.length, 1);
});

test('whole-word: a name inside a larger word is not matched (dispatch ≠ Patch)', () => {
  assert.equal(matcherFor('Patch').test('we dispatch nightly'), false);
});

// --- malformed blocks fail loudly, never silently ----------------------------

test('malformed: missing index section throws', () => {
  assert.throws(() => parseIndex('# just prose, no index'), /no "## Machine-readable index"/);
});

test('malformed: missing yaml fence throws', () => {
  assert.throws(() => parseIndex('## Machine-readable index\n\nno fence here\n'), /no fenced yaml block/);
});

test('malformed: no entities key throws', () => {
  const md = '## Machine-readable index\n\n```yaml\nversion: 1\n```\n';
  assert.throws(() => parseIndex(md), /no "entities:" key/);
});

test('malformed: an unbalanced entry throws rather than dropping entries', () => {
  const md = indexMd('  - { name: "Carta", kind: employer, status: public');
  assert.throws(() => parseIndex(md), /unterminated entity entry/);
});

test('malformed: an unknown status throws, naming the entity', () => {
  const md = indexMd('  - { name: "Carta", kind: employer, status: probably-fine }');
  assert.throws(() => parseIndex(md), /unknown status "probably-fine"/);
});

test('malformed: an empty entities list throws instead of parsing to nothing', () => {
  const md = indexMd('  # nothing but a comment');
  assert.throws(() => parseIndex(md), /parsed zero entities/);
});

test('malformed: an entry with no status throws', () => {
  const md = indexMd('  - { name: "Carta", kind: employer }');
  assert.throws(() => parseIndex(md), /has no status/);
});

test('malformed: an entry with no name throws', () => {
  const md = indexMd('  - { kind: employer, status: public }');
  assert.throws(() => parseIndex(md), /has no name/);
});

// --- report helpers ----------------------------------------------------------

test('parseAwaitingDecision returns the section body and stops at the next heading', () => {
  const md = '## Awaiting decision\nName A — found in X.\nName B — found in Y.\n\n## Next section\nother';
  const body = parseAwaitingDecision(md);
  assert.match(body, /Name A/);
  assert.match(body, /Name B/);
  assert.doesNotMatch(body, /Next section/);
});

test('snippet elides at both ends and collapses escaped newlines', () => {
  const text = 'x'.repeat(200) + 'Patch' + 'y'.repeat(200);
  const s = snippet(text, 200, 5);
  assert.ok(s.startsWith('…') && s.endsWith('…'));
  assert.match(s, /Patch/);
});
