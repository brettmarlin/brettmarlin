/**
 * Unit coverage for the Beats parser and the R2 media resolver in
 * generate-case-studies.mjs. Run with: npm test (node --test).
 *
 * As of the 68-shot vault commit (5f41281) no beat carries `_media:_`, so a
 * clean generator run never exercises resolveBeatMedia against real data.
 * These tests are the resolver's only coverage until real media lands.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractHero,
  resolveExplicitHero,
  resolveBeatMedia,
  parseImageDimensions,
  dimensionsFor,
  readKind,
  readYears,
  STUDY_KINDS,
  withoutStaleHeroes,
} from './generate-case-studies.mjs';
import {
  parseYouTubeUrl,
  parseBeats,
  parseShotLine,
  slugifyBeatId,
  collectBeatsByTake,
  pickPrimaryTake,
} from './vault-reader.mjs';

function pngBuffer(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpegBuffer(width, height) {
  // SOI, APP0 filler segment, then SOF0 carrying the frame size.
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)]);
  const sof0 = Buffer.alloc(2 + 2 + 5);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(7, 2);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0]);
}

const FILE = 'test.md';

test('beat with no media and no shot', () => {
  const { beats, shots, warnings } = parseBeats('#### Plain beat\nJust prose, nothing else.\n', FILE);
  assert.equal(beats.length, 1);
  assert.deepEqual(beats[0], { heading: 'Plain beat', body: 'Just prose, nothing else.', seq: [] });
  assert.equal(shots.length, 0);
  assert.deepEqual(warnings, []);
});

test('beat with one _media:_ filename', () => {
  const { beats } = parseBeats('#### One image\nSome prose.\n\n_media: 01-slug-thing.jpg_\n', FILE);
  assert.deepEqual(beats[0].media, ['01-slug-thing.jpg']);
  assert.equal(beats[0].body, 'Some prose.');
});

test('beat with two _media:_ filenames on one line', () => {
  const { beats } = parseBeats('#### Pair\n_media: a.jpg, b.jpg_\n', FILE);
  assert.deepEqual(beats[0].media, ['a.jpg', 'b.jpg']);
  assert.equal(beats[0].body, '');
});

test('fenced code block in the body is body, not metadata', () => {
  const md = [
    '#### With code',
    'Before the fence.',
    '```',
    '_media: not-a-real-binding.jpg_',
    '#### not a heading',
    '```',
    'After the fence.',
    '_media: real.jpg_',
  ].join('\n');
  const { beats } = parseBeats(md, FILE);
  assert.equal(beats.length, 1);
  assert.ok(beats[0].body.includes('_media: not-a-real-binding.jpg_'));
  assert.ok(beats[0].body.includes('#### not a heading'));
  assert.deepEqual(beats[0].media, ['real.jpg']);
});

test('media filename not in R2 throws with slug and filename', () => {
  const beats = [{ heading: 'Typo beat', body: '', media: [{ kind: 'file', name: 'missing.jpg' }] }];
  assert.throws(
    () => resolveBeatMedia('some-slug', beats, ['https://x.dev/images/some-slug/present.jpg']),
    /some-slug.*missing\.jpg/
  );
});

test('a beat may carry more than one _shot:_ line', () => {
  const md = [
    '#### Concepts tested',
    '_shot: 06-a.jpg, 07-b.jpg — in the legacy archive (archived)_',
    '_shot: 08-c.jpg — in the legacy archive (archived)_',
  ].join('\n');
  const { shots } = parseBeats(md, FILE);
  assert.equal(shots.length, 2);
  assert.equal(shots[0].subject, '06-a.jpg, 07-b.jpg — in the legacy archive');
  assert.equal(shots[1].status, 'archived');
});

test('bare _shot: none_ parses as status none with empty subject', () => {
  const { shots, warnings } = parseBeats('#### No image on purpose\nProse.\n\n_shot: none_\n', FILE);
  assert.deepEqual(shots[0], { beat: 'No image on purpose', subject: '', status: 'none', type: '', frame: '' });
  assert.deepEqual(warnings, []);
});

test('a beat may carry both _media:_ and _shot:_', () => {
  const md = [
    '#### Partially evidenced',
    'Prose.',
    '_media: have-this.jpg_',
    '_shot: the missing diagram (need · diagram · landscape)_',
  ].join('\n');
  const { beats, shots } = parseBeats(md, FILE);
  assert.deepEqual(beats[0].media, ['have-this.jpg']);
  assert.deepEqual(shots[0], {
    beat: 'Partially evidenced',
    subject: 'the missing diagram',
    status: 'need',
    type: 'diagram',
    frame: 'landscape',
  });
});

test('shot subject with commas and inner parenthetical splits on the LAST group', () => {
  const shot = parseShotLine('worksheet row 10 (early iteration), 11-ysproduct-ys-mandala.jpg (final) — confirm, then upload (archived)');
  assert.equal(shot.status, 'archived');
  assert.equal(shot.subject, 'worksheet row 10 (early iteration), 11-ysproduct-ys-mandala.jpg (final) — confirm, then upload');
});

test('middot parenthetical yields status, type, and frame', () => {
  const shot = parseShotLine('the Kano-scored concept board (find · screenshot · full-bleed)');
  assert.deepEqual(shot, { subject: 'the Kano-scored concept board', status: 'find', type: 'screenshot', frame: 'full-bleed' });
});

test('unrecognized shot status warns, never throws', () => {
  const { shots, warnings } = parseBeats('#### Typo beat\n_shot: something (archved)_\n', FILE);
  assert.equal(shots[0].status, 'archved');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unrecognized shot status "archved"/);
});

test('layout full-bleed is kept; unknown layout warns and is dropped', () => {
  const good = parseBeats('#### Wide\n_layout: full-bleed_\n', FILE);
  assert.equal(good.beats[0].layout, 'full-bleed');
  const bad = parseBeats('#### Wide\n_layout: extra-wide_\n', FILE);
  assert.equal(bad.beats[0].layout, undefined);
  assert.match(bad.warnings[0], /unrecognized layout/);
});

test('resolver reports R2 files no beat names as unbound, not errors', () => {
  const beats = [{ heading: 'Bound', body: '', media: [{ kind: 'file', name: 'a.jpg' }] }];
  const { unbound } = resolveBeatMedia('slug', beats, [
    'https://x.dev/images/slug/a.jpg',
    'https://x.dev/images/slug/orphan.jpg',
  ]);
  assert.deepEqual(beats[0].media[0], { kind: 'image', src: 'https://x.dev/images/slug/a.jpg', alt: 'Bound' });
  assert.deepEqual(unbound, ['orphan.jpg']);
});

test('a beats section with no media resolves cleanly and leaves every R2 file unbound', () => {
  const { beats } = parseBeats('#### A\nProse.\n\n_shot: x.jpg — archive (archived)_\n', FILE);
  const { unbound } = resolveBeatMedia('slug', beats, ['https://x.dev/images/slug/x-v2.jpg']);
  assert.equal(beats[0].media, undefined);
  assert.deepEqual(unbound, ['x-v2.jpg']);
});

// Phase 2: a study is public because its FRONTMATTER says so, so a fixture
// that wants to be read needs frontmatter. The take header no longer carries it.
const FM = '---\nslug: x\nvisibility: public\n---\n\n';

/** A take block on its own — for the fixtures that put two in one document. */
const rawTake = (angle, beatsMd) =>
  `## Take — ${angle}\n_clearance: public_\n\n### Card\n- slug: x\n\n### Beats\n\n${beatsMd}\n`;

