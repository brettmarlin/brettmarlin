/**
 * Feed parsing, tested against the shapes a Substack feed actually takes.
 *
 * The feed's structure is not a contract and could not be read from the
 * machine this was written on, so the parser tries three places for a cover
 * image and both CDATA and bare text for every field. These fix that
 * behaviour so a feed change surfaces as a failing test rather than as a
 * silently empty shelf.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagText, toPlainText, snippet, itemImage, parseFeed, emit } from './generate-substack.mjs';

const item = (inner) => `<rss><channel><item>${inner}</item></channel></rss>`;

test('CDATA and bare text both parse', () => {
  assert.equal(tagText('<title><![CDATA[Hello]]></title>', 'title'), 'Hello');
  assert.equal(tagText('<title>Hello</title>', 'title'), 'Hello');
});

test('entities are decoded before tags are stripped', () => {
  // Order matters: strip tags first and an encoded &lt;b&gt; becomes a real
  // tag on the next pass and disappears with the markup.
  assert.equal(toPlainText('<p>a &amp; b</p>'), 'a & b');
  assert.equal(toPlainText('&lt;b&gt;kept&lt;/b&gt;'), '<b>kept</b>');
});

test('script and style contents never reach the snippet', () => {
  assert.equal(toPlainText('<style>.a{}</style><p>real</p>'), 'real');
});

test('a short description is used whole', () => {
  assert.equal(snippet('<p>Short one.</p>'), 'Short one.');
});

test('a long description is cut on a word boundary and marked', () => {
  const long = `<p>${'word '.repeat(120)}</p>`;
  const out = snippet(long);
  assert.ok(out.length <= 221, 'stays within the cap');
  assert.ok(out.endsWith('…'), 'is marked as truncated');
  assert.ok(!/\bwor…$/.test(out), 'does not cut mid-word');
});

test('the cover image comes from enclosure first', () => {
  const xml = '<enclosure url="https://cdn/a.jpg" type="image/jpeg"/><description><![CDATA[<img src="https://cdn/b.jpg">]]></description>';
  assert.equal(itemImage(xml), 'https://cdn/a.jpg');
});

test('media:content is the second try', () => {
  const xml = '<media:content url="https://cdn/m.jpg"/><description><![CDATA[<img src="https://cdn/b.jpg">]]></description>';
  assert.equal(itemImage(xml), 'https://cdn/m.jpg');
});

test('the first body image is the last resort', () => {
  const xml = '<description><![CDATA[<p>x</p><img src="https://cdn/b.jpg">]]></description>';
  assert.equal(itemImage(xml), 'https://cdn/b.jpg');
});

test('a post with no image anywhere yields null, not a broken URL', () => {
  assert.equal(itemImage('<description><![CDATA[<p>no pictures</p>]]></description>'), null);
});

test('pubDate becomes a bare ISO date, so a refresh does not churn on time', () => {
  const [post] = parseFeed(item('<title>T</title><link>https://x/p/t</link><pubDate>Tue, 05 Aug 2026 09:12:44 GMT</pubDate>'));
  assert.equal(post.publishedAt, '2026-08-05');
});

test('an unparseable date is dropped rather than emitted as Invalid Date', () => {
  const [post] = parseFeed(item('<title>T</title><link>https://x/p/t</link><pubDate>whenever</pubDate>'));
  assert.equal(post.publishedAt, null);
});

test('an item with no title or no link is dropped: a card must go somewhere', () => {
  assert.equal(parseFeed(item('<title>No link</title>')).length, 0);
  assert.equal(parseFeed(item('<link>https://x/p/t</link>')).length, 0);
});

test('every item in a multi-post feed is kept, in feed order', () => {
  const xml = `<rss><channel>
    <item><title>One</title><link>https://x/1</link></item>
    <item><title>Two</title><link>https://x/2</link></item>
    <item><title>Three</title><link>https://x/3</link></item>
  </channel></rss>`;
  assert.deepEqual(parseFeed(xml).map((p) => p.title), ['One', 'Two', 'Three']);
});

test('optional fields are omitted from the emitted file, not written as undefined', () => {
  const out = emit([{ title: 'T', url: 'https://x/1', publishedAt: null, snippet: '', image: null }]);
  assert.match(out, /\{ title: "T", url: "https:\/\/x\/1" \},/);
  assert.doesNotMatch(out, /undefined|null/);
});

test('the emitted file declares the type it exports', () => {
  const out = emit([{ title: 'T', url: 'https://x/1' }]);
  assert.match(out, /export type SubstackPost = \{/);
  assert.match(out, /export const substackPosts: SubstackPost\[\]/);
});
