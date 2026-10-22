#!/usr/bin/env node
/**
 * Generates src/data/caseStudies.ts from the vault's case-studies/*.md.
 *
 * Single source of truth: the vault. Each case study that appears on the
 * public grid carries a take at one of the PUBLIC_TAKE_ANGLES below, declaring
 * `_clearance: public · site_visibility: public-grid_` and the site field
 * contract documented in the vault's metadata-standard.md. This script reads
 * those takes (and nothing else in the file: never the Source context, never
 * the primary take), pulls each study's current image list from R2 via the
 * Worker, and emits the TypeScript module the site builds against.
 *
 * All markdown parsing and every clearance rule live in vault-reader.mjs;
 * this script is the site-assembly half: R2 binding, image dimensions, hero
 * resolution (explicit `_hero:_` line, or the full-bleed lift fallback), and
 * emitting caseStudies.ts.
 *
 * It only reads the vault. It never writes to it.
 *
 * Usage:  node scripts/generate-case-studies.mjs [--check]
 *   VAULT_DIR   overrides the vault location (default ~/Dev/marliin-vault)
 *   --check     exits 1 if the output would differ from the committed file
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  buildStudy,
  collectBeatsByTake,
  frontmatter,
  parseTake,
  pickPrimaryTake,
  primaryTakeMarker,
  publicGridTakeAngles,
  scalarField,
} from './vault-reader.mjs';
import { edgeColorsFor } from './hero-edge-color.mjs';

const VAULT_DIR = process.env.VAULT_DIR ?? join(homedir(), 'Dev', 'marliin-vault');
const CASE_DIR = join(VAULT_DIR, 'case-studies');
const WORKER_BASE = 'https://marliin-recipient-worker.brett-6a3.workers.dev';
const OUT_PATH = new URL('../src/data/caseStudies.ts', import.meta.url).pathname;
const DIMENSIONS_PATH = new URL('../src/data/image-dimensions.json', import.meta.url).pathname;
const EDGE_COLORS_PATH = new URL('../src/data/hero-edge-colors.json', import.meta.url).pathname;
const CHECK = process.argv.includes('--check');
const YOUTUBE_POSTER_SENTINEL = 'youtube';

// WHICH TAKES THE SITE CAN RENDER, derived from the vault, not restated here.
//
// `take-formats.json` declares `publishable` per format. This file used to
// carry its own list of the same thing, and on 2026-08-12 they disagreed:
// `full-case` had been publishable in the registry since v1.2.0 and was absent
// here, so MAF Machine's take passed every check, declared itself cleared for
// the grid, and was read by nothing. A hand-maintained copy of a fact that
// already has a home is a bug waiting for its moment.
//
// The registry decides WHICH. It cannot decide ORDER, and order still matters
// as the tiebreak for which take fills the flat fields when `published_take`
// is absent — which is an error, but "should never happen" is not "cannot".
// So precedence stays an explicit decision here, and a mismatch between the
// two FAILS rather than silently appending: adding a publishable format is a
// judgement about where it ranks, and the build should make you make it.
//
// This list is about what the site can RENDER. It is not a permission. Since
// 2026-08-12 permission is `visibility:` in frontmatter and nothing else.
// The vault's take-formats.json is the authority; scripts/take-formats.json
// is a committed copy so the tests and CI run without the vault present.
function loadTakeFormats() {
  const vaultCopy = join(VAULT_DIR, 'take-formats.json');
  const path = existsSync(vaultCopy) ? vaultCopy : new URL('./take-formats.json', import.meta.url).pathname;
  return JSON.parse(readFileSync(path, 'utf8')).formats;
}
const TAKE_FORMATS = loadTakeFormats();
const PUBLISHABLE = Object.entries(TAKE_FORMATS).filter(([, f]) => f.publishable).map(([id]) => id);
const TAKE_PRECEDENCE = ['short', 'decisions-outcomes', 'full-case', 'public-abstracted'];

function orderedPublishableTakes(publishable, precedence) {
  const missing = publishable.filter((id) => !precedence.includes(id));
  const stale = precedence.filter((id) => !publishable.includes(id));
  if (missing.length || stale.length) {
    const lines = [];
    if (missing.length) lines.push(`publishable in take-formats.json but unranked here: ${missing.join(', ')}`);
    if (stale.length) lines.push(`ranked here but not publishable in take-formats.json: ${stale.join(', ')}`);
    throw new Error(
      `TAKE_PRECEDENCE disagrees with take-formats.json.\n  ${lines.join('\n  ')}\n` +
      `Rank it deliberately in scripts/generate-case-studies.mjs, or change publishable in the vault.`
    );
  }
  return precedence;
}
// The frontmatter `discipline` list, as ids. Absent is legitimate on a study
// whose Card already says everything, so this returns [] rather than throwing.
function disciplineOf(md) {
  const block = /^discipline:\n((?:[ \t]+-[ \t]+.+\n)+)/m.exec(frontmatter(md));
  if (!block) return [];
  return block[1].split('\n').map((l) => l.replace(/^[ \t]*-[ \t]*/, '').trim()).filter(Boolean);
}

export const PUBLIC_TAKE_ANGLES = orderedPublishableTakes(PUBLISHABLE, TAKE_PRECEDENCE);

