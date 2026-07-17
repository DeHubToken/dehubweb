/**
 * Helpers for rendering DHB amounts with the gold coin icon in toast messages.
 * Usage: toast.success(dhbToast`Tip of ${amount} sent!`)
 */
import dehubCoin from '@/assets/dehub-coin.png';

/** Renders an inline coin icon + amount, replacing "DHB" text in toasts */
export const DhbInline = ({ amount }: { amount: string | number }) => (
  <span className="inline-flex items-center gap-1">
    <span>{typeof amount === 'number' ? amount.toLocaleString() : amount}</span>
    <img src={dehubCoin} alt="DHB" className="inline-block w-4 h-4 -mt-px" />
  </span>
);

/**
 * Replace all occurrences of "DHB" in a string with the coin icon.
 * Returns a JSX element suitable for sonner toast title/description.
 */
export const dhbText = (text: string): React.ReactNode => {
  const parts = text.split(/(DHB)/g);
  if (parts.length === 1) return text;
  return (
    <span className="inline-flex items-center gap-0 flex-wrap">
      {parts.map((part, i) =>
        part === 'DHB' ? (
          <img key={i} src={dehubCoin} alt="DHB" className="inline-block w-4 h-4 mx-0.5 -mt-px" />
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
};
