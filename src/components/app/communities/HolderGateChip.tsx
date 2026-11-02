import { useTranslation } from 'react-i18next';
import Coins from '@/components/ui/cut-icons/coins';
import dehubCoin from '@/assets/dehub-coin.png';
import { chainLabel, formatHolderAmount, isDehubToken, type HolderGate } from '@/hooks/use-holder-gate';

/** "Holders only · 1,000 DHB+" under a holder group's member count. */
export function HolderGateChip({ gate }: { gate: HolderGate }) {
  const { t } = useTranslation();
  return (
    <p
      data-holder-gate
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-300"
      title={chainLabel(gate.chainId)}
    >
      {isDehubToken(gate)
        ? <img src={dehubCoin} alt="" className="w-3.5 h-3.5 shrink-0" />
        : <Coins className="w-3.5 h-3.5 shrink-0" />}
      {t('communities.holderGate.chip', {
        defaultValue: 'Holders only · {{amount}}+',
        amount: formatHolderAmount(gate.min, gate.symbol),
      })}
    </p>
  );
}
