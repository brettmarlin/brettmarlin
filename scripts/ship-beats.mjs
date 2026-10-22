#!/usr/bin/env node
/**
 * npm run beats:ship -- --study <slug>
 *
 * The paste pipeline's four manual steps as one command, the way heroes:ship
 * bundles bind-heroes: adopt, upload, bind, generate, verify. It cannot be a
 * `&&` chain in package.json because the upload sits between two scripts that
 * deliberately do not touch R2 — adopt-pastes only stages and renames locally
 * (see its header on why it writes `_shot:` and not `_media:`) — so the
 * wrangler calls live here, the same way bind-heroes owns its own
 * `r2 object put`.
 *
 * Every stage is gated on its exit code. The first non-zero stops the run and
 * names the stage that died; nothing after it is attempted. An upload failure
 * additionally says how many files made it up, so a half-uploaded staging dir
 * is never silent. Re-running is safe: wrangler put overwrites the same bytes,
 * adopt-pastes is idempotent, and bind-images only flips what is unbound.
 *
 * Staged files stay in `_attachments/<slug>/` after upload. R2 is the source
 * of truth once bind-images has run; the local copies are the record of what
 * was shipped, and deleting them is not this script's job.
 *
 * Only `--study` is plumbed through. adopt-pastes' `--key`/`--out` flags stay
 * with the four-step manual procedure; this command is the common case.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VAULT_DIR } from './vault-present.mjs';

const BUCKET = 'marliin-portfolio-images';
const SCRIPTS_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Where adopt-pastes puts a study's renamed files, by its own default. */
export function stagingDirFor(slug, vaultDir = VAULT_DIR) {
  return join(vaultDir, '_attachments', slug);
}

/** What in a staging dir is actually worth uploading: image files only, so a
 *  .DS_Store the Finder drops in never becomes an R2 object the generator
 *  lists as unclaimed. */
export function uploadableFiles(names) {
  return names.filter((f) => !f.startsWith('.') && /\.(png|jpe?g|gif|webp)$/i.test(f)).sort();
}

function stagedNow(dir) {
  return existsSync(dir) ? uploadableFiles(readdirSync(dir)) : [];
}

/** Spawn a stage with Brett's terminal as its terminal — its own output is the
 *  progress report — and stop the whole run on the first non-zero exit. */
function run(label, cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nbeats:ship: ${label} exited ${r.status ?? `on signal ${r.signal}`}; stopping here.`);
    process.exit(r.status || 1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--study');
  const slug = i === -1 ? undefined : args[i + 1];
  if (!slug || slug.startsWith('--')) {
    console.error('usage: npm run beats:ship -- --study maf-machine-ai-endurance-coach');
    process.exit(2);
  }

  const dir = stagingDirFor(slug);
  // The adopted count is the dir diff, not a parse of adopt-pastes' stdout:
  // whatever is in the staging dir afterwards that was not there before is
  // what this run adopted.
  const before = new Set(stagedNow(dir));

  run('adopt-pastes', process.execPath, [join(SCRIPTS_DIR, 'adopt-pastes.mjs'), '--study', slug, '--apply']);

  const staged = stagedNow(dir);
  const adopted = staged.filter((f) => !before.has(f)).length;
  if (staged.length === 0) {
    console.log(`beats:ship: nothing staged for ${slug}, nothing to upload`);
    return;
  }

  console.log(`\nbeats:ship: uploading ${staged.length} file(s) from ${dir}\n`);
  let uploaded = 0;
  for (const f of staged) {
    // --remote is not optional: without it wrangler writes to a local
    // simulated bucket, exits 0, and uploads nothing at all.
    const r = spawnSync('npx', [
      'wrangler', 'r2', 'object', 'put',
      `${BUCKET}/${slug}/${f}`,
      `--file=${join(dir, f)}`, '--remote',
    ], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(
        `\nbeats:ship: upload of ${f} failed (${uploaded} of ${staged.length} uploaded, the rest not attempted); stopping here.`,
      );
      process.exit(r.status || 1);
    }
    uploaded += 1;
  }

  run('bind-images', process.execPath, [join(SCRIPTS_DIR, 'bind-images.mjs'), '--apply']);
  run('generate', 'npm', ['run', 'generate']);
  run('verify', 'npm', ['run', 'verify']);

  console.log(`\nbeats:ship: ${slug} — ${adopted} adopted, ${uploaded} uploaded, bind/generate/verify green.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
