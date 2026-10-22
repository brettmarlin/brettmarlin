import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, {
  hashPassword, verifyPassword, normalizePassword, generatePassword, isExpired, normalizeRecord,
  publishProblems, publicView, adminView, pickNamesStudy, stats, eventKey, altFromFilename, constantTimeEqual, randomHex,
} from './index.mjs';

function kv() {
  const store = new Map();
  const meta = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v, opts = {}) { store.set(k, v); if (opts.metadata) meta.set(k, opts.metadata); },
    async delete(k) { store.delete(k); meta.delete(k); },
    async list({ prefix = '' } = {}) { return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name, metadata: meta.get(name) })), list_complete: true }; },
  };
}
const ctx = () => { const waits = []; return { waitUntil: (p) => waits.push(p), waits }; };
const call = (env, path, init = {}) => worker.fetch(new Request(`https://w.test${path}`, init), env, ctx());
const jsonBody = (obj, extra = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(obj) });
const admin = (token) => ({ authorization: `Bearer ${token}` });

async function liveProtected(store, slug, password, picks, extra = {}) {
  const salt = randomHex(16);
  store.set(slug, JSON.stringify({ slug, company: 'Acme', recipient_name: 'Acme team', callout: 'Selected work for Acme', picks, protected: true, status: 'live', expires: '2999-01-01', password_salt: salt, password_hash: await hashPassword(password, salt), ...extra }));
}

test('passwords: hash verifies, normalization forgives case, spaces and punctuation', async () => {
  const salt = randomHex(16);
  const rec = { password_salt: salt, password_hash: await hashPassword('harbor-grid-ledger-tide', salt) };
  assert.equal(await verifyPassword('harbor-grid-ledger-tide', rec), true);
  assert.equal(await verifyPassword('Harbor Grid Ledger Tide', rec), true);
  assert.equal(await verifyPassword(' harbor_grid-ledger  tide. ', rec), true);
  assert.equal(await verifyPassword('harbor-grid-ledger-tides', rec), false);
  assert.equal(await verifyPassword('x', { password_salt: salt }), false);
  assert.equal(normalizePassword('A  B--c'), 'a-b-c');
});

test('generatePassword: two target words, two house words, four total, deterministic under a seeded rand', () => {
  let i = 0; const seq = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6];
  const rand = () => seq[i++ % seq.length];
  const pw = generatePassword(['Blockchain', 'Intelligence', 'tiny', 'x'], rand);
  const words = pw.split('-');
  assert.equal(words.length, 4);
  assert.equal(words.filter((w) => ['blockchain', 'intelligence', 'tiny'].includes(w)).length, 2);
  assert.equal(generatePassword([], rand).split('-').length, 4);
  assert.match(generatePassword(), /^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/);
});

test('isExpired: date-only values expire at the end of the day', () => {
  const noon = Date.parse('2026-08-01T12:00:00Z');
  assert.equal(isExpired('2026-08-01', noon), false);
  assert.equal(isExpired('2026-08-01', Date.parse('2026-08-02T00:00:00Z')), true);
  assert.equal(isExpired(undefined, noon), false);
  assert.equal(isExpired('garbage', noon), false);
});

test('normalizeRecord: derives protected, demands expiry, hashes plaintext, defaults to draft', async () => {
  const bad = await normalizeRecord('a-1', { access_mode: 'protected-deep-dive', picks: [{ case_study: 'x', framing: '' }] }, null);
  assert.equal(bad.error, 'expires_required_when_protected');
  const ok = await normalizeRecord('a-1', { access_mode: 'protected-deep-dive', expires: '2999-01-01', password: 'pw-one-two-three', picks: [{ case_study: 'x', framing: 'why' }] }, null);
  assert.equal(ok.record.protected, true);
  assert.equal(ok.record.status, 'draft');
  assert.ok(ok.record.password_hash && ok.record.password_salt);
  assert.equal(ok.record.password, undefined);
  const gatedPick = await normalizeRecord('a-2', { access_mode: 'public-preview', expires: '2999-01-01', picks: [{ case_study: 'pub', gated: true, framing: '' }] }, null);
  assert.equal(gatedPick.record.protected, true, 'a gated pick forces protection whatever the mode says');
  const pub = await normalizeRecord('a-3', { access_mode: 'public-preview', picks: [{ case_study: 'pub', framing: '' }] }, null);
  assert.equal(pub.record.protected, false);
  assert.equal((await normalizeRecord('a-4', { funnel_stage: 'nope', picks: [] }, null)).error, 'bad_funnel_stage');
  assert.equal((await normalizeRecord('a-5', { picks: [{ framing: 'no study' }] }, null)).error, 'pick_missing_case_study');
  assert.equal((await normalizeRecord('a-6', { expires: '2026-13-45', picks: [] }, null)).error, 'bad_expires', 'a date that parses to nothing is refused');
  assert.equal((await normalizeRecord('a-7', { expires: '2026-10-22garbage', picks: [] }, null)).error, 'bad_expires');
});

