import { create } from 'zustand';
import type { DriveInfo, DirListing } from '@shared/types';

// `null` location = the "This PC" view (list of drives).
type Location = string | null;

interface NavState {
  location: Location;
  drives: DriveInfo[];
  listing: DirListing | null;
  loading: boolean;
  error: string | null;

  history: Location[];
  index: number;

  init: () => Promise<void>;
  go: (loc: Location) => Promise<void>; // navigate + push history
  goUp: () => Promise<void>;
  back: () => Promise<void>;
  forward: () => Promise<void>;
  refresh: () => Promise<void>;
}

async function load(loc: Location): Promise<Partial<NavState>> {
  try {
    if (loc === null) {
      const drives = await window.api.listDrives();
      return { drives, listing: null, error: null };
    }
    const listing = await window.api.listDir(loc);
    return { listing, error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const useNavStore = create<NavState>((set, get) => ({
  location: null,
  drives: [],
  listing: null,
  loading: false,
  error: null,
  history: [null],
  index: 0,

  init: async () => {
    set({ loading: true });
    set({ ...(await load(null)), loading: false });
  },

  go: async (loc) => {
    if (loc === get().location) return;
    set({ loading: true, location: loc });
    const data = await load(loc);
    const { history, index } = get();
    const trimmed = history.slice(0, index + 1);
    trimmed.push(loc);
    set({ ...data, loading: false, history: trimmed, index: trimmed.length - 1 });
  },

  goUp: async () => {
    const { listing, location } = get();
    if (location === null) return;
    const parent = listing?.parent ?? null;
    await get().go(parent);
  },

  back: async () => {
    const { index, history } = get();
    if (index <= 0) return;
    const loc = history[index - 1];
    set({ loading: true, location: loc, index: index - 1 });
    set({ ...(await load(loc)), loading: false });
  },

  forward: async () => {
    const { index, history } = get();
    if (index >= history.length - 1) return;
    const loc = history[index + 1];
    set({ loading: true, location: loc, index: index + 1 });
    set({ ...(await load(loc)), loading: false });
  },

  refresh: async () => {
    set({ loading: true });
    set({ ...(await load(get().location)), loading: false });
  }
}));
