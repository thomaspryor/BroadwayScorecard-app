/**
 * ShareCard — imperative share handle for a show page.
 *
 * Shares the show's URL (with a message), not an image — a captured PNG
 * has no tappable link, so recipients on iMessage/etc. couldn't get back to
 * the show (beta feedback 2026-08-13, ANDYIxNp: "The share button should
 * send the URL to the show, not an image").
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

      const url = `https://broadwayscorecard.com/show/${props.show.slug}`;
      const message = `Check out ${props.show.title} on Broadway Scorecard!`;

      try {
        await Share.share(
          Platform.OS === 'ios' ? { url, message } : { message: `${message}\n${url}` },
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
