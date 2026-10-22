/**
 * Upload every staged image that R2 does not already hold.
 *
 * Replaces the per-study shell script `npm run study` used to generate. That
 * script was gitignored, run by hand, and left no record of what it had done —
 * so "is it uploaded?" was answerable only by asking the worker afterwards, and
 * a run that half-failed looked exactly like a run that had not happened.
 *
 * This is the same logic as a program, so CI can run it on push. It is
 * deliberately safe to run repeatedly: it asks R2 what it has first, and
 * uploads only the difference. Running it twice uploads nothing the second
 * time.
 *
 *   node scripts/upload-missing.mjs                       every public study
 *   node scripts/upload-missing.mjs --study <slug>        one study
 *   node scripts/upload-missing.mjs --dry-run             say, do not do
 *
 * Credentials: wrangler picks up CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
 * from the environment, or an interactive login locally. The token needs
 * exactly one permission — Object Read & Write on marliin-portfolio-images.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VAULT_DIR } from './vault-present.mjs';
import { mediaLines, heroOf, frontmatterOf, scalar, WORKER_BASE, R2_BUCKET } from './study-status.mjs';

const CONTENT_TYPE = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** Every file the study names, whether staged or already bound. */
export function wantedFiles(md) {
  const lines = mediaLines(md);
  const named = lines.flatMap((l) => l.files);
  const hero = heroOf(md);
  return [...new Set(hero ? [...named, hero] : named)];
}

