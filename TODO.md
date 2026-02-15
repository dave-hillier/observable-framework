# Observable Framework React Port — Detailed TODO

This document breaks every identified issue into specific, actionable tasks with
exact file paths, line numbers, and descriptions of what to change.

---

## Priority 1 — Critical (Blocks Core Functionality)

### 1.1 Fix `framework-react.ts` Missing Exports

**Issue:** The single client bundle (`framework-react.ts`) is missing 45+ exports.
Compiled pages import from `@observablehq/framework/react/hooks` and
`@observablehq/framework/react/components`, both of which resolve to this file.
Any page using DuckDB, Plot, visualization components, or input components will
crash at runtime with `undefined` import errors.

**File:** `src/client/framework-react.ts`

#### Task 1.1.1 — Add DuckDB exports (CRITICAL — blocks SQL pages)
- Add `export {DuckDBProvider, useDuckDB, useSQL} from "./components/DuckDBProvider.js";`
- Add `export type {DuckDBProviderProps, QueryResult} from "./components/DuckDBProvider.js";`
- **Why:** `compile.ts:100` emits `import {DuckDBProvider} from ...components` when
  `sql:` front-matter is present. Without this export, every SQL page crashes.

#### Task 1.1.2 — Add visualization component exports
- Add `export {PlotFigure, ResponsivePlotFigure} from "./components/PlotFigure.js";`
- Add `export type {PlotFigureProps} from "./components/PlotFigure.js";`
- Add `export {MermaidDiagram} from "./components/MermaidDiagram.js";`
- Add `export type {MermaidDiagramProps} from "./components/MermaidDiagram.js";`
- Add `export {DotDiagram} from "./components/DotDiagram.js";`
- Add `export type {DotDiagramProps} from "./components/DotDiagram.js";`
- Add `export {TexMath} from "./components/TexMath.js";`
- Add `export type {TexMathProps} from "./components/TexMath.js";`

#### Task 1.1.3 — Add all input component exports
- Add exports for all 14 input components from `./components/inputs/`:
  `RangeInput`, `SelectInput`, `TextInput`, `TextAreaInput`, `CheckboxInput`,
  `ToggleInput`, `RadioInput`, `DateInput`, `DateTimeInput`, `ColorInput`,
  `NumberInput`, `SearchInput`, `ButtonInput`, `TableInput`, `FileInput`
- Add corresponding prop type exports for each.

#### Task 1.1.4 — Add missing hook exports
- Add `export {useResize, useResizeRender} from "./hooks/useResize.js";`
- Add `export {useVisibility, useVisibilityPromise} from "./hooks/useVisibility.js";`
- Add `export {useGenerator, useAsyncIterable} from "./hooks/useGenerator.js";`
- Add `export {useSuspenseData, useAsyncData, useData, invalidateData, invalidateAllData} from "./hooks/useData.js";`

#### Task 1.1.5 — Add missing FileAttachment exports
- Add `export {FileAttachment, onFileChange, getFileMetadata} from "./hooks/useFileAttachment.js";`
- Add `export type {FileMetadata, FileAttachmentHandle} from "./hooks/useFileAttachment.js";`

#### Task 1.1.6 — Add missing type exports
- Add `export type {LoadingProps} from "./components/Loading.js";`
- Add `export type {SearchResult} from "./hooks/useSearch.js";`

**Verification:** After changes, compile a page with `sql:` front-matter and
`Inputs.range()` and confirm no runtime import errors in browser console.

---

### 1.2 Fix `React.lazy()` Called Inside Render

**Issue:** `React.lazy()` is called on every render inside `renderRoute()`,
creating a new component identity each time. This causes unmount/remount of the
entire page on every state change — visible flicker, lost component state,
re-triggered Suspense fallback.

**File:** `src/client/components/App.tsx`

#### Task 1.2.1 — Create a lazy component cache
- Add a module-level `Map` before the `App` component (around line 20):
  ```ts
  const lazyCache = new Map<() => Promise<any>, React.LazyExoticComponent<any>>();
  function getLazyComponent(loader: () => Promise<any>) {
    let component = lazyCache.get(loader);
    if (!component) {
      component = lazy(loader);
      lazyCache.set(loader, component);
    }
    return component;
  }
  ```

