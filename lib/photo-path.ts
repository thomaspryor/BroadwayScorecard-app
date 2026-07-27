/**
 * Storage path builder for diary photos.
 *
 * Pure function, no I/O — extracted so the RLS-matching convention
 * (first path segment === owner's auth.uid()) can be unit-tested
 * without a Supabase client. See supabase/migrations/20260727120000_user_review_photos.sql
 * for the policy that depends on this exact shape.
 */

export function buildPhotoStoragePath(userId: string, reviewId: string, photoId: string): string {
  if (!userId || !reviewId || !photoId) {
    throw new Error('buildPhotoStoragePath requires userId, reviewId, and photoId');
  }
  return `${userId}/${reviewId}/${photoId}.jpg`;
}

/** Extract the owning user id from a storage path (first path segment). */
export function ownerFromPhotoStoragePath(path: string): string | null {
  const first = path.split('/')[0];
  return first || null;
}
