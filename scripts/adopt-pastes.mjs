#!/usr/bin/env node
/**
 * npm run adopt-pastes -- --study maf-machine-ai-endurance-coach [--apply]
 * optional: --key maf   --out /some/dir
 *
 * Turns images pasted into Obsidian into things the pipeline understands.
 *
 * THE GAP THIS CLOSES. Pasting into a note is the only way to judge an image
 * in context — you see it at the beat it belongs to, in the prose it supports,
 * and you can tell immediately whether it is the right crop. But a paste
 * produces `![[Pasted image 20260814095352.png]]`, and nothing downstream reads
 * Obsidian embeds. The site reads `_media:` lines, resolves each filename
 * against R2, and bakes an absolute URL at generate time. So a pasted image
 * looks perfect in Obsidian and does not exist as far as the site is concerned.
 *
 * Three things have to become true, and a paste gives none of them: the file
 * needs the study's name, it has to reach R2 under that name, and the beat has
 * to record it. This does the first and the third, and names the second.
 *
 * IT WRITES `_shot:`, NOT `_media:`, and that is the point. `_media:` asserts
 * the file is in R2; writing it before the upload would make the vault claim
 * something untrue, and `generate:check` would fail on a study that looks
 * finished. A `_shot:` line naming the exact target filename is what the
 * existing contract already expects: upload under that name, run
 * `npm run bind-images -- --apply`, and it flips to `_media:` on its own. This
 * adds a step to a pipeline rather than a second pipeline.
 *
 * NO CONVERSION. The file keeps its bytes and its extension. prepare-images
 * converts archive material to JPEG because that material is photographic and
 * enormous; a pasted screenshot is neither, and PNG screenshots re-encoded as
 * JPEG was a real regression here once already. Renaming and moving is the
 * whole job.
 *
 * Dry-run by default. `--apply` moves files and rewrites the note.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VAULT_DIR } from './vault-present.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', '_to_delete', '.obsidian', '.trash']);

/** `![[name.png]]`, `![[name.png|alt]]`, and `![alt](name.png)`. */
const EMBED_RE = /!\[\[([^\]|]+?\.(?:png|jpe?g|gif|webp))(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+?\.(?:png|jpe?g|gif|webp))\)/i;

/** Words that carry no meaning in a filename. */
// `before` and `after` are deliberately NOT here: "before and after" is what a
// comparison screenshot IS, and dropping it would name two different images
// the same thing.
const STOP = new Set(['a', 'an', 'the', 'that', 'this', 'is', 'was', 'of', 'to', 'as', 'at', 'in', 'on', 'and', 'or', 'for', 'with', 'by', 'not']);

/** Six words, not five. Five truncated "before and after" to "...-before",
 *  which is worse than dropping the phrase: a name that stops mid-thought
 *  reads like a bug. The number prefix is the identifier anyway; this is the
 *  hint that tells you which image it is. */
export function slugifyDescription(text, maxWords = 6) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((w) => !STOP.has(w));
  return (words.length ? words : ['image']).slice(0, maxWords).join('-');
}

/** The highest NN already used by this study, so numbering continues rather
 *  than colliding. A guessed number binds an image to the wrong beat — see the
 *  same warning in prepare-images. */
