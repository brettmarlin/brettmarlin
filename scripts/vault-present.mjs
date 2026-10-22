/**
 * Is the Obsidian vault on this machine?
 *
 * A handful of tests assert against the REAL vault rather than a fixture,
 * deliberately: that every study resolves by both its names, and that
 * `_order.md` covers every published study exactly once. Those are the checks
 * that catch a vault edit breaking the site, and a fixture cannot make them.
 *
 * CI does not check the vault out. `.github/workflows/verify.yml` already
 * skips the vault-dependent STEPS for that reason (generate:check,
 * check-clearance), but `npm test` runs whole files, so those four tests went
 * to CI and failed on ENOENT the first time the suite reached `main`.
 *
 * They skip rather than pass. A skipped test prints as skipped and says why,
 * which is the difference between "we did not run this here" and "this
 * passed". Locally, where the vault exists, they run and must pass.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const VAULT_DIR = process.env.VAULT_DIR ?? join(homedir(), 'Dev', 'marliin-vault');

/** `false` when the vault is here, or the reason string node:test prints when
 *  it is not. Shaped for `test(name, { skip: skipWithoutVault }, fn)`. */
export const skipWithoutVault =
  existsSync(join(VAULT_DIR, 'case-studies')) ?
    false :
    `no vault at ${VAULT_DIR} (expected on CI); this test asserts against the real vault`;
