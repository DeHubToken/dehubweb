import { Wifi, Signal, BatteryFull } from 'lucide-react';

export function MobileStatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-14 pb-1 text-white text-[11px] font-semibold">
      <span>9:41</span>
      <div className="flex items-center gap-1">
        <Signal className="w-3.5 h-3.5" />
        <Wifi className="w-3.5 h-3.5" />
        <BatteryFull className="w-4 h-4" />
      </div>
    </div>
  );
}
