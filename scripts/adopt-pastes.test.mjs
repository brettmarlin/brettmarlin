import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adoptMarkdown, highestNumber, keyFrom, locate, shotSubject, slugifyDescription
} from './adopt-pastes.mjs';

const BEATS = (body) => ['---', 'slug: x', '---', '## Source context', 'Prose.', '', '### Beats', '', ...body].join('\n');

test('an embed becomes a shot line naming the file it will be uploaded as', () => {
  // NOT a _media: line. That asserts the file is in R2, and writing it before
  // the upload makes the vault claim something untrue.
  const md = BEATS(['#### A method that reads as failure', 'Prose.', '', '![[Pasted image 1.png]]', '']);
  const { text, adoptions } = adoptMarkdown(md, { key: 'maf', startNumber: 1 });
  assert.equal(adoptions.length, 1);
  assert.equal(adoptions[0].filename, '01-maf-method-reads-failure.png');
  assert.match(text, /^_shot: A method that reads as failure \(staged · 01-maf-method-reads-failure\.png\)_$/m);
  assert.doesNotMatch(text, /_media:/, 'the file is not in R2 yet');
  assert.match(text, /!\[\[01-maf-method-reads-failure\.png\]\]/, 'the embed SURVIVES, renamed');
});

test('a shot line in the same beat supplies the wording, and does not survive', () => {
  // The shot is the work order the image fulfils. Its wording is better than
  // anything derivable from a heading, and leaving both would leave the study
  // still asking for an image it has.
  const md = BEATS([
    '#### Designing a game', 'Text.', '',
    '_shot: the trophy case populated by backfill, before and after (need · screenshot · pair)_', '',
    '![[Pasted image 2.png]]', ''
  ]);
  const { text, adoptions } = adoptMarkdown(md, { key: 'maf', startNumber: 4 });
  assert.equal(adoptions[0].filename, '04-maf-trophy-case-populated-backfill-before-after.png');
  assert.equal((text.match(/_shot:/g) ?? []).length, 1, 'exactly one shot line remains');
  assert.equal((text.match(/!\[\[/g) ?? []).length, 1, 'and one embed, renamed');
  assert.match(text, /staged · 04-maf-trophy-case-populated-backfill-before-after\.png/);
  assert.doesNotMatch(text, /need · screenshot · pair/, 'the old work order is gone');
});

test('beats without an embed are left completely alone', () => {
  const md = BEATS([
    '#### One', 'a', '', '![[p.png]]', '',
    '#### Two', 'b', '', '_shot: something not yet captured (find · screenshot)_', ''
  ]);
  const { text, adoptions } = adoptMarkdown(md, { key: 'k', startNumber: 1 });
  assert.equal(adoptions.length, 1);
  assert.match(text, /_shot: something not yet captured \(find · screenshot\)_/, 'the untouched work order survives verbatim');
});

test('numbering continues from the study, never restarts', () => {
  // A guessed number binds an image to the wrong beat — the same warning
  // prepare-images carries.
  const md = '_media: 01-maf-a.jpg, 02-maf-b.jpg_\n_shot: x (staged · 07-maf-c.png)_';
  assert.equal(highestNumber(md), 7);
  assert.equal(highestNumber('no numbers here'), 0);
  // A number in prose must not count.
  assert.equal(highestNumber('We shipped 42-odd things.\n_media: 03-maf-a.jpg_'), 3);
  // NOR A DATE. MAF's own shot lines say "in the 2026-02-20 Notion build log",
  // and reading that as an image number made the first pasted image 03.
  assert.equal(
    highestNumber('_shot: the V1 dashboard (find · screenshot · in the 2026-02-20 Notion build log)_'),
    0
  );
  assert.equal(
    highestNumber('_shot: x (staged · 01-maf-a.png · from the 2026-02-19 log)_'),
    1
  );
});

test('the short key comes from what the study already calls its files', () => {
  assert.equal(keyFrom('_media: 01-collector-hero.jpg_\n_media: 02-collector-x.jpg_', 'lobus-mobile-collector-app'), 'collector');
  // TWO files at least: one filename shares all of itself with itself, which
  // says nothing about where the key ends.
  assert.equal(
    keyFrom('_media: 01-decision-layer-hero.jpg_\n_media: 02-decision-layer-spine.jpg_', 'agentic-decision-layer-defense'),
    'decision-layer'
  );
  // A study with no media yet falls back to the slug's first word.
  assert.equal(keyFrom('no media lines', 'maf-machine-ai-endurance-coach'), 'maf');
});

test('descriptions drop filler and stay short', () => {
  // "before and after" survives on purpose — it is what a comparison shot IS,
  // and dropping it would name two different images the same thing.
  assert.equal(slugifyDescription('the dashboard before and after'), 'dashboard-before-after');
  assert.equal(slugifyDescription('the V1 dashboard screenshot with the too-much-data margin note'), 'v1-dashboard-screenshot-too-much-data');
  assert.equal(slugifyDescription('A method that reads as failure'), 'method-reads-failure');
  assert.equal(slugifyDescription('!!!'), 'image');
});

test('a shot subject is its wording without the trailing metadata', () => {
  assert.equal(
    shotSubject('_shot: the MAF zone explainer, heart rate capped (need · diagram · landscape)_'),
    'the MAF zone explainer, heart rate capped'
  );
  assert.equal(shotSubject('_shot: no metadata at all_'), 'no metadata at all');
});

test('both embed syntaxes are recognised', () => {
  for (const embed of ['![[p.png]]', '![[p.png|some alt]]', '![alt text](p.png)']) {
    const { adoptions } = adoptMarkdown(BEATS(['#### H', 'x', '', embed, '']), { key: 'k', startNumber: 1 });
    assert.equal(adoptions.length, 1, `not recognised: ${embed}`);
    assert.equal(adoptions[0].source, 'p.png');
  }
});

test('a duplicate basename is refused rather than guessed at', () => {
  // Obsidian resolves an embed by basename anywhere in the vault. Two matches
  // means picking one, and picking wrong is silent.
  const files = ['/v/a/p.png', '/v/b/p.png'];
  assert.match(locate(files, 'p.png').error, /2 files named/);
  assert.match(locate([], 'p.png').error, /not found/);
  assert.equal(locate(['/v/a/p.png'], 'p.png').path, '/v/a/p.png');
});

test('a study with no Beats section says so instead of doing nothing quietly', () => {
  const { error, adoptions } = adoptMarkdown('---\nvisibility: public\nslug: x\n---\nJust prose.', { key: 'k' });
  assert.match(error, /Beats/);
  assert.equal(adoptions.length, 0);
});


test('the embeds survive, renamed, so Obsidian keeps showing the pictures', async () => {
  // The first version replaced embeds with the shot line and the images
  // vanished from the note — removing the only reason to paste them there.
  // Brett judges an image at its beat, in the prose it supports.
  const md = BEATS(['#### Three up', 'Prose.', '', '![[p1.png]]', '![[p2.png]]', '![[p3.png]]', '']);
  const { text, adoptions } = adoptMarkdown(md, { key: 'k', startNumber: 1 });
  assert.equal(adoptions.length, 3);
  for (const n of ['01', '02', '03']) {
    assert.match(text, new RegExp(`!\\[\\[${n}-k-three-up\\.png\\]\\]`), `${n} should still be embedded`);
  }
  assert.doesNotMatch(text, /Pasted|p1\.png/, 'the old names are gone');
  // One shot line, naming all three, after the last embed.
  const shot = /_shot: [\s\S]*?_$/m.exec(text)[0];
  assert.match(shot, /01-k-three-up\.png, 02-k-three-up\.png, 03-k-three-up\.png/);
  assert.ok(text.indexOf('![[03-k-three-up.png]]') < text.indexOf('_shot:'), 'pictures, then the machine line');
});

test('the generator drops embeds from beat bodies, so no wikilink reaches the page', async () => {
  const { parseBeats } = await import('./vault-reader.mjs');
  const { beats } = parseBeats(
    '#### Beat\nProse that stays.\n\n![[01-k-thing.png]]\n_media: 01-k-thing.png_\n',
    'f.md'
  );
  assert.equal(beats[0].body, 'Prose that stays.');
  assert.deepEqual(beats[0].media, ['01-k-thing.png']);
  assert.doesNotMatch(JSON.stringify(beats), /!\[\[/, 'a wikilink must never reach the bundle');
});

test('a shot line that already records staged files is never consumed', () => {
  // The second run over MAF Machine ate seven `(staged · ...)` lines, which
  // were the only reference to seven files sitting in R2 and on disk. A work
  // order can be consumed by the thing that fulfils it; a record cannot.
  const md = BEATS([
    '#### Beat with history', 'Prose.', '',
    '_shot: the earlier pass (staged · 01-k-earlier.png, 02-k-earlier.png)_', '',
    '![[new.png]]', ''
  ]);
  const { text, adoptions } = adoptMarkdown(md, { key: 'k', startNumber: 3 });
  assert.equal(adoptions.length, 1);
  // One line per beat, the same shape `_media:` takes, with the recorded names
  // kept in front and in order. Two lines was the earlier answer and it made
  // the note grow a shot line per run.
  // The wording comes from the record, not the heading, so a re-run does not
  // rename the beat's files after its title.
  assert.match(text, /_shot: the earlier pass \(staged · 01-k-earlier\.png, 02-k-earlier\.png, 03-k-earlier-pass\.png\)_/);
  assert.equal((text.match(/_shot:/g) ?? []).length, 1, 'one record, not one per run');
});

test('the key is a fixed point, not a guess that drifts', () => {
  // keyFrom used to read "one or two words after NN-". On files named
  // `01-maf-method-...` it guessed `maf-method`, so the next run wrote
  // `08-maf-method-method-...` and the key drifted a word further from itself
  // every time. A rule that re-derives its own input must be stable.
  const once = '_shot: x (staged · 01-maf-method-reads-failure.png, 02-maf-v1-dashboard.png)_';
  assert.equal(keyFrom(once, 'maf-machine-ai-endurance-coach'), 'maf');

  // Feed it its own output twice more; it must not move.
  const twice = '_shot: x (staged · 01-maf-a.png, 02-maf-b.png, 03-maf-c.png)_';
  assert.equal(keyFrom(twice, 'maf-machine-ai-endurance-coach'), 'maf');
  assert.equal(keyFrom(twice + '\n' + once, 'maf-machine-ai-endurance-coach'), 'maf');

  // Multi-word keys still work where a study really has one.
  assert.equal(keyFrom('_media: 01-decision-layer-hero.jpg, 02-decision-layer-spine.jpg_', 'x-y'), 'decision-layer');

  // One file shares all of itself with itself, which is not a key.
  assert.equal(keyFrom('_media: 01-lonely-file.jpg_', 'maf-machine-x'), 'maf');
});

test('running it twice is the same as running it once', () => {
  // Adoption used to rename every embed it found, including the ones it had
  // named itself. The second pass over MAF Machine turned `01-maf-...` into
  // `08-maf-method-...`: a new number, a drifted key, and a file moved on disk
  // out from under a URL a previous generate may have shipped.
  const md = BEATS([
    '#### A method that reads as failure', 'Prose.', '',
    '![[Pasted image 1.png]]', '',
    '#### V1 was a wall of charts', 'Prose.', '',
    '![[Pasted image 2.png]]', ''
  ]);
  const once = adoptMarkdown(md, { key: 'maf', startNumber: 1 }).text;
  const twice = adoptMarkdown(once, { key: keyFrom(once, 'maf-machine'), startNumber: highestNumber(once) + 1 });
  assert.equal(twice.text, once, 'the second run must change nothing');
  assert.deepEqual(twice.adoptions, [], 'and must claim no adoptions');
});

test('a new paste beside an adopted embed takes the next number, and the old one keeps its name', () => {
  const md = BEATS([
    '#### A method that reads as failure', 'Prose.', '',
    '![[01-maf-method-reads-failure.png]]',
    '![[Pasted image 9.png]]',
    '_shot: A method that reads as failure (staged · 01-maf-method-reads-failure.png)_', ''
  ]);
  const { text, adoptions } = adoptMarkdown(md, { key: 'maf', startNumber: 2 });
  assert.deepEqual(adoptions.map((a) => a.filename), ['02-maf-method-reads-failure.png']);
  assert.match(text, /!\[\[01-maf-method-reads-failure\.png\]\]/, 'the adopted embed is untouched');
  assert.match(
    text,
    /_shot: A method that reads as failure \(staged · 01-maf-method-reads-failure\.png, 02-maf-method-reads-failure\.png\)_/,
    'the record names both, in the order the note shows them'
  );
});

test('a bound beat is not re-staged when a paste lands elsewhere in the study', () => {
  // THE SUCCESSOR TO FAILURE 8, found by the audit and confirmed by running
  // this function. Embeds survive adoption by design and stay in a beat
  // forever, so a bound beat looks identical to one awaiting a record. This
  // loop used to write it one anyway, beside the `_media:` line it already
  // had; bind-images flips that into a second `_media:` and the beat renders
  // every image twice. One paste anywhere fired it across every bound beat.
  const md = BEATS([
    '#### Already bound', 'Prose.', '',
    '![[01-maf-a.png]]',
    '_media: 01-maf-a.png_', '',
    '#### Brand new beat', 'Prose.', '',
    '![[Pasted image 1.png]]', ''
  ]);
  const { text, adoptions } = adoptMarkdown(md, { key: 'maf', startNumber: 2 });
  assert.deepEqual(adoptions.map((a) => a.filename), ['02-maf-brand-new-beat.png']);
  assert.equal((text.match(/_shot:/g) ?? []).length, 1, 'only the new beat gets a record');
  assert.equal((text.match(/_media:/g) ?? []).length, 1, 'the bound beat is untouched');
  assert.doesNotMatch(text, /_shot: Already bound/, 'the bound beat is never re-staged');
});

test('a new paste INTO a bound beat records only the new file', () => {
  // The legitimate case the guard must still allow. The result is a beat with
  // both a _media: and a _shot: line, which is the same partial state
  // bind-images already produces when some of a record is in R2 and some is
  // not — not a new shape.
  const md = BEATS([
    '#### Bound and growing', 'Prose.', '',
    '![[01-maf-a.png]]',
    '![[Pasted image 9.png]]',
    '_media: 01-maf-a.png_', ''
  ]);
  const { text, adoptions } = adoptMarkdown(md, { key: 'maf', startNumber: 2 });
  assert.deepEqual(adoptions.map((a) => a.filename), ['02-maf-bound-growing.png']);
  assert.match(text, /_media: 01-maf-a\.png_/, 'the existing claim is not restated');
  assert.match(text, /_shot: Bound and growing \(staged · 02-maf-bound-growing\.png\)_/);
});
