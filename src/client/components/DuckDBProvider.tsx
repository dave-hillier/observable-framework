import React, {createContext, useContext, useEffect, useMemo, useRef, useState, useCallback} from "react";
import type {ReactNode} from "react";
import {onFileChange, getFileMetadata} from "../hooks/useFileAttachment.js";
import type {FileMetadata} from "../hooks/useFileAttachment.js";

/**
 * DuckDB query result type.
 */
export type QueryResult = Record<string, unknown>[];

/**
 * DuckDB context interface.
 */
interface DuckDBContextValue {
  /** Execute a SQL query and return results */
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  /** Execute a SQL query and return a streaming reader */
  queryStream: (sql: string, params?: unknown[]) => Promise<{schema: unknown; readRows: () => AsyncGenerator<unknown[]>}>;
  /** Execute a SQL query and return the first row */
  queryRow: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null>;
  /** Register a table from a file source or SQL definition */
  registerTable: (name: string, source: string) => Promise<void>;
  /** Remove a registered table */
  unregisterTable: (name: string) => Promise<void>;
  /** List all registered tables */
  describeTables: () => Promise<{name: string}[]>;
  /** Describe columns of a table */
  describeColumns: (table: string) => Promise<{name: string; type: string; nullable: boolean; databaseType: string}[]>;
  /** The raw DuckDB instance (for advanced use) */
  db: unknown;
  /** Whether DuckDB is ready */
  ready: boolean;
}

const DuckDBContext = createContext<DuckDBContextValue | null>(null);

