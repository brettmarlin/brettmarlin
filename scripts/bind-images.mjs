#!/usr/bin/env node
/**
 * npm run bind-images [-- --apply] [--study <card-slug>]
 *
 * Flips vault `_shot:_` lines to `_media:_` lines wherever the files a shot
 * names now exist in R2. The naming contract that makes this safe: archive
 * images upload to R2 under the exact filename the shot line already records.
 * No renaming, no mapping; the filename is an identifier, alt text does the
 * describing.
 *
 * Rules:
 * - Only `_shot:_` lines inside a `### Beats` section are considered.
 * - Worksheet-row references are never touched; they name a spreadsheet row,
 *   not a file. They are listed for Brett's manual pass.
 * - A shot naming several files splits: the subset now in R2 becomes a
 *   `_media:_` line, the rest stay behind as a `_shot:_` line. Source order
 *   is preserved.
 * - An unmatched shot line is never deleted. It is still a work order.
 * - Idempotent: flipped lines are gone, so a second run is a no-op.
 * - Dry-run by default; `--apply` writes. After applying, run
 *   `npm run generate` yourself so the two diffs stay separately reviewable.
 *
 * It only reads R2 (via the Worker's public image list). It writes only vault
 * case-study markdown, and only with --apply.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolveVaultDir } from './vault-dir.mjs';
/**
 * The study's R2 prefix, from its published Card slug.
 *
 * This used to come from `parseTake(md, 'decisions-outcomes', 'public-grid')`,
 * which is the site's reader and answers a different question: "is there a
 * publishable take here". Two things fell out of that, and both were silent.
 *
 * A study whose primary take is not literally named `decisions-outcomes` was
 * skipped — MAF Machine's is `full-case`, so bind-images never looked at it at
 * all, and reported success while ignoring the one study Brett was trying to
 * publish. And `site_visibility: public-grid` is the PRE-MIGRATION vocabulary,
 * deleted from the schema on 2026-08-12; every study migrated off it becomes
 * invisible here too.
 *
 * Binding rewrites `_shot:` lines to `_media:` lines in the markdown. The R2
 * folder is the Card slug because that is also the public URL slug used by the
 * generator. The vault/frontmatter slug can be different; Marliin Factory is
 * the standing case (`marliin-factory-ai-design-system-pipeline.md` publishes
 * and stores images under `marliin-factory`). Using the vault slug here makes
 * successfully uploaded images look permanently missing.
 */
function slugOf(md, file) {
  const cardSlug = /^- slug:\s*(\S+)\s*$/m.exec(md)?.[1] ?? null;
  if (!cardSlug) throw new Error(`${file} has beats but no Card slug, so its R2 folder cannot be resolved`);
  return cardSlug;
}

const WORKER_BASE = 'https://marliin-recipient-worker.brett-6a3.workers.dev';
const FILE_RE = /[0-9A-Za-z][\w.-]*\.(?:jpg|jpeg|png|gif|webp)/g;

export function shotNamedFiles(subject) {
  return (subject.match(FILE_RE) ?? []).filter((f) => !f.endsWith('.md'));
}

/**
 * Rewrites one study's markdown against the set of filenames present in R2.
 * Pure: returns { text, flipped, waiting, worksheet, claimed } and touches
 * nothing on disk.
 */
