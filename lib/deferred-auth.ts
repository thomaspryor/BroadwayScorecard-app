/**
 * Deferred auth manager for mobile — handles the "invest then gate" flow.
 *
 * Flow:
 * 1. User taps star rating (not signed in)
 * 2. savePendingAction() stores the rating in AsyncStorage
 * 3. Sign-in sheet opens → user signs in
 * 4. On auth success, consuming component calls getPendingAction()
 * 5. Auto-saves the rating, then clearPendingAction()
 *
 * All methods are async (AsyncStorage is async, unlike web's localStorage).
 * Uses returnRoute instead of returnUrl (expo-router path).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingAction } from './user-types';

const PENDING_ACTION_KEY = '@bsc:pending_action';

/** Save a pending action before showing sign-in sheet */
export async function savePendingAction(action: PendingAction): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
  } catch {
    // AsyncStorage not available
  }
}

/** Retrieve pending action (returns null if expired or missing) */
export async function getPendingAction(): Promise<PendingAction | null> {
  try {
    const stored = await AsyncStorage.getItem(PENDING_ACTION_KEY);
    if (!stored) return null;

    const action = JSON.parse(stored) as PendingAction;

    // Expire after 1 hour
    if (Date.now() - action.timestamp > 60 * 60 * 1000) {
      await clearPendingAction();
      return null;
    }

    return action;
  } catch {
    return null;
  }
}

/** Clear pending action after it's been executed */
export async function clearPendingAction(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_ACTION_KEY);
  } catch {
    // AsyncStorage not available
  }
}
