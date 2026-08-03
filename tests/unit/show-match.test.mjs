// Import matcher — lib/show-match.ts + lib/diary-catalog.ts.
// Run: node --experimental-strip-types --import ./tests/register-alias.mjs \
//        --test tests/unit/show-match.test.mjs
//
// The regression this guards: iOS matched imports against the scored catalog
// only, so 45 productions per import came back "Not on Broadway Scorecard"
// while the website matched them (owner, 2026-08-02). The titles below are
// taken verbatim from the owner's TestFlight screenshots
// (ANLblfVA/ABdfRq1t = Mezzanine, AN2tu6Wo/AF2CHint = Show Score).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShowMatcher, normTitle, isWeakMatch, MATCH_THRESHOLD } from '../../lib/show-match.ts';
import { mergeDiaryCandidates, diaryEntryToCandidate } from '../../lib/diary-catalog.ts';

const scored = (id, title, extra = {}) => ({
  id,
  title,
  slug: id,
  venue: null,
  category: 'broadway',
  openingDate: null,
  closingDate: null,
  ...extra,
});

// ─── normTitle ────────────────────────────────────────────────────────────

test('normTitle folds accents before stripping punctuation', () => {
  assert.equal(normTitle('La Bohème'), 'la boheme');
  assert.equal(normTitle('CATS: “The Jellicle Ball”'), 'cats the jellicle ball');
  assert.equal(normTitle('Guys & Dolls'), 'guys and dolls');
  assert.equal(normTitle("Kathy and Stella Solve a Murder!"), 'kathy and stella solve a murder');
});

test("normTitle collapses the curly apostrophe Show Score sends", () => {
  assert.equal(normTitle('Standing at the Sky’s Edge'), normTitle("Standing at the Sky's Edge"));
});

// ─── diary merge ──────────────────────────────────────────────────────────

test('merge keeps diary productions the scored catalog does not have', () => {
  const base = [scored('hamilton-2015', 'Hamilton', { venue: 'Richard Rodgers Theatre' })];
  const diary = [
    { id: 'sleep-no-more-2011', title: 'Sleep No More', venue: 'McKittrick Hotel', category: 'off-broadway', od: '2011-04-13' },
  ];
  const merged = mergeDiaryCandidates(base, diary);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].diaryOnly, true);
});

test('merge never shadows a scored production with a same-venue diary duplicate', () => {
  const base = [scored('hamilton-2015', 'Hamilton', { venue: 'Richard Rodgers Theatre' })];
  const diary = [
    { id: 'hamilton-dupe', title: 'Hamilton', venue: 'Richard Rodgers Theatre' },
    { id: 'hamilton-no-venue', title: 'Hamilton' },
  ];
  const merged = mergeDiaryCandidates(base, diary);
  assert.deepEqual(merged.map(s => s.id), ['hamilton-2015']);
});

test('merge does not let one diary row suppress another with the same title', () => {
  // The web bug this mirrors dropped ~35% of the diary catalog.
  const merged = mergeDiaryCandidates([], [
    { id: 'cats-des-moines', title: 'Cats', venue: 'Des Moines Playhouse' },
    { id: 'cats-seattle', title: 'Cats', venue: 'Paramount' },
  ]);
  assert.equal(merged.length, 2);
});

// ─── matching ─────────────────────────────────────────────────────────────

test('a diary-only production matches once the catalogs are merged', () => {
  const base = [scored('the-lost-boys-2026', 'The Lost Boys')];
  const scoredOnly = new ShowMatcher(base);
  assert.ok(isWeakMatch(scoredOnly.match('Sleep No More', null, '2019-03-02')), 'scored-only should miss');

  const merged = new ShowMatcher(
    mergeDiaryCandidates(base, [
      { id: 'sleep-no-more-off-broadway-2011', title: 'Sleep No More', venue: 'McKittrick Hotel', category: 'off-broadway', od: '2011-04-13' },
    ]),
  );
  const hit = merged.match('Sleep No More', null, '2019-03-02');
  assert.equal(hit.match?.id, 'sleep-no-more-off-broadway-2011');
  assert.ok(hit.score > MATCH_THRESHOLD, `score ${hit.score} should clear ${MATCH_THRESHOLD}`);
});

test('a scored production wins over a diary duplicate of the same title', () => {
  const pool = [
    diaryEntryToCandidate({ id: 'cabaret-regional', title: 'Cabaret', venue: 'Playhouse', od: '2001-01-01' }),
    scored('cabaret-2024', 'Cabaret', { venue: 'August Wilson Theatre', openingDate: '2024-04-21' }),
  ];
  const m = new ShowMatcher(pool).match('Cabaret', null, null);
  assert.equal(m.match?.id, 'cabaret-2024');
});

