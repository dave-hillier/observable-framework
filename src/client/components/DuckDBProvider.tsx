import React, {createContext, useContext, useEffect, useMemo, useState} from "react";
import type {ReactNode} from "react";

/**
 * DuckDB query result type.
 */
export type QueryResult = Record<string, unknown>[];

/**
 * DuckDB context interface.
 */
interface DuckDBContextValue {
  /** Execute a SQL query and return results */
  query: (sql: string) => Promise<QueryResult>;
  /** Register a table from a file attachment or URL */
  registerTable: (name: string, source: string | unknown) => Promise<void>;
  /** Whether DuckDB is ready */
  ready: boolean;
}

const DuckDBContext = createContext<DuckDBContextValue | null>(null);

export interface DuckDBProviderProps {
  /** Initial table registrations: {name: source} */
  tables?: Record<string, string>;
  children: ReactNode;
}

/**
 * Provider component that initializes DuckDB-WASM and provides SQL query capabilities.
 * Replaces Observable's implicit DuckDB integration.
 *
 * Usage:
 *   <DuckDBProvider tables={{sales: "/data/sales.parquet"}}>
 *     <MyDashboard />
 *   </DuckDBProvider>
 */
export function DuckDBProvider({tables = {}, children}: DuckDBProviderProps) {
  const [db, setDb] = useState<unknown>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Dynamically import DuckDB
        const duckdb = await import("@duckdb/duckdb-wasm");
        if (cancelled) return;

        // Initialize DuckDB
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

        // Register initial tables
        const conn = await instance.connect();
        try {
          for (const [name, source] of Object.entries(tables)) {
            if (typeof source === "string") {
              await conn.query(`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM '${source}'`);
            }
          }
        } finally {
          await conn.close();
        }

        if (cancelled) {
          await instance.terminate();
          return;
        }

        setDb(instance);
        setReady(true);
      } catch (err) {
        console.error("Failed to initialize DuckDB:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const contextValue = useMemo<DuckDBContextValue>(() => {
    return {
      ready,
      async query(sql: string): Promise<QueryResult> {
        if (!db) throw new Error("DuckDB not initialized");
        const conn = await (db as any).connect();
        try {
          const result = await conn.query(sql);
          return result.toArray().map((row: any) => row.toJSON());
        } finally {
          await conn.close();
        }
      },
      async registerTable(name: string, source: string | unknown): Promise<void> {
        if (!db) throw new Error("DuckDB not initialized");
        const conn = await (db as any).connect();
        try {
          if (typeof source === "string") {
            await conn.query(`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM '${source}'`);
          }
        } finally {
          await conn.close();
        }
      }
    };
  }, [db, ready]);

  return <DuckDBContext.Provider value={contextValue}>{children}</DuckDBContext.Provider>;
}

/**
 * Hook to execute SQL queries against the DuckDB instance.
 * Returns the query results reactively.
 *
 * Usage:
 *   const results = useSQL("SELECT * FROM sales WHERE region = 'North'");
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
