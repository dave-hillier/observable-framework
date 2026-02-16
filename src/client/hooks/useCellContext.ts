import type {ReactNode} from "react";
import {createContext, useCallback, useContext, useLayoutEffect, useMemo, useSyncExternalStore} from "react";
import {createElement} from "react";

/**
 * CellContext provides Observable-style inter-cell communication in React.
 *
 * In Observable Framework, cells share a flat namespace: a cell can declare
 * variables (outputs) that other cells reference (inputs). The Observable
 * Runtime resolves these dependencies automatically.
 *
 * In React, we model this with a context that acts as a shared reactive store:
 * - Cells that declare variables call `useCellOutput(name, value)` to publish
 * - Cells that reference variables call `useCellInput(name)` to subscribe
 * - When an output changes, all subscribing inputs re-render
 *
 * This preserves the flat-namespace authoring model while using React's
 * rendering and reconciliation.
 */

type CellValues = Map<string, unknown>;
type CellListener = (name: string, value: unknown) => void;

interface CellStore {
  /** Current cell values */
  values: CellValues;
  /** Write a value to the store without notifying listeners. Safe to call during render. */
  write(name: string, value: unknown): void;
  /** Notify listeners of a value change. Must be called outside render (e.g., in useLayoutEffect). */
  notify(name: string, value: unknown): void;
  /** Write + notify in one call (for use outside render). */
  set(name: string, value: unknown): void;
  /** Subscribe to changes for a specific cell */
  subscribe(listener: CellListener): () => void;
  /** Monotonic version counter, incremented on every write. Used by useSyncExternalStore. */
  version: number;
}

function createCellStore(): CellStore {
  const values: CellValues = new Map();
  const listeners = new Set<CellListener>();

  const store: CellStore = {
    values,
    version: 0,
    write(name: string, value: unknown) {
      const prev = values.get(name);
      if (Object.is(prev, value)) return;
      values.set(name, value);
      store.version++;
    },
    notify(name: string, value: unknown) {
      for (const listener of listeners) {
        listener(name, value);
      }
    },
    set(name: string, value: unknown) {
      const prev = values.get(name);
      if (Object.is(prev, value)) return;
      values.set(name, value);
      store.version++;
      for (const listener of listeners) {
        listener(name, value);
      }
    },
    subscribe(listener: CellListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  return store;
}

const CellStoreContext = createContext<CellStore | null>(null);

function useCellStore(): CellStore {
  const store = useContext(CellStoreContext);
  if (!store) throw new Error("useCellInput/useCellOutput must be used within a CellProvider");
  return store;
}

/**
 * Provider component that creates a cell namespace for a page.
 * All cells within this provider share the same variable namespace.
 *
 * Usage:
 *   <CellProvider>
 *     <Cell_abc123 />
 *     <Cell_def456 />
 *   </CellProvider>
 */
export function CellProvider({children}: {children: ReactNode}) {
  const store = useMemo(createCellStore, []);
  return createElement(CellStoreContext.Provider, {value: store}, children);
}

/**
 * Hook for a cell to publish a named output value.
 * When the value changes, all cells consuming this name will re-render.
 *
 * Values are written to the store synchronously during render so that
 * cells rendered later in the same pass can read them immediately (no
 * one-frame delay). Listener notifications are deferred to useLayoutEffect
 * so they fire before paint, eliminating visible flashes.
 *
 * This replaces Observable's implicit variable declaration:
 *   const data = [...];  // Observable: declares "data" in the module scope
 *
 * React equivalent:
 *   useCellOutput("data", data);
 */
export function useCellOutput(name: string, value: unknown): void {
  const store = useCellStore();
  // Write synchronously during render so same-pass consumers see the value.
  // This is safe because we only mutate the external Map — no React state
  // updates or listener notifications happen here.
  store.write(name, value);
  // Notify subscribers in useLayoutEffect (before paint) so cross-pass
  // consumers re-render without a visible flash.
  useLayoutEffect(() => {
    store.notify(name, value);
  }, [store, name, value]);
}

/**
 * Hook for a cell to consume a named input value.
 * Re-renders whenever the named value changes.
 *
 * Uses useSyncExternalStore for tear-free, concurrent-safe reads.
 * The store's version counter ensures React detects changes even
 * when the same name is updated multiple times between renders.
 *
 * This replaces Observable's implicit variable reference:
 *   display(data.length);  // Observable: references "data" from another cell
 *
 * React equivalent:
 *   const data = useCellInput("data");
 *   return <span>{data.length}</span>;
 */
export function useCellInput<T = unknown>(name: string): T | undefined {
  const store = useCellStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return store.subscribe((changedName) => {
        if (changedName === name) onStoreChange();
      });
    },
    [store, name]
  );

  const getSnapshot = useCallback(() => {
    return store.values.get(name) as T | undefined;
  }, [store, name]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook that returns the full cell context for advanced use cases.
 * Provides both get and set access to all cell values.
 */
export function useCellContext(): {
  get<T = unknown>(name: string): T | undefined;
  set(name: string, value: unknown): void;
  subscribe(listener: CellListener): () => void;
} {
  const store = useCellStore();
  return useMemo(
    () => ({
      get<T = unknown>(name: string): T | undefined {
        return store.values.get(name) as T | undefined;
      },
      set: store.set,
      subscribe: store.subscribe
    }),
    [store]
  );
}
