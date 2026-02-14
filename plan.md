# Phase 6: Feature Parity — Search, FileAttachment Methods, and Test Coverage

## Overview

With the core React build and rendering pipeline complete (Phases 1–5), this
phase fills in the remaining feature gaps needed for practical use: sidebar
search (using the existing MiniSearch index), the three missing FileAttachment
data loaders (`sqlite`, `xlsx`, `zip`), and comprehensive test coverage for
the new React components and hooks.

## Current Status

| Area | Status |
|------|--------|
| Sidebar search | UI exists but not connected to MiniSearch index |
| `FileAttachment.sqlite()` | Throws "not implemented" |
| `FileAttachment.xlsx()` | Throws "not implemented" |
| `FileAttachment.zip()` | Throws "not implemented" |
| Component/hook tests | Only compile + render + build tests exist |

## Tasks

### 6.1: Implement sidebar search with MiniSearch

The Observable search system builds a `minisearch.json` index at build time
(via `src/search.ts`) and the vanilla JS client (`src/client/search.js`) loads
it at runtime. The React Sidebar has a search input (`Sidebar.tsx:105-114`)
that captures `searchQuery` state but doesn't do anything with it.

**Files to change:**
- `src/client/components/Sidebar.tsx` — wire search input to MiniSearch results
- `src/client/hooks/useSearch.ts` — **new file**: hook to load and query the
  MiniSearch index

**Hook design (`useSearch`):**
```typescript
function useSearch(query: string): {results: SearchResult[]; loading: boolean}
```
- Lazily loads `minisearch.json` on first query (dynamic `fetch()`)
- Builds a `MiniSearch` instance from the JSON (using `MiniSearch.loadJS()`)
- Returns search results: `{title, path, score}[]`
- Debounces the query by ~150ms to avoid searching on every keystroke

**Sidebar changes:**
- Import and use `useSearch(searchQuery)` when `search` prop is true
- When `searchQuery` is non-empty, render search results list instead of page
  navigation (matching the Observable behavior of hiding pages during search)
- Each result is a clickable link using `onNavigate`
- Show "no results" message when query returns empty
- Keyboard shortcut (Cmd/Ctrl+K) to focus the search input

### 6.2: Implement `FileAttachment.sqlite()`

**File:** `src/client/hooks/useFileAttachment.ts` (line 145)

The Observable stdlib (`src/client/stdlib/sqlite.js`) uses `sql.js` (a
WebAssembly SQLite implementation). Port the same approach:

```typescript
async sqlite() {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/sql.js/dist/${file}`
  });
  const buffer = await this.arrayBuffer();
  return new SQL.Database(new Uint8Array(buffer));
}
```

Return a `sql.js` Database object. Users can call `.exec()`, `.prepare()`, etc.

### 6.3: Implement `FileAttachment.xlsx()`

**File:** `src/client/hooks/useFileAttachment.ts` (line 149)

The Observable stdlib uses the `exceljs` library. Port:

```typescript
async xlsx() {
  const ExcelJS = await import("exceljs");
  const buffer = await this.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}
```

Return an ExcelJS Workbook object with `.worksheets`, `.getWorksheet()`, etc.

### 6.4: Implement `FileAttachment.zip()`

**File:** `src/client/hooks/useFileAttachment.ts` (line 153)

The Observable stdlib (`src/client/stdlib/zip.js`) uses `JSZip`. Port:

```typescript
async zip() {
  const JSZip = (await import("jszip")).default;
  const buffer = await this.arrayBuffer();
  const archive = await JSZip.loadAsync(buffer);
  return {
    filenames: Object.keys(archive.files).filter((n) => !archive.files[n].dir),
    file(path: string) {
      const entry = archive.file(path);
      if (!entry || entry.dir) throw new Error(`file not found: ${path}`);
      return {
        async text() { return entry.async("text"); },
        async json() { return JSON.parse(await entry.async("text")); },
        async arrayBuffer() { return entry.async("arraybuffer"); },
        async blob() { return entry.async("blob"); }
      };
    }
  };
}
```

### 6.5: Add tests for useSearch hook and sidebar search

**File:** `test/react-search-test.ts` — **new file**

Tests:
- `useSearch` returns empty results for empty query
- `useSearch` fetches and loads minisearch.json
- `useSearch` returns matching results for a query
- Sidebar renders search input when `search={true}`
- Sidebar hides page list and shows results during search

### 6.6: Add tests for FileAttachment methods

**File:** `test/react-file-attachment-test.ts` — **new file**

Tests:
- `createFileAttachment(name)` returns correct url/name/mimeType
- `.text()` fetches and returns string
- `.json()` fetches and parses JSON
- `.csv()` parses CSV with d3-dsv
- `.sqlite()` loads and queries a SQLite database
- `.xlsx()` loads an Excel workbook
- `.zip()` opens and reads entries from a ZIP archive

### 6.7: Add tests for visualization components

**File:** `test/react-components-test.ts` — **new file**

Unit-level tests for component output (testing the generated module source, not
DOM rendering):
- `PlotFigure` generates SVG via @observablehq/plot
- `MermaidDiagram` renders mermaid markup
- `TexMath` renders LaTeX via KaTeX
- `DotDiagram` renders Graphviz DOT
- `ErrorBoundary` catches and displays errors
- `Loading` renders a loading indicator

### 6.8: Add tests for input components

**File:** `test/react-inputs-test.ts` — **new file**

Tests verifying the cell compilation pipeline generates correct code for inputs:
- `view(Inputs.range(...))` compiles to RangeInput with useCellOutput wiring
- `view(Inputs.select(...))` compiles to SelectInput
- `view(Inputs.text(...))` compiles to TextInput
- `view(Inputs.button(...))` compiles to ButtonInput
- `view(Inputs.table(...))` compiles to TableInput
- Verify that input values flow through CellProvider context

## Execution Order

1. **6.1** — Sidebar search (highest user-facing impact)
2. **6.2–6.4** — FileAttachment methods (sqlite, xlsx, zip)
3. **6.5** — Search tests
4. **6.6** — FileAttachment tests
5. **6.7–6.8** — Component and input tests

## Key Design Decisions

- **`useSearch` as a separate hook** rather than inlining in Sidebar. This
  keeps Sidebar focused on rendering and lets the search logic be tested
  independently. The hook can also be reused if search is ever exposed as a
  standalone component.

- **Dynamic imports for heavy libraries** (sql.js, exceljs, jszip). These are
  large WASM/JS bundles that should only be loaded when the user actually calls
  the corresponding FileAttachment method, not at page load.

- **Match Observable stdlib behavior exactly** for sqlite/xlsx/zip return types.
  Users who migrate from Observable mode to React mode should get the same
  objects back from FileAttachment methods.
