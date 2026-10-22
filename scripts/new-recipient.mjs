#!/usr/bin/env node
/**
 * Interactive recipient builder: walks Brett through a new
 * recipients/<slug>.md — company, recipient, role, callout, and each pick's
 * personal framing captured in the same pass, while he is still thinking
 * about the recipient, instead of hand-assembling the file in Obsidian
 * afterward.
 *
 * The first interactive script in this codebase (everything else is
 * flag-driven); node's readline/promises is enough, no prompt dependency.
 * The pure half — hash, slug, pick resolution, file assembly — is exported
 * and tested (new-recipient.test.mjs) the way bind-heroes and ship-beats
 * keep their logic separable from their I/O.
 *
 * What it deliberately does NOT do:
 * - status is always `draft`. Publishing to the Worker KV stays Brett's own
 *   deliberate step, same as today.
 * - `protected`/`expires` are left blank: protected is DERIVED (true if any
 *   pick draws a gated take, per _templates/recipient.md), decided at
 *   publish time, not authoring time.
 * - A gated pick's embedded study is generate-recipient-study.mjs's job;
 *   this tool records the pick and its framing and says so.
 *
 * Usage:  npm run new-recipient
 *   VAULT_DIR overrides the vault location (default ~/Dev/marliin-vault)
 */
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveVaultDir } from './vault-dir.mjs';
import { fileURLToPath } from 'node:url';

const VAULT_DIR = resolveVaultDir();
const SITE_BUNDLE = fileURLToPath(new URL('../src/data/caseStudies.ts', import.meta.url));

// The vault's convention (working/bespoke-portfolio-design.md): 6 chars of
// Crockford base32 — no i, l, o, u — lowercase as every existing recipient
// writes it. ~1 billion combinations; the hash is what makes /for/<slug>
// unguessable.
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';
export function generateHash(random = randomBytes) {
  const bytes = random(6);
  let out = '';
  for (let i = 0; i < 6; i += 1) out += CROCKFORD[bytes[i] % 32];
  return out;
}

export function slugifyCompany(company) {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function recipientSlug(company, hash) {
  return `${slugifyCompany(company)}-${hash}`;
}

// A pick may be typed as a vault filename (what the [[link]] needs) or as a
// public site slug (what Brett sees in URLs); the two diverge on several
// studies. Resolution: exact vault filename first, then a site slug mapped
// back through the vault file that declares it.
export function resolvePickFile(input, vaultFiles, fileBySiteSlug) {
  const name = input.replace(/\.md$/, '').replace(/^case-studies\//, '').trim();
  if (vaultFiles.includes(name)) return name;
  if (fileBySiteSlug[name]) return fileBySiteSlug[name];
  return null;
}

const yaml = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// The full file, matching recipients/trm-labs-gj2nev.md's frontmatter shape
// and field order (and _templates/recipient.md's guidance for the fields an
// authoring pass leaves open).
export function assembleRecipient(answers) {
  const {
    company, recipientName, recipientTitle, companyContext,
    role, jd, callout, intro, picks, hash, created
  } = answers;
  const slug = recipientSlug(company, hash);
  const lines = [
    '---',
    'type: recipient',
    `slug: ${slug}`,
    `recipient_name: ${yaml(recipientName)}`,
    `recipient_title: ${yaml(recipientTitle)}`,
    `company: ${yaml(company)}`,
    `company_context: ${yaml(companyContext)}`,
    `created: ${created}`,
    `updated: ${created}`,
    'status: draft',
    `hash: ${hash}`,
    'framing: brett-marlin',
    `role: ${yaml(role)}`,
    `jd: ${yaml(jd)}`,
    `callout: ${yaml(callout)}`,
    `intro: ${yaml(intro)}`,
    'picks:',
    ...picks.flatMap((pick) => [
      `  - case_study: "[[case-studies/${pick.file}]]"`,
      `    take: ${pick.take}`,
      `    framing: ${yaml(pick.framing)}`,
    ]),
    'expires:',
    'protected:',
    'password_hash: STORED_IN_WORKER_KV',
    'password_salt: STORED_IN_WORKER_KV',
    '---',
    '',
    `# ${callout}`,
    '',
  ];
  return { slug, content: lines.join('\n') };
}

// --- I/O half ----------------------------------------------------------------

function loadCaseStudyIndex(vaultDir, siteBundlePath) {
  const caseDir = join(vaultDir, 'case-studies');
  const vaultFiles = existsSync(caseDir) ?
    readdirSync(caseDir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => f.replace(/\.md$/, '')) :
    [];
  const fileBySiteSlug = {};
  for (const file of vaultFiles) {
    const head = readFileSync(join(caseDir, `${file}.md`), 'utf8').slice(0, 2000);
    const declared = /^slug:\s*"?([^"\n]+)"?\s*$/m.exec(head);
    if (declared) fileBySiteSlug[declared[1].trim()] = file;
  }
  const publicSlugs = existsSync(siteBundlePath) ?
    [...readFileSync(siteBundlePath, 'utf8').matchAll(/^    slug: "([^"]+)",$/gm)].map((m) => m[1]) :
    [];
  return { vaultFiles, fileBySiteSlug, publicSlugs };
}

