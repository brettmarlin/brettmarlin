# CLAUDE.md, brettmarlin.xyz

Read `README.md` for how to run it and the rules that are invisible in the
code, then `ARCHITECTURE.md` for the pipeline. This file routes.

## The one rule
Content decisions live in the private vault (`brettmarlin/marliin-vault`,
checked out at `~/Dev/marliin-vault` or wherever `VAULT_DIR` points). This
repo renders them and decides nothing. `src/data/caseStudies.ts`,
`src/data/taxonomy.ts` and `src/data/substack.ts` are generated, never
hand-edited: fix the vault and regenerate.

## The gates
- `npm run verify` is the contract. Gate on its exit code, never on a grep.
- `npm run build` runs the copy guard, the bundle guard and the clearance
  guard before Vite, and the dist guard after. A red guard is a real finding.
- Clearance is a build gate, not a conversation. `scripts/check-clearance.mjs`
  reads `consent/clearances.md` in the vault and fails the build on a
  non-public name in the public bundle. Never raise clearance with Brett
  while building; the guard says what cannot ship.

## Never
- Put gated case-study content anywhere an anonymous visitor can reach it.
  Gated work is served by the Worker, behind a password, and is absent from
  `dist/`. `scripts/check-dist.mjs` proves it on every build.
- Link a `/for/:slug` recipient route, or `/admin`, from public navigation.
- Commit a password, a token or a KV export. `.dev/` is ignored for a reason.
- Deploy the Worker from a CI job. Deploys are deliberate: `npm run worker:deploy`
  from a machine that is logged in, when Brett says so.

## Copy
UI copy is brand copy under the vault's canon: no em or en dashes, no
emoji, none of the anti-lexicon, name the credential never the casualty.
`scripts/check-copy.mjs` enforces the mechanical half on `src/`.

## Design
The system is Swiss: a twelve column grid, Archivo on the display and text,
IBM Plex Mono for the index furniture, white paper, black ink, one signal
red, hairline rules. Tokens live in `src/styles/tokens.css` and nothing
else holds a literal colour or size. Press `g` on any public page to see
the grid. Every animation degrades under `prefers-reduced-motion`.
