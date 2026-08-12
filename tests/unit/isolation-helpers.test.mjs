// Tests the assertions that the RLS suites are built on.
//
// Why (owner's question, 2026-08-12: "did you fully test the testing?"): of the
// isolation assertions in tests/security/, only two had ever been observed
// FAILING for real — the push-token registration check and the cross-account
// attach check, both of which failed before their fix and passed after. The
// other eleven had only ever been seen passing, which is not evidence that they
// can fail. A typo'd table name or a filter on the wrong id would have produced
// exactly the same green.
//
// These are pure functions over fake query results, so they run locally with no
// credentials and no network. They prove the helpers fail in BOTH directions:
// when the owner cannot see its own row (the check is vacuous) and when the
// attacker can see it (a real leak).

import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOnlyOwnerCanSee, assertWriteBlocked } from '../security/isolation-helpers.mjs';

const rows = n => ({ data: Array.from({ length: n }, (_, i) => ({ id: i })), error: null });
const failed = message => ({ data: null, error: { message } });

async function rejects(fn, matcher, why) {
  let threw = null;
  try { await fn(); } catch (e) { threw = e; }
  assert.ok(threw, `expected an assertion failure: ${why}`);
  assert.match(threw.message, matcher, `wrong failure reason — got: ${threw.message}`);
}

test('assertOnlyOwnerCanSee passes only when the owner sees rows and the attacker sees none', async () => {
  await assertOnlyOwnerCanSee('happy path', () => rows(1), () => rows(0));
  await assertOnlyOwnerCanSee('owner sees many', () => rows(5), () => rows(0));
});

test('assertOnlyOwnerCanSee FAILS when the attacker can see the row (a real leak)', async () => {
  await rejects(
    () => assertOnlyOwnerCanSee('leak', () => rows(1), () => rows(1)),
    /must see zero rows/,
    'the attacker returned a row and that is the leak this suite exists to catch',
  );
});

test('assertOnlyOwnerCanSee FAILS when the owner cannot see its own row (a vacuous check)', async () => {
  // This is the case that matters most. Without the positive control the
  // attacker's zero looks like a pass, and the suite reports isolation it never
  // demonstrated — a typo'd table name or a wrong filter reads as security.
  await rejects(
    () => assertOnlyOwnerCanSee('vacuous', () => rows(0), () => rows(0)),
    /POSITIVE CONTROL FAILED/,
    'the owner saw nothing, so the attacker seeing nothing proves nothing',
  );
});

test('assertOnlyOwnerCanSee FAILS loudly when either query errors', async () => {
  await rejects(
    () => assertOnlyOwnerCanSee('owner errored', () => failed('boom'), () => rows(0)),
    /the owner's own read errored/,
    'a failed owner query must not be read as "no rows"',
  );
  await rejects(
    () => assertOnlyOwnerCanSee('attacker errored', () => rows(1), () => failed('boom')),
    /it does not 403/,
    'a failed attacker query must not be read as "blocked"',
  );
});

test('assertWriteBlocked accepts both shapes a blocked write takes', () => {
  assertWriteBlocked('explicit rejection', { data: null, error: { message: 'violates RLS' } });
  assertWriteBlocked('matched zero rows', { data: [], error: null });
});

test('assertWriteBlocked FAILS when the write actually landed', () => {
  assert.throws(
    () => assertWriteBlocked('landed', { data: [{ id: 1 }], error: null }),
    /affected 1 row/,
  );
  assert.throws(
    () => assertWriteBlocked('landed, single object', { data: { id: 1 }, error: null }),
    /affected 1 row/,
  );
});
