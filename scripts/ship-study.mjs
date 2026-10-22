#!/usr/bin/env node
/**
 * npm run study:ship -- --study <vault-filename-or-card-slug>
 *
 * Ships an edit to an existing case study. Unlike beats:ship, this resolves
 * the vault filename and public Card slug as two names for one study, keeps
 * going when there are no new images, and verifies only the requested study.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VAULT_DIR } from './vault-present.mjs';
import { readStudies, resolveStudy } from './bind-heroes.mjs';
import { uploadableFiles } from './ship-beats.mjs';
import { embedFiles, mediaLines } from './study-status.mjs';
import { loadIndex, scanBundle } from './check-clearance.mjs';
import { lintBeatMeta } from './check-beat-meta.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));
const BUCKET = 'marliin-portfolio-images';
const BUNDLE_PATH = join(ROOT, 'src/data/caseStudies.ts');

export function stagingDirFor(cardSlug, vaultDir = VAULT_DIR) {
  return join(vaultDir, '_attachments', cardSlug);
}

/** Adopted embeds remain visible in Obsidian, but a _shot: or _media: record
 * must also name them. Anything else is invisible to the site. */
export function unadoptedEmbeds(md) {
  const recorded = new Set(mediaLines(md).flatMap((line) => line.files));
  return embedFiles(md).filter((file) => !recorded.has(file));
}

/** Pull one top-level study object from the deterministic generated TS. */
export function generatedStudyBlock(bundle, slug) {
  const marker = `    slug: "${slug}",`;
  const at = bundle.indexOf(marker);
  if (at === -1) return null;
  const open = bundle.lastIndexOf('\n  {', at);
  const close = bundle.indexOf('\n  }', at);
  const start = open === -1 && bundle.startsWith('  {') ? 0 : open + 1;
  if (start < 0 || close === -1) return null;
  return bundle.slice(start, close + '\n  }'.length);
}

/** Target-scoped postflight. Global verify remains available separately, but
 * unrelated studies cannot make this claim false about the requested one. */
export function verifyStudy({ md, bundle, cardSlug, file, entities = [] }) {
  const errors = [];
  const unadopted = unadoptedEmbeds(md);
  if (unadopted.length) {
    errors.push(
      `${unadopted.length} image embed(s) are not attached to a beat record: ${unadopted.join(', ')}. ` +
      'Under a ### Beats section, each beat heading must be #### so adopt-pastes and the generator can see it.'
    );
  }

  for (const error of lintBeatMeta(md, file)) errors.push(error);

  const block = generatedStudyBlock(bundle, cardSlug);
  if (!block) {
    errors.push(`the generated bundle has no study with public slug "${cardSlug}"`);
    return { errors, beatCount: 0, placeholderCount: 0 };
  }

  const placeholderCount = (block.match(/kind: "placeholder"/g) ?? []).length;
  if (placeholderCount) errors.push(`${placeholderCount} placeholder image(s) remain in the generated study`);

  if (entities.length) {
    const hits = scanBundle({ bundleText: block, entities, surface: 'public-grid' });
    for (const hit of hits) errors.push(`clearance guard: ${hit.name} [${hit.status}] appears in the generated study`);
  }

  const beatCount = (block.match(/\{ id: "/g) ?? []).length;
  return { errors, beatCount, placeholderCount };
}

function stagedNow(dir) {
  return existsSync(dir) ? uploadableFiles(readdirSync(dir)) : [];
}

function run(label, cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nstudy:ship: ${label} exited ${result.status ?? `on signal ${result.signal}`}; stopping here.`);
    process.exit(result.status || 1);
  }
}

function failContentGuard(errors) {
  console.error('\ncontent guard: FAILED');
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--study');
  const requested = at === -1 ? undefined : args[at + 1];
  if (!requested || requested.startsWith('--')) {
    console.error('usage: npm run study:ship -- --study marliin-factory');
    process.exit(2);
  }

  const resolved = resolveStudy(requested, readStudies());
  if (resolved.error) {
    console.error(`study:ship: ${resolved.error}`);
    process.exit(1);
  }
  const { study, matchedOn } = resolved;
  const notePath = join(VAULT_DIR, 'case-studies', study.file);
  const stagingDir = stagingDirFor(study.cardSlug);
  const before = new Set(stagedNow(stagingDir));

  console.log(`study:ship: ${requested} -> ${study.file} -> /work/${study.cardSlug} (matched on ${matchedOn})\n`);

  run('adopt-pastes', process.execPath, [
    join(SCRIPTS, 'adopt-pastes.mjs'),
    '--study', study.vaultSlug,
    '--out', stagingDir,
    '--apply',
  ]);

  // Catch the silent failure that motivated this command: pasted images under
  // sibling ### headings produced "0 beats" and the old command called it done.
  const afterAdopt = readFileSync(notePath, 'utf8');
  const stranded = unadoptedEmbeds(afterAdopt);
  if (stranded.length) {
    failContentGuard([
      `${stranded.length} image embed(s) are outside recognized beats: ${stranded.join(', ')}. ` +
      'Under ### Beats, change each beat heading to #### and rerun.',
    ]);
  }

  const staged = stagedNow(stagingDir);
  const adopted = staged.filter((file) => !before.has(file)).length;
  let uploaded = 0;
  if (staged.length) {
    console.log(`\nstudy:ship: uploading ${staged.length} file(s) to ${study.cardSlug}/ in R2\n`);
    for (const file of staged) {
      const result = spawnSync('npx', [
        'wrangler', 'r2', 'object', 'put',
        `${BUCKET}/${study.cardSlug}/${file}`,
        `--file=${join(stagingDir, file)}`,
        '--remote',
      ], { stdio: 'inherit' });
      if (result.status !== 0) {
        console.error(`\nstudy:ship: upload of ${file} failed (${uploaded} uploaded); stopping here.`);
        process.exit(result.status || 1);
      }
      uploaded += 1;
    }
    run('bind-images', process.execPath, [
      join(SCRIPTS, 'bind-images.mjs'),
      '--apply',
      '--study', study.cardSlug,
    ]);
  } else {
    console.log('study:ship: no staged images; skipping R2 upload and bind-images');
  }

  run('generate', 'npm', ['run', 'generate']);

  const loaded = loadIndex();
  if (!loaded) failContentGuard([`clearance index is unavailable at ${VAULT_DIR}/consent/clearances.md`]);
  const checked = verifyStudy({
    md: readFileSync(notePath, 'utf8'),
    bundle: readFileSync(BUNDLE_PATH, 'utf8'),
    cardSlug: study.cardSlug,
    file: study.file,
    entities: loaded.index.entities,
  });
  if (checked.errors.length) failContentGuard(checked.errors);

  console.log(`placeholder guard: clean for ${study.cardSlug}, no placeholder media in the generated study`);
  console.log(`content guard: clean for ${study.cardSlug}, generated with ${checked.beatCount} beat(s)`);
  console.log(`\nstudy:ship: ${study.cardSlug} — ${adopted} adopted, ${uploaded} uploaded, content update green.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
