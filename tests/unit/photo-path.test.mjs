// Tests the REAL lib/photo-path.ts module (node --experimental-strip-types
// --test tests/unit/photo-path.test.mjs). This path shape is exactly what
// the storage.objects RLS policy checks — see
// supabase/migrations/20260727120000_user_review_photos.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhotoStoragePath, ownerFromPhotoStoragePath } from '../../lib/photo-path.ts';

test('buildPhotoStoragePath: first segment is the owner user id', () => {
  const path = buildPhotoStoragePath('user-123', 'review-456', 'photo-789');
  assert.equal(path, 'user-123/review-456/photo-789.jpg');
  assert.equal(path.split('/')[0], 'user-123');
});

test('buildPhotoStoragePath: throws on missing arguments (fail closed, never a partial path)', () => {
  assert.throws(() => buildPhotoStoragePath('', 'review-456', 'photo-789'));
  assert.throws(() => buildPhotoStoragePath('user-123', '', 'photo-789'));
  assert.throws(() => buildPhotoStoragePath('user-123', 'review-456', ''));
});

test('ownerFromPhotoStoragePath: round-trips with buildPhotoStoragePath', () => {
  const path = buildPhotoStoragePath('user-abc', 'review-def', 'photo-ghi');
  assert.equal(ownerFromPhotoStoragePath(path), 'user-abc');
});

test('ownerFromPhotoStoragePath: empty string yields null, not a false-match', () => {
  assert.equal(ownerFromPhotoStoragePath(''), null);
});
