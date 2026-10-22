#!/usr/bin/env node
/**
 * Publish-time validation of recipient payloads. Brett's ruling: a card with
 * no full study behind it means something upstream is broken, and degrading
 * gracefully in front of a person hides that. So it fails HERE, loudly, in
 * verify, before a payload can ship.
 *
 * For every <vault>/recipients/*.payload.json:
 *   - every pick resolves: it carries an embedded `study`, or its
 *     `case_study` (after caseStudySlugAliases) exists in the public bundle
 *   - every embedded study is complete enough to render a DETAIL page. This
 *     is the same question `isDetailReadyStudy` asks in src/lib/recipient.ts;
 *     keep the two lists of required fields in agreement — each names the
 *     other in a comment.
 *   - a pick's `take`, when present, names a format in the vault's
 *     take-formats.json
 *
 * Usage:
 *   node scripts/check-recipient-payloads.mjs            check the vault
 *   node scripts/check-recipient-payloads.mjs --dir <d>  check another dir
 *                                                        (negative control, tests)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveVaultDir } from './vault-dir.mjs';
import { fileURLToPath } from 'node:url';

const VAULT_DIR = resolveVaultDir();
const dirFlag = process.argv.indexOf('--dir');
const PAYLOAD_DIR = dirFlag !== -1 ? process.argv[dirFlag + 1] : join(VAULT_DIR, 'recipients');
const ROOT = fileURLToPath(new URL('..', import.meta.url));

if (!existsSync(PAYLOAD_DIR)) {
  console.error(`recipient payloads: directory not found: ${PAYLOAD_DIR}`);
  process.exit(1);
}

// The public bundle's slugs, read as text like every other bundle check here:
// the file is generated TS that node cannot import. Over-collection (a take's
// repeated slug) is harmless for an existence check.
const bundle = readFileSync(join(ROOT, 'src/data/caseStudies.ts'), 'utf8');
const publicSlugs = new Set([...bundle.matchAll(/\bslug: "([^"]+)"/g)].map((m) => m[1]));

// The alias map's one source is src/data/recipients.ts; parse the literal
// rather than duplicating it, so an alias added there is honoured here.
const recipientsTs = readFileSync(join(ROOT, 'src/data/recipients.ts'), 'utf8');
const aliasBlock = /caseStudySlugAliases[^=]*=\s*\{([^}]*)\}/.exec(recipientsTs)?.[1] ?? '';
const aliases = Object.fromEntries(
  [...aliasBlock.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
);

const formats = new Set(
  Object.keys(JSON.parse(readFileSync(join(VAULT_DIR, 'take-formats.json'), 'utf8')).formats)
);

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const nonEmptyStringArray = (v) => Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);

/**
 * Mirror of `isDetailReadyStudy` + `isEmbeddedStudy` in src/lib/recipient.ts
 * (which names this script in its comment): the card fields plus everything
 * the detail page renders. Returns the missing field names.
 */
function missingDetailFields(study) {
  const missing = [];
  if (!isNonEmptyString(study.slug)) missing.push('slug');
  if (!isNonEmptyString(study.title)) missing.push('title');
  if (!isNonEmptyString(study.outcome)) missing.push('outcome');
  if (!nonEmptyStringArray(study.tags)) missing.push('tags');
  if (!isNonEmptyString(study.problem)) missing.push('problem');
  if (!isNonEmptyString(study.role)) missing.push('role');
  if (!isNonEmptyString(study.result)) missing.push('result');
  if (!nonEmptyStringArray(study.built)) missing.push('built');
  return missing;
}

const problems = [];
const files = readdirSync(PAYLOAD_DIR).filter((f) => f.endsWith('.payload.json')).sort();

for (const file of files) {
  const recipientSlug = file.replace(/\.payload\.json$/, '');
  let payload;
  try {
    payload = JSON.parse(readFileSync(join(PAYLOAD_DIR, file), 'utf8'));
  } catch (error) {
    problems.push([recipientSlug, '(whole payload)', `unparseable JSON: ${error.message}`]);
    continue;
  }
  if (!Array.isArray(payload.picks) || payload.picks.length === 0) {
    problems.push([recipientSlug, '(whole payload)', 'no picks']);
    continue;
  }

  for (const pick of payload.picks) {
    const label = typeof pick.case_study === 'string' ? pick.case_study : '(unnamed pick)';

    if (pick.study !== undefined) {
      const missing = missingDetailFields(pick.study);
      if (missing.length > 0) {
        problems.push([recipientSlug, label, `embedded study cannot render a detail page; missing: ${missing.join(', ')}`]);
      }
    } else {
      const resolved = aliases[pick.case_study] ?? pick.case_study;
      if (!publicSlugs.has(resolved)) {
        problems.push([recipientSlug, label, `no embedded study and "${resolved}" is not in the public bundle`]);
      }
    }

    if (pick.take !== undefined && !formats.has(pick.take)) {
      problems.push([recipientSlug, label, `take "${pick.take}" is not a format in take-formats.json (known: ${[...formats].join(', ')})`]);
    }
  }
}

if (problems.length > 0) {
  console.error(`recipient payloads: ${problems.length} problem(s) that would reach a person:`);
  for (const [recipient, pick, what] of problems) {
    console.error(`  ${recipient} · pick "${pick}": ${what}`);
  }
  process.exit(1);
}
console.log(`recipient payloads: ${files.length} payload(s) valid; every pick resolves and renders`);
