/**
 * Offline harness for proving a generator change is additive.
 *
 * `npm run generate` lists each slug's images from the Worker, so it cannot run
 * without network — which means the one check that matters for a generator
 * change (does the emitted bundle still say exactly what it said before?)
 * cannot run either. This serves that ONE call from the committed bundle and
 * nothing else. Dimensions are not stubbed: they come from the committed cache,
 * and a cache hit fetches nothing. Any other network call throws rather than
 * silently returning something plausible.
 *
 * Usage:
 *   node --import ./scripts/offline-image-list.mjs scripts/generate-case-studies.mjs
 *   diff <(git show HEAD:src/data/caseStudies.ts) src/data/caseStudies.ts
 *
 * A generator change that claims to be additive must produce an empty diff.
 * Run it a SECOND time against a copy of the vault carrying a synthetic extra
 * take: branches that only execute on multi-take studies are invisible to the
 * first run, and that is where the real bugs have been.
 *
 * Override the baseline with OFFLINE_BASELINE=<git-rev>.
 */
import { execSync } from 'node:child_process';

const rev = process.env.OFFLINE_BASELINE ?? 'HEAD';
const committed = execSync(`git show ${rev}:src/data/caseStudies.ts`, { maxBuffer: 1 << 26 }).toString();

const bySlug = new Map();
for (const m of committed.matchAll(/"(https:\/\/[^"]*\/images\/([a-z0-9-]+)\/[^"]+)"/g)) {
  const [, src, slug] = m;
  if (!bySlug.has(slug)) bySlug.set(slug, new Set());
  bySlug.get(slug).add(src);
}
console.error(`[offline] image lists for ${bySlug.size} slugs, baseline ${rev}`);

globalThis.fetch = async (url) => {
  const u = String(url);
  const m = u.match(/\/api\/images\/([^/?#]+)$/);
  if (!m) throw new Error(`[offline] unexpected network call: ${u}`);
  const images = [...(bySlug.get(decodeURIComponent(m[1])) ?? [])].sort().map((src) => ({ src }));
  return new Response(JSON.stringify({ images }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
