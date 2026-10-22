#!/usr/bin/env node
/**
 * Copy guard for the site's own text. The vault's rules: no em dashes, no
 * en dashes, no emoji, none of the anti-lexicon in brand copy. This scans the
 * hand-written source under src/, the document shell, the agent-readable
 * public/brett.md and the OG image script, and fails the build on a hit,
 * naming file and line.
 *
 * The generated bundle is REPORTED, not failed: a dash or a banned word in a
 * vault take is a vault edit, and the build should not go red over prose it
 * does not own.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = join(ROOT, 'src');
const GENERATED = new Set(['src/data/caseStudies.ts', 'src/data/substack.ts', 'src/data/taxonomy.ts']);
// Hand-written copy that lives outside src/ but ships to the public.
const EXTRA = ['index.html', 'public/brett.md', 'scripts/og-image.mjs'];

// The lexicon's banned words, plus a few hype words the canon treats the same.
const BANNED_WORDS = [
  /\bleverage\b/i, /\brevolutioni[sz]e/i, /\bempower/i, /(?<![/_])\bunlock(?!ed|s|ing|_)\b/i, /\bsupercharge/i, /\bturbocharge/i, /\b10x\b/i,
  /\bcutting-edge\b/i, /\bbest-in-class\b/i, /\bnext-generation\b/i, /\bstate-of-the-art\b/i, /\bsynergy\b/i, /\bdisrupt/i,
  /\bgame-changer\b/i, /\bparadigm shift\b/i, /\bAI-powered\b/i, /\bpowered by AI\b/i,
  /\bseamless/i, /\brobust\b/i, /\bholistic\b/i, /\bdelve\b/i, /\btapestry\b/i, /\btestament\b/i,
];
// "unlock" is the gate's own verb (unlockStudy, study_unlocked, "Unlocked for")
// and is allowed as a mechanism word; the anti-lexicon bans the hype sense.
// The regex above exempts the past tense and gerund the UI uses.

// Pictographs and regional-indicator flags. The legal marks (copyright,
// registered, trade mark) are pictographic by the Unicode property and are
// not emoji in the canon's sense, so they are let through.
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|css|mjs|html)$/.test(name)) yield p;
  }
}

// A line of JSX text that wrapped onto its own line carries no quote or `>`
// to mark it as copy, but it also carries none of the punctuation code does.
const PROSE_LINE = /^\s*[A-Za-z][^=;{}()<>]*$/;

let failures = 0;
let generatedDashes = 0;
const generatedWords = [];
const files = [...walk(SRC), ...EXTRA.map((p) => join(ROOT, p)).filter((p) => existsSync(p))];
for (const file of files) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const allCopy = /\.md$/.test(file);
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const dashes = (line.match(/[–—]/g) ?? []).length;
    if (GENERATED.has(rel)) {
      generatedDashes += dashes;
      for (const re of BANNED_WORDS) {
        const m = re.exec(line);
        if (m) generatedWords.push(`${rel}:${i + 1}: "${m[0]}"`);
      }
      return;
    }
    if (dashes) { failures += 1; console.error(`copy guard: ${rel}:${i + 1}: em or en dash: ${line.trim().slice(0, 120)}`); }
    if (EMOJI.test(line)) { failures += 1; console.error(`copy guard: ${rel}:${i + 1}: emoji: ${line.trim().slice(0, 120)}`); }
    // Only string literals, JSX text and markdown carry copy; identifiers do not.
    const copyish = allCopy ? line : line.replace(/\/\/.*$/, '');
    for (const re of BANNED_WORDS) {
      const m = re.exec(copyish);
      if (!m) continue;
      const isCopy = allCopy || /['"`>]/.test(copyish.slice(0, m.index)) || PROSE_LINE.test(copyish);
      if (isCopy) { failures += 1; console.error(`copy guard: ${rel}:${i + 1}: anti-lexicon "${m[0]}": ${line.trim().slice(0, 120)}`); }
    }
  });
}

if (generatedDashes) console.log(`copy guard: note, ${generatedDashes} em or en dash(es) in generated data; fix in the vault take, not here`);
if (generatedWords.length) {
  console.log(`copy guard: note, ${generatedWords.length} anti-lexicon hit(s) in generated data; fix in the vault take, not here`);
  for (const w of generatedWords.slice(0, 20)) console.log(`  ${w}`);
}
if (failures) { console.error(`copy guard: ${failures} problem(s) in hand-written copy`); process.exit(1); }
console.log(`copy guard: clean, no dashes, emoji or anti-lexicon in hand-written copy (${files.length} files)`);
