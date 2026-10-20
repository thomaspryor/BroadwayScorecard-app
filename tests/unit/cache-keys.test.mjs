// Settings → "Clear cache" used AsyncStorage.clear() and restored three keys,
// wiping a signed-out user's saved shows, unsynced edits, the market choice,
// the welcome-seen flag and imported diary titles. lib/cache-keys.ts is now an
// allowlist of re-downloadable data; everything else must survive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheKeysToClear, isClearableCacheKey } from '../../lib/cache-keys.ts';

const MUST_SURVIVE = [
  '@bsc:local_watchlist', // guest saved shows (lib/local-watchlist-store.ts)
  '@bsc:local_watchlist_prompted_at',
  '@bsc:offlineQueue', // edits waiting to sync (lib/offline-queue.ts)
  '@bsc:photoUploadQueue', // photos waiting to upload
  '@bsc:market',
  '@bsc:welcome_seen:user-1',
  '@broadwayScorecard:onboardingSeen',
  '@bsc:pushToken',
  '@bsc:notificationPermissionAsked',
  'diary-show-meta-v2', // imported diary titles (lib/diary-titles.ts)
  'diary-show-titles-v1',
  '@bsc:feature-override',
  '@bsc:pending_action',
  '@bsc:import-checkpoint:user-1',
  '@bsc:diary_view_mode',
  '@bsc:diary_layout',
  '@bsc:photoNudgesDismissed:user-1',
  'store_review_first_launch',
  'store_review_last_prompt',
  'store_review_shows_viewed',
  'bsc_auth', // session (SecureStore today; must never be swept if it moves)
  'some-key-added-next-year',
];

const MUST_CLEAR = [
  'mobile-shows-data',
  'mobile-shows-timestamp',
  'related-picks-data',
  'show-detail-hamilton-2015',
  '@bsc:stats-canon',
  '@bsc:stats-canon-ts',
  '@bsc:stats-reviews',
  '@bsc:stats-reviews-ts',
  '@bsc:reviews:user-1',
  '@bsc:watchlist:user-1',
  '@bsc:lists:user-1',
];

test('user data and settings survive Clear cache', () => {
  for (const key of MUST_SURVIVE) assert.equal(isClearableCacheKey(key), false, `${key} must survive`);
});

test('re-downloadable data is cleared', () => {
  for (const key of MUST_CLEAR) assert.equal(isClearableCacheKey(key), true, `${key} must be cleared`);
});

test('a bare prefix is not a cache key', () => {
  assert.equal(isClearableCacheKey('show-detail-'), false);
  assert.equal(isClearableCacheKey('@bsc:watchlist:'), false);
});

test('cacheKeysToClear picks exactly the cache keys from a mixed list', () => {
  assert.deepEqual(cacheKeysToClear([...MUST_SURVIVE, ...MUST_CLEAR]).sort(), [...MUST_CLEAR].sort());
});

test('no app code wipes all of AsyncStorage', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
        // Comments may mention the old call; only code counts.
        const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/AsyncStorage\.clear\s*\(/.test(code)) offenders.push(path.slice(root.length));
      }
    }
  };
  for (const dir of ['app', 'components', 'lib', 'hooks']) walk(join(root, dir));
  assert.deepEqual(offenders, [], 'use cacheKeysToClear() from lib/cache-keys.ts instead of AsyncStorage.clear()');
});
