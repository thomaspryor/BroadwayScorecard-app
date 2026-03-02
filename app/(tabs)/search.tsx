/**
 * Search tab — fuzzy search on show titles, venues, creative team.
 * Sprint 2 will add Fuse.js integration.
 * For now, simple case-insensitive substring matching.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function SearchScreen() {
  const { shows } = useShows();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return shows.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.venue.toLowerCase().includes(q) ||
      s.creativeTeam.some(m => m.name.toLowerCase().includes(q))
    );
  }, [shows, query]);

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
        />
      </View>

      {query.trim().length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
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
          renderItem={({ item }) => <ShowCard show={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
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
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
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
