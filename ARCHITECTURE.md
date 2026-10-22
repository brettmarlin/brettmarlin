# Architecture

One direction of flow, three deployables, no shared state between them
except the Worker's KV.

```
private vault (markdown)            R2 (images, private)
        |                                  |
        v                                  |
scripts/vault-reader.mjs                   |     parsing and visibility rules
        |                                  |
        v                                  v
scripts/generate-case-studies.mjs ---------+     bind media, measure, emit
        |
        v
src/data/caseStudies.ts                          generated, public only
        |
        v
src/pages + src/components                       render, decide nothing
        |
        v
dist/  (Cloudflare Pages)   <---- fetch ---->   worker/src/index.mjs (Cloudflare Worker)
                                                   |            |
                                                   KV           R2
                                        recipients, gated     image bytes
                                        extensions, events
```

## The site (`src/`)

Vite, React 18, TypeScript, Motion, React Router. Plain CSS with custom
property tokens; no utility framework. Route-level code splitting keeps the
recipient gate and the admin out of the home chunk.

- `src/lib/studies.ts` is the one selector layer over the generated data:
  order, years, tags, hero, next and previous.
- `src/lib/beatLayout.ts` decides how a beat's media lays out from its
  dimensions: a lone portrait sits beside the prose, everything else stacks
  in justified rows whose widths are proportional to the image ratios, so
  every frame in a row lands at one shared height with no measurement.
  Seven or more become a grid. The author may override with `_layout:`.
- `src/components/CaseStudyView.tsx` renders a study the same way wherever
  it came from: the bundle, a recipient payload, or a gated extension. It
  never names which take produced it.
- `src/pages/CaseStudy.tsx` asks the Worker whether a study has a gated
  extension and, with a recipient password, renders it in place.
- `src/pages/RecipientSpace.tsx` is `/for/:slug` and `/for/:slug/work/:study`.
  The password lives in `sessionStorage` for the tab and is re-sent; the
  Worker decides every time.
- `src/admin/` is the panel: token login, dashboard, recipients, editor,
  preview, access log, studies, gated extensions. It is a client of
  `/api/admin/*` and holds no rules of its own.

## The Worker (`worker/`)

`worker/src/index.mjs` is a plain module Worker so `node --test` can import
it. One KV namespace, `RECIPIENTS`, keeps the records published before the
admin existed and adds three prefixes: `gated:<publicSlug>` for a public
study's named take, `event:` for the access log (reverse timestamp keys,
180 day TTL) and `rl:` for the failed-attempt counter (60 second TTL).

Routes:

| Route | What |
|---|---|
| `GET` `POST /api/recipient/:slug` | payload, or a 401 challenge, or 410 expired, or 404 for drafts and unknowns |
| `PUT /api/recipient/:slug` | legacy publish, bearer token; `scripts/publish-recipient.sh` in the vault still works |
| `GET /api/study/:slug/gate` | `{ locked: true }` or 404, and nothing else |
| `POST /api/study/:slug/unlock` | the gated extension, for any live protected recipient whose picks include it |
| `GET /api/images/:slug`, `GET /images/:slug/:file` | R2 listing and bytes |
| `/api/admin/*` | bearer `ADMIN_TOKEN`: recipients CRUD, password rotation, status, preview, events, stats, gated entries |

Passwords are four hyphenated words, hashed with PBKDF2 on write; the
plaintext is returned once from the rotation endpoint and never stored.
Verification forgives case, spaces and punctuation. Ten failed attempts a
minute from one address earn a 429.

## Local development

`npm run dev` starts Vite and `scripts/dev-api.mjs`, a Node host for the
same Worker module with an in-memory KV persisted to `.dev/kv.json`. It
seeds two recipients (one live and protected, one draft) and the admin token
`dev-admin-token`. With `VITE_LOCAL_IMAGES=1` the Vite shim serves images
from the vault's `_attachments/` folder and dimension-true placeholders for
the rest, so every page renders offline.

## Verification

`npm run verify`: typecheck, unit tests (scripts and Worker), copy guard,
bundle guard, clearance guard, Vite build, dist guard. CI runs the same.
`npm run screenshots` captures every surface at desktop and phone widths
with the Playwright Chromium already on the machine, and `npm run axe` runs
axe-core (WCAG 2.1 AA plus best practice) against eleven rendered pages,
failing on any serious or critical violation. Both need `npm run dev` up.
