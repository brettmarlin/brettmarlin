import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrimaryTake, primaryTakeMarker, publicGridTakeAngles } from './vault-reader.mjs';
import { pickPublishedTake } from './generate-case-studies.mjs';

// Phase 2: a study is public because its FRONTMATTER says so, so a fixture
// that wants to be read needs frontmatter. The take header no longer carries it.
const FM = '---\nslug: x\nvisibility: public\n---\n\n';

const header = (extra = '') => `_clearance: public${extra}_`;
const take = (angle, extra = '') => `## Take — ${angle}\n${header(extra)}\n### Beats\n\n#### x\nbody\n\n`;

test('primaryTakeMarker finds the marked take and only public-grid takes', () => {
  const md = FM + take('a') + take('b', ' · primary')
    + '## Take — c\n_clearance: gated · site_visibility: recipient-only · primary_\n### Beats\n';
  assert.deepEqual(publicGridTakeAngles(md), ['a', 'b']);
  assert.deepEqual(primaryTakeMarker(md), ['b'], 'a gated take may not claim the public primary');
});

test('a single take needs no marker', () => {
  assert.equal(pickPrimaryTake({ 'decisions-outcomes': [] }, 'f.md', []), 'decisions-outcomes');
});

test('two takes with one marked opens on the marked one', () => {
  assert.equal(pickPrimaryTake({ a: [], b: [] }, 'f.md', ['b']), 'b');
});

test('two takes and no marker fails loudly rather than guessing', () => {
  assert.throws(
    () => pickPrimaryTake({ a: [], b: [] }, 'f.md', []),
    /none is marked primary/,
    'which frame a reader lands on is a content decision; a silent default is invisibly wrong'
  );
});

test('two marked primaries is an error, not a first-wins', () => {
  assert.throws(() => pickPrimaryTake({ a: [], b: [] }, 'f.md', ['a', 'b']), /exactly one may be/);
});

test('a marker naming a take with no Beats is ignored, not obeyed', () => {
  assert.throws(() => pickPrimaryTake({ a: [], b: [] }, 'f.md', ['zzz']), /none is marked primary/);
});

test('no takes at all returns null', () => {
  assert.equal(pickPrimaryTake({}, 'f.md', []), null);
});

// ---------------------------------------------------------------------------
// pickPublishedTake: which take the SITE publishes.
//
// Read from the study's `published_take:` frontmatter, never derived. The
// earlier version inferred it from the beats take with a fallback chain, and
// the inference MOVED when a take was added — authoring a second framing would
// silently republish the study under a different one. These tests pin that the
// answer now comes from the file and that both ways of not having one are
// errors rather than defaults.
//
// Note this says nothing about readers. A take is an authoring concept; no
// reader is ever shown which take they are reading, or that others exist.
// ---------------------------------------------------------------------------
const FILE = 'f.md';

test('pickPublishedTake returns the declared take', () => {
  assert.equal(
    pickPublishedTake(['decisions-outcomes', 'public-abstracted'], 'public-abstracted', FILE),
    'public-abstracted'
  );
});

test('a single readable take still has to be declared', () => {
  // No "there is only one, so obviously that one". Obvious today is a
  // different answer the moment a second take is written.
  assert.throws(() => pickPublishedTake(['decisions-outcomes'], null, FILE), /missing "published_take"/);
});

test('the error names the takes that could have been chosen', () => {
  assert.throws(
    () => pickPublishedTake(['decisions-outcomes', 'public-abstracted'], null, FILE),
    /decisions-outcomes, public-abstracted/
  );
});

test('declaring a take that is not readable here is an error, not a fallback', () => {
  assert.throws(
    () => pickPublishedTake(['decisions-outcomes'], 'investor-update', FILE),
    /published_take is "investor-update" but that take is not readable here/
  );
});

test('the unreadable-take error says what makes a take publishable', () => {
  assert.throws(
    () => pickPublishedTake(['decisions-outcomes'], 'recipient-named', FILE),
    /clearance: public/
  );
});

test('no readable takes at all returns null rather than throwing', () => {
  // A study with nothing public is the ordinary case for gated work and
  // drafts. It is simply not in the bundle, and that is not an error.
  assert.equal(pickPublishedTake([], null, FILE), null);
  assert.equal(pickPublishedTake([], 'decisions-outcomes', FILE), null);
});
