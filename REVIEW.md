# React Port Review: Observable Framework

**Reviewer:** Claude
**Date:** 2026-02-15
**Version reviewed:** 1.13.3
**Branch:** `claude/review-observable-framework-port-CQ87E`

---

## Executive Summary

This is a substantial port of Observable Framework from its original Observable Runtime + vanilla HTML architecture to a React-based rendering pipeline. The port replaces the core rendering path — markdown pages are now compiled to React component ES modules instead of HTML with embedded `define()` calls. The scope is ambitious and the overall architecture is sound, but there are several high-severity bugs, missing features, and significant test coverage gaps that would need to be addressed before production use.

**Overall assessment:** ~75% complete. The core compilation pipeline works, but critical gaps in the client module exports, preview-mode file attachments, SSR, and component testing remain.

---

## What Was Ported Successfully

### Core Pipeline (Solid)
- **Markdown → React compilation** (`src/react/compile.ts`): Correctly transforms `MarkdownPage` AST into ES modules that default-export React components. Cell analysis, declaration tracking, cross-cell references, and import hoisting all work for common cases.
- **Cell transformation** (`src/react/cell-transform.ts`): Handles the five cell patterns (view, display, expression, program, JSX) with appropriate React hook strategies (`useMemo` for sync, `useState`+`useEffect` for async).
- **Page shell generation** (`src/react/page-template.ts`): Produces valid HTML documents with React bootstrap, stylesheet loading, and module preloading.
- **Build integration** (`src/build.ts`): The production build correctly compiles pages, bundles React bootstrap modules, hashes assets, and generates SSG HTML.
- **Preview server** (`src/preview.ts`): Serves React pages on-demand with WebSocket-based HMR.
- **Configuration** (`src/config.ts`): Extended with `reactOptions` (`strict`, `suspense`).

### Client-Side Components (Functional)
- **25+ React components** across layout, visualization, inputs, and utilities.
- **11 React hooks** covering reactivity (`useWidth`, `useDark`, `useNow`), data loading (`useData`, `useFileAttachment`), cell communication (`useCellContext`), and search.
- **10 standard library wrappers** (DuckDB, SQLite, Mermaid, Graphviz, KaTeX, Vega-Lite, etc.).
- **14 input components** (Range, Select, Text, Checkbox, Radio, Date, Color, Number, Search, Table, Button, File, Toggle, TextArea).

### Infrastructure (Unchanged / Working)
- Data loader system (`src/loader.ts`) — fully decoupled from rendering, works identically.
- Theme system (`src/theme.ts`) — CSS-based, framework-agnostic.
- Search indexing (`src/search.ts`) — generates MiniSearch JSON identically.
- npm/jsr/node module resolution — unchanged.
- Templates, examples, and documentation — present and largely unchanged.

---

## Critical Issues (Must Fix)

### 1. `framework-react.ts` Missing Exports — Runtime Errors

**File:** `src/client/framework-react.ts`
**Severity:** High

The builtin resolver (`src/resolvers.ts:53-56`) maps both `@observablehq/framework/react/hooks` and `@observablehq/framework/react/components` to `/_observablehq/framework-react.js`. This means compiled page modules import everything from this single bundle. However, it is missing critical exports:

- `DuckDBProvider`, `useDuckDB`, `useSQL` — compiled pages with SQL front-matter import `DuckDBProvider` from the components specifier (`compile.ts:100`), but it is not exported from `framework-react.ts`. **This will crash any page using SQL.**
- `PlotFigure`, `ResponsivePlotFigure` — not exported.
- `MermaidDiagram`, `DotDiagram`, `TexMath` — not exported.
- All input components (`RangeInput`, `SelectInput`, etc.) — not exported.
- `useResize`, `useResizeRender`, `useVisibility`, `useGenerator`, `useAsyncIterable` — not exported.
- `useSuspenseData`, `useAsyncData`, `useData`, `invalidateData` — not exported.
- `FileAttachment` class — not exported (only `registerFile` and `useFileAttachment` are).

**Fix:** Export all public APIs from `framework-react.ts`, or split the builtins into separate bundle entries.

### 2. FileAttachment Not Working in Preview Mode

**File:** `src/react/render.ts:44-50`
**Severity:** High

`renderReactPage()` does not pass the `files` option to `compileMarkdownToReact()`. Without `files`, no `registerFile()` calls are emitted in the compiled module, so `FileAttachment("data.csv")` will fail to resolve at runtime. The build path (`build.ts:407-411`) correctly passes `files: fileRegistrations`.

Similarly, `renderReactPageModule()` (`render.ts:100-106`) also omits `files`.

**Fix:** Compute file registrations from the resolver's `files` set and pass them to `compileMarkdownToReact` in both functions.

### 3. `React.lazy()` Called Inside Render — Remount on Every Navigation

**File:** `src/client/components/App.tsx:128`
**Severity:** High

```tsx
const LazyPage = lazy(route.component);
```

`React.lazy()` is called inside `renderRoute`, which executes on every render. This creates a new component identity each time, causing React to unmount and remount the lazy component (including re-triggering Suspense) on every render cycle. This defeats lazy loading's purpose and causes visible flicker during navigation.

