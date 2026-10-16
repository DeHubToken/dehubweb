import { useState } from "react";
import { useTranslation } from "react-i18next";
import { designFonts, replaceDesignFont } from "@/lib/editor/designFonts";
import { GOOGLE_FONTS, loadGoogleFont } from "@/lib/editor/googleFonts";
import type { ProjectSnapshot } from "@/lib/editor/types";

export function DocumentFonts({ project, apply }: { project: ProjectSnapshot; apply: (operation: (p: ProjectSnapshot) => ProjectSnapshot) => void }) {
  const { t } = useTranslation();
  const fonts = designFonts(project);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("Inter");
  const source = fonts.find(font => font.family === from) ?? fonts[0];
  const target = GOOGLE_FONTS.find(font => font.family === to);
  if (!fonts.length) return null;
  return <details className="rounded-lg border border-white/15 p-3">
    <summary className="cursor-pointer text-xs font-medium text-white/80">{t("editor.fonts.replaceDesign", { defaultValue: "Replace a font throughout this design" })}</summary>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select value={source?.family ?? ""} onChange={e => setFrom(e.target.value)} aria-label={t("editor.fonts.source", { defaultValue: "Font to replace" })} className="min-h-9 max-w-full rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs">{fonts.map(font => <option key={font.family} value={font.family}>{font.family} · {font.count}</option>)}</select>
      <span className="text-white/50">→</span>
      <select value={to} onChange={e => setTo(e.target.value)} aria-label={t("editor.fonts.target", { defaultValue: "Replacement font" })} className="min-h-9 max-w-full rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs">{GOOGLE_FONTS.map(font => <option key={font.family} value={font.family}>{font.family}</option>)}</select>
      <button type="button" disabled={!source || !target || source.family === target.family} onClick={() => { if (!source || !target) return; loadGoogleFont(target.family, target.weights); apply(p => replaceDesignFont(p, source.css, target)); setFrom(target.family); }} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.designTools.changeAll", { defaultValue: "Change all" })}</button>
    </div>
  </details>;
}
