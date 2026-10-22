#!/usr/bin/env node
/**
 * Clearance guard: fails, loudly, if the generated public bundle
 * (src/data/caseStudies.ts) names an entity the canonical clearance file marks
 * as anything other than `public`.
 *
 * The one source of truth is `consent/clearances.md` in the vault. Its prose
 * governs. This guard reads only the `## Machine-readable index` yaml block,
 * which that file's own prose warns may be stale. So a malformed or empty block
 * is a hard error here, never a silent skip: a guard that quietly parses
 * nothing is worse than no guard. If the block and the prose ever disagree, the
 * prose is correct and the block must be fixed in the vault — never here, and
 * never the prose.
 *
 * Wired like check-placeholders.mjs: `npm run build` runs it and any hit fails
 * the production build; `npm run verify` runs it in status mode and only
 * reports. Nothing ships with an uncleared name; Brett keeps working.
 *
 * Matching is whole-word and case-insensitive. Short or common names ("Patch",
 * "Google", "Expo") will draw false positives from ordinary prose, so every hit
 * is reported with its surrounding sentence, to make a false positive obvious at
 * a glance rather than a mystery.
 *
 * The guard enforces decisions; it cannot discover names. A name nobody has
 * recorded in the index is invisible to it. Capture stays a human and agent
 * responsibility; `npm run clearance` is the review aid for the gap.
 *
 *   VAULT_DIR overrides the vault location (default ~/Dev/marliin-vault)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveVaultDir } from './vault-dir.mjs';

export const VAULT_DIR = resolveVaultDir();
export const CLEARANCES_PATH = join(VAULT_DIR, 'consent', 'clearances.md');
export const BUNDLE_PATH = fileURLToPath(new URL('../src/data/caseStudies.ts', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Every public text surface the site ships: the generated bundle, the writing
// index, the hand-written profile, the agent-readable brett.md and the document
// shell. A name is public or it is not, whichever file carries it.
export const PUBLIC_TEXT_PATHS = [
  BUNDLE_PATH,
  fileURLToPath(new URL('../src/data/substack.ts', import.meta.url)),
  fileURLToPath(new URL('../src/data/profile.ts', import.meta.url)),
  fileURLToPath(new URL('../public/brett.md', import.meta.url)),
  fileURLToPath(new URL('../index.html', import.meta.url)),
];

// The clearance classes, exactly as defined in clearances.md's class table.
export const STATUSES = ['public', 'gated', 'internal', 'redacted', 'unreviewed'];

// Which statuses must NOT appear on each surface. `public` is on no list: it may
// appear anywhere. `gated` is cleared for a named recipient behind a password,
// so it passes on the recipient surface but fails in the public grid. Everything
// stricter than gated fails on any external surface, recipient included.
export const SURFACES = {
  'public-grid': new Set(['gated', 'internal', 'redacted', 'unreviewed']),
  recipient: new Set(['internal', 'redacted', 'unreviewed']),
};

/** True if `status` is disallowed on `surface`. */
export function failsOn(status, surface) {
  const fails = SURFACES[surface];
  if (!fails) throw new Error(`unknown surface "${surface}"`);
  return fails.has(status);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A whole-word, case-insensitive matcher for one entity name. "Word" is
 * alphanumeric, so a name is bounded by anything non-alphanumeric or the ends
 * of the string: "Patch" matches "Patch." and "Patch," but never "Patched".
 */
export function matcherFor(name) {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9])`, 'gi');
}

/**
 * Parse the `## Machine-readable index` yaml block. Throws, naming the problem,
 * on anything that would otherwise silently parse to fewer entities than the
 * prose declares: a missing section, a missing fence, no `entities:` key, an
 * unbalanced entry, an unknown status, or an empty list.
 */
export function parseIndex(md) {
  const heading = md.indexOf('## Machine-readable index');
  if (heading === -1) {
    throw new Error('clearance index: no "## Machine-readable index" section in clearances.md');
  }
  const after = md.slice(heading);
  const fence = /```ya?ml\n([\s\S]*?)\n```/.exec(after);
  if (!fence) {
    throw new Error('clearance index: no fenced yaml block under "## Machine-readable index"');
  }
  const block = fence[1];

  const meta = {};
  const vm = /^version:\s*(.+)$/m.exec(block);
  if (vm) meta.version = vm[1].trim();
  const um = /^updated:\s*(.+)$/m.exec(block);
  if (um) meta.updated = um[1].trim();

  const entitiesAt = block.indexOf('entities:');
  if (entitiesAt === -1) {
    throw new Error('clearance index: yaml block has no "entities:" key');
  }
  const lines = block.slice(entitiesAt + 'entities:'.length).split('\n');

  const entities = [];
  let buf = null; // accumulating a possibly multi-line `- { ... }` entry
  for (const raw of lines) {
    const line = raw.trim();
    if (buf === null) {
      if (line === '' || line.startsWith('#')) continue;
      if (!line.startsWith('- ')) {
        throw new Error(`clearance index: unexpected line in entities list: ${raw}`);
      }
      buf = line.slice(2).trim();
    } else {
      // continuation of a wrapped entry (e.g. a trailing note on its own line)
      buf += ' ' + line;
    }
    if (bracesBalanced(buf)) {
      entities.push(parseFlowMap(buf));
      buf = null;
    }
  }
  if (buf !== null) {
    throw new Error(`clearance index: unterminated entity entry: ${buf}`);
  }
  if (entities.length === 0) {
    throw new Error('clearance index: parsed zero entities (empty or unrecognized block)');
  }
  return { ...meta, entities };
}

