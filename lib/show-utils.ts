import { Colors } from '@/constants/theme';
import type { Show } from './types';

const MS_PER_DAY = 86_400_000;

export function daysUntilClosing(show: Show | undefined | null): number | null {
  if (!show?.closingDate) return null;
  const target = new Date(show.closingDate + 'T00:00:00').getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / MS_PER_DAY);
}

export function isClosingWithinDays(show: Show | undefined | null, days: number): boolean {
  const d = daysUntilClosing(show);
  return d !== null && d > 0 && d < days;
}

export function getClosingUrgencyColor(days: number): string {
  if (days <= 7) return Colors.score.red;
  if (days <= 14) return Colors.score.amber;
  return Colors.text.muted;
}

export function formatClosingShort(show: Show | undefined | null): string | null {
  if (!show?.closingDate) return null;
  const d = new Date(show.closingDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