// Reader-facing names for the toggle. An angle with no entry renders its raw
// id, deliberately: the same rule taxonomy.generated.ts uses for unknown tags,
// because a derived label hides the gap instead of showing it.
// How a study's beat images sit in their boxes. Default is `box`: one ratio
// for every box, image covers it anchored top-left, cropped at the right and
// bottom. `true-ratio` opts a whole study out, for the ones whose material is
// portrait — a phone capture in a 4:3 box keeps 16% of itself, which is not a
// crop, it is a decapitation. Per study rather than per image because the
// material is consistent within a study: Comcast is phone screens throughout,
// Lobus is slides throughout.
// What a study IS, and when it happened. Both live in frontmatter on all 25
// studies and, until 2026-08-09, neither reached the bundle: the generator
// never read them and the emitted type had no field for either. The plan
// recorded Phase 0 as landed because the VAULT was landed — nothing carried
// them across, so the site could not tell an experiment from a case study or
// say what year anything happened.
//
// Absent is an error, not a default, for the same reason `published_take` is.
// Guessing `case-study` would quietly relabel an experiment as shipped client
// work, which is a claim about Brett rather than a rendering detail.
export const STUDY_KINDS = ['case-study', 'experiment'];

export function readKind(fm, file) {
  const kind = scalarField(fm, 'kind');
  if (!kind) {
    throw new Error(
      `${file}: frontmatter is missing "kind". One of: ${STUDY_KINDS.join(', ')}. ` +
      `It drives how the study is presented, and defaulting it would silently ` +
      `present an experiment as shipped client work.`
    );
  }
  if (!STUDY_KINDS.includes(kind)) {
    throw new Error(`${file}: kind is "${kind}". Allowed: ${STUDY_KINDS.join(', ')}.`);
  }
  return kind;
}

// A four-digit year, and a span that runs forwards. `period` stays human prose
// and is deliberately NOT parsed — 25 studies carry at least six incompatible
// shapes of it, which is why these numeric fields exist at all.
export function readYears(fm, file) {
  const read = (key) => {
    const raw = scalarField(fm, key);
    if (!raw) throw new Error(`${file}: frontmatter is missing "${key}" (a four-digit year).`);
    if (!/^\d{4}$/.test(String(raw).trim())) {
      throw new Error(`${file}: ${key} is "${raw}". It must be a bare four-digit year; "period" is where prose goes.`);
    }
    return Number(String(raw).trim());
  };
  const yearStart = read('year_start');
  const yearEnd = read('year_end');
  if (yearEnd < yearStart) {
    throw new Error(`${file}: year_end (${yearEnd}) is before year_start (${yearStart}).`);
  }
  return { yearStart, yearEnd };
}

export const MEDIA_FITS = ['box', 'true-ratio'];

// The study-wide default arrangement, for beats that do not name one. Kept in
// step with BEAT_LAYOUTS in src/lib/beatLayout.mjs and the literal in
// vault-reader.mjs — three copies on purpose, since the vault parser must not
// import the site.
export const BEAT_LAYOUT_VALUES = [
  'image-below', 'image-top', 'image-left', 'image-right', 'side', 'full-bleed',
];
const DEFAULT_MEDIA_FIT = 'true-ratio';

export const TAKE_LABELS = {
  'short': 'Short',
  'decisions-outcomes': 'Decisions and outcomes',
  'full-case': 'Full case',
  'public-abstracted': 'The pattern',
  'star': 'STAR',
  'beats': 'Beats',
};

// Placeholder fallback, used only while a study's R2 folder is empty. These are
// the same generic gallery images the hand-maintained file used. Once real
// images are uploaded to R2 for a slug, the R2 list wins automatically.
const PLACEHOLDER_FALLBACK = {
  'marliin-factory': ['/529602ad-fee8-454f-b735-b3f5aebdee50.jpg', '/c55537d5-f1b6-4d01-9d88-3591130d0e47.jpg', '/b804d50f-ad96-4cbc-bb5f-e19b55395ed9.jpg'],
  'marlo': ['/b804d50f-ad96-4cbc-bb5f-e19b55395ed9.jpg', '/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg'],
  'aloud': ['/0d6adf1f-a3d3-4ab0-8c86-ee13ec5d6acc.jpg', '/b804d50f-ad96-4cbc-bb5f-e19b55395ed9.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg'],
  'altana': ['/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg', '/c55537d5-f1b6-4d01-9d88-3591130d0e47.jpg'],
  'carta': ['/c55537d5-f1b6-4d01-9d88-3591130d0e47.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg', '/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg'],
  'comcast-seeit-mobile-strategy': ['/529602ad-fee8-454f-b735-b3f5aebdee50.jpg', '/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg', '/c55537d5-f1b6-4d01-9d88-3591130d0e47.jpg'],
  'aol-demand-content-platform': ['/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg', '/b804d50f-ad96-4cbc-bb5f-e19b55395ed9.jpg'],
  'youscience-results-platform-redesign': ['/c55537d5-f1b6-4d01-9d88-3591130d0e47.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg', '/0d6adf1f-a3d3-4ab0-8c86-ee13ec5d6acc.jpg'],
  'youscience-marketing-launch-campaign': ['/b804d50f-ad96-4cbc-bb5f-e19b55395ed9.jpg', '/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg'],
  'telmate-cross-device-ux-unification': ['/529602ad-fee8-454f-b735-b3f5aebdee50.jpg', '/c55537d5-f1b6-4d01-9d88-3591130d0e47.jpg', '/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg'],
  'expo-fundraising-prototype-sprint': ['/0d6adf1f-a3d3-4ab0-8c86-ee13ec5d6acc.jpg', '/b804d50f-ad96-4cbc-bb5f-e19b55395ed9.jpg', '/c55537d5-f1b6-4d01-9d88-3591130d0e47.jpg'],
  'lobus-verified-object-capture': ['/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg', '/b804d50f-ad96-4cbc-bb5f-e19b55395ed9.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg'],
  'sayari-design-org-turnaround': ['/c55537d5-f1b6-4d01-9d88-3591130d0e47.jpg', '/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg', '/529602ad-fee8-454f-b735-b3f5aebdee50.jpg'],
  'blend-design-system-and-research-ops': ['/529602ad-fee8-454f-b735-b3f5aebdee50.jpg', '/0d6adf1f-a3d3-4ab0-8c86-ee13ec5d6acc.jpg', '/af044235-8dd6-4e07-b591-48c1bd0b307f.jpg'],
};

