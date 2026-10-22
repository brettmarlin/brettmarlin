#!/usr/bin/env node
/** npm run verify: every check, fastest failing first, gated on exit codes. */
import { spawnSync } from 'node:child_process';

const steps = [
  ['typecheck', ['npx', 'tsc', '--noEmit', '-p', 'tsconfig.json']],
  ['unit tests', ['npm', 'test', '--silent']],
  ['copy guard', ['node', 'scripts/check-copy.mjs']],
  ['bundle guard', ['node', 'scripts/check-public-bundle.mjs']],
  ['clearance guard', ['node', 'scripts/check-clearance.mjs']],
  ['build', ['npx', 'vite', 'build']],
  ['dist guard', ['node', 'scripts/check-dist.mjs']],
];
for (const [name, cmd] of steps) {
  process.stdout.write(`\n== ${name}\n`);
  const res = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
  if (res.status !== 0) { console.error(`\nverify: FAILED at ${name}`); process.exit(1); }
}
console.log('\nverify: every check passed');
