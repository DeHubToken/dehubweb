/**
 * Single Governance Proposal Page
 * Route: /app/governance/:proposalId
 */

import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useGovernanceProposal } from '@/hooks/use-governance-proposal';
import {
  useGovernanceUserVotes,
  useVoteGovernanceProposal,
  useSelfVoteWeight,
  type GovernanceProposal,
} from '@/hooks/use-governance';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { TranslatableText } from '@/components/app/TranslatableText';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { ActionBar } from '@/components/app/cards/ActionBar';
import { buildAvatarUrl } from '@/lib/media-url';
import { useProfileAvatar } from '@/hooks/use-profile-avatar-cache';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { ProposalVerdictLabel, verdictOf, votingTimeLeft, isVotingClosed } from '@/components/app/governance/ProposalVerdict';
import { ProposalDiscussion } from '@/components/app/governance/ProposalDiscussion';

function formatTimeAgo(dateStr: string, t: (key: string, opts?: any) => string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return t('governance.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('governance.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('governance.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('governance.daysAgo', { count: days });
  const months = Math.floor(days / 30);
  return t('governance.monthsAgo', { count: months });
}



export default function GovernanceProposalPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // A comment notification lands on the comment it was about — the same
  // `?comment=` the post page and the features board read.
  const focusedCommentId = searchParams.get('comment');
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();

  const { data: proposal, isLoading } = useGovernanceProposal(proposalId);
  const { data: userVotes } = useGovernanceUserVotes();
  const voteMutation = useVoteGovernanceProposal();

  const { weight: userWeight, badgeName: userBadge } = useSelfVoteWeight();

  // The discussion panel sits under the card; the comment action and a
  // comment deep link both bring it into view.
  const discussionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusedCommentId || !proposal) return;
    discussionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusedCommentId, proposal]);

  const currentVote = userVotes?.[proposalId ?? '']?.type;

  const authorAddress = proposal?.author_wallet_address ?? '';
  const cachedAvatar = useProfileAvatar(authorAddress || undefined);
  const avatarUrl = proposal?.author_avatar ? buildAvatarUrl(authorAddress, proposal.author_avatar) : cachedAvatar || null;

  const handleVote = useCallback(
    (voteType: 1 | -1) => {
      if (!isAuthenticated) { openLoginModal(); return; }
      if (!proposalId) return;
      if (userWeight === 0) { toast.error(t('governance.mustHoldTokens')); return; }
      voteMutation.mutate({ proposalId, voteType, currentVote, voteWeight: userWeight, badgeName: userBadge });
    },
    [isAuthenticated, openLoginModal, proposalId, currentVote, voteMutation, userWeight, userBadge, t]
  );

  if (isLoading) {
    return (
      <DeHubPageLoader fullScreen />
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen px-4 pt-6 text-center">
        <ThemedIcon icon="governance" alt="" className="w-16 h-16 object-contain mx-auto mb-3 opacity-80" />
        <h2 className="text-white font-semibold text-lg mb-1">Proposal not found</h2>
        <button onClick={() => navigate('/app/governance')} className="text-zinc-400 text-sm underline">
          Back to Governance
        </button>
      </div>
    );
  }
  const username_raw = proposal.author_username || '';
  const displayName = username_raw || proposal.author_wallet_address.slice(0, 6);
  const handle = username_raw ? `@${username_raw}` : `${proposal.author_wallet_address.slice(0, 6)}...${proposal.author_wallet_address.slice(-4)}`;

  const isLiked = currentVote === 1;
  const isDisliked = currentVote === -1;
  const total = (proposal.like_count ?? 0) + (proposal.dislike_count ?? 0);
  const forPct = total > 0 ? Math.round(((proposal.like_count ?? 0) / total) * 100) : 50;
  const againstPct = 100 - forPct;

  const verdict = verdictOf(proposal);
  const timeLeft = votingTimeLeft(proposal, t);

  return (
    <div className="min-h-screen px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2 max-w-2xl mx-auto">
      <SEOHead title={`${proposal.title} — DeHub Governance`} description={(proposal.description || 'DeHub governance proposal — vote and discuss.').slice(0, 155)} url={`https://dehub.io/app/governance/${proposalId}`} type="article" />
      {/* Back button */}
      <button
        onClick={() => navigate('/app/governance')}
        className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm mb-3 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('governance.title', 'Governance')}
      </button>

      {/* Proposal card */}
      <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-4">
        <div className="flex items-start justify-between mb-3">
          <CardHeader
            username={displayName}
            handle={handle}
            avatarSeed={avatarUrl || proposal.author_wallet_address}
            verified={false}
            contentType="post"
            creatorId={proposal.author_wallet_address}
            creatorUsername={proposal.author_username || undefined}
            badgeLookupId={proposal.author_username || proposal.author_wallet_address}
          />
          <div className="flex items-center gap-1.5 shrink-0 pt-1">
            {verdict && (
              <>
                <ProposalVerdictLabel verdict={verdict} />
                <span className="text-zinc-500 text-[10px]">·</span>
              </>
            )}
            {timeLeft && (
              <>
                <span className="text-white text-[10px] font-semibold">{timeLeft}</span>
                <span className="text-zinc-500 text-[10px]">·</span>
              </>
            )}
            <span className="text-zinc-500 text-[10px]">{formatTimeAgo(proposal.created_at, t)}</span>
          </div>
        </div>

        <TranslatableText text={proposal.title} className="text-white font-semibold text-base leading-tight mb-2" as="h1" hideControls />
        <TranslatableText text={proposal.description} className="text-zinc-400 text-sm leading-relaxed mb-4" as="p" />

        {/* Vote ratio bar */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-[10px]">
            <span className="text-emerald-400 font-medium">{forPct}% {t('governance.forLabel')}</span>
            <span className="text-red-400 font-medium">{againstPct}% {t('governance.againstLabel')}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden flex">
            {total > 0 ? (
              <>
                <div data-keep-dark className="bg-emerald-500 rounded-l-full transition-all duration-300" style={{ width: `${forPct}%` }} />
                <div data-keep-dark className="bg-red-500 rounded-r-full transition-all duration-300" style={{ width: `${againstPct}%` }} />
              </>
            ) : (
              <div className="bg-white/10 w-full rounded-full" />
            )}
          </div>
        </div>

        <ActionBar
          postId={proposal.id}
          className="p-0"
          onComment={() => discussionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onLike={() => handleVote(1)}
          onDislike={() => handleVote(-1)}
          isLiked={isLiked}
          isDisliked={isDisliked}
          likeCount={proposal.like_count ?? 0}
          dislikeCount={proposal.dislike_count ?? 0}
          commentCount={proposal.comment_count}
          voteWeight={userWeight}
          disabled={voteMutation.isPending || isVotingClosed(proposal)}
        />
      </div>

      {/* Discussion — always visible: the place to ask before you vote */}
      <div ref={discussionRef} className="mt-4 rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] p-4 scroll-mt-24">
        <h3 className="text-white text-sm font-semibold">{t('governance.discussion.title')}</h3>
        <p className="text-zinc-500 text-xs mb-2">{t('governance.discussion.intro')}</p>
        <ProposalDiscussion
          proposalId={proposal.id}
          proposalAuthorAddress={proposal.author_wallet_address}
          focusCommentId={focusedCommentId}
        />
      </div>
    </div>
  );
}
