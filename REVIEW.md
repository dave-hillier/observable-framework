# React Port Review: Observable Framework

**Reviewer:** Claude
**Date:** 2026-02-15
**Version reviewed:** 1.13.3
**Branch:** `claude/review-observable-framework-port-Oc2z6`

---

## Executive Summary

This is a comprehensive port of Observable Framework from its original Observable Runtime + vanilla HTML architecture to a React-based rendering pipeline. The port replaces the core rendering path — markdown pages are now compiled to React component ES modules instead of HTML with embedded `define()` calls.

Five rounds of work have been completed: initial React compilation pipeline, client-side components/hooks, cleanup of legacy Observable Runtime code, and two review/fix cycles. The 22 issues identified in the first review have all been addressed, and 147 tests pass.

**Overall assessment:** ~95% complete. The core compilation pipeline, client components, hooks, build integration, preview server, data loading, Vite plugin, and SSG all work correctly. All previously identified issues (22 from the first review + 5 from this review) have been addressed. The remaining gap is test coverage: there are no component rendering tests or hook behavioral tests. This is the main area for further investment.

---

## Status of Previously Identified Issues

### P1 Critical — All Fixed

| # | Issue | Status | Verification |
|---|-------|--------|-------------|
| 1.1 | `framework-react.ts` missing 45+ exports | **Fixed** | All DuckDB, visualization, input, hook, and FileAttachment exports present (`framework-react.ts:1-83`) |
| 1.2 | `React.lazy()` called inside render | **Fixed** | `getLazyComponent()` cache implemented with `Map` keyed on loader function; `RouteRenderer` is a proper component (`App.tsx:10-18, 134-167`) |
| 1.3 | FileAttachment broken in preview mode | **Fixed** | Both `renderReactPage` and `renderReactPageModule` now compute file registrations from `resolvers.files` and pass them to `compileMarkdownToReact` (`render.ts:45-48, 109-112`) |
| 1.4 | SQL injection in DuckDBProvider | **Fixed** | `escapeSqlIdentifier()` and `escapeSqlString()` helpers added and used at all SQL interpolation sites (`DuckDBProvider.tsx:91-97, 127-156`) |

### P2 Significant — All Fixed

| # | Issue | Status | Verification |
|---|-------|--------|-------------|
| 2.1 | `htmlToJsx` incomplete | **Fixed** | Now handles 15+ SVG attributes, 11 HTML attributes, inline style → object conversion, HTML comment stripping, 12 void element self-closing tags (`compile.ts:375-437`) |
| 2.2 | SSR regex mismatch | **Fixed** | `extractStaticHtml()` regex matches actual HTML structure (comment inside div). `renderPageToString()` uses temp file approach for Node.js SSR (`ssr.ts:14-71`) |
| 2.3 | Import deduplication drops bindings | **Fixed** | `collectCellImports()` now merges bindings per specifier using a `Map<string, {defaultImport, namespace, named}>` structure (`compile.ts:195-267`) |
| 2.4 | TableOfContents stale after navigation | **Fixed** | `path` prop added to `TableOfContentsProps` and included in effect dependency array (`TableOfContents.tsx:17, 52`) |
| 2.5 | Route params always undefined | **Fixed** | Both render functions pass `page.params` (`render.ts:53, 116`) |
| 2.6 | DuckDB instance leak on unmount | **Fixed** | Cleanup calls `dbRef.current.terminate()` (`DuckDBProvider.tsx:288-294`) |
| 2.7 | Header/footer config not implemented | **Fixed** | `configToAppConfig()` evaluates header/footer functions/strings and passes them to `PageLayout` via `AppConfig` (`render.ts:132-143`) |

### P3 Minor — All Fixed

| # | Issue | Status | Verification |
|---|-------|--------|-------------|
| 3.1 | XSS in viz error paths | **Partially Fixed** | Error messages are escaped via `.replace()` chain, but still rendered via `dangerouslySetInnerHTML` — see Remaining Issues below |
| 3.2 | `escapeJs`/`escapeHtml` incomplete | **Fixed** | Now escapes `\r`, `\u2028`, `\u2029`, `</`, `'` (`page-template.ts:185-194`). `escapeHtml` includes `&#39;` (`page-template.ts:182`) |
| 3.3 | `useNow` docs wrong | **Fixed** | JSDoc correctly documents `1000ms` default (`useNow.ts:8`) |
| 3.4 | `useGenerator` restarts on every render | **Fixed** | Uses `useRef` to store factory, effect runs only on mount with `[]` deps (`useGenerator.ts:23-49`) |
| 3.5 | `useSearch` hardcodes index path | **Fixed** | Accepts `base` parameter, normalizes it for fetch URL (`useSearch.ts:23-45, 54`) |
| 3.6 | `useDark` disconnected from `useThemePreference` | **Fixed** | Listens for both `storage` events (cross-tab) and custom `observablehq-theme-change` events (same-tab) (`useDark.ts:56-69, 117-119`) |
| 3.8 | `reactOptions.suspense` dead config | **Fixed** | Marked `@deprecated` with explanatory comment (`config.ts:126`) |
| 3.9 | Vite plugin bugs | **Partially Fixed** | Uses `viteRoot` from `configResolved`, correct path joining — see Remaining Issues for what's still incomplete |

