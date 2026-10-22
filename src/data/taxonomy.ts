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
  definition: string;
  business: 'brett-marlin' | 'marliin' | 'both';
};

export const TAGS: Record<string, TagMeta> = {
  // --- discipline ---
  '0-to-1': { label: '0-to-1', axis: 'discipline', business: 'both', definition: 'Founding or greenfield build.' },
  'agentic-systems': { label: 'Agentic systems', axis: 'discipline', business: 'both', definition: 'Designing agent behavior: handoff, supervision, override, autonomy boundaries.' },
  'ai': { label: 'AI', axis: 'discipline', business: 'both', definition: 'General AI/ML-adjacent product work.' },
  'ai-native-product-design': { label: 'AI-native product design', axis: 'discipline', business: 'both', definition: 'Designing the product around what the model can and cannot do, rather than bolting AI onto an existing surface. 6 assignments and no home in v1.0.' },
  'ai-native-prototyping': { label: 'AI-native prototyping', axis: 'discipline', business: 'both', definition: 'Building with AI-assisted or AI-generated code as the default prototyping mode, not as a novelty. Prototype as default output rather than polished deliverable.' },
  'ai-ops': { label: 'AI ops', axis: 'discipline', business: 'both', definition: 'Running agents in production: governance, drift capture, incident recovery, evaluation loops.' },
  'ai-product': { label: 'AI product', axis: 'discipline', business: 'both', definition: 'Product work where the AI capability is the product, not a feature. Narrower than `ai`, which stays for AI-adjacent work.' },
  'content-platform-design': { label: 'Content platform design', axis: 'discipline', business: 'both', definition: 'Editorial and content production platforms, and the workflows of the people who fill them.' },
  'content-strategy': { label: 'Content strategy', axis: 'discipline', business: 'both', definition: 'Planning content as part of a product or system: its purpose, structure, governance, lifecycle, and operating model. Distinct from content-platform-design, which describes the tools and workflows used to produce it.' },
  'conversation-design': { label: 'Conversation design', axis: 'discipline', business: 'both', definition: 'Dialogue models, escalation paths, refusal and error handling.' },
  'data-modeling': { label: 'Data modeling', axis: 'discipline', business: 'both', definition: 'Structuring complex domain data so people can navigate and act on it.' },
  'data-visualization': { label: 'Data visualization', axis: 'discipline', business: 'both', definition: 'Designing how quantitative information is read and acted on: chart and dashboard form, encoding choice, density, and the judgement about what a number is for. Distinct from data-modeling, which is the shape of the data underneath.' },
  'design-engineering': { label: 'Design engineering', axis: 'discipline', business: 'both', definition: 'Hybrid design/code capability that collapses the design-to-engineering handoff. Supersedes the old `frontend` tag.' },
  'design-leadership': { label: 'Design leadership', axis: 'discipline', business: 'both', definition: 'Leading a design function: direction, standards, org design.' },
  'design-ops': { label: 'DesignOps', axis: 'discipline', business: 'both', definition: 'Installing design process: intake rigour, estimation, velocity measurement, team ratios.' },
  'design-systems': { label: 'Design systems', axis: 'discipline', business: 'both', definition: 'Token and component systems; design-to-code fidelity.' },
  'design-technology': { label: 'Design technology', axis: 'discipline', business: 'brett-marlin', definition: 'A dedicated design tooling/infrastructure function inside an org (e.g. Carta).' },
  'enterprise': { label: 'Enterprise', axis: 'discipline', business: 'both', definition: 'Enterprise-scale organizational and product context.' },
  'founder': { label: 'Founder', axis: 'discipline', business: 'marliin', definition: 'Founder-level ownership and accountability.' },
  'governance-design': { label: 'Governance design', axis: 'discipline', business: 'both', definition: 'Designing the rules a system enforces on itself: gates, jurisdiction, promotion criteria, drift capture.' },
  'information-architecture': { label: 'Information architecture', axis: 'discipline', business: 'both', definition: 'Structuring content, navigation and object relationships so a system is legible. Absent from v1.0; 8 assignments across two fields.' },
  'interaction-architecture': { label: 'Interaction architecture', axis: 'discipline', business: 'both', definition: 'The structure of an interaction rather than its screens: what the system asks, what it decides, what it hands back to a person, and where control changes hands. Distinct from information-architecture, which structures content and objects. Added 2026-08-12 from Convoy\'s Card, which had used it on the site since before the vocabulary could name it.' },
  'marketing-design': { label: 'Marketing design', axis: 'discipline', business: 'both', definition: 'Design in service of demand: campaigns, launch surfaces, landing pages, and the visual system that carries them. Distinct from product design in who it is for and what it is measured on.' },
  'mobile-design': { label: 'Mobile design', axis: 'discipline', business: 'both', definition: 'Designing for phone and tablet as the primary surface, where the constraints (one-handed use, capture in the field, intermittent connectivity, native platform conventions) drive the product rather than decorate it. Distinct from responsive work on a desktop-first product.' },
  'on-device': { label: 'On-device', axis: 'discipline', business: 'both', definition: 'Local/on-device processing with no cloud dependency.' },
  'platform-architecture': { label: 'Platform architecture', axis: 'discipline', business: 'both', definition: 'Information architecture at platform scale, across many use cases.' },
  'privacy-by-design': { label: 'Privacy by design', axis: 'discipline', business: 'both', definition: 'Privacy as an architectural constraint rather than a feature bolted on.' },
  'product-design': { label: 'Product design', axis: 'discipline', business: 'both', definition: 'End-to-end product design: flows, interfaces, and the decisions behind them. Absent from v1.0 despite being the base discipline of 5 studies.' },
  'product-strategy': { label: 'Product strategy', axis: 'discipline', business: 'both', definition: 'Roadmap, positioning, prioritization.' },
  'prompt-architecture': { label: 'Prompt architecture', axis: 'discipline', business: 'both', definition: 'Structuring prompts as an engineered artifact with phases, guardrails and output contracts, versioned and revalidated rather than tuned by feel.' },
  'research-program-design': { label: 'Research program design', axis: 'discipline', business: 'both', definition: 'Standing up a repeatable customer research programme: councils, partner panels, betas. A recurring pattern across three eras with no name in v1.0.' },
  'safety-trust': { label: 'Safety and trust', axis: 'discipline', business: 'both', definition: 'Guardrails, refusal design, adversarial and jailbreak testing.' },
  'service-design': { label: 'Service design', axis: 'discipline', business: 'both', definition: 'Unifying channels into one system: kiosk, IVR, tablet, web as a single service.' },
  'systems-design': { label: 'Systems design', axis: 'discipline', business: 'both', definition: 'Designing the system rather than its surfaces: object models, state, contracts.' },
  'team-building': { label: 'Team building', axis: 'discipline', business: 'both', definition: 'Hiring, growing, and coaching a team.' },
  'ux-research': { label: 'UX research', axis: 'discipline', business: 'both', definition: 'Research methods and synthesis.' },
  'voice-interaction': { label: 'Voice interaction', axis: 'discipline', business: 'both', definition: 'Voice UI, spoken briefing systems, cadence and interruption design.' },
  'web3-authentication': { label: 'Web3 and on-chain authentication', axis: 'discipline', business: 'both', definition: 'On-chain provenance, minting and verification of physical objects. Already in the resume skills bank, not in v1.0.' },
  'workflow-design': { label: 'Workflow design', axis: 'discipline', business: 'both', definition: 'Designing the sequence of steps a person moves through to get work done, across screens and often across roles and handoffs. The unit is the task, not the page.' },
  // --- judgment ---
  'taste-judgment': { label: 'Taste and judgment', axis: 'judgment', business: 'both', definition: 'Recognizing what is technically correct but wrong; curation over generation.' },
  'business-literacy': { label: 'Business literacy', axis: 'judgment', business: 'both', definition: 'Defending design decisions in KPI, ARR, and retention terms to executives.' },
  'systems-thinking': { label: 'Systems thinking', axis: 'judgment', business: 'both', definition: 'Architecting the constraints and logic that guide AI systems, not just assembling components.' },
  'executive-communication': { label: 'Executive communication', axis: 'judgment', business: 'both', definition: 'Communicating with and influencing senior stakeholders.' },
  'cross-functional-leadership': { label: 'Cross-functional leadership', axis: 'judgment', business: 'both', definition: 'Operating across design, product, and engineering boundaries as roles blur.' },
  // --- engagement-model ---
  'full-time-process': { label: 'Full-time', axis: 'engagement-model', business: 'brett-marlin', definition: 'Ongoing full-time execution and coordination.' },
  'diagnostic-sprint': { label: 'Diagnostic sprint', axis: 'engagement-model', business: 'both', definition: 'A short, fixed-scope strategy engagement that ends in a decision. Marliin\'s \'The Picture\' is the productized form, but the value is generic (Brett\'s ruling 2026-08-07): a 2013 five-day founder sprint is the same shape and uses this value.' },
  'embedded-retainer': { label: 'Embedded retainer', axis: 'engagement-model', business: 'marliin', definition: 'Ongoing part-time embedded leadership, typically 2-3 days/week on quarterly renewal, accountable for outcomes rather than advising.' },
  'outcomes-build': { label: 'Outcomes build', axis: 'engagement-model', business: 'marliin', definition: 'Longer embedded delivery engagement owning a shipped outcome. Marliin\'s \'The Build\'.' },
  'forward-deployed-ai-design': { label: 'Forward deployed', axis: 'engagement-model', business: 'both', definition: 'Embeds with a team facing an ambiguous problem; temporary and targeted; observes real workflows then prototypes fast; delivers working software and validated insights, not mockups; leaves behind a well-articulated problem and tested approach. VALIDATED: 2 of 11 live JDs use "Forward Deployed" in the job title (Tribe AI, Tailor). Id kept verbatim from existing usage so the 7 tagged records need no migration.' },
  'agency-engagement': { label: 'Agency engagement', axis: 'engagement-model', business: 'brett-marlin', definition: 'Retainer or project work delivered through Brett Marlin Creative. Covers the pre-Marliin agency era, which the axis previously could not name at all, leaving those studies with an empty icp_fit.' },
  // --- system-mindset ---
  'deterministic-systems': { label: 'Deterministic systems', axis: 'system-mindset', business: 'brett-marlin', definition: 'Fixed logic: if X then Y. Conventional software flows.' },
  'probabilistic-systems': { label: 'Probabilistic systems', axis: 'system-mindset', business: 'both', definition: 'Designing around model confidence, latency, uncertainty, and fallback behavior.' },
  // --- industry-vertical ---
  'supply-chain': { label: 'Supply chain', axis: 'industry-vertical', business: 'both', definition: 'Supply-chain intelligence, provenance, and risk.' },
  'defense-govtech': { label: 'Defense and govtech', axis: 'industry-vertical', business: 'both', definition: 'Defense, national security, and government technology.' },
  'media-entertainment': { label: 'Media and entertainment', axis: 'industry-vertical', business: 'both', definition: 'Confirmed by the legacy port: Comcast, StudioNow, AOL.' },
  'edtech': { label: 'Edtech', axis: 'industry-vertical', business: 'both', definition: 'Confirmed by the legacy port: YouScience, both studies.' },
  'devtools-analytics': { label: 'Developer tools and analytics', axis: 'industry-vertical', business: 'both', definition: 'Confirmed by the legacy port: Mixpanel.' },
  'fintech': { label: 'Fintech', axis: 'industry-vertical', business: 'both', definition: 'Confirmed by the legacy port: Blend (Wells Fargo banking compliance), Carta.' },
  'art-collectibles': { label: 'Art and collectibles', axis: 'industry-vertical', business: 'both', definition: 'Confirmed by the legacy port: Lobus.' },
  'risk-intelligence': { label: 'Risk intelligence', axis: 'industry-vertical', business: 'both', definition: 'Confirmed by the legacy port: Sayari.' },
  'corrections-justice': { label: 'Corrections and justice technology', axis: 'industry-vertical', business: 'both', definition: 'Telmate. Naming this vertical carefully matters: the work served a vulnerable population.' },
  'gaming-sports': { label: 'Gaming and sports', axis: 'industry-vertical', business: 'both', definition: 'Overdog.' },
  // --- outcome ---
  'architecture': { label: 'Architecture', axis: 'outcome', business: 'both', definition: 'A system, object model or platform structure now exists that did not.' },
  'ai-capability': { label: 'AI', axis: 'outcome', business: 'both', definition: 'An AI or agentic capability shipped. (id disambiguated from the `ai` discipline value: TAGS is a flat id map, so ids are globally unique across axes.)' },
  'system-adoption': { label: 'Design systems', axis: 'outcome', business: 'both', definition: 'A system was built, adopted, or drift eliminated from it. (id disambiguated from the `design-systems` discipline value: TAGS is a flat id map, so ids are globally unique across axes.)' },
  'adoption': { label: 'Adoption', axis: 'outcome', business: 'both', definition: 'Measured take-up: usage, retention, conversion, capture.' },
  'research-validation': { label: 'Research and validation', axis: 'outcome', business: 'both', definition: 'A bet was tested and the answer changed what happened next, including when the answer was no.' },
  'org-transformation': { label: 'Org transformation', axis: 'outcome', business: 'both', definition: 'Team, process or operating model changed.' },
  'reliability': { label: 'Reliability', axis: 'outcome', business: 'both', definition: 'Uptime, trust, correctness or maintainability improved.' },
  'launched': { label: '0-to-1', axis: 'outcome', business: 'both', definition: 'Something existed at the end that did not exist at the start. (id disambiguated from the `0-to-1` discipline value: TAGS is a flat id map, so ids are globally unique across axes.)' },
  'gtm': { label: 'Go-to-market', axis: 'outcome', business: 'both', definition: 'Positioning, campaign, partnership or revenue motion.' },
  'velocity': { label: 'Velocity', axis: 'outcome', business: 'both', definition: 'The same work got materially faster.' },
  // --- buyer-archetype ---
  'design-leadership-buyer': { label: 'Design leadership (buyer)', axis: 'buyer-archetype', business: 'both', definition: 'An org hiring or buying design leadership itself: someone to own the function, not a project. Distinct from the discipline value of the same name, which describes the work; this describes the buyer. Id suffixed because the discipline axis already owns `design-leadership`; ids are globally unique across axes.' },
  'technical-founder-operator': { label: 'Technical founder-operator', axis: 'buyer-archetype', business: 'marliin', definition: 'A technical founder who wants a peer who ships, not a vendor.' },
  'fractional-ai-leadership': { label: 'Fractional AI leadership', axis: 'buyer-archetype', business: 'marliin', definition: 'Senior leadership on a part-time cadence rather than a full-time hire; company-wide and board-facing scope. Buyers say "advisory, embedded, or interim".' },
  'ai-native-design-leadership': { label: 'AI-native design leadership', axis: 'buyer-archetype', business: 'marliin', definition: 'A design leader who works AI-natively, not a leader who manages AI projects.' },
  'design-systems-leadership': { label: 'Design systems leadership', axis: 'buyer-archetype', business: 'both', definition: 'Owning the system as a build contract with governance, not just a component library.' },
  'enterprise-product-design': { label: 'Enterprise product design', axis: 'buyer-archetype', business: 'both', definition: 'Complex, multi-role, regulated or high-consequence product surfaces.' },
  'ai-systems-architecture': { label: 'AI systems architecture', axis: 'buyer-archetype', business: 'both', definition: 'Shopping for the shape of the system: agents, handoffs, supervision, object model.' },
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
