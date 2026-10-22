import type { RecipientPayload, RecipientPick } from './api';
import { findStudy, type CaseStudy } from './studies';

export type ResolvedPick = { pick: RecipientPick; study: CaseStudy; gated: boolean };

/** A pick either embeds its study (gated) or names one in the public bundle.
 *  Anything that resolves to neither is dropped, loudly in dev. */
export function resolvePicks(payload: RecipientPayload): ResolvedPick[] {
  const out: ResolvedPick[] = [];
  for (const pick of payload.picks ?? []) {
    if (pick.study) { out.push({ pick, study: pick.study, gated: true }); continue; }
    const slug = (pick.case_study ?? '').replace(/^\[\[case-studies\//, '').replace(/\]\]$/, '').replace(/\.md$/, '');
    const study = findStudy(slug);
    if (study) out.push({ pick, study, gated: false });
    else if (import.meta.env.DEV) console.warn(`recipient pick "${slug}" is not in the public bundle and carries no embedded study`);
  }
  return out;
}

/** The big line on a recipient page. Falls back from the authored callout. */
export function callout(payload: Pick<RecipientPayload, 'callout' | 'company' | 'recipient_name'>): string {
  if (payload.callout?.trim()) return payload.callout.trim();
  if (payload.company) return `Selected work for ${payload.company}`;
  return 'Selected work';
}

/** Crockford base32 slug check: company-xxxxxx. */
export function isRecipientSlug(s: string): boolean {
  return /^[a-z0-9-]+-[0-9a-hjkmnp-tv-z]{5,8}$/.test(s);
}
