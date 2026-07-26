/**
 * Module 3 — Broadway theaters (owner priority 2, spec §3.3).
 *
 * Completion ring "N of 42" + the scannable house checklist + house records.
 *
 * Denominator = the currently-operating houses in the vendored
 * theater-houses.json, so 100% stays reachable. Venues that match no operating
 * house (Off-Broadway, West End, regional) are surfaced as "extra credit"
 * rather than dragging the ring down.
 *
 * The checklist is the module people screenshot, so it is a real grid: visited
 * chips are filled brand-gold-at-low-alpha with a visit count, unvisited are
 * outlined. Same gold, two treatments — no second hue (spec §9).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import { STATS_LAYOUT } from '@/lib/stats-layout';
import type { StatsBundle } from '@/hooks/useStatsData';
import type { HouseVisit } from '@/lib/stats';
import {
  ModuleHeader,
  ProgressRing,
  RecordPill,
  StatsCard,
  TABULAR,
  withAlpha,
} from './StatsPrimitives';

/**
 * Short display name for a chip. "Gerald Schoenfeld Theatre" → "Schoenfeld".
 *
 * The grid is only scannable if chips are short and never break mid-word; the
 * full name lives in the accessibility label and the detail sheet.
 *
 * An explicit table beats clever regexes here: the first attempt stripped the
 * " Theatre" suffix before testing a full-name pattern, so the Steinberg house
 * fell through and rendered as "Harold and Miriam St…" in the grid.
 */
const HOUSE_SHORT_NAMES: Record<string, string> = {
  'Harold and Miriam Steinberg Center for Theatre': 'Steinberg',
  'Circle in the Square Theatre': 'Circle Sq',
  'Vivian Beaumont Theater': 'Beaumont',
  'Lunt-Fontanne Theatre': 'Lunt-Font.',
  'New Amsterdam Theatre': 'New Amst.',
  'Winter Garden Theatre': 'Winter Gdn',
  'Al Hirschfeld Theatre': 'Hirschfeld',
  'Stephen Sondheim Theatre': 'Sondheim',
  'Samuel J. Friedman Theatre': 'Friedman',
  'Bernard B. Jacobs Theatre': 'Jacobs',
  'Gerald Schoenfeld Theatre': 'Schoenfeld',
  'James Earl Jones Theatre': 'Jones',
  'Ethel Barrymore Theatre': 'Barrymore',
  'Eugene O’Neill Theatre': 'O’Neill',
  "Eugene O'Neill Theatre": "O'Neill",
  'Helen Hayes Theater': 'Hayes',
  'Walter Kerr Theatre': 'Kerr',
  'Richard Rodgers Theatre': 'Rodgers',
  'Todd Haimes Theatre': 'Haimes',
  'Lena Horne Theatre': 'Horne',
  'August Wilson Theatre': 'A. Wilson',
  'Ambassador Theatre': 'Ambass.',
  'Nederlander Theatre': 'Nederland.',
};

export function houseShortName(name: string): string {
  const mapped = HOUSE_SHORT_NAMES[name];
  if (mapped) return mapped;
  return name
    .replace(/\s+(Theatre|Theater)$/i, '')
    .replace(/^Lincoln Center Theater\s*-\s*/i, '')
    .trim();
}

export interface TheaterTrackerProps {
  bundle: StatsBundle;
  onOpenHouse: (house: HouseVisit) => void;
  onOpenRecord: (kind: 'home' | 'biggest' | 'smallest' | 'oldest') => void;
  onOpenRing: () => void;
  onOpenExtraCredit: () => void;
}

