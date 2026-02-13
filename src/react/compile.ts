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
    mode: mode as "inline" | "block" | "jsx",
    declarations: node.declarations?.map((d) => d.name) ?? [],
    references: node.references.map((r) => r.name),
    expression: node.expression,
    async: node.async,
    source: node.input,
    imports: node.imports
  }));

  // Identify import-only cells (cells that are purely import declarations)
  const isImportOnly = (cell: (typeof cellInfos)[0]): boolean => {
    if (cell.imports.length === 0) return false;
    // Check if the source only contains import statements (no other code)
    const withoutImports = cell.source
      .replace(/import\s+(?:(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*\{[^}]+\})?)\s+from\s+["'][^"']+["']\s*;?/g, "")
      .trim();
    return withoutImports === "";
  };

  // Determine which variables are declared across all cells (excluding import-only)
  const allDeclarations = new Set(
    cellInfos.filter((c) => !isImportOnly(c)).flatMap((c) => c.declarations)
  );

  // Determine which built-in hooks are needed
  const needsWidth = cellInfos.some((c) => c.references.includes("width"));
  const needsDark = cellInfos.some((c) => c.references.includes("dark"));
  const needsNow = cellInfos.some((c) => c.references.includes("now"));
  const needsDisplay = cellInfos.some((c) => c.references.includes("display"));
  const needsView = cellInfos.some((c) => c.references.includes("view"));

  // Build imports section
  const imports: string[] = [];
  imports.push(`import React, {useState, useMemo, useEffect, useCallback, useRef, Suspense} from "react";`);
  imports.push(`import {CellProvider, useCellOutput, useCellInput} from "@observablehq/framework/react/hooks";`);
  imports.push(`import {ErrorBoundary} from "@observablehq/framework/react/components";`);
  imports.push(`import {Loading} from "@observablehq/framework/react/components";`);

  if (needsWidth) imports.push(`import {useWidthRef} from "@observablehq/framework/react/hooks";`);
  if (needsDark) imports.push(`import {useDark} from "@observablehq/framework/react/hooks";`);
  if (needsNow) imports.push(`import {useNow} from "@observablehq/framework/react/hooks";`);

  // Collect imports from code cells using the AST (not regex)
  const cellImportStatements = collectCellImports(code, resolveImport);
  imports.push(...cellImportStatements);

  // Identify which cells are import-only
  const importOnlyCellIds = new Set(cellInfos.filter((c) => isImportOnly(c)).map((c) => c.id));

  // Build cell components (skip import-only and inline cells)
  const cellComponents: string[] = [];
  for (const cellInfo of cellInfos) {
    if (cellInfo.mode === "inline") continue;
    if (importOnlyCellIds.has(cellInfo.id)) continue;

    const cell = code.find((c) => c.id === cellInfo.id)!;
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
  const pageBody = buildPageBody(page, cellInfos, importOnlyCellIds);

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
  if (needsDisplay || needsView) {
    // suppress lint: these are used implicitly in compiled cell code
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
 * Collects import statements from code cells using the parsed AST import info.
 * Extracts the import source text and resolves specifiers.
 */
function collectCellImports(
  code: MarkdownPage["code"],
  resolveImport: (specifier: string) => string
): string[] {
  const imports: string[] = [];
  const seenSpecifiers = new Set<string>();

  for (const cell of code) {
    for (const imp of cell.node.imports) {
      if (imp.method !== "static") continue;
      if (seenSpecifiers.has(imp.name)) continue;
      seenSpecifiers.add(imp.name);

      const resolved = resolveImport(imp.name);
      // Extract the actual import statement from the cell source
      const importRegex = new RegExp(
        `import\\s+(?:(?:\\{[^}]+\\}|\\*\\s+as\\s+\\w+|\\w+)(?:\\s*,\\s*\\{[^}]+\\})?)\\s+from\\s+["']${escapeRegex(imp.name)}["']`,
        "g"
      );
      const match = importRegex.exec(cell.node.input);
      if (match) {
        const importStr = match[0].replace(imp.name, resolved);
        imports.push(importStr + ";");
      }
    }
  }

  return imports;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Transforms the page HTML body, replacing Observable cell markers
 * (<!--:cellId:--> comments) with React component references.
 */
function buildPageBody(
  page: MarkdownPage,
  cellInfos: {id: string; mode: string; expression: boolean; source: string; declarations: string[]; references: string[]}[],
  importOnlyCellIds: Set<string>
): string {
  let body = page.body;

  for (const cell of cellInfos) {
    if (cell.mode === "inline") {
      // Replace inline expression markers with JSX expression
      const inlineExpr = compileInlineCellToExpression(cell.source, cell.references);
      const pattern = new RegExp(
        `<observablehq-loading><\\/observablehq-loading><!--:${cell.id}:-->`,
        "g"
      );
      body = body.replace(pattern, `{${inlineExpr}}`);
    } else if (importOnlyCellIds.has(cell.id)) {
      // Import-only cells: remove the entire block div
      const blockPattern = new RegExp(
        `<div className="observablehq observablehq--block">[\\s\\S]*?<!--:${cell.id}:-->[\\s\\S]*?<\\/div>`,
        "g"
      );
      body = body.replace(blockPattern, "");
      // Also try the original class= form (before htmlToJsx)
      const blockPatternOrig = new RegExp(
        `<div class="observablehq observablehq--block">[\\s\\S]*?<!--:${cell.id}:-->[\\s\\S]*?<\\/div>`,
        "g"
      );
      body = body.replace(blockPatternOrig, "");
    } else {
      // Replace block cell markers with component references.
      // Two patterns: with loading indicator (expression cells) and without (declaration cells)
      const blockPattern = new RegExp(
        `<div class="observablehq observablehq--block">[\\s\\S]*?<!--:${cell.id}:-->[\\s\\S]*?<\\/div>`,
        "g"
      );
      body = body.replace(
        blockPattern,
        `<ErrorBoundary><Suspense fallback={<Loading />}><Cell_${cell.id} /></Suspense></ErrorBoundary>`
      );
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
