/**
 * The vault-reading layer: every function that turns the vault's markdown
 * into structured study data, and every clearance rule that gates what may
 * leave the vault. Extracted from generate-case-studies.mjs so the boundary
 * is a module boundary, not a convention.
 *
 * The clearance contract, enforced here and nowhere else:
 *   - Only a `## Take — <angle>` block whose header line declares the
 *     requested `site_visibility` is readable at all; every other take in the
 *     file is invisible to the caller (null / skipped, never partial).
 *   - `site_visibility: public-grid` REQUIRES `clearance: public`, and
 *     `site_visibility: recipient-only` REQUIRES `clearance: gated`. A take
 *     claiming a visibility without the matching clearance throws: a
 *     mislabeled take must fail the build, not leak.
 *   - Beats sections are collected only from public-grid takes
 *     (collectBeatsByTake); a Beats section in a gated take never enters the
 *     output.
 *
 * Everything in this module is a pure function over markdown text. It touches
 * no filesystem and no network, which is what makes the clearance tests in
 * vault-reader.test.mjs airtight: the whole surface is (string in, data out).
 */

// Shot statuses documented in the vault's _templates/case-study.md. The vault
// is the authority on this vocabulary: an unrecognized status warns rather than
// fails, so a typo in a note-to-self can never take the site down.
const RECOGNIZED_SHOT_STATUSES = new Set(['have', 'archived', 'find', 'need', 'staged', 'none']);

// A shot line reads `_shot: subject (status · type · frame)_`. The subject may
// itself contain commas, em dashes, and parentheticals, so split on the LAST
// parenthetical group. Bare `_shot: none_` carries no parenthetical at all.
export function parseShotLine(value) {
  const v = value.trim();
  if (v === 'none') return { subject: '', status: 'none', type: '', frame: '' };
  const m = /^([\s\S]*)\(([^()]*)\)\s*$/.exec(v);
  if (!m) return { subject: v, status: '', type: '', frame: '' };
  const parts = m[2].split('·').map((p) => p.trim());
  return { subject: m[1].trim(), status: parts[0] ?? '', type: parts[1] ?? '', frame: parts[2] ?? '' };
}

// Parses the usual YouTube URL shapes into { videoId, start }: watch?v=ID,
// youtu.be/ID, embed/ID, with t=47s, t=47, or #t=47 and other query params in
// any order. Returns null for anything unparseable; the caller fails the
// build rather than rendering a dead player.
export function parseYouTubeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  let videoId = null;
  if (host === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    else if (url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2] || null;
  }
  if (!videoId || !/^[\w-]{6,}$/.test(videoId)) return null;
  const tRaw = url.searchParams.get('t') ?? url.searchParams.get('start') ?? (url.hash.startsWith('#t=') ? url.hash.slice(3) : null);
  let start;
  if (tRaw) {
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(\d+)s?$/.exec(tRaw);
    if (!m) return null;
    start = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3]);
  }
  return { videoId, ...(start ? { start } : {}) };
}