#### Task 1.2.2 — Replace `lazy()` call in `renderRoute`
- **Line 127:** Change `const LazyPage = lazy(route.component);` to
  `const LazyPage = getLazyComponent(route.component);`

#### Task 1.2.3 — Convert `renderRoute` to a proper React component
- Rename `renderRoute` function (line 121) to `RouteRenderer` component.
- Change its signature from `function renderRoute(route, config, path, onNavigate)`
  to `function RouteRenderer({route, config, path, onNavigate})`.
- Update call sites (lines 101 and 118) from `return renderRoute(...)` to
  `return <RouteRenderer route={...} config={...} ... />`.
- **Why:** A plain function that returns JSX doesn't get its own component identity
  in the React tree. Converting to a component enables React's reconciler to
  preserve the subtree when props haven't changed.

**Verification:** Navigate between pages; confirm no Suspense loading flicker and
component state (e.g., input values) is preserved within a page across re-renders.

---

### 1.3 Fix FileAttachment Broken in Preview Mode

**Issue:** `renderReactPage()` and `renderReactPageModule()` do not pass the
`files` option to `compileMarkdownToReact()`. No `registerFile()` calls are
emitted, so `FileAttachment("data.csv")` silently fails in preview mode.
The build path (`build.ts:394-411`) correctly passes `files: fileRegistrations`.

**File:** `src/react/render.ts`

#### Task 1.3.1 — Compute file registrations in `renderReactPage`
- After line 41 (`const {resolveImport, resolveFile, ...} = resolvers;`), add code
  to build file registrations from `resolvers.files` (a `Set<string>`):
  ```ts
  const fileRegistrations: FileRegistration[] = [];
  for (const name of resolvers.files) {
    fileRegistrations.push({
      name,
      path: resolveFile(name),
    });
  }
  ```
- Import `FileRegistration` type from `./compile.js`.

#### Task 1.3.2 — Pass files to `compileMarkdownToReact` in `renderReactPage`
- **Lines 44-50:** Add `files: fileRegistrations` to the options object:
  ```ts
  const pageModule = compileMarkdownToReact(page, {
    path,
    params: undefined,
    resolveImport,
    resolveFile,
    files: fileRegistrations,  // <-- add this
    sql: data.sql
  });
  ```

#### Task 1.3.3 — Do the same in `renderReactPageModule`
- **Lines 100-106:** Add the same file registration computation and pass `files`.

**Verification:** Create a page with `FileAttachment("data.csv").csv()` in preview
mode. Confirm the data loads without errors.

---

### 1.4 Fix SQL Injection in DuckDBProvider

**Issue:** Table registration uses string interpolation to build SQL. Table names
and file paths are not escaped. A `name` containing `"` or a `fileName` containing
`'` would break out of the SQL literal.

**File:** `src/client/components/DuckDBProvider.tsx`

#### Task 1.4.1 — Create identifier/string escape helpers
- Add helper functions near the top of the file:
  ```ts
  function escapeSqlIdentifier(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
  }
  function escapeSqlString(value: string): string {
    return "'" + value.replace(/'/g, "''") + "'";
  }
  ```

#### Task 1.4.2 — Fix all SQL interpolation sites
- **Line 138:** Change `"${name}"` to `${escapeSqlIdentifier(name)}` and
  `'${fileName}'` to `${escapeSqlString(fileName)}`.
- **Line 141:** Change `'${fileName}'` to `${escapeSqlString(fileName)}` and
  `"${name}"` to `${escapeSqlIdentifier(name)}`.
- **Line 144:** Same pattern.
- **Line 154:** Change `"${name}"` to `${escapeSqlIdentifier(name)}`.

**Verification:** Register a table with a name containing `"` and a file path
containing `'`. Confirm no SQL errors.

---

## Priority 2 — Significant (Should Fix Before Release)

### 2.1 Improve `htmlToJsx` Transformation

**Issue:** The regex-based HTML→JSX converter in `compile.ts:306-321` handles only
9 attribute renames and 4 self-closing tags. Pages with inline styles, SVG content,
or HTML comments will produce React warnings or errors.

**File:** `src/react/compile.ts`, function `htmlToJsx` (lines 306-321)

#### Task 2.1.1 — Strip HTML comments (except cell markers)
- Add at the beginning of `htmlToJsx`:
  `.replace(/<!--(?!:)[^]*?-->/g, "")`
