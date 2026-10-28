import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Columns2 } from 'lucide-react';
import type { DuetOf } from '@/lib/duet';

/** "Duet with @creator", linking to the original video. */
export function DuetCredit({ duetOf, className = '' }: { duetOf?: DuetOf; className?: string }) {
  const { t } = useTranslation();
  if (!duetOf) return null;
  return (
    <Link
      to={`/app/post/${duetOf.tokenId}`}
      onClick={event => event.stopPropagation()}
      data-no-navigate
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-white/20 ${className}`}
    >
      <Columns2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {duetOf.username
          ? t('duet.with', { defaultValue: 'Duet with @{{username}}', username: duetOf.username })
          : t('duet.withOriginal', { defaultValue: 'Duet · see original' })}
      </span>
    </Link>
  );
}
