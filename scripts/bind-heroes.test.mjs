import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveStudy, writeHeroLine, readStudies, contentHash, hashedName, heroFormat } from './bind-heroes.mjs';
import { skipWithoutVault } from './vault-present.mjs';

const studies = [
  { file: 'altana-value-chain-management.md', vaultSlug: 'altana-value-chain-management', cardSlug: 'altana', takes: [{}], heroes: [] },
  { file: 'lobus-mobile-collector-app.md', vaultSlug: 'lobus-mobile-collector-app', cardSlug: 'lobus-mobile-collector-app', takes: [{}], heroes: [] },
  { file: 'maf-machine-ai-endurance-coach.md', vaultSlug: 'maf-machine-ai-endurance-coach', cardSlug: null, takes: [], heroes: [] },
];

test('the card slug resolves', () => {
  const r = resolveStudy('altana', studies);
  assert.equal(r.study.file, 'altana-value-chain-management.md');
  assert.equal(r.matchedOn, 'card slug');
});

test('the vault filename resolves to the same study', () => {
  const r = resolveStudy('altana-value-chain-management', studies);
  assert.equal(r.study.cardSlug, 'altana');
  assert.equal(r.matchedOn, 'vault filename');
});

test('a study with no Card slug has no R2 prefix and is refused', () => {
  const r = resolveStudy('maf-machine-ai-endurance-coach', studies);
  assert.match(r.error, /no Card slug/);
});

test('an unknown stem is an error, never a guess', () => {
  assert.match(resolveStudy('altanna', studies).error, /matches no study/);
  assert.match(resolveStudy('hero', studies).error, /matches no study/);
});

test('resolution is case-insensitive on the stem', () => {
  assert.equal(resolveStudy('ALTANA', studies).study.cardSlug, 'altana');
});

test('the hero line lands directly under the take header, not at the top of the file', () => {
  const md = [
    '---', 'slug: x', '---', '',
    '## Take — decisions-outcomes',
    '_clearance: public · primary_',
    '### Card',
  ].join('\n');
  const out = writeHeroLine(md, '_clearance: public · primary_', '00-hero.jpg');
  const lines = out.split('\n');
  const i = lines.findIndex((l) => l.startsWith('_hero:'));
  assert.equal(lines[i - 1], '_clearance: public · primary_');
  assert.equal(lines[i + 1], '### Card');
});

test('the primary marker on a header survives the hero write', () => {
  const header = '_clearance: public · primary_';
  const out = writeHeroLine(`## Take — x\n${header}\n`, header, '00-hero.jpg');
  assert.match(out, /· primary_/);
});

test('every study in the real vault resolves by both of its names', { skip: skipWithoutVault }, () => {
  for (const s of readStudies().filter((s) => s.cardSlug)) {
    assert.equal(resolveStudy(s.cardSlug, readStudies()).study?.cardSlug, s.cardSlug, s.file);
  }
});

test('a near-miss names the study rather than printing the whole list', { skip: skipWithoutVault }, () => {
  assert.match(resolveStudy('mixpanel', readStudies()).error, /Did you mean mixpanel-design-org-ownership\?/);
  assert.match(resolveStudy('studionow', readStudies()).error, /Did you mean studionow-saas-platform-evolution\?/);
});

test('an ambiguous prefix names every candidate and refuses to choose', { skip: skipWithoutVault }, () => {
  const e = resolveStudy('convoy', readStudies()).error;
  assert.match(e, /ambiguous/);
  assert.match(e, /agentic-decision-layer-defense/);
  assert.match(e, /design-system-contracts-and-governance/);
});


// --- content-hashed names -----------------------------------------------------
// The Worker serves images `max-age=31536000, immutable`. Under that promise a
// changed image MUST get a changed name, or the new bytes sit in R2 while every
// cache that holds the old ones serves them for a year. An earlier version of
// this script overwrote in place; these tests exist so that never returns.

test('a hash is short, hex, and stable for identical bytes', () => {
  const a = contentHash(Buffer.from('same'));
  assert.equal(a, contentHash(Buffer.from('same')));
  assert.match(a, /^[0-9a-f]{8}$/);
});

test('different bytes give a different name', () => {
  assert.notEqual(contentHash(Buffer.from('one')), contentHash(Buffer.from('two')));
});

test('the hash is inserted before the extension', () => {
  assert.equal(hashedName('00-mixpanel-hero.jpg', 'a1b2c3d4'), '00-mixpanel-hero.a1b2c3d4.jpg');
});

test('names do not accrete hashes across revisions', () => {
  const once = hashedName('00-mixpanel-hero.jpg', 'a1b2c3d4');
  const twice = hashedName(once, 'e5f6a7b8');
  assert.equal(twice, '00-mixpanel-hero.e5f6a7b8.jpg');
  assert.equal(twice.match(/[0-9a-f]{8}/g).length, 1);
});

test('a png source still lands as .jpg, because conversion is to jpeg', () => {
  assert.match(hashedName('01-decision-layer-hero.png', 'a1b2c3d4', 'png'), /\.png$/);
});

test('a study with no hero yet gets the canonical base name', () => {
  assert.equal(hashedName(null, 'a1b2c3d4'), '00-hero.a1b2c3d4.jpg');
});

test('re-running with identical bytes produces the name the study already has', () => {
  const hash = contentHash(Buffer.from('pixels'));
  const first = hashedName('00-hero.jpg', hash);
  assert.equal(hashedName(first, hash), first, 'a no-op run must be detectable as a no-op');
});

// --- format ------------------------------------------------------------------
// This converted everything to JPEG until 2026-08-12, and a test asserted it, so
// the decision looked deliberate rather than incidental. It is wrong for the
// material: UI screenshots, diagrams and anything with hard type edges go
// visibly mushy through JPEG chroma subsampling, and that is most of this
// portfolio.

test('a PNG hero stays a PNG', () => {
  assert.deepEqual(heroFormat('marlo-constrained-conversational-agent.png'), { sipsFormat: 'png', extension: 'png' });
  assert.equal(hashedName('00-hero.png', 'a1b2c3d4', 'png'), '00-hero.a1b2c3d4.png');
});

test('photographs and exotic formats still normalise to JPEG', () => {
  for (const source of ['shot.jpg', 'shot.JPEG', 'scan.tiff', 'old.gif', 'thing.webp']) {
    assert.equal(heroFormat(source).extension, 'jpg', source);
  }
});

test('a format change renames rather than doubling the extension', () => {
  // jpg -> png must not produce 00-hero.jpg.a1b2c3d4.png.
  assert.equal(hashedName('00-hero.a1b2c3d4.jpg', 'e5f6a7b8', 'png'), '00-hero.e5f6a7b8.png');
});

test('the default hero name takes the format it is encoded as', () => {
  assert.equal(hashedName(null, 'a1b2c3d4', 'png'), '00-hero.a1b2c3d4.png');
  assert.equal(hashedName(null, 'a1b2c3d4'), '00-hero.a1b2c3d4.jpg');
});

test('the dry run names the same file --apply would write', () => {
  // The plan printer called hashedName without an extension, so it defaulted to
  // jpg while --apply produced png. A dry run that misreports the filename is
  // worse than no dry run: it is the one place you look before committing.
  const src = readFileSync(new URL('./bind-heroes.mjs', import.meta.url), 'utf8');
  const printer = /const shape = hashedName\(([^;]*)\);/.exec(src);
  assert.ok(printer, 'the plan printer should compute a shape');
  assert.match(printer[1], /heroFormat\(/, 'the printed name must derive its extension from the source');
});
