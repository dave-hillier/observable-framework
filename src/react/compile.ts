import type {MarkdownPage} from "../markdown.js";
import type {Params} from "../route.js";
import {compileCellToComponent, compileInlineCellToExpression} from "./cell-transform.js";

/**
 * Options for compiling a markdown page to React.
 */
export interface CompileOptions {
  /** Page path for import resolution */
  path: string;
  /** Route parameters */
  params?: Params;
  /** Import resolver */
  resolveImport?: (specifier: string) => string;
  /** File resolver */
  resolveFile?: (name: string) => string;
}

/**
 * Compiles a parsed MarkdownPage into a React component module.
 *
 * This is the core of the React port: it takes the same MarkdownPage AST
 * that Observable Framework produces from its markdown parser, and instead
 * of generating HTML with `define()` calls, it generates a React component
 * with hooks for reactivity.
 *
 * The output is a valid ES module that default-exports a React component.
 */
export function compileMarkdownToReact(page: MarkdownPage, options: CompileOptions): string {
  const {path, params, resolveImport = (s) => s, resolveFile = (s) => s} = options;
  const {code} = page;

  // Collect all cell analysis info
  const cellInfos = code.map(({id, node, mode}) => ({
    id,
    mode,
    declarations: node.declarations?.map((d) => d.name) ?? [],
    references: node.references.map((r) => r.name),
    expression: node.expression,
    async: node.async,
    source: node.input
  }));

  // Determine which variables are declared across all cells
  const allDeclarations = new Set(cellInfos.flatMap((c) => c.declarations));

  // Determine which built-in hooks are needed
  const needsWidth = cellInfos.some((c) => c.references.includes("width"));
  const needsDark = cellInfos.some((c) => c.references.includes("dark"));
  const needsNow = cellInfos.some((c) => c.references.includes("now"));

  // Build imports section
  const imports: string[] = [];
  imports.push(`import React, {useState, useMemo, useEffect, useCallback, useRef, Suspense} from "react";`);
  imports.push(`import {CellProvider, useCellOutput, useCellInput} from "@observablehq/framework/react/hooks";`);
  imports.push(`import {ErrorBoundary} from "@observablehq/framework/react/components";`);
  imports.push(`import {Loading} from "@observablehq/framework/react/components";`);

  if (needsWidth) imports.push(`import {useWidthRef} from "@observablehq/framework/react/hooks";`);
  if (needsDark) imports.push(`import {useDark} from "@observablehq/framework/react/hooks";`);
  if (needsNow) imports.push(`import {useNow} from "@observablehq/framework/react/hooks";`);

  // Collect imports from code cells
  const cellImports = collectCellImports(cellInfos, resolveImport);
  imports.push(...cellImports);

  // Build cell components
  const cellComponents: string[] = [];
  for (const cellInfo of cellInfos) {
    const cell = code.find((c) => c.id === cellInfo.id)!;
    if (cellInfo.mode === "inline") {
      // Inline expressions don't need separate components
      continue;
    }
    const component = compileCellToComponent(cell, {
      allDeclarations,
      resolveImport,
      resolveFile,
      path,
      params
    });
    cellComponents.push(component);
  }

  // Build the page body by replacing cell markers with React elements
  const pageBody = buildPageBody(page, cellInfos);

  // Build the page component
  const lines: string[] = [];
  lines.push(imports.join("\n"));
  lines.push("");

  // Add cell components
  for (const comp of cellComponents) {
    lines.push(comp);
    lines.push("");
  }

  // Page component
  lines.push(`export default function Page() {`);

  // Built-in reactive values
  if (needsWidth) lines.push(`  const [__mainRef, width] = useWidthRef();`);
  if (needsDark) lines.push(`  const dark = useDark();`);
  if (needsNow) lines.push(`  const now = useNow();`);

  // State declarations for all cell outputs
  for (const name of allDeclarations) {
    if (name === "width" || name === "dark" || name === "now") continue;
    lines.push(`  const [${name}, set_${name}] = useState(undefined);`);
  }

  lines.push("");
  lines.push(`  return (`);
  lines.push(`    <CellProvider>`);
  if (needsWidth) {
    lines.push(`      <div ref={__mainRef}>`);
  }
  lines.push(pageBody);
  if (needsWidth) {
    lines.push(`      </div>`);
  }
  lines.push(`    </CellProvider>`);
  lines.push(`  );`);
  lines.push(`}`);

  return lines.join("\n");
}

