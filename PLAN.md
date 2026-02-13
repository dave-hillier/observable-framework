# Observable Framework → React Port: Architecture Plan

## Executive Summary

This document describes how to port Observable Framework from its current architecture
(Observable Runtime dataflow graph + server-rendered HTML strings + direct DOM manipulation)
to an idiomatic React-based architecture (React components + hooks + JSX + virtual DOM reconciliation).

The port preserves the core value proposition—markdown-based reactive data apps with
file-based data loaders—while replacing the internal execution model with React idioms.

---

## Part 1: Architectural Analysis — What Must Change

### 1.1 Current Architecture (Observable)

```
Markdown → parse → extract code cells → analyze deps → transpile to define() calls
                                                              ↓
                                              Observable Runtime (dataflow graph)
                                                              ↓
                                              Direct DOM manipulation via comment nodes
```

**Key mechanisms:**
- `@observablehq/runtime` maintains a reactive dependency graph of "variables"
- Each code block becomes a `define({id, inputs, outputs, body})` call
- `inputs` are resolved by name from the runtime's module scope
- When an input changes, all dependent cells re-execute automatically
- Display is via direct DOM insertion before HTML comment markers (`<!--:cellId:-->`)
- The `display()` function imperatively inserts DOM nodes
- The `view()` function wraps an HTML input element into a generator
- Generators (`async function*`) are first-class reactive primitives

### 1.2 Target Architecture (React)

```
Markdown → parse → extract code cells → compile to React components
                                              ↓
                                   React component tree with hooks
                                              ↓
                                   React reconciliation (virtual DOM)
```

**Key mechanisms:**
- Each page becomes a React component tree
- Reactive state uses `useState` / `useReducer` / context
- Dependency tracking uses `useMemo` / `useEffect` with explicit dependency arrays
- Display is via JSX return values (declarative)
- Inputs are controlled React components with `value` + `onChange`
- Generators become custom hooks that manage subscriptions
- Data loading uses React Suspense or data-fetching hooks

### 1.3 Core Paradigm Differences

| Concept | Observable | React |
|---------|-----------|-------|
| Reactivity | Implicit (name-based dep tracking) | Explicit (hooks with dep arrays) |
| State | Mutable variables, generators | Immutable state via `useState` |
| Display | Imperative `display()` | Declarative JSX return |
| Composition | Flat cells sharing a namespace | Component tree with props |
| Side effects | Implicit in cell body | Explicit `useEffect` |
| Async | Top-level await, generators | Suspense, `useEffect`, `use()` |
| DOM access | Direct manipulation | Refs (`useRef`) |
| Lifecycle | `invalidation` promise | `useEffect` cleanup |

---

## Part 2: Component Architecture

### 2.1 Page Component Model

Each markdown page compiles to a React component:

```tsx
// Generated from src/pages/dashboard.md
import { PageLayout } from '@observablehq/framework/react';
import { useFileAttachment, useWidth, useDark } from '@observablehq/framework/react/hooks';

export default function DashboardPage() {
  return (
    <PageLayout title="Dashboard" toc={true}>
      <h1>Dashboard</h1>
      <p>Some markdown content...</p>
      <Cell_abc123 />
      <p>More markdown...</p>
      <Cell_def456 />
    </PageLayout>
  );
}
```

### 2.2 Cell → Component Mapping

Each Observable code cell becomes a React component. The key insight: cells that
declare variables become **context providers**, and cells that reference variables
become **context consumers**.

**Current (Observable):**
```js
// Cell 1: declares `data`
const data = await FileAttachment("sales.csv").csv({typed: true});

// Cell 2: references `data`, declares `filtered`
const region = view(Inputs.select(["North", "South"]));
const filtered = data.filter(d => d.region === region);

// Cell 3: references `filtered`
Plot.plot({marks: [Plot.dot(filtered, {x: "x", y: "y"})]})
```

**Target (React):**
```tsx
// Approach: Page-level state with context
function DashboardPage() {
  const data = useData(() => FileAttachment("sales.csv").csv({typed: true}));
  const [region, setRegion] = useState("North");
  const filtered = useMemo(() => data.filter(d => d.region === region), [data, region]);

  return (
    <PageLayout>
      <Suspense fallback={<Loading />}>
        <InputSelect
          options={["North", "South"]}
          value={region}
          onChange={setRegion}
        />
        <PlotFigure
          options={{marks: [Plot.dot(filtered, {x: "x", y: "y"})]}}
        />
      </Suspense>
    </PageLayout>
  );
}
```

