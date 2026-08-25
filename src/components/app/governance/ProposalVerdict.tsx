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
