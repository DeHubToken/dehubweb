/**
 * Inspector for several layers at once: align them to each other, spread
 * them evenly, duplicate or delete them. Every action is one undo step.
 */
import { useTranslation } from "react-i18next";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignHorizontalSpaceAround, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround,
  Copy, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { clipBoxForSize, getTransform, isVisualClip, placementPatch, type ClipBox } from "@/lib/editor/render";
import type { Clip } from "@/lib/editor/types";

type Edge = "start" | "centre" | "end";

export function MultiSelectSection() {
  const { t } = useTranslation();
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const clips = useEditorStore((s) => s.clips);
  const duplicateOnCanvas = useEditorStore((s) => s.duplicateOnCanvas);
  const rippleDelete = useEditorStore((s) => s.rippleDelete);

  const layers = clips.filter((c) => selectedClipIds.includes(c.id) && isVisualClip(c) && !c.locked);

  /** Current boxes, measured the same way the canvas draws them. */
  const measure = (): { clip: Clip; box: ClipBox; hw: number; hh: number }[] => {
    const s = useEditorStore.getState();
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return [];
    return s.clips
      .filter((c) => selectedClipIds.includes(c.id) && isVisualClip(c) && !c.locked)
      .map((clip) => {
        const media = "mediaId" in clip ? s.media.find((m) => m.id === clip.mediaId) : undefined;
        const dims = media?.width && media?.height ? { w: media.width, h: media.height } : null;
        const box = clipBoxForSize(ctx, clip, s.settings.width, s.settings.height, dims);
        if (!box) return null;
        const r = (box.rotation * Math.PI) / 180;
        const c = Math.abs(Math.cos(r));
        const sn = Math.abs(Math.sin(r));
        return { clip, box, hw: (box.w * c + box.h * sn) / 2, hh: (box.w * sn + box.h * c) / 2 };
      })
      .filter((x): x is { clip: Clip; box: ClipBox; hw: number; hh: number } => !!x);
  };

  /** Move a layer so its box centre lands on (cx, cy) in canvas pixels. */
  const moveTo = (clip: Clip, box: ClipBox, cx: number, cy: number) => {
    const s = useEditorStore.getState();
    const tr = getTransform(clip);
    s.patchClip(clip.id, placementPatch(clip, {
      x: tr.x + (cx - box.cx) / s.settings.width,
      y: tr.y + (cy - box.cy) / s.settings.height,
    }));
  };

  const align = (axis: "x" | "y", edge: Edge) => {
    const items = measure();
    if (items.length < 2) return;
    const lo = Math.min(...items.map((i) => (axis === "x" ? i.box.cx - i.hw : i.box.cy - i.hh)));
    const hi = Math.max(...items.map((i) => (axis === "x" ? i.box.cx + i.hw : i.box.cy + i.hh)));
    void useEditorStore.getState().runAsOneStep(() => {
      for (const i of items) {
        const half = axis === "x" ? i.hw : i.hh;
        const target = edge === "start" ? lo + half : edge === "end" ? hi - half : (lo + hi) / 2;
        if (axis === "x") moveTo(i.clip, i.box, target, i.box.cy);
        else moveTo(i.clip, i.box, i.box.cx, target);
      }
    });
  };

  /** Equal gaps between layers along an axis, keeping the outer two in place. */
  const distribute = (axis: "x" | "y") => {
    const items = measure().sort((a, b) => (axis === "x" ? a.box.cx - b.box.cx : a.box.cy - b.box.cy));
    if (items.length < 3) return;
    const size = (i: (typeof items)[number]) => (axis === "x" ? i.hw * 2 : i.hh * 2);
    const first = items[0];
    const last = items[items.length - 1];
    const start = axis === "x" ? first.box.cx - first.hw : first.box.cy - first.hh;
    const end = axis === "x" ? last.box.cx + last.hw : last.box.cy + last.hh;
    const gap = (end - start - items.reduce((n, i) => n + size(i), 0)) / (items.length - 1);
    let cursor = start;
    void useEditorStore.getState().runAsOneStep(() => {
      for (const i of items) {
        const centre = cursor + size(i) / 2;
        if (axis === "x") moveTo(i.clip, i.box, centre, i.box.cy);
        else moveTo(i.clip, i.box, i.box.cx, centre);
        cursor += size(i) + gap;
      }
    });
  };

  const btn = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center justify-center rounded-md border border-white/10 text-white/60 transition hover:bg-white/5 hover:text-white",
        "disabled:opacity-30",
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/70">{t("editor.multi.selected", { count: selectedClipIds.length })}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.multi.alignTogether")}</p>
      <div className="grid grid-cols-6 gap-1">
        {btn(t("editor.layer.alignLeft"), <AlignStartVertical className="h-3.5 w-3.5" />, () => align("x", "start"), layers.length < 2)}
        {btn(t("editor.layer.alignCentre"), <AlignCenterVertical className="h-3.5 w-3.5" />, () => align("x", "centre"), layers.length < 2)}
        {btn(t("editor.layer.alignRight"), <AlignEndVertical className="h-3.5 w-3.5" />, () => align("x", "end"), layers.length < 2)}
        {btn(t("editor.layer.alignTop"), <AlignStartHorizontal className="h-3.5 w-3.5" />, () => align("y", "start"), layers.length < 2)}
        {btn(t("editor.layer.alignMiddle"), <AlignCenterHorizontal className="h-3.5 w-3.5" />, () => align("y", "centre"), layers.length < 2)}
        {btn(t("editor.layer.alignBottom"), <AlignEndHorizontal className="h-3.5 w-3.5" />, () => align("y", "end"), layers.length < 2)}
      </div>
      <p className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.multi.spacing")}</p>
      <div className="grid grid-cols-2 gap-1">
        {btn(t("editor.multi.spaceHorizontal"), <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />, () => distribute("x"), layers.length < 3)}
        {btn(t("editor.multi.spaceVertical"), <AlignVerticalSpaceAround className="h-3.5 w-3.5" />, () => distribute("y"), layers.length < 3)}
      </div>
      <div className="grid grid-cols-2 gap-1 pt-1">
        <button type="button" onClick={() => duplicateOnCanvas()}
          className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-white/10 text-[11px] text-white/70 hover:bg-white/5 hover:text-white">
          <Copy className="h-3 w-3" /> {t("editor.menu.duplicate")}
        </button>
        <button type="button" onClick={() => rippleDelete()}
          className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-white/10 text-[11px] text-red-300 hover:bg-red-500/10">
          <Trash2 className="h-3 w-3" /> {t("editor.menu.delete")}
        </button>
      </div>
      <p className="text-[10px] leading-snug text-white/40">{t("editor.multi.hint")}</p>
    </div>
  );
}