### 2.3 The CellContext System

To preserve Observable's flat-namespace cell model while being React-idiomatic,
we introduce a `CellContext`:

```tsx
// Framework-provided context for inter-cell communication
const CellContext = createContext<Map<string, any>>(new Map());

function CellProvider({ children }) {
  const [cells, setCells] = useState(new Map());
  const defineCell = useCallback((name: string, value: any) => {
    setCells(prev => new Map(prev).set(name, value));
  }, []);
  return (
    <CellContext.Provider value={{ cells, defineCell }}>
      {children}
    </CellContext.Provider>
  );
}

// Hook for cells to declare outputs
function useCellOutput(name: string, value: any) {
  const { defineCell } = useContext(CellContext);
  useEffect(() => { defineCell(name, value); }, [name, value, defineCell]);
}

// Hook for cells to consume inputs
function useCellInput<T>(name: string): T {
  const { cells } = useContext(CellContext);
  return cells.get(name) as T;
}
```

### 2.4 Built-in Component Library

Replace Observable Inputs with React components:

```tsx
// Current Observable
const x = view(Inputs.range([0, 100], {label: "Value"}));

// React equivalent
function RangeInput({ domain, label, value, onChange }) {
  return (
    <label>
      {label}
      <input type="range" min={domain[0]} max={domain[1]}
             value={value} onChange={e => onChange(+e.target.value)} />
    </label>
  );
}

// Usage in page component
const [x, setX] = useState(50);
<RangeInput domain={[0, 100]} label="Value" value={x} onChange={setX} />
```

Full component list to implement:
- `<RangeInput>`, `<NumberInput>`, `<TextInput>`, `<TextAreaInput>`
- `<SelectInput>`, `<RadioInput>`, `<CheckboxInput>`, `<ToggleInput>`
- `<DateInput>`, `<ColorInput>`, `<FileInput>`
- `<SearchInput>`, `<TableInput>`, `<ButtonInput>`
- `<PlotFigure>` — wrapper around Observable Plot
- `<DuckDBProvider>` / `useSQL()` — DuckDB integration
- `<MermaidDiagram>`, `<TexMath>`, `<DotDiagram>`

---

## Part 3: Hooks Library

### 3.1 Core Hooks

```tsx
// Reactive width (replaces Observable's `width` generator)
function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// Reactive dark mode (replaces Observable's `dark` generator)
function useDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark;
}

// Current time (replaces Observable's `now` generator)
function useNow(interval = 1000 / 60): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

// File attachment (replaces Observable's FileAttachment)
function useFileAttachment(name: string) {
  return useMemo(() => ({
    async csv(opts?) { /* fetch + parse */ },
    async json() { /* fetch + parse */ },
    async text() { /* fetch */ },
    async arrayBuffer() { /* fetch */ },
    async parquet() { /* fetch + parse */ },
    url() { return resolveFile(name); }
  }), [name]);
}

// Async data loading with Suspense
function useData<T>(loader: () => Promise<T>): T {
  // Uses React's `use()` or a Suspense-compatible cache
  return use(useMemo(loader, []));
}

// Resize observer for responsive charts
function useResize<T>(render: (width: number, height: number) => T): [RefObject<HTMLDivElement>, T] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({width: 0, height: 0});
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({width: entry.contentRect.width, height: entry.contentRect.height});
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const result = useMemo(() => render(size.width, size.height), [size.width, size.height, render]);
  return [ref, result];
}

// Observable generator → React hook adapter
function useGenerator<T>(generator: () => AsyncGenerator<T>): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let cancelled = false;
    const gen = generator();
    (async () => {
      for await (const v of gen) {
        if (cancelled) break;
        setValue(v);
      }
    })();
    return () => { cancelled = true; gen.return(undefined); };
  }, [generator]);
  return value;
}

// Visibility hook (replaces Observable's `visibility()`)
function useVisibility(ref: RefObject<HTMLElement>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}
```

