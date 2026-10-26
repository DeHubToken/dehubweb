/**
 * AI agent chat history for the editor. Lives outside the panel so switching
 * tabs does not wipe the conversation, and outside editorStore so chatting
 * never lands in the undo history.
 */
import { create } from 'zustand';
import type { AgentMessage, ApplyReport } from '@/lib/editor/agent';
import type { ProjectSnapshot } from '@/lib/editor/types';

export interface AgentChatEntry extends AgentMessage {
  id: string;
  report?: ApplyReport;
  error?: boolean;
  /** The project as it was before this request ran, so the chat can restore it. */
  checkpoint?: ProjectSnapshot;
  /** The person's verdict on an assistant reply. */
  rating?: 'up' | 'down';
}

interface EditorAgentState {
  entries: AgentChatEntry[];
  busy: boolean;
  /** Requests typed while the assistant was working, sent in order. */
  queue: string[];
  push: (entry: AgentChatEntry) => void;
  setBusy: (busy: boolean) => void;
  rate: (id: string, rating: AgentChatEntry['rating']) => void;
  enqueue: (prompt: string) => void;
  dequeue: () => string | undefined;
  unqueue: (index: number) => void;
  clear: () => void;
}

export const useEditorAgentStore = create<EditorAgentState>((set, get) => ({
  entries: [],
  busy: false,
  queue: [],
  push: (entry) => set((s) => ({ entries: [...s.entries, entry].slice(-60) })),
  setBusy: (busy) => set({ busy }),
  rate: (id, rating) => set((s) => ({ entries: s.entries.map((e) => e.id === id ? { ...e, rating: e.rating === rating ? undefined : rating } : e) })),
  enqueue: (prompt) => set((s) => ({ queue: [...s.queue, prompt].slice(0, 10) })),
  dequeue: () => { const [first, ...rest] = get().queue; set({ queue: rest }); return first; },
  unqueue: (index) => set((s) => ({ queue: s.queue.filter((_, i) => i !== index) })),
  clear: () => set({ entries: [], queue: [] }),
}));
