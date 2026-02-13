import type {Config} from "../config.js";

/**
 * Generates the HTML shell for a React page.
 * This replaces render.ts's renderPage() function for React mode.
 *
 * Instead of embedding define() calls in the HTML, this shell:
 * 1. Loads the React runtime
 * 2. Loads the compiled page component
 * 3. Hydrates the server-rendered HTML (SSG) or renders client-side
 */
export function generateReactPageShell(options: {
  title?: string;
  siteTitle?: string;
  stylesheets: string[];
  modulePreloads: string[];
  pageModulePath: string;
  bodyHtml?: string; // Pre-rendered HTML for SSG
  base?: string;
  isPreview?: boolean;
}): string {
  const {title, siteTitle, stylesheets, modulePreloads, pageModulePath, bodyHtml, base = "/", isPreview} = options;

  const fullTitle = [title, siteTitle].filter(Boolean).join(" | ");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
${fullTitle ? `<title>${escapeHtml(fullTitle)}</title>` : ""}
${stylesheets.map((href) => `<link rel="stylesheet" type="text/css" href="${escapeHtml(href)}">`).join("\n")}
${modulePreloads.map((href) => `<link rel="modulepreload" href="${escapeHtml(href)}">`).join("\n")}
</head>
<body>
<div id="observablehq-root">${bodyHtml ?? ""}</div>
<script type="module">
import React from "${base}_observablehq/react.js";
import ReactDOM from "${base}_observablehq/react-dom.js";
import {App} from "${base}_observablehq/framework-react.js";
import Page from "${escapeJs(pageModulePath)}";

const root = document.getElementById("observablehq-root");
${bodyHtml ? "ReactDOM.hydrateRoot(root, React.createElement(Page));" : "ReactDOM.createRoot(root).render(React.createElement(Page));"}
${isPreview ? `
// HMR support
if (import.meta.hot) {
  import.meta.hot.accept("${escapeJs(pageModulePath)}", (mod) => {
    // React Fast Refresh handles component updates
  });
}
` : ""}
</script>
</body>
</html>`;
}

/**
 * Generates a Vite entry point module that sets up the React app
 * with routing for all pages.
 */
export function generateAppEntryModule(config: Config, routes: Array<{path: string; modulePath: string; title?: string}>): string {
  const lines: string[] = [];

  lines.push(`import React from "react";`);
  lines.push(`import ReactDOM from "react-dom/client";`);
  lines.push(`import {App} from "@observablehq/framework/react/components";`);
  lines.push(``);

  // Generate route definitions with lazy imports
  lines.push(`const routes = [`);
  for (const route of routes) {
    lines.push(`  {`);
    lines.push(`    path: ${JSON.stringify(route.path)},`);
    if (route.title) lines.push(`    title: ${JSON.stringify(route.title)},`);
    lines.push(`    component: () => import(${JSON.stringify(route.modulePath)}),`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);

  // App config from observablehq.config
  lines.push(`const config = {`);
  lines.push(`  title: ${JSON.stringify(config.title ?? "")},`);
  lines.push(`  sidebar: ${JSON.stringify(config.sidebar ?? true)},`);
  lines.push(`  search: ${JSON.stringify(!!config.search)},`);
  lines.push(`  pages: ${JSON.stringify(config.pages)},`);
  lines.push(`};`);
  lines.push(``);

  // Mount the app
  lines.push(`const root = ReactDOM.createRoot(document.getElementById("observablehq-root"));`);
  lines.push(`root.render(React.createElement(App, {config, routes}));`);

  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
