#!/usr/bin/env node
/** Writes public/sitemap.xml from the public bundle. Recipient and admin
 *  routes are never listed; they are noindex by design. */
import { readFileSync, writeFileSync } from 'node:fs';
const SITE = 'https://www.brettmarlin.xyz';
const src = readFileSync(new URL('../src/data/caseStudies.ts', import.meta.url), 'utf8');
const slugs = [...src.matchAll(/^    slug: "([^"]+)",$/gm)].map((m) => m[1]);
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', '/work', '/about', '/writing', ...slugs.map((s) => `/work/${s}`)];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
writeFileSync(new URL('../public/sitemap.xml', import.meta.url), xml);
console.log(`sitemap: ${urls.length} urls`);
