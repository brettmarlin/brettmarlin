#!/usr/bin/env node
/**
 * npm run taxonomy:check  [-- --taxonomy <path>]
 *
 * Fails if any case-study tag is not in the vault's canonical vocabulary.
 *
 * WHY THIS EXISTS. `taxonomy.json` declares itself the single source of truth
 * for every controlled tag, and nothing enforced it. Measured 2026-08-07:
 * roughly 75 values in use against a 33-value vocabulary; `frontend` still in
 * play two weeks after being formally deprecated; and `outcome_tags`, the one
 * field bound to no axis, had become what the vault's own reconciliation note
 * calls "the invention valve" — 44 values across 73 assignments, 33 of them
 * used exactly once.
 *
 * That is what an unenforced vocabulary costs. A tag that nothing validates is
 * free text with extra steps, and the decay is silent: the build passes, the
 * site renders, and the filters quietly stop meaning anything.
 *
 * The rule: a field may carry only values from the axes whose `binds_to` names
 * it. Deprecated values fail with their replacement, so the message is a fix
 * rather than a complaint.
 *
 *   VAULT_DIR overrides the vault location (default ~/Dev/marliin-vault)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveVaultDir } from './vault-dir.mjs';

const VAULT = resolveVaultDir();
const argIdx = process.argv.indexOf('--taxonomy');
const TAXONOMY = argIdx !== -1 ? process.argv[argIdx + 1] : join(VAULT, 'taxonomy.json');
const STUDIES = join(VAULT, 'case-studies');

const tx = JSON.parse(readFileSync(TAXONOMY, 'utf8'));

// field -> the union of every axis that binds to it
const allowed = new Map();
for (const axis of Object.values(tx.axes)) {
  const ids = axis.values.map((v) => v.id);
  for (const bind of axis.binds_to) {
    if (!bind.startsWith('case-study.')) continue;
    const field = bind.slice('case-study.'.length);
    if (!allowed.has(field)) allowed.set(field, new Set());
    for (const id of ids) allowed.get(field).add(id);
  }
}
// The same treatment for the tags that reach the SITE. A study's browsable
// tags are the union of its Card `- tags:` line and its frontmatter
// `discipline`, so the Card half was the only controlled vocabulary in the
// vault that nothing validated. That is how `AI-native`, `Tooling`, `mobile`
// and `consulting` reached the public tag row next to properly-formed ids:
// this check only ever read frontmatter, and the Card sits below it in the
// take. Bound axes are whichever declare `site:caseStudies.tags`, which is
// `discipline` and, since v1.3.0, `industry-vertical`.
const siteTagVocab = new Set();
for (const axis of Object.values(tx.axes)) {
  if (!axis.binds_to.includes('site:caseStudies.tags')) continue;
  for (const v of axis.values) siteTagVocab.add(v.id);
}

const deprecated = new Map(
  Object.entries(tx.deprecated ?? {})
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => [k, v.superseded_by])
);

/** Reads a YAML list field: inline [a, b] or a block of "  - value" lines. */
function listField(frontmatter, key) {
  const m = frontmatter.match(new RegExp(`^${key}:\\s*(\\[[^\\]]*\\]|(?:\\n  - [^\\n]+)+)`, 'm'));
  if (!m) return [];
  const raw = m[1].trim();
  const items = raw.startsWith('[')
    ? raw.slice(1, -1).split(',')
    : [...raw.matchAll(/- (.+)/g)].map((x) => x[1]);
  return items.map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

const problems = [];
let checked = 0;
for (const file of readdirSync(STUDIES).filter((f) => f.endsWith('.md'))) {
  const text = readFileSync(join(STUDIES, file), 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { problems.push([file, '(frontmatter)', '', 'no YAML frontmatter']); continue; }
  checked += 1;
  for (const [field, vocab] of allowed) {
    for (const value of listField(fm[1], field)) {
      if (deprecated.has(value)) {
        const to = deprecated.get(value);
        problems.push([file, field, value, to ? `deprecated, use "${to}"` : 'deprecated, not a tag']);
      } else if (!vocab.has(value)) {
        problems.push([file, field, value, 'not in any axis bound to this field']);
      }
    }
  }

  // Card tags on every take cleared for the public grid. Gated takes are
  // skipped: their tags never reach a visitor, so holding them to the public
  // vocabulary would fail the build over something nobody can browse to.
  for (const take of text.split(/^## Take — /m).slice(1)) {
    const header = take.split('\n').slice(0, 3).join('\n');
    if (!/site_visibility:\s*public-grid/.test(header)) continue;
    const line = /^- tags:\s*(.+)$/m.exec(take);
    if (!line) continue;
    const angle = take.split('\n')[0].trim();
    for (const value of line[1].split(',').map((t) => t.trim()).filter(Boolean)) {
      if (deprecated.has(value)) {
        const to = deprecated.get(value);
        problems.push([file, `Card tags (${angle})`, value, to ? `deprecated, use "${to}"` : 'deprecated, not a tag']);
      } else if (!siteTagVocab.has(value)) {
        problems.push([file, `Card tags (${angle})`, value, 'not in any axis bound to site:caseStudies.tags']);
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`taxonomy: ${checked} case studies clean against ${Object.keys(tx.axes).length} axes (v${tx.version})`);
  process.exit(0);
}
console.error(`taxonomy: ${problems.length} tag problem(s) across ${checked} case studies (v${tx.version})\n`);
let last = '';
for (const [file, field, value, why] of problems) {
  if (file !== last) { console.error(`  ${file}`); last = file; }
  console.error(`     ${field}: "${value}" — ${why}`);
}
console.error(`\nEvery controlled tag must exist in ${TAXONOMY}.`);
console.error('Add the value there deliberately, or fix the tag. Do not invent tags in frontmatter or on a Card.');
process.exit(1);
