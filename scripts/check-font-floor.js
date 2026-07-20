#!/usr/bin/env node
/**
 * Design-floor guard: no fontSize below 12 in app/ or components/
 * (owner decision 2026-07-12, enforced on web since then; swept here 2026-07-20).
 * Run in pre-commit checks alongside tsc/lint. Exits 1 on violations.
 */
const { execSync } = require('child_process');

let out = '';
try {
  out = execSync(
    String.raw`grep -rnE "fontSize: (\d|1[01])([,.\s]|$)" app components --include='*.tsx' --include='*.ts'`,
    { cwd: __dirname + '/..', encoding: 'utf8' },
  );
} catch (e) {
  // grep exits 1 when nothing matches — that's the pass case
  if (e.status === 1) {
    console.log('font-floor: OK (no fontSize below 12)');
    process.exit(0);
  }
  throw e;
}

console.error('font-floor: FAIL — fontSize below 12 found:\n' + out);
console.error('Minimum text size is 12 (matches the web 12px floor). Raise it or restructure.');
process.exit(1);
