import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skipWithoutVault, VAULT_DIR } from './vault-present.mjs';
import { parseOrderFile, resolve, applyOrder, plan, readStudies } from './reorder-studies.mjs';

const studies = [
  { file: 'a.md', vaultSlug: 'a', cardSlug: 'alpha', published: 'decisions-outcomes', order: 0, title: 'A', md: '' },
  { file: 'b.md', vaultSlug: 'b', cardSlug: 'b', published: 'short', order: 1, title: 'B', md: '' },
];

test('frontmatter and prose outside the fence are ignored', () => {
  // The first version of this parser read every non-blank line and produced
  // nineteen phantom studies called `title:`, `THE`, `Then,` and so on.
  const file = '---\nvisibility: public\ntitle: x\n---\n\n# Order\n\nMove a line and the study moves.\n\n```\na\nb\n```\n';
  assert.deepEqual(parseOrderFile(file), ['a', 'b']);
});

test('a file with no fence yields nothing rather than guessing', () => {
  assert.deepEqual(parseOrderFile('# Order\n\na\nb\n'), []);
});

test('only the first word of a line is read, so labels cannot break it', () => {
  assert.deepEqual(parseOrderFile('```\na   Some Title With Spaces\nb   Another\n```'), ['a', 'b']);
});

test('a leading list marker is tolerated', () => {
  assert.deepEqual(parseOrderFile('```\n- a\n* b\n```'), ['a', 'b']);
});

test('a study resolves by filename or by Card slug', () => {
  assert.equal(resolve('a', studies).file, 'a.md');
  assert.equal(resolve('alpha', studies).file, 'a.md');
  assert.equal(resolve('ALPHA', studies).file, 'a.md');
  assert.equal(resolve('nope', studies), null);
});

test('a missing study is refused: it would have no position on the grid', () => {
  const { problems } = plan(studies, ['a']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /b is not in the list/);
});

test('a duplicate is refused rather than silently winning once', () => {
  const { problems } = plan(studies, ['a', 'alpha', 'b']);
  assert.ok(problems.some((p) => /listed twice/.test(p)));
});

test('positions come from list index, not from the numbers already in the Cards', () => {
  const { changes } = plan(studies, ['b', 'a']);
  // changes follow LIST order, not vault order
  assert.deepEqual(changes.map((c) => [c.study.file, c.from, c.to]), [['b.md', 1, 0], ['a.md', 0, 1]]);
});

test('order is written into the PUBLISHED take only', () => {
  // Lobus and StudioNow publish `short`. Writing the long take's Card changes
  // a number and moves nothing, which is silent and was the whole problem.
  const md = [
    '## Take — decisions-outcomes',
    '### Card',
    '- slug: x',
    '- order: 99',
    '',
    '## Take — short',
    '### Card',
    '- slug: x',
    '- order: 99',
  ].join('\n');
  const out = applyOrder(md, 'short', 3);
  const [long, short] = out.split('## Take — short');
  assert.match(long, /- order: 99/, 'the unpublished take is untouched');
  assert.match(short, /- order: 3/, 'the published take is rewritten');
});

test('a take with no order line fails loudly rather than writing nothing', () => {
  assert.throws(() => applyOrder('## Take — short\n### Card\n- slug: x\n', 'short', 1), /no "- order:" line/);
});

test('the real vault list covers every published study exactly once', { skip: skipWithoutVault }, () => {
  const names = parseOrderFile(readFileSync(join(VAULT_DIR, 'case-studies', '_order.md'), 'utf8'));
  assert.deepEqual(plan(readStudies(), names).problems, []);
});
