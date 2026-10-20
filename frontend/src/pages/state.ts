import { useEffect, useState } from 'react';
import { Meta } from '../api';

// Module-level stores with subscription: page components can unmount while a
// parse is running; the promise keeps updating the store, and the remounted
// component picks up the live state (loading/results) seamlessly.

function createStore<T extends object>(initial: T) {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const store = {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      notify();
    },
    use(): [T, (patch: Partial<T>) => void] {
      const [, force] = useState(0);
      useEffect(() => {
        const l = () => force((n) => n + 1);
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      }, []);
      return [state, store.set];
    },
  };
  let state = initial;
  return store;
}

export interface BatchState {
  text: string;
  loading: boolean;
  parseId: string;
  metas: Meta[];
  fails: string[];
  rowFormats: Record<string, string>;
}

export interface PlaylistState {
  url: string;
  loading: boolean;
  parseId: string;
  meta: Meta | null;
  rowFormats: Record<string, string>;
}

export const batchStore = createStore<BatchState>({
  text: '',
  loading: false,
  parseId: '',
  metas: [],
  fails: [],
  rowFormats: {},
});

export const playlistStore = createStore<PlaylistState>({
  url: '',
  loading: false,
  parseId: '',
  meta: null,
  rowFormats: {},
});