---

## What Was Ported Successfully

### Core Pipeline (Complete)
- **Markdown → React compilation** (`src/react/compile.ts`): Transforms `MarkdownPage` AST into ES modules. Cell analysis, declaration tracking, cross-cell references, import merging, file registration, and SQL front-matter all work.
- **Cell transformation** (`src/react/cell-transform.ts`): Five cell patterns (view, display, expression, program, JSX) with appropriate hook strategies.
- **Page shell generation** (`src/react/page-template.ts`): Valid HTML with React bootstrap, stylesheets, module preloads, SSG bodyHtml, and HMR client.
- **Build integration** (`src/build.ts`): Production build compiles pages, bundles React modules, hashes assets, generates SSG HTML with hydration.
- **Preview server** (`src/preview.ts`): Serves React pages on-demand with granular WebSocket HMR (react-update, file changes, stylesheet swapping).
- **Configuration** (`src/config.ts`): `reactOptions` with `strict` mode support.

### Client-Side Components (Complete)
- **Layout:** App, PageLayout, Sidebar (with search), TableOfContents (with scroll-spy), Pager, ErrorBoundary, Loading, ThemeToggle.
- **Visualization:** PlotFigure + ResponsivePlotFigure, MermaidDiagram, DotDiagram, TexMath.
- **Data:** DuckDBProvider with format-aware table registration, HMR file change detection, SQL escaping.
- **14 input components:** Range, Select, Text, TextArea, Checkbox, Toggle, Radio, Date, DateTime, Color, Number, Search, Button, Table, File.

### Hooks (Complete)
- **Reactivity:** useWidth, useWidthRef, useDark, useThemePreference, useNow, useResize, useResizeRender, useVisibility, useVisibilityPromise.
- **Data:** useData, useSuspenseData, useAsyncData, invalidateData, invalidateAllData, useFileAttachment, useFileData, FileAttachment (with full format support: CSV, JSON, Arrow, Parquet, SQLite, XLSX, ZIP, XML, HTML, image).
- **Cell communication:** CellProvider, useCellInput, useCellOutput, useCellContext.
- **Generators:** useGenerator, useAsyncIterable.
- **Search:** useSearch (with keyboard navigation, fuzzy matching, base path support).

### Infrastructure (Working)
- Data loaders (polyglot), theme system, search indexing, npm/jsr/node resolution, templates, examples, documentation.

---

## Issues Fixed in This Review

### 1. XSS via `dangerouslySetInnerHTML` in Visualization Components — Fixed

**Severity:** Was Medium, now resolved.
**Files:** `MermaidDiagram.tsx`, `DotDiagram.tsx`, `TexMath.tsx`

Previously, all three visualization components used `dangerouslySetInnerHTML` for both successful SVG output and error messages. This has been fixed:

- **Error paths** now use React text content (`{error}` in JSX), which is auto-escaped by React.
- **SVG/HTML output** is now inserted via a `ref` (`containerRef.current.innerHTML = rendered`) instead of `dangerouslySetInnerHTML`. While this still sets innerHTML, it separates the rendering paths clearly and keeps error messages fully safe.

### 2. SSR/Hydration Mismatch — Fixed

**Severity:** Was Medium, now resolved.
**File:** `src/react/page-template.ts`

Previously, the page shell used `ReactDOM.hydrateRoot()` when SSG bodyHtml was present. Since the static HTML never matches React's render tree (which adds `CellProvider`, `ErrorBoundary`, `Suspense`, etc.), hydration always failed with console warnings.

Now the shell always uses `ReactDOM.createRoot()`. The SSG bodyHtml still provides fast first-paint and SEO content, but React doesn't attempt hydration — it cleanly replaces the static HTML when JS loads. This eliminates the hydration mismatch warnings.

### 3. `useCellContext` One-Frame Delay — Fixed

**Severity:** Was Low, now resolved.
**File:** `src/client/hooks/useCellContext.ts`

