#!/usr/bin/env node
/**
 * Copy content/*.json (the single source of truth for learning content) into
 * public/content/ so Vite serves it in dev and copies it into dist/ on build.
 * public/content/ is gitignored; never edit it by hand.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'content';
const OUT = 'public/content';

function copyDir(src, out) {
  mkdirSync(out, { recursive: true });
  let n = 0;
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const o = join(out, name);
    if (statSync(s).isDirectory()) n += copyDir(s, o);
    else if (/\.(json|md)$/.test(name)) { copyFileSync(s, o); n++; }
  }
  return n;
}

rmSync(OUT, { recursive: true, force: true });
if (!existsSync(SRC)) {
  console.log('sync-content: no content/ directory yet, nothing to copy');
  process.exit(0);
}
console.log(`sync-content: ${copyDir(SRC, OUT)} files -> ${OUT}`);
