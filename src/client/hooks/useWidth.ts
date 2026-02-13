import {useEffect, useRef, useState} from "react";
import type {RefObject} from "react";

/**
 * Reactively tracks the content width of the referenced element.
 * Replaces Observable's `width` generator which used ResizeObserver internally.
 *
 * Usage:
 *   const ref = useRef<HTMLElement>(null);
 *   const width = useWidth(ref);
 */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentBoxSize) {
        // contentBoxSize is an array in the spec; use the first entry
        const boxSize = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
        setWidth(boxSize.inlineSize);
      } else {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Convenience hook that creates its own ref. Returns [ref, width].
 * Attach the ref to the element you want to measure.
 */
export function useWidthRef<T extends HTMLElement = HTMLDivElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const width = useWidth(ref);
  return [ref, width];
}
