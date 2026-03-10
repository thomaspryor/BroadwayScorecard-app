/**
 * ShowSearchModal — lightweight modal for searching and selecting a show.
 *
 * Used by Watched tab (to rate) and To Watch tab (to add to watchlist).
 * Shows search input + results. Calls onSelect with the chosen show.
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import Fuse, { IFuseOptions } from 'fuse.js';
import { useShows } from '@/lib/data-context';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge } from '@/components/show-cards';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const FUSE_OPTIONS: IFuseOptions<Show> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'venue', weight: 1 },
  ],
  threshold: 0.35,
  minMatchCharLength: 2,
};

interface ShowSearchModalProps {
  visible: boolean;
  title: string;
  onSelect: (show: Show) => void;
  onClose: () => void;
  /** Show IDs to exclude from results (already added) */
  excludeIds?: Set<string>;
}

export function ShowSearchModal({ visible, title, onSelect, onClose, excludeIds }: ShowSearchModalProps) {
  const { shows } = useShows();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset query when modal opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setDebouncedQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(text), 150);
  }, []);

  const fuse = useMemo(() => new Fuse(shows, FUSE_OPTIONS), [shows]);

  const results = useMemo(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) return [];
    let items = fuse.search(q, { limit: 20 }).map(r => r.item);
    if (excludeIds?.size) {
      items = items.filter(s => !excludeIds.has(s.id));
    }
    return items;
  }, [fuse, debouncedQuery, excludeIds]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ minWidth: 60 }} />
        </View>

        {/* Search input */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search shows..."
            placeholderTextColor={Colors.text.muted}
            value={query}
            onChangeText={handleQueryChange}
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>

        {/* Results */}
        {query.trim().length < 2 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Search for a show by name</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No shows found</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const posterUrl = getImageUrl(item.images.poster) || getImageUrl(item.images.thumbnail);
              return (
                <Pressable
                  style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                  onPress={() => onSelect(item)}
                >
                  {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={styles.resultPoster} contentFit="cover" />
                  ) : (
                    <View style={[styles.resultPoster, styles.resultPlaceholder]}>
                      <Text style={styles.placeholderText}>{item.title.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                    {item.venue && <Text style={styles.resultVenue} numberOfLines={1}>{item.venue}</Text>}
                    <Text style={styles.resultMeta} numberOfLines={1}>
                      {item.status === 'open' ? 'Now Playing' : item.status === 'previews' ? 'In Previews' : item.status === 'closed' ? 'Closed' : item.status}
                      {item.openingDate ? ` · ${item.openingDate.slice(0, 4)}` : ''}
                      {item.closingDate && item.status === 'closed' ? `–${item.closingDate.slice(0, 4)}` : ''}
                      {item.category === 'west-end' ? ' · London' : item.category === 'off-broadway' ? ' · Off-Bway' : ''}
                    </Text>
                  </View>
                  <ScoreBadge score={item.compositeScore} size="small" />
                </Pressable>
              );
            }}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  cancelText: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    minWidth: 60,
  },
  headerTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: FontSize.md,
    padding: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  list: {
    paddingBottom: Spacing.xxl,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  resultPoster: {
    width: 44,
    height: 58,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  resultPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.muted,
    fontSize: 18,
    fontWeight: '600',
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  resultVenue: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  resultMeta: {
    color: Colors.text.muted,
    fontSize: 10,
  },
});
