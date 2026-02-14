import {createContext, useContext, useEffect, useMemo, useReducer} from "react";
import type {ReactNode} from "react";
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
  /** Set a cell value */
  set(name: string, value: unknown): void;
  /** Subscribe to changes for a specific cell */
  subscribe(listener: CellListener): () => void;
}

function createCellStore(): CellStore {
  const values: CellValues = new Map();
  const listeners = new Set<CellListener>();

  return {
    values,
    set(name: string, value: unknown) {
      const prev = values.get(name);
      if (Object.is(prev, value)) return;
      values.set(name, value);
      for (const listener of listeners) {
        listener(name, value);
      }
    },
    subscribe(listener: CellListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
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
 * This replaces Observable's implicit variable declaration:
 *   const data = [...];  // Observable: declares "data" in the module scope
 *
 * React equivalent:
 *   useCellOutput("data", data);
 */
export function useCellOutput(name: string, value: unknown): void {
  const store = useCellStore();
  // Update synchronously during render to ensure consistency
  useEffect(() => {
    store.set(name, value);
  }, [store, name, value]);
}

/**
 * Hook for a cell to consume a named input value.
 * Re-renders whenever the named value changes.
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
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    return store.subscribe((changedName) => {
      if (changedName === name) forceUpdate();
    });
  }, [store, name]);

  return store.values.get(name) as T | undefined;
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