**Fix:** Memoize lazy components — e.g., build a `Map<string, React.LazyExoticComponent>` keyed on route path, populated once per route.

### 4. SQL Injection in DuckDBProvider

**File:** `src/client/components/DuckDBProvider.tsx:138-144`
**Severity:** High (security)

Table registration uses string interpolation to build SQL:
```ts
`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM parquet_scan('${fileName}')`
```

If `name` or `fileName` contain quotes or SQL metacharacters, this is exploitable. While the values typically come from front-matter config (not user input), data loader file paths could contain special characters.

**Fix:** Use parameterized queries or properly escape identifiers/strings.

---

## Significant Issues (Should Fix)

### 5. `htmlToJsx` Transformation Is Incomplete

**File:** `src/react/compile.ts:306-321`

Only handles 8 attribute renames and 4 self-closing tags. Missing:
- `style="..."` string attributes (JSX requires `style={{...}}` objects) — will cause React warnings for any markdown-generated HTML with inline styles.
- SVG attributes: `stroke-linecap`, `stroke-linejoin`, `dominant-baseline`, `font-family`, `xlink:href`, etc.
- Self-closing tags: `<source>`, `<meta>`, `<link>`, `<col>`, `<area>`, `<embed>`, `<track>`, `<wbr>`.
- Boolean attributes: `checked`, `disabled`, `selected`, `readonly`.
- HTML comments (`<!-- -->`) not stripped — JSX does not support HTML comments.

This will cause React warnings or errors for many real-world markdown pages, especially those with SVG content or inline styles.

### 6. SSR Is Not Wired Into the Pipeline

**File:** `src/react/ssr.ts`

Two issues:
1. `renderPageToString()` uses `URL.createObjectURL()` which is a browser-only API — it will always fail in Node.js, falling back to `extractStaticHtml()`.
2. The build pipeline (`build.ts:453`) calls `extractStaticHtml()` directly rather than `renderPageToString()`. Since `renderPageToString()` cannot work in Node.js anyway, only the regex-based extraction is functional.
3. `extractStaticHtml()` produces HTML that will likely mismatch what React renders, causing React to discard the server HTML during hydration and re-render from scratch, negating the SSG benefit.

### 7. Import Deduplication Drops Bindings

**File:** `src/react/compile.ts:198-203`

`collectCellImports` deduplicates by specifier: if two cells import different bindings from the same module (e.g., `import {foo} from "d3"` and `import {bar} from "d3"`), only the first cell's import is kept. The second cell's bindings (`bar`) will be undefined at runtime.

### 8. `useCellContext` One-Frame Delay

**File:** `src/client/hooks/useCellContext.ts`

`useCellOutput` publishes values in a `useEffect`, meaning values aren't available until after the first render commits. Cells reading from upstream cells via `useCellInput` will see `undefined` for one frame. Observable's runtime resolves cells synchronously in dependency order; this React implementation may cause brief flashes of missing data.

### 9. TableOfContents Stale After Navigation

**File:** `src/client/components/TableOfContents.tsx`

The heading scan effect depends only on `[selector]`, not on content changes. When navigating between pages, the headings DOM changes but the effect doesn't re-fire, leaving the TOC showing entries from the previous page.

### 10. Duplicate/Disconnected HMR Systems

**Files:** `src/react/hmr.ts` and `src/react/page-template.ts`

Two independent HMR systems exist:
- `page-template.ts` has an inline WebSocket client (handles `react-update`, `reload`, `welcome`).
- `hmr.ts` has a Vite-based event system (handles `observable:file-change`, `observable:config-change`).

These are not connected. `hmr.ts` is never imported or initialized anywhere. The inline client in `page-template.ts` is the only functional HMR system.

### 11. Vite Plugin Has Multiple Bugs

**File:** `src/vite/plugin.ts`

- **Line 114:** File serving middleware uses `outputPath` directly without joining with the root directory — file reads will fail.
- **Line 154:** Uses `process.cwd()` instead of Vite's resolved `config.root`.
- **Lines 168-174:** Import resolution is oversimplified — `observablehq:` specifiers are rewritten to `@observablehq/framework/...` which may not resolve.
- **Line 179:** Source maps are TODO (`map: null`).
- Creates its own `LoaderResolver` without inheriting config interpreters.

### 12. `header` and `footer` Config Options Not Implemented

**File:** `src/react/render.ts`

The `Config` supports `header` and `footer` functions/strings, and `MarkdownPage` has `header`/`footer` fields, but `renderReactPage` does not pass them to the shell or page layout. Pages will have no configurable header/footer content.

---

## Minor Issues

### 13. XSS in Visualization Error Paths
`MermaidDiagram.tsx`, `DotDiagram.tsx`, and `TexMath.tsx` inject error messages as raw HTML via `dangerouslySetInnerHTML`. Error messages should be escaped.

### 14. `escapeJs` in `page-template.ts` Is Incomplete
Does not escape `</script>` sequences, which could prematurely close the script tag if interpolated values contain that string.

### 15. `useNow` Default Interval Documentation Is Wrong
JSDoc says "~60fps (16ms)" but the actual default is `1000ms`.

