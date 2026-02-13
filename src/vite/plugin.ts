import {readFile} from "node:fs/promises";
import {join, relative} from "node:path";
import type {Plugin} from "vite";
import type {Config} from "../config.js";
import {LoaderResolver} from "../loader.js";
import {createMarkdownIt, parseMarkdown} from "../markdown.js";
import {compileMarkdownToReact} from "../react/compile.js";

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
  const md = createMarkdownIt();

  return {
    name: "observable-framework",
    enforce: "pre",

    configResolved(config) {
      // Initialize the loader resolver
      const rootDir = join(config.root, root);
      loaders = new LoaderResolver({root: rootDir});
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
     */
    handleHotUpdate({file, server}) {
      if (file.endsWith(".md")) {
        // Invalidate the module and trigger a full update
        const module = server.moduleGraph.getModuleById(file);
        if (module) {
          server.moduleGraph.invalidateModule(module);
          return [module];
        }
      }
    }
  };
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
