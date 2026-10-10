import { useTranslation as _useCopy } from 'react-i18next';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { Lock, TrendingUp, Clock, Coins } from 'lucide-react';

const stakingOptions = (t: TFunction) => [
  { period: '7 Days', apy: '8.2%', minStake: t('mobilePreview.tokenAmount', { amount: '100' }), locked: t('mobilePreview.tokenAmount', { amount: '2.4M' }) },
  { period: '30 Days', apy: '12.4%', minStake: t('mobilePreview.tokenAmount', { amount: '500' }), locked: t('mobilePreview.tokenAmount', { amount: '8.1M' }) },
  { period: '90 Days', apy: '18.7%', minStake: t('mobilePreview.tokenAmount', { amount: '1,000' }), locked: t('mobilePreview.tokenAmount', { amount: '15.3M' }) },
];

export function StakingScreen() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title={_copy("copy.5190ff487713", { defaultValue: "Staking" })} showAvatar={false} />

      {/* Stats overview */}
      <div className="grid grid-cols-2 gap-2 mx-4 my-3">
        {[
          { icon: Coins, label: _copy("copy.554d48467d84", { defaultValue: "Total Staked" }), value: t('mobilePreview.tokenAmount', { amount: '25.8M' }) },
          { icon: TrendingUp, label: _copy("copy.daa110b14379", { defaultValue: "Avg APY" }), value: '12.4%' },
          { icon: Lock, label: _copy("copy.0a6e9a7b8bc8", { defaultValue: "Your Staked" }), value: t('mobilePreview.tokenAmount', { amount: '10,000' }) },
          { icon: Clock, label: _copy("copy.781513f8d423", { defaultValue: "Lock Remaining" }), value: '23 days' },
        ].map((stat) => (
          <div key={stat.label} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <stat.icon className="w-4 h-4 text-zinc-400 mb-1.5" />
            <p className="text-zinc-500 text-[10px]">{stat.label}</p>
            <p className="text-white text-sm font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Your position */}
      <div className="mx-4 mb-4 p-4 rounded-2xl border border-white/[0.1] bg-white/[0.03]">
        <h3 className="text-white text-sm font-semibold mb-3">{_copy("copy.4bca1baaede9", { defaultValue: "Your Position" })}</h3>
        <div className="space-y-2">
          {[
            ['Staked Amount', t('mobilePreview.tokenAmount', { amount: '10,000' })],
            ['Lock Period', '90 Days'],
            ['Earned Rewards', t('mobilePreview.tokenAmount', { amount: '+461' })],
            ['Current APY', '18.7%'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-zinc-500 text-sm">{label}</span>
              <span className="text-white text-sm font-medium">{value}</span>
            </div>
          ))}
        </div>
        <button className="w-full mt-4 h-10 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-medium">{_copy("copy.07c5bb625e05", { defaultValue: "Claim Rewards" })}</button>
      </div>

      {/* Staking options */}
      <div className="px-4 flex-1">
        <h3 className="text-white text-sm font-semibold mb-3">{_copy("copy.cd9efeff5b00", { defaultValue: "Staking Options" })}</h3>
        <div className="space-y-2">
          {stakingOptions(t).map((opt) => (
            <div key={opt.period} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                <Lock className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <span className="text-white text-sm font-medium block">{opt.period}</span>
                <span className="text-zinc-600 text-[11px]">{_copy("copy.1a00d8278b18", { defaultValue: "Min: " })}{opt.minStake}</span>
              </div>
              <div className="text-right">
                <span className="text-white text-sm font-bold block">{opt.apy}</span>
                <span className="text-zinc-600 text-[10px]">{opt.locked}{_copy("copy.0b058a92a5a3", { defaultValue: " locked" })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <MobileBottomBar />
    </div>
  );
}
