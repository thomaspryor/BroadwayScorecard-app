// Tapping the "How was <show>?" reminder the morning after opened the home
// tab. Two causes: the reminder routed to the show page, never the rate
// screen, and a tap that launched a closed app was dropped because the tap
// listener is registered after the async onboarding read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notificationTarget, RATE_REMINDER_PREFIX } from '../../lib/notification-routing.ts';

const root = new URL('../../', import.meta.url).pathname;
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = rel => stripComments(readFileSync(join(root, rel), 'utf8'));

test('a rate reminder opens the rate screen with title and planned date', () => {
  assert.deepEqual(
    notificationTarget(
      { showSlug: 'hamilton-2015', type: 'rate-reminder', showTitle: 'Hamilton', date: '2026-10-21' },
      'How was Hamilton?',
      'rate-hamilton-2015-2026-10-21',
    ),
    { pathname: '/rate/[showId]', params: { showId: 'hamilton-2015', showTitle: 'Hamilton', suggestedDate: '2026-10-21' } },
  );
});

test('reminders scheduled before the payload carried title/date still get both', () => {
  assert.deepEqual(
    notificationTarget(
      { showSlug: 'maybe-happy-ending-2024', type: 'rate-reminder' },
      'How was Maybe Happy Ending?',
      'rate-maybe-happy-ending-2024-2026-10-21',
    ),
    {
      pathname: '/rate/[showId]',
      params: { showId: 'maybe-happy-ending-2024', showTitle: 'Maybe Happy Ending', suggestedDate: '2026-10-21' },
    },
  );
  // Nothing to recover from: still the rate screen, the screen resolves the rest.
  assert.deepEqual(
    notificationTarget({ showSlug: 'x-2020', type: 'rate-reminder' }, 'Something else', 'other-id'),
    { pathname: '/rate/[showId]', params: { showId: 'x-2020' } },
  );
});

test('the identifier prefix matches the one reminders are scheduled with', () => {
  const src = readFileSync(join(root, 'lib/local-notifications.ts'), 'utf8');
  assert.match(src, new RegExp(`NOTIFICATION_PREFIX = '${RATE_REMINDER_PREFIX}'`));
  assert.match(src, /type: 'rate-reminder', showTitle, date/);
});

test('score pushes still open the show page; screen pushes their screen', () => {
  assert.deepEqual(notificationTarget({ showSlug: 'hamilton-2015' }), { pathname: '/show/[slug]', params: { slug: 'hamilton-2015' } });
  assert.deepEqual(notificationTarget({ screen: '/(tabs)' }), { pathname: '/(tabs)' });
  assert.equal(notificationTarget({ screen: 'https://evil.example' }), null);
  assert.equal(notificationTarget({}), null);
  assert.equal(notificationTarget(undefined), null);
});

test('a tap that cold-launched the app is read back at setup', () => {
  const src = read('lib/notifications.ts');
  const setup = src.slice(src.indexOf('export function setupNotificationHandler'));
  assert.match(setup, /getLastNotificationResponse\(\)/);
  assert.match(setup, /addNotificationResponseReceivedListener\(routeNotificationResponse\)/);
  // The handler must clear what it routed, or every later launch re-opens it.
  assert.match(src, /clearLastNotificationResponse\(\)/);
});

test('the server-sent "How was X?" push routes to the rate screen too', () => {
  const src = readFileSync(join(root, 'scripts/send-notifications.ts'), 'utf8');
  assert.match(src, /data: \{ showSlug: entry\.show_id, type: 'rate-reminder', showTitle: entry\.show_title, date: today \}/);
  // One sent before it carried a type, still in Notification Center.
  assert.deepEqual(
    notificationTarget({ showSlug: 'hamilton-2015' }, 'How was Hamilton?', 'some-expo-push-id'),
    { pathname: '/rate/[showId]', params: { showId: 'hamilton-2015', showTitle: 'Hamilton' } },
  );
  // Score pushes ("Reviews are in", "New score") keep opening the show page.
  assert.equal(notificationTarget({ showSlug: 'hamilton-2015' }, 'Reviews are in for Hamilton').pathname, '/show/[slug]');
});
