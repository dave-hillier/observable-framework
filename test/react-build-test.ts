import assert from "node:assert";
import {existsSync, readdirSync, statSync} from "node:fs";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import {join, normalize, relative} from "node:path/posix";
import {PassThrough} from "node:stream";
import type {BuildManifest} from "../src/build.js";
import {FileBuildEffects, build} from "../src/build.js";
import {normalizeConfig, setCurrentDate} from "../src/config.js";
import {mockDuckDB} from "./mocks/duckdb.js";
import {mockJsDelivr} from "./mocks/jsdelivr.js";
import {mockJsr} from "./mocks/jsr.js";

const silentEffects = {
  logger: {log() {}, warn() {}, error() {}},
  output: {write() {}}
};

describe("React build", () => {
  before(() => setCurrentDate(new Date("2024-01-10T16:00:00")));
  after(() => setCurrentDate(null));
  mockJsDelivr();
  mockJsr();
  mockDuckDB();

  it("should produce React page modules instead of Observable HTML", async () => {
    const tmpPrefix = join(os.tmpdir(), "framework-react-build-");
    const inputDir = await mkdtemp(tmpPrefix + "input-");
    await writeFile(join(inputDir, "index.md"), "# React Home\n\n```js\ndisplay(\"Hello\");\n```");

    const outputDir = await mkdtemp(tmpPrefix + "output-");
    const cacheDir = await mkdtemp(tmpPrefix + "cache-");

    const config = normalizeConfig({root: inputDir, output: outputDir, react: true}, inputDir);
    const effects = new LoggingBuildEffects(outputDir, cacheDir);
    await build({config}, effects);

    // Should have an index.html file
    const indexHtml = await readFile(join(outputDir, "index.html"), "utf8");

    // The HTML should be a React shell (contains React bootstrap imports), NOT Observable HTML
    assert.ok(indexHtml.includes("react-bootstrap"), "should reference react-bootstrap module");
    assert.ok(indexHtml.includes("react-dom-bootstrap"), "should reference react-dom-bootstrap module");
    assert.ok(indexHtml.includes("framework-react"), "should reference framework-react module");
    assert.ok(indexHtml.includes("observablehq-root"), "should have React root div");

    // Should NOT contain Observable runtime markers
    assert.ok(!indexHtml.includes("define({id:"), "should not contain Observable define() calls");
    assert.ok(!indexHtml.includes("observablehq:client"), "should not reference Observable client");

    // Should have a page module in /_observablehq/react-pages/
    const reactPagesDir = join(outputDir, "_observablehq", "react-pages");
    assert.ok(existsSync(reactPagesDir), "should have react-pages directory");

    // Find the page module (hashed filename)
    const pageFiles = [...findFiles(reactPagesDir)];
    assert.ok(pageFiles.some((f) => f.startsWith("index.") && f.endsWith(".js")), "should have hashed index page module");

    // Read the page module and verify it's a React component
    const pageModuleFile = pageFiles.find((f) => f.startsWith("index.") && f.endsWith(".js"))!;
    const pageModule = await readFile(join(reactPagesDir, pageModuleFile), "utf8");
    assert.ok(pageModule.includes("export default function Page"), "page module should export default Page component");

    await Promise.all([inputDir, cacheDir, outputDir].map((dir) => rm(dir, {recursive: true}))).catch(() => {});
  });

  it("should write React shell HTML for multiple page paths", async () => {
    const tmpPrefix = join(os.tmpdir(), "framework-react-build-");
    const inputDir = await mkdtemp(tmpPrefix + "input-");
    await writeFile(join(inputDir, "index.md"), "# Home");
    await mkdir(join(inputDir, "docs"));
    await writeFile(join(inputDir, "docs", "guide.md"), "# Guide");

    const outputDir = await mkdtemp(tmpPrefix + "output-");
    const cacheDir = await mkdtemp(tmpPrefix + "cache-");

    const config = normalizeConfig(
      {root: inputDir, output: outputDir, react: true, pages: [{name: "Guide", path: "/docs/guide"}]},
      inputDir
    );
    const effects = new LoggingBuildEffects(outputDir, cacheDir);
    await build({config}, effects);

    // Both pages should have HTML files
    assert.ok(existsSync(join(outputDir, "index.html")), "should have index.html");
    assert.ok(existsSync(join(outputDir, "docs", "guide.html")), "should have docs/guide.html");

    // Both should be React shells
    const indexHtml = await readFile(join(outputDir, "index.html"), "utf8");
    const guideHtml = await readFile(join(outputDir, "docs", "guide.html"), "utf8");
    assert.ok(indexHtml.includes("react-bootstrap"), "index should be React shell");
    assert.ok(guideHtml.includes("react-bootstrap"), "guide should be React shell");

    // Each should reference its own page module
    assert.ok(indexHtml.includes("react-pages"), "index should reference a react-pages module");
    assert.ok(guideHtml.includes("react-pages"), "guide should reference a react-pages module");

    await Promise.all([inputDir, cacheDir, outputDir].map((dir) => rm(dir, {recursive: true}))).catch(() => {});
  });

  it("should not include Observable runtime bundles in React mode", async () => {
    const tmpPrefix = join(os.tmpdir(), "framework-react-build-");
    const inputDir = await mkdtemp(tmpPrefix + "input-");
    await writeFile(join(inputDir, "index.md"), "# Static page");

    const outputDir = await mkdtemp(tmpPrefix + "output-");
    const cacheDir = await mkdtemp(tmpPrefix + "cache-");

    const config = normalizeConfig({root: inputDir, output: outputDir, react: true}, inputDir);
    const effects = new LoggingBuildEffects(outputDir, cacheDir);
    await build({config}, effects);

    // Check the _observablehq directory contents
    const observablehqDir = join(outputDir, "_observablehq");
    if (existsSync(observablehqDir)) {
      const allFiles = [...findFiles(observablehqDir)];
      // Should have React bootstrap files but NOT Observable client/runtime/stdlib
      assert.ok(allFiles.some((f) => f.includes("react-bootstrap")), "should have react-bootstrap");
      assert.ok(allFiles.some((f) => f.includes("react-dom-bootstrap")), "should have react-dom-bootstrap");
      assert.ok(allFiles.some((f) => f.includes("framework-react")), "should have framework-react");

      // Should NOT have the standard Observable client bundle
      // (client.js is the Observable client, not React client)
      const hasObservableClient = allFiles.some((f) => /^client\.[0-9a-f]+\.js$/.test(f));
      assert.ok(!hasObservableClient, "should not have Observable client.js bundle");
    }

    await Promise.all([inputDir, cacheDir, outputDir].map((dir) => rm(dir, {recursive: true}))).catch(() => {});
  });

  it("should include pages in the build manifest", async () => {
    const tmpPrefix = join(os.tmpdir(), "framework-react-build-");
    const inputDir = await mkdtemp(tmpPrefix + "input-");
    await writeFile(join(inputDir, "index.md"), "# Home");
    await writeFile(join(inputDir, "about.md"), "# About");

    const outputDir = await mkdtemp(tmpPrefix + "output-");
    const cacheDir = await mkdtemp(tmpPrefix + "cache-");

    const config = normalizeConfig(
      {root: inputDir, output: outputDir, react: true, pages: [{name: "About", path: "/about"}]},
      inputDir
    );
    const effects = new LoggingBuildEffects(outputDir, cacheDir);
    await build({config}, effects);

    assert.ok(effects.buildManifest, "should have a build manifest");
    const paths = effects.buildManifest!.pages.map((p) => p.path).sort();
    assert.ok(paths.includes("/"), "manifest should include index page");
    assert.ok(paths.includes("/about"), "manifest should include about page");

    await Promise.all([inputDir, cacheDir, outputDir].map((dir) => rm(dir, {recursive: true}))).catch(() => {});
  });
});

