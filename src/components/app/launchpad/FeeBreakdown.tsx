export function FeeBreakdown() {
  const rows = [
    { label: 'Burn DHB', pct: 40 },
    { label: 'Stakers', pct: 30 },
    { label: 'Creator', pct: 20 },
    { label: 'Platform', pct: 10 },
  ];
  return (
    <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-sm font-semibold">Fee split</h3>
        <span className="text-white/50 text-xs">1% per trade</span>
      </div>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="text-white/70 text-xs w-20">{r.label}</span>
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
