import React, {useEffect, useRef, useState} from "react";

export interface TexMathProps {
  /** LaTeX source string */
  source: string;
  /** Whether this is display mode (block) or inline */
  display?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * React wrapper for KaTeX math rendering.
 * Lazily loads KaTeX and renders the math expression.
 *
 * KaTeX output is inserted via a ref to avoid dangerouslySetInnerHTML.
 * Errors are rendered as safe React text content.
 *
 * Usage:
 *   <TexMath source="E = mc^2" />
 *   <TexMath source="\sum_{i=1}^{n} x_i" display />
 */
export function TexMath({source, display = false, className}: TexMathProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const katex = (await import("katex")).default;
      if (cancelled) return;

      try {
        const rendered = katex.renderToString(source, {
          displayMode: display,
          throwOnError: false
        });
        if (!cancelled && containerRef.current) {
          setError(null);
          containerRef.current.innerHTML = rendered;
        }
      } catch (err) {
        if (!cancelled) {
          console.error("KaTeX rendering error:", err);
          setError(String(err));
          if (containerRef.current) containerRef.current.innerHTML = "";
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, display]);

  if (error) {
    const Tag = display ? "div" : "span";
    return (
      <Tag className={`observablehq-tex ${className ?? ""}`}>
        <span className="observablehq--error">{error}</span>
      </Tag>
    );
  }

  const Tag = display ? "div" : "span";
  return (
    <Tag
      ref={containerRef as React.RefObject<HTMLDivElement & HTMLSpanElement>}
      className={`observablehq-tex ${className ?? ""}`}
    />
  );
}
