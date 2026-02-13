import React, {Suspense, useRef} from "react";
import type {ReactNode} from "react";
import {CellProvider} from "../hooks/useCellContext.js";
import {ErrorBoundary} from "./ErrorBoundary.js";
import {Loading} from "./Loading.js";
import type {PagerLink} from "./Pager.js";
import {Pager} from "./Pager.js";
import type {SidebarItem} from "./Sidebar.js";
import {Sidebar} from "./Sidebar.js";
import {TableOfContents} from "./TableOfContents.js";

export interface PageLayoutProps {
  /** Page title (for document.title) */
  title?: string;
  /** Site title */
  siteTitle?: string;
  /** Whether to show the sidebar */
  sidebar?: boolean;
  /** Sidebar navigation items */
  pages?: SidebarItem[];
  /** Current page path */
  path?: string;
  /** Whether to show the table of contents */
  toc?: boolean | {show?: boolean; label?: string};
  /** Custom header content */
  header?: ReactNode;
  /** Custom footer content */
  footer?: ReactNode;
  /** Previous page for pager */
  prev?: PagerLink | null;
  /** Next page for pager */
  next?: PagerLink | null;
  /** Whether this is a draft page */
  draft?: boolean;
  /** Whether to show search */
  search?: boolean;
  /** Whether this page is in dark mode */
  dark?: boolean;
  /** Called when navigating via sidebar/pager */
  onNavigate?: (path: string) => void;
  /** Child content (the page body) */
  children: ReactNode;
}

/**
 * Top-level page layout component that provides:
 * - Sidebar navigation
 * - Table of contents
 * - Header and footer
 * - CellProvider for inter-cell communication
 * - Error boundaries
 * - Suspense boundaries for data loading
 *
 * This replaces the server-rendered HTML shell in Observable's render.ts.
 */
export function PageLayout({
  title,
  siteTitle,
  sidebar = true,
  pages = [],
  path = "/",
  toc = true,
  header,
  footer,
  prev,
  next,
  draft = false,
  search = false,
  onNavigate,
  children
}: PageLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);

  const tocConfig = typeof toc === "boolean" ? {show: toc, label: "Contents"} : {show: toc.show ?? true, label: toc.label ?? "Contents"};

  return (
    <>
      {sidebar && (
        <Sidebar
          title={siteTitle ?? "Home"}
          pages={pages}
          currentPath={path}
          search={search}
          onNavigate={onNavigate}
        />
      )}
      <div id="observablehq-center">
        {header && <header id="observablehq-header">{header}</header>}
        {tocConfig.show && <TableOfContents label={tocConfig.label} />}
        <main
          id="observablehq-main"
          ref={mainRef}
          className={`observablehq${draft ? " observablehq--draft" : ""}`}
        >
          <CellProvider>
            <ErrorBoundary>
              <Suspense fallback={<Loading />}>
                {children}
              </Suspense>
            </ErrorBoundary>
          </CellProvider>
        </main>
        <footer id="observablehq-footer">
          <Pager prev={prev} next={next} onNavigate={onNavigate} />
          {footer && <div>{footer}</div>}
        </footer>
      </div>
    </>
  );
}