// Parses a `### Beats` section body: one beat per `#### ` heading, each with
// prose plus optional `_media:_` / `_shot:_` / `_layout:_` / `_video:_` +
// `_poster:_` lines. Metadata
// lines are stripped from the body. Lines inside fenced code blocks are always
// body, never metadata. Returns { beats, shots, warnings }; the caller decides
// what to do with warnings, so this stays a pure function for the tests.
export function parseBeats(text, file) {
  const beats = [];
  const shots = [];
  const warnings = [];
  const errors = [];
  let current = null;
  let inFence = false;
  let pendingVideo = null;
  for (const line of text.split('\n')) {
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (current) current.bodyLines.push(line);
      continue;
    }
    if (inFence) {
      if (current) current.bodyLines.push(line);
      continue;
    }
    const heading = /^#### (.+)$/.exec(line);
    if (heading) {
      if (pendingVideo) {
        errors.push(`${file}: beat "${current.heading}" has a _video:_ line not immediately followed by a _poster:_ line`);
        pendingVideo = null;
      }
      current = { heading: heading[1].trim(), bodyLines: [], media: [], seq: [], layout: undefined, ratio: undefined };
      beats.push(current);
      continue;
    }
    if (!current) {
      if (line.trim() !== '') warnings.push(`${file}: Beats content before the first "#### " heading is ignored: "${line.trim()}"`);
      continue;
    }
    // OBSIDIAN EMBEDS ARE VAULT-ONLY, and dropped here.
    //
    // A pasted image renders in Obsidian as `![[name.png]]`, which is how Brett
    // judges a picture: at its beat, in the prose it supports. The site cannot
    // read wikilinks, so adopt-pastes used to REPLACE the embed with a `_shot:`
    // line — and the image disappeared from the note, taking with it the exact
    // thing pasting was for.
    //
    // Both now coexist: the embed stays for Obsidian, the meta line is what the
    // site reads, and this drops the embed from the body so it never renders as
    // literal `![[...]]` on the page. Wikilinks only; a normal markdown image
    // is left alone, since nothing here produces one by accident.
    if (/^!\[\[[^\]]+\]\]\s*$/.test(line.trim())) continue;

    const meta = /^_(media|shot|layout|ratio|removed|video|poster):\s*(.*)_\s*$/.exec(line);
    // A _video:_ line must be IMMEDIATELY followed by its _poster:_ line.
    // The poster value is either an R2 filename or the explicit `youtube`
    // sentinel when Brett wants YouTube's own native thumbnail.
    if (pendingVideo && (!meta || meta[1] !== 'poster')) {
      errors.push(`${file}: beat "${current.heading}" has a _video:_ line not immediately followed by a _poster:_ line`);
      pendingVideo = null;
    }
    if (!meta) {
      current.bodyLines.push(line);
      continue;
    }
    const [, key, value] = meta;
    if (key === 'video') {
      const parsed = parseYouTubeUrl(value.trim());
      if (!parsed) {
        errors.push(`${file}: beat "${current.heading}" has an unparseable video URL: "${value.trim()}"`);
      } else {
        pendingVideo = parsed;
      }
      continue;
    }
    if (key === 'poster') {
      if (!pendingVideo) {
        errors.push(`${file}: beat "${current.heading}" has a _poster:_ line with no _video:_ line directly above it`);
        continue;
      }
      current.seq.push({ kind: 'video', ...pendingVideo, posterName: value.trim() });
      pendingVideo = null;
      continue;
    }
    if (key === 'media') {
      const names = value.split(',').map((s) => s.trim()).filter(Boolean);
      current.media.push(...names);
      for (const name of names) current.seq.push({ kind: 'file', name });
    } else if (key === 'shot') {
      const shot = parseShotLine(value);
      if (!RECOGNIZED_SHOT_STATUSES.has(shot.status)) {
        warnings.push(`${file}: unrecognized shot status "${shot.status}" in beat "${current.heading}"`);
      }
      shots.push({ beat: current.heading, ...shot });
      current.seq.push({ kind: 'shot', ...shot });
    } else if (key === 'removed') {
      // Images taken off a beat but not thrown away. They stay named here so
      // the decision is reversible and the record survives — a lot of this
      // material came in from an archive, where the copy is worth keeping and
      // the picture is not. The parser ignores them; they must be RECOGNISED
      // rather than unmatched, or the line falls through and renders as prose.
      current.removed = (current.removed ?? []).concat(
        value.split(',').map((v) => v.trim()).filter(Boolean)
      );
    } else if (key === 'ratio') {
      // The shape of THIS beat's image box, overriding the study's. A phone
      // screenshot and a cropped spreadsheet want different boxes and sit in
      // the same study, so the shape cannot only be a study-wide setting.
      // Accepts a number (1.5) or a named ratio (3:2): a designer thinks in
      // the second, the arithmetic needs the first.
      const raw = value.trim();
      const named = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(raw);
      const n = named ? Number(named[1]) / Number(named[2]) : Number(raw);
      if (Number.isFinite(n) && n > 0) {
        current.ratio = n;
      } else {
        warnings.push(`${file}: unreadable ratio "${raw}" in beat "${current.heading}" (use 1.5 or 3:2); ignored`);
      }
    } else {
      // Vocabulary lives in src/lib/beatLayout.mjs (BEAT_LAYOUTS) and is
      // duplicated here as a literal on purpose: vault-reader is the vault's
      // parser and must not import the site's rendering code, or the vault
      // stops being readable without the site.
      const LAYOUTS = ['image-below', 'image-top', 'image-left', 'image-right', 'side', 'full-bleed'];
      if (LAYOUTS.includes(value.trim())) {
        current.layout = value.trim();
      } else {
        warnings.push(`${file}: unrecognized layout "${value.trim()}" in beat "${current.heading}" (one of: ${LAYOUTS.join(', ')}); ignored`);
      }
    }
  }
  if (pendingVideo && current) {
    errors.push(`${file}: beat "${current.heading}" has a _video:_ line not immediately followed by a _poster:_ line`);
  }
  return {
    beats: beats.map((b) => {
      const beat = { heading: b.heading, body: b.bodyLines.join('\n').trim(), seq: b.seq };
      if (b.media.length > 0) beat.media = b.media;
      if (b.layout) beat.layout = b.layout;
      if (b.ratio) beat.ratio = b.ratio;
      if (b.removed?.length) beat.removed = b.removed;
      return beat;
    }),
    shots,
    warnings,
    errors,
  };
}

