import {useEffect, useRef, useState} from "react";
import type {RefObject} from "react";

interface Size {
  width: number;
  height: number;
}

/**
 * Tracks the size of an element and provides width/height for responsive rendering.
 * Replaces Observable's `resize((width, height) => ...)` function.
 *
 * Usage:
 *   const [ref, width, height] = useResize();
 *   return <div ref={ref}><MyChart width={width} height={height} /></div>;
 *
 * Or with a render function:
 *   const [ref, element] = useResizeRender((width, height) =>
 *     Plot.plot({ width, height, marks: [...] })
 *   );
 */
export function useResize<T extends HTMLElement = HTMLDivElement>(): [RefObject<T | null>, number, number] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({width: 0, height: 0});

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect;
      setSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return {width, height};
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size.width, size.height];
}

/**
 * Resize hook with a render callback, matching Observable's resize() API more closely.
 *
 * Usage:
 *   const [ref, rendered] = useResizeRender((width, height) =>
 *     Plot.plot({width, height, marks: [Plot.dot(data, {x: "x", y: "y"})]})
 *   );
 *   return <div ref={ref}>{rendered}</div>;
 */
export function useResizeRender<T>(
  render: (width: number, height: number) => T
): [RefObject<HTMLDivElement | null>, T | null] {
  const [ref, width, height] = useResize<HTMLDivElement>();

  // Only render when we have a non-zero size
  const rendered = width > 0 && height > 0 ? render(width, height) : null;

  return [ref, rendered];
}
