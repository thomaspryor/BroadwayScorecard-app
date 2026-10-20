// Watched tab calendar view data (lib/diary-calendar.ts).
// Run: node --experimental-strip-types --import ./tests/register-alias.mjs --test tests/unit/diary-calendar.test.mjs
//
// The calendar stopped 36 months back, so imported older viewings vanished
// from it, and a day with two shows (matinee + evening) showed only one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReviewsByDate,
  buildUpcomingByDate,
  buildDiaryCalendarMonths,
  buildMonthCells,
  MAX_CONTINUOUS_MONTHS,
} from '../../lib/diary-calendar.ts';

const today = new Date(2026, 9, 20); // 2026-10-20 local
const key = (m) => `${m.year}-${String(m.month + 1).padStart(2, '0')}`;

test('two shows on one day are both kept, in order', () => {
  const by = buildReviewsByDate([
    { show_id: 'six', date_seen: '2026-03-07' },
    { show_id: 'hamilton', date_seen: '2026-03-07' },
    { show_id: 'wicked', date_seen: null },
    { show_id: 'bad', date_seen: 'March 7' },
  ]);
  assert.deepEqual(Object.keys(by), ['2026-03-07']);
  assert.deepEqual(by['2026-03-07'].map((r) => r.show_id), ['six', 'hamilton']);
});

test('the same booking twice on a date is drawn once', () => {
  const by = buildUpcomingByDate([
    { show_id: 'oh-mary', date: '2026-11-02' },
    { show_id: 'oh-mary', date: '2026-11-02' },
    { show_id: 'maybe-happy-ending', date: '2026-11-02' },
  ]);
  assert.deepEqual(by['2026-11-02'], [{ show_id: 'oh-mary' }, { show_id: 'maybe-happy-ending' }]);
});

test('a viewing older than 36 months is still on the calendar', () => {
  const reviews = buildReviewsByDate([
    { show_id: 'new', date_seen: '2026-09-01' },
    { show_id: 'old', date_seen: '2015-08-06' },
    { show_id: 'older', date_seen: '2009-01-20' },
  ]);
  const months = buildDiaryCalendarMonths(reviews, {}, today).map(key);
  assert.equal(months[0], '2026-09');
  assert.ok(months.includes('2015-08'), 'old viewing kept');
  assert.ok(months.includes('2009-01'), 'oldest viewing kept');
  assert.equal(months[months.length - 1], '2009-01');
  // The newest 36 months are continuous; older ones are only months with entries.
  assert.equal(months.length, MAX_CONTINUOUS_MONTHS + 2);
  assert.equal(months[MAX_CONTINUOUS_MONTHS - 1], '2023-10');
});

test('a short diary stays continuous back to its oldest month', () => {
  const reviews = buildReviewsByDate([
    { show_id: 'a', date_seen: '2026-10-01' },
    { show_id: 'b', date_seen: '2026-07-15' },
  ]);
  assert.deepEqual(buildDiaryCalendarMonths(reviews, {}, today).map(key), ['2026-10', '2026-09', '2026-08', '2026-07']);
});

test('future bookings extend the newest end', () => {
  const reviews = buildReviewsByDate([{ show_id: 'a', date_seen: '2026-09-01' }]);
  const upcoming = buildUpcomingByDate([{ show_id: 'b', date: '2026-12-05' }]);
  assert.deepEqual(buildDiaryCalendarMonths(reviews, upcoming, today).map(key), ['2026-12', '2026-11', '2026-10', '2026-09']);
});

test('bookings only: from the furthest booking back to this month', () => {
  const upcoming = buildUpcomingByDate([{ show_id: 'b', date: '2027-01-10' }]);
  assert.deepEqual(buildDiaryCalendarMonths({}, upcoming, today).map(key), ['2027-01', '2026-12', '2026-11', '2026-10']);
});

test('empty diary shows this month only', () => {
  assert.deepEqual(buildDiaryCalendarMonths({}, {}, today).map(key), ['2026-10']);
});

test('day cells carry every show; bookings only where nothing was seen', () => {
  const reviews = buildReviewsByDate([
    { show_id: 'six', date_seen: '2026-02-14' },
    { show_id: 'hamilton', date_seen: '2026-02-14' },
  ]);
  const upcoming = buildUpcomingByDate([
    { show_id: 'later', date: '2026-02-14' },
    { show_id: 'booked', date: '2026-02-20' },
  ]);
  const cells = buildMonthCells(2026, 1, reviews, upcoming);
  // Feb 1 2026 is a Sunday: no leading padding, 28 days.
  assert.equal(cells.length, 28);
  const d14 = cells.find((c) => c?.day === 14);
  assert.deepEqual(d14.showIds, ['six', 'hamilton']);
  assert.equal(d14.upcoming, false);
  const d20 = cells.find((c) => c?.day === 20);
  assert.deepEqual(d20.showIds, ['booked']);
  assert.equal(d20.upcoming, true);
  assert.deepEqual(cells.find((c) => c?.day === 1).showIds, []);
});

test('leading padding matches the first weekday', () => {
  // Oct 1 2026 is a Thursday: four blanks (Sun-Wed).
  const cells = buildMonthCells(2026, 9, {}, {});
  assert.equal(cells.slice(0, 4).every((c) => c === null), true);
  assert.equal(cells[4].day, 1);
  assert.equal(cells.length, 4 + 31);
});
