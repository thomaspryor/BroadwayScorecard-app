/**
 * Opens the one-time welcome sheet (BRO-4727) for a brand-new account, once.
 * App port of the web's src/components/onboarding/WelcomeGate.tsx (BRO-4619).
 * Mounted inside AuthProvider in app/_layout.tsx; renders nothing for
 * everyone else.
 *
 * Order of checks: shouldOfferWelcome() on the loaded profile (no network),
 * then wait until nothing else is on screen (a rating saved before sign-in
 * still being replayed, the rating sheet, the import screen), then
 * claim_onboarding() on the server, which returns true for exactly one caller
 * per account across web and app. Only then does the sheet open.
 *
 * Preview: the web build (npm run web) on localhost with ?welcome=preview
 * opens it without an account (nothing is written or tracked), for visual QA.
 */

import React, { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { getPendingAction } from '@/lib/deferred-auth';
import { getSupabaseClient } from '@/lib/supabase';
import { shouldOfferWelcome, welcomeSeenKey } from '@/lib/welcome-onboarding';
import WelcomeSheet from './WelcomeSheet';

/** The gate sits over every screen: a render error in the sheet must not take the app down. */
class SheetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('[welcome] sheet failed to render', error); }
  render() { return this.state.failed ? null : this.props.children; }
}

const FIRST_CHECK_MS = 1200;
const BUSY_RETRY_MS = 1500;
/**
 * How long a pending sign-in action holds the welcome back: about 30 s. One
 * that is never replayed (it lives up to an hour) must not cost a new
 * account its welcome, so after that the sheet opens anyway.
 */
const MAX_PENDING_RETRIES = 20;
/** Screens the sheet waits for, however long they stay open. */
const BUSY_ROUTES = ['/rate', '/import'];

function isPreviewRequest(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const { hostname, search } = window.location;
  return (hostname === 'localhost' || hostname === '127.0.0.1')
    && new URLSearchParams(search).get('welcome') === 'preview';
}

export default function WelcomeGate() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  // 'preview', or the id of the account the sheet was claimed for.
  const [openFor, setOpenFor] = useState<string | null>(() => (isPreviewRequest() ? 'preview' : null));
  const userId = user?.id ?? null;
  // Signed out, or now a different account: the claimed sheet is not theirs.
  const open = openFor === 'preview' || (openFor !== null && openFor === userId);
  const seenAt = profile?.onboarding_seen_at;
  const createdAt = profile?.created_at ?? null;
  const profileLoaded = !!profile;
  const mounted = useRef(true);
  // Set on every mount: React's dev double-mount runs the cleanup once first.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Read inside the retry loop without restarting it on every navigation.
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  useEffect(() => {
    if (!userId || !profileLoaded || open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const key = welcomeSeenKey(userId);

    const busy = async (): Promise<'route' | 'pending' | null> => {
      const path = pathRef.current || '';
      if (BUSY_ROUTES.some(r => path.startsWith(r))) return 'route';
      return (await getPendingAction()) ? 'pending' : null;
    };

    const attempt = async () => {
      if (cancelled) return;
      const reason = await busy();
      if (reason === 'route' || (reason === 'pending' && ++tries <= MAX_PENDING_RETRIES)) {
        if (!cancelled) timer = setTimeout(attempt, BUSY_RETRY_MS);
        return;
      }
      const client = getSupabaseClient();
      if (!client || cancelled) return;
      const { data, error } = await client.rpc('claim_onboarding');
      if (error) return; // e.g. the migration is not applied: show nothing
      AsyncStorage.setItem(key, '1').catch(() => {});
      if (data !== true) return;
      // Once claimed it is spent, so open even if this effect re-ran meanwhile,
      // but never over a screen (rating, sign-in) opened while the claim was in flight.
      const openWhenFree = () => {
        if (!mounted.current) return;
        const path = pathRef.current || '';
        if (BUSY_ROUTES.some(r => path.startsWith(r))) { setTimeout(openWhenFree, BUSY_RETRY_MS); return; }
        setOpenFor(userId);
      };
      openWhenFree();
    };

    (async () => {
      let locallySeen = false;
      try { locallySeen = (await AsyncStorage.getItem(key)) === '1'; } catch { /* storage unavailable */ }
      if (cancelled) return;
      if (!shouldOfferWelcome({ profile: { onboarding_seen_at: seenAt, created_at: createdAt }, now: Date.now(), locallySeen })) return;
      timer = setTimeout(attempt, FIRST_CHECK_MS);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, profileLoaded, seenAt, createdAt, open]);

  if (!open) return null;
  return (
    <SheetBoundary>
      <WelcomeSheet userId={openFor === 'preview' ? null : userId} onClose={() => setOpenFor(null)} />
    </SheetBoundary>
  );
}
