#!/usr/bin/env node
/**
 * npm run reorder            show what would change
 * npm run reorder -- --apply write the order back into the vault
 * npm run order:check        fail if the Cards disagree with the list
 *
 * ONE FILE DECIDES THE GRID ORDER: case-studies/_order.md in the vault.
 *
 * The generator sorts on `- order:` in each published take's Card, which means
 * reordering the home page meant hand-editing up to twenty-one files, in the
 * right take of each — the published one, which for Lobus and StudioNow is now
 * `short` rather than `decisions-outcomes`. Editing the wrong Card is silent:
 * the number changes, the grid does not.
 *
 * So the list is authoritative and the Cards are derived. `order:check` runs in
 * verify and fails when they disagree, which is what stops this becoming two
 * sources of truth that drift. The Card keeps carrying the number because the
 * generator, the recipient payloads and the take-format check all read it; what
 * changes is that nobody types it.
 *
 * A study may be named by its VAULT FILENAME or its Card slug — eleven of the
 * twenty-five differ, and the filename is what you see in Obsidian.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolveVaultDir } from './vault-dir.mjs';

const VAULT_DIR = resolveVaultDir();
const STUDIES = join(VAULT_DIR, 'case-studies');
const ORDER_FILE = join(STUDIES, '_order.md');

/** Every study, with the Card that the GRID actually reads: the one inside the
 *  take named by `published_take`. */
export function readStudies(dir = STUDIES) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .map((file) => {
      const md = readFileSync(join(dir, file), 'utf8');
      const published = /^published_take:\s*(\S+)\s*$/m.exec(md)?.[1] ?? null;
      let card = null;
      if (published) {
        const parts = md.split(/^## Take — (.+)$/m);
        for (let i = 1; i < parts.length; i += 2) {
          if (parts[i].trim() === published) card = parts[i + 1];
        }
      }
      return {
        file,
        vaultSlug: file.slice(0, -3),
        published,
        cardSlug: card ? (/^- slug:\s*(\S+)/m.exec(card)?.[1] ?? null) : null,
        title: card ? (/^- title:\s*(.+)$/m.exec(card)?.[1]?.trim() ?? '') : '',
        order: card ? Number(/^- order:\s*(\d+)/m.exec(card)?.[1] ?? NaN) : NaN,
        md,
      };
    })
    .filter((s) => s.published);
}

/**
 * The list, read from the FIRST fenced code block in the file.
 *
 * A fence rather than "every non-blank line": the file carries YAML
 * frontmatter and a paragraph of instructions, and a parser that reads bare
 * lines swallowed both — nineteen phantom studies named `title:`, `type:`,
 * `THE`, `Then,` and so on. Prose and a list cannot share a file without a
 * delimiter, and a fence is one Obsidian already renders as a block.
 *
 * Inside the fence: one study per line, an optional `-` or `*` marker, and
 * only the FIRST word is read — the rest is a label for Brett, so a stale
 * title in this file can never break the order.
 */
export function parseOrderFile(text) {
  const fence = /^```[^\n]*\n([\s\S]*?)^```/m.exec(text);
  if (!fence) return [];
  return fence[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/^[-*]\s+/, '').split(/\s+/)[0])
    .filter(Boolean);
}

export function resolve(name, studies) {
  const key = name.toLowerCase();
  const byFile = studies.find((s) => s.vaultSlug.toLowerCase() === key);
  if (byFile) return byFile;
  return studies.find((s) => s.cardSlug && s.cardSlug.toLowerCase() === key) ?? null;
}

/** Rewrites `- order:` inside the PUBLISHED take's Card only. */
export function applyOrder(md, published, order) {
  const marker = `## Take — ${published}`;
  const at = md.indexOf(marker);
  if (at === -1) throw new Error(`take "${published}" not found`);
  const head = md.slice(0, at);
  const tail = md.slice(at);
  const next = tail.replace(/^- order:\s*\d+\s*$/m, `- order: ${order}`);
  if (next === tail) throw new Error(`no "- order:" line in the ${published} Card`);
  return head + next;
}

export function plan(studies, names) {
  const problems = [];
  const seen = new Set();
  const resolved = [];
  names.forEach((name) => {
    const study = resolve(name, studies);
    if (!study) { problems.push(`"${name}" matches no study`); return; }
    if (seen.has(study.file)) { problems.push(`"${name}" is listed twice`); return; }
    seen.add(study.file);
    resolved.push(study);
  });
  for (const s of studies) {
    if (!seen.has(s.file)) problems.push(`${s.vaultSlug} is not in the list — it would have no position`);
  }
  return {
    problems,
    changes: resolved
      .map((s, i) => ({ study: s, from: s.order, to: i }))
      .filter((c) => c.from !== c.to),
    resolved,
  };
}

function main() {
  const apply = process.argv.includes('--apply');
  const check = process.argv.includes('--check');
  const studies = readStudies();

  if (!existsSync(ORDER_FILE)) {
    console.error(`error: ${ORDER_FILE} is missing.`);
    process.exit(1);
  }
  const names = parseOrderFile(readFileSync(ORDER_FILE, 'utf8'));
  if (names.length === 0) {
    console.error(`error: no fenced list found in ${ORDER_FILE}. The order lives inside a \`\`\` block.`);
    process.exit(1);
  }
  const { problems, changes, resolved } = plan(studies, names);

  if (problems.length) {
    for (const p of problems) console.error(`error: ${p}`);
    console.error(`\n${problems.length} problem(s). Every study must appear exactly once.`);
    process.exit(1);
  }

  if (check) {
    if (changes.length) {
      console.error('error: the Cards disagree with case-studies/_order.md:');
      for (const c of changes) console.error(`  ${c.study.vaultSlug}: Card says ${c.from}, the list says ${c.to}`);
      console.error('\nRun: npm run reorder -- --apply && npm run generate');
      process.exit(1);
    }
    console.log(`order: ${resolved.length} studies, Cards match _order.md`);
    return;
  }

  if (changes.length === 0) { console.log('order: nothing to change'); return; }

  console.log(`order: ${changes.length} of ${resolved.length} studies move\n`);
  for (const c of changes) {
    console.log(`  ${String(c.from).padStart(2)} -> ${String(c.to).padStart(2)}  ${c.study.title || c.study.vaultSlug}`);
  }
  if (!apply) { console.log('\nDRY RUN. Nothing written. Re-run with --apply.'); return; }

  for (const c of changes) {
    writeFileSync(join(STUDIES, c.study.file), applyOrder(c.study.md, c.study.published, c.to));
  }
  console.log(`\nwrote ${changes.length} file(s). Now run: npm run generate && npm run verify`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
