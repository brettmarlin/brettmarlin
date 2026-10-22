import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { visibilityOf, isPublic, isRecipientEligible, VISIBILITY } from './vault-reader.mjs';
import { skipWithoutVault, VAULT_DIR } from './vault-present.mjs';

const fm = (visibility) =>
  `---\ntype: case-study\nslug: x\n${visibility === null ? '' : `visibility: ${visibility}\n`}---\n\n# X\n`;

// --- the ladder ---------------------------------------------------------------

test('the ladder: each value does everything the one below it does', () => {
  assert.deepEqual(VISIBILITY, ['draft', 'gated', 'public']);

  assert.equal(isPublic('public'), true);
  assert.equal(isPublic('gated'), false);
  assert.equal(isPublic('draft'), false);

  assert.equal(isRecipientEligible('public'), true, 'a public study can be picked for a recipient');
  assert.equal(isRecipientEligible('gated'), true, 'that is what gated is FOR');
  assert.equal(isRecipientEligible('draft'), false, 'a draft reaches nobody');
});

test('absent visibility is an error, never a default', () => {
  // Defaulting either way is a decision the schema must not make: public
  // publishes private work because a field was forgotten, draft empties the
  // grid. Same reasoning as published_take.
  assert.throws(() => visibilityOf(fm(null), 'x.md'), /missing "visibility"/);
});

test('an unknown value is an error rather than a silent deny', () => {
  // A typo like `visibility: internal` must say so. Treating anything unknown
  // as "not public" would hide a study and look like it worked.
  assert.throws(() => visibilityOf(fm('internal'), 'x.md'), /must be one of/);
  assert.throws(() => visibilityOf(fm('Public'), 'x.md'), /must be one of/);
});

test('each valid value round-trips', () => {
  for (const value of VISIBILITY) {
    assert.equal(visibilityOf(fm(value), 'x.md'), value);
  }
});

// --- THE INVARIANT ------------------------------------------------------------
// The one failure in this migration that cannot be undone by editing a file.

test('no gated or draft study appears in the public bundle', { skip: skipWithoutVault }, () => {
  const bundle = readFileSync(new URL('../src/data/caseStudies.ts', import.meta.url), 'utf8');
  const dir = join(VAULT_DIR, 'case-studies');
  const leaked = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'))) {
    const md = readFileSync(join(dir, file), 'utf8');
    let visibility;
    try {
      visibility = visibilityOf(md, file);
    } catch {
      continue; // pre-migration files are covered by the migration check below
    }
    if (isPublic(visibility)) continue;

    // The Card slug is what the bundle keys on, so that is what must be absent.
    const slug = /^- slug:\s*(.+)$/m.exec(md)?.[1]?.trim();
    if (slug && new RegExp(`slug: "${slug}"`).test(bundle)) {
      leaked.push(`${file} is ${visibility} and "${slug}" is in the bundle`);
    }
  }

  assert.deepEqual(leaked, [], `private work reached the public bundle:\n  ${leaked.join('\n  ')}`);
});

// --- the registry is the authority on which takes can be published -----------

test('PUBLIC_TAKE_ANGLES is derived from take-formats.json, not restated', {
  skip: skipWithoutVault
}, async () => {
  // These were two hand-maintained lists of the same fact and they disagreed:
  // full-case was publishable in the registry and missing from the generator,
  // so MAF Machine's take passed every check, declared itself cleared for the
  // grid, and was read by nothing.
  const { PUBLIC_TAKE_ANGLES } = await import('./generate-case-studies.mjs');
  const registry = JSON.parse(readFileSync(join(VAULT_DIR, 'take-formats.json'), 'utf8')).formats;
  const publishable = Object.entries(registry).filter(([, f]) => f.publishable).map(([id]) => id);

  assert.deepEqual(
    [...PUBLIC_TAKE_ANGLES].sort(),
    [...publishable].sort(),
    'the renderable set must equal the publishable set'
  );

  const source = readFileSync(new URL('./generate-case-studies.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /PUBLIC_TAKE_ANGLES\s*=\s*\[/,
    'a literal array here is a second copy of the registry'
  );
});

test('a publishable format with no ranking fails loudly rather than appending', {
  skip: skipWithoutVault
}, () => {
  // Order is the tiebreak for which take fills the flat fields when
  // published_take is absent. The registry cannot decide that, so adding a
  // publishable format must make someone rank it. Verified by flipping video
  // to publishable: the generator throws and names it.
  const source = readFileSync(new URL('./generate-case-studies.mjs', import.meta.url), 'utf8');
  assert.match(source, /TAKE_PRECEDENCE disagrees with take-formats\.json/);
  assert.match(source, /unranked here/);
});