// Braces balanced, ignoring any inside quotes. Used to know when a wrapped entry
// is complete.
function bracesBalanced(s) {
  let depth = 0;
  let quote = null;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return depth === 0 && s.includes('{');
}

// Parse one `{ key: value, key: "value", ... }` flow map into an object.
function parseFlowMap(entry) {
  const open = entry.indexOf('{');
  const close = entry.lastIndexOf('}');
  if (open === -1 || close === -1 || close < open) {
    throw new Error(`clearance index: entry is not a { } map: ${entry}`);
  }
  const inner = entry.slice(open + 1, close);
  const obj = {};
  for (const pair of splitTopLevel(inner)) {
    const trimmed = pair.trim();
    if (trimmed === '') continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) {
      throw new Error(`clearance index: "${trimmed}" is not a key: value pair in ${entry}`);
    }
    const key = unquote(trimmed.slice(0, colon).trim());
    const value = unquote(trimmed.slice(colon + 1).trim());
    obj[key] = value;
  }
  if (!obj.name) throw new Error(`clearance index: entry has no name: ${entry}`);
  if (!obj.status) throw new Error(`clearance index: entry "${obj.name}" has no status`);
  if (!STATUSES.includes(obj.status)) {
    throw new Error(`clearance index: entry "${obj.name}" has unknown status "${obj.status}" (expected one of ${STATUSES.join(', ')})`);
  }
  return obj;
}

// Split on commas that are not inside quotes.
function splitTopLevel(s) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// Where each study begins in the bundle, so a hit can be attributed to a study.
function slugDeclarations(bundleText) {
  const re = /slug: "([^"]+)"/g;
  const decls = [];
  let m;
  while ((m = re.exec(bundleText))) decls.push({ offset: m.index, slug: m[1] });
  return decls;
}

function slugAt(decls, offset) {
  let slug = '(module header)';
  for (const d of decls) {
    if (d.offset <= offset) slug = d.slug;
    else break;
  }
  return slug;
}

// A one-line window around a match, newlines and runs collapsed, elided at the
// ends. Enough to see at a glance whether a hit is a real name or a false
// positive on a common word.
export function snippet(text, index, matchLen, radius = 90) {
  const a = Math.max(0, index - radius);
  const b = Math.min(text.length, index + matchLen + radius);
  let s = text.slice(a, b).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (a > 0) s = '…' + s;
  if (b < text.length) s = s + '…';
  return s;
}

/**
 * Every occurrence of `entity`'s name in `bundleText`, with the study it landed
 * in and a surrounding-sentence snippet.
 */
export function findHits(bundleText, entity, decls = slugDeclarations(bundleText)) {
  const re = matcherFor(entity.name);
  const hits = [];
  let m;
  while ((m = re.exec(bundleText))) {
    hits.push({
      name: entity.name,
      status: entity.status,
      kind: entity.kind,
      scope: entity.scope,
      slug: slugAt(decls, m.index),
      snippet: snippet(bundleText, m.index, m[0].length),
    });
  }
  return hits;
}

/**
 * All violations: every hit whose status is disallowed on `surface`.
 * Defaults to the public-grid surface, which is what `caseStudies.ts` is.
 */
export function scanBundle({ bundleText, entities, surface = 'public-grid' }) {
  const decls = slugDeclarations(bundleText);
  const violations = [];
  for (const entity of entities) {
    if (!failsOn(entity.status, surface)) continue;
    violations.push(...findHits(bundleText, entity, decls));
  }
  return violations;
}

/** The raw text of the `## Awaiting decision` section, for the report. */
export function parseAwaitingDecision(md) {
  const heading = md.indexOf('## Awaiting decision');
  if (heading === -1) return '';
  const after = md.slice(heading + '## Awaiting decision'.length);
  const next = after.indexOf('\n## ');
  const body = next === -1 ? after : after.slice(0, next);
  return body.trim();
}

