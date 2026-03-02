/**
 * Broadway Scorecard design tokens — dark theme only.
 * Matches the web project's Tailwind config.
 */

export const Colors = {
  surface: {
    default: '#0f0f14',
    raised: '#1a1a24',
    overlay: '#252530',
    elevated: '#32323f',
  },
  text: {
    primary: '#ECEDEE',
    secondary: '#9ca3af',
    muted: '#6b7280',
    inverse: '#0f0f14',
  },
  brand: '#d4a574',
  brandHover: '#c4956a',
  score: {
    gold: '#FFD700',
    green: '#22c55e',
    teal: '#14b8a6',
    amber: '#d97706',
    red: '#ef4444',
    none: '#374151',
  },
  status: {
    open: '#22c55e',
    closed: '#6b7280',
    previews: '#a855f7',
    upcoming: '#3b82f6',
  },
  format: {
    musical: '#a855f7',
    play: '#3b82f6',
  },
  tabBar: {
    background: '#0f0f14',
    active: '#d4a574',
    inactive: '#6b7280',
    border: '#1a1a24',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.06)',
    default: 'rgba(255, 255, 255, 0.1)',
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  title: 34,
} as const;
