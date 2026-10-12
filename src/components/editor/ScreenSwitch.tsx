import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { getPages, pageAt, pagePreviewTime, type Page } from "@/lib/editor/pages";

/** Screen navigation remains available while the text controls are open. */
export function ScreenSwitch() {
  const { t } = useTranslation();
  const settings = useEditorStore(s => s.settings);
  const clips = useEditorStore(s => s.clips);
  const time = useEditorStore(s => s.currentTime);
  const pages = getPages(settings, clips);
  if (pages.length < 2) return null;
  const current = pageAt(pages, time);
  const pick = (page: Page) => {
    const store = useEditorStore.getState();
    const selected = store.clips.find(c => c.id === store.selectedClipIds[0]);
    const next = selected?.kind === "text" ? store.clips.filter(c => c.kind === "text" && c.start < page.end && c.start + c.duration > page.start)
      .sort((a, b) => (a.kind === "text" && b.kind === "text" ? Math.abs(a.y - selected.y) - Math.abs(b.y - selected.y) : 0))[0] : undefined;
    store.setIsPlaying(false);
    store.setCurrentTime(pagePreviewTime(page));
    store.selectClip(next?.id ?? null);
  };
  return <nav aria-label={t("editor.pages.label")} className="space-y-2">
    <p className="text-xs font-semibold text-white">{t("editor.pages.position", { current: current.index + 1, total: pages.length })}</p>
    <div className="flex flex-wrap gap-1.5">
      {pages.map(page => <button key={page.index} type="button" aria-current={page.index === current.index ? "page" : undefined} onClick={() => pick(page)} className={`min-h-11 rounded-lg border px-3 text-xs transition ${page.index === current.index ? "border-white bg-white text-black" : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"}`}>
        {t("editor.pages.page", { number: page.index + 1 })}
      </button>)}
    </div>
  </nav>;
}