/**
 * Names in the `## Awaiting decision` prose, as entities with status
 * `unreviewed`. That section's own rule: nothing in it may appear on a public
 * surface, so the guard treats a pending name exactly like an unreviewed one.
 * Each bullet opens with the bold names, comma separated; a leading "the" is an
 * article, not part of the name. Names the index already carries are skipped,
 * since the index governs their status.
 */
export function awaitingEntities(md, indexed = []) {
  const body = parseAwaitingDecision(md);
  if (!body) return [];
  const known = new Set(indexed.map((e) => e.name.toLowerCase()));
  const out = [];
  for (const m of body.matchAll(/^- \*\*([^*]+)\*\*/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.replace(/^\s*the\s+/i, '').trim();
      if (name.length < 3 || known.has(name.toLowerCase())) continue;
      known.add(name.toLowerCase());
      out.push({ name, kind: 'awaiting-decision', status: 'unreviewed' });
    }
  }
  return out;
}

/**
 * Advisory only. Capitalised multi-word sequences in the bundle that match no
 * entity in the index — the backstop for names nobody has recorded. Noisy by
 * design (section labels, method names, ordinary phrases all surface). The guard
 * cannot discover names; this only points a human at where to look.
 */
export function findUnindexedSequences(bundleText, entities) {
  const known = entities.map((e) => matcherFor(e.name));
  const re = /\b[A-Z][A-Za-z0-9]+(?:\s+(?:&\s+|of\s+|and\s+|the\s+)?[A-Z][A-Za-z0-9]+)+\b/g;
  const counts = new Map();
  let m;
  while ((m = re.exec(bundleText))) {
    const seq = m[0];
    if (known.some((k) => { k.lastIndex = 0; return k.test(seq); })) continue;
    counts.set(seq, (counts.get(seq) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([seq, count]) => ({ seq, count }))
    .sort((a, b) => b.count - a.count || a.seq.localeCompare(b.seq));
}

/** Read and parse the index from the vault. Returns null if the vault is absent. */
export function loadIndex() {
  let md;
  try {
    md = readFileSync(CLEARANCES_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  return { md, index: parseIndex(md) };
}

function main() {
  let loaded;
  try {
    loaded = loadIndex();
  } catch (err) {
    // A present-but-malformed block is a hard failure, loud and single-line:
    // a guard that quietly parses nothing is worse than no guard.
    console.error(`clearance guard: BUILD BLOCKED — ${err.message}`);
    console.error('The prose in clearances.md governs; fix the ## Machine-readable index block in the vault to match it.');
    process.exit(1);
  }
  if (loaded === null) {
    // No vault (e.g. CI): nothing to enforce against, announced not silent.
    // This is the vault-absent case, distinct from a malformed block, which
    // parseIndex throws on above.
    console.log(`clearance guard: skipped, no clearances.md at ${CLEARANCES_PATH} (set VAULT_DIR)`);
    process.exit(0);
  }
  const entities = [...loaded.index.entities, ...awaitingEntities(loaded.md, loaded.index.entities)];
  const violations = [];
  for (const path of PUBLIC_TEXT_PATHS) {
    if (!existsSync(path)) continue;
    const file = relative(ROOT, path);
    const text = readFileSync(path, 'utf8');
    for (const v of scanBundle({ bundleText: text, entities, surface: 'public-grid' })) violations.push({ ...v, file });
  }

  if (violations.length === 0) {
    console.log(`clearance guard: clean, no non-public or awaiting-decision names on ${PUBLIC_TEXT_PATHS.length} public text surfaces`);
    process.exit(0);
  }

  const names = new Set(violations.map((v) => v.name));
  console.error(`clearance guard: PRODUCTION BUILD BLOCKED — ${violations.length} non-public name hit(s) across ${names.size} name(s) in the public bundle:`);
  let lastKey = '';
  for (const v of violations) {
    const scope = v.scope ? `, scope: ${v.scope}` : '';
    const key = `${v.name}|${v.file}|${v.slug}`;
    if (key !== lastKey) {
      const where = v.slug === '(module header)' ? v.file : `${v.file}, study "${v.slug}"`;
      console.error(`  ${v.name} [${v.status}${scope}] in ${where}:`);
      lastKey = key;
    }
    console.error(`    ${v.snippet}`);
  }
  console.error('Fix the vault take (or the hand-written file) so the name does not reach public output, then regenerate (npm run generate). Clearance is governed only by consent/clearances.md; if the name is settled there, the index block is incomplete — tell Brett, do not edit clearances.md.');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