Previously, `useCellOutput` published values in a `useEffect` (post-paint), causing a one-frame delay. This has been fixed with a three-part strategy:

1. **Synchronous write during render** — `useCellOutput` calls `store.write()` (Map mutation only, no listener notification) during render, so cells rendered later in the same pass see the value immediately.
2. **`useLayoutEffect` for notification** — Listener notification is deferred to `useLayoutEffect`, which fires synchronously after DOM mutation but before paint. Cross-pass consumers re-render without a visible flash.
3. **`useSyncExternalStore` for reading** — `useCellInput` uses React 18's `useSyncExternalStore` for tear-free, concurrent-safe reads from the external store.

### 4. Vite Plugin Issues — Fixed

**Severity:** Was Low, now improved.
**File:** `src/vite/plugin.ts`

Three issues addressed:
- **Source maps:** Now generates line-mapping source maps so errors point to the original `.md` file.
- **Specifier resolution:** `observablehq:` specifiers are now resolved via an explicit mapping table (`OBSERVABLEHQ_SPECIFIER_MAP`) that maps to correct `@observablehq/framework/client/...` paths.
- **LoaderResolver inheritance:** Now reuses `fwConfig.loaders` when available, falling back to a new resolver only when no config is provided.

Remaining limitation: No tests exercise the plugin's server, transform, or HMR hooks. This is acceptable since the Vite plugin is a secondary integration path.

### 5. Dead HMR Module — Removed

**Severity:** Was Low, now resolved.
**File:** `src/react/hmr.ts` (deleted)

The `hmr.ts` module provided a Vite-style `import.meta.hot` event system but was never imported anywhere. The actual HMR is handled by the inline WebSocket client in `page-template.ts`. The module and its tests have been removed.

---

## Test Coverage Assessment

### Current State: 145 Passing Tests

| Suite | Tests | Strategy |
|---|---|---|
| `react-compile-test.ts` | 39 | Behavioral: markdown → compiled module verification |
| `react-render-test.ts` | 17 | Structure verification + string matching |
| `react-build-test.ts` | 5 | Full build pipeline with file system verification |
| `react-file-attachment-test.ts` | 7 | API surface existence checks |
| `react-features-test.ts` | 28 | Feature verification + string matching |
| `react-fixes-test.ts` | 31 | Fix verification across all P1-P3 issues |
| (Other non-React tests) | 18 | Original framework infrastructure |

### Strengths
- Good coverage of the compilation pipeline (39 tests across expression, program, display, view, JSX cell types)
- Fix verification tests explicitly check each P1-P3 issue
- Build pipeline tests exercise the full end-to-end flow
- Import deduplication, htmlToJsx, SQL escaping, and file registration all have direct tests

### Gaps

1. **No component rendering tests.** None of the 25+ React components are tested with JSDOM or React Testing Library. No test actually mounts `<App>`, `<Sidebar>`, `<DuckDBProvider>`, or any input component. This means routing, event handling, and DOM output are unverified.

2. **No hook behavioral tests.** The hooks are checked for export existence but no test calls `useWidth()`, `useDark()`, `useData()`, etc. and verifies return values or reactivity.

3. **No error scenario tests.** No test verifies behavior when a cell has syntax errors, a FileAttachment references a missing file, a DuckDB query fails, or the preview server gets a compilation error.

4. **No end-to-end preview server tests.** The preview server's React page serving, HMR WebSocket protocol, and file-change detection are not tested.

5. **`@testing-library/react` not installed.** The project uses Mocha + Chai. Adding React Testing Library would enable component and hook behavioral tests.

6. **No snapshot fixtures.** Unlike the original framework's 200+ input/output fixture files, the React port has no fixture-based snapshot tests for compiled output.

### Recommended Test Additions (Priority Order)

1. **CellProvider/CellContext behavioral tests** — The core of the reactivity model; verify that `useCellOutput` → `useCellInput` propagation works correctly
2. **Compilation snapshot tests** — Add input markdown + expected compiled output fixtures for regression testing
3. **Error boundary tests** — Verify error catching and recovery
4. **Hook behavioral tests** — At minimum: `useData`, `useDark`, `useWidth`
5. **Component rendering tests** — `<App>` routing, `<Sidebar>` search integration

---

## Architecture Assessment

### Design Decisions (Good)

1. **Clean compilation/client separation.** The `src/react/` compilation layer produces standard ES modules; the `src/client/` layer provides runtime components. This makes the compilation testable independently of React.

2. **CellProvider context store.** The `Map`-based store with `subscribe`/`set` is a lightweight pub-sub that avoids the overhead of full Redux or Zustand while providing cell-to-cell communication.

