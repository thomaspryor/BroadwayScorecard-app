/**
 * AddToListSheet — bottom sheet for adding a show to user lists.
 *
 * Modal-based sheet shown from show pages. Displays checkboxes for
 * each user list, with inline create-new-list row.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserLists } from '@/hooks/useUserLists';
import { useToastSafe } from '@/lib/toast-context';
import { featureFlags } from '@/lib/feature-flags';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import { trackShowAddedToList, trackShowRemovedFromList, trackListCreated } from '@/lib/analytics';

interface AddToListSheetProps {
  showId: string;
  userId: string;
  visible: boolean;
  onClose: () => void;
}

export default function AddToListSheet({ showId, userId, visible, onClose }: AddToListSheetProps) {
  const {
    lists,
    getLists,
    createList,
    addToList,
    removeFromList,
  } = useUserLists(userId);
  const { showToast } = useToastSafe();
  const insets = useSafeAreaInsets();

  const [mutatingLists, setMutatingLists] = useState<Set<string>>(new Set());
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetch lists when sheet opens
  useEffect(() => {
    if (visible) getLists();
  }, [visible, getLists]);

  if (!featureFlags.userAccounts) return null;

  const handleToggle = async (listId: string, isInList: boolean) => {
    setMutatingLists(prev => new Set(prev).add(listId));
    try {
      if (isInList) {
        await removeFromList(listId, showId);
        haptics.action();
        trackShowRemovedFromList(listId, showId);
        const list = lists.find(l => l.id === listId);
        showToast(`Removed from ${list?.name || 'list'}`, 'info');
      } else {
        await addToList(listId, showId);
        haptics.action();
        trackShowAddedToList(listId, showId, 'show_page');
        const list = lists.find(l => l.id === listId);
        showToast(`Added to ${list?.name || 'list'}`, 'success');
      }
    } catch {
      showToast('Failed to update list', 'error');
    } finally {
      setMutatingLists(prev => {
        const next = new Set(prev);
        next.delete(listId);
        return next;
      });
    }
  };

  const handleCreateAndAdd = async () => {
    const name = newListName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const newList = await createList(name);
      if (newList) {
        trackListCreated(newList.id, name, false);
        await addToList(newList.id, showId);
        trackShowAddedToList(newList.id, showId, 'show_page');
        haptics.action();
        showToast(`Added to ${name}`, 'success');
        setNewListName('');
      }
    } catch {
      showToast('Failed to create list', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add to List</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </Svg>
            </Pressable>
          </View>

          {/* List rows */}
          <ScrollView style={styles.listContainer} bounces={false}>
            {lists.map(list => {
              const isInList = (list.all_show_ids || []).includes(showId);
              const isMutating = mutatingLists.has(list.id);
              return (
                <Pressable
                  key={list.id}
                  style={styles.listRow}
                  onPress={() => !isMutating && handleToggle(list.id, isInList)}
                  disabled={isMutating}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isInList }}
                  accessibilityLabel={`${list.name}${isInList ? ', added' : ''}`}
                >
                  <View style={styles.listInfo}>
                    <Text style={styles.listName} numberOfLines={1}>{list.name}</Text>
                    <Text style={styles.listCount}>
                      {list.item_count || 0} {(list.item_count || 0) === 1 ? 'show' : 'shows'}
                      {list.is_ranked && ' · Ranked'}
                    </Text>
                  </View>
                  {isMutating ? (
                    <ActivityIndicator size="small" color={Colors.brand} />
                  ) : (
                    <View style={[styles.checkbox, isInList && styles.checkboxChecked]}>
                      {isInList && (
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={3}>
                          <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </Svg>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}

            {lists.length === 0 && (
              <Text style={styles.emptyText}>No lists yet. Create one below!</Text>
            )}
          </ScrollView>

          {/* Create new list row */}
          <View style={styles.createRow}>
            <TextInput
              style={styles.createInput}
              value={newListName}
              onChangeText={setNewListName}
              placeholder="New list name..."
              placeholderTextColor={Colors.text.muted}
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={handleCreateAndAdd}
            />
            <Pressable
              style={[styles.createButton, (!newListName.trim() || creating) && styles.createButtonDisabled]}
              onPress={handleCreateAndAdd}
              disabled={!newListName.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.createButtonText}>Add</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface.raised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  listContainer: {
    maxHeight: 300,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.subtle,
  },
  listInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  listName: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  listCount: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.text.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  createInput: {
    flex: 1,
    backgroundColor: Colors.surface.elevated,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text.primary,
    fontSize: FontSize.md,
  },
  createButton: {
    backgroundColor: Colors.brand,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minWidth: 60,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  createButtonText: {
    color: '#000',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
