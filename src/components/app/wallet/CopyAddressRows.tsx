/**
 * "Copy address" when the account has two of them.
 *
 * A DeHub account is payable on the EVM chains at an `0x…` address and on
 * Solana at a base58 one, and the two address spaces do not overlap: SOL or an
 * SPL token sent to the EVM address is unrecoverable. So every surface that
 * offers to copy "your address" asks which one first, rather than picking for
 * the user and being right most of the time.
 *
 * Deliberately a plain list rather than a popover or a nested sheet. Each of
 * these lives inside a drawer or a menu already, and an overlay opened from
 * another overlay is the exact shape that dismisses its own parent
 * (see lib/overlay-dismiss.ts). Swapping the rows in place has none of that.
 */
import { useState } from 'react';
import { Check, ChevronLeft, Copy, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useWalletAddresses } from '@/hooks/use-wallet-addresses';
import solanaLogo from '@/assets/icons/solana-logo.png';

const ROW_CLASS =
  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left';

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface CopyAddressRowsProps {
  /** Rendered as a back row above the options when given. */
  onBack?: () => void;
  /** Called after a successful copy — usually to close the menu it sits in. */
  onCopied?: () => void;
  className?: string;
}

export function CopyAddressRows({ onBack, onCopied, className }: CopyAddressRowsProps) {
  const { t } = useTranslation();
  const { evm, solana, solanaIsExternal } = useWalletAddresses();
  const [copiedKey, setCopiedKey] = useState<'evm' | 'solana' | null>(null);

  const copy = (key: 'evm' | 'solana', address: string) => {
    navigator.clipboard.writeText(address)
      .then(() => {
        setCopiedKey(key);
        toast.success(
          key === 'solana'
            ? t('wallet.solanaAddressCopied')
            : t('wallet.evmAddressCopied'),
        );
        setTimeout(() => setCopiedKey(null), 2000);
        onCopied?.();
      })
      .catch(() => toast.error(t('wallet.addressCopyFailed')));
  };

  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-2 px-1 py-2 text-white/60 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm">{t('wallet.back')}</span>
        </button>
      )}
      <p className="px-1 pb-1 text-xs text-white/40">{t('wallet.chooseAddressNetwork')}</p>

      {evm && (
        <button type="button" onClick={() => copy('evm', evm)} className={ROW_CLASS}>
          <div className="w-8 h-8 shrink-0 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            {copiedKey === 'evm' ? <Check className="w-4 h-4 text-emerald-400" /> : <Wallet className="w-4 h-4 text-white" />}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-white font-medium">{t('wallet.evmAddressLabel')}</span>
            <span className="text-xs text-zinc-400 truncate">
              {t('wallet.evmAddressHint')} · {shorten(evm)}
            </span>
          </div>
          <Copy className="w-4 h-4 text-white/30 ml-auto shrink-0" />
        </button>
      )}

      {solana && (
        <button type="button" onClick={() => copy('solana', solana)} className={ROW_CLASS}>
          <div className="w-8 h-8 shrink-0 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            {copiedKey === 'solana'
              ? <Check className="w-4 h-4 text-emerald-400" />
              : <img src={solanaLogo} alt="" className="w-4 h-4" />}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-white font-medium">{t('wallet.solanaAddressLabel')}</span>
            <span className="text-xs text-zinc-400 truncate">
              {solanaIsExternal ? t('wallet.solanaAddressLinkedHint') : t('wallet.solanaAddressHint')} · {shorten(solana)}
            </span>
          </div>
          <Copy className="w-4 h-4 text-white/30 ml-auto shrink-0" />
        </button>
      )}
    </div>
  );
}
