import assert from "node:assert";
import {normalizeConfig} from "../src/config.js";
import {parseMarkdown} from "../src/markdown.js";
import {compileMarkdownToReact} from "../src/react/compile.js";
import {
  configToAppConfig,
  generateRouteDefinitions,
  generateRouteDefinitionsModule,
  renderReactPageModule
} from "../src/react/render.js";
import {generateReactPageShell, generateAppEntryModule} from "../src/react/page-template.js";

const testConfig = normalizeConfig({
  root: "docs",
  title: "Test Site",
  pages: [
    {name: "Getting Started", path: "/getting-started"},
    {
      name: "Guides",
      pages: [
        {name: "Charts", path: "/guides/charts"},
        {name: "Tables", path: "/guides/tables"}
      ]
    }
  ],
  react: true
});

const {md} = testConfig;

// =============================================================================
// Phase 3.1: React page renderer (renderReactPageModule)
// =============================================================================

describe("Phase 3.1: renderReactPageModule", () => {
  it("compiles a markdown page to a React module via renderReactPageModule", async () => {
    const source = `---
title: Hello World
---

# Hello

Some text.

\`\`\`js
const x = 42;
\`\`\`
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const module = await renderReactPageModule(page, {...testConfig, path: "/test"});
    assert.ok(module.includes("export default function Page()"), "should export a default Page component");
    assert.ok(module.includes("CellProvider"), "should include CellProvider");
  });

  it("compiles a static page with no code to a valid module", async () => {
    const page = parseMarkdown("# Static\n\nJust text.", {md, path: "/static"});
    const module = await renderReactPageModule(page, {...testConfig, path: "/static"});
    assert.ok(module.includes("export default function Page()"));
  });
});

// =============================================================================
// Phase 3.2: Route definitions from config
// =============================================================================

describe("Phase 3.2: generateRouteDefinitions", () => {
  it("generates routes for index and all config pages", () => {
    const routes = generateRouteDefinitions(testConfig);
    assert.ok(routes.length >= 4, `expected at least 4 routes, got ${routes.length}`);

    // Index route
    const indexRoute = routes.find((r) => r.path === "/");
    assert.ok(indexRoute, "should have an index route");
    assert.strictEqual(indexRoute!.title, "Test Site");
    assert.strictEqual(indexRoute!.prev, null);

    // Getting started route
    const gsRoute = routes.find((r) => r.path === "/getting-started");
    assert.ok(gsRoute, "should have getting-started route");
    assert.strictEqual(gsRoute!.title, "Getting Started");

    // Charts route (in section)
    const chartsRoute = routes.find((r) => r.path === "/guides/charts");
    assert.ok(chartsRoute, "should have guides/charts route");
    assert.strictEqual(chartsRoute!.title, "Charts");
  });

  it("computes prev/next pager links correctly", () => {
    const routes = generateRouteDefinitions(testConfig);

    // Index has no prev
    const indexRoute = routes.find((r) => r.path === "/")!;
    assert.strictEqual(indexRoute.prev, null);
    assert.ok(indexRoute.next, "index should have a next link");

    // Last route has no next
    const lastRoute = routes[routes.length - 1];
    assert.strictEqual(lastRoute.next, null);
    assert.ok(lastRoute.prev, "last route should have a prev link");
  });
});

// =============================================================================
// Phase 3.3: Config to AppConfig conversion
// =============================================================================

describe("Phase 3.3: configToAppConfig", () => {
  it("converts Observable config to React AppConfig format", () => {
    const appConfig = configToAppConfig(testConfig);
    assert.strictEqual(appConfig.title, "Test Site");
    assert.strictEqual(appConfig.sidebar, true);
    assert.strictEqual(appConfig.search, false);
    assert.strictEqual(appConfig.pager, true);
    assert.ok(Array.isArray(appConfig.pages), "pages should be an array");
  });

  it("converts pages with sections to SidebarItem format", () => {
    const appConfig = configToAppConfig(testConfig);
    const pages = appConfig.pages!;

    // First item should be a plain page
    const firstPage = pages[0] as {name: string; path: string};
    assert.strictEqual(firstPage.name, "Getting Started");
    assert.strictEqual(firstPage.path, "/getting-started");

    // Second item should be a section
    const section = pages[1] as {name: string; pages: {name: string; path: string}[]};
    assert.strictEqual(section.name, "Guides");
    assert.ok(Array.isArray(section.pages));
    assert.strictEqual(section.pages.length, 2);
    assert.strictEqual(section.pages[0].name, "Charts");
  });

  it("includes toc config", () => {
    const appConfig = configToAppConfig(testConfig);
    assert.ok(appConfig.toc !== undefined, "should include toc");
  });
});

// =============================================================================
// Phase 3.4 & 3.5: TOC and Pager (handled client-side and via route defs)
// =============================================================================

describe("Phase 3.4/3.5: TOC and Pager integration", () => {
  it("compiled page includes headings that TOC component can discover", async () => {
    const source = `# Main Title

## Section One

Some text.

## Section Two

More text.
`;
    const page = parseMarkdown(source, {md, path: "/test"});
    const module = await renderReactPageModule(page, {...testConfig, path: "/test"});
    // The compiled HTML should preserve heading IDs for the TableOfContents
    // component to find via its IntersectionObserver
    assert.ok(module.includes("section-one") || module.includes("Section One"),
      "should preserve heading content for TOC discovery");
  });

  it("route definitions include pager links", () => {
    const routes = generateRouteDefinitions(testConfig);
    const gsRoute = routes.find((r) => r.path === "/getting-started");
    assert.ok(gsRoute);
    assert.ok(gsRoute!.prev, "should have prev link");
    assert.ok(gsRoute!.next, "should have next link");
    assert.ok(gsRoute!.prev!.name, "prev link should have a name");
    assert.ok(gsRoute!.prev!.path, "prev link should have a path");
  });
});

// =============================================================================
// Phase 4.1: React page shell generation
// =============================================================================

describe("Phase 4.1: generateReactPageShell", () => {
  it("generates valid HTML with React mount point", () => {
    const html = generateReactPageShell({
      title: "Test Page",
      siteTitle: "Test Site",
      stylesheets: ["/_observablehq/theme-light.css"],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      base: "/",
      isPreview: true
    });
    assert.ok(html.includes("<!DOCTYPE html>"), "should be a full HTML document");
    assert.ok(html.includes("observablehq-root"), "should have React mount point");
    assert.ok(html.includes("Test Page | Test Site"), "should have combined title");
    assert.ok(html.includes("react-bootstrap.js"), "should load React bootstrap");
    assert.ok(html.includes("react-dom-bootstrap.js"), "should load ReactDOM bootstrap");
    assert.ok(html.includes("framework-react.js"), "should load framework React module");
    assert.ok(html.includes("react-pages/test.js"), "should load compiled page module");
  });

  it("includes HMR support in preview mode", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: true
    });
    assert.ok(html.includes("import.meta.hot"), "should include HMR support");
  });

  it("excludes HMR support in build mode", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/test.js",
      isPreview: false
    });
    assert.ok(!html.includes("import.meta.hot"), "should not include HMR in build mode");
  });

  it("includes stylesheets", () => {
    const html = generateReactPageShell({
      stylesheets: ["/style1.css", "/style2.css"],
      modulePreloads: [],
      pageModulePath: "/page.js"
    });
    assert.ok(html.includes('href="/style1.css"'));
    assert.ok(html.includes('href="/style2.css"'));
  });
});

// =============================================================================
// Phase 4.2: App entry module generation
// =============================================================================

describe("Phase 4.2: generateAppEntryModule", () => {
  it("generates a valid app entry module", () => {
    const routes = [
      {path: "/", modulePath: "./src/index.md", title: "Home"},
      {path: "/about", modulePath: "./src/about.md", title: "About"}
    ];
    const module = generateAppEntryModule(testConfig, routes);
    assert.ok(module.includes("import React"), "should import React");
    assert.ok(module.includes("import ReactDOM"), "should import ReactDOM");
    assert.ok(module.includes("App"), "should reference App component");
    assert.ok(module.includes("routes"), "should define routes");
    assert.ok(module.includes("createRoot"), "should create React root");
    assert.ok(module.includes("./src/index.md"), "should include index route module");
    assert.ok(module.includes("./src/about.md"), "should include about route module");
  });
});

// =============================================================================
// Phase 4.2: Route definitions module generation
// =============================================================================

describe("Phase 4.2: generateRouteDefinitionsModule", () => {
  it("generates a JavaScript module with route array", () => {
    const module = generateRouteDefinitionsModule(testConfig);
    assert.ok(module.includes("export const routes"), "should export routes");
    assert.ok(module.includes('path: "/"'), "should include index path");
    assert.ok(module.includes('path: "/getting-started"'), "should include page paths");
    assert.ok(module.includes("component: () => import("), "should have lazy imports");
  });

  it("uses custom moduleBasePath", () => {
    const module = generateRouteDefinitionsModule(testConfig, {moduleBasePath: "./src"});
    assert.ok(module.includes("./src/index.js"), "should use custom base path");
  });
});

// =============================================================================
// Config react flag
// =============================================================================

describe("Config: react flag", () => {
  it("defaults react to false", () => {
    const config = normalizeConfig({root: "docs"});
    assert.strictEqual(config.react, false);
  });

  it("sets react to true when specified", () => {
    const config = normalizeConfig({root: "docs", react: true});
    assert.strictEqual(config.react, true);
  });
});

// =============================================================================
// Phase 7.2: Custom head content in React shell
// =============================================================================

describe("Phase 7.2: Custom head content in React shell", () => {
  it("includes custom head content when provided", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/page.js",
      head: '<script async src="https://www.googletagmanager.com/gtag/js"></script>'
    });
    assert.ok(html.includes("googletagmanager.com"), "should include the custom head content");
    assert.ok(html.includes("</head>"), "should still close the head tag");
    // Verify the head content is inside <head>
    const headStart = html.indexOf("<head>");
    const headEnd = html.indexOf("</head>");
    const headContentPos = html.indexOf("googletagmanager.com");
    assert.ok(headContentPos > headStart && headContentPos < headEnd, "head content should be inside <head>");
  });

  it("omits custom head content when not provided", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/page.js"
    });
    // Should not have any empty lines from missing head
    assert.ok(html.includes("</head>"), "should still have closing head tag");
    assert.ok(!html.includes("undefined"), "should not include literal 'undefined'");
  });

  it("supports multiple head elements", () => {
    const headContent = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">`;
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/page.js",
      head: headContent
    });
    assert.ok(html.includes("fonts.googleapis.com"), "should include font preconnect");
    assert.ok(html.includes("family=Inter"), "should include font stylesheet");
  });
});

