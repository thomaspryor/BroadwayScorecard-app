/**
 * Lists tab — user's custom show lists.
 *
 * Reuses the existing ListsTab component from the old My Shows tab.
 */

import React, { useMemo, useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useShows } from '@/lib/data-context';
import { featureFlags } from '@/lib/feature-flags';
import ListsTab from '@/components/user/ListsTab';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, loading: authLoading, showSignIn } = useAuth();
  const { shows } = useShows();

  const showMap = useMemo(() => {
    const map: Record<string, Show> = {};
    for (const s of shows) map[s.id] = s;
    return map;
  }, [shows]);

  // ListsTab owns the lists (its own useUserLists) and loads them on mount.
  // This screen used to hold a second instance whose `loading` swapped
  // ListsTab out for a skeleton on every tab focus, which unmounted it and
  // threw away the open list. Now a focus only bumps refreshSignal, and
  // ListsTab refetches in place. The first focus is the mount; skip it.
  const [refreshSignal, setRefreshSignal] = useState(0);
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      setRefreshSignal(n => n + 1);
    }, []),
  );

  const loading = authLoading;

  if (!featureFlags.userAccounts) return null;

  if (!authLoading && !isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>My Lists</Text>
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaEmoji}>📋</Text>
          <Text style={styles.ctaTitle}>Organize your shows</Text>
          <Text style={styles.ctaDescription}>
            Sign in to create custom lists — group shows by theme, plan trips, or share recommendations.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
            onPress={() => showSignIn('rating')}
            accessibilityRole="button"
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
        <Text style={styles.pageTitle}>My Lists</Text>
        <View style={{ paddingTop: Spacing.lg, paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
          {[0, 1, 2].map(i => (
            <Skeleton key={i} width="100%" height={70} borderRadius={BorderRadius.md} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>My Lists</Text>
      </View>
      {user && <ListsTab userId={user.id} showMap={showMap} refreshSignal={refreshSignal} />}
    </View>
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
  ctaContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  ctaEmoji: { fontSize: 64, marginBottom: Spacing.lg },
  ctaTitle: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  ctaDescription: { color: Colors.text.secondary, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },
  ctaButton: {
    marginTop: Spacing.xl, backgroundColor: Colors.brand, borderRadius: 12,
    paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md,
  },
  ctaButtonText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '700' },
});