// Resolves each beat's `_media:_` filenames onto { src, alt } objects using
// full URLs from the study's R2 list, in place. A filename with no R2 match
// throws: a typo must fail the build, not 404 silently in production. R2 files
// no beat names are returned as `unbound` — not errors, reported in the run
// summary.
//
// Alt text derives from the BEAT, not the filename: the filename describes the
// picture, the beat describes what the picture is evidence for. A future vault
// syntax may supply an explicit per-image alt override; when it does, it wins
// here — nothing below depends on alt always being the heading.
export function resolveBeatMedia(slug, beats, imageUrls) {
  const byName = new Map(imageUrls.map((u) => [decodeURIComponent(u.split('/').pop()), u]));
  const bound = new Set();
  const warnings = [];
  for (const beat of beats) {
    if (!beat.media || beat.media.length === 0) continue;
    // Alt numbering counts pictures the visitor sees: images and video
    // posters share one sequence. A placeholder is not a picture and has no
    // alt to disambiguate against.
    const pictureCount = beat.media.filter((m) => m.kind === 'file' || m.kind === 'image' || m.kind === 'video').length;
    let pictureIndex = 0;
    const altFor = (fallbackNoun) => {
      let alt = pictureCount > 1 ? `${beat.heading}, ${pictureIndex} of ${pictureCount}` : beat.heading;
      if (!alt.trim()) {
        alt = `${fallbackNoun} ${pictureIndex} of ${pictureCount}`;
        warnings.push(`${slug}: beat "${beat.heading}" would emit an empty alt; using "${alt}"`);
      }
      return alt;
    };
    const resolveName = (name) => {
      const url = byName.get(name);
      if (!url) throw new Error(`${slug}: beat "${beat.heading}" names media "${name}" which is not in R2`);
      bound.add(name);
      return url;
    };
    beat.media = beat.media.map((m) => {
      if (m.kind === 'file') {
        pictureIndex += 1;
        return { kind: 'image', src: resolveName(m.name), alt: altFor('Image') };
      }
      if (m.kind === 'video') {
        pictureIndex += 1;
        const poster = m.posterName === YOUTUBE_POSTER_SENTINEL
          ? {
              src: `https://i.ytimg.com/vi/${m.videoId}/sddefault.jpg`,
              alt: altFor('Video poster'),
              width: 640,
              height: 480,
            }
          : { src: resolveName(m.posterName), alt: altFor('Video poster') };
        return { kind: 'video', videoId: m.videoId, ...(m.start ? { start: m.start } : {}), poster };
      }
      return m;
    });
  }
  return { unbound: [...byName.keys()].filter((n) => !bound.has(n)), warnings };
}

// Resolves the take header's explicit `_hero: filename_` onto the study's R2
// list. Same contract as beat media: a name with no R2 match throws, so a typo
// (or an empty R2 folder) fails the build rather than 404ing in production.
// Alt text defaults to the take's title from the Card block.
/**
 * Drops SUPERSEDED hero revisions from a study's image list.
 *
 * Heroes are content-hashed — `00-hero.<hash>.jpg` — because the Worker serves
 * images `immutable` for a year, so a changed image must get a changed name.
 * The cost of that, which was not thought through when it was introduced on
 * 2026-08-09: the old object stays in R2, and `images[]` is built from the R2
 * LISTING. So the orphan is not unreferenced at all. It reappears as content —
 * in the card thumbnail, and on a study with no beats it renders in the image
 * strip beside its own replacement. Altana showed two heroes and a "scroll for
 * 2 visuals" label the day this landed.
 *
 * `bind-heroes.mjs` now deletes the superseded object when it replaces one.
 * This is the second line of defence, for revisions uploaded before that
 * existed and for any that a failed delete leaves behind: a file sharing the
 * hero's base name but carrying a different hash is a previous take of the
 * hero, and is never content.
 */
