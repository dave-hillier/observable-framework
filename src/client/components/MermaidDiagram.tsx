import React, {useEffect, useId, useRef, useState} from "react";

export interface MermaidDiagramProps {
  /** Mermaid diagram source code */
  source: string;
  /** CSS class name */
  className?: string;
}

/**
 * React wrapper for Mermaid diagrams.
 * Lazily loads the mermaid library and renders the diagram.
 *
 * SVG output is inserted via a ref to avoid dangerouslySetInnerHTML.
 * Errors are rendered as safe React text content.
 *
 * Usage:
 *   <MermaidDiagram source={`
 *     graph TD
 *       A --> B
 *       B --> C
 *   `} />
 */
export function MermaidDiagram({source, className}: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/:/g, "-");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({startOnLoad: false, theme: "default"});
      if (cancelled) return;

      try {
        const {svg: rendered} = await mermaid.render(`mermaid-${id}`, source.trim());
        if (!cancelled && containerRef.current) {
          setError(null);
          containerRef.current.innerHTML = rendered;
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Mermaid rendering error:", err);
          setError(String(err));
          if (containerRef.current) containerRef.current.innerHTML = "";
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, id]);

  if (error) {
    return (
      <div className={`observablehq-mermaid ${className ?? ""}`}>
        <pre className="observablehq--error">{error}</pre>
      </div>
    );
  }

  return <div ref={containerRef} className={`observablehq-mermaid ${className ?? ""}`} />;
}
