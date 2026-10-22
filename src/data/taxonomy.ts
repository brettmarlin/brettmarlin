// GENERATED FROM taxonomy.json IN THE MARLIIN VAULT. DO NOT EDIT BY HAND.
// Regenerate with `npm run taxonomy` whenever the canonical vocabulary changes.
// taxonomy.json version 1.3.1 / 2026-08-20

export type TaxonomyAxis =
  | 'discipline'
  | 'judgment'
  | 'engagement-model'
  | 'system-mindset'
  | 'industry-vertical'
  | 'outcome'
  | 'buyer-archetype'

export type TagMeta = {
  label: string;
  axis: TaxonomyAxis;
  business: 'brett-marlin' | 'marliin' | 'both';
};

export const TAGS: Record<string, TagMeta> = {
  // --- discipline ---
  '0-to-1': { label: '0-to-1', axis: 'discipline', business: 'both' },
  'agentic-systems': { label: 'Agentic systems', axis: 'discipline', business: 'both' },
  'ai': { label: 'AI', axis: 'discipline', business: 'both' },
  'ai-native-product-design': { label: 'AI-native product design', axis: 'discipline', business: 'both' },
  'ai-native-prototyping': { label: 'AI-native prototyping', axis: 'discipline', business: 'both' },
  'ai-ops': { label: 'AI ops', axis: 'discipline', business: 'both' },
  'ai-product': { label: 'AI product', axis: 'discipline', business: 'both' },
  'content-platform-design': { label: 'Content platform design', axis: 'discipline', business: 'both' },
  'content-strategy': { label: 'Content strategy', axis: 'discipline', business: 'both' },
  'conversation-design': { label: 'Conversation design', axis: 'discipline', business: 'both' },
  'data-modeling': { label: 'Data modeling', axis: 'discipline', business: 'both' },
  'data-visualization': { label: 'Data visualization', axis: 'discipline', business: 'both' },
  'design-engineering': { label: 'Design engineering', axis: 'discipline', business: 'both' },
  'design-leadership': { label: 'Design leadership', axis: 'discipline', business: 'both' },
  'design-ops': { label: 'DesignOps', axis: 'discipline', business: 'both' },
  'design-systems': { label: 'Design systems', axis: 'discipline', business: 'both' },
  'design-technology': { label: 'Design technology', axis: 'discipline', business: 'brett-marlin' },
  'enterprise': { label: 'Enterprise', axis: 'discipline', business: 'both' },
  'founder': { label: 'Founder', axis: 'discipline', business: 'marliin' },
  'governance-design': { label: 'Governance design', axis: 'discipline', business: 'both' },
  'information-architecture': { label: 'Information architecture', axis: 'discipline', business: 'both' },
  'interaction-architecture': { label: 'Interaction architecture', axis: 'discipline', business: 'both' },
  'marketing-design': { label: 'Marketing design', axis: 'discipline', business: 'both' },
  'mobile-design': { label: 'Mobile design', axis: 'discipline', business: 'both' },
  'on-device': { label: 'On-device', axis: 'discipline', business: 'both' },
  'platform-architecture': { label: 'Platform architecture', axis: 'discipline', business: 'both' },
  'privacy-by-design': { label: 'Privacy by design', axis: 'discipline', business: 'both' },
  'product-design': { label: 'Product design', axis: 'discipline', business: 'both' },
  'product-strategy': { label: 'Product strategy', axis: 'discipline', business: 'both' },
  'prompt-architecture': { label: 'Prompt architecture', axis: 'discipline', business: 'both' },
  'research-program-design': { label: 'Research program design', axis: 'discipline', business: 'both' },
  'safety-trust': { label: 'Safety and trust', axis: 'discipline', business: 'both' },
  'service-design': { label: 'Service design', axis: 'discipline', business: 'both' },
  'systems-design': { label: 'Systems design', axis: 'discipline', business: 'both' },
  'team-building': { label: 'Team building', axis: 'discipline', business: 'both' },
  'ux-research': { label: 'UX research', axis: 'discipline', business: 'both' },
  'voice-interaction': { label: 'Voice interaction', axis: 'discipline', business: 'both' },
  'web3-authentication': { label: 'Web3 and on-chain authentication', axis: 'discipline', business: 'both' },
  'workflow-design': { label: 'Workflow design', axis: 'discipline', business: 'both' },
  // --- judgment ---
  'taste-judgment': { label: 'Taste and judgment', axis: 'judgment', business: 'both' },
  'business-literacy': { label: 'Business literacy', axis: 'judgment', business: 'both' },
  'systems-thinking': { label: 'Systems thinking', axis: 'judgment', business: 'both' },
  'executive-communication': { label: 'Executive communication', axis: 'judgment', business: 'both' },
  'cross-functional-leadership': { label: 'Cross-functional leadership', axis: 'judgment', business: 'both' },
  // --- engagement-model ---
  'full-time-process': { label: 'Full-time', axis: 'engagement-model', business: 'brett-marlin' },
  'diagnostic-sprint': { label: 'Diagnostic sprint', axis: 'engagement-model', business: 'both' },
  'embedded-retainer': { label: 'Embedded retainer', axis: 'engagement-model', business: 'marliin' },
  'outcomes-build': { label: 'Outcomes build', axis: 'engagement-model', business: 'marliin' },
  'forward-deployed-ai-design': { label: 'Forward deployed', axis: 'engagement-model', business: 'both' },
  'agency-engagement': { label: 'Agency engagement', axis: 'engagement-model', business: 'brett-marlin' },
  // --- system-mindset ---
  'deterministic-systems': { label: 'Deterministic systems', axis: 'system-mindset', business: 'brett-marlin' },
  'probabilistic-systems': { label: 'Probabilistic systems', axis: 'system-mindset', business: 'both' },
  // --- industry-vertical ---
  'supply-chain': { label: 'Supply chain', axis: 'industry-vertical', business: 'both' },
  'defense-govtech': { label: 'Defense and govtech', axis: 'industry-vertical', business: 'both' },
  'media-entertainment': { label: 'Media and entertainment', axis: 'industry-vertical', business: 'both' },
  'edtech': { label: 'Edtech', axis: 'industry-vertical', business: 'both' },
  'devtools-analytics': { label: 'Developer tools and analytics', axis: 'industry-vertical', business: 'both' },
  'fintech': { label: 'Fintech', axis: 'industry-vertical', business: 'both' },
  'art-collectibles': { label: 'Art and collectibles', axis: 'industry-vertical', business: 'both' },
  'risk-intelligence': { label: 'Risk intelligence', axis: 'industry-vertical', business: 'both' },
  'corrections-justice': { label: 'Corrections and justice technology', axis: 'industry-vertical', business: 'both' },
  'gaming-sports': { label: 'Gaming and sports', axis: 'industry-vertical', business: 'both' },
  // --- outcome ---
  'architecture': { label: 'Architecture', axis: 'outcome', business: 'both' },
  'ai-capability': { label: 'AI', axis: 'outcome', business: 'both' },
  'system-adoption': { label: 'Design systems', axis: 'outcome', business: 'both' },
  'adoption': { label: 'Adoption', axis: 'outcome', business: 'both' },
  'research-validation': { label: 'Research and validation', axis: 'outcome', business: 'both' },
  'org-transformation': { label: 'Org transformation', axis: 'outcome', business: 'both' },
  'reliability': { label: 'Reliability', axis: 'outcome', business: 'both' },
  'launched': { label: '0-to-1', axis: 'outcome', business: 'both' },
  'gtm': { label: 'Go-to-market', axis: 'outcome', business: 'both' },
  'velocity': { label: 'Velocity', axis: 'outcome', business: 'both' },
  // --- buyer-archetype ---
  'design-leadership-buyer': { label: 'Design leadership (buyer)', axis: 'buyer-archetype', business: 'both' },
  'technical-founder-operator': { label: 'Technical founder-operator', axis: 'buyer-archetype', business: 'marliin' },
  'fractional-ai-leadership': { label: 'Fractional AI leadership', axis: 'buyer-archetype', business: 'marliin' },
  'ai-native-design-leadership': { label: 'AI-native design leadership', axis: 'buyer-archetype', business: 'marliin' },
  'design-systems-leadership': { label: 'Design systems leadership', axis: 'buyer-archetype', business: 'both' },
  'enterprise-product-design': { label: 'Enterprise product design', axis: 'buyer-archetype', business: 'both' },
  'ai-systems-architecture': { label: 'AI systems architecture', axis: 'buyer-archetype', business: 'both' },
};

/** Axis render order when a tag row is truncated: most distinguishing first. */
export const AXIS_PRIORITY: TaxonomyAxis[] = [
  'discipline',
  'judgment',
  'industry-vertical',
  'system-mindset',
  'engagement-model',
  'outcome',
  'buyer-archetype',
];

/**
 * Unknown ids render VERBATIM. Do not transform them: no hyphen stripping, no
 * title casing. metadata-standard.md is explicit that consumers render the
 * declared `label` and never derive one from the id, because deriving breaks
 * `ai`, `ux-research`, `0-to-1`, and deliberately hyphenated terms such as
 * `AI-first`. A raw id showing through is the correct signal that the
 * vocabulary needs to grow; a prettified one hides the gap.
 *
 * Corrected 2026-07-28. The previous fallback did `id.replace(/-/g, ' ')`,
 * which rendered `AI-first` as `AI first`. PRESERVE THIS ON REGENERATION.
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
}
