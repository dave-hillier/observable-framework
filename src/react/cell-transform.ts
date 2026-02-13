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
 * Compiles a single Observable code cell into a React component function.
 *
 * Observable cell:
 *   ```js
 *   const data = await FileAttachment("data.csv").csv({typed: true});
 *   const filtered = data.filter(d => d.value > threshold);
 *   ```
 *   (declares: data, filtered; references: threshold; has FileAttachment)
 *
 * React component:
 *   function Cell_abc123() {
 *     const threshold = useCellInput("threshold");
 *     const [data, setData] = useState(undefined);
 *     useEffect(() => {
 *       FileAttachment("data.csv").csv({typed: true}).then(setData);
 *     }, []);
 *     const filtered = useMemo(() => data?.filter(d => d.value > threshold), [data, threshold]);
 *     useCellOutput("data", data);
 *     useCellOutput("filtered", filtered);
 *     return null; // or display content
 *   }
 */
export function compileCellToComponent(cell: MarkdownCode, options: CellCompileOptions): string {
  const {id, node, mode} = cell;
  const {allDeclarations} = options;
  const declarations = node.declarations?.map((d) => d.name) ?? [];
  const references = node.references.map((r) => r.name);
  const isExpression = node.expression;
  const isAsync = node.async;

  // Determine which references come from other cells vs builtins
  const cellInputs = references.filter(
    (r) => !BUILTIN_NAMES.has(r) && allDeclarations.has(r) && !declarations.includes(r)
  );
  const builtinInputs = references.filter((r) => BUILTIN_NAMES.has(r));

  const lines: string[] = [];

  lines.push(`function Cell_${id}() {`);

  // Subscribe to inputs from other cells
  for (const input of cellInputs) {
    lines.push(`  const ${input} = useCellInput("${input}");`);
  }

  // Handle different cell types
  if (isExpression) {
    // Expression cell: the entire cell is a single expression whose result is displayed
    lines.push(...compileExpressionCell(node.input, declarations, cellInputs, builtinInputs, isAsync, mode));
  } else {
    // Program cell: contains statements, may declare variables
    lines.push(...compileProgramCell(node.input, declarations, cellInputs, builtinInputs, isAsync, mode));
  }

  // Publish outputs to CellContext
  for (const decl of declarations) {
    lines.push(`  useCellOutput("${decl}", ${decl});`);
  }

  lines.push(`}`);

  return lines.join("\n");
}

/**
 * Compiles an expression cell.
 * Expression cells are single expressions whose return value is displayed.
 *
 * Observable: `Plot.plot({marks: [Plot.dot(data, {x: "x", y: "y"})]})`
 * React: Returns the value as JSX (or renders into a ref for DOM nodes)
 */
function compileExpressionCell(
  source: string,
  _declarations: string[],
  cellInputs: string[],
  builtinInputs: string[],
  isAsync: boolean,
  mode: string | undefined
): string[] {
  const lines: string[] = [];
  const deps = [...cellInputs, ...builtinInputs.filter((b) => b !== "display" && b !== "view")];
  const trimmed = source.trim().replace(/;$/, "");

  if (mode === "jsx") {
    // JSX cell: the expression is already JSX, return it directly
    lines.push(`  return (${trimmed});`);
  } else if (isAsync) {
    // Async expression: use state + effect
    lines.push(`  const [__result, __setResult] = useState(undefined);`);
    lines.push(`  useEffect(() => {`);
    lines.push(`    let cancelled = false;`);
    lines.push(`    (async () => {`);
    lines.push(`      const value = await (${trimmed});`);
    lines.push(`      if (!cancelled) __setResult(value);`);
    lines.push(`    })();`);
    lines.push(`    return () => { cancelled = true; };`);
    lines.push(`  }, [${deps.join(", ")}]);`);
    lines.push(`  const __ref = useRef(null);`);
    lines.push(`  useEffect(() => {`);
    lines.push(`    if (__ref.current && __result instanceof Node) {`);
    lines.push(`      __ref.current.textContent = "";`);
    lines.push(`      __ref.current.appendChild(__result);`);
    lines.push(`    }`);
    lines.push(`  }, [__result]);`);
    lines.push(`  if (__result instanceof Node) return <div ref={__ref} className="observablehq" />;`);
    lines.push(`  if (__result == null) return null;`);
    lines.push(`  return <div className="observablehq">{String(__result)}</div>;`);
  } else {
    // Synchronous expression: compute with useMemo and render
    lines.push(`  const __result = useMemo(() => (${trimmed}), [${deps.join(", ")}]);`);
    lines.push(`  const __ref = useRef(null);`);
    lines.push(`  useEffect(() => {`);
    lines.push(`    if (__ref.current && __result instanceof Node) {`);
    lines.push(`      __ref.current.textContent = "";`);
    lines.push(`      __ref.current.appendChild(__result);`);
    lines.push(`    }`);
    lines.push(`  }, [__result]);`);
    lines.push(`  if (__result instanceof Node) return <div ref={__ref} className="observablehq" />;`);
    lines.push(`  if (__result == null) return null;`);
    lines.push(`  return <div className="observablehq">{String(__result)}</div>;`);
  }

  return lines;
}

