// Shared assertion helpers for the two-account RLS suites.
//
// Extracted from account-data-rls-adversarial.test.mjs so the logic that makes
// every isolation claim meaningful can itself be unit-tested — see
// tests/unit/isolation-helpers.test.mjs, which proves these fail in both
// directions rather than only being observed passing.

import assert from 'node:assert/strict';

/**
 * Asserts that the owner CAN see a row and the attacker CANNOT.
 *
 * The positive control is the point. A zero-row result is the expected SUCCESS
 * of an isolation check, which makes it indistinguishable from a query pointed
 * at nothing — a typo in the table name, a filter on the wrong id, a fixture
 * row that never got created. Running the identical query as the owner first is
 * what separates "RLS blocked this" from "there was nothing here anyway".
 *
 * Both queries must have the SAME shape and filters; only the client differs.
 */
export async function assertOnlyOwnerCanSee(label, ownerQuery, attackerQuery) {
  const owner = await ownerQuery();
  assert.equal(owner.error, null, `${label} — the owner's own read errored: ${owner.error?.message}`);
  assert.ok(
    (owner.data?.length ?? 0) > 0,
    `${label} — POSITIVE CONTROL FAILED: the owner cannot see its own row, so the attacker seeing ` +
    `zero would prove nothing. The query shape or the fixture is wrong here, not the RLS policy.`,
  );

  const attacker = await attackerQuery();
  assert.equal(
    attacker.error, null,
    `${label} — RLS filters rows, it does not 403; an error means something else broke: ${attacker.error?.message}`,
  );
  assert.equal(attacker.data?.length ?? 0, 0, `${label} — the attacker must see zero rows`);
}

/**
 * Asserts a write was blocked.
 *
 * A write blocked by RLS surfaces one of two ways depending on the policy:
 * PostgREST returns an explicit error (a WITH CHECK violation on INSERT), or it
 * returns success having matched zero rows (a USING clause filtered the target
 * out of an UPDATE/DELETE before it ran). Both are "blocked"; asserting on only
 * one shape makes the test policy-dependent rather than behaviour-dependent.
 *
 * NOTE: this cannot detect a write that SUCCEEDED but returned no
 * representation, which happens when the attacker has INSERT but not SELECT.
 * Where that is possible, verify the row's absence out of band instead — see
 * the unmatched_imports case in account-data-rls-adversarial.test.mjs.
 */
export function assertWriteBlocked(label, { data, error }) {
  const rowsAffected = Array.isArray(data) ? data.length : (data ? 1 : 0);
  assert.ok(
    error != null || rowsAffected === 0,
    `${label} — RLS must reject this write or match zero rows, but it affected ${rowsAffected} row(s)`,
  );
}
