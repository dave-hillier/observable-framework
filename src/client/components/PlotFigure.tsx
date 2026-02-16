import React, {useEffect, useRef} from "react";

/**
 * Props for the PlotFigure component.
 * The `options` prop accepts any Observable Plot options object.
 */
export interface PlotFigureProps {
  /** Observable Plot options (passed to Plot.plot()) */
  options: Record<string, unknown>;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * React wrapper for Observable Plot.
 * Renders an Observable Plot chart as a React component.
 *
 * Usage:
 *   import * as Plot from "@observablehq/plot";
 *
 *   <PlotFigure options={{
 *     marks: [Plot.dot(data, {x: "x", y: "y", fill: "category"})]
 *   }} />
 *
 * The component handles:
 * - Lazy loading of the @observablehq/plot library
 * - Cleanup of previous chart on re-render
 * - Proper DOM lifecycle management
 */
export function PlotFigure({options, className, style}: PlotFigureProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    (async () => {
      // Dynamically import Plot to keep it out of the main bundle
      const Plot = await import("@observablehq/plot");
      if (cancelled) return;

      const figure = Plot.plot(options);
      container.textContent = ""; // Clear previous content
      container.appendChild(figure);
    })();

    return () => {
      cancelled = true;
      if (container) container.textContent = "";
    };
  }, [options]);

  return <div ref={containerRef} className={`observablehq-plot ${className ?? ""}`} style={style} />;
}

/**
 * A responsive PlotFigure that automatically sets width based on container size.
 * Uses ResizeObserver to track container width and re-render the chart.
 */
export function ResponsivePlotFigure({options, className, style}: PlotFigureProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let currentFigure: Element | null = null;

    const render = async (width: number) => {
      if (cancelled || width <= 0) return;
      const Plot = await import("@observablehq/plot");
      if (cancelled) return;

      const figure = Plot.plot({...options, width});
      if (currentFigure) currentFigure.remove();
      container.appendChild(figure);
      currentFigure = figure;
    };

    const observer = new ResizeObserver(([entry]) => {
      render(entry.contentRect.width);
    });
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (currentFigure) currentFigure.remove();
    };
  }, [options]);

  return <div ref={containerRef} className={`observablehq-plot ${className ?? ""}`} style={style} />;
}
