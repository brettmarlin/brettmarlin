import type { Beat, BeatMedia } from './studies';

export type Visual = Extract<BeatMedia, { kind: 'image' }> | Extract<BeatMedia, { kind: 'video' }>;

export const PORTRAIT_MAX_RATIO = 0.9;
export const LANDSCAPE_MIN_RATIO = 1.1;
export const GRID_THRESHOLD = 7;

export function ratioOf(m: Visual): number {
  const w = m.kind === 'image' ? m.width : m.poster.width;
  const h = m.kind === 'image' ? m.height : m.poster.height;
  return w > 0 && h > 0 ? w / h : 1.6;
}

export function visuals(beat: Beat): Visual[] {
  return beat.media.filter((m): m is Visual => m.kind === 'image' || m.kind === 'video');
}

/** Rows of 1, 2 or 3 that share a height. Four is two pairs, five is a pair
 *  and a triptych, six is two triptychs. Seven or more becomes a grid. */
export function groupRows(n: number): number[] {
  if (n <= 0) return [];
  if (n <= 3) return [n];
  if (n === 4) return [2, 2];
  if (n === 5) return [2, 3];
  if (n === 6) return [3, 3];
  return [];
}

export type Row = { items: Visual[]; ratios: number[]; sum: number };

export function rows(items: Visual[]): Row[] {
  const out: Row[] = [];
  let i = 0;
  for (const size of groupRows(items.length)) {
    const slice = items.slice(i, i + size);
    const ratios = slice.map(ratioOf);
    out.push({ items: slice, ratios, sum: ratios.reduce((a, b) => a + b, 0) });
    i += size;
  }
  return out;
}

export type BeatArrangement =
  | { mode: 'stack'; rows: Row[] }          // prose above, media below, full column
  | { mode: 'side'; side: 'left' | 'right'; rows: Row[] } // a portrait beside the prose
  | { mode: 'grid'; items: Visual[] }       // seven or more: a grid of frames
  | { mode: 'none' };

/**
 * Orientation decides the layout, the author may override it. A lone
 * portrait sits beside the prose, height-capped by CSS; everything else
 * stacks below as justified rows. Seven or more becomes a thumbnail grid
 * that opens in the lightbox.
 */
export function arrange(beat: Beat): BeatArrangement {
  const items = visuals(beat);
  if (items.length === 0) return { mode: 'none' };
  if (items.length >= GRID_THRESHOLD) return { mode: 'grid', items };
  const override = beat.layout;
  if (override === 'image-left' || override === 'image-right' || override === 'side') {
    return { mode: 'side', side: override === 'image-left' ? 'left' : 'right', rows: rows(items) };
  }
  if (override === 'image-below' || override === 'image-top' || override === 'full-bleed') {
    return { mode: 'stack', rows: rows(items) };
  }
  const portraits = items.filter((m) => ratioOf(m) < PORTRAIT_MAX_RATIO).length;
  if (items.length <= 2 && portraits === items.length) return { mode: 'side', side: 'right', rows: rows(items) };
  return { mode: 'stack', rows: rows(items) };
}

/** grid-template-columns for a justified row: widths proportional to ratios
 *  so every frame lands at one shared height with no measurement. */
export function columnsFor(row: Row): string {
  return row.ratios.map((r) => `${r.toFixed(4)}fr`).join(' ');
}

/** Tall rows (a pair of phone screens) would run off the page at full width;
 *  cap them by viewport height instead. Returns a CSS width expression. */
export function widthFor(row: Row, maxVh = 72): string {
  if (row.sum >= 1.25) return '100%';
  return `min(100%, calc(${maxVh}vh * ${row.sum.toFixed(4)}))`;
}
