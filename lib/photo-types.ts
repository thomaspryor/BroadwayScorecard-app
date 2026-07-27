/** Types for the private diary photo Feed (task #571). */

export interface ReviewPhoto {
  id: string;
  review_id: string;
  user_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  created_at: string;
}

export type PhotoUploadStatus = 'queued' | 'uploading' | 'failed' | 'done';

/** A photo pending upload — local URI until `status === 'done'`. */
export interface QueuedPhotoUpload {
  id: string; // matches the eventual ReviewPhoto.id (generated client-side)
  reviewId: string;
  userId: string;
  localUri: string; // file:// URI after EXIF-strip + downscale, pre-upload
  width: number;
  height: number;
  takenAt: string | null;
  status: PhotoUploadStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export const MAX_PHOTOS_PER_REVIEW = 6;
export const PHOTO_MAX_DIMENSION = 2048;
export const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — short-lived, never cached long-term
