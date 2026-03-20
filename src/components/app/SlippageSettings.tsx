/**
 * Slippage Settings Component
 * ============================
 * Gear icon that toggles a slippage selector with presets + custom input.
 */

import { useState } from 'react';
import { Settings2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';

const PRESETS = [
  { label: '0.5%', bps: 50 },
  { label: '1%', bps: 100 },
  { label: '2%', bps: 200 },
  { label: '5%', bps: 500 },
];

interface SlippageSettingsProps {
  slippageBps: number;
  onSlippageChange: (bps: number) => void;
}

export function SlippageSettings({ slippageBps, onSlippageChange }: SlippageSettingsProps) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const isPreset = PRESETS.some(p => p.bps === slippageBps);
  const displayPct = (slippageBps / 100).toFixed(slippageBps % 100 === 0 ? 0 : 1);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <Settings2 className="w-3.5 h-3.5" />
        <span>{displayPct}% slippage</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 space-y-2.5 min-w-[200px] shadow-xl">
          <p className="text-[11px] text-zinc-400 font-medium">Slippage Tolerance</p>
          <div className="flex gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.bps}
                onClick={() => {
                  onSlippageChange(p.bps);
                  setCustomValue('');
                }}
                className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                  slippageBps === p.bps
                    ? 'bg-white/20 border-white/30 text-white'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border-white/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0.1"
              max="50"
              step="0.1"
              placeholder="Custom %"
              value={customValue}
              onChange={e => {
                const val = e.target.value;
                setCustomValue(val);
                const num = parseFloat(val);
                if (num > 0 && num <= 50) {
                  onSlippageChange(Math.round(num * 100));
                }
              }}
              className="bg-white/[0.06] border-white/10 text-white text-xs h-8 flex-1"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
          {slippageBps > 500 && (
            <p className="text-[10px] text-amber-400/80 flex items-center justify-center gap-1">
              <span>⚠</span><span>High slippage, risk of loss, be very careful</span><span>⚠</span>
            </p>
          )}
          {slippageBps < 50 && (
            <p className="text-[10px] text-amber-400/80">⚠ Low slippage — transaction may fail</p>
          )}
        </div>
      )}
    </div>
  );
}
