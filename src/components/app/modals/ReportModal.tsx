import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';

type ReportModalProps = ComponentProps<typeof import('./ReportModalContent').ReportModal>;
const ReportModalContent = lazy(() =>
  import('./ReportModalContent').then(module => ({ default: module.ReportModal })),
);

export function ReportModal(props: ReportModalProps) {
  const [mounted, setMounted] = useState(props.open);
  useEffect(() => { if (props.open) setMounted(true); }, [props.open]);
  if (!props.open && !mounted) return null;
  return <Suspense fallback={null}><ReportModalContent {...props} /></Suspense>;
}
