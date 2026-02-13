import {useMemo, useState, useEffect} from "react";

/**
 * File metadata registered at page load time by the framework.
 */
export interface FileMetadata {
  name: string;
  mimeType?: string;
  path: string;
  lastModified?: number;
  size?: number;
}

// Global registry of known files, populated at page initialization
const fileRegistry = new Map<string, FileMetadata>();

/** Register a file for use with useFileAttachment. Called by generated page code. */
export function registerFile(name: string, metadata: FileMetadata | null): void {
  if (metadata === null) {
    fileRegistry.delete(name);
  } else {
    fileRegistry.set(name, metadata);
  }
}

/**
 * A file attachment handle. Provides methods to load the file in various formats.
 * This is the React equivalent of Observable's FileAttachment.
 */
export interface FileAttachmentHandle {
  /** The resolved URL of the file */
  url: string;
  /** The file name */
  name: string;
  /** The MIME type */
  mimeType: string | undefined;
  /** Fetch as text */
  text(): Promise<string>;
  /** Fetch as JSON */
  json(): Promise<unknown>;
  /** Fetch as ArrayBuffer */
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Fetch as Blob */
  blob(): Promise<Blob>;
  /** Fetch and parse as CSV (requires d3-dsv) */
  csv(options?: {typed?: boolean; array?: boolean}): Promise<unknown[]>;
  /** Fetch and parse as TSV (requires d3-dsv) */
  tsv(options?: {typed?: boolean; array?: boolean}): Promise<unknown[]>;
  /** Fetch as a ReadableStream */
  stream(): ReadableStream;
  /** Fetch and parse as Apache Arrow table */
  arrow(): Promise<unknown>;
  /** Fetch and parse as Parquet via Arrow */
  parquet(): Promise<unknown>;
  /** Fetch and open as SQLite database */
  sqlite(): Promise<unknown>;
  /** Fetch and open as XLSX workbook */
  xlsx(): Promise<unknown>;
  /** Fetch and parse as a ZIP archive */
  zip(): Promise<unknown>;
  /** Create an Image element */
  image(props?: Record<string, unknown>): Promise<HTMLImageElement>;
}

function resolveFileUrl(name: string): string {
  const meta = fileRegistry.get(name);
  if (meta) return meta.path;
  // Fallback: assume relative path
  return `/_file/${name}`;
}

function createFileAttachment(name: string): FileAttachmentHandle {
  const meta = fileRegistry.get(name);
  const url = resolveFileUrl(name);

  return {
    url,
    name,
    mimeType: meta?.mimeType,

    async text() {
      return (await fetch(url)).text();
    },

    async json() {
      return (await fetch(url)).json();
    },

    async arrayBuffer() {
      return (await fetch(url)).arrayBuffer();
    },

    async blob() {
      return (await fetch(url)).blob();
    },

    async csv(options) {
      const {csvParse, csvParseRows, autoType} = await import("d3-dsv");
      const text = await this.text();
      const parse = options?.array ? csvParseRows : csvParse;
      return options?.typed ? (parse as typeof csvParse)(text, autoType) : parse(text);
    },

    async tsv(options) {
      const {tsvParse, tsvParseRows, autoType} = await import("d3-dsv");
      const text = await this.text();
      const parse = options?.array ? tsvParseRows : tsvParse;
      return options?.typed ? (parse as typeof tsvParse)(text, autoType) : parse(text);
    },

    stream() {
      // Create a ReadableStream from fetch
      return new ReadableStream({
        async start(controller) {
          const response = await fetch(url);
          const reader = response.body!.getReader();
          try {
            while (true) {
              const {done, value} = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        }
      });
    },

    async arrow() {
      const Apache = await import("apache-arrow");
      const buffer = await this.arrayBuffer();
      return Apache.tableFromIPC(buffer);
    },

    async parquet() {
      const {parquetRead} = await import("hyparquet");
      const buffer = await this.arrayBuffer();
      return new Promise((resolve, reject) => {
        parquetRead({file: buffer, onComplete: resolve}).catch(reject);
      });
    },

    async sqlite() {
      throw new Error("SQLite loading not yet implemented in React mode");
    },

    async xlsx() {
      throw new Error("XLSX loading not yet implemented in React mode");
    },

    async zip() {
      throw new Error("ZIP loading not yet implemented in React mode");
    },

    async image(props = {}) {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        Object.assign(img, props);
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
      });
    }
  };
}

/**
 * React hook that returns a FileAttachment handle for the given file name.
 * Replaces Observable's `FileAttachment("name")` pattern.
 *
 * Usage:
 *   const file = useFileAttachment("data.csv");
 *   const data = await file.csv({typed: true});
 */
export function useFileAttachment(name: string): FileAttachmentHandle {
  return useMemo(() => createFileAttachment(name), [name]);
}

/**
 * React hook that loads a file attachment and returns the parsed data.
 * Combines useFileAttachment with Suspense-compatible data loading.
 *
 * Usage:
 *   const data = useFileData("data.csv", f => f.csv({typed: true}));
 */
export function useFileData<T>(name: string, loader: (file: FileAttachmentHandle) => Promise<T>): T | undefined {
  const file = useFileAttachment(name);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loader(file).then(
      (result) => { if (!cancelled) setData(result); },
      (err) => { if (!cancelled) setError(err); }
    );
    return () => { cancelled = true; };
  }, [file, loader]);

  if (error) throw error;
  return data;
}

// Re-export for use in compiled page code
export {createFileAttachment as FileAttachment};
