import type {MarkdownCode} from "../markdown.js";
import type {Params} from "../route.js";

/**
 * Options for compiling a cell to a React component.
 */
export interface CellCompileOptions {
  /** All variable names declared across all cells */
  allDeclarations: Set<string>;
  /** Import resolver */
  resolveImport: (specifier: string) => string;
  /** File resolver */
  resolveFile: (name: string) => string;
  /** Page path */
  path: string;
  /** Route parameters */
  params?: Params;
}

/**
 * Built-in names that are provided by the framework hooks,
 * not by other cells.
 */
const BUILTIN_NAMES = new Set(["width", "dark", "now", "display", "view", "invalidation", "visibility"]);

/**
 * Regex to detect the view() pattern:
 *   const x = view(someExpression)
 */
const VIEW_PATTERN = /^(?:const|let|var)\s+(\w+)\s*=\s*view\((.+)\)\s*;?\s*$/s;

/**
 * Regex to detect a display() call as an expression:
 *   display(someExpression)
 */
const DISPLAY_EXPR_PATTERN = /^display\((.+)\)\s*;?\s*$/s;

/**
 * Compiles a single Observable code cell into a React component function.
 *
 * Handles:
 * - Expression cells (single expression → rendered result)
 * - Program cells (statements with declarations → state/memo)
 * - display() calls → JSX rendering
 * - view() pattern → controlled input components
 * - JSX mode → pass-through
 * - Async cells → useEffect with state
 */
export function compileCellToComponent(cell: MarkdownCode, options: CellCompileOptions): string {
  const {id, node, mode} = cell;
  const {allDeclarations} = options;
  const declarations = node.declarations?.map((d) => d.name) ?? [];
  const references = node.references.map((r) => r.name);
  const isExpression = node.expression;
  const isAsync = node.async;
  const source = node.input;

  // Determine which references come from other cells vs builtins
  const cellInputs = references.filter(
    (r) => !BUILTIN_NAMES.has(r) && allDeclarations.has(r) && !declarations.includes(r)
  );
  const builtinInputs = references.filter((r) => BUILTIN_NAMES.has(r));

  // Check for special patterns

  // 1) view() pattern: `const x = view(Inputs.range(...))`
  const viewMatch = VIEW_PATTERN.exec(source.trim());
  if (viewMatch) {
    return compileViewCell(id, viewMatch[1], viewMatch[2], cellInputs, builtinInputs);
  }

  // 2) display() as an expression: `display("hello")`
  if (isExpression) {
    const displayMatch = DISPLAY_EXPR_PATTERN.exec(source.trim());
    if (displayMatch) {
      return compileDisplayCell(id, displayMatch[1], cellInputs, builtinInputs, isAsync);
    }
  }

  const lines: string[] = [];
  lines.push(`function Cell_${id}() {`);

  // Subscribe to inputs from other cells
  for (const input of cellInputs) {
    lines.push(`  const ${input} = useCellInput("${input}");`);
  }

  // Handle different cell types
  if (mode === "jsx") {
    // JSX cell: the source has been transpiled to jsx() calls by the parser.
    // Strip import statements and render the remaining expression.
    lines.push(...compileJsxCell(source));
  } else if (isExpression) {
    lines.push(...compileExpressionCell(source, cellInputs, builtinInputs, isAsync));
  } else {
    lines.push(...compileProgramCell(source, declarations, cellInputs, builtinInputs, isAsync));
  }

  // Publish outputs to CellContext
  for (const decl of declarations) {
    if (mode === "jsx" && decl === "jsx") continue; // skip the jsx runtime declaration
    lines.push(`  useCellOutput("${decl}", ${decl});`);
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Compiles a JSX cell. The parser has already transpiled JSX to jsx() calls.
 * We strip the jsx-runtime import and wrap the expression in a return.
 */
function compileJsxCell(source: string): string[] {
  const lines: string[] = [];

  // Remove import statements (the JSX runtime is already available from React)
  const withoutImports = source.replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']+["']\s*;?\n?/g, "").trim();

  if (withoutImports) {
    lines.push(`  const __jsxResult = ${withoutImports.replace(/;$/, "")};`);
    lines.push("  const __ref = useRef(null);");
    lines.push("  useEffect(() => {");
    lines.push("    if (__ref.current && __jsxResult instanceof Node) {");
    lines.push('      __ref.current.textContent = "";');
    lines.push("      __ref.current.appendChild(__jsxResult);");
    lines.push("    }");
    lines.push("  }, [__jsxResult]);");
    lines.push('  if (__jsxResult instanceof Node) return <div ref={__ref} className="observablehq" />;');
    lines.push("  if (React.isValidElement(__jsxResult)) return __jsxResult;");
    lines.push("  if (__jsxResult == null) return null;");
    lines.push('  return <div className="observablehq">{String(__jsxResult)}</div>;');
  } else {
    lines.push("  return null;");
  }

  return lines;
}

