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
 * Usage:
 *   <MermaidDiagram source={`
 *     graph TD
 *       A --> B
 *       B --> C
 *   `} />
 */
export function MermaidDiagram({source, className}: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const id = useId().replace(/:/g, "-");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({startOnLoad: false, theme: "default"});
      if (cancelled) return;

      try {
        const {svg: rendered} = await mermaid.render(`mermaid-${id}`, source.trim());
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) {
          console.error("Mermaid rendering error:", err);
          setSvg(`<pre class="observablehq--error">${String(err)}</pre>`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, id]);

  return (
    <div
      ref={containerRef}
      className={`observablehq-mermaid ${className ?? ""}`}
      dangerouslySetInnerHTML={{__html: svg}}
    />
  );
}
