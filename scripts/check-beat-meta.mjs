#!/usr/bin/env node
/**
 * npm run meta:check — the beat meta-line convention, validated.
 *
 * Beats carry their structure in italic meta lines: `_media:`, `_layout:`,
 * `_ratio:`, `_removed:`, `_shot:`, `_video:`, `_poster:`. That convention is
 * parsed by a regex in vault-reader.mjs and, until this file existed, was
 * checked by nothing. Two failure modes follow from that, and both are silent:
 *
 *   1. A key the parser does not recognise falls THROUGH the regex and is
 *      pushed to bodyLines, where it renders on the page as italic prose. A
 *      typo does not fail; it publishes.
 *
 *   2. A meta line drifts away from its beat's other meta lines and lands
 *      against the next heading. The parser attaches it to the beat ABOVE,
 *      because that is where it textually sits. The author meant the one
 *      below. Nothing about the output says which was intended.
 *
 * Found in the wild on 2026-08-08: `_ratio: 1_` alone below a blank line at
 * the foot of the Results beat in lobus-mobile-collector-app.md, directly
 * above `#### What I would do differently`. It had been setting the ratio of
 * the wrong beat since it was written.
 *
 * The lint is deliberately narrow. Only ALL-LOWERCASE keys are treated as
 * meta-shaped, because `_Gap: ..._` and `_Recording: ..._` are real italic
 * prose in the vault and must stay prose. Across 21 studies this rule set
 * fires on exactly the one line above, which is the evidence that it is
 * measuring the convention rather than a guess at it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveVaultDir } from './vault-dir.mjs';

const VAULT_DIR = resolveVaultDir();
const STUDIES = join(VAULT_DIR, 'case-studies');

// Must stay in step with the regex in scripts/vault-reader.mjs parseBeats().
const BEAT_KEYS = new Set(['media', 'shot', 'layout', 'ratio', 'removed', 'video', 'poster']);
// Legal on a take's header line, never inside a beat.
const HEADER_KEYS = new Set(['clearance', 'hero']);

const META_SHAPED = /^_([a-z][a-z0-9_-]*):\s*(.*)_\s*$/;

export function lintBeatMeta(md, file) {
  const errors = [];
  let inFence = false;
  let beat = null;          // heading text of the open beat, or null
  let blocks = 0;           // contiguous runs of meta lines inside this beat
  let lastMetaLine = null;  // line number of the previous meta line

  const lines = md.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const n = i + 1;

    if (/^(```|~~~)/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;

    // Any heading closes the beat that was open. `#### ` opens a new one;
    // `## ` and `### ` end the Beats region without starting a beat, which is
    // what makes a following take's `_clearance:` header legal again.
    const h4 = /^#### (.+)$/.exec(line);
    if (h4) { beat = h4[1].trim(); blocks = 0; lastMetaLine = null; return; }
    if (/^#{1,3} /.test(line)) { beat = null; blocks = 0; lastMetaLine = null; return; }

    const m = META_SHAPED.exec(line);
    if (!m) return;
    const key = m[1];

    if (!BEAT_KEYS.has(key) && !HEADER_KEYS.has(key)) {
      errors.push(
        `${file}:${n}: unknown meta key "_${key}:_". ` +
        `Beat keys: ${[...BEAT_KEYS].join(', ')}. Take-header keys: ${[...HEADER_KEYS].join(', ')}. ` +
        `An unrecognised key does not fail the parser — it renders on the page as italic prose.`
      );
      return;
    }

    if (HEADER_KEYS.has(key)) {
      if (beat) {
        errors.push(
          `${file}:${n}: "_${key}:_" belongs to a take's header line but sits inside beat "${beat}".`
        );
      }
      return;
    }

    // A beat key with no beat open.
    if (!beat) {
      errors.push(
        `${file}:${n}: "_${key}:_" is a beat field but no "#### " beat is open here, so nothing reads it.`
      );
      return;
    }

    if (lastMetaLine === null || n !== lastMetaLine + 1) blocks += 1;
    lastMetaLine = n;

    if (blocks > 1) {
      errors.push(
        `${file}:${n}: "_${key}:_" is separated from beat "${beat}"'s other meta lines by a blank line. ` +
        `The parser attaches it to "${beat}" because that is where it sits. ` +
        `If it was meant for the beat below, move it under that heading; if it was meant for this one, ` +
        `put it against the other meta lines so the next reader can tell.`
      );
    }
  });

  return errors;
}

function main() {
  const files = readdirSync(STUDIES).filter((f) => f.endsWith('.md')).sort();
  const errors = files.flatMap((f) => lintBeatMeta(readFileSync(join(STUDIES, f), 'utf8'), f));
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    console.error(`\nmeta:check: ${errors.length} problem(s) across ${files.length} studies`);
    process.exit(1);
  }
  console.log(`meta:check: beat meta lines are well-formed and attached (${files.length} studies)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
