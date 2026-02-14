import type {Config, Page, Section} from "../config.js";
import {mergeToc} from "../config.js";
import type {MarkdownPage} from "../markdown.js";
import type {PageLink} from "../pager.js";
import {findLink} from "../pager.js";
import type {Resolvers} from "../resolvers.js";
import {getResolvers} from "../resolvers.js";
import {compileMarkdownToReact} from "./compile.js";
import {generateReactPageShell} from "./page-template.js";
import type {AppConfig, RouteDefinition} from "../client/components/App.js";
import type {SidebarItem, SidebarPage, SidebarSection} from "../client/components/Sidebar.js";

export interface ReactRenderOptions extends Config {
  root: string;
  path: string;
  resolvers?: Resolvers;
}

type ReactRenderInternalOptions =
  | {preview?: false} // build
  | {preview: true}; // preview

/**
 * Renders a parsed MarkdownPage as a React single-page application.
 * This is the React equivalent of renderPage() in render.ts.
 *
 * Instead of embedding Observable Runtime define() calls, it:
 * 1. Compiles the markdown to a React component module
 * 2. Wraps it in an HTML shell that loads React + the App component
 * 3. Provides config to the App for sidebar, TOC, pager, etc.
 */
export async function renderReactPage(
  page: MarkdownPage,
  options: ReactRenderOptions & ReactRenderInternalOptions
): Promise<{html: string; pageModule: string}> {
  const {data} = page;
  const {base, path, title, preview} = options;
  const {loaders, resolvers = await getResolvers(page, options)} = options;
  const {draft = false, sidebar = options.sidebar} = data;
  const toc = mergeToc(data.toc, options.toc);
  const {resolveImport, resolveFile, resolveStylesheet, stylesheets, staticImports} = resolvers;

  // Compile the markdown page to a React component module
  const pageModule = compileMarkdownToReact(page, {
    path,
    params: undefined,
    resolveImport,
    resolveFile
  });

  // Build the page module path that will be served by the dev server
  const pageModulePath = `/_observablehq/react-pages${path}.js`;

  // Convert config pages to sidebar format for the App shell
  const appConfig = configToAppConfig(options);

  // Compute pager links
  const link = options.pager ? findLink(path, options) : null;
  const prev = link?.prev ? {name: link.prev.name, path: link.prev.path} : null;
  const next = link?.next ? {name: link.next.name, path: link.next.path} : null;

  // Collect stylesheets
  const resolvedStylesheets = Array.from(new Set(Array.from(stylesheets, resolveStylesheet)));

  // Collect module preloads
  const modulePreloads = Array.from(
    new Set(Array.from(staticImports, resolveImport).filter((s) => s.endsWith(".js")))
  );

  const shell = generateReactPageShell({
    title: page.title ?? undefined,
    siteTitle: title,
    stylesheets: resolvedStylesheets,
    modulePreloads,
    pageModulePath,
    base,
    isPreview: preview,
    hash: resolvers.hash,
    head: page.head ?? undefined
  });

  return {html: shell, pageModule};
}

/**
 * Generates a compiled React page module for a given path.
 * Used by the dev server to serve individual page modules on-demand.
 */
export async function renderReactPageModule(
  page: MarkdownPage,
  options: ReactRenderOptions
): Promise<string> {
  const {path} = options;
  const {resolvers = await getResolvers(page, options)} = options;
  const {resolveImport, resolveFile} = resolvers;

  return compileMarkdownToReact(page, {
    path,
    params: undefined,
    resolveImport,
    resolveFile
  });
}

/**
 * Convert Observable Framework Config to React AppConfig.
 * Maps the config's pages/sections structure to the format
 * expected by the App and Sidebar React components.
 */
export function configToAppConfig(config: Config): AppConfig {
  return {
    title: config.title,
    pages: configPagesToSidebarItems(config.pages),
    sidebar: config.sidebar,
    search: !!config.search,
    toc: config.toc,
    pager: config.pager,
    base: config.base
  };
}

/**
 * Convert Observable config pages array to SidebarItem[] format.
 */
