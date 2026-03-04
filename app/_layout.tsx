/**
 * Root layout — forces dark theme, onboarding gate, and wraps app in DataProvider.
 */

import React, { useEffect, useState } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { DataProvider } from '@/lib/data-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Onboarding, hasSeenOnboarding } from '@/components/Onboarding';
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
    hasSeenOnboarding().then(seen => setShowOnboarding(!seen));
  }, []);

  // Wait for onboarding check before rendering
  if (showOnboarding === null) return null;

  if (showOnboarding) {
    return (
      <>
        <Onboarding onDone={() => setShowOnboarding(false)} />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <ErrorBoundary>
    <ThemeProvider value={BroadwayDark}>
      <DataProvider>
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
        <StatusBar style="light" />
      </DataProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
