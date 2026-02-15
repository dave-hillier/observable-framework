# Observable Framework (React Port)

This is a **React port** of [Observable Framework](https://observablehq.com/framework/), a free, [open-source](./LICENSE), static site generator for data apps, dashboards, reports, and more.

The original Observable Framework combines JavaScript on the front-end for interactive graphics with any language on the back-end for data analysis. It features [data loaders](https://observablehq.com/framework/loaders) that precompute static snapshots of data at build time for dashboards that load instantly.

## What changed in this port

This fork replaces the internal execution model — the [Observable Runtime](https://github.com/nicolo-ribaudo/tc39-proposal-await-dictionary/blob/main/README.md) dataflow graph, direct DOM manipulation, and server-rendered HTML strings — with an idiomatic **React component architecture**:

- **React components and hooks** replace the Observable Runtime's implicit reactive dataflow graph.
- **JSX** replaces imperative `display()` calls for rendering.
- **`useState` / `useMemo` / `useEffect`** replace Observable's name-based dependency tracking.
- **React Suspense** replaces custom loading/pending state management.
- **Vite with React Fast Refresh** replaces the custom HMR WebSocket protocol.

### What stayed the same

The core authoring experience is preserved:

- **Markdown-based pages** — `.md` files with fenced code blocks still work as before.
- **Data loaders** — polyglot scripts (`.csv.py`, `.json.js`, etc.) that precompute data at build time.
- **File-based routing** — each file becomes a page.
- **`FileAttachment`** — access to data files and loader outputs.
- **YAML front matter, layout classes, inline expressions** — all unchanged.
- **Configuration** (`observablehq.config.ts`) — same structure with optional React-specific additions.

### New capabilities

- **React page authoring** — write pages directly as `.tsx` React components instead of (or alongside) Markdown.
- **Custom React hooks** — `useWidth`, `useDark`, `useNow`, `useFileAttachment`, `useData`, `useResize`, `useGenerator`, `useVisibility`, and more.
- **React input components** — controlled components (`RangeInput`, `SelectInput`, `TextInput`, etc.) that replace Observable Inputs.
- **Server-side rendering** — SSG via `ReactDOMServer.renderToString()` for production builds.

### Architecture

```
Markdown → parse → extract code cells → compile to React components
                                              ↓
                                   React component tree with hooks
                                              ↓
                                   React reconciliation (virtual DOM)
```

Each code cell becomes a React component. Cells that declare variables become context providers; cells that reference variables become context consumers. See [PLAN.md](./PLAN.md) for the full architectural plan.

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) 18+ and [Yarn Classic](https://classic.yarnpkg.com/lang/en/docs/install/).

React is a peer dependency. Install it alongside the framework:

```sh
yarn add react react-dom
```

Start the local preview server:

```sh
yarn dev
```

Then visit http://127.0.0.1:3000.

Build a static site:

```sh
yarn build
```

## Documentation

The upstream documentation covers the markdown authoring format, data loaders, configuration, and deployment:

https://observablehq.com/framework/

For React-specific details (hooks, components, `.tsx` pages), see [PLAN.md](./PLAN.md).

## Examples

https://github.com/observablehq/framework/tree/main/examples

## Upstream releases (changelog)

https://github.com/observablehq/framework/releases

## Getting help

Please [open a discussion](https://github.com/observablehq/framework/discussions) if you'd like help. We also recommend [searching issues](https://github.com/observablehq/framework/issues).

## Contributing

See [Contributing](https://observablehq.com/framework/contributing).

This project uses React 18+ (with React 19 support). When contributing, note that the client-side code is written in TSX with React hooks, and the build pipeline compiles markdown pages into React component trees. See [PLAN.md](./PLAN.md) for architectural context.
