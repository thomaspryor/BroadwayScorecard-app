/**
 * Search tab — Fuse.js fuzzy search on show titles, venues, creative team.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet } from 'react-native';
import Fuse, { IFuseOptions } from 'fuse.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const FUSE_OPTIONS: IFuseOptions<Show> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'venue', weight: 1 },
    { name: 'creativeTeam.name', weight: 0.7 },
  ],
  threshold: 0.35,
  includeScore: true,
  minMatchCharLength: 2,
};

export default function SearchScreen() {
  const { shows } = useShows();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const fuse = useMemo(() => new Fuse(shows, FUSE_OPTIONS), [shows]);

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    return fuse.search(q, { limit: 50 }).map(r => r.item);
  }, [fuse, query]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <TextInput
          style={styles.input}
          placeholder="Search shows, theaters, creative team..."
          placeholderTextColor={Colors.text.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {query.trim().length < 2 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Search for shows by title, theater, or creative team
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            No shows found for &ldquo;{query}&rdquo;
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <AnimatedListItem index={index}>
              <ShowCard show={item} />
            </AnimatedListItem>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          windowSize={5}
          maxToRenderPerBatch={8}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.text.primary,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
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
});