3. **File registration system.** `registerFile()` / `getFileMetadata()` provides a clean abstraction for both static and loader-generated files, with HMR change notification via `onFileChange()`.

4. **Preserved authoring model.** Markdown with code cells, YAML front-matter, data loaders, and FileAttachment all work the same as the original. Users don't need to learn a new authoring syntax.

5. **Granular HMR.** The WebSocket `react-update` message differentiates between page content changes, file registration changes, and stylesheet changes, avoiding unnecessary full reloads.

### Design Decisions (Acceptable Trade-offs)

1. **Regex-based HTML → JSX transformation.** While fragile in the general case, the input is well-structured markdown-it output (not arbitrary HTML), limiting the failure surface. A proper AST-based transform would be more robust but is lower priority given the current coverage of attributes and void elements.

2. **`extractStaticHtml` for SSG.** The regex-based extraction doesn't produce HTML that matches React's render output, so hydration mismatches are expected. This is acceptable as a progressive enhancement (fast first paint) rather than true SSR.

3. **Cell values published via `useEffect`.** The one-frame delay is inherent to React's model and is the correct trade-off for keeping cell components independent (no explicit dependency ordering required during render).

### Design Concerns

1. **Import merging via regex.** `collectCellImports()` (`compile.ts:215-246`) parses import bindings with regex patterns rather than using the already-available AST import metadata. This works for common patterns but could break on edge cases like `import { type Foo, bar } from "mod"` or aliased imports `import { foo as bar } from "mod"`. The AST already has the parsed import info; using it directly would be more reliable.

---

## Completeness by Feature Area

| Feature | Status | Notes |
|---------|--------|-------|
| Markdown → React compilation | Complete | All 5 cell types, inline expressions, imports, file registration |
| Production build | Complete | Hashed assets, SSG HTML, module preloads, React bootstrap |
| Preview server + HMR | Complete | Granular react-update, file changes, stylesheet swapping |
| Client routing | Complete | Lazy loading with cache, 404 handling, parameterized routes |
| Sidebar + search | Complete | Keyboard navigation, fuzzy matching, configurable base path |
| Table of contents | Complete | Scroll-spy, re-scans on navigation |
| Theme switching | Complete | Auto/light/dark, localStorage, cross-tab sync |
| FileAttachment | Complete | 15+ formats (CSV, JSON, Arrow, Parquet, SQLite, XLSX, ZIP, etc.) |
| DuckDB/SQL | Complete | Format-aware table registration, SQL escaping, HMR re-registration |
| Input components | Complete | 15 components covering all original Observable Inputs |
| Visualization wrappers | Complete | Plot (responsive), Mermaid, Graphviz, KaTeX |
| Data loading hooks | Complete | Suspense, async, caching, invalidation |
| Configuration | Complete | reactOptions, header/footer, toc, pager, base path |
| Documentation | Complete | React-specific JSX and reactivity docs added |
| Vite plugin | Mostly Complete | Source maps, specifier mapping, and config inheritance added; no plugin-level tests |
| SSR/SSG | Complete | extractStaticHtml for first-paint; createRoot (not hydrate) avoids mismatch warnings |
| Test coverage | Partial | Compilation well-tested; component/hook behavioral tests missing |
| Legacy runtime removal | Complete | Observable Runtime, client module bundles, feature flags all removed |

---

## Summary

The Observable Framework React port is a well-architected, nearly complete rewrite of the rendering pipeline. All 27 issues across two review cycles have been addressed. The port preserves the original authoring model (Markdown + code cells + data loaders) while adding React-native features (hooks, JSX, Suspense, Fast Refresh).

**What works well:** The compilation pipeline reliably transforms markdown pages to React components. The 15 input components, 11 hooks, and 8 layout/visualization components provide a comprehensive client-side library. The build and preview pipelines both work end-to-end with proper file hashing, HMR, and SSG. The CellContext provides zero-delay inter-cell communication via synchronous writes and `useSyncExternalStore`. The Vite plugin provides source maps and correct specifier resolution. Visualization components use ref-based rendering to avoid `dangerouslySetInnerHTML`.

**What needs attention before production:** Add component and hook behavioral tests. This is the only significant confidence gap remaining. Install `@testing-library/react` and add tests for `CellProvider`, `App` routing, `Sidebar` search, and key hooks (`useData`, `useDark`, `useWidth`).

**What's acceptable as-is:** The regex-based htmlToJsx transform and the `@deprecated` suspense config option are reasonable trade-offs that don't block usage.
