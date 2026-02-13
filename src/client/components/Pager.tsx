import React from "react";

export interface PagerLink {
  name: string;
  path: string;
}

export interface PagerProps {
  /** Previous page link */
  prev?: PagerLink | null;
  /** Next page link */
  next?: PagerLink | null;
  /** Called when a link is clicked (for client-side navigation) */
  onNavigate?: (path: string) => void;
}

/**
 * Previous/next page navigation component.
 * Replaces Observable's server-rendered pager in the footer.
 */
export function Pager({prev, next, onNavigate}: PagerProps) {
  if (!prev && !next) return null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(path);
    }
  };

  return (
    <nav className="observablehq-pager">
      {prev && (
        <a rel="prev" href={prev.path} onClick={(e) => handleClick(e, prev.path)}>
          <span>{prev.name}</span>
        </a>
      )}
      {next && (
        <a rel="next" href={next.path} onClick={(e) => handleClick(e, next.path)}>
          <span>{next.name}</span>
        </a>
      )}
    </nav>
  );
}
