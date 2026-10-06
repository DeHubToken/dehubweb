import { useTranslation } from 'react-i18next';
import { useContext } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { useIsOnline } from '@/lib/online-presence';

/**
 * Glowing green dot beside a name on Messages. Renders nothing unless that
 * person turned on "Show when I'm online" and has the app open — see
 * lib/online-presence. Green on every theme on purpose: it is a status light,
 * not decoration, so the monochrome palette does not get to repaint it.
 */
export function OnlineDot({ address, className = '' }: { address?: string | null; className?: string }) {
  const { t } = useTranslation();
  const active = useContext(CachedPageActiveContext);
  const isOnline = useIsOnline(address, active);
  if (!isOnline) return null;
  const label = t('messages.online');
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-flex h-2 w-2 shrink-0 ${className}`}
    >
      <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-60 animate-ping motion-reduce:animate-none" />
      <span className="relative h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)]" />
    </span>
  );
}
