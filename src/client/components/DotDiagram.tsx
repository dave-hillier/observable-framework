import React, {useEffect, useRef, useState} from "react";

export interface DotDiagramProps {
  /** Graphviz DOT source code */
  source: string;
  /** CSS class name */
  className?: string;
}

/**
 * React wrapper for Graphviz DOT diagrams.
 * Lazily loads @viz-js/viz and renders the DOT graph.
 *
 * SVG output is inserted via a ref to avoid dangerouslySetInnerHTML.
 * Errors are rendered as safe React text content.
 *
 * Usage:
 *   <DotDiagram source={`
 *     digraph {
 *       A -> B -> C
 *     }
 *   `} />
 */
export function DotDiagram({source, className}: DotDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {instance} = await import("@viz-js/viz");
        const viz = await instance();
        if (cancelled) return;
        const rendered = viz.renderString(source.trim(), {format: "svg"});
        if (!cancelled && containerRef.current) {
          setError(null);
          containerRef.current.innerHTML = rendered;
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Graphviz rendering error:", err);
          setError(String(err));
          if (containerRef.current) containerRef.current.innerHTML = "";
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return (
      <div className={`observablehq-dot ${className ?? ""}`}>
        <pre className="observablehq--error">{error}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`observablehq-dot ${className ?? ""}`}
    />
  );
}