/** What R2 holds for a slug, via the worker — the only thing that can answer. */
export async function r2Contents(slug, base = WORKER_BASE) {
  const res = await fetch(`${base}/api/images/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`worker said ${res.status} for ${slug}`);
  const data = await res.json();
  return (data.images ?? []).map((i) => decodeURIComponent(i.src.split('/').pop()));
}

/**
 * Split what a study names into what must be uploaded and what cannot be.
 * A named file that is in neither R2 nor _attachments is an ERROR, not a
 * no-op: it means the note is lying about a file, and the old shell script
 * would have failed on it halfway through with a path error.
 */
export function plan({ wanted, inR2, staged }) {
  const missing = wanted.filter((f) => !inR2.includes(f));
  return {
    upload: missing.filter((f) => staged.includes(f)),
    absent: missing.filter((f) => !staged.includes(f)),
  };
}

/**
 * The prefix a study's images ACTUALLY live under in R2.
 *
 * Not necessarily the slug. The 2026-08-15 audit found three tools keying this
 * three different ways — bind-images by frontmatter slug, this script by vault
 * filename, the generator by the published take's Card slug — and the Card
 * slug diverges on seven studies. `convoy-defense-agentic-governance` stores
 * its images under `agentic-decision-layer-defense`; the worker returns 0
 * images for the first and 9 for the second.
 *
 * The committed bundle is the only one of the three that describes what the
 * SITE reads, because its URLs are what the browser fetches. So that is the
 * authority here, and where it disagrees with the slug this REFUSES rather
 * than picking. Uploading to a guessed prefix writes objects nothing reads,
 * into a bucket nothing can list — the one irreversible step in the pipeline,
 * done wrong, silently.
 *
 * MAR-27 makes the prefix canonical and this function goes away with it.
 */
export function r2Prefix(slug, bundle) {
  const at = bundle.indexOf(`slug: "${slug}"`);
  if (at === -1) return { prefix: slug, source: 'slug (not in the bundle yet)' };
  const next = bundle.indexOf('slug: "', at + 8);
  const segment = bundle.slice(at, next === -1 ? undefined : next);
  const found = [...segment.matchAll(/\/images\/([^/]+)\//g)].map((m) => m[1]);
  const distinct = [...new Set(found)];
  if (distinct.length === 0) return { prefix: slug, source: 'slug (no images in the bundle yet)' };
  if (distinct.length > 1) {
    return { prefix: null, source: `the bundle uses ${distinct.length} prefixes for this study: ${distinct.join(', ')}` };
  }
  if (distinct[0] !== slug) {
    return { prefix: null, source: `the bundle serves this study from "${distinct[0]}" but the slug is "${slug}"` };
  }
  return { prefix: slug, source: 'slug, confirmed by the bundle' };
}

function studySlugs() {
  const dir = join(VAULT_DIR, 'case-studies');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const one = args.includes('--study') ? args[args.indexOf('--study') + 1] : undefined;
  const slugs = one ? [one] : studySlugs();
  const bundle = readFileSync(fileURLToPath(new URL('../src/data/caseStudies.ts', import.meta.url)), 'utf8');

  let uploaded = 0;
  const problems = [];

  for (const slug of slugs) {
    const notePath = join(VAULT_DIR, 'case-studies', `${slug}.md`);
    if (!existsSync(notePath)) {
      console.error(`no such study: ${slug}`);
      process.exit(1);
    }
    const md = readFileSync(notePath, 'utf8');

    // Draft studies are not on the site and their images are nobody's
    // business yet. Uploading them would put unpublished work in a public
    // bucket, which is a clearance problem, not a tidiness one.
    const visibility = scalar(frontmatterOf(md), 'visibility');
    if (!one && visibility !== 'public' && visibility !== 'gated') continue;

    const wanted = wantedFiles(md);
    if (wanted.length === 0) continue;

    const { prefix, source } = r2Prefix(slug, bundle);
    if (prefix === null) {
      problems.push(`${slug}: REFUSING to upload — ${source}. Uploading to a guess writes objects the site never reads. See MAR-27.`);
      continue;
    }

    const stagingDir = join(VAULT_DIR, '_attachments', slug);
    const staged = existsSync(stagingDir) ? readdirSync(stagingDir) : [];

    let inR2;
    try {
      inR2 = await r2Contents(prefix);
    } catch (error) {
      problems.push(`${slug}: could not ask the worker what R2 holds — ${error.message}`);
      continue;
    }

    const { upload, absent } = plan({ wanted, inR2, staged });
    for (const file of absent) {
      problems.push(`${slug}: names ${file}, which is in neither R2 nor _attachments/${slug}/`);
    }
    if (upload.length === 0) {
      if (absent.length === 0) console.log(`  ok   ${slug} — ${wanted.length} file(s), all in R2`);
      continue;
    }

    console.log(`\n  ${slug} — uploading ${upload.length} of ${wanted.length}`);
    for (const file of upload) {
      const ext = file.split('.').pop().toLowerCase();
      const key = `${R2_BUCKET}/${prefix}/${file}`;
      if (dryRun) {
        console.log(`    would put ${key}`);
        continue;
      }
      try {
        // --remote is not optional. Without it wrangler writes to a LOCAL
        // simulator and exits 0, which is how an earlier version of this
        // reported seven successful uploads into a bucket that stayed empty.
        execFileSync(
          'npx',
          ['wrangler', 'r2', 'object', 'put', key,
            `--file=${join(stagingDir, file)}`,
            `--content-type=${CONTENT_TYPE[ext] ?? 'application/octet-stream'}`,
            '--remote'],
          { stdio: 'inherit', env: { ...process.env, CI: '1' } }
        );
        uploaded += 1;
      } catch {
        problems.push(`${slug}: wrangler failed on ${file}`);
      }
    }

    // ASK, DO NOT ASSUME. wrangler exiting 0 has meant "wrote to a local
    // simulator" before. The worker is the only witness that counts, and
    // checking here is what makes this script's output trustworthy.
    if (!dryRun) {
      const after = await r2Contents(prefix);
      for (const file of upload.filter((f) => !after.includes(f))) {
        problems.push(`${slug}: wrangler exited 0 for ${file} but the worker does not see it`);
      }
    }
  }

  if (problems.length) {
    console.error('\n  PROBLEMS\n');
    for (const p of problems) console.error(`    ${p}`);
  }
  console.log(`\n  ${uploaded} uploaded, ${problems.length} problem(s)\n`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