export function highestNumber(md) {
  let highest = 0;
  for (const line of md.split('\n')) {
    if (!/^_(?:media|shot):/.test(line.trim())) continue;
    // Only a real FILENAME counts. The first version matched `NN-` followed by
    // any word character, and MAF's shot lines say "in the 2026-02-20 Notion
    // build log" — so a date was read as an image number and the first pasted
    // image came out 03. Numbering has to be anchored to something that is
    // unambiguously a file, which is the extension.
    // The closing boundary is `(?![a-z0-9])`, not `\b`: a _media: line ends
    // with an underscore, and `_` is a word character, so `\b` never matched
    // after `01-maf-a.jpg_` and the highest number came back as zero.
    for (const match of line.matchAll(/\b(\d{2})-[\w.-]*\.(?:jpe?g|png|gif|webp)(?![a-z0-9])/gi)) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return highest;
}

/** The filenames a `_shot:`/`_media:` line names, in the order it names them. */
export function filesIn(line) {
  return [...line.matchAll(/\b\d{2}-[\w.-]*\.(?:jpe?g|png|gif|webp)(?![a-z0-9])/gi)].map((m) => m[0]);
}

/** A filename this tool has already written: `NN-` then the rest. */
export const ADOPTED_RE = /^\d{2}-/;

/** The study's short key, as its existing filenames already spell it. */
export function keyFrom(md, slug) {
  // THE LONGEST PREFIX EVERY EXISTING FILENAME SHARES, after its number.
  //
  // This used to read "one or two words after NN-", which is a guess about how
  // many words a key has. On MAF Machine, whose files are `01-maf-method-...`,
  // it guessed `maf-method` — so the next run wrote `08-maf-method-method-...`
  // and the key drifted a word further from itself every time it ran. A rule
  // that re-derives its own input has to be a fixed point, and this one is:
  // the common prefix of `maf-*` files is `maf`, forever.
  const stems = [];
  for (const line of md.split('\n')) {
    if (!/^_(?:media|shot):/.test(line.trim())) continue;
    for (const match of line.matchAll(/\b\d{2}-([\w.-]*?)\.(?:jpe?g|png|gif|webp)(?![a-z0-9])/gi)) {
      stems.push(match[1]);
    }
  }
  if (stems.length) {
    const words = stems.map((s) => s.split('-'));
    const shared = [];
    for (let i = 0; i < words[0].length; i += 1) {
      if (words.every((w) => w[i] === words[0][i])) shared.push(words[0][i]);
      else break;
    }
    // A single file shares all of itself with itself, which is not a key.
    if (shared.length && shared.length < words[0].length) return shared.join('-');
  }
  return slug.split('-')[0];
}

/** The subject of a `_shot:` line — everything before its trailing metadata. */
export function shotSubject(line) {
  const inner = /^_shot:\s*([\s\S]*?)_?$/.exec(line.trim())?.[1] ?? '';
  return inner.replace(/\s*\([^()]*\)\s*_?$/, '').replace(/_$/, '').trim();
}

/**
 * Rewrite one study's markdown. Pure: returns the new text and what it did,
 * and touches nothing on disk.
 */
export function adoptMarkdown(md, { key, startNumber = 1 }) {
  const lines = md.split('\n');
  const beatsAt = lines.findIndex((l) => /^#{2,4}\s+Beats\s*$/.test(l.trim()));
  if (beatsAt === -1) {
    return { text: md, adoptions: [], error: 'no "Beats" heading in this study' };
  }
  const beatLevel = (/^(#+)/.exec(lines[beatsAt])?.[1].length ?? 3) + 1;
  const beatRe = new RegExp(`^#{${beatLevel}}\\s+(.+)$`);

  // Group the lines after the Beats heading into beats.
  const beats = [];
  for (let i = beatsAt + 1; i < lines.length; i += 1) {
    const heading = beatRe.exec(lines[i]);
    if (heading) beats.push({ heading: heading[1].trim(), start: i, lines: [] });
    else if (beats.length) beats[beats.length - 1].lines.push(i);
  }

  let next = startNumber;
  const adoptions = [];
  const out = [...lines];
  const drop = new Set();

  for (const beat of beats) {
    // EVERY embed in the beat, not the first. Brett's first real test pasted
    // three images into one beat — the exact triptych case the whole layout
    // change is for — and `.find()` adopted one and left two behind as dead
    // Obsidian links. A rule about multiples that cannot read multiples.
    const embedIndexes = beat.lines.filter((i) => EMBED_RE.test(lines[i]));
    if (embedIndexes.length === 0) continue;

    // A BEAT WITH NOTHING NEW IN IT IS NOT TOUCHED.
    //
    // Adoption deliberately leaves embeds in place forever so the images stay
    // visible in Obsidian. That means a beat that was bound months ago still
    // looks, to the loop below, exactly like a beat full of pictures needing a
    // record — and the loop wrote it one, next to the `_media:` line it
    // already had. bind-images would then flip that second record into a
    // second `_media:` line and the beat would render every image twice.
    //
    // The only guard was an early return when the STUDY had no new pastes at
    // all, so the damage needed one paste anywhere to fire across every bound
    // beat at once. MAF Machine has nine bound beats and was one paste away.
    //
    // Found by the pipeline audit (working/AUDIT-2026-08-pipeline-architecture.md,
    // successor to failure 8) and confirmed by running this function.
    const hasNewPaste = embedIndexes.some((i) => {
      const match = EMBED_RE.exec(lines[i]);
      return !ADOPTED_RE.test(decodeURIComponent(match[1] ?? match[2]).trim());
    });
    if (!hasNewPaste) continue;

    // A shot line in the same beat is the work order these images fulfil, so
    // its wording is better than anything derivable from the heading — and it
    // must not survive alongside the thing it asked for.
    // Only a shot line that is still a WORK ORDER may be consumed. One that
    // already reads `(staged · ...)` is a RECORD of files that exist, and
    // eating it deletes the only reference to them — which is exactly what
    // happened on the second run over MAF Machine: seven files stayed in R2
    // and on disk with nothing in the vault pointing at them.
    const shotIndexes = beat.lines.filter((i) => /^_shot:/.test(lines[i].trim()));
    const orderIndex = shotIndexes.find((i) => !/staged ·/.test(lines[i]));
    const recordIndex = shotIndexes.find((i) => /staged ·/.test(lines[i]));

    // Wording comes from the work order if there is one, and otherwise from the
    // record this tool wrote last time — NOT from the heading. Falling back to
    // the heading here made a second run rewrite `the V1 dashboard screenshot
    // with the too-much-data margin note` as `V1 was a wall of charts`.
    const wordingIndex = orderIndex ?? recordIndex;
    const subject = wordingIndex === undefined ? beat.heading : shotSubject(lines[wordingIndex]);
    const described = slugifyDescription(subject);

    // AN EMBED THAT IS ALREADY ADOPTED IS LEFT ALONE.
    //
    // Adoption used to renumber and rename every embed it found, including the
    // ones it had itself named on the previous run. So the second pass over MAF
    // Machine renamed `01-maf-...` to `08-maf-method-...`: a new number, a
    // drifted key, and a file on disk moved out from under a URL that a
    // previous generate may already have shipped. Running the tool twice has to
    // be the same as running it once.
    //
    // `NN-` is the signature of a name this tool wrote. An Obsidian paste is
    // `Pasted image 20260814....png`, which never starts with two digits and a
    // hyphen, so the test separates the two cleanly.
    const filenames = [];
    for (const index of embedIndexes) {
      const match = EMBED_RE.exec(lines[index]);
      const source = decodeURIComponent(match[1] ?? match[2]).trim();
      if (ADOPTED_RE.test(source)) {
        filenames.push(source);
        continue;
      }
      const number = String(next).padStart(2, '0');
      next += 1;
      const filename = `${number}-${key}-${described}${extname(source).toLowerCase()}`;
      filenames.push(filename);
      adoptions.push({ beat: beat.heading, source, filename, subject });
    }

    // THE EMBEDS SURVIVE, renamed to point at the file's new name.
    //
    // The first version replaced them with the shot line, and the images
    // vanished from Obsidian — which removed the only reason to paste them
    // there. Brett judges an image at its beat, in the prose it supports, and a
    // tool that takes that away to satisfy the site has the priority backwards.
    //
    // The generator drops `![[...]]` lines from beat bodies (see parseBeats),
    // so the note keeps its pictures and the page never sees a wikilink.
    embedIndexes.forEach((index, i) => {
      out[index] = `![[${filenames[i]}]]`;
    });

    // One line naming all of them, comma-separated — the same shape a
    // `_media:` line takes, because bind-images turns one into the other and a
    // beat's media is one list. It goes after the last embed, so the note reads
    // prose, pictures, then the machine-facing line.
    // A RECORDED FILENAME IS NEVER DROPPED.
    //
    // The record can name files that are not embedded — because an earlier
    // version of this tool stripped the embeds, or because a link got lost in
    // Obsidian. Rebuilding from the embeds alone would orphan those files
    // silently, which is the failure this whole area keeps repeating. So the
    // recorded names come first, in the order they were recorded, and the
    // embeds contribute only what is new. Removing an image is then an explicit
    // edit of this line rather than a side effect of a broken link.
    // A FILE THE BEAT HAS ALREADY BOUND IS NOT RE-STAGED.
    //
    // `_media:` means "this is in R2". Naming it again in a `_shot: (staged)`
    // record claims it is merely on disk, and bind-images would flip that
    // claim into a SECOND `_media:` line naming the same file — the double
    // render, arriving by a different route than the one the guard above
    // closes. Pasting a new image into an already-bound beat is the case that
    // gets here.
    const bound = beat.lines
      .filter((i) => /^_media:/.test(lines[i].trim()))
      .flatMap((i) => filesIn(lines[i]));

    const recorded = recordIndex === undefined ? [] : filesIn(lines[recordIndex]);
    const merged = [...recorded, ...filenames.filter((f) => !recorded.includes(f))]
      .filter((f) => !bound.includes(f));

    // Everything this beat holds is already bound: nothing to record.
    if (merged.length === 0) continue;

    const last = embedIndexes[embedIndexes.length - 1];
    out[last] = `${out[last]}\n_shot: ${subject} (staged · ${merged.join(', ')})_`;

    // EVERY shot line in the beat goes, work order and record alike, because
    // the one just written replaces both. Leaving the record behind stacked a
    // second identical line on every run, so the note grew a shot line per pass
    // and the tool was not idempotent even once it stopped renaming files.
    // The embeds are the truth about what the beat holds; the record restates
    // them, so it is rebuilt rather than merged.
    for (const i of shotIndexes) if (!embedIndexes.includes(i)) drop.add(i);
  }

  return { text: out.filter((_, i) => !drop.has(i)).join('\n'), adoptions };
}

// --- disk ---------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Obsidian resolves an embed by basename anywhere in the vault, so this does
 *  too — and refuses when two files share the name rather than picking one. */
export function locate(files, basename) {
  const hits = files.filter((p) => p.endsWith('/' + basename));
  if (hits.length === 0) return { error: `not found in the vault: ${basename}` };
  if (hits.length > 1) return { error: `${hits.length} files named ${basename}; rename one` };
  return { path: hits[0] };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  const slug = flag('study');
  const apply = args.includes('--apply');
  if (!slug) {
    console.error('usage: npm run adopt-pastes -- --study maf-machine-ai-endurance-coach [--apply]');
    process.exit(2);
  }

  const notePath = join(VAULT_DIR, 'case-studies', `${slug}.md`);
  const md = readFileSync(notePath, 'utf8');
  const key = flag('key') ?? keyFrom(md, slug);
  const outDir = flag('out') ?? join(VAULT_DIR, '_attachments', slug);

  const { text, adoptions, error } = adoptMarkdown(md, { key, startNumber: highestNumber(md) + 1 });
  if (error) {
    console.error(`adopt-pastes: ${error}`);
    process.exit(1);
  }
  if (adoptions.length === 0) {
    console.log(`adopt-pastes: no pasted images in ${slug}`);
    return;
  }

  const files = walk(VAULT_DIR);
  const resolved = adoptions.map((a) => ({ ...a, ...locate(files, a.source) }));
  const missing = resolved.filter((a) => a.error);

  console.log(`adopt-pastes: ${slug}  (key "${key}")\n`);
  for (const a of resolved) {
    console.log(`  ${a.beat}`);
    console.log(`    ${a.source}`);
    console.log(`    -> ${a.filename}${a.error ? `   [${a.error}]` : ''}`);
  }
  console.log(`\n  staging dir: ${outDir}`);
  console.log(`  upload to:   ${slug}/  in R2 — no images/ prefix, that is a worker route`);
  console.log(`  then:        npm run bind-images -- --apply   (flips _shot: to _media:)`);

  if (missing.length) {
    console.error(`\nadopt-pastes: ${missing.length} embed(s) could not be resolved; nothing written.`);
    process.exit(1);
  }
  if (!apply) {
    console.log('\n  dry run. Re-run with --apply to move the files and rewrite the note.');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const a of resolved) {
    renameSync(a.path, join(outDir, a.filename));
    console.log(`  moved ${relative(VAULT_DIR, a.path)} -> ${relative(VAULT_DIR, join(outDir, a.filename))}`);
  }
  writeFileSync(notePath, text);
  console.log(`\nadopt-pastes: ${adoptions.length} adopted, note rewritten.`);
}

// argv[1] is undefined under `node -e`, which is how these modules get
// poked at from a one-liner; guard rather than throw.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
