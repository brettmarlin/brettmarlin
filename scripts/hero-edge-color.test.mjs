/**
 * The sampled hero backdrop: BMP pixel parsing, the edge-average rule, the
 * null-means-unsampleable contract, and the committed-cache behavior of
 * edgeColorFor — including that a cached null is a hit, not a retry.
 * The one sips-dependent case is gated on the binary being present, the same
 * arrangement prepare-images.test.mjs uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import {
  parseBmpPixels,
  averageEdgeColor,
  sampleEdgeColors,
  edgeColorsFor,
} from './hero-edge-color.mjs';

// A minimal 24-bit bottom-up BMP from a top-down grid of [r,g,b] rows.
function makeBmp(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const dataOffset = 54;
  const buf = Buffer.alloc(dataOffset + rowStride * height);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(dataOffset, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive: bottom-up storage
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  rows.forEach((row, y) => {
    const stored = height - 1 - y;
    row.forEach(([r, g, b], x) => {
      const off = dataOffset + stored * rowStride + x * 3;
      buf[off] = b;
      buf[off + 1] = g;
      buf[off + 2] = r;
    });
  });
  return buf;
}

test('parseBmpPixels reads a bottom-up BMP in top-down coordinates', () => {
  const red = [255, 0, 0];
  const blue = [0, 0, 255];
  const bmp = parseBmpPixels(makeBmp([
    [red, red],
    [blue, blue],
  ]));
  assert.equal(bmp.width, 2);
  assert.equal(bmp.height, 2);
  assert.deepEqual(bmp.pixelAt(0, 0), red, 'top row reads first, despite bottom-up storage');
  assert.deepEqual(bmp.pixelAt(1, 1), blue);
});

test('parseBmpPixels honors BI_BITFIELDS masks instead of assuming BGRA', () => {
  // The shape real sips emits from an alpha-carrying PNG: BITMAPV5, 32-bit,
  // top-down, compression 3 with channel masks. Masks here deliberately put
  // red LOW and blue HIGH — backwards from plain BMP order — so a parser
  // that ignored them would swap channels and this would fail loudly.
  const width = 2;
  const height = 2;
  const dataOffset = 14 + 124;
  const buf = Buffer.alloc(dataOffset + width * height * 4);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(dataOffset, 10);
  buf.writeUInt32LE(124, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // negative: top-down
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(32, 28);
  buf.writeUInt32LE(3, 30); // BI_BITFIELDS
  buf.writeUInt32LE(0x000000ff, 54); // red mask, low byte
  buf.writeUInt32LE(0x0000ff00, 58); // green mask
  buf.writeUInt32LE(0x00ff0000, 62); // blue mask, high byte
  const px = (r, g, b) => r | (g << 8) | (b << 16);
  buf.writeUInt32LE(px(255, 0, 0), dataOffset); // top-left: red
  buf.writeUInt32LE(px(0, 0, 255), dataOffset + 4);
  buf.writeUInt32LE(px(0, 255, 0), dataOffset + 8);
  buf.writeUInt32LE(px(1, 2, 3), dataOffset + 12);
  const bmp = parseBmpPixels(buf);
  assert.ok(bmp, 'bitfields BMP should parse');
  assert.deepEqual(bmp.pixelAt(0, 0), [255, 0, 0], 'top-down: first stored row IS the top row');
  assert.deepEqual(bmp.pixelAt(1, 1), [1, 2, 3]);
});

test('parseBmpPixels refuses what it cannot read, rather than guessing', () => {
  assert.equal(parseBmpPixels(Buffer.from('not a bmp at all, nowhere near long enough')), null);
  const compressed = makeBmp([[[1, 2, 3]]]);
  compressed.writeUInt32LE(1, 30); // BI_RLE8
  assert.equal(parseBmpPixels(compressed), null);
  const truncated = makeBmp([[[1, 2, 3], [4, 5, 6]], [[7, 8, 9], [1, 1, 1]]]).subarray(0, 56);
  assert.equal(parseBmpPixels(truncated), null, 'a pixel array shorter than the header promises');
});

test('averageEdgeColor of a solid field is the field, exactly, on either side', () => {
  const px = [17, 34, 51]; // #112233
  const rows = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => px));
  const bmp = parseBmpPixels(makeBmp(rows));
  assert.equal(averageEdgeColor(bmp, 'left'), '#112233');
  assert.equal(averageEdgeColor(bmp, 'right'), '#112233');
});

test('each side samples its own edge and ignores the middle — a gradient hero gets two colors', () => {
  // 8 wide: columns 0-2 black, 5-7 white, middle columns loud green that
  // must not leak into either average. This is the gradient-hero case: one
  // averaged hex would meet neither edge; per-side sampling meets both.
  const rows = Array.from({ length: 4 }, () =>
    Array.from({ length: 8 }, (_, x) => {
      if (x <= 2) return [0, 0, 0];
      if (x >= 5) return [255, 255, 255];
      return [0, 255, 0];
    })
  );
  const bmp = parseBmpPixels(makeBmp(rows));
  assert.equal(averageEdgeColor(bmp, 'left'), '#000000');
  assert.equal(averageEdgeColor(bmp, 'right'), '#ffffff');
});

test('averageEdgeColor never double-counts columns on an image narrower than the edge region', () => {
  const px = [200, 100, 50];
  const rows = [[px, px], [px, px]];
  assert.equal(averageEdgeColor(parseBmpPixels(makeBmp(rows)), 'left'), '#c86432');
});

test('sampleEdgeColors is null on a converter failure or an unreadable result — never a throw', () => {
  assert.equal(sampleEdgeColors(Buffer.from('x'), { convert: () => { throw new Error('no sips'); } }), null);
  assert.equal(sampleEdgeColors(Buffer.from('x'), { convert: () => Buffer.from('not a bmp') }), null);
});

test('edgeColorsFor caches by R2 path, and a cached null is a hit, not a retry', async () => {
  const cache = {};
  let fetches = 0;
  const bytes = makeBmp([[[10, 20, 30]]]);
  const fetcher = async () => {
    fetches += 1;
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  const sampler = (b) => sampleEdgeColors(b, { convert: (x) => x });
  const url = 'https://x.dev/images/s/00-hero.abc123.png';

  const first = await edgeColorsFor(url, { cache, fetcher, sampler });
  assert.deepEqual(first, { colors: { left: '#0a141e', right: '#0a141e' }, fromCache: false });
  assert.deepEqual(cache['s/00-hero.abc123.png'], { left: '#0a141e', right: '#0a141e' });

  const second = await edgeColorsFor(url, { cache, fetcher, sampler });
  assert.deepEqual(second, { colors: { left: '#0a141e', right: '#0a141e' }, fromCache: true });
  assert.equal(fetches, 1, 'a cache hit must not fetch');

  cache['s/unsampleable.png'] = null;
  const third = await edgeColorsFor('https://x.dev/images/s/unsampleable.png', { cache, fetcher, sampler });
  assert.deepEqual(third, { colors: null, fromCache: true });
  assert.equal(fetches, 1, 'null was already the answer; do not fetch again');
});

test('edgeColorsFor without a converter skips the fetch and leaves the cache alone', async () => {
  const cache = {};
  let fetched = 0;
  const fetcher = async () => { fetched += 1; return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; };
  const r = await edgeColorsFor('https://x.dev/images/s/00-hero.png', { cache, fetcher, canSample: false });
  assert.deepEqual(r, { colors: null, fromCache: false, skipped: true });
  assert.equal(fetched, 0);
  assert.deepEqual(cache, {}, 'a machine that cannot sample must not cache a null');
});

test('edgeColorsFor surfaces a failed fetch to the caller', async () => {
  const fetcher = async () => ({ ok: false, status: 503 });
  await assert.rejects(
    () => edgeColorsFor('https://x.dev/images/s/00-hero.png', { cache: {}, fetcher, canSample: true }),
    /HTTP 503/
  );
});

// --- real-sips coverage (macOS) ----------------------------------------------

function hasSips() {
  try { execFileSync('which', ['sips'], { stdio: 'pipe' }); return true; } catch { return false; }
}

// A solid-color 8-bit RGB PNG, built the honest way: real chunks, real CRCs,
// real zlib stream — because sips will verify all of it.
function makeSolidPng(width, height, [r, g, b], { alpha = false } = {}) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // color type: truecolor, with or without alpha
  const bpp = alpha ? 4 : 3;
  const raw = Buffer.alloc(height * (1 + width * bpp));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * bpp);
    for (let x = 0; x < width; x += 1) {
      raw[rowStart + 1 + x * bpp] = r;
      raw[rowStart + 2 + x * bpp] = g;
      raw[rowStart + 3 + x * bpp] = b;
      if (alpha) raw[rowStart + 4 + x * bpp] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('sampleEdgeColors round-trips a real PNG through real sips', { skip: !hasSips() }, () => {
  assert.deepEqual(sampleEdgeColors(makeSolidPng(8, 6, [18, 52, 86])), { left: '#123456', right: '#123456' });
});

test('sampleEdgeColors handles the RGBA PNGs the Figma heroes actually are, through real sips', { skip: !hasSips() }, () => {
  // An opaque PNG converts to plain 24-bit BMP; one WITH an alpha channel
  // comes back as BITMAPV5 + BI_BITFIELDS, which is what every real hero
  // produced on 2026-08-16 and what the first parser rejected wholesale.
  assert.deepEqual(sampleEdgeColors(makeSolidPng(8, 6, [18, 52, 86], { alpha: true })), { left: '#123456', right: '#123456' });
});
