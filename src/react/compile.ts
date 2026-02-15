import type {MarkdownPage} from "../markdown.js";
import type {Params} from "../route.js";
import {compileCellToComponent, compileInlineCellToExpression} from "./cell-transform.js";

/**
 * Metadata for a file referenced by the page, used for registerFile() calls.
 */
export interface FileRegistration {
  name: string;
  mimeType?: string;
  path: string;
  lastModified?: number;
  size?: number;
}

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
  /** File metadata for registerFile() calls in the compiled module */
  files?: FileRegistration[];
  /** SQL table registrations from front-matter: {tableName: source} */
  sql?: Record<string, string>;
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
  const {path, params, resolveImport = (s) => s, resolveFile = (s) => s, files = [], sql = {}} = options;
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

  // Resolve framework import specifiers through the resolver so they point to
  // the bundled framework-react module in production builds.
  const hooksSpec = resolveImport("@observablehq/framework/react/hooks");
  const componentsSpec = resolveImport("@observablehq/framework/react/components");
  const reactSpec = resolveImport("npm:react");

  // Build imports section
  const imports: string[] = [];
  imports.push(`import React, {useState, useMemo, useEffect, useCallback, useRef, Suspense} from ${JSON.stringify(reactSpec)};`);
  imports.push(`import {CellProvider, useCellOutput, useCellInput} from ${JSON.stringify(hooksSpec)};`);
  imports.push(`import {ErrorBoundary} from ${JSON.stringify(componentsSpec)};`);
  imports.push(`import {Loading} from ${JSON.stringify(componentsSpec)};`);

  const hasSql = Object.keys(sql).length > 0;

  if (needsWidth) imports.push(`import {useWidthRef} from ${JSON.stringify(hooksSpec)};`);
  if (needsDark) imports.push(`import {useDark} from ${JSON.stringify(hooksSpec)};`);
  if (needsNow) imports.push(`import {useNow} from ${JSON.stringify(hooksSpec)};`);
  if (hasSql) imports.push(`import {DuckDBProvider} from ${JSON.stringify(componentsSpec)};`);

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
  const {body: pageBody, inlineComponents} = buildPageBody(page, cellInfos, importOnlyCellIds, allDeclarations);

  // Build the page component
  const lines: string[] = [];
  lines.push(imports.join("\n"));
  lines.push("");

  // Emit file registration calls so FileAttachment() resolves correctly
  if (files.length > 0) {
    lines.push(`import {registerFile} from ${JSON.stringify(hooksSpec)};`);
    for (const file of files) {
      lines.push(`registerFile(${JSON.stringify(file.name)}, ${JSON.stringify({name: file.name, mimeType: file.mimeType, path: file.path, lastModified: file.lastModified, size: file.size})});`);
    }
    lines.push("");
  }

  // Add cell components
  for (const comp of cellComponents) {
    lines.push(comp);
    lines.push("");
  }

  // Add inline expression components (for reactive ${...} in markdown)
  for (const comp of inlineComponents) {
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
  if (hasSql) {
    lines.push(`      <DuckDBProvider tables={${JSON.stringify(sql)}}>`);
  }
  if (needsWidth) {
    lines.push(`      <div ref={__mainRef}>`);
  }
  lines.push(pageBody);
  if (needsWidth) {
    lines.push(`      </div>`);
  }
  if (hasSql) {
    lines.push(`      </DuckDBProvider>`);
  }
  lines.push(`    </CellProvider>`);
  lines.push(`  );`);
  lines.push(`}`);

  return lines.join("\n");
}

/**
 * Collects import statements from code cells using the parsed AST import info.
 * Merges bindings from the same specifier across different cells so that
 * e.g. `import {foo} from "d3"` in one cell and `import {bar} from "d3"` in
 * another produce a single `import {foo, bar} from "d3"` statement.
 */
