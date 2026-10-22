---
name: ship-beats
description: Ship edits to an existing portfolio case study, including prose-only updates and newly pasted beat images. Trigger on "ship <study>", "update the case study", "ship beats for <study>", or when Brett wants an edited vault case published to its existing public URL.
---

# Ship a case study update

Run `npm run study:ship -- --study <slug>` from `~/Dev/brettmarlin`. It accepts
either the vault filename slug or the Card/public URL slug and resolves both to
one study before writing or uploading anything.

## When to run this

Only when Brett explicitly asks to ship or update a study. Never run this
proactively: it may upload real files to production R2 and always regenerates
the site's case-study data.

## What to do

1. Resolve the requested name exactly. The command accepts both names and
   refuses ambiguous partial matches. Do not hand-translate aliases.
2. Run `npm run study:ship -- --study <resolved-name>`.
   - Pasted images are adopted, staged under the Card slug, uploaded to that R2
     prefix, and bound.
   - With no new images, upload and binding are skipped but generation still
     runs. This is the content-only update path.
   - The postflight checks only the requested generated study for stranded
     embeds, malformed beat metadata, placeholder media, and clearance hits.
3. Do not substitute `npm run verify`. It is the full-repository maintenance
   gate and can fail on unrelated studies. Run it only when Brett asks for a
   repository-wide verification or before a repository-wide release.
4. Show the full command output as it streams.
5. If any stage exits non-zero, stop there. Report which stage failed and the
   exact error text. Don't attempt to work around a failure or guess a fix —
   surface it and wait for direction.
6. After a clean run, specifically call out both `placeholder guard: ...` and
   `content guard: ...` from the output.
