/**
 * Client-side photo pipeline for the diary Feed (task #571).
 *
 * Privacy contract: every photo is downscaled AND re-encoded through
 * expo-image-manipulator before it ever leaves the device or touches
 * an upload queue. ImageManipulator's manipulate→save round trip does
 * not carry EXIF through (there is no "preserve exif" option in its
 * API) — resizing is what strips GPS/camera metadata, not a separate
 * step. Never upload `result.uri` from the picker directly.
 */

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { PHOTO_MAX_DIMENSION } from '@/lib/photo-types';

export interface ProcessedPhoto {
  uri: string; // local file:// URI, EXIF-stripped + downscaled JPEG
  width: number;
  height: number;
}

export type LibraryAccess = 'all' | 'limited' | 'none' | 'undetermined';

/** Maps expo-image-picker's iOS accessPrivileges onto our access enum. */
export async function getLibraryAccess(): Promise<LibraryAccess> {
  const { status, accessPrivileges } = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (status === 'granted') {
    return (accessPrivileges as LibraryAccess) || 'all';
  }
  if (status === 'undetermined') return 'undetermined';
  return 'none';
}

/** Requests library access. Returns the resulting access level. */
export async function requestLibraryAccess(): Promise<LibraryAccess> {
  const { status, accessPrivileges } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return (accessPrivileges as LibraryAccess) || 'all';
  return 'none';
}

/**
 * Opens the native picker for up to `remainingSlots` images and runs each
 * through EXIF-strip + downscale. Returns only successfully processed
 * photos — a manipulation failure on one image doesn't block the rest.
 */
export async function pickAndProcessPhotos(remainingSlots: number): Promise<ProcessedPhoto[]> {
  if (remainingSlots <= 0) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: remainingSlots,
    quality: 1, // full quality out of the picker — manipulator does the real compression
    exif: false, // don't even read EXIF into JS; we never want it
  });

  if (result.canceled || !result.assets?.length) return [];

  const processed: ProcessedPhoto[] = [];
  for (const asset of result.assets) {
    const photo = await processPhotoAsset(asset.uri, asset.width, asset.height).catch(() => null);
    if (photo) processed.push(photo);
  }
  return processed;
}

/**
 * Runs a single local URI through the EXIF-strip + downscale pipeline.
 * Always re-encodes (strips EXIF) even when no resize is needed — pass
 * the original dimensions when known so already-small images aren't
 * upscaled.
 */
export async function processPhotoAsset(
  uri: string,
  originalWidth?: number,
  originalHeight?: number,
): Promise<ProcessedPhoto> {
  const needsResize =
    !originalWidth || !originalHeight ||
    Math.max(originalWidth, originalHeight) > PHOTO_MAX_DIMENSION;

  const actions: ImageManipulator.Action[] = needsResize
    ? [{
        resize: originalWidth && originalHeight && originalWidth < originalHeight
          ? { height: PHOTO_MAX_DIMENSION }
          : { width: PHOTO_MAX_DIMENSION },
      }]
    : [];

  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    actions,
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { uri: manipulated.uri, width: manipulated.width, height: manipulated.height };
}
