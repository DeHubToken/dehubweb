/** Let vertical wheel input escape a horizontal media scroller immediately. */
export function chainVerticalWheel(event: WheelEvent, viewport: HTMLElement): void {
  if (event.defaultPrevented || !event.cancelable || event.ctrlKey || !event.deltaY ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

  // Start outside the strip: Chromium can latch an ongoing wheel gesture to
  // that horizontal scroller even though it has no vertical distance to move.
  for (let node = viewport.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const room = event.deltaY > 0
      ? node.scrollHeight - node.clientHeight - node.scrollTop
      : node.scrollTop;
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && room > 1) {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      event.preventDefault();
      node.scrollTop += event.deltaY * unit;
      return;
    }
    // Never scroll the background through a deliberately contained overlay.
    if (['auto', 'scroll', 'hidden'].includes(style.overflowY) &&
        (style.overscrollBehaviorY === 'contain' || style.overscrollBehaviorY === 'none')) return;
  }
}
