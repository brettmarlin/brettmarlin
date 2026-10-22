/**
 * The hero backdrop color, sampled from the image itself.
 *
 * The detail page's hero used to fake a backdrop by rendering the hero a
 * second time, blurred and scaled to fill the section. On the solid-color
 * Figma heroes that smeared color past the edges of what the sharp image
 * actually shows. The edge of the image IS the intended background on those
 * heroes, so the backdrop is now built from hexes sampled off the image's
 * left and right edge columns — the columns the real background abuts when
 * the capped-width hero sits centered on a wider viewport. One hex per
 * side, because some heroes are gradient fields: the page spans the two as
 * a CSS gradient, which is a flat color whenever the sides agree.
 *
 * Pixel decoding follows the dimensionsFor precedent of no image library:
 * sips (ships with macOS, already the converter bind-heroes shells to)
 * transcodes whatever R2 holds — PNG or JPEG — to uncompressed BMP, and BMP
 * rows are plain bytes this file reads directly. `npm run generate` only
 * runs on the machine the vault lives on, same as every other sips caller;
 * CI's --check mode reads the committed cache and needs neither sips nor
 * the network, exactly like image-dimensions.json.
 *
 * A hero whose color cannot be sampled caches null: the page falls back to
 * bg-inverse, and generate never crashes over a backdrop.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Uncompressed 24/32-bit BMP, plus 32-bit BI_BITFIELDS — the two shapes sips
// actually emits for `-s format bmp` (plain 24-bit from an opaque source,
// BITMAPV5 32-bit with channel masks from one with alpha). Anything else
// returns null and the caller treats the hero as unsampleable rather than
// guessing.
export function parseBmpPixels(buf) {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null;
  const dataOffset = buf.readUInt32LE(10);
  const dibSize = buf.readUInt32LE(14);
  if (dibSize < 40) return null;
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bitCount = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (width <= 0 || rawHeight === 0) return null;
  const plain = compression === 0 && (bitCount === 24 || bitCount === 32);
  const bitfields = compression === 3 && bitCount === 32 && dibSize >= 56 && buf.length >= 14 + 56;
  if (!plain && !bitfields) return null;
  const height = Math.abs(rawHeight);
  const bytesPerPixel = bitCount / 8;
  const rowStride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  if (dataOffset + rowStride * height > buf.length) return null;
  // Positive height means the file stores rows bottom-up; pixelAt speaks
  // top-down y either way.
  const bottomUp = rawHeight > 0;
  const rowOffset = (y) => dataOffset + (bottomUp ? height - 1 - y : y) * rowStride;
  if (plain) {
    const pixelAt = (x, y) => {
      const off = rowOffset(y) + x * bytesPerPixel;
      return [buf[off + 2], buf[off + 1], buf[off]];
    };
    return { width, height, pixelAt };
  }
  // BI_BITFIELDS: each 32-bit pixel's channels sit wherever the header's
  // masks say. Only clean 8-bit channels are read; an exotic mask is null.
  const channel = (maskOffset) => {
    const mask = buf.readUInt32LE(maskOffset);
    const shift = mask === 0 ? -1 : 31 - Math.clz32(mask & -mask);
    return shift >= 0 && (mask >>> shift) === 0xff ? { mask, shift } : null;
  };
  const r = channel(54);
  const g = channel(58);
  const b = channel(62);
  if (!r || !g || !b) return null;
  const pixelAt = (x, y) => {
    const v = buf.readUInt32LE(rowOffset(y) + x * 4);
    return [(v & r.mask) >>> r.shift, (v & g.mask) >>> g.shift, (v & b.mask) >>> b.shift];
  };
  return { width, height, pixelAt };
}

// Average of a few outermost columns on ONE side — a region, not one pixel,
// so a stray anti-aliased pixel at the literal corner cannot pick an
// outlier. Rows are stepped on tall images; the average of a solid-color
// field is identical either way.
export function averageEdgeColor(bmp, side, edgeCols = 3) {
  const { width, height, pixelAt } = bmp;
  const cols = new Set();
  for (let i = 0; i < Math.min(edgeCols, width); i += 1) {
    cols.add(side === 'left' ? i : width - 1 - i);
  }
  const rowStep = Math.max(1, Math.floor(height / 256));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const x of cols) {
    for (let y = 0; y < height; y += rowStep) {
      const [pr, pg, pb] = pixelAt(x, y);
      r += pr;
      g += pg;
      b += pb;
      n += 1;
    }
  }
  if (n === 0) return null;
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export const SIPS_AVAILABLE = process.platform === 'darwin';

function sipsToBmp(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'hero-edge-'));
  try {
    // sips trusts the extension, so name the input by its magic bytes.
    const isPng = bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50;
    const src = join(dir, isPng ? 'hero.png' : 'hero.jpg');
    const out = join(dir, 'hero.bmp');
    writeFileSync(src, bytes);
    execFileSync('sips', ['-s', 'format', 'bmp', src, '--out', out], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Bytes in, `{ left, right }` hexes or null out. Each side is sampled on
// its own because the newest heroes are gradient fields, not solid ones:
// one hex cannot meet a cyan left edge and a navy right edge, but a
// two-stop CSS gradient between the two side averages meets both — and on
// a genuinely solid hero the sides agree and it renders as the flat color.
// A sips failure (or a BMP this file does not read) is null, never a
// throw: an unsampleable hero falls back to the token background, it does
// not stop the build.
export function sampleEdgeColors(bytes, { convert = sipsToBmp } = {}) {
  try {
    const bmp = parseBmpPixels(convert(bytes));
    if (!bmp) return null;
    const left = averageEdgeColor(bmp, 'left');
    const right = averageEdgeColor(bmp, 'right');
    return left && right ? { left, right } : null;
  } catch {
    return null;
  }
}

// Same contract as dimensionsFor: committed-cache first, keyed by the R2
// path, fetch only on a miss. Null IS a cache value — "tried, could not
// sample" — so a bad hero is not re-fetched on every generate.
export async function edgeColorsFor(url, { cache, fetcher = fetch, sampler = sampleEdgeColors, canSample = sampler !== sampleEdgeColors || SIPS_AVAILABLE }) {
  const key = decodeURIComponent(new URL(url).pathname).replace(/^\/images\//, '');
  if (key in cache) return { colors: cache[key], fromCache: true };
  // No converter on this machine (sips is macOS only): nothing is sampled
  // and nothing is cached, so the next generate on a Mac fills the entry.
  // Caching the null here would freeze "could not sample" into the repo.
  if (!canSample) return { colors: null, fromCache: false, skipped: true };
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const colors = sampler(Buffer.from(await res.arrayBuffer()));
  cache[key] = colors;
  return { colors, fromCache: false };
}
