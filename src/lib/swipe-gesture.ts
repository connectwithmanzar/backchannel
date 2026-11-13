// Decides what a drag on a job card means. Pure, so it is tested without a screen.
export type SwipeAction = "pass" | "apply" | "save" | null;

export const SWIPE_THRESHOLD = 110;

/** Right sends, left passes, up saves. The bigger movement wins, and a short drag does nothing. */
export function swipeDecision(dx: number, dy: number, threshold = SWIPE_THRESHOLD): SwipeAction {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (dy < 0 && ay >= threshold && ay > ax) return "save";
  if (ax >= threshold && ax >= ay) return dx > 0 ? "apply" : "pass";
  return null;
}

/** How far along a decision the drag is, 0 to 1, for fading the labels in. */
export function swipeProgress(dx: number, dy: number, threshold = SWIPE_THRESHOLD): number {
  const strongest = dy < 0 && Math.abs(dy) > Math.abs(dx) ? Math.abs(dy) : Math.abs(dx);
  return Math.max(0, Math.min(1, strongest / threshold));
}

/** Card tilt in degrees while dragging sideways. */
export const tiltFor = (dx: number): number => Math.max(-14, Math.min(14, dx / 14));