/** A whole document: frontmatter, then the take. Phase 2 reads visibility from
 *  frontmatter, so a fixture without it is not a public study and collects
 *  nothing. */
const takeBlock = (angle, beatsMd) => FM + rawTake(angle, beatsMd);

test('id derivation collapses punctuation, casing and repeated spaces, deterministically', () => {
  assert.equal(slugifyBeatId('The  Verified — Object Flow!'), 'the-verified-object-flow');
  assert.equal(slugifyBeatId('The  Verified — Object Flow!'), 'the-verified-object-flow');
  assert.equal(slugifyBeatId('Competitive analysis, and some guerrilla research'), 'competitive-analysis-and-some-guerrilla-research');
});

test('two beats with the same heading in one take are suffixed and warned, not merged', () => {
  const md = takeBlock('decisions-outcomes', '#### The problem\nFirst.\n\n#### The problem\nSecond.');
  const { beatsByTake, warnings } = collectBeatsByTake(md, FILE);
  const beats = beatsByTake['decisions-outcomes'];
  assert.equal(beats.length, 2);
  assert.equal(beats[0].id, 'the-problem');
  assert.equal(beats[1].id, 'the-problem-2');
  assert.equal(beats[0].body, 'First.');
  assert.equal(beats[1].body, 'Second.');
  assert.match(warnings.join('\n'), /same heading "The problem"/);
});

