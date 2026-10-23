/** Only the middle 40% of a surface claims multi-tap reactions. */
export function isInTapReactionCenter(x: number, y: number, width: number, height: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0 &&
    x >= width * 0.3 && x <= width * 0.7 && y >= height * 0.3 && y <= height * 0.7;
}
