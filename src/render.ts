import type {TranspileModuleOptions} from "./javascript/transpile.js";
import {transpileModule} from "./javascript/transpile.js";
import {enoent} from "./error.js";
import {findModule} from "./javascript/module.js";
import {getModuleResolver, getModuleStaticImports} from "./resolvers.js";

export type RenderModuleOptions = Omit<TranspileModuleOptions, "root" | "path" | "servePath" | "params">;

export async function renderModule(
  root: string,
  path: string,
  {resolveImport = getModuleResolver(root, path), ...options}: RenderModuleOptions = {}
): Promise<string> {
  const module = findModule(root, path);
  if (!module) throw enoent(path);
  const imports = new Set<string>();
  const resolutions = new Set<string>();
  for (const i of await getModuleStaticImports(root, path)) {
    const r = await resolveImport(i);
    if (!resolutions.has(r)) {
      resolutions.add(r);
      imports.add(i);
    }
  }
  const input = Array.from(imports, (i) => `import ${JSON.stringify(i)};\n`)
    .concat(`export * from ${JSON.stringify(path)};\n`)
    .join("");
  return await transpileModule(input, {root, path, servePath: path, params: module.params, resolveImport, ...options});
}
