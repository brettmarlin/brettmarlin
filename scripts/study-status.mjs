#!/usr/bin/env node
/**
 * npm run study -- --study maf-machine-ai-endurance-coach
 *
 * ONE COMMAND THAT ANSWERS "what state is this case study in, and what do I do
 * next" — end to end, across both repos and R2.
 *
 * WHY THIS EXISTS. Publishing a study touched six commands across two repos,
 * and every one of them fails quietly in its own dialect: adopt-pastes leaves
 * embeds if it cannot resolve a file, an upload without --remote writes to a
 * local simulator and says nothing, bind-images flips only what it can see and
 * reports the rest as "waiting", generate excludes a draft without comment, and
 * a study missing from _order.md has no grid position at all. Every one of
 * those is silent, and knowing how they connect was a thing living in one
 * agent's head. Brett, 2026-08-14: "this is ridiculous." He is right.
 *
 * This checks all of it and prints ONE next command. It never guesses: every
 * line is a fact read from disk or from R2, and the R2 read is the part no
 * amount of local reasoning can substitute for.
 *
 * IT DOES NOT UPLOAD. It EMITS the upload script, with the real bucket, the
 * real filenames and the flags that are easy to forget, so the thing that runs
 * is a thing you can read first. An agent that uploads is an agent that can
 * upload the wrong file to the right name, which is unrecoverable in a way
 * nothing else here is.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VAULT_DIR } from './vault-present.mjs';

export const WORKER_BASE = 'https://marliin-recipient-worker.brett-6a3.workers.dev';

/**
 * The bucket. Hardcoded, beside the worker it is served through, because there
 * has only ever been one and the alternative cost an afternoon.
 *
 * The generated script used to take the name as an argument, and the example I
 * wrote for it used a plausible-looking bucket I had invented. Every upload
 * went to a bucket that does not exist, failed, and the script printed
 * "uploaded" anyway. A required argument that nothing in the repo could supply
 * is not configuration, it is a trap.
 */
export const R2_BUCKET = 'marliin-portfolio-images';

/**
 * THE KEY LAYOUT IS `<slug>/<file>`. There is no `images/` prefix in R2.
 *
 * Verified 2026-08-14 by fetching the same object both ways:
 *   marliin-portfolio-images/lobus-mobile-collector-app/01-collector-hero.jpg  downloads
 *   marliin-portfolio-images/images/lobus-...-app/01-collector-hero.jpg        fails
 *
 * The `images/` in the public URL is a ROUTE prefix the worker strips; it was
 * never storage. I read it off a URL in caseStudies.ts, assumed the path was
 * the key, and uploaded seven objects one level too deep — which wrangler then
 * fetched happily by their literal key while the worker looked one level up
 * and 404'd. Every confusing symptom of that afternoon came from this one
 * inference, and nothing else in either repo records the real layout.
 */
const SITE_DIR = fileURLToPath(new URL('..', import.meta.url));

const OK = '  ok  ';
const NO = ' NEED ';
const HM = ' ??   ';

export function frontmatterOf(md) {
  if (!md.startsWith('---')) return '';
  const end = md.indexOf('\n---', 3);
  return end === -1 ? '' : md.slice(4, end);
}

