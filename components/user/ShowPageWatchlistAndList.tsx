/**
 * ShowPageWatchlistAndList — watchlist toggle + planned-date chip + Add-to-list trigger.
 *
 * Extracted from ShowPageRating so the rating section owns ratings only and
 * the action-links row owns watchlist/list (mirrors the web mobile design where
 * `<ShowPageWatchlistButton />` lives in the action row alongside ticket links).
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/lib/auth-context';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useToastSafe } from '@/lib/toast-context';
import { savePendingAction, getPendingAction, clearPendingAction } from '@/lib/deferred-auth';
import { featureFlags } from '@/lib/feature-flags';
import * as haptics from '@/lib/haptics';
import WatchlistButton from './WatchlistButton';
import AddToListSheet from './AddToListSheet';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface ShowPageWatchlistAndListProps {
  showId: string;
}

export default function ShowPageWatchlistAndList({ showId }: ShowPageWatchlistAndListProps) {
  const { user, isAuthenticated, showSignIn } = useAuth();
  const {
    isWatchlisted,
    addToWatchlist,
    removeFromWatchlist,
    getWatchlist,
    updatePlannedDate,
    watchlist,
  } = useWatchlist(user?.id || null);
  const { showToast } = useToastSafe();
  const pathname = usePathname();

  const hasExecutedPending = useRef(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [showWatchlistDatePicker, setShowWatchlistDatePicker] = useState(false);
  const [pendingWatchlistDate, setPendingWatchlistDate] = useState<Date>(new Date());
  const [showListSheet, setShowListSheet] = useState(false);

  const watchlistEntry = watchlist.find(w => w.show_id === showId);

  // Consume pending watchlist / add-to-list actions after auth.
  // Rating-pending is consumed by ShowPageRating; we ignore it here.
  useEffect(() => {
    if (!isAuthenticated || !user || hasExecutedPending.current) return;
    (async () => {
      const pending = await getPendingAction();
      if (!pending || pending.showId !== showId) return;
      if (pending.type !== 'watchlist' && pending.type !== 'add-to-list') return;

      hasExecutedPending.current = true;
      await clearPendingAction();

      if (pending.type === 'watchlist') {
        try {
          await addToWatchlist(showId);
          await getWatchlist();
          showToast('Added to Watchlist', 'success', '/(tabs)/watched');
        } catch {
          showToast('Failed to add to watchlist.', 'error');
        }
      } else if (pending.type === 'add-to-list') {
        setShowListSheet(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once after auth, ref guards
  }, [isAuthenticated, user, showId]);

  const handleToggleWatchlist = useCallback(async () => {
    if (!isAuthenticated) {
      savePendingAction({
        type: 'watchlist',
        showId,
        returnRoute: pathname,
        timestamp: Date.now(),
      });
      showSignIn('watchlist');
      return;
    }
    setWatchlistLoading(true);
    try {
      if (isWatchlisted(showId)) {
        await removeFromWatchlist(showId);
        showToast('Removed from Watchlist', 'info');
      } else {
        await addToWatchlist(showId);
        showToast('Added to Watchlist', 'success', '/(tabs)/watched');
      }
    } catch {
      showToast('Failed to update watchlist.', 'error');
    } finally {
      setWatchlistLoading(false);
    }
  }, [isAuthenticated, showId, pathname, showSignIn, isWatchlisted, addToWatchlist, removeFromWatchlist, showToast]);

  const handleListPress = useCallback(() => {
    if (!isAuthenticated) {
      savePendingAction({
        type: 'add-to-list',
        showId,
        returnRoute: pathname,
        timestamp: Date.now(),
      });
      showSignIn('list');
      return;
    }
    haptics.tap();
    setShowListSheet(true);
  }, [isAuthenticated, showId, pathname, showSignIn]);

  const handleWatchlistDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS !== 'ios') {
        setShowWatchlistDatePicker(false);
        if (selectedDate) {
          const iso = selectedDate.toISOString().split('T')[0];
          updatePlannedDate(showId, iso).catch(() => {
            showToast('Failed to save date.', 'error');
          });
        }
      } else if (selectedDate) {
        setPendingWatchlistDate(selectedDate);
      }
    },
    [showId, updatePlannedDate, showToast],
  );

  if (!featureFlags.userAccounts) return null;

  return (
    <>
      <View style={styles.row}>
        <WatchlistButton
          isWatchlisted={isWatchlisted(showId)}
          onToggle={handleToggleWatchlist}
          loading={watchlistLoading}
        />
        {isWatchlisted(showId) && (
          <Pressable
            style={styles.dateChip}
            onPress={() => {
              setPendingWatchlistDate(
                watchlistEntry?.planned_date ? new Date(watchlistEntry.planned_date + 'T00:00:00') : new Date(),
              );
              setShowWatchlistDatePicker(true);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Set planned date"
          >
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </Svg>
            <Text style={styles.dateChipText}>
              {watchlistEntry?.planned_date
                ? new Date(watchlistEntry.planned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Add date'}
            </Text>
            {watchlistEntry?.planned_date && (
              <Pressable
                onPress={() => updatePlannedDate(showId, null).catch(() => showToast('Failed to clear date.', 'error'))}
                hitSlop={8}
                style={styles.dateChipClear}
              >
                <Text style={styles.dateChipClearText}>×</Text>
              </Pressable>
            )}
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.listButton, pressed && styles.pressed]}
          onPress={handleListPress}
          accessibilityRole="button"
          accessibilityLabel="Add to list"
          testID="add-to-list-button"
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </Svg>
          <Text style={styles.listButtonText}>List</Text>
        </Pressable>
      </View>

      {showWatchlistDatePicker && (
        <View style={styles.datePickerContainer}>
          <View style={styles.datePickerHeader}>
            <Text style={styles.datePickerTitle}>When are you going?</Text>
            <Pressable
              onPress={() => {
                const iso = pendingWatchlistDate.toISOString().split('T')[0];
                updatePlannedDate(showId, iso).catch(() => {
                  showToast('Failed to save date.', 'error');
                });
                setShowWatchlistDatePicker(false);
              }}
              hitSlop={8}
            >
              <Text style={styles.datePickerDone}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={pendingWatchlistDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleWatchlistDateChange}
            minimumDate={new Date()}
            themeVariant="dark"
            style={{ alignSelf: 'center' }}
          />
        </View>
      )}

      {isAuthenticated && user && (
        <AddToListSheet
          showId={showId}
          userId={user.id}
          visible={showListSheet}
          onClose={() => setShowListSheet(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  pressed: { opacity: 0.6 },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  dateChipText: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
  },
  dateChipClear: {
    marginLeft: 4,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipClearText: {
    color: Colors.text.muted,
    fontSize: 14,
    lineHeight: 14,
  },
  listButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  listButtonText: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  datePickerContainer: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  datePickerTitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  datePickerDone: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
