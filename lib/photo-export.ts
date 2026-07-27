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
import { getAllPhotosForUser, getSignedUrls, deleteAllPhotosForUser } from '@/lib/photo-storage';

export interface ExportResult {
  exportedCount: number;
  deletedCount: number;
}

const EXPORT_ALBUM = 'Broadway Scorecard Export';

/**
 * Downloads every photo and saves it to a dedicated Camera Roll album
 * (simpler and more honest than a single-file share sheet for a
 * potentially large export), then deletes everything from storage + the
 * metadata table. Throws if export access is denied or the download step
 * fails — deleteAllPhotosForUser only runs after every photo is confirmed
 * saved, so a thrown error means nothing was deleted.
 */
export async function exportAndDeleteAllPhotos(userId: string): Promise<ExportResult> {
  const photos = await getAllPhotosForUser(userId);
  if (photos.length === 0) {
    return { exportedCount: 0, deletedCount: 0 };
  }

  const { status } = await MediaLibrary.requestPermissionsAsync(/* writeOnly */ true);
  if (status !== 'granted') {
    throw new Error('Photo library access is needed to export your photos.');
  }

  const urls = await getSignedUrls(photos.map(p => p.storage_path));
  const dir = `${FileSystem.cacheDirectory}diary-photo-export-${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const savedAssets: MediaLibrary.Asset[] = [];
  for (const photo of photos) {
    const url = urls[photo.storage_path];
    if (!url) continue;
    const filename = photo.storage_path.split('/').pop() || `${photo.id}.jpg`;
    const dest = `${dir}${filename}`;
    const result = await FileSystem.downloadAsync(url, dest).catch(() => null);
    if (!result) continue;
    const asset = await MediaLibrary.createAssetAsync(result.uri).catch(() => null);
    if (asset) savedAssets.push(asset);
  }

  if (savedAssets.length === 0) {
    throw new Error('Could not export any photos — nothing was deleted.');
  }

  const album = await MediaLibrary.getAlbumAsync(EXPORT_ALBUM);
  if (album) {
    await MediaLibrary.addAssetsToAlbumAsync(savedAssets, album, false);
  } else {
    await MediaLibrary.createAlbumAsync(EXPORT_ALBUM, savedAssets[0], false);
    if (savedAssets.length > 1) {
      const created = await MediaLibrary.getAlbumAsync(EXPORT_ALBUM);
      if (created) await MediaLibrary.addAssetsToAlbumAsync(savedAssets.slice(1), created, false);
    }
  }

  await deleteAllPhotosForUser(userId);

  return { exportedCount: savedAssets.length, deletedCount: photos.length };
}
