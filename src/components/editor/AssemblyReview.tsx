import { useDraftState } from "@/hooks/use-draft-state";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { assemblyDuration, type AssemblyState, type AssemblySession } from "@/lib/editor/assembly";
import { shotTime } from "@/lib/editor/shots";

export default function AssemblyReview({ state, session, changed, names, onPreview, onCreate, onClose }: {
  state: AssemblyState; session: AssemblySession; changed: boolean; names: Record<string, string>;
  onPreview: (index: number) => void; onCreate: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [sceneConsent, setSceneConsent] = useState<string | null>(null);
  const sceneScope = `${state.sourceId}:${state.focus ?? ""}:${state.shots.map(shot => shot.id).join(",")}`;
  useEffect(() => setSceneConsent(null), [sceneScope]);
  if (!state.sourceId) return null;
  const disabled = state.busy || changed;
  const label = (id: string) => { const c = [...state.media, ...state.sounds].find(c => c.id === id); return c ? names[c.mediaId] || t(c.kind === "image" ? "editor.app.photo" : c.kind === "audio" ? "editor.video.sound" : "editor.video.video") : id; };
  const errors = { selectMedia: "editor.video.emptyTimeline", limit: "editor.shots.hint", changed: "editor.agent.failed", failed: "common.somethingWentWrong", noMatch: "editor.assembly.noMatch", matchLimit: "editor.assembly.matchLimit", matchDuration: "editor.assembly.matchDuration", matchFailed: "editor.assembly.matchFailed" };
  return <div className="space-y-3 rounded-xl border border-white/15 p-3 text-[11px] text-white">
    <div className="font-semibold">{t("easyTrade.reviewTitle")} · {t("editor.video.video")}</div>
    <div className="text-white/60">{t("editor.export.duration", { value: Number.isFinite(assemblyDuration(state)) ? assemblyDuration(state).toFixed(2) : "—" })}</div>
    {(changed || state.error) && <p role="status" className="text-white/70">{t(changed ? "editor.agent.failed" : errors[state.error!])}</p>}
    <input className="h-8 w-full rounded border border-white/15 bg-transparent px-2" maxLength={240} aria-label={t("editor.highlights.focus")} placeholder={t("editor.highlights.focus")} value={state.focus ?? ""} disabled={disabled} onChange={event => session.focus(event.target.value)} />
    <label className="flex items-center gap-2"><input type="checkbox" checked={sceneConsent === sceneScope} disabled={disabled} onChange={event => setSceneConsent(event.target.checked ? sceneScope : null)} />{t("editor.assembly.matchConsent")}</label>
    <p className="text-white/60">{t("editor.highlights.visualPrivacy")}</p>
    <button disabled={disabled || sceneConsent !== sceneScope || (state.focus?.trim().length ?? 0) < 2 || !state.shots.length} onClick={() => { void session.match(true); }} className="rounded border border-white/15 px-2 py-1 disabled:opacity-40">{t("editor.assembly.matchScenes")}</button>
    {state.matching && <p role="status" className="text-white/60">{t("editor.highlights.ranking")} · {Math.round((state.matchProgress ?? 0) * 100)}%</p>}
    {["noMatch", "matchLimit", "matchDuration", "matchFailed"].includes(state.error ?? "") && <button disabled={disabled} onClick={() => session.reviewManually()} className="rounded border border-white/15 px-2 py-1 disabled:opacity-40">{t("editor.assembly.reviewManually")}</button>}
    <div className="max-h-40 space-y-1 overflow-auto">
      {state.media.map(c => <label key={c.id} className="flex items-center gap-2"><input type="checkbox" checked={state.shots.some(s => s.id === c.id)} disabled={disabled} onChange={() => session.toggle(c.id)} /><span className="truncate">{label(c.id)}</span></label>)}
    </div>
    <div className="space-y-2">
      {state.shots.map((s, index) => <div key={s.id} className="space-y-1 border-t border-white/10 pt-2">
        {state.sceneMatches?.[s.id] && <p className="text-white/60">{state.sceneMatches[s.id]}</p>}
        <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{index + 1}. {label(s.id)}</span>
          <button disabled={disabled || index === 0} aria-label={`${t("editor.menu.bringForward")} ${index + 1}`} onClick={() => session.move(index, -1)}>↑</button>
          <button disabled={disabled || index + 1 === state.shots.length} aria-label={`${t("editor.menu.sendBackward")} ${index + 1}`} onClick={() => session.move(index, 1)}>↓</button>
          <button disabled={disabled} aria-label={`${t("common.delete")} ${index + 1}`} onClick={() => session.toggle(s.id)}>×</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1"><span>{t("editor.shots.preview")}</span><NumericValue draftScope={`assembly:${state.sourceId}:${s.id}:offset`} value={s.offset} label={`${t("editor.shots.preview")} ${index + 1}`} disabled={disabled} commit={value => session.range(s.id, value, s.duration)} /></label>
          <label className="flex items-center gap-1"><span>{t("filters.duration")}</span><NumericValue draftScope={`assembly:${state.sourceId}:${s.id}:duration`} value={s.duration} label={`${t("filters.duration")} ${index + 1}`} disabled={disabled} commit={value => session.range(s.id, s.offset, value)} /></label>
          <button disabled={disabled || state.error === "limit"} onClick={() => onPreview(index)} className="rounded border border-white/15 px-2 py-1">{t("editor.shots.preview")} {previewRange(s.offset, s.duration)}</button>
        </div>
      </div>)}
    </div>
    <label className="flex items-center justify-between gap-2">{t("editor.video.transition")}<select disabled={disabled} value={state.transition ?? "none"} onChange={e => session.transition(e.target.value === "none" ? null : "fade")} className="rounded border border-white/15 bg-black p-1"><option value="none">{t("editor.video.none")}</option><option value="fade">{t("editor.video.tFade")}</option></select></label>
    <label className="flex items-center justify-between gap-2">{t("editor.video.sound")}<select disabled={disabled} value={state.soundId ?? "none"} onChange={e => session.sound(e.target.value === "none" ? null : e.target.value)} className="max-w-[70%] rounded border border-white/15 bg-black p-1"><option value="none">{t("editor.video.none")}</option>{state.sounds.map(c => <option key={c.id} value={c.id}>{label(c.id)}</option>)}</select></label>
    <div className="flex flex-wrap gap-2">
      {state.undo && <button disabled={disabled} onClick={() => session.undo()} className="rounded border border-white/15 px-2 py-1">{t("common.undo")}</button>}
      <button disabled={disabled || !state.shots.length || assemblyDuration(state) > 600 || ["limit", "noMatch", "matchLimit", "matchDuration", "matchFailed"].includes(state.error ?? "")} onClick={onCreate} className="rounded bg-white px-3 py-1 text-black disabled:opacity-40">{t(state.busy ? "common.loading" : "nav.create")}</button>
      <button onClick={onClose} className="rounded border border-white/15 px-2 py-1">{t("common.cancel")}</button>
    </div>
  </div>;
}

function NumericValue({ draftScope, value, label, disabled, commit }: { draftScope: string; value: number; label: string; disabled: boolean; commit: (value: number) => void }) {
  const [text, setText] = useDraftState(draftScope, String(value));
  useEffect(() => { if (Number.isFinite(value) && (!text.trim() || Number(text.replace(",", ".")) !== value)) setText.initialize(String(value)); }, [value, setText]);
  useEffect(() => { const next = /^\d+(?:[.,]\d*)?$/.test(text) ? Number(text.replace(",", ".")) : NaN; if (!Object.is(next, value)) commit(next); }, [draftScope]);
  return <input type="text" inputMode="decimal" aria-label={label} disabled={disabled} value={text} className="w-16 rounded border border-white/15 bg-black px-1 py-1" onChange={e => { const next = e.target.value; setText(next); commit(/^\d+(?:[.,]\d*)?$/.test(next) ? Number(next.replace(",", ".")) : NaN); }} />;
}

function previewRange(offset: number, duration: number) {
  return Number.isFinite(offset) && Number.isFinite(duration) && offset >= 0 && duration > 0
    ? `${shotTime(offset)}–${shotTime(offset + duration)}` : "—";
}
