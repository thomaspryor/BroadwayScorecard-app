// BRO-5852 (owner decision 2026-10-21): ask for notifications after a first
// rating or watchlist add, with a one-line reason, never at launch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldSoftAsk, notificationSettingsRow, SOFT_ASK_MESSAGE } from '../../lib/notification-ask.ts';

const root = new URL('../../', import.meta.url).pathname;
const read = rel => readFileSync(root + rel, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('asks once, on a real device, only while iOS has never asked', () => {
  assert.equal(shouldSoftAsk({ status: 'undetermined', alreadyAsked: false, isDevice: true }), true);
  assert.equal(shouldSoftAsk({ status: 'undetermined', alreadyAsked: true, isDevice: true }), false, 'once per install');
  assert.equal(shouldSoftAsk({ status: 'granted', alreadyAsked: false, isDevice: true }), false);
  assert.equal(shouldSoftAsk({ status: 'denied', alreadyAsked: false, isDevice: true }), false, 'iOS will not show its dialog again');
  assert.equal(shouldSoftAsk({ status: 'undetermined', alreadyAsked: false, isDevice: false }), false, 'simulator: would block E2E flows');
  // The copy must match what is actually sent (night-of check-in, reviews-in).
  assert.match(SOFT_ASK_MESSAGE, /night of a show/);
  assert.match(SOFT_ASK_MESSAGE, /reviews are in/);
});

test('every successful rating save and watchlist add offers the soft ask', () => {
  const rate = read('app/rate/[showId].tsx');
  const saves = rate.match(/showToast\(reviewId \? 'Rating updated' : 'Rating saved'[^;]*;\s*void maybeAskForNotifications\(\);/g) || [];
  assert.equal(saves.length, 2, 'the direct save and the save resumed after sign-in');
  const watchlist = read('hooks/useWatchlist.ts');
  const add = watchlist.slice(watchlist.indexOf('const addToWatchlist'), watchlist.indexOf('const removeFromWatchlist'));
  assert.equal((add.match(/void maybeAskForNotifications\(\);/g) || []).length, 3, 'online insert, offline queue and network-error queue');
  const planned = watchlist.slice(watchlist.indexOf('const updatePlannedDate'));
  assert.match(planned.slice(0, 900), /if \(plannedDate\) void maybeAskForNotifications\(\);/, 'imported shows get a date without an add');
});

test('the soft ask shows the iOS dialog only after "Turn on"', () => {
  const lib = read('lib/notifications.ts');
  const fn = lib.slice(lib.indexOf('export async function maybeAskForNotifications'), lib.indexOf('export async function syncPushTokenIfPermitted'));
  assert.match(fn, /shouldSoftAsk\(/);
  assert.match(fn, /text: 'Turn on',[\s\S]*?registerForPushNotifications\(\)[\s\S]*?\.catch\(/);
  for (const step of ['shown', 'not_now', 'turn_on', 'ios_allowed', 'ios_declined']) assert.ok(fn.includes(`'${step}'`), `analytics step ${step}`);
  assert.match(fn, /if \(reviewPromptRequestedWithin\(60_000\)\) return;\s*await AsyncStorage\.setItem\(SOFT_ASK_KEY/, 'skip without spending the one ask when the App Store prompt just showed');
  assert.doesNotMatch(fn, /requestPermissionsAsync/);
});

test('the Settings row is the way back after "Not now"', () => {
  assert.deepEqual(notificationSettingsRow('undetermined'), { value: 'Off', action: 'request' });
  assert.deepEqual(notificationSettingsRow('denied'), { value: 'Off', action: 'open-settings' });
  assert.deepEqual(notificationSettingsRow('granted'), { value: 'On', action: 'open-settings' });
  assert.deepEqual(notificationSettingsRow('unavailable'), { value: 'Not available', action: null });
  const settings = read('app/settings.tsx');
  assert.match(settings, /notificationSettingsRow\(notificationStatus\)/);
  assert.match(settings, /label="Notifications"/);
  assert.match(settings, /AppState\.addEventListener\('change'/, 're-read after returning from iOS Settings');
});

test('adding from search on To Watch leaves the question to the date prompt that follows', () => {
  const toWatch = read('app/(tabs)/to-watch.tsx');
  assert.match(toWatch, /addToWatchlist\(selection\.id, \{ askForNotifications: false \}\)/);
  const watchlist = read('hooks/useWatchlist.ts');
  const add = watchlist.slice(watchlist.indexOf('const addToWatchlist'), watchlist.indexOf('const removeFromWatchlist'));
  assert.equal((add.match(/if \(askForNotifications\) void maybeAskForNotifications\(\);/g) || []).length, 3);
});
