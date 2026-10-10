import type { ReactNode } from 'react';

/** Keep other themes' direct-child nav selectors and layout intact. */
export function FeedFilterAnchor({ behindNav, children }: { behindNav: boolean; children: ReactNode }) {
  return behindNav
    ? <div data-home-filter-anchor className="relative isolate">{children}</div>
    : <>{children}</>;
}
