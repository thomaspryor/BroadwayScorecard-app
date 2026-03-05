/**
 * Feature flags for the mobile app.
 *
 * Reads from Constants.expoConfig.extra.features (baked into binary),
 * with AsyncStorage override so EAS Update can toggle features without
 * requiring a new build.
 */

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OVERRIDE_KEY = '@bsc:feature-override';

// Baked-in flags from app.json extra.features (comma-separated string)
const bakedFlags = (Constants.expoConfig?.extra?.features as string) || '';

/** Parse comma-separated feature string into a Set */
function parseFlags(str: string): Set<string> {
  return new Set(
    str
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
}

let overrideFlags: Set<string> | null = null;
let overrideLoaded = false;

/** Load override flags from AsyncStorage (call once at app start) */
export async function loadFeatureFlagOverrides(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(OVERRIDE_KEY);
    if (stored !== null) {
      overrideFlags = parseFlags(stored);
    }
    overrideLoaded = true;
  } catch {
    overrideLoaded = true;
  }
}

/** Check if a feature is enabled */
export function isFeatureEnabled(flag: string): boolean {
  // Override takes precedence if loaded
  if (overrideLoaded && overrideFlags !== null) {
    return overrideFlags.has(flag);
  }
  // Fall back to baked-in flags
  return parseFlags(bakedFlags).has(flag);
}

/** Set override flags (for remote config or dev settings) */
export async function setFeatureFlagOverride(flags: string): Promise<void> {
  await AsyncStorage.setItem(OVERRIDE_KEY, flags);
  overrideFlags = parseFlags(flags);
  overrideLoaded = true;
}

/** Clear override (revert to baked-in flags) */
export async function clearFeatureFlagOverride(): Promise<void> {
  await AsyncStorage.removeItem(OVERRIDE_KEY);
  overrideFlags = null;
}

/** Convenience: check userAccounts flag */
export const featureFlags = {
  get userAccounts(): boolean {
    return isFeatureEnabled('userAccounts');
  },
};
