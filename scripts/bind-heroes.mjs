#!/usr/bin/env node
/**
 * npm run heroes                 dry run against the drop folder
 * npm run heroes -- --apply      convert, upload, write the vault
 * npm run heroes -- --from <dir> a different folder, just this once
 *
 * The drop folder defaults to HEROES_DIR below and is overridable with the
 * HEROES_DIR env var. It defaults rather than being required because there is
 * one folder, it never changes, and a required flag that always takes the same
 * value is a flag that eventually gets typed wrong.
 *
 * The hand-curated hero path: Brett drops finished hero/card images in a
 * folder, one per study, and this converts them, uploads them to R2, and
 * writes the `_hero:` line into the study's take header.
 *
 * This is NOT prepare-images. That script serves the bulk archive path, where
 * the vault already recorded the exact target filename in a `_shot:_` line and
 * the job is matching Squarespace exports against names that already exist.
 * Here nothing is pre-recorded: these images did not exist when the study was
 * written, there is no shot line waiting for them, and a hero lives on the
 * TAKE HEADER rather than on a beat. Different input, different output, so a
 * separate script rather than a flag on that one.
 *
 * THE NAMING TRAP, and why this resolves rather than assumes. A study's R2
 * prefix is its CARD slug, which for eleven of twenty-five studies is not its
 * vault filename: `altana-value-chain-management.md` publishes as `altana`,
 * `convoy-design-system-governance.md` as `design-system-contracts-and-
 * governance`. Naming a drop file after the vault file and treating the stem
 * as the slug would upload to a prefix nothing reads. So either name is
 * accepted, both resolve to the card slug, and the dry run prints the
 * resolution before anything moves.
 *
 * FILENAMES ARE CONTENT-HASHED, and that is not a style choice. The Worker
 * serves images `cache-control: public, max-age=31536000, immutable`. In a
 * system that promises immutability, the filename IS the cache key: overwrite
 * an object and the new bytes sit in R2 while every browser and edge node that
 * already has the old ones keeps serving them for a year. An earlier version
 * of this script overwrote in place to avoid leaving an orphan in R2. That
 * traded a few kilobytes of storage for a hero nobody can see. So a changed
 * image gets a changed name — `00-mixpanel-hero.<hash>.jpg` — and the old
 * object stays where it is, correctly cached, referenced by nothing.
 *
 * It also makes the whole thing idempotent: same bytes, same hash, same name,
 * nothing to do.
 *
 * AND THE SUPERSEDED OBJECT IS DELETED. The first version of this said the old
 * file would "stay in R2, correctly cached, referenced by nothing." That was
 * wrong: a study's `images[]` is built from the R2 LISTING, so an orphan is
 * very much referenced — it comes back as a card thumbnail, and on a study
 * with no beats it renders in the image strip beside the image that replaced
 * it. Altana showed two heroes the day hashing landed. Deleting is safe
 * because nothing points at the old name once the vault is rewritten.
 *
 * ORDER IS LOAD-BEARING: upload, THEN write the vault. `resolveExplicitHero`
 * in the generator throws when a take names a hero that is not in R2, so a
 * vault write that lands first turns every subsequent `npm run generate` into
 * a hard failure until the upload catches up.
 *
 * Dry run by default. `--apply` converts, uploads, and writes.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolveVaultDir } from './vault-dir.mjs';

const VAULT_DIR = resolveVaultDir();
const STUDIES = join(VAULT_DIR, 'case-studies');
const BUCKET = 'marliin-portfolio-images';
// Brett's hero drop folder. Deliberately OUTSIDE both repos: the vault's
// _inbox/ is not gitignored, so images dropped there would be auto-committed
// into the vault's history by Obsidian Git.
const HEROES_DIR = process.env.HEROES_DIR ?? join(homedir(), 'Brettmarlin.com', 'Heros');
// Matches prepare-images.mjs. The hero is the one image that runs full-bleed
// to the viewport, so it is the one that earns the cap rather than a beat's
// rendered width.
const LONG_EDGE = 2000;
const HERO_NAME = '00-hero';
const IMAGE_RE = /\.(png|jpe?g|webp|tiff?|gif)$/i;

/** Every study, with both names it can be called by and where its takes are. */
export function readStudies(dir = STUDIES) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const md = readFileSync(join(dir, file), 'utf8');
      const cardSlug = /^- slug:\s*(\S+)\s*$/m.exec(md)?.[1] ?? null;
      // Take headers: the `_clearance:` line directly under `## Take — <angle>`.
      const takes = [...md.matchAll(/^## Take — (.+)$\n(_clearance:[^\n]*_)$/gm)].map((m) => ({
        angle: m[1].trim(),
        header: m[2],
      }));
      const heroes = [...md.matchAll(/^_hero:\s*(.+?)_\s*$/gm)].map((m) => m[1].trim());
      return { file, vaultSlug: file.slice(0, -3), cardSlug, takes, heroes, md };
    });
}

