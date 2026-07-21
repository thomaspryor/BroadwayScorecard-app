/**
 * DESIGN PROPOSAL — rating → log bottom sheet (workspace #256, unmerged).
 *
 * Replaces the show-page rating trigger with a compact action row
 * (Seen it / Rate / Watchlist / Share) and a bottom sheet for logging a
 * viewing (date, stars, note) instead of navigating to a full-screen modal.
 * Real save via useUserReviews / useWatchlist — same data path as the
 * shipped ShowPageRating component.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, StyleSheet, Share, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useToastSafe } from '@/lib/toast-context';
import StarRating from './StarRating';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';

interface RatingActionSheetProps {
  showId: string;
  showTitle: string;
}

function ActionIcon({ kind }: { kind: 'seen' | 'rate' | 'watchlist' | 'share' }) {
  const stroke = Colors.text.secondary;
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 2 } as const;
  if (kind === 'seen') return <Svg {...props}><Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></Svg>;
  if (kind === 'rate') return <Svg {...props}><Path strokeLinecap="round" strokeLinejoin="round" d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7L5.8 21l1.6-7L2 9.2l7.1-.6z" /></Svg>;
  if (kind === 'watchlist') return <Svg {...props}><Path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12v18l-6-4-6 4V3z" /></Svg>;
  return <Svg {...props}><Path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" /></Svg>;
}

export default function RatingActionSheet({ showId, showTitle }: RatingActionSheetProps) {
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { saveReview } = useUserReviews(user?.id || null);
  const { isWatchlisted, addToWatchlist, removeFromWatchlist } = useWatchlist(user?.id || null);
  const { showToast } = useToastSafe();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const requireAuth = (action: () => void) => {
    if (!isAuthenticated) { showSignIn('rating'); return; }
    action();
  };

  const openSheet = () => requireAuth(() => { haptics.tap(); setSheetOpen(true); });

  const handleToggleWatchlist = () => requireAuth(async () => {
    haptics.tap();
    try {
      if (isWatchlisted(showId)) await removeFromWatchlist(showId);
      else await addToWatchlist(showId);
    } catch {
      showToast('Failed to update watchlist.', 'error');
    }
  });

  const handleShare = async () => {
    try {
      await Share.share({ message: `Check out ${showTitle} on Broadway Scorecard` });
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveReview({
        showId,
        rating,
        reviewText: note.trim() || null,
        dateSeen: date.toISOString().split('T')[0],
      });
      haptics.action();
      showToast('Rating saved.', 'success');
      setSheetOpen(false);
      setRating(0);
      setNote('');
    } catch {
      showToast('Failed to save rating.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={styles.actionRow}>
        <Pressable style={styles.action} onPress={openSheet}>
          <View style={styles.actionIcon}><ActionIcon kind="seen" /></View>
          <Text style={styles.actionLabel}>Seen it</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={openSheet}>
          <View style={styles.actionIcon}><ActionIcon kind="rate" /></View>
          <Text style={styles.actionLabel}>Rate</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={handleToggleWatchlist}>
          <View style={[styles.actionIcon, isWatchlisted(showId) && styles.actionIconOn]}>
            <ActionIcon kind="watchlist" />
          </View>
          <Text style={[styles.actionLabel, isWatchlisted(showId) && styles.actionLabelOn]}>Watchlist</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={handleShare}>
          <View style={styles.actionIcon}><ActionIcon kind="share" /></View>
          <Text style={styles.actionLabel}>Share</Text>
        </Pressable>
      </View>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Log {showTitle}</Text>

            <Pressable style={styles.row} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.rowLabel}>Date seen</Text>
              <Text style={styles.rowValue}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(_, selected) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selected) setDate(selected);
                }}
              />
            )}

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Rating</Text>
              <StarRating rating={rating} onRatingChange={setRating} size="lg" hideLabel />
            </View>

            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={Colors.text.muted}
              multiline
            />

            <Pressable
              style={[styles.saveButton, (rating === 0 || saving) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={rating === 0 || saving}
            >
              <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Rating'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border.subtle,
  },
  action: {
    alignItems: 'center',
    gap: 4,
    minWidth: 60,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 99,
    backgroundColor: Colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconOn: {
    backgroundColor: Colors.brand + '33',
  },
  actionLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
  },
  actionLabelOn: {
    color: Colors.brand,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface.raised,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surface.elevated,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border.subtle,
  },
  rowLabel: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
  },
  rowValue: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
  },
  noteInput: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    minHeight: 60,
    textAlignVertical: 'top',
    marginTop: Spacing.md,
  },
  saveButton: {
    backgroundColor: Colors.brand,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: Colors.surface.default,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
