import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpcomingPagePreview, type UpcomingPresentationPage } from "@/lib/editor/useUpcomingPagePreview";
export function PresentationNextPage({ next, onInteract, active = true }: { active?: boolean; next: UpcomingPresentationPage; onInteract: () => void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), result = useUpcomingPagePreview(next, open && active);
  const title = next.title || t("editor.pages.page", { number: next.index + 1 });
  return <section className="mt-4 space-y-2 border-t border-white/15 pt-2"><button type="button" aria-expanded={open} onClick={() => { onInteract(); setOpen(!open); }} className="min-h-9 text-left text-xs text-white/65">{t("editor.present.upNext", { defaultValue: "Up next" })}: {next.index + 1}. {title} {open ? "−" : "+"}</button>{open && <div aria-busy={result.busy}>{result.image && <img src={result.image} alt={t("editor.present.nextPreviewAlt", { defaultValue: "Upcoming page: {{title}}", title })} className="h-32 max-w-full rounded-md border border-white/15 object-contain" />}<p role="status" className="text-[10px] text-white/45">{result.busy ? t("editor.present.nextLoading", { defaultValue: "Preparing next-page preview…" }) : result.unavailable ? t("editor.present.nextUnavailable", { defaultValue: "Next-page preview is unavailable." }) : t("editor.present.nextPreviewHint", { defaultValue: "Preview only. Use Next to move to this page." })}</p></div>}</section>;
}
