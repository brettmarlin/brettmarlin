#!/usr/bin/env node
/**
 * npm run prepare-images -- --study <slug> --from <archive-dir> --out <dir> [--apply]
 *
 * Prepares legacy-archive images for upload: matches Squarespace-named source
 * files against the exact target filenames the study's `_shot:_` lines already
 * record, converts to JPEG with the long edge capped at 2000px (never
 * upscaled), and writes them under the target names.
 *
 * Scope: prepares files on disk. Nothing else. It does not upload, does not
 * touch R2, does not edit the vault, and does not run the generator. This is
 * the bulk path for archive images whose target names the vault already
 * records; Brett's hand-curated one-at-a-time path does not come through here.
 *
 * Matching is exact after normalization, never fuzzy. The prefix number is
 * never derived here: it is read from the vault's shot lines, because the
 * numbering encodes an order the vault already recorded and a guessed number
 * binds an image to the wrong beat.
 *
 * Conversion uses sips, built into macOS (no new dependency; verified present
 * at startup). Empirically verified on this machine: sips flattens PNG alpha
 * onto WHITE when converting to JPEG, and sips -Z DOES upscale, so -Z is only
 * passed when the source's long edge exceeds the cap.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseTake, buildStudy, collectBeatsByTake } from './vault-reader.mjs';
import { shotNamedFiles } from './bind-images.mjs';
import { resolveVaultDir } from './vault-dir.mjs';

export const LONG_EDGE = 2000;
const SOURCE_EXT_RE = /\.(png|jpe?g|gif|webp|tiff?)$/i;

// Squarespace CDN URLs often have NO file extension, and the capture saved
// them verbatim (Mixpanel+Success+Metrics, seeit-onboarding-flow-options).
// An extensionless file counts as a source when its first bytes are an image
// signature; sniffing bytes is identification, not guessing.
export function isImageSource(dir, name) {
  if (SOURCE_EXT_RE.test(name)) return true;
  if (/\.[a-z0-9]{1,5}$/i.test(name)) return false; // some other extension
  try {
    const fd = readFileSync(join(dir, name));
    return (
      (fd[0] === 0x89 && fd[1] === 0x50 && fd[2] === 0x4e && fd[3] === 0x47) ||
      (fd[0] === 0xff && fd[1] === 0xd8) ||
      (fd[0] === 0x47 && fd[1] === 0x49 && fd[2] === 0x46) ||
      (fd[0] === 0x52 && fd[1] === 0x49 && fd[2] === 0x46 && fd[3] === 0x46)
    );
  } catch {
    return false;
  }
}

// The Squarespace-name rule, round two (D28, then D34): percent-decode first
// (archive names carry encoded characters like %282%29 for "(2)", and the
// vault records the DECODED collapse: ...-2), then lowercase and collapse any
// non-alphanumeric run to one hyphen. That is a superset of the original
// `+` and `.` rule that also covers `_` (HM_SIgnal, IMG_9844,
// _retention_week_...), parens, and whatever Squarespace produces next; runs
// still collapse and leading/trailing hyphens still trim.
export function slugifyStem(stem) {
  let s = stem;
  try {
    s = decodeURIComponent(s);
  } catch {
    // a literal % that is not an escape sequence; use the raw name
  }
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// A target like `05-lobus-screen-shot-….jpg` matches a source stem two ways:
// with the `NN-<token>-` prefix stripped (sources named without the study
// token, the common case) or with only the `NN-` number stripped (sources
// that already carry the token, like aol's `aol-objectModel.png`). Exact
// equality against either candidate; anything ambiguous is reported, not
// guessed.
export function targetStemCandidates(target) {
  const stem = target.replace(/\.[a-z0-9]+$/i, '');
  const candidates = new Set();
  const noNumber = stem.replace(/^\d+-/, '');
  candidates.add(noNumber);
  candidates.add(noNumber.replace(/^[a-z0-9]+-/, ''));
  return [...candidates];
}

export function isWorksheetShot(subject) {
  return /worksheet row/i.test(subject) || subject.includes('⚠');
}

/** Target filenames from a study's shots, source order, deduped, worksheet
 * references excluded (they name a spreadsheet row, not a file). */