export function scalar(fm, key) {
  const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

/** Every filename a `_shot:` or `_media:` line names, with which it was. */
export function mediaLines(md) {
  const out = [];
  for (const line of md.split('\n')) {
    const m = /^_(media|shot):\s*([\s\S]*?)_?\s*$/.exec(line.trim());
    if (!m) continue;
    const files = (m[2].match(/[0-9A-Za-z][\w.-]*\.(?:jpe?g|png|gif|webp)/g) ?? []);
    out.push({ kind: m[1], files, text: m[2].trim() });
  }
  return out;
}

export function heroOf(md) {
  return /^_hero:\s*([^\s_]+)_?\s*$/m.exec(md)?.[1];
}

/**
 * The whole picture, as data. Pure apart from the R2 list, which is passed in
 * so this can be tested without a network.
 */
/** Filenames inside `![[...]]` embeds, in document order. */
export function embedFiles(md) {
  return [...md.matchAll(/!\[\[([^\]|]+)/g)].map((m) => m[1].trim());
}

export function assess({ md, slug, orderMd, bundle, r2Files, staged }) {
  const fm = frontmatterOf(md);
  const lines = mediaLines(md);
  const bound = lines.filter((l) => l.kind === 'media').flatMap((l) => l.files);
  const staging = lines.filter((l) => l.kind === 'shot' && /staged ·/.test(l.text)).flatMap((l) => l.files);
  const openShots = lines.filter((l) => l.kind === 'shot' && !/staged ·/.test(l.text) && l.files.length === 0);
  const hero = heroOf(md);
  const inR2 = new Set(r2Files);

  const wanted = [...new Set([...staging, ...bound, ...(hero ? [hero] : [])])];
  const missingFromR2 = wanted.filter((f) => !inR2.has(f));

  // ANYTHING THAT NEEDS UPLOADING must be on disk first, and that includes the
  // hero. This used to check only the shot-line files, because those are what
  // adopt-pastes stages — so a `_hero:` naming a file nobody had put in
  // _attachments passed the local check, went into the upload script, and
  // failed there with a path error instead of here with an explanation. A hero
  // does not come from a paste; it is placed by hand, which is exactly why it
  // is the one most likely to be missing.
  const notStagedLocally = missingFromR2.filter((f) => !staged.includes(f));

  return {
    visibility: scalar(fm, 'visibility'),
    clearance: scalar(fm, 'clearance'),
    // An Obsidian embed is NOT a problem. Adoption deliberately leaves the
    // embeds in place (renamed) so the images stay visible in Obsidian, and the
    // generator drops them. What IS a problem is an embed nobody has adopted:
    // a raw paste whose filename appears in no _shot: (staged) or _media: line.
    // This gate used to flag every embed, which meant a fully-adopted study
    // reported NEED forever and NEXT pointed back at adopt-pastes on a loop.
    unadopted: embedFiles(md).filter((f) => !staging.includes(f) && !bound.includes(f)),
    embeds: embedFiles(md).length,
    inOrder: new RegExp(slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(orderMd),
    inBundle: bundle.includes(`"${slug}"`),
    hero,
    bound,
    staging,
    openShots: openShots.length,
    missingFromR2,
    notStagedLocally,
  };
}

/** The one thing to do next, chosen in pipeline order so it is never a menu. */
export function nextStep(s, slug) {
  if (s.visibility !== 'public' && s.visibility !== 'gated') {
    return `visibility is "${s.visibility}" — set it to public in the frontmatter, or this never reaches the site`;
  }
  if (s.unadopted.length) {
    return `npm run adopt-pastes -- --study ${slug} --apply    (${s.unadopted.length} embed(s) nobody has adopted)`;
  }
  if (s.notStagedLocally.length) {
    const hero = s.hero && s.notStagedLocally.includes(s.hero) ? ` (including the hero, ${s.hero})` : '';
    return `${s.notStagedLocally.length} file(s) are named but not in _attachments/${slug}/${hero} — put them there, then re-run this`;
  }
  if (s.missingFromR2.length) {
    return `upload ${s.missingFromR2.length} file(s) to R2 — run ./upload-${slug}.sh (see above), then re-run this check`;
  }
  if (s.staging.length) {
    return `npm run bind-images -- --apply    (every named file is in R2; nothing is bound yet)`;
  }
  if (!s.inOrder) {
    return `add "${slug}" to case-studies/_order.md — public with no position means no grid slot`;
  }
  if (!s.inBundle) {
    return `npm run generate`;
  }
  if (!s.hero) {
    return `no _hero: line in the take header — the study renders without a hero and the card falls back`;
  }
  if (s.openShots) {
    return `${s.openShots} beat(s) still hold an unfilled _shot: — npm run dev shows the page, npm run build refuses it`;
  }
  return 'nothing — npm run verify';
}

function uploadScript(slug, files) {
  const put = (f) => {
    const ext = f.split('.').pop().toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return [
      `echo "  -> ${f}"`,
      `if ! npx wrangler r2 object put "$BUCKET/$SLUG/${f}" --file="$DIR/${f}" --content-type="${type}" --remote; then`,
      `  echo "FAILED on ${f} — stopping. Nothing above this line is guaranteed either."`,
      '  exit 1',
      'fi',
    ].join('\n');
  };

  return [
    '#!/usr/bin/env bash',
    '# GENERATED by npm run study. Read it before you run it.',
    '#',
    '# --remote is not optional: without it wrangler writes to a LOCAL simulator',
    '# and reports success. This script VERIFIES afterwards for the same reason —',
    '# an earlier version printed "uploaded" having uploaded nothing, which is',
    '# worse than failing.',
    'set -uo pipefail',
    '',
    '# Wrangler asks an interactive question on first run in a repo it thinks has',
    '# AI agents in it, and a prompt inside a script is a hang, not a question.',
    'export CI=1',
    '',
    '# No scope check. `wrangler whoami` lists no r2 scope on this token and the',
    '# uploads work anyway, so that list does not describe R2 access and any',
    '# check built on it would only ever be a false alarm.',
    '',
    `BUCKET="\${1:-${R2_BUCKET}}"`,
    '',
    'if [ "${SHOW_ENV:-0}" = "1" ]; then',
    '  echo "Checking wrangler first:"',
    '  npx wrangler --version || { echo "wrangler is not runnable here."; exit 1; }',
    '  echo',
    '  echo "Logged in as:"',
    '  npx wrangler whoami || echo "  (not logged in — run: npx wrangler login)"',
    '  echo',
    '  if npx wrangler whoami 2>/dev/null | grep -qi "^- r2"; then',
    '    echo "R2 permission: yes"',
    '  else',
    '    echo "R2 permission: NO — this is why uploads do nothing. Re-authorise:"',
    '    echo "  npx wrangler login --scopes account:read user:read workers:write r2:write"',
    '  fi',
    '  echo',
    '  echo "Your buckets:"',
    '  npx wrangler r2 bucket list',
    '  echo',
    '  exit 0',
    'fi',
    `SLUG="${slug}"`,
    `DIR="$HOME/Dev/marliin-vault/_attachments/${slug}"`,
    '',
    'if [ ! -d "$DIR" ]; then echo "No staged files at $DIR"; exit 1; fi',
    '',
    '# Check every file is here BEFORE uploading any of it. A half-done upload',
    '# is the worst outcome: R2 holds some of a beat and the page renders a gap.',
    'MISSING=0',
    ...files.map((f) => `if [ ! -f "$DIR/${f}" ]; then echo "MISSING: ${f}"; MISSING=1; fi`),
    'if [ "$MISSING" = "1" ]; then',
    '  echo',
    '  echo "Put the missing file(s) in $DIR and run this again. Nothing uploaded."',
    '  exit 1',
    'fi',
    'echo "Uploading ' + String(files.length) + ' file(s) to $BUCKET/$SLUG/"',
    'echo "  (no images/ prefix — that is a worker route, not a storage path)"',
    'echo "  (override the bucket by passing one: ./upload-' + slug + '.sh other-bucket)"',
    'echo',
    ...files.map(put),
    '',
    'echo',
    `echo "Uploads reported complete. Verify with:  npm run study -- --study ${slug}"`,
    '',
    '# NO VERIFICATION HERE ANY MORE, deliberately.',
    '#',
    '# This used to count `wrangler r2 object list --prefix ...`, and it counted',
    '# zero while all seven objects had just uploaded successfully to the right',
    '# bucket. So the script announced NOT DONE on a job that was done — the same',
    '# lie as the version before it, pointing the other way, and the third false',
    '# alarm in a row that sent Brett after a problem he did not have.',
    '#',
    '# The check belongs in `npm run study`, which asks the WORKER. That endpoint',
    '# is what bind-images reads, so it is the only answer that predicts whether',
    '# the next step will work. Two verifiers disagreeing is worse than one.',
    '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args[args.indexOf('--study') + 1];
  if (!slug || slug.startsWith('--')) {
    // A REAL SLUG, not <slug>. Angle brackets are redirects in zsh, so a
    // usage line copied verbatim is a parse error before it is a command —
    // which is exactly how Brett met this script.
    console.error('usage: npm run study -- --study maf-machine-ai-endurance-coach');
    process.exit(2);
  }

  const notePath = join(VAULT_DIR, 'case-studies', `${slug}.md`);
  if (!existsSync(notePath)) {
    console.error(`no such study: ${notePath}`);
    process.exit(1);
  }
  const md = readFileSync(notePath, 'utf8');
  const orderMd = readFileSync(join(VAULT_DIR, 'case-studies', '_order.md'), 'utf8');
  const bundle = readFileSync(join(SITE_DIR, 'src/data/caseStudies.ts'), 'utf8');
  const stagingDir = join(VAULT_DIR, '_attachments', slug);
  const staged = existsSync(stagingDir) ? readdirSync(stagingDir) : [];

  let r2Files = [];
  let r2Reachable = true;
  try {
    const res = await fetch(`${WORKER_BASE}/api/images/${encodeURIComponent(slug)}`);
    const data = res.ok ? await res.json() : { images: [] };
    r2Files = (data.images ?? []).map((i) => decodeURIComponent(i.src.split('/').pop()));
  } catch {
    r2Reachable = false;
  }

  const s = assess({ md, slug, orderMd, bundle, r2Files, staged });
  const mark = (good) => (good ? OK : NO);

  console.log(`\n  ${slug}\n`);
  console.log(`${mark(s.visibility === 'public' || s.visibility === 'gated')} visibility: ${s.visibility}`);
  console.log(`${mark(s.clearance === 'public')} clearance: ${s.clearance}`);
  console.log(`${mark(s.unadopted.length === 0)} embeds adopted: ${s.embeds - s.unadopted.length} of ${s.embeds}${s.unadopted.length ? ` — ${s.unadopted.join(', ')}` : ''}`);
  console.log(`${mark(s.staging.length === 0 || s.notStagedLocally.length === 0)} staged on disk: ${staged.length} file(s) in _attachments/${slug}/`);
  if (!r2Reachable) {
    console.log(`${HM} R2: unreachable from here — the checks below cannot be trusted`);
  } else {
    console.log(`${mark(s.missingFromR2.length === 0)} in R2: ${r2Files.length} file(s)${s.missingFromR2.length ? `, ${s.missingFromR2.length} named but absent` : ''}`);
  }
  console.log(`${mark(s.staging.length === 0)} bound: ${s.bound.length} _media:, ${s.staging.length} still _shot: (staged)`);
  console.log(`${mark(Boolean(s.hero))} hero: ${s.hero ?? 'none declared'}`);
  console.log(`${mark(s.inOrder)} in _order.md: ${s.inOrder}`);
  console.log(`${mark(s.inBundle)} in caseStudies.ts: ${s.inBundle}`);
  console.log(`${mark(s.openShots === 0)} unfilled _shot: beats: ${s.openShots}${s.openShots ? '  (npm run build will refuse)' : ''}`);

  if (s.missingFromR2.length) {
    const path = join(SITE_DIR, `upload-${slug}.sh`);
    writeFileSync(path, uploadScript(slug, s.missingFromR2), { mode: 0o755 });
    console.log(`\n  WROTE a script to ${path.replace(SITE_DIR, '')} (a file, not printed here). It uploads:`);
    for (const f of s.missingFromR2) console.log(`    ${f}`);
    console.log(`\n  run it — the bucket (${R2_BUCKET}) is already in it:`);
    console.log(`      ./upload-${slug}.sh`);
  }

  console.log(`\n  NEXT: ${nextStep(s, slug)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
