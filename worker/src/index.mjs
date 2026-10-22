/**
 * brettmarlin.xyz Worker
 *
 * Serves everything the static site must not carry:
 *   1. Recipient portfolios   GET/POST /api/recipient/:slug        KV, password-gated
 *   2. Gated study sections   GET /api/study/:slug/gate,
 *                             POST /api/study/:slug/unlock          KV, password-gated
 *   3. Case-study images      GET /api/images/:slug, /images/:slug/:file   R2
 *   4. The admin API          /api/admin/*                          Bearer ADMIN_TOKEN
 *   5. Access events          written to KV with a TTL, read by the admin
 *
 * The rule that shapes it, from the vault's consent/clearances.md: gated
 * content must never ship in a public bundle. So the gate is enforced here. A
 * payload leaves this Worker only with the right password; a page that fetched
 * it and then hid it would have already disclosed it.
 *
 * KV layout (one namespace, RECIPIENTS, so the existing data keeps working):
 *   <slug>                     a recipient record (bare key, no colon)
 *   gated:<publicSlug>         { slug, study } the gated take of a public study
 *   event:<reverse-ts>:<rand>  one access event, TTL EVENT_TTL_DAYS
 *   rl:<ip>                    failed-attempt counter, TTL 60s
 */

export const IMAGE_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml',
};

export const PBKDF2_ROUNDS = 100_000;
export const EVENT_TTL_DAYS = 180;
export const RATE_LIMIT = { attempts: 10, windowSeconds: 60 };
export const FUNNEL_STAGES = ['first-contact', 'recruiter-preview', 'active-evaluation', 'interview-or-discovery'];
export const ACCESS_MODES = ['public-preview', 'protected-deep-dive'];
export const STATUSES = ['draft', 'live', 'expired'];

// Brett's house vocabulary for generated passwords: plain, sayable words.
// Two of these plus two target words, shuffled. Readable down a phone line.
export const HOUSE_WORDS = [
  'decision', 'judgment', 'grid', 'ink', 'paper', 'signal', 'craft', 'system',
  'canvas', 'studio', 'marathon', 'cadence', 'prototype', 'ship', 'field', 'note',
  'ladder', 'ledger', 'rule', 'tide', 'harbor', 'compass', 'anchor', 'lantern',
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      return await route(request, url, env, ctx, cors);
    } catch (err) {
      return json({ error: 'server_error', message: String(err?.message ?? err) }, 500, cors);
    }
  },
};

async function route(request, url, env, ctx, cors) {
  const p = url.pathname;

  if (p === '/api/health') return json({ ok: true, now: new Date().toISOString() }, 200, cors);

  // ---------------------------------------------------------------- images
  let m = p.match(/^\/api\/images\/([a-z0-9-]+)$/i);
  if (m) return request.method === 'GET' ? listImages(m[1].toLowerCase(), url, env, cors) : json({ error: 'method_not_allowed' }, 405, cors);
  m = p.match(/^\/images\/([a-z0-9-]+)\/([A-Za-z0-9._-]+)$/i);
  if (m) return request.method === 'GET' ? serveImage(`${m[1].toLowerCase()}/${m[2]}`, env, cors) : json({ error: 'method_not_allowed' }, 405, cors);

  // ----------------------------------------------------------------- admin
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401, cors);
    return admin(request, url, env, ctx, cors);
  }

  // ------------------------------------------------------------- recipients
  m = p.match(/^\/api\/recipient\/([a-z0-9-]+)$/i);
  if (m) return recipient(request, m[1].toLowerCase(), env, ctx, cors);

  // ----------------------------------------------------------- gated study
  m = p.match(/^\/api\/study\/([a-z0-9-]+)\/(gate|unlock)$/i);
  if (m) return m[2] === 'gate' ? studyGate(m[1].toLowerCase(), env, cors) : studyUnlock(request, m[1].toLowerCase(), env, ctx, cors);

  return json({ error: 'not_found' }, 404, cors);
}

