import { pixelsPerUnit } from "@/lib/editor/documentDimensions";
import type { GuideUnit } from "@/lib/editor/designGuides";
import { designRulerMarks } from "@/lib/editor/designRulers";

export function DesignRulers({ width, height, scale, unit = "px", dpi = 96 }: { width: number; height: number; scale: number; unit?: GuideUnit; dpi?: number }) {
  return <div aria-hidden className="pointer-events-none absolute inset-0">
    <div className="absolute -top-5 left-0 right-0 h-5 overflow-hidden border-b border-white/20 bg-neutral-950/90">{designRulerMarks(width, width * scale, pixelsPerUnit(unit, dpi)).map(mark => <div key={mark.value} className="absolute bottom-0 border-l border-white/35" style={{ left: mark.position * 100 + "%", height: mark.major ? 9 : 4 }}>{mark.major && <span className="absolute -top-2 left-1 text-[8px] leading-none tabular-nums text-white/55">{mark.value}</span>}</div>)}</div>
    <div className="absolute -left-5 bottom-0 top-0 w-5 overflow-hidden border-r border-white/20 bg-neutral-950/90">{designRulerMarks(height, height * scale, pixelsPerUnit(unit, dpi)).map(mark => <div key={mark.value} className="absolute right-0 border-t border-white/35" style={{ top: mark.position * 100 + "%", width: mark.major ? 9 : 4 }}>{mark.major && <span className="absolute left-0 top-1 origin-top-left rotate-90 text-[8px] leading-none tabular-nums text-white/55">{mark.value}</span>}</div>)}</div>
    <div className="absolute -left-5 -top-5 flex h-5 w-5 items-center justify-center bg-neutral-950 text-[8px] text-white/40">{unit}</div>
  </div>;
}
