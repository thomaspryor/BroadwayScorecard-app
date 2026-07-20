/**
 * Shared date math for schedule-aware UI (planned dates, closing-soon badges).
 * Kept out of components so render functions stay pure for the React Compiler.
 */

/** Whole days from today until a YYYY-MM-DD date (negative if past). */
export function daysUntilDate(dateStr: string): number {
  return Math.ceil(
    (new Date(dateStr + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

/** Current epoch ms — kept here so render-created callbacks stay compiler-pure. */
export function nowMs(): number {
  return Date.now();
}

/** True when a closing date is within the next four weeks (and not already past). */
export function isClosingSoonDate(closingDate: string): boolean {
  const closing = new Date(closingDate);
  const fourWeeks = 28 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return closing.getTime() - now < fourWeeks && closing.getTime() > now;
}
