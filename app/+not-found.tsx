/**
 * Shown for any link the app has no screen for (a stale share link, a
 * mistyped broadwayscorecard:// URL, a route that was removed). Without it
 * expo-router showed its developer "Unmatched Route" page with a sitemap
 * link, which is no place to leave a user.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.container} testID="not-found-screen">
      <Stack.Screen
        options={{
          title: '',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: Colors.surface.default },
          headerTintColor: Colors.brand,
        }}
      />
      <Text style={styles.title} accessibilityRole="header">Page not found</Text>
      <Text style={styles.body}>That link doesn’t go anywhere in the app. It may be old or mistyped.</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={() => router.replace('/')}
        accessibilityRole="button"
        testID="not-found-home"
      >
        <Text style={styles.buttonText}>Go to Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.surface.default,
  },
  title: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  body: { color: Colors.text.secondary, fontSize: FontSize.md, textAlign: 'center' },
  button: {
    marginTop: Spacing.md,
    backgroundColor: Colors.brand,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: { color: Colors.text.inverse, fontSize: FontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
