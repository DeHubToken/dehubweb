/**
 * Proposal Verdict
 * ================
 * One place that decides whether a governance proposal read as passed or
 * rejected, and one pill that says so. The board and the proposal page both
 * use it so a decided proposal looks identical wherever it is shown.
 *
 * `status` is the record: 'passed' / 'rejected' are set explicitly. The older
 * 'completed' rows never carried a verdict, so those fall back to the tally.
 */

import { CheckCircle2, X } from 'lucide-react';
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
 * Hue is reserved for semantic state in this design system, and a verdict is
 * exactly that — same emerald/red tokens the board's tab counters already use.
 */
export function ProposalVerdictPill({
  verdict,
  className,
}: {
  verdict: ProposalVerdict;
  className?: string;
}) {
  const { t } = useTranslation();
  const isPassed = verdict === 'passed';
  const Icon = isPassed ? CheckCircle2 : X;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-semibold',
        isPassed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {isPassed ? t('governance.passed') : t('governance.rejected')}
    </span>
  );
}
