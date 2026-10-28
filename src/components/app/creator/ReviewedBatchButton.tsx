import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReviewedBatch } from '@/lib/creator/reviewedBatch';

export function ReviewedBatchButton({ owner, scope, label, create, beforePrepare }: { owner: string | null; scope: string; label: string; create: () => ReviewedBatch; beforePrepare?: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const identity = `${owner || ''}:${scope}`, epoch = useRef({ identity, version: 0 }), live = useRef(true);
  if (epoch.current.identity !== identity) epoch.current = { identity, version: epoch.current.version + 1 };
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { setBusy(false); setError(''); }, [identity]);
  const prepare = async () => {
    if (busy || !owner) return;
    const captured = epoch.current.version;
    const current = () => live.current && epoch.current.version === captured;
    setBusy(true); setError('');
    try {
      const batch = create();
      await beforePrepare?.();
      if (!current()) return;
      const { openReviewedBatch, prepareReviewedBatch } = await import('@/lib/creator/reviewedBatchFlow');
      const flow = await prepareReviewedBatch(batch, current);
      if (!current()) return;
      openReviewedBatch(flow, owner.toLowerCase());
      window.location.assign('/creator/flow');
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : 'creator.batchInvalid'); }
    finally { if (current()) setBusy(false); }
  };
  return <div className="mt-3">
    <button type="button" disabled={busy || !owner} className="rounded-xl border border-current px-3 py-3 text-sm disabled:opacity-40" onClick={() => void prepare()}>{t(label)}</button>
    <p className="mt-2 text-xs opacity-70">{t('creator.batchReviewHint')}</p>
    {error && <p role="alert" className="mt-2 text-xs">{t(error, { defaultValue: error })}</p>}
  </div>;
}