/**
 * A drop file's stem to a study. Accepts the card slug or the vault filename;
 * anything else is a miss and is REPORTED rather than guessed at, because a
 * near-match uploads to a prefix that silently serves nothing.
 */
export function resolveStudy(stem, studies) {
  const key = stem.trim().toLowerCase();
  const byCard = studies.filter((s) => s.cardSlug && s.cardSlug.toLowerCase() === key);
  if (byCard.length === 1) return { study: byCard[0], matchedOn: 'card slug' };
  const byFile = studies.filter((s) => s.vaultSlug.toLowerCase() === key);
  if (byFile.length === 1) {
    const s = byFile[0];
    if (!s.cardSlug) return { error: `${s.file} has no Card slug, so it has no R2 prefix to upload to` };
    return { study: s, matchedOn: 'vault filename' };
  }
  if (byCard.length > 1 || byFile.length > 1) return { error: `"${stem}" matches more than one study` };

  // A miss is still refused — but a bare "no match" against a list of twenty
  // is not help, it is homework. `convoy.png` is the case that proves
  // prefix-matching must NOT auto-resolve: two studies start with it, and
  // picking either would bind a hero to the wrong piece of work. So the
  // near-misses are NAMED and the choice stays Brett's.
  const near = studies
    .filter((s) => {
      const names = [s.cardSlug, s.vaultSlug].filter(Boolean).map((n) => n.toLowerCase());
      return names.some((n) => n.startsWith(key) || n.includes(key) || key.includes(n));
    })
    .map((s) => s.cardSlug)
    .filter(Boolean);
  if (near.length === 1) return { error: `"${stem}" matches no study. Did you mean ${near[0]}?` };
  if (near.length > 1) {
    return {
      error: `"${stem}" is ambiguous — it could be ${near.join(' or ')}. Rename the file to the one you mean.`,
    };
  }
  return { error: `"${stem}" matches no study` };
}

function sips(args) {
  return execFileSync('sips', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function longEdgeOf(path) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', path]);
  const w = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1] ?? 0);
  const h = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1] ?? 0);
  return Math.max(w, h);
}

/** First 8 hex of the file's sha256 — enough to distinguish revisions of one
 * image, short enough to stay readable in a filename. */
