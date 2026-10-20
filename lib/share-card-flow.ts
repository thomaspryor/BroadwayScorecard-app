/**
 * Share flow for the show page's score card (components/ShareCard.tsx). No
 * React Native imports so it runs under `node --test`; the component passes
 * in view-shot's capture, Share.share and an Alert wrapper.
 *
 * Before: capture and share sat in one try/catch whose catch assumed "user
 * cancelled". When view-shot failed (low memory, image not loaded, view not
 * laid out) the share button did nothing at all. Now a failed capture says
 * so and still shares the link.
 */
import { buildShowSharePayload } from './share-payload';

export const SHARE_IMAGE_FAILED_TITLE = 'Couldn’t create the share image';
export const SHARE_IMAGE_FAILED_BODY = 'We’ll share a link to the show instead.';
export const SHARE_FAILED_TITLE = 'Couldn’t open sharing';

export type ShareOutcome = 'shared' | 'dismissed' | 'failed';

export interface ShareCardDeps {
  show: { title: string; slug: string };
  platform: string;
  /** view-shot's capture, or undefined when the native module is missing. */
  capture: (() => Promise<string>) | undefined;
  /** Share.share; resolves with { action }. */
  share: (payload: { message: string; url?: string }) => Promise<{ action: string }>;
  dismissedAction: string;
  /** Tells the user the image failed; resolves once they acknowledge it. */
  notifyImageFailed: () => Promise<void>;
  /** Tells the user the share sheet could not open. */
  notifyShareFailed: (message: string) => void;
}

export async function shareShowCard(deps: ShareCardDeps): Promise<ShareOutcome> {
  let uri: string | null = null;
  if (deps.capture) {
    try {
      uri = (await deps.capture()) || null;
    } catch {
      await deps.notifyImageFailed();
    }
  }
  try {
    const result = await deps.share(buildShowSharePayload(deps.show, uri, deps.platform));
    return result?.action === deps.dismissedAction ? 'dismissed' : 'shared';
  } catch (e) {
    deps.notifyShareFailed(e instanceof Error ? e.message : 'Please try again.');
    return 'failed';
  }
}