// Placeholder label: the shot subject with the internal workflow text stripped.
// The page should read "this slot wants the Kano-scored concept board", not
// carry archive bookkeeping. When a shot names legacy filenames rather than a
// subject, the filenames ARE the label; still the most useful thing to see.
export function placeholderLabel(subject) {
  let label = subject
    .replace(/\s*—\s*in the legacy archive.*$/i, '')
    .replace(/\s*—\s*confirm against image-mapping-worksheet\.md.*$/i, '')
    .replace(/^⚠\s*confirm\s*—\s*/i, '')
    .trim();
  if (!label) label = subject.trim();
  return label;
}

// Aspect ratios by media count in the beat, from the gallery research's
// measured values: singles 1.78, landscape pairs 1.62, triptych members 1.5,
// four-plus lays out as successive pairs so it uses the pair ratio.
export function ratioForCount(count) {
  if (count <= 1) return 1.78;
  if (count === 2) return 1.62;
  if (count === 3) return 1.5;
  return 1.62;
}

// Expands a beat's source-ordered media/shot sequence into draft media
// entries: each `_media:_` filename stays a file draft for the resolver; each
// `_shot:_` line becomes one placeholder per named file (a line naming a pair
// is a pair on the page) or a single placeholder when it names none. A bare
// `_shot: none_` is a deliberate no-image and adds nothing.
const SHOT_FILE_RE = /[0-9A-Za-z][\w.-]*\.(?:jpg|jpeg|png|gif|webp)/g;
export function draftMediaForBeat(seq) {
  const drafts = [];
  for (const item of seq) {
    if (item.kind === 'file') {
      drafts.push({ kind: 'file', name: item.name });
    } else if (item.kind === 'video') {
      drafts.push({ kind: 'video', videoId: item.videoId, ...(item.start ? { start: item.start } : {}), posterName: item.posterName });
    } else if (item.status !== 'none') {
      const named = (item.subject.match(SHOT_FILE_RE) ?? []).filter((f) => !f.endsWith('.md'));
      // A line that mixes a worksheet-row reference with a filename references
      // more than the filename; keep one placeholder carrying the whole
      // subject rather than silently dropping the row reference.
      if (named.length > 0 && !/worksheet row/i.test(item.subject)) {
        for (const f of named) drafts.push({ kind: 'placeholder', label: f });
      } else {
        drafts.push({ kind: 'placeholder', label: placeholderLabel(item.subject) });
      }
    }
  }
  const ratio = ratioForCount(drafts.length);
  for (const d of drafts) if (d.kind === 'placeholder') d.ratio = ratio;
  return drafts;
}