function configPagesToSidebarItems(pages: (Page | Section<Page>)[]): SidebarItem[] {
  return pages.map((item): SidebarItem => {
    if ("pages" in item) {
      // It's a section
      return {
        name: item.name,
        path: item.path,
        collapsible: item.collapsible,
        open: item.open,
        pages: item.pages.map(pageToSidebarPage)
      } as SidebarSection;
    }
    return pageToSidebarPage(item);
  });
}

function pageToSidebarPage(page: Page): SidebarPage {
  return {name: page.name, path: page.path};
}

/**
 * Generate route definitions from the config's page list.
 * Each route maps a URL path to a lazy-loadable page module.
 */
export function generateRouteDefinitions(
  config: Config,
  options: {base?: string; moduleBasePath?: string} = {}
): RouteDefinition[] {
  const {moduleBasePath = "/_observablehq/react-pages"} = options;
  const routes: RouteDefinition[] = [];
  const allPages = flattenPages(config.pages);

  // Always include the index page
  routes.push({
    path: "/",
    title: config.title ?? "Home",
    component: () => import(`${moduleBasePath}/index.js`) as any,
    prev: null,
    next: allPages.length > 0 ? {name: allPages[0].name, path: allPages[0].path} : null
  });

  // Add routes for all configured pages
  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i];
    const prev = i === 0 ? {name: config.title ?? "Home", path: "/"} : {name: allPages[i - 1].name, path: allPages[i - 1].path};
    const next = i < allPages.length - 1 ? {name: allPages[i + 1].name, path: allPages[i + 1].path} : null;

    routes.push({
      path: page.path,
      title: page.name,
      component: () => import(`${moduleBasePath}${page.path}.js`) as any,
      prev,
      next
    });
  }

  return routes;
}

/**
 * Generate route definitions as a JavaScript module string.
 * This produces code that can be embedded in the app entry point.
 */
export function generateRouteDefinitionsModule(
  config: Config,
  options: {moduleBasePath?: string} = {}
): string {
  const {moduleBasePath = "/_observablehq/react-pages"} = options;
  const allPages = flattenPages(config.pages);
  const lines: string[] = [];

  lines.push(`export const routes = [`);

  // Index page
  lines.push(`  {`);
  lines.push(`    path: "/",`);
  lines.push(`    title: ${JSON.stringify(config.title ?? "Home")},`);
  lines.push(`    component: () => import(${JSON.stringify(`${moduleBasePath}/index.js`)}),`);
  lines.push(`    prev: null,`);
  if (allPages.length > 0) {
    lines.push(`    next: ${JSON.stringify({name: allPages[0].name, path: allPages[0].path})},`);
  } else {
    lines.push(`    next: null,`);
  }
  lines.push(`  },`);

  // All other pages
  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i];
    const prev = i === 0 ? {name: config.title ?? "Home", path: "/"} : {name: allPages[i - 1].name, path: allPages[i - 1].path};
    const next = i < allPages.length - 1 ? {name: allPages[i + 1].name, path: allPages[i + 1].path} : null;

    lines.push(`  {`);
    lines.push(`    path: ${JSON.stringify(page.path)},`);
    lines.push(`    title: ${JSON.stringify(page.name)},`);
    lines.push(`    component: () => import(${JSON.stringify(`${moduleBasePath}${page.path}.js`)}),`);
    lines.push(`    prev: ${JSON.stringify(prev)},`);
    lines.push(`    next: ${JSON.stringify(next)},`);
    lines.push(`  },`);
  }

  lines.push(`];`);
  return lines.join("\n");
}

/**
 * Flatten the pages config (which may contain sections) into a flat list.
 */
function flattenPages(pages: (Page | Section<Page>)[]): Page[] {
  const result: Page[] = [];
  for (const item of pages) {
    if ("pages" in item) {
      // Section with a path gets included as a page too
      if (item.path !== null) {
        result.push({name: item.name, path: item.path, pager: item.pager});
      }
      for (const page of item.pages) {
        result.push(page);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}
