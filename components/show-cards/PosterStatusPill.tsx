/**
 * Poster-corner status chip — web parity.
 *
 * Owner directive 2026-08-02 (reference:
 * ~/Documents/claude-outputs/tag-style-reference/web-tags-GOOD.png): match the
 * web chip exactly — compact single-line pill in the poster's top-left corner,
 * solid status-colored background with dark text, tight padding, rounded
 * corners. The previous iOS treatment was colored text on a wide translucent
 * black scrim, which wrapped "NOW PLAYING" onto two lines and spanned most of
 * the poster.
 *
 * Color mapping is the web's, not the app's: green for OPEN / IN PREVIEWS /
 * TIX ON SALE, amber for CLOSING SOON, gray for CLOSED. Label is "OPEN" (web's
 * word), not "NOW PLAYING" — two words cannot fit one line in a 23%-width grid
 * cell at the 12pt font floor.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getStatusInfo, getContrastTextColor } from '@/lib/score-utils';
import { isClosingSoonDate } from '@/lib/date-utils';
import type { Show } from '@/lib/types';

export const WEB_STATUS_COLORS = {
  open: '#22c55e',
  closingSoon: '#f59e0b',
  closed: '#6b7280',
} as const;

/**
 * Poster-corner status label (web parity: WatchlistCard bookabilityLabel).
 * Closing Soon wins over the raw status; upcoming shows say when they open,
 * or "Tix on sale" once tickets are bookable.
 */
export function statusOverlay(show?: Show): { label: string; color: string } | null {
  if (!show) return null;
  if (show.status === 'closed') return { label: 'CLOSED', color: WEB_STATUS_COLORS.closed };
  if (show.closingDate && isClosingSoonDate(show.closingDate)) {
    return { label: 'CLOSING SOON', color: WEB_STATUS_COLORS.closingSoon };
  }
  if (show.status === 'open') return { label: 'OPEN', color: WEB_STATUS_COLORS.open };
  if (show.status === 'previews') return { label: 'IN PREVIEWS', color: WEB_STATUS_COLORS.open };
  if (show.status === 'upcoming' || show.status === 'announced') {
    if (show.ticketsOnSale) return { label: 'TIX ON SALE', color: WEB_STATUS_COLORS.open };
    if (show.openingDate) {
      const opens = new Date(show.openingDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      return { label: `OPENS ${opens.toUpperCase()}`, color: getStatusInfo('upcoming').color };
    }
    return getStatusInfo('upcoming');
  }
  return null;
}

export function PosterStatusPill({ show }: { show?: Show }) {
  const info = statusOverlay(show);
  if (!info) return null;
  return (
    <View style={[styles.pill, { backgroundColor: info.color }]}>
      <Text numberOfLines={1} style={[styles.label, { color: getContrastTextColor(info.color) }]}>
        {info.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // maxWidth keeps a long label inside the poster rather than letting the pill
  // stretch to the card edge and wrap (the pre-2026-08-02 scrim behaviour).
  pill: {
    position: 'absolute',
    top: 4,
    left: 4,
    zIndex: 10,
    maxWidth: '92%',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
});
