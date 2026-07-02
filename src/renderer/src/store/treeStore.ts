import { create } from 'zustand';
import type { DirEntry } from '@shared/types';

interface TreeState {
  expanded: Record<string, boolean>;
  children: Record<string, DirEntry[]>; // directories only, keyed by parent path
  loading: Record<string, boolean>;
  errored: Record<string, boolean>;

  /** Loads (and caches) the sub-directories of a path. */
  loadChildren: (path: string) => Promise<void>;
  /** Expand/collapse a node, lazy-loading children on first expand. */
  toggle: (path: string) => Promise<void>;
  /** Ensure a node is expanded (used when navigating from the breadcrumb). */
  expand: (path: string) => Promise<void>;
}

export const useTreeStore = create<TreeState>((set, get) => ({
  expanded: {},
  children: {},
  loading: {},
  errored: {},

  loadChildren: async (path) => {
    if (get().children[path] || get().loading[path]) return;
    set((s) => ({ loading: { ...s.loading, [path]: true } }));
    try {
      const listing = await window.api.listDir(path);
      const dirs = listing.entries.filter((e) => e.kind === 'directory');
      set((s) => ({
        children: { ...s.children, [path]: dirs },
        loading: { ...s.loading, [path]: false }
      }));
    } catch {
      set((s) => ({
        errored: { ...s.errored, [path]: true },
        children: { ...s.children, [path]: [] },
        loading: { ...s.loading, [path]: false }
      }));
    }
  },

  toggle: async (path) => {
    const isOpen = get().expanded[path];
    if (isOpen) {
      set((s) => ({ expanded: { ...s.expanded, [path]: false } }));
      return;
    }
    set((s) => ({ expanded: { ...s.expanded, [path]: true } }));
    await get().loadChildren(path);
  },

  expand: async (path) => {
    set((s) => ({ expanded: { ...s.expanded, [path]: true } }));
    await get().loadChildren(path);
  }
}));
