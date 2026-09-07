export type RectEdges = {
  top: number;
  bottom: number;
};

/**
 * Vertical scroll delta when the pointer is near the top/bottom edge of a scroll container.
 * Negative = scroll up, positive = scroll down, 0 = no scroll.
 */
export function getDragAutoScrollDelta(
  clientY: number,
  containerRect: RectEdges,
  edgePx = 48,
  maxStep = 24
): number {
  if (edgePx <= 0 || maxStep <= 0) {
    return 0;
  }
  const topEdge = containerRect.top + edgePx;
  if (clientY < topEdge) {
    const intensity = (topEdge - clientY) / edgePx;
    return -Math.ceil(maxStep * Math.min(1, Math.max(0, intensity)));
  }
  const bottomEdge = containerRect.bottom - edgePx;
  if (clientY > bottomEdge) {
    const intensity = (clientY - bottomEdge) / edgePx;
    return Math.ceil(maxStep * Math.min(1, Math.max(0, intensity)));
  }
  return 0;
}
