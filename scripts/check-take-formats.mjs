/**
 * Every take is written in a declared format, and carries that format's sections.
 *
 * A take is an AUTHORING concept — it is how Brett decides what a case study
 * says and to whom. It is never reader-facing. This check exists at the other
 * end of that: if a take carries a format, the format has to mean something,
 * or "which take?" is a question with no consequence.
 *
 * Before take-formats.json, a take's shape was whatever the last one happened
 * to have. That is how Convoy's `video` take was skipped in silence by a tool
 * expecting Card/Problem/Role/Outcome — nothing was wrong, nothing was
 * reported, and a framing that had been written simply did not exist
 * downstream. An unknown angle now fails by name.
 *
 * Source of truth is the vault's take-formats.json, never a copy here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { collectAllTakes, frontmatter, scalarField } from './vault-reader.mjs';
import { resolveVaultDir } from './vault-dir.mjs';

const VAULT_DIR = resolveVaultDir();
const STUDIES = join(VAULT_DIR, 'case-studies');
const registry = JSON.parse(readFileSync(join(VAULT_DIR, 'take-formats.json'), 'utf8'));
const FORMATS = registry.formats;

const problems = [];
let takes = 0;
let files = 0;

for (const file of readdirSync(STUDIES).filter((f) => f.endsWith('.md')).sort()) {
  const md = readFileSync(join(STUDIES, file), 'utf8');
  files += 1;

  const found = collectAllTakes(md);

  // published_take must name a take that is actually in the file.
  //
  // This check went green on 2026-08-07 while a take was missing entirely —
  // an edit truncated the file and removed it, and every remaining take still
  // conformed, so there was nothing to report. "Everything present is valid"
  // is not the same claim as "what was declared is present", and only the
  // second one would have caught it.
  const declared = scalarField(frontmatter(md), 'published_take');
  if (declared && !(declared in found)) {
    problems.push([file, declared, `published_take names a take this file does not contain. Takes present: ${Object.keys(found).join(', ') || 'none'}.`]);
  }

  for (const [angle, take] of Object.entries(found)) {
    takes += 1;
    const fmt = FORMATS[angle];

    if (!fmt) {
      problems.push([file, angle, `unknown take format. Known: ${Object.keys(FORMATS).join(', ')}. Add it to take-formats.json deliberately, or fix the angle.`]);
      continue;
    }

    // A take declared as not-prose (a video script) has its own shape and is
    // named here on purpose, so that "we do not check this" is a recorded
    // decision rather than an accident.
    if (fmt.prose_take === false) continue;

    // A take written before the current schema has the old header shape
    // (`_angle · audience · clearance · status_`) and no `### ` sections at
    // all. Reporting that as six forgotten sections is misleading — nobody
    // forgot anything, the take predates the format. Say what it is.
    if (!/clearance:\s*\w/.test(take.header) && Object.keys(take.sections).length === 0) {
      problems.push([file, angle, `legacy take: header is "${take.header.trim()}" and the take has no ### sections. It predates the clearance/site_visibility schema and needs migrating to the ${angle} format (${fmt.sections_required.join(', ')}).`]);
      continue;
    }

    const present = new Set(Object.keys(take.sections));
    const missing = fmt.sections_required.filter((s) => !present.has(s));
    if (missing.length) {
      problems.push([file, angle, `missing required section${missing.length > 1 ? 's' : ''}: ${missing.map((m) => `### ${m}`).join(', ')}`]);
    }

    const known = new Set([...fmt.sections_required, ...(fmt.sections_optional ?? [])]);
    const unknown = [...present].filter((s) => !known.has(s));
    if (unknown.length) {
      problems.push([file, angle, `section${unknown.length > 1 ? 's' : ''} not in this format: ${unknown.map((u) => `### ${u}`).join(', ')}. Add to sections_optional if intended.`]);
    }
  }
}

if (problems.length === 0) {
  console.log(`take formats: ${takes} takes across ${files} case studies conform (v${registry.version})`);
  process.exit(0);
}

console.error(`error: ${problems.length} take${problems.length > 1 ? 's do' : ' does'} not match its declared format:\n`);
for (const [file, angle, why] of problems) {
  console.error(`  ${file}`);
  console.error(`    ## Take — ${angle}`);
  console.error(`    ${why}\n`);
}
console.error('Formats live in the vault: take-formats.json. Change the format there');
console.error('deliberately, or fix the take. Do not improvise a take shape.');
process.exit(1);
