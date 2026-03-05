/**
 * First-launch onboarding — 3 swipeable feature pages + optional sign-in page.
 * Uses AsyncStorage to track if user has seen it.
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth-context';
import { featureFlags } from '@/lib/feature-flags';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const ONBOARDING_KEY = '@broadwayScorecard:onboardingSeen';

interface OnboardingPage {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
}

const BASE_PAGES: OnboardingPage[] = [
  {
    id: 'scores',
    emoji: '\u2B50',
    title: 'Critic Scores for Every Show',
    subtitle: 'Aggregated reviews from 400+ outlets, weighted by critic tier. One score, instant clarity.',
  },
  {
    id: 'markets',
    emoji: '\uD83C\uDFAD',
    title: 'Broadway, Off-Broadway & West End',
    subtitle: 'Browse musicals and plays across New York and London. Filter by status, type, and sort by score.',
  },
  {
    id: 'offline',
    emoji: '\uD83D\uDCF1',
    title: 'Works Offline',
    subtitle: 'Show data is cached on your device. Check scores anytime \u2014 no signal required.',
  },
];

const SIGN_IN_PAGE: OnboardingPage = {
  id: 'signin',
  emoji: '\u2728',
  title: 'Track Your Broadway Journey',
  subtitle: 'Rate shows, keep a diary, and build your watchlist \u2014 synced across all your devices.',
};

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {}
}

interface OnboardingProps {
  onDone: () => void;
}

export function Onboarding({ onDone }: OnboardingProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const listRef = useRef<FlatList>(null);
  const { width } = useWindowDimensions();
  const { showSignIn, isAuthenticated } = useAuth();
  const signInTriggered = useRef(false);

  const pages = useMemo(
    () => (featureFlags.userAccounts ? [...BASE_PAGES, SIGN_IN_PAGE] : BASE_PAGES),
    [],
  );

  // Auto-dismiss onboarding after successful sign-in
  useEffect(() => {
    if (isAuthenticated && signInTriggered.current) {
      handleDone();
    }
  }, [isAuthenticated]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    if (page !== currentPage) {
      setCurrentPage(page);
    }
  };

  const handleNext = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentPage < pages.length - 1) {
      listRef.current?.scrollToIndex({ index: currentPage + 1, animated: true });
    } else {
      handleDone();
    }
  };

  const handleDone = async () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markOnboardingSeen();
    onDone();
  };

  const handleSignIn = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    signInTriggered.current = true;
    showSignIn('generic');
  };

  const renderPage = ({ item }: { item: OnboardingPage }) => (
    <View style={[styles.page, { width }]}>
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
    </View>
  );

  const isLast = currentPage === pages.length - 1;
  const isSignInPage = featureFlags.userAccounts && currentPage === pages.length - 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={pages}
        renderItem={renderPage}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {pages.map((page, i) => (
          <View
            key={page.id}
            style={[styles.dot, i === currentPage && styles.dotActive]}
          />
        ))}
      </View>

      {/* Buttons — sign-in page has custom layout */}
      {isSignInPage ? (
        <View style={styles.signInButtons}>
          <Pressable
            onPress={handleSignIn}
            style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
          >
            <Text style={styles.nextText}>Sign In</Text>
          </Pressable>
          <Pressable onPress={handleDone} style={styles.justBrowsingButton}>
            <Text style={styles.justBrowsingText}>Just Browsing</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.buttons, isLast && styles.buttonsCentered]}>
          {!isLast && (
            <Pressable onPress={handleDone} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
          >
            <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
          </Pressable>
          {!isLast && <View style={styles.skipButton} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.xl,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surface.elevated,
  },
  dotActive: {
    backgroundColor: Colors.brand,
    width: 24,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  buttonsCentered: {
    justifyContent: 'center',
  },
  skipButton: {
    width: 60,
  },
  skipText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
  },
  nextButton: {
    backgroundColor: Colors.brand,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.pill,
  },
  nextButtonPressed: {
    opacity: 0.8,
  },
  nextText: {
    color: Colors.text.inverse,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  // Sign-in page buttons
  signInButtons: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  justBrowsingButton: {
    paddingVertical: Spacing.sm,
  },
  justBrowsingText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
  },
});
