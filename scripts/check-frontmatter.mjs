#!/usr/bin/env node
/**
 * Vault guard: every markdown file's YAML frontmatter must parse.
 *
 * Six files in the vault had frontmatter that did not, found on 2026-08-13 when
 * Obsidian showed "Invalid properties" on a case study. All six were the same
 * two mistakes, and neither announces itself:
 *
 *   1. An UNQUOTED value containing ": " — YAML reads the second colon as a
 *      nested key and the whole block fails. `metrics: ... its own coaching:
 *      average HR 123 bpm ...` and `name: Zoom: Brett Marlin x ...` are both
 *      this. It is the easiest thing in the world to type.
 *
 *   2. A DOUBLE-QUOTED value with an unescaped `"` inside it, which ends the
 *      string early and leaves the rest as garbage. Quoting a title that itself
 *      quotes something does it every time.
 *
 * WHY THIS IS NOT A YAML PARSER. `yaml` and `js-yaml` are both in node_modules
 * as transitive dependencies of the toolchain, and importing one would work
 * here and break on a clean `npm ci` the moment the tree changed. So this
 * checks the two shapes above directly. It will not catch every malformed
 * document — it is a guard against the mistake that actually happens, not a
 * specification.
 *
 * The vault is the source of truth for the site, and a study whose frontmatter
 * does not parse is invisible to every tool that reads properties rather than
 * text. MAF Machine sat unparseable for weeks and nothing said a word, because
 * the site's own reader is line-based and the study was excluded from the build
 * anyway. That is the failure this exists to make loud.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VAULT_DIR } from './vault-present.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', '_to_delete', '.obsidian', '.trash']);

function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (entry.endsWith('.md')) out.push(path);
  }
  return out;
}

/** The frontmatter block, or null when the file has none. */
function frontmatter(src) {
  if (!src.startsWith('---\n')) return null;
  const end = src.indexOf('\n---', 3);
  return end === -1 ? null : src.slice(4, end);
}

/**
 * The value with any trailing comment removed.
 *
 * NOT a regex, because `#` is only a comment when it follows whitespace and is
 * not inside a quoted string. The first version of this check skipped comments
 * entirely and reported 37 problems, every one of them a template line reading
 * `stage: ""   # early | growth | scale`. Thirty-seven false positives is not a
 * guard, it is a thing people learn to run with `|| true`.
 */
export function withoutComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (char === '\\' && quote === '"') { i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '#' && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trim();
  }
  return value.trim();
}

/** A double-quoted scalar that closes early. Walks the string rather than
 *  matching it, so an escaped \" is not mistaken for the end. */
export function quoteEndsEarly(value) {
  if (!value.startsWith('"')) return false;
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === '\\') { i += 1; continue; }
    if (value[i] === '"') return i !== value.length - 1;
  }
  return true;
}

/** The scan, as a function. It used to be top-level, which meant importing
 *  this file to unit-test its two predicates walked the vault and then called
 *  process.exit — the test run reported one passing test and stopped, and
 *  looked like a pass. Same pattern as bind-images and prepare-images. */
export function scan(vaultDir = VAULT_DIR) {
  const problems = [];
  let checked = 0;

  for (const path of markdownFiles(vaultDir)) {
    const block = frontmatter(readFileSync(path, 'utf8'));
    if (block === null) continue;
    checked += 1;

    let lineNo = 1;
    for (const line of block.split('\n')) {
      lineNo += 1;
      const key = /^([A-Za-z_][\w-]*):\s(.+)$/.exec(line);
      if (!key) continue;
      const value = withoutComment(key[2]);
      if (!value) continue;

      // A single-quoted, bracketed or block-scalar value has already taken
      // care of its own punctuation. Everything else is a plain scalar.
      if (value.startsWith("'") || value.startsWith('[') || value.startsWith('{') || value === '>-' || value.startsWith('|')) continue;

      if (value.startsWith('"')) {
        if (quoteEndsEarly(value)) {
          problems.push([path, lineNo, key[1], 'a double quote inside a quoted value, unescaped']);
        }
        continue;
      }
      if (/:\s/.test(value)) {
        problems.push([path, lineNo, key[1], 'an unquoted value containing ": " — YAML reads that as a nested key']);
      }
    }
  }
  return { checked, problems };
}

// argv[1] is undefined under `node -e`, which is how these modules get
// poked at from a one-liner; guard rather than throw.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { checked, problems } = scan();
  if (problems.length === 0) {
    console.log(`frontmatter: ${checked} files parse`);
  } else {
    console.error(`frontmatter: ${problems.length} problem(s) — Obsidian shows these as "Invalid properties":`);
    for (const [path, line, key, why] of problems) {
      console.error(`  ${relative(VAULT_DIR, path)}:${line}  ${key}: ${why}`);
    }
    console.error('Wrap the value in double quotes, escaping any " inside it as \\", or use a >- block scalar.');
    process.exit(1);
  }
}