### 3.2 Mutable → useState Migration

```tsx
// Observable: Mutable
const count = Mutable(0);
// In another cell:
count.value = count.value + 1;

// React: Just useState (shared via context if cross-cell)
const [count, setCount] = useState(0);
setCount(prev => prev + 1);
```

---

## Part 4: Build Pipeline Changes

### 4.1 Markdown → React Compilation

Replace the current `markdown.ts` → `transpile.ts` → `render.ts` pipeline.

**Current pipeline:**
```
.md → markdown-it → HTML string + code[] → transpileJavaScript → define() calls → HTML page
```

**New pipeline:**
```
.md → markdown-it → AST + code[] → compileToReact → JSX component → React page
```

The key transformation: instead of emitting `define({id, inputs, outputs, body})`,
emit React component definitions with hooks.

```tsx
// New: src/react/compile.ts
function compileMarkdownToReact(page: MarkdownPage, options: CompileOptions): string {
  const imports = new Set<string>();
  const stateDeclarations: string[] = [];
  const cellComponents: string[] = [];

  for (const {id, node, mode} of page.code) {
    // Analyze cell: what it declares (outputs) and references (inputs)
    const {declarations, references} = node;

    // Generate state for each declared variable
    for (const decl of declarations ?? []) {
      stateDeclarations.push(
        `const [${decl.name}, set${capitalize(decl.name)}] = useState(undefined);`
      );
    }

    // Generate cell component
    cellComponents.push(compileCellToComponent(id, node, mode));
  }

  return generatePageComponent(page, imports, stateDeclarations, cellComponents);
}
```

### 4.2 New File Structure

```
src/
├── bin/observable.ts          # CLI (keep, update commands)
├── build.ts                   # Build pipeline (rewrite for React)
├── preview.ts                 # Dev server (integrate with Vite/React refresh)
├── config.ts                  # Config (keep mostly as-is)
├── loader.ts                  # Data loaders (keep as-is)
├── route.ts                   # Routing (keep as-is)
├── markdown.ts                # Markdown parsing (keep, change output)
├── javascript/                # JS analysis (keep)
│   ├── parse.ts
│   ├── imports.ts
│   ├── references.ts
│   └── ...
├── react/                     # NEW: React compilation
│   ├── compile.ts             # Markdown → React component compiler
│   ├── cell-transform.ts      # Cell → component transformation
│   ├── page-template.ts       # Page component template
│   └── hmr.ts                 # Hot module replacement
├── client/                    # Client runtime (rewrite)
│   ├── App.tsx                # Root React app component
│   ├── PageLayout.tsx         # Layout with sidebar, header, footer
│   ├── Sidebar.tsx            # Sidebar navigation component
│   ├── Search.tsx             # Search component
│   ├── TableOfContents.tsx    # TOC component
│   ├── Loading.tsx            # Suspense fallback
│   ├── ErrorBoundary.tsx      # Error display
│   ├── hooks/                 # React hooks
│   │   ├── useWidth.ts
│   │   ├── useDark.ts
│   │   ├── useNow.ts
│   │   ├── useFileAttachment.ts
│   │   ├── useData.ts
│   │   ├── useResize.ts
│   │   ├── useGenerator.ts
│   │   ├── useVisibility.ts
│   │   └── useCellContext.ts
│   ├── components/            # Built-in React components
│   │   ├── inputs/
│   │   │   ├── RangeInput.tsx
│   │   │   ├── SelectInput.tsx
│   │   │   ├── TextInput.tsx
│   │   │   ├── TableInput.tsx
│   │   │   └── ...
│   │   ├── PlotFigure.tsx
│   │   ├── MermaidDiagram.tsx
│   │   ├── TexMath.tsx
│   │   └── DotDiagram.tsx
│   └── stdlib/                # Standard library (adapt)
│       ├── duckdb.ts
│       ├── sqlite.ts
│       └── ...
└── style/                     # CSS (keep as-is)
```

### 4.3 Build Tool Integration

Replace esbuild+rollup with **Vite** for:
- React JSX/TSX compilation
- React Fast Refresh (HMR)
- CSS modules support
- Production bundling (via Rollup under the hood)
- Dev server with HMR

