import assert from "node:assert";
import {transform} from "esbuild";
import {normalizeConfig} from "../src/config.js";
import {parseMarkdown} from "../src/markdown.js";
import {compileMarkdownToReact} from "../src/react/compile.js";

const {md} = normalizeConfig({root: "docs"});

/**
 * Helper: validates generated code is syntactically valid JavaScript/JSX
 * by running esbuild transform on it.
 */
async function assertValidJsx(code: string, label?: string): Promise<void> {
  try {
    await transform(code, {loader: "tsx", jsx: "automatic"});
  } catch (err: any) {
    assert.fail(`Generated code is not valid JSX${label ? ` (${label})` : ""}:\n${err.message}\n\nGenerated:\n${code}`);
  }
}

// =============================================================================
// Phase 1.6: End-to-end markdown → React → valid JS module
// =============================================================================

describe("Phase 1.6: End-to-end React compilation", () => {
  it("compiles a complete page with text, code, and inline expressions to valid JSX", async () => {
    const source = `---
title: Test Page
---

# Hello World

Some introductory text.

\`\`\`js
const x = 42;
\`\`\`

\`\`\`js
x * 2
\`\`\`

The value of x is \${x}.
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("export default function Page()"));
    assert.ok(result.includes("CellProvider"));
    assert.ok(result.includes("Cell_"));
    await assertValidJsx(result, "complete page");
  });

  it("compiles a static page with no code cells to valid JSX", async () => {
    const page = parseMarkdown("# Hello\n\nJust some text.\n\n---\n\nMore text.", {md, path: "/static"});
    const result = compileMarkdownToReact(page, {path: "/static"});
    assert.ok(result.includes("export default function Page()"));
    await assertValidJsx(result, "static page");
  });

  it("compiles a page with multiple cell types to valid JSX", async () => {
    const source = `# Mixed

\`\`\`js
const a = 1;
\`\`\`

\`\`\`js
const b = 2;
const c = a + b;
\`\`\`

\`\`\`js
a + b + c
\`\`\`

Result: \${a + b}
`;
    const page = parseMarkdown(source, {md, path: "/mixed"});
    const result = compileMarkdownToReact(page, {path: "/mixed"});
    assert.ok(result.includes("export default function Page()"));
    await assertValidJsx(result, "mixed cells");
  });
});

// =============================================================================
// Phase 2.1: Expression cell compilation
// =============================================================================

describe("Phase 2.1: Expression cells", () => {
  it("compiles a synchronous expression cell", () => {
    const page = parseMarkdown("```js\n1 + 2\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useMemo(() => (1 + 2"), "should use useMemo for sync expression");
    assert.ok(result.includes("__result instanceof Node"), "should handle DOM nodes");
  });

  it("compiles an async expression cell", () => {
    const page = parseMarkdown("```js\nawait fetch(\"/api\")\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useState(undefined)"), "should use useState for async");
    assert.ok(result.includes("useEffect"), "should use useEffect for async");
    assert.ok(result.includes("await ("), "should await the expression");
    assert.ok(result.includes("cancelled"), "should have cancellation");
  });

  it("compiles an expression cell that references builtins", () => {
    const page = parseMarkdown("```js\nwidth\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useWidthRef"), "should import useWidthRef");
  });

  it("handles expression cell referencing other cells", () => {
    const page = parseMarkdown("```js\nconst x = 10;\n```\n\n```js\nx * 2\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes('useCellInput("x")'), "should subscribe to cell input");
  });
});

// =============================================================================
// Phase 2.2: Program cell compilation
// =============================================================================

describe("Phase 2.2: Program cells", () => {
  it("compiles a sync single-declaration cell with useMemo", () => {
    const page = parseMarkdown("```js\nconst x = 42;\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useMemo(() => {"), "should use useMemo");
    assert.ok(result.includes("return x;"), "should return the variable");
    assert.ok(result.includes('useCellOutput("x"'), "should publish output");
  });

  it("compiles a sync multi-declaration cell", () => {
    const page = parseMarkdown("```js\nconst a = 1;\nconst b = 2;\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("__cellResult = useMemo"), "should use merged useMemo");
    assert.ok(result.includes("return {a, b}"), "should return object with both vars");
  });

  it("compiles an async declaration cell with useState + useEffect", () => {
    const page = parseMarkdown("```js\nconst data = await fetch(\"/api\").then(r => r.json());\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useState(undefined)"), "should use useState");
    assert.ok(result.includes("useEffect"), "should use useEffect");
    assert.ok(result.includes("set_data"), "should have state setter");
    assert.ok(result.includes("cancelled"), "should have cancellation");
  });

  it("compiles a side-effect-only cell with useEffect", () => {
    const page = parseMarkdown("```js\nconsole.log(\"hello\");\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useEffect"), "should use useEffect for side effects");
    assert.ok(result.includes("return null"), "should return null");
  });
});

