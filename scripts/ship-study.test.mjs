import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { generatedStudyBlock, stagingDirFor, unadoptedEmbeds, verifyStudy } from './ship-study.mjs';

test('staging uses the public Card slug, never the vault filename', () => {
  assert.equal(stagingDirFor('marliin-factory', '/vault'), join('/vault', '_attachments', 'marliin-factory'));
});

test('an Obsidian embed is adopted only when a shot or media record names it', () => {
  const md = [
    '![[Pasted image 1.png]]',
    '![[01-factory-flow.png]]',
    '_shot: Flow (staged · 01-factory-flow.png)_',
    '![[02-factory-result.png]]',
    '_media: 02-factory-result.png_',
  ].join('\n');
  assert.deepEqual(unadoptedEmbeds(md), ['Pasted image 1.png']);
});

test('the generated block is isolated by public slug', () => {
  const bundle = [
    'export const caseStudies = [',
    '  {',
    '    slug: "first",',
    '    result: "one",',
    '  },',
    '  {',
    '    slug: "marliin-factory",',
    '    result: "two",',
    '  }',
    '];',
  ].join('\n');
  const block = generatedStudyBlock(bundle, 'marliin-factory');
  assert.match(block, /result: "two"/);
  assert.doesNotMatch(block, /result: "one"/);
});

test('target verification ignores another study placeholder but blocks its own', () => {
  const other = [
    '  {',
    '    slug: "other",',
    '    beats: { "x": [{ id: "x", media: [{ kind: "placeholder" }] }] },',
    '  },',
  ].join('\n');
  const target = [
    '  {',
    '    slug: "marliin-factory",',
    '    beats: { "x": [{ id: "one", media: [] }, { id: "two", media: [] }] },',
    '  }',
  ].join('\n');
  const clean = verifyStudy({ md: '', bundle: `${other}\n${target}`, cardSlug: 'marliin-factory', file: 'factory.md' });
  assert.deepEqual(clean.errors, []);
  assert.equal(clean.beatCount, 2);

  const blocked = verifyStudy({
    md: '',
    bundle: target.replace('media: []', 'media: [{ kind: "placeholder" }]'),
    cardSlug: 'marliin-factory',
    file: 'factory.md',
  });
  assert.match(blocked.errors.join('\n'), /1 placeholder image/);
});
