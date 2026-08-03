// lib/date-utils.ts — the date math behind the CLOSING SOON chip and every
// persisted date_seen / planned_date.
// Run: node --experimental-strip-types --import ./tests/register-alias.mjs \
//        --test tests/unit/date-utils.test.mjs
//
// These functions carry two scars worth guarding:
//   - `new Date('YYYY-MM-DD')` parses as UTC midnight, so in US timezones a
//     show closing TODAY reads as already past and drops off the shelf.
//   - `toISOString()` is UTC, so an evening pick in ET persists as tomorrow.
// Both are invisible to tsc and only reproduce in a specific local timezone,
// which is exactly what a unit test is for (/what-else sweep, 2026-08-03).
import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntilDate, isClosingSoonDate, toLocalYMD } from '../../lib/date-utils.ts';

const ymd = (d) => toLocalYMD(d);
const daysFromNow = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};

test('a show closing today still counts as closing soon', () => {
  // The UTC-midnight bug made this false in every timezone west of GMT.
  assert.equal(isClosingSoonDate(ymd(new Date())), true);
});

test('closing-soon window is the next four weeks, exclusive at 28 days', () => {
  assert.equal(isClosingSoonDate(ymd(daysFromNow(1))), true);
  assert.equal(isClosingSoonDate(ymd(daysFromNow(27))), true);
  assert.equal(isClosingSoonDate(ymd(daysFromNow(28))), false, '28 days out is not "soon"');
  assert.equal(isClosingSoonDate(ymd(daysFromNow(60))), false);
});

test('a show that already closed is not closing soon', () => {
  assert.equal(isClosingSoonDate(ymd(daysFromNow(-1))), false);
  assert.equal(isClosingSoonDate(ymd(daysFromNow(-400))), false);
});

test('toLocalYMD keeps the local calendar date for evening times', () => {
  // 23:30 local on any day must serialize as THAT day, not tomorrow.
  const late = new Date();
  late.setHours(23, 30, 0, 0);
  const expected = `${late.getFullYear()}-${String(late.getMonth() + 1).padStart(2, '0')}-${String(late.getDate()).padStart(2, '0')}`;
  assert.equal(toLocalYMD(late), expected);
});

test('toLocalYMD and daysUntilDate agree on today', () => {
  // daysUntilDate returns -0 for today (Math.ceil of a small negative), and
  // assert.equal uses Object.is, where -0 !== 0. The app compares with ===
  // (`daysUntil === 0 ? 'Today!'` in to-watch.tsx), where -0 === 0 holds — so
  // the value is correct and it is the assertion that has to say so.
  assert.ok(daysUntilDate(toLocalYMD(new Date())) === 0, 'today should be 0 days out');
});

test('daysUntilDate counts whole days forward and backward', () => {
  assert.equal(daysUntilDate(ymd(daysFromNow(1))), 1);
  assert.equal(daysUntilDate(ymd(daysFromNow(7))), 7);
  assert.equal(daysUntilDate(ymd(daysFromNow(-3))), -3);
});
