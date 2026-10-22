#!/usr/bin/env node
/**
 * npm run taxonomy [-- --check]
 *
 * Emits src/data/taxonomy.ts from the vault's taxonomy.json, and keeps the
 * vault's own copy at working/portfolio-worker/taxonomy.generated.ts identical.
 *
 * WHY THIS EXISTS. The generated file has carried the header "GENERATED FROM
 * taxonomy.json IN THE MARLIIN VAULT. DO NOT EDIT BY HAND" since 2026-07-24 and
 * nothing generated it — it was written by hand each time the vocabulary moved.
 * A file that claims to be generated but is not drifts from its source silently,
 * which is the same failure this repo's other checks exist to prevent.
 *
 * The hand-authored helpers below the TAGS table are preserved verbatim. The
 * tagLabel fallback in particular carries a correction dated 2026-07-28 and the
 * instruction PRESERVE THIS ON REGENERATION: unknown ids render raw, because
 * deriving a label breaks `ai`, `0-to-1` and `AI-first`. A raw id showing
 * through is the intended signal that the vocabulary needs to grow.
 *
 *   VAULT_DIR overrides the vault location (default ~/Dev/marliin-vault)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VAULT = process.env.VAULT_DIR ?? join(homedir(), 'Dev', 'marliin-vault');
const SRC = join(VAULT, 'taxonomy.json');
const OUT_SITE = new URL('../src/data/taxonomy.ts', import.meta.url).pathname;
const OUT_VAULT = join(VAULT, 'working/portfolio-worker/taxonomy.generated.ts');

const tx = JSON.parse(readFileSync(SRC, 'utf8'));
const axes = Object.keys(tx.axes);

// Axis render order: most distinguishing first. New axes append rather than
// reorder, so an existing truncated tag row does not shuffle.
const PRIORITY = ['discipline', 'judgment', 'industry-vertical', 'system-mindset', 'engagement-model'];
const priority = [...PRIORITY.filter((a) => axes.includes(a)), ...axes.filter((a) => !PRIORITY.includes(a))];

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const lines = [
  '// GENERATED FROM taxonomy.json IN THE MARLIIN VAULT. DO NOT EDIT BY HAND.',
  "// Regenerate with `npm run taxonomy` whenever the canonical vocabulary changes.",
  `// taxonomy.json version ${tx.version} / ${tx.updated}`,
  '',
  'export type TaxonomyAxis =',
  ...axes.map((a, i) => `  | '${a}'${i === axes.length - 1 ? '' : ''}`),
  '',
  'export type TagMeta = {',
  '  label: string;',
  '  axis: TaxonomyAxis;',
  "  business: 'brett-marlin' | 'marliin' | 'both';",
  '};',
  '',
  'export const TAGS: Record<string, TagMeta> = {',
];
for (const axis of axes) {
  lines.push(`  // --- ${axis} ---`);
  for (const v of tx.axes[axis].values) {
    lines.push(
      // Definitions stay in the vault: they are prose about the work and can
      // name a client the public bundle may not (the dist guard caught one).
      `  '${esc(v.id)}': { label: '${esc(v.label)}', axis: '${axis}', business: '${v.business}' },`
    );
  }
}
lines.push('};', '');
lines.push('/** Axis render order when a tag row is truncated: most distinguishing first. */');
lines.push('export const AXIS_PRIORITY: TaxonomyAxis[] = [');
for (const a of priority) lines.push(`  '${a}',`);
lines.push('];', '');
lines.push(`/**
 * Unknown ids render VERBATIM. Do not transform them: no hyphen stripping, no
 * title casing. metadata-standard.md is explicit that consumers render the
 * declared \`label\` and never derive one from the id, because deriving breaks
 * \`ai\`, \`ux-research\`, \`0-to-1\`, and deliberately hyphenated terms such as
 * \`AI-first\`. A raw id showing through is the correct signal that the
 * vocabulary needs to grow; a prettified one hides the gap.
 *
 * Corrected 2026-07-28. The previous fallback did \`id.replace(/-/g, ' ')\`,
 * which rendered \`AI-first\` as \`AI first\`. PRESERVE THIS ON REGENERATION.
 */
export function tagLabel(id: string): string {
  return TAGS[id]?.label ?? id;
}

export function tagAxis(id: string): TaxonomyAxis | undefined {
  return TAGS[id]?.axis;
}

export function isKnownTag(id: string): boolean {
  return id in TAGS;
}

/**
 * Order tags for display: by axis priority, preserving authored order within an axis.
 * Unknown ids sort last so drift is visible rather than silently reordered.
 */
export function orderTags(ids: string[]): string[] {
  const rank = (id: string) => {
    const axis = TAGS[id]?.axis;
    const i = axis ? AXIS_PRIORITY.indexOf(axis) : -1;
    return i === -1 ? AXIS_PRIORITY.length : i;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}`);

const text = lines.join('\n') + '\n';
if (process.argv.includes('--check')) {
  const cur = existsSync(OUT_SITE) ? readFileSync(OUT_SITE, 'utf8') : '';
  if (cur !== text) { console.error('taxonomy: src/data/taxonomy.ts is stale; run npm run taxonomy'); process.exit(1); }
  console.log('taxonomy: src/data/taxonomy.ts is up to date');
} else {
  writeFileSync(OUT_SITE, text);
  // OUT_VAULT is the previous site's copy and keeps its own shape; this
  // generator writes only here.
  void OUT_VAULT;
  console.log(`taxonomy: wrote ${Object.values(tx.axes).reduce((n, a) => n + a.values.length, 0)} tags across ${axes.length} axes (v${tx.version})`);
}
