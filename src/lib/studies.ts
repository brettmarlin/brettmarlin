import { caseStudies, type CaseStudy, type Beat, type BeatMedia } from '../data/caseStudies';
import { TAGS } from '../data/taxonomy';

export type { CaseStudy, Beat, BeatMedia };

/** Vault order, which the generator already emits. */
export const studies: CaseStudy[] = caseStudies;

export function findStudy(slug: string): CaseStudy | undefined {
  return studies.find((s) => s.slug === slug);
}

export function nextStudy(slug: string, list: CaseStudy[] = studies): CaseStudy | undefined {
  const i = list.findIndex((s) => s.slug === slug);
  if (i === -1 || list.length < 2) return undefined;
  return list[(i + 1) % list.length];
}

export function prevStudy(slug: string, list: CaseStudy[] = studies): CaseStudy | undefined {
  const i = list.findIndex((s) => s.slug === slug);
  if (i === -1 || list.length < 2) return undefined;
  return list[(i - 1 + list.length) % list.length];
}

/** "2021", or "2022 to 2024". Plain words: the site carries no en dashes. */
export function yearLabel(s: Pick<CaseStudy, 'yearStart' | 'yearEnd'>): string {
  if (!s.yearStart) return '';
  return s.yearEnd && s.yearEnd !== s.yearStart ? `${s.yearStart} to ${s.yearEnd}` : String(s.yearStart);
}

/** "2022/24" for tight meta columns. */
export function yearShort(s: Pick<CaseStudy, 'yearStart' | 'yearEnd'>): string {
  if (!s.yearStart) return '';
  return s.yearEnd && s.yearEnd !== s.yearStart ? `${s.yearStart}/${String(s.yearEnd).slice(2)}` : String(s.yearStart);
}

export function tagLabel(id: string): string {
  return TAGS[id]?.label ?? id;
}

export function tagSlug(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function tagFromSlug(slug: string): string | undefined {
  return allTags().find((t) => tagSlug(t) === slug);
}

export function allTags(): string[] {
  return [...new Set(studies.flatMap((s) => s.tags))].sort((a, b) => tagLabel(a).localeCompare(tagLabel(b)));
}

/** Tags ordered by how many studies carry them, for the filter row. */
export function tagsByCount(min = 2): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of studies) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1] || tagLabel(a[0]).localeCompare(tagLabel(b[0]))).map(([id, count]) => ({ id, count }));
}

export function primaryBeats(s: CaseStudy): Beat[] {
  if (!s.beats) return [];
  const key = s.primaryTake && s.beats[s.primaryTake] ? s.primaryTake : Object.keys(s.beats)[0];
  return key ? s.beats[key] ?? [] : [];
}

export function groupByYear(list: CaseStudy[]): { year: number; studies: CaseStudy[] }[] {
  const years = new Map<number, CaseStudy[]>();
  for (const s of list) {
    if (!s.yearStart) continue;
    if (!years.has(s.yearStart)) years.set(s.yearStart, []);
    years.get(s.yearStart)!.push(s);
  }
  return [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, entries]) => ({ year, studies: entries }));
}

/** Two-digit index for the Swiss furniture: 01, 02, ... */
export function index(i: number): string {
  return String(i + 1).padStart(2, '0');
}

export function heroOf(s: CaseStudy): Extract<BeatMedia, { kind: 'image' }> | undefined {
  if (s.hero && s.hero.kind === 'image') return s.hero;
  for (const b of primaryBeats(s)) for (const m of b.media) if (m.kind === 'image') return m;
  return undefined;
}
