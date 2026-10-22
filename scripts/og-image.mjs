#!/usr/bin/env node
/**
 * Renders public/og-image.png (1200x630) from an inline HTML card in the
 * site's own type and grid, using the Chromium Playwright already has.
 * Fonts come from node_modules so the card matches the site exactly.
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const ROOT = new URL('../', import.meta.url).pathname;
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');
const archivo = b64('node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2');
const mono = b64('node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: A; src: url(data:font/woff2;base64,${archivo}) format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: M; src: url(data:font/woff2;base64,${mono}) format('woff2'); font-weight: 500; }
html, body { margin: 0; width: 1200px; height: 630px; background: #fff; color: #0a0a0a; font-family: A, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.card { position: relative; width: 1200px; height: 630px; padding: 56px 64px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }
.top { display: flex; justify-content: space-between; font-family: M; font-size: 15px; letter-spacing: 0.1em; text-transform: uppercase; color: #7a7a7a; border-bottom: 1px solid #e4e4e1; padding-bottom: 18px; }
.top b { color: #e2231a; font-weight: 500; margin-right: 12px; }
h1 { margin: 0; font-size: 118px; line-height: 0.88; letter-spacing: -0.045em; font-weight: 560; max-width: 1000px; }
.foot { display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px solid #0a0a0a; padding-top: 18px; }
.name { font-size: 28px; letter-spacing: -0.02em; font-weight: 640; }
.meta { font-family: M; font-size: 15px; letter-spacing: 0.1em; text-transform: uppercase; color: #7a7a7a; }
</style></head><body><div class="card">
<div class="top"><span><b>01</b>Brett Marlin</span><span>Portfolio</span><span>San Francisco</span></div>
<h1>Design leader. Twelve years in-house. Still in the file.</h1>
<div class="foot"><span class="name">brettmarlin.xyz</span><span class="meta">Carta, Mixpanel, Blend, Altana, Sayari, Marliin</span></div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(ROOT, 'public/og-image.png'), type: 'png' });
await browser.close();
console.log('wrote public/og-image.png');
