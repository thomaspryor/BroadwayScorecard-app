/**
 * Root layout — forces dark theme and wraps app in DataProvider.
 */

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { DataProvider } from '@/lib/data-context';
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
  return (
    <ThemeProvider value={BroadwayDark}>
      <DataProvider>
        <Stack>
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
            }}
          />
        </Stack>
        <StatusBar style="light" />
      </DataProvider>
    </ThemeProvider>
  );
}
