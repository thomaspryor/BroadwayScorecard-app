/**
 * Tab layout — 5 tabs: Home, Watched, To Watch, Lists, Browse.
 * Watched/To Watch/Lists hidden when userAccounts feature flag is off.
 * Search is integrated into Browse. Settings/Profile via profile icon on Home.
 * Legacy routes (my-shows, search, settings) live at app/ root — NativeTabs `hidden`
 * makes a route unreachable even via router.push, so they must sit outside the group
 * (public URLs are unchanged; group segments don't appear in URLs).
 *
 * Uses NativeTabs (SwiftUI tab bar): Liquid Glass + active-tab capsule on iOS 26+,
 * minimizes on scroll-down. Icons are SF-symbol-only — Android needs `src`/VectorIcon
 * icons added before any Android release.
 */

import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React, { useState } from 'react';

import { Colors } from '@/constants/theme';
import { featureFlags } from '@/lib/feature-flags';

export default function TabLayout() {
  // Frozen at mount: NativeTabs remounts the whole navigator (wiping nav state)
  // when a trigger's `hidden` flips at runtime, so flag changes apply next launch.
  const [showUserTabs] = useState(() => featureFlags.userAccounts);

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
    </NativeTabs>
  );
}
