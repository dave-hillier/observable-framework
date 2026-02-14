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

  // Remove Observable cell markers: <!--:cellId:--> through the next cell boundary
  // These are block-level comments that delimit code cells
  html = html.replace(/<!--:[^:]+:-->\s*<div[^>]*class="observablehq[^"]*"[^>]*>[\s\S]*?<\/div>/g, "");

  // Remove remaining cell markers that may not have a corresponding div
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
  try {
    // Dynamically import ReactDOMServer — this keeps it out of the client bundle
    const {renderToString} = await import("react-dom/server");
    const React = await import("react");

    // Create a temporary module from the compiled code.
    // Use a data URI to avoid writing a temp file.
    const blob = new Blob([pageModuleCode], {type: "text/javascript"});
    const url = URL.createObjectURL(blob);
    try {
      const mod = await import(/* @vite-ignore */ url);
      const PageComponent = mod.default;
      if (typeof PageComponent === "function") {
        return renderToString(React.createElement(PageComponent));
      }
    } catch {
      // Module execution failed (browser APIs, etc.) — fall back
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // ReactDOMServer not available — fall back
  }
  return extractStaticHtml(page);
}
