# Phase 9: Search, Theme, HMR, Data Loaders & SSG

## Overview

Implements the remaining high/medium priority items: search functionality,
theme switching, granular HMR, data loader live reload, and SSG.

## What was done

### 9.1: Search functionality
- Created `useSearch` hook (`src/client/hooks/useSearch.ts`)
  - Lazy-loads minisearch.json from `/_observablehq/minisearch.json`
  - Implements same search options as standard mode (title/keyword boost, fuzzy, prefix)
  - Returns query state, results, active index, keyboard handler
- Updated `Sidebar.tsx` to integrate search:
  - Shows results list when query is non-empty, hides page nav
  - Keyboard navigation: ArrowUp/Down, Enter to navigate, Escape to clear
  - Mouse hover to select, Ctrl/Cmd+Enter for new tab
  - `data-shortcut` attribute for keyboard shortcut hint
  - Global keyboard shortcut: Meta+K or / to focus search
  - Results styled with `data-score` and `observablehq-link-active` classes

### 9.2: Theme switching
- Enhanced `useDark` hook with three-way mode: auto/light/dark
  - Reads stored preference from `localStorage["observablehq-theme"]`
  - `auto` follows system preference, `light`/`dark` force mode
  - Applies `data-theme` attribute to `<html>` element
- Created `useThemePreference` hook for full control
  - Returns `{preference, setPreference, dark}`
  - Persists choice to localStorage, removes key for "auto"
- Created `ThemeToggle` component
  - Cycles auto → light → dark → auto
  - Shows icon (◑ ☀ ☾) and tooltip with current/next mode
  - Exported from framework-react.ts

### 9.3: Data loader live reload
- Modified `preview.ts` React handler to send `{type: "react-update"}` instead of
  `{type: "reload"}`
- The react-update message includes:
  - `pageChanged: boolean` — whether page HTML/code changed
  - `files: {removed, added}` — file registration diffs
  - `stylesheets: {removed, added}` — stylesheet diffs
  - `hash: {previous, current}` — for sync detection
- When only files change (data loader output), client updates registrations
  without a full page reload

### 9.4: Granular HMR for React preview
- Replaced Vite-style `import.meta.hot` stub with full WebSocket HMR client
  in `page-template.ts`
- Client handles three message types:
  - `welcome` — connection established, hashes match
  - `reload` — full page reload (fallback)
  - `react-update` — granular update:
    - Updates file registrations in-place via `registerFile()`
    - Swaps stylesheets without reload
    - Re-imports page module with cache-busting when content changed
    - Falls back to full reload if hash out of sync
- Hash is passed from server at page render time for sync detection
- `registerFile` exported from framework-react.ts for client-side use

### 9.5: SSG (Static Site Generation)
- Created `extractStaticHtml()` in `src/react/ssr.ts`
  - Strips Observable cell markers and code cell divs from markdown body
  - Preserves static HTML content (headings, paragraphs, tables, etc.)
  - Cleans up empty paragraphs and excessive whitespace
- Wired into build pipeline (`src/build.ts`):
  - Each React page now has pre-rendered static HTML in the root div
  - Uses `ReactDOM.hydrateRoot()` instead of `createRoot().render()`
  - Provides instant content display before JS loads (SEO, performance)
- Preview mode still uses CSR (no bodyHtml)

### 9.6: Tests
- 11 new tests in `test/react-features-test.ts`:
  - Search hook export verification
  - Theme hook and component export verification
  - HMR client presence/absence in preview/build shells
  - Hash propagation in hello message
  - SSG HTML extraction (static content, code-only pages)
  - Hydration vs CSR mode selection
- Updated HMR test in `react-render-test.ts` for new WebSocket approach
- All 88 React tests pass

## Test summary
- 37 compile tests
- 23 render tests
- 5 build tests
- 12 file attachment tests
- 11 feature tests
- Total: 88 passing

## Remaining gaps
- **Advanced DuckDB** — Basic useSQL works but implicit data-loader-to-table
  registration is untested
- **Vite integration** — The Vite plugin (`src/vite/plugin.ts`) exists but
  is separate from the main preview server; could be unified