- Cell markers (`<!--:cellId:-->`) are already replaced before `htmlToJsx` is called,
  but any remaining standard HTML comments would break JSX parsing.

#### Task 2.1.2 — Add missing SVG attribute conversions
Add these `.replace()` calls:
- `stroke-linecap=` → `strokeLinecap=`
- `stroke-linejoin=` → `strokeLinejoin=`
- `stroke-opacity=` → `strokeOpacity=`
- `stroke-miterlimit=` → `strokeMiterlimit=`
- `fill-rule=` → `fillRule=`
- `clip-rule=` → `clipRule=`
- `dominant-baseline=` → `dominantBaseline=`
- `alignment-baseline=` → `alignmentBaseline=`
- `font-family=` → `fontFamily=`
- `font-weight=` → `fontWeight=`
- `color-interpolation-filters=` → `colorInterpolationFilters=`
- `marker-start=` → `markerStart=`
- `marker-mid=` → `markerMid=`
- `marker-end=` → `markerEnd=`
- `xlink:href=` → `xlinkHref=`

#### Task 2.1.3 — Add missing HTML attribute conversions
- `colspan=` → `colSpan=`
- `rowspan=` → `rowSpan=`
- `maxlength=` → `maxLength=`
- `readonly` → `readOnly`
- `crossorigin=` → `crossOrigin=`
- `srcset=` → `srcSet=`
- `cellpadding=` → `cellPadding=`
- `cellspacing=` → `cellSpacing=`
- `datetime=` → `dateTime=`
- `accesskey=` → `accessKey=`
- `autocomplete=` → `autoComplete=`

#### Task 2.1.4 — Add missing void element self-closing
Add conversions for: `<source ...>`, `<col ...>`, `<area ...>`, `<embed ...>`,
`<track ...>`, `<wbr>`, `<link ...>`, `<meta ...>`.

#### Task 2.1.5 — Convert inline `style` string attributes to objects
- This is the most complex transformation. Add a regex that finds
  `style="..."` attributes and converts them to `style={{...}}` format.
- Parse the CSS string (`color: red; font-size: 14px`) into camelCase
  properties (`{color: "red", fontSize: "14px"}`).
- **Alternative (simpler):** Use `dangerouslySetInnerHTML` for elements with
  inline styles, or use the jsdom-based approach described in the architecture
  notes (read the HTML with jsdom, walk the tree, and emit JSX).

**Verification:** Write a markdown page with: (a) an inline `<svg>` with
`stroke-linecap`, `dominant-baseline` attributes; (b) a `<table>` with `colspan`;
(c) a `<div style="color: red">`. Confirm no React console warnings.

---

### 2.2 Fix SSR / `extractStaticHtml` Regex Mismatch

**Issue:** The SSR regex expects `<!--:cellId:-->` BEFORE the `<div>`, but the
actual markdown output places it INSIDE the `<div>`. Also, `renderPageToString()`
uses the browser-only `URL.createObjectURL()` and always fails in Node.js.

**File:** `src/react/ssr.ts`

#### Task 2.2.1 — Fix `extractStaticHtml` regex (line 16)
- Change the regex from:
  ```
  /<!--:[^:]+:-->\s*<div[^>]*class="observablehq[^"]*"[^>]*>[\s\S]*?<\/div>/g
  ```
  to match the actual structure (comment inside div):
  ```
  /<div[^>]*class="observablehq[^"]*"[^>]*>[\s\S]*?<\/div>/g
  ```
- This removes the entire `<div class="observablehq ...">...</div>` block
  regardless of where the cell marker comment sits inside it.

#### Task 2.2.2 — Fix `renderPageToString` to work in Node.js
- Replace the `Blob` + `URL.createObjectURL` approach with:
  - Write the module to a temp file: `import {writeFile, unlink} from "node:fs/promises";`
  - `import` the temp file: `const mod = await import(tempPath);`
  - Delete the temp file in `finally`.
- **Alternative:** Use Node.js `vm.Module` (experimental) to evaluate the code
  without a temp file.

#### Task 2.2.3 — Wire SSR into the pipeline
- In `src/react/render.ts`, `renderReactPage()`:
  - After compiling the page module (line 50), call `extractStaticHtml(page)` (or
    `renderPageToString(pageModule, page)` if full SSR is implemented).
  - Pass the result as `bodyHtml` to `generateReactPageShell()`.
