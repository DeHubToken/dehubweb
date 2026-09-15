/**
 * BannedAccountNotice
 * ===================
 * What a banned account is told, wherever it tries to write.
 *
 * A ban on DeHub is read-only, not locked-out: the account keeps its sign-in,
 * its feed, its conversations and its data until the person asks for it to be
 * deleted. The API refuses every write with `403 ACCOUNT_BANNED` — this is the
 * part that says so up front, instead of letting somebody type a post that was
 * never going to send.
 *
 * `variant="panel"` fills a composer that has been taken away. `variant="line"`
 * is the one-line form for sitting above an input that is still on screen.
 */

import { Ban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useBannedAccount } from '@/hooks/use-banned-account';

interface BannedAccountNoticeProps {
  variant?: 'panel' | 'line';
  className?: string;
}

export function BannedAccountNotice({ variant = 'panel', className }: BannedAccountNoticeProps) {
  const { t } = useTranslation();
  const { isBanned, bannedReason } = useBannedAccount();

  if (!isBanned) return null;

  if (variant === 'line') {
    return (
      <div
        role="status"
        className={cn(
          'flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200',
          className,
        )}
      >
        <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0">{t('banned.line')}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-6 text-center',
        className,
      )}
    >
      <Ban className="h-6 w-6 text-amber-300" aria-hidden />
      <p className="text-sm font-semibold text-amber-100">{t('banned.title')}</p>
      <p className="max-w-sm text-xs leading-relaxed text-amber-200/90">{t('banned.body')}</p>
      {bannedReason ? (
        <p className="max-w-sm text-xs text-amber-200/70">{t('banned.reason', { reason: bannedReason })}</p>
      ) : null}
      <Link to="/delete-account" className="text-xs font-medium text-amber-200 underline underline-offset-2">
        {t('banned.deleteAccount')}
      </Link>
    </div>
  );
}
