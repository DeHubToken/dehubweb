import { ExternalLink } from 'lucide-react';
import { workExplorerTxUrl } from '@/lib/contracts/dehub-work';
import type { WorkJobStatus } from '../types';

/**
 * A settled on-chain transaction for a bounty — escrow funding, a payout, or a
 * dispute resolution. Shared by the bounty detail page and the history list so
 * the two can't drift on either the explorer host or the truncation shape.
 */
export function TxLink({ label, txHash }: { label: string; txHash: string }) {
  return (
    <a
      href={workExplorerTxUrl(txHash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white"
    >
      <ExternalLink className="w-3 h-3" /> {label}: {txHash.slice(0, 6)}…{txHash.slice(-4)}
    </a>
  );
}

/** Status pill colours. Hue is reserved for state — see the design system block in index.css. */
export function statusBadgeClass(status: WorkJobStatus): string {
  if (status === 'open') return 'bg-emerald-500/20 text-emerald-300';
  if (status === 'disputed') return 'bg-red-500/20 text-red-300';
  if (status === 'completed') return 'bg-blue-500/20 text-blue-200';
  return 'bg-white/10 text-white/60';
}

/**
 * `in_progress` reads as a slug everywhere it is printed; the UI wants a phrase,
 * and a translated one. Callers pass the returned key through `t()`, so every
 * surface that prints a status — board, history, detail, link embed — spells it
 * the same way in every language.
 */
export function statusLabelKey(status: string): string {
  const keys: Record<string, string> = {
    draft: 'work.statusDraft',
    open: 'work.statusOpen',
    in_progress: 'work.statusInProgress',
    completed: 'work.statusCompleted',
    disputed: 'work.statusDisputed',
    cancelled: 'work.statusCancelled',
    expired: 'work.statusExpired',
    pending: 'work.statusPending',
    approved: 'work.statusApproved',
    rejected: 'work.statusRejected',
    awarded: 'work.statusAwarded',
    paid: 'work.statusPaid',
  };
  return keys[status] ?? status.replace(/_/g, ' ');
}
