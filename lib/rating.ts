/**
 * Shared half-star rating sanitizer — mirrors web project's src/lib/rating.ts.
 * The reviews table has no CHECK on precision, so this is the single place
 * that enforces half-star steps for any flow that writes a rating.
 */
export function sanitizeRating(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return Math.min(5, Math.max(0, Math.round(r * 2) / 2));
}