### 16. `useGenerator` Restarts on Every Render
The `useEffect` depends on `[factory]`, but `factory` is a function that gets a new reference each render unless the caller uses `useCallback`. The generator will restart constantly unless callers know to memoize.

### 17. DuckDB Instance Not Cleaned Up on Unmount
`DuckDBProvider.tsx` initializes a DuckDB WASM instance but never calls `instance.terminate()` in the cleanup path. This leaks Web Workers.

### 18. `useSearch` Hardcodes Index Path
`/_observablehq/minisearch.json` is hardcoded. If the `base` path is not `/`, this will fail.

### 19. `useDark` Does Not React to Runtime Changes
`useDark` reads the stored preference once on mount but never updates when `useThemePreference` changes the value from another component or tab (no `storage` event listener).

### 20. Missing Barrel Exports
- `ThemeToggle` not exported from `components/index.ts`.
- `useSearch`, `useThemePreference` not exported from `hooks/index.ts`.
- `extractStaticHtml`, `renderPageToString` not exported from `react/index.ts`.
- `hmr.ts` functions not exported from `react/index.ts`.

### 21. `config.reactOptions.suspense` Is Dead
Declared in config normalization but never read by any rendering code. Cells are always wrapped in `<Suspense>` regardless.

### 22. `params` Always `undefined`
Both `renderReactPage` and `renderReactPageModule` pass `params: undefined`. Parameterized routes (`/products/[id].md`) will not receive their parameter values in compiled cells.

---

## Test Coverage Assessment

### Current State: 88 Passing Tests
| Suite | Tests | Strategy |
|---|---|---|
| `react-compile-test.ts` | 37 | String matching on generated code |
| `react-render-test.ts` | 23 | String matching + structure verification |
| `react-build-test.ts` | 5 | Build output file verification |
| `react-file-attachment-test.ts` | 12 | API surface existence checks |
| `react-features-test.ts` | 11 | Feature existence + string matching |

### Major Test Gaps

1. **Zero component rendering tests.** None of the 25+ React components are tested with JSDOM or React Testing Library. No rendering, event handling, or DOM output is verified.

2. **Zero hook behavioral tests.** The 11 hooks are only checked for export existence. No test actually calls a hook and verifies its return value or side effects.

3. **No error case tests.** No test verifies behavior when: a cell has syntax errors, a file attachment references a missing file, a DuckDB query fails, or the preview server encounters a compilation error.

4. **JSX cell mode untested.** The `compileJsxCell` code path in `cell-transform.ts` has zero test coverage.

5. **No integration tests for preview server.** The preview server's React page serving, HMR WebSocket protocol, and file-change detection are not tested.

6. **No test fixtures.** Unlike the original Observable Framework tests (which have 150+ input files and 200+ expected output files), the React port has no fixture-based snapshot tests.

7. **Untested code paths:**
   - `renderPageToString()` in `ssr.ts`
   - `generateAppEntryModule()` in `page-template.ts`
   - `hmr.ts` event system
   - `visibility` and `invalidation` builtins
   - Destructured declarations (`const {a, b} = ...`)
   - Generator cells (`yield` patterns)
   - `let`/`var` declarations in cells

---

## Architecture Notes

### Design Decisions (Good)
- Clean separation between compilation (`react/`) and client (`client/`) layers.
- Cell communication via React Context (`CellProvider` / `useCellInput` / `useCellOutput`) is a reasonable approach for replacing Observable Runtime's reactive dataflow.
- File registration system (`registerFile`) provides a clean abstraction for both static and loader-generated files.
- The build pipeline correctly produces standalone HTML pages (not an SPA), matching the original framework's static-site model.

### Design Decisions (Questionable)
- **Regex-based HTML → JSX transformation** is fundamentally fragile. A proper HTML-to-JSX AST transformation (using the already-available jsdom) would be more robust.
- **Regex-based import hoisting** from cell source code, when the AST import info is already available, creates unnecessary fragility.
- **Two separate HMR systems** (`hmr.ts` vs. inline WebSocket client) create confusion. One should be chosen and the other removed.
- **`extractStaticHtml` as the SSG strategy** produces HTML that doesn't match React's render output, making hydration unreliable. Either true SSR should be implemented (write temp modules to disk, import in Node.js) or SSG should be abandoned in favor of pure CSR with a loading shell.

---

## Recommended Priority Order for Fixes

1. **Fix `framework-react.ts` exports** — blocks any page using DuckDB, Plot, visualization, or input components.
2. **Fix `React.lazy()` in render** — causes visible re-mount flicker on every navigation.
3. **Pass `files` in preview mode** — blocks FileAttachment in development.
4. **Fix import deduplication** — silently breaks pages importing multiple bindings from the same module.
5. **Improve `htmlToJsx`** — blocks pages with inline styles or rich SVG.
6. **Fix DuckDB SQL injection** — security issue.
7. **Fix TOC staleness** — broken UX after navigation.
8. **Wire up `params`** — blocks parameterized routes.
9. **Add component/hook tests** — largest quality/confidence gap.
10. **Resolve HMR duplication** — architectural cleanup.
