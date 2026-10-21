// supabaseRestSelect must report a garbled 200 as an error. Run:
//   node --test tests/unit/supabase-rest-select.test.mjs
//
// request() parses the body itself and leaves it null when it is not JSON (a
// truncated response). A select that turned that into [] told import "this
// account has no reviews", so its dedupe let every row through again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../../lib/supabase-rest.ts', import.meta.url), 'utf8');
const select = SRC.slice(SRC.indexOf('export async function supabaseRestSelect'));
const body = select.slice(0, select.indexOf('\n}\n'));

test('select rejects a non-array body instead of returning no rows', () => {
  assert.match(body, /if \(!Array\.isArray\(res\.body\)\)/);
  assert.doesNotMatch(body, /\?\? \[\]/);
});
