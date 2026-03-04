/**
 * Settings / More tab — app info, data refresh, links to web features.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useShows } from '@/lib/data-context';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const WEB = 'https://broadwayscorecard.com';

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

  const handleClearCache = () => {
    Alert.alert('Clear Cache', 'This will remove all cached data. The app will re-download show data on next launch.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          // Preserve onboarding flag when clearing cache
          const onboardingSeen = await AsyncStorage.getItem('@broadwayScorecard:onboardingSeen');
          await AsyncStorage.clear();
          if (onboardingSeen) {
            await AsyncStorage.setItem('@broadwayScorecard:onboardingSeen', onboardingSeen);
          }
          Alert.alert('Done', 'Cache cleared. Pull down to refresh.');
        },
      },
    ]);
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const lastUpdatedText = lastUpdated
    ? lastUpdated.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never';

  const open = (path: string) => WebBrowser.openBrowserAsync(`${WEB}${path}`);

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
        <SettingsRow label="Clear cache" onPress={handleClearCache} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>EXPLORE</Text>
        <SettingsRow label="Best-Of Lists" onPress={() => open('/best/best-musicals')} />
        <SettingsRow label="Tony Predictions" onPress={() => open('/tony-awards/predictions')} />
        <SettingsRow label="Box Office" onPress={() => open('/box-office')} />
        <SettingsRow label="Lottery & Rush Tickets" onPress={() => open('/lotteries')} />
        <SettingsRow label="Audience Buzz" onPress={() => open('/audience-buzz')} />
        <SettingsRow label="Best Value Tickets" onPress={() => open('/best-value')} />
        <SettingsRow label="Critics Index" onPress={() => open('/critics')} />
        <SettingsRow label="Theater Guide" onPress={() => open('/guides/cheap-broadway-tickets')} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <SettingsRow label="Visit Website" onPress={() => open('/')} />
        <SettingsRow label="How Scoring Works" onPress={() => open('/methodology')} />
        <SettingsRow label="About" onPress={() => open('/about')} />
        <SettingsRow label="Send Feedback" onPress={() => open('/feedback')} />
        <SettingsRow label="Privacy Policy" onPress={() => open('/privacy')} />
        <SettingsRow label="Version" value={appVersion} />
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
