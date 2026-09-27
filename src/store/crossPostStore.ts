import { create } from 'zustand';

interface CrossPostState {
  selected: string[];
  toggle: (accountId: string) => void;
  set: (accountIds: string[]) => void;
}

// Persists between posts on purpose: people cross-post to the same places every time.
export const useCrossPostStore = create<CrossPostState>()((set) => ({
  selected: (() => {
    try { return JSON.parse(localStorage.getItem('dehub_crosspost_selected') || '[]'); } catch { return []; }
  })(),
  toggle: (accountId) => set((s) => {
    const selected = s.selected.includes(accountId) ? s.selected.filter((id) => id !== accountId) : [...s.selected, accountId];
    try { localStorage.setItem('dehub_crosspost_selected', JSON.stringify(selected)); } catch { /* storage unavailable */ }
    return { selected };
  }),
  set: (selected) => set(() => {
    try { localStorage.setItem('dehub_crosspost_selected', JSON.stringify(selected)); } catch { /* storage unavailable */ }
    return { selected };
  }),
}));
