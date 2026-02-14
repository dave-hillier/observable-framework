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

  // Remove empty paragraphs and excessive whitespace
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/\n{3,}/g, "\n\n");

  return html.trim();
}
