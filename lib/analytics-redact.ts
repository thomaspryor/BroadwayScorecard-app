/**
 * Free text the user typed (search queries, list names) never goes to
 * analytics; only its length does. Queries and list names can carry names,
 * places and other personal details, and the App Store privacy answers say
 * search history is not collected. Pure (no expo imports) for tests/unit.
 */

/** Coarse length bucket, enough to tell one-letter searches from full titles. */
export function textLengthBucket(length: number): string {
  if (!Number.isFinite(length) || length <= 0) return '0';
  if (length <= 2) return '1-2';
  if (length <= 5) return '3-5';
  if (length <= 10) return '6-10';
  if (length <= 20) return '11-20';
  return '21+';
}

/** `{ <prefix>_length, <prefix>_length_bucket }` for a piece of user text. */
export function textLengthProps(prefix: string, text: string | null | undefined): Record<string, number | string> {
  const length = (text ?? '').trim().length;
  return {
    [`${prefix}_length`]: length,
    [`${prefix}_length_bucket`]: textLengthBucket(length),
  };
}
