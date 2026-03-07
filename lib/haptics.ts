/**
 * Haptic feedback helpers — consistent feel across all interactions.
 *
 * Pattern guide:
 *   tap()       — light tap for buttons, toggles, selections
 *   action()    — medium impact for significant actions (save, delete, share)
 *   selection() — subtle tick for scrubbing through options (star drag, pickers)
 *   success()   — notification for completed actions (saved, signed in)
 *   error()     — notification for failures (save failed, network error)
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const isIOS = Platform.OS === 'ios';

/** Light tap — buttons, toggles, tab switches, list selections */
export function tap() {
  if (isIOS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium impact — save, delete, share, sign-in, significant UI changes */
export function action() {
  if (isIOS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Subtle selection tick — dragging through stars, scrubbing pickers */
export function selection() {
  if (isIOS) Haptics.selectionAsync();
}

/** Success notification — save complete, sign-in success */
export function success() {
  if (isIOS) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Error notification — save failed, network error */
export function error() {
  if (isIOS) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
