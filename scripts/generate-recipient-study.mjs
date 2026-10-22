#!/usr/bin/env node
/**
 * Builds the CaseStudy-shaped object for a recipient-only case study, ready to
 * paste as the `study` value of a pick in recipients/<slug>.payload.json.
 *
 * The object is derived from a vault take scoped `site_visibility:
 * recipient-only` plus the study's current R2 image list. The
 * recipient-specific `framing` stays bespoke and is NOT generated here; that
 * is curation.
 *
 * WHICH take is the point. A study can carry several framings and a recipient
 * gets the one written for them — a fractional client evaluating depth wants a
 * different telling than someone who needs the pattern. `--take` names it, and
 * the angle is validated against the vault's take-formats.json so a typo fails
 * here rather than shipping a payload built from a take nobody meant.
 *
 * The angle lands in the payload as `take`, as provenance only. It is never
 * rendered, never in a URL, and never branches what the recipient sees. They
 * see a case study, not a version of one.
 *
 * Usage:  node scripts/generate-recipient-study.mjs <site-slug> [--take <angle>] [--images-from <r2-slug>]
 *   VAULT_DIR overrides the vault location (default ~/Dev/marliin-vault)
 *
 *   --images-from: which R2 prefix holds this study's images, when the
 *   take's own slug diverges from where the pictures live. The Convoy
 *   recipient-named take is the standing case: its Card says `slug: convoy`
 *   (its own gated identity) while the images sit under the public study's
 *   prefix, agentic-decision-layer-defense. Explicit, never guessed —
 *   the same slug-identity hazard MAR-27 tracks.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseTake, buildStudy, parseBeats, slugifyBeatId, draftMediaForBeat } from './vault-reader.mjs';
import { resolveBeatMedia, resolveExplicitHero, dimensionsFor } from './generate-case-studies.mjs';
import { edgeColorsFor } from './hero-edge-color.mjs';

const VAULT_DIR = process.env.VAULT_DIR ?? join(homedir(), 'Dev', 'marliin-vault');
const CASE_DIR = join(VAULT_DIR, 'case-studies');
const WORKER_BASE = 'https://marliin-recipient-worker.brett-6a3.workers.dev';

const wanted = process.argv[2];
if (!wanted || wanted.startsWith('--')) {
  console.error('usage: node scripts/generate-recipient-study.mjs <site-slug> [--take <angle>]');
  process.exit(1);
}

const formats = JSON.parse(readFileSync(join(VAULT_DIR, 'take-formats.json'), 'utf8')).formats;
const takeArg = process.argv.indexOf('--take');
const TAKE = takeArg === -1 ? 'recipient-named' : process.argv[takeArg + 1];
if (!TAKE || !formats[TAKE]) {
  console.error(`unknown take "${TAKE ?? ''}". Known formats: ${Object.keys(formats).join(', ')}`);
  console.error('Add it to the vault take-formats.json deliberately, or fix the angle.');
  process.exit(1);
}
if (formats[TAKE].prose_take === false) {
  console.error(`"${TAKE}" is not a prose take (${formats[TAKE].label}), so it has no study object to build.`);
  process.exit(1);
}

let found = null;
for (const file of readdirSync(CASE_DIR).filter((f) => f.endsWith('.md')).sort()) {
  const md = readFileSync(join(CASE_DIR, file), 'utf8');
  const take = parseTake(md, TAKE, 'recipient-only');
  if (!take) continue;
  const { study } = buildStudy(take.sections, file);
  if (study.slug === wanted) {
    found = { study, file, sections: take.sections, heroName: take.hero };
    break;
  }
}

if (!found) {
  console.error(`no "${TAKE}" take scoped recipient-only with site slug "${wanted}" found in ${CASE_DIR}.`);
  console.error(`A take reaches this script only with "clearance: gated · site_visibility: recipient-only" in its header.`);
  process.exit(1);
}

const imagesArg = process.argv.indexOf('--images-from');
const imagesSlug = imagesArg === -1 ? wanted : process.argv[imagesArg + 1];
const res = await fetch(`${WORKER_BASE}/api/images/${encodeURIComponent(imagesSlug)}`);
const data = res.ok ? await res.json() : { images: [] };
found.study.images = (data.images ?? []).map((i) => i.src);
if (found.study.images.length === 0) {
  console.error(`warn: R2 has no images for "${imagesSlug}"; images is empty. Upload per working/portfolio-worker/README.md,`);
  console.error(`or pass --images-from <r2-slug> if this take's images live under a different prefix.`);
}

// Beats, the same machinery the public pipeline runs — parse, assign ids,
// bind media names against R2, true dimensions — but on the gated side of
// the clearance firewall: collectBeatsByTake refuses recipient-only takes
// BY DESIGN, so this is the one place a gated take's beats become payload.
// Without this the payload carried only the flat summary and a recipient
// saw a thin page while the public grid told the full story (2026-08-17).
if (found.sections['Beats']) {
  const parsed = parseBeats(found.sections['Beats'], found.file);
  if (parsed.errors.length > 0) {
    console.error(parsed.errors.join('\n'));
    process.exit(1);
  }
  for (const w of parsed.warnings) console.error(`warn: ${w}`);
  const seenIds = new Map();
  const beats = parsed.beats.map((b) => {
    let id = slugifyBeatId(b.heading) || 'beat';
    const n = (seenIds.get(id) ?? 0) + 1;
    seenIds.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    return {
      id,
      heading: b.heading,
      body: b.body,
      media: draftMediaForBeat(b.seq),
      ...(b.layout ? { layout: b.layout } : {}),
      ...(b.ratio ? { ratio: b.ratio } : {}),
      ...(b.removed?.length ? { removed: b.removed } : {})
    };
  });
  const { unbound, warnings } = resolveBeatMedia(found.study.slug, beats, found.study.images);
  for (const w of warnings) console.error(`warn: ${w}`);
  // The hero line's name is claimed by the hero, not a beat — same
  // exclusion the public generator applies.
  const unclaimed = unbound.filter((n) => n !== found.heroName);
  if (unclaimed.length > 0) console.error(`warn: unbound media, not in R2: ${unclaimed.join(', ')}`);

  // The committed dimensions cache, read only: this is an authoring-time
  // script and must not churn a file the public generator owns. A miss
  // fetches header bytes live instead.
  const dimensionsPath = new URL('../src/data/image-dimensions.json', import.meta.url).pathname;
  const dimensionsCache = existsSync(dimensionsPath) ? JSON.parse(readFileSync(dimensionsPath, 'utf8')) : {};
  for (const beat of beats) {
    for (const m of beat.media) {
      const target = m.kind === 'image' ? m : m.kind === 'video' ? m.poster : null;
      if (!target) continue;
      if (target.width && target.height) continue;
      const { width, height } = await dimensionsFor(target.src, { cache: dimensionsCache });
      target.width = width;
      target.height = height;
    }
  }

  found.study.beats = { [TAKE]: beats };
  found.study.primaryTake = TAKE;
  console.error(`beats: ${beats.length} from the take, media bound against R2.`);
} else {
  console.error(`note: take "${TAKE}" has no ### Beats section; the study renders as the flat summary.`);
}

// The take's own hero, same treatment the public detail page gives one:
// resolved against R2, true dimensions, and the sampled edge-color backdrop
// — both caches read-only here, misses fetched live, for the same
// no-churn reason as dimensions above.
if (found.heroName) {
  try {
    found.study.hero = resolveExplicitHero(found.study.slug, found.heroName, found.study.title, found.study.images);
    const dimensionsPath = new URL('../src/data/image-dimensions.json', import.meta.url).pathname;
    const dimensionsCache = existsSync(dimensionsPath) ? JSON.parse(readFileSync(dimensionsPath, 'utf8')) : {};
    const { width, height } = await dimensionsFor(found.study.hero.src, { cache: dimensionsCache });
    found.study.hero.width = width;
    found.study.hero.height = height;
    const edgePath = new URL('../src/data/hero-edge-colors.json', import.meta.url).pathname;
    const edgeCache = existsSync(edgePath) ? JSON.parse(readFileSync(edgePath, 'utf8')) : {};
    const { colors } = await edgeColorsFor(found.study.hero.src, { cache: edgeCache });
    if (colors) found.study.hero.edgeColors = colors;
    console.error(`hero: ${found.heroName} resolved, ${width}x${height}.`);
  } catch (err) {
    console.error(`warn: hero not resolved (${err.message}); the page renders without one.`);
    delete found.study.hero;
  }
}

console.error(`derived from ${found.file}, take "${TAKE}".`);
console.error(`Paste as the "study" value of this recipient's pick, and set "take": "${TAKE}" beside it.`);
console.log(JSON.stringify({ take: TAKE, study: found.study }, null, 2));
