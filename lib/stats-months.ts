/**
 * Pure month-label formatting for ShowsPerYear's month-mode chart. Extracted
 * out of the .tsx component so it's directly unit-testable (component files
 * with JSX can't be imported by the plain-node test runner).
 */

/** "2025-10" → "October 2025" */
export function formatMonth(key: string): string {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Single-letter labels ("J F M A M J J A S O N D") read ambiguously on the
// axis — two adjacent bars can both read "J" (build-61 sim QA). Three-letter
// abbreviations are unambiguous and still fit the fixed 30px bar slot.
/** "2025-10" → "Oct" */
export function shortMonth(key: string): string {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short' });
}
