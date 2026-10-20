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

/** True when a closing date is within the next four weeks (today counts as "soon"). */
export function isClosingSoonDate(closingDate: string): boolean {
  // Bare `new Date(dateStr)` parses YYYY-MM-DD as UTC midnight — in ET that
  // rolls a show closing "today" into the past, dropping it off the shelf.
  // Compare local-midnight-to-local-midnight (matches daysUntilDate) so a
  // show closing today is still >= today, not excluded.
  const closing = new Date(closingDate + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const fourWeeks = 28 * 24 * 60 * 60 * 1000;
  return closing.getTime() - now.getTime() < fourWeeks && closing.getTime() >= now.getTime();
}

/**
 * Local-timezone YYYY-MM-DD for a Date. toISOString() is UTC and rolls the
 * date forward for evening picks in US timezones — never use it for date_seen
 * or planned_date persistence.
 */
export function toLocalYMD(d: Date): string {
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - offsetMs).toISOString().split('T')[0];
}

/**
 * Parse a stored calendar date ("YYYY-MM-DD", or a longer ISO string whose
 * first 10 characters are one) as LOCAL NOON. Bare `new Date('2026-03-05')` is
 * UTC midnight, which every US timezone renders as the previous day (and the
 * previous month or year on the 1st). Noon stays on the stored date in every
 * timezone from UTC-12 to UTC+11. Returns null for missing or malformed input.
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const ymd = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
