/**
 * Run-length and closing lines on show cards ("2 years on Broadway",
 * "Closes Mar 2027"). Pure: no React Native imports, so
 * tests/unit/run-info.test.mjs can load it under plain node.
 */

import { parseLocalDate, toLocalYMD } from './date-utils';
import { getUkRegionalVenueCity } from './uk-regional-venues';

/**
 * Market suffix for a run-length line. Port of the website's
 * getDurationSuffix (src/lib/date-utils.ts): a regional tryout is never
 * "on Broadway", a UK regional house names its city, and both London markets
 * say "in London".
 */
export function getDurationSuffix(category?: string | null, venue?: string | null): string {
  if (category === 'west-end' || category === 'off-west-end') return 'in London';
  if (category === 'off-broadway') return 'Off-Broadway';
  if (category === 'regional') {
    const ukCity = getUkRegionalVenueCity(category, venue);
    return ukCity ? `in ${ukCity}` : 'in tryout';
  }
  if (category === 'tour') return 'on tour';
  return 'on Broadway';
}

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

/** "1 year, 3 mo on Broadway" for an open show; null otherwise. */
export function getRunDuration(
  openingDate: string | null,
  status: string,
  category: string,
  venue?: string | null,
  now: Date = new Date(),
): string | null {
  if (status !== 'open') return null;
  const open = parseLocalDate(openingDate);
  if (!open) return null;

  const suffix = getDurationSuffix(category, venue);
  const totalMonths = Math.max(1, Math.round((now.getTime() - open.getTime()) / MS_PER_MONTH));
  if (totalMonths >= 24) {
    const years = Math.floor(totalMonths / 12);
    return `${years} years ${suffix}`;
  }
  if (totalMonths >= 12) {
    const years = Math.floor(totalMonths / 12);
    const rem = totalMonths % 12;
    return rem > 0 ? `${years} year${years > 1 ? 's' : ''}, ${rem} mo ${suffix}` : `${years} year ${suffix}`;
  }
  return `${totalMonths} mo ${suffix}`;
}

/** "Closed Jan 2026" / "Closes Mar 2027"; null when there is nothing to say. */
export function getClosingInfo(
  closingDate: string | null,
  status: string,
  now: Date = new Date(),
): string | null {
  const close = parseLocalDate(closingDate);
  if (!close) return null;
  const fmt = close.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  if (status === 'closed') return `Closed ${fmt}`;
  // A future (or today's) closing date on a running or upcoming show. Compare
  // calendar days, so a show closing today still reads "Closes".
  if ((closingDate as string).slice(0, 10) >= toLocalYMD(now)) return `Closes ${fmt}`;
  return null;
}