test('the same heading in two different takes keeps the unsuffixed id in both', () => {
  const md = FM + rawTake('decisions-outcomes', '#### The problem\nA.') + '\n' + rawTake('customer', '#### The problem\nB.');
  const { beatsByTake, warnings } = collectBeatsByTake(md, FILE);
  assert.equal(beatsByTake['decisions-outcomes'][0].id, 'the-problem');
  assert.equal(beatsByTake['customer'][0].id, 'the-problem');
  assert.deepEqual(warnings, []);
  // Still throws, and still names both angles — the message now also names the
  // fix, because the marker is how an author resolves this.
  assert.throws(() => pickPrimaryTake(beatsByTake, FILE), /2 takes carry Beats \(decisions-outcomes, customer\) and none is marked primary/);
  assert.throws(() => pickPrimaryTake(beatsByTake, FILE), /· primary/);
});

test('beats under a take angle other than decisions-outcomes are keyed by that angle', () => {
  const md = takeBlock('customer', '#### The pitch\nProse.');
  const { beatsByTake } = collectBeatsByTake(md, FILE);
  assert.deepEqual(Object.keys(beatsByTake), ['customer']);
  assert.equal(pickPrimaryTake(beatsByTake, FILE), 'customer');
  assert.equal(beatsByTake['customer'][0].id, 'the-pitch');
});

test('a beat with two resolved images carries distinct, non-empty alt strings', () => {
  const beats = [{ heading: 'Concepts tested', body: '', media: [{ kind: 'file', name: 'a.jpg' }, { kind: 'file', name: 'b.jpg' }] }];
  resolveBeatMedia('slug', beats, ['https://x.dev/images/slug/a.jpg', 'https://x.dev/images/slug/b.jpg']);
  assert.deepEqual(beats[0].media, [
    { kind: 'image', src: 'https://x.dev/images/slug/a.jpg', alt: 'Concepts tested, 1 of 2' },
    { kind: 'image', src: 'https://x.dev/images/slug/b.jpg', alt: 'Concepts tested, 2 of 2' },
  ]);
});

test('a shot line naming two files becomes two placeholders with filename labels', () => {
  const { beatsByTake } = collectBeatsByTake(
    takeBlock('decisions-outcomes', '#### Pair beat\nProse.\n\n_shot: 06-a.jpg, 07-b.jpg — in the legacy archive, needs standardizing and upload (archived)_'),
    FILE
  );
  const media = beatsByTake['decisions-outcomes'][0].media;
  assert.deepEqual(media, [
    { kind: 'placeholder', label: '06-a.jpg', ratio: 1.62 },
    { kind: 'placeholder', label: '07-b.jpg', ratio: 1.62 },
  ]);
});

test('placeholder label strips archive and worksheet workflow tails', () => {
  const { beatsByTake } = collectBeatsByTake(
    takeBlock('decisions-outcomes', [
      '#### Subject beat',
      '_shot: the Kano-scored concept board (need · screenshot · landscape)_',
      '',
      '#### Worksheet beat',
      '_shot: ⚠ confirm — worksheet rows 03 and 04 — confirm against image-mapping-worksheet.md, then standardize and upload (archived)_',
    ].join('\n')),
    FILE
  );
  const beats = beatsByTake['decisions-outcomes'];
  assert.deepEqual(beats[0].media, [{ kind: 'placeholder', label: 'the Kano-scored concept board', ratio: 1.78 }]);
  assert.deepEqual(beats[1].media, [{ kind: 'placeholder', label: 'worksheet rows 03 and 04', ratio: 1.78 }]);
});

test('a worksheet line that also names a file keeps ONE placeholder with the full subject', () => {
  const { beatsByTake } = collectBeatsByTake(
    takeBlock('decisions-outcomes', '#### Mixed beat\n_shot: ⚠ confirm — worksheet row 05, 06-overdog-x.jpg — confirm against image-mapping-worksheet.md, then standardize and upload (archived)_'),
    FILE
  );
  assert.deepEqual(beatsByTake['decisions-outcomes'][0].media, [
    { kind: 'placeholder', label: 'worksheet row 05, 06-overdog-x.jpg', ratio: 1.78 },
  ]);
});

