import { lazy, Suspense, type ReactNode } from 'react';
import { useMaintenanceStatus } from '@/hooks/use-maintenance-status';

const MaintenanceScreen = lazy(() => import('@/pages/MaintenancePage').then(module => ({ default: module.MaintenanceScreen })));

export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const { enabled, checking, failed, check } = useMaintenanceStatus();
  if (!enabled) return children;
  return <Suspense fallback={null}>
    <MaintenanceScreen checking={checking} failed={failed} onRetry={() => { void check(); }} />
  </Suspense>;
}