- Only do this for production builds (`!preview`), not preview mode.

#### Task 2.2.4 — Export from barrel module
- In `src/react/index.ts`, add:
  `export {extractStaticHtml, renderPageToString} from "./ssr.js";`

**Verification:** Run a production build. Inspect the output HTML files — they
should contain pre-rendered static content inside the `#observablehq-root` div.
Confirm React hydration completes without mismatch warnings in the console.

---

### 2.3 Fix Import Deduplication Dropping Bindings

**Issue:** `collectCellImports` in `compile.ts` deduplicates by specifier. If cell A
imports `{foo}` from `"d3"` and cell B imports `{bar}` from `"d3"`, only cell A's
import statement survives. Cell B's `bar` will be `undefined`.

**File:** `src/react/compile.ts`, function `collectCellImports` (lines 193-221)

#### Task 2.3.1 — Merge imports from the same specifier
- Instead of skipping duplicate specifiers, collect all import bindings per specifier
  and merge them into a single import statement.
- Use the parsed AST import info (`cell.node.imports`) which contains the
  specifier name. For the actual bindings, parse the import statement to extract
  the binding names (or use the `declarations` from the AST if available).
- Build a `Map<string, Set<string>>` of specifier → binding names, then emit one
  `import { ...allBindings } from "specifier";` per specifier.

#### Task 2.3.2 — Handle default + named imports
- When merging, account for default imports (`import d3 from "d3"`) mixed with
  named imports (`import {select} from "d3"`). The merged statement should be:
  `import d3, {select} from "d3";`

#### Task 2.3.3 — Handle namespace imports
- `import * as d3 from "d3"` cannot be merged with named imports. If one cell
  uses a namespace import and another uses named imports from the same specifier,
  keep the namespace import (it includes everything).

**Verification:** Write a two-cell page where cell 1 does
`import {scaleLinear} from "d3"` and cell 2 does `import {select} from "d3"`.
Verify the compiled output has a single import: `import {scaleLinear, select} from "d3";`

---

### 2.4 Fix TableOfContents Stale After Navigation

**Issue:** The heading-scan `useEffect` (line 33-47) has dependency `[selector]`.
Since `selector` never changes across page navigations, the TOC entries never update.

**File:** `src/client/components/TableOfContents.tsx`

#### Task 2.4.1 — Add a `path` or `key` prop to force re-scan
- **Option A (Preferred):** Add a `path` prop to `TableOfContentsProps` and include
  it in the `useEffect` dependency array at line 47:
  `}, [selector, path]);`
  The parent `PageLayout` component should pass the current page path.
- **Option B:** Use a `MutationObserver` on `#observablehq-main` to detect DOM
  content changes and re-scan headings automatically.

#### Task 2.4.2 — Update `PageLayout.tsx` to pass `path`
- Wherever `<TableOfContents>` is rendered in `PageLayout.tsx`, add the current
  path as a prop: `<TableOfContents path={currentPath} ... />`

**Verification:** Navigate from a page with 5 headings to a page with 2 headings.
Confirm the TOC updates to show only 2 entries.

---

### 2.5 Wire Up Route Parameters (`params`)

**Issue:** Both `renderReactPage` and `renderReactPageModule` pass
`params: undefined`. Parameterized routes (`/products/[id].md`) will not work.

**File:** `src/react/render.ts`

#### Task 2.5.1 — Accept and pass `params` in `renderReactPage`
- The `MarkdownPage` object has a `params` field. Pass it through:
  ```ts
  const pageModule = compileMarkdownToReact(page, {
    path,
    params: page.params,  // <-- change from undefined
    ...
  });
  ```

#### Task 2.5.2 — Same for `renderReactPageModule`
- **Line 100-106:** Change `params: undefined` to `params: page.params`.

#### Task 2.5.3 — Verify `compile.ts` handles `params`
- Check that the compiled module makes `params` available to cells. If `compile.ts`
  generates code that reads `params` but never declares it, add code that passes
  `params` as a prop or context value.

**Verification:** Create `/products/[id].md` with a cell that reads
`observable.params.id`. Preview `/products/42`. Confirm the cell outputs `42`.

---

### 2.6 Fix DuckDB Instance Leak on Unmount

**Issue:** `DuckDBProvider.tsx` initializes a DuckDB WASM instance but the cleanup
function (line 277-279) only sets `cancelled = true` — it never calls
`instance.terminate()`, leaking the Web Worker.

