/**
 * The public bundle carries ONE framing per case study.
 *
 * src/data/caseStudies.ts is a module the site imports, so every byte in it
 * ships inside the public JS. That is fine for the one take a study is
 * published under, and it is not fine for the others: a take is written for a
 * particular reader, and putting a second one in the bundle publishes it to
 * every reader. No UI takes that back — hiding a control does not unpublish
 * the bytes behind it.
 *
 * This existed as a comment in the generator for exactly one day before the
 * generator emitted `takes` into the bundle anyway. Hence a gate.
 *
 * Extra framings are meant to be published by a publish-takes script and read
 * back through the Worker's author gate. That script is not built yet (see the
 * vault's working/multi-take-generator.md); until it is, extra takes stay
 * vault-only. If you are adding a field here, the
 * question to ask is: would I be comfortable with an anonymous visitor reading
 * this in view-source? If not, it does not belong in this file.
 */
import { readFileSync } from 'node:fs';

const FILE = 'src/data/caseStudies.ts';
const raw = readFileSync(FILE, 'utf8');

// Comments are stripped by the bundler, so they do not ship and must not trip
// this check — the file's own header explains the rule and names the fields,
// which would otherwise be a permanent false positive. Only whole comment
// LINES are dropped, never a trailing `//` inside a line, because a URL in a
// string contains `//` and blanking from there would hide real content.
const src = raw
  .split('\n')
  .filter((line) => {
    const t = line.trimStart();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
  })
  .join('\n');

const banned = [
  ['takes:', 'per-take prose'],
  ['openTake:', 'which take is open — meaningless publicly, and it advertises that others exist'],
  ['TakeContent', 'the per-take content type'],
  ['recipient-only', 'content scoped to a single recipient'],
  ['site_visibility', 'a vault field that governs where content may go, not content itself'],
];

// The banned-substring list above is a check on SPELLING, and a leak does not
// have to be spelled the way the list expects. Extra takes reached the bundle
// under `beats: { "<take>": [...] }` — no `takes:` anywhere — and every string
// check passed while a whole second framing shipped in the public JS.
//
// So this is a check on SHAPE: a study's `beats` record may carry exactly one
// key, and it must be the take named by `primaryTake`. One framing per study,
// asserted against the structure rather than against a word.
const shapeErrors = [];
for (const m of src.matchAll(/beats:\s*\{([\s\S]*?)\n(\s*)\},\n\s*primaryTake:\s*"([^"]+)"/g)) {
  const [, body, , primary] = m;
  const keys = [...body.matchAll(/^\s{6}"([^"]+)":\s*\[/gm)].map((k) => k[1]);
  if (keys.length > 1) {
    shapeErrors.push(
      `a study publishes ${keys.length} takes' beats (${keys.join(', ')}); primaryTake is "${primary}". ` +
      `Every take but the primary is readable by any visitor in view-source.`
    );
  } else if (keys.length === 1 && keys[0] !== primary) {
    shapeErrors.push(`a study publishes beats for "${keys[0]}" but primaryTake is "${primary}".`);
  }
}

const found = [];
for (const [needle, why] of banned) {
  // Count occurrences so the message can say how bad it is, not just that it
  // happened.
  const n = src.split(needle).length - 1;
  if (n > 0) found.push({ needle, why, n });
}

if (found.length === 0 && shapeErrors.length === 0) {
  console.log(`public bundle: one framing per study, no gated fields (${FILE})`);
  process.exit(0);
}

if (shapeErrors.length) {
  console.error(`error: ${FILE} publishes more than one framing per study:\n`);
  for (const e of shapeErrors) console.error(`  ${e}`);
  console.error('');
}

if (found.length) {
  console.error(`error: ${FILE} carries content that must not ship in the public bundle:\n`);
  for (const f of found) {
    console.error(`  ${f.needle}  \u00d7${f.n}  \u2014 ${f.why}`);
  }
}

console.error(`
Extra takes belong behind the Worker:

    (publish-takes is not built yet — until it is, extra takes stay
     vault-only and must not ship in this file)

See ~/Dev/marliin-vault/working/multi-take-generator.md.`);
process.exit(1);