// ===========================================================================
// Recipients (public side)
// ===========================================================================

async function recipient(request, slug, env, ctx, cors) {
  if (request.method === 'PUT') {
    // Legacy publish route, kept so scripts/publish-recipient.sh keeps working.
    if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401, cors);
    const body = await readJson(request);
    if (!body) return json({ error: 'bad_json' }, 400, cors);
    const { record, error } = await normalizeRecord(slug, body, await getRecord(env, slug));
    if (error) return json({ error }, 400, cors);
    record.status = body.status ?? 'live';
    await putRecord(env, slug, record);
    return json({ ok: true, slug, protected: !!record.protected, expires: record.expires ?? null, status: record.status }, 200, cors);
  }
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  const record = await getRecord(env, slug);
  if (!record || record.status === 'draft') return json({ error: 'not_found' }, 404, cors);

  if (record.status === 'expired' || isExpired(record.expires)) {
    ctx.waitUntil(logEvent(env, 'recipient_link_expired', slug, request));
    return json({ error: 'expired', expires: record.expires ?? null }, 410, cors);
  }

  if (record.protected) {
    const supplied = request.method === 'POST' ? await readPassword(request) : null;
    if (supplied === null) {
      return json({
        error: 'password_required', protected: true,
        recipient_name: record.recipient_name || '', company: record.company || '',
      }, 401, cors);
    }
    const limited = await rateLimited(env, request);
    if (limited) return json({ error: 'too_many_attempts', retry_in: RATE_LIMIT.windowSeconds }, 429, cors);
    const ok = await verifyPassword(supplied, record);
    if (!ok) {
      ctx.waitUntil(Promise.all([logEvent(env, 'recipient_password_failed', slug, request), countFailure(env, request)]));
      return json({ error: 'bad_password' }, 401, cors);
    }
  }

  ctx.waitUntil(logEvent(env, 'recipient_portfolio_viewed', slug, request, { gated: !!record.protected }));
  return json(publicView(record), 200, cors, { 'cache-control': 'no-store' });
}

// ===========================================================================
// Gated study sections on a public study's own URL
// ===========================================================================

/** Is there anything behind a gate for this public study? Says yes or no and
 *  nothing else: not the gated slug, not a title, not a company. */
async function studyGate(publicSlug, env, cors) {
  const raw = await env.RECIPIENTS.get(`gated:${publicSlug}`);
  if (!raw) return json({ locked: false }, 404, cors);
  return json({ locked: true }, 200, cors, { 'cache-control': 'no-store' });
}

/** Any live, protected, unexpired recipient whose picks include this study
 *  unlocks it with their own password. Checked independently per recipient. */
async function studyUnlock(request, publicSlug, env, ctx, cors) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
  const raw = await env.RECIPIENTS.get(`gated:${publicSlug}`);
  if (!raw) return json({ error: 'not_found' }, 404, cors);
  const gated = JSON.parse(raw);
  const supplied = await readPassword(request);
  if (supplied === null) return json({ error: 'password_required' }, 401, cors);
  const limited = await rateLimited(env, request);
  if (limited) return json({ error: 'too_many_attempts', retry_in: RATE_LIMIT.windowSeconds }, 429, cors);

  const candidates = await recipientsGranting(env, publicSlug, gated.slug);
  for (const rec of candidates) {
    if (await verifyPassword(supplied, rec)) {
      ctx.waitUntil(logEvent(env, 'study_unlocked', rec.slug, request, { study: publicSlug }));
      return json({ ok: true, study: gated.study, via: { company: rec.company || '' } }, 200, cors, { 'cache-control': 'no-store' });
    }
  }
  ctx.waitUntil(Promise.all([logEvent(env, 'study_password_failed', publicSlug, request), countFailure(env, request)]));
  return json({ error: 'bad_password' }, 401, cors);
}