**File:** `src/client/components/DuckDBProvider.tsx`

#### Task 2.6.1 — Add `terminate()` to cleanup
- **Lines 277-279:** Change the cleanup function from:
  ```ts
  return () => { cancelled = true; };
  ```
  to:
  ```ts
  return () => {
    cancelled = true;
    dbRef.current?.terminate();
    dbRef.current = null;
  };
  ```

**Verification:** Mount and unmount DuckDBProvider in a test. Verify no lingering
Web Workers in the browser's dev tools.

---

### 2.7 Implement `header` and `footer` Config Options

**Issue:** `renderReactPage` does not pass `header` or `footer` from the config
or page data to the page shell or layout. Pages have no configurable header/footer.

**Files:** `src/react/render.ts`, `src/react/page-template.ts`,
`src/client/components/PageLayout.tsx`

#### Task 2.7.1 — Pass header/footer to the page shell
- In `renderReactPage()`, compute header/footer values from `data.header`
  (per-page) falling back to `options.header` (config-level).
- Pass them to `generateReactPageShell()` as new options.

#### Task 2.7.2 — Render header/footer in PageLayout
- Update `PageLayout` to accept `header` and `footer` props.
- Render `header` above the main content and `footer` below it.
- Both may be HTML strings (from config) — use `dangerouslySetInnerHTML` or
  parse them to JSX similarly to the page body.

---

## Priority 3 — Minor Issues

### 3.1 Fix XSS in Visualization Error Paths

**Files:** `src/client/components/MermaidDiagram.tsx`,
`src/client/components/DotDiagram.tsx`, `src/client/components/TexMath.tsx`

#### Task 3.1.1 — Escape error messages before rendering
- In each file, find where error messages are rendered with `dangerouslySetInnerHTML`
  or injected as raw HTML.
- Replace with text content rendering: `<pre>{error.message}</pre>` instead of
  `<pre dangerouslySetInnerHTML={{__html: error.message}} />`.

---

### 3.2 Fix `escapeJs` and `escapeHtml` in Page Template

**File:** `src/react/page-template.ts`

#### Task 3.2.1 — Fix `escapeJs` (lines 185-187)
Add escaping for:
- `\r` → `\\r`
- `\u2028` → `\\u2028`
- `\u2029` → `\\u2029`
- `</` → `<\\/` (prevents `</script>` injection)
- `'` → `\\'`

#### Task 3.2.2 — Fix `escapeHtml` (lines 181-183)
- Add `'` → `&#39;` escaping.

---

### 3.3 Fix `useNow` Default Interval Documentation

**File:** `src/client/hooks/useNow.ts`

#### Task 3.3.1 — Correct the JSDoc
- Find the JSDoc comment that says "~60fps (16ms)".
- Change it to match the actual default (`1000ms` or whatever the code uses).

---

### 3.4 Fix `useGenerator` Restart on Every Render

**File:** `src/client/hooks/useGenerator.ts`

#### Task 3.4.1 — Use a ref to stabilize the factory reference
- Store the factory in a ref (`useRef`) and only restart the generator when
  the ref identity actually changes (compare with `Object.is`), or document
  that callers must use `useCallback`.
- **Alternative:** Use `useRef(factory)` and update it without restarting, then
  use a separate `deps` array parameter for explicit restart control.

---

### 3.5 Fix `useSearch` Hardcoded Index Path

**File:** `src/client/hooks/useSearch.ts`

#### Task 3.5.1 — Accept `base` as a parameter or from context
- **Line 27:** Change `fetch("/_observablehq/minisearch.json")` to use the
  configured base path: `fetch(\`${base}/_observablehq/minisearch.json\`)`.
- Either accept `base` as a hook parameter or read it from a context/config.

---

### 3.6 Fix `useDark` / `useThemePreference` Disconnection

**File:** `src/client/hooks/useDark.ts`

#### Task 3.6.1 — Add cross-component communication
- The two hooks are disconnected: `useDark` (line 43) reads `localStorage` once on
  mount via `useState(getStoredPreference)` with no setter.
- **Option A:** Share state via a React Context so both hooks read from the same source.
- **Option B:** Add a `storage` event listener in `useDark` (handles cross-tab) and
  a custom event or module-level pub/sub (handles same-tab).

