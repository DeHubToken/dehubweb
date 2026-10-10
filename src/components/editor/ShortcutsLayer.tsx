/**
 * Global keyboard shortcuts for the editor route.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect } from "react";
import { stepTimelineFrame } from "@/lib/editor/frameStep";
import { selectTimelineDuration, useEditorStore } from "@/store/editorStore";
import { recordOpts, useEditorUiStore } from "@/store/editorUiStore";
import { getTransform, isVisualClip, placementPatchAt } from "@/lib/editor/render";
import { keyAllAt, resolveClipAt } from "@/lib/editor/keyframes";

function isControlKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="menu"]')) return true;
  return (event.key === " " || event.key === "Enter") && !!target.closest('button, [role="button"], a[href]');
}

export function ShortcutsLayer() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isControlKey(e)) return;
      const s = useEditorStore.getState();
      const fps = s.settings.fps || 30;
      const dur = selectTimelineDuration(s);

      // Ask the AI agent
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useEditorUiStore.getState().setPanel("agent");
        window.dispatchEvent(new Event("editor:focus-agent"));
        return;
      }

      // K: keyframe the selected layer at the playhead, and show its motion.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "k" && s.selectedClipIds.length === 1) {
        const clip = s.clips.find((c) => c.id === s.selectedClipIds[0]);
        if (clip && clip.kind !== "audio" && s.currentTime >= clip.start - 0.001 && s.currentTime <= clip.start + clip.duration + 0.001) {
          e.preventDefault();
          s.patchClip(clip.id, { keyframes: keyAllAt(clip, s.currentTime) });
          useEditorUiStore.getState().setInspectorTab("motion");
          window.dispatchEvent(new Event("editor:open-inspector"));
        }
        return;
      }

      // Undo / redo
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo(); else s.undo();
        return;
      }
      const onCanvas = useEditorUiStore.getState().canvasFocus;

      // Duplicate: on the canvas it becomes a new layer at the same moment;
      // on the timeline it is the next clip in sequence.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (onCanvas) s.duplicateOnCanvas(); else s.duplicateSelected();
        return;
      }

      if (e.key === "Escape" && useEditorUiStore.getState().draw) {
        useEditorUiStore.getState().setDraw(null);
        return;
      }
      if (e.key === "Escape" && s.selectedClipIds.length) {
        s.selectClip(null);
        return;
      }

      // Arrow keys nudge the selected layer while the canvas has focus:
      // 1px, or 10px with Shift, in project pixels.
      if (onCanvas && e.key.startsWith("Arrow") && s.selectedClipIds.length) {
        const targets = s.clips.filter((c) => s.selectedClipIds.includes(c.id) && isVisualClip(c) && !c.locked);
        if (targets.length) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          // One undo step for the whole nudge, however many layers moved.
          void s.runAsOneStep(() => {
            for (const clip of targets) {
              const tr = getTransform(resolveClipAt(clip, s.currentTime));
              s.patchClip(clip.id, placementPatchAt(clip, {
                x: tr.x + dx / s.settings.width,
                y: tr.y + dy / s.settings.height,
              }, s.currentTime, recordOpts()));
            }
          });
          return;
        }
      }
      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        if (!s.selectedClipIds.length) return;
        e.preventDefault();
        s.copySelectedToClipboard();
        return;
      }
      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        s.pasteFromClipboard();
        return;
      }

      // Zoom
      if (e.key === "+" || e.key === "=") { e.preventDefault(); s.setZoom(s.zoom * 1.25); return; }
      if (e.key === "-" || e.key === "_") { e.preventDefault(); s.setZoom(s.zoom / 1.25); return; }

      switch (e.key) {
        case " ": {
          e.preventDefault();
          if (dur <= 0) return;
          if (s.currentTime >= dur - 0.05) s.setCurrentTime(0);
          s.setIsPlaying(!s.isPlaying);
          return;
        }
        case "s":
        case "S": {
          e.preventDefault();
          s.splitAtPlayhead();
          return;
        }
        case "Delete":
        case "Backspace": {
          if (s.selectedClipIds.length) {
            e.preventDefault();
            s.rippleDelete();
          }
          return;
        }
        case "ArrowLeft": {
          e.preventDefault();
          s.setIsPlaying(false);
          s.setCurrentTime(e.shiftKey ? stepTimelineFrame(s.currentTime, -1, fps, dur) : Math.max(0, s.currentTime - 0.5));
          return;
        }
        case "ArrowRight": {
          e.preventDefault();
          s.setIsPlaying(false);
          s.setCurrentTime(e.shiftKey ? stepTimelineFrame(s.currentTime, 1, fps, dur) : Math.min(dur || s.currentTime + 0.5, s.currentTime + 0.5));
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
