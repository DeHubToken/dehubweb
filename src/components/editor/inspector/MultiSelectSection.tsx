import { layoutDesign, type LayoutAction } from "@/lib/editor/designLayout";
/**
 * Inspector for several layers at once: align them to each other, spread
 * them evenly, duplicate or delete them. Every action is one undo step.
 */
import { useTranslation } from "react-i18next";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround } from "lucide-react";
import Copy from "@/components/ui/cut-icons/copy";
import Trash2 from "@/components/ui/cut-icons/delete";

import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { clipBoxForSize, getTransform, isVisualClip, placementPatchAt, type ClipBox } from "@/lib/editor/render";
import { resolveClipAt } from "@/lib/editor/keyframes";
import { recordOpts } from "@/store/editorUiStore";
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
    if (s.clips.some(c => selectedClipIds.includes(c.id) && c.groupId && c.locked)) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return [];
    return s.clips
      .filter((c) => selectedClipIds.includes(c.id) && isVisualClip(c) && !c.locked)
      .map((clip) => {
        const media = "mediaId" in clip ? s.media.find((m) => m.id === clip.mediaId) : undefined;
        const dims = media?.width && media?.height ? { w: media.width, h: media.height } : null;
        const box = clipBoxForSize(ctx, resolveClipAt(clip, s.currentTime), s.settings.width, s.settings.height, dims);
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
    const tr = getTransform(resolveClipAt(clip, s.currentTime));
    s.patchClip(clip.id, placementPatchAt(clip, {
      x: tr.x + (cx - box.cx) / s.settings.width,
      y: tr.y + (cy - box.cy) / s.settings.height,
    }, s.currentTime, recordOpts()));
  };

  const arrange = (action: LayoutAction) => {
    const items = measure(), s = useEditorStore.getState();
    const moves = layoutDesign(items.map(item => ({ ...item.box, id: item.clip.id, groupId: item.clip.groupId })), action, s.settings);
    if (!moves.length) return;
    void s.runAsOneStep(() => {
      for (const move of moves) {
        const item = items.find(value => value.clip.id === move.id);
        if (item) moveTo(item.clip, item.box, item.box.cx + move.dx, item.box.cy + move.dy);
      }
    });
  };
  const align = (axis: "x" | "y", edge: Edge) => arrange(axis === "x" ? ({ start: "left", centre: "centre", end: "right" } as const)[edge] : ({ start: "top", centre: "middle", end: "bottom" } as const)[edge]);
  const distribute = (axis: "x" | "y") => arrange(axis === "x" ? "horizontal" : "vertical");

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

  const transformTogether = (scale: number, degrees: number) => {
    const items = measure();
    if (items.length < 2) return;
    const s = useEditorStore.getState(), W = s.settings.width, H = s.settings.height;
    const cx = (Math.min(...items.map(i => i.box.cx - i.hw)) + Math.max(...items.map(i => i.box.cx + i.hw))) / 2;
    const cy = (Math.min(...items.map(i => i.box.cy - i.hh)) + Math.max(...items.map(i => i.box.cy + i.hh))) / 2;
    const radians = degrees * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
    void s.runAsOneStep(() => {
      for (const { clip } of items) {
        const tr = getTransform(resolveClipAt(clip, s.currentTime));
        const x = (tr.x * W - cx) * scale, y = (tr.y * H - cy) * scale;
        const place = { x: (cx + x * cos - y * sin) / W, y: (cy + x * sin + y * cos) / H,
          ...(degrees ? { rotation: tr.rotation + degrees } : {}),
          ...(clip.kind !== "text" && scale !== 1 ? { scale: Math.max(0.05, Math.min(20, tr.scale * scale)) } : {}) };
        s.patchClip(clip.id, { ...placementPatchAt(clip, place, s.currentTime, recordOpts()),
          ...(clip.kind === "text" && scale !== 1 ? { fontSize: Math.max(6, Math.min(1000, clip.fontSize * scale)) } : {}) });
      }
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/70">{t("editor.multi.selected", { count: selectedClipIds.length })}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => useEditorStore.getState().groupSelected()} disabled={layers.length < 2 || clips.some(c => selectedClipIds.includes(c.id) && c.locked)} className="min-h-9 rounded-lg border border-white/20 text-xs text-white/80 hover:bg-white/10 disabled:opacity-35">{t("editor.groups.group", { defaultValue: "Group" })}</button>
        <button type="button" onClick={() => useEditorStore.getState().ungroupSelected()} disabled={!clips.some(c => selectedClipIds.includes(c.id) && c.groupId)} className="min-h-9 rounded-lg border border-white/20 text-xs text-white/80 hover:bg-white/10 disabled:opacity-35">{t("editor.groups.ungroup", { defaultValue: "Ungroup" })}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => transformTogether(0.9, 0)} className="min-h-9 rounded-lg border border-white/15 text-xs text-white/75 hover:bg-white/10">{t("editor.groups.smaller", { defaultValue: "Scale down 10%" })}</button>
        <button type="button" onClick={() => transformTogether(1.1, 0)} className="min-h-9 rounded-lg border border-white/15 text-xs text-white/75 hover:bg-white/10">{t("editor.groups.larger", { defaultValue: "Scale up 10%" })}</button>
        <button type="button" onClick={() => transformTogether(1, -15)} className="min-h-9 rounded-lg border border-white/15 text-xs text-white/75 hover:bg-white/10">{t("editor.groups.rotateLeft", { defaultValue: "Rotate −15°" })}</button>
        <button type="button" onClick={() => transformTogether(1, 15)} className="min-h-9 rounded-lg border border-white/15 text-xs text-white/75 hover:bg-white/10">{t("editor.groups.rotateRight", { defaultValue: "Rotate +15°" })}</button>
      </div>
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
      <button type="button" onClick={() => arrange("tidy")} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10">{t("editor.layout.tidy", { defaultValue: "Tidy into a grid" })}</button>
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
