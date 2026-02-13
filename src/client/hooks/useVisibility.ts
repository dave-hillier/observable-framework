import {useEffect, useState} from "react";
import type {RefObject} from "react";

/**
 * Tracks whether the referenced element is visible in the viewport
 * using IntersectionObserver.
 * Replaces Observable's `visibility()` promise pattern.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   const visible = useVisibility(ref);
 *   // Lazy-load expensive content only when visible
 */
export function useVisibility(ref: RefObject<HTMLElement | null>, options?: IntersectionObserverInit): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      options
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, options?.threshold, options?.rootMargin]);
  return visible;
}

/**
 * Returns a promise that resolves when the element becomes visible.
 * This is a closer match to Observable's `visibility()` which returns
 * a one-shot promise.
 */
export function useVisibilityPromise(ref: RefObject<HTMLElement | null>): Promise<void> {
  return new Promise((resolve) => {
    const el = ref.current;
    if (!el) {
      resolve();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(el);
  });
}
