/**
 * Lists tab — CRUD for user's custom show lists.
 *
 * Index view shows all lists with poster previews.
 * Detail view shows items with drag-to-reorder (ranked) or flat list (unranked).
 * Inline search to add shows. Create/Edit modal for list metadata.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import Fuse from 'fuse.js';
import { useUserLists } from '@/hooks/useUserLists';
import { useShows } from '@/lib/data-context';
import { getImageUrl } from '@/lib/images';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import type { UserList, ListItem } from '@/lib/user-types';
import type { Show } from '@/lib/types';

const POSITION_GAP = 1000;
const MAX_NAME = 100;
const MAX_DESC = 500;

interface ListsTabProps {
  userId: string;
  showMap: Record<string, Show>;
  createTrigger?: number;
}

export default function ListsTab({ userId, showMap, createTrigger }: ListsTabProps) {
  const router = useRouter();
  const {
    lists, loading,
    getListItems,
    createList, updateList, deleteList,
    addToList, removeFromList, reorderList,
  } = useUserLists(userId);
  const { shows } = useShows();

  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [listItemsLoading, setListItemsLoading] = useState(false);
  const [showModal, setShowModal] = useState<'create' | 'edit' | null>(null);
  const [editingList, setEditingList] = useState<UserList | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Open create modal from parent trigger
  useEffect(() => {
    if (createTrigger && createTrigger > 0) {
      setShowModal('create');
    }
  }, [createTrigger]);

  // Load items when viewing a list detail
  useEffect(() => {
    if (activeListId) {
      setListItemsLoading(true);
      getListItems(activeListId)
        .then(setListItems)
        .finally(() => setListItemsLoading(false));
    } else {
      setListItems([]);
      setShowSearch(false);
      setSearchQuery('');
    }
  }, [activeListId, getListItems]);

  const activeList = useMemo(
    () => lists.find(l => l.id === activeListId) || null,
    [lists, activeListId],
  );

  // ─── Fuse.js search for adding shows ───────────────────
  const fuse = useMemo(() => {
    return new Fuse(shows, {
      keys: [{ name: 'title', weight: 0.8 }, { name: 'venue', weight: 0.2 }],
      threshold: 0.35,
    });
  }, [shows]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return fuse.search(searchQuery.trim()).slice(0, 6).map(r => r.item);
  }, [fuse, searchQuery]);

  const alreadyInList = useMemo(() => {
    return new Set(listItems.map(i => i.show_id));
  }, [listItems]);

  // ─── Handlers ───────────────────────────────────────────
  const handleCreateList = async (name: string, description: string | null, isRanked: boolean) => {
    haptics.action();
    const newList = await createList(name, description, isRanked);
    if (newList) {
      setShowModal(null);
    }
  };

  const handleEditList = async (name: string, description: string | null, isRanked: boolean) => {
    if (!editingList) return;
    haptics.action();
    await updateList(editingList.id, { name, description, is_ranked: isRanked });
    setShowModal(null);
    setEditingList(null);
  };

  const handleDeleteList = (listId: string, listName: string) => {
    Alert.alert(
      'Delete List',
      `Are you sure you want to delete "${listName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            haptics.action();
            await deleteList(listId);
            setActiveListId(null);
          },
        },
      ],
    );
  };

  const handleAddShow = async (showId: string) => {
    if (!activeListId) return;
    haptics.action();
    await addToList(activeListId, showId);
    // Refresh items
    const items = await getListItems(activeListId);
    setListItems(items);
    setSearchQuery('');
  };

  const handleRemoveShow = async (showId: string) => {
    if (!activeListId) return;
    haptics.action();
    await removeFromList(activeListId, showId);
    setListItems(prev => prev.filter(i => i.show_id !== showId));
  };

  const handleDragEnd = async (data: ListItem[]) => {
    if (!activeListId) return;
    haptics.selection();
    const prevItems = [...listItems];
    // Optimistic: apply new order immediately
    setListItems(data);
    const itemIds = data.map(i => i.id);
    const positions = data.map((_, idx) => (idx + 1) * POSITION_GAP);
    const success = await reorderList(activeListId, itemIds, positions);
    if (!success) {
      // Revert on failure
      setListItems(prevItems);
    }
  };

  // ─── INDEX VIEW ─────────────────────────────────────────
  if (!activeListId) {
    if (loading && lists.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      );
    }

    if (lists.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>No lists yet</Text>
          <Text style={styles.emptyDescription}>Create lists to organize shows you love</Text>
          <Pressable
            style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
            onPress={() => setShowModal('create')}
          >
            <Text style={styles.ctaButtonText}>Create a List</Text>
          </Pressable>
          <ListModal
            visible={showModal === 'create'}
            mode="create"
            onSave={handleCreateList}
            onClose={() => setShowModal(null)}
          />
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={lists}
          keyExtractor={l => l.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: list }) => (
            <Pressable
              style={styles.listCard}
              onPress={() => { haptics.tap(); setActiveListId(list.id); }}
            >
              <View style={styles.listCardInfo}>
                <View style={styles.listCardHeader}>
                  <Text style={styles.listCardName} numberOfLines={1}>{list.name}</Text>
                  {list.is_ranked && <Text style={styles.rankedBadge}>#</Text>}
                </View>
                <Text style={styles.listCardCount}>
                  {list.item_count || 0} {(list.item_count || 0) === 1 ? 'show' : 'shows'}
                </Text>
              </View>
              {/* Poster previews */}
              <View style={styles.previewRow}>
                {(list.preview_show_ids || []).slice(0, 4).map(sid => {
                  const show = showMap[sid];
                  return show ? (
                    <Image
                      key={sid}
                      source={{ uri: getImageUrl(show.images?.poster) || getImageUrl(show.images?.thumbnail) || undefined }}
                      style={styles.previewPoster}
                      contentFit="cover"
                    />
                  ) : (
                    <View key={sid} style={[styles.previewPoster, styles.previewPlaceholder]}>
                      <Text style={styles.previewPlaceholderText}>🎭</Text>
                    </View>
                  );
                })}
              </View>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </Svg>
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable
              style={styles.createButton}
              onPress={() => { haptics.tap(); setShowModal('create'); }}
            >
              <Text style={styles.createButtonText}>+ Create a list</Text>
            </Pressable>
          }
        />
        <ListModal
          visible={showModal === 'create'}
          mode="create"
          onSave={handleCreateList}
          onClose={() => setShowModal(null)}
        />
      </View>
    );
  }

  // ─── DETAIL VIEW ────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* Back + Header */}
      <View style={styles.detailHeader}>
        <Pressable onPress={() => { haptics.tap(); setActiveListId(null); }} hitSlop={12}>
          <Text style={styles.backText}>← Lists</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Alert.alert(activeList?.name || 'List', undefined, [
              {
                text: 'Edit',
                onPress: () => { setEditingList(activeList); setShowModal('edit'); },
              },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => activeList && handleDeleteList(activeList.id, activeList.name),
              },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
          hitSlop={12}
        >
          <Text style={styles.moreButton}>•••</Text>
        </Pressable>
      </View>

      <View style={styles.detailTitleRow}>
        <Text style={styles.detailTitle}>{activeList?.name}</Text>
        {activeList?.is_ranked && <Text style={styles.rankedBadgeLarge}># Ranked</Text>}
      </View>
      {activeList?.description && (
        <Text style={styles.detailDescription}>{activeList.description}</Text>
      )}

      {listItemsLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : activeList?.is_ranked ? (
        /* Ranked: DraggableFlatList */
        <DraggableFlatList
          data={listItems}
          keyExtractor={item => item.id}
          onDragEnd={({ data }) => handleDragEnd(data)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, drag, isActive }: RenderItemParams<ListItem>) => {
            const show = showMap[item.show_id];
            const idx = listItems.indexOf(item);
            return (
              <ScaleDecorator>
                <Pressable
                  style={[styles.itemRow, isActive && styles.itemRowDragging]}
                  onLongPress={drag}
                  onPress={() => show && router.push(`/show/${show.slug}`)}
                >
                  {/* Rank number */}
                  <Text style={styles.rankNumber}>{idx + 1}</Text>
                  {/* Drag handle */}
                  <Pressable onLongPress={drag} hitSlop={8}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill={Colors.text.muted}>
                      <Path d="M8 6h2v2H8zm6 0h2v2h-2zM8 11h2v2H8zm6 0h2v2h-2zM8 16h2v2H8zm6 0h2v2h-2z" />
                    </Svg>
                  </Pressable>
                  {/* Poster */}
                  {show ? (
                    <Image
                      source={{ uri: getImageUrl(show.images?.poster) || getImageUrl(show.images?.thumbnail) || undefined }}
                      style={styles.itemPoster}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.itemPoster, styles.itemPosterPlaceholder]}>
                      <Text style={styles.placeholderText}>🎭</Text>
                    </View>
                  )}
                  {/* Title */}
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {show?.title || item.show_id}
                    </Text>
                    {show?.venue && (
                      <Text style={styles.itemVenue} numberOfLines={1}>{show.venue}</Text>
                    )}
                  </View>
                  {/* Remove */}
                  <Pressable
                    onPress={() => handleRemoveShow(item.show_id)}
                    hitSlop={12}
                    style={styles.removeButton}
                  >
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                      <Path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                    </Svg>
                  </Pressable>
                </Pressable>
              </ScaleDecorator>
            );
          }}
          ListFooterComponent={<AddShowSearch />}
        />
      ) : (
        /* Unranked: regular FlatList */
        <FlatList
          data={listItems}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const show = showMap[item.show_id];
            return (
              <Pressable
                style={styles.itemRow}
                onPress={() => show && router.push(`/show/${show.slug}`)}
              >
                {show ? (
                  <Image
                    source={{ uri: getImageUrl(show.images?.poster) || getImageUrl(show.images?.thumbnail) || undefined }}
                    style={styles.itemPoster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.itemPoster, styles.itemPosterPlaceholder]}>
                    <Text style={styles.placeholderText}>🎭</Text>
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {show?.title || item.show_id}
                  </Text>
                  {show?.venue && (
                    <Text style={styles.itemVenue} numberOfLines={1}>{show.venue}</Text>
                  )}
                </View>
                <Pressable
                  onPress={() => handleRemoveShow(item.show_id)}
                  hitSlop={12}
                  style={styles.removeButton}
                >
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                    <Path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                  </Svg>
                </Pressable>
              </Pressable>
            );
          }}
          ListFooterComponent={<AddShowSearch />}
          ListEmptyComponent={
            !showSearch ? (
              <View style={styles.emptyDetailContainer}>
                <Text style={styles.emptyDetailText}>No shows in this list yet</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Edit modal */}
      <ListModal
        visible={showModal === 'edit'}
        mode="edit"
        initialName={editingList?.name}
        initialDescription={editingList?.description}
        initialRanked={editingList?.is_ranked}
        onSave={handleEditList}
        onClose={() => { setShowModal(null); setEditingList(null); }}
        onDelete={editingList ? () => handleDeleteList(editingList.id, editingList.name) : undefined}
      />
    </View>
  );

  // ─── Inline add show search ─────────────────────────────
  function AddShowSearch() {
    return (
      <View style={styles.addShowSection}>
        {!showSearch ? (
          <Pressable
            style={styles.addShowButton}
            onPress={() => { haptics.tap(); setShowSearch(true); }}
          >
            <Text style={styles.addShowButtonText}>+ Add a show</Text>
          </Pressable>
        ) : (
          <View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search shows..."
              placeholderTextColor={Colors.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            {searchResults.map(show => {
              const inList = alreadyInList.has(show.id);
              return (
                <Pressable
                  key={show.id}
                  style={[styles.searchResult, inList && styles.searchResultDisabled]}
                  onPress={() => !inList && handleAddShow(show.id)}
                  disabled={inList}
                >
                  <Image
                    source={{ uri: getImageUrl(show.images?.poster) || getImageUrl(show.images?.thumbnail) || undefined }}
                    style={styles.searchResultPoster}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.searchResultTitle, inList && styles.searchResultTitleDisabled]} numberOfLines={1}>
                      {show.title}
                    </Text>
                    {show.venue && (
                      <Text style={styles.searchResultVenue} numberOfLines={1}>{show.venue}</Text>
                    )}
                  </View>
                  {inList && <Text style={styles.inListBadge}>Added</Text>}
                </Pressable>
              );
            })}
            {searchQuery.trim().length > 0 && searchResults.length === 0 && (
              <Text style={styles.noResults}>No shows found</Text>
            )}
          </View>
        )}
      </View>
    );
  }
}

