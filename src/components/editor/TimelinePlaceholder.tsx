import { useMemo } from "react";
import { useEditorStore } from "@/store/editorStore";

/**
 * Placeholder timeline — renders an empty ruler and two empty tracks.
 * Editing logic will be added in a later phase.
 */
export function TimelinePlaceholder() {
  const duration = useEditorStore((s) => s.duration);
  const currentTime = useEditorStore((s) => s.currentTime);

  const ticks = useMemo(() => {
    const total = Math.max(10, Math.ceil(duration || 30));
    const step = total > 120 ? 10 : total > 30 ? 5 : 1;
    const out: number[] = [];
    for (let s = 0; s <= total; s += step) out.push(s);
    return { items: out, total };
  }, [duration]);

  const playheadPct = duration ? (currentTime / Math.max(duration, 0.01)) * 100 : 0;

  return (
    <div className="flex h-48 shrink-0 flex-col border-t border-white/10 bg-black/70 backdrop-blur-[24px]">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
          Timeline
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/30">
          Editing tools coming soon
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {/* Ruler */}
        <div className="relative h-5 border-b border-white/10">
          {ticks.items.map((t) => (
            <div
              key={t}
              className="absolute top-0 flex h-full flex-col items-start"
              style={{ left: `${(t / Math.max(ticks.total, 1)) * 100}%` }}
            >
              <div className="h-2 w-px bg-white/20" />
              <span className="ml-1 text-[9px] text-white/40">{t}s</span>
            </div>
          ))}
        </div>

        {/* Tracks */}
        <div className="space-y-1.5 px-2 py-2">
          {["V1", "A1"].map((label) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-6 text-center text-[10px] font-semibold text-white/40">
                {label}
              </span>
              <div className="h-10 flex-1 rounded-md border border-dashed border-white/10 bg-white/[0.02]" />
            </div>
          ))}
        </div>

        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-white/60"
          style={{ left: `calc(${playheadPct}% + 26px)` }}
        />
      </div>
    </div>
  );
}