test('bare _shot: none_ contributes no placeholder', () => {
  const { beatsByTake } = collectBeatsByTake(
    takeBlock('decisions-outcomes', '#### Deliberately imageless\nProse.\n\n_shot: none_'),
    FILE
  );
  assert.deepEqual(beatsByTake['decisions-outcomes'][0].media, []);
});

test('ratio derives from beat media count: 1.78 single, 1.62 pair, 1.5 triptych, 1.62 four-plus', () => {
  const md = takeBlock('decisions-outcomes', [
    '#### One', '_shot: a (need)_', '',
    '#### Three', '_shot: a (need)_', '_shot: b (need)_', '_shot: c (need)_', '',
    '#### Four', '_shot: a (need)_', '_shot: b (need)_', '_shot: c (need)_', '_shot: d (need)_',
  ].join('\n'));
  const beats = collectBeatsByTake(md, FILE).beatsByTake['decisions-outcomes'];
  assert.equal(beats[0].media[0].ratio, 1.78);
  assert.ok(beats[1].media.every((m) => m.ratio === 1.5));
  assert.ok(beats[2].media.every((m) => m.ratio === 1.62));
});

test('media order follows source order across _media:_ and _shot:_ lines', () => {
  const { beatsByTake } = collectBeatsByTake(
    takeBlock('decisions-outcomes', '#### Interleaved\n_shot: first subject (need)_\n_media: bound.jpg_\n_shot: last subject (need)_'),
    FILE
  );
  const kinds = beatsByTake['decisions-outcomes'][0].media.map((m) => m.kind === 'file' ? 'file' : m.label);
  assert.deepEqual(kinds, ['first subject', 'file', 'last subject']);
});

test('PNG IHDR and JPEG SOF dimensions parse from a header buffer', () => {
  assert.deepEqual(parseImageDimensions(pngBuffer(2500, 1334)), { width: 2500, height: 1334 });
  assert.deepEqual(parseImageDimensions(jpegBuffer(1440, 900)), { width: 1440, height: 900 });
  assert.equal(parseImageDimensions(Buffer.from('not an image at all, sorry')), null);
});

test('dimensions cache hit does no network', async () => {
  const cache = { 'slug/a.jpg': { width: 100, height: 50 } };
  const fetcher = () => { throw new Error('network touched on a cache hit'); };
  const d = await dimensionsFor('https://x.dev/images/slug/a.jpg', { cache, fetcher });
  assert.deepEqual(d, { width: 100, height: 50, fromCache: true });
});

test('dimensions cache miss fetches ranged bytes and fills the cache', async () => {
  const cache = {};
  const calls = [];
  const fetcher = async (url, opts) => {
    calls.push({ url, range: opts.headers.Range });
    return { ok: true, arrayBuffer: async () => pngBuffer(800, 600).buffer.slice(0, 33) };
  };
  const d = await dimensionsFor('https://x.dev/images/slug/b.png', { cache, fetcher });
  assert.deepEqual(d, { width: 800, height: 600, fromCache: false });
  assert.deepEqual(cache['slug/b.png'], { width: 800, height: 600 });
  assert.equal(calls[0].range, 'bytes=0-65535');
});

test('unreadable dimensions throw with the filename (build maps this to exit 1)', async () => {
  const fetcher = async () => ({ ok: true, arrayBuffer: async () => Buffer.from('garbage').buffer });
  await assert.rejects(
    dimensionsFor('https://x.dev/images/slug/broken.jpg', { cache: {}, fetcher }),
    /cannot read dimensions of slug\/broken\.jpg/
  );
});

const img = (n) => ({ kind: 'image', src: `https://x.dev/${n}.jpg`, alt: n, width: 2000, height: 1000 });
const heroStudy = (media, layout = 'full-bleed') => ({
  slug: 's',
  primaryTake: 'decisions-outcomes',
  beats: { 'decisions-outcomes': [{ id: 'b1', heading: 'B1', body: 'p', media, ...(layout ? { layout } : {}) }] },
});

