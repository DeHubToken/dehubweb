import type { NavigateFunction } from 'react-router-dom';
import { stableNavigate } from '@/lib/client-navigate';

/**
 * `navigate` without the re-render.
 *
 * react-router's `useNavigate()` reads the current location so it can resolve
 * relative paths, which subscribes the caller to EVERY navigation. Inside the
 * app shell (the side rails, the sidebar chat, the bottom bar) that meant
 * opening a profile re-rendered hundreds of chat rows and nav items that had
 * nothing to do with the page change.
 *
 * This returns one module-level function that calls the router's own
 * `navigate` (published by ClientNavigateBridge), so the caller never
 * re-renders on route changes. Use it for absolute paths ('/name', '/app/x'),
 * history steps (-1) and hash-only links. A bare relative path ('edit',
 * '../x') resolves from the root here, so keep `useNavigate` for those.
 */
export function useStableNavigate(): NavigateFunction {
  return stableNavigate;
}