// ─── Create / Edit Modal ────────────────────────────────────
function ListModal({
  visible,
  mode,
  initialName,
  initialDescription,
  initialRanked,
  onSave,
  onClose,
  onDelete,
}: {
  visible: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  initialDescription?: string | null;
  initialRanked?: boolean;
  onSave: (name: string, description: string | null, isRanked: boolean) => Promise<void>;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  const [isRanked, setIsRanked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName || '');
      setDescription(initialDescription || '');
      setShowDesc(!!initialDescription);
      setIsRanked(initialRanked ?? false);
    }
  }, [visible, initialName, initialDescription, initialRanked]);

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onSave(name, showDesc ? description : null, isRanked);
    setSaving(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        {/* Header */}
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle}>
            {mode === 'create' ? 'Create List' : 'Edit List'}
          </Text>
          <Pressable onPress={handleSave} disabled={!canSave || saving} hitSlop={12}>
            <Text style={[styles.modalSave, (!canSave || saving) && styles.modalSaveDisabled]}>
              {saving ? 'Saving...' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={styles.modalBody}>
          {/* Name */}
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={t => setName(t.slice(0, MAX_NAME))}
            placeholder="e.g., Must-See Musicals"
            placeholderTextColor={Colors.text.muted}
            autoFocus={mode === 'create'}
            maxLength={MAX_NAME}
          />
          <Text style={styles.charCount}>{name.length}/{MAX_NAME}</Text>

          {/* Description toggle */}
          {!showDesc ? (
            <Pressable onPress={() => setShowDesc(true)} style={styles.addDescButton}>
              <Text style={styles.addDescText}>+ Add description</Text>
            </Pressable>
          ) : (
            <>
              <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Description</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMultiline]}
                value={description}
                onChangeText={t => setDescription(t.slice(0, MAX_DESC))}
                placeholder="What's this list about?"
                placeholderTextColor={Colors.text.muted}
                multiline
                numberOfLines={3}
                maxLength={MAX_DESC}
              />
              <Text style={styles.charCount}>{description.length}/{MAX_DESC}</Text>
            </>
          )}

          {/* Ranked toggle */}
          <View style={styles.rankedRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Ranked list</Text>
              <Text style={styles.rankedHint}>Enable drag-to-reorder with numbered rankings</Text>
            </View>
            <Switch
              value={isRanked}
              onValueChange={setIsRanked}
              trackColor={{ false: Colors.border.subtle, true: Colors.brand }}
            />
          </View>

          {/* Delete (edit mode) */}
          {mode === 'edit' && onDelete && (
            <Pressable style={styles.deleteButton} onPress={onDelete}>
              <Text style={styles.deleteButtonText}>Delete List</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDescription: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  ctaButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.brand,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.pill,
  },
  ctaButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  pressed: { opacity: 0.7 },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 100,
  },
  // ─── List card (index) ──────────
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  listCardInfo: {
    flex: 1,
    gap: 2,
  },
  listCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  listCardName: {
    color: Colors.text.primary,
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
  },
  rankedBadge: {
    color: '#f59e0b',
    fontSize: FontSize.xs,
    fontWeight: '700',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  listCardCount: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 3,
  },
  previewPoster: {
    width: 32,
    height: 43,
    borderRadius: 3,
  },
  previewPlaceholder: {
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    fontSize: 14,
  },
  createButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  createButtonText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  // ─── Detail view ────────────────
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  backText: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  moreButton: {
    color: Colors.text.muted,
    fontSize: FontSize.lg,
    fontWeight: '700',
    letterSpacing: 2,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  detailTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    flexShrink: 1,
  },
  rankedBadgeLarge: {
    color: '#f59e0b',
    fontSize: FontSize.xs,
    fontWeight: '700',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  detailDescription: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  // ─── Item row ───────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    backgroundColor: Colors.surface.default,
  },
  itemRowDragging: {
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  rankNumber: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    width: 24,
    textAlign: 'center',
  },
  itemPoster: {
    width: 40,
    height: 54,
    borderRadius: 3,
  },
  itemPosterPlaceholder: {
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 18,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  itemVenue: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  removeButton: {
    padding: Spacing.sm,
  },
  emptyDetailContainer: {
    paddingTop: Spacing.xl,
    alignItems: 'center',
  },
  emptyDetailText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
  // ─── Add show search ────────────
  addShowSection: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  addShowButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addShowButtonText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.subtle,
  },
  searchResultDisabled: {
    opacity: 0.4,
  },
  searchResultPoster: {
    width: 32,
    height: 43,
    borderRadius: 3,
  },
  searchResultTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  searchResultTitleDisabled: {
    color: Colors.text.muted,
  },
  searchResultVenue: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  inListBadge: {
    color: '#fcd34d',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  noResults: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  // ─── Modal ──────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  modalCancel: {
    color: Colors.brand,
    fontSize: FontSize.sm,
  },
  modalTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  modalSave: {
    color: '#fcd34d',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  modalSaveDisabled: {
    opacity: 0.3,
  },
  modalBody: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  fieldLabel: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text.primary,
    fontSize: FontSize.sm,
  },
  fieldInputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    textAlign: 'right',
    marginTop: 4,
  },
  addDescButton: {
    marginTop: Spacing.md,
  },
  addDescText: {
    color: Colors.brand,
    fontSize: FontSize.sm,
  },
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  rankedHint: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  deleteButton: {
    marginTop: Spacing.xxl,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
});