export function withoutStaleHeroes(imageUrls, heroName) {
  if (!heroName) return imageUrls;
  const base = heroName.replace(/\.(jpe?g|png|webp|gif|tiff?)$/i, '').replace(/\.[0-9a-f]{8}$/i, '');
  const stale = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.[0-9a-f]{8})\\.(jpe?g|png|webp|gif|tiff?)$`, 'i');
  return imageUrls.filter((url) => {
    const name = decodeURIComponent(url.split('/').pop() ?? '');
    return name === heroName || !stale.test(name);
  });
}

export function resolveExplicitHero(slug, heroName, title, imageUrls) {
  const url = imageUrls.find((u) => decodeURIComponent(u.split('/').pop()) === heroName);
  if (!url) throw new Error(`${slug}: take header names hero "${heroName}" which is not in R2`);
  return { kind: 'image', src: url, alt: title };
}

// Reads true pixel dimensions from image header bytes: PNG IHDR and JPEG SOF.
// Hand-rolled rather than adding image-size as a dependency; the two formats
// in R2 need ~40 lines and zero supply chain. Returns null when the buffer
// holds neither, so the caller can fail the build with the filename.
export function parseImageDimensions(buf) {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 3 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (i + 9 > buf.length) return null;
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Dimension lookup with a committed JSON cache so builds are deterministic and
// --check needs no network in CI. Cache hit: no fetch at all. Cache miss:
// ranged fetch of the first 64KB (enough for JPEG SOF and PNG IHDR), parse,
// record in the cache object (the caller persists it). Unreadable dimensions
// throw: a silent ratio guess is the failure mode this exists to remove.
export async function dimensionsFor(url, { cache, fetcher = fetch }) {
  const key = decodeURIComponent(new URL(url).pathname).replace(/^\/images\//, '');
  if (cache[key]) return { ...cache[key], fromCache: true };
  const res = await fetcher(url, { headers: { Range: 'bytes=0-65535' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching header bytes of ${url}`);
  const dims = parseImageDimensions(Buffer.from(await res.arrayBuffer()));
  if (!dims || !dims.width || !dims.height) throw new Error(`cannot read dimensions of ${key}`);
  cache[key] = dims;
  return { ...dims, fromCache: false };
}

// Which take the site publishes, read from the study's `published_take:`
// frontmatter field.
//
// This used to be derived — beats take, else a ` · primary` marker, else first
// angle in PUBLIC_TAKE_ANGLES — and derivation was the wrong shape for the
// decision. Which framing of a piece of work goes out in public is a judgement
// Brett makes, not a fallback chain, and a derived answer MOVES when a take is
// added: authoring a second take would silently republish the study under a
// different framing. Stating it costs one line and cannot drift.
//
// Absent is an error, never a default. A study whose frontmatter does not say
// which take is published has not had the decision made yet, and guessing is
// exactly the failure this replaces.
export function pickPublishedTake(parsedAngles, declared, file) {
  if (parsedAngles.length === 0) return null;
  if (!declared) {
    throw new Error(
      `${file}: frontmatter is missing "published_take". ` +
      `Add it and name one of: ${parsedAngles.join(', ')}. ` +
      `Which take the site publishes is a decision, not a default.`
    );
  }
  if (!parsedAngles.includes(declared)) {
    throw new Error(
      `${file}: published_take is "${declared}" but that take is not readable here. ` +
      `Readable takes: ${parsedAngles.join(', ') || 'none'}. ` +
      `A take must carry "clearance: public · site_visibility: public-grid" and an angle ` +
      `in PUBLIC_TAKE_ANGLES to be publishable.`
    );
  }
  return declared;
}

