// lib/home-shelves.ts: Home shelf rules ported from the website home page
// (src/app/page.tsx). Closing Soon is 120 days and open shows only, Starting
// Soon merges previews and upcoming by next milestone, ranked shelves leave
// opera out, Top Recent is open musicals and plays, Date Night is romantic or
// drama.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSING_SOON_DAYS,
  isClosingSoon,
  selectClosingSoon,
  isRankedShelfEligible,
  isTopRecentCandidate,
  twelveMonthsAgoYMD,
  isDateNightShow,
  hasTagCI,
  isStartingSoon,
  selectStartingSoon,
  startingSoonSubtitle,
} from '../../lib/home-shelves.ts';
import { toLocalYMD } from '../../lib/date-utils.ts';
import { SKIP_NO_WEB, readWeb } from './web-repo.mjs';

const NOW = new Date(2026, 9, 20, 22, 0, 0); // 10pm local: UTC is already tomorrow in the US
const plus = n => { const d = new Date(2026, 9, 20, 12); d.setDate(d.getDate() + n); return toLocalYMD(d); };
const base = { status: 'open', type: 'musical', openingDate: '2025-01-01', closingDate: null, previewsStartDate: null, tags: [], ageRecommendation: null };
const s = over => ({ ...base, ...over });

test('closing soon: today through 120 days out, open shows only', () => {
  assert.equal(CLOSING_SOON_DAYS, 120);
  assert.equal(isClosingSoon(s({ closingDate: plus(0) }), NOW), true, 'closing today');
  assert.equal(isClosingSoon(s({ closingDate: plus(120) }), NOW), true);
  assert.equal(isClosingSoon(s({ closingDate: plus(121) }), NOW), false);
  assert.equal(isClosingSoon(s({ closingDate: plus(-1) }), NOW), false);
  assert.equal(isClosingSoon(s({ closingDate: plus(10), status: 'previews' }), NOW), false);
  assert.equal(isClosingSoon(s({ closingDate: plus(10), status: 'upcoming' }), NOW), false);
  assert.equal(isClosingSoon(s({ closingDate: null }), NOW), false);
  const picked = selectClosingSoon([s({ closingDate: plus(90) }), s({ closingDate: plus(3) }), s({ closingDate: plus(200) })], NOW);
  assert.deepEqual(picked.map(x => x.closingDate), [plus(3), plus(90)]);
});

test('ranked shelves leave opera out', () => {
  assert.equal(isRankedShelfEligible({ type: 'opera' }), false);
  for (const type of ['musical', 'play', 'special', '']) assert.equal(isRankedShelfEligible({ type }), true);
});

test('top recent: open musicals and plays from the last 12 months', () => {
  const cutoff = twelveMonthsAgoYMD(NOW);
  assert.equal(cutoff, '2025-10-20');
  assert.equal(isTopRecentCandidate(s({ openingDate: '2025-10-20' }), NOW), true);
  assert.equal(isTopRecentCandidate(s({ openingDate: '2025-10-19' }), NOW), false);
  assert.equal(isTopRecentCandidate(s({ openingDate: '2026-05-01', type: 'play' }), NOW), true);
  assert.equal(isTopRecentCandidate(s({ openingDate: '2026-05-01', type: 'opera' }), NOW), false);
  assert.equal(isTopRecentCandidate(s({ openingDate: '2026-05-01', type: 'special' }), NOW), false);
  assert.equal(isTopRecentCandidate(s({ openingDate: '2026-05-01', status: 'previews' }), NOW), false);
});

test('date night: romantic or drama, any tag case, not a kids show', () => {
  assert.equal(isDateNightShow(s({ tags: ['romantic'] })), true);
  assert.equal(isDateNightShow(s({ tags: ['Drama'] })), true);
  assert.equal(isDateNightShow(s({ tags: ['comedy'] })), false);
  assert.equal(isDateNightShow(s({ tags: ['drama'], ageRecommendation: 'Ages 6+' })), false);
  assert.equal(hasTagCI(s({ tags: ['Family'] }), 'family'), true);
});

test('starting soon: previews by opening night, upcoming by first preview', () => {
  const rows = [
    s({ status: 'upcoming', previewsStartDate: '2026-12-01', openingDate: '2027-01-10' }),
    s({ status: 'previews', openingDate: '2026-11-15' }),
    s({ status: 'upcoming', openingDate: '2026-11-20' }),
    s({ status: 'upcoming', openingDate: null }),
    s({ status: 'previews', openingDate: null }),
    s({ status: 'announced', openingDate: '2026-11-01' }),
  ];
  assert.equal(isStartingSoon(rows[3]), false, 'upcoming with no date is left out');
  assert.equal(isStartingSoon(rows[5]), false, 'announced is not starting soon (web parity)');
  const picked = selectStartingSoon(rows);
  assert.deepEqual(picked, [rows[1], rows[2], rows[0], rows[4]]);
  assert.equal(startingSoonSubtitle(rows[0]), 'Starts Dec 1');
  assert.equal(startingSoonSubtitle(rows[1]), 'Opens Nov 15');
  assert.equal(startingSoonSubtitle(rows[2]), 'Starts Nov 20');
  assert.equal(startingSoonSubtitle(rows[4]), undefined);
});

test('contract: closing-soon window and shelf predicates match the website home page', { skip: SKIP_NO_WEB }, () => {
  const src = readWeb('src/app/page.tsx');
  assert.ok(src, 'web home page present');
  const days = Number(/diffDays <= (\d+)/.exec(src)?.[1]);
  assert.equal(days, CLOSING_SOON_DAYS);
  assert.match(src, /closingSoonShowsList[\s\S]{0,120}s\.status !== 'open'/, 'closing soon is open-only');
  assert.match(src, /s\.type !== 'opera'/, 'web leaves opera off the ranked Off-Broadway shelf');
  assert.match(src, /bestRecentShows[\s\S]{0,140}s\.type === 'musical' \|\| s\.type === 'play'\) && s\.status === 'open'/);
  assert.match(src, /tags\.includes\('romantic'\) \|\| tags\.includes\('drama'\)/);
  assert.match(src, /s\.status === 'previews' \|\| \(s\.status === 'upcoming' && \(s\.previewsStartDate \|\| s\.openingDate\)\)/);
});
