/**
 * Tony Awards helpers — shared between show detail, Tony Predictions, etc.
 */

// First Tonys were 1947 (ceremony 1), so year = 1946 + ceremony.
export function ceremonyToYear(ceremony: number): number {
  return 1946 + ceremony;
}
