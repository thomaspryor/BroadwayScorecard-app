// Locates a checkout of the website repo (thomaspryor/Broadwayscore) for the
// parity contract tests. CI has no web checkout, so every caller must skip
// cleanly when this returns null.
//
// Looked up in order: $BSC_WEB_REPO, a sibling ../Broadwayscore, then
// ~/Broadwayscore. BSC_WEB_REPO=none forces the CI path (every contract
// skipped), to check the skips locally. A directory only counts when it holds the web's
// scripts/lib/min-reviews.js, so an unrelated folder of the same name is ignored.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function candidates() {
  const list = [];
  if (process.env.BSC_WEB_REPO) list.push(process.env.BSC_WEB_REPO);
  list.push(resolve(APP_ROOT, '..', 'Broadwayscore'));
  list.push(join(homedir(), 'Broadwayscore'));
  return list;
}

export const WEB_ROOT = process.env.BSC_WEB_REPO === 'none' ? null : candidates().find(dir => existsSync(join(dir, 'scripts', 'lib', 'min-reviews.js'))) ?? null;

/** Skip reason for node:test, or false when the web repo is present. */
export const SKIP_NO_WEB = WEB_ROOT ? false : 'website repo not checked out (set BSC_WEB_REPO to run parity contracts)';

/** Read a web file as text, or null when it is missing. */
export function readWeb(rel) {
  if (!WEB_ROOT) return null;
  const p = join(WEB_ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

export const webPath = rel => (WEB_ROOT ? join(WEB_ROOT, rel) : null);
