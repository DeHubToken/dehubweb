interface Props { progressBps: number; size?: number; }
export function BondingCurveProgress({ progressBps, size = 48 }: Props) {
  const pct = Math.max(0, Math.min(100, progressBps / 100));
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={3} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke="white" strokeWidth={3} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms ease' }} />
      </svg>
      <span className="absolute text-[10px] font-semibold text-white tabular-nums">{pct.toFixed(0)}%</span>
    </div>
  );
}
