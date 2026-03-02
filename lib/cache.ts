/**
 * Cache layer using AsyncStorage for <1MB show data.
 *
 * Stores the raw JSON string and a timestamp.
 * TTL is 1 hour — after that, data is considered stale
 * and will be refreshed on next foreground.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'mobile-shows-data';
const TIMESTAMP_KEY = 'mobile-shows-timestamp';
const TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getCachedData(): Promise<string | null> {
  return AsyncStorage.getItem(CACHE_KEY);
}

export async function setCachedData(data: string): Promise<void> {
  await AsyncStorage.multiSet([
    [CACHE_KEY, data],
    [TIMESTAMP_KEY, Date.now().toString()],
  ]);
}

export async function isCacheStale(): Promise<boolean> {
  const timestamp = await AsyncStorage.getItem(TIMESTAMP_KEY);
  if (!timestamp) return true;
  return Date.now() - parseInt(timestamp, 10) > TTL_MS;
}

export async function getLastFetched(): Promise<Date | null> {
  const timestamp = await AsyncStorage.getItem(TIMESTAMP_KEY);
  if (!timestamp) return null;
  return new Date(parseInt(timestamp, 10));
}
