/**
 * AI agent chat history for the editor. Lives outside the panel so switching
 * tabs does not wipe the conversation, and outside editorStore so chatting
 * never lands in the undo history.
 */
import { create } from 'zustand';
import type { AgentMessage, ApplyReport } from '@/lib/editor/agent';

export interface AgentChatEntry extends AgentMessage {
  id: string;
  report?: ApplyReport;
  error?: boolean;
}

interface EditorAgentState {
  entries: AgentChatEntry[];
  busy: boolean;
  push: (entry: AgentChatEntry) => void;
  setBusy: (busy: boolean) => void;
  clear: () => void;
}

export const useEditorAgentStore = create<EditorAgentState>((set) => ({
  entries: [],
  busy: false,
  push: (entry) => set((s) => ({ entries: [...s.entries, entry].slice(-60) })),
  setBusy: (busy) => set({ busy }),
  clear: () => set({ entries: [] }),
}));
