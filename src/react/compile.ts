import type {Node as AcornNode, ImportDeclaration, Program} from "acorn";
import {simple} from "acorn-walk";
import {JSDOM} from "jsdom";
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
    const original = code.find((c) => c.id === cell.id);
    if (!original || original.node.expression) return false;
    const program = original.node.body as Program;
    return program.body.every((stmt) => stmt.type === "ImportDeclaration");
  };

  // Determine which variables are declared across all cells (excluding import-only)
  const allDeclarations = new Set(cellInfos.filter((c) => !isImportOnly(c)).flatMap((c) => c.declarations));

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
  imports.push(
    `import React, {useState, useMemo, useEffect, useCallback, useRef, Suspense} from ${JSON.stringify(reactSpec)};`
  );
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
      lines.push(
        `registerFile(${JSON.stringify(file.name)}, ${JSON.stringify({
          name: file.name,
          mimeType: file.mimeType,
          path: file.path,
          lastModified: file.lastModified,
          size: file.size
        })});`
      );
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
  lines.push("export default function Page() {");

  // Built-in reactive values
  if (needsWidth) lines.push("  const [__mainRef, width] = useWidthRef();");
  if (needsDark) lines.push("  const dark = useDark();");
  if (needsNow) lines.push("  const now = useNow();");
  if (needsDisplay || needsView) {
    // suppress lint: these are used implicitly in compiled cell code
  }

  lines.push("");
  lines.push("  return (");
  lines.push("    <CellProvider>");
  if (hasSql) {
    lines.push(`      <DuckDBProvider tables={${JSON.stringify(sql)}}>`);
  }
  if (needsWidth) {
    lines.push("      <div ref={__mainRef}>");
  }
  lines.push(pageBody);
  if (needsWidth) {
    lines.push("      </div>");
  }
  if (hasSql) {
    lines.push("      </DuckDBProvider>");
  }
  lines.push("    </CellProvider>");
  lines.push("  );");
  lines.push("}");

  return lines.join("\n");
}

/**
 * Collects import statements from code cells using each cell's acorn AST.
 * Merges bindings from the same specifier across cells so that
 * `import {foo} from "d3"` in one cell and `import {bar} from "d3"` in another
 * produce a single `import {foo, bar} from "d3"`. Aliases are preserved; a
 * namespace import supersedes named imports from the same specifier.
 */