/**
 * Compiles a program cell (has statements, may declare variables).
 *
 * Observable:
 *   const data = await fetch("/api").then(r => r.json());
 *   const total = data.reduce((a, b) => a + b, 0);
 *
 * React: Uses useState for mutable state, useEffect for async operations,
 *        useMemo for derived computations.
 */
function compileProgramCell(
  source: string,
  declarations: string[],
  cellInputs: string[],
  builtinInputs: string[],
  isAsync: boolean,
  _mode: string | undefined
): string[] {
  const lines: string[] = [];
  const deps = [...cellInputs, ...builtinInputs.filter((b) => b !== "display" && b !== "view")];

  if (isAsync) {
    // Async program cell: wrap in useEffect
    for (const decl of declarations) {
      lines.push(`  const [${decl}, set_${decl}] = useState(undefined);`);
    }
    lines.push(`  useEffect(() => {`);
    lines.push(`    let cancelled = false;`);
    lines.push(`    (async () => {`);

    // Transform the source: replace const/let/var declarations with assignments to state setters
    let transformed = source;
    for (const decl of declarations) {
      // Replace `const/let/var <name> = <expr>` with `const __<name> = <expr>; set_<name>(__<name>);`
      const declPattern = new RegExp(
        `(const|let|var)\\s+${decl}\\s*=`,
        "g"
      );
      transformed = transformed.replace(declPattern, `const __${decl} =`);
    }

    lines.push(`      ${transformed}`);

    for (const decl of declarations) {
      lines.push(`      if (!cancelled) set_${decl}(__${decl});`);
    }
    lines.push(`    })();`);
    lines.push(`    return () => { cancelled = true; };`);
    lines.push(`  }, [${deps.join(", ")}]);`);
  } else {
    // Synchronous program cell: use useMemo for derived values
    if (declarations.length === 1) {
      const decl = declarations[0];
      lines.push(`  const ${decl} = useMemo(() => {`);
      lines.push(`    ${source}`);
      lines.push(`    return ${decl};`);
      lines.push(`  }, [${deps.join(", ")}]);`);
    } else if (declarations.length > 1) {
      lines.push(`  const __cellResult = useMemo(() => {`);
      lines.push(`    ${source}`);
      lines.push(`    return {${declarations.join(", ")}};`);
      lines.push(`  }, [${deps.join(", ")}]);`);
      for (const decl of declarations) {
        lines.push(`  const ${decl} = __cellResult.${decl};`);
      }
    } else {
      // No declarations, just side effects — use useEffect
      lines.push(`  useEffect(() => {`);
      lines.push(`    ${source}`);
      lines.push(`  }, [${deps.join(", ")}]);`);
    }
  }

  // If there's no display intent, return null
  if (!builtinInputs.includes("display")) {
    lines.push(`  return null;`);
  }

  return lines;
}

/**
 * Compiles an inline cell expression into a JSX expression string.
 * Inline cells are ${...} expressions embedded in markdown text.
 *
 * Observable: `The total is ${total.toLocaleString()}.`
 * React: `The total is {total?.toLocaleString()}.`
 */
export function compileInlineCellToExpression(source: string, _references: string[]): string {
  // For inline expressions, we just need the expression value
  // The references will be resolved from the cell context
  const trimmed = source.trim().replace(/;$/, "");
  return trimmed;
}

/**
 * Compiles a cell that uses the `view()` pattern (interactive inputs).
 *
 * Observable:
 *   const threshold = view(Inputs.range([0, 100], {label: "Threshold"}));
 *
 * React: Recognizes the view() pattern and generates a controlled component.
 */
export function compileViewCell(
  name: string,
  inputExpression: string,
  _options: CellCompileOptions
): string {
  // This is a specialized compilation for the common view() pattern
  // The input expression should be recognized and transformed into a React controlled component
  return [
    `function Cell_${name}_view() {`,
    `  const [${name}, set_${name}] = useState(undefined);`,
    `  // TODO: Transform ${inputExpression} into React controlled component`,
    `  useCellOutput("${name}", ${name});`,
    `  return null;`,
    `}`
  ].join("\n");
}
