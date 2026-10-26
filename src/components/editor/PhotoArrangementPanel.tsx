import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { arrangeDesignPhotos, designPagePhotos, photoSourceOrder } from "@/lib/editor/photoArrangement";
import { editorErrorText } from "@/lib/editor/editorError";

export function PhotoArrangementPanel() {
  const { t } = useTranslation(), clips = useEditorStore(store => store.clips), time = useEditorStore(store => store.currentTime), settings = useEditorStore(store => store.settings), tracks = useEditorStore(store => store.tracks), selected = useEditorStore(store => store.selectedClipIds), media = useEditorStore(store => store.media);
  const [scope, setScope] = useState<"page" | "group">("page"), [from, setFrom] = useState(""), [to, setTo] = useState(""), [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const project = { ...useEditorStore.getState().toSnapshot(), clips, settings, tracks }, groupId = clips.find(clip => selected.includes(clip.id) && clip.groupId)?.groupId;
  const photos = scope === "group" && !groupId ? [] : designPagePhotos(project, time, scope === "group" ? groupId : undefined), ids = photos.map(clip => clip.id);
  const first = ids.includes(from) ? from : ids.find(id => selected.includes(id)) ?? ids[0] ?? "", second = ids.includes(to) && to !== first ? to : ids.find(id => id !== first) ?? "";
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  const apply = (action: "swap" | "rotate" | "shuffle") => {
    try {
      const store = useEditorStore.getState(), before = store.toSnapshot(); if (before.id !== project.id) return;
      const chosen = action === "swap" ? [first, second] : ids;
      const next = arrangeDesignPhotos(before, chosen, action === "swap" ? [1, 0] : photoSourceOrder(chosen.length, action), new Map(store.media.map(item => [item.id, item])));
      store.applyDesignEdit(before, next); setError("");
    } catch (reason) { setError(editorErrorText(reason, t("copy.beca10f35228", { defaultValue: "Could not rearrange these photos" }))); }
  };
  const names = new Map(tracks.map(track => [track.id, track.name])), labels = new Map(photos.map((clip, index) => [clip.id, clip.label || names.get(clip.trackId) || t("editor.photos.number", { defaultValue: "Photo {{number}}", number: index + 1 })]));
  const label = (id: string) => labels.get(id) ?? "";
  const matches = photos.filter((clip, index) => `${index + 1} ${label(clip.id)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const options = [...new Set([first, second, ...matches.slice(0, 100).map(clip => clip.id)])].filter(Boolean);
  return <div className="space-y-3 rounded-lg border border-white/10 p-3"><p className="text-xs font-medium text-white/80">{t("editor.photos.arrange", { defaultValue: "Rearrange photos" })}</p><div className="flex flex-wrap gap-2">{(["page", "group"] as const).map(value => <button type="button" key={value} disabled={value === "group" && !groupId} aria-pressed={scope === value} onClick={() => setScope(value)} className={`${button} ${scope === value ? "border-cyan-300 bg-cyan-300/10" : ""}`}>{t(`editor.photos.scope.${value}`, { defaultValue: value === "page" ? "Current page" : "Selected group" })}</button>)}</div>
    {photos.length >= 2 ? <><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("editor.photos.searchFrames", { defaultValue: "Find a photo frame by name or number" })} aria-label={t("editor.photos.searchFrames", { defaultValue: "Find a photo frame by name or number" })} className="min-h-9 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-xs text-white" /><div className="flex flex-wrap items-center gap-2">{([first, second] as const).map((id, index) => { const clip = photos.find(clip => clip.id === id), thumbnail = media.find(item => item.id === clip?.mediaId)?.thumbnailUrl; return <label key={index} className="flex min-w-0 items-center gap-2">{thumbnail && <img src={thumbnail} alt="" className="h-10 w-10 rounded object-cover" />}<select aria-label={t(index === 0 ? "editor.photos.first" : "editor.photos.second", { defaultValue: index === 0 ? "First photo frame" : "Second photo frame" })} value={id} onChange={event => (index === 0 ? setFrom : setTo)(event.target.value)} className="min-h-9 max-w-48 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs">{options.map(id => <option key={id} value={id}>{ids.indexOf(id) + 1}. {label(id)}</option>)}</select></label>; })}<button type="button" className={button} onClick={() => apply("swap")}>{t("editor.photos.swap", { defaultValue: "Swap photos" })}</button></div>{matches.length > 100 && <p className="text-xs text-white/45">{t("editor.photos.narrowSearch", { defaultValue: "Showing the first 100 matching frames. Search to narrow the list." })}</p>}<div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={photos.length > 100} onClick={() => apply("rotate")}>{t("editor.photos.rotate", { defaultValue: "Rotate photo order" })}</button><button type="button" className={button} disabled={photos.length > 100} onClick={() => apply("shuffle")}>{t("editor.photos.shuffle", { defaultValue: "Shuffle photos" })}</button></div></> : <p className="text-xs text-white/45">{t("editor.photos.needFrames", { defaultValue: "Add at least two unlocked photos on this page to rearrange them." })}</p>}
    <p className="text-xs text-white/45">{t("editor.photos.arrangeHint", { defaultValue: "Frames, positions, styling, and groups stay in place. Photo focal points follow their sources. Backgrounds and photos spanning several pages are excluded." })}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