// =============================================================================
// Phase 2.3: Cross-cell references
// =============================================================================

describe("Phase 2.3: Cross-cell references", () => {
  it("generates useCellInput for references to other cells", () => {
    const page = parseMarkdown("```js\nconst x = 10;\n```\n\n```js\nconst y = x * 2;\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes('useCellInput("x")'), "should subscribe to x from CellContext");
    assert.ok(result.includes('useCellOutput("x"'), "should publish x");
    assert.ok(result.includes('useCellOutput("y"'), "should publish y");
  });

  it("includes cell inputs in dependency arrays", () => {
    const page = parseMarkdown("```js\nconst x = 10;\n```\n\n```js\nx * 2\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("[x]") || result.includes(", x]"), "should include x in dependency array");
  });
});

// =============================================================================
// Phase 2.4: Import declarations
// =============================================================================

describe("Phase 2.4: Import declarations", () => {
  it("hoists imports to module level", () => {
    const page = parseMarkdown("```js\nimport * as Plot from \"npm:@observablehq/plot\";\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      resolveImport: (s) => s.startsWith("npm:") ? s.slice(4) : s
    });
    const lines = result.split("\n");
    const importLine = lines.findIndex((l) => l.includes("@observablehq/plot"));
    const cellLine = lines.findIndex((l) => l.includes("function Cell_"));
    assert.ok(importLine >= 0, "should have plot import");
    assert.strictEqual(cellLine, -1, "should not create a Cell_ component for import-only cells");
  });

  it("resolves npm: specifiers via resolveImport", () => {
    const page = parseMarkdown("```js\nimport {csv} from \"npm:d3-dsv\";\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      resolveImport: (s) => s.startsWith("npm:") ? s.slice(4) : s
    });
    assert.ok(result.includes('"d3-dsv"'), "should resolve npm:d3-dsv to d3-dsv");
    assert.ok(!result.includes('"npm:d3-dsv"'), "should not have npm: prefix");
  });

  it("strips import statements from cell source in program cells", () => {
    const source = `\`\`\`js
import * as Plot from "npm:@observablehq/plot";
const chart = Plot.plot({marks: []});
\`\`\`
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      resolveImport: (s) => s.startsWith("npm:") ? s.slice(4) : s
    });
    assert.ok(result.includes("Cell_"), "should generate a cell component");
    assert.ok(result.includes("Plot.plot"), "should include the code that uses the import");
  });
});

// =============================================================================
// Phase 2.5: display() calls
// =============================================================================

describe("Phase 2.5: display() transformation", () => {
  it("compiles display(expr) as a display cell", () => {
    const page = parseMarkdown("```js\ndisplay(\"hello\")\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("function Cell_"), "should generate a cell component");
    assert.ok(result.includes('"hello"'), "should include the displayed expression");
  });

  it("compiles display() calls in program cells", () => {
    const source = "```js\nconst items = [1,2,3];\nfor (const item of items) display(item);\n```\n";
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("function Cell_"), "should generate a cell component");
    assert.ok(result.includes("display"), "should reference display");
  });
});

// =============================================================================
// Phase 2.6: view() transformation
// =============================================================================

