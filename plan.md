# Phase 8: FileAttachment Format Completeness & Data Loaders

## Overview

Implements the remaining FileAttachment format methods and verifies data loader
integration for React mode.

## What was done

### 8.1: SQLite support — `file.sqlite()`
- Implemented `SQLiteDatabaseClient` class mirroring `src/client/stdlib/sqlite.js`
- Dynamically imports `sql.js` with WASM locator via `import.meta.resolve`
- Full API: `query()`, `queryRow()`, `explain()`, `describeTables()`,
  `describeColumns()`, `sql()` tagged template, `dialect` property
- Singleton promise pattern for lazy initialization

### 8.2: XLSX support — `file.xlsx()`
- Implemented `Workbook` class mirroring `src/client/stdlib/xlsx.js`
- Dynamically imports `exceljs` at first use
- `Workbook.load(buffer)` → `workbook.sheet(name, {range, headers})`
- Full cell value extraction (formulas, rich text, hyperlinks)
- Range parsing (A1:Z10 format), header row support, duplicate column handling

### 8.3: ZIP support — `file.zip()`
- Implemented `ZipArchive` and `ZipArchiveEntry` classes mirroring `src/client/stdlib/zip.js`
- Dynamically imports `jszip` at first use
- `ZipArchive.from(buffer)` → `archive.file(path)`, `archive.filenames`
- `ZipArchiveEntry` with `url()`, `blob()`, `arrayBuffer()`, `text()`, `json()`

### 8.4: Additional methods for feature parity
- `dsv({delimiter, typed, array})` — generic delimiter-separated values
- `csv()` and `tsv()` now delegate to `dsv()` for consistency
- `xml(mimeType)` — parse as XML via DOMParser
- `html()` — parse as HTML (delegates to xml with text/html)
- Improved `arrow()` to use arrayBuffer instead of Response
- Added fetch error checking (`response.ok`) to all fetch-based methods
- Added cross-origin handling for `image()`

### 8.5: Data loaders verification
- Data loaders already work in React mode — the `/_file/` handler in `preview.ts`
  is shared between standard and React modes
- Production builds use the same `loaders.find()` system
- No changes needed

### 8.6: Tests
- 12 new tests in `test/react-file-attachment-test.ts`
- API surface completeness, url resolution, register/unregister
- Class structure verification for SQLiteDatabaseClient, Workbook, ZipArchive, ZipArchiveEntry
- All 77 React tests pass (37 compile + 23 render + 5 build + 12 file attachment)

## Remaining gaps

- **Search**: Sidebar search input captures state but doesn't query minisearch.json
- **Theme toggle**: Only system preference, no user-initiated switching
- **Granular HMR**: React preview does full page reload instead of cell-level patches