function collectCellImports(code: MarkdownPage["code"], resolveImport: (specifier: string) => string): string[] {
  interface SpecifierInfo {
    defaultImport: string | null;
    namespace: string | null;
    named: Map<string, string>;
  }
  const specifierInfo = new Map<string, SpecifierInfo>();

  function info(name: string): SpecifierInfo {
    let entry = specifierInfo.get(name);
    if (!entry) specifierInfo.set(name, (entry = {defaultImport: null, namespace: null, named: new Map()}));
    return entry;
  }

  for (const cell of code) {
    if (cell.node.expression) continue; // expressions can't contain ImportDeclarations
    simple(cell.node.body as AcornNode, {
      ImportDeclaration(node: ImportDeclaration) {
        const source = node.source;
        if (!source || typeof source.value !== "string") return;
        const entry = info(source.value);
        for (const spec of node.specifiers) {
          if (spec.type === "ImportDefaultSpecifier") {
            entry.defaultImport = spec.local.name;
          } else if (spec.type === "ImportNamespaceSpecifier") {
            entry.namespace = spec.local.name;
          } else if (spec.type === "ImportSpecifier") {
            const imported =
              spec.imported.type === "Identifier"
                ? spec.imported.name
                : String((spec.imported as {value: string}).value);
            entry.named.set(spec.local.name, imported);
          }
        }
      }
    });
  }

  const imports: string[] = [];
  for (const [specifier, entry] of specifierInfo) {
    const resolved = resolveImport(specifier);
    if (entry.namespace) {
      const head = entry.defaultImport ? `${entry.defaultImport}, * as ${entry.namespace}` : `* as ${entry.namespace}`;
      imports.push(`import ${head} from ${JSON.stringify(resolved)};`);
    } else {
      const parts: string[] = [];
      if (entry.defaultImport) parts.push(entry.defaultImport);
      if (entry.named.size > 0) {
        const bindings: string[] = [];
        for (const [local, imported] of entry.named) {
          bindings.push(local === imported ? local : `${imported} as ${local}`);
        }
        parts.push(`{${bindings.join(", ")}}`);
      }
      if (parts.length > 0) imports.push(`import ${parts.join(", ")} from ${JSON.stringify(resolved)};`);
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
  cellInfos: {
    id: string;
    mode: string;
    expression: boolean;
    source: string;
    declarations: string[];
    references: string[];
  }[],
  importOnlyCellIds: Set<string>,
  allDeclarations: Set<string>
): {body: string; inlineComponents: string[]} {
  const inlineComponents: string[] = [];
  const cellInfoById = new Map(cellInfos.map((c) => [c.id, c]));

  // Pre-build the inline cell JSX (component or expression) so the walker can
  // emit it when it sees the inline-cell node sequence.
  const inlineCellJsx = new Map<string, string>();
  for (const cell of cellInfos) {
    if (cell.mode !== "inline") continue;
    const inlineExpr = compileInlineCellToExpression(cell.source, cell.references, allDeclarations);
    const inlineMatch = inlineExpr.match(/^__INLINE_CELL__:(.*?):__EXPR__([\s\S]*)__END__$/);
    if (inlineMatch) {
      const refs = JSON.parse(inlineMatch[1]) as string[];
      const expr = inlineMatch[2];
      const componentName = `Inline_${cell.id}`;
      inlineComponents.push(
        `function ${componentName}() {\n` +
          refs.map((r) => `  const ${r} = useCellInput(${JSON.stringify(r)});`).join("\n") +
          `\n  return <>{${expr}}</>;\n}`
      );
      inlineCellJsx.set(cell.id, `<${componentName} />`);
    } else {
      inlineCellJsx.set(cell.id, `{${inlineExpr}}`);
    }
  }

  const dom = new JSDOM(`<!doctype html><body>${page.body}</body>`);
  const body = dom.window.document.body;
  const out = serializeChildrenToJsx(body, {cellInfoById, importOnlyCellIds, inlineCellJsx});

  const wrappedBody = `        <>\n${out
    .split("\n")
    .map((line) => `          ${line}`)
    .join("\n")}\n        </>`;
  return {body: wrappedBody, inlineComponents};
}

interface JsxWalkContext {
  cellInfoById: Map<string, {id: string; mode: string}>;
  importOnlyCellIds: Set<string>;
  inlineCellJsx: Map<string, string>;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

const ATTR_RENAMES: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  colspan: "colSpan",
  rowspan: "rowSpan",
  maxlength: "maxLength",
  readonly: "readOnly",
  crossorigin: "crossOrigin",
  srcset: "srcSet",
  cellpadding: "cellPadding",
  cellspacing: "cellSpacing",
  datetime: "dateTime",
  accesskey: "accessKey",
  autocomplete: "autoComplete",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-opacity": "strokeOpacity",
  "stroke-miterlimit": "strokeMiterlimit",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  "font-size": "fontSize",
  "font-family": "fontFamily",
  "font-weight": "fontWeight",
  "text-anchor": "textAnchor",
  "dominant-baseline": "dominantBaseline",
  "alignment-baseline": "alignmentBaseline",
  "color-interpolation-filters": "colorInterpolationFilters",
  "marker-start": "markerStart",
  "marker-mid": "markerMid",
  "marker-end": "markerEnd",
  "xlink:href": "xlinkHref"
};

function parseCellMarker(comment: Comment): string | null {
  const data = comment.data;
  if (data.length < 3 || data[0] !== ":" || data[data.length - 1] !== ":") return null;
  return data.slice(1, -1);
}

function cellPlaceholderJsx(cellId: string, ctx: JsxWalkContext): string {
  const info = ctx.cellInfoById.get(cellId);
  if (!info) return ""; // unknown id (defensive)
  if (info.mode === "inline") return ctx.inlineCellJsx.get(cellId) ?? "";
  if (ctx.importOnlyCellIds.has(cellId)) return "";
  return `<ErrorBoundary><Suspense fallback={<Loading />}><Cell_${cellId} /></Suspense></ErrorBoundary>`;
}

function isObservableBlockDiv(el: Element): boolean {
  if (el.tagName.toLowerCase() !== "div") return false;
  const cls = el.getAttribute("class") ?? "";
  return /\bobservablehq--block\b/.test(cls);
}

function findCellMarkerInDescendants(el: Element): string | null {
  const w = el.ownerDocument!.createTreeWalker(el, 0x80 /* SHOW_COMMENT */);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const id = parseCellMarker(n as Comment);
    if (id) return id;
  }
  return null;
}

function findInlineLoadingPair(el: Element): string | null {
  if (el.tagName.toLowerCase() !== "observablehq-loading") return null;
  const next = el.nextSibling;
  if (next && next.nodeType === 8 /* COMMENT */) {
    return parseCellMarker(next as Comment);
  }
  return null;
}

function serializeChildrenToJsx(parent: Node, ctx: JsxWalkContext): string {
  let out = "";
  let child: ChildNode | null = (parent as ParentNode).firstChild as ChildNode | null;
  while (child) {
    const next: ChildNode | null = child.nextSibling as ChildNode | null;
    out += serializeNodeToJsx(child, ctx, () => {
      // skip-next callback used by inline-loading consumer
      // advance `next` past the consumed comment
    });
    // Inline-loading consumes its trailing comment sibling: detect that case
    // by checking whether the just-emitted node was an observablehq-loading
    // immediately followed by a cell-marker comment.
    if (
      child.nodeType === 1 &&
      (child as Element).tagName.toLowerCase() === "observablehq-loading" &&
      next &&
      next.nodeType === 8 &&
      parseCellMarker(next as Comment)
    ) {
      child = next.nextSibling as ChildNode | null;
    } else {
      child = next;
    }
  }
  return out;
}

function serializeNodeToJsx(node: Node, ctx: JsxWalkContext, _skipNext: () => void): string {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return jsxText((node as Text).data);
  }
  if (node.nodeType === 8 /* COMMENT_NODE */) {
    const id = parseCellMarker(node as Comment);
    if (id) return cellPlaceholderJsx(id, ctx);
    return ""; // strip non-marker comments
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return "";

  const el = node as Element;

  // observablehq-loading paired with a marker comment → inline cell jsx
  const inlineId = findInlineLoadingPair(el);
  if (inlineId) {
    return cellPlaceholderJsx(inlineId, ctx);
  }

  // Observable block div containing a marker comment → cell placeholder
  if (isObservableBlockDiv(el)) {
    const id = findCellMarkerInDescendants(el);
    if (id) return cellPlaceholderJsx(id, ctx);
  }

  // Standard element serialization
  const tag = el.tagName.toLowerCase();
  const attrs = serializeAttributes(el);
  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrs} />`;
  }
  const children = serializeChildrenToJsx(el, ctx);
  return `<${tag}${attrs}>${children}</${tag}>`;
}

function serializeAttributes(el: Element): string {
  let out = "";
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    const value = attr.value;
    if (name === "style") {
      out += ` style={${cssDeclarationsToJsx(el)}}`;
      continue;
    }
    const jsxName = ATTR_RENAMES[name] ?? name;
    if (value === "") {
      // Boolean-like attribute; emit name only is invalid in JSX, so emit ={true}
      out += ` ${jsxName}`;
    } else {
      out += ` ${jsxName}=${JSON.stringify(value)}`;
    }
  }
  return out;
}

function cssDeclarationsToJsx(el: Element): string {
  // Use jsdom's CSSStyleDeclaration to enumerate properties. This handles
  // url(...), quoted values, and embedded semicolons correctly without
  // splitting on `;`.
  const style = (el as HTMLElement).style;
  const props: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i);
    const value = style.getPropertyValue(prop);
    const priority = style.getPropertyPriority(prop);
    const key = camelizeCssProperty(prop);
    const fullValue = priority ? `${value} !${priority}` : value;
    props.push(`${key}: ${JSON.stringify(fullValue)}`);
  }
  return `{${props.join(", ")}}`;
}

function camelizeCssProperty(prop: string): string {
  // Custom properties (--foo) stay as-is, but they need to be quoted as keys.
  if (prop.startsWith("--")) return JSON.stringify(prop);
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function jsxText(text: string): string {
  if (text === "") return "";
  // JSX text cannot contain `<`, `>`, `{`, `}`. Wrap any text containing these
  // in a JSX expression string. This also prevents JSX from interpreting raw
  // ampersand entities — JSX will render the literal characters verbatim.
  if (/[<>{}]/.test(text)) {
    return `{${JSON.stringify(text)}}`;
  }
  return text;
}