export function pickNamesStudy(pick, publicSlug, gatedSlug) {
  const names = [pick?.case_study, pick?.study?.slug, pick?.slug].filter(Boolean).map((s) => String(s).replace(/^\[\[case-studies\//, '').replace(/\]\]$/, '').replace(/\.md$/, ''));
  return names.includes(publicSlug) || (gatedSlug && names.includes(gatedSlug));
}

async function recipientsGranting(env, publicSlug, gatedSlug) {
  const out = [];
  for (const rec of await allRecords(env)) {
    if (!rec.protected || rec.status !== 'live' || isExpired(rec.expires)) continue;
    if ((rec.picks ?? []).some((pick) => pickNamesStudy(pick, publicSlug, gatedSlug))) out.push(rec);
  }
  return out;
}

// ===========================================================================
// Admin
// ===========================================================================

function isAdmin(request, env) {
  const auth = request.headers.get('authorization') || '';
  return !!env.ADMIN_TOKEN && constantTimeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`);
}

async function admin(request, url, env, ctx, cors) {
  const p = url.pathname.replace(/^\/api\/admin/, '');
  const method = request.method;

  if (p === '/me' && method === 'GET') return json({ ok: true, role: 'admin' }, 200, cors);

  if (p === '/recipients' && method === 'GET') {
    const records = await allRecords(env);
    const events = await listEvents(env, 2000);
    const views = new Map();
    for (const e of events) if (e.event === 'recipient_portfolio_viewed') views.set(e.slug, (views.get(e.slug) ?? 0) + 1);
    const list = records.map((r) => summary(r, views.get(r.slug) ?? 0)).sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
    return json({ recipients: list }, 200, cors);
  }

  let m = p.match(/^\/recipients\/([a-z0-9-]+)$/i);
  if (m) {
    const slug = m[1].toLowerCase();
    if (method === 'GET') {
      const rec = await getRecord(env, slug);
      return rec ? json({ recipient: adminView(rec) }, 200, cors) : json({ error: 'not_found' }, 404, cors);
    }
    if (method === 'PUT') {
      const body = await readJson(request);
      if (!body) return json({ error: 'bad_json' }, 400, cors);
      const existing = await getRecord(env, slug);
      const { record, error } = await normalizeRecord(slug, body, existing);
      if (error) return json({ error }, 400, cors);
      await putRecord(env, slug, record);
      return json({ ok: true, recipient: adminView(record) }, 200, cors);
    }
    if (method === 'DELETE') {
      await env.RECIPIENTS.delete(slug);
      return json({ ok: true }, 200, cors);
    }
    return json({ error: 'method_not_allowed' }, 405, cors);
  }

  m = p.match(/^\/recipients\/([a-z0-9-]+)\/password$/i);
  if (m && method === 'POST') {
    const slug = m[1].toLowerCase();
    const rec = await getRecord(env, slug);
    if (!rec) return json({ error: 'not_found' }, 404, cors);
    const body = (await readJson(request)) ?? {};
    const password = typeof body.password === 'string' && body.password.trim() ? body.password.trim() : generatePassword(body.words ?? []);
    rec.password_salt = randomHex(16);
    rec.password_hash = await hashPassword(password, rec.password_salt);
    rec.protected = true;
    rec.password_set = new Date().toISOString();
    rec.updated = new Date().toISOString();
    if (!rec.expires) return json({ error: 'expires_required_when_protected' }, 400, cors);
    await putRecord(env, slug, rec);
    // The plaintext is returned exactly once and never stored.
    return json({ ok: true, password, recipient: adminView(rec) }, 200, cors);
  }

  m = p.match(/^\/recipients\/([a-z0-9-]+)\/status$/i);
  if (m && method === 'POST') {
    const slug = m[1].toLowerCase();
    const rec = await getRecord(env, slug);
    if (!rec) return json({ error: 'not_found' }, 404, cors);
    const body = (await readJson(request)) ?? {};
    if (!STATUSES.includes(body.status)) return json({ error: 'bad_status' }, 400, cors);
    if (body.status === 'live') {
      const problem = publishProblems(rec);
      if (problem) return json({ error: problem }, 400, cors);
    }
    rec.status = body.status;
    rec.updated = new Date().toISOString();
    await putRecord(env, slug, rec);
    return json({ ok: true, recipient: adminView(rec) }, 200, cors);
  }

  m = p.match(/^\/recipients\/([a-z0-9-]+)\/preview$/i);
  if (m && method === 'GET') {
    const rec = await getRecord(env, m[1].toLowerCase());
    if (!rec) return json({ error: 'not_found' }, 404, cors);
    return json(await withEmbeddedStudies(env, publicView(rec)), 200, cors);
  }

  if (p === '/events' && method === 'GET') {
    const slug = url.searchParams.get('slug');
    const limit = Math.min(500, Number(url.searchParams.get('limit') ?? 200));
    const events = (await listEvents(env, 2000)).filter((e) => !slug || e.slug === slug).slice(0, limit);
    return json({ events }, 200, cors);
  }

  if (p === '/stats' && method === 'GET') {
    const records = await allRecords(env);
    const events = await listEvents(env, 2000);
    return json(stats(records, events, Date.now()), 200, cors);
  }

  if (p === '/gated' && method === 'GET') {
    const list = await env.RECIPIENTS.list({ prefix: 'gated:' });
    const items = [];
    for (const k of list.keys) {
      const raw = await env.RECIPIENTS.get(k.name);
      if (!raw) continue;
      const g = JSON.parse(raw);
      items.push({ publicSlug: k.name.slice(6), slug: g.slug, title: g.study?.title ?? '', beats: countBeats(g.study), updated: g.updated ?? null });
    }
    return json({ gated: items }, 200, cors);
  }

  m = p.match(/^\/gated\/([a-z0-9-]+)$/i);
  if (m) {
    const key = `gated:${m[1].toLowerCase()}`;
    if (method === 'GET') {
      const raw = await env.RECIPIENTS.get(key);
      return raw ? json(JSON.parse(raw), 200, cors) : json({ error: 'not_found' }, 404, cors);
    }
    if (method === 'PUT') {
      const body = await readJson(request);
      if (!body || typeof body.slug !== 'string' || !body.study || typeof body.study !== 'object' || !body.study.title) {
        return json({ error: 'bad_gated_payload', expected: '{ slug, study: { title, ... } }' }, 400, cors);
      }
      await env.RECIPIENTS.put(key, JSON.stringify({ slug: body.slug, study: body.study, updated: new Date().toISOString() }));
      return json({ ok: true }, 200, cors);
    }
    if (method === 'DELETE') {
      await env.RECIPIENTS.delete(key);
      return json({ ok: true }, 200, cors);
    }
  }

  if (p === '/password/generate' && method === 'POST') {
    const body = (await readJson(request)) ?? {};
    return json({ password: generatePassword(body.words ?? []) }, 200, cors);
  }

  return json({ error: 'not_found' }, 404, cors);
}

// ===========================================================================
// Records
// ===========================================================================

async function getRecord(env, slug) {
  const raw = await env.RECIPIENTS.get(slug);
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    rec.slug = rec.slug || slug;
    if (!rec.status) rec.status = 'live'; // records published before the admin existed are live by definition
    return rec;
  } catch { return null; }
}

async function putRecord(env, slug, record) {
  record.slug = slug;
  await env.RECIPIENTS.put(slug, JSON.stringify(record));
}

async function allRecords(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.RECIPIENTS.list({ cursor, limit: 1000 });
    for (const k of page.keys) {
      if (k.name.includes(':')) continue;
      const rec = await getRecord(env, k.name);
      if (rec) out.push(rec);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

/** Validate and normalize an admin or publish write. Password plaintext is
 *  hashed here; protected is derived; status defaults to draft. */
export async function normalizeRecord(slug, body, existing) {
  const now = new Date().toISOString();
  const rec = { ...(existing ?? {}), ...body, slug };
  delete rec.password;
  if (typeof body.password === 'string' && body.password.length > 0) {
    rec.password_salt = randomHex(16);
    rec.password_hash = await hashPassword(body.password, rec.password_salt);
    rec.password_set = now;
  }
  if (rec.funnel_stage && !FUNNEL_STAGES.includes(rec.funnel_stage)) return { error: 'bad_funnel_stage' };
  if (rec.access_mode && !ACCESS_MODES.includes(rec.access_mode)) return { error: 'bad_access_mode' };
  if (rec.status && !STATUSES.includes(rec.status)) return { error: 'bad_status' };
  if (!Array.isArray(rec.picks)) rec.picks = [];
  for (const pick of rec.picks) {
    if (!pick || typeof pick !== 'object') return { error: 'bad_pick' };
    if (!pick.case_study && !pick.study?.slug) return { error: 'pick_missing_case_study' };
    if (typeof pick.framing !== 'string') pick.framing = '';
    if (pick.study && (!pick.study.title || !pick.study.slug)) return { error: 'pick_embedded_study_incomplete' };
  }
  const hasGatedPick = rec.picks.some((p) => !!p.study || p.gated === true);
  rec.protected = rec.access_mode === 'protected-deep-dive' || hasGatedPick || (body.protected === true) || (!!rec.password_hash && body.protected !== false);
  if (rec.protected && !rec.expires) return { error: 'expires_required_when_protected' };
  if (rec.expires && !/^\d{4}-\d{2}-\d{2}/.test(String(rec.expires))) return { error: 'bad_expires' };
  if (!rec.status) rec.status = existing?.status ?? 'draft';
  rec.created = rec.created ?? now;
  rec.updated = now;
  return { record: rec };
}

export function publishProblems(rec) {
  if (!rec.picks?.length) return 'no_picks';
  if (rec.protected && !rec.password_hash) return 'password_required_before_publish';
  if (rec.protected && !rec.expires) return 'expires_required_when_protected';
  if (rec.expires && isExpired(rec.expires)) return 'already_expired';
  return null;
}

/** Everything the page renders, and nothing that governs access. */
export function publicView(record) {
  const { password_hash, password_salt, password, hash, status, notes, password_set, jd, role, ...rest } = record;
  return rest;
}

export function adminView(record) {
  const { password_hash, password_salt, password, ...rest } = record;
  return { ...rest, has_password: !!record.password_hash };
}

export function summary(rec, views = 0) {
  return {
    slug: rec.slug, company: rec.company ?? '', recipient_name: rec.recipient_name ?? '', recipient_title: rec.recipient_title ?? '',
    status: rec.status ?? 'live', protected: !!rec.protected, expires: rec.expires ?? null, expired: isExpired(rec.expires),
    picks: rec.picks?.length ?? 0, gated_picks: (rec.picks ?? []).filter((p) => !!p.study || p.gated).length,
    funnel_stage: rec.funnel_stage ?? null, access_mode: rec.access_mode ?? null,
    created: rec.created ?? null, updated: rec.updated ?? null, has_password: !!rec.password_hash, views,
  };
}

/** A preview of a record whose gated picks reference a gated: entry by slug
 *  rather than embedding it. The public GET does not do this: a published
 *  record carries what it needs, and a reference that resolves at read time
 *  would mean a later edit to the gated entry changes what a live link says. */
async function withEmbeddedStudies(env, view) {
  for (const pick of view.picks ?? []) {
    if (pick.study || !pick.gated) continue;
    const raw = await env.RECIPIENTS.get(`gated:${pick.case_study}`);
    if (raw) pick.study = JSON.parse(raw).study;
  }
  return view;
}

function countBeats(study) {
  if (!study?.beats) return 0;
  return Object.values(study.beats).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
}

export function stats(records, events, now) {
  const day = 86_400_000;
  const since = (d) => events.filter((e) => now - Date.parse(e.ts) < d * day);
  const last30 = since(30);
  const byType = {};
  for (const e of last30) byType[e.event] = (byType[e.event] ?? 0) + 1;
  const viewsBySlug = {};
  for (const e of last30) if (e.event === 'recipient_portfolio_viewed') viewsBySlug[e.slug] = (viewsBySlug[e.slug] ?? 0) + 1;
  const expiringSoon = records.filter((r) => r.status === 'live' && r.expires && !isExpired(r.expires) && Date.parse(r.expires) - now < 14 * day).map((r) => ({ slug: r.slug, company: r.company ?? '', expires: r.expires }));
  const daily = [];
  for (let i = 13; i >= 0; i -= 1) {
    const start = now - (i + 1) * day;
    const end = now - i * day;
    const n = events.filter((e) => { const t = Date.parse(e.ts); return t >= start && t < end && e.event === 'recipient_portfolio_viewed'; }).length;
    daily.push({ day: new Date(end).toISOString().slice(0, 10), views: n });
  }
  return {
    recipients: records.length,
    live: records.filter((r) => r.status === 'live' && !isExpired(r.expires)).length,
    drafts: records.filter((r) => r.status === 'draft').length,
    protected: records.filter((r) => r.protected).length,
    expired: records.filter((r) => r.status === 'expired' || isExpired(r.expires)).length,
    expiringSoon,
    last30: byType,
    topRecipients: Object.entries(viewsBySlug).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([slug, views]) => ({ slug, views })),
    daily,
    lastEvent: events[0] ?? null,
  };
}

// ===========================================================================
// Passwords
// ===========================================================================

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: PBKDF2_ROUNDS }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(supplied, record) {
  if (!record.password_hash || !record.password_salt) return false;
  const candidate = await hashPassword(normalizePassword(supplied), record.password_salt);
  return constantTimeEqual(candidate, record.password_hash);
}

/** Passwords are four hyphenated words. Spaces, case and stray punctuation
 *  are forgiven: a recipient typing "Harbor Grid Ledger Tide" is right. */
export function normalizePassword(s) {
  return String(s).trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

/** Two words from the target's own language, two from the house list,
 *  shuffled. Falls back to four house words when no target words are given. */
export function generatePassword(targetWords = [], rand = cryptoRandom) {
  const clean = (w) => String(w).toLowerCase().replace(/[^a-z]/g, '');
  const pool = [...new Set(targetWords.map(clean).filter((w) => w.length >= 3 && w.length <= 10))];
  const house = [...HOUSE_WORDS];
  const pickFrom = (arr) => arr.splice(Math.floor(rand() * arr.length), 1)[0];
  const words = [];
  while (words.length < 2 && pool.length) words.push(pickFrom(pool));
  while (words.length < 4) words.push(pickFrom(house));
  for (let i = words.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words.join('-');
}

function cryptoRandom() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

export function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a || '');
  const y = enc.encode(b || '');
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function randomHex(bytes) { return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes))); }
function bytesToHex(b) { return [...b].map((v) => v.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) {
  const out = new Uint8Array(Math.ceil((hex || '').length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.substr(i * 2, 2), 16) || 0;
  return out;
}

// ===========================================================================
// Expiry, rate limiting, events
// ===========================================================================

/** Date-only values expire at the END of that day. */
export function isExpired(expires, now = Date.now()) {
  if (!expires) return false;
  const t = Date.parse(expires);
  if (Number.isNaN(t)) return false;
  const endOfDay = /^\d{4}-\d{2}-\d{2}$/.test(expires) ? t + 86_400_000 - 1 : t;
  return now > endOfDay;
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

async function rateLimited(env, request) {
  const raw = await env.RECIPIENTS.get(`rl:${clientIp(request)}`);
  return Number(raw ?? 0) >= RATE_LIMIT.attempts;
}

async function countFailure(env, request) {
  const key = `rl:${clientIp(request)}`;
  const n = Number((await env.RECIPIENTS.get(key)) ?? 0) + 1;
  await env.RECIPIENTS.put(key, String(n), { expirationTtl: RATE_LIMIT.windowSeconds });
}

export function eventKey(now = Date.now(), rand = randomHex(3)) {
  // Reverse timestamp so a prefix list returns newest first.
  return `event:${String(9_999_999_999_999 - now).padStart(13, '0')}:${rand}`;
}

async function logEvent(env, event, slug, request, extra = {}) {
  const cf = request.cf || {};
  const record = {
    ts: new Date().toISOString(), event, slug,
    referrer: request.headers.get('referer') || null,
    ua: (request.headers.get('user-agent') || '').slice(0, 160) || null,
    country: cf.country || null, city: cf.city || null,
    ...extra,
  };
  await env.RECIPIENTS.put(eventKey(), JSON.stringify(record), { expirationTtl: EVENT_TTL_DAYS * 86_400 });
  await capturePosthog(env, event, slug, record);
}

async function listEvents(env, max = 500) {
  const out = [];
  let cursor;
  do {
    const page = await env.RECIPIENTS.list({ prefix: 'event:', cursor, limit: Math.min(1000, max) });
    for (const k of page.keys) {
      const raw = await env.RECIPIENTS.get(k.name);
      if (raw) { try { out.push(JSON.parse(raw)); } catch { /* skip */ } }
      if (out.length >= max) return out;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

async function capturePosthog(env, event, slug, props) {
  if (!env.POSTHOG_API_KEY || !env.POSTHOG_HOST) return;
  try {
    await fetch(`${env.POSTHOG_HOST}/capture/`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: env.POSTHOG_API_KEY, event, distinct_id: slug, properties: { ...props, $lib: 'cloudflare-worker' } }),
    });
  } catch { /* analytics never affects the visitor */ }
}

// ===========================================================================
// Images
// ===========================================================================

async function listImages(slug, url, env, cors) {
  if (!env.IMAGES) return json({ error: 'images_not_configured' }, 500, cors);
  const listed = await env.IMAGES.list({ prefix: `${slug}/`, limit: 200 });
  const images = listed.objects
    .filter((o) => !o.key.endsWith('/') && ext(o.key) in IMAGE_TYPES)
    .sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }))
    .map((o) => { const file = o.key.slice(slug.length + 1); return { src: `${url.origin}/images/${slug}/${file}`, alt: altFromFilename(file), file, bytes: o.size }; });
  return json({ slug, count: images.length, images }, 200, cors, { 'cache-control': 'public, max-age=60, s-maxage=300' });
}

async function serveImage(key, env, cors) {
  if (!env.IMAGES) return json({ error: 'images_not_configured' }, 500, cors);
  const obj = await env.IMAGES.get(key);
  if (!obj) return json({ error: 'not_found' }, 404, cors);
  const headers = new Headers(cors);
  obj.writeHttpMetadata?.(headers);
  headers.set('content-type', IMAGE_TYPES[ext(key)] || 'application/octet-stream');
  if (obj.httpEtag) headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { status: 200, headers });
}

function ext(key) { const i = key.lastIndexOf('.'); return i === -1 ? '' : key.slice(i + 1).toLowerCase(); }

export function altFromFilename(file) {
  const base = file.replace(/\.[^.]+$/, '').replace(/\.[0-9a-f]{8}$/i, '').replace(/^\d+[-_]?/, '');
  const words = base.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

// ===========================================================================
// Shared
// ===========================================================================

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOW_ORIGIN || '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
  };
}

function json(obj, status, cors, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...(cors || {}), 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function readPassword(request) {
  const body = await readJson(request);
  return typeof body?.password === 'string' ? body.password : null;
}