export function rebindMarkdown(md, r2Files) {
  const r2 = new Set(r2Files);
  const out = [];
  const flipped = [];
  const waiting = [];
  const worksheet = [];
  const claimed = new Set();
  let inBeats = false;
  for (const line of md.split('\n')) {
    if (/^### Beats\s*$/.test(line)) inBeats = true;
    else if (/^(### |## )/.test(line)) inBeats = false;

    const meta = inBeats ? /^_shot:\s*(.*)_\s*$/.exec(line) : null;
    if (!meta) {
      // Track existing _media:_ claims so the unclaimed report is honest.
      const media = inBeats ? /^_media:\s*(.*)_\s*$/.exec(line) : null;
      if (media) for (const f of shotNamedFiles(media[1])) claimed.add(f);
      out.push(line);
      continue;
    }

    const value = meta[1].trim();
    if (value === 'none') {
      out.push(line);
      continue;
    }
    if (/worksheet row/i.test(value) || value.includes('⚠')) {
      worksheet.push(value);
      out.push(line);
      continue;
    }

    // Split subject from the trailing status parenthetical, as the generator
    // parser does: the LAST parenthetical group is the status.
    const m = /^([\s\S]*)\(([^()]*)\)\s*$/.exec(value);
    const subject = (m ? m[1] : value).trim();
    const status = m ? m[2].trim() : '';

    // READ THE WHOLE LINE, not just the subject.
    //
    // This used to look for filenames in the subject only, because the shot
    // lines it was written against put them there:
    //   _shot: 01-aol-thing.jpg — the object model (need · screenshot)_
    // adopt-pastes writes the other dialect, with the files in the record:
    //   _shot: A method that reads as failure (staged · 01-maf-a.png, 02-maf-b.png)_
    // and every real shot line in the vault is now that shape — the only
    // subject-style lines left are `_shot: none_`. So binding silently found
    // zero filenames on all nine of MAF Machine's beats, reported them as
    // "waiting on uploads", and exited 0 with the files sitting in R2.
    //
    // An extension is unambiguous. Read the whole value and stop caring which
    // tool wrote the line.
    const named = shotNamedFiles(value);
    if (named.length === 0) {
      waiting.push(value);
      out.push(line);
      continue;
    }

    const present = named.filter((f) => r2.has(f));
    const missing = named.filter((f) => !r2.has(f));
    if (present.length === 0) {
      waiting.push(value);
      out.push(line);
      continue;
    }

    for (const f of present) claimed.add(f);
    flipped.push(...present);
    out.push(`_media: ${present.join(', ')}_`);
    if (missing.length > 0) {
      // The leftover keeps the dialect it arrived in. Rewriting a staged
      // record into the subject-style shape would hand the next adopt-pastes
      // run a line it does not recognise as its own.
      if (/^staged\b/.test(status)) {
        out.push(`_shot: ${subject} (staged · ${missing.join(', ')})_`);
      } else {
        const dashIdx = subject.indexOf(' — ');
        const note = dashIdx >= 0 ? subject.slice(dashIdx + 3).trim() : '';
        out.push(`_shot: ${missing.join(', ')}${note ? ` — ${note}` : ''}${status ? ` (${status})` : ''}_`);
      }
    }
  }
  return { text: out.join('\n'), flipped, waiting, worksheet, claimed };
}

/**
 * Runs the rebind across every beat study in a vault directory. r2BySlug maps
 * slug -> array of filenames; injectable so tests never touch the network.
 */
export function applyToVault({ vaultDir, r2BySlug, apply = false, studySlug = null }) {
  const caseDir = join(vaultDir, 'case-studies');
  const report = [];
  for (const file of readdirSync(caseDir).filter((f) => f.endsWith('.md')).sort()) {
    const path = join(caseDir, file);
    const md = readFileSync(path, 'utf8');
    if (!/^### Beats\s*$/m.test(md)) continue;
    const slug = slugOf(md, file);
    if (studySlug && slug !== studySlug) continue;
    const r2Files = r2BySlug[slug] ?? [];
    const result = rebindMarkdown(md, r2Files);
    const changed = result.text !== md;
    if (changed && apply) writeFileSync(path, result.text);
    report.push({
      file,
      slug,
      changed,
      flipped: result.flipped,
      waiting: result.waiting,
      worksheet: result.worksheet,
      unclaimed: r2Files.filter((f) => !result.claimed.has(f)),
    });
  }
  return report;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const studyAt = process.argv.indexOf('--study');
  const studySlug = studyAt === -1 ? null : process.argv[studyAt + 1];
  if (studyAt !== -1 && (!studySlug || studySlug.startsWith('--'))) {
    throw new Error('usage: npm run bind-images -- --apply --study <card-slug>');
  }
  const vaultDir = resolveVaultDir();

  // Discover slugs first so only beat studies get an R2 fetch.
  const r2BySlug = {};
  const caseDir = join(vaultDir, 'case-studies');
  for (const file of readdirSync(caseDir).filter((f) => f.endsWith('.md')).sort()) {
    const md = readFileSync(join(caseDir, file), 'utf8');
    if (!/^### Beats\s*$/m.test(md)) continue;
    const slug = slugOf(md, file);
    if (studySlug && slug !== studySlug) continue;
    const res = await fetch(`${WORKER_BASE}/api/images/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error(`worker said ${res.status} for ${slug}; refusing to treat an outage as an empty folder`);
    const data = await res.json();
    r2BySlug[slug] = (data.images ?? []).map((i) => decodeURIComponent(i.src.split('/').pop()));
  }

  const report = applyToVault({ vaultDir, r2BySlug, apply, studySlug });
  if (studySlug && report.length === 0) {
    throw new Error(`no beat study publishes the Card slug "${studySlug}"`);
  }

  console.log(apply ? '--- bind-images: APPLY ---' : '--- bind-images: dry run (pass --apply to write) ---');
  let flippedTotal = 0;
  for (const r of report) {
    const parts = [];
    if (r.flipped.length) parts.push(`flips ${r.flipped.length}`);
    if (r.waiting.length) parts.push(`waiting ${r.waiting.length}`);
    if (r.worksheet.length) parts.push(`worksheet ${r.worksheet.length}`);
    if (r.unclaimed.length) parts.push(`unclaimed-in-R2 ${r.unclaimed.length}`);
    console.log(`${r.slug}: ${parts.join(', ') || 'nothing to do'}`);
    for (const f of r.flipped) console.log(`  flip -> _media: ${f}_`);
    for (const f of r.unclaimed) console.log(`  unclaimed R2 file: ${f}`);
    flippedTotal += r.flipped.length;
  }
  const worksheetTotal = report.reduce((n, r) => n + r.worksheet.length, 0);
  const waitingTotal = report.reduce((n, r) => n + r.waiting.length, 0);
  console.log(`total: ${flippedTotal} flipped, ${waitingTotal} still waiting on uploads, ${worksheetTotal} worksheet references needing Brett`);
  if (apply && flippedTotal > 0) {
    console.log('\nApplied. Now run: npm run generate   (review that diff separately, then commit both)');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
