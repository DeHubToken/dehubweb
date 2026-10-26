/**
 * Global keyboard shortcuts for the editor route.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect } from "react";
import { stepTimelineFrame } from "@/lib/editor/frameStep";
import { nextDesignLayer } from "@/lib/editor/layerNavigation";
import { selectTimelineDuration, useEditorStore } from "@/store/editorStore";
import { recordOpts, useEditorUiStore } from "@/store/editorUiStore";
import { getTransform, isVisualClip, placementPatchAt } from "@/lib/editor/render";
import { keyAllAt, resolveClipAt } from "@/lib/editor/keyframes";
import { nanoid } from "nanoid";
import { copyDesignSelection, cutDesignSelection, getDesignClipboard, pasteDesignSelection, reportDesignClipboard } from "@/lib/editor/designClipboard";
import { editorErrorText } from "@/lib/editor/editorError";
import { translateCopy } from "@/i18n/copy";

function isControlKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="menu"]')) return true;
  return (event.key === " " || event.key === "Enter") && !!target.closest('button, [role="button"], a[href]');
}

export function ShortcutsLayer({ active = true }: { active?: boolean }) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (isControlKey(e)) return;
      const s = useEditorStore.getState();
      const fps = s.settings.fps || 30;
      const dur = selectTimelineDuration(s);

      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.code === "Digit1" || e.code === "Digit2")) {
        e.preventDefault(); window.dispatchEvent(new Event(e.code === "Digit1" ? "editor:fit-page" : "editor:focus-selection")); return;
      }

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
      if (onCanvas && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && ["PageUp", "PageDown"].includes(e.key)) {
        if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="alertdialog"]')) return;
        e.preventDefault();
        const next = nextDesignLayer(s.toSnapshot(), s.currentTime, s.selectedClipIds, e.key === "PageUp" ? -1 : 1);
        if (next) { s.setIsPlaying(false); s.selectClip(next); }
        return;
      }
      if (onCanvas && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const hidden = new Set(s.tracks.filter(track => track.hidden).map(track => track.id));
        s.selectMany(s.clips.filter(c => isVisualClip(c) && !c.isPageBackground && !c.locked && !c.hidden && !hidden.has(c.trackId) &&
          s.currentTime >= c.start && s.currentTime < c.start + c.duration).map(c => c.id));
        return;
      }
      if (onCanvas && !e.metaKey && !e.ctrlKey && !e.altKey && ["t", "r", "c", "l"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === "t") s.addTextClip(undefined, s.currentTime, { layer: true });
        else s.addShapeClip(e.key.toLowerCase() === "r" ? "rect" : e.key.toLowerCase() === "c" ? "ellipse" : "line");
        window.dispatchEvent(new Event("editor:open-inspector"));
        return;
      }
      if (onCanvas && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) s.ungroupSelected(); else s.groupSelected();
        return;
      }

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
        if (s.clips.some(c => s.selectedClipIds.includes(c.id) && c.groupId && c.locked)) return;
        const targets = s.clips.filter((c) => s.selectedClipIds.includes(c.id) && isVisualClip(c) && !c.isPageBackground && !c.locked);
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
      if (onCanvas && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x" && s.selectedClipIds.length) {
        e.preventDefault();
        try { const before = s.toSnapshot(), next = cutDesignSelection(before, s.selectedClipIds, s.currentTime, () => nanoid(10)); if (next !== before && s.applyDesignEdit(before, next)) { s.selectClip(null); reportDesignClipboard({ kind: "cut", count: getDesignClipboard()?.layers.length ?? 0 }); } }
        catch (value) { reportDesignClipboard({ kind: "error", message: editorErrorText(value, translateCopy("copy.60183677d43b", { defaultValue: "Could not cut these layers" })) }); }
        return;
      }
      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        if (!s.selectedClipIds.length) return;
        e.preventDefault();
        if (onCanvas) {
          try { if (!copyDesignSelection(s.toSnapshot(), s.selectedClipIds, s.currentTime)) reportDesignClipboard({ kind: "error", message: translateCopy("editor.clipboard.empty", { defaultValue: "Select unlocked foreground layers on this page" }) }); }
          catch (value) { reportDesignClipboard({ kind: "error", message: editorErrorText(value, translateCopy("copy.b3f1e2f7f110", { defaultValue: "Could not copy these layers" })) }); }
          return;
        }
        s.copySelectedToClipboard();
        return;
      }
      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (onCanvas) {
          try {
            const before = s.toSnapshot(), result = pasteDesignSelection(before, s.currentTime, getDesignClipboard(), () => nanoid(10));
            if (result && s.applyDesignEdit(before, result.project)) { s.setIsPlaying(false); s.selectMany(result.ids); reportDesignClipboard({ kind: "pasted", count: result.ids.length, skipped: result.skipped }); }
          } catch (value) { reportDesignClipboard({ kind: "error", message: editorErrorText(value, translateCopy("copy.dc8b32bff25f", { defaultValue: "Could not paste these layers" })) }); }
          return;
        }
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
  }, [active]);
  return null;
}
