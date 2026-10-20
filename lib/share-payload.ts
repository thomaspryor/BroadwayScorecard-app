/** Share sheet payloads for a show. The image is the hero, the link must always ride along. */

export function showShareUrl(slug: string): string {
  return `https://broadwayscorecard.com/show/${slug}`;
}

export function showShareMessage(title: string, slug: string): string {
  return `Check out ${title} on Broadway Scorecard!\n${showShareUrl(slug)}`;
}

/**
 * iOS: file url (image) plus message (text with link). The share sheet gets both items, so
 * Messages sends the image and the link. Android ignores `url` for files, so it gets the message.
 */
export function buildShowSharePayload(
  show: { title: string; slug: string },
  imageUri: string | null | undefined,
  platform: string,
): { message: string; url?: string } {
  const message = showShareMessage(show.title, show.slug);
  return imageUri && platform === 'ios' ? { url: imageUri, message } : { message };
}
