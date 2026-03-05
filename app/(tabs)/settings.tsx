/**
 * Settings / More tab — app info, data refresh, links to web features.
 * When signed in: profile card + sign-out (gated by feature flag).
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useShows } from '@/lib/data-context';
import { useAuth } from '@/lib/auth-context';
import { clearUserCache } from '@/lib/user-cache';
import { featureFlags } from '@/lib/feature-flags';
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
  const router = useRouter();

  // Auth hooks — always called (React rules), but UI gated by feature flag
  const auth = useAuth();
  const { user, profile, isAuthenticated, signOut, showSignIn } = auth;

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
          // Preserve onboarding flag + auth SecureStore keys when clearing cache
          const onboardingSeen = await AsyncStorage.getItem('@broadwayScorecard:onboardingSeen');
          // Clear user cache if signed in
          if (user?.id) await clearUserCache(user.id);
          // Clear AsyncStorage (show data cache) but preserve keys
          await AsyncStorage.clear();
          if (onboardingSeen) {
            await AsyncStorage.setItem('@broadwayScorecard:onboardingSeen', onboardingSeen);
          }
          Alert.alert('Done', 'Cache cleared. Pull down to refresh.');
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          if (user?.id) await clearUserCache(user.id);
          await signOut();
          router.replace('/(tabs)');
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

      {/* Profile section — feature-flagged */}
      {featureFlags.userAccounts && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          {isAuthenticated && profile ? (
            <>
              <View style={styles.profileCard}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                    {(profile.display_name || user?.email || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  {profile.display_name && (
                    <Text style={styles.profileName}>{profile.display_name}</Text>
                  )}
                  {user?.email && (
                    <Text style={styles.profileEmail}>{user.email}</Text>
                  )}
                </View>
              </View>
              <SettingsRow label="Sign Out" onPress={handleSignOut} />
            </>
          ) : (
            <SettingsRow label="Sign In" onPress={() => showSignIn()} />
          )}
        </View>
      )}

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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface.raised,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    color: '#FFD700',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  profileEmail: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
});
