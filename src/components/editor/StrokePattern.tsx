import { useTranslation } from "react-i18next";
import type { TextStroke } from "@/lib/editor/types";

export function StrokePattern({ stroke, onChange }: { stroke: TextStroke; onChange: (value: TextStroke) => void }) {
  const { t } = useTranslation();
  const pattern = !stroke.dash?.length ? "solid" : stroke.dash[0] <= 1 ? "dotted" : "dashed";
  return <label className="block space-y-1 text-xs text-white/65"><span>{t("editor.outline.pattern", { defaultValue: "Line pattern" })}</span>
    <select value={pattern} onChange={e => onChange({ ...stroke, dash: e.target.value === "solid" ? undefined : e.target.value === "dotted" ? [1, 12] : [16, 12] })} className="h-9 w-full rounded-lg border border-white/15 bg-neutral-900 px-2 text-white">
      {(["solid", "dashed", "dotted"] as const).map(value => <option key={value} value={value}>{t(`editor.outline.${value}`, { defaultValue: value === "solid" ? "Solid" : value === "dashed" ? "Dashed" : "Dotted" })}</option>)}
    </select>
  </label>;
}
