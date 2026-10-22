#!/usr/bin/env node
/**
 * Accessibility assertions on rendered pages: axe-core injected into the
 * Playwright Chromium already on the machine, against the dev server.
 * Fails on any serious or critical violation; prints the rest.
 *
 *   node scripts/verify-axe.mjs            (needs npm run dev on :5173 and :8787)
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SITE_BASE ?? 'http://127.0.0.1:5173';
const PASSWORD = process.env.RECIPIENT_PASSWORD ?? 'harbor-grid-ledger-tide';
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
  for (const cand of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
    const p = dir && join(root, dir, cand);
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

const pages = [
  { name: 'home', path: '/' },
  { name: 'work', path: '/work' },
  { name: 'study', path: '/work/maf-machine-ai-endurance-coach' },
  { name: 'study-gate', path: '/work/agentic-decision-layer-defense' },
  { name: 'about', path: '/about' },
  { name: 'writing', path: '/writing' },
  { name: 'recipient-gate', path: '/for/acme-7f3k9x' },
  { name: 'recipient-space', path: '/for/acme-7f3k9x', setup: async (p) => { await p.getByLabel('Password').fill(PASSWORD); await p.getByRole('button', { name: 'Open', exact: true }).click(); await p.waitForTimeout(1500); } },
  { name: 'admin-login', path: '/admin', noAuth: true },
  { name: 'admin-dashboard', path: '/admin', auth: true },
  { name: 'admin-editor', path: '/admin/recipients/acme-7f3k9x', auth: true },
];

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let failed = false;
for (const pg of pages) {
  const page = await context.newPage();
  if (pg.auth) await page.addInitScript(() => { try { sessionStorage.setItem('bm-admin-token', 'dev-admin-token'); } catch {} });
  await page.goto(`${BASE}${pg.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  if (pg.setup) await pg.setup(page);
  await page.evaluate(async () => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 300)); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.waitForTimeout(600);
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => {
    // Content under test is the page; the dev-only placeholder SVGs are images.
    return await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
  });
  const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const minor = result.violations.filter((v) => !(v.impact === 'serious' || v.impact === 'critical'));
  console.log(`${pg.name}: ${result.violations.length} violation(s), ${serious.length} serious or critical, ${result.passes.length} rules passed`);
  for (const v of result.violations) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`);
    for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.target.join(' ')}`);
  }
  void minor;
  if (serious.length) failed = true;
  await page.close();
}
await browser.close();
if (failed) { console.error('axe: serious or critical violations found'); process.exit(1); }
console.log('axe: no serious or critical violations');
