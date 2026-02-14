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
 * Dispatch an event to all registered HMR listeners.
 */
function dispatchHmrEvent(event: string, data: unknown): void {
  const cbs = listeners.get(event);
  if (cbs) for (const cb of cbs) cb(data);
}

/**
 * Initialize HMR listeners if running in Vite dev mode.
 * This is called once at app startup.
 */
export function initHmr(): void {
  if (typeof window === "undefined") return;

  const hot = (import.meta as any).hot;
  if (!hot) return;

  // Listen for data loader changes and dispatch to subscribers
  hot.on("observable:file-change", (data: {path: string}) => {
    dispatchHmrEvent("file-change", data);
  });

  // Listen for config changes and dispatch to subscribers
  hot.on("observable:config-change", (data: unknown) => {
    dispatchHmrEvent("config-change", data);
  });
}

/**
 * Subscribe to file change events via the centralized listener system.
 * Used by useFileAttachment to invalidate cached data.
 * Returns an unsubscribe function.
 */
export function useHmrFileChange(callback: (path: string) => void): () => void {
  return onHmrEvent("file-change", (data) => {
    callback((data as {path: string}).path);
  });
}
