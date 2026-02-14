/**
 * Type declarations for optional runtime dependencies.
 * These packages are dynamically imported and may not be installed
 * in every project. We declare minimal types to satisfy TypeScript.
 */

declare module "mermaid" {
  const mermaid: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, source: string): Promise<{svg: string}>;
  };
  export default mermaid;
}

declare module "katex" {
  const katex: {
    renderToString(source: string, options?: Record<string, unknown>): string;
  };
  export default katex;
}

declare module "@viz-js/viz" {
  export function instance(): Promise<{
    renderString(source: string, options?: {format?: string}): string;
  }>;
}

declare module "@duckdb/duckdb-wasm" {
  export function getJsDelivrBundles(): unknown;
  export function selectBundle(bundles: unknown): Promise<{
    mainModule: string;
    mainWorker: string | null;
    pthreadWorker: string | null;
  }>;
  export class ConsoleLogger {}
  export class AsyncDuckDB {
    constructor(logger: ConsoleLogger, worker: Worker);
    instantiate(mainModule: string, pthreadWorker: string | null): Promise<void>;
    connect(): Promise<{
      query(sql: string): Promise<{toArray(): Array<{toJSON(): Record<string, unknown>}>}>;
      close(): Promise<void>;
    }>;
    terminate(): Promise<void>;
  }
}

declare module "@observablehq/plot" {
  export function plot(options: Record<string, unknown>): SVGElement & HTMLElement;
}

declare module "apache-arrow" {
  export function tableFromIPC(buffer: ArrayBuffer): unknown;
}

declare module "hyparquet" {
  export function parquetRead(options: {file: ArrayBuffer; onComplete: (data: unknown) => void}): Promise<void>;
}
