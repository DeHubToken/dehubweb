/** Let vertical wheel input escape a horizontal media scroller immediately. */
export function chainVerticalWheel(event: WheelEvent, viewport: HTMLElement): void {
  if (event.defaultPrevented || !event.cancelable || event.ctrlKey || !event.deltaY) return;
  // A sideways swipe moves the strip while it can. Once the strip is at its
  // end, the swipe's downward part goes on to the page instead of being lost.
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    const room = event.deltaX > 0
      ? viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft
      : viewport.scrollLeft;
    if (room > 1) return;
  }

  // Start outside the strip: Chromium can latch an ongoing wheel gesture to
  // that horizontal scroller even though it has no vertical distance to move.
  for (let node = viewport.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const room = event.deltaY > 0
      ? node.scrollHeight - node.clientHeight - node.scrollTop
      : node.scrollTop;
    // The document scrolls even with overflow left visible, unless it is locked.
    const scrolls = style.overflowY === 'auto' || style.overflowY === 'scroll'
      || (node === document.scrollingElement && style.overflowY !== 'hidden' && style.overflowY !== 'clip');
    if (scrolls && room > 1) {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      event.preventDefault();
      node.scrollTop += event.deltaY * unit;
      return;
    }
    // Never scroll the background through a deliberately contained overlay.
    // The app sets overscroll-behavior on body and html too; that only stops
    // the browser's bounce, it does not make the page an overlay.
    if (node !== document.body && node !== document.documentElement &&
        ['auto', 'scroll', 'hidden'].includes(style.overflowY) &&
        (style.overscrollBehaviorY === 'contain' || style.overscrollBehaviorY === 'none')) return;
  }
}