test('full-bleed first beat with one image lifts a hero and leaves an empty beat media array', () => {
  const study = heroStudy([img('lead')]);
  const { lifted } = extractHero(study);
  assert.equal(lifted, true);
  assert.deepEqual(study.hero, img('lead'));
  const first = study.beats['decisions-outcomes'][0];
  assert.deepEqual(first.media, []);
  assert.equal(first.layout, undefined); // marker dropped once no media remains
  assert.equal(first.heading, 'B1'); // prose-only beat survives
});

test('full-bleed first beat with three media lifts the first and keeps two, marker retained', () => {
  const study = heroStudy([img('a'), img('b'), img('c')]);
  extractHero(study);
  assert.deepEqual(study.hero, img('a'));
  const first = study.beats['decisions-outcomes'][0];
  assert.deepEqual(first.media, [img('b'), img('c')]);
  assert.equal(first.layout, 'full-bleed');
});

test('full-bleed first beat with only a placeholder produces no hero, reported not failed', () => {
  const study = heroStudy([{ kind: 'placeholder', label: 'x', ratio: 1.78 }]);
  const { lifted, note } = extractHero(study);
  assert.equal(lifted, false);
  assert.equal(study.hero, undefined);
  assert.match(note, /lead media is a placeholder/);
  assert.equal(study.beats['decisions-outcomes'][0].media.length, 1); // untouched
});

test('an explicit hero disables the lift: full-bleed means full width and nothing leaves the beat', () => {
  const study = heroStudy([img('lead'), img('second')]);
  study.hero = { kind: 'image', src: 'https://x.dev/explicit.jpg', alt: 'Title', width: 1600, height: 900 };
  const { lifted } = extractHero(study);
  assert.equal(lifted, false);
  assert.equal(study.hero.src, 'https://x.dev/explicit.jpg'); // untouched
  const first = study.beats['decisions-outcomes'][0];
  assert.deepEqual(first.media, [img('lead'), img('second')]); // nothing lifted
  assert.equal(first.layout, 'full-bleed'); // marker kept: it means full width, nothing more
});

test('resolveExplicitHero resolves the filename against R2 with the title as alt', () => {
  const urls = ['https://x.dev/images/s/01-a.jpg', 'https://x.dev/images/s/02-b%20c.jpg'];
  const hero = resolveExplicitHero('s', '02-b c.jpg', 'The Title', urls);
  assert.deepEqual(hero, { kind: 'image', src: 'https://x.dev/images/s/02-b%20c.jpg', alt: 'The Title' });
});

test('resolveExplicitHero throws on a filename with no R2 match (build maps this to exit 1)', () => {
  assert.throws(
    () => resolveExplicitHero('s', 'missing.jpg', 'T', ['https://x.dev/images/s/01-a.jpg']),
    /s: take header names hero "missing\.jpg" which is not in R2/
  );
  // An empty R2 list (placeholder study) is the same miss, not a special case.
  assert.throws(() => resolveExplicitHero('s', '01-a.jpg', 'T', []), /not in R2/);
});

test('a study with no full-bleed first beat is unchanged and gets no hero', () => {
  const study = heroStudy([img('a')], null);
  const before = JSON.stringify(study);
  const { lifted } = extractHero(study);
  assert.equal(lifted, false);
  assert.equal(JSON.stringify(study), before);
});



test('YouTube URL parsing across every listed shape', () => {
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/watch?v=5oBvOFS5k0A&t=47s'), { videoId: '5oBvOFS5k0A', start: 47 });
  assert.deepEqual(parseYouTubeUrl('https://youtube.com/watch?v=5oBvOFS5k0A'), { videoId: '5oBvOFS5k0A' });
  assert.deepEqual(parseYouTubeUrl('https://youtu.be/5oBvOFS5k0A?t=47'), { videoId: '5oBvOFS5k0A', start: 47 });
  assert.deepEqual(parseYouTubeUrl('https://youtu.be/5oBvOFS5k0A'), { videoId: '5oBvOFS5k0A' });
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/watch?list=PLx&v=5oBvOFS5k0A&feature=share'), { videoId: '5oBvOFS5k0A' });
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/watch?v=5oBvOFS5k0A#t=47'), { videoId: '5oBvOFS5k0A', start: 47 });
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/watch?v=5oBvOFS5k0A&t=1m30s'), { videoId: '5oBvOFS5k0A', start: 90 });
  assert.deepEqual(parseYouTubeUrl('https://www.youtube.com/embed/5oBvOFS5k0A'), { videoId: '5oBvOFS5k0A' });
  assert.equal(parseYouTubeUrl('https://vimeo.com/12345'), null);
  assert.equal(parseYouTubeUrl('not a url'), null);
  assert.equal(parseYouTubeUrl('https://www.youtube.com/watch'), null);
});

