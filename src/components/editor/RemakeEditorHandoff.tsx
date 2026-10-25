import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useEditorQuota } from '@/hooks/use-editor-quota';
import { loadCloudGenerationPage } from '@/lib/creator/cloudLibrary';
import { sendJobToEditor } from '@/lib/creator/sendToEditor';

/** Route state contains an owned library id, never a private signed URL. */
export function RemakeEditorHandoff() {
  const { state } = useLocation();
  const { walletAddress } = useAuth();
  const wallet = (walletAddress || '').toLowerCase();
  const input = state as { remakeAssetId?: string; wallet?: string } | null;
  const id = input?.wallet === wallet && /^remake-[a-f0-9]{48}$/.test(input?.remakeAssetId || '') ? input!.remakeAssetId! : '';
  const quota = useEditorQuota();
  const options = useRef(quota); options.current = quota;
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading');
  useEffect(() => {
    if (!id || !wallet) return;
    const controller = new AbortController();
    setStatus('loading');
    void (async () => {
      let offset: number | null = 0;
      while (offset !== null) {
        const page = await loadCloudGenerationPage(wallet, offset);
        if (controller.signal.aborted) return;
        const job = page.jobs.find(job => job.id === id && job.kind === 'video');
        if (job) {
          const result = await sendJobToEditor(job, { wallet, badgeBalance: options.current.badgeBalance,
            username: options.current.username, signal: controller.signal });
          if (!controller.signal.aborted) setStatus(result ? 'done' : 'failed');
          return;
        }
        offset = page.nextOffset;
      }
      throw new Error('Saved output unavailable');
    })().catch(() => { if (!controller.signal.aborted) setStatus('failed'); });
    return () => controller.abort();
  }, [id, wallet, attempt]);
  if (!id || status === 'done') return null;
  return <div role="status" className="fixed bottom-20 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-xl bg-neutral-900 p-4 text-sm text-white">
    {status === 'loading' ? t('common.loading') : <>
      {t('creator.editorImportFailed')}
      <button type="button" className="ml-2 underline" onClick={() => setAttempt(value => value + 1)}>{t('common.retry', 'Try again')}</button>
    </>}
  </div>;
}