export function targetsFromShots(shots) {
  const targets = [];
  const worksheet = [];
  for (const s of shots) {
    if (isWorksheetShot(s.subject)) {
      worksheet.push(s.subject);
      continue;
    }
    for (const f of shotNamedFiles(s.subject)) {
      if (!targets.includes(f)) targets.push(f);
    }
  }
  return { targets, worksheet };
}

/** Exact matching after normalization. Returns matched pairs plus both
 * leftover groups and anything ambiguous. */
export function matchSources(sourceFiles, targets) {
  const byStem = new Map();
  for (const t of targets) {
    for (const c of targetStemCandidates(t)) {
      if (!byStem.has(c)) byStem.set(c, []);
      byStem.get(c).push(t);
    }
  }
  // Two passes so a collision is matched to NOTHING: when two different
  // sources normalize onto the same target, both are ambiguous and the target
  // stays unmatched, never silently resolved to whichever came first.
  const hitsBySource = new Map();
  const sourcesByTarget = new Map();
  for (const src of sourceFiles) {
    const stem = slugifyStem(src.replace(SOURCE_EXT_RE, ''));
    const hits = [...new Set(byStem.get(stem) ?? [])];
    hitsBySource.set(src, hits);
    for (const t of hits) {
      if (!sourcesByTarget.has(t)) sourcesByTarget.set(t, []);
      sourcesByTarget.get(t).push(src);
    }
  }
  const matched = [];
  const ambiguous = [];
  const unmatchedSources = [];
  const claimed = new Set();
  for (const src of sourceFiles) {
    const hits = hitsBySource.get(src);
    if (hits.length === 0) unmatchedSources.push(src);
    else if (hits.length > 1 || sourcesByTarget.get(hits[0]).length > 1) ambiguous.push({ source: src, targets: hits });
    else {
      claimed.add(hits[0]);
      matched.push({ source: src, target: hits[0] });
    }
  }
  return { matched, ambiguous, unmatchedSources, unmatchedTargets: targets.filter((t) => !claimed.has(t)) };
}

/** sips invocation, pure for tests: -Z only when the long edge exceeds the
 * cap, because sips -Z upscales smaller images. */
export function sipsArgs(width, height, src, dest) {
  const args = ['-s', 'format', 'jpeg'];
  if (Math.max(width, height) > LONG_EDGE) args.push('-Z', String(LONG_EDGE));
  args.push(src, '--out', dest);
  return args;
}

export function readDimensions(path) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], { encoding: 'utf8' });
  const width = Number(/pixelWidth: (\d+)/.exec(out)?.[1]);
  const height = Number(/pixelHeight: (\d+)/.exec(out)?.[1]);
  if (!width || !height) throw new Error(`cannot read dimensions of ${path}`);
  return { width, height };
}

export function convertWithSips(src, dest) {
  const { width, height } = readDimensions(src);
  execFileSync('sips', sipsArgs(width, height, src, dest), { stdio: 'pipe' });
}

/**
 * The whole preparation for one study. Pure-ish: reads the vault and the
 * archive dir, writes only into outDir and only when apply is true. The
 * convert function is injectable for tests.
 */
const SOURCE_MAP_PATH = fileURLToPath(new URL('./archive-source-map.json', import.meta.url));