export interface DuckDBProviderProps {
  /** Table registrations: {name: source} where source is a file path or SQL query */
  tables?: Record<string, string>;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers for format detection and source classification
// ---------------------------------------------------------------------------

/** Returns true if source looks like a file/asset path (not an SQL query). */
function isFilePath(source: string): boolean {
  return (
    source.startsWith("/") ||
    source.startsWith("./") ||
    source.startsWith("../") ||
    /^https?:\/\//i.test(source)
  );
}

const MIME_BY_EXT: Record<string, string> = {
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".arrow": "application/vnd.apache.arrow.file",
  ".parquet": "application/vnd.apache.parquet",
  ".db": "application/x-sqlite3",
  ".ddb": "application/x-duckdb",
  ".duckdb": "application/x-duckdb"
};

function inferMimeType(name: string): string | undefined {
  // Check file registry first
  const meta = getFileMetadata(name);
  if (meta?.mimeType) return meta.mimeType;
  // Fall back to extension
  const ext = name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
}

function resolveSourceUrl(source: string): string {
  // Check the file registry for a resolved path (with hash for cache busting)
  const meta = getFileMetadata(source);
  if (meta?.path) return meta.path;
  // For URLs, use as-is
  if (/^https?:\/\//i.test(source)) return source;
  // For file paths, use the /_file/ endpoint
  return `/_file/${source.replace(/^\/+/, "")}`;
}

// ---------------------------------------------------------------------------
// Format-aware table insertion (mirrors src/client/stdlib/duckdb.js logic)
// ---------------------------------------------------------------------------

async function insertFileTable(
  db: any,
  name: string,
  source: string
): Promise<void> {
  const url = resolveSourceUrl(source);
  const mimeType = inferMimeType(source);
  const fileName = source.split("/").pop() || source;

  // Register the file URL with DuckDB's virtual file system
  const absoluteUrl = new URL(url, globalThis.location?.href ?? "http://localhost").href;
  await db.registerFileURL(fileName, absoluteUrl, 4 /* DuckDBDataProtocol.HTTP */);

  const conn = await db.connect();
  try {
    switch (mimeType) {
      case "text/csv":
      case "text/tab-separated-values": {
        try {
          await conn.insertCSVFromPath(fileName, {name, schema: "main"});
        } catch (error: any) {
          // If CSV parsing fails with conversion error, retry with all-varchar
          if (error?.toString().includes("Could not convert")) {
            const stmt = await conn.prepare(
              `CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM read_csv_auto(?, ALL_VARCHAR=TRUE)`
            );
            await stmt.send(fileName);
          } else {
            throw error;
          }
        }
        return;
      }
      case "application/json": {
        await conn.insertJSONFromPath(fileName, {name, schema: "main"});
        return;
      }
    }

    // Fall back to extension-based detection
    if (/\.arrow$/i.test(fileName)) {
      const response = await fetch(absoluteUrl);
      const buffer = new Uint8Array(await response.arrayBuffer());
      await conn.insertArrowFromIPCStream(buffer, {name, schema: "main"});
    } else if (/\.parquet$/i.test(fileName)) {
      // Use VIEW for large files, TABLE for small ones
      await conn.query(
        `CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM parquet_scan('${fileName}')`
      );
    } else if (/\.(db|ddb|duckdb)$/i.test(fileName)) {
      await conn.query(`ATTACH '${fileName}' AS "${name}" (READ_ONLY)`);
    } else {
      // Let DuckDB auto-detect the format
      await conn.query(`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM '${fileName}'`);
    }
  } finally {
    await conn.close();
  }
}

async function insertSqlView(db: any, name: string, sql: string): Promise<void> {
  const conn = await db.connect();
  try {
    await conn.query(`CREATE OR REPLACE VIEW "${name}" AS ${sql}`);
  } finally {
    await conn.close();
  }
}

async function insertTableSource(db: any, name: string, source: string): Promise<void> {
  if (isFilePath(source)) {
    return insertFileTable(db, name, source);
  } else {
    return insertSqlView(db, name, source);
  }
}

async function dropTable(db: any, name: string): Promise<void> {
  const conn = await db.connect();
  try {
    // Try dropping as table first, then as view
    try {
      await conn.query(`DROP TABLE IF EXISTS "${name}"`);
    } catch {
      // ignore
    }
    try {
      await conn.query(`DROP VIEW IF EXISTS "${name}"`);
    } catch {
      // ignore
    }
  } finally {
    await conn.close();
  }
}

// ---------------------------------------------------------------------------
// DuckDB type mapping (mirrors src/client/stdlib/duckdb.js)
// ---------------------------------------------------------------------------

function getDuckDBType(type: string): string {
  switch (type) {
    case "BIGINT":
    case "HUGEINT":
    case "UBIGINT":
      return "bigint";
    case "DOUBLE":
    case "REAL":
    case "FLOAT":
      return "number";
    case "INTEGER":
    case "SMALLINT":
    case "TINYINT":
    case "USMALLINT":
    case "UINTEGER":
    case "UTINYINT":
      return "integer";
    case "BOOLEAN":
      return "boolean";
    case "DATE":
    case "TIMESTAMP":
    case "TIMESTAMP WITH TIME ZONE":
      return "date";
    case "VARCHAR":
    case "UUID":
      return "string";
    default:
      if (/^DECIMAL\(/.test(type)) return "integer";
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

/**
 * Provider component that initializes DuckDB-WASM and provides SQL query capabilities.
 * Supports format-aware table registration from data loader outputs.
 *
 * Table sources can be:
 * - File paths (e.g., "/data/sales.parquet") - registered with format-specific insertion
 * - URLs (e.g., "https://example.com/data.csv") - fetched and inserted by format
 * - SQL queries (e.g., "SELECT * FROM other_table WHERE x > 10") - created as views
 *
 * Tables automatically re-register when their underlying files change during HMR.
 *
 * Usage:
 *   <DuckDBProvider tables={{sales: "/data/sales.parquet", summary: "SELECT * FROM sales GROUP BY region"}}>
 *     <MyDashboard />
 *   </DuckDBProvider>
 */
export function DuckDBProvider({tables = {}, children}: DuckDBProviderProps) {
  const [db, setDb] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const tablesRef = useRef(tables);
  const dbRef = useRef<any>(null);
  tablesRef.current = tables;

  // Initialize DuckDB-WASM
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const duckdb = await import("@duckdb/duckdb-wasm");
        if (cancelled) return;

        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        const worker = new Worker(bundle.mainWorker!);
        const logger = new duckdb.ConsoleLogger();
        const instance = new duckdb.AsyncDuckDB(logger, worker);
        await instance.instantiate(bundle.mainModule, bundle.pthreadWorker);
        if (cancelled) {
          await instance.terminate();
          return;
        }

        dbRef.current = instance;
        setDb(instance);
      } catch (err) {
        console.error("Failed to initialize DuckDB:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Register tables when db is ready or tables change
  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    (async () => {
      try {
        for (const [name, source] of Object.entries(tables)) {
          if (cancelled) break;
          await insertTableSource(db, name, source);
        }
        if (!cancelled) setReady(true);
      } catch (err) {
        console.error("Failed to register DuckDB tables:", err);
        if (!cancelled) setReady(true); // still mark ready so queries can run
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, tables]);

  // Subscribe to file changes for HMR - re-register affected tables
  useEffect(() => {
    if (!db) return;

    const unsubscribe = onFileChange((changedName: string, _meta: FileMetadata | null) => {
      // Check if any table source references this file
      for (const [tableName, source] of Object.entries(tablesRef.current)) {
        if (!isFilePath(source)) continue;
        // Match if the changed file name corresponds to this source
        const sourceName = source.replace(/^\/+/, "");
        if (changedName === sourceName || changedName === source || source.endsWith(`/${changedName}`)) {
          // Re-register this table
          insertTableSource(db, tableName, source).catch((err) => {
            console.error(`Failed to re-register table "${tableName}" after file change:`, err);
          });
        }
      }
    });

    return unsubscribe;
  }, [db]);

  // Build context value
  const contextValue = useMemo<DuckDBContextValue>(() => {
    return {
      ready,
      db,

      async query(sql: string, params?: unknown[]): Promise<QueryResult> {
        if (!db) throw new Error("DuckDB not initialized");
        const conn = await db.connect();
        try {
          let table;
          if (params && params.length > 0) {
            const stmt = await conn.prepare(sql);
            table = await stmt.query(...params);
          } else {
            table = await conn.query(sql);
          }
          return table.toArray().map((row: any) => row.toJSON());
        } finally {
          await conn.close();
        }
      },

      async queryStream(sql: string, params?: unknown[]) {
        if (!db) throw new Error("DuckDB not initialized");
        const conn = await db.connect();
        let reader: any, batch: any;
        try {
          if (params && params.length > 0) {
            const stmt = await conn.prepare(sql);
            reader = await stmt.send(...params);
          } else {
            reader = await conn.send(sql);
          }
          batch = await reader.next();
          if (batch.done) throw new Error("missing first batch");
        } catch (error) {
          await conn.close();
          throw error;
        }
        return {
          schema: batch.value.schema,
          async *readRows() {
            try {
              while (!batch.done) {
                yield batch.value.toArray();
                batch = await reader.next();
              }
            } finally {
              await conn.close();
            }
          }
        };
      },

      async queryRow(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
        if (!db) throw new Error("DuckDB not initialized");
        const result = await this.queryStream(sql, params);
        const reader = result.readRows();
        try {
          const {done, value} = await reader.next();
          return done || !(value as unknown[]).length ? null : (value as any[])[0];
        } finally {
          await reader.return!(undefined);
        }
      },

      async registerTable(name: string, source: string): Promise<void> {
        if (!db) throw new Error("DuckDB not initialized");
        await insertTableSource(db, name, source);
      },

      async unregisterTable(name: string): Promise<void> {
        if (!db) throw new Error("DuckDB not initialized");
        await dropTable(db, name);
      },

      async describeTables(): Promise<{name: string}[]> {
        if (!db) throw new Error("DuckDB not initialized");
        const conn = await db.connect();
        try {
          const result = await conn.query("SHOW TABLES");
          return result.toArray().map((row: any) => ({name: row.toJSON().name}));
        } finally {
          await conn.close();
        }
      },

      async describeColumns(table: string) {
        if (!db) throw new Error("DuckDB not initialized");
        const conn = await db.connect();
        try {
          const result = await conn.query(`DESCRIBE "${table}"`);
          return result.toArray().map((row: any) => {
            const r = row.toJSON();
            return {
              name: r.column_name,
              type: getDuckDBType(r.column_type),
              nullable: r.null !== "NO",
              databaseType: r.column_type
            };
          });
        } finally {
          await conn.close();
        }
      }
    };
  }, [db, ready]);

  return <DuckDBContext.Provider value={contextValue}>{children}</DuckDBContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Hook to access the DuckDB context directly for advanced operations.
 * Returns the full DuckDB context including query, registerTable, describeTables, etc.
 *
 * Usage:
 *   const {query, registerTable, describeTables, db, ready} = useDuckDB();
 */
export function useDuckDB(): DuckDBContextValue {
  const ctx = useContext(DuckDBContext);
  if (!ctx) throw new Error("useDuckDB must be used within a DuckDBProvider");
  return ctx;
}

/**
 * Hook to execute SQL queries against the DuckDB instance.
 * Returns the query results reactively. Re-runs when the query string changes.
 *
 * Usage:
 *   const {data, loading, error} = useSQL("SELECT * FROM sales WHERE region = 'North'");
 */
export function useSQL(query: string): {data: QueryResult | undefined; loading: boolean; error: unknown} {
  const ctx = useContext(DuckDBContext);
  const [data, setData] = useState<QueryResult | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    if (!ctx?.ready) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    ctx.query(query).then(
      (result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      },
      (err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [ctx, query]);

  return {data, loading, error};
}
