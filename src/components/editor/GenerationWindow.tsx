import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, X, Wand2 } from 'lucide-react';
import { useEditorUiStore } from '@/store/editorUiStore';
import { useGenerationStore } from '@/store/generationStore';
import { useEditorQuota } from '@/hooks/use-editor-quota';
import { sendJobToEditor } from '@/lib/creator/sendToEditor';
const CreatorStudio = lazy(() => import('@/components/app/creator/studio/CreatorStudio').then(module => ({ default: module.CreatorStudio })));

export function GenerationWindow() {
  const { t } = useTranslation();
  const state = useEditorUiStore(s => s.generatorWindow);
  const setWindow = useEditorUiStore(s => s.setGeneratorWindow);
  const draft = useEditorUiStore(s => s.generatePrefill);
  const jobs = useGenerationStore(s => s.jobs);
  const quota = useEditorQuota();
  const [mounted, setMounted] = useState(false);
  const pending = useRef(new Map<string, string | null>());
  const importing = useRef(new Set<string>());
  const controller = useRef(new AbortController());
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, [quota.walletAddress]);
  useEffect(() => { if (state !== 'closed') setMounted(true); }, [state]);
  const track = useCallback((id: string) => {
    pending.current.set(id, quota.walletAddress?.toLowerCase() ?? null);
  }, [quota.walletAddress]);

  useEffect(() => {
    for (const job of jobs) {
      if (!pending.current.has(job.id) || importing.current.has(job.id)) continue;
      if (pending.current.get(job.id) !== (quota.walletAddress?.toLowerCase() ?? null)) {
        pending.current.delete(job.id);
        continue;
      }
      if (job.status === 'failed' || job.status === 'cancelled') { pending.current.delete(job.id); continue; }
      if (job.status !== 'done' || !job.url) continue;
      // Meshes and transcripts remain available in the gallery. Uploads accepts playable media.
      pending.current.delete(job.id);
      if (job.kind === 'model3d') continue;
      importing.current.add(job.id);
      void sendJobToEditor(job, { wallet: quota.walletAddress, badgeBalance: quota.badgeBalance,
        username: quota.username, addToTimeline: false, signal: controller.current.signal })
        .finally(() => importing.current.delete(job.id));
    }
  }, [jobs, quota.walletAddress, quota.badgeBalance, quota.username]);

  return <>
    {state === 'minimized' && <button type="button" onClick={() => setWindow('open')}
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/80 px-4 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur-xl">
      <Wand2 className="h-4 w-4" /> {t('copy.d0f3b9c25380', { defaultValue: 'Generate content' })}
    </button>}
    {mounted && <section role="dialog" aria-modal="false" aria-label={t('copy.d0f3b9c25380', { defaultValue: 'Generate content' })}
      hidden={state !== 'open'} data-ai-chat data-overlay-content data-creator-page
      className="fixed bottom-4 right-4 z-50 flex h-[min(680px,calc(100dvh-32px))] w-[min(680px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/80 text-white shadow-2xl backdrop-blur-[24px]"
      style={state !== 'open' ? { display: 'none' } : undefined}>
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
        <Wand2 className="h-4 w-4" />
        <h2 className="flex-1 text-sm font-semibold">{t('copy.d0f3b9c25380', { defaultValue: 'Generate content' })}</h2>
        <button type="button" aria-label={t('calls.minimize')} onClick={() => setWindow('minimized')} className="rounded-lg p-2 hover:bg-white/10"><Minus className="h-4 w-4" /></button>
        <button type="button" aria-label={t('common.close')} onClick={() => setWindow('closed')} className="rounded-lg p-2 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        <Suspense fallback={<p role="status" className="p-4 text-sm">{t('common.loading')}</p>}>
          <CreatorStudio embedded generationDraft={draft} onJobStarted={track} onOpenEditor={() => setWindow('minimized')} />
        </Suspense>
      </div>
    </section>}
  </>;
}