function collectCellImports(
  code: MarkdownPage["code"],
  resolveImport: (specifier: string) => string
): string[] {
  // Track per-specifier: default import name, namespace import, named bindings
  const specifierInfo = new Map<
    string,
    {defaultImport: string | null; namespace: string | null; named: Set<string>}
  >();

  for (const cell of code) {
    for (const imp of cell.node.imports) {
      if (imp.method !== "static") continue;

      if (!specifierInfo.has(imp.name)) {
        specifierInfo.set(imp.name, {defaultImport: null, namespace: null, named: new Set()});
      }
      const info = specifierInfo.get(imp.name)!;

      // Extract binding info from the import statement text
      const importRegex = new RegExp(
        `import\\s+(.+?)\\s+from\\s+["']${escapeRegex(imp.name)}["']`
      );
      const match = importRegex.exec(cell.node.input);
      if (!match) continue;

      const clause = match[1].trim();

      // Namespace import: import * as X from "..."
      const nsMatch = clause.match(/^\*\s+as\s+(\w+)$/);
      if (nsMatch) {
        info.namespace = nsMatch[1];
        continue;
      }

      // Parse default and named parts
      // Patterns: "X", "{ a, b }", "X, { a, b }"
      const parts = clause.match(/^(\w+)?(?:\s*,\s*)?\{([^}]*)\}$/);
      if (parts) {
        if (parts[1]) info.defaultImport = parts[1];
        if (parts[2]) {
          for (const binding of parts[2].split(",")) {
            const trimmed = binding.trim();
            if (trimmed) info.named.add(trimmed);
          }
        }
      } else if (/^\w+$/.test(clause)) {
        // Default-only import: import X from "..."
        info.defaultImport = clause;
      }
    }
  }

  // Build merged import statements
  const imports: string[] = [];
  for (const [specifier, info] of specifierInfo) {
    const resolved = resolveImport(specifier);
    // Namespace import supersedes named imports
    if (info.namespace) {
      const parts = info.defaultImport ? `${info.defaultImport}, * as ${info.namespace}` : `* as ${info.namespace}`;
      imports.push(`import ${parts} from ${JSON.stringify(resolved)};`);
    } else {
      const parts: string[] = [];
      if (info.defaultImport) parts.push(info.defaultImport);
      if (info.named.size > 0) parts.push(`{${Array.from(info.named).join(", ")}}`);
      if (parts.length > 0) {
        imports.push(`import ${parts.join(", ")} from ${JSON.stringify(resolved)};`);
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
  importOnlyCellIds: Set<string>,
  allDeclarations: Set<string>
): {body: string; inlineComponents: string[]} {
  let body = page.body;
  const inlineComponents: string[] = [];

  for (const cell of cellInfos) {
    if (cell.mode === "inline") {
      // Replace inline expression markers with JSX expression
      const inlineExpr = compileInlineCellToExpression(cell.source, cell.references, allDeclarations);
      const pattern = new RegExp(
        `<observablehq-loading><\\/observablehq-loading><!--:${cell.id}:-->`,
        "g"
      );
      // Check if this is a reactive inline expression (contains cell variable references)
      const inlineMatch = inlineExpr.match(/^__INLINE_CELL__:(.*?):__EXPR__([\s\S]*)__END__$/);
      if (inlineMatch) {
        const refs = JSON.parse(inlineMatch[1]) as string[];
        const expr = inlineMatch[2];
        // Generate an inline component that reads cell values
        const componentName = `Inline_${cell.id}`;
        inlineComponents.push(
          `function ${componentName}() {\n` +
          refs.map((r) => `  const ${r} = useCellInput(${JSON.stringify(r)});`).join("\n") +
          `\n  return <>{${expr}}</>;\n}`
        );
        body = body.replace(pattern, `<${componentName} />`);
      } else {
        body = body.replace(pattern, `{${inlineExpr}}`);
      }
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
  const wrappedBody = `        <>\n${body
    .split("\n")
    .map((line) => `          ${line}`)
    .join("\n")}\n        </>`;
  return {body: wrappedBody, inlineComponents};
}

/**
 * Convert an inline CSS style string to a JSX style object literal.
 * e.g., "color: red; font-size: 14px" → '{color: "red", fontSize: "14px"}'
 */
function cssStringToJsxObject(css: string): string {
  const props = css
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((decl) => {
      const colon = decl.indexOf(":");
      if (colon === -1) return null;
      const prop = decl.slice(0, colon).trim();
      const value = decl.slice(colon + 1).trim();
      // Convert kebab-case to camelCase
      const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return `${camelProp}: ${JSON.stringify(value)}`;
    })
    .filter(Boolean);
  return `{${props.join(", ")}}`;
}

/**
 * HTML to JSX transformation.
 * Handles attribute renames, void element self-closing, inline style
 * conversion, and HTML comment stripping.
 */
function htmlToJsx(html: string): string {
  return (
    html
      // Strip HTML comments (cell markers are already replaced before this runs)
      .replace(/<!--(?!:)[^]*?-->/g, "")

      // --- HTML attribute renames ---
      .replace(/\bclass=/g, "className=")
      .replace(/\bfor=/g, "htmlFor=")
      .replace(/\btabindex=/g, "tabIndex=")
      .replace(/\bcolspan=/g, "colSpan=")
      .replace(/\browspan=/g, "rowSpan=")
      .replace(/\bmaxlength=/g, "maxLength=")
      .replace(/\breadonly\b/g, "readOnly")
      .replace(/\bcrossorigin=/g, "crossOrigin=")
      .replace(/\bsrcset=/g, "srcSet=")
      .replace(/\bcellpadding=/g, "cellPadding=")
      .replace(/\bcellspacing=/g, "cellSpacing=")
      .replace(/\bdatetime=/g, "dateTime=")
      .replace(/\baccesskey=/g, "accessKey=")
      .replace(/\bautocomplete=/g, "autoComplete=")

      // --- SVG attribute renames ---
      .replace(/\bstroke-width=/g, "strokeWidth=")
      .replace(/\bstroke-linecap=/g, "strokeLinecap=")
      .replace(/\bstroke-linejoin=/g, "strokeLinejoin=")
      .replace(/\bstroke-opacity=/g, "strokeOpacity=")
      .replace(/\bstroke-miterlimit=/g, "strokeMiterlimit=")
      .replace(/\bstroke-dasharray=/g, "strokeDasharray=")
      .replace(/\bstroke-dashoffset=/g, "strokeDashoffset=")
      .replace(/\bfill-opacity=/g, "fillOpacity=")
      .replace(/\bfill-rule=/g, "fillRule=")
      .replace(/\bclip-path=/g, "clipPath=")
      .replace(/\bclip-rule=/g, "clipRule=")
      .replace(/\bfont-size=/g, "fontSize=")
      .replace(/\bfont-family=/g, "fontFamily=")
      .replace(/\bfont-weight=/g, "fontWeight=")
      .replace(/\btext-anchor=/g, "textAnchor=")
      .replace(/\bdominant-baseline=/g, "dominantBaseline=")
      .replace(/\balignment-baseline=/g, "alignmentBaseline=")
      .replace(/\bcolor-interpolation-filters=/g, "colorInterpolationFilters=")
      .replace(/\bmarker-start=/g, "markerStart=")
      .replace(/\bmarker-mid=/g, "markerMid=")
      .replace(/\bmarker-end=/g, "markerEnd=")
      .replace(/\bxlink:href=/g, "xlinkHref=")

      // --- Inline style string → JSX style object ---
      .replace(/\bstyle="([^"]*)"/g, (_match, css: string) => `style={${cssStringToJsxObject(css)}}`)

      // --- Void element self-closing ---
      .replace(/<br\s*>/g, "<br />")
      .replace(/<hr\s*>/g, "<hr />")
      .replace(/<img\s([^>]*)>/g, "<img $1 />")
      .replace(/<input\s([^>]*)>/g, "<input $1 />")
      .replace(/<source\s([^>]*)>/g, "<source $1 />")
      .replace(/<col\s([^>]*)>/g, "<col $1 />")
      .replace(/<area\s([^>]*)>/g, "<area $1 />")
      .replace(/<embed\s([^>]*)>/g, "<embed $1 />")
      .replace(/<track\s([^>]*)>/g, "<track $1 />")
      .replace(/<wbr\s*>/g, "<wbr />")
      .replace(/<link\s([^>]*)>/g, "<link $1 />")
      .replace(/<meta\s([^>]*)>/g, "<meta $1 />")
  );
}
