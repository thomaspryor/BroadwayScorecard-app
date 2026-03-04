/**
 * First-launch onboarding — 3 swipeable pages with key features.
 * Uses AsyncStorage to track if user has seen it.
 */

import React, { useRef, useState } from 'react';
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
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const ONBOARDING_KEY = '@broadwayScorecard:onboardingSeen';

interface OnboardingPage {
  emoji: string;
  title: string;
  subtitle: string;
}

const PAGES: OnboardingPage[] = [
  {
    emoji: '\u2B50',
    title: 'Critic Scores for Every Show',
    subtitle: 'Aggregated reviews from 400+ outlets, weighted by critic tier. One score, instant clarity.',
  },
  {
    emoji: '\uD83C\uDFAD',
    title: 'Broadway, Off-Broadway & West End',
    subtitle: 'Browse musicals and plays across New York and London. Filter by status, type, and sort by score.',
  },
  {
    emoji: '\uD83D\uDCF1',
    title: 'Works Offline',
    subtitle: 'Show data is cached on your device. Check scores anytime — no signal required.',
  },
];

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

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    if (page !== currentPage) {
      setCurrentPage(page);
    }
  };

  const handleNext = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentPage < PAGES.length - 1) {
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

  const renderPage = ({ item }: { item: OnboardingPage }) => (
    <View style={[styles.page, { width }]}>
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
    </View>
  );

  const isLast = currentPage === PAGES.length - 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={PAGES}
        renderItem={renderPage}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {PAGES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentPage && styles.dotActive]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.buttons}>
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
});
