/**
 * /creator/flow — Creator Flow, the node-based generation canvas.
 * ===============================================================
 * Build a pipeline of text, reference and generator nodes, run it as one priced-and-paid job,
 * share it read-only, and keep every result in the studio library.
 *
 * Works signed out: flows live in localStorage until a wallet is connected,
 * then sync to the account. Generating is the only thing that needs sign-in.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import FlowCanvas from '@/components/app/creator/flow/FlowCanvas';
import FlowSidebar from '@/components/app/creator/flow/FlowSidebar';
import QuickAssist from '@/components/app/creator/flow/QuickAssist';
import { useAuth } from '@/contexts/AuthContext';
import { getDefaultNodeSize } from '@/lib/creator/flow/nodeTypes';
import { uid } from '@/lib/creator/flow/types';
import { useFlowSync } from '@/lib/creator/flow/useFlowSync';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { useCreatorFolderStore } from '@/store/creatorFolderStore';
import { useGenerationStore } from '@/store/generationStore';

const SIDEBAR_KEY = 'dehub-creator-flow-sidebar';

export default function CreatorFlowPage() {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth() as {
    walletAddress: string | null;
    isAuthenticated: boolean;
    openLoginModal: () => void;
  };
  const wallet = isAuthenticated ? walletAddress : null;
  const setScope = useCreatorFlowStore((s) => s.setScope);
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const activeName = useCreatorFlowStore((s) => s.flows.find((f) => f.id === s.activeFlowId)?.name ?? '');
  const { status, lastSyncedAt, syncNow } = useFlowSync(wallet);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  // The flows, the generation library and the folders all follow the wallet.
  useEffect(() => {
    setScope(wallet);
    useGenerationStore.getState().setScope(wallet);
    if (wallet) void useCreatorFolderStore.getState().loadFromServer();
  }, [wallet, setScope]);

  useEffect(() => {
    useGenerationStore.getState().resumeInterrupted();
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);

  /** A prompt handed over from the assistant becomes a text node. */
  const addPromptNode = useCallback(
    (text: string) => {
      const state = useCreatorFlowStore.getState();
      const size = getDefaultNodeSize('promptNode', state.lastNodeSize);
      const last = state.nodes[state.nodes.length - 1];
      addNode({
        id: `promptNode-${uid()}`,
        type: 'promptNode',
        position: last ? { x: last.position.x + 40, y: last.position.y + 40 } : { x: 0, y: 0 },
        style: { width: size.w, height: size.h },
        data: { label: '', prompt: text },
      });
    },
    [addNode],
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-[#090a0b] text-white">
      <SEOHead
        title="DeHub Creator Flow — Visual AI Pipelines"
        description="Chain prompts, references, image and video models on an infinite canvas. Build reusable generation flows, run them in one payment and share them with a link."
        url="https://dehub.io/creator/flow"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'DeHub Creator Flow',
          url: 'https://dehub.io/creator/flow',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web',
          description: 'Node-based canvas for building AI image and video generation pipelines on DeHub.',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950/80 px-3 backdrop-blur-xl">
        <Link to="/creator" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white" aria-label={t('creatorFlow.backToStudio')}>
          <ArrowLeft size={15} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-semibold leading-tight">{t('creatorFlow.title')}</h1>
          <p className="truncate text-[11px] leading-tight text-white/45">{activeName}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-white/45">
          {!isAuthenticated && (
            <button type="button" onClick={() => openLoginModal()} className="h-8 rounded-full border border-white/20 bg-white/10 px-3 text-[12px] font-medium text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20">
              {t('creatorFlow.signIn')}
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <FlowSidebar syncStatus={status} lastSyncedAt={lastSyncedAt} signedIn={isAuthenticated} onSignIn={() => openLoginModal()} collapsed={collapsed} onToggle={toggleSidebar} />
        <FlowCanvas onOpenLogin={() => openLoginModal()} signedIn={isAuthenticated} onSyncNow={syncNow} />
      </div>

      <QuickAssist onUsePrompt={addPromptNode} />
    </div>
  );
}
