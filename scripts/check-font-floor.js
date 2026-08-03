#!/usr/bin/env node
/**
 * Design-floor guard: no fontSize below 12 in app/ or components/
 * (owner decision 2026-07-12, enforced on web since then; swept here 2026-07-20).
 * Run in pre-commit checks alongside tsc/lint. Exits 1 on violations.
 */
// Narrow, greppable escape hatch: a line ending in
//   // font-floor-exempt: <reason>
// is allowed below the floor. Used only for decorative micro-labels the web
// itself ships below 12px (score tier caption at 9px, poster status chip),
// where the owner explicitly asked for web parity / smaller type. Every
// exemption must carry a reason, and `grep -rn font-floor-exempt` lists them
// all — the rule still covers every other string in the app.
const EXEMPT_MARKER = /\/\/\s*font-floor-exempt:\s*\S+/;

const { execSync } = require('child_process');

let out = '';
try {
  out = execSync(
    // POSIX classes, NOT \d / \s: execSync runs this through /bin/sh, and
    // macOS's BSD grep -E does not understand the Perl escapes — the whole
    // check silently matched nothing on a Mac (i.e. always passed) while
    // working on CI's GNU grep. Found 2026-08-03.
    String.raw`grep -rnE "fontSize: ([[:digit:]]|1[01])([,.[:space:]]|$)" app components --include='*.tsx' --include='*.ts'`,
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

const lines = out.split('\n').filter(Boolean);
const violations = lines.filter(line => !EXEMPT_MARKER.test(line));
const exempted = lines.length - violations.length;

if (violations.length === 0) {
  console.log(`font-floor: OK (no unexempted fontSize below 12; ${exempted} documented exemption(s))`);
  process.exit(0);
}

console.error('font-floor: FAIL — fontSize below 12 found:\n' + violations.join('\n'));
console.error('Minimum text size is 12 (matches the web 12px floor). Raise it or restructure.');
console.error('If the web ships this exact element smaller, append: // font-floor-exempt: <reason>');
process.exit(1);
