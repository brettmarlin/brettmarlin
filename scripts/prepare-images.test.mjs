/**
 * Coverage for prepare-images: the slugify rule against the two vault-verified
 * examples, matching in both leftover directions, worksheet exclusion, dry-run
 * and no-overwrite behavior, the no-upscale rule, and (with real sips) that a
 * transparent PNG flattens to a white background, not black.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import {
  slugifyStem,
  targetStemCandidates,
  targetsFromShots,
  matchSources,
  sipsArgs,
  convertWithSips,
  prepareStudy,
  isImageSource,
  LONG_EDGE,
} from './prepare-images.mjs';

// Phase 2: a study is public because its FRONTMATTER says so, so a fixture that
// wants to be read needs frontmatter. The take header no longer carries it.
const FM = '---\nslug: x\nvisibility: public\n---\n\n';

test('slugify rule matches both vault-verified examples, plus the double-hyphen archive names', () => {
  assert.equal(slugifyStem('Screen+Shot+2022-02-24+at+3.48.44+PM'), 'screen-shot-2022-02-24-at-3-48-44-pm');
  assert.equal(slugifyStem('homepage-panoramic'), 'homepage-panoramic');
  assert.equal(slugifyStem('iPhone+12+Pro+--+Gold+--+Shadow-10'), 'iphone-12-pro-gold-shadow-10');
});

test('underscores are separators, like + and .', () => {
  assert.equal(slugifyStem('HM_SIgnal'), 'hm-signal');
  assert.equal(slugifyStem('IMG_9844'), 'img-9844');
  assert.equal(slugifyStem('android-screen-round2-_0013_Layer-9-copy-2'), 'android-screen-round2-0013-layer-9-copy-2');
  assert.equal(slugifyStem('_retention_week_2014-05-26_to_2014-08-19'), 'retention-week-2014-05-26-to-2014-08-19');
});

test('percent-encoding decodes before slugifying: the vault records the decoded collapse', () => {
  assert.equal(
    slugifyStem('_retention_week_2014-05-26_to_2014-08-19+%282%29'),
    'retention-week-2014-05-26-to-2014-08-19-2'
  );
  assert.equal(slugifyStem('100%_raw_percent'), '100-raw-percent'); // invalid escape falls back to the raw name
});

test('an extensionless file with image bytes is a source; other extensionless files are not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prepare-images-sniff-'));
  writeFileSync(join(dir, 'Mixpanel+Success+Metrics'), rgbaPng(4, 4));
  writeFileSync(join(dir, 'README'), 'just text, not an image');
  writeFileSync(join(dir, 'notes.txt'), 'text with extension');
  assert.equal(isImageSource(dir, 'Mixpanel+Success+Metrics'), true);
  assert.equal(isImageSource(dir, 'README'), false);
  assert.equal(isImageSource(dir, 'notes.txt'), false);
  assert.equal(isImageSource(dir, 'anything.png'), true); // extension short-circuits
});

test('two sources normalizing to one target are ambiguous and matched to NOTHING', () => {
  const { matched, ambiguous, unmatchedTargets } = matchSources(
    ['HM_SIgnal.png', 'HM+SIgnal.png'],
    ['08-mixpanel-hm-signal.jpg']
  );
  assert.deepEqual(matched, []);
  assert.equal(ambiguous.length, 2);
  assert.deepEqual(unmatchedTargets, ['08-mixpanel-hm-signal.jpg']);
});

test('target candidates strip NN-token- and NN- prefixes', () => {
  assert.deepEqual(targetStemCandidates('05-lobus-screen-shot-2022-02-24-at-3-48-44-pm.jpg'), [
    'lobus-screen-shot-2022-02-24-at-3-48-44-pm',
    'screen-shot-2022-02-24-at-3-48-44-pm',
  ]);
});

test('matching reports both leftover directions', () => {
  const { matched, unmatchedSources, unmatchedTargets } = matchSources(
    ['homepage-panoramic.png', 'never-wanted.png'],
    ['01-lobus-homepage-panoramic.jpg', '02-lobus-wanted-but-missing.jpg']
  );
  assert.deepEqual(matched, [{ source: 'homepage-panoramic.png', target: '01-lobus-homepage-panoramic.jpg' }]);
  assert.deepEqual(unmatchedSources, ['never-wanted.png']);
  assert.deepEqual(unmatchedTargets, ['02-lobus-wanted-but-missing.jpg']);
});

test('a source already carrying the study token still matches exactly', () => {
  const { matched } = matchSources(['aol-objectModel.png'], ['13-telmate-aol-objectmodel.jpg']);
  assert.deepEqual(matched, [{ source: 'aol-objectModel.png', target: '13-telmate-aol-objectmodel.jpg' }]);
});

test('a worksheet-reference line is never treated as a filename source of targets', () => {
  const { targets, worksheet } = targetsFromShots([
    { subject: '⚠ confirm — worksheet row 05, 06-overdog-x.jpg — confirm against image-mapping-worksheet.md' },
    { subject: '01-a.jpg — in the legacy archive' },
  ]);
  assert.deepEqual(targets, ['01-a.jpg']);
  assert.equal(worksheet.length, 1);
});

test('no-upscale: -Z only appears when the long edge exceeds the cap', () => {
  assert.ok(!sipsArgs(800, 600, 's', 'd').includes('-Z'));
  assert.ok(!sipsArgs(LONG_EDGE, 900, 's', 'd').includes('-Z'));
  const big = sipsArgs(4000, 1000, 's', 'd');
  assert.equal(big[big.indexOf('-Z') + 1], String(LONG_EDGE));
});

const STUDY_MD = FM + `## Take — decisions-outcomes
_clearance: public_

### Card
- slug: prep-study
- order: 1
- title: T
- outcome: O
- tags: x

### Problem
P

### Decisions
- d

### Outcome
O

### Beats

#### B1
Prose.

_shot: 01-prep-homepage-panoramic.jpg — in the legacy archive, needs standardizing and upload (archived)_
_shot: ⚠ confirm — worksheet row 02 — confirm against image-mapping-worksheet.md, then standardize and upload (archived)_
`;

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'prepare-images-test-'));
  mkdirSync(join(dir, 'vault', 'case-studies'), { recursive: true });
  writeFileSync(join(dir, 'vault', 'case-studies', 'prep-study.md'), STUDY_MD);
  mkdirSync(join(dir, 'from'));
  writeFileSync(join(dir, 'from', 'homepage-panoramic.png'), 'fake png bytes');
  mkdirSync(join(dir, 'out'));
  return dir;
}

test('an explicit source-map entry binds an identityless source to its recovered target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prepare-images-map-'));
  mkdirSync(join(dir, 'vault', 'case-studies'), { recursive: true });
  writeFileSync(
    join(dir, 'vault', 'case-studies', 'prep-study.md'),
    STUDY_MD.replace('_shot: 01-prep-homepage-panoramic.jpg — in the legacy archive, needs standardizing and upload (archived)_',
      '_shot: 01-prep-hero.jpg — recovered from archive page order (archived)_')
  );
  mkdirSync(join(dir, 'from'));
  writeFileSync(join(dir, 'from', 'image-asset.png'), 'bytes');
  mkdirSync(join(dir, 'out'));
  const report = prepareStudy({
    vaultDir: join(dir, 'vault'),
    slug: 'prep-study',
    fromDir: join(dir, 'from'),
    outDir: join(dir, 'out'),
    apply: false,
    sourceMap: { '01-prep-hero.jpg': 'image-asset.png' },
  });
  assert.deepEqual(report.converted, [{ source: 'image-asset.png', target: '01-prep-hero.jpg' }]);
  assert.deepEqual(report.unmatchedSources, []);
  assert.deepEqual(report.unmatchedTargets, []);
});

test('dry run writes nothing and calls no converter', () => {
  const dir = makeFixture();
  let convertCalls = 0;
  const report = prepareStudy({
    vaultDir: join(dir, 'vault'),
    slug: 'prep-study',
    fromDir: join(dir, 'from'),
    outDir: join(dir, 'out'),
    apply: false,
    convert: () => { convertCalls += 1; },
  });
  assert.equal(report.converted.length, 1);
  assert.equal(report.worksheet.length, 1);
  assert.equal(convertCalls, 0);
  assert.deepEqual(readdirSync(join(dir, 'out')), []);
});

test('an existing output file is skipped, never overwritten', () => {
  const dir = makeFixture();
  writeFileSync(join(dir, 'out', '01-prep-homepage-panoramic.jpg'), 'precious existing bytes');
  const report = prepareStudy({
    vaultDir: join(dir, 'vault'),
    slug: 'prep-study',
    fromDir: join(dir, 'from'),
    outDir: join(dir, 'out'),
    apply: true,
    convert: (src, dest) => writeFileSync(dest, 'newly converted'),
  });
  assert.deepEqual(report.skippedExisting, ['01-prep-homepage-panoramic.jpg']);
  assert.equal(report.converted.length, 0);
  assert.equal(readFileSync(join(dir, 'out', '01-prep-homepage-panoramic.jpg'), 'utf8'), 'precious existing bytes');
});

// --- real-sips coverage (macOS) ---

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function rgbaPng(width, height) {
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(Buffer.from([0]));
    raw.push(Buffer.from(new Array(width).fill([255, 0, 0, 0]).flat())); // transparent red
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hasSips = (() => {
  try { execFileSync('which', ['sips'], { stdio: 'pipe' }); return true; } catch { return false; }
})();

test('a transparent PNG converts to JPEG on a white background, not black', { skip: !hasSips }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'prepare-images-sips-'));
  const src = join(dir, 'alpha.png');
  writeFileSync(src, rgbaPng(8, 8));
  const dest = join(dir, 'alpha.jpg');
  convertWithSips(src, dest);
  assert.ok(existsSync(dest));
  // Probe via BMP, trivially parseable: pixel data offset at byte 10.
  const bmp = join(dir, 'alpha.bmp');
  execFileSync('sips', ['-s', 'format', 'bmp', dest, '--out', bmp], { stdio: 'pipe' });
  const b = readFileSync(bmp);
  const off = b.readUInt32LE(10);
  assert.ok(b[off] > 200 && b[off + 1] > 200 && b[off + 2] > 200, `background not white: ${b[off]},${b[off + 1]},${b[off + 2]}`);
});

test('a small source is not upscaled by real sips', { skip: !hasSips }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'prepare-images-sips2-'));
  const src = join(dir, 'small.png');
  writeFileSync(src, rgbaPng(8, 8));
  const dest = join(dir, 'small.jpg');
  convertWithSips(src, dest);
  const out = execFileSync('sips', ['-g', 'pixelWidth', dest], { encoding: 'utf8' });
  assert.equal(Number(/pixelWidth: (\d+)/.exec(out)[1]), 8);
});
