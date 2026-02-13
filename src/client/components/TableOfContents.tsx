import React, {useCallback, useEffect, useState} from "react";

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export interface TableOfContentsProps {
  /** Label for the TOC */
  label?: string;
  /** CSS selector for headers to include */
  selector?: string;
  /** CSS class name */
  className?: string;
}

const DEFAULT_SELECTOR = "h1:not(:first-of-type)[id], h2:first-child[id], :not(h1) + h2[id]";

/**
 * Table of contents component with scroll-spy.
 * Replaces Observable's server-rendered TOC with client-side interactivity.
 */
export function TableOfContents({
  label = "Contents",
  selector = DEFAULT_SELECTOR,
  className
}: TableOfContentsProps) {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Build TOC entries from headings in the main content
  useEffect(() => {
    const main = document.querySelector("#observablehq-main");
    if (!main) return;

    const headings = main.querySelectorAll(selector);
    const tocEntries: TocEntry[] = Array.from(headings)
      .map((el) => ({
        id: el.id,
        text: el.textContent ?? "",
        level: parseInt(el.tagName.substring(1), 10)
      }))
      .filter((e) => e.text && e.id);

    setEntries(tocEntries);
  }, [selector]);

  // Scroll spy: track which heading is currently visible
  useEffect(() => {
    if (entries.length === 0) return;

    const observer = new IntersectionObserver(
      (intersections) => {
        for (const {target, isIntersecting} of intersections) {
          if (isIntersecting) {
            setActiveId(target.id);
          }
        }
      },
      {rootMargin: "-80px 0px -80% 0px"}
    );

    for (const entry of entries) {
      const el = document.getElementById(entry.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [entries]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({behavior: "smooth", block: "start"});
      history.pushState(null, "", `#${id}`);
    }
  }, []);

  if (entries.length === 0) return null;

  return (
    <aside id="observablehq-toc" className={className} data-selector={selector}>
      <nav>
        <div>{label}</div>
        <ol>
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`observablehq-secondary-link${activeId === entry.id ? " observablehq-link-active" : ""}`}
            >
              <a href={`#${entry.id}`} onClick={(e) => handleClick(e, entry.id)}>
                {entry.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