export function contentHash(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/**
 * What a hero should be encoded as, from its source.
 *
 * PNG STAYS PNG. This used to convert everything to JPEG, and a test asserted
 * it, so the decision looked deliberate rather than incidental. It is wrong for
 * the material: a hero that is a UI screenshot, a diagram or anything with hard
 * type edges gets visibly mushy through JPEG's chroma subsampling, and those
 * are exactly the images in this portfolio.
 *
 * Photographs still normalise to JPEG, and so do tiff/gif/webp, because there
 * is no reason to ship those formats and every reason not to pay PNG's size for
 * a photograph.
 */
export function heroFormat(sourcePath) {
  const ext = (/\.([a-z0-9]+)$/i.exec(sourcePath)?.[1] ?? '').toLowerCase();
  return ext === 'png' ?
    { sipsFormat: 'png', extension: 'png' } :
    { sipsFormat: 'jpeg', extension: 'jpg' };
}

/**
 * The name a hero should carry given its current name, its new bytes, and the
 * format it is being encoded as. Strips any hash this script previously added,
 * so names do not accrete `.a1b2c3d4.e5f6a7b8.jpg` across revisions, and strips
 * the old extension so a jpg->png change renames rather than doubling up.
 */
export function hashedName(currentName, hash, extension = 'jpg') {
  const base = (currentName ?? HERO_NAME)
    .replace(/\.(jpe?g|png|webp|gif|tiff?)$/i, '')
    .replace(/\.[0-9a-f]{8}$/i, '');
  return `${base}.${hash}.${extension}`;
}

/** Writes `_hero:` directly under the take's `_clearance:` header line. */
export function writeHeroLine(md, header, name) {
  if (!md.includes(header)) throw new Error('take header not found');
  return md.replace(header, `${header}\n_hero: ${name}_`);
}

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const force = argv.includes('--force');
  const i = argv.indexOf('--from');
  const from = i === -1 ? HEROES_DIR : argv[i + 1];
  if (i !== -1 && (!from || from.startsWith('--'))) {
    console.error('usage: npm run heroes [-- --from <dir>] [--apply] [--force]');
    process.exit(2);
  }
  const dir = from.replace(/^~/, homedir());
  if (!existsSync(dir)) {
    console.error(`error: ${dir} does not exist`);
    process.exit(1);
  }

  const studies = readStudies();
  const files = readdirSync(dir).filter((f) => IMAGE_RE.test(f) && !f.startsWith('.'));
  if (files.length === 0) {
    console.log(`no images in ${dir}`);
    return;
  }

  const planned = [];
  const problems = [];
  for (const f of files) {
    const stem = basename(f, extname(f));
    const { study, matchedOn, error } = resolveStudy(stem, studies);
    if (error) { problems.push(`${f}: ${error}`); continue; }
    if (study.takes.length === 0) { problems.push(`${f}: ${study.file} has no take to carry a hero`); continue; }
    const already = study.heroes.length > 0;
    if (already && !force) {
      problems.push(`${f}: ${study.cardSlug} already has a hero (${[...new Set(study.heroes)].join(', ')}). Pass --force to replace it in place.`);
      continue;
    }
    // A REPLACEMENT normally reuses the filename already on the take header and
    // overwrites that object in place. Uploading a new name instead would leave
    // the old file in R2 unreferenced forever and force a vault edit for a
    // change that is purely a change of pixels.
    //
    // A FORMAT CHANGE is the exception: jpg to png cannot keep the name, so the
    // upload lands under a new one, the vault is rewritten, and the old object
    // is left behind unreferenced. `npm run generate` lists unbound R2 files in
    // its run summary, which is where to find them.
    const existing = [...new Set(study.heroes)];
    planned.push({
      file: f, source: join(dir, f), study, matchedOn,
      replacing: already, currentName: existing[0] ?? null,
    });
  }

  console.log(`heroes: ${files.length} image(s) in ${dir}\n`);
  for (const p of planned) {
    console.log(`  ${p.file}`);
    console.log(`    -> study   ${p.study.cardSlug}   (matched on ${p.matchedOn}${p.study.cardSlug === p.study.vaultSlug ? '' : `, vault file ${p.study.file}`})`);
    // The extension MUST come from the source here, exactly as it does under
    // --apply. Printing the plan with the default (jpg) while --apply produced
    // png made the dry run lie about the filename it was about to write, which
    // defeats the only thing a dry run is for.
    const shape = hashedName(p.currentName, '<hash>', heroFormat(p.source).extension);
    console.log(`    -> R2      ${BUCKET}/${p.study.cardSlug}/${shape}   (hash computed from the converted bytes at --apply)`);
    console.log(`    -> vault   _hero:_ rewritten on ${p.study.takes.length} take header(s)${p.replacing ? `, replacing ${p.currentName}` : ''}`);
  }
  if (problems.length) {
    console.log(`\nnot planned (${problems.length}):`);
    for (const p of problems) console.log(`  ${p}`);
    if (problems.some((p) => /matches no study$/.test(p))) {
      console.log('\nValid names are a study\'s Card slug or its vault filename:');
      for (const s of studies.filter((s) => s.cardSlug)) {
        console.log(`  ${s.cardSlug}${s.cardSlug === s.vaultSlug ? '' : `   (or ${s.vaultSlug})`}`);
      }
    }
  }
  if (!apply) {
    console.log(`\nDRY RUN. Nothing converted, uploaded or written. Re-run with --apply.`);
    process.exit(problems.length && !planned.length ? 1 : 0);
  }
  if (!planned.length) { console.log('\nnothing to do'); process.exit(1); }

  // Checked HERE and not at startup: a dry run should tell you what would
  // happen from any machine, and requiring the converter to print a plan makes
  // the plan unreadable exactly where it is most useful — somewhere that is
  // not Brett's Mac.
  try { sips(['--version']); } catch {
    console.error('error: sips not found. Conversion needs sips, which ships with macOS.');
    process.exit(1);
  }

  const outDir = join(dir, '.prepared');
  mkdirSync(outDir, { recursive: true });
  console.log('');
  for (const p of planned) {
    const { sipsFormat, extension } = heroFormat(p.source);
    const staged = join(outDir, `${p.study.cardSlug}-staged.${extension}`);
    // -Z upscales, so it is only passed when the source actually exceeds the
    // cap. Verified on this machine in prepare-images.mjs; same rule here.
    const args = ['-s', 'format', sipsFormat];
    if (longEdgeOf(p.source) > LONG_EDGE) args.push('-Z', String(LONG_EDGE));
    sips([...args, p.source, '--out', staged]);
    const hash = contentHash(readFileSync(staged));
    const targetName = hashedName(p.currentName, hash, extension);
    if (p.currentName === targetName) {
      console.log(`unchanged  ${p.file} is already ${targetName}; nothing to upload or write\n`);
      continue;
    }
    const out = join(outDir, targetName);
    writeFileSync(out, readFileSync(staged));
    console.log(`converted  ${p.file} -> ${targetName}`);

    // --remote is not optional. Without it wrangler writes to a LOCAL
    // simulated bucket, exits 0, and uploads nothing at all.
    execFileSync('npx', [
      'wrangler', 'r2', 'object', 'put',
      `${BUCKET}/${p.study.cardSlug}/${targetName}`,
      `--file=${out}`, '--remote',
    ], { stdio: 'inherit' });
    console.log(`uploaded   ${BUCKET}/${p.study.cardSlug}/${targetName}`);

    // Vault last, and only when the take does not already name this file: the
    // generator throws when a take names a hero R2 does not have, so the write
    // can never lead the upload.
    const path = join(STUDIES, p.study.file);
    let md = readFileSync(path, 'utf8');
    md = md.replace(/^_hero:\s*.+?_\s*$\n/gm, '');
    for (const t of p.study.takes) md = writeHeroLine(md, t.header, targetName);
    writeFileSync(path, md);
    console.log(`bound      _hero: ${targetName}_ in ${p.study.file}`);

    // LAST, and only after the upload and the vault write have both succeeded.
    // Deleting earlier would leave a study naming a hero that no longer
    // exists, which the generator turns into a hard build failure.
    if (p.replacing && p.currentName && p.currentName !== targetName) {
      try {
        execFileSync('npx', [
          'wrangler', 'r2', 'object', 'delete',
          `${BUCKET}/${p.study.cardSlug}/${p.currentName}`, '--remote',
        ], { stdio: ['ignore', 'ignore', 'pipe'] });
        console.log(`removed    superseded ${p.currentName}`);
      } catch {
        // Not fatal: withoutStaleHeroes() in the generator filters an orphan
        // out of images[] anyway. Say so rather than failing the run.
        console.log(`WARNING    could not delete superseded ${p.currentName}; it is filtered from images[] but still in R2`);
      }
    }
    console.log('');
  }
  console.log('Now run:  npm run generate && npm run verify');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
