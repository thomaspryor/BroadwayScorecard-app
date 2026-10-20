/**
 * Gate for the app/test/* fixture routes. No React Native imports so it runs
 * under `node --test`.
 *
 * The fixtures are E2E scaffolding (fake ratings, a fake import picker), not
 * screens for real users, but expo-router ships every file under app/, so
 * broadwayscorecard:///test/... opens them in the App Store build. They render
 * in development and in CI's Release build (which sets
 * EXPO_PUBLIC_DEV_AUTO_SIGNIN=1 for Maestro, see .maestro/ci-canary-show-rating-fixture.yaml);
 * anywhere else they send the user home.
 *
 * Call it with the literal `process.env.EXPO_PUBLIC_DEV_AUTO_SIGNIN` at the
 * call site: Expo inlines EXPO_PUBLIC_ variables only where they are written
 * out in full, so reading process.env here would always see undefined.
 */
export function fixtureRoutesAllowed(isDev: boolean, e2eFlag: string | undefined): boolean {
  return isDev || e2eFlag === '1';
}
