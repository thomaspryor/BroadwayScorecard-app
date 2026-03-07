/**
 * User data cache utilities.
 *
 * Manages AsyncStorage cache for reviews and watchlist data.
 * Called on sign-out to clean up user data while preserving show data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const REVIEWS_KEY = (userId: string) => `@bsc:reviews:${userId}`;
const WATCHLIST_KEY = (userId: string) => `@bsc:watchlist:${userId}`;
const LISTS_KEY = (userId: string) => `@bsc:lists:${userId}`;
const PENDING_ACTION_KEY = '@bsc:pending_action';

/** Clear all cached user data (reviews, watchlist, pending actions) */
export async function clearUserCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      REVIEWS_KEY(userId),
      WATCHLIST_KEY(userId),
      LISTS_KEY(userId),
      PENDING_ACTION_KEY,
    ]);
  } catch {
    // Best effort
  }
}

/** Get cached reviews for a user */
export async function getUserReviewsCache(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(REVIEWS_KEY(userId));
}

/** Set cached reviews for a user */
export async function setUserReviewsCache(userId: string, data: string): Promise<void> {
  await AsyncStorage.setItem(REVIEWS_KEY(userId), data);
}

/** Get cached watchlist for a user */
export async function getUserWatchlistCache(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(WATCHLIST_KEY(userId));
}

/** Set cached watchlist for a user */
export async function setUserWatchlistCache(userId: string, data: string): Promise<void> {
  await AsyncStorage.setItem(WATCHLIST_KEY(userId), data);
}

/** Get cached lists for a user */
export async function getUserListsCache(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(LISTS_KEY(userId));
}

/** Set cached lists for a user */
export async function setUserListsCache(userId: string, data: string): Promise<void> {
  await AsyncStorage.setItem(LISTS_KEY(userId), data);
}
