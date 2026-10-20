// Source guards for the Home and Browse tabs. The shelf rules are tested in
// home-shelves.test.mjs; these checks keep the screens using them instead of
// inline copies (the 30-day, any-status Closing Soon and the previews-only
// "Coming Up" shelf were such copies), and keep the native UX fixes in place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = rel => readFileSync(`${APP_ROOT}/${rel}`, 'utf8');
const HOME = read('app/(tabs)/index.tsx');
const BROWSE = read('app/(tabs)/browse.tsx');
const SEARCH = read('app/search.tsx');
const RATING = read('components/user/ShowPageRating.tsx');

test('Home shelves come from lib/home-shelves', () => {
  for (const fn of ['selectClosingSoon', 'selectStartingSoon', 'startingSoonSubtitle', 'isTopRecentCandidate', 'isDateNightShow', 'isRankedShelfEligible']) {
    assert.match(HOME, new RegExp(`\\b${fn}\\b`), `${fn} not used on Home`);
  }
  assert.doesNotMatch(HOME, /30 \* 24 \* 60 \* 60 \* 1000/, 'inline 30-day Closing Soon window is back');
  assert.doesNotMatch(HOME, /title: 'Coming Up'/, 'previews duplicate the Starting Soon shelf');
  assert.doesNotMatch(HOME, /tags\.includes\('romantic'\)/, 'Date Night is romantic OR drama, case-insensitive');
});

test('Home keeps the titles the Maestro flows look for', () => {
  assert.match(HOME, /title: 'Top Shows'/);
  assert.match(HOME, /shows scored by/);
});

test('"N shows scored" counts displayable scores only', () => {
  assert.match(HOME, /marketShows\.filter\(s => getQualifiedScore\(s\) != null\)\.length/);
  assert.doesNotMatch(HOME, /compositeScore != null\)\.length/);
});

test('Home and Browse offline error states offer Try Again', () => {
  for (const [name, src] of [['Home', HOME], ['Browse', BROWSE]]) {
    const errorBlock = src.slice(src.indexOf('if (error && shows.length === 0)'));
    assert.ok(errorBlock.length > 0, `${name} error state missing`);
    assert.match(errorBlock.slice(0, 1200), /onPress=\{onRefresh\}[\s\S]*Try Again/, `${name} error state has no retry`);
  }
});

test('search result lists take the first tap and hide the keyboard on scroll', () => {
  for (const [name, src] of [['Browse', BROWSE], ['Search', SEARCH]]) {
    assert.match(src, /keyboardShouldPersistTaps="handled"/, `${name}: first tap only dismisses the keyboard`);
    assert.match(src, /keyboardDismissMode="on-drag"/, `${name}: keyboard stays up while scrolling`);
  }
});

test('the planned-date button on the show page is a labelled button', () => {
  const i = RATING.indexOf('style={styles.watchlistDateButton}');
  assert.ok(i > 0, 'planned-date button not found');
  const props = RATING.slice(i, RATING.indexOf('<Svg', i));
  assert.match(props, /accessibilityRole="button"/);
  assert.match(props, /accessibilityLabel=/);
});