test('_video:_ without an immediate _poster:_ fails, naming the beat', () => {
  const md = takeBlock('decisions-outcomes', '#### Video beat\nProse.\n\n_video: https://youtu.be/5oBvOFS5k0A_\n\nMore prose.');
  assert.throws(() => collectBeatsByTake(md, 'study.md'), /study\.md.*"Video beat".*_video:_ line not immediately followed by a _poster:_/s);
});

test('an unparseable video URL fails rather than rendering a dead player', () => {
  const md = takeBlock('decisions-outcomes', '#### Video beat\n_video: https://example.com/nope_\n_poster: p.jpg_');
  assert.throws(() => collectBeatsByTake(md, 'study.md'), /unparseable video URL/);
});

test('a poster filename not in R2 fails the build', () => {
  const { beatsByTake } = collectBeatsByTake(
    takeBlock('decisions-outcomes', '#### V\n_video: https://youtu.be/5oBvOFS5k0A_\n_poster: missing-poster.jpg_'),
    FILE
  );
  assert.throws(
    () => resolveBeatMedia('slug', beatsByTake['decisions-outcomes'], ['https://x.dev/images/slug/other.jpg']),
    /slug.*missing-poster\.jpg.*not in R2/
  );
});

test('the youtube poster sentinel uses YouTube\'s native thumbnail without an R2 file', () => {
  const { beatsByTake } = collectBeatsByTake(
    takeBlock('decisions-outcomes', '#### V\n_video: https://youtu.be/5oBvOFS5k0A_\n_poster: youtube_'),
    FILE
  );
  const beats = beatsByTake['decisions-outcomes'];
  const { unbound } = resolveBeatMedia('slug', beats, []);
  assert.deepEqual(unbound, []);
  assert.deepEqual(beats[0].media[0].poster, {
    src: 'https://i.ytimg.com/vi/5oBvOFS5k0A/sddefault.jpg',
    alt: 'V',
    width: 640,
    height: 480,
  });
});

test('a video between two images lands in the middle slot, sharing the alt sequence', () => {
  const md = takeBlock('decisions-outcomes', [
    '#### Mixed beat',
    '_media: a.jpg_',
    '_video: https://www.youtube.com/watch?v=5oBvOFS5k0A&t=47s_',
    '_poster: v-poster.jpg_',
    '_media: b.jpg_',
  ].join('\n'));
  const beats = collectBeatsByTake(md, FILE).beatsByTake['decisions-outcomes'];
  resolveBeatMedia('slug', beats, [
    'https://x.dev/images/slug/a.jpg',
    'https://x.dev/images/slug/v-poster.jpg',
    'https://x.dev/images/slug/b.jpg',
  ]);
  const kinds = beats[0].media.map((m) => m.kind);
  assert.deepEqual(kinds, ['image', 'video', 'image']);
  assert.equal(beats[0].media[1].videoId, '5oBvOFS5k0A');
  assert.equal(beats[0].media[1].start, 47);
  assert.equal(beats[0].media[1].poster.alt, 'Mixed beat, 2 of 3');
  assert.equal(beats[0].media[2].alt, 'Mixed beat, 3 of 3');
});