async function askMultiline(rl, label) {
  console.log(`${label} (finish with an empty line):`);
  const lines = [];
  for (;;) {
    const line = await rl.question('  > ');
    if (!line.trim()) break;
    lines.push(line.trim());
  }
  return lines.join(' ');
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const index = loadCaseStudyIndex(VAULT_DIR, SITE_BUNDLE);
  console.log('New recipient. Every answer maps to a recipients/<slug>.md field;');
  console.log('the file lands as status: draft — publishing stays a separate step.\n');

  let company = '';
  while (!company.trim()) company = await rl.question('Company (required, -> company): ');
  company = company.trim();

  const recipientName = (await rl.question('Recipient name (optional, Enter to skip — a blank name reads "Selected case studies for a company" on the site, -> recipient_name): ')).trim();
  const recipientTitle = (await rl.question('Recipient title/role they hold, e.g. "Hiring team" (-> recipient_title): ')).trim();
  const companyContext = await askMultiline(rl, 'Company context, one or two sentences (-> company_context)');
  const role = (await rl.question('Role being pursued (optional, -> role): ')).trim();
  const jd = (await rl.question('JD link (optional, -> jd): ')).trim();
  const callout = (await rl.question('Callout — the big H1, e.g. "Selected work for the TRM Labs design team" (-> callout): ')).trim();
  const intro = await askMultiline(rl, 'Intro paragraph (optional, -> intro)');

  const picks = [];
  console.log('\nPicks, in order. Empty slug when done.');
  for (;;) {
    const raw = (await rl.question(`\nPick ${picks.length + 1} — case-study slug (vault filename or site slug, empty to finish): `)).trim();
    if (!raw) break;
    const file = resolvePickFile(raw, index.vaultFiles, index.fileBySiteSlug);
    if (!file) {
      const near = index.vaultFiles.filter((f) => f.includes(raw.slice(0, 6))).slice(0, 5);
      console.log(`  Not a vault case study or site slug.${near.length ? ` Close: ${near.join(', ')}` : ''}`);
      continue;
    }
    const siteSlug = Object.entries(index.fileBySiteSlug).find(([, f]) => f === file)?.[0] ?? file;
    if (!index.publicSlugs.includes(siteSlug)) {
      console.log(`  note: "${file}" is not in the public bundle. If this pick draws a gated take, run`);
      console.log('  generate-recipient-study.mjs separately and embed its output in the payload at publish time.');
    }
    const take = (await rl.question('  Take (Enter for decisions-outcomes): ')).trim() || 'decisions-outcomes';
    const framing = await askMultiline(rl, '  Framing — why you chose this for them');
    if (!framing) {
      console.log('  A pick without a framing is the thing this tool exists to prevent. Pick skipped.');
      continue;
    }
    picks.push({ file, take, framing });
  }
  if (picks.length === 0) {
    console.log('\nNo picks; nothing written.');
    rl.close();
    return;
  }

  let hash = generateHash();
  for (;;) {
    const answer = (await rl.question(`\nSlug will be "${recipientSlug(company, hash)}" (Enter to accept, r to reroll the hash): `)).trim();
    if (answer.toLowerCase() !== 'r') break;
    hash = generateHash();
  }
  rl.close();

  const created = new Date().toISOString().slice(0, 10);
  const { slug, content } = assembleRecipient({
    company, recipientName, recipientTitle, companyContext, role, jd, callout, intro, picks, hash, created
  });
  const outPath = join(VAULT_DIR, 'recipients', `${slug}.md`);
  if (existsSync(outPath)) {
    console.error(`error: ${outPath} already exists; not overwriting.`);
    process.exit(1);
  }
  writeFileSync(outPath, content);
  console.log(`\nwrote ${outPath} (status: draft, ${picks.length} pick${picks.length === 1 ? '' : 's'}).`);
  console.log('Next: review in Obsidian; gated picks need generate-recipient-study.mjs; publishing to KV is your separate step.');
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  });
}
