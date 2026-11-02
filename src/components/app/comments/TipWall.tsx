/**
 * The coin rail: messages people sent with a tip on this post, as one slim row
 * of chips above the comments, biggest tip first. Each chip is the tipper's
 * face, a gold tag with the amount, and the start of their message. Tapping a
 * chip opens that comment (and its replies) at the top of the list; tapping it
 * again closes it.
 *
 * A chip that just arrived from this viewer's own tip drops in at its rank and
 * lights up with the soft glow, the same landing every new comment gets.
 *
 * At rest a light runs across the gold tags every few seconds and the top
 * coin turns over as it passes (off with reduced motion).
 */
import { memo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import CutCoins from '@/components/ui/cut-icons/coins';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import type { Comment } from '@/lib/comment-mapper';
import { formatCount } from '@/lib/feed-utils';
import { cn } from '@/lib/utils';
import '@/styles/tip-wall.css';

/** DHB is the platform's own token, so people read it as "tokens". */
function unitFor(symbol: string | undefined): string {
  if (!symbol || symbol.toUpperCase() === 'DHB') return i18n.t('tip.tokensUnit', 'tokens');
  return symbol;
}

function amountText(amount: number): string {
  return amount >= 100000
    ? formatCount(amount)
    : amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** "5,000 tokens" / "12.5 USDC"; six figures and up shorten like every other count. */
export function tipAmountLabel(tip: { amount: number; symbol: string }): string {
  return `${amountText(Number(tip.amount))} ${unitFor(tip.symbol)}`;
}

/** "25K" / "250" / "5 USDC": the rail's tag, where space is tight. */
function shortAmount(tip: { amount: number; symbol: string }): string {
  const n = Number(tip.amount);
  const num = n >= 1000 ? formatCount(n).replace(/\.0(?=[KMB])/, '') : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return !tip.symbol || tip.symbol.toUpperCase() === 'DHB' ? num : `${num} ${tip.symbol}`;
}

/** The gold coin: DeHub's mark struck into a gold disc. */
export function GoldCoin({ className }: { className?: string }) {
  return (
    <span className={cn('dh-gold-coin', className)} aria-hidden>
      <CutCoins className="dh-gold-coin-mark" />
    </span>
  );
}

export function TipChip({ tip, className }: { tip: { amount: number; symbol: string }; className?: string }) {
  return (
    <span className={cn('dh-tip-chip', className)} data-tip-chip>
      <GoldCoin className="w-3.5 h-3.5" />
      {tipAmountLabel(tip)}
    </span>
  );
}

interface TipWallProps {
  rows: Comment[];
  /** The chip whose comment is open in the list. */
  openId: string | null;
  onToggle: (id: string) => void;
  /** The chip that just landed from this viewer's tip: drops in and glows. */
  landedId: string | null;
}

export const TipWall = memo(function TipWall({ rows, openId, onToggle, landedId }: TipWallProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  if (!rows.length) return null;
  const tokenTotal = rows.reduce((sum, row) => sum + (row.tip && (!row.tip.symbol || row.tip.symbol.toUpperCase() === 'DHB') ? Number(row.tip.amount) || 0 : 0), 0);
  return (
    <section className="dh-tip-rail" data-motion={reduceMotion ? 'none' : 'shine'} aria-label={t('tip.wallLabel', 'Tip messages')} data-tip-wall>
      <header className="dh-tip-rail-head">
        <GoldCoin className="w-4 h-4" />
        <span>{t('tip.railTitle', 'Tips')}</span>
        {tokenTotal > 0 ? (
          <span className="dh-tip-rail-total">{t('tip.railTotal', '{{amount}} tokens', { amount: amountText(tokenTotal) })}</span>
        ) : null}
      </header>
      <div className="dh-tip-rail-row">
        <AnimatePresence initial={false}>
          {rows.map((row, index) => {
            const id = String(row.id);
            const name = row.displayName || row.username || '';
            const avatar = row.avatar;
            const landed = id === landedId;
            return (
              <motion.button
                key={id}
                type="button"
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: -16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
                onClick={() => onToggle(id)}
                aria-pressed={openId === id}
                aria-label={`${name}, ${row.tip ? tipAmountLabel(row.tip) : ''}: ${row.text || ''}`}
                className={cn('dh-tip-pill', index === 0 && 'is-top', openId === id && 'is-open', landed && 'dh-land-glow')}
                style={{ ['--i' as string]: index }}
                data-tip-card={id}
              >
                {avatar ? <img src={avatar} alt="" className="dh-tip-pill-avatar" /> : <span className="dh-tip-pill-avatar" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>}
                {row.tip ? (
                  <span className="dh-tip-pill-tag">
                    <GoldCoin className="dh-tip-pill-coin" />
                    <span className="dh-tip-pill-amount">{shortAmount(row.tip)}</span>
                  </span>
                ) : null}
                <span className="dh-tip-pill-text">{row.text || (row.imageUrl ? 'GIF' : name)}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
});