test('publishProblems names what blocks going live', () => {
  assert.equal(publishProblems({ picks: [] }), 'no_picks');
  assert.equal(publishProblems({ picks: [{}], protected: true }), 'password_required_before_publish');
  assert.equal(publishProblems({ picks: [{}], protected: true, password_hash: 'h', expires: '2000-01-01' }), 'already_expired');
  assert.equal(publishProblems({ picks: [{}], protected: false }), null);
});

test('publicView strips everything that governs access; adminView strips the hash but says one exists', () => {
  const rec = { slug: 's', password_hash: 'h', password_salt: 's', status: 'live', notes: 'n', picks: [], company: 'C' };
  const pub = publicView(rec);
  assert.deepEqual(Object.keys(pub).sort(), ['callout', 'company', 'company_context', 'intro', 'picks', 'protected', 'recipient_name', 'recipient_title', 'slug']);
  assert.equal(pub.status, undefined);
  assert.equal(pub.notes, undefined);
  const withExtra = publicView({ slug: 's', picks: [{ case_study: 'x', framing: 'f', secret_note: 'no' }], funnel_stage: 'active-evaluation', jd: 'url', expires: '2999-01-01' });
  assert.equal(withExtra.funnel_stage, undefined, 'pipeline state never reaches the reader');
  assert.equal(withExtra.picks[0].secret_note, undefined, 'unknown pick fields never reach the reader');
  assert.equal(withExtra.expires, '2999-01-01');
  const adm = adminView(rec);
  assert.equal(adm.password_hash, undefined);
  assert.equal(adm.has_password, true);
  assert.equal(adm.status, 'live');
});

test('recipient route: 404 for drafts and unknowns, 401 challenge names the recipient, wrong password 401, right password returns the view and logs', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 't' };
  await liveProtected(store.store, 'acme-1', 'one-two-three-four', [{ case_study: 'carta', framing: 'f' }]);
  store.store.set('draft-1', JSON.stringify({ slug: 'draft-1', status: 'draft', picks: [] }));
  assert.equal((await call(env, '/api/recipient/nope')).status, 404);
  assert.equal((await call(env, '/api/recipient/draft-1')).status, 404);
  const challenge = await call(env, '/api/recipient/acme-1');
  assert.equal(challenge.status, 401);
  assert.deepEqual(await challenge.json(), { error: 'password_required', protected: true, recipient_name: 'Acme team', company: 'Acme' });
  assert.equal((await call(env, '/api/recipient/acme-1', jsonBody({ password: 'wrong' }))).status, 401);
  const ok = await call(env, '/api/recipient/acme-1', jsonBody({ password: 'One Two Three Four' }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.callout, 'Selected work for Acme');
  assert.equal(body.expires, '2999-01-01');
  assert.equal(body.protected, true);
  assert.equal(body.password_hash, undefined);
  assert.equal(body.status, undefined);
  const events = [...store.store.keys()].filter((k) => k.startsWith('event:'));
  assert.ok(events.length >= 2, 'failed and successful attempts are both logged');
  const listed = await (await call(env, '/api/admin/events', { headers: admin('t') })).json();
  assert.ok(listed.events.some((e) => e.event === 'recipient_portfolio_viewed' && e.slug === 'acme-1'), 'events are read back from key metadata');
});

test('recipient route: anonymous views are logged once per address, slug and window; password attempts every time', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 't' };
  await liveProtected(store.store, 'acme-2', 'one-two-three-four', [{ case_study: 'carta', framing: 'f' }]);
  store.store.set('open-1', JSON.stringify({ slug: 'open-1', status: 'live', picks: [] }));
  for (let i = 0; i < 5; i++) assert.equal((await call(env, '/api/recipient/open-1')).status, 200);
  const views = () => [...store.store.keys()].filter((k) => k.startsWith('event:')).length;
  assert.equal(views(), 1, 'five reloads of an open link write one view event');
  assert.ok(store.store.has('seen:recipient_portfolio_viewed:open-1:unknown'), 'the dedupe key names event, slug and address (no client header in tests)');
  for (let i = 0; i < 3; i++) assert.equal((await call(env, '/api/recipient/acme-2', jsonBody({ password: 'wrong' }))).status, 401);
  assert.equal(views(), 4, 'every failed password attempt is logged');
  store.store.set('gone-1', JSON.stringify({ slug: 'gone-1', status: 'live', expires: '2000-01-01', picks: [] }));
  for (let i = 0; i < 5; i++) assert.equal((await call(env, '/api/recipient/gone-1')).status, 410);
  assert.equal(views(), 5, 'an expired link logs once per window too');
});

