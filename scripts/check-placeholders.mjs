#!/usr/bin/env node
/**
 * Production-build guard: fails, loudly, if src/data/caseStudies.ts still
 * contains any placeholder media, listing every study and beat holding one.
 *
 * Placeholders carry internal shot text (subjects, legacy filenames) into the
 * bundle so the layout is verifiable before the images exist. That is safe on
 * a branch and in dev; it must never ship. `npm run build` runs this guard;
 * `npm run dev`, `npm run preview` and `npm run build:preview` do not.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_PATH = fileURLToPath(new URL('../src/data/caseStudies.ts', import.meta.url));
const src = readFileSync(OUT_PATH, 'utf8');

let slug = '(unknown)';
const offenders = [];
for (const line of src.split('\n')) {
  const sm = /^    slug: "(.*)",$/.exec(line);
  if (sm) slug = sm[1];
  const bm = /^        \{ id: "([^"]*)",/.exec(line);
  if (bm) {
    const count = (line.match(/kind: "placeholder"/g) ?? []).length;
    if (count > 0) offenders.push({ slug, beat: bm[1], count });
  }
}

if (offenders.length === 0) {
  console.log('placeholder guard: clean, no placeholder media in caseStudies.ts');
  process.exit(0);
}

const total = offenders.reduce((n, o) => n + o.count, 0);
console.error(`placeholder guard: PRODUCTION BUILD BLOCKED — ${total} placeholder(s) across ${new Set(offenders.map((o) => o.slug)).size} studies:`);
let last = '';
for (const o of offenders) {
  if (o.slug !== last) {
    console.error(`  ${o.slug}:`);
    last = o.slug;
  }
  console.error(`    ${o.beat} (${o.count})`);
}
console.error('Bind real media in the vault (or mark _shot: none_) and regenerate, or use npm run build:preview for a non-production build.');
process.exit(1);
