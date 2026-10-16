import { useTranslation } from "react-i18next";
import { usePresentationStopwatch } from "@/lib/editor/usePresentationStopwatch";
export function PresentationStopwatch({ foreground }: { foreground: boolean }) {
  const { t } = useTranslation(), clock = usePresentationStopwatch(foreground);
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/65 hover:bg-white/10";
  return <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-1"><span className="text-xs text-white/45">{t("editor.present.elapsed", { defaultValue: "Elapsed" })}</span><span role="timer" aria-live="off" className="min-w-16 text-center text-xs tabular-nums text-white/75">{clock.label}</span><button type="button" aria-pressed={!clock.running} onClick={clock.toggle} className={button}>{t(clock.running ? "editor.present.pauseClock" : "editor.present.resumeClock", { defaultValue: clock.running ? "Pause clock" : "Resume clock" })}</button><button type="button" onClick={clock.reset} className={button}>{t("editor.present.resetClock", { defaultValue: "Reset clock" })}</button></div>;
}
