/**
 * ShareCard — shares the show's page URL via the native share sheet.
 */

import React, { useCallback } from 'react';
import { Share, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { trackShowShared } from '@/lib/analytics';

interface ShareCardProps {
  show: {
    id: string;
    slug: string;
    title: string;
  };
  /** Called after successful share */
  onShared?: () => void;
}

/** Imperative handle for parent to trigger share */
export interface ShareCardHandle {
  share: () => Promise<void>;
}

export const ShareCardWithRef = React.forwardRef<ShareCardHandle, ShareCardProps>(
  function ShareCardWithRef(props, ref) {
    const share = useCallback(async () => {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      trackShowShared(props.show.id, props.show.title);

      const showUrl = `https://broadwayscorecard.com/show/${props.show.slug}`;
      try {
        await Share.share(
          Platform.OS === 'ios'
            ? { message: `Check out ${props.show.title} on Broadway Scorecard!\n${showUrl}`, url: showUrl }
            : { message: `Check out ${props.show.title} on Broadway Scorecard!\n${showUrl}` },
        );
        props.onShared?.();
      } catch {
        // User cancelled
      }
    }, [props]);

    React.useImperativeHandle(ref, () => ({ share }), [share]);

    return null;
  },
);
