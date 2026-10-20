/**
 * Month and day-cell data for the Watched tab's calendar view
 * (components/user/DiaryCalendarView.tsx). No React Native imports so it runs
 * under `node --test`.
 *
 * Two things this fixes:
 * - The month walk stopped after 36 months, so a diary imported from
 *   Mezzanine or Show Score with older viewings silently lost them. Now the
 *   newest 36 months are drawn back to back and, past that, every month that
 *   has an entry still gets its grid (empty older months are skipped, so a
 *   long diary is not hundreds of blank grids).
 * - One entry per day: a matinee + evening double, or two nights booked on
 *   the same date, showed only the first. Days now keep every entry.
 */

/** Months drawn back to back from the newest entry before only months with
 *  entries are kept. */
export const MAX_CONTINUOUS_MONTHS = 36;

export interface CalendarMonth { year: number; month: number }

export interface DatedReview { show_id: string; date_seen: string | null }

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Every review per exact date (YYYY-MM-DD), in input order. */
export function buildReviewsByDate<T extends DatedReview>(reviews: readonly T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of reviews) {
    if (!r.date_seen || !YMD.test(r.date_seen)) continue;
    (map[r.date_seen] ||= []).push(r);
  }
  return map;
}

/** Booked-but-unseen nights per date. The same show twice on one date (a
 *  planned watchlist date plus a future-dated review) is drawn once. */
export function buildUpcomingByDate(
  items: readonly { show_id: string; date: string | null }[],
): Record<string, { show_id: string }[]> {
  const map: Record<string, { show_id: string }[]> = {};
  for (const item of items) {
    if (!item.date || !YMD.test(item.date)) continue;
    const day = (map[item.date] ||= []);
    if (!day.some((d) => d.show_id === item.show_id)) day.push({ show_id: item.show_id });
  }
  return map;
}

function monthIndex(y: number, m: number): number {
  return y * 12 + m;
}

function parseMonth(date: string): number | null {
  const m = YMD.exec(date);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return monthIndex(Number(m[1]), month);
}

/**
 * Newest-first months for the calendar. Starts at the newest thing on it (the
 * latest review or the furthest-out booking) and runs back to the oldest
 * review: the first MAX_CONTINUOUS_MONTHS months in full, then only months
 * that have an entry, so no viewing is ever left off.
 */
export function buildDiaryCalendarMonths(
  reviewsByDate: Record<string, readonly unknown[]>,
  upcomingByDate: Record<string, readonly unknown[]> = {},
  today: Date = new Date(),
  maxContinuous: number = MAX_CONTINUOUS_MONTHS,
): CalendarMonth[] {
  const reviewMonths = new Set<number>();
  for (const d of Object.keys(reviewsByDate)) {
    const idx = parseMonth(d);
    if (idx != null && reviewsByDate[d].length > 0) reviewMonths.add(idx);
  }
  const entryMonths = new Set(reviewMonths);
  for (const d of Object.keys(upcomingByDate)) {
    const idx = parseMonth(d);
    if (idx != null && upcomingByDate[d].length > 0) entryMonths.add(idx);
  }

  const todayIdx = monthIndex(today.getFullYear(), today.getMonth());
  const newest = entryMonths.size > 0 ? Math.max(...entryMonths) : todayIdx;
  // Bookings only: run from the furthest booking back to this month.
  const oldest = reviewMonths.size > 0 ? Math.min(...reviewMonths) : Math.min(todayIdx, newest);

  const out: CalendarMonth[] = [];
  const push = (idx: number) => out.push({ year: Math.floor(idx / 12), month: idx % 12 });
  const continuousEnd = Math.max(oldest, newest - maxContinuous + 1);
  for (let idx = newest; idx >= continuousEnd; idx--) push(idx);
  const older = [...entryMonths].filter((idx) => idx < continuousEnd).sort((a, b) => b - a);
  for (const idx of older) push(idx);
  return out;
}

export interface CalendarCell {
  day: number;
  dateStr: string;
  /** Shows on this day, attended first; empty for a blank day. */
  showIds: string[];
  /** True when the day only has bookings (drawn dimmed with a ring). */
  upcoming: boolean;
}

/** Day cells for one month, with null padding before the 1st. */
export function buildMonthCells(
  year: number,
  month: number,
  reviewsByDate: Record<string, readonly DatedReview[]>,
  upcomingByDate: Record<string, readonly { show_id: string }[]> = {},
): (CalendarCell | null)[] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out: (CalendarCell | null)[] = [];
  for (let i = 0; i < startWeekday; i++) out.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const seen = reviewsByDate[dateStr] ?? [];
    const booked = seen.length > 0 ? [] : (upcomingByDate[dateStr] ?? []);
    const showIds = (seen.length > 0 ? seen : booked).map((e) => e.show_id);
    out.push({ day, dateStr, showIds, upcoming: seen.length === 0 && booked.length > 0 });
  }
  return out;
}
