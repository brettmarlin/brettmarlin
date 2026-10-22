#!/usr/bin/env node
/**
 * Runs the Worker locally on Node with an in-memory KV (persisted to
 * .dev/kv.json between runs) and no R2, so the recipient gate, the per-study
 * unlock and the whole admin panel work without a Cloudflare account. Vite
 * proxies /api and /images here in dev.
 *
 * Seeds one draft and one live protected recipient on first run so there is
 * something to look at. The dev admin token is `dev-admin-token`.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import worker from '../worker/src/index.mjs';

const PORT = Number(process.env.DEV_API_PORT ?? 8787);
const DIR = new URL('../.dev/', import.meta.url).pathname;
const FILE = join(DIR, 'kv.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'dev-admin-token';

function memoryKV(file) {
  const store = new Map();
  const expiry = new Map();
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      for (const [k, v] of Object.entries(saved.store ?? {})) store.set(k, v);
      for (const [k, v] of Object.entries(saved.expiry ?? {})) expiry.set(k, v);
    } catch { /* fresh */ }
  }
  const persist = () => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, JSON.stringify({ store: Object.fromEntries(store), expiry: Object.fromEntries(expiry) }, null, 1));
  };
  const alive = (k) => { const e = expiry.get(k); if (e && Date.now() > e) { store.delete(k); expiry.delete(k); return false; } return store.has(k); };
  return {
    async get(k) { return alive(k) ? store.get(k) : null; },
    async put(k, v, opts = {}) { store.set(k, v); if (opts.expirationTtl) expiry.set(k, Date.now() + opts.expirationTtl * 1000); else expiry.delete(k); persist(); },
    async delete(k) { store.delete(k); expiry.delete(k); persist(); },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [...store.keys()].filter((k) => alive(k) && k.startsWith(prefix)).sort().slice(0, limit).map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

export async function seed(kv, { hashPassword, randomHex }) {
  if (await kv.get('acme-7f3k9x')) return;
  const salt = randomHex(16);
  const now = new Date().toISOString();
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await kv.put('acme-7f3k9x', JSON.stringify({
    slug: 'acme-7f3k9x', recipient_name: 'Acme hiring team', recipient_title: 'Head of Design search', company: 'Acme',
    company_context: 'A fictional company used to exercise the gate locally.',
    callout: 'Selected work for the Acme design team',
    intro: 'Four projects chosen because the role asks for a design org built from zero and hands-on work with agents.',
    funnel_stage: 'active-evaluation', access_mode: 'protected-deep-dive', role: 'Head of Product Design',
    picks: [
      { case_study: 'sayari-design-org-turnaround', take: 'decisions-outcomes', framing: 'The closest domain match I have. I rebuilt an eight-person team into four more senior practitioners at flat budget and helped close a flagship contract.' },
      { case_study: 'agentic-decision-layer-defense', take: 'decisions-outcomes', framing: 'A human and agent decision layer for an air-gapped platform, shipped as production code rather than a handoff document.' },
      { case_study: 'marliin-factory', take: 'decisions-outcomes', framing: 'My own current practice: a pipeline where agents propose missing components as reviewable requests instead of silent inventions.' },
      { case_study: 'carta', take: 'decisions-outcomes', framing: 'Craft standards enforced through tooling. A design technology team and a compliance score on every pull request, to an 80 percent OKR.' },
    ],
    expires: in30, protected: true, status: 'live', created: now, updated: now,
    password_salt: salt, password_hash: await hashPassword('harbor-grid-ledger-tide', salt), password_set: now,
  }));
  await kv.put('northwind-k2m8pq', JSON.stringify({
    slug: 'northwind-k2m8pq', recipient_name: 'Northwind', recipient_title: '', company: 'Northwind',
    company_context: 'A fictional fractional buyer, public preview, no password.',
    callout: 'Selected work for Northwind', intro: '',
    funnel_stage: 'recruiter-preview', access_mode: 'public-preview',
    picks: [
      { case_study: 'maf-machine-ai-endurance-coach', take: 'full-case', framing: 'One person, three weeks, and a market that could not previously be served.' },
      { case_study: 'lobus-verified-object-capture', take: 'decisions-outcomes', framing: 'Generative discovery to an App Store launch in three months.' },
    ],
    protected: false, status: 'draft', created: now, updated: now,
  }));
}

async function main() {
  const kv = memoryKV(FILE);
  const mod = await import('../worker/src/index.mjs');
  await seed(kv, mod);
  const env = { RECIPIENTS: kv, IMAGES: null, ADMIN_TOKEN, ALLOW_ORIGIN: '*' };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : body });
    const waits = [];
    const response = await worker.fetch(request, env, { waitUntil: (p) => waits.push(p) });
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
    await Promise.allSettled(waits);
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`dev api: http://127.0.0.1:${PORT}  (admin token: ${ADMIN_TOKEN}; seeded password for /for/acme-7f3k9x: harbor-grid-ledger-tide)`);
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