/**
 * Compiles an expression cell.
 * Expression cells are single expressions whose return value is displayed.
 *
 * Observable: `Plot.plot({marks: [Plot.dot(data, {x: "x", y: "y"})]})`
 * React: Evaluates the expression and renders the result (DOM node or text).
 */
function compileExpressionCell(
  source: string,
  cellInputs: string[],
  builtinInputs: string[],
  isAsync: boolean
): string[] {
  const lines: string[] = [];
  const deps = [...cellInputs, ...builtinInputs.filter((b) => b !== "display" && b !== "view")];
  const trimmed = source.trim().replace(/;$/, "");

  if (isAsync) {
    // Async expression: use state + effect
    lines.push("  const [__result, __setResult] = useState(undefined);");
    lines.push("  useEffect(() => {");
    lines.push("    let cancelled = false;");
    lines.push("    (async () => {");
    lines.push(`      const value = await (${trimmed});`);
    lines.push("      if (!cancelled) __setResult(value);");
    lines.push("    })();");
    lines.push("    return () => { cancelled = true; };");
    lines.push(`  }, [${deps.join(", ")}]);`);
  } else {
    // Synchronous expression: compute with useMemo
    lines.push(`  const __result = useMemo(() => (${trimmed}), [${deps.join(", ")}]);`);
  }

  // Render the result: handle DOM nodes, React elements, and primitives
  lines.push("  const __ref = useRef(null);");
  lines.push("  useEffect(() => {");
  lines.push("    if (__ref.current && __result instanceof Node) {");
  lines.push('      __ref.current.textContent = "";');
  lines.push("      __ref.current.appendChild(__result);");
  lines.push("    }");
  lines.push("  }, [__result]);");
  lines.push('  if (__result instanceof Node) return <div ref={__ref} className="observablehq" />;');
  lines.push("  if (React.isValidElement(__result)) return __result;");
  lines.push("  if (__result == null) return null;");
  lines.push('  return <div className="observablehq">{String(__result)}</div>;');

  return lines;
}

/**
 * Compiles a program cell (has statements, may declare variables).
 *
 * Handles:
 * - Sync cells with declarations → useMemo
 * - Async cells with declarations → useState + useEffect
 * - Side-effect-only cells → useEffect
 * - Cells with display() calls → renders content
 */
