/**
 * Poster-corner status chip — 1:1 with the web watchlist card.
 *
 * Web reference (src/app/my-shows/MyShowsClient.tsx, bookabilityLabel + the
 * two <span>s that render it):
 *
 *   className="absolute top-1.5 left-1.5 z-[2] px-1.5 py-0.5
 *              text-[9px] font-bold uppercase rounded"
 *   Closing Soon → bg-amber-500/90  text-black
 *   Closed       → bg-gray-600/90   text-white
 *   Open         → bg-status-open/90 (#10b981) text-black
 *   In Previews  → bg-status-open/90 text-black
 *   Tix on sale  → bg-status-open/90 text-black
 *   Opens <date> → bg-blue-500/80   text-white
 *
 * Owner directive 2026-08-02, restated 2026-08-03: "these look bad on iOS and
 * need to match the web design." Earlier iOS treatments were a wide
 * translucent scrim with colored text (wrapped "NOW PLAYING" over two lines),
 * then a solid chip that kept app-specific one-word labels (OPEN / PREVIEW /
 * CLOSING / ON SALE) because the To Watch grid was 4-up and ~92pt wide.
 * The grid is 3-up now (lib/poster-grid.ts), so the web's own wording fits and
 * there is no reason left to deviate from it.
 *
 * Text stays at the app's 12pt floor rather than the web's 9px — on a phone
 * 9pt is unreadable at arm's length — with adjustsFontSizeToFit absorbing the
 * difference on narrow devices instead of ellipsising the label. NOTE for the
 * font-floor ledger: minimumFontScale 0.8 means the longest label ("Closing
 * Soon") can render at ~9.6pt on a 375pt-wide device. That is deliberate and
 * still no smaller than the web's fixed 9px; scripts/check-font-floor.js only
 * inspects literal fontSize values and cannot see it.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { isClosingSoonDate } from '@/lib/date-utils';
import type { Show } from '@/lib/types';

/** Web tailwind.config.ts `status.*` + the amber/gray/blue utilities used by
 *  the watchlist chip. Alpha suffixes mirror the /90 and /80 opacities. */
export const WEB_STATUS_COLORS = {
  open: 'rgba(16, 185, 129, 0.9)', // status-open #10b981 /90
  closingSoon: 'rgba(245, 158, 11, 0.9)', // amber-500 /90
  closed: 'rgba(107, 114, 128, 0.9)', // gray-600 /90 (web uses gray-600)
  upcoming: 'rgba(59, 130, 246, 0.8)', // blue-500 /80
} as const;

const DARK_TEXT = '#000000';
const LIGHT_TEXT = '#ffffff';

/**
 * Poster-corner status label (web parity: MyShowsClient bookabilityLabel).
 * Closing Soon wins over the raw status; upcoming shows say when they open,
 * or "Tix on sale" once tickets are bookable.
 */
export function statusOverlay(show?: Show): { label: string; color: string; textColor: string } | null {
  if (!show) return null;
  if (show.status === 'closed') {
    return { label: 'Closed', color: WEB_STATUS_COLORS.closed, textColor: LIGHT_TEXT };
  }
  if (show.closingDate && isClosingSoonDate(show.closingDate)) {
    return { label: 'Closing Soon', color: WEB_STATUS_COLORS.closingSoon, textColor: DARK_TEXT };
  }
  if (show.status === 'open') {
    return { label: 'Open', color: WEB_STATUS_COLORS.open, textColor: DARK_TEXT };
  }
  if (show.status === 'previews') {
    return { label: 'In Previews', color: WEB_STATUS_COLORS.open, textColor: DARK_TEXT };
  }
  if (show.status === 'upcoming' || show.status === 'announced') {
    if (show.ticketsOnSale) {
      return { label: 'Tix on sale', color: WEB_STATUS_COLORS.open, textColor: DARK_TEXT };
    }
    if (show.openingDate) {
      const opens = new Date(show.openingDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      return { label: `Opens ${opens}`, color: WEB_STATUS_COLORS.upcoming, textColor: LIGHT_TEXT };
    }
    return { label: 'Not yet open', color: WEB_STATUS_COLORS.upcoming, textColor: LIGHT_TEXT };
  }
  return null;
}

/**
 * @param inline Render in normal flow instead of pinned to a poster corner —
 *   the list-row form, which the web draws as the same chip (`inline-block
 *   mt-1 ...`) rather than as colored text.
 */
export function PosterStatusPill({ show, inline = false }: { show?: Show; inline?: boolean }) {
  const info = statusOverlay(show);
  if (!info) return null;
  return (
    <View style={[inline ? styles.inlinePill : styles.pill, { backgroundColor: info.color }]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.label, { color: info.textColor }]}
      >
        {info.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // top/left 6 = web's top-1.5/left-1.5; px-1.5/py-0.5 = 6/2; rounded = 4.
  pill: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 10,
    maxWidth: '92%',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inlinePill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
});
