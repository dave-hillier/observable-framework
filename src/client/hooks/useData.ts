import {useEffect, useRef, useState} from "react";

type Status = "pending" | "resolved" | "rejected";

interface CacheEntry<T> {
  status: Status;
  value?: T;
  error?: unknown;
  promise?: Promise<T>;
}

// Global cache for Suspense-compatible data loading
const dataCache = new Map<string, CacheEntry<unknown>>();

/**
 * Suspense-compatible data loading hook.
 * Throws a promise while loading (for use with React Suspense),
 * throws an error if the load fails, or returns the loaded data.
 *
 * Usage:
 *   function MyComponent() {
 *     const data = useSuspenseData("sales", () => fetch("/data/sales.json").then(r => r.json()));
 *     return <Chart data={data} />;
 *   }
 *
 *   // Wrap in Suspense:
 *   <Suspense fallback={<Loading />}>
 *     <MyComponent />
 *   </Suspense>
 */
export function useSuspenseData<T>(key: string, loader: () => Promise<T>): T {
  let entry = dataCache.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    const promise = loader().then(
      (value) => {
        entry!.status = "resolved";
        entry!.value = value;
        return value;
      },
      (error) => {
        entry!.status = "rejected";
        entry!.error = error;
        throw error;
      }
    );
    entry = {status: "pending", promise};
    dataCache.set(key, entry as CacheEntry<unknown>);
  }

  if (entry.status === "pending") throw entry.promise;
  if (entry.status === "rejected") throw entry.error;
  return entry.value!;
}

/** Invalidate a cached data entry, causing it to reload on next render. */
export function invalidateData(key: string): void {
  dataCache.delete(key);
}

/** Clear all cached data. */
export function invalidateAllData(): void {
  dataCache.clear();
}

/**
 * Standard (non-Suspense) async data loading hook.
 * Returns {data, loading, error} triple.
 *
 * Usage:
 *   const {data, loading, error} = useAsyncData(() => fetch("/data.json").then(r => r.json()));
 *   if (loading) return <Loading />;
 *   if (error) return <Error error={error} />;
 *   return <Chart data={data} />;
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): {
  data: T | undefined;
  loading: boolean;
  error: unknown;
} {
  const [state, setState] = useState<{data: T | undefined; loading: boolean; error: unknown}>({
    data: undefined,
    loading: true,
    error: undefined
  });

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({...s, loading: true, error: undefined}));

    loaderRef.current().then(
      (data) => {
        if (!cancelled) setState({data, loading: false, error: undefined});
      },
      (error) => {
        if (!cancelled) setState((s) => ({...s, loading: false, error}));
      }
    );

    return () => {
      cancelled = true;
    };
  }, deps); // eslint-disable-line

  return state;
}

/**
 * Simple hook to load data once and return it.
 * Returns undefined while loading, throws on error.
 *
 * Usage:
 *   const data = useData(() => fetch("/api/data").then(r => r.json()));
 */
export function useData<T>(loader: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const {data, error} = useAsyncData(loader, deps);
  if (error) throw error;
  return data;
}
