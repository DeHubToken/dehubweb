import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_TEXT_LIST_STYLE, type TextListStyle } from "@/lib/editor/textList";
import type { TextClip } from "@/lib/editor/types";
const numbering: Record<TextListStyle["numbering"], string> = { decimal: "1. 2. 3.", "alpha-lower": "a. b. c.", "alpha-upper": "A. B. C.", "roman-lower": "i. ii. iii.", "roman-upper": "I. II. III." };
const bulletNames: Record<string, string> = { disc: "Filled circle", circle: "Hollow circle", square: "Square", dash: "Dash", check: "Check mark" };
const bullets: Record<TextListStyle["bullet"], string> = { disc: "•", circle: "◦", square: "▪", dash: "–", check: "✓" };
export function TextListControls({ value, onChange }: { value: TextClip; onChange: (style: TextListStyle) => void }) {
  const { t } = useTranslation(), style = value.listStyle ?? DEFAULT_TEXT_LIST_STYLE;
  const [start, setStart] = useState(String(style.start));
  useEffect(() => setStart(String(style.start)), [value.id, style.start]);
  if (value.list !== "bullet" && value.list !== "number") return null;
  const maximum = style.numbering.startsWith("roman") ? 3999 : 9999;
  return <div className="space-y-2 rounded-lg border border-white/10 p-2"><div className="flex flex-wrap gap-1">{value.list === "number" ? Object.entries(numbering).map(([key, label]) => <button type="button" key={key} disabled={!!value.locked} aria-pressed={style.numbering === key} onClick={() => onChange({ ...style, numbering: key as TextListStyle["numbering"], start: Math.min(style.start, key.startsWith("roman") ? 3999 : 9999) })} className={`min-h-9 rounded-lg border px-2 text-xs ${style.numbering === key ? "border-cyan-300 bg-cyan-300/10 text-white" : "border-white/15 text-white/65"}`}>{label}</button>) : Object.entries(bullets).map(([key, label]) => <button type="button" key={key} disabled={!!value.locked} aria-label={t(`editor.text.bullet.${key}`, { defaultValue: bulletNames[key] })} aria-pressed={style.bullet === key} onClick={() => onChange({ ...style, bullet: key as TextListStyle["bullet"] })} className={`min-h-9 min-w-9 rounded-lg border px-2 text-base ${style.bullet === key ? "border-cyan-300 bg-cyan-300/10 text-white" : "border-white/15 text-white/65"}`}>{label}</button>)}</div>
    {value.list === "number" && <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-white/60">{t("editor.text.listStart", { defaultValue: "Start numbering at" })}<input type="number" min={1} max={maximum} value={start} onChange={event => setStart(event.target.value)} className="ml-2 min-h-9 w-20 rounded-lg border border-white/20 bg-white/5 px-2 text-white" /></label><button type="button" disabled={!!value.locked || !Number.isInteger(Number(start)) || Number(start) < 1 || Number(start) > maximum} onClick={() => onChange({ ...style, start: Number(start) })} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{t("common.apply", { defaultValue: "Apply" })}</button></div>}
  </div>;
}
