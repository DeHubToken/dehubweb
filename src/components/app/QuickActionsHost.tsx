import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { installQuickActions, OPEN_BUG_REPORT } from '@/lib/quick-actions';
import { pageBugContext, type PageBugContext } from '@/lib/page-bug-report';

const QuickActionsDrawer = React.lazy(() => import('./QuickActionsDrawer'));

export function QuickActionsHost() {
  const location = useLocation();
  const [session, setSession] = useState<{ context: PageBugContext; report: boolean } | null>(null);
  const active = useRef(false);
  active.current = !!session;
  useEffect(() => {
    const report = () => setSession({ context: pageBugContext(), report: true });
    const cleanup = installQuickActions(
      () => setSession({ context: pageBugContext(), report: false }),
      () => !active.current,
    );
    window.addEventListener(OPEN_BUG_REPORT, report);
    return () => { cleanup(); window.removeEventListener(OPEN_BUG_REPORT, report); };
  }, [location.pathname]);
  useEffect(() => { setSession(null); }, [location.pathname]);
  return session ? <Suspense fallback={null}><QuickActionsDrawer context={session.context} initialReport={session.report} onClose={() => setSession(null)} /></Suspense> : null;
}
