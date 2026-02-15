# Contributing

This is a **React port** of Observable Framework. The client-side runtime has been rewritten to use React components and hooks instead of the Observable Runtime. See [PLAN.md](https://github.com/observablehq/framework/blob/main/PLAN.md) for architectural details.

If you'd like to contribute, here's how. First clone the [git repo](https://github.com/observablehq/framework) and run [Yarn Classic](https://classic.yarnpkg.com/lang/en/docs/install/) to install dependencies:

```sh
git clone git@github.com:observablehq/framework.git
cd framework
yarn
```

Next start the local preview server:

```sh
yarn dev
```

Lastly visit <http://127.0.0.1:3000>.

The local preview server restarts automatically if you edit any of the TypeScript files, though you may need to reload. The default page is [`docs/index.md`](https://github.com/observablehq/framework/blob/main/docs/index.md?plain=1); if you edit that file and save changes, the live preview in the browser will automatically update.

## Project structure

Key directories for the React port:

- **`src/react/`** — React compilation pipeline (markdown-to-React compiler, cell transforms, SSR, HMR).
- **`src/client/components/`** — React components (App, PageLayout, Sidebar, inputs, etc.).
- **`src/client/hooks/`** — Custom React hooks (`useWidth`, `useDark`, `useData`, `useCellContext`, etc.).
- **`src/client/stdlib/`** — Standard library utilities.
- **`src/markdown.ts`** — Markdown parsing (unchanged from upstream, but output feeds into the React compiler).
- **`src/javascript/`** — JavaScript AST analysis for dependency tracking (unchanged from upstream).

When making changes to client-side code, note that:

- Pages are compiled from markdown into React component trees (see `src/react/compile.ts`).
- Code cells become individual React components that communicate via `CellContext`.
- React 18+ is a peer dependency; React 19 is also supported.
- The build uses Vite with `@vitejs/plugin-react` for JSX/TSX compilation and React Fast Refresh.

## Building the docs

To generate the static site:

```sh
yarn docs:build
```

This creates the `docs/.observablehq/dist` folder. View the site using your preferred web server, such as:

```sh
http-server docs/.observablehq/dist
```

This documentation site is built on GitHub using Observable Framework; see the [deploy workflow](https://github.com/observablehq/framework/blob/main/.github/workflows/deploy.yml). Please open a pull request if you'd like to contribute. Contributors are expected to follow our [code of conduct](https://github.com/observablehq/.github/blob/master/CODE_OF_CONDUCT.md).

A test coverage report can be generated with [c8](https://github.com/bcoe/c8), in text and lcov formats, to help you identify which lines of code are not (yet!) covered by tests. Just run:

```bash
yarn test:coverage
```

## Releasing

<div class="note">These instructions are intended for Observable staff.</div>

To release a new version, first update the [package.json](https://github.com/observablehq/framework/blob/main/package.json) file by following the standard process for committing code changes:

1. Create a new branch.
2. Edit the `version` field in the [package.json](https://github.com/observablehq/framework/blob/main/package.json) file as desired.
3. Commit your change to your branch.
4. Push your branch up to GitHub.
5. Open a pull request and ask for a review.
6. Once approved, merge your pull request to the `main` branch.

Once the above is done, you can publish the release via GitHub:

1. Go to [**Draft a new release**](https://github.com/observablehq/framework/releases/new).
2. Under **Choose a tag**, enter the new version with a `v` *e.g.* `v1.2.3`.
3. Click **Create new tag: v1.2.3**.
4. Leave the **Target** as `main`.
5. Click **Publish release**.

That’s it! The [publish action](https://github.com/observablehq/framework/actions/workflows/publish.yml) will take care of the rest.
