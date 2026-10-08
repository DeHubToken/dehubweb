import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { textFitEnabled, textFitPatch, textWrapEnabled, textWrapPatch } from "@/lib/editor/textFit";
import type { TextClip } from "@/lib/editor/types";

export function TextFitControls({ clip, onChange, onFitCaptions, captionsFitted }: {
  clip: TextClip;
  onChange(patch: Partial<TextClip>): void;
  onFitCaptions?: () => void;
  captionsFitted?: boolean;
}) {
  const { t } = useTranslation();
  const wrapping = textWrapEnabled(clip), fitting = textFitEnabled(clip);
  return <div className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-2">
    <label className="flex items-center justify-between text-[11px] text-white/70">
      {t("editor.textFit.wrap", { defaultValue: "Wrap lines" })}
      <input type="checkbox" checked={wrapping} onChange={event => onChange(textWrapPatch(clip, event.target.checked))} className="h-3.5 w-3.5 accent-white" />
    </label>
    {wrapping && <label className="block space-y-1 text-[11px] text-white/70">
      <span>{t("editor.textFit.width", { defaultValue: "Text width" })} · {Math.round(clip.maxWidth! * 100)}%</span>
      <input type="range" min={5} max={100} step={1} value={Math.round(clip.maxWidth! * 100)} aria-label={t("editor.textFit.width", { defaultValue: "Text width" })}
        onChange={event => onChange({ maxWidth: Number(event.target.value) / 100 })} className="h-5 w-full accent-white" />
    </label>}
    <label className="flex items-center justify-between text-[11px] text-white/70">
      {t("editor.textFit.shrink", { defaultValue: "Shrink text to fit" })}
      <input type="checkbox" checked={fitting} onChange={event => onChange(textFitPatch(clip, event.target.checked))} className="h-3.5 w-3.5 accent-white" />
    </label>
    {fitting && <label className="block space-y-1 text-[11px] text-white/70">
      <span>{t("editor.textFit.height", { defaultValue: "Text height" })} · {Math.round(clip.maxHeight! * 100)}%</span>
      <input type="range" min={5} max={100} step={1} value={Math.round(clip.maxHeight! * 100)} aria-label={t("editor.textFit.height", { defaultValue: "Text height" })}
        onChange={event => onChange({ maxHeight: Number(event.target.value) / 100 })} className="h-5 w-full accent-white" />
    </label>}
    {onFitCaptions && <Button variant="ghost" size="sm" disabled={captionsFitted} onClick={onFitCaptions} className="h-7 w-full border border-white/10 text-[11px] text-white/80">
      {t("editor.textFit.captions", { defaultValue: "Fit caption track" })}
    </Button>}
  </div>;
}
