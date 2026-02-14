import {readFile} from "node:fs/promises";
import {join, relative} from "node:path";
import type {Plugin} from "vite";
import type {Config} from "../config.js";
import {LoaderResolver} from "../loader.js";
import {createMarkdownIt, parseMarkdown} from "../markdown.js";
import {compileMarkdownToReact} from "../react/compile.js";
import {configToAppConfig, generateRouteDefinitionsModule} from "../react/render.js";
import {generateAppEntryModule} from "../react/page-template.js";

/**
 * Virtual module IDs used by the plugin.
 */
const VIRTUAL_APP_ENTRY = "virtual:observable-app-entry";
const VIRTUAL_ROUTES = "virtual:observable-routes";
const VIRTUAL_CONFIG = "virtual:observable-config";
const RESOLVED_VIRTUAL_PREFIX = "\0";

/**
 * Options for the Observable Framework Vite plugin.
 */
export interface ObservablePluginOptions {
  /** Observable Framework configuration */
  config?: Config;
  /** Root directory for source files */
  root?: string;
}

/**
 * Vite plugin that transforms Observable Framework markdown files into React components.
 *
 * This plugin:
 * 1. Intercepts .md file imports and transforms them to React component modules
 * 2. Serves data loader outputs via the dev server
 * 3. Handles file attachment resolution
 * 4. Supports HMR for markdown file changes
 * 5. Provides virtual modules for app entry, routes, and config
 *
 * Usage in vite.config.ts:
 *   import {observablePlugin} from "@observablehq/framework/vite";
 *   export default defineConfig({
 *     plugins: [react(), observablePlugin({root: "src"})]
 *   });
 */