// Stable beat id, derived from the heading. Phase 1 uses it as the scroll-spy
// anchor target, so it must be deterministic across runs.
export function slugifyBeatId(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Collects every `### Beats` section in the file, keyed by the angle of the
// `## Take — <angle>` block it sits inside. Only takes declaring
// `site_visibility: public-grid` feed the public bundle; a Beats section in a
// gated take never enters the output. Ids are unique within a take, not
// globally — two takes may both carry "the-problem". A collision inside one
// take means two beats share a heading, which is a content smell worth
// surfacing, so it warns and suffixes rather than silently merging.
export function collectBeatsByTake(md, file) {
  const beatsByTake = {};
  const shots = [];
  const warnings = [];
  for (const tm of md.matchAll(/^## Take — (.+)\n(_[^\n]*_)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
    const angle = tm[1].trim();
    const header = tm[2];
    // Phase 2: grid-eligible because the STUDY is public, not because the
    // header repeats it. A recipient take is refused here explicitly rather
    // than by the absence of a marker, which is what used to do it.
    if (header.includes('site_visibility: recipient-only')) continue;
    if (!isPublicStudy(md)) continue;
    // NOT PUBLISHED, not an error. Before phase 2 a take had to CLAIM
    // public-grid, and claiming it without clearance was a contradiction worth
    // throwing over. With the claim gone there is nothing to contradict: a take
    // with no clearance line is simply one nobody has cleared, and refusing to
    // build the whole site over it punishes 21 finished studies for one
    // unfinished take.
    if (!header.includes('clearance: public')) {
      warnings.push(`${file}: take "${angle}" has no clearance line; not published`);
      continue;
    }
    const bm = /^### Beats\n([\s\S]*?)(?=^### |(?![\s\S]))/m.exec(tm[3]);
    if (!bm) continue;
    const parsed = parseBeats(bm[1], file);
    if (parsed.errors.length > 0) throw new Error(parsed.errors.join('\n'));
    warnings.push(...parsed.warnings);
    shots.push(...parsed.shots);
    const seenIds = new Map();
    beatsByTake[angle] = parsed.beats.map((b) => {
      let id = slugifyBeatId(b.heading);
      if (!id) {
        id = 'beat';
        warnings.push(`${file}: take "${angle}" beat "${b.heading}" slugifies to an empty id; using "beat"`);
      }
      const n = (seenIds.get(id) ?? 0) + 1;
      seenIds.set(id, n);
      if (n > 1) {
        warnings.push(`${file}: take "${angle}" has two beats with the same heading "${b.heading}"; id suffixed "${id}-${n}"`);
        id = `${id}-${n}`;
      }
      return { id, heading: b.heading, body: b.body, media: draftMediaForBeat(b.seq), ...(b.layout ? { layout: b.layout } : {}), ...(b.ratio ? { ratio: b.ratio } : {}), ...(b.removed?.length ? { removed: b.removed } : {}) };
    });
  }
  return { beatsByTake, shots, warnings };
}

// Which take the detail page renders. Set from the vault, never guessed: the
// sole take carrying beats is primary; more than one is an error asking for an
// explicit marker, not a coin flip.
export function pickPrimaryTake(beatsByTake, file, marked = []) {
  const keys = Object.keys(beatsByTake);
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  // More than one take carries Beats. Until 2026-08-07 this threw outright,
  // with the instruction to mark the primary in the vault. That marker now
  // exists, so honour it — but still refuse to guess, because which frame a
  // reader lands on is a content decision and a silent default would make it
  // invisibly and consistently wrong.
  const valid = marked.filter((a) => keys.includes(a));
  if (valid.length === 1) return valid[0];
  if (valid.length > 1) {
    throw new Error(`${file}: ${valid.length} takes are marked primary (${valid.join(', ')}); exactly one may be`);
  }
  throw new Error(
    `${file}: ${keys.length} takes carry Beats (${keys.join(', ')}) and none is marked primary. ` +
      'Add ` · primary` to the chosen take\'s header line, e.g. ' +
      '`_clearance: public · site_visibility: public-grid · primary_`'
  );
}

// Every angle in the file whose take declares `site_visibility: public-grid`,
// whatever that angle is called. This exists so a caller can tell "this file
// offers nothing to the public grid" (ordinary: gated work, drafts, files whose
// take header predates the site_visibility contract) apart from "this file
// offers a public take under an angle the caller does not ask for" (a content
// change that must be loud, because parseTake returns null for it and the study
// leaves the bundle in silence). Deliberately does not throw on a missing
// clearance: this is a diagnostic, and collectBeatsByTake is where a mislabeled
// take fails the build.
/** Frontmatter visibility, read permissively — for the paths that FILTER
 *  rather than the ones that must fail loudly. visibilityOf is still the strict
 *  reader and still throws on a missing field where it matters. */
function isPublicStudy(md) {
  const fm = md.startsWith('---') ? md.slice(4, md.indexOf('\n---', 3)) : '';
  return /^visibility:\s*(.+)$/m.exec(fm)?.[1].trim() === 'public';
}

export function publicGridTakeAngles(md) {
  // Phase 2: a take is grid-eligible because its STUDY is public, not because
  // its header says so. The header said so too until 2026-08-14, in a second
  // vocabulary that tools disagreed about.
  //
  // Read visibility permissively here — this feeds a WARNING about takes the
  // site cannot read, and a study with no visibility at all has a louder
  // problem that visibilityOf will raise on the path that matters.
  if (!isPublicStudy(md)) return [];
  const angles = [];
  for (const tm of md.matchAll(/^## Take — (.+)\n(_[^\n]*_)$/gm)) {
    if (!tm[2].includes('site_visibility: recipient-only')) angles.push(tm[1].trim());
  }
  return angles;
}

/**
 * The take a study opens on when it carries more than one.
 *
 * Marked in the vault with a third segment on the take header line:
 *   _clearance: public · site_visibility: public-grid · primary_
 *
 * Optional while a study has a single public-grid take, which is every study
 * today. Required the moment a second is authored: guessing which frame a
 * reader lands on is a content decision, and the generator must not make it.
 */
export function primaryTakeMarker(md) {
  const marked = [];
  for (const tm of md.matchAll(/^## Take — (.+)\n(_[^\n]*_)$/gm)) {
    const header = tm[2];
    // Phase 2: eligible because the study is public. A recipient take may not
    // claim the public primary, which is the one thing the old marker check
    // was really enforcing.
    if (header.includes('site_visibility: recipient-only')) continue;
    if (!isPublicStudy(md)) continue;
    if (/(^|·|\s)\s*primary\s*(·|_|$)/.test(header)) marked.push(tm[1].trim());
  }
  return marked;
}

// Every `## Take —` block in a file, parsed structurally, with NO clearance or
// visibility filtering. `parseTake` is the site's reader and is deliberately
// narrow — it returns nothing for a take that is not cleared for the surface it
// was asked about. This is the AUTHOR's reader: it answers "what framings does
// this file carry", which is a different question, and its output must never be
// handed to a public surface. The only consumer is publish-takes.mjs, whose
// payload lives behind the Worker's admin gate.
// The frontmatter block, as raw text. Not a YAML parser: the vault's
// frontmatter is hand-written and Obsidian-managed, and a real parser would
// start having opinions about types the standard already fixes (dates
// unquoted, slugs bare). Callers pull the one field they need.
export function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}

// A single scalar frontmatter field. Returns null when absent, which callers
// must treat as a decision not yet made rather than a default to fill in.
/**
 * VISIBILITY: the one field that decides who may see a case study.
 *
 * A ladder of increasing exposure. Each value can do everything the value below
 * it can:
 *
 *   draft   not on the grid, not in a recipient portfolio. Unfinished or shelved.
 *   gated   not on the grid; may be embedded in a password-protected recipient
 *           portfolio. Finished work that is not for the open web.
 *   public  on the grid, and may also be embedded for a recipient.
 *
 * Nothing else decides this. Not the take header, not `status:`, not
 * `clearance:`. Before 2026-08-12 it took four edits across three files to hide
 * a study, one of which failed silently, and the field literally named
 * `clearance` was read by no code at all.
 *
 * ABSENT IS AN ERROR, never a default. Defaulting to `public` would publish
 * something because a field was forgotten; defaulting to `draft` would silently
 * unpublish the grid. The same reasoning as `published_take`.
 *
 * `consent/clearances.md` is a SEPARATE axis and is untouched by this: it
 * governs which company names may be printed, not whether a study is visible.
 */
export const VISIBILITY = ['draft', 'gated', 'public'];

/** Whether a study at this visibility may reach the PUBLIC bundle. */
export function isPublic(visibility) {
  return visibility === 'public';
}

/** Whether a study at this visibility may be embedded in a recipient payload. */
export function isRecipientEligible(visibility) {
  return visibility === 'public' || visibility === 'gated';
}

export function visibilityOf(md, file = 'case study') {
  const value = scalarField(frontmatter(md), 'visibility');
  if (!value) {
    throw new Error(
      `${file}: frontmatter is missing "visibility". ` +
      `It is the only field that decides who may see this study, and there is no ` +
      `safe default: one guess publishes private work, the other empties the grid. ` +
      `Set one of: ${VISIBILITY.join(', ')}.`
    );
  }
  if (!VISIBILITY.includes(value)) {
    throw new Error(`${file}: visibility is "${value}"; it must be one of ${VISIBILITY.join(', ')}.`);
  }
  return value;
}

export function scalarField(fm, key) {
  if (!fm) return null;
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!m) return null;
  const raw = m[1].trim().replace(/^["']|["']$/g, '');
  return raw === '' ? null : raw;
}

export function collectAllTakes(md) {
  const takes = {};
  const re = /^## Take — (.+?)\n(_[^\n]*_)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm;
  for (const m of md.matchAll(re)) {
    const angle = m[1].trim();
    const header = m[2];
    const body = m[3];
    const preamble = body.split(/^### /m)[0];
    const heroMatch = /^_hero:\s*(.+?)_\s*$/m.exec(preamble);
    const sections = {};
    for (const sm of body.matchAll(/^### (.+?)\n([\s\S]*?)(?=^### |(?![\s\S]))/gm)) {
      sections[sm[1].trim().split(' (')[0]] = sm[2].trim();
    }
    takes[angle] = { header, sections, hero: heroMatch ? heroMatch[1].trim() : null };
  }
  return takes;
}

export function parseTake(md, takeName, visibility) {
  const takeRe = new RegExp(`^## Take — ${takeName}\\n(_[^\\n]*_)\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
  const m = takeRe.exec(md);
  if (!m) return null;
  const header = m[1];

  // WHERE VISIBILITY COMES FROM, and why the two cases differ.
  //
  // `public-grid` is a question about the STUDY: is this thing on the site.
  // That is `visibility:` in frontmatter as of the 2026-08-12 migration, and
  // the take header's `site_visibility: public-grid` was the old spelling of
  // the same fact. Both were live at once for two days — frontmatter in all 25
  // studies, the header line in 24 — and each tool picked one. bind-images
  // picked the old one and could not see MAF Machine at all.
  //
  // `recipient-only` is a question about the TAKE, and is NOT redundant with
  // it: convoy-defense-agentic-governance is `visibility: public` and carries a
  // recipient-only take beside its public one. Reading that from the study
  // would publish a gated take. So this one stays in the header, where it is
  // the only thing site_visibility still means.
  if (visibility === 'recipient-only') {
    if (!header.includes('site_visibility: recipient-only')) return null;
    if (!header.includes('clearance: gated')) {
      throw new Error(`take "${takeName}" declares site_visibility: recipient-only without clearance: gated`);
    }
  } else {
    if (visibilityOf(md, takeName) !== 'public') return null;
    // A recipient take must never answer a public-grid request, whatever the
    // study's own visibility says.
    if (header.includes('site_visibility: recipient-only')) return null;
    // Uncleared is unpublished, not fatal. See collectBeatsByTake.
    if (!header.includes('clearance: public')) return null;
  }
  const body = m[2];
  // Optional `_hero: filename.jpg_` line in the take preamble — directly under
  // the header line, alongside clearance and site_visibility, before the first
  // `### ` section. Names the page hero explicitly; the caller resolves it
  // against R2 and fails the build on a miss. Absent means the caller may fall
  // back to lifting a full-bleed first beat's lead image.
  const preamble = body.split(/^### /m)[0];
  const heroMatch = /^_hero:\s*(.+?)_\s*$/m.exec(preamble);
  const sections = {};
  for (const sm of body.matchAll(/^### (.+?)\n([\s\S]*?)(?=^### |(?![\s\S]))/gm)) {
    sections[sm[1].trim().split(' (')[0]] = sm[2].trim();
  }
  return { sections, hero: heroMatch ? heroMatch[1].trim() : null };
}

function parseCard(cardText, file) {
  const card = {};
  for (const line of cardText.split('\n')) {
    const lm = /^- ([a-z-]+): (.*)$/.exec(line.trim());
    if (lm) card[lm[1]] = lm[2].trim();
  }
  for (const key of ['slug', 'title', 'outcome', 'tags']) {
    if (!card[key]) throw new Error(`${file}: Card is missing "${key}"`);
  }
  return card;
}

function bullets(text) {
  return text.split('\n').filter((l) => l.trim().startsWith('- ')).map((l) => l.trim().slice(2).trim());
}

export function buildStudy(sections, file) {
  const card = parseCard(sections['Card'] ?? '', file);
  for (const req of ['Problem', 'Decisions', 'Outcome']) {
    if (!sections[req]) throw new Error(`${file}: take is missing "### ${req}"`);
  }
  const study = {
    slug: card.slug,
    title: card.title,
    outcome: card.outcome,
    images: [],
    tags: card.tags.split(',').map((t) => t.trim()).filter(Boolean),
    context: sections['Context'] ?? '',
    problem: sections['Problem'],
    role: sections['Role'] ?? '',
    built: bullets(sections['Decisions']),
    result: sections['Outcome'],
  };
  if (card['under-nda'] === 'true') study.underNda = true;
  if (sections['Through-line']) study.storyThroughLine = sections['Through-line'];
  return { study, order: card.order !== undefined ? Number(card.order) : null };
}
