/**
 * Theme color hook — dark theme only.
 * Always returns dark colors from our theme.
 */

import { Colors } from '@/constants/theme';

const THEME_MAP: Record<string, string> = {
  text: Colors.text.primary,
  background: Colors.surface.default,
};

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: string
) {
  if (props.dark) return props.dark;
  return THEME_MAP[colorName] ?? Colors.text.primary;
}
