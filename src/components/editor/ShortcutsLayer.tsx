/**
 * Global keyboard shortcuts for the editor route.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect } from "react";
import { selectTimelineDuration, useEditorStore } from "@/store/editorStore";
import { useEditorUiStore } from "@/store/editorUiStore";
import { getTransform, isVisualClip, placementPatch } from "@/lib/editor/render";

function isTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function ShortcutsLayer() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return;
      const s = useEditorStore.getState();
      const fps = s.settings.fps || 30;
      const dur = selectTimelineDuration(s);

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

      if (e.key === "Escape" && s.selectedClipIds.length) {
        s.selectClip(null);
        return;
      }

      // Arrow keys nudge the selected layer while the canvas has focus:
      // 1px, or 10px with Shift, in project pixels.
      if (onCanvas && e.key.startsWith("Arrow") && s.selectedClipIds.length === 1) {
        const clip = s.clips.find((c) => c.id === s.selectedClipIds[0]);
        if (clip && isVisualClip(clip)) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          const tr = getTransform(clip);
          s.patchClip(clip.id, placementPatch(clip, {
            x: tr.x + dx / s.settings.width,
            y: tr.y + dy / s.settings.height,
          }));
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
          const step = e.shiftKey ? 1 / fps : 0.5;
          s.setIsPlaying(false);
          s.setCurrentTime(Math.max(0, s.currentTime - step));
          return;
        }
        case "ArrowRight": {
          e.preventDefault();
          const step = e.shiftKey ? 1 / fps : 0.5;
          s.setIsPlaying(false);
          s.setCurrentTime(Math.min(dur || s.currentTime + step, s.currentTime + step));
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
