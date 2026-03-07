/**
 * App Store rating prompt — triggered after meaningful engagement.
 *
 * Uses expo-store-review which calls Apple's SKStoreReviewController.
 * Apple controls when the dialog actually appears (max 3x per 365 days).
 * We just need to call it at the right moments.
 *
 * Trigger conditions (ALL must be true):
 * 1. User has viewed 5+ different show detail pages
 * 2. At least 3 days since first app launch
 * 3. Haven't requested a review in the last 90 days
 * 4. App Store review is available on this device
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

let StoreReview: typeof import('expo-store-review') | null = null;
try {
  StoreReview = require('expo-store-review');
} catch {
  // Not available in dev client / Expo Go
}

const KEYS = {
  firstLaunch: 'store_review_first_launch',
  lastPrompt: 'store_review_last_prompt',
  showsViewed: 'store_review_shows_viewed',
} as const;

const MIN_SHOWS_VIEWED = 5;
const MIN_DAYS_SINCE_INSTALL = 3;
const MIN_DAYS_BETWEEN_PROMPTS = 90;

/** Call on every show detail view. Triggers review prompt when conditions are met. */
export async function recordShowView(showId: string) {
  try {
    // Record first launch if not set
    const firstLaunch = await AsyncStorage.getItem(KEYS.firstLaunch);
    if (!firstLaunch) {
      await AsyncStorage.setItem(KEYS.firstLaunch, new Date().toISOString());
      return; // Too early on first launch
    }

    // Track unique shows viewed
    const raw = await AsyncStorage.getItem(KEYS.showsViewed);
    const viewed: string[] = raw ? JSON.parse(raw) : [];
    if (!viewed.includes(showId)) {
      viewed.push(showId);
      await AsyncStorage.setItem(KEYS.showsViewed, JSON.stringify(viewed));
    }

    // Check all conditions
    if (viewed.length < MIN_SHOWS_VIEWED) return;

    const daysSinceInstall = daysBetween(new Date(firstLaunch), new Date());
    if (daysSinceInstall < MIN_DAYS_SINCE_INSTALL) return;

    const lastPrompt = await AsyncStorage.getItem(KEYS.lastPrompt);
    if (lastPrompt) {
      const daysSincePrompt = daysBetween(new Date(lastPrompt), new Date());
      if (daysSincePrompt < MIN_DAYS_BETWEEN_PROMPTS) return;
    }

    // All conditions met — request review
    await requestReview();
  } catch {
    // Silent fail — never crash for analytics
  }
}

/** Call after a user rates a show — positive engagement moment */
export async function recordRatingGiven() {
  try {
    const firstLaunch = await AsyncStorage.getItem(KEYS.firstLaunch);
    if (!firstLaunch) return;

    const daysSinceInstall = daysBetween(new Date(firstLaunch), new Date());
    if (daysSinceInstall < MIN_DAYS_SINCE_INSTALL) return;

    const lastPrompt = await AsyncStorage.getItem(KEYS.lastPrompt);
    if (lastPrompt) {
      const daysSincePrompt = daysBetween(new Date(lastPrompt), new Date());
      if (daysSincePrompt < MIN_DAYS_BETWEEN_PROMPTS) return;
    }

    // User just had a positive experience (rated a show) — good time to ask
    await requestReview();
  } catch {
    // Silent fail
  }
}

async function requestReview() {
  if (!StoreReview) return;

  const isAvailable = await StoreReview.isAvailableAsync();
  if (!isAvailable) return;

  await StoreReview.requestReview();
  await AsyncStorage.setItem(KEYS.lastPrompt, new Date().toISOString());

  if (__DEV__) console.log('[StoreReview] Review prompt requested');
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