function* findFiles(root: string): Iterable<string> {
  const visited = new Set<number>();
  const queue: string[] = [(root = normalize(root))];
  for (const path of queue) {
    if (!existsSync(path)) continue;
    const status = statSync(path);
    if (status.isDirectory()) {
      if (visited.has(status.ino)) throw new Error(`Circular directory: ${path}`);
      visited.add(status.ino);
      for (const entry of readdirSync(path)) {
        if (entry === ".DS_Store") continue;
        queue.push(join(path, entry));
      }
    } else {
      yield relative(root, path);
    }
  }
}

class LoggingBuildEffects extends FileBuildEffects {
  logs: {level: string; args: unknown[]}[] = [];
  copiedFiles: {sourcePath: string; outputPath: string}[] = [];
  writtenFiles: {outputPath: string; contents: string | Buffer}[] = [];
  buildManifest: BuildManifest | undefined;

  constructor(outputRoot: string, cacheDir: string) {
    const logger = {
      log: (...args: unknown[]) => this.logs.push({level: "log", args}),
      warn: (...args: unknown[]) => this.logs.push({level: "warn", args}),
      error: (...args: unknown[]) => this.logs.push({level: "error", args})
    };
    const output = new PassThrough();
    super(outputRoot, cacheDir, {logger, output});
  }

  async copyFile(sourcePath: string, outputPath: string): Promise<void> {
    this.copiedFiles.push({sourcePath, outputPath});
    return super.copyFile(sourcePath, outputPath);
  }
  async writeFile(outputPath: string, contents: string | Buffer): Promise<void> {
    this.writtenFiles.push({outputPath, contents});
    return super.writeFile(outputPath, contents);
  }
  async writeBuildManifest(buildManifest: BuildManifest): Promise<void> {
    this.buildManifest = buildManifest;
    return super.writeBuildManifest(buildManifest);
  }
}