export function prepareStudy({ vaultDir, slug, fromDir, outDir, apply = false, convert = convertWithSips, sourceMap }) {
  const caseDir = join(vaultDir, 'case-studies');
  let found = null;
  for (const file of readdirSync(caseDir).filter((f) => f.endsWith('.md')).sort()) {
    const md = readFileSync(join(caseDir, file), 'utf8');
    const take = parseTake(md, 'decisions-outcomes', 'public-grid');
    if (!take) continue;
    const { study } = buildStudy(take.sections, file);
    if (study.slug === slug) {
      found = { md, file };
      break;
    }
  }
  if (!found) throw new Error(`no public-grid study with slug "${slug}" in ${caseDir}`);

  const { shots } = collectBeatsByTake(found.md, found.file);
  const { targets, worksheet } = targetsFromShots(shots);
  const sources = readdirSync(fromDir).filter((f) => isImageSource(fromDir, f)).sort();

  // Explicit evidence-recovered pairs first (archive-source-map.json): sources
  // named image-asset.* carry no identity, so their targets were reconstructed
  // from the capture's page order and declared dimensions. Map entries bypass
  // stem matching; everything else falls through to it.
  const map = sourceMap ?? (existsSync(SOURCE_MAP_PATH) ? JSON.parse(readFileSync(SOURCE_MAP_PATH, 'utf8'))[slug] ?? {} : {});
  const mapped = [];
  const mappedSources = new Set();
  const mappedTargets = new Set();
  for (const [target, source] of Object.entries(map)) {
    if (!targets.includes(target) || !sources.includes(source)) continue;
    mapped.push({ source, target });
    mappedSources.add(source);
    mappedTargets.add(target);
  }
  const { matched: stemMatched, ambiguous, unmatchedSources, unmatchedTargets } = matchSources(
    sources.filter((s) => !mappedSources.has(s)),
    targets.filter((t) => !mappedTargets.has(t))
  );
  const matched = [...mapped, ...stemMatched];

  const converted = [];
  const skippedExisting = [];
  if (apply) mkdirSync(outDir, { recursive: true });
  for (const { source, target } of matched) {
    const dest = join(outDir, target);
    if (existsSync(dest)) {
      skippedExisting.push(target);
      continue;
    }
    if (apply) convert(join(fromDir, source), dest);
    converted.push({ source, target });
  }
  return { converted, skippedExisting, ambiguous, unmatchedSources, unmatchedTargets, worksheet };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const slug = opt('study');
  const fromDir = opt('from');
  const outDir = opt('out');
  const apply = args.includes('--apply');
  if (!slug || !fromDir || !outDir) {
    console.error('usage: npm run prepare-images -- --study <slug> --from <archive-dir> --out <dir> [--apply]');
    process.exit(1);
  }
  try {
    execFileSync('which', ['sips'], { stdio: 'pipe' });
  } catch {
    console.error('error: sips not found. This script relies on macOS sips for conversion; install nothing, run it on a Mac.');
    process.exit(1);
  }

  const vaultDir = resolveVaultDir();
  const report = prepareStudy({ vaultDir, slug, fromDir, outDir, apply });

  console.log(apply ? '--- prepare-images: APPLY ---' : '--- prepare-images: dry run (pass --apply to write) ---');
  console.log(`\nmatched${apply ? ' and converted' : ' (would convert)'} (${report.converted.length}):`);
  for (const { source, target } of report.converted) console.log(`  ${source} -> ${target}`);
  if (report.skippedExisting.length) {
    console.log(`\nalready in --out, skipped, never overwritten (${report.skippedExisting.length}):`);
    for (const t of report.skippedExisting) console.log(`  ${t}`);
  }
  if (report.ambiguous.length) {
    console.log(`\nAMBIGUOUS, not converted, resolve by hand (${report.ambiguous.length}):`);
    for (const a of report.ambiguous) console.log(`  ${a.source} -> ${a.targets.join(' | ')}`);
  }
  console.log(`\nsources with no target, archive has them, no beat wants them (${report.unmatchedSources.length}):`);
  for (const s of report.unmatchedSources) console.log(`  ${s}`);
  console.log(`\n*** TARGETS WITH NO SOURCE: a beat asks for these and nobody has them (${report.unmatchedTargets.length}) ***`);
  for (const t of report.unmatchedTargets) console.log(`  ${t}`);
  console.log(`\nworksheet references skipped, Brett's manual pass (${report.worksheet.length})`);

  if (report.converted.length > 0) {
    console.log('\nNext, run these yourself, one step at a time:');
    console.log(`  npx wrangler r2 object put marliin-portfolio-images/${slug}/<file> --file=${outDir}/<file> --remote`);
    console.log('  npm run bind-images');
    console.log('NOTE the --remote flag: without it wrangler writes to a local simulated bucket, succeeds silently, and uploads nothing.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
