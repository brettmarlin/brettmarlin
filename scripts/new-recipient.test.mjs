/**
 * The recipient builder's pure half: hash convention, company slugging,
 * pick resolution across the vault-filename/site-slug divergence, and the
 * assembled file's shape against the trm-labs-gj2nev reference. The
 * interactive prompting is I/O and stays untested, by design.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleRecipient,
  generateHash,
  recipientSlug,
  resolvePickFile,
  slugifyCompany,
} from './new-recipient.mjs';

test('the hash is six lowercase Crockford base32 chars — no i, l, o, u', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(generateHash(), /^[0-9abcdefghjkmnpqrstvwxyz]{6}$/);
  }
  // Deterministic when the randomness is injected, so the mapping itself
  // is pinned: byte % 32 indexes the alphabet.
  const fixed = generateHash(() => Buffer.from([0, 1, 33, 31, 32, 10]));
  assert.equal(fixed, '011z0a');
});

test('company names slug the way the existing recipients do', () => {
  assert.equal(slugifyCompany('TRM Labs'), 'trm-labs');
  assert.equal(slugifyCompany('Tribe AI'), 'tribe-ai');
  assert.equal(slugifyCompany('  Weird & Co.  '), 'weird-co');
  assert.equal(recipientSlug('TRM Labs', 'gj2nev'), 'trm-labs-gj2nev');
});

test('a pick resolves by vault filename, by site slug, or not at all', () => {
  const vaultFiles = ['sayari-design-org-turnaround', 'convoy-defense-agentic-governance'];
  const bySiteSlug = { 'sayari-design-org-turnaround': 'sayari-design-org-turnaround', 'agentic-decision-layer-defense': 'convoy-defense-agentic-governance' };
  assert.equal(resolvePickFile('sayari-design-org-turnaround', vaultFiles, bySiteSlug), 'sayari-design-org-turnaround');
  assert.equal(resolvePickFile('case-studies/sayari-design-org-turnaround.md', vaultFiles, bySiteSlug), 'sayari-design-org-turnaround', 'a pasted link path is forgiven');
  assert.equal(
    resolvePickFile('agentic-decision-layer-defense', vaultFiles, bySiteSlug),
    'convoy-defense-agentic-governance',
    'a site slug maps back to the vault file that declares it'
  );
  assert.equal(resolvePickFile('not-a-study', vaultFiles, bySiteSlug), null);
});

test('the assembled file matches the reference shape: field order, quoting, draft status, placeholders', () => {
  const { slug, content } = assembleRecipient({
    company: 'TRM Labs',
    recipientName: 'TRM Labs hiring team',
    recipientTitle: 'Hiring team',
    companyContext: 'Blockchain intelligence platform.',
    role: 'Head of Product Design',
    jd: 'https://trmlabs.com/careers',
    callout: 'Selected work for the TRM Labs design team',
    intro: 'Five projects chosen deliberately.',
    picks: [
      { file: 'sayari-design-org-turnaround', take: 'decisions-outcomes', framing: 'Closest domain match, with a "quoted" phrase.' },
    ],
    hash: 'gj2nev',
    created: '2026-08-16',
  });
  assert.equal(slug, 'trm-labs-gj2nev');
  const keys = [...content.matchAll(/^([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys, [
    'type', 'slug', 'recipient_name', 'recipient_title', 'company', 'company_context',
    'created', 'updated', 'status', 'hash', 'framing', 'role', 'jd', 'callout', 'intro',
    'picks', 'expires', 'protected', 'password_hash', 'password_salt',
  ], 'field order mirrors recipients/trm-labs-gj2nev.md');
  assert.match(content, /^status: draft$/m, 'never live from this tool');
  assert.match(content, /^framing: brett-marlin$/m);
  assert.match(content, /^password_hash: STORED_IN_WORKER_KV$/m);
  assert.match(content, /^  - case_study: "\[\[case-studies\/sayari-design-org-turnaround\]\]"$/m);
  assert.match(content, /^    take: decisions-outcomes$/m);
  assert.match(content, /framing: "Closest domain match, with a \\"quoted\\" phrase\."/, 'quotes inside a framing are escaped');
  assert.match(content, /\n# Selected work for the TRM Labs design team\n/, 'the body opens with the callout as H1');
});

test('an empty recipient name is written as an empty string, not omitted', () => {
  // The other half of the personalization work: a nameless recipient must
  // reach the site as recipient_name: "" and render the generic phrase.
  const { content } = assembleRecipient({
    company: 'Acme', recipientName: '', recipientTitle: '', companyContext: 'x',
    role: '', jd: '', callout: 'Selected work for Acme', intro: '',
    picks: [{ file: 'a', take: 'decisions-outcomes', framing: 'why' }],
    hash: 'abc234', created: '2026-08-16',
  });
  assert.match(content, /^recipient_name: ""$/m);
  assert.match(content, /^expires:$/m, 'expiry stays open until publish time');
  assert.match(content, /^protected:$/m, 'protected is derived at publish, not chosen here');
});
