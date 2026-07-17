/**
 * Client-side navigation helper for use outside React components.
 * Pushes to history and dispatches popstate so React Router picks it up.
 */
export function clientNavigate(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