describe("Phase 2.6: view() transformation", () => {
  it("compiles const x = view(expr) into a controlled component", () => {
    const page = parseMarkdown("```js\nconst threshold = view(Inputs.range([0, 100]))\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("function Cell_"), "should generate a cell component");
    assert.ok(result.includes("set_threshold"), "should have state setter");
    assert.ok(result.includes('useCellOutput("threshold"'), "should publish to CellContext");
    assert.ok(result.includes("addEventListener"), "should listen for input events");
    assert.ok(result.includes("removeEventListener"), "should cleanup listeners");
  });

  it("view() cell publishes its value to CellContext", () => {
    const source = `\`\`\`js
const threshold = view(Inputs.range([0, 100]))
\`\`\`

\`\`\`js
threshold * 2
\`\`\`
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes('useCellOutput("threshold"'), "view should publish output");
    assert.ok(result.includes('useCellInput("threshold")'), "downstream cell should subscribe");
  });
});

// =============================================================================
// Phase 2.7: JSX validity of all cell types
// =============================================================================

describe("Phase 2.7: JSX validity of all cell types", () => {
  it("sync expression cell produces valid JSX", async () => {
    const page = parseMarkdown("```js\n1 + 2\n```\n", {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "sync expression");
  });

  it("async expression cell produces valid JSX", async () => {
    const page = parseMarkdown("```js\nawait fetch(\"/api\")\n```\n", {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "async expression");
  });

  it("single-declaration cell produces valid JSX", async () => {
    const page = parseMarkdown("```js\nconst x = 42;\n```\n", {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "single declaration");
  });

  it("multi-declaration cell produces valid JSX", async () => {
    const page = parseMarkdown("```js\nconst a = 1;\nconst b = 2;\n```\n", {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "multi declaration");
  });

  it("async declaration cell produces valid JSX", async () => {
    const page = parseMarkdown("```js\nconst data = await fetch(\"/api\").then(r => r.json());\n```\n", {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "async declaration");
  });

  it("display() expression cell produces valid JSX", async () => {
    const page = parseMarkdown("```js\ndisplay(\"hello\")\n```\n", {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "display expression");
  });

  it("view() cell produces valid JSX", async () => {
    const page = parseMarkdown("```js\nconst x = view(Inputs.range([0, 100]))\n```\n", {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "view cell");
  });

  it("inline expression produces valid JSX", async () => {
    const page = parseMarkdown("The value is ${1 + 1}.", {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "inline expression");
  });

  it("mixed page with all cell types produces valid JSX", async () => {
    const source = `# Dashboard

\`\`\`js
const data = await fetch("/api").then(r => r.json());
\`\`\`

\`\`\`js
const threshold = view(Inputs.range([0, 100]))
\`\`\`

\`\`\`js
const filtered = data.filter(d => d.value > threshold);
\`\`\`

\`\`\`js
display(filtered.length)
\`\`\`

\`\`\`js
filtered.length
\`\`\`

There are \${filtered.length} items above threshold \${threshold}.
`;
    const page = parseMarkdown(source, {md, path: "/dashboard"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/dashboard"}), "full dashboard");
  });

  it("page referencing width, dark, now produces valid JSX", async () => {
    const source = `\`\`\`js
width
\`\`\`

\`\`\`js
dark
\`\`\`

\`\`\`js
now
\`\`\`
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    await assertValidJsx(compileMarkdownToReact(page, {path: "/test"}), "builtins page");
  });
});

// =============================================================================
// Phase 7.1: File registration in compiled modules
// =============================================================================

describe("Phase 7.1: File registration", () => {
  it("emits registerFile() calls when files option is provided", () => {
    const page = parseMarkdown("# Page\n\nSome text.\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      files: [
        {name: "data.csv", mimeType: "text/csv", path: "/_file/data.abc123.csv"},
        {name: "image.png", mimeType: "image/png", path: "/_file/image.def456.png", size: 1024}
      ]
    });
    assert.ok(result.includes("registerFile"), "should import registerFile");
    assert.ok(result.includes('"data.csv"'), "should register data.csv");
    assert.ok(result.includes('"image.png"'), "should register image.png");
    assert.ok(result.includes('"text/csv"'), "should include mimeType for csv");
    assert.ok(result.includes('"image/png"'), "should include mimeType for png");
    assert.ok(result.includes("/_file/data.abc123.csv"), "should include resolved path");
  });

  it("does not emit registerFile() when no files are provided", () => {
    const page = parseMarkdown("# Page\n\nSome text.\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(!result.includes("registerFile"), "should not import registerFile");
  });

  it("does not emit registerFile() when files array is empty", () => {
    const page = parseMarkdown("# Page\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test", files: []});
    assert.ok(!result.includes("registerFile"), "should not import registerFile for empty array");
  });

  it("file registration output is valid JSX", async () => {
    const page = parseMarkdown("# Files\n\n```js\nconst x = 1;\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      files: [{name: "data.json", mimeType: "application/json", path: "/_file/data.abc.json", lastModified: 1700000000000, size: 512}]
    });
    await assertValidJsx(result, "file registration");
  });
});

// =============================================================================
// Phase 7.4: Reactive inline expressions
// =============================================================================

describe("Phase 7.4: Reactive inline expressions", () => {
  it("generates inline component for expressions referencing cell variables", async () => {
    const source = `\`\`\`js
const x = 42;
\`\`\`

The value is \${x}.
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("function Inline_"), "should generate an Inline_ component");
    assert.ok(result.includes("useCellInput"), "inline component should use useCellInput");
    assert.ok(result.includes("<Inline_"), "page body should reference the inline component");
    await assertValidJsx(result, "reactive inline expression");
  });

  it("does not generate inline component for static expressions", async () => {
    const source = `The value is \${1 + 1}.`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(!result.includes("function Inline_"), "should not generate inline component for static expression");
    await assertValidJsx(result, "static inline expression");
  });

  it("generates multiple inline components for multiple reactive expressions", async () => {
    const source = `\`\`\`js
const a = 1;
\`\`\`

\`\`\`js
const b = 2;
\`\`\`

First: \${a}, Second: \${b}, Combined: \${a + b}.
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    // Should have multiple inline components
    const inlineMatches = result.match(/function Inline_/g);
    assert.ok(inlineMatches && inlineMatches.length >= 2, "should generate at least 2 inline components");
    await assertValidJsx(result, "multiple reactive inline expressions");
  });
});