async function imagesFor(slug) {
  try {
    const res = await fetch(`${WORKER_BASE}/api/images/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.images) && data.images.length > 0) {
      return { images: data.images.map((i) => i.src), source: 'r2' };
    }
    return { images: PLACEHOLDER_FALLBACK[slug] ?? [], source: 'placeholder' };
  } catch (err) {
    console.warn(`warn: image list fetch failed for ${slug} (${err.message}); using placeholder fallback`);
    return { images: PLACEHOLDER_FALLBACK[slug] ?? [], source: 'fallback-after-error' };
  }
}

function emit(studies) {
  const J = (v) => JSON.stringify(v);
  const entry = (s) => {
    const lines = [
      `  {`,
      `    slug: ${J(s.slug)},`,
      `    title: ${J(s.title)},`,
      `    outcome: ${J(s.outcome)},`,
      `    kind: ${J(s.kind)},`,
      `    yearStart: ${s.yearStart},`,
      `    yearEnd: ${s.yearEnd},`,
      `    images: [${s.images.map(J).join(', ')}],`,
      `    tags: [${s.tags.map(J).join(', ')}],`,
      `    context: ${J(s.context)},`,
      `    problem: ${J(s.problem)},`,
      `    role: ${J(s.role)},`,
      `    built: [`,
      ...s.built.map((b) => `      ${J(b)},`),
      `    ],`,
      `    result: ${J(s.result)},`,
    ];
    if (s.underNda) lines.push(`    underNda: true,`);
    if (s.storyThroughLine) lines.push(`    storyThroughLine: ${J(s.storyThroughLine)},`);
    if (s.beats) {
      lines.push(`    beats: {`);
      for (const [angle, beats] of Object.entries(s.beats)) {
        lines.push(`      ${J(angle)}: [`);
        for (const b of beats) {
          const media = b.media.map((m) => {
            if (m.kind === 'image') return `{ kind: "image", src: ${J(m.src)}, alt: ${J(m.alt)}, width: ${m.width}, height: ${m.height} }`;
            if (m.kind === 'video') {
              const start = m.start ? `, start: ${m.start}` : '';
              return `{ kind: "video", videoId: ${J(m.videoId)}${start}, poster: { src: ${J(m.poster.src)}, alt: ${J(m.poster.alt)}, width: ${m.poster.width}, height: ${m.poster.height} } }`;
            }
            return `{ kind: "placeholder", label: ${J(m.label)}, ratio: ${m.ratio} }`;
          }).join(', ');
          const fields = [`id: ${J(b.id)}`, `heading: ${J(b.heading)}`, `body: ${J(b.body)}`, `media: [${media}]`];
          if (b.layout) fields.push(`layout: ${J(b.layout)}`);
          if (b.ratio) fields.push(`ratio: ${b.ratio}`);
          // Images taken off this beat but kept named, so the panel can offer
          // them back. They are not rendered; they are a record.
          if (b.removed?.length) fields.push(`removed: [${b.removed.map(J).join(', ')}]`);
          lines.push(`        { ${fields.join(', ')} },`);
        }
        lines.push(`      ],`);
      }
      lines.push(`    },`);
    }
    if (s.primaryTake) lines.push(`    primaryTake: ${J(s.primaryTake)},`);
    if (s.mediaFit) lines.push(`    mediaFit: ${J(s.mediaFit)},`);
    if (s.mediaLayout) lines.push(`    mediaLayout: ${J(s.mediaLayout)},`);
    if (s.hero) lines.push(`    hero: { kind: "image", src: ${J(s.hero.src)}, alt: ${J(s.hero.alt)}, width: ${s.hero.width}, height: ${s.hero.height}${s.hero.edgeColors ? `, edgeColors: { left: ${J(s.hero.edgeColors.left)}, right: ${J(s.hero.edgeColors.right)} }` : ''} },`);
    lines.push(`  }`);
    return lines.join('\n');
  };
  return `// GENERATED from the vault's case-studies/*.md by scripts/generate-case-studies.mjs.
// DO NOT EDIT BY HAND. Edit the case study's decisions-outcomes take in the
// vault and regenerate with: npm run generate
// Content comes only from takes declaring "clearance: public" and
// "site_visibility: public-grid". Gated content never enters this file.

export type BeatMedia =
  // edgeColors is the hero backdrop: one hex per side edge, sampled at
  // generate time (scripts/hero-edge-color.mjs) — two, because a gradient
  // hero's edges disagree. Only heroes carry it; absent means the detail
  // page falls back to bg-inverse.
  | { kind: 'image'; src: string; alt: string; width: number; height: number; edgeColors?: { left: string; right: string } }
  | { kind: 'video'; videoId: string; start?: number; poster: { src: string; alt: string; width: number; height: number } }
  | { kind: 'placeholder'; label: string; ratio: number };

export type Beat = {
  id: string;
  heading: string;
  body: string;
  media: BeatMedia[];
  // Kept in step with BEAT_LAYOUTS in src/lib/beatLayout.mjs and the literal
  // in vault-reader.mjs. Three copies, deliberately: the vault parser must not
  // import the site, and this one is emitted into generated TypeScript.
  layout?: 'image-below' | 'image-top' | 'image-left' | 'image-right' | 'side' | 'full-bleed';
  /** This beat's own image-box ratio, overriding the study's. */
  ratio?: number;
  /** Images taken off this beat and kept named, so the choice is reversible. */
  removed?: string[];
};

export type CaseStudy = {
  slug: string;
  title: string;
  outcome: string;
  kind: 'case-study' | 'experiment';
  yearStart: number;
  yearEnd: number;
  images: string[];
  tags: string[];
  context: string;
  problem: string;
  role: string;
  built: string[];
  result: string;
  underNda?: boolean;
  storyThroughLine?: string;
  substackUrl?: string;
  loomUrl?: string;
  loomTitle?: string;
  beats?: Record<string, Beat[]>;
  primaryTake?: string;
  mediaFit?: 'true-ratio';
  mediaLayout?: 'image-below' | 'image-top' | 'image-left' | 'image-right' | 'side' | 'full-bleed';
  hero?: BeatMedia;
};

export const caseStudies: CaseStudy[] = [
${studies.map(entry).join(',\n')}
];

export function getCaseStudy(slug: string): CaseStudy | undefined {
  return caseStudies.find((c) => c.slug === slug);
}

export function getTagSlug(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getCaseStudyTags(): string[] {
  return [...new Set(caseStudies.flatMap((caseStudy) => caseStudy.tags))].sort((firstTag, secondTag) => firstTag.localeCompare(secondTag));
}

export function getTagFromSlug(tagSlug: string): string | undefined {
  return getCaseStudyTags().find((tag) => getTagSlug(tag) === tagSlug);
}

export function getCaseStudiesByTag(tag: string): CaseStudy[] {
  return caseStudies.filter((caseStudy) => caseStudy.tags.includes(tag));
}
`;
}

// FALLBACK hero: lifts a full-bleed first beat's leading image out of the
// beat sequence into a page-level hero, for studies whose take header carries
// no explicit `_hero:_` line. When the take names its hero explicitly this
// does nothing: `_layout: full-bleed_` then means only what it says (this
// beat's media renders full width) and never lifts anything out of the beat.
// A hero rendered after the summary blocks is not a hero, it is a large
// picture in the middle of the page; the component renders this field
// directly below the title. Only a real image is lifted: a placeholder hero
// would put pending-workflow text in the page's lead position, so a
// placeholder-only full-bleed first beat yields no hero (reported, not
// failed). If the lift empties the beat's media, the beat renders prose-only
// and its full-bleed marker is dropped from the emitted data.
export function extractHero(study) {
  if (study.hero) return { lifted: false };
  if (!study.beats || !study.primaryTake) return { lifted: false };
  const beats = study.beats[study.primaryTake];
  const first = beats?.[0];
  if (!first || first.layout !== 'full-bleed') return { lifted: false };
  const lead = first.media[0];
  if (!lead || lead.kind !== 'image') {
    return { lifted: false, note: `first beat "${first.heading}" is full-bleed but its lead media is ${lead ? `a ${lead.kind}` : 'absent'}; no hero emitted` };
  }
  study.hero = lead;
  first.media = first.media.slice(1);
  if (first.media.length === 0) delete first.layout;
  return { lifted: true };
}

// The run summary is Brett's production-planning surface: which studies carry
// beats, which R2 images no beat has claimed, and the full shot queue grouped
// by study and sub-grouped by status (an `archived` shot needs standardizing
// and upload; a `need` shot must be produced — the distinction is the budget).
function printRunSummary(results, unboundBySlug) {
  const withBeats = results.filter((r) => r.study.beats);
  const flat = results.filter((r) => !r.study.beats);
  console.log('--- run summary ---');
  console.log(`studies with beats (${withBeats.length}): ${withBeats.map((r) => `${r.study.slug} (${Object.values(r.study.beats).flat().length})`).join(', ') || 'none'}`);
  console.log(`studies still flat (${flat.length}): ${flat.map((r) => r.study.slug).join(', ') || 'none'}`);
  if (unboundBySlug.size > 0) {
    console.log('R2 images not bound to any beat:');
    for (const [slug, names] of unboundBySlug) {
      console.log(`  ${slug} (${names.length}):`);
      for (const n of names) console.log(`    ${n}`);
    }
  } else {
    console.log('R2 images not bound to any beat: none');
  }
  const openShots = results.filter((r) => r.shots && r.shots.length > 0);
  if (openShots.length === 0) {
    console.log('open shot queue: empty');
  } else {
    const total = openShots.reduce((n, r) => n + r.shots.length, 0);
    console.log(`open shot queue (${total} shots):`);
    for (const r of openShots) {
      console.log(`  ${r.study.slug}:`);
      const byStatus = new Map();
      for (const s of r.shots) {
        const key = s.status || '(no status)';
        if (!byStatus.has(key)) byStatus.set(key, []);
        byStatus.get(key).push(s);
      }
      for (const [status, shots] of byStatus) {
        console.log(`    ${status} (${shots.length}):`);
        for (const s of shots) console.log(`      [${s.beat}] ${s.subject || '(no subject)'}`);
      }
    }
  }
  console.log('-------------------');
}

async function main() {
  const results = [];
  for (const file of readdirSync(CASE_DIR).filter((f) => f.endsWith('.md')).sort()) {
    const md = readFileSync(join(CASE_DIR, file), 'utf8');
    let take;
    // Every public-grid take the site knows how to read, not just the first.
    // `takes` below carries them all so the detail page can offer a toggle;
    // `take` stays the primary and still fills the flat study fields, so a
    // single-take study emits byte-for-byte what it always did.
    const parsedTakes = new Map();
    try {
      for (const angle of PUBLIC_TAKE_ANGLES) {
        const t = parseTake(md, angle, 'public-grid');
        if (t) parsedTakes.set(angle, t);
      }
      take = parsedTakes.values().next().value ?? null;
    } catch (err) {
      console.error(`error: ${file}: ${err.message}`);
      process.exit(1);
    }
    if (!take) {
      // Having no public take is the ordinary case for gated work and drafts,
      // and says nothing. Having a public-grid take under an angle no one asks
      // for is different: it is cleared to ship and still will not, which is
      // invisible unless said out loud. Warn rather than fail — the vault is
      // allowed to carry an angle the site has not adopted yet.
      const unread = publicGridTakeAngles(md).filter((a) => !PUBLIC_TAKE_ANGLES.includes(a));
      for (const angle of unread) {
        console.warn(`warn: ${file}: take "${angle}" is cleared for the public grid but its angle is not in PUBLIC_TAKE_ANGLES (${PUBLIC_TAKE_ANGLES.join(', ')}); the study is not in the bundle`);
      }
      continue;
    }
    try {
      const { beatsByTake, shots, warnings } = collectBeatsByTake(md, file);
      for (const w of warnings) console.warn(`warn: ${w}`);
      const marked = primaryTakeMarker(md);
      const primaryTake = pickPrimaryTake(beatsByTake, file, marked);

      // Resolve which take the study's fields come from BEFORE building it. Everything downstream has to come from ONE take: the flat prose,
      // the Card's slug/order/tags, AND the `_hero:` name off the take header.
      // An earlier draft resolved this after building and patched the prose
      // over the top, which left `heroName` pointing at the first-parsed take
      // and silently dropped the hero image from any study whose takes
      // diverge. Choosing first is the fix; there is nothing to keep in sync.
      const mediaLayout = scalarField(frontmatter(md), 'media_layout');
      if (mediaLayout && !BEAT_LAYOUT_VALUES.includes(mediaLayout)) {
        throw new Error(
          `${file}: media_layout is "${mediaLayout}". Allowed: ${BEAT_LAYOUT_VALUES.join(', ')}.`
        );
      }
      const kind = readKind(frontmatter(md), file);
      const { yearStart, yearEnd } = readYears(frontmatter(md), file);
      const mediaFit = scalarField(frontmatter(md), 'media_fit') ?? DEFAULT_MEDIA_FIT;
      if (!MEDIA_FITS.includes(mediaFit)) {
        throw new Error(
          `${file}: media_fit is "${mediaFit}". Allowed: ${MEDIA_FITS.join(', ')}. ` +
          `A typo here silently changes how every image in the study is cropped, so it fails instead.`
        );
      }

      const openOn = pickPublishedTake(
        [...parsedTakes.keys()],
        scalarField(frontmatter(md), 'published_take'),
        file
      );
      take = parsedTakes.get(openOn);

      const { study, order } = buildStudy(take.sections, file);
      if (order === null || Number.isNaN(order)) throw new Error(`${file}: Card is missing a numeric "order"`);

      // A study's browsable tags are the UNION of its Card tags and its
      // frontmatter `discipline`, deduped.
      //
      // Until 2026-08-12 only the Card's three curated tags reached the
      // bundle, so a discipline recorded in the vault could not be browsed to.
      // 20 of 22 studies had at least one, and four carried `ai-product` in
      // discipline while the AI Product tag page listed two projects.
      // taxonomy.json has always said `discipline` binds to
      // `site:caseStudies.tags`; this is the code catching up to that.
      //
      // Card tags stay the short set on the card face. This only widens what
      // the tag pages can find, and it cannot leak gated content: it reads
      // frontmatter on a study that already cleared the public-grid gate.
      study.tags = [...new Set([...study.tags, ...disciplineOf(md)])].sort((a, b) => a.localeCompare(b));
      if (primaryTake) {
        // ONLY the primary take's beats. `beatsByTake` holds every take in the
        // file, and this line used to hand all of them to the bundle — which
        // publishes the others to every visitor in view-source, the exact thing
        // check-public-bundle.mjs exists to stop. That gate did not catch it:
        // it bans the string `takes:`, and these ship under `beats:` keyed by
        // take name, so the shape slipped past a check on the spelling.
        //
        // Latent until 2026-08-08, when lobus-mobile-collector-app became the
        // first study to carry two beat-bearing takes. Nothing in src has ever
        // read a non-primary take: both consumers index `beats[primaryTake]`.
        // Extra framings reach the author view through publish-takes.mjs and
        // the Worker, never through this file.
        study.beats = { [primaryTake]: beatsByTake[primaryTake] };
        study.primaryTake = primaryTake;
      }
      // Emitted only when it is NOT the default, so the bundle carries the
      // decision and not the absence of one.
      // Emitted on EVERY study, unlike mediaFit/mediaLayout. Those have a
      // default worth omitting; these two are facts about the work, and a
      // study missing them is a study the views cannot place or sort.
      study.kind = kind;
      study.yearStart = yearStart;
      study.yearEnd = yearEnd;
      if (mediaFit !== DEFAULT_MEDIA_FIT) study.mediaFit = mediaFit;
      if (mediaLayout) study.mediaLayout = mediaLayout;
      // Per-take content, emitted ONLY when a study carries more than one
      // public-grid take. Below that threshold the key is absent and the
      // bundle is unchanged, which is what keeps this additive: generate:check
      // must show an empty diff across every study until a second take is
      // actually authored.
      // NOTE: per-take prose deliberately does NOT go on `study`, because
      // `study` is serialized into src/data/caseStudies.ts and that file is a
      // module the site imports — everything in it ships inside the public JS
      // bundle. A take is written for a particular reader; putting one in the
      // bundle publishes it to every reader and no UI can take that back. The
      // Worker header says it plainly: a page that holds gated content and
      // hides it behind a prompt has already handed it to anyone who opens
      // devtools. Take prose is published separately by scripts/publish-takes.mjs
      // and fetched at runtime behind the admin gate.
      //
      // `openOn` still matters here: it decides which single take fills the
      // public flat fields and supplies the hero name. That is a choice of
      // which framing is THE public one, not an extra framing shipped beside it.
      results.push({ study, order, file, shots, heroName: take.hero });
    } catch (err) {
      console.error(`error: ${err.message}`);
      process.exit(1);
    }
  }

  const seenSlug = new Map();
  const seenOrder = new Map();
  for (const r of results) {
    if (seenSlug.has(r.study.slug)) {
      console.error(`error: duplicate site slug "${r.study.slug}" in ${r.file} and ${seenSlug.get(r.study.slug)}`);
      process.exit(1);
    }
    if (seenOrder.has(r.order)) {
      console.error(`error: duplicate order ${r.order} in ${r.file} and ${seenOrder.get(r.order)}`);
      process.exit(1);
    }
    seenSlug.set(r.study.slug, r.file);
    seenOrder.set(r.order, r.file);
  }
  results.sort((a, b) => a.order - b.order);

  let placeholderCount = 0;
  const unboundBySlug = new Map();
  for (const r of results) {
    const { images, source } = await imagesFor(r.study.slug);
    // Filtered BEFORE anything reads the list: the hero resolver, the card
    // thumbnail and the no-beats image strip all draw from this one array.
    r.study.images = withoutStaleHeroes(images, r.heroName);
    if (source !== 'r2') placeholderCount += 1;
    // Only a real R2 list can bind media; placeholders never match, so a
    // beat (or hero line) naming media while the study has no R2 images
    // fails here too.
    const r2Images = source === 'r2' ? r.study.images : [];
    if (r.heroName) {
      try {
        r.study.hero = resolveExplicitHero(r.study.slug, r.heroName, r.study.title, r2Images);
      } catch (err) {
        console.error(`error: ${err.message}`);
        process.exit(1);
      }
    }
    if (r.study.beats) {
      // Beats from every take resolve against one list, so `unbound` means
      // bound by no beat in any take — and not claimed by the hero line.
      try {
        const allBeats = Object.values(r.study.beats).flat();
        const { unbound, warnings } = resolveBeatMedia(r.study.slug, allBeats, r2Images);
        for (const w of warnings) console.warn(`warn: ${w}`);
        const unclaimed = unbound.filter((n) => n !== r.heroName);
        if (unclaimed.length > 0) unboundBySlug.set(r.study.slug, unclaimed);
      } catch (err) {
        console.error(`error: ${err.message}`);
        process.exit(1);
      }
    }
  }

  // True dimensions for every bound image, from the committed cache first. In
  // --check mode a cache miss is an error rather than a fetch: CI must never
  // need the network, and a miss there means the cache was not regenerated.
  const dimensionsCache = existsSync(DIMENSIONS_PATH) ? JSON.parse(readFileSync(DIMENSIONS_PATH, 'utf8')) : {};
  const cacheBefore = JSON.stringify(dimensionsCache);
  const checkModeFetcher = () => {
    throw new Error('image-dimensions.json is missing an entry; run npm run generate to refresh the cache');
  };
  for (const r of results) {
    if (r.study.hero) {
      try {
        const { width, height } = await dimensionsFor(r.study.hero.src, { cache: dimensionsCache, fetcher: CHECK ? checkModeFetcher : fetch });
        r.study.hero.width = width;
        r.study.hero.height = height;
      } catch (err) {
        console.error(`error: ${r.study.slug}: ${err.message}`);
        process.exit(1);
      }
    }
    if (!r.study.beats) continue;
    for (const beat of Object.values(r.study.beats).flat()) {
      for (const m of beat.media) {
        const target = m.kind === 'image' ? m : m.kind === 'video' ? m.poster : null;
        if (!target) continue;
        if (target.width && target.height) continue;
        try {
          const { width, height } = await dimensionsFor(target.src, { cache: dimensionsCache, fetcher: CHECK ? checkModeFetcher : fetch });
          target.width = width;
          target.height = height;
        } catch (err) {
          console.error(`error: ${r.study.slug}: ${err.message}`);
          process.exit(1);
        }
      }
    }
  }
  if (!CHECK && JSON.stringify(dimensionsCache) !== cacheBefore) {
    const sorted = Object.fromEntries(Object.keys(dimensionsCache).sort().map((k) => [k, dimensionsCache[k]]));
    writeFileSync(DIMENSIONS_PATH, JSON.stringify(sorted, null, 2) + '\n');
    console.log(`updated src/data/image-dimensions.json (${Object.keys(sorted).length} entries)`);
  }

  for (const r of results) {
    const { note } = extractHero(r.study);
    if (note) console.warn(`warn: ${r.study.slug}: ${note}`);
  }

  // The hero backdrop color, sampled from the image's side edges (see
  // hero-edge-color.mjs for why the edge IS the backdrop). Runs AFTER
  // extractHero, because a lifted hero does not exist before it. Same cache
  // discipline as dimensions: committed JSON, no network in --check, a miss
  // there means the cache was not regenerated. Unlike dimensions, a hero
  // this cannot sample is a warning and a bg-inverse fallback, never a
  // failed build — a backdrop is not worth blocking a generate over.
  const edgeColorsCache = existsSync(EDGE_COLORS_PATH) ? JSON.parse(readFileSync(EDGE_COLORS_PATH, 'utf8')) : {};
  const edgeCacheBefore = JSON.stringify(edgeColorsCache);
  const edgeCheckFetcher = () => {
    throw new Error('hero-edge-colors.json is missing an entry; run npm run generate to refresh the cache');
  };
  for (const r of results) {
    if (!r.study.hero || r.study.hero.kind !== 'image') continue;
    try {
      const { colors } = await edgeColorsFor(r.study.hero.src, { cache: edgeColorsCache, fetcher: CHECK ? edgeCheckFetcher : fetch });
      if (colors) r.study.hero.edgeColors = colors;
      else console.warn(`warn: ${r.study.slug}: hero edge color unsampleable; the backdrop falls back to bg-inverse`);
    } catch (err) {
      if (CHECK) {
        console.error(`error: ${r.study.slug}: ${err.message}`);
        process.exit(1);
      }
      console.warn(`warn: ${r.study.slug}: hero edge color not sampled (${err.message}); the backdrop falls back to bg-inverse`);
    }
  }
  if (!CHECK && JSON.stringify(edgeColorsCache) !== edgeCacheBefore) {
    const sorted = Object.fromEntries(Object.keys(edgeColorsCache).sort().map((k) => [k, edgeColorsCache[k]]));
    writeFileSync(EDGE_COLORS_PATH, JSON.stringify(sorted, null, 2) + '\n');
    console.log(`updated src/data/hero-edge-colors.json (${Object.keys(sorted).length} entries)`);
  }

  printRunSummary(results, unboundBySlug);

  const output = emit(results.map((r) => r.study));
  const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : '';
  if (CHECK) {
    if (output === current) {
      console.log(`check: caseStudies.ts is up to date (${results.length} studies)`);
      return;
    }
    console.error('check: caseStudies.ts is stale; run npm run generate');
    process.exit(1);
  }
  if (output === current) {
    console.log(`no changes (${results.length} studies, ${placeholderCount} on placeholder images)`);
    return;
  }
  writeFileSync(OUT_PATH, output);
  console.log(`wrote src/data/caseStudies.ts: ${results.length} studies, ${placeholderCount} on placeholder images`);
}

// Run only when invoked directly, not when imported (the tests import the
// resolver and dimension helpers from this module).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