export function TheaterTracker({
  bundle,
  onOpenHouse,
  onOpenRecord,
  onOpenRing,
  onOpenExtraCredit,
}: TheaterTrackerProps) {
  const { theaters } = bundle;
  const marquee = STATS_LAYOUT === 'marquee';
  const { records } = theaters;

  const ring = (
    <Pressable
      testID="stats-theater-ring"
      onPress={() => {
        haptics.tap();
        onOpenRing();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${theaters.visited} of ${theaters.operating} Broadway houses visited. Opens the list.`}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <ProgressRing pct={theaters.completion} size={marquee ? 72 : 104} stroke={marquee ? 7 : 10}>
        <Text style={[styles.ringValue, marquee && styles.ringValueSmall, TABULAR]}>{theaters.visited}</Text>
        <Text style={styles.ringDenom}>of {theaters.operating}</Text>
      </ProgressRing>
    </Pressable>
  );

  return (
    <StatsCard flush={marquee}>
      <ModuleHeader
        title="Broadway theaters"
        caption={`${Math.round(theaters.completion * 100)}% of the operating houses`}
        right={marquee ? ring : undefined}
      />

      {!marquee && (
        <View style={styles.ringRow}>
          {ring}
          <View style={styles.ringCopy}>
            <Text style={styles.ringHeadline}>
              {theaters.operating - theaters.visited === 0
                ? 'Every operating house. Extraordinary.'
                : `${theaters.operating - theaters.visited} houses to go`}
            </Text>
            {theaters.extraCredit.length > 0 && (
              <Pressable
                testID="stats-extra-credit"
                onPress={() => {
                  haptics.tap();
                  onOpenExtraCredit();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.extraCredit}>
                  + {theaters.extraCredit.length} off-Broadway, West End &amp; regional venues
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* The checklist grid */}
      <View style={styles.grid} testID="stats-house-grid">
        {theaters.houses.map((h) => (
          <Pressable
            key={h.name}
            testID={`stats-house-chip${h.visited ? '' : '-unvisited'}`}
            onPress={() => {
              haptics.tap();
              onOpenHouse(h);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              h.visited
                ? `${h.name}. Visited ${h.count} ${h.count === 1 ? 'time' : 'times'}.`
                : `${h.name}. Not yet visited.`
            }
            style={({ pressed }) => [
              styles.chip,
              marquee ? styles.chipDense : styles.chipWide,
              h.visited ? styles.chipVisited : styles.chipUnvisited,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[styles.chipText, h.visited ? styles.chipTextVisited : styles.chipTextUnvisited]}
              numberOfLines={marquee ? 2 : 1}
            >
              {houseShortName(h.name)}
            </Text>
            {h.count > 1 && <Text style={[styles.chipCount, TABULAR]}>{h.count}</Text>}
          </Pressable>
        ))}
      </View>

      <View style={styles.records}>
        {records.homeTheater && (
          <RecordPill
            testID="stats-house-record-home"
            label="Home theater"
            value={`${houseShortName(records.homeTheater.name)} · ${records.homeTheater.count}`}
            onPress={() => onOpenRecord('home')}
          />
        )}
        {records.biggest && (
          <RecordPill
            testID="stats-house-record-biggest"
            label="Biggest house"
            value={`${houseShortName(records.biggest.name)} · ${records.biggest.capacity?.toLocaleString()}`}
            onPress={() => onOpenRecord('biggest')}
          />
        )}
        {records.smallest && (
          <RecordPill
            label="Smallest house"
            value={`${houseShortName(records.smallest.name)} · ${records.smallest.capacity?.toLocaleString()}`}
            onPress={() => onOpenRecord('smallest')}
          />
        )}
        {records.oldest && (
          <RecordPill
            label="Oldest house"
            value={`${houseShortName(records.oldest.name)} · ${records.oldest.yearBuilt}`}
            onPress={() => onOpenRecord('oldest')}
          />
        )}
      </View>
    </StatsCard>
  );
}

const styles = StyleSheet.create({
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginBottom: Spacing.lg },
  ringCopy: { flex: 1, minWidth: 0 },
  ringValue: { color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800' },
  ringValueSmall: { fontSize: FontSize.xl },
  ringDenom: { color: Colors.text.muted, fontSize: FontSize.xs },
  ringHeadline: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '600' },
  extraCredit: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    minHeight: 44,
    borderWidth: 1,
  },
  // Faithful variant: 3-across, readable names.
  chipWide: { flexGrow: 1, flexBasis: '31%', maxWidth: '33%' },
  // Bolder variant: denser 4-across grid, two-line names.
  chipDense: { flexGrow: 1, flexBasis: '23%', maxWidth: '25%' },
  chipVisited: {
    backgroundColor: withAlpha(Colors.brand, 0.18),
    borderColor: withAlpha(Colors.brand, 0.5),
  },
  chipUnvisited: {
    backgroundColor: 'transparent',
    borderColor: Colors.border.default,
  },
  chipText: { fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  chipTextVisited: { color: Colors.text.primary },
  chipTextUnvisited: { color: Colors.text.muted },
  chipCount: { color: Colors.brand, fontSize: FontSize.xs, fontWeight: '700' },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  pressed: { opacity: 0.7 },
});
