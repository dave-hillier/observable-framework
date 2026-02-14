# Phase 5: Production Build for React Mode

## Overview

When `config.react` is true, the build should produce a client-side React SPA
instead of per-page static HTML with Observable Runtime. The output structure
changes from many `.html` files to a single shell HTML + bundled React app with
code-split page modules.

## Architecture

**Current build (Observable):**
```
for each page → renderPage() → {path}.html (self-contained HTML with inline define() calls)
```

**React build:**
```
1. Compile each page → React component module (JS)
2. Generate app entry module (imports App + routes with lazy page imports)
3. Bundle everything via rollup (React, framework-react, app entry, page chunks)
4. Write single index.html shell + JS/CSS bundles
```

## Tasks

### 5.1: Add React client bundles to the build

**File:** `src/build.ts` (lines 183-195)

The existing loop bundles `/_observablehq/*.js` client files. For React mode,
we also need to bundle:
- `/_observablehq/react-bootstrap.js` (React)
- `/_observablehq/react-dom-bootstrap.js` (ReactDOM)
- `/_observablehq/framework-react.js` (App, hooks, components)

These are already client files at `src/client/` so they'll be picked up by
`getClientPath()`. We just need to ensure they're added to `globalImports`
when React mode is on.

**Changes:**
- After the page loading loop (line 142), if `config.react`, add the three
  React modules to `globalImports`
- They'll flow through the existing bundle + hash pipeline automatically

### 5.2: Compile page modules as JS assets

**File:** `src/build.ts` (lines 364-377)

Currently each page is rendered to HTML via `renderPage()`. In React mode,
each page should instead be compiled to a JS module via
`compileMarkdownToReact()` and written as a hashed JS file.

**Changes:**
- In the render loop, when `config.react && output.type === "page"`:
  - Call `renderReactPageModule(page, options)` to get the JS module source
  - Write it to `/_observablehq/react-pages/{path}.{hash}.js`
  - Track the alias so the app entry can reference hashed paths
- Still add page to manifest

### 5.3: Generate and bundle the app entry module

**File:** `src/build.ts` (new section between asset processing and rendering)

The app entry module ties everything together: it imports App, defines routes
pointing to the compiled page modules, and mounts the React root.

**Changes:**
- After all page modules are compiled and hashed, call
  `generateAppEntryModule(config, routes)` where routes reference the
  hashed page module paths
- Write the entry module to cache, then bundle it with rollup
- Output as `/_observablehq/app.{hash}.js`

### 5.4: Write React HTML shell instead of per-page HTML

**File:** `src/build.ts` (lines 364-377)

Instead of writing N individual HTML files, write a single `index.html`
(and copies at each route path for direct-URL access / static hosting).

**Changes:**
- After bundling the app entry, call `generateReactPageShell()` with:
  - All hashed stylesheet paths
  - The hashed app entry module path
  - `isPreview: false`
- Write this shell HTML to every page path (so `/foo/index.html` loads the
  same shell but client-side routing takes over)
- This ensures static hosting works (any URL → same shell → React router)

### 5.5: Skip Observable-only client bundles in React mode

**File:** `src/build.ts` (lines 183-195)

When `config.react` is true, the Observable Runtime, stdlib, and client
modules are not needed. Skip bundling them to reduce output size.

**Changes:**
- Guard the default `globalImports` additions with `!config.react`:
  - `observablehq:client` → skip
  - `observablehq:runtime` → skip
  - `observablehq:stdlib` → skip
- The resolvers already add these implicitly; need to also guard that in
  `src/resolvers.ts` (the `defaultImports` array at line 47)

### 5.6: Add build test fixture for React mode

**Files:**
- `test/input/build/react-simple/` — test input directory
- `test/output/build/react-simple/` — expected output snapshot

**Structure of test input:**
```
test/input/build/react-simple/
├── observablehq.config.js   (react: true, title, pages)
├── index.md                  (simple page with code cell)
└── about.md                  (static page)
```

**Expected output structure:**
```
test/output/build/react-simple/
├── _observablehq/
│   ├── react-bootstrap.{hash}.js
│   ├── react-dom-bootstrap.{hash}.js
│   ├── framework-react.{hash}.js
│   ├── app.{hash}.js
│   ├── react-pages/
│   │   ├── index.{hash}.js
│   │   └── about.{hash}.js
│   └── theme-*.{hash}.css
├── index.html                (React shell)
└── about.html                (same React shell, for direct URL access)
```

### 5.7: Add build integration tests

**File:** `test/react-build-test.ts`

Tests verifying:
- React build produces correct output files (no Observable runtime)
- Each page route has an HTML file with the React shell
- Page modules are valid JS containing `export default function Page()`
- App entry references all page routes with lazy imports
- Content hashes are applied to all JS/CSS assets
- Build manifest includes all pages

## Execution Order

1. **5.1** — Add React client bundles to globalImports
2. **5.5** — Skip Observable-only bundles in React mode
3. **5.2** — Compile pages to JS modules instead of HTML
4. **5.3** — Generate and bundle app entry
5. **5.4** — Write React shell HTML to all route paths
6. **5.6** — Create test fixture
7. **5.7** — Write and run tests

## Key Design Decisions

- **Single shell HTML at every route** rather than a single `index.html` with
  a 404-based fallback. This ensures compatibility with static hosting (GitHub
  Pages, S3, Netlify) without requiring server-side redirect rules.

- **Code-split page modules** rather than one big bundle. Each page is a
  separate chunk loaded lazily by the App router, matching the existing
  `RouteDefinition.component: () => import(...)` pattern.

- **Reuse existing asset pipeline.** Files, stylesheets, npm imports, and
  local imports all flow through the same hash/alias/copy pipeline. Only the
  final render step changes.
