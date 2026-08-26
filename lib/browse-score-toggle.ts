// Layout math for the Browse tab's status-filter row (BRO-270).
//
// The horizontal ScrollView of status pills sits next to the CRITICS/AUDIENCE
// ScoreToggle. Giving the ScrollView `flex: 1` and relying on RN's Yoga to
// flexShrink it out of the ScoreToggle's way doesn't work — React Native's
// horizontal ScrollView doesn't respect flexShrink the way a plain View
// does, so the pill row keeps its full content width and bleeds behind the
// toggle instead of clipping. An explicit maxWidth sidesteps the shrink
// negotiation entirely: the row can never be wider than the space actually
// left over once the toggle and row padding are accounted for.
//
// SCORE_TOGGLE_WIDTH is only a fallback for the single frame before the
// ScoreToggle's onLayout fires — a hardcoded estimate here previously
// undershot the real rendered width (measured ~178pt: two pills' text +
// Spacing.md horizontal padding ×2 + the toggle's own 2pt padding and 1pt
// border on each side) and still let the row overlap. Callers should
// measure the live width via onLayout and pass it in; this constant is
// deliberately generous (not tight) so the one-frame fallback under-shrinks
// the pill row rather than under-shrinking it into an overlap.

export const SCORE_TOGGLE_WIDTH = 190;
export const STATUS_ROW_HORIZONTAL_PADDING = 32; // Spacing.lg (16) on each side
export const STATUS_ROW_GAP = 8; // breathing room between the pill row and the toggle

export function filterGroupMaxWidth(
  containerWidth: number,
  scoreToggleWidth: number = SCORE_TOGGLE_WIDTH,
): number {
  const available =
    containerWidth - STATUS_ROW_HORIZONTAL_PADDING - scoreToggleWidth - STATUS_ROW_GAP;
  return Math.max(0, available);
}
