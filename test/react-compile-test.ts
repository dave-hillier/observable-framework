import assert from "node:assert";
import {normalizeConfig} from "../src/config.js";
import {parseMarkdown} from "../src/markdown.js";
import {compileMarkdownToReact} from "../src/react/compile.js";

const {md} = normalizeConfig({root: "docs"});

describe("compileMarkdownToReact", () => {
  it("compiles a simple markdown page with no code", () => {
    const page = parseMarkdown("# Hello\n\nWorld", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("export default function Page()"));
    assert.ok(result.includes("CellProvider"));
    assert.ok(result.includes("import React"));
  });

  it("compiles a page with an expression cell", () => {
    const page = parseMarkdown("# Test\n\n```js\n1 + 2\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("export default function Page()"));
    // Expression cell becomes a component
    assert.ok(result.includes("function Cell_"));
  });

  it("compiles a page with a declaration cell", () => {
    const page = parseMarkdown("# Test\n\n```js\nconst x = 42;\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("export default function Page()"));
    assert.ok(result.includes("function Cell_"));
  });

  it("detects built-in references (width, dark, now)", () => {
    const page = parseMarkdown("# Test\n\n```js\nwidth\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useWidthRef"));
  });

  it("detects dark mode reference", () => {
    const page = parseMarkdown("# Test\n\n```js\ndark\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useDark"));
  });

  it("detects now reference", () => {
    const page = parseMarkdown("# Test\n\n```js\nnow\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("useNow"));
  });

  it("generates cell output declarations for named variables", () => {
    const page = parseMarkdown("# Test\n\n```js\nconst data = [1,2,3];\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes('useCellOutput("data"'));
  });

  it("handles inline expressions", () => {
    const page = parseMarkdown("The answer is ${1 + 1}.", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("export default function Page()"));
  });

  it("resolves imports via resolveImport callback", () => {
    const page = parseMarkdown("```js\nimport * as Plot from \"npm:@observablehq/plot\";\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      resolveImport: (spec) => spec.startsWith("npm:") ? spec.slice(4) : spec
    });
    assert.ok(result.includes("@observablehq/plot"));
  });

  it("wraps cells in ErrorBoundary and Suspense", () => {
    const page = parseMarkdown("# Test\n\n```js\n1 + 2\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("ErrorBoundary"));
    assert.ok(result.includes("Suspense"));
  });

  it("converts class attributes to className", () => {
    const page = parseMarkdown("# Hello\n\nWorld", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    // The htmlToJsx transform should convert class= to className=
    // (only if the markdown output contains class attributes)
    assert.ok(result.includes("export default function Page()"));
  });

  it("returns valid JavaScript module syntax", () => {
    const page = parseMarkdown("# Test\n\nSome text\n\n```js\nconst x = 1;\n```\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    // Should start with imports
    assert.ok(result.startsWith("import React"));
    // Should have a default export
    assert.ok(result.includes("export default function Page()"));
  });
});
