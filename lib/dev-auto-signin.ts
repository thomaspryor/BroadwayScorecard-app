/**
 * When the app may sign itself in to the shared dev-test account.
 *
 * Why not just `__DEV__`: the Maestro E2E workflow builds a Release app with
 * xcodebuild (`__DEV__` is false there) and relies on
 * EXPO_PUBLIC_DEV_AUTO_SIGNIN=1 to start signed in. So the gate is the flag,
 * plus two things a production build can never satisfy by accident:
 *  - the password comes from EXPO_PUBLIC_DEV_TEST_PASSWORD at bundle time.
 *    It used to be a string literal in lib/auth-context.tsx (in the
 *    repo, and in any bundle built with the flag set). Production EAS builds
 *    do not set the variable.
 *  - the expo-updates channel is not "production". EAS production (and
 *    sim-prod, which extends it) builds report "production"; the E2E
 *    xcodebuild has no EAS channel, and dev builds use "development". A stray
 *    flag in a production build's environment therefore still does nothing.
 *
 * Pure (no expo imports) for tests/unit.
 */

export interface DevAutoSignInInput {
  /** process.env.EXPO_PUBLIC_DEV_AUTO_SIGNIN */
  flag: string | null | undefined;
  /** process.env.EXPO_PUBLIC_DEV_TEST_PASSWORD */
  password: string | null | undefined;
  /** expo-updates Updates.channel (null/empty when the build has none) */
  channel: string | null | undefined;
}

export type DevAutoSignInBlock = 'flag-off' | 'production-channel' | 'no-password';

/** Why auto sign-in is off, or null when it may run. */
export function devAutoSignInBlock({ flag, password, channel }: DevAutoSignInInput): DevAutoSignInBlock | null {
  if (flag !== '1') return 'flag-off';
  if ((channel ?? '').trim().toLowerCase() === 'production') return 'production-channel';
  if (!password) return 'no-password';
  return null;
}
