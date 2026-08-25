/**
 * Proposal Verdict
 * ================
 * One place that decides whether a governance proposal read as passed or
 * rejected, and one label that says so. The board and the proposal page both
 * use it so a decided proposal looks identical wherever it is shown.
 *
 * `status` is the record: 'passed' / 'rejected' are set explicitly. The older
 * 'completed' rows never carried a verdict, so those fall back to the tally.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { GovernanceProposal } from '@/hooks/use-governance';

export type ProposalVerdict = 'passed' | 'rejected';

/**
 * True once a proposal stops accepting votes.
 *
 * The status flip is done by a cron pass every ten minutes, so between the
 * window closing and that pass a proposal is still `open` in the row while the
 * edge function is already refusing votes on it. Reading the clock here keeps
 * the buttons and the server agreeing through that gap.
 */
export function isVotingClosed(proposal: GovernanceProposal): boolean {
  if (proposal.status !== 'open') return true;
  if (!proposal.voting_ends_at) return false;
  return Date.parse(proposal.voting_ends_at) <= Date.now();
}

/** "3 days left" / "5 hours left", or null when there is no window to show. */
export function votingTimeLeft(
  proposal: GovernanceProposal,
  t: (key: string, defaultValue: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (!proposal.voting_ends_at || isVotingClosed(proposal)) return null;
  const ms = Date.parse(proposal.voting_ends_at) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return t('governance.closesInDays', '{{count}}d left', { count: days });
  }
  if (hours >= 1) return t('governance.closesInHours', '{{count}}h left', { count: hours });
  return t('governance.closesInMinutes', '{{count}}m left', { count: Math.max(1, Math.floor(ms / 60_000)) });
}

/** The verdict of a decided proposal, or null while it is still open. */
export function verdictOf(proposal: GovernanceProposal): ProposalVerdict | null {
  if (proposal.status === 'passed') return 'passed';
  if (proposal.status === 'rejected') return 'rejected';
  if (proposal.status === 'completed') {
    return proposal.like_count > proposal.dislike_count ? 'passed' : 'rejected';
  }
  return null;
}

/**
 * Plain text, no chip and no hue — the board is monochrome, and a coloured
 * pill in the card header read as a sticker slapped on top of it.
 */
export function ProposalVerdictLabel({
  verdict,
  className,
}: {
  verdict: ProposalVerdict;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <span className={cn('shrink-0 whitespace-nowrap text-white text-[10px] font-semibold', className)}>
      {verdict === 'passed' ? t('governance.passed') : t('governance.rejected')}
    </span>
  );
}