/**
 * Collects import statements from code cells and transforms them into
 * ES import declarations for the React module.
 */
function collectCellImports(
  cellInfos: Array<{source: string; references: string[]}>,
  resolveImport: (specifier: string) => string
): string[] {
  const imports: string[] = [];
  const seenSpecifiers = new Set<string>();

  for (const cell of cellInfos) {
    // Extract import declarations from cell source using regex
    // This is a simplified version; the full implementation would use the AST
    const importRegex = /import\s+(?:(\{[^}]+\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(\{[^}]+\}))?)\s+from\s+["']([^"']+)["']/g;
    let match;
    while ((match = importRegex.exec(cell.source)) !== null) {
      const specifier = match[3];
      if (!seenSpecifiers.has(specifier)) {
        seenSpecifiers.add(specifier);
        const resolved = resolveImport(specifier);
        // Reconstruct the import with resolved specifier
        const importStr = cell.source.slice(match.index, match.index + match[0].length)
          .replace(specifier, resolved);
        imports.push(importStr + ";");
      }
    }
  }

  return imports;
}

/**
 * Transforms the page HTML body, replacing Observable cell markers
 * (<!--:cellId:--> comments) with React component references.
 */
function buildPageBody(
  page: MarkdownPage,
  cellInfos: Array<{id: string; mode: string; expression: boolean; source: string; declarations: string[]; references: string[]}>
): string {
  let body = page.body;

  // Build a map of cell IDs to their component JSX
  for (const cell of cellInfos) {
    // Match the Observable cell pattern:
    // <div class="observablehq observablehq--block">
    //   <observablehq-loading></observablehq-loading>
    //   <!--:cellId:-->
    // </div>
    // or inline: <observablehq-loading></observablehq-loading><!--:cellId:-->

    if (cell.mode === "inline") {
      // Replace inline expression markers with JSX expression
      const inlineExpr = compileInlineCellToExpression(cell.source, cell.references);
      const pattern = new RegExp(
        `<observablehq-loading><\\/observablehq-loading><!--:${cell.id}:-->`,
        "g"
      );
      body = body.replace(pattern, `{/* inline cell ${cell.id} */}\n        {${inlineExpr}}`);
    } else {
      // Replace block cell markers with component references
      const blockPattern = new RegExp(
        `<div class="observablehq observablehq--block">[\\s\\S]*?<!--:${cell.id}:-->[\\s\\S]*?<\\/div>`,
        "g"
      );
      body = body.replace(blockPattern, `{/* cell ${cell.id} */}\n        <ErrorBoundary><Suspense fallback={<Loading />}><Cell_${cell.id} /></Suspense></ErrorBoundary>`);
    }
  }

  // Convert HTML to JSX-compatible format
  body = htmlToJsx(body);

  // Wrap in a fragment
  return `        <>\n${body
    .split("\n")
    .map((line) => `          ${line}`)
    .join("\n")}\n        </>`;
}

/**
 * Basic HTML to JSX transformation.
 * Handles the most common attribute differences.
 */
function htmlToJsx(html: string): string {
  return html
    .replace(/\bclass=/g, "className=")
    .replace(/\bfor=/g, "htmlFor=")
    .replace(/\btabindex=/g, "tabIndex=")
    .replace(/\bstroke-width=/g, "strokeWidth=")
    .replace(/\bfill-opacity=/g, "fillOpacity=")
    .replace(/\bstroke-dasharray=/g, "strokeDasharray=")
    .replace(/\bclip-path=/g, "clipPath=")
    .replace(/\bfont-size=/g, "fontSize=")
    .replace(/\btext-anchor=/g, "textAnchor=")
    .replace(/<br\s*>/g, "<br />")
    .replace(/<hr\s*>/g, "<hr />")
    .replace(/<img\s([^>]*)>/g, "<img $1 />")
    .replace(/<input\s([^>]*)>/g, "<input $1 />");
}