#### Task 3.6.2 — Listen for `storage` events for cross-tab sync
- In `useDark`, add a `useEffect` that listens for `window.addEventListener("storage", handler)`
  where `handler` checks `event.key === STORAGE_KEY` and updates the preference state.

---

### 3.7 Remove or Integrate Dead HMR Module

**File:** `src/react/hmr.ts`

#### Task 3.7.1 — Decision: Remove or integrate
- **Option A (Remove):** Delete `src/react/hmr.ts` and remove its tests from
  `test/react-features-test.ts` (lines 405-414). The inline WebSocket HMR client
  in `page-template.ts` handles all HMR.
- **Option B (Integrate):** Wire `hmr.ts` into the page template's HMR client.
  Dispatch `onHmrEvent("file-change", ...)` when the WebSocket client receives
  a `react-update` message with file changes. This would allow components to
  subscribe to granular file-change events.

---

### 3.8 Fix `config.reactOptions.suspense` Dead Config

**File:** `src/react/compile.ts`

#### Task 3.8.1 — Wire up or remove the `suspense` option
- **Option A:** In `compile.ts`, check `reactOptions.suspense` and conditionally
  wrap cells in `<Suspense>` only when `true`.
- **Option B:** Remove `suspense` from `reactOptions` in config normalization
  since it is not used.

---

### 3.9 Fix Vite Plugin Bugs

**File:** `src/vite/plugin.ts`

#### Task 3.9.1 — Fix file serving path (line 113-114)
- Validate and join `outputPath` with the root directory before reading.

#### Task 3.9.2 — Fix `process.cwd()` usage (line 154)
- Replace `process.cwd()` with the Vite-resolved `config.root` captured from
  `configResolved`.

#### Task 3.9.3 — Fix import resolution (lines 168-172)
- Handle versioned npm specifiers (`npm:d3@7` → strip the version suffix).
- Resolve `observablehq:` specifiers to actual file paths or Vite aliases.

#### Task 3.9.4 — Add source maps (line 179)
- Generate source maps in the `transform()` hook return value.

---

## Priority 4 — Test Coverage

### 4.1 Add Test Infrastructure

#### Task 4.1.1 — Install `@testing-library/react`
- `npm install --save-dev @testing-library/react @testing-library/jest-dom`
- Configure jsdom environment for test files that need DOM rendering.

---

### 4.2 Add CellProvider/CellContext Tests (Priority 1)

**New file:** `test/react-cell-context-test.ts`

#### Test cases:
- [ ] `useCellOutput` publishes a value that `useCellInput` consumers receive
- [ ] Changing an output triggers re-render of subscribing consumers
- [ ] `useCellInput` returns `undefined` for names that haven't been published
- [ ] Multiple consumers of the same cell name all receive updates
- [ ] `useCellContext` throws when used outside `CellProvider`
- [ ] Unsubscribe on unmount does not leak listeners

---

### 4.3 Add ErrorBoundary Tests (Priority 1)

**New file:** `test/react-error-boundary-test.ts`

#### Test cases:
- [ ] Renders children normally when no error
- [ ] Catches thrown error and displays error message
- [ ] Calls custom fallback render function with error and reset callback
- [ ] Reset callback clears error and re-renders children

---

### 4.4 Add Hook Behavioral Tests (Priority 2)

**New file:** `test/react-hooks-test.ts`

#### `useData` tests:
- [ ] `useSuspenseData` throws a Promise while loading (Suspense integration)
- [ ] `useSuspenseData` returns data after resolution
- [ ] `invalidateData` causes re-fetch on next render
- [ ] `useAsyncData` returns `{loading: true}` initially, then `{data, loading: false}`
- [ ] `useAsyncData` handles rejection with `{error}`

#### `useGenerator` tests:
- [ ] Returns `undefined` initially (no initial value)
- [ ] Returns `initialValue` when provided
- [ ] Updates value as generator yields
- [ ] Cleans up generator (`.return()`) on unmount

#### `useNow` tests:
- [ ] Returns a timestamp
- [ ] Updates at the specified interval
- [ ] Cleans up interval on unmount

---

### 4.5 Add `htmlToJsx` Unit Tests (Priority 2)

**New file:** `test/react-html-to-jsx-test.ts`

