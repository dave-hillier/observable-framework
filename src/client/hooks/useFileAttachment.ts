import {useEffect, useMemo, useState} from "react";

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

// Subscription support for reactive file updates (used by DuckDBProvider)
const fileListeners = new Set<(name: string, metadata: FileMetadata | null) => void>();

/** Subscribe to file registry changes. Returns an unsubscribe function. */
export function onFileChange(listener: (name: string, metadata: FileMetadata | null) => void): () => void {
  fileListeners.add(listener);
  return () => fileListeners.delete(listener);
}

/** Look up file metadata by name. */
export function getFileMetadata(name: string): FileMetadata | undefined {
  return fileRegistry.get(name);
}

/** Register a file for use with useFileAttachment. Called by generated page code. */
export function registerFile(name: string, metadata: FileMetadata | null): void {
  if (metadata === null) {
    fileRegistry.delete(name);
  } else {
    fileRegistry.set(name, metadata);
  }
  for (const listener of fileListeners) listener(name, metadata);
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
  /** Fetch and parse as DSV with custom delimiter */
  dsv(options?: {delimiter?: string; typed?: boolean; array?: boolean}): Promise<unknown[]>;
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
  sqlite(): Promise<SQLiteDatabaseClient>;
  /** Fetch and open as XLSX workbook */
  xlsx(): Promise<Workbook>;
  /** Fetch and parse as a ZIP archive */
  zip(): Promise<ZipArchive>;
  /** Parse as XML */
  xml(mimeType?: string): Promise<Document>;
  /** Parse as HTML */
  html(): Promise<Document>;
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
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load file: ${name}`);
      return response.text();
    },

    async json() {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load file: ${name}`);
      return response.json();
    },

    async arrayBuffer() {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load file: ${name}`);
      return response.arrayBuffer();
    },

    async blob() {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load file: ${name}`);
      return response.blob();
    },

    async dsv(options) {
      const {delimiter = ",", array = false, typed = false} = options ?? {};
      const d3 = await import("d3-dsv");
      const text = await this.text();
      const format = d3.dsvFormat(delimiter);
      const parse = array ? format.parseRows : format.parse;
      return typed ? (parse as any)(text, d3.autoType) : parse(text);
    },

    async csv(options) {
      return this.dsv({...options, delimiter: ","});
    },

    async tsv(options) {
      return this.dsv({...options, delimiter: "\t"});
    },

    stream() {
      return new ReadableStream({
        async start(controller) {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Unable to load file: ${name}`);
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
      const [Apache, buffer] = await Promise.all([import("apache-arrow"), this.arrayBuffer()]);
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
      const [, buffer] = await Promise.all([_ensureSqlJs(), this.arrayBuffer()]);
      return SQLiteDatabaseClient.open(buffer);
    },

    async xlsx() {
      const [, buffer] = await Promise.all([_ensureExcelJs(), this.arrayBuffer()]);
      return Workbook.load(buffer);
    },

    async zip() {
      const [, buffer] = await Promise.all([_ensureJsZip(), this.arrayBuffer()]);
      return ZipArchive.from(buffer);
    },

    async xml(mimeType = "application/xml") {
      return new DOMParser().parseFromString(await this.text(), mimeType as DOMParserSupportedType);
    },

    async html() {
      return this.xml("text/html");
    },

    async image(props = {}) {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (new URL(url, document.baseURI).origin !== new URL(location.href).origin) {
          img.crossOrigin = "anonymous";
        }
        Object.assign(img, props);
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Unable to load file: ${name}`));
        img.src = url;
      });
    }
  };
}

// ---------------------------------------------------------------------------
// SQLite support — mirrors src/client/stdlib/sqlite.js
// ---------------------------------------------------------------------------

let _sqlitePromise: Promise<any> | null = null;

function _ensureSqlJs(): Promise<any> {
  if (!_sqlitePromise) {
    // @ts-expect-error — sql.js is resolved at bundle time by the framework's rollup resolver
    // eslint-disable-next-line import/no-unresolved
    _sqlitePromise = import("sql.js").then((mod: any) => {
      const initSqlJs = mod.default ?? mod;
      return initSqlJs({
        locateFile: (file: string) => import.meta.resolve("sql.js/dist/") + file
      });
    });
  }
  return _sqlitePromise;
}