```ts
// New: vite.config.ts (generated per project)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { observablePlugin } from '@observablehq/framework/vite';

export default defineConfig({
  plugins: [
    react(),
    observablePlugin({
      // Transforms .md files into React components
      // Handles data loader execution
      // Manages file attachments
    })
  ]
});
```

### 4.4 Vite Plugin for Observable Markdown

```ts
// src/vite/plugin.ts
function observablePlugin(config: Config): VitePlugin {
  return {
    name: 'observable-framework',

    // Transform .md files to React components
    async transform(code, id) {
      if (!id.endsWith('.md')) return;
      const page = parseMarkdown(code, {path: id});
      const react = compileMarkdownToReact(page, config);
      return { code: react, map: null };
    },

    // Serve data loader outputs
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/_file/')) {
          // Execute data loader and serve result
        }
        next();
      });
    }
  };
}
```

---

## Part 5: Migration of Core Systems

### 5.1 Reactivity: Observable Runtime → React Hooks

**Observable Runtime removal:** The `@observablehq/runtime` dependency is removed entirely.
Its responsibilities are replaced by:

| Runtime feature | React replacement |
|----------------|-------------------|
| Dependency graph | Component tree + hooks dep arrays |
| Variable definition | `useState` + `useContext` |
| Async computation | `Suspense` + `use()` |
| Generator variables | `useGenerator` custom hook |
| `display()` | JSX return value |
| `view()` | Controlled component pattern |
| `invalidation` | `useEffect` cleanup return |
| `visibility()` | `useVisibility` hook with IntersectionObserver |
| Error handling | React Error Boundaries |
| Pending state | Suspense fallbacks |

### 5.2 Display System

**Current:** Cells call `display(value)` imperatively. Values are DOM nodes inserted
before comment markers.

**New:** Cells return JSX. The compilation step transforms expression cells:

```js
// Observable cell (expression, implicit display):
Plot.plot({marks: [Plot.dot(data, {x: "x", y: "y"})]})

// Compiled React:
function Cell_abc123() {
  const data = useCellInput("data");
  return <PlotFigure options={{marks: [Plot.dot(data, {x: "x", y: "y"})]}} />;
}
```

For imperative code blocks with explicit `display()`:
```js
// Observable:
const el = document.createElement("div");
el.textContent = "Hello";
display(el);

// React (preserve imperative code via ref):
function Cell_def456() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = "Hello";
  }, []);
  return <div ref={ref} />;
}
```

### 5.3 Hot Module Replacement

**Current:** Custom WebSocket protocol sends DOM diffs (add/remove nodes by position),
code diffs (add/remove cell bodies), and file/stylesheet diffs.

**New:** Vite's built-in HMR with React Fast Refresh:
- Markdown changes → Vite plugin re-transforms → React Fast Refresh updates component
- CSS changes → Vite CSS HMR (native)
- Data loader changes → Custom invalidation via Vite's `server.ws.send()`
- File attachment changes → Signal via custom HMR event

```ts
// In Vite plugin:
server.watcher.on('change', (file) => {
  if (isDataLoader(file)) {
    // Invalidate the loader cache and notify client
    server.ws.send({ type: 'custom', event: 'observable:file-change', data: { path: file } });
  }
});

// Client hook:
function useFileAttachment(name: string) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (import.meta.hot) {
      import.meta.hot.on('observable:file-change', (data) => {
        if (data.path === name) setVersion(v => v + 1);
      });
    }
  }, [name]);
  // version in dep array forces re-fetch
  return useMemo(() => createFileAttachment(name), [name, version]);
}
```

### 5.4 Server-Side Rendering

**Current:** Full HTML pages generated server-side with embedded `<script>` tags.

**New:** Two modes:
1. **SSG (Static Site Generation):** Pre-render React components to HTML at build time
   using `ReactDOMServer.renderToString()`. Hydrate on client.
2. **Dev mode:** Vite dev server serves the React app with client-side rendering + HMR.

```ts
// Build mode: SSG
async function buildPage(path: string, config: Config) {
  const PageComponent = await import(compiledPath);
  const html = ReactDOMServer.renderToString(<PageComponent />);
  const shellHtml = renderShell(html, { scripts, styles, title });
  await writeFile(outputPath, shellHtml);
}
```

