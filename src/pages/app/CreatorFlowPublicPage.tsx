/**
 * /creator/flow/:id — a shared Creator Flow, read-only.
 * =====================================================
 * The link a creator hands out. Anyone can pan, zoom and read the nodes;
 * "Open a copy" puts the graph into their own /creator/flow to run.
 */
import { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import PublicFlowViewer from '@/components/app/creator/flow/PublicFlowViewer';
import type { PublicFlow } from '@/lib/creator/flow/api';

export default function CreatorFlowPublicPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const [flow, setFlow] = useState<PublicFlow | null>(null);
  const onLoaded = useCallback((f: PublicFlow) => setFlow(f), []);

  const title = flow ? `${flow.name} — DeHub Creator Flow` : 'DeHub Creator Flow';
  const description = flow
    ? t('creatorFlow.publicDescription', { count: flow.nodes.length, name: flow.name })
    : 'A shared AI generation flow on DeHub.';

  return (
    <div className="fixed inset-0 flex flex-col bg-[#090a0b] text-white">
      <SEOHead title={title} description={description} url={`https://dehub.io/creator/flow/${id}`} image={flow?.coverUrl ?? undefined} />
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950/80 px-3 backdrop-blur-xl">
        <Link to="/creator/flow" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label={t('creatorFlow.backToFlows')}>
          <ArrowLeft size={15} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-semibold leading-tight">{flow?.name ?? t('creatorFlow.title')}</h1>
          <p className="truncate text-[11px] leading-tight text-white/45">{t('creatorFlow.sharedReadOnly')}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <PublicFlowViewer id={id} onLoaded={onLoaded} />
      </div>
    </div>
  );
}