// https://www.sqlite.org/datatype3.html
function sqliteType(type: string): string {
  switch (type) {
    case "NULL":
      return "null";
    case "INT":
    case "INTEGER":
    case "TINYINT":
    case "SMALLINT":
    case "MEDIUMINT":
    case "BIGINT":
    case "UNSIGNED BIG INT":
    case "INT2":
    case "INT8":
      return "integer";
    case "TEXT":
    case "CLOB":
      return "string";
    case "REAL":
    case "DOUBLE":
    case "DOUBLE PRECISION":
    case "FLOAT":
    case "NUMERIC":
      return "number";
    case "BLOB":
      return "buffer";
    case "DATE":
    case "DATETIME":
      return "string";
    default:
      return /^(?:(?:(?:VARYING|NATIVE) )?CHARACTER|(?:N|VAR|NVAR)CHAR)\(/.test(type)
        ? "string"
        : /^(?:DECIMAL|NUMERIC)\(/.test(type)
        ? "number"
        : "other";
  }
}

function execSql(db: any, query: string, params?: any[]): any[] {
  const [result] = db.exec(query, params);
  if (!result) return Object.assign([], {columns: []});
  const {columns, values} = result;
  const rows: any = values.map((row: any[]) =>
    Object.fromEntries(row.map((value: any, i: number) => [columns[i], value]))
  );
  rows.columns = columns;
  return rows;
}

export class SQLiteDatabaseClient {
  private _db: any;

  constructor(db: any) {
    this._db = db;
  }

  static async open(source: ArrayBuffer | Uint8Array): Promise<SQLiteDatabaseClient> {
    const SQL = await _ensureSqlJs();
    const data = source instanceof ArrayBuffer ? new Uint8Array(source) : source;
    return new SQLiteDatabaseClient(new SQL.Database(data));
  }

  async query(query: string, params?: any[]): Promise<any[]> {
    return execSql(this._db, query, params);
  }

  async queryRow(query: string, params?: any[]): Promise<any> {
    return (await this.query(query, params))[0] || null;
  }

  async explain(query: string, params?: any[]): Promise<HTMLElement> {
    const rows = await this.query(`EXPLAIN QUERY PLAN ${query}`, params);
    const pre = document.createElement("pre");
    pre.className = "observablehq--inspect";
    pre.textContent = rows.map((row: any) => row.detail).join("\n");
    return pre;
  }

  async describeTables({schema}: {schema?: string} = {}): Promise<any[]> {
    return this.query(
      `SELECT NULLIF(schema, 'main') AS schema, name FROM pragma_table_list() WHERE type = 'table'${
        schema == null ? "" : " AND schema = ?"
      } AND name NOT LIKE 'sqlite_%' ORDER BY schema, name`,
      schema == null ? [] : [schema]
    );
  }

  async describeColumns({schema, table}: {schema?: string; table: string}): Promise<any[]> {
    if (table == null) throw new Error("missing table");
    const rows = await this.query(
      `SELECT name, type, "notnull" FROM pragma_table_info(?${schema == null ? "" : ", ?"}) ORDER BY cid`,
      schema == null ? [table] : [table, schema]
    );
    if (!rows.length) throw new Error(`table not found: ${table}`);
    return rows.map(({name, type, notnull}: any) => ({
      name,
      type: sqliteType(type),
      databaseType: type,
      nullable: !notnull
    }));
  }

  async sql(strings: TemplateStringsArray, ...params: any[]): Promise<any[]> {
    return this.query(strings.join("?"), params);
  }

  get dialect(): string {
    return "sqlite";
  }
}

// ---------------------------------------------------------------------------
// XLSX support — mirrors src/client/stdlib/xlsx.js
// ---------------------------------------------------------------------------

let _excelPromise: Promise<any> | null = null;

function _ensureExcelJs(): Promise<any> {
  if (!_excelPromise) {
    // @ts-expect-error — exceljs is resolved at bundle time by the framework's rollup resolver
    // eslint-disable-next-line import/no-unresolved
    _excelPromise = import("exceljs");
  }
  return _excelPromise;
}

function xlsxValueOf(cell: any): any {
  if (!cell) return;
  const {value} = cell;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if (value.formula || value.sharedFormula) {
      return value.result && value.result.error ? NaN : value.result;
    }
    if (value.richText) {
      return value.richText.map((d: any) => d.text).join("");
    }
    if (value.text) {
      let text = value.text;
      if (text.richText) text = text.richText.map((d: any) => d.text).join("");
      return value.hyperlink && value.hyperlink !== text ? `${value.hyperlink} ${text}` : text;
    }
    return value;
  }
  return value;
}

function toColumn(c: number): string {
  let sc = "";
  c++;
  do {
    sc = String.fromCharCode(64 + (c % 26 || 26)) + sc;
  } while ((c = Math.floor((c - 1) / 26)));
  return sc;
}

function fromCellReference(s: string): [number | undefined, number | undefined] {
  const m = s.match(/^([A-Z]*)(\d*)$/);
  if (!m) return [undefined, undefined];
  const [, sc, sr] = m;
  let c = 0;
  if (sc) for (let i = 0; i < sc.length; i++) c += Math.pow(26, sc.length - i - 1) * (sc.charCodeAt(i) - 64);
  return [c ? c - 1 : undefined, sr ? +sr - 1 : undefined];
}

function parseRange(
  specifier: string = ":",
  sheet: {columnCount: number; rowCount: number}
): [[number, number], [number, number]] {
  specifier = `${specifier}`;
  if (!/^[A-Z]*\d*:[A-Z]*\d*$/.test(specifier)) throw new Error("Malformed range specifier");
  const [[c0 = 0, r0 = 0], [c1 = sheet.columnCount - 1, r1 = sheet.rowCount - 1]] = specifier
    .split(":")
    .map(fromCellReference) as [[number, number], [number, number]];
  return [
    [c0, r0],
    [c1, r1]
  ];
}

function extractSheet(sheet: any, {range, headers}: {range?: string; headers?: boolean} = {}): any[] {
  let [[c0, r0], [c1, r1]] = parseRange(range, sheet); // eslint-disable-line prefer-const
  const headerRow = headers ? sheet._rows[r0++] : null;
  let names: any = new Set(["#"]);
  for (let n = c0; n <= c1; n++) {
    const value = headerRow ? xlsxValueOf(headerRow.findCell(n + 1)) : null;
    let colName = (value && value + "") || toColumn(n);
    while (names.has(colName)) colName += "_";
    names.add(colName);
  }
  names = new Array(c0).concat(Array.from(names));

  const output: any[] = new Array(r1 - r0 + 1);
  for (let r = r0; r <= r1; r++) {
    const row = (output[r - r0] = Object.create(null, {"#": {value: r + 1}}));
    const _row = sheet.getRow(r + 1);
    if (_row.hasValues)
      for (let c = c0; c <= c1; c++) {
        const value = xlsxValueOf(_row.findCell(c + 1));
        if (value != null) row[names[c + 1]] = value;
      }
  }

  (output as any).columns = names.filter(() => true);
  return output;
}

export class Workbook {
  private _: any;
  sheetNames: string[];

  constructor(workbook: any) {
    this._ = workbook;
    this.sheetNames = workbook.worksheets.map((s: any) => s.name);
  }

  static async load(buffer: ArrayBuffer): Promise<Workbook> {
    const Excel = await _ensureExcelJs();
    const ExcelMod = Excel.default ?? Excel;
    const workbook = new ExcelMod.Workbook();
    await workbook.xlsx.load(buffer);
    return new Workbook(workbook);
  }

  sheet(name: string | number, options?: {range?: string; headers?: boolean}): any[] {
    const sname =
      typeof name === "number" ? this.sheetNames[name] : this.sheetNames.includes((name = `${name}`)) ? name : null;
    if (sname == null) throw new Error(`Sheet not found: ${name}`);
    const sheet = this._.getWorksheet(sname);
    return extractSheet(sheet, options);
  }
}

// ---------------------------------------------------------------------------
// ZIP support — mirrors src/client/stdlib/zip.js
// ---------------------------------------------------------------------------

let _jszipPromise: Promise<any> | null = null;

function _ensureJsZip(): Promise<any> {
  if (!_jszipPromise) {
    _jszipPromise = import("jszip");
  }
  return _jszipPromise;
}

export class ZipArchive {
  private _: any;
  filenames: string[];

  constructor(archive: any) {
    this._ = archive;
    this.filenames = Object.keys(archive.files).filter((name: string) => !archive.files[name].dir);
  }

  static async from(buffer: ArrayBuffer): Promise<ZipArchive> {
    const JSZipModule = await _ensureJsZip();
    const JSZip = JSZipModule.default ?? JSZipModule;
    return new ZipArchive(await JSZip.loadAsync(buffer));
  }

  file(path: string): ZipArchiveEntry {
    const object = this._.file((path = `${path}`));
    if (!object || object.dir) throw new Error(`file not found: ${path}`);
    return new ZipArchiveEntry(object);
  }
}

export class ZipArchiveEntry {
  private _: any;
  private _url: string | null = null;
  name: string;

  constructor(object: any) {
    this._ = object;
    this.name = object.name;
  }

  async url(): Promise<string> {
    if (!this._url) this._url = URL.createObjectURL(await this.blob());
    return this._url;
  }

  async blob(): Promise<Blob> {
    return this._.async("blob");
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this._.async("arraybuffer");
  }

  async text(): Promise<string> {
    return this._.async("text");
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

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
      (result) => {
        if (!cancelled) setData(result);
      },
      (err) => {
        if (!cancelled) setError(err);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [file, loader]);

  if (error) throw error;
  return data;
}

// Re-export for use in compiled page code
export {createFileAttachment as FileAttachment};
