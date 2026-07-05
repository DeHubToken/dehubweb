/**
 * Right-hand inspector: project canvas settings + selected-clip properties (text).
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { aspectToDims, type AspectPreset, type Clip, type MediaClip, type TextClip } from "@/lib/editor/types";
import { FILTER_PRESETS, applyFilterPreset } from "@/lib/editor/filterPresets";
import { ANIMATION_PRESETS, newAnimation } from "@/lib/editor/animationPresets";
import { FontPicker } from "@/components/editor/FontPicker";
import { findFontByCss, loadGoogleFont, primaryFamily } from "@/lib/editor/googleFonts";


const ASPECTS: { value: AspectPreset; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
];

export function Inspector() {
  const settings = useEditorStore((s) => s.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const clips = useEditorStore((s) => s.clips);
  const updateTextClip = useEditorStore((s) => s.updateTextClip);
  const updateMediaClip = useEditorStore((s) => s.updateMediaClip);

  const selected = useMemo(() => clips.find((x) => x.id === selectedClipIds[0]) ?? null, [clips, selectedClipIds]);
  const text = selected && selected.kind === "text" ? (selected as TextClip) : null;
  const mediaClip = selected && (selected.kind === "video" || selected.kind === "image" || selected.kind === "audio")
    ? (selected as MediaClip)
    : null;
  const visualMedia = mediaClip && mediaClip.kind !== "audio" ? mediaClip : null;
  const hasAudio = mediaClip && (mediaClip.kind === "video" || mediaClip.kind === "audio") ? mediaClip : null;

  const setAspect = (a: AspectPreset) => {
    const { width, height } = aspectToDims(a, Math.min(settings.height, 1080));
    updateSettings({ aspectPreset: a, width, height });
  };

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-white/10 bg-black/60 backdrop-blur-[24px]">
      <header className="border-b border-white/10 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">Inspector</h2>
      </header>

      <section className="space-y-2 border-b border-white/10 p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Canvas</h3>
        <div className="grid grid-cols-4 gap-1">
          {ASPECTS.map((a) => (
            <Button
              key={a.value}
              size="sm"
              variant="ghost"
              onClick={() => setAspect(a.value)}
              className={cn(
                "h-7 rounded-md border text-[11px]",
                settings.aspectPreset === a.value
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              {a.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Field label="Width">
            <Input type="number" value={settings.width}
              onChange={(e) => updateSettings({ width: Math.max(64, Number(e.target.value) || 0), aspectPreset: "custom" })}
              className="h-7 bg-white/5 text-xs" />
          </Field>
          <Field label="Height">
            <Input type="number" value={settings.height}
              onChange={(e) => updateSettings({ height: Math.max(64, Number(e.target.value) || 0), aspectPreset: "custom" })}
              className="h-7 bg-white/5 text-xs" />
          </Field>
          <Field label="FPS">
            <Input type="number" value={settings.fps} min={1} max={120}
              onChange={(e) => updateSettings({ fps: Math.max(1, Math.min(120, Number(e.target.value) || 30)) })}
              className="h-7 bg-white/5 text-xs" />
          </Field>
          <Field label="Background">
            <input type="color" value={settings.background}
              onChange={(e) => updateSettings({ background: e.target.value })}
              className="h-7 w-full cursor-pointer rounded-md border border-white/10 bg-white/5" />
          </Field>
        </div>
      </section>

      <section className="space-y-2 p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Selection</h3>
        {!selected && (
          <p className="text-xs text-white/40">Select a clip on the timeline.</p>
        )}

        {visualMedia && (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wide text-white/40">Vibes</p>
            <div className="grid grid-cols-4 gap-1">
              {FILTER_PRESETS.map((p) => {
                const active = presetMatches(visualMedia.effects, p.effects);
                return (
                  <button
                    key={p.id}
                    onClick={() => updateMediaClip(visualMedia.id, { effects: applyFilterPreset(p.id) })}
                    className={cn(
                      "rounded-md border px-1 py-1 text-[10px] transition",
                      active
                        ? "border-white/50 bg-white/15 text-white"
                        : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white",
                    )}
                    title={p.label}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <p className="pt-1 text-[10px] uppercase tracking-wide text-white/40">Effects</p>
            <EffectSlider label="Brightness" value={visualMedia.effects?.brightness ?? 1} min={0} max={2} step={0.01}
              onChange={(v) => updateMediaClip(visualMedia.id, { effects: { ...visualMedia.effects, brightness: v } })} />
            <EffectSlider label="Contrast" value={visualMedia.effects?.contrast ?? 1} min={0} max={2} step={0.01}
              onChange={(v) => updateMediaClip(visualMedia.id, { effects: { ...visualMedia.effects, contrast: v } })} />
            <EffectSlider label="Saturation" value={visualMedia.effects?.saturation ?? 1} min={0} max={2} step={0.01}
              onChange={(v) => updateMediaClip(visualMedia.id, { effects: { ...visualMedia.effects, saturation: v } })} />
            <EffectSlider label="Blur (px)" value={visualMedia.effects?.blur ?? 0} min={0} max={20} step={0.5}
              onChange={(v) => updateMediaClip(visualMedia.id, { effects: { ...visualMedia.effects, blur: v } })} />
            <EffectSlider label={`Hue ${Math.round(visualMedia.effects?.hueRotate ?? 0)}°`}
              value={visualMedia.effects?.hueRotate ?? 0} min={0} max={360} step={1}
              onChange={(v) => updateMediaClip(visualMedia.id, { effects: { ...visualMedia.effects, hueRotate: v } })} />
            <EffectSlider label={`Grayscale ${Math.round((visualMedia.effects?.grayscale ?? 0) * 100)}%`}
              value={visualMedia.effects?.grayscale ?? 0} min={0} max={1} step={0.01}
              onChange={(v) => updateMediaClip(visualMedia.id, { effects: { ...visualMedia.effects, grayscale: v } })} />
            <EffectSlider label={`Sepia ${Math.round((visualMedia.effects?.sepia ?? 0) * 100)}%`}
              value={visualMedia.effects?.sepia ?? 0} min={0} max={1} step={0.01}
              onChange={(v) => updateMediaClip(visualMedia.id, { effects: { ...visualMedia.effects, sepia: v } })} />
            <Button size="sm" variant="ghost"
              onClick={() => updateMediaClip(visualMedia.id, { effects: undefined })}
              className="h-7 w-full rounded-md border border-white/10 text-[11px] text-white/70 hover:bg-white/5 hover:text-white">
              Reset effects
            </Button>
          </div>
        )}


        {mediaClip && (mediaClip.kind === "video" || mediaClip.kind === "audio") && (
          <div className="space-y-3 pt-2">
            <p className="text-[10px] uppercase tracking-wide text-white/40">Speed</p>
            <EffectSlider label={`${(mediaClip.speed ?? 1).toFixed(2)}×`}
              value={mediaClip.speed ?? 1} min={0.25} max={4} step={0.05}
              onChange={(v) => updateMediaClip(mediaClip.id, { speed: Math.max(0.25, Math.min(4, v)) })} />
            <div className="grid grid-cols-4 gap-1">
              {[0.5, 1, 1.5, 2].map((s) => (
                <Button key={s} size="sm" variant="ghost"
                  onClick={() => updateMediaClip(mediaClip.id, { speed: s })}
                  className="h-6 rounded-md border border-white/10 text-[10px] text-white/70 hover:bg-white/5 hover:text-white">
                  {s}×
                </Button>
              ))}
            </div>
          </div>
        )}

        {hasAudio && (
          <div className="space-y-3 pt-2">
            <p className="text-[10px] uppercase tracking-wide text-white/40">Audio</p>
            <EffectSlider label={`Volume ${Math.round(((hasAudio.audio?.volume ?? 1) * 100))}%`}
              value={hasAudio.audio?.volume ?? 1} min={0} max={2} step={0.01}
              onChange={(v) => updateMediaClip(hasAudio.id, { audio: { ...hasAudio.audio, volume: v } })} />
            <EffectSlider label={`Fade in ${(hasAudio.audio?.fadeIn ?? 0).toFixed(2)}s`}
              value={hasAudio.audio?.fadeIn ?? 0} min={0} max={Math.max(0.1, hasAudio.duration)} step={0.05}
              onChange={(v) => updateMediaClip(hasAudio.id, { audio: { ...hasAudio.audio, fadeIn: v } })} />
            <EffectSlider label={`Fade out ${(hasAudio.audio?.fadeOut ?? 0).toFixed(2)}s`}
              value={hasAudio.audio?.fadeOut ?? 0} min={0} max={Math.max(0.1, hasAudio.duration)} step={0.05}
              onChange={(v) => updateMediaClip(hasAudio.id, { audio: { ...hasAudio.audio, fadeOut: v } })} />
          </div>
        )}

        {text && (
          <div className="space-y-2">
            <Field label="Text">
              <textarea
                value={text.text}
                onChange={(e) => updateTextClip(text.id, { text: e.target.value })}
                rows={3}
                className="w-full resize-none rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-white/30"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Font size">
                <Input type="number" value={text.fontSize} min={8} max={400}
                  onChange={(e) => updateTextClip(text.id, { fontSize: Number(e.target.value) || 72 })}
                  className="h-7 bg-white/5 text-xs" />
              </Field>
              <Field label="Colour">
                <input type="color" value={text.color}
                  onChange={(e) => updateTextClip(text.id, { color: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded-md border border-white/10 bg-white/5" />
              </Field>
              <Field label="Align">
                <select
                  value={text.align}
                  onChange={(e) => updateTextClip(text.id, { align: e.target.value as TextClip["align"] })}
                  className="h-7 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
                >
                  <option value="left" className="bg-black">Left</option>
                  <option value="centre" className="bg-black">Centre</option>
                  <option value="right" className="bg-black">Right</option>
                </select>
              </Field>
            </div>
            <Field label="Font family">
              <FontPicker
                value={text.fontFamily}
                onChange={(css, weights) => {
                  const weight = weights.includes(text.fontWeight)
                    ? text.fontWeight
                    : (weights.find((w) => w >= 400) ?? weights[0] ?? 400);
                  updateTextClip(text.id, { fontFamily: css, fontWeight: weight });
                }}
              />
            </Field>
            <Field label="Weight (available)">
              <select
                value={text.fontWeight}
                onChange={(e) => updateTextClip(text.id, { fontWeight: Number(e.target.value) })}
                className="h-7 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
              >
                {(currentFontWeights.length ? currentFontWeights : [300, 400, 500, 600, 700, 800, 900]).map((w) => (
                  <option key={w} value={w} className="bg-black">{w}</option>
                ))}
              </select>
            </Field>


            <div className="mt-2 rounded-md border border-white/10 bg-white/[0.02] p-2">
              <label className="flex items-center justify-between text-[11px] text-white/70">
                <span className="font-medium">Background pill</span>
                <input
                  type="checkbox"
                  checked={!!text.background}
                  onChange={(e) =>
                    updateTextClip(text.id, {
                      background: e.target.checked
                        ? (text.background ?? { color: "#000000", opacity: 0.5, padding: 18, radius: 12 })
                        : null,
                    })
                  }
                  className="h-3.5 w-3.5 accent-white"
                />
              </label>
              {text.background && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Colour">
                      <input type="color" value={text.background.color}
                        onChange={(e) => updateTextClip(text.id, {
                          background: { ...text.background!, color: e.target.value },
                        })}
                        className="h-7 w-full cursor-pointer rounded-md border border-white/10 bg-white/5" />
                    </Field>
                    <Field label={`Opacity ${Math.round(text.background.opacity * 100)}%`}>
                      <Slider value={[text.background.opacity]} min={0} max={1} step={0.05}
                        onValueChange={(v) => updateTextClip(text.id, {
                          background: { ...text.background!, opacity: v[0] ?? 0.5 },
                        })} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={`Padding ${Math.round(text.background.padding)}`}>
                      <Slider value={[text.background.padding]} min={0} max={80} step={1}
                        onValueChange={(v) => updateTextClip(text.id, {
                          background: { ...text.background!, padding: v[0] ?? 18 },
                        })} />
                    </Field>
                    <Field label={`Radius ${Math.round(text.background.radius)}`}>
                      <Slider value={[text.background.radius]} min={0} max={80} step={1}
                        onValueChange={(v) => updateTextClip(text.id, {
                          background: { ...text.background!, radius: v[0] ?? 12 },
                        })} />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2 rounded-md border border-white/10 bg-white/[0.02] p-2">
              <label className="flex items-center justify-between text-[11px] text-white/70">
                <span className="font-medium">Outline</span>
                <input
                  type="checkbox"
                  checked={!!text.stroke}
                  onChange={(e) =>
                    updateTextClip(text.id, {
                      stroke: e.target.checked
                        ? (text.stroke ?? { color: "#000000", width: 4 })
                        : null,
                    })
                  }
                  className="h-3.5 w-3.5 accent-white"
                />
              </label>
              {text.stroke && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Colour">
                    <input type="color" value={text.stroke.color}
                      onChange={(e) => updateTextClip(text.id, {
                        stroke: { ...text.stroke!, color: e.target.value },
                      })}
                      className="h-7 w-full cursor-pointer rounded-md border border-white/10 bg-white/5" />
                  </Field>
                  <Field label={`Width ${Math.round(text.stroke.width)}`}>
                    <Slider value={[text.stroke.width]} min={0} max={20} step={0.5}
                      onValueChange={(v) => updateTextClip(text.id, {
                        stroke: { ...text.stroke!, width: v[0] ?? 4 },
                      })} />
                  </Field>
                </div>
              )}
            </div>

            <p className="pt-1 text-[10px] text-white/40">
              Drag directly on the preview to position. Right-click for layer controls.
            </p>
          </div>
        )}
      </section>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-white/40">{label}</Label>
      {children}
    </div>
  );
}

function EffectSlider({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-white/40">{label}</Label>
      <Slider value={[value]} min={min} max={max} step={step}
        onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}
