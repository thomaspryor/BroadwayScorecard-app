/**
 * AuthProvider for the mobile app.
 *
 * Provides sign-in (Apple native + Google native SDK),
 * sign-out, profile loading, and the sign-in sheet trigger.
 *
 * Ported from web's src/contexts/AuthContext.tsx with native auth flows.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { getSupabaseClient } from './supabase';
import type { UserProfile } from './user-types';
import SignInSheet from '@/components/SignInSheet';
import { trackSignInStarted, trackSignInCompleted, trackSignOut as trackSignOutEvent, identifyUser, resetAnalyticsUser } from '@/lib/analytics';
import { setSentryUser, clearSentryUser } from '@/lib/sentry';

// Lazy-load native auth modules — they crash at import time if native modules
// aren't registered (e.g. dev client built without the plugin, or Expo Go).
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
let GoogleSignin: (typeof import('@react-native-google-signin/google-signin'))['GoogleSignin'] | null = null;

try {
  AppleAuthentication = require('expo-apple-authentication');
} catch {
  console.warn('[Auth] expo-apple-authentication not available');
}

try {
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod.GoogleSignin;

  // Configure Google Sign-In native SDK
  const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
  GoogleSignin!.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ['profile', 'email'],
  });
} catch {
  console.warn('[Auth] @react-native-google-signin not available');
}

type SignInContext = 'rating' | 'watchlist' | 'generic';

interface AuthContextValue {
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Show sign-in sheet with context */
  showSignIn: (context?: SignInContext) => void;
  /** Dev-only email/password sign-in for simulator testing */
  devSignIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetContext, setSheetContext] = useState<SignInContext>('generic');
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInProvider, setSignInProvider] = useState<'google' | 'apple' | null>(null);

  // ─── Initialize auth state ───────────────────────────────
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      return;
    }

    // Get existing session
    client.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email || '' });
        loadProfile(session.user.id);
        setLoading(false);
      } else if (__DEV__ && process.env.EXPO_PUBLIC_DEV_AUTO_SIGNIN === '1') {
        // Auto-sign-in with dev test account for simulator testing
        console.log('[Auth] Dev auto-sign-in triggered');
        try {
          const { error } = await client.auth.signInWithPassword({
            email: 'dev-test@broadwayscorecard.com',
            password: 'dev-test-local-only-2024',
          });
          if (error) console.error('[Auth] Dev auto-sign-in failed:', error.message);
        } catch (e) {
          console.error('[Auth] Dev auto-sign-in error:', e);
        }
        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser({ id: session.user.id, email: session.user.email || '' });
        loadProfile(session.user.id);
        setSheetOpen(false);
        setSignInLoading(false);
        setSignInProvider(null);
        identifyUser(session.user.id);
        setSentryUser(session.user.id, session.user.email);
        trackSignInCompleted(session.user.app_metadata?.provider || 'unknown');
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        trackSignOutEvent();
        resetAnalyticsUser();
        clearSentryUser();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ─── Profile loading ─────────────────────────────────────
  const loadProfile = async (userId: string) => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data } = await client.from('profiles').select('*').eq('id', userId).single();

      if (data) {
        setProfile(data as UserProfile);
      } else {
        await ensureProfile(userId);
      }
    } catch {
      await ensureProfile(userId);
    }
  };

  const ensureProfile = async (userId: string) => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const {
        data: { user: authUser },
      } = await client.auth.getUser();
      const meta = authUser?.user_metadata || {};
      const { data } = await client
        .from('profiles')
        .upsert(
          {
            id: userId,
            display_name: meta.full_name || meta.name || '',
            avatar_url: meta.avatar_url || meta.picture || null,
          },
          { onConflict: 'id' },
        )
        .select()
        .single();

      if (data) {
        setProfile(data as UserProfile);
      }
    } catch (e) {
      console.error('[Auth] ensureProfile error:', e);
    }
  };

  // ─── Apple Sign In (native) ──────────────────────────────
  const signInWithApple = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      Alert.alert('Sign-In Unavailable', 'Unable to connect to the server. Please try again later.');
      return;
    }

    try {
      setSignInLoading(true);
      setSignInProvider('apple');
      trackSignInStarted('apple');
      if (!AppleAuthentication) throw new Error('Apple Authentication not available');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token from Apple');
      }

      const { error } = await client.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;
      // onAuthStateChange handles the rest
    } catch (e: unknown) {
      setSignInLoading(false);
      setSignInProvider(null);
      // User cancelled — not an error
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      console.error('[Auth] Apple sign-in failed:', e);
      Alert.alert('Sign-In Failed', e instanceof Error ? e.message : 'Apple sign-in failed. Please try again.');
    }
  }, []);

  // ─── Google Sign In (native SDK) ─────────────────────────
  const signInWithGoogle = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      Alert.alert('Sign-In Unavailable', 'Unable to connect to the server. Please try again later.');
      return;
    }

    try {
      setSignInLoading(true);
      setSignInProvider('google');
      trackSignInStarted('google');

      if (!GoogleSignin) throw new Error('Google Sign-In not available');
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      if (response.type === 'success' && response.data?.idToken) {
        const { error } = await client.auth.signInWithIdToken({
          provider: 'google',
          token: response.data.idToken,
        });

        if (error) throw error;
        // onAuthStateChange handles the rest
      } else {
        setSignInLoading(false);
        setSignInProvider(null);
      }
    } catch (e: unknown) {
      setSignInLoading(false);
      setSignInProvider(null);
      // User cancelled — not an error
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'SIGN_IN_CANCELLED') {
        return;
      }
      console.error('[Auth] Google sign-in failed:', e);
      Alert.alert('Sign-In Failed', e instanceof Error ? e.message : 'Google sign-in failed. Please try again.');
    }
  }, []);

  // ─── Dev Sign In (simulator testing only) ───────────────
  const devSignIn = useCallback(async () => {
    if (!__DEV__) return;
    const client = getSupabaseClient();
    if (!client) {
      Alert.alert('Dev Sign-In', 'Supabase client not available. Check env vars.');
      return;
    }

    const email = 'dev-test@broadwayscorecard.com';
    const password = 'dev-test-local-only-2024';

    try {
      setSignInLoading(true);
      setSignInProvider(null);

      // Try sign in first
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });

      if (signInError) {
        // If user doesn't exist, sign up
        if (signInError.message.includes('Invalid login')) {
          const { error: signUpError } = await client.auth.signUp({
            email,
            password,
            options: { data: { full_name: 'Dev Tester', avatar_url: null } },
          });
          if (signUpError) throw signUpError;
          // Supabase may require email confirmation — try signing in again
          const { error: retryError } = await client.auth.signInWithPassword({ email, password });
          if (retryError) {
            Alert.alert('Dev Sign-In', 'Sign-up succeeded but email confirmation may be required. Check Supabase dashboard → Authentication → Users and confirm the dev user.');
            setSignInLoading(false);
            return;
          }
        } else {
          throw signInError;
        }
      }
      // onAuthStateChange handles the rest
    } catch (e) {
      setSignInLoading(false);
      setSignInProvider(null);
      console.error('[Auth] Dev sign-in failed:', e);
      Alert.alert('Dev Sign-In Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  // ─── Sign Out ────────────────────────────────────────────
  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;

    await client.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  // ─── Show Sign-In Sheet ──────────────────────────────────
  const showSignIn = useCallback((context: SignInContext = 'generic') => {
    setSheetContext(context);
    setSheetOpen(true);
  }, []);

  const handleSheetSignIn = useCallback(
    (provider: 'google' | 'apple') => {
      if (provider === 'apple') {
        signInWithApple();
      } else {
        signInWithGoogle();
      }
    },
    [signInWithApple, signInWithGoogle],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAuthenticated: !!user,
        signInWithApple,
        signInWithGoogle,
        signOut,
        showSignIn,
        devSignIn,
      }}
    >
      {children}
      <SignInSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSignIn={handleSheetSignIn}
        onDevSignIn={__DEV__ ? devSignIn : undefined}
        context={sheetContext}
        loading={signInLoading}
        loadingProvider={signInProvider}
      />
    </AuthContext.Provider>
  );
}

const DEFAULT_AUTH: AuthContextValue = {
  user: null,
  profile: null,
  loading: false,
  isAuthenticated: false,
  signInWithApple: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  showSignIn: () => {},
  devSignIn: async () => {},
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  return context || DEFAULT_AUTH;
}
