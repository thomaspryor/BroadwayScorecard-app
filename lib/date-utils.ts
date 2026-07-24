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

/**
 * Local-timezone YYYY-MM-DD for a Date. toISOString() is UTC and rolls the
 * date forward for evening picks in US timezones — never use it for date_seen
 * or planned_date persistence.
 */
export function toLocalYMD(d: Date): string {
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - offsetMs).toISOString().split('T')[0];
}
