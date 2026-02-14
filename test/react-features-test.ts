import assert from "node:assert";
import {generateReactPageShell} from "../src/react/page-template.js";
import {extractStaticHtml} from "../src/react/ssr.js";
import type {MarkdownPage} from "../src/markdown.js";

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
// SSG (static HTML extraction)
// =============================================================================

describe("SSG static HTML extraction", () => {
  it("extracts static HTML body from a markdown page", () => {
    const page = {
      body: "<h1>Hello</h1>\n<p>World</p>\n<!--:cell1:--><div class=\"observablehq\">code cell</div>",
      title: "Test",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {toc: {show: true, label: "Contents"}, sql: {}},
      style: null
    } as unknown as MarkdownPage;

    const html = extractStaticHtml(page);
    assert.ok(html.includes("<h1>Hello</h1>"), "should preserve static headings");
    assert.ok(html.includes("<p>World</p>"), "should preserve static paragraphs");
    assert.ok(!html.includes("<!--:cell1:-->"), "should remove cell markers");
  });

  it("returns empty string for a page with only code cells", () => {
    const page = {
      body: "<!--:cell1:--><div class=\"observablehq\">code only</div>",
      title: "Test",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {toc: {show: true, label: "Contents"}, sql: {}},
      style: null
    } as unknown as MarkdownPage;

    const html = extractStaticHtml(page);
    assert.ok(!html.includes("observablehq"), "should not contain cell content");
  });

  it("build shell uses hydrateRoot when bodyHtml is provided", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      bodyHtml: "<h1>Hello</h1>",
      isPreview: false
    });
    assert.ok(html.includes("hydrateRoot"), "should use hydrateRoot for SSG");
    assert.ok(html.includes("<h1>Hello</h1>"), "should include static HTML in root");
  });

  it("build shell uses createRoot when no bodyHtml", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: false
    });
    assert.ok(html.includes("createRoot"), "should use createRoot for CSR");
    assert.ok(!html.includes("hydrateRoot"), "should not use hydrateRoot");
  });
});
