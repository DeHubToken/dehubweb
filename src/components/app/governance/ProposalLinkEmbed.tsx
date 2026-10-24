/**
 * Proposal Link Embed
 * ===================
 * A governance proposal as a card: what a quoted or reposted proposal looks
 * like in the feed, on a profile, in a DM. Reads the live row, so the tally
 * and the verdict are current rather than whatever they were when it was
 * shared, and a tap opens the proposal.
 */

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Governance from '@/components/ui/cut-icons/governance';
import { useGovernanceProposal } from '@/hooks/use-governance-proposal';
import { ProposalVerdictLabel, verdictOf, votingTimeLeft } from '@/components/app/governance/ProposalVerdict';
import { buildAvatarUrl } from '@/lib/media-url';
import { proposalPath } from '@/lib/dehub-links';

interface ProposalLinkEmbedProps {
  proposalId: string;
  /** Where the link pointed, so a `?comment=` deep link still lands on it. */
  path?: string;
  fallback?: ReactNode;
}

export function ProposalLinkEmbed({ proposalId, path, fallback = null }: ProposalLinkEmbedProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: proposal, isLoading } = useGovernanceProposal(proposalId);

  if (isLoading) {
    return <div className="mt-2 h-32 rounded-xl bg-white/[0.04] animate-pulse" />;
  }
  if (!proposal) return <>{fallback}</>;

  const forW = proposal.like_count ?? 0;
  const againstW = proposal.dislike_count ?? 0;
  const total = forW + againstW;
  const forPct = total > 0 ? Math.round((forW / total) * 100) : 50;
  const againstPct = 100 - forPct;
  const verdict = verdictOf(proposal);
  const timeLeft = votingTimeLeft(proposal, t);
  const author = proposal.author_username
    ? `@${proposal.author_username}`
    : `${proposal.author_wallet_address.slice(0, 6)}...${proposal.author_wallet_address.slice(-4)}`;
  const avatar = proposal.author_avatar
    ? buildAvatarUrl(proposal.author_wallet_address, proposal.author_avatar)
    : null;
  const image = proposal.media_type === 'image' ? proposal.media_url : null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(path || proposalPath(proposal));
      }}
      data-no-navigate
      data-glass-embed
      data-proposal-embed
      className="mt-2 block w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left transition-colors hover:bg-white/[0.08]"
    >
      {image && (
        <div className="aspect-[2/1] w-full bg-black/40">
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Governance className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{t('governance.title', 'Governance')}</span>
          {verdict && (
            <>
              <span className="text-zinc-500">·</span>
              <ProposalVerdictLabel verdict={verdict} className="text-[11px]" />
            </>
          )}
          {timeLeft && (
            <>
              <span className="text-zinc-500">·</span>
              <span className="font-semibold text-white">{timeLeft}</span>
            </>
          )}
        </div>
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{proposal.title}</p>
        {proposal.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">{proposal.description}</p>
        )}
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="font-medium text-emerald-400">{forPct}% {t('governance.forLabel', 'For')}</span>
            <span className="font-medium text-red-400">{againstPct}% {t('governance.againstLabel', 'Against')}</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5">
            {total > 0 ? (
              <>
                <div data-keep-dark className="rounded-l-full bg-emerald-500" style={{ width: `${forPct}%` }} />
                <div data-keep-dark className="rounded-r-full bg-red-500" style={{ width: `${againstPct}%` }} />
              </>
            ) : (
              <div className="w-full rounded-full bg-white/10" />
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500">
          {avatar && <img src={avatar} alt="" className="h-4 w-4 rounded-full object-cover" />}
          <span className="truncate">{author}</span>
        </div>
      </div>
    </button>
  );
}
