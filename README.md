# brettmarlin.xyz

The source of [brettmarlin.xyz](https://www.brettmarlin.xyz): a Swiss-grid portfolio generated from a private vault of case studies, with password-protected recipient views and an admin panel on a Cloudflare Worker.

```
npm install
npm run dev          # site on :5173, local Worker on :8787 (admin token: dev-admin-token)
npm run verify       # typecheck, tests, guards, build
npm run screenshots  # every surface, desktop and phone, into screenshots/
npm run axe          # axe-core against every rendered surface (needs npm run dev)
```

`VITE_LOCAL_IMAGES=1 npm run dev` renders images from the vault's `_attachments/` folder and placeholders for the rest, so the whole site works offline.

### Rules that are invisible in the code

**Gated content never ships in the public bundle.** Work cleared only for a named recipient is served by the Worker behind a password and is absent from `dist/`. `scripts/check-dist.mjs` greps every emitted chunk for the markers a leak would carry and prints the byte count, so a clean result is visibly a result.

**Generated files are never hand-edited.** `src/data/caseStudies.ts` comes from the vault through `npm run generate` (needs the vault and R2; `npm run generate:offline` proves a generator change is additive from the committed bundle). `src/data/taxonomy.ts` comes from the vault's `taxonomy.json` through `npm run taxonomy`. `src/data/substack.ts` comes from the feed through `npm run substack`.

**Clearance is a build gate.** `npm run build` fails if the public bundle names an entity the vault's `consent/clearances.md` does not mark public. The guard reads the vault; without it, the build announces a skip.

**Recipient and admin routes stay out of search.** `/for/*` and `/admin` carry `noindex` at the edge (`public/_headers`), in the page, and in `robots.txt`. Never link a recipient slug from public navigation.

**This repo never mutates the Worker's data from CI.** Publishing a recipient is a deliberate act in the admin, or `scripts/publish-recipient.sh` from the vault. Deploying the Worker is `npm run worker:deploy` from a logged-in machine.

### Deploying

- **Site:** Cloudflare Pages, build command `npm run build`, output `dist`. Set `VITE_API_BASE` to the Worker URL unless the Worker is routed on the site's own domain under `/api/*` and `/images/*`.
- **Worker:** `npm run worker:deploy` (reads `worker/wrangler.toml`). Secrets: `ADMIN_TOKEN` (required), `POSTHOG_API_KEY` (optional). The KV namespace and R2 bucket are the ones the previous site used, so existing recipient links keep working.

Fuller tour: `ARCHITECTURE.md`. Agent routing: `CLAUDE.md`.

### The vault image pipeline, unchanged

The commands the vault's skills call still live here and still mean the same thing: `npm run study -- --study <slug>` (every gate, one next action), `npm run beats:ship -- --study <slug>`, `npm run study:ship -- --study <slug>`, `npm run bind-images`, `npm run heroes`, `npm run adopt-pastes`, `npm run upload`, `npm run new-recipient`, and the vault checks (`takes:check`, `meta:check`, `frontmatter:check`, `order:check`, `recipients:check`, `taxonomy:check`). They read the vault at `VAULT_DIR` (default `~/Dev/marliin-vault`) and write only where they always did.
