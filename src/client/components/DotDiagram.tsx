import React, {useEffect, useState} from "react";

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
 * Usage:
 *   <DotDiagram source={`
 *     digraph {
 *       A -> B -> C
 *     }
 *   `} />
 */
export function DotDiagram({source, className}: DotDiagramProps) {
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {instance} = await import("@viz-js/viz");
        const viz = await instance();
        if (cancelled) return;
        const rendered = viz.renderString(source.trim(), {format: "svg"});
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) {
          console.error("Graphviz rendering error:", err);
          setSvg(`<pre class="observablehq--error">${String(err)}</pre>`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div
      className={`observablehq-dot ${className ?? ""}`}
      dangerouslySetInnerHTML={{__html: svg}}
    />
  );
}