### 5.5 Search

**Current:** MiniSearch index built at build time, client-side search UI.

**New:** Same approach, but search UI is a React component:

```tsx
function SearchDialog() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const index = useData(() => fetch("/_observablehq/minisearch.json").then(r => r.json()));

  useEffect(() => {
    if (query.length > 1) {
      setResults(miniSearch.search(query));
    }
  }, [query, index]);

  return (
    <dialog>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <ul>{results.map(r => <li key={r.id}><a href={r.path}>{r.title}</a></li>)}</ul>
    </dialog>
  );
}
```

---

## Part 6: User-Facing API Changes

### 6.1 Markdown Authoring (Preserved)

The markdown authoring format stays the same — this is critical for backward
compatibility. The framework still accepts `.md` files with fenced code blocks.

**What stays the same:**
- ```` ```js ```` code blocks
- `${expression}` inline expressions
- `FileAttachment("name")`
- YAML front matter
- Layout classes (`grid`, `card`, etc.)
- Data loaders (`.csv.py`, `.json.js`, etc.)
- SQL code blocks
- File-based routing

### 6.2 New React-Native Authoring Mode

In addition to markdown, authors can write pages directly as React components:

```tsx
// src/pages/dashboard.tsx
import { PageLayout } from '@observablehq/framework/react';
import { useFileAttachment, useWidth, RangeInput, PlotFigure } from '@observablehq/framework/react';
import { useState, useMemo } from 'react';
import * as Plot from '@observablehq/plot';

