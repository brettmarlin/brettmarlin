import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, r2Prefix, wantedFiles } from './upload-missing.mjs';

const NOTE = [
  '---', 'visibility: public', '---',
  '## Take — full-case',
  '_clearance: public_',
  '_hero: 00-maf-hero.png_',
  '### Beats',
  '#### One',
  '_media: 01-maf-a.png, 02-maf-b.png_',
  '#### Two',
  '_shot: another (staged · 03-maf-c.png)_',
  '#### Three',
  '_shot: not taken yet (need · diagram · landscape)_',
].join('\n');

test('a study wants its bound files, its staged files, and its hero', () => {
  // The hero is the one most likely to be forgotten: it does not come from a
  // paste, so nothing stages it automatically, and an earlier version of the
  // upload path looked only at shot lines and shipped without it.
  assert.deepEqual(wantedFiles(NOTE), [
    '01-maf-a.png', '02-maf-b.png', '03-maf-c.png', '00-maf-hero.png',
  ]);
});

test('an unfilled shot line names nothing and asks for nothing', () => {
  assert.ok(!wantedFiles(NOTE).some((f) => f.includes('need')));
});

test('it uploads only what R2 lacks', () => {
  const { upload, absent } = plan({
    wanted: ['01-a.png', '02-b.png', '03-c.png'],
    inR2: ['01-a.png'],
    staged: ['01-a.png', '02-b.png', '03-c.png'],
  });
  assert.deepEqual(upload, ['02-b.png', '03-c.png']);
  assert.deepEqual(absent, []);
});

test('running it again uploads nothing', () => {
  // The property that lets CI run this on every push without thinking about
  // it. The old shell script re-PUT every file every time.
  const { upload } = plan({
    wanted: ['01-a.png', '02-b.png'],
    inR2: ['01-a.png', '02-b.png'],
    staged: ['01-a.png', '02-b.png'],
  });
  assert.deepEqual(upload, []);
});

test('a file in neither R2 nor _attachments is reported, not skipped', () => {
  // Silence here is how a study ships with a missing image. The old script met
  // this as a path error halfway through, after some uploads had already run.
  const { upload, absent } = plan({
    wanted: ['01-a.png', '00-hero.png'],
    inR2: [],
    staged: ['01-a.png'],
  });
  assert.deepEqual(upload, ['01-a.png']);
  assert.deepEqual(absent, ['00-hero.png'], 'the hero is named but nowhere');
});

const BUNDLE = [
  'slug: "maf-machine-ai-endurance-coach",',
  'src: "https://w.dev/images/maf-machine-ai-endurance-coach/01-maf-a.png",',
  'slug: "convoy-defense-agentic-governance",',
  'src: "https://w.dev/images/agentic-decision-layer-defense/01-hero.png",',
  'slug: "brand-new-study",',
].join('\n');

test('the prefix is the slug when the bundle agrees', () => {
  const { prefix } = r2Prefix('maf-machine-ai-endurance-coach', BUNDLE);
  assert.equal(prefix, 'maf-machine-ai-endurance-coach');
});

test('it REFUSES when the bundle serves the study from another prefix', () => {
  // The live divergence the audit found: the worker returns 0 images for
  // convoy-defense-agentic-governance and 9 for agentic-decision-layer-defense,
  // same study. Uploading to the slug writes objects the site never reads —
  // into a bucket nothing can list. Refusing is the only safe answer until the
  // prefix is canonical.
  const { prefix, source } = r2Prefix('convoy-defense-agentic-governance', BUNDLE);
  assert.equal(prefix, null, 'no guessing');
  assert.match(source, /agentic-decision-layer-defense/);
});

test('a study with no images yet uses its slug', () => {
  const { prefix } = r2Prefix('brand-new-study', BUNDLE);
  assert.equal(prefix, 'brand-new-study');
});
