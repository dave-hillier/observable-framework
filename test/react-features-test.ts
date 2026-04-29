import assert from "node:assert";
import {normalizeConfig} from "../src/config.js";
import type {MarkdownPage} from "../src/markdown.js";
import {compileMarkdownToReact} from "../src/react/compile.js";
import {generateReactPageShell} from "../src/react/page-template.js";

// =============================================================================
// Search integration
// =============================================================================

describe("Search integration", () => {
  it("useSearch hook module exists and exports expected shape", async () => {
    const mod = await import("../src/client/hooks/useSearch.js");
    assert.strictEqual(typeof mod.useSearch, "function");
  });
});

// =============================================================================
// Theme switching
// =============================================================================

describe("Theme switching", () => {
  it("useDark hook exists", async () => {
    const mod = await import("../src/client/hooks/useDark.js");
    assert.strictEqual(typeof mod.useDark, "function");
  });

  it("useThemePreference hook exists", async () => {
    const mod = await import("../src/client/hooks/useDark.js");
    assert.strictEqual(typeof mod.useThemePreference, "function");
  });

  it("ThemeToggle component exists", async () => {
    const mod = await import("../src/client/components/ThemeToggle.js");
    assert.strictEqual(typeof mod.ThemeToggle, "function");
  });
});

// =============================================================================
// Granular HMR (react-update message type)
// =============================================================================

describe("Granular HMR in React mode", () => {
  it("preview shell includes WebSocket-based HMR client", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: true,
      hash: "abc123"
    });
    assert.ok(html.includes("WebSocket"), "should include WebSocket connection");
    assert.ok(html.includes("react-update"), "should handle react-update message type");
    assert.ok(html.includes("registerFile"), "should handle file registration updates");
    assert.ok(html.includes("pageChanged"), "should handle page content changes");
  });

  it("preview shell sends hash in hello message", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: true,
      hash: "test-hash-value"
    });
    assert.ok(html.includes("test-hash-value"), "should include the hash value");
  });

  it("build shell does not include HMR client", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: false
    });
    assert.ok(!html.includes("WebSocket"), "should not include WebSocket");
    assert.ok(!html.includes("react-update"), "should not include HMR handler");
  });
});

// =============================================================================
// CSR (no SSR / no SSG)
// =============================================================================

describe("CSR-only rendering", () => {
  it("build shell uses createRoot and renders into an empty root", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: false
    });
    assert.ok(html.includes("createRoot"), "should use createRoot");
    assert.ok(!html.includes("hydrateRoot"), "should not use hydrateRoot");
    assert.ok(/<div id="observablehq-root"><\/div>/.test(html), "root container must be empty (CSR)");
  });
});

// =============================================================================
// Advanced DuckDB table registration
// =============================================================================

describe("DuckDB table registration", () => {
  it("DuckDBProvider exports expected API", async () => {
    const mod = await import("../src/client/components/DuckDBProvider.js");
    assert.strictEqual(typeof mod.DuckDBProvider, "function");
    assert.strictEqual(typeof mod.useDuckDB, "function");
    assert.strictEqual(typeof mod.useSQL, "function");
  });

  it("file registry supports change subscriptions", async () => {
    const {registerFile, onFileChange, getFileMetadata} = await import("../src/client/hooks/useFileAttachment.js");
    const changes: {name: string; meta: any}[] = [];
    const unsub = onFileChange((name, meta) => changes.push({name, meta}));

    registerFile("test-sub.csv", {name: "test-sub.csv", path: "/_file/test-sub.csv?sha=abc", mimeType: "text/csv"});
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].name, "test-sub.csv");
    assert.strictEqual(changes[0].meta.mimeType, "text/csv");

    registerFile("test-sub.csv", null);
    assert.strictEqual(changes.length, 2);
    assert.strictEqual(changes[1].meta, null);

    unsub();
    registerFile("test-sub2.csv", {name: "test-sub2.csv", path: "/_file/test-sub2.csv", mimeType: "text/csv"});
    assert.strictEqual(changes.length, 2, "should not receive events after unsubscribe");

    // Clean up
    registerFile("test-sub2.csv", null);
  });

  it("getFileMetadata returns registered file info", async () => {
    const {registerFile, getFileMetadata} = await import("../src/client/hooks/useFileAttachment.js");

    registerFile("test-meta.parquet", {
      name: "test-meta.parquet",
      path: "/_file/test-meta.parquet?sha=xyz",
      mimeType: "application/vnd.apache.parquet",
      size: 12345
    });

    const meta = getFileMetadata("test-meta.parquet");
    assert.ok(meta);
    assert.strictEqual(meta!.mimeType, "application/vnd.apache.parquet");
    assert.strictEqual(meta!.size, 12345);
    assert.strictEqual(meta!.path, "/_file/test-meta.parquet?sha=xyz");

    assert.strictEqual(getFileMetadata("nonexistent.csv"), undefined);

    // Clean up
    registerFile("test-meta.parquet", null);
  });
});

// =============================================================================
// SQL front-matter → DuckDBProvider compile integration
// =============================================================================

