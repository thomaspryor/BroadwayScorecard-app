/**
 * The "Version" line in Settings. Pure (no expo imports) so tests/unit can load
 * it; app/settings.tsx reads the native values and passes them in.
 *
 * A bare "1.1.0" could not tell a beta tester's report apart from any other
 * build of the same marketing version, and said nothing about which
 * over-the-air update the phone was running.
 */

export interface VersionInfo {
  /** CFBundleShortVersionString, e.g. "1.1.0". */
  version: string | null | undefined;
  /** CFBundleVersion (EAS build number), e.g. "73". */
  build: string | null | undefined;
  /** expo-updates Updates.updateId; null when running the embedded bundle. */
  updateId?: string | null;
  /** expo-updates Updates.isEmbeddedLaunch. */
  isEmbeddedLaunch?: boolean;
}

/** e.g. "1.1.0 (73)" or "1.1.0 (73) · update 1a2b3c4d". */
export function formatVersionLabel(info: VersionInfo): string {
  const version = (info.version || '').trim() || 'unknown';
  const build = (info.build || '').trim();
  let label = build ? `${version} (${build})` : version;
  const updateId = (info.updateId || '').trim();
  if (updateId && !info.isEmbeddedLaunch) {
    label += ` · update ${updateId.replace(/-/g, '').slice(0, 8)}`;
  }
  return label;
}
