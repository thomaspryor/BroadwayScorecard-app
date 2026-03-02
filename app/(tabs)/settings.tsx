/**
 * Settings / More tab — app info, data refresh, links.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useShows } from '@/lib/data-context';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

function SettingsRow({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, onPress && pressed && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.rowLabel, onPress && styles.rowLink]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { lastUpdated, refresh, shows } = useShows();
  const insets = useSafeAreaInsets();

  const handleRefresh = async () => {
    try {
      await refresh();
      Alert.alert('Updated', 'Show data has been refreshed.');
    } catch {
      Alert.alert('Error', 'Failed to refresh data. Check your connection.');
    }
  };

  const lastUpdatedText = lastUpdated
    ? lastUpdated.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never';

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>More</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DATA</Text>
        <SettingsRow label="Shows loaded" value={`${shows.length}`} />
        <SettingsRow label="Last updated" value={lastUpdatedText} />
        <SettingsRow label="Refresh data" onPress={handleRefresh} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LINKS</Text>
        <SettingsRow
          label="Visit Website"
          onPress={() => WebBrowser.openBrowserAsync('https://broadwayscorecard.com')}
        />
        <SettingsRow
          label="How Scoring Works"
          onPress={() => WebBrowser.openBrowserAsync('https://broadwayscorecard.com/methodology')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <SettingsRow label="Version" value="1.0.0" />
        <SettingsRow label="Broadway Scorecard" value="broadwayscorecard.com" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface.raised,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowLabel: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
  },
  rowLink: {
    color: Colors.brand,
  },
  rowValue: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
  },
});
