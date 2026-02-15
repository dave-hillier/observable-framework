import assert from "node:assert";
import type {TranspileModuleOptions} from "../../src/javascript/transpile.js";
import {transpileModule} from "../../src/javascript/transpile.js";
import {mockJsDelivr} from "../mocks/jsdelivr.js";

async function testFile(target: string, path: string): Promise<string> {
  const input = `import {FileAttachment} from "observablehq:stdlib";\nFileAttachment(${JSON.stringify(target)})`;
  const output = await transpileModule(input, {root: "src", path});
  return output.split("\n").pop()!;
}

describe("transpileModule(input, root, path, sourcePath)", () => {
  it("rewrites relative files with import.meta.resolve", async () => {
    assert.strictEqual(await testFile("./test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("./sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("./test.txt", "sub/test.js"), 'FileAttachment("../../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("../test.txt", "sub/test.js"), 'FileAttachment("../../test.txt", import.meta.url)'); // prettier-ignore
  });
  it("does not require paths to start with ./, ../, or /", async () => {
    assert.strictEqual(await testFile("test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("test.txt", "sub/test.js"), 'FileAttachment("../../sub/test.txt", import.meta.url)'); // prettier-ignore
  });
  it("rewrites absolute files with meta", async () => {
    assert.strictEqual(await testFile("/test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("/sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("/test.txt", "sub/test.js"), 'FileAttachment("../../test.txt", import.meta.url)'); // prettier-ignore
  });
});

describe("transpileModule(input, root, path)", () => {
  mockJsDelivr();
  const options: TranspileModuleOptions = {root: "src", path: "test.js"};
  it("rewrites relative files with import.meta.resolve", async () => {
    assert.strictEqual(await testFile("./test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("./sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("./test.txt", "sub/test.js"), 'FileAttachment("../../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("../test.txt", "sub/test.js"), 'FileAttachment("../../test.txt", import.meta.url)'); // prettier-ignore
  });
  it("does not require paths to start with ./, ../, or /", async () => {
    assert.strictEqual(await testFile("test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("test.txt", "sub/test.js"), 'FileAttachment("../../sub/test.txt", import.meta.url)'); // prettier-ignore
  });
  it("rewrites absolute files with meta", async () => {
    assert.strictEqual(await testFile("/test.txt", "test.js"), 'FileAttachment("../test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("/sub/test.txt", "test.js"), 'FileAttachment("../sub/test.txt", import.meta.url)'); // prettier-ignore
    assert.strictEqual(await testFile("/test.txt", "sub/test.js"), 'FileAttachment("../../test.txt", import.meta.url)'); // prettier-ignore
  });
  it("ignores FileAttachment if masked by a reference", async () => {
    const input = 'import {FileAttachment} from "observablehq:stdlib";\n((FileAttachment) => FileAttachment("./test.txt"))(eval)'; // prettier-ignore
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, '((FileAttachment) => FileAttachment("./test.txt"))(eval)');
  });
  it("ignores FileAttachment if not imported", async () => {
    const input = 'import {Generators} from "observablehq:stdlib";\nFileAttachment("./test.txt")';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'FileAttachment("./test.txt")');
  });
  it("ignores FileAttachment if a comma expression", async () => {
    const input = 'import {FileAttachment} from "observablehq:stdlib";\n(1, FileAttachment)("./test.txt")';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, '(1, FileAttachment)("./test.txt")');
  });
  it("ignores FileAttachment if not imported from observablehq:stdlib", async () => {
    const input = 'import {FileAttachment} from "observablehq:inputs";\nFileAttachment("./test.txt")';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'FileAttachment("./test.txt")');
  });
  it("rewrites FileAttachment when aliased", async () => {
    const input = 'import {FileAttachment as F} from "observablehq:stdlib";\nF("./test.txt")';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'F("../test.txt", import.meta.url)');
  });
  it("rewrites FileAttachment when aliased to a global", async () => {
    const input = 'import {FileAttachment as File} from "observablehq:stdlib";\nFile("./test.txt")';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'File("../test.txt", import.meta.url)');
  });
  it.skip("rewrites FileAttachment when imported as a namespace", async () => {
    const input = 'import * as O from "observablehq:stdlib";\nO.FileAttachment("./test.txt")';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'O.FileAttachment("../test.txt", import.meta.url)');
  });
  it("ignores non-FileAttachment calls", async () => {
    const input = 'import {FileAttachment} from "observablehq:stdlib";\nFile("./test.txt")';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'File("./test.txt")');
  });
  it("rewrites single-quoted literals", async () => {
    const input = "import {FileAttachment} from \"observablehq:stdlib\";\nFileAttachment('./test.txt')";
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'FileAttachment("../test.txt", import.meta.url)');
  });
  it("rewrites template-quoted literals", async () => {
    const input = 'import {FileAttachment} from "observablehq:stdlib";\nFileAttachment(`./test.txt`)';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'FileAttachment("../test.txt", import.meta.url)');
  });
  it("throws a syntax error with non-literal calls", async () => {
    const input = 'import {FileAttachment} from "observablehq:stdlib";\nFileAttachment(`./${test}.txt`)';
    await assert.rejects(() => transpileModule(input, options), /FileAttachment requires a single literal string/); // prettier-ignore
  });
  it("throws a syntax error with URL fetches", async () => {
    const input = 'import {FileAttachment} from "observablehq:stdlib";\nFileAttachment("https://example.com")';
    await assert.rejects(() => transpileModule(input, options), /non-local file path/); // prettier-ignore
  });
  it("ignores non-local path fetches", async () => {
    const input1 = 'import {FileAttachment} from "observablehq:stdlib";\nFileAttachment("../test.txt")';
    const input2 = 'import {FileAttachment} from "observablehq:stdlib";\nFileAttachment("./../test.txt")';
    const input3 = 'import {FileAttachment} from "observablehq:stdlib";\nFileAttachment("../../test.txt")';
    const input4 = 'import {FileAttachment} from "observablehq:stdlib";\nFileAttachment("./../../test.txt")';
    await assert.rejects(() => transpileModule(input1, options), /non-local file path/); // prettier-ignore
    await assert.rejects(() => transpileModule(input2, options), /non-local file path/); // prettier-ignore
    await assert.rejects(() => transpileModule(input3, {...options, path: "sub/test.js"}), /non-local file path/); // prettier-ignore
    await assert.rejects(() => transpileModule(input4, {...options, path: "sub/test.js"}), /non-local file path/); // prettier-ignore
  });
  it("rewrites npm imports", async () => {
    const input = 'import "npm:d3-array";';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'import "../_npm/d3-array@3.2.4/_esm.js";');
  });
  it("rewrites node imports", async () => {
    const input = 'import "d3-array";';
    const output = (await transpileModule(input, options)).split("\n").pop()!;
    assert.strictEqual(output, 'import "../_node/d3-array@3.2.4/index.js";');
  });
});
