/**
 * Root layout — forces dark theme, onboarding gate, PostHog analytics, and wraps app in DataProvider.
 */

import React, { useEffect, useState } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import PostHog, { PostHogProvider } from 'posthog-react-native';
import { DataProvider } from '@/lib/data-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Onboarding, hasSeenOnboarding } from '@/components/Onboarding';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/lib/toast-context';
import Toast from '@/components/Toast';
import { featureFlags, loadFeatureFlagOverrides } from '@/lib/feature-flags';
import { setPostHogInstance } from '@/lib/analytics';
import { Colors } from '@/constants/theme';
import { registerForPushNotifications, setupNotificationHandler, configureNotificationChannels } from '@/lib/notifications';
import { initSentry, wrapWithSentry } from '@/lib/sentry';
import { startAutoFlush, flushQueue } from '@/lib/offline-queue';

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

// Initialize PostHog client (guarded against double-init in strict mode)
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
let phInitialized = false;

function initPostHog(): PostHog | null {
  if (!POSTHOG_API_KEY || phInitialized) return null;
  try {
    const client = new PostHog(POSTHOG_API_KEY, {
      host: 'https://us.i.posthog.com',
      enableSessionReplay: false,
      captureAppLifecycleEvents: true,
    });
    setPostHogInstance(client);
    phInitialized = true;
    return client;
  } catch (e) {
    if (__DEV__) console.warn('[PostHog] Init failed:', e);
    return null;
  }
}

function RootLayout() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [phClient, setPhClient] = useState<PostHog | null>(null);
  const [phReady, setPhReady] = useState(!POSTHOG_API_KEY); // skip wait if no key

  useEffect(() => {
    // Init crash reporting first — catches errors during startup
    initSentry();

    // Start offline queue auto-flush + flush any pending operations
    startAutoFlush();
    flushQueue().catch(() => {});

    // Init PostHog synchronously (constructor), load flags + onboarding async
    const client = initPostHog();
    if (client) setPhClient(client);
    setPhReady(true);

    Promise.all([
      loadFeatureFlagOverrides(),
      hasSeenOnboarding(),
    ])
      .then(([, seen]) => setShowOnboarding(!seen))
      .catch(() => setShowOnboarding(false));

    // Check for OTA updates in background (non-blocking)
    if (!__DEV__) {
      try {
        const Updates = require('expo-updates');
        Updates.checkForUpdateAsync()
          .then(({ isAvailable }: { isAvailable: boolean }) => {
            if (isAvailable) return Updates.fetchUpdateAsync();
          })
          .then((result: { isNew?: boolean } | undefined) => {
            if (result?.isNew) Updates.reloadAsync();
          })
          .catch(() => {}); // Silent fail — network errors are fine
      } catch {} // Native module not available in dev client
    }
  }, []);

  // Register push notifications + set up tap handler
  // Runs once; actual permission prompt only fires after onboarding is dismissed
  useEffect(() => {
    if (showOnboarding !== false) return; // Wait until onboarding is done
    configureNotificationChannels();
    registerForPushNotifications();
    const cleanup = setupNotificationHandler();
    return () => { cleanup?.(); };
  }, [showOnboarding]);

  // Wait for onboarding check + PostHog before rendering
  if (showOnboarding === null || !phReady) return null;

  // Wrap content with PostHogProvider if client available
  const wrapWithPostHog = (children: React.ReactNode) => {
    if (phClient) {
      return (
        <PostHogProvider client={phClient} autocapture={{ captureScreens: false }}>
          {children}
        </PostHogProvider>
      );
    }
    return <>{children}</>;
  };

  if (showOnboarding) {
    const onboardingContent = (
      <>
        <Onboarding onDone={() => setShowOnboarding(false)} />
        <StatusBar style="light" />
      </>
    );
    return (
      <ErrorBoundary>
        {wrapWithPostHog(
          featureFlags.userAccounts ? (
            <AuthProvider>{onboardingContent}</AuthProvider>
          ) : (
            onboardingContent
          )
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
    {wrapWithPostHog(
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
    )}
    </ErrorBoundary>
  );
}

// Wrap with Sentry's error boundary for native crash capture
export default wrapWithSentry(RootLayout);
