import { useTranslation } from "react-i18next";
import type { ShapeClip } from "@/lib/editor/types";
export function ShapeStrokeEdges({ value, onChange }: { value: ShapeClip; onChange: (patch: Partial<ShapeClip>) => void }) {
  const { t } = useTranslation(), open = value.shape === "line" || value.shape === "arrow";
  if (!value.stroke || value.shape === "path" || value.connector || value.chart || value.table || value.qr) return null;
  const choose = (kind: "strokeCap" | "strokeJoin", option: string) => onChange(kind === "strokeCap" ? { strokeCap: option as ShapeClip["strokeCap"] } : { strokeJoin: option as ShapeClip["strokeJoin"] });
  const choices = (kind: "strokeCap" | "strokeJoin", title: string, options: readonly string[], names: Record<string, string>) => <div className="space-y-1"><p className="text-xs text-white/55">{title}</p><div className="flex flex-wrap gap-1">{options.map(option => <button type="button" key={option} disabled={!!value.locked} aria-pressed={(value[kind] ?? "round") === option} onClick={() => choose(kind, option)} className={`min-h-9 rounded-lg border px-2 text-xs disabled:opacity-35 ${(value[kind] ?? "round") === option ? "border-cyan-300 bg-cyan-300/10 text-white" : "border-white/15 text-white/65"}`}>{t(`editor.stroke.${kind}.${option}`, { defaultValue: names[option] })}</button>)}</div></div>;
  return <div className="space-y-2">{open && choices("strokeCap", t("editor.stroke.ends", { defaultValue: "Line ends" }), ["round", "butt", "square"], { round: "Round", butt: "Flat", square: "Square" })}{choices("strokeJoin", t("editor.stroke.joins", { defaultValue: "Outline corners" }), ["round", "bevel", "miter"], { round: "Rounded", bevel: "Beveled", miter: "Sharp" })}</div>;
}
