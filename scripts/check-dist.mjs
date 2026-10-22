#!/usr/bin/env node
/**
 * After the build: prove the public bundle carries nothing gated. Greps every
 * emitted JS chunk for the markers a leak would carry and prints the byte
 * count, so a zero-match result is visibly a result and not an empty read.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/assets/', import.meta.url));
// Content markers fail anywhere: a gated take's own words, or a sealed name.
const CONTENT_MARKERS = ['recipient-only', 'site_visibility', 'air-gapped', 'IL5', 'IL6', 'Anduril', 'Convoy'];
// Field markers are the KV record's own keys. They may appear in the admin
// chunk, which writes vault notes naming them as placeholders, and nowhere
// else: a public chunk carrying them would mean a record reached the bundle.
const FIELD_MARKERS = ['password_hash', 'password_salt'];
let bytes = 0;
const hits = [];
for (const f of readdirSync(DIST)) {
  if (!f.endsWith('.js')) continue;
  const text = readFileSync(join(DIST, f), 'utf8');
  bytes += statSync(join(DIST, f)).size;
  for (const m of CONTENT_MARKERS) if (text.includes(m)) hits.push(`${f}: "${m}"`);
  if (!/^Admin-/.test(f)) for (const m of FIELD_MARKERS) if (text.includes(m)) hits.push(`${f}: "${m}"`);
}
console.log(`dist guard: scanned ${bytes} bytes of JS`);
if (bytes === 0) { console.error('dist guard: nothing to scan; was the build run?'); process.exit(1); }
if (hits.length) { console.error(`dist guard: gated marker(s) in the public bundle:\n  ${hits.join('\n  ')}`); process.exit(1); }
console.log('dist guard: clean, no gated markers in the public bundle');
