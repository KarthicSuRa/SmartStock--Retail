'use client';

// /src/lib/local-store.ts
// Tiny persistent client store (localStorage-backed) shared across pages via useSyncExternalStore.
// Seeds must be deterministic so server render and first client render match.

import { useSyncExternalStore } from 'react';

export interface PersistentStore<T> {
  get: () => T;
  set: (updater: T | ((prev: T) => T)) => void;
  reset: () => void;
  useStore: () => [T, (updater: T | ((prev: T) => T)) => void];
}

export function createPersistentStore<T>(key: string, initial: () => T): PersistentStore<T> {
  let state: T | undefined;
  let serverSnapshot: T | undefined;
  const listeners = new Set<() => void>();

  const get = (): T => {
    if (state !== undefined) return state;
    let value = initial();
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (raw) value = JSON.parse(raw) as T;
    } catch {
      // storage blocked or corrupt — fall back to seed
    }
    state = value;
    return value;
  };

  const set = (updater: T | ((prev: T) => T)) => {
    const next = typeof updater === 'function' ? (updater as (prev: T) => T)(get()) : updater;
    state = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore quota / private mode
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getServerSnapshot = () => {
    if (serverSnapshot === undefined) serverSnapshot = initial();
    return serverSnapshot;
  };

  return {
    get,
    set,
    reset: () => set(initial()),
    useStore: () => [useSyncExternalStore(subscribe, get, getServerSnapshot), set],
  };
}

/** Deterministic UTC timestamp formatter (safe for SSR hydration). */
export function formatTs(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19) + ' UTC';
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
