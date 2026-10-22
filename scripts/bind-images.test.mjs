/**
 * Coverage for the bind-images rebinding rules. The core is pure
 * (rebindMarkdown); the fs-level dry-run/apply behavior runs against a temp
 * vault with an injected R2 list, never the network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rebindMarkdown, applyToVault } from './bind-images.mjs';

const beatsMd = (lines) =>
  `## Take — decisions-outcomes\n_clearance: public_\n\n### Card\n- slug: test-study\n- order: 1\n- title: T\n- outcome: O\n- tags: x\n\n### Problem\nP\n\n### Decisions\n- d\n\n### Outcome\nO\n\n### Beats\n\n${lines.join('\n')}\n\n### Through-line\nT\n`;

test('a shot whose file now exists in R2 flips to _media:_, preserving position', () => {
  const md = beatsMd(['#### B1', 'Prose.', '', '_shot: 01-a.jpg — in the legacy archive, needs standardizing and upload (archived)_']);
  const { text, flipped } = rebindMarkdown(md, ['01-a.jpg']);
  assert.deepEqual(flipped, ['01-a.jpg']);
  assert.match(text, /Prose\.\n\n_media: 01-a\.jpg_/);
  assert.doesNotMatch(text, /_shot: 01-a/);
});

test('a worksheet-reference shot is never flipped, even if a filename inside it exists', () => {
  const md = beatsMd(['#### B1', '_shot: ⚠ confirm — worksheet row 05, 06-x.jpg — confirm against image-mapping-worksheet.md, then standardize and upload (archived)_']);
  const { text, flipped, worksheet } = rebindMarkdown(md, ['06-x.jpg']);
  assert.deepEqual(flipped, []);
  assert.equal(worksheet.length, 1);
  assert.equal(text, md);
});

test('a multi-file shot partially in R2 splits: media line plus residual shot line, note kept', () => {
  const md = beatsMd(['#### B1', '_shot: 01-a.jpg, 02-b.jpg — in the legacy archive, needs standardizing and upload (archived)_']);
  const { text, flipped, waiting } = rebindMarkdown(md, ['02-b.jpg']);
  assert.deepEqual(flipped, ['02-b.jpg']);
  assert.deepEqual(waiting, []);
  assert.match(text, /_media: 02-b\.jpg_\n_shot: 01-a\.jpg — in the legacy archive, needs standardizing and upload \(archived\)_/);
});

test('an unmatched shot line is left exactly as it is, reported as waiting', () => {
  const md = beatsMd(['#### B1', '_shot: 01-a.jpg — in the legacy archive, needs standardizing and upload (archived)_']);
  const { text, waiting } = rebindMarkdown(md, []);
  assert.equal(text, md);
  assert.equal(waiting.length, 1);
});

test('rebinding is idempotent: a second pass over flipped output is a no-op', () => {
  const md = beatsMd(['#### B1', '_shot: 01-a.jpg, 02-b.jpg — note (archived)_', '_shot: 03-c.jpg — note (archived)_']);
  const first = rebindMarkdown(md, ['01-a.jpg', '02-b.jpg']);
  const second = rebindMarkdown(first.text, ['01-a.jpg', '02-b.jpg']);
  assert.equal(second.text, first.text);
  assert.deepEqual(second.flipped, []);
});

test('shot lines outside a Beats section are never touched', () => {
  const md = beatsMd(['#### B1', 'Prose only.']) + '\n### Notes\n_shot: 01-a.jpg — stray line (archived)_\n';
  const { text, flipped } = rebindMarkdown(md, ['01-a.jpg']);
  assert.deepEqual(flipped, []);
  assert.equal(text, md);
});

test('unclaimed R2 files are reported: present in R2, named by no shot or media line', () => {
  const md = beatsMd(['#### B1', '_shot: 01-a.jpg — note (archived)_']);
  const r2 = ['01-a.jpg', 'orphan-v2.jpg'];
  const { claimed } = rebindMarkdown(md, r2);
  assert.deepEqual(r2.filter((f) => !claimed.has(f)), ['orphan-v2.jpg']);
});

function makeTempVault(md) {
  const dir = mkdtempSync(join(tmpdir(), 'bind-images-test-'));
  mkdirSync(join(dir, 'case-studies'));
  writeFileSync(join(dir, 'case-studies', 'test-study.md'), md);
  return dir;
}

test('dry run changes nothing on disk', () => {
  const md = beatsMd(['#### B1', '_shot: 01-a.jpg — note (archived)_']);
  const dir = makeTempVault(md);
  const report = applyToVault({ vaultDir: dir, r2BySlug: { 'test-study': ['01-a.jpg'] }, apply: false });
  assert.equal(report[0].changed, true);
  assert.equal(readFileSync(join(dir, 'case-studies', 'test-study.md'), 'utf8'), md);
});

test('apply writes, and a second apply is a no-op', () => {
  const md = beatsMd(['#### B1', '_shot: 01-a.jpg — note (archived)_']);
  const dir = makeTempVault(md);
  const r2BySlug = { 'test-study': ['01-a.jpg'] };
  const first = applyToVault({ vaultDir: dir, r2BySlug, apply: true });
  assert.equal(first[0].changed, true);
  const afterFirst = readFileSync(join(dir, 'case-studies', 'test-study.md'), 'utf8');
  assert.match(afterFirst, /_media: 01-a\.jpg_/);
  const second = applyToVault({ vaultDir: dir, r2BySlug, apply: true });
  assert.equal(second[0].changed, false);
  assert.deepEqual(second[0].flipped, []);
  assert.equal(readFileSync(join(dir, 'case-studies', 'test-study.md'), 'utf8'), afterFirst);
});

test('every beat study is considered, not only the ones with a decisions-outcomes take', async () => {
  // bind-images used to pick studies with parseTake(md, 'decisions-outcomes',
  // 'public-grid') — the site's reader, answering "is there a publishable take
  // here". Two silent exclusions came out of that:
  //
  //   a take named anything else (MAF Machine's is `full-case`) was skipped
  //   entirely, so bind-images reported success having never looked at the one
  //   study Brett was trying to publish;
  //
  //   and `site_visibility: public-grid` is the pre-migration vocabulary,
  //   deleted from the schema on 2026-08-12, so every migrated study would
  //   vanish from here too.
  //
  // Binding rewrites _shot: to _media: in markdown. It does not care about
  // the take angle; it needs the public Card slug because that is the R2
  // prefix the generator reads.
  // Comments stripped first. The note explaining WHY parseTake and public-grid
  // are gone contains both strings, and a guard that fires on its own
  // documentation teaches people to delete the documentation. Same helper, same
  // reason, as the one in monogram-dots.test.mjs.
  const src = readFileSync(new URL('./bind-images.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /parseTake\(/, 'take selection is the wrong question for binding');
  assert.doesNotMatch(src, /public-grid/, 'that vocabulary was deleted from the schema');
  assert.match(src, /function slugOf\(/, 'the R2 prefix comes from the Card slug');
});

test('a divergent vault slug binds against the public Card slug used by R2', () => {
  const md = [
    '---',
    'slug: marliin-factory-ai-design-system-pipeline',
    '---',
    '',
    '## Take — decisions-outcomes',
    '_clearance: public_',
    '',
    '### Card',
    '- slug: marliin-factory',
    '- order: 1',
    '- title: Factory',
    '- outcome: O',
    '- tags: x',
    '',
    '### Beats',
    '#### One',
    '_shot: Uploaded image (staged · 01-marliin-one.png)_',
  ].join('\n');
  const dir = makeTempVault(md);
  const report = applyToVault({
    vaultDir: dir,
    r2BySlug: { 'marliin-factory': ['01-marliin-one.png'] },
    apply: true,
    studySlug: 'marliin-factory',
  });
  assert.equal(report[0].slug, 'marliin-factory');
  assert.deepEqual(report[0].flipped, ['01-marliin-one.png']);
  assert.match(readFileSync(join(dir, 'case-studies', 'test-study.md'), 'utf8'), /_media: 01-marliin-one\.png_/);
});

test('a scoped bind leaves unrelated studies untouched', () => {
  const md = beatsMd(['#### B1', '_shot: 01-a.jpg — note (archived)_']);
  const dir = makeTempVault(md);
  const report = applyToVault({
    vaultDir: dir,
    r2BySlug: { 'test-study': ['01-a.jpg'] },
    apply: true,
    studySlug: 'some-other-study',
  });
  assert.deepEqual(report, []);
  assert.equal(readFileSync(join(dir, 'case-studies', 'test-study.md'), 'utf8'), md);
});

test('it binds the staged record adopt-pastes writes, not just subject-style lines', () => {
  // The dialect split that cost an afternoon. adopt-pastes puts filenames in
  // the `(staged · ...)` record; this parser read the subject only, found
  // nothing, and called nine beats "waiting on uploads" while their files sat
  // in R2. Every real shot line in the vault is now this shape.
  const md = [
    '### Beats',
    '#### One',
    '_shot: A method that reads as failure (staged · 01-maf-a.png, 02-maf-b.png)_',
  ].join('\n');
  const { text, flipped } = rebindMarkdown(md, ['01-maf-a.png', '02-maf-b.png']);
  assert.deepEqual(flipped, ['01-maf-a.png', '02-maf-b.png']);
  assert.match(text, /^_media: 01-maf-a\.png, 02-maf-b\.png_$/m);
  assert.doesNotMatch(text, /_shot:/, 'nothing is left waiting');
});

test('a partly-uploaded staged record keeps its own dialect', () => {
  // The leftover has to still look like an adopt-pastes record, or the next
  // adopt run will not recognise the line it wrote.
  const md = [
    '### Beats',
    '#### One',
    '_shot: the trophy case, before and after (staged · 01-a.png, 02-b.png)_',
  ].join('\n');
  const { text, flipped } = rebindMarkdown(md, ['01-a.png']);
  assert.deepEqual(flipped, ['01-a.png']);
  assert.match(text, /^_media: 01-a\.png_$/m);
  assert.match(text, /^_shot: the trophy case, before and after \(staged · 02-b\.png\)_$/m);
});

test('an unfilled work order is still left alone', () => {
  const md = ['### Beats', '#### One', '_shot: something not taken yet (need · diagram · landscape)_'].join('\n');
  const { text, flipped, waiting } = rebindMarkdown(md, ['01-a.png']);
  assert.deepEqual(flipped, []);
  assert.equal(waiting.length, 1);
  assert.match(text, /_shot: something not taken yet \(need · diagram · landscape\)_/);
});
