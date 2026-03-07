/**
 * Sentry crash reporting initialization.
 *
 * Wraps @sentry/react-native with lazy loading (prevents crash
 * if native module isn't available in dev client / Expo Go).
 */

let Sentry: typeof import('@sentry/react-native') | null = null;

try {
  Sentry = require('@sentry/react-native');
} catch {
  if (__DEV__) console.warn('[Sentry] Native module not available');
}

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

let initialized = false;

export function initSentry() {
  if (initialized || !Sentry || !SENTRY_DSN) return;
  initialized = true;

  Sentry.init({
    dsn: SENTRY_DSN,
    // Disable in dev to avoid noise
    enabled: !__DEV__,
    // Performance monitoring — low sample rate to minimize overhead
    tracesSampleRate: 0.1,
    // Send 100% of errors (we're low-volume)
    sampleRate: 1.0,
    // Attach user info when available
    sendDefaultPii: false,
    // Filter out common noise
    beforeSend(event) {
      // Skip network errors (flaky connections are expected on mobile)
      const message = event.exception?.values?.[0]?.value || '';
      if (/network request failed|fetch failed|load failed|aborterror/i.test(message)) {
        return null;
      }
      return event;
    },
  });
}

/** Wrap root component with Sentry error boundary */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapWithSentry(component: React.ComponentType<any>): React.ComponentType<any> {
  if (Sentry?.wrap) {
    return Sentry.wrap(component);
  }
  return component;
}

/** Set user context for crash reports */
export function setSentryUser(userId: string, email?: string) {
  Sentry?.setUser({ id: userId, email });
}

/** Clear user context on sign-out */
export function clearSentryUser() {
  Sentry?.setUser(null);
}

/** Add breadcrumb for debugging crash context */
export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, string | number | boolean>,
) {
  Sentry?.addBreadcrumb({
    category,
    message,
    data,
    level: 'info',
  });
}

/** Manually capture an error */
export function captureException(error: Error, context?: Record<string, string>) {
  if (context) {
    Sentry?.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
      Sentry?.captureException(error);
    });
  } else {
    Sentry?.captureException(error);
  }
}

/** Get the Sentry navigation integration for Expo Router */
export function getSentryNavigationIntegration() {
  if (!Sentry) return null;
  return Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: true,
  });
}
