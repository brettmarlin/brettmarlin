#!/usr/bin/env node
/**
 * Full-page screenshots of every surface, for review. Uses the Playwright
 * Chromium already on the machine (PLAYWRIGHT_BROWSERS_PATH or a plain
 * executable path) and the dev server on :5173 with the dev API on :8787.
 *
 *   node scripts/screenshots.mjs [--out screenshots] [--only home,work]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const OUT = opt('--out', 'screenshots');
const ONLY = opt('--only', '')?.split(',').filter(Boolean) ?? [];
const BASE = process.env.SITE_BASE ?? 'http://127.0.0.1:5173';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'dev-admin-token';
const PASSWORD = process.env.RECIPIENT_PASSWORD ?? 'harbor-grid-ledger-tide';
mkdirSync(OUT, { recursive: true });

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(root)) {
    const dir = readdirSync(root).find((d) => /^chromium-\d+$/.test(d));
    if (dir) {
      for (const cand of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = join(root, dir, cand);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  // Walk the page so every scroll reveal has fired, then return to the top.
  await page.evaluate(async () => {
    const step = Math.max(300, window.innerHeight * 0.6);
    for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 70)); }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 250));
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(900);
}

const shots = [
  { name: 'home', path: '/' },
  { name: 'home-dark', path: '/', theme: 'dark' },
  { name: 'home-hover', path: '/', full: false, setup: async (p) => { const row = p.locator('.index-row').nth(2); await row.scrollIntoViewIfNeeded(); const box = await row.boundingBox(); if (box) { await p.mouse.move(box.x + 300, box.y + box.height / 2, { steps: 12 }); await p.waitForTimeout(700); } } },
  { name: 'menu', path: '/', full: false, setup: async (p) => { const btn = p.getByRole('button', { name: /Menu/ }); if (await btn.isVisible()) { await btn.click(); await p.waitForTimeout(800); } } },
  { name: 'study-dark', path: '/work/sayari-design-org-turnaround', theme: 'dark', full: false, setup: async (p) => { await p.locator('#decisions').scrollIntoViewIfNeeded(); await p.waitForTimeout(600); } },
  { name: 'work-list', path: '/work' },
  { name: 'work-grid', path: '/work', setup: async (p) => { await p.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Grid' }).click(); await p.waitForTimeout(400); } },
  { name: 'work-years', path: '/work', setup: async (p) => { await p.getByRole('button', { name: /Years/ }).click(); await p.waitForTimeout(400); } },
  { name: 'work-tag', path: '/work/tag/design-systems' },
  { name: 'study-maf', path: '/work/maf-machine-ai-endurance-coach' },
  { name: 'study-sayari', path: '/work/sayari-design-org-turnaround' },
  { name: 'study-defense', path: '/work/agentic-decision-layer-defense' },
  { name: 'study-lobus', path: '/work/lobus-mobile-collector-app' },
  { name: 'study-gate', path: '/work/agentic-decision-layer-defense', full: false, setup: async (p) => { await p.locator('.gate').scrollIntoViewIfNeeded(); await p.waitForTimeout(500); } },
  { name: 'study-unlocked', path: '/work/agentic-decision-layer-defense', setup: async (p) => { await p.locator('.gate').scrollIntoViewIfNeeded(); await p.getByLabel('Password').fill(PASSWORD); await p.getByRole('button', { name: 'Open', exact: true }).click(); await p.waitForTimeout(1800); } },
  { name: 'recipient-gated-study', path: '/for/acme-7f3k9x', setup: async (p) => { await p.getByLabel('Password').fill(PASSWORD); await p.getByRole('button', { name: 'Open', exact: true }).click(); await p.waitForTimeout(1600); await p.locator('.index-row').nth(1).click(); await p.waitForTimeout(1200); } },
  { name: 'lightbox', path: '/work/maf-machine-ai-endurance-coach', full: false, setup: async (p) => { await p.locator('.media-item').first().scrollIntoViewIfNeeded(); await p.locator('.media-item').first().click(); await p.waitForTimeout(600); } },
  { name: 'about', path: '/about' },
  { name: 'writing', path: '/writing' },
  { name: 'not-found', path: '/nothing-here' },
  { name: 'recipient-gate', path: '/for/acme-7f3k9x', full: false },
  { name: 'recipient-wrong', path: '/for/acme-7f3k9x', full: false, setup: async (p) => { await p.getByLabel('Password').fill('nope'); await p.getByRole('button', { name: 'Open', exact: true }).click(); await p.waitForTimeout(900); } },
  { name: 'recipient-space', path: '/for/acme-7f3k9x', setup: async (p) => { await p.getByLabel('Password').fill(PASSWORD); await p.getByRole('button', { name: 'Open', exact: true }).click(); await p.waitForTimeout(1800); } },
  { name: 'recipient-study', path: '/for/acme-7f3k9x', setup: async (p) => { await p.getByLabel('Password').fill(PASSWORD); await p.getByRole('button', { name: 'Open', exact: true }).click(); await p.waitForTimeout(1600); await p.locator('.index-row').first().click(); await p.waitForTimeout(1200); } },
  { name: 'recipient-expired', path: '/for/globex-x9k2mq', full: false },
  { name: 'recipient-missing', path: '/for/expired-zz9999', full: false },
  { name: 'admin-login', path: '/admin', full: false, noAuth: true },
  { name: 'admin-dashboard', path: '/admin' },
  { name: 'admin-recipients', path: '/admin/recipients' },
  { name: 'admin-editor', path: '/admin/recipients/acme-7f3k9x' },
  { name: 'admin-new', path: '/admin/recipients/new' },
  { name: 'admin-events', path: '/admin/events' },
  { name: 'admin-studies', path: '/admin/studies' },
  { name: 'admin-gated', path: '/admin/gated/agentic-decision-layer-defense' },
  { name: 'admin-preview', path: '/admin/recipients/acme-7f3k9x/preview' },
];

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
for (const device of [{ tag: 'desktop', viewport: { width: 1440, height: 900 } }, { tag: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
  const context = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: 1, isMobile: device.isMobile, hasTouch: device.hasTouch });
  await context.addInitScript((token) => { try { sessionStorage.setItem('bm-admin-token', token); } catch {} }, ADMIN_TOKEN);
  for (const s of shots) {
    if (ONLY.length && !ONLY.includes(s.name)) continue;
    if (device.tag === 'mobile' && s.name.startsWith('admin') && s.name !== 'admin-dashboard' && s.name !== 'admin-editor') continue;
    const page = await context.newPage();
    if (s.noAuth) await page.addInitScript(() => { try { sessionStorage.removeItem('bm-admin-token'); } catch {} });
    await page.addInitScript((t) => { try { if (t) localStorage.setItem('bm-theme', t); else localStorage.removeItem('bm-theme'); } catch {} }, s.theme ?? '');
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    if (s.setup) { try { await s.setup(page); } catch (e) { errors.push(`setup: ${e.message}`); } }
    if (s.full !== false) await settle(page); else await page.waitForTimeout(600);
    const file = join(OUT, `${s.name}.${device.tag}.png`);
    await page.screenshot({ path: file, fullPage: s.full !== false });
    if (s.full !== false) await page.screenshot({ path: join(OUT, `${s.name}.${device.tag}.fold.png`), fullPage: false });
    console.log(`${file}${errors.length ? `  ERRORS: ${errors.join(' | ').slice(0, 400)}` : ''}`);
    await page.close();
  }
  await context.close();
}
await browser.close();
