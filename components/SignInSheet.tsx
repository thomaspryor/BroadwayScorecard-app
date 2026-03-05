/**
 * Sign-in bottom sheet — shown when auth is required.
 *
 * Context-aware headlines: adapts message based on what triggered it
 * (rating, watchlist, or generic sign-in).
 *
 * Uses RN Modal with iOS pageSheet presentation for native bottom sheet feel.
 */

import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

type SignInContext = 'rating' | 'watchlist' | 'generic';

interface SignInSheetProps {
  visible: boolean;
  onClose: () => void;
  onSignIn: (provider: 'google' | 'apple') => void;
  context?: SignInContext;
  loading?: boolean;
}

const HEADLINES: Record<SignInContext, string> = {
  rating: 'Sign in to save your rating',
  watchlist: 'Sign in to save your watchlist',
  generic: 'Sign in to Broadway Scorecard',
};

const SUBTEXTS: Record<SignInContext, string> = {
  rating: 'Your rating will be saved automatically after sign-in.',
  watchlist: 'Your watchlist will be saved automatically after sign-in.',
  generic: 'Track shows, rate performances, and build your theater diary.',
};

export default function SignInSheet({
  visible,
  onClose,
  onSignIn,
  context = 'generic',
  loading = false,
}: SignInSheetProps) {
  const insets = useSafeAreaInsets();

  const handlePress = (provider: 'google' | 'apple') => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onSignIn(provider);
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={false}
    >
      <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, Spacing.xl) }]}>
        {/* Handle indicator */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Close button */}
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Text style={styles.closeText}>Cancel</Text>
        </Pressable>

        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logoText}>
            Broadway <Text style={styles.logoAccent}>Scorecard</Text>
          </Text>
        </View>

        {/* Headline */}
        <Text style={styles.headline}>{HEADLINES[context]}</Text>
        <Text style={styles.subtext}>{SUBTEXTS[context]}</Text>

        {/* Sign-in buttons */}
        <View style={styles.buttonsContainer}>
          {/* Google */}
          <Pressable
            style={({ pressed }) => [styles.googleButton, pressed && styles.buttonPressed]}
            onPress={() => handlePress('google')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#333" />
            ) : (
              <>
                <GoogleLogo />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {/* Apple */}
          <Pressable
            style={({ pressed }) => [styles.appleButton, pressed && styles.buttonPressed]}
            onPress={() => handlePress('apple')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <AppleLogo />
                <Text style={styles.appleText}>Continue with Apple</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </Modal>
  );
}

// ─── SVG Logos ─────────────────────────────────────────────

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

function AppleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#fff">
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  handleRow: {
    position: 'absolute',
    top: Spacing.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.surface.overlay,
  },
  closeButton: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
    zIndex: 1,
  },
  closeText: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoText: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  logoAccent: {
    color: Colors.brand,
  },
  headline: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtext: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
    lineHeight: 22,
  },
  buttonsContainer: {
    gap: Spacing.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: BorderRadius.md,
  },
  googleText: {
    color: '#333',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    backgroundColor: '#000',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  appleText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  footer: {
    color: Colors.text.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: Spacing.xl,
    lineHeight: 16,
  },
});
