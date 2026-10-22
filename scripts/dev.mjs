#!/usr/bin/env node
// `npm run dev`: the site and the local Worker shim together, one command.
import { spawn } from 'node:child_process';
const env = { ...process.env, VITE_LOCAL_IMAGES: process.env.VITE_LOCAL_IMAGES ?? '0' };
const api = spawn('node', ['scripts/dev-api.mjs'], { stdio: 'inherit', env });
const site = spawn('npx', ['vite'], { stdio: 'inherit', env });
const stop = () => { api.kill(); site.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
site.on('exit', stop);
