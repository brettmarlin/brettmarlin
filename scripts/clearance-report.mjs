#!/usr/bin/env node
/**
 * `npm run clearance` — the review aid the guard is not.
 *
 * The guard (check-clearance.mjs) enforces decisions: it blocks the build when a
 * name the index marks non-public reaches the public bundle. It cannot discover
 * names. This report is the human-and-agent-facing complement. It prints:
 *
 *   1. every non-public entity in the index, with status and scope;
 *   2. everywhere each of those currently appears in the public bundle;
 *   3. anything under the file's `## Awaiting decision` section;
 *   4. as a review aid, never a gate: capitalised multi-word sequences in the
 *      bundle that match no entity in the index — the backstop for names nobody
 *      has recorded. Expect noise. Advisory only.
 *
 * The guard can only enforce; it cannot find names nobody wrote down. Group 4 is
 * where an unrecorded name would surface, but it is a hint for a human to chase,
 * not a promise of completeness. Capture stays a human and agent job.
 *
 *   VAULT_DIR overrides the vault location (default ~/Dev/marliin-vault)
 */
import { readFileSync } from 'node:fs';
import {
  CLEARANCES_PATH,
  BUNDLE_PATH,
  loadIndex,
  findHits,
  parseAwaitingDecision,
  findUnindexedSequences,
} from './check-clearance.mjs';

const loaded = loadIndex();
if (loaded === null) {
  console.error(`clearance report: no clearances.md at ${CLEARANCES_PATH} (set VAULT_DIR)`);
  process.exit(1);
}
const { md, index } = loaded;
const bundleText = readFileSync(BUNDLE_PATH, 'utf8');

console.log(`clearance report — index ${index.updated ?? '(undated)'}, ${index.entities.length} entities`);
console.log(`source of truth: ${CLEARANCES_PATH} (prose governs; this reads the index block)\n`);

// 1 + 2. Non-public entities and where they currently appear in the bundle.
const nonPublic = index.entities.filter((e) => e.status !== 'public');
console.log(`── non-public entities (${nonPublic.length}), and where each appears in the public bundle`);
if (nonPublic.length === 0) {
  console.log('   (none — every recorded entity is public)');
}
for (const e of nonPublic) {
  const scope = e.scope ? `, scope: ${e.scope}` : '';
  const decided = e.decided ? `, decided ${e.decided}` : '';
  console.log(`\n   ${e.name} [${e.status}${scope}${decided}]`);
  const hits = findHits(bundleText, e);
  if (hits.length === 0) {
    console.log('     not present in the public bundle (as it should be)');
  } else {
    for (const h of hits) console.log(`     ⚠ in "${h.slug}": ${h.snippet}`);
  }
}

// 3. Awaiting decision.
console.log('\n── awaiting decision (from clearances.md; nothing here may appear on a public surface)');
const awaiting = parseAwaitingDecision(md);
console.log(awaiting ? indent(awaiting, '   ') : '   (section not found)');

// 4. Advisory backstop: capitalised sequences with no matching entity.
console.log('\n── unrecorded capitalised sequences in the bundle (ADVISORY, noisy, never a gate)');
console.log('   The guard enforces decisions; it cannot discover names. These are candidate');
console.log('   names to check against clearances.md by hand. Most are false positives.\n');
const seqs = findUnindexedSequences(bundleText, index.entities);
if (seqs.length === 0) {
  console.log('   (none)');
} else {
  for (const { seq, count } of seqs) console.log(`   ${String(count).padStart(3)}×  ${seq}`);
}

function indent(text, pad) {
  return text.split('\n').map((l) => pad + l).join('\n');
}
