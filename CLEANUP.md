# React Port Cleanup Plan

The React port is functionally complete (Phases 1–7 done). Both rendering pipelines coexist behind a `config.react` flag. This plan covers removing the old Observable Runtime pipeline and related dead code so that React becomes the sole rendering path.

---

## 1. Remove the old Observable Runtime client code

These files implement the legacy `define()`-based cell execution model and are unused when `config.react` is true.

| File | Purpose | Action |
|------|---------|--------|
| `src/client/main.js` (196 lines) | Observable Runtime bootstrap, `define()`, DOM insertion via comment markers | **Delete** |
| `src/client/runtime.js` (2 lines) | Re-exports `Runtime`, `RuntimeError`, `Inspector` from `@observablehq/runtime` | **Delete** |
| `src/client/stdlib.js` (5 lines) | Re-exports `Generators`, `Mutable`, `resize` | **Delete** |
| `src/client/stdlib/mutable.js` | Observable `Mutable()` pattern | **Delete** |
| `src/client/stdlib/generators/` (entire dir) | `now.js`, `width.ts`, `dark.ts`, `input.js`, `observe.js`, `queue.js` — all replaced by React hooks | **Delete** |
| `src/client/stdlib/inputs.js` | Wraps `@observablehq/inputs` for Observable Runtime | **Delete** |
| `src/client/stdlib/resize.js` | `resize()` helper for Observable cells | **Delete** |
| `src/client/preview.js` | HMR client for the old WebSocket protocol (`registerFile`, hot-swapping `define()` cells) | **Delete** |
| `src/client/inspect.js` | Observable Inspector integration (`inspect`, `inspectError`) | **Delete** |
| `src/client/stdlib/recommendedLibraries.js` | Lazy-import stubs for Plot, Arrow, D3, etc. used by old stdlib | **Review** — keep if React path still uses these, otherwise delete |
| `src/client/stdlib/sampleDatasets.js` | Sample dataset stubs | **Review** — same |

## 2. Remove the old server-side rendering pipeline

| File / Location | Purpose | Action |
|----------------|---------|--------|
| `src/render.ts` (entire file) | Generates HTML with embedded `<script>` blocks containing `define()` calls | **Delete** |
| `src/javascript/transpile.ts` | Transpiles JS cells into `define({id, inputs, outputs, body})` strings | **Delete** if only used by `render.ts`; otherwise strip the `define()` emitter |

## 3. Remove the `config.react` feature flag and dual-path branching

Once the old pipeline is gone, every `if (config.react)` / `else` branch can be collapsed to the React-only path.

| File | What to change |
|------|---------------|
| `src/preview.ts` (~lines 227–234) | Remove the `else` branch that calls `renderPage()`. Remove `renderModule` import from `./render.js`. Remove old WebSocket HMR protocol code. |
| `src/build.ts` (~lines 151+, 480) | Remove the non-React build path that calls `renderPage()`. Remove `renderModule` import. |
| `src/config.ts` | Remove the `react: boolean` and `reactOptions` fields (React is now always-on). |
| `src/resolvers.ts` (~lines 48–68, 104–105) | Remove `defaultImports` list (`observablehq:client`, `observablehq:runtime`, `observablehq:stdlib`). Remove the `react ? [] : defaultImports` conditional — always use the React import set. |

## 4. Remove Observable Runtime bundling from rollup

| File | What to change |
|------|---------------|
| `src/rollup.ts` (~lines 20–31) | Remove `@observablehq/runtime`, `@observablehq/inspector`, `@observablehq/inputs`, `isoformat` from `BUNDLED_MODULES`. Remove the `observablehq:` specifier resolution for runtime/stdlib. Keep `minisearch` if still used for search. |

## 5. Remove npm dependencies

From `package.json`:

```
"@observablehq/runtime": "^6.0.0"   → remove
"@observablehq/inspector": "^5.0.1" → remove
"@observablehq/inputs": "^0.12.0"   → remove (unless React input components still import from it)
```

Verify that no React component or hook still wraps these packages before removing.

## 6. Update `observablehq:` specifier resolution

| File | What to change |
|------|---------------|
| `src/resolvers.ts` | Remove mappings for `observablehq:runtime`, `observablehq:client`, `observablehq:stdlib`. Keep mappings for CSS themes (`observablehq:default.css`, `observablehq:theme-*.css`) and any other specifiers still used by the React path (e.g., `npm:@observablehq/duckdb`). |
| `src/libraries.ts` | Audit implicit import mappings — remove any that pull in `@observablehq/runtime` or `@observablehq/inputs` directly. Keep Plot, D3, Arrow, etc. |

## 7. Clean up test fixtures

The `test/output/` directory contains 100+ expected-output files with `define()` call patterns. These all test the old transpilation pipeline.

| Action | Scope |
|--------|-------|
| Delete or rewrite `test/output/*.js` files that assert `define()` output | ~100 files |
| Update tests in `test/` that import from `src/render.ts` or `src/javascript/transpile.ts` | Grep for imports |
| Add equivalent tests for the React compilation pipeline (`src/react/compile.ts`, `cell-transform.ts`) if not already present | New tests |

## 8. Update examples to remove Observable-only patterns

All 109 examples currently use the default (non-React) mode. After removing the old pipeline they will need to work under React.

| Action | Detail |
|--------|--------|
| Remove or convert any `observablehq.config.*` files that set `react: false` | Should be none, but verify |
| Audit examples that use `Mutable()`, `Generators.*`, `view()`, `display()` imperatively | These must compile correctly through `src/react/cell-transform.ts` or be rewritten |
| The 5 already-ported examples (intersection-observer, vega-dark, vega-responsive, input-select-file, custom-input-2d) are ready | No action needed |
| Port or verify remaining examples compile under React mode | May require cell-transform improvements |

## 9. Clean up documentation

| File | Action |
|------|--------|
| `PLAN.md` (849 lines) | Archive or delete — the port is done |
| `README.md`, `CONTRIBUTING.md` | Already updated (commit `ece688e`). Verify no references to old Observable Runtime internals remain. |
| `docs/` pages | Already updated (commit `2ac8f4b`). Verify `display()` / `view()` docs describe the React compilation, not the old runtime. |

## 10. Resolve outstanding TODOs

| Location | TODO | Action |
|----------|------|--------|
| `src/build.ts:97` | `TODO have route return path with leading slash?` | Fix or remove |
| `src/resolvers.ts:61` | `TODO publish to npm` (re: `@observablehq/inputs`) | Remove — no longer relevant if inputs dependency is dropped |

---

## Suggested execution order

1. **Items 1–2** (delete old client + render pipeline) — biggest wins, removes ~500 lines
2. **Item 3** (collapse feature flag) — makes remaining code simpler
3. **Items 4–6** (rollup, deps, resolvers) — finish severing Observable Runtime ties
4. **Item 7** (tests) — unblock CI
5. **Items 8–9** (examples, docs) — polish
6. **Item 10** (TODOs) — minor
