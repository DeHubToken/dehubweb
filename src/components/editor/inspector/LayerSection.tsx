/**
 * Layer controls for the inspector: placement, crop, corners, shadow and text
 * styling. Everything a photo or graphic needs that the timeline-era inspector
 * never had, since clips used to be locked full-frame.
 *
 * Sliders update live without history and record a single undo step when the
 * drag (or key press) starts, so one adjustment is one undo.
 */
import { useTranslation } from "react-i18next";
import { useBgRemovalStore } from "@/store/editorBgRemovalStore";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, Bold, FlipHorizontal2, FlipVertical2, Italic,
  Maximize, Minimize, RotateCcw, Scissors, Loader2, Underline, CaseUpper, Frame, Eye, EyeOff, Lock, Unlock,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { BLEND_MODES, type BlendMode, type Clip, type ClipShadow, type MediaClip, type TextClip } from "@/lib/editor/types";
import { clipBoxForSize, getTransform, placementPatch } from "@/lib/editor/render";

const DEFAULT_SHADOW: ClipShadow = { color: "#000000", opacity: 0.5, blur: 24, offsetX: 0, offsetY: 12 };

export function LayerSection({ clip }: { clip: Clip }) {
  const { t } = useTranslation();
  const patchClip = useEditorStore((s) => s.patchClip);
  const patchClipLive = useEditorStore((s) => s.patchClipLive);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const settings = useEditorStore((s) => s.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const media = useEditorStore((s) => s.media);
  const bgClipId = useBgRemovalStore((s) => s.clipId);
  const bgProgress = useBgRemovalStore((s) => s.progress);
  const runBgRemoval = useBgRemovalStore((s) => s.run);
  const quota = useEditorQuota();

  if (clip.kind === "audio") return null;
  const tr = getTransform(clip);
  const mediaClip = clip.kind === "image" || clip.kind === "video" ? (clip as MediaClip) : null;
  const text = clip.kind === "text" ? (clip as TextClip) : null;
  const shape = clip.kind === "shape" ? clip : null;
  const source = mediaClip ? media.find((m) => m.id === mediaClip.mediaId) : null;

  /** Live slider: one undo step per drag. */
  const live = (label: string, value: number, min: number, max: number, step: number,
    onChange: (v: number) => void) => (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-white/40">{label}</Label>
      <div onPointerDownCapture={beginGesture} onKeyDownCapture={beginGesture}>
        <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0] ?? value)} />
      </div>
    </div>
  );

  /** Align the layer's visible bounds to a page edge or centre. */
  const align = (axis: "x" | "y", where: "start" | "centre" | "end") => {
    const ctx = document.createElement("canvas").getContext("2d");
    const dims = source?.width && source?.height ? { w: source.width, h: source.height } : null;
    const box = ctx ? clipBoxForSize(ctx, clip, settings.width, settings.height, dims) : null;
    const size = axis === "x" ? settings.width : settings.height;
    let half = 0;
    if (box) {
      const r = (box.rotation * Math.PI) / 180;
      const c = Math.abs(Math.cos(r));
      const s = Math.abs(Math.sin(r));
      half = axis === "x" ? (box.w * c + box.h * s) / 2 : (box.w * s + box.h * c) / 2;
    }
    const centre = where === "start" ? half : where === "end" ? size - half : size / 2;
    // Text stores an anchor, not a centre; shift by the anchor-to-centre offset.
    const current = axis === "x" ? tr.x : tr.y;
    const offset = box ? (axis === "x" ? box.cx : box.cy) / size - current : 0;
    patchClip(clip.id, placementPatch(clip, { [axis]: centre / size - offset }));
  };

  const iconBtn = (label: string, icon: React.ReactNode, onClick: () => void, active = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center justify-center rounded-md border transition",
        active ? "border-white/50 bg-white/15 text-white" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white",
      )}
    >
      {icon}
    </button>
  );

  const cropLabels = {
    left: (value: number) => t("editor.layer.cropLeft", { value }),
    right: (value: number) => t("editor.layer.cropRight", { value }),
    top: (value: number) => t("editor.layer.cropTop", { value }),
    bottom: (value: number) => t("editor.layer.cropBottom", { value }),
  };
  const blendLabels: Record<BlendMode, string> = {
    normal: t("editor.blend.normal"),
    multiply: t("editor.blend.multiply"),
    screen: t("editor.blend.screen"),
    overlay: t("editor.blend.overlay"),
    darken: t("editor.blend.darken"),
    lighten: t("editor.blend.lighten"),
    "color-dodge": t("editor.blend.colorDodge"),
    "color-burn": t("editor.blend.colorBurn"),
    "hard-light": t("editor.blend.hardLight"),
    "soft-light": t("editor.blend.softLight"),
    difference: t("editor.blend.difference"),
    exclusion: t("editor.blend.exclusion"),
    hue: t("editor.blend.hue"),
    saturation: t("editor.blend.saturation"),
    color: t("editor.blend.color"),
    luminosity: t("editor.blend.luminosity"),
  };
  const shadow = clip.shadow;
  const crop = mediaClip?.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-1">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.layer.blend")}</Label>
          <select
            value={clip.blend ?? "normal"}
            onChange={(e) => patchClip(clip.id, { blend: e.target.value as BlendMode })}
            className="h-7 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
          >
            {BLEND_MODES.map((m) => (
              <option key={m} value={m} className="bg-black">{blendLabels[m]}</option>
            ))}
          </select>
        </div>
        {iconBtn(clip.locked ? t("editor.layers.unlock") : t("editor.layers.lock"),
          clip.locked ? <Lock className="mx-1.5 h-3.5 w-3.5" /> : <Unlock className="mx-1.5 h-3.5 w-3.5" />,
          () => patchClip(clip.id, { locked: !clip.locked }), !!clip.locked)}
        {iconBtn(clip.hidden ? t("editor.layers.show") : t("editor.layers.hide"),
          clip.hidden ? <EyeOff className="mx-1.5 h-3.5 w-3.5" /> : <Eye className="mx-1.5 h-3.5 w-3.5" />,
          () => patchClip(clip.id, { hidden: !clip.hidden }), !!clip.hidden)}
      </div>

      <p className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.layer.alignToPage")}</p>
      <div className="grid grid-cols-6 gap-1">
        {iconBtn(t("editor.layer.alignLeft"), <AlignStartVertical className="h-3.5 w-3.5" />, () => align("x", "start"))}
        {iconBtn(t("editor.layer.alignCentre"), <AlignCenterVertical className="h-3.5 w-3.5" />, () => align("x", "centre"))}
        {iconBtn(t("editor.layer.alignRight"), <AlignEndVertical className="h-3.5 w-3.5" />, () => align("x", "end"))}
        {iconBtn(t("editor.layer.alignTop"), <AlignStartHorizontal className="h-3.5 w-3.5" />, () => align("y", "start"))}
        {iconBtn(t("editor.layer.alignMiddle"), <AlignCenterHorizontal className="h-3.5 w-3.5" />, () => align("y", "centre"))}
        {iconBtn(t("editor.layer.alignBottom"), <AlignEndHorizontal className="h-3.5 w-3.5" />, () => align("y", "end"))}
      </div>

      {shape && (
        <>
          <div className="grid grid-cols-2 gap-1">
            {iconBtn(t("editor.menu.flipH"), <FlipHorizontal2 className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, placementPatch(clip, { flipH: !tr.flipH })), !!tr.flipH)}
            {iconBtn(t("editor.menu.flipV"), <FlipVertical2 className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, placementPatch(clip, { flipV: !tr.flipV })), !!tr.flipV)}
          </div>
          {live(t("editor.layer.size", { value: Math.round(tr.scale * 100) }), tr.scale, 0.05, 6, 0.01,
            (v) => patchClipLive(clip.id, placementPatch(clip, { scale: v })))}
          <p className="pt-1 text-[10px] uppercase tracking-wide text-white/40">{t("editor.shape.style")}</p>
          {shape.shape !== "line" && shape.shape !== "arrow" && shape.shape !== "path" && (
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.shape.fill")}</Label>
                <input type="color" value={shape.fill ?? "#7c5cff"} disabled={!shape.fill}
                  onChange={(e) => patchClip(clip.id, { fill: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded-md border border-white/10 bg-white/5 disabled:opacity-40" />
              </div>
              <label className="flex h-7 items-center gap-1.5 text-[11px] text-white/70">
                <input type="checkbox" checked={!!shape.fill} className="h-3.5 w-3.5 accent-white"
                  onChange={(e) => patchClip(clip.id, { fill: e.target.checked ? "#7c5cff" : null })} />
                {t("editor.shape.fillOn")}
              </label>
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.shape.outline")}</Label>
              <input type="color" value={shape.stroke?.color ?? "#ffffff"} disabled={!shape.stroke}
                onChange={(e) => patchClip(clip.id, { stroke: { width: shape.stroke?.width ?? 6, color: e.target.value } })}
                className="h-7 w-full cursor-pointer rounded-md border border-white/10 bg-white/5 disabled:opacity-40" />
            </div>
            <label className="flex h-7 items-center gap-1.5 text-[11px] text-white/70">
              <input type="checkbox" checked={!!shape.stroke} className="h-3.5 w-3.5 accent-white"
                onChange={(e) => patchClip(clip.id, { stroke: e.target.checked ? { color: "#ffffff", width: 6 } : null })} />
              {t("editor.shape.outlineOn")}
            </label>
          </div>
          {shape.stroke && live(t("editor.shape.outlineWidth", { value: Math.round(shape.stroke.width) }), shape.stroke.width, 1, 60, 1,
            (v) => patchClipLive(clip.id, { stroke: { ...shape.stroke!, width: v } }))}
          {shape.shape === "rect" && live(t("editor.layer.cornerRounding", { value: Math.round(shape.radius ?? 0) }), shape.radius ?? 0, 0, 540, 1,
            (v) => patchClipLive(clip.id, { radius: v }))}
        </>
      )}

      {mediaClip?.kind === "image" && (
        <button
          type="button"
          disabled={!!bgClipId}
          onClick={() => void runBgRemoval(clip.id, quota.walletAddress)}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white text-[11px] font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
        >
          {bgClipId === clip.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
          {bgClipId === clip.id
            ? bgProgress?.stage === "download"
              ? t("editor.bgRemove.downloading", { percent: Math.round((bgProgress.loaded / Math.max(1, bgProgress.total)) * 100) })
              : t("editor.bgRemove.working")
            : t("editor.bgRemove.action")}
        </button>
      )}
      {mediaClip?.kind === "image" && !bgClipId && (
        <p className="-mt-2 text-[10px] leading-snug text-white/40">{t("editor.bgRemove.hint")}</p>
      )}

      {mediaClip && (
        <>
          <div className="grid grid-cols-4 gap-1">
            {iconBtn(t("editor.menu.fitCanvas"), <Minimize className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, { fit: "contain", ...placementPatch(mediaClip, { x: 0.5, y: 0.5, scale: 1 }) }),
              (mediaClip.fit ?? "contain") === "contain" && tr.scale === 1)}
            {iconBtn(t("editor.menu.fillCanvas"), <Maximize className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, { fit: "cover", ...placementPatch(mediaClip, { x: 0.5, y: 0.5, scale: 1 }) }),
              mediaClip.fit === "cover" && tr.scale === 1)}
            {iconBtn(t("editor.menu.flipH"), <FlipHorizontal2 className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, placementPatch(clip, { flipH: !tr.flipH })), !!tr.flipH)}
            {iconBtn(t("editor.menu.flipV"), <FlipVertical2 className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, placementPatch(clip, { flipV: !tr.flipV })), !!tr.flipV)}
          </div>
          {live(t("editor.layer.size", { value: Math.round(tr.scale * 100) }), tr.scale, 0.05, 4, 0.01,
            (v) => patchClipLive(clip.id, placementPatch(clip, { scale: v })))}
        </>
      )}

      {live(t("editor.layer.rotation", { value: Math.round(tr.rotation) }), tr.rotation, -180, 180, 1,
        (v) => patchClipLive(clip.id, placementPatch(clip, { rotation: v })))}
      {live(t("editor.layer.opacity", { value: Math.round((tr.opacity ?? 1) * 100) }), tr.opacity ?? 1, 0, 1, 0.01,
        (v) => patchClipLive(clip.id, placementPatch(clip, { opacity: v })))}

      <button
        type="button"
        onClick={() => patchClip(clip.id, {
          ...placementPatch(clip, { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipH: false, flipV: false, opacity: 1 }),
          ...(mediaClip ? { crop: null, fit: "contain" as const } : {}),
        })}
        className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-white/10 text-[11px] text-white/70 hover:bg-white/5 hover:text-white"
      >
        <RotateCcw className="h-3 w-3" /> {t("editor.layer.resetPosition")}
      </button>

      {mediaClip && source?.width && source?.height && (
        <button
          type="button"
          onClick={() => {
            // A photo opened on its own should be edited at its own size, like
            // opening it in any image editor. Cap the long side at 4096.
            const k = Math.min(1, 4096 / Math.max(source.width!, source.height!));
            const w = Math.max(64, Math.round(source.width! * k)) & ~1;
            const h = Math.max(64, Math.round(source.height! * k)) & ~1;
            updateSettings({ width: w, height: h, aspectPreset: "custom" });
            patchClip(clip.id, { fit: "contain", crop: null, ...placementPatch(mediaClip, { x: 0.5, y: 0.5, scale: 1, rotation: 0 }) });
          }}
          className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-white/10 text-[11px] text-white/70 hover:bg-white/5 hover:text-white"
        >
          <Frame className="h-3 w-3" /> {t("editor.layer.matchCanvas", { width: source.width, height: source.height })}
        </button>
      )}

      {mediaClip && (
        <>
          <p className="pt-1 text-[10px] uppercase tracking-wide text-white/40">{t("editor.layer.crop")}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["left", "right", "top", "bottom"] as const).map((edge) => (
              <div key={edge}>
                {live(cropLabels[edge](Math.round(crop[edge] * 100)), crop[edge], 0, 0.9, 0.01,
                  (v) => patchClipLive(clip.id, { crop: { ...crop, [edge]: v } }))}
              </div>
            ))}
          </div>
          {live(t("editor.layer.cornerRounding", { value: Math.round(mediaClip.radius ?? 0) }), mediaClip.radius ?? 0, 0, 540, 1,
            (v) => patchClipLive(clip.id, { radius: v }))}
        </>
      )}

      {text && (
        <>
          <p className="pt-1 text-[10px] uppercase tracking-wide text-white/40">{t("editor.layer.textStyle")}</p>
          <div className="grid grid-cols-4 gap-1">
            {iconBtn(t("editor.layer.bold"), <Bold className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, { fontWeight: text.fontWeight >= 600 ? 400 : 700 }), text.fontWeight >= 600)}
            {iconBtn(t("editor.layer.italic"), <Italic className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, { italic: !text.italic }), !!text.italic)}
            {iconBtn(t("editor.layer.underline"), <Underline className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, { underline: !text.underline }), !!text.underline)}
            {iconBtn(t("editor.layer.uppercase"), <CaseUpper className="h-3.5 w-3.5" />,
              () => patchClip(clip.id, { uppercase: !text.uppercase }), !!text.uppercase)}
          </div>
          {live(t("editor.layer.letterSpacing", { value: Math.round(text.letterSpacing ?? 0) }), text.letterSpacing ?? 0, -10, 80, 1,
            (v) => patchClipLive(clip.id, { letterSpacing: v }))}
          {live(t("editor.layer.lineSpacing", { value: (text.lineHeight ?? 1.2).toFixed(1) }), text.lineHeight ?? 1.2, 0.7, 3, 0.05,
            (v) => patchClipLive(clip.id, { lineHeight: v }))}
        </>
      )}

      <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
        <label className="flex items-center justify-between text-[11px] text-white/70">
          <span className="font-medium">{t("editor.layer.shadow")}</span>
          <input
            type="checkbox"
            checked={!!shadow}
            onChange={(e) => patchClip(clip.id, { shadow: e.target.checked ? (shadow ?? DEFAULT_SHADOW) : null })}
            className="h-3.5 w-3.5 accent-white"
          />
        </label>
        {shadow && (
          <div className="mt-2 space-y-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.layer.colour")}</Label>
              <input type="color" value={shadow.color}
                onChange={(e) => patchClip(clip.id, { shadow: { ...shadow, color: e.target.value } })}
                className="h-7 w-full cursor-pointer rounded-md border border-white/10 bg-white/5" />
            </div>
            {live(t("editor.layer.shadowOpacity", { value: Math.round(shadow.opacity * 100) }), shadow.opacity, 0, 1, 0.01,
              (v) => patchClipLive(clip.id, { shadow: { ...shadow, opacity: v } }))}
            {live(t("editor.layer.shadowBlur", { value: Math.round(shadow.blur) }), shadow.blur, 0, 120, 1,
              (v) => patchClipLive(clip.id, { shadow: { ...shadow, blur: v } }))}
            <div className="grid grid-cols-2 gap-2">
              {live(t("editor.layer.shadowX", { value: Math.round(shadow.offsetX) }), shadow.offsetX, -80, 80, 1,
                (v) => patchClipLive(clip.id, { shadow: { ...shadow, offsetX: v } }))}
              {live(t("editor.layer.shadowY", { value: Math.round(shadow.offsetY) }), shadow.offsetY, -80, 80, 1,
                (v) => patchClipLive(clip.id, { shadow: { ...shadow, offsetY: v } }))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
