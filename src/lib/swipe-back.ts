export function completesSwipeBack(distance: number, vertical: number, velocity: number): boolean {
  return Math.abs(vertical) <= 32 && distance > Math.abs(vertical) * 2 &&
    (distance >= 64 || (distance >= 28 && velocity >= 650));
}

/** Use the visible back control, including local actions that have no URL. */
export function findSwipeBackControl(target: Element | null, overlayOpen: boolean): HTMLElement | null {
  const dialog = target?.closest('[role="dialog"],[role="alertdialog"]');
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]'))
    .filter(element => element.getClientRects().length && !element.closest('[inert],[aria-hidden="true"]') && element.dataset.state !== 'closed');
  const scope = overlayOpen ? dialogs[dialogs.length - 1] ?? document : dialog ?? document;
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>('[data-swipe-back]')).filter(control => {
    if (control.matches(':disabled,[aria-disabled="true"]') || control.closest('[inert],[aria-hidden="true"]')) return false;
    if (overlayOpen && !control.closest('[role="dialog"],[role="alertdialog"]')) return false;
    if (!control.getClientRects().length) return false;
    for (let parent: Element | null = control; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    }
    return true;
  });
  return candidates[candidates.length - 1] ?? null;
}
