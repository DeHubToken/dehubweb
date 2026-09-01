/**
 * An amount denominated in DHB, rendered with the gold coin in place of the
 * ticker text.
 *
 * The word "DHB" after a number is noise — the coin is the mark people already
 * recognise from every balance, price and tip on the platform, and it survives
 * translation where a three-letter ticker set in a UI font does not. The coin
 * goes where the word went, so surrounding copy needs no rewriting; that also
 * keeps it identical to `dhbText()` in `lib/dhb-toast`, which does the same
 * substitution for toast strings.
 *
 * Anything that is NOT DHB keeps its symbol as text — a post gated on someone
 * else's token must not wear our coin.
 */
import dehubCoin from '@/assets/dehub-coin.png';
import { cn } from '@/lib/utils';

interface DhbAmountProps {
  /** Already formatted — this component never rounds or abbreviates. */
  amount: React.ReactNode;
  /** Ticker the amount is in. Anything other than DHB renders as text. */
  currency?: string | null;
  /** Sizing for the coin. Defaults to a 1rem square, matching body text. */
  iconClassName?: string;
  className?: string;
}

/** Absent currency means DHB — every caller's fallback was `|| 'DHB'` already. */
export function isDhb(currency?: string | null): boolean {
  const symbol = (currency ?? 'DHB').trim().toUpperCase().replace(/^\$/, '');
  return symbol === '' || symbol === 'DHB' || symbol === 'DEHUB';
}

export function DhbAmount({ amount, currency, iconClassName, className }: DhbAmountProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
      {amount}
      {isDhb(currency) ? (
        <img
          src={dehubCoin}
          alt="DHB"
          className={cn('inline-block h-4 w-4 shrink-0', iconClassName)}
          loading="lazy"
        />
      ) : (
        currency
      )}
    </span>
  );
}

/**
 * The coin on its own, sized to sit inline in a line of text. Use it where the
 * amount is already laid out by the surrounding markup and only the ticker
 * word needs replacing.
 */
export function DhbCoin({ className }: { className?: string }) {
  return (
    <img
      src={dehubCoin}
      alt="DHB"
      className={cn('inline-block h-[1.15em] w-[1.15em] shrink-0 align-[-0.2em]', className)}
      loading="lazy"
    />
  );
}

export default DhbAmount;
