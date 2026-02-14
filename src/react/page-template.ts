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
  hash?: string; // Content hash for HMR change detection
  reactBootstrapPath?: string; // Resolved (hashed) path for build mode
  reactDomBootstrapPath?: string; // Resolved (hashed) path for build mode
  frameworkReactPath?: string; // Resolved (hashed) path for build mode
  head?: string; // Custom head content from config/page (analytics, fonts, etc.)
  strict?: boolean; // Enable React.StrictMode wrapper
}): string {
  const {title, siteTitle, stylesheets, modulePreloads, pageModulePath, bodyHtml, base = "/", isPreview, head, strict = false} = options;
  const reactBootstrap = options.reactBootstrapPath ?? `${base}_observablehq/react-bootstrap.js`;
  const reactDomBootstrap = options.reactDomBootstrapPath ?? `${base}_observablehq/react-dom-bootstrap.js`;
  const frameworkReact = options.frameworkReactPath ?? `${base}_observablehq/framework-react.js`;

  const fullTitle = [title, siteTitle].filter(Boolean).join(" | ");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
${fullTitle ? `<title>${escapeHtml(fullTitle)}</title>` : ""}
${stylesheets.map((href) => `<link rel="stylesheet" type="text/css" href="${escapeHtml(href)}">`).join("\n")}
${modulePreloads.map((href) => `<link rel="modulepreload" href="${escapeHtml(href)}">`).join("\n")}
${head ?? ""}
</head>
<body>
<div id="observablehq-root">${bodyHtml ?? ""}</div>
<script type="module">
import React from "${escapeJs(reactBootstrap)}";
import ReactDOM from "${escapeJs(reactDomBootstrap)}";
import {App} from "${escapeJs(frameworkReact)}";
import Page from "${escapeJs(pageModulePath)}";

const container = document.getElementById("observablehq-root");
const pageElement = ${strict ? "React.createElement(React.StrictMode, null, React.createElement(Page))" : "React.createElement(Page)"};
const reactRoot = ${bodyHtml ? "ReactDOM.hydrateRoot(container, pageElement);" : "ReactDOM.createRoot(container);"}
${bodyHtml ? "" : "reactRoot.render(pageElement);"}
${isPreview ? `
// --- React Preview HMR ---
(async function() {
  const {registerFile} = await import("${escapeJs(frameworkReact)}");
  let currentHash = ${JSON.stringify(options.hash ?? "")};
  let pageModuleUrl = "${escapeJs(pageModulePath)}";
  let reopenDelay = 1000;
  const maxDelay = 30000;

  function connect() {
    const ws = new WebSocket(
      Object.assign(new URL("/_observablehq", location.href), {
        protocol: location.protocol === "https:" ? "wss" : "ws"
      })
    );
    ws.onopen = () => {
      reopenDelay = 1000;
      ws.send(JSON.stringify({type: "hello", path: location.pathname, hash: currentHash}));
    };
    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case "welcome":
          break;
        case "reload":
          location.reload();
          break;
        case "react-update": {
          if (message.hash?.previous && message.hash.previous !== currentHash) {
            location.reload();
            break;
          }
          currentHash = message.hash?.current ?? currentHash;
          // Update file registrations in-place
          if (message.files) {
            for (const name of message.files.removed ?? []) registerFile(name, null);
            for (const file of message.files.added ?? []) registerFile(file.name, file);
          }
          // Update stylesheets
          if (message.stylesheets) {
            if (message.stylesheets.added?.length === 1 && message.stylesheets.removed?.length === 1) {
              const link = document.head.querySelector('link[rel="stylesheet"][href="' + message.stylesheets.removed[0] + '"]');
              if (link) link.href = message.stylesheets.added[0];
            } else {
              for (const href of message.stylesheets.added ?? []) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.type = "text/css";
                link.href = href;
                document.head.appendChild(link);
              }
              for (const href of message.stylesheets.removed ?? []) {
                document.head.querySelector('link[rel="stylesheet"][href="' + href + '"]')?.remove();
              }
            }
          }
          // Re-import the page module if content changed
          if (message.pageChanged) {
            try {
              const mod = await import(pageModuleUrl + "?t=" + Date.now());
              const NewPage = mod.default;
              if (NewPage) reactRoot.render(${strict ? "React.createElement(React.StrictMode, null, React.createElement(NewPage))" : "React.createElement(NewPage)"});
            } catch (e) {
              console.error("HMR page reload failed:", e);
              location.reload();
            }
          }
          break;
        }
      }
    };
    ws.onclose = () => {
      reopenDelay = Math.min(maxDelay, reopenDelay * 1.5);
      setTimeout(connect, reopenDelay);
    };
  }
  connect();
})();
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
