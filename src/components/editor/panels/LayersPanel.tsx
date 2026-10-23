import { renameDesignLayer } from "@/lib/editor/designLayerNames";
import { useEditorDraftFocus } from "../useEditorDraftFocus";
/**
 * Layers — every visible layer at the playhead, top of the stack first.
 * Click to select, drag to restack, and hide or lock layers here. Hidden and
 * locked layers cannot be picked on the canvas, so this is the way back to them.
 *
 * Stacking is per track (each canvas-added layer gets its own track), so moving
 * a layer moves its whole track, exactly like Bring forward / Send backward.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shapes, Type, Unlock } from "lucide-react";
import Eye from "@/components/ui/cut-icons/visibility";
import EyeOff from "@/components/ui/cut-icons/hidden";
import ImageIcon from "@/components/ui/cut-icons/images";
import Lock from "@/components/ui/cut-icons/privacy";
import Video from "@/components/ui/cut-icons/video";

import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import { isVisualClip } from '@/lib/editor/render';
import { SHAPE_NAMES } from "@/lib/editor/shapeGeometry";
import type { Clip } from '@/lib/editor/types';

function KindIcon({ clip }: { clip: Clip }) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-white/50';
  if (clip.kind === 'text') return <Type className={cls} />;
  if (clip.kind === 'shape') return <Shapes className={cls} />;
  if (clip.kind === 'video') return <Video className={cls} />;
  return <ImageIcon className={cls} />;
}

export function LayersPanel() {
  const { t } = useTranslation();
  const draftFocus = useEditorDraftFocus("layer-names", false);
  const projectId = useEditorStore(s => s.projectId);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const cancelled = useRef(false);
  const [draft, setDraft] = useState<{ id: string; project: string; value: string } | null>(null);
  useEffect(() => setDraft(null), [projectId]);
  const saveName = () => {
    if (!draft || cancelled.current) return;
    const store = useEditorStore.getState(), before = store.toSnapshot();
    if (before.id === draft.project) store.applyDesignEdit(before, renameDesignLayer(before, draft.id, draft.value));
    setDraft(null);
  };

  const clips = useEditorStore((s) => s.clips);
  const tracks = useEditorStore((s) => s.tracks);
  const media = useEditorStore((s) => s.media);
  const currentTime = useEditorStore((s) => s.currentTime);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectClip = useEditorStore((s) => s.selectClip);
  const patchClip = useEditorStore((s) => s.patchClip);
  const reorderTrack = useEditorStore((s) => s.reorderTrack);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const layers = useMemo(() => {
    const z = new Map(tracks.map((tr, i) => [tr.id, i]));
    return clips
      .filter((c) => isVisualClip(c) && currentTime >= c.start && currentTime < c.start + c.duration)
      .sort((a, b) => (z.get(b.trackId) ?? 0) - (z.get(a.trackId) ?? 0));
  }, [clips, tracks, currentTime]);

  const labelFor = (c: Clip): string => {
    if (c.label) return c.label;
    if (c.kind === 'shape' && c.photoFrame) return t('editor.grids.frame', { defaultValue: 'Photo frame' });
    if (c.kind === 'shape' && c.qr) return t('editor.qr.title', { defaultValue: 'QR code' });
    if (c.kind === 'shape' && c.chart) return t('editor.dataVisual.chart', { defaultValue: 'Chart' });
    if (c.kind === 'shape' && c.table) return t('editor.dataVisual.table', { defaultValue: 'Table' });
    if (c.kind === 'text') return c.text.split('\n')[0] || t('editor.layers.text');
    if (c.kind === 'shape') return t(`editor.shape.${c.shape}`, { defaultValue: SHAPE_NAMES[c.shape] });
    if ('mediaId' in c) return media.find((m) => m.id === c.mediaId)?.name ?? t('editor.layers.media');
    return '';
  };

  const filtered = layers.filter(clip => (kind === "all" || (kind === "media" ? clip.kind === "image" || clip.kind === "video" : clip.kind === kind)) && labelFor(clip).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  const drop = (targetClip: Clip) => {
    const src = layers.find((l) => l.id === dragId);
    setDragId(null);
    setOverId(null);
    if (!src || src.trackId === targetClip.trackId) return;
    const toIndex = tracks.findIndex((tr) => tr.id === targetClip.trackId);
    if (toIndex >= 0) reorderTrack(src.trackId, toIndex);
  };

  if (!layers.length) {
    return <p className="p-4 text-[11px] text-white/45">{t('editor.layers.empty')}</p>;
  }

  return (
    <div {...draftFocus.props} className="flex h-full min-h-0 flex-col">
      <div className="flex gap-2 border-b border-white/10 p-2"><input value={query} onChange={e => setQuery(e.target.value)} aria-label={t("editor.layers.search", { defaultValue: "Search layers" })} placeholder={t("editor.layers.search", { defaultValue: "Search layers" })} className="min-h-9 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-2 text-xs text-white" /><select value={kind} onChange={e => setKind(e.target.value)} aria-label={t("editor.layers.filter", { defaultValue: "Layer type" })} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs text-white">{(["all", "text", "media", "shape"] as const).map(value => <option key={value} value={value}>{t(`editor.layers.kind.${value}`, { defaultValue: ({ all: "All", text: "Text", media: "Media", shape: "Shapes" })[value] })}</option>)}</select></div>
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {!filtered.length && <li className="p-2 text-xs text-white/45">{t("editor.layers.noMatches", { defaultValue: "No matching layers" })}</li>}
      {filtered.map((c) => {
        const selected = selectedClipIds.includes(c.id);
        return (
          <li
            key={c.id}
            draggable={draft?.id !== c.id}
            onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(c.id); } }}
            onDragLeave={() => setOverId((o) => (o === c.id ? null : o))}
            onDrop={(e) => { e.preventDefault(); drop(c); }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onClick={(e) => selectClip(c.id, e.shiftKey)}
            className={cn(
              'group flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] transition',
              selected ? 'border-white/40 bg-white/10 text-white' : 'border-white/5 text-white/75 hover:bg-white/5',
              overId === c.id && 'border-fuchsia-400/70',
              dragId === c.id && 'opacity-40',
              c.hidden && 'text-white/35',
            )}
          >
            <KindIcon clip={c} />
            {draft?.id === c.id ? <input autoFocus value={draft.value} onClick={e => e.stopPropagation()} onChange={e => setDraft(value => value ? { ...value, value: e.target.value } : null)} maxLength={80} aria-label={t("editor.layers.name", { defaultValue: "Layer name" })} onBlur={saveName} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveName(); } if (e.key === "Escape") { e.preventDefault(); cancelled.current = true; setDraft(null); } }} className="min-h-8 min-w-0 flex-1 rounded border border-white/30 bg-white/5 px-1 text-xs outline-none" /> : <span onDoubleClick={e => { e.stopPropagation(); cancelled.current = false; setDraft({ id: c.id, project: projectId, value: c.label ?? labelFor(c) }); }} className="min-w-0 flex-1 truncate">{labelFor(c)}</span>}
            {!draft && <button type="button" onClick={e => { e.stopPropagation(); cancelled.current = false; setDraft({ id: c.id, project: projectId, value: c.label ?? labelFor(c) }); }} className="rounded px-1 text-[10px] text-white/35 hover:text-white">{t("editor.layers.rename", { defaultValue: "Rename" })}</button>}
            {c.groupId && <span className="text-[9px] text-white/35">{t("editor.groups.group", { defaultValue: "Group" })}</span>}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); patchClip(c.id, { locked: !c.locked }); }}
              aria-label={c.locked ? t('editor.layers.unlock') : t('editor.layers.lock')}
              title={c.locked ? t('editor.layers.unlock') : t('editor.layers.lock')}
              className={cn('rounded p-0.5 hover:bg-white/10', !c.locked && 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
            >
              {c.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); patchClip(c.id, { hidden: !c.hidden }); }}
              aria-label={c.hidden ? t('editor.layers.show') : t('editor.layers.hide')}
              title={c.hidden ? t('editor.layers.show') : t('editor.layers.hide')}
              className="rounded p-0.5 hover:bg-white/10"
            >
              {c.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </li>
        );
      })}
      <li className="px-1 pt-1 text-[10px] text-white/35">{t('editor.layers.hint')}</li>
    </ul>
    </div>
  );
}
