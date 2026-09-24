/**
 * Editor shell state.
 * ===================
 * Which side panel is open, and whether the inspector is showing. Kept out of
 * editorStore so opening a panel never lands in the undo history.
 */
import { create } from 'zustand';

export type EditorPanel = 'agent' | 'design' | 'elements' | 'layers' | 'assets' | 'media' | 'text' | 'generate' | 'library' | 'inspector';

/** A generation the AI agent prepared; the Generate panel shows it for the user to confirm. */
export interface GeneratePrefill {
  kind: 'image' | 'video';
  prompt: string;
  aspect?: string;
}

interface EditorUiState {
  /** Open panel, or null when the rail is collapsed to give the canvas room. */
  panel: EditorPanel | null;
  /** Inspector visibility on wide screens. It opens itself on selection. */
  inspectorOpen: boolean;
  setPanel: (panel: EditorPanel | null) => void;
  togglePanel: (panel: EditorPanel) => void;
  setInspectorOpen: (open: boolean) => void;
  /** Timeline visibility. Photo and graphic designs rarely need it. */
  timelineOpen: boolean;
  setTimelineOpen: (open: boolean) => void;
  /**
   * True after the last click landed on the canvas. Arrow keys then nudge the
   * selected layer instead of moving the playhead.
   */
  canvasFocus: boolean;
  setCanvasFocus: (focus: boolean) => void;
  generatePrefill: GeneratePrefill | null;
  setGeneratePrefill: (prefill: GeneratePrefill | null) => void;
  /** Freehand drawing: while set, dragging on the canvas draws instead of selecting. */
  draw: { color: string; width: number } | null;
  setDraw: (draw: { color: string; width: number } | null) => void;
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  panel: 'agent',
  inspectorOpen: true,
  timelineOpen: true,
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  canvasFocus: false,
  setCanvasFocus: (canvasFocus) => set({ canvasFocus }),
  draw: null,
  setDraw: (draw) => set({ draw }),
  generatePrefill: null,
  setGeneratePrefill: (generatePrefill) => set({ generatePrefill }),
  setPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
}));
