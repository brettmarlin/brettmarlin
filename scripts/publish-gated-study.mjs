#!/usr/bin/env node
/**
 * Build a gated extension from the vault and publish it to the Worker.
 *
 *   npm run gated:publish -- --public <public-site-slug> --slug <gated-card-slug> [--take recipient-named] [--dry-run]
 *
 * Runs scripts/generate-recipient-study.mjs for the gated take (images from
 * the public study's R2 prefix), then PUTs { slug, study } to
 * /api/admin/gated/<public-slug>. Needs ADMIN_TOKEN and an explicit API_BASE
 * in the environment (there is no production default); never prints the token.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
const publicSlug = opt('--public');
const gatedSlug = opt('--slug');
const take = opt('--take', 'recipient-named');
const dry = args.includes('--dry-run');
if (!publicSlug || !gatedSlug) { console.error('usage: --public <public-slug> --slug <gated-card-slug> [--take recipient-named] [--dry-run]'); process.exit(1); }

const out = execFileSync('node', ['scripts/generate-recipient-study.mjs', gatedSlug, '--take', take, '--images-from', publicSlug], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const { study } = JSON.parse(out);
const body = { slug: gatedSlug, study };
if (dry) { console.log(JSON.stringify(body, null, 2)); process.exit(0); }

const base = (process.env.API_BASE ?? '').replace(/\/$/, '');
if (!base) { console.error('API_BASE is not set. Use http://127.0.0.1:8787 for the dev shim, or the Worker URL for production.'); process.exit(1); }
const token = process.env.ADMIN_TOKEN;
if (!token) { console.error('ADMIN_TOKEN is not set'); process.exit(1); }
const res = await fetch(`${base}/api/admin/gated/${encodeURIComponent(publicSlug)}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