test('events: a long referer and user agent are cut so the record stays under the KV metadata cap', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 't' };
  store.store.set('open-2', JSON.stringify({ slug: 'open-2', status: 'live', picks: [] }));
  const headers = { referer: `https://example.com/?x=${'r'.repeat(4000)}`, 'user-agent': 'u'.repeat(3000) };
  assert.equal((await call(env, '/api/recipient/open-2', { headers })).status, 200);
  const listed = await (await call(env, '/api/admin/events', { headers: admin('t') })).json();
  const ev = listed.events.find((e) => e.slug === 'open-2');
  assert.ok(ev, 'the view was logged');
  assert.equal(ev.referrer.length, 200);
  assert.equal(ev.ua.length, 160);
  assert.ok(JSON.stringify(ev).length < 1024, `record is ${JSON.stringify(ev).length} bytes`);
});

test('recipient route: a gated pick by reference is embedded from the gated: entry at read time', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 't' };
  store.store.set('gated:public-one', JSON.stringify({ slug: 'secret-one', study: { slug: 'secret-one', title: 'Named take', built: ['x'], result: 'y' } }));
  await liveProtected(store.store, 'acme-9', 'a-b-c-d', [{ case_study: 'public-one', take: 'recipient-named', gated: true, framing: 'f' }, { case_study: 'carta', framing: 'g' }]);
  const res = await call(env, '/api/recipient/acme-9', jsonBody({ password: 'a-b-c-d' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.picks[0].study.title, 'Named take', 'the reader gets the named take, not the public one');
  assert.equal(body.picks[1].study, undefined);
});

test('recipient route: expiry wins over the password and answers 410 with the date', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 't' };
  await liveProtected(store.store, 'old-1', 'a-b-c-d', [{ case_study: 'carta' }], { expires: '2000-01-01' });
  const res = await call(env, '/api/recipient/old-1', jsonBody({ password: 'a-b-c-d' }));
  assert.equal(res.status, 410);
  assert.equal((await res.json()).expires, '2000-01-01');
});

test('recipient route: a public preview needs no password and a record without status is live', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 't' };
  store.store.set('open-1', JSON.stringify({ slug: 'open-1', company: 'Open', picks: [{ case_study: 'carta', framing: 'f' }], protected: false }));
  const res = await call(env, '/api/recipient/open-1');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).company, 'Open');
});

test('rate limit: the eleventh attempt from one address is refused with 429, counted before the password is checked', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 't' };
  await liveProtected(store.store, 'acme-2', 'one-two-three-four', [{ case_study: 'carta' }]);
  const hdr = { 'cf-connecting-ip': '203.0.113.9' };
  for (let i = 0; i < 10; i += 1) {
    const r = await call(env, '/api/recipient/acme-2', jsonBody({ password: 'bad' }, hdr));
    assert.equal(r.status, 401);
  }
  assert.equal(store.store.get('rl:203.0.113.9'), '10', 'the counter is written before the verify, not in waitUntil afterwards');
  const limited = await call(env, '/api/recipient/acme-2', jsonBody({ password: 'one-two-three-four' }, hdr));
  assert.equal(limited.status, 429, 'even the right password is refused inside the window');
  const other = await call(env, '/api/recipient/acme-2', jsonBody({ password: 'one-two-three-four' }, { 'cf-connecting-ip': '198.51.100.2' }));
  assert.equal(other.status, 200, 'another address is unaffected');
});

