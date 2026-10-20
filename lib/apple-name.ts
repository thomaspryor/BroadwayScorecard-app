/**
 * Apple returns the user's name only on the FIRST authorization of the app,
 * on the credential (never inside the identity token), so Supabase never sees
 * it. It was dropped, leaving every Apple account with an empty display name
 * and no second chance to get it. Pure (no expo imports) for tests/unit.
 */

/** The subset of expo-apple-authentication's AppleAuthenticationFullName used here. */
export interface AppleFullName {
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  nickname?: string | null;
}

/** "Given Family", or the nickname, or null when Apple sent nothing. */
export function appleDisplayName(fullName: AppleFullName | null | undefined): string | null {
  if (!fullName) return null;
  const name = [fullName.givenName, fullName.familyName]
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return name || (fullName.nickname ?? '').trim() || null;
}

/** Only ever fill an empty display name; never overwrite one the user has. */
export function shouldFillDisplayName(
  current: string | null | undefined,
  candidate: string | null | undefined,
): candidate is string {
  return !!candidate && !(current ?? '').trim();
}
