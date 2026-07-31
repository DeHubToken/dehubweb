/**
 * Editor shell state.
 * ===================
 * Which side panel is open, and whether the inspector is showing. Kept out of
 * editorStore so opening a panel never lands in the undo history.
 */
import { create } from 'zustand';

export type EditorPanel = 'design' | 'media' | 'text' | 'generate' | 'library' | 'inspector';

interface EditorUiState {
  /** Open panel, or null when the rail is collapsed to give the canvas room. */
  panel: EditorPanel | null;
  /** Inspector visibility on wide screens. It opens itself on selection. */
  inspectorOpen: boolean;
  setPanel: (panel: EditorPanel | null) => void;
  togglePanel: (panel: EditorPanel) => void;
  setInspectorOpen: (open: boolean) => void;
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  panel: 'design',
  inspectorOpen: true,
  setPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
}));
