import React, {useEffect, useState} from "react";

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
 * Usage:
 *   <TexMath source="E = mc^2" />
 *   <TexMath source="\sum_{i=1}^{n} x_i" display />
 */
export function TexMath({source, display = false, className}: TexMathProps) {
  const [html, setHtml] = useState<string>("");

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
        if (!cancelled) setHtml(rendered);
      } catch (err) {
        if (!cancelled) {
          console.error("KaTeX rendering error:", err);
          setHtml(`<span class="observablehq--error">${String(err)}</span>`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, display]);

  const Tag = display ? "div" : "span";
  return (
    <Tag
      className={`observablehq-tex ${className ?? ""}`}
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
}
