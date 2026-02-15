import {writeFile, unlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {MarkdownPage} from "../markdown.js";

/**
 * Extract static HTML from a parsed markdown page for SSG.
 * Strips Observable cell markers and JavaScript-dependent content,
 * leaving only the static HTML body for initial paint and SEO.
 *
 * This is used as the `bodyHtml` parameter in generateReactPageShell()
 * so that the page renders meaningful content before React hydrates.
 */
export function extractStaticHtml(page: MarkdownPage): string {
  let html = page.body;

  // Remove Observable cell block divs (which contain cell markers inside them).
  // The actual HTML structure places <!--:cellId:--> inside the div, not before it.
  html = html.replace(/<div[^>]*class="observablehq[^"]*"[^>]*>[\s\S]*?<\/div>/g, "");

  // Remove any remaining cell markers not inside a div
  html = html.replace(/<!--:[^:]+:-->/g, "");

  // Remove loading indicators that won't render without JS
  html = html.replace(/<observablehq-loading>[\s\S]*?<\/observablehq-loading>/g, "");

  // Remove empty paragraphs and excessive whitespace
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/\n{3,}/g, "\n\n");

  return html.trim();
}

/**
 * Render a compiled React page module to an HTML string using ReactDOMServer.
 * This provides full server-side rendering for React components.
 *
 * Falls back to extractStaticHtml if the page module cannot be rendered
 * (e.g. when it has side effects that require a browser environment).
 */
export async function renderPageToString(
  pageModuleCode: string,
  page: MarkdownPage
): Promise<string> {
  let tempPath: string | undefined;
  try {
    // Dynamically import ReactDOMServer — this keeps it out of the client bundle
    const {renderToString} = await import("react-dom/server");
    const React = await import("react");

    // Write to a temp file so Node.js can import it as an ES module.
    tempPath = join(tmpdir(), `observable-ssr-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
    await writeFile(tempPath, pageModuleCode);
    try {
      const mod = await import(/* @vite-ignore */ tempPath);
      const PageComponent = mod.default;
      if (typeof PageComponent === "function") {
        return renderToString(React.createElement(PageComponent));
      }
    } catch {
      // Module execution failed (browser APIs, etc.) — fall back
    }
  } catch {
    // ReactDOMServer not available — fall back
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
  return extractStaticHtml(page);
}
