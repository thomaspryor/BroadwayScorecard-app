/**
 * Root layout — forces dark theme, onboarding gate, and wraps app in DataProvider.
 */

import React, { useEffect, useState } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import 'react-native-reanimated';

import { DataProvider } from '@/lib/data-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Onboarding, hasSeenOnboarding } from '@/components/Onboarding';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast-context';
import Toast from '@/components/Toast';
import { featureFlags, loadFeatureFlagOverrides } from '@/lib/feature-flags';
import { Colors } from '@/constants/theme';

// Custom dark theme matching our design tokens
const BroadwayDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.surface.default,
    card: Colors.surface.default,
    text: Colors.text.primary,
    border: Colors.surface.raised,
    primary: Colors.brand,
  },
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    // Load feature flag overrides + onboarding check in parallel
    Promise.all([
      loadFeatureFlagOverrides(),
      hasSeenOnboarding(),
    ])
      .then(([, seen]) => setShowOnboarding(!seen))
      .catch(() => setShowOnboarding(false));

    // Check for OTA updates in background (non-blocking)
    if (!__DEV__) {
      Updates.checkForUpdateAsync()
        .then(({ isAvailable }) => {
          if (isAvailable) {
            Updates.fetchUpdateAsync().then(() => {
              // Update downloaded — will apply on next app restart
            });
          }
        })
        .catch(() => {}); // Silent fail — network errors are fine
    }
  }, []);

  // Wait for onboarding check before rendering
  if (showOnboarding === null) return null;

  if (showOnboarding) {
    const onboardingContent = (
      <>
        <Onboarding onDone={() => setShowOnboarding(false)} />
        <StatusBar style="light" />
      </>
    );
    return (
      <ErrorBoundary>
        {featureFlags.userAccounts ? (
          <AuthProvider>{onboardingContent}</AuthProvider>
        ) : (
          onboardingContent
        )}
      </ErrorBoundary>
    );
  }

  const appContent = (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="show/[slug]"
        options={{
          headerShown: true,
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: Colors.surface.default },
          headerTintColor: Colors.brand,
          headerTitleStyle: { color: Colors.text.primary },
          title: '',
          animation: 'slide_from_right',
        }}
      />
    </Stack>
  );

  return (
    <ErrorBoundary>
    <ThemeProvider value={BroadwayDark}>
      <ToastProvider>
      <DataProvider>
        {featureFlags.userAccounts ? (
          <AuthProvider>{appContent}</AuthProvider>
        ) : (
          appContent
        )}
        <StatusBar style="light" />
      </DataProvider>
      <Toast />
      </ToastProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
