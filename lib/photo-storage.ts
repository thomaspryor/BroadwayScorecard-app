/**
 * Supabase Storage access for diary photos (task #571).
 *
 * Hard rule: this bucket is private (`public: false`, see the migration).
 * NEVER call `getPublicUrl()` on it — every read goes through
 * `createSignedUrl()` with a short TTL. Signed URLs are not cached
 * beyond that TTL; callers re-fetch when they expire.
 */

import * as Crypto from 'expo-crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { buildPhotoStoragePath } from '@/lib/photo-path';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/photo-types';
import type { ReviewPhoto } from '@/lib/photo-types';

const BUCKET = 'diary-photos';

export function newPhotoId(): string {
  return Crypto.randomUUID();
}

/** Uploads a local file:// URI to the owner-scoped storage path and returns it. */
export async function uploadPhotoFile(
  userId: string,
  reviewId: string,
  photoId: string,
  localUri: string,
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Not signed in.');

  const path = buildPhotoStoragePath(userId, reviewId, photoId);
  const arrayBuffer = await fetch(localUri).then(res => res.arrayBuffer());

  const { error } = await client.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Inserts the metadata row for an already-uploaded photo. */
export async function insertPhotoRow(row: {
  id: string;
  reviewId: string;
  userId: string;
  storagePath: string;
  width: number;
  height: number;
  takenAt: string | null;
}): Promise<ReviewPhoto> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Not signed in.');

  const { data, error } = await client
    .from('user_review_photos')
    .insert({
      id: row.id,
      review_id: row.reviewId,
      user_id: row.userId,
      storage_path: row.storagePath,
      width: row.width,
      height: row.height,
      taken_at: row.takenAt,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ReviewPhoto;
}

export async function getPhotosForReview(reviewId: string, userId: string): Promise<ReviewPhoto[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('user_review_photos')
    .select('*')
    .eq('review_id', reviewId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as ReviewPhoto[];
}

export async function getAllPhotosForUser(userId: string): Promise<ReviewPhoto[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('user_review_photos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as ReviewPhoto[];
}

/** Batch-resolves signed URLs, short TTL, never persisted beyond this call's caller. */
export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  if (!client || paths.length === 0) return {};

  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  const map: Record<string, string> = {};
  for (const entry of data || []) {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  }
  return map;
}

export async function deletePhoto(photoId: string, storagePath: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Not signed in.');

  const { error: storageError } = await client.storage.from(BUCKET).remove([storagePath]);
  if (storageError) throw storageError;

  const { error: rowError } = await client.from('user_review_photos').delete().eq('id', photoId);
  if (rowError) throw rowError;
}

/** Bulk delete for "Export & delete all photos" — deletes in storage-path batches of 100. */
export async function deleteAllPhotosForUser(userId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Not signed in.');

  const photos = await getAllPhotosForUser(userId);
  if (photos.length === 0) return;

  const BATCH = 100;
  for (let i = 0; i < photos.length; i += BATCH) {
    const batch = photos.slice(i, i + BATCH);
    const { error: storageError } = await client.storage.from(BUCKET).remove(batch.map(p => p.storage_path));
    if (storageError) throw storageError;

    const { error: rowError } = await client
      .from('user_review_photos')
      .delete()
      .in('id', batch.map(p => p.id));
    if (rowError) throw rowError;
  }
}