test('study gate: 404 when nothing is gated, locked:true otherwise, and unlock accepts any granting recipient password', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 't' };
  assert.equal((await call(env, '/api/study/public-one/gate')).status, 404);
  store.store.set('gated:public-one', JSON.stringify({ slug: 'secret-one', study: { slug: 'secret-one', title: 'Named take', built: ['x'], result: 'y' } }));
  const gate = await call(env, '/api/study/public-one/gate');
  assert.equal(gate.status, 200);
  assert.deepEqual(await gate.json(), { locked: true }, 'the gate reveals nothing but that it exists');
  await liveProtected(store.store, 'acme-3', 'first-pass-word-a', [{ case_study: 'secret-one', framing: 'f', gated: true }]);
  await liveProtected(store.store, 'globex-4', 'second-pass-word-b', [{ case_study: '[[case-studies/public-one]]', take: 'recipient-named', framing: 'f' }]);
  await liveProtected(store.store, 'nobody-5', 'third-pass-word-c', [{ case_study: 'carta', framing: 'f' }]);
  await liveProtected(store.store, 'plain-6', 'fourth-pass-word-d', [{ case_study: 'public-one', framing: 'f' }]);
  assert.equal((await call(env, '/api/study/public-one/unlock', jsonBody({ password: 'third-pass-word-c' }))).status, 401, 'a recipient without this pick cannot unlock it');
  assert.equal((await call(env, '/api/study/public-one/unlock', jsonBody({ password: 'fourth-pass-word-d' }))).status, 401, 'a plain public pick of the study grants nothing');
  const a = await call(env, '/api/study/public-one/unlock', jsonBody({ password: 'first-pass-word-a' }));
  assert.equal(a.status, 200);
  assert.equal((await a.json()).study.title, 'Named take');
  const b = await call(env, '/api/study/public-one/unlock', jsonBody({ password: 'second pass word b' }));
  assert.equal(b.status, 200, 'a recipient-named pick via a wikilink grants');
  assert.equal((await call(env, '/api/study/nothing/unlock', jsonBody({ password: 'x' }))).status, 404);
});

test('pickNamesStudy grants only picks chosen as the gated take', () => {
  assert.equal(pickNamesStudy({ case_study: '[[case-studies/alpha]]' }, 'alpha', 'beta'), false, 'a plain public pick');
  assert.equal(pickNamesStudy({ case_study: '[[case-studies/alpha]]', gated: true }, 'alpha', 'beta'), true);
  assert.equal(pickNamesStudy({ case_study: '[[case-studies/alpha]]', take: 'recipient-named' }, 'alpha', 'beta'), true);
  assert.equal(pickNamesStudy({ case_study: 'beta' }, 'alpha', 'beta'), true, 'naming the gated slug itself');
  assert.equal(pickNamesStudy({ case_study: 'gamma', study: { slug: 'alpha' } }, 'alpha', null), true, 'an embedded study');
  assert.equal(pickNamesStudy({ case_study: 'gamma' }, 'alpha', 'beta'), false);
});

test('admin: every route needs the bearer token; CRUD, password rotation and publish gates work end to end', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 'secret-token' };
  assert.equal((await call(env, '/api/admin/me')).status, 401);
  assert.equal((await call(env, '/api/admin/me', { headers: admin('wrong') })).status, 401);
  assert.equal((await call(env, '/api/admin/me', { headers: admin('secret-token') })).status, 200);

  const put = await call(env, '/api/admin/recipients/initech-9z', { method: 'PUT', headers: { ...admin('secret-token'), 'content-type': 'application/json' }, body: JSON.stringify({ company: 'Initech', access_mode: 'protected-deep-dive', expires: '2999-06-01', picks: [{ case_study: 'carta', framing: 'f' }] }) });
  assert.equal(put.status, 200);
  const rec = (await put.json()).recipient;
  assert.equal(rec.status, 'draft');
  assert.equal(rec.protected, true);
  assert.equal(rec.has_password, false);

  const blocked = await call(env, '/api/admin/recipients/initech-9z/status', jsonBody({ status: 'live' }, admin('secret-token')));
  assert.equal(blocked.status, 400);
  assert.equal((await blocked.json()).error, 'password_required_before_publish');

  const rotated = await call(env, '/api/admin/recipients/initech-9z/password', jsonBody({ words: ['Initech', 'TPS', 'Reports'] }, admin('secret-token')));
  assert.equal(rotated.status, 200);
  const { password } = await rotated.json();
  assert.match(password, /^[a-z]+-[a-z]+-[a-z]+-[a-z]+$/);

  const live = await call(env, '/api/admin/recipients/initech-9z/status', jsonBody({ status: 'live' }, admin('secret-token')));
  assert.equal(live.status, 200);

  const visitor = await call(env, '/api/recipient/initech-9z', jsonBody({ password }));
  assert.equal(visitor.status, 200);

  const list = await call(env, '/api/admin/recipients', { headers: admin('secret-token') });
  const { recipients } = await list.json();
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].views, 1);

  const ev = await call(env, '/api/admin/events?slug=initech-9z', { headers: admin('secret-token') });
  const { events } = await ev.json();
  assert.equal(events[0].event, 'recipient_portfolio_viewed');

  const st = await call(env, '/api/admin/stats', { headers: admin('secret-token') });
  const s = await st.json();
  assert.equal(s.live, 1);
  assert.equal(s.last30.recipient_portfolio_viewed, 1);

  const gatedPut = await call(env, '/api/admin/gated/public-x', { method: 'PUT', headers: { ...admin('secret-token'), 'content-type': 'application/json' }, body: JSON.stringify({ slug: 'named-x', study: { slug: 'named-x', title: 'T', beats: { 'recipient-named': [{}, {}] } } }) });
  assert.equal(gatedPut.status, 200);
  const gatedList = await (await call(env, '/api/admin/gated', { headers: admin('secret-token') })).json();
  assert.deepEqual(gatedList.gated.map((g) => [g.publicSlug, g.slug, g.beats]), [['public-x', 'named-x', 2]]);
  assert.equal((await call(env, '/api/admin/gated/public-x', { method: 'PUT', headers: { ...admin('secret-token'), 'content-type': 'application/json' }, body: JSON.stringify({ nope: true }) })).status, 400);

  assert.equal((await call(env, '/api/admin/recipients/initech-9z', { method: 'DELETE', headers: admin('secret-token') })).status, 200);
  assert.equal((await call(env, '/api/recipient/initech-9z')).status, 404);
});

