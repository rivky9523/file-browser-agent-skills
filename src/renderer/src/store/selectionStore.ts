import { create } from 'zustand';

type Kind = 'file' | 'directory';

interface SelectionState {
  path: string | null;
  kind: Kind | null;
  name: string | null;
  /** Select an entry and persist it to the main process (for the chat agent). */
  select: (path: string, kind: Kind, name: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  path: null,
  kind: null,
  name: null,

  select: (path, kind, name) => {
    set({ path, kind, name });
    void window.api.setSelection({ path, kind });
  },

  clear: () => {
    set({ path: null, kind: null, name: null });
    void window.api.setSelection({ path: null, kind: null });
  }
}));