export function observablePlugin(options: ObservablePluginOptions = {}): Plugin {
  const {root = "src"} = options;
  let loaders: LoaderResolver;
  let fwConfig: Config | undefined = options.config;
  const md = createMarkdownIt();

  return {
    name: "observable-framework",
    enforce: "pre",

    configResolved(config) {
      // Initialize the loader resolver
      const rootDir = join(config.root, root);
      loaders = new LoaderResolver({root: rootDir});
    },

    /**
     * Resolve virtual module IDs.
     */
    resolveId(id) {
      if (id === VIRTUAL_APP_ENTRY || id === VIRTUAL_ROUTES || id === VIRTUAL_CONFIG) {
        return RESOLVED_VIRTUAL_PREFIX + id;
      }
    },

    /**
     * Load virtual modules.
     */
    load(id) {
      if (id === RESOLVED_VIRTUAL_PREFIX + VIRTUAL_CONFIG) {
        if (!fwConfig) return `export const config = {};`;
        const appConfig = configToAppConfig(fwConfig);
        return `export const config = ${JSON.stringify(appConfig)};`;
      }

      if (id === RESOLVED_VIRTUAL_PREFIX + VIRTUAL_ROUTES) {
        if (!fwConfig) return `export const routes = [];`;
        return generateRouteDefinitionsModule(fwConfig, {
          moduleBasePath: `./${root}`
        });
      }

      if (id === RESOLVED_VIRTUAL_PREFIX + VIRTUAL_APP_ENTRY) {
        if (!fwConfig) {
          return `
import React from "react";
import ReactDOM from "react-dom/client";
const root = ReactDOM.createRoot(document.getElementById("observablehq-root"));
root.render(React.createElement("div", null, "No config provided"));`;
        }
        // Collect routes from config pages
        const routes = collectRoutes(fwConfig, root);
        return generateAppEntryModule(fwConfig, routes);
      }
    },

    configureServer(srv) {
      // Serve data loader outputs
      srv.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();

        // Handle /_file/ requests (data loader outputs)
        if (req.url.startsWith("/_file/")) {
          const filePath = req.url.slice("/_file/".length).split("?")[0];
          try {
            const loader = loaders.find(filePath);
            if (loader) {
              // Loader.load() returns the output file path as a string
              const outputPath = await loader.load();
              const content = await readFile(outputPath);
              res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Cache-Control": "no-cache"
              });
              res.end(content);
              return;
            }
          } catch (err) {
            console.error(`Failed to load file: ${filePath}`, err);
          }
          return next();
        }

        next();
      });

      // Watch for data loader changes and trigger HMR
      srv.watcher.on("change", (file) => {
        const rel = relative(join(srv.config.root, root), file);
        if (isDataLoader(rel)) {
          // Send custom HMR event for data loader changes
          srv.ws.send({
            type: "custom",
            event: "observable:file-change",
            data: {path: rel}
          });
        }
      });
    },

    /**
     * Transform .md files into React component modules.
     * This is the core transformation that replaces Observable's
     * HTML + define() output with React components.
     */
    async transform(code, id) {
      if (!id.endsWith(".md")) return;

      // Only transform files within the source root
      const rootDir = join(process.cwd(), root);
      const relPath = relative(rootDir, id);
      if (relPath.startsWith("..")) return;

      try {
        // Parse the markdown (reuses Observable's existing parser)
        const page = parseMarkdown(code, {
          md,
          path: `/${relPath.replace(/\.md$/, "")}`
        });

        // Compile to React component
        const reactCode = compileMarkdownToReact(page, {
          path: `/${relPath.replace(/\.md$/, "")}`,
          resolveImport: (spec) => {
            // In dev mode, let Vite handle import resolution
            if (spec.startsWith("npm:")) return spec.slice(4);
            if (spec.startsWith("observablehq:")) return `@observablehq/framework/${spec.slice(13)}`;
            return spec;
          },
          resolveFile: (name) => `/_file/${name}`
        });

        return {
          code: reactCode,
          map: null // TODO: source maps
        };
      } catch (err) {
        console.error(`Failed to compile ${id}:`, err);
        // Return an error component
        return {
          code: `
import React from "react";
export default function ErrorPage() {
  return React.createElement("div", {className: "observablehq--error"},
    React.createElement("h1", null, "Compilation Error"),
    React.createElement("pre", null, ${JSON.stringify(String(err))})
  );
}`,
          map: null
        };
      }
    },

    /**
     * Handle HMR for markdown files.
     * Invalidates both the changed module and any virtual route modules
     * that reference it.
     */
    handleHotUpdate({file, server, modules}) {
      if (file.endsWith(".md")) {
        // Invalidate the changed markdown module
        const module = server.moduleGraph.getModuleById(file);
        if (module) {
          server.moduleGraph.invalidateModule(module);
        }

        // Also invalidate the routes virtual module so lazy imports pick up changes
        const routesModule = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_PREFIX + VIRTUAL_ROUTES);
        if (routesModule) {
          server.moduleGraph.invalidateModule(routesModule);
        }

        return modules;
      }
    }
  };
}

/**
 * Collect route definitions from config pages for the app entry module.
 */
function collectRoutes(config: Config, root: string): Array<{path: string; modulePath: string; title?: string}> {
  const routes: Array<{path: string; modulePath: string; title?: string}> = [];

  // Index page
  routes.push({
    path: "/",
    modulePath: `./${root}/index.md`,
    title: config.title ?? "Home"
  });

  // Flatten pages from config
  for (const item of config.pages) {
    if ("pages" in item) {
      // Section
      if (item.path !== null) {
        routes.push({
          path: item.path,
          modulePath: `./${root}${item.path}.md`,
          title: item.name
        });
      }
      for (const page of item.pages) {
        routes.push({
          path: page.path,
          modulePath: `./${root}${page.path}.md`,
          title: page.name
        });
      }
    } else {
      routes.push({
        path: item.path,
        modulePath: `./${root}${item.path}.md`,
        title: item.name
      });
    }
  }

  return routes;
}

/**
 * Check if a file path looks like a data loader.
 * Data loaders have double extensions like data.csv.py, data.json.js
 */
function isDataLoader(path: string): boolean {
  const parts = path.split(".");
  if (parts.length < 3) return false;
  const ext = parts[parts.length - 1];
  return ["js", "ts", "py", "r", "R", "sh", "exe"].includes(ext);
}