export default function Dashboard() {
  const data = useFileAttachment("sales.csv").csv({typed: true});
  const [threshold, setThreshold] = useState(50);
  const mainRef = useRef(null);
  const width = useWidth(mainRef);
  const filtered = useMemo(() => data.filter(d => d.value > threshold), [data, threshold]);

  return (
    <PageLayout title="Sales Dashboard" ref={mainRef}>
      <h1>Sales Dashboard</h1>
      <RangeInput domain={[0, 100]} value={threshold} onChange={setThreshold} label="Threshold" />
      <div className="grid grid-cols-2">
        <div className="card">
          <PlotFigure options={{
            width,
            marks: [Plot.barY(filtered, {x: "month", y: "value"})]
          }} />
        </div>
      </div>
    </PageLayout>
  );
}
```

### 6.3 Configuration Changes

```ts
// observablehq.config.ts (mostly unchanged)
export default {
  root: "src",
  title: "My App",
  theme: "dashboard",
  sidebar: true,
  pages: [
    { name: "Home", path: "/" },
    { name: "Dashboard", path: "/dashboard" }
  ],
  // NEW: React-specific options
  react: {
    strict: true,           // Enable React Strict Mode
    suspense: true,         // Enable Suspense for data loading
  }
};
```

---

## Part 7: Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

**Goal:** Set up the React build pipeline alongside the existing system.

1. Add React, ReactDOM, Vite as dependencies
2. Create the Vite plugin skeleton for `.md` → React transformation
3. Implement basic page shell (`App.tsx`, `PageLayout.tsx`)
4. Implement core hooks (`useWidth`, `useDark`, `useNow`)
5. Set up Vite dev server integration
6. Get a single static markdown page rendering via React

**Files to create/modify:**
- `src/react/compile.ts` (new)
- `src/react/cell-transform.ts` (new)
- `src/client/App.tsx` (new)
- `src/client/PageLayout.tsx` (new)
- `src/client/hooks/*.ts` (new)
- `src/vite/plugin.ts` (new)
- `package.json` (add deps)

### Phase 2: Cell Compilation

**Goal:** Transform Observable code cells into React components.

1. Implement the cell → component compiler
2. Handle expression cells (implicit display → JSX return)
3. Handle program cells (declarations → useState/useMemo)
4. Handle cross-cell references via CellContext
5. Handle import declarations
6. Handle `display()` calls → JSX
7. Handle `view()` calls → controlled components

**Key challenge:** Mapping Observable's flat namespace to React's component hierarchy.

### Phase 3: Input Components

**Goal:** Rewrite all Observable Inputs as React components.

1. Port each input type as a controlled React component
2. Implement the `view()` → controlled component transformation
3. Ensure all inputs emit proper `onChange` events
4. Style with existing CSS (preserve visual compatibility)

### Phase 4: Data Integration

**Goal:** Port data loading, FileAttachment, SQL, and DuckDB.

1. Implement `useFileAttachment` hook
2. Implement `useData` hook with Suspense
3. Port DuckDB integration as `<DuckDBProvider>` + `useSQL()`
4. Port data loaders (keep server-side execution, serve via Vite middleware)
5. Implement file watching and HMR for data changes

### Phase 5: Visualization Components

**Goal:** Wrap visualization libraries as React components.

1. `<PlotFigure>` — Observable Plot wrapper with responsive width
2. `<MermaidDiagram>` — Mermaid rendering
3. `<TexMath>` — KaTeX rendering
4. `<DotDiagram>` — Graphviz rendering
5. Ensure proper cleanup on unmount (D3 selections, etc.)

### Phase 6: Navigation & Layout

**Goal:** Port sidebar, search, TOC, pager as React components.

1. `<Sidebar>` with collapsible sections and active state
2. `<SearchDialog>` with MiniSearch integration
3. `<TableOfContents>` with scroll-spy
4. `<Pager>` (previous/next navigation)
5. Client-side routing (React Router or custom)

### Phase 7: Build & Deploy

**Goal:** Production build pipeline with SSG.

1. Static site generation using React SSR
2. Content hashing for cache busting
3. Code splitting per page
4. Search index generation
5. Link validation
6. Deploy command integration

### Phase 8: Hot Module Replacement

**Goal:** Full HMR support via Vite + React Fast Refresh.

1. Markdown changes → re-compile → React refresh
2. Data loader changes → invalidate cache → re-fetch
3. CSS changes → Vite CSS HMR
4. Config changes → full reload
5. Preserve React component state across edits where possible

---

## Part 8: What to Keep As-Is

These subsystems are framework-agnostic and should be preserved:

1. **Data Loaders** (`src/loader.ts`, `src/route.ts`) — polyglot script execution, caching
2. **Markdown Parsing** (`src/markdown.ts`) — markdown-it with custom rules (output changes, but parsing stays)
3. **JavaScript Analysis** (`src/javascript/`) — Acorn-based AST analysis for deps, imports, files
4. **Import Resolution** (`src/resolvers.ts`, `src/npm.ts`, `src/jsr.ts`) — npm/jsr/node package resolution
5. **Configuration** (`src/config.ts`) — config loading and normalization
6. **CLI** (`src/bin/observable.ts`) — command structure (preview, build, create, deploy)
7. **CSS Themes** (`src/style/`) — all theme CSS files
8. **Search Index** (`src/search.ts`) — MiniSearch index generation
9. **Path Utilities** (`src/path.ts`, `src/pager.ts`)
10. **Telemetry** (`src/telemetry.ts`)

---

## Part 9: Key Technical Decisions

### 9.1 Vite vs. Custom Bundler
**Decision: Use Vite.** Vite provides React Fast Refresh, CSS HMR, production bundling,
and plugin API. This replaces the custom esbuild+rollup+WebSocket setup with a
battle-tested solution.

### 9.2 Client-Side vs. File-System Routing
**Decision: File-system routing with client-side navigation.** Keep the file-based
routing model (each `.md` or `.tsx` file = a route) but add client-side transitions
via React Router for smoother navigation without full page reloads.

### 9.3 State Management
**Decision: React Context + hooks (no external state library).** The CellContext pattern
is sufficient for inter-cell communication. For complex apps, users can bring their own
state management (Zustand, Jotai, etc.).

### 9.4 Backward Compatibility
**Decision: Maintain markdown authoring format.** Existing `.md` files should work with
minimal changes. The Observable `display()` and `view()` functions will be shimmed during
compilation to their React equivalents.

### 9.5 Observable Runtime
**Decision: Remove entirely.** Replace with React's own reactivity model. The runtime's
dataflow graph is fundamentally at odds with React's unidirectional data flow. Trying to
run both would create confusion and bugs.

### 9.6 SSR Strategy
**Decision: SSG (Static Site Generation) for production, CSR for development.** This
matches the current behavior (static HTML output for build, dynamic server for preview)
while leveraging React's SSR capabilities.
