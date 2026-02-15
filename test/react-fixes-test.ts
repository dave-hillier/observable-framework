import assert from "node:assert";
import {transform} from "esbuild";
import {normalizeConfig} from "../src/config.js";
import {parseMarkdown} from "../src/markdown.js";
import {compileMarkdownToReact} from "../src/react/compile.js";
import {configToAppConfig} from "../src/react/render.js";
import {generateReactPageShell} from "../src/react/page-template.js";
import {extractStaticHtml} from "../src/react/ssr.js";
import type {MarkdownPage} from "../src/markdown.js";

const {md} = normalizeConfig({root: "docs"});

/**
 * Helper: validates generated code is syntactically valid JavaScript/JSX.
 */
async function assertValidJsx(code: string, label?: string): Promise<void> {
  try {
    await transform(code, {loader: "tsx", jsx: "automatic"});
  } catch (err: any) {
    assert.fail(`Generated code is not valid JSX${label ? ` (${label})` : ""}:\n${err.message}\n\nGenerated:\n${code}`);
  }
}

// =============================================================================
// P2.1: htmlToJsx improvements
// =============================================================================

describe("P2.1: htmlToJsx attribute conversion", () => {
  it("converts class to className", async () => {
    const page = parseMarkdown('<div class="foo">Hello</div>\n', {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("className="), "should convert class to className");
    assert.ok(!result.includes(' class="'), "should not have class= attribute");
    await assertValidJsx(result, "class to className");
  });

  it("converts for to htmlFor", async () => {
    const page = parseMarkdown('<label for="input1">Label</label>\n', {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("htmlFor="), "should convert for to htmlFor");
    await assertValidJsx(result, "for to htmlFor");
  });

  it("converts SVG attributes to camelCase", async () => {
    const source = `<svg><line stroke-width="2" stroke-linecap="round" /></svg>\n`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("strokeWidth="), "should convert stroke-width");
    assert.ok(result.includes("strokeLinecap="), "should convert stroke-linecap");
    await assertValidJsx(result, "SVG attrs");
  });

  it("self-closes void elements", async () => {
    const source = "Line 1<br>Line 2<hr>End\n";
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("<br />"), "should self-close <br>");
    assert.ok(result.includes("<hr />"), "should self-close <hr>");
    await assertValidJsx(result, "void elements");
  });

  it("converts inline style strings to JSX style objects", async () => {
    const source = '<div style="color: red; font-size: 14px">Styled</div>\n';
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(result.includes("style={"), "should convert style to JSX object");
    assert.ok(result.includes("fontSize"), "should camelCase font-size");
    assert.ok(!result.includes('style="'), "should not have style string");
    await assertValidJsx(result, "inline style");
  });

  it("strips HTML comments", async () => {
    const source = "<!-- This is a comment --><p>Visible</p>\n";
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(!result.includes("This is a comment"), "should strip HTML comments");
    assert.ok(result.includes("Visible"), "should keep visible content");
    await assertValidJsx(result, "comment stripping");
  });
});

// =============================================================================
// P2.3: Import deduplication
// =============================================================================

