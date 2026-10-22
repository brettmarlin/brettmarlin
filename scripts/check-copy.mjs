#!/usr/bin/env node
/**
 * Copy guard for the site's own UI text. The vault's rules: no em dashes, no
 * en dashes, no emoji, none of the anti-lexicon in brand copy. This scans the
 * hand-written source under src/ (not the generated data, whose prose is the
 * vault's to fix) and fails the build on a hit, naming file and line.
 *
 * The generated bundle is REPORTED, not failed: a dash in a vault take is a
 * vault edit, and the build should not go red over prose it does not own.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const GENERATED = new Set(['src/data/caseStudies.ts', 'src/data/substack.ts', 'src/data/taxonomy.ts']);

const BANNED_WORDS = [
  /\bleverage\b/i, /\brevolutioni[sz]e/i, /\bempower/i, /(?<![/_])\bunlock(?!ed|s|ing|_)\b/i, /\bsupercharge/i, /\bturbocharge/i, /\b10x\b/i,
  /\bcutting-edge\b/i, /\bbest-in-class\b/i, /\bnext-generation\b/i, /\bstate-of-the-art\b/i, /\bsynergy\b/i, /\bdisrupt/i,
  /\bgame-changer\b/i, /\bparadigm shift\b/i, /\bseamless/i, /\brobust\b/i, /\bholistic\b/i, /\bdelve\b/i, /\btapestry\b/i, /\btestament\b/i,
];
// "unlock" is the gate's own verb (unlockStudy, study_unlocked, "Unlocked for")
// and is allowed as a mechanism word; the anti-lexicon bans the hype sense.
// The regex above exempts the past tense and gerund the UI uses.

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|css|mjs|html)$/.test(name)) yield p;
  }
}

let failures = 0;
let generatedDashes = 0;
for (const file of [...walk(SRC), join(ROOT, 'index.html')]) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const dashes = (line.match(/[–—]/g) ?? []).length;
    if (GENERATED.has(rel)) { generatedDashes += dashes; return; }
    if (dashes) { failures += 1; console.error(`copy guard: ${rel}:${i + 1}: em or en dash: ${line.trim().slice(0, 120)}`); }
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line)) { failures += 1; console.error(`copy guard: ${rel}:${i + 1}: emoji`); }
    // Only string literals and JSX text carry copy; identifiers do not.
    const copyish = line.replace(/\/\/.*$/, '');
    for (const re of BANNED_WORDS) {
      const m = re.exec(copyish);
      if (m && /['"`>]/.test(copyish.slice(0, m.index))) { failures += 1; console.error(`copy guard: ${rel}:${i + 1}: anti-lexicon "${m[0]}": ${line.trim().slice(0, 120)}`); }
    }
  });
}

if (generatedDashes) console.log(`copy guard: note, ${generatedDashes} em or en dash(es) in generated data; fix in the vault take, not here`);
if (failures) { console.error(`copy guard: ${failures} problem(s) in hand-written copy`); process.exit(1); }
console.log('copy guard: clean, no dashes, emoji or anti-lexicon in UI copy');