test('legacy PUT /api/recipient/:slug still publishes, hashing a plaintext password', async () => {
  const store = kv();
  const env = { RECIPIENTS: store, ADMIN_TOKEN: 'tok' };
  const res = await call(env, '/api/recipient/legacy-1', { method: 'PUT', headers: { ...admin('tok'), 'content-type': 'application/json' }, body: JSON.stringify({ company: 'L', picks: [{ case_study: 'carta', framing: 'f' }], password: 'a-b-c-d', expires: '2999-01-01' }) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, slug: 'legacy-1', protected: true, expires: '2999-01-01', status: 'live' });
  assert.equal((await call(env, '/api/recipient/legacy-1', jsonBody({ password: 'a-b-c-d' }))).status, 200);
});

test('stats: counts, expiring soon within 14 days, daily series of 14 points', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const recs = [
    { slug: 'a', status: 'live', protected: true, expires: '2026-10-30' },
    { slug: 'b', status: 'live', protected: false, expires: '2026-12-30' },
    { slug: 'c', status: 'draft' }, { slug: 'd', status: 'expired', expires: '2026-01-01' },
  ];
  const events = [
    { ts: '2026-10-22T10:00:00Z', event: 'recipient_portfolio_viewed', slug: 'a' },
    { ts: '2026-10-21T10:00:00Z', event: 'recipient_portfolio_viewed', slug: 'a' },
    { ts: '2026-08-01T10:00:00Z', event: 'recipient_portfolio_viewed', slug: 'b' },
    { ts: '2026-10-20T10:00:00Z', event: 'recipient_password_failed', slug: 'a' },
  ];
  const s = stats(recs, events, now);
  assert.equal(s.recipients, 4); assert.equal(s.live, 2); assert.equal(s.drafts, 1); assert.equal(s.expired, 1);
  assert.deepEqual(s.expiringSoon.map((e) => e.slug), ['a']);
  assert.equal(s.last30.recipient_portfolio_viewed, 2);
  assert.deepEqual(s.topRecipients, [{ slug: 'a', views: 2 }]);
  assert.equal(s.daily.length, 14);
  assert.equal(s.daily.reduce((n, d) => n + d.views, 0), 2);
});

test('eventKey sorts newest first; altFromFilename strips index and hash; constantTimeEqual', () => {
  assert.ok(eventKey(2000, 'aa') < eventKey(1000, 'aa'));
  assert.equal(altFromFilename('01-three-pane-decision-workflow.jpg'), 'Three pane decision workflow');
  assert.equal(altFromFilename('00-hero.f7a37055.png'), 'Hero');
  assert.equal(constantTimeEqual('abc', 'abc'), true);
  assert.equal(constantTimeEqual('abc', 'abd'), false);
  assert.equal(constantTimeEqual('', undefined), true);
});

test('CORS preflight and unknown routes', async () => {
  const env = { RECIPIENTS: kv(), ADMIN_TOKEN: 't', ALLOW_ORIGIN: 'https://www.brettmarlin.xyz' };
  const pre = await call(env, '/api/recipient/x', { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://www.brettmarlin.xyz');
  assert.equal((await call(env, '/nope')).status, 404);
  assert.equal((await call(env, '/api/health')).status, 200);
  assert.equal((await call(env, '/api/images/x')).status, 500, 'images are announced as unconfigured, not silently empty');
});
