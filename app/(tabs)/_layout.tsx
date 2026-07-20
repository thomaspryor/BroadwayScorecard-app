/**
 * Tab layout — 5 tabs: Home, Watched, To Watch, Lists, Browse.
 * Watched/To Watch/Lists hidden when userAccounts feature flag is off.
 * Search is integrated into Browse. Settings/Profile via profile icon on Home.
 * Legacy tabs (my-shows, search, settings) kept as hidden routes for backward compat.
 *
 * Uses NativeTabs (SwiftUI tab bar): Liquid Glass + active-tab capsule on iOS 26+,
 * minimizes on scroll-down. Icons are SF-symbol-only — Android needs `src`/VectorIcon
 * icons added before any Android release.
 */

import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

import { Colors } from '@/constants/theme';
import { featureFlags } from '@/lib/feature-flags';

export default function TabLayout() {
  const showUserTabs = featureFlags.userAccounts;

  return (
    <NativeTabs
      tintColor={Colors.tabBar.active}
      minimizeBehavior="onScrollDown"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="watched" hidden={!showUserTabs}>
        <NativeTabs.Trigger.Icon sf={{ default: 'star', selected: 'star.fill' }} />
        <NativeTabs.Trigger.Label>Watched</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="to-watch" hidden={!showUserTabs}>
        <NativeTabs.Trigger.Icon sf={{ default: 'bookmark', selected: 'bookmark.fill' }} />
        <NativeTabs.Trigger.Label>To Watch</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="lists" hidden={!showUserTabs}>
        <NativeTabs.Trigger.Icon sf="list.bullet" />
        <NativeTabs.Trigger.Label>Lists</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="browse" role="search">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} />
        <NativeTabs.Trigger.Label>Browse</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Hidden legacy routes — kept for deep links / backward compat */}
      <NativeTabs.Trigger name="my-shows" hidden />
      <NativeTabs.Trigger name="search" hidden />
      <NativeTabs.Trigger name="settings" hidden />
    </NativeTabs>
  );
}
