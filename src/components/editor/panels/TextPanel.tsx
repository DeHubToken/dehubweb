/**
 * Text panel.
 * ===========
 * Lifted out of the media sidebar so text is a first-class tab rather than a
 * cramped nine-tile grid competing with the media list. Presets drag onto the
 * canvas to place, or onto the timeline to schedule.
 */
import { useCallback } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { TEXT_DRAG_MIME, TEXT_PRESETS, type TextPreset } from '@/lib/editor/textPresets';
import { PanelHeading } from './DesignPanel';

export function TextPanel() {
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const updateTextClip = useEditorStore((s) => s.updateTextClip);

  const insert = useCallback(
    (p: TextPreset) => {
      const id = addTextClip();
      updateTextClip(id, { text: p.text, fontSize: p.fontSize, fontWeight: p.fontWeight });
    },
    [addTextClip, updateTextClip],
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <PanelHeading>Add text</PanelHeading>

      <button
        type="button"
        onClick={() => addTextClip()}
        className="mb-3 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
      >
        Add a text box
      </button>

      <PanelHeading>Styles</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        {TEXT_PRESETS.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'copy';
              e.dataTransfer.setData(TEXT_DRAG_MIME, JSON.stringify(p));
            }}
            onDoubleClick={() => insert(p)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                insert(p);
              }
            }}
            title={`Drag onto the canvas or timeline, or press Enter to add — ${p.label}`}
            className="group flex cursor-grab flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-4 text-white/85 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white active:cursor-grabbing"
          >
            <span className="leading-none" style={{ fontWeight: p.fontWeight, fontSize: p.previewSize }}>
              Aa
            </span>
            <span className="text-[10px] uppercase tracking-wide text-white/45 group-hover:text-white/70">
              {p.label}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 px-0.5 text-[11px] leading-relaxed text-white/40">
        Drag a style onto the canvas to place it exactly, or onto the timeline to schedule when it
        appears. Double-click to drop it at the playhead.
      </p>
    </div>
  );
}
