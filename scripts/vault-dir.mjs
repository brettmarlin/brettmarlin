// Where the vault is. One resolver for every script, so `.env` works for
// the guards and generators the way it already does for Vite: the shell
// wins, then the repo's .env, then the default checkout path.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
let loaded = false;

/** Fold the repo's .env into process.env, never overriding the shell. */
export function loadDotEnv() {
  if (loaded) return;
  loaded = true;
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(p, 'utf8')))) {
    if (!(k in process.env) && v !== '') process.env[k] = v;
  }
}

export function resolveVaultDir() {
  loadDotEnv();
  return process.env.VAULT_DIR || join(homedir(), 'Dev', 'marliin-vault');
}
