#!/usr/bin/env node
// `npm run dev`: the site and the local Worker shim together, one command.
// .env is read here so VITE_LOCAL_IMAGES and VAULT_DIR reach the shim the
// same way they reach Vite; the shell still wins over the file.
import { spawn } from 'node:child_process';
import { loadDotEnv } from './vault-dir.mjs';

loadDotEnv();
const env = { ...process.env };
const api = spawn('node', ['scripts/dev-api.mjs'], { stdio: 'inherit', env });
const site = spawn('npx', ['vite'], { stdio: 'inherit', env });
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  api.kill();
  site.kill();
  process.exit(code);
};
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
site.on('exit', (code) => stop(code ?? 0));
// A site with no API is a site where every study reads as locked and every
// recipient link as empty, so the shim failing stops the whole thing, loudly.
api.on('exit', (code) => {
  if (stopping) return;
  console.error(`dev: the local API (scripts/dev-api.mjs) exited with code ${code}; stopping the site too.`);
  stop(code || 1);
});
