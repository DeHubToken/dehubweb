/**
 * The tip wall: messages people sent with a tip on this post, as a row of
 * glass cards above the comments, biggest tip first. Tapping a card opens that
 * comment (and its replies) at the top of the list; tapping it again closes it.
 *
 * A card that just arrived from this viewer's own tip drops in at its rank and
 * lights up with the soft glow, the same landing every new comment gets.
 */
import { memo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Gem from '@/components/ui/cut-icons/diamond';
import { useTranslation } from 'react-i18next';
import type { Comment } from '@/lib/comment-mapper';
import { formatCount } from '@/lib/feed-utils';
import { cn } from '@/lib/utils';
import '@/styles/tip-wall.css';

/** "5,000 DHB" / "12.5 USDC"; six figures and up shorten like every other count. */
export function tipAmountLabel(tip: { amount: number; symbol: string }): string {
  const symbol = tip.symbol || 'DHB';
  const amount = Number(tip.amount) >= 100000
    ? formatCount(Number(tip.amount))
    : Number(tip.amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${amount} ${symbol}`;
}

export function TipChip({ tip, className }: { tip: { amount: number; symbol: string }; className?: string }) {
  return (
    <span className={cn('dh-tip-chip', className)} data-tip-chip>
      <Gem className="w-3 h-3" aria-hidden />
      {tipAmountLabel(tip)}
    </span>
  );
}

interface TipWallProps {
  rows: Comment[];
  /** The card whose comment is open in the list. */
  openId: string | null;
  onToggle: (id: string) => void;
  /** The card that just landed from this viewer's tip: drops in and glows. */
  landedId: string | null;
}

export const TipWall = memo(function TipWall({ rows, openId, onToggle, landedId }: TipWallProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  if (!rows.length) return null;
  return (
    <section className="dh-tip-wall" aria-label={t('tip.wallLabel', 'Tip messages')} data-tip-wall>
      <AnimatePresence initial={false}>
        {rows.map((row) => {
          const id = String(row.id);
          const name = row.displayName || row.username || '';
          const avatar = row.avatar;
          const landed = id === landedId;
          return (
            <motion.button
              key={id}
              type="button"
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: -28, scale: 0.86 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
              onClick={() => onToggle(id)}
              aria-pressed={openId === id}
              className={cn('dh-tip-card', openId === id && 'is-open', landed && 'dh-land-glow')}
              data-tip-card={id}
            >
              <span className="dh-tip-card-who">
                {avatar ? <img src={avatar} alt="" className="dh-tip-card-avatar" /> : <span className="dh-tip-card-avatar" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>}
                <span className="truncate">{name}</span>
              </span>
              <span className="dh-tip-card-text">{row.text || (row.imageUrl ? 'GIF' : '')}</span>
              {row.tip ? <TipChip tip={row.tip} className="mt-auto self-start" /> : null}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </section>
  );
});
