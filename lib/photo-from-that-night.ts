/**
 * "From that night" suggestion — queries the on-device photo library for
 * shots taken on `date_seen`, entirely client-side. Nothing here ever
 * touches the network; it only surfaces local asset URIs, which still go
 * through the same EXIF-strip + downscale pipeline before upload.
 *
 * Uses expo-media-library (full-library read) rather than the picker —
 * this is a deliberate, separate permission grant, requested only when the
 * user taps the "From that night" row (never on app launch).
 */

// The package's default export is the newer class-based (Query/Asset/Album)
// API; getAssetsAsync/MediaType/SortBy only exist on the legacy subpath.
import * as MediaLibrary from 'expo-media-library/legacy';

export interface NightPhotoCandidate {
  id: string;
  uri: string;
  width: number;
  height: number;
  creationTime: number;
}

/** Local-time day window in ms for a YYYY-MM-DD date_seen string. */
function dayWindow(dateSeen: string): { start: number; end: number } {
  const [y, m, d] = dateSeen.split('-').map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
}

export async function requestMediaLibraryAccess(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync(/* writeOnly */ false);
  // 'granted' covers both full and limited access — expo-media-library
  // surfaces the finer-grained accessPrivileges separately when needed.
  return status === 'granted';
}

/**
 * Returns photos taken on the calendar day of `dateSeen` (device local time),
 * newest first, capped at `limit`. Returns [] on any permission or query
 * failure rather than throwing — this is a nice-to-have suggestion, not a
 * blocking flow.
 */
export async function findPhotosFromThatNight(
  dateSeen: string,
  limit = 12,
): Promise<NightPhotoCandidate[]> {
  try {
    const { status } = await MediaLibrary.getPermissionsAsync();
    if (status !== 'granted') return [];

    const { start, end } = dayWindow(dateSeen);
    const result = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter: start,
      createdBefore: end,
      sortBy: [MediaLibrary.SortBy.creationTime],
      first: limit,
    });

    return result.assets.map(a => ({
      id: a.id,
      uri: a.uri,
      width: a.width,
      height: a.height,
      creationTime: a.creationTime,
    }));
  } catch {
    return [];
  }
}
