import { useTranslation } from 'react-i18next';

export function FeeBreakdown() {
  const { t } = useTranslation();
  const rows = [
    { labelKey: 'launchpad.feeBurn', pct: 40 },
    { labelKey: 'launchpad.feeStakers', pct: 30 },
    { labelKey: 'launchpad.feeCreator', pct: 20 },
    { labelKey: 'launchpad.feePlatform', pct: 10 },
  ];
  return (
    <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-sm font-semibold">{t('launchpad.feeSplit')}</h3>
        <span className="text-white/50 text-xs">{t('launchpad.feePerTrade')}</span>
      </div>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.labelKey} className="flex items-center gap-3">
            <span className="text-white/70 text-xs w-20">{t(r.labelKey)}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-white/60" style={{ width: `${r.pct}%` }} />
            </div>
            <span className="text-white text-xs font-semibold tabular-nums w-8 text-right">{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
