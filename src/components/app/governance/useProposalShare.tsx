import { lazy, Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useProposalRepost } from '@/hooks/use-proposal-repost';
import { dehubLinkFor } from '@/lib/dehub-links';
import type { GovernanceProposal } from '@/hooks/use-governance';

const PostModal = lazy(() => import('@/features/post').then((m) => ({ default: m.PostModal })));

/**
 * Repost / quote / share wiring for a proposal's ActionBar, shared by the
 * board cards and the proposal page. Spread `actionBarProps` onto the bar and
 * render `quoteComposer` next to it. Quoting is posting the proposal link,
 * which feeds render as a proposal card.
 */
export function useProposalShare(proposal: GovernanceProposal | null | undefined) {
  const { t: _copy } = useTranslation();
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();
  const repost = useProposalRepost(proposal, walletAddress);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const proposalUrl = proposal ? dehubLinkFor.proposal(proposal) : '';

  const onRepost = useCallback(() => {
    if (!isAuthenticated) {
      openLoginModal();
      return Promise.reject(new Error('Sign in to repost'));
    }
    return repost.toggle().catch((error: unknown) => {
      toast.error(_copy("copy.7527dc6722fc", { defaultValue: "Failed to repost" }));
      throw error;
    });
  }, [isAuthenticated, openLoginModal, repost, _copy]);

  const onQuote = useCallback(() => {
    if (!isAuthenticated) { openLoginModal(); return; }
    setQuoteOpen(true);
  }, [isAuthenticated, openLoginModal]);

  return {
    actionBarProps: {
      shareUrl: proposalUrl,
      onRepost,
      onQuote,
      repostCount: repost.count,
      isReposted: repost.reposted,
    },
    quoteComposer: quoteOpen ? (
      <Suspense fallback={null}>
        <PostModal isOpen={quoteOpen} onClose={() => setQuoteOpen(false)} initialText={proposalUrl} />
      </Suspense>
    ) : null,
  };
}
