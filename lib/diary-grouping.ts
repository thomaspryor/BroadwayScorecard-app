import type { UserReview } from './user-types';

export interface DiarySection {
  title: string;
  data: UserReview[];
}

export function groupReviewsByMonth(reviews: UserReview[]): DiarySection[] {
  const buckets = new Map<string, { title: string; data: UserReview[]; sortKey: string }>();
  for (const r of reviews) {
    const dateStr = r.date_seen || r.created_at;
    const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
    if (Number.isNaN(d.getTime())) continue;
    const sortKey = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    const title = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
    const bucket = buckets.get(sortKey);
    if (bucket) bucket.data.push(r);
    else buckets.set(sortKey, { title, data: [r], sortKey });
  }
  return Array.from(buckets.values())
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .map(({ title, data }) => ({ title, data }));
}