describe("SQL front-matter compile integration", () => {
  it("wraps page in DuckDBProvider when sql front-matter is present", () => {
    const page = {
      body: "<h1>Dashboard</h1>",
      title: "Dashboard",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {sql: {sales: "/data/sales.parquet", customers: "/data/customers.csv"}},
      style: null
    } as unknown as MarkdownPage;

    const output = compileMarkdownToReact(page, {
      path: "/dashboard",
      sql: {sales: "/data/sales.parquet", customers: "/data/customers.csv"}
    });

    assert.ok(output.includes("DuckDBProvider"), "should include DuckDBProvider component");
    assert.ok(output.includes("import {DuckDBProvider}"), "should import DuckDBProvider");
    assert.ok(output.includes("/data/sales.parquet"), "should include table source for sales");
    assert.ok(output.includes("/data/customers.csv"), "should include table source for customers");
  });

  it("does not include DuckDBProvider when no sql front-matter", () => {
    const page = {
      body: "<h1>Simple Page</h1>",
      title: "Simple",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {},
      style: null
    } as unknown as MarkdownPage;

    const output = compileMarkdownToReact(page, {path: "/simple"});
    assert.ok(!output.includes("DuckDBProvider"), "should not include DuckDBProvider");
  });

  it("passes SQL query sources (non-file paths) through to DuckDBProvider", () => {
    const page = {
      body: "<h1>Views</h1>",
      title: "Views",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {sql: {
        raw: "/data/raw.csv",
        summary: "SELECT region, SUM(amount) FROM raw GROUP BY region"
      }},
      style: null
    } as unknown as MarkdownPage;

    const output = compileMarkdownToReact(page, {
      path: "/views",
      sql: {
        raw: "/data/raw.csv",
        summary: "SELECT region, SUM(amount) FROM raw GROUP BY region"
      }
    });

    assert.ok(output.includes("DuckDBProvider"), "should include DuckDBProvider");
    assert.ok(output.includes("/data/raw.csv"), "should include file path source");
    assert.ok(output.includes("SELECT region"), "should include SQL query source");
  });
});

// =============================================================================
// FileInput component
// =============================================================================

describe("FileInput component", () => {
  it("FileInput component exists and is exported", async () => {
    const mod = await import("../src/client/components/inputs/FileInput.js");
    assert.strictEqual(typeof mod.FileInput, "function");
  });

  it("FileInput is re-exported from inputs index", async () => {
    const mod = await import("../src/client/components/inputs/index.js");
    assert.strictEqual(typeof mod.FileInput, "function");
  });
});

// =============================================================================
// React config options (strict, suspense)
// =============================================================================

describe("React config options", () => {
  it("defaults reactOptions to strict=false, suspense=true", () => {
    const config = normalizeConfig({root: "docs"});
    assert.strictEqual(config.reactOptions.strict, false);
    assert.strictEqual(config.reactOptions.suspense, true);
  });

  it("accepts react as an object with strict and suspense", () => {
    const config = normalizeConfig({react: {strict: true, suspense: false}, root: "docs"});
    assert.strictEqual(config.reactOptions.strict, true);
    assert.strictEqual(config.reactOptions.suspense, false);
  });

  it("defaults missing fields in react object", () => {
    const config = normalizeConfig({react: {strict: true}, root: "docs"});
    assert.strictEqual(config.reactOptions.strict, true);
    assert.strictEqual(config.reactOptions.suspense, true);
  });
});

// =============================================================================
// React.StrictMode in page shell
// =============================================================================

describe("React.StrictMode support", () => {
  it("wraps in StrictMode when strict is true", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: false,
      strict: true
    });
    assert.ok(html.includes("React.StrictMode"), "should include StrictMode wrapper");
  });

  it("does not wrap in StrictMode when strict is false", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: false,
      strict: false
    });
    assert.ok(!html.includes("StrictMode"), "should not include StrictMode");
  });

  it("does not wrap in StrictMode by default", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: false
    });
    assert.ok(!html.includes("StrictMode"), "should not include StrictMode by default");
  });

  it("uses StrictMode in HMR re-render when strict is true", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: true,
      hash: "abc",
      strict: true
    });
    // Should appear in both the initial render and the HMR re-render
    const matches = html.match(/StrictMode/g);
    assert.ok(matches && matches.length >= 2, "should use StrictMode in both initial and HMR renders");
  });
});

// =============================================================================
// observablehq-loading handling in compiled output
// =============================================================================

describe("observablehq-loading handling", () => {
  it("does not leave observablehq-loading elements in compiled JSX", () => {
    const page = {
      body: "<h1>Title</h1>\n<observablehq-loading></observablehq-loading><!--:cell1:-->\n<p>Content</p>",
      title: "Test",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {toc: {show: true, label: "Contents"}, sql: {}},
      style: null,
      path: "/test"
    } as unknown as MarkdownPage;

    const html = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(!html.includes("observablehq-loading"), "should remove loading indicators");
    assert.ok(html.includes("<h1>Title</h1>"), "should preserve headings");
    assert.ok(html.includes("<p>Content</p>"), "should preserve paragraphs");
  });
});