// =============================================================================
// Phase 7.3: Base path handling in shell
// =============================================================================

describe("Phase 7.3: Base path in React shell", () => {
  it("uses base path for bootstrap module URLs", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/page.js",
      base: "/myapp/"
    });
    assert.ok(html.includes("/myapp/_observablehq/react-bootstrap.js"), "should prefix react-bootstrap with base");
    assert.ok(html.includes("/myapp/_observablehq/react-dom-bootstrap.js"), "should prefix react-dom-bootstrap with base");
    assert.ok(html.includes("/myapp/_observablehq/framework-react.js"), "should prefix framework-react with base");
  });

  it("uses hashed paths when provided (build mode)", () => {
    const html = generateReactPageShell({
      title: "Test",
      stylesheets: [],
      modulePreloads: [],
      pageModulePath: "/_observablehq/react-pages/index.abc123.js",
      reactBootstrapPath: "/_observablehq/react-bootstrap.abc123.js",
      reactDomBootstrapPath: "/_observablehq/react-dom-bootstrap.def456.js",
      frameworkReactPath: "/_observablehq/framework-react.ghi789.js",
      base: "/"
    });
    assert.ok(html.includes("react-bootstrap.abc123.js"), "should use hashed react-bootstrap path");
    assert.ok(html.includes("react-dom-bootstrap.def456.js"), "should use hashed react-dom-bootstrap path");
    assert.ok(html.includes("framework-react.ghi789.js"), "should use hashed framework-react path");
  });
});
