/**
 * Score display utilities — ported from web project.
 *
 * Score tiers from: src/components/show-cards/ScoreBadge.tsx
 * Audience grades from: src/lib/audience-grade-utils.ts
 * Status colors from: src/components/show-cards/ShowPills.tsx
 */

import { Colors } from '@/constants/theme';

// ===========================================
// CRITIC SCORE TIERS
// ===========================================

export interface ScoreTier {
  label: string;
  color: string;
  textColor: string;
  shadowColor: string;
  glow: boolean;
  range: string;
}

const SCORE_TIERS = {
  mustSee: {
    label: 'Critical Gold',
    color: '#FFD700',
    textColor: '#1a1a1a',
    shadowColor: '#DAA520',
    glow: true,
    range: '83-100',
  },
  recommended: {
    label: 'Recommended',
    color: '#22c55e',
    textColor: '#ffffff',
    shadowColor: '#22c55e',
    glow: false,
    range: '75-82',
  },
  worthSeeing: {
    label: 'Worth Seeing',
    color: '#14b8a6',
    textColor: '#ffffff',
    shadowColor: '#14b8a6',
    glow: false,
    range: '65-74',
  },
  skippable: {
    label: 'Mixed',
    color: '#d97706',
    textColor: '#1a1a1a',
    shadowColor: '#d97706',
    glow: false,
    range: '55-64',
  },
  stayAway: {
    label: 'Critical Miss',
    color: '#ef4444',
    textColor: '#ffffff',
    shadowColor: '#ef4444',
    glow: false,
    range: '<55',
  },
} as const;

// Market-aware Critical Gold threshold — mirrors web src/config/score-buckets.ts.
// WE star ratings (5-point scale) cluster at 80/100, so WE Gold requires 85+.
const MARKET_GOLD_THRESHOLD: Record<string, number> = {
  'west-end': 85,
  'off-west-end': 85,
};
const DEFAULT_GOLD_THRESHOLD = 83;

/** Critical Gold minimum score for a given market (mirrors web getGoldThreshold). */
export function getGoldThreshold(category?: string): number {
  return MARKET_GOLD_THRESHOLD[category || ''] ?? DEFAULT_GOLD_THRESHOLD;
}

/** Whether a score qualifies as Critical Gold. Math.round matches the displayed value. */
export function isCriticalGold(score: number | null | undefined, category?: string): boolean {
  if (score == null) return false;
  return Math.round(score) >= getGoldThreshold(category);
}

/**
 * Minimum reviews before a composite score is shown — mirrors web
 * getMarketMinReviews (Broadway/West End = 5, Off-Broadway/Off-WE/Regional = 3).
 */
export function getMarketMinReviews(category?: string): number {
  switch (category) {
    case 'off-broadway':
    case 'off-west-end':
    case 'regional':
      return 3;
    default:
      return 5;
  }
}

export function getScoreTier(score: number | null | undefined, category?: string): ScoreTier | null {
  if (score == null) return null;
  const rounded = Math.round(score);
  if (rounded >= getGoldThreshold(category)) return SCORE_TIERS.mustSee;
  if (rounded >= 75) return SCORE_TIERS.recommended;
  if (rounded >= 65) return SCORE_TIERS.worthSeeing;
  if (rounded >= 55) return SCORE_TIERS.skippable;
  return SCORE_TIERS.stayAway;
}

export function getScoreColor(score: number | null | undefined, category?: string): string {
  const tier = getScoreTier(score, category);
  return tier?.color ?? Colors.score.none;
}

/**
 * Returns '#1a1a1a' or '#ffffff' for best contrast on a given hex background.
 * Uses relative luminance (WCAG formula).
 */
export function getContrastTextColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance =
    0.2126 * (r <= 0.03928 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4) +
    0.7152 * (g <= 0.03928 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4) +
    0.0722 * (b <= 0.03928 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4);
  return luminance > 0.35 ? '#1a1a1a' : '#ffffff';
}

// ===========================================
// STATUS DISPLAY
// ===========================================

export interface StatusInfo {
  label: string;
  color: string;
}

export function getStatusInfo(status: string): StatusInfo {
  switch (status) {
    case 'open':
      return { label: 'NOW PLAYING', color: Colors.status.open };
    case 'closed':
      return { label: 'CLOSED', color: Colors.status.closed };
    case 'previews':
      return { label: 'IN PREVIEWS', color: Colors.status.previews };
    case 'upcoming':
      return { label: 'UPCOMING', color: Colors.status.upcoming };
    default:
      return { label: status.toUpperCase(), color: Colors.status.closed };
  }
}

// ===========================================
// FORMAT DISPLAY
// ===========================================

export function getFormatInfo(type: string): { label: string; color: string } {
  switch (type) {
    case 'musical':
      return { label: 'MUSICAL', color: Colors.format.musical };
    case 'play':
      return { label: 'PLAY', color: Colors.format.play };
    default:
      return { label: type.toUpperCase(), color: Colors.text.muted };
  }
}