function compileProgramCell(
  source: string,
  declarations: string[],
  cellInputs: string[],
  builtinInputs: string[],
  isAsync: boolean
): string[] {
  const lines: string[] = [];
  const deps = [...cellInputs, ...builtinInputs.filter((b) => b !== "display" && b !== "view")];
  const hasDisplay = builtinInputs.includes("display");

  // Strip import statements from the source (they're hoisted to module level)
  const sourceWithoutImports = source
    .replace(/import\s+(?:(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*\{[^}]+\})?)\s+from\s+["'][^"']+["']\s*;?\n?/g, "")
    .trim();

  if (isAsync) {
    // Async program cell: wrap in useEffect with state for declarations
    for (const decl of declarations) {
      lines.push(`  const [${decl}, set_${decl}] = useState(undefined);`);
    }

    if (hasDisplay) {
      lines.push("  const [__displayed, __setDisplayed] = useState([]);");
    }

    lines.push("  useEffect(() => {");
    lines.push("    let cancelled = false;");

    if (hasDisplay) {
      lines.push("    const __items = [];");
      lines.push(
        "    const display = (value) => { __items.push(value); __setDisplayed([...__items]); return value; };"
      );
    }

    lines.push("    (async () => {");

    // Transform declarations to use local vars and state setters
    let transformed = sourceWithoutImports;
    for (const decl of declarations) {
      const declPattern = new RegExp(`(const|let|var)\\s+${escapeRegexInSource(decl)}\\s*=`, "g");
      transformed = transformed.replace(declPattern, `const __local_${decl} =`);
    }

    lines.push(`      ${transformed}`);

    for (const decl of declarations) {
      lines.push(`      if (!cancelled) set_${decl}(__local_${decl});`);
    }
    lines.push("    })();");
    lines.push("    return () => { cancelled = true; };");
    lines.push(`  }, [${deps.join(", ")}]);`);

    if (hasDisplay) {
      lines.push(
        '  return __displayed.length > 0 ? <>{__displayed.map((d, i) => <div key={i} className="observablehq" ref={(el) => { if (el && d instanceof Node) { el.textContent = ""; el.appendChild(d); }}}>{typeof d === "string" ? d : null}</div>)}</> : null;'
      );
    } else {
      lines.push("  return null;");
    }
  } else {
    // Synchronous program cell
    if (declarations.length === 1) {
      const decl = declarations[0];
      lines.push(`  const ${decl} = useMemo(() => {`);
      lines.push(`    ${sourceWithoutImports}`);
      lines.push(`    return ${decl};`);
      lines.push(`  }, [${deps.join(", ")}]);`);
    } else if (declarations.length > 1) {
      lines.push("  const __cellResult = useMemo(() => {");
      lines.push(`    ${sourceWithoutImports}`);
      lines.push(`    return {${declarations.join(", ")}};`);
      lines.push(`  }, [${deps.join(", ")}]);`);
      for (const decl of declarations) {
        lines.push(`  const ${decl} = __cellResult.${decl};`);
      }
    } else {
      // No declarations, just side effects
      if (hasDisplay) {
        lines.push("  const [__displayed, __setDisplayed] = useState([]);");
        lines.push("  useEffect(() => {");
        lines.push("    const __items = [];");
        lines.push(
          "    const display = (value) => { __items.push(value); __setDisplayed([...__items]); return value; };"
        );
        lines.push(`    ${sourceWithoutImports}`);
        lines.push(`  }, [${deps.join(", ")}]);`);
        lines.push(
          '  return __displayed.length > 0 ? <>{__displayed.map((d, i) => <div key={i} className="observablehq">{d instanceof Node ? null : String(d)}</div>)}</> : null;'
        );
      } else {
        lines.push("  useEffect(() => {");
        lines.push(`    ${sourceWithoutImports}`);
        lines.push(`  }, [${deps.join(", ")}]);`);
        lines.push("  return null;");
      }
    }

    if (declarations.length > 0 && !hasDisplay) {
      lines.push("  return null;");
    }
  }

  return lines;
}

