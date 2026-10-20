/**
 * Root layout — forces dark theme, onboarding gate, PostHog analytics, and wraps app in DataProvider.
 */

import React, { useEffect, useRef, useState } from 'react';
import { DarkTheme, ThemeProvider , Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import PostHog, { PostHogProvider } from 'posthog-react-native';
import { DataProvider, useShows } from '@/lib/data-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Onboarding, hasSeenOnboarding } from '@/components/Onboarding';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { LocalWatchlistMigrator } from '@/hooks/useLocalWatchlistMigration';
import WelcomeGate from '@/components/onboarding/WelcomeGate';
import { MarketProvider } from '@/lib/market-context';
import { ToastProvider } from '@/lib/toast-context';
import Toast from '@/components/Toast';
import { featureFlags, loadFeatureFlagOverrides } from '@/lib/feature-flags';
import { setPostHogInstance } from '@/lib/analytics';
import { Colors } from '@/constants/theme';
import { registerForPushNotifications, setupNotificationHandler, configureNotificationChannels } from '@/lib/notifications';
import { initSentry, wrapWithSentry } from '@/lib/sentry';
import { hydrateDiaryTitles } from '@/lib/diary-titles';
import { startAutoFlush, flushQueue } from '@/lib/offline-queue';
import { rescheduleAllReminders } from '@/lib/local-notifications';
import { getUserWatchlistCache } from '@/lib/user-cache';
import { makeShowTitleLookup, parseCachedWatchlist } from '@/lib/rate-reminders';

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

/**
 * Re-schedules the signed-in user's planned-date reminders once per account
 * per launch (recovers from an app kill / iOS dropping them). Rendered inside
 * AuthProvider + DataProvider, after onboarding, so it reads the CURRENT
 * user's watchlist cache and the show list DataProvider already parsed. The
 * old version took whichever @bsc:watchlist:* key getAllKeys() listed first
 * (possibly another account's) and re-parsed the 2.1MB show feed.
 */
function ReminderRescheduler() {
  const { user } = useAuth();
  const { shows } = useShows();
  const userId = user?.id ?? null;
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    // Sign-out cancels every reminder, so the same account signing back in
    // has to be rescheduled again.
    if (!userId) { doneFor.current = null; return; }
    if (shows.length === 0 || doneFor.current === userId) return;
    doneFor.current = userId;
    (async () => {
      try {
        const entries = parseCachedWatchlist(await getUserWatchlistCache(userId));
        if (entries.length === 0) return;
        await rescheduleAllReminders(entries, makeShowTitleLookup(shows));
      } catch {
        // Non-critical — reminders just won't be rescheduled this launch
      }
    })();
  }, [userId, shows]);

  return null;
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

    // Titles for imported diary-only shows (ids the scored catalog can never
    // resolve) — without this they render as their humanized slug everywhere.
    hydrateDiaryTitles().catch(() => {});

    // Init PostHog just off the sync effect path — analytics can start a tick
    // late, and this keeps the effect body free of synchronous setState.
    queueMicrotask(() => {
      const client = initPostHog();
      if (client) setPhClient(client);
      setPhReady(true);
    });

    Promise.all([
      loadFeatureFlagOverrides(),
      hasSeenOnboarding(),
    ])
      .then(([, seen]) => setShowOnboarding(!seen))
      .catch(() => setShowOnboarding(false));

    // Check for OTA updates in background (non-blocking)
    if (!__DEV__) {
      try {
        // Deliberately lazy: expo-updates is absent in Expo Go, and a static import would
        // crash dev startup.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
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

    // Planned-date reminders are rescheduled by <ReminderRescheduler />, which
    // needs the auth + show data contexts this component sits above.

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
        // Pushed screens otherwise inherit the previous ROUTE name as the back
        // label — Settings showed "(tabs)" (beta feedback 2026-07-25).
        headerBackTitle: 'Back',
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
      <Stack.Screen
        name="diary-show/[id]"
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
      <Stack.Screen
        name="settings"
        options={{
          headerShown: true,
          title: 'Settings',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: Colors.surface.default },
          headerTintColor: Colors.brand,
          headerTitleStyle: { color: Colors.text.primary },
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="rate/[showId]"
        options={{
          presentation: 'modal',
          headerShown: false,
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="import"
        options={{
          presentation: 'modal',
          headerShown: false,
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );

  return (
    <ErrorBoundary>
    {wrapWithPostHog(
    <ThemeProvider value={BroadwayDark}>
      <ToastProvider>
      <MarketProvider>
      <DataProvider>
        {featureFlags.userAccounts ? (
          <AuthProvider>
            {appContent}
            <LocalWatchlistMigrator />
            <ReminderRescheduler />
            <WelcomeGate />
          </AuthProvider>
        ) : (
          appContent
        )}
        <StatusBar style="light" />
      </DataProvider>
      </MarketProvider>
      <Toast />
      </ToastProvider>
    </ThemeProvider>
    )}
    </ErrorBoundary>
  );
}

// Wrap with Sentry's error boundary for native crash capture
export default wrapWithSentry(RootLayout);
