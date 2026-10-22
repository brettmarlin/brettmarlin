#!/usr/bin/env node
/**
 * npm run substack          fetch the feed and write src/data/substack.ts
 * npm run substack -- --check   verify the committed file, no network
 *
 * The writing shelf: Brett's Substack posts as preview cards, linking out.
 *
 * WHY THIS IS NOT A BUILD-TIME FETCH, which is how the plan first worded it.
 * `npm run build` makes zero network calls today — `generate` is where the
 * network lives. Fetching the feed during the build would add a second remote
 * dependency to the gate that decides whether a deploy happens, and Substack
 * being down is not a reason a deploy should fail. So this follows the
 * caseStudies.ts pattern exactly: an explicit generate step writes a COMMITTED
 * data file, and the build reads bytes that are already in the repo.
 *
 * That committed file IS the cached fallback the plan asked for. There is no
 * separate fallback path to keep in sync, because the fallback is the artifact.
 *
 * Consequently `--check` does NOT re-fetch. It validates the shape of what is
 * committed. Refreshing is a deliberate act, like `npm run generate`, and
 * `npm run verify` gains no new network dependency from any of this.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FEED = process.env.SUBSTACK_FEED ?? 'https://brettmarlin.substack.com/feed';
const OUT = fileURLToPath(new URL('../src/data/substack.ts', import.meta.url));
const SNIPPET_MAX = 220;

/** CDATA is Substack's default wrapper for title and description; a feed that
 *  stops using it must still parse, so both forms are accepted. */
export function tagText(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!m) return null;
  const raw = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
  return (cdata ? cdata[1] : raw).trim();
}

/** Entities first, then tags, then whitespace: doing tags first would let an
 *  encoded `&lt;b&gt;` become a real tag and get stripped as markup. */
export function toPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut on a word boundary and mark it. A snippet chopped mid-word reads as a
 *  rendering bug rather than as an excerpt. */
export function snippet(text, max = SNIPPET_MAX) {
  const clean = toPlainText(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, '')}…`;
}

/**
 * The cover image, tried three ways.
 *
 * Substack normally puts it in <enclosure>, but the feed shape is not a
 * contract and I could not read it from this machine to confirm. So: enclosure,
 * then media:content, then the first <img> in the post body. A post with none
 * of those yields no image rather than a broken one, and the card handles it.
 */
export function itemImage(itemXml) {
  const enclosure = /<enclosure[^>]*\surl=["']([^"']+)["'][^>]*>/i.exec(itemXml);
  if (enclosure) return enclosure[1];
  const media = /<media:content[^>]*\surl=["']([^"']+)["'][^>]*>/i.exec(itemXml);
  if (media) return media[1];
  const body = tagText(itemXml, 'content:encoded') ?? tagText(itemXml, 'description') ?? '';
  const img = /<img[^>]*\ssrc=["']([^"']+)["']/i.exec(body);
  return img ? img[1] : null;
}

export function parseFeed(xml) {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  return items.map((item) => {
    const title = toPlainText(tagText(item, 'title') ?? '');
    const url = (tagText(item, 'link') ?? '').trim();
    const pub = tagText(item, 'pubDate');
    const date = pub ? new Date(pub) : null;
    return {
      title,
      url,
      // ISO date only, no time: the card shows a date, and carrying a
      // timestamp would churn the committed file on every regeneration.
      publishedAt: date && !Number.isNaN(date.valueOf()) ? date.toISOString().slice(0, 10) : null,
      snippet: snippet(tagText(item, 'description') ?? tagText(item, 'content:encoded') ?? ''),
      image: itemImage(item),
    };
  }).filter((p) => p.title && p.url);
}

const J = (v) => JSON.stringify(v);

export function emit(posts) {
  const lines = posts.map((p) => {
    const fields = [`title: ${J(p.title)}`, `url: ${J(p.url)}`];
    if (p.publishedAt) fields.push(`publishedAt: ${J(p.publishedAt)}`);
    if (p.snippet) fields.push(`snippet: ${J(p.snippet)}`);
    if (p.image) fields.push(`image: ${J(p.image)}`);
    return `  { ${fields.join(', ')} },`;
  });
  return `// GENERATED from ${FEED} by scripts/generate-substack.mjs.
// DO NOT EDIT BY HAND. Refresh with: npm run substack
//
// Committed on purpose. The build makes no network calls, and these bytes are
// the cached fallback: if Substack is down, the site still renders the shelf
// exactly as it was at the last refresh.

export type SubstackPost = {
  title: string;
  url: string;
  publishedAt?: string;
  snippet?: string;
  image?: string;
};

export const substackPosts: SubstackPost[] = [
${lines.join('\n')}
];
`;
}

async function main() {
  const check = process.argv.includes('--check');

  if (check) {
    if (!existsSync(OUT)) {
      console.error(`error: ${OUT} is missing. Run: npm run substack`);
      process.exit(1);
    }
    const src = readFileSync(OUT, 'utf8');
    const count = (src.match(/^  \{ title: /gm) ?? []).length;
    if (count === 0) {
      console.error('error: substack.ts carries no posts. A shelf with nothing on it should not ship.');
      process.exit(1);
    }
    const missingUrl = (src.match(/^  \{ title: [^\n]*?\}/gm) ?? []).filter((l) => !l.includes('url: "http'));
    if (missingUrl.length) {
      console.error(`error: ${missingUrl.length} post(s) have no link. A preview card that goes nowhere is worse than no card.`);
      process.exit(1);
    }
    console.log(`substack: ${count} posts committed, every one linkable (no network)`);
    return;
  }

  let xml;
  try {
    const res = await fetch(FEED, { headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    // The committed file is the fallback. Refusing to overwrite it with
    // nothing is the whole point of committing it.
    console.error(`substack: could not reach ${FEED} (${err.message})`);
    if (existsSync(OUT)) {
      console.error('substack: leaving the committed file untouched — it is the fallback');
      process.exit(0);
    }
    console.error('substack: and nothing is committed yet, so there is nothing to fall back to');
    process.exit(1);
  }

  const posts = parseFeed(xml);
  if (posts.length === 0) {
    console.error('substack: the feed parsed to zero posts. Not overwriting what is committed.');
    process.exit(1);
  }
  writeFileSync(OUT, emit(posts));

  const withImage = posts.filter((p) => p.image).length;
  const withSnippet = posts.filter((p) => p.snippet).length;
  console.log(`substack: wrote ${posts.length} posts to src/data/substack.ts`);
  console.log(`  with a cover image: ${withImage}/${posts.length}`);
  console.log(`  with a snippet:     ${withSnippet}/${posts.length}`);
  if (withImage < posts.length) {
    console.log('  posts with no image (the card renders text-only for these):');
    for (const p of posts.filter((x) => !x.image)) console.log(`    ${p.title}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