test('date sanity still steers same-title productions to the right run', () => {
  const pool = [
    scored('history-boys-2006', 'The History Boys', { openingDate: '2006-04-23', closingDate: '2006-10-01' }),
    scored('history-boys-2025', 'The History Boys', { openingDate: '2025-03-01', closingDate: '2025-08-01' }),
  ];
  const m = new ShowMatcher(pool).match('The History Boys', null, '2025-05-04');
  assert.equal(m.match?.id, 'history-boys-2025');
});

test('a date far outside every run is flagged suspect, not silently written', () => {
  const pool = [scored('dead-outlaw-2025', 'Dead Outlaw', { openingDate: '2025-04-27', closingDate: '2025-06-29' })];
  const m = new ShowMatcher(pool).match('Dead Outlaw', null, '2024-04-03');
  assert.equal(m.match?.id, 'dead-outlaw-2025');
  assert.ok(m.dateSuspect, 'should be marked date-suspect');
  assert.ok(m.score <= MATCH_THRESHOLD, 'demoted below the auto-select bar');
});

test('venue disambiguates when two productions share a title and a window', () => {
  const pool = [
    scored('a-broadway', 'Once', { venue: 'Bernard B. Jacobs Theatre', openingDate: '2012-03-18' }),
    scored('a-tour', 'Once', { venue: 'Providence Performing Arts Center', openingDate: '2012-03-18' }),
  ];
  const m = new ShowMatcher(pool).match('Once', 'Providence Performing Arts Center', null);
  assert.equal(m.match?.id, 'a-tour');
});

test('an unknown title reports no match rather than a wrong one', () => {
  const pool = [scored('hamilton-2015', 'Hamilton')];
  const m = new ShowMatcher(pool).match('Zzzqqx Nonexistent Production', null, null);
  assert.ok(isWeakMatch(m));
});

// ─── shortlist safety net (ship-check, 2026-08-03) ────────────────────────

test('a typo is reported unmatched, never attached to a similar-looking show', () => {
  // Fuse runs without includeScore, so a fuzzy hit only clears the 0.7 bar
  // when one normalized title CONTAINS the other. "Hamliton" contains neither
  // "Hamilton" nor "Hamlet", so it must come back unmatched — the safe answer.
  // This is the contract both before and after the token shortlist; the point
  // of the test is that shortlisting never turns "unmatched" into a confident
  // WRONG show (ship-check, 2026-08-03).
  const pool = [
    scored('hamilton-2015', 'Hamilton', { venue: 'Richard Rodgers Theatre' }),
    scored('hamlet-2025', 'Hamlet'),
    scored('hadestown-2019', 'Hadestown'),
  ];
  const m = new ShowMatcher(pool).match('Hamliton', null, null);
  assert.ok(isWeakMatch(m), `should be unmatched, got "${m.match?.title}" at ${m.score}`);
});

test('a trailing typo still resolves via containment', () => {
  // "Hamilton!" normalizes to "hamilton" — an exact hit. "Hamilton The
  // Musical" contains "Hamilton" and resolves through the prefix tier.
  const pool = [scored('hamilton-2015', 'Hamilton'), scored('hamlet-2025', 'Hamlet')];
  const matcher = new ShowMatcher(pool);
  assert.equal(matcher.match('Hamilton!', null, null).match?.id, 'hamilton-2015');
  assert.equal(matcher.match('Hamilton The Musical', null, null).match?.id, 'hamilton-2015');
});

test('diary productions with no closing date do not tie on catalog order', () => {
  // Diary entries carry no closing date, so every run that opened before the
  // date "contains" it. The most recent one wins, not whichever came first.
  const pool = [
    diaryEntryToCandidate({ id: 'cats-1998', title: 'Cats', venue: 'Playhouse A', od: '1998-05-01' }),
    diaryEntryToCandidate({ id: 'cats-2019', title: 'Cats', venue: 'Playhouse B', od: '2019-05-01' }),
    diaryEntryToCandidate({ id: 'cats-2008', title: 'Cats', venue: 'Playhouse C', od: '2008-05-01' }),
  ];
  const m = new ShowMatcher(pool).match('Cats', null, '2021-06-15');
  assert.equal(m.match?.id, 'cats-2019');
});

test('a scored production still wins a date tie against a newer diary duplicate', () => {
  // Long-running scored shows carry no closing date, so a diary production that
  // opened later ALSO "contains" the date. Recency must not outrank the scored
  // catalog: "Chicago" seen in 2023 belongs to the Broadway run, not to a 2019
  // regional staging with no show page (ship-check, 2026-08-03).
  const pool = [
    scored('chicago-1996', 'Chicago', { venue: 'Ambassador Theatre', openingDate: '1996-11-14' }),
    diaryEntryToCandidate({ id: 'chicago-regional-2019', title: 'Chicago', venue: 'Some Playhouse', od: '2019-03-01' }),
  ];
  const m = new ShowMatcher(pool).match('Chicago', null, '2023-05-01');
  assert.equal(m.match?.id, 'chicago-1996', `matched ${m.match?.id} instead`);
});
