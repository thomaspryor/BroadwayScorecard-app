// A "still mounted" ref must be set back to true inside its effect. Run:
//   node --test tests/unit/mount-flag-effect.test.mjs
//
// React's development double-mount (StrictMode, and the web preview) runs a
// cleanup before the real mount. A ref that starts true and is only cleared in
// a cleanup-only effect stays false after that, and whatever it gates silently
// never runs (web parity: Broadwayscore tests/unit/mount-flag-effect.test.mjs,
// where it kept the welcome sheet from opening).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const DIRS = ['app', 'components', 'hooks', 'lib'];
const CLEANUP_ONLY = /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{\s*\w+\.current\s*=\s*false;?\s*\}/;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(tsx?|jsx?)$/.test(name) ? [p] : [];
  });
}

test('the pattern is recognised', () => {
  assert.match('useEffect(() => () => { mounted.current = false; }, []);', CLEANUP_ONLY);
  assert.doesNotMatch('useEffect(() => {\n  mounted.current = true;\n  return () => { mounted.current = false; };\n}, []);', CLEANUP_ONLY);
});

test('no source file clears a mount flag in a cleanup-only effect', () => {
  const offenders = DIRS.flatMap(d => sourceFiles(join(ROOT, d)))
    .filter(f => CLEANUP_ONLY.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map(f => f.slice(ROOT.length)), [],
    'Set the ref to true in the effect body too: useEffect(() => { ref.current = true; return () => { ref.current = false; }; }, [])');
});
