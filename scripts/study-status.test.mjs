import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, heroOf, mediaLines, nextStep, scalar, frontmatterOf } from './study-status.mjs';

const NOTE = `---
visibility: public
clearance: public
---
## Take — full-case
_clearance: public_
_hero: 00-maf-hero.png_

### Beats

#### One
prose
_media: 01-maf-a.png, 02-maf-b.png_

#### Two
prose
_shot: something staged (staged · 03-maf-c.png)_

#### Three
prose
_shot: not captured yet (need · screenshot · landscape)_
`;

const base = {
  md: NOTE,
  slug: 'maf-machine-ai-endurance-coach',
  orderMd: '- maf-machine-ai-endurance-coach',
  bundle: 'slug: "maf-machine-ai-endurance-coach",',
  r2Files: ['00-maf-hero.png', '01-maf-a.png', '02-maf-b.png', '03-maf-c.png'],
  staged: ['00-maf-hero.png', '01-maf-a.png', '02-maf-b.png', '03-maf-c.png'],
};

test('it reads every state the pipeline can be in', () => {
  const s = assess(base);
  assert.equal(s.visibility, 'public');
  assert.equal(s.clearance, 'public');
  assert.deepEqual(s.bound, ['01-maf-a.png', '02-maf-b.png']);
  assert.deepEqual(s.staging, ['03-maf-c.png']);
  assert.equal(s.hero, '00-maf-hero.png');
  assert.equal(s.openShots, 1, 'a shot naming no file is still an open work order');
  assert.equal(s.embeds, 0);
  assert.ok(s.inOrder);
  assert.ok(s.inBundle);
  assert.deepEqual(s.missingFromR2, []);
});

test('a file named in the vault but absent from R2 is the thing it must catch', () => {
  // This is the failure that cost an afternoon: an upload without --remote
  // writes to a local simulator and reports success, so the vault names files
  // that are not there and bind-images silently flips nothing.
  const s = assess({ ...base, r2Files: ['00-maf-hero.png'] });
  assert.deepEqual(s.missingFromR2.sort(), ['01-maf-a.png', '02-maf-b.png', '03-maf-c.png']);
  assert.deepEqual(s.notStagedLocally, [], 'they are on disk, ready to go');
  assert.match(nextStep(s, base.slug), /upload 3 file/);
});

test('the next step is one thing, in pipeline order, never a menu', () => {
  const step = (over) => nextStep(assess({ ...base, ...over }), base.slug);

  // Earliest unmet condition wins, whatever else is also unmet.
  assert.match(step({ md: NOTE.replace('visibility: public', 'visibility: draft') }), /visibility/);
  assert.match(step({ md: NOTE + '\n![[Pasted image 1.png]]\n' }), /adopt-pastes/);
  assert.match(step({ r2Files: [] }), /upload/);
  // On disk BEFORE uploading: you cannot upload a file that is not there, and
  // finding that out from a path error inside the script is worse than being
  // told here.
  assert.match(step({ r2Files: [], staged: [] }), /not in _attachments/);
  assert.match(step({}), /bind-images/, 'a staged shot outranks everything downstream of it');

  // Downstream steps only surface once binding is done — which is the point of
  // the ordering, and what the first version of this test got wrong: it
  // expected _order.md while a shot was still staged, and the code was right.
  const boundNote = NOTE.replace('_shot: something staged (staged · 03-maf-c.png)_', '_media: 03-maf-c.png_');
  const after = (over) => nextStep(assess({ ...base, md: boundNote, ...over }), base.slug);
  assert.match(after({ orderMd: '(empty)' }), /_order\.md/);
  assert.match(after({ bundle: '(empty)' }), /npm run generate/);
  assert.match(after({ md: boundNote.replace('_hero: 00-maf-hero.png_\n', '') }), /_hero:/);

  // Everything met: the only remaining truth is the unfilled shot.
  const clean = { ...base, md: NOTE.replace('_shot: something staged (staged · 03-maf-c.png)_', '_media: 03-maf-c.png_') };
  assert.match(nextStep(assess(clean), base.slug), /unfilled _shot/);
});

test('a bound study with nothing outstanding says so', () => {
  const done = NOTE
    .replace('_shot: something staged (staged · 03-maf-c.png)_', '_media: 03-maf-c.png_')
    .replace('_shot: not captured yet (need · screenshot · landscape)_', '_media: 04-maf-d.png_');
  const s = assess({ ...base, md: done, r2Files: [...base.r2Files, '04-maf-d.png'] });
  assert.equal(s.openShots, 0);
  assert.match(nextStep(s, base.slug), /npm run verify/);
});

test('the parsers do not invent things', () => {
  assert.equal(scalar(frontmatterOf(NOTE), 'visibility'), 'public');
  assert.equal(scalar(frontmatterOf(NOTE), 'nope'), undefined);
  assert.equal(heroOf('no hero here'), undefined);
  // A shot line with no filename is an open work order, not a staged one.
  const [line] = mediaLines('_shot: nothing named here (need · diagram)_');
  assert.equal(line.kind, 'shot');
  assert.deepEqual(line.files, []);
});


test('a hero named but not staged is caught here, not in the upload script', () => {
  // A hero does not come from a paste; it is placed by hand, which makes it the
  // file most likely to be named and missing. The local check used to look only
  // at shot-line files, so a missing hero sailed through and failed later with
  // a path error instead of an explanation.
  const s = assess({ ...base, staged: [], r2Files: [] });
  assert.ok(s.notStagedLocally.includes('00-maf-hero.png'), 'the hero must be checked on disk too');
  assert.match(nextStep(s, base.slug), /including the hero, 00-maf-hero\.png/);
});

test('a file already in R2 does not have to be on disk', () => {
  // Staging is where things go on their way TO R2. Once they have arrived,
  // whether a copy remains locally is nobody's business.
  const s = assess({ ...base, staged: [] });
  assert.deepEqual(s.notStagedLocally, [], 'everything is in R2 already');
});

test('an adopted embed is not a problem; an unadopted one is', () => {
  // This gate used to flag EVERY `![[...]]`. But adoption deliberately leaves
  // the embeds in place so the images stay visible in Obsidian, and the
  // generator drops them — so a finished study reported NEED forever and NEXT
  // pointed back at adopt-pastes on a loop.
  const adopted = assess({
    ...base,
    md: base.md.replace('### Beats', '### Beats\n\n![[01-maf-a.png]]\n![[03-maf-c.png]]'),
  });
  assert.deepEqual(adopted.unadopted, [], 'both filenames appear in _media:/_shot: lines');
  assert.doesNotMatch(nextStep(adopted, base.slug), /adopt-pastes/);

  const raw = assess({ ...base, md: base.md.replace('### Beats', '### Beats\n\n![[Pasted image 1.png]]') });
  assert.deepEqual(raw.unadopted, ['Pasted image 1.png']);
  assert.match(nextStep(raw, base.slug), /adopt-pastes/);
});
