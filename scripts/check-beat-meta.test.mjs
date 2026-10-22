import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintBeatMeta } from './check-beat-meta.mjs';

const clean = `## Take — decisions-outcomes
_clearance: public · primary_
_hero: 01-hero.jpg_
### Beats

#### First beat
Some prose.

_layout: image-left_
_media: 01-a.jpg_
_removed: 01-b.jpg_

#### Second beat
More prose.

_media: 02-a.jpg_
`;

test('a well-formed take produces no errors', () => {
  assert.deepEqual(lintBeatMeta(clean, 'x.md'), []);
});

test('a meta line drifted against the next heading is caught', () => {
  const md = `#### Results
Prose.

_removed: 22.jpg_

_ratio: 1_
#### What I would do differently
Prose.
`;
  const errs = lintBeatMeta(md, 'x.md');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /separated from beat "Results"/);
  assert.match(errs[0], /x\.md:6:/);
});

test('an unknown lowercase key is caught rather than rendering as prose', () => {
  const md = `#### A beat
Prose.

_layotu: image-left_
`;
  const errs = lintBeatMeta(md, 'x.md');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /unknown meta key "_layotu:_"/);
});

test('capitalised italic prose is prose, not a meta line', () => {
  const md = `#### A beat
_Gap: the thing nobody owned_

_media: 01-a.jpg_
`;
  assert.deepEqual(lintBeatMeta(md, 'x.md'), []);
});

test('a take header after a previous take\'s last beat is legal', () => {
  const md = `#### Last beat of the long take
Prose.

_media: 01-a.jpg_

## Take — short
_clearance: public_
_hero: 01-hero.jpg_
`;
  assert.deepEqual(lintBeatMeta(md, 'x.md'), []);
});

test('a header key inside an open beat is caught', () => {
  const md = `#### A beat
Prose.

_hero: 01-hero.jpg_
`;
  const errs = lintBeatMeta(md, 'x.md');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /belongs to a take's header line but sits inside beat "A beat"/);
});

test('a beat field with no beat open is caught', () => {
  const md = `### Beats

_media: 01-a.jpg_

#### A beat
Prose.
`;
  const errs = lintBeatMeta(md, 'x.md');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /no "#### " beat is open here/);
});

test('meta lines inside a code fence are ignored', () => {
  const md = `#### A beat
\`\`\`
_layotu: image-left_
\`\`\`

_media: 01-a.jpg_
`;
  assert.deepEqual(lintBeatMeta(md, 'x.md'), []);
});
