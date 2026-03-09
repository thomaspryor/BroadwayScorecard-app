/**
 * Tab layout — 5 tabs: Home, Watched, To Watch, Lists, Browse.
 * Watched/To Watch/Lists hidden when userAccounts feature flag is off.
 * Search is integrated into Browse. Settings/Profile via profile icon on Home.
 * Legacy tabs (my-shows, search, settings) kept as hidden routes for backward compat.
 */

import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { featureFlags } from '@/lib/feature-flags';

export default function TabLayout() {
  const showUserTabs = featureFlags.userAccounts;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.tabBar.active,
        tabBarInactiveTintColor: Colors.tabBar.inactive,
        tabBarStyle: {
          backgroundColor: Colors.tabBar.background,
          borderTopColor: Colors.tabBar.border,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="watched"
        options={{
          title: 'Watched',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="star.fill" color={color} />
          ),
          href: showUserTabs ? ('/(tabs)/watched' as any) : null,
        }}
      />
      <Tabs.Screen
        name="to-watch"
        options={{
          title: 'To Watch',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="bookmark.fill" color={color} />
          ),
          href: showUserTabs ? ('/(tabs)/to-watch' as any) : null,
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: 'Lists',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="list.bullet" color={color} />
          ),
          href: showUserTabs ? ('/(tabs)/lists' as any) : null,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="square.grid.2x2" color={color} />
          ),
        }}
      />
      {/* Hidden legacy routes — kept for deep links / backward compat */}
      <Tabs.Screen name="my-shows" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