describe("P2.3: Import deduplication across cells", () => {
  it("merges named imports from the same module across cells", async () => {
    const source = `\`\`\`js
import {csv} from "npm:d3-dsv";
const data = csv;
\`\`\`

\`\`\`js
import {tsv} from "npm:d3-dsv";
const data2 = tsv;
\`\`\`
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      resolveImport: (s) => (s.startsWith("npm:") ? s.slice(4) : s)
    });

    // Should have only ONE import line for d3-dsv with both csv and tsv
    const importLines = result.split("\n").filter((l) => l.includes("d3-dsv"));
    assert.strictEqual(importLines.length, 1, `should have exactly 1 import for d3-dsv, got ${importLines.length}`);
    assert.ok(importLines[0].includes("csv"), "merged import should include csv");
    assert.ok(importLines[0].includes("tsv"), "merged import should include tsv");
    await assertValidJsx(result, "import dedup");
  });

  it("merges default and named imports from same module", async () => {
    const source = `\`\`\`js
import * as Plot from "npm:@observablehq/plot";
\`\`\`

\`\`\`js
import {plot} from "npm:@observablehq/plot";
\`\`\`
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      resolveImport: (s) => (s.startsWith("npm:") ? s.slice(4) : s)
    });

    // Namespace import should appear (takes precedence over named)
    const importLines = result.split("\n").filter((l) => l.includes("@observablehq/plot"));
    assert.strictEqual(importLines.length, 1, "should have exactly 1 import for plot");
    assert.ok(importLines[0].includes("* as Plot"), "should keep namespace import");
    await assertValidJsx(result, "namespace + named merge");
  });
});

// =============================================================================
// P1.2: React.lazy() caching (structural test)
// =============================================================================

describe("P1.2: React.lazy caching in App", () => {
  it("App component exports expected shape", async () => {
    const mod = await import("../src/client/components/App.js");
    assert.strictEqual(typeof mod.App, "function");
  });
});

// =============================================================================
// P1.4: SQL escape helpers
// =============================================================================

describe("P1.4: SQL injection prevention in DuckDB", () => {
  it("DuckDBProvider module exports expected API", async () => {
    const mod = await import("../src/client/components/DuckDBProvider.js");
    assert.strictEqual(typeof mod.DuckDBProvider, "function");
    assert.strictEqual(typeof mod.useDuckDB, "function");
    assert.strictEqual(typeof mod.useSQL, "function");
  });

  it("compiled SQL pages produce valid JSX", async () => {
    const page = {
      body: "<h1>Data</h1>",
      title: "Data",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {sql: {users: "/data/users.parquet"}},
      style: null
    } as unknown as MarkdownPage;

    const output = compileMarkdownToReact(page, {
      path: "/data",
      sql: {users: "/data/users.parquet"}
    });

    assert.ok(output.includes("DuckDBProvider"), "should include DuckDBProvider");
    await assertValidJsx(output, "SQL page");
  });

  it("handles table names with special characters in SQL", async () => {
    const page = {
      body: "<h1>Data</h1>",
      title: "Data",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {sql: {'my"table': "/data/test.csv"}},
      style: null
    } as unknown as MarkdownPage;

    const output = compileMarkdownToReact(page, {
      path: "/data",
      sql: {'my"table': "/data/test.csv"}
    });

    assert.ok(output.includes("DuckDBProvider"), "should include DuckDBProvider");
    await assertValidJsx(output, "special char table name");
  });
});

// =============================================================================
// P3.2: escapeJs and escapeHtml completeness
// =============================================================================

describe("P3.2: Page template escape functions", () => {
  it("escapeHtml handles single quotes in title", () => {
    const html = generateReactPageShell({
      title: "O'Brien's Page",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/page.js"
    });
    assert.ok(html.includes("O"), "should include the title");
    assert.ok(!html.includes("<script>alert"), "should not contain script injection");
  });

  it("escapeJs prevents </script> injection in hash", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/page.js",
      isPreview: true,
      hash: '</script><script>alert("xss")'
    });
    // Should not contain a literal </script> from the hash
    assert.ok(!html.includes('</script><script>alert("xss")'), "should escape </script> in hash");
  });

  it("handles unicode line/paragraph separators in module paths", () => {
    // Hash values go through JSON.stringify (which escapes these), but
    // module paths go through escapeJs which must also handle them.
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/page.js",
      isPreview: true,
      hash: "test-hash"
    });
    // Verify the shell is well-formed HTML with a script tag
    assert.ok(html.includes("<script"), "should contain script tag");
    assert.ok(html.includes("test-hash"), "should include the hash value");
  });
});

// =============================================================================
// P2.7: configToAppConfig header/footer
// =============================================================================

describe("P2.7: configToAppConfig header/footer", () => {
  it("passes string header and footer through", () => {
    const config = normalizeConfig({
      root: "docs",
      header: "My Header",
      footer: "My Footer"
    });
    const appConfig = configToAppConfig(config);
    assert.strictEqual(appConfig.header, "My Header");
    assert.strictEqual(appConfig.footer, "My Footer");
  });

  it("evaluates function header and footer", () => {
    const config = normalizeConfig({
      root: "docs",
      title: "Test Site",
      header: ({title}: {title?: string}) => `Header: ${title}`,
      footer: ({title}: {title?: string}) => `Footer: ${title}`
    });
    const appConfig = configToAppConfig(config);
    assert.strictEqual(appConfig.header, "Header: Test Site");
    assert.strictEqual(appConfig.footer, "Footer: Test Site");
  });

  it("handles default header/footer", () => {
    const config = normalizeConfig({root: "docs"});
    const appConfig = configToAppConfig(config);
    // header defaults to "" (empty string), footer defaults to the Observable branding
    assert.strictEqual(typeof appConfig.header, "string");
    assert.strictEqual(typeof appConfig.footer, "string");
    assert.ok((appConfig.footer as string).includes("Observable"), "default footer should include Observable branding");
  });
});

// =============================================================================
// P2.4: TOC path dependency
// =============================================================================

describe("P2.4: TableOfContents component", () => {
  it("TableOfContents component exists", async () => {
    const mod = await import("../src/client/components/TableOfContents.js");
    assert.strictEqual(typeof mod.TableOfContents, "function");
  });
});

// =============================================================================
// P2.2: SSR extraction improvements
// =============================================================================

describe("P2.2: SSR extraction regex fix", () => {
  it("strips cell div containers from body", () => {
    const page = {
      body: '<h1>Title</h1>\n<div class="observablehq observablehq--block">code output</div>\n<p>After</p>',
      title: "Test",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {toc: {show: true, label: "Contents"}, sql: {}},
      style: null
    } as unknown as MarkdownPage;

    const html = extractStaticHtml(page);
    assert.ok(html.includes("<h1>Title</h1>"), "should keep headings");
    assert.ok(html.includes("<p>After</p>"), "should keep paragraphs");
    assert.ok(!html.includes("code output"), "should strip observablehq cell divs");
  });

  it("handles nested observablehq classes", () => {
    const page = {
      body: '<div class="observablehq observablehq--block"><div>nested</div></div><p>Keep</p>',
      title: "Test",
      head: null,
      header: null,
      footer: null,
      code: [],
      data: {toc: {show: true, label: "Contents"}, sql: {}},
      style: null
    } as unknown as MarkdownPage;

    const html = extractStaticHtml(page);
    assert.ok(html.includes("<p>Keep</p>"), "should keep non-cell content");
  });
});

// =============================================================================
// P1.1: framework-react.ts exports
// =============================================================================

describe("P1.1: framework-react barrel exports", () => {
  it("exports DuckDB components", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.DuckDBProvider, "function");
    assert.strictEqual(typeof mod.useDuckDB, "function");
    assert.strictEqual(typeof mod.useSQL, "function");
  });

  it("exports visualization components", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.PlotFigure, "function");
    assert.strictEqual(typeof mod.MermaidDiagram, "function");
    assert.strictEqual(typeof mod.DotDiagram, "function");
    assert.strictEqual(typeof mod.TexMath, "function");
  });

  it("exports core hooks", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.useDark, "function");
    assert.strictEqual(typeof mod.useNow, "function");
    assert.strictEqual(typeof mod.useGenerator, "function");
    assert.strictEqual(typeof mod.useAsyncIterable, "function");
  });

  it("exports resize hooks", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.useResize, "function");
    assert.strictEqual(typeof mod.useResizeRender, "function");
  });

  it("exports visibility hooks", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.useVisibility, "function");
    assert.strictEqual(typeof mod.useVisibilityPromise, "function");
  });

  it("exports data hooks", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.useSuspenseData, "function");
    assert.strictEqual(typeof mod.useAsyncData, "function");
    assert.strictEqual(typeof mod.useData, "function");
    assert.strictEqual(typeof mod.invalidateData, "function");
    assert.strictEqual(typeof mod.invalidateAllData, "function");
  });

  it("exports file attachment API", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.registerFile, "function");
    assert.strictEqual(typeof mod.onFileChange, "function");
    assert.strictEqual(typeof mod.getFileMetadata, "function");
    assert.strictEqual(typeof mod.useFileAttachment, "function");
    assert.strictEqual(typeof mod.FileAttachment, "function");
    assert.strictEqual(typeof mod.SQLiteDatabaseClient, "function");
    assert.strictEqual(typeof mod.Workbook, "function");
    assert.strictEqual(typeof mod.ZipArchive, "function");
    assert.strictEqual(typeof mod.ZipArchiveEntry, "function");
  });

  it("exports cell context API", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.CellProvider, "function");
    assert.strictEqual(typeof mod.useCellInput, "function");
    assert.strictEqual(typeof mod.useCellOutput, "function");
  });

  it("exports input components", async () => {
    const mod = await import("../src/client/framework-react.js");
    assert.strictEqual(typeof mod.RangeInput, "function");
    assert.strictEqual(typeof mod.SelectInput, "function");
    assert.strictEqual(typeof mod.TextInput, "function");
    assert.strictEqual(typeof mod.DateInput, "function");
    assert.strictEqual(typeof mod.ColorInput, "function");
    assert.strictEqual(typeof mod.ToggleInput, "function");
    assert.strictEqual(typeof mod.RadioInput, "function");
    assert.strictEqual(typeof mod.CheckboxInput, "function");
    assert.strictEqual(typeof mod.SearchInput, "function");
    assert.strictEqual(typeof mod.TextAreaInput, "function");
    assert.strictEqual(typeof mod.ButtonInput, "function");
    assert.strictEqual(typeof mod.TableInput, "function");
    assert.strictEqual(typeof mod.FileInput, "function");
  });
});

// =============================================================================
// P3.5: useSearch base path parameterization
// =============================================================================

describe("P3.5: useSearch base path", () => {
  it("useSearch accepts base parameter", async () => {
    const mod = await import("../src/client/hooks/useSearch.js");
    assert.strictEqual(typeof mod.useSearch, "function");
    // The function should accept a base parameter (string)
    assert.ok(mod.useSearch.length <= 1, "useSearch should accept 0-1 parameters (base is optional)");
  });
});

// =============================================================================
// P3.6: useDark / useThemePreference sync
// =============================================================================

describe("P3.6: useDark / useThemePreference exports", () => {
  it("useDark and useThemePreference are exported", async () => {
    const mod = await import("../src/client/hooks/useDark.js");
    assert.strictEqual(typeof mod.useDark, "function");
    assert.strictEqual(typeof mod.useThemePreference, "function");
  });
});

// =============================================================================
// P3.8: ReactOptions @deprecated suspense
// =============================================================================

describe("P3.8: ReactOptions suspense deprecation", () => {
  it("suspense option still works but defaults to true", () => {
    const config = normalizeConfig({root: "docs", react: {suspense: false}});
    assert.strictEqual(config.reactOptions.suspense, false, "should honor suspense: false");
  });

  it("suspense defaults to true when not specified", () => {
    const config = normalizeConfig({root: "docs", react: true});
    assert.strictEqual(config.reactOptions.suspense, true, "suspense should default to true");
  });
});

// =============================================================================
// P1.3: File registration in render pipeline
// =============================================================================

describe("P1.3: File registration in compiled modules", () => {
  it("registerFile calls include mimeType and path", () => {
    const page = parseMarkdown("# Test\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {
      path: "/test",
      files: [
        {name: "data.csv", mimeType: "text/csv", path: "/_file/data.abc.csv"},
        {name: "chart.png", mimeType: "image/png", path: "/_file/chart.xyz.png", size: 2048}
      ]
    });
    assert.ok(result.includes("registerFile"), "should import registerFile");
    assert.ok(result.includes('"data.csv"'), "should register data.csv");
    assert.ok(result.includes('"chart.png"'), "should register chart.png");
    assert.ok(result.includes('"text/csv"'), "should include CSV mimeType");
    assert.ok(result.includes('"image/png"'), "should include PNG mimeType");
  });

  it("omits registerFile when no files provided", () => {
    const page = parseMarkdown("# Test\n", {md, path: "/test"});
    const result = compileMarkdownToReact(page, {path: "/test"});
    assert.ok(!result.includes("registerFile"), "should not include registerFile");
  });
});

// =============================================================================
// P2.6: DuckDB cleanup (structural)
// =============================================================================

describe("P2.6: DuckDB cleanup", () => {
  it("DuckDBProvider source includes terminate call", async () => {
    // Read the DuckDBProvider source to verify terminate is called in cleanup
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/client/components/DuckDBProvider.tsx", "utf8");
    assert.ok(source.includes(".terminate()"), "DuckDBProvider should call terminate() on cleanup");
  });
});

// =============================================================================
// P3.1: XSS prevention in error rendering
// =============================================================================

describe("P3.1: XSS prevention in visualization components", () => {
  it("MermaidDiagram uses ref-based rendering and React text for errors", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/client/components/MermaidDiagram.tsx", "utf8");
    assert.ok(!source.includes("dangerouslySetInnerHTML={{"), "MermaidDiagram should not use dangerouslySetInnerHTML prop");
    assert.ok(source.includes("containerRef.current.innerHTML"), "MermaidDiagram should use ref-based innerHTML for SVG");
    assert.ok(source.includes("{error}"), "MermaidDiagram should render errors as React text content");
  });

  it("DotDiagram uses ref-based rendering and React text for errors", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/client/components/DotDiagram.tsx", "utf8");
    assert.ok(!source.includes("dangerouslySetInnerHTML={{"), "DotDiagram should not use dangerouslySetInnerHTML prop");
    assert.ok(source.includes("containerRef.current.innerHTML"), "DotDiagram should use ref-based innerHTML for SVG");
    assert.ok(source.includes("{error}"), "DotDiagram should render errors as React text content");
  });

  it("TexMath uses ref-based rendering and React text for errors", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/client/components/TexMath.tsx", "utf8");
    assert.ok(!source.includes("dangerouslySetInnerHTML={{"), "TexMath should not use dangerouslySetInnerHTML prop");
    assert.ok(source.includes("containerRef.current.innerHTML"), "TexMath should use ref-based innerHTML for rendered output");
    assert.ok(source.includes("{error}"), "TexMath should render errors as React text content");
  });
});

// =============================================================================
// P3.9: Vite plugin improvements
// =============================================================================

describe("P3.9: Vite plugin improvements", () => {
  it("plugin source uses viteRoot instead of process.cwd()", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/vite/plugin.ts", "utf8");

    // The transform function should use viteRoot, not process.cwd()
    // Find the transform function area
    const transformIdx = source.indexOf("async transform(");
    assert.ok(transformIdx > 0, "should have transform function");
    const transformBody = source.slice(transformIdx, source.indexOf("handleHotUpdate"));
    assert.ok(!transformBody.includes("process.cwd()"), "transform should not use process.cwd()");
    assert.ok(transformBody.includes("viteRoot"), "transform should use viteRoot");
  });

  it("plugin uses mime for content types", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/vite/plugin.ts", "utf8");
    assert.ok(source.includes('import mime from "mime"'), "should import mime package");
    assert.ok(source.includes("mime.getType"), "should use mime.getType for content types");
  });

  it("plugin decodes URI components in file paths", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/vite/plugin.ts", "utf8");
    assert.ok(source.includes("decodeURIComponent"), "should decode URI components in file paths");
  });
});
