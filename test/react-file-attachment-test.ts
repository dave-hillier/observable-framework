import assert from "node:assert";
import {
  registerFile,
  SQLiteDatabaseClient,
  Workbook,
  ZipArchive,
  ZipArchiveEntry,
  FileAttachment
} from "../src/client/hooks/useFileAttachment.js";
import type {FileAttachmentHandle, FileMetadata} from "../src/client/hooks/useFileAttachment.js";

// =============================================================================
// FileAttachment API completeness
// =============================================================================

describe("FileAttachment API surface", () => {
  it("exposes all expected methods on the handle", () => {
    registerFile("test.csv", {name: "test.csv", mimeType: "text/csv", path: "/_file/test.csv"});
    const handle = FileAttachment("test.csv") as FileAttachmentHandle;
    // Core methods
    assert.strictEqual(typeof handle.text, "function");
    assert.strictEqual(typeof handle.json, "function");
    assert.strictEqual(typeof handle.arrayBuffer, "function");
    assert.strictEqual(typeof handle.blob, "function");
    assert.strictEqual(typeof handle.stream, "function");
    assert.strictEqual(typeof handle.image, "function");
    // Tabular data
    assert.strictEqual(typeof handle.dsv, "function");
    assert.strictEqual(typeof handle.csv, "function");
    assert.strictEqual(typeof handle.tsv, "function");
    // Columnar / binary
    assert.strictEqual(typeof handle.arrow, "function");
    assert.strictEqual(typeof handle.parquet, "function");
    // Format-specific
    assert.strictEqual(typeof handle.sqlite, "function");
    assert.strictEqual(typeof handle.xlsx, "function");
    assert.strictEqual(typeof handle.zip, "function");
    // Document parsing
    assert.strictEqual(typeof handle.xml, "function");
    assert.strictEqual(typeof handle.html, "function");
    // Cleanup
    registerFile("test.csv", null);
  });

  it("resolves url from registered file metadata", () => {
    registerFile("data.json", {name: "data.json", mimeType: "application/json", path: "/_file/data.abc123.json"});
    const handle = FileAttachment("data.json") as FileAttachmentHandle;
    assert.strictEqual(handle.url, "/_file/data.abc123.json");
    assert.strictEqual(handle.name, "data.json");
    assert.strictEqual(handle.mimeType, "application/json");
    registerFile("data.json", null);
  });

  it("falls back to /_file/ prefix for unregistered files", () => {
    const handle = FileAttachment("unknown.txt") as FileAttachmentHandle;
    assert.strictEqual(handle.url, "/_file/unknown.txt");
    assert.strictEqual(handle.mimeType, undefined);
  });

  it("registerFile can remove entries with null", () => {
    registerFile("temp.csv", {name: "temp.csv", mimeType: "text/csv", path: "/_file/temp.csv"});
    const handle1 = FileAttachment("temp.csv") as FileAttachmentHandle;
    assert.strictEqual(handle1.url, "/_file/temp.csv");
    registerFile("temp.csv", null);
    const handle2 = FileAttachment("temp.csv") as FileAttachmentHandle;
    assert.strictEqual(handle2.url, "/_file/temp.csv"); // falls back to default
  });
});

// =============================================================================
// SQLiteDatabaseClient class
// =============================================================================

describe("SQLiteDatabaseClient class structure", () => {
  it("has static open method", () => {
    assert.strictEqual(typeof SQLiteDatabaseClient.open, "function");
  });

  it("has expected instance methods", () => {
    // Create a mock instance to check method existence
    const proto = SQLiteDatabaseClient.prototype;
    assert.strictEqual(typeof proto.query, "function");
    assert.strictEqual(typeof proto.queryRow, "function");
    assert.strictEqual(typeof proto.explain, "function");
    assert.strictEqual(typeof proto.describeTables, "function");
    assert.strictEqual(typeof proto.describeColumns, "function");
    assert.strictEqual(typeof proto.sql, "function");
  });

  it("has dialect property", () => {
    // dialect is defined as a getter on the class
    const client = Object.create(SQLiteDatabaseClient.prototype);
    assert.strictEqual(client.dialect, "sqlite");
  });
});

// =============================================================================
// Workbook class
// =============================================================================

describe("Workbook class structure", () => {
  it("has static load method", () => {
    assert.strictEqual(typeof Workbook.load, "function");
  });

  it("has sheet method on prototype", () => {
    assert.strictEqual(typeof Workbook.prototype.sheet, "function");
  });
});

// =============================================================================
// ZipArchive class
// =============================================================================

describe("ZipArchive class structure", () => {
  it("has static from method", () => {
    assert.strictEqual(typeof ZipArchive.from, "function");
  });

  it("has file method on prototype", () => {
    assert.strictEqual(typeof ZipArchive.prototype.file, "function");
  });
});

// =============================================================================
// ZipArchiveEntry class
// =============================================================================

describe("ZipArchiveEntry class structure", () => {
  it("has expected instance methods", () => {
    const proto = ZipArchiveEntry.prototype;
    assert.strictEqual(typeof proto.url, "function");
    assert.strictEqual(typeof proto.blob, "function");
    assert.strictEqual(typeof proto.arrayBuffer, "function");
    assert.strictEqual(typeof proto.text, "function");
    assert.strictEqual(typeof proto.json, "function");
  });
});
