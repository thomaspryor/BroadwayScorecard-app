/**
 * To Watch tab — watchlist of shows to see.
 *
 * Hero stat strip (Saved / Booked / Closing soon) + inline search pill.
 * Upcoming section: horizontal scroll row of poster cards with date pills.
 * Watchlist: 3-col grid of poster tiles, red "Closes" badge if at risk.
 * List view alternative for compact scanning. Date picker for planned dates.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useShows } from '@/lib/data-context';
import { getImageUrl } from '@/lib/images';
import { featureFlags } from '@/lib/feature-flags';
import type { WatchlistEntry } from '@/lib/user-types';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';
import { ShowSearchModal } from '@/components/ShowSearchModal';
import { StatHero } from '@/components/my-shows/StatHero';
import { UpcomingPoster } from '@/components/my-shows/UpcomingPoster';
import { WatchlistGridPoster } from '@/components/my-shows/WatchlistGridPoster';
import { isClosingWithinDays } from '@/lib/show-utils';
import * as haptics from '@/lib/haptics';

type WatchlistSort = 'added-desc' | 'alphabetical' | 'closing-soon';

const GRID_COLS = 3;
const GRID_GAP = Spacing.xs;

function EmptyState({ emoji, title, subtitle, actionLabel, onAction }: {
  emoji: string; title: string; subtitle: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <Pressable style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]} onPress={onAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function ToWatchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { user, isAuthenticated, loading: authLoading, showSignIn } = useAuth();
  const { reviews, getAllReviews } = useUserReviews(user?.id || null);
  const { watchlist, getWatchlist, addToWatchlist, removeFromWatchlist, updatePlannedDate, loading: watchlistLoading } = useWatchlist(user?.id || null);
  const { shows } = useShows();

  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>('added-desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [datePickingShowId, setDatePickingShowId] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<Date>(new Date());
  const [showSearchModal, setShowSearchModal] = useState(false);

  const showMap = useMemo(() => {
    const map: Record<string, Show> = {};
    for (const s of shows) map[s.id] = s;
    return map;
  }, [shows]);

  useEffect(() => {
    if (isAuthenticated && user) {
      getWatchlist();
      getAllReviews();
    }
  }, [isAuthenticated, user, getWatchlist, getAllReviews]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && user) {
        getWatchlist();
        getAllReviews();
      }
    }, [isAuthenticated, user, getWatchlist, getAllReviews]),
  );

  const loading = authLoading || watchlistLoading;
  const today = new Date().toISOString().split('T')[0];
  const reviewedShowIds = useMemo(() => new Set(reviews.map(r => r.show_id)), [reviews]);

  const { upcomingWatchlist, regularWatchlist } = useMemo(() => {
    const upcoming: WatchlistEntry[] = [];
    const regular: WatchlistEntry[] = [];
    for (const w of watchlist) {
      if (w.planned_date && w.planned_date < today && !reviewedShowIds.has(w.show_id)) {
        continue; // "to be rated" — handled by Watched tab
      } else if (w.planned_date && w.planned_date >= today) {
        upcoming.push(w);
      } else {
        regular.push(w);
      }
    }
    upcoming.sort((a, b) => (a.planned_date || '').localeCompare(b.planned_date || ''));
    return { upcomingWatchlist: upcoming, regularWatchlist: regular };
  }, [watchlist, today, reviewedShowIds]);

  const sortedWatchlist = useMemo(() => {
    const sorted = [...regularWatchlist];
    switch (watchlistSort) {
      case 'added-desc':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'alphabetical':
        return sorted.sort((a, b) => {
          const titleA = showMap[a.show_id]?.title || '';
          const titleB = showMap[b.show_id]?.title || '';
          return titleA.localeCompare(titleB);
        });
      case 'closing-soon':
        return sorted.sort((a, b) => {
          const closingA = showMap[a.show_id]?.closingDate || '9999-12-31';
          const closingB = showMap[b.show_id]?.closingDate || '9999-12-31';
          return closingA.localeCompare(closingB);
        });
      default:
        return sorted;
    }
  }, [regularWatchlist, watchlistSort, showMap]);

  // Hero stats
  const heroItems = useMemo(() => {
    const total = upcomingWatchlist.length + regularWatchlist.length;
    const booked = upcomingWatchlist.length;
    const closingSoon =
      upcomingWatchlist.filter(w => isClosingWithinDays(showMap[w.show_id], 30)).length +
      regularWatchlist.filter(w => isClosingWithinDays(showMap[w.show_id], 30)).length;
    return [
      { value: String(total), label: 'SAVED' },
      { value: String(booked), label: 'BOOKED' },
      {
        value: String(closingSoon),
        label: 'CLOSING',
        accent: closingSoon > 0,
      },
    ];
  }, [upcomingWatchlist, regularWatchlist, showMap]);

  // Card width — same derivation as Watched, ensures parity across screens
  const cardWidth = useMemo(() => {
    const pagePadding = Spacing.lg * 2;
    const totalGaps = GRID_GAP * (GRID_COLS - 1);
    return Math.floor((windowWidth - pagePadding - totalGaps) / GRID_COLS);
  }, [windowWidth]);

  // Build 3-col grid rows for the watchlist grid view
  const gridRows = useMemo(() => {
    const rows: WatchlistEntry[][] = [];
    for (let i = 0; i < sortedWatchlist.length; i += GRID_COLS) {
      rows.push(sortedWatchlist.slice(i, i + GRID_COLS));
    }
    return rows;
  }, [sortedWatchlist]);

  const handleRemove = useCallback(async (showId: string) => {
    try {
      await removeFromWatchlist(showId);
    } catch {
      // Hook sets error state
    }
  }, [removeFromWatchlist]);

  const handleDateChange = useCallback((_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setDatePickingShowId(null);
      if (selectedDate && datePickingShowId) {
        const isoDate = selectedDate.toISOString().split('T')[0];
        updatePlannedDate(datePickingShowId, isoDate);
      }
    } else if (selectedDate) {
      setPendingDate(selectedDate);
    }
  }, [datePickingShowId, updatePlannedDate]);

  const cycleSort = useCallback(() => {
    haptics.tap();
    setWatchlistSort(prev => {
      if (prev === 'added-desc') return 'alphabetical';
      if (prev === 'alphabetical') return 'closing-soon';
      return 'added-desc';
    });
  }, []);

  const sortLabel = watchlistSort === 'added-desc' ? 'Recent' : watchlistSort === 'alphabetical' ? 'A-Z' : 'Closing Soon';

  const confirmRemove = useCallback((entry: WatchlistEntry) => {
    const title = showMap[entry.show_id]?.title || entry.show_id;
    Alert.alert('Remove from Watchlist', `Remove ${title}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => handleRemove(entry.show_id) },
    ]);
  }, [showMap, handleRemove]);

  if (!featureFlags.userAccounts) return null;

  if (!authLoading && !isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>To Watch</Text>
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaEmoji}>🎟️</Text>
          <Text style={styles.ctaTitle}>Plan your next show</Text>
          <Text style={styles.ctaDescription}>
            Sign in to build your watchlist and track when you{"'"}re going.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
            onPress={() => showSignIn('watchlist')}
          >
            <Text style={styles.ctaButtonText}>Sign In to Get Started</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>To Watch</Text>
        <View style={{ paddingTop: Spacing.lg }}>
          {[0, 1, 2, 3, 4].map(i => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md }}>
              <Skeleton width={48} height={64} borderRadius={BorderRadius.sm} />
              <View style={{ flex: 1 }}>
                <Skeleton width="75%" height={16} />
                <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  const renderWatchlistListItem = (item: WatchlistEntry) => {
    const show = showMap[item.show_id];
    const title = show?.title || item.show_id;
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
        onPress={() => show && router.push(`/show/${show.slug}`)}
        onLongPress={() => confirmRemove(item)}
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.listPoster} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.listPoster, styles.cardPosterPlaceholder]}>
            <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.listInfo}>
          <Text style={styles.listTitle} numberOfLines={1}>{title}</Text>
          {show?.venue && <Text style={styles.listVenue} numberOfLines={1}>{show.venue}</Text>}
        </View>
      </Pressable>
    );
  };

  const allEmpty = upcomingWatchlist.length === 0 && sortedWatchlist.length === 0;

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>To Watch</Text>
      </View>

      {allEmpty ? (
        <>
          <StatHero items={heroItems} />
          <Pressable
            style={({ pressed }) => [styles.searchPill, pressed && styles.pressed]}
            onPress={() => setShowSearchModal(true)}
            accessibilityRole="search"
            accessibilityLabel="Search to add a show"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
              <Circle cx="11" cy="11" r="7" />
              <Path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </Svg>
            <Text style={styles.searchPillText}>Search to add a show…</Text>
          </Pressable>
          <EmptyState
            emoji="🎟️"
            title="Your watchlist is empty"
            subtitle="Save shows you want to see and set reminders for when you're going."
            actionLabel="Browse Shows"
            onAction={() => router.push('/(tabs)/browse')}
          />
        </>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        >
          <StatHero items={heroItems} />

          <Pressable
            style={({ pressed }) => [styles.searchPill, pressed && styles.pressed]}
            onPress={() => setShowSearchModal(true)}
            accessibilityRole="search"
            accessibilityLabel="Search to add a show"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
              <Circle cx="11" cy="11" r="7" />
              <Path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </Svg>
            <Text style={styles.searchPillText}>Search to add a show…</Text>
          </Pressable>

          {upcomingWatchlist.length > 0 ? (
            <View style={{ marginTop: Spacing.sm }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Upcoming</Text>
                <Text style={styles.sectionCount}>{upcomingWatchlist.length}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalRow}
              >
                {upcomingWatchlist.map(item => (
                  <UpcomingPoster
                    key={item.id}
                    watchlistEntry={item}
                    show={showMap[item.show_id]}
                    width={cardWidth}
                    onPress={() => {
                      haptics.tap();
                      const slug = showMap[item.show_id]?.slug;
                      if (slug) router.push(`/show/${slug}`);
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {sortedWatchlist.length > 0 ? (
            <View style={{ marginTop: Spacing.lg }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Watchlist</Text>
                <View style={styles.sectionRight}>
                  <Pressable style={styles.sortButton} onPress={cycleSort}>
                    <Text style={styles.sortText}>{sortLabel}</Text>
                    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                      <Path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </Svg>
                  </Pressable>
                  <View style={styles.viewToggleContainer}>
                    <Pressable
                      testID="grid-view-toggle"
                      style={[styles.viewToggleButton, viewMode === 'grid' && styles.viewToggleActive]}
                      onPress={() => { haptics.tap(); setViewMode('grid'); }}
                      hitSlop={4}
                    >
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={viewMode === 'grid' ? Colors.text.primary : Colors.text.muted} strokeWidth={2}>
                        <Path strokeLinecap="round" strokeLinejoin="round" d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
                      </Svg>
                    </Pressable>
                    <Pressable
                      testID="list-view-toggle"
                      style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleActive]}
                      onPress={() => { haptics.tap(); setViewMode('list'); }}
                      hitSlop={4}
                    >
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={viewMode === 'list' ? Colors.text.primary : Colors.text.muted} strokeWidth={2}>
                        <Path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                      </Svg>
                    </Pressable>
                  </View>
                </View>
              </View>

              {viewMode === 'grid' ? (
                <View style={styles.gridContainer}>
                  {gridRows.map((row, rowIdx) => (
                    <View key={rowIdx} style={styles.gridRow}>
                      {row.map(item => (
                        <WatchlistGridPoster
                          key={item.id}
                          watchlistEntry={item}
                          show={showMap[item.show_id]}
                          width={cardWidth}
                          onPress={() => {
                            haptics.tap();
                            const slug = showMap[item.show_id]?.slug;
                            if (slug) router.push(`/show/${slug}`);
                          }}
                          onLongPress={() => confirmRemove(item)}
                        />
                      ))}
                      {/* spacers for incomplete final row */}
                      {row.length < GRID_COLS &&
                        Array.from({ length: GRID_COLS - row.length }, (_, i) => (
                          <View key={`spacer-${i}`} style={{ width: cardWidth }} />
                        ))}
                    </View>
                  ))}
                </View>
              ) : (
                <View>
                  {sortedWatchlist.map(renderWatchlistListItem)}
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>
      )}

      {datePickingShowId && (
        <View style={styles.datePickerOverlay}>
          <View style={styles.datePickerCard}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>When are you going?</Text>
              <Pressable onPress={() => {
                if (datePickingShowId) {
                  const isoDate = pendingDate.toISOString().split('T')[0];
                  updatePlannedDate(datePickingShowId, isoDate);
                }
                setDatePickingShowId(null);
              }} hitSlop={8}>
                <Text style={styles.datePickerDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={pendingDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleDateChange}
              minimumDate={new Date()}
              themeVariant="dark"
            />
          </View>
        </View>
      )}

      <ShowSearchModal
        visible={showSearchModal}
        title="Add to Watchlist"
        excludeIds={new Set(watchlist.map(w => w.show_id))}
        onSelect={async (show) => {
          setShowSearchModal(false);
          haptics.action();
          try {
            await addToWatchlist(show.id);
            await getWatchlist();
          } catch {
            // Hook sets error state
          }
        }}
        onClose={() => setShowSearchModal(false)}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.default },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.sm,
  },
  pageTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text.primary },
  pressed: { opacity: 0.7 },

  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  searchPillText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  sectionTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  sectionCount: { color: Colors.text.muted, fontSize: FontSize.xs },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  horizontalRow: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },

  gridContainer: {
    paddingHorizontal: Spacing.lg,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: Spacing.md,
  },

  sortButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface.overlay, borderRadius: 8,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  sortText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '500' },
  viewToggleContainer: {
    flexDirection: 'row', backgroundColor: Colors.surface.overlay,
    borderRadius: 8, overflow: 'hidden',
  },
  viewToggleButton: {
    padding: 6, alignItems: 'center', justifyContent: 'center',
  },
  viewToggleActive: {
    backgroundColor: Colors.surface.raised,
  },

  // List view
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  listPoster: {
    width: 48, height: 64, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  cardPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: Colors.text.muted, fontSize: 18, fontWeight: '600' },
  listInfo: { flex: 1 },
  listTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '600' },
  listVenue: { color: Colors.text.muted, fontSize: FontSize.sm, marginTop: 2 },

  // Empty / CTA
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { color: Colors.text.muted, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.xs },
  emptyAction: {
    marginTop: Spacing.lg, backgroundColor: Colors.brand, borderRadius: 10,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
  },
  emptyActionText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '600' },
  ctaContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  ctaEmoji: { fontSize: 64, marginBottom: Spacing.lg },
  ctaTitle: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  ctaDescription: { color: Colors.text.secondary, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },
  ctaButton: {
    marginTop: Spacing.xl, backgroundColor: Colors.brand, borderRadius: 12,
    paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md,
  },
  ctaButtonText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '700' },

  // Date picker
  datePickerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  datePickerCard: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginHorizontal: Spacing.lg, width: '90%',
  },
  datePickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  datePickerTitle: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '500' },
  datePickerDone: { color: Colors.brand, fontSize: FontSize.sm, fontWeight: '600' },
});