function escapeRegexInSource(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles an inline cell expression into a JSX expression string.
 * Inline cells are ${...} expressions embedded in markdown text.
 *
 * When the expression references cell-declared variables, it returns a
 * marker string that buildPageBody uses to generate an inline component
 * that subscribes to those cell values via useCellInput.
 *
 * @param allDeclarations - set of variable names declared across all cells;
 *   when provided, enables reactive inline expressions
 */
export function compileInlineCellToExpression(
  source: string,
  references: string[],
  allDeclarations?: Set<string>
): string {
  const trimmed = source.trim().replace(/;$/, "");
  if (allDeclarations) {
    const cellRefs = references.filter((r) => allDeclarations.has(r));
    if (cellRefs.length > 0) {
      // Encode as a marker; buildPageBody replaces it with a component reference
      return `__INLINE_CELL__:${JSON.stringify(cellRefs)}:__EXPR__${trimmed}__END__`;
    }
  }
  return trimmed;
}

/**
 * Compiles a display() expression cell.
 * `display("hello")` → renders the argument as content.
 * `display(someElement)` → attaches the DOM node.
 */
function compileDisplayCell(
  id: string,
  innerExpression: string,
  cellInputs: string[],
  builtinInputs: string[],
  isAsync: boolean
): string {
  const lines: string[] = [];
  const deps = [...cellInputs, ...builtinInputs.filter((b) => b !== "display" && b !== "view")];

  lines.push(`function Cell_${id}() {`);

  for (const input of cellInputs) {
    lines.push(`  const ${input} = useCellInput("${input}");`);
  }

  const trimmedExpr = innerExpression.trim().replace(/;$/, "");

  if (isAsync) {
    lines.push("  const [__result, __setResult] = useState(undefined);");
    lines.push("  useEffect(() => {");
    lines.push("    let cancelled = false;");
    lines.push("    (async () => {");
    lines.push(`      const value = await (${trimmedExpr});`);
    lines.push("      if (!cancelled) __setResult(value);");
    lines.push("    })();");
    lines.push("    return () => { cancelled = true; };");
    lines.push(`  }, [${deps.join(", ")}]);`);
  } else {
    lines.push(`  const __result = useMemo(() => (${trimmedExpr}), [${deps.join(", ")}]);`);
  }

  lines.push("  const __ref = useRef(null);");
  lines.push("  useEffect(() => {");
  lines.push("    if (__ref.current && __result instanceof Node) {");
  lines.push('      __ref.current.textContent = "";');
  lines.push("      __ref.current.appendChild(__result);");
  lines.push("    }");
  lines.push("  }, [__result]);");
  lines.push('  if (__result instanceof Node) return <div ref={__ref} className="observablehq" />;');
  lines.push("  if (React.isValidElement(__result)) return __result;");
  lines.push("  if (__result == null) return null;");
  lines.push('  return <div className="observablehq">{String(__result)}</div>;');

  lines.push("}");
  return lines.join("\n");
}

/**
 * Compiles a cell that uses the `view()` pattern (interactive inputs).
 *
 * Observable:
 *   const threshold = view(Inputs.range([0, 100], {label: "Threshold"}));
 *
 * React: Creates a controlled component that:
 *   1. Renders the input element (a DOM node)
 *   2. Listens for "input" events on it
 *   3. Publishes the value to CellContext
 */
function compileViewCell(
  id: string,
  varName: string,
  inputExpression: string,
  cellInputs: string[],
  builtinInputs: string[]
): string {
  const deps = [...cellInputs, ...builtinInputs.filter((b) => b !== "display" && b !== "view")];
  const lines: string[] = [];

  lines.push(`function Cell_${id}() {`);

  for (const input of cellInputs) {
    lines.push(`  const ${input} = useCellInput("${input}");`);
  }

  lines.push(`  const [${varName}, set_${varName}] = useState(undefined);`);
  lines.push("  const __ref = useRef(null);");
  lines.push("  const __inputRef = useRef(null);");
  lines.push("");
  lines.push("  // Create the input element and listen for changes");
  lines.push("  useEffect(() => {");
  lines.push("    const container = __ref.current;");
  lines.push("    if (!container) return;");
  lines.push(`    const input = ${inputExpression.trim().replace(/;$/, "")};`);
  lines.push("    __inputRef.current = input;");
  lines.push('    container.textContent = "";');
  lines.push("    if (input instanceof Node) container.appendChild(input);");
  lines.push("    // Set initial value");
  lines.push(`    set_${varName}(input?.value);`);
  lines.push("    // Listen for input events");
  lines.push(`    const handler = () => set_${varName}(input?.value);`);
  lines.push('    input?.addEventListener?.("input", handler);');
  lines.push("    return () => {");
  lines.push('      input?.removeEventListener?.("input", handler);');
  lines.push('      container.textContent = "";');
  lines.push("    };");
  lines.push(`  }, [${deps.join(", ")}]);`);
  lines.push("");
  lines.push(`  useCellOutput("${varName}", ${varName});`);
  lines.push('  return <div ref={__ref} className="observablehq observablehq--view" />;');

  lines.push("}");
  return lines.join("\n");
}
