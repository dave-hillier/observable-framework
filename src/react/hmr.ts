/**
 * Client-side HMR utilities for React mode.
 *
 * When running in Vite dev mode, this module provides hooks into
 * Vite's HMR system for:
 * - File attachment invalidation (when data loaders re-run)
 * - Page-level state preservation during edits
 * - Custom Observable-specific HMR events
 */

type HmrCallback = (data: unknown) => void;
const listeners = new Map<string, Set<HmrCallback>>();

/**
 * Subscribe to a custom Observable HMR event.
 * Returns an unsubscribe function.
 */
export function onHmrEvent(event: string, callback: HmrCallback): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(callback);
  return () => listeners.get(event)?.delete(callback);
}

/**
 * Initialize HMR listeners if running in Vite dev mode.
 * This is called once at app startup.
 */
export function initHmr(): void {
  if (typeof window === "undefined") return;

  const hot = (import.meta as any).hot;
  if (!hot) return;

  // Listen for data loader changes
  hot.on("observable:file-change", (data: {path: string}) => {
    const cbs = listeners.get("file-change");
    if (cbs) for (const cb of cbs) cb(data);
  });

  // Listen for config changes
  hot.on("observable:config-change", (data: unknown) => {
    const cbs = listeners.get("config-change");
    if (cbs) for (const cb of cbs) cb(data);
  });
}

/**
 * Hook for React components to subscribe to file changes.
 * Used by useFileAttachment to invalidate cached data.
 */
export function useHmrFileChange(callback: (path: string) => void): void {
  if (typeof window === "undefined") return;
  // Use import.meta.hot if available
  const hot = (import.meta as any).hot;
  if (!hot) return;

  hot.on("observable:file-change", (data: {path: string}) => {
    callback(data.path);
  });
}