test('a beat with two videos keeps both', () => {
  const md = takeBlock('decisions-outcomes', [
    '#### Twin videos',
    '_video: https://youtu.be/aaaaaaaaaaa_',
    '_poster: p1.jpg_',
    '_video: https://youtu.be/bbbbbbbbbbb_',
    '_poster: p2.jpg_',
  ].join('\n'));
  const beats = collectBeatsByTake(md, FILE).beatsByTake['decisions-outcomes'];
  resolveBeatMedia('slug', beats, ['https://x.dev/images/slug/p1.jpg', 'https://x.dev/images/slug/p2.jpg']);
  assert.deepEqual(beats[0].media.map((m) => m.videoId), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
});



test('a beats section in a gated take never enters the collected output', () => {
  const md = FM + '## Take — recipient-named\n_clearance: gated · site_visibility: recipient-only_\n\n### Beats\n\n#### Secret beat\nGated prose.\n';
  const { beatsByTake } = collectBeatsByTake(md, FILE);
  assert.deepEqual(beatsByTake, {});
});


// --- kind and years -----------------------------------------------------------
// Both were on all 25 vault files and reached the bundle on none of them: the
// generator never read them, so the site could not tell an experiment from a
// case study. These guard the read, and every failure is an ERROR rather than
// a default, because a defaulted `kind` presents an experiment as shipped
// client work — a claim about Brett, not a rendering detail.

const fm = (obj) => Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n');

test('kind is read when it is one of the two', () => {
  assert.equal(readKind(fm({ kind: 'experiment' }), 'x.md'), 'experiment');
  assert.equal(readKind(fm({ kind: 'case-study' }), 'x.md'), 'case-study');
});

test('a missing kind fails rather than defaulting to case-study', () => {
  assert.throws(() => readKind(fm({ slug: 'x' }), 'x.md'), /missing "kind"/);
});

test('an invented kind fails by name', () => {
  assert.throws(() => readKind(fm({ kind: 'prototype' }), 'x.md'), /kind is "prototype"/);
});

test('the kind vocabulary is exactly two values', () => {
  assert.deepEqual(STUDY_KINDS, ['case-study', 'experiment']);
});

test('years are read as numbers, not strings', () => {
  assert.deepEqual(readYears(fm({ year_start: 2022, year_end: 2024 }), 'x.md'), {
    yearStart: 2022,
    yearEnd: 2024,
  });
});

test('a single-year study is a valid span', () => {
  assert.deepEqual(readYears(fm({ year_start: 2021, year_end: 2021 }), 'x.md'), {
    yearStart: 2021,
    yearEnd: 2021,
  });
});

test('prose in a year field fails instead of becoming NaN', () => {
  assert.throws(
    () => readYears(fm({ year_start: 'circa 2011', year_end: 2012 }), 'x.md'),
    /must be a bare four-digit year/
  );
});

test('a backwards span fails', () => {
  assert.throws(
    () => readYears(fm({ year_start: 2024, year_end: 2022 }), 'x.md'),
    /year_end \(2022\) is before year_start \(2024\)/
  );
});

test('a missing year fails', () => {
  assert.throws(() => readYears(fm({ year_start: 2020 }), 'x.md'), /missing "year_end"/);
});

test('an unhashed file a beat still names is never treated as a stale hero', () => {
  // 01-decision-layer-hero.jpg was the hero AND a beat image. Hashing the hero
  // left the original in R2 as live beat content; filtering it broke the build.
  const u = (n) => `https://w/images/agentic-decision-layer-defense/${n}`;
  const kept = withoutStaleHeroes(
    [u('01-decision-layer-hero.abc12345.jpg'), u('01-decision-layer-hero.jpg')],
    '01-decision-layer-hero.abc12345.jpg'
  ).map((x) => x.split('/').pop());
  assert.deepEqual(kept, ['01-decision-layer-hero.abc12345.jpg', '01-decision-layer-hero.jpg']);
});

// --- superseded hero revisions ------------------------------------------------
// Heroes are content-hashed so a changed image gets a changed URL past the
// Worker's one-year immutable cache. The orphan that leaves is NOT harmless:
// images[] is built from the R2 listing, so it returns as content. Altana
// rendered two heroes side by side the day hashing shipped.

test('a superseded hero revision is dropped from the image list', () => {
  const u = (n) => `https://w/images/altana/${n}`;
  const kept = withoutStaleHeroes(
    [u('00-hero.1396658a.jpg'), u('00-hero.d12f37d7.jpg'), u('01-diagram.jpg')],
    '00-hero.1396658a.jpg'
  ).map((x) => x.split('/').pop());
  assert.deepEqual(kept, ['00-hero.1396658a.jpg', '01-diagram.jpg']);
});

test('the current hero itself is never dropped', () => {
  const u = (n) => `https://w/images/x/${n}`;
  const kept = withoutStaleHeroes([u('00-hero.aaaaaaaa.jpg')], '00-hero.aaaaaaaa.jpg');
  assert.equal(kept.length, 1);
});

test('an unhashed legacy hero still survives', () => {
  const u = (n) => `https://w/images/x/${n}`;
  const kept = withoutStaleHeroes([u('00-mixpanel-hero.jpg'), u('02-x.jpg')], '00-mixpanel-hero.jpg')
    .map((x) => x.split('/').pop());
  assert.deepEqual(kept, ['00-mixpanel-hero.jpg', '02-x.jpg']);
});

test('a study with no declared hero keeps every image', () => {
  const u = (n) => `https://w/images/x/${n}`;
  const list = [u('a.jpg'), u('b.jpg')];
  assert.equal(withoutStaleHeroes(list, null).length, 2);
});

test('an unrelated image whose name merely starts similarly is kept', () => {
  const u = (n) => `https://w/images/x/${n}`;
  const kept = withoutStaleHeroes([u('00-hero.aaaaaaaa.jpg'), u('00-hero-detail.jpg')], '00-hero.aaaaaaaa.jpg')
    .map((x) => x.split('/').pop());
  assert.deepEqual(kept, ['00-hero.aaaaaaaa.jpg', '00-hero-detail.jpg']);
});


// --- the rendering side, re-pinned on the redesign's components ---------------
// The generator's contract with the page: the hero is the LCP and loads
// eagerly; its backdrop is the sampled edge colour, never a blurred copy; a
// video beat stays a poster until the visitor asks for the player.

test('the page hero is eagerly loaded, never lazy', () => {
  const view = readFileSync(new URL('../src/components/CaseStudyView.tsx', import.meta.url), 'utf8');
  const heroBlock = /hero \? \([\s\S]*?<\/motion\.div>\s*\) : null/.exec(view)?.[0];
  assert.ok(heroBlock, 'hero block not found');
  assert.match(heroBlock, /<Picture[\s\S]*?\beager\b/, 'the hero Picture is marked eager');
  const picture = readFileSync(new URL('../src/components/Picture.tsx', import.meta.url), 'utf8');
  assert.match(picture, /loading=\{eager \? 'eager' : 'lazy'\}/);
  assert.match(picture, /fetchpriority: 'high'/);
});

test('the hero backdrop is sampled edge color, not a blurred second copy', () => {
  const view = readFileSync(new URL('../src/components/CaseStudyView.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /blur\(/);
  assert.match(view, /hero\?\.edgeColors\s*\?/);
  assert.match(view, /linear-gradient\(90deg, \$\{hero\.edgeColors\.left\}, \$\{hero\.edgeColors\.right\}\)/);
  assert.match(view, /'var\(--paper-2\)'/, 'the token surface stays as the no-colour fallback');
  const heroBlock = /hero \? \([\s\S]*?<\/motion\.div>\s*\) : null/.exec(view)?.[0] ?? '';
  assert.equal([...heroBlock.matchAll(/<Picture/g)].length, 1, 'one hero, one image, no backdrop copy');
});

test('the video facade keeps the YouTube player unloaded before activation', () => {
  const view = readFileSync(new URL('../src/components/CaseStudyView.tsx', import.meta.url), 'utf8');
  const facade = view.slice(view.indexOf('function VideoFacade'), view.indexOf('export function Prose'));
  assert.ok(facade.length > 0, 'VideoFacade not found');
  assert.match(facade, /youtube-nocookie\.com\/embed/);
  const [before, after] = facade.split('{on ? (');
  assert.doesNotMatch(before, /<iframe/, 'no iframe before the branch');
  const [playing, poster] = after.split(') : (');
  assert.match(playing, /<iframe/);
  assert.match(playing, /allowFullScreen/);
  assert.doesNotMatch(poster, /<iframe/, 'the poster branch never loads the player');
});

test('the play control is a real button with an accessible name', () => {
  const view = readFileSync(new URL('../src/components/CaseStudyView.tsx', import.meta.url), 'utf8');
  const facade = view.slice(view.indexOf('function VideoFacade'), view.indexOf('export function Prose'));
  const btn = facade.slice(facade.indexOf('<button'), facade.indexOf('</button>'));
  assert.ok(btn.length > 0, 'no button element found');
  assert.match(btn, /type="button"/);
  assert.match(btn, /aria-label=\{`Play \$\{m\.poster\.alt\}`\}/);
});
