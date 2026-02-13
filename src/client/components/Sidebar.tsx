import React, {useCallback, useEffect, useState} from "react";

export interface SidebarPage {
  name: string;
  path: string;
}

export interface SidebarSection {
  name: string;
  path?: string | null;
  collapsible?: boolean;
  open?: boolean;
  pages: SidebarPage[];
}

export type SidebarItem = SidebarPage | SidebarSection;

function isSection(item: SidebarItem): item is SidebarSection {
  return "pages" in item;
}

export interface SidebarProps {
  /** Site title / home link text */
  title?: string;
  /** Navigation items */
  pages: SidebarItem[];
  /** Current page path */
  currentPath: string;
  /** Base URL */
  base?: string;
  /** Whether search is enabled */
  search?: boolean;
  /** Called when a link is clicked (for client-side navigation) */
  onNavigate?: (path: string) => void;
  /** CSS class name */
  className?: string;
}

/**
 * Sidebar navigation component.
 * Replaces the server-rendered sidebar HTML in Observable Framework.
 */
export function Sidebar({
  title = "Home",
  pages,
  currentPath,
  base = "/",
  search = false,
  onNavigate,
  className
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Close sidebar on navigation
  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
      if (onNavigate) {
        e.preventDefault();
        onNavigate(path);
      }
    },
    [onNavigate]
  );

  const normalizePath = (path: string) => {
    return path.replace(/\/(index)?$/, "") || "/index";
  };

  const isActive = (path: string) => {
    return normalizePath(path) === normalizePath(currentPath);
  };

  const isSectionActive = (section: SidebarSection) => {
    return (
      section.pages.some((p) => isActive(p.path)) ||
      (section.path != null && isActive(section.path))
    );
  };

  return (
    <>
      <input
        id="observablehq-sidebar-toggle"
        type="checkbox"
        title="Toggle sidebar"
        checked={open}
        onChange={(e) => setOpen(e.target.checked)}
      />
      <label id="observablehq-sidebar-backdrop" htmlFor="observablehq-sidebar-toggle" />
      <nav id="observablehq-sidebar" className={className}>
        <ol>
          <label id="observablehq-sidebar-close" htmlFor="observablehq-sidebar-toggle" />
          <li className={`observablehq-link${isActive("/") ? " observablehq-link-active" : ""}`}>
            <a href={base} onClick={(e) => handleClick(e, "/")}>
              {title}
            </a>
          </li>
        </ol>

        {search && (
          <div id="observablehq-search">
            <input
              type="search"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {pages.map((item, i) => {
          if (isSection(item)) {
            const SectionTag = item.collapsible ? "details" : "section";
            const sectionActive = isSectionActive(item);

            return (
              <SectionTag
                key={i}
                className={sectionActive ? "observablehq-section-active" : undefined}
                {...(item.collapsible && (item.open || sectionActive) ? {open: true} : {})}
              >
                {item.collapsible ? (
                  <summary
                    className={`observablehq-link${
                      item.path != null && isActive(item.path) ? " observablehq-link-active" : ""
                    }`}
                  >
                    {item.path != null ? (
                      <a href={item.path} onClick={(e) => handleClick(e, item.path!)}>
                        {item.name}
                      </a>
                    ) : (
                      item.name
                    )}
                  </summary>
                ) : (
                  <div className="observablehq-section-header">{item.name}</div>
                )}
                <ol>
                  {item.pages.map((page, j) => (
                    <SidebarLink
                      key={j}
                      page={page}
                      active={isActive(page.path)}
                      onClick={handleClick}
                    />
                  ))}
                </ol>
              </SectionTag>
            );
          } else {
            return (
              <ol key={i}>
                <SidebarLink page={item} active={isActive(item.path)} onClick={handleClick} />
              </ol>
            );
          }
        })}
      </nav>
    </>
  );
}

function SidebarLink({
  page,
  active,
  onClick
}: {
  page: SidebarPage;
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  const external = /^https?:\/\//.test(page.path);
  return (
    <li className={`observablehq-link${active ? " observablehq-link-active" : ""}`}>
      <a
        href={page.path}
        onClick={external ? undefined : (e) => onClick(e, page.path)}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {external ? <span>{page.name}</span> : page.name}
      </a>
    </li>
  );
}
