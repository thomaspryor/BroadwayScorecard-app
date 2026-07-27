/**
 * "Export & delete all photos" — user-initiated bulk export via the native
 * share sheet, then a bulk delete. No server-side privileged path: every
 * step runs as the signed-in user through anon-key + RLS, same as normal
 * reads/writes (RLS already scopes storage.objects + user_review_photos to
 * auth.uid(), so there's no need for a service-role Edge Function here).
 */

// The default export dropped cacheDirectory/downloadAsync for a new
// File/Directory API; the legacy subpath keeps the shape this module uses.
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { getAllPhotosForUser, getSignedUrls, deletePhoto } from '@/lib/photo-storage';

export interface ExportResult {
  exportedCount: number;
  deletedCount: number;
  /** True if every photo was exported+deleted. False means some remain — retry to finish. */
  complete: boolean;
}

const EXPORT_ALBUM = 'Broadway Scorecard Export';

/**
 * Exports and deletes photos ONE AT A TIME, atomically: sign → download →
 * save to Camera Roll → delete that single photo's row+storage object —
 * before moving to the next. This is deliberately not "sign all up front,
 * download all, then bulk-delete": with 100+ photos the batch signed URLs
 * (5 min TTL) would expire mid-download, `downloadAsync`/`createAssetAsync`
 * fail silently on the expired ones, yet a bulk delete afterward would still
 * wipe every row — silently losing whichever photos didn't make it in time
 * (security review finding, 2026-07-27). Per-photo atomicity means a photo
 * is deleted if and only if it was actually saved; anything that fails is
 * left untouched for the next attempt.
 */
export async function exportAndDeleteAllPhotos(userId: string): Promise<ExportResult> {
  const photos = await getAllPhotosForUser(userId);
  if (photos.length === 0) {
    return { exportedCount: 0, deletedCount: 0, complete: true };
  }

  const { status } = await MediaLibrary.requestPermissionsAsync(/* writeOnly */ true);
  if (status !== 'granted') {
    throw new Error('Photo library access is needed to export your photos.');
  }

  const dir = `${FileSystem.cacheDirectory}diary-photo-export-${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  let album = await MediaLibrary.getAlbumAsync(EXPORT_ALBUM);
  let processed = 0;

  for (const photo of photos) {
    const urls = await getSignedUrls([photo.storage_path]);
    const url = urls[photo.storage_path];
    if (!url) continue; // signing failed for this one — leave it for retry, don't delete

    const filename = photo.storage_path.split('/').pop() || `${photo.id}.jpg`;
    const dest = `${dir}${filename}`;
    const result = await FileSystem.downloadAsync(url, dest).catch(() => null);
    if (!result) continue;

    const asset = await MediaLibrary.createAssetAsync(result.uri).catch(() => null);
    if (!asset) continue;

    if (album) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } else {
      album = await MediaLibrary.createAlbumAsync(EXPORT_ALBUM, asset, false);
    }

    // Only delete after this specific photo is confirmed saved to the album.
    await deletePhoto(photo.id, photo.storage_path);
    processed++;
  }

  return { exportedCount: processed, deletedCount: processed, complete: processed === photos.length };
}
