/**
 * Global keyboard shortcuts for the editor route.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect } from "react";
import { selectTimelineDuration, useEditorStore } from "@/store/editorStore";

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
      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateSelected();
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
