import type { RecipientRecord } from './api';

const yaml = (v: unknown) => `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** The vault's recipients/<slug>.md shape, so a record authored in the admin
 *  can be pasted back into the record of truth. The password never appears. */
export function recipientMarkdown(r: RecipientRecord): string {
  const lines = [
    '---',
    'type: recipient',
    `slug: ${r.slug}`,
    `recipient_name: ${yaml(r.recipient_name)}`,
    `recipient_title: ${yaml(r.recipient_title)}`,
    `company: ${yaml(r.company)}`,
    `company_context: ${yaml(r.company_context)}`,
    `created: ${(r.created ?? '').slice(0, 10)}`,
    `updated: ${(r.updated ?? '').slice(0, 10)}`,
    `status: ${r.status}`,
    `hash: ${r.slug.split('-').pop() ?? ''}`,
    'framing: brett-marlin',
    `role: ${yaml(r.role)}`,
    `jd: ${yaml(r.jd)}`,
    `funnel_stage: ${r.funnel_stage ?? ''}`,
    `access_mode: ${r.access_mode ?? ''}`,
    `callout: ${yaml(r.callout)}`,
    `intro: ${yaml(r.intro)}`,
    'picks:',
    ...r.picks.flatMap((p) => [
      `  - case_study: "[[case-studies/${p.case_study}]]"`,
      `    take: ${p.take ?? (p.study ? 'recipient-named' : 'decisions-outcomes')}`,
      `    framing: ${yaml(p.framing)}`,
    ]),
    `expires: ${r.expires ?? ''}`,
    `protected: ${r.protected ? 'true' : 'false'}`,
    'password_hash: STORED_IN_WORKER_KV',
    'password_salt: STORED_IN_WORKER_KV',
    'domain: career',
    '---',
    '',
    `# ${r.callout || `Selected work for ${r.company}`}`,
    '',
  ];
  return lines.join('\n');
}

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** The recipients/<slug>.payload.json shape the vault publisher sends: what
 *  the page renders and nothing that governs access. */
export function payloadJson(r: RecipientRecord): string {
  const { slug, status, has_password, notes, jd, role, password_set, ...rest } = r;
  void slug; void status; void has_password; void notes; void jd; void role; void password_set;
  const picks = r.picks.map((p) => ({ case_study: p.case_study, ...(p.take ? { take: p.take } : {}), framing: p.framing, ...(p.gated ? { gated: true } : {}), ...(p.study ? { study: p.study } : {}), ...(p.demand ? { demand: p.demand } : {}) }));
  return JSON.stringify({ ...rest, picks }, null, 2) + '\n';
}