#### Test cases:
- [ ] `class=` → `className=`
- [ ] `for=` → `htmlFor=`
- [ ] All SVG attributes (one test per attribute)
- [ ] Self-closing: `<br>`, `<hr>`, `<img>`, `<input>`, `<source>`, `<col>`, etc.
- [ ] Inline `style` string → object conversion
- [ ] HTML comments are stripped
- [ ] Does not transform attributes inside quoted strings
- [ ] Does not double-transform already-JSX content

---

### 4.6 Add App Component / Routing Tests (Priority 3)

**New file:** `test/react-app-test.ts`

#### Test cases:
- [ ] Renders the correct page component for a given path
- [ ] Lazy-loads page components with Suspense
- [ ] Navigation between pages updates the displayed content
- [ ] 404 behavior for unknown paths
- [ ] `initialPath` prop controls the first rendered page

---

### 4.7 Add Integration Tests for Import Deduplication

**Extend:** `test/react-compile-test.ts`

#### Test cases:
- [ ] Two cells importing different named bindings from the same module → merged import
- [ ] One cell with namespace import + another with named import → namespace kept
- [ ] Default + named imports from same module → combined import statement

---

## Summary Table

| # | Task | File(s) | Priority | Effort |
|---|------|---------|----------|--------|
| 1.1 | Fix framework-react.ts exports | `src/client/framework-react.ts` | P1-Critical | Small |
| 1.2 | Fix React.lazy() in render | `src/client/components/App.tsx` | P1-Critical | Small |
| 1.3 | Fix FileAttachment in preview | `src/react/render.ts` | P1-Critical | Small |
| 1.4 | Fix SQL injection in DuckDB | `src/client/components/DuckDBProvider.tsx` | P1-Critical | Small |
| 2.1 | Improve htmlToJsx | `src/react/compile.ts` | P2-Significant | Medium |
| 2.2 | Fix SSR / extractStaticHtml | `src/react/ssr.ts`, `render.ts` | P2-Significant | Large |
| 2.3 | Fix import deduplication | `src/react/compile.ts` | P2-Significant | Medium |
| 2.4 | Fix TOC staleness | `src/client/components/TableOfContents.tsx` | P2-Significant | Small |
| 2.5 | Wire up route params | `src/react/render.ts` | P2-Significant | Small |
| 2.6 | Fix DuckDB instance leak | `src/client/components/DuckDBProvider.tsx` | P2-Significant | Small |
| 2.7 | Implement header/footer | `render.ts`, `page-template.ts`, `PageLayout.tsx` | P2-Significant | Medium |
| 3.1 | Fix XSS in viz errors | `MermaidDiagram.tsx`, `DotDiagram.tsx`, `TexMath.tsx` | P3-Minor | Small |
| 3.2 | Fix escapeJs/escapeHtml | `src/react/page-template.ts` | P3-Minor | Small |
| 3.3 | Fix useNow docs | `src/client/hooks/useNow.ts` | P3-Minor | Trivial |
| 3.4 | Fix useGenerator restart | `src/client/hooks/useGenerator.ts` | P3-Minor | Small |
| 3.5 | Fix useSearch base path | `src/client/hooks/useSearch.ts` | P3-Minor | Trivial |
| 3.6 | Fix useDark disconnection | `src/client/hooks/useDark.ts` | P3-Minor | Small |
| 3.7 | Remove/integrate hmr.ts | `src/react/hmr.ts` | P3-Minor | Small |
| 3.8 | Fix dead suspense config | `src/react/compile.ts` or `src/config.ts` | P3-Minor | Trivial |
| 3.9 | Fix Vite plugin bugs | `src/vite/plugin.ts` | P3-Minor | Medium |
| 4.1 | Add test infrastructure | `package.json` | P4-Testing | Small |
| 4.2 | Add CellContext tests | `test/react-cell-context-test.ts` | P4-Testing | Medium |
| 4.3 | Add ErrorBoundary tests | `test/react-error-boundary-test.ts` | P4-Testing | Small |
| 4.4 | Add hook behavioral tests | `test/react-hooks-test.ts` | P4-Testing | Large |
| 4.5 | Add htmlToJsx tests | `test/react-html-to-jsx-test.ts` | P4-Testing | Small |
| 4.6 | Add App routing tests | `test/react-app-test.ts` | P4-Testing | Medium |
| 4.7 | Add import dedup tests | `test/react-compile-test.ts` | P4-Testing | Small |
