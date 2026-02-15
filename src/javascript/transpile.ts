import {join} from "node:path/posix";
import type {CallExpression, Node} from "acorn";
import type {ImportDeclaration, ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier} from "acorn";
import {simple} from "acorn-walk";
import mime from "mime";
import {isPathImport, relativePath, resolvePath} from "../path.js";
import {getModuleResolver} from "../resolvers.js";
import type {Params} from "../route.js";
import {Sourcemap} from "../sourcemap.js";
import {annotatePath} from "./annotate.js";
import {findFiles} from "./files.js";
import type {ExportNode, ImportNode} from "./imports.js";
import {isImportMetaResolve, isJavaScript} from "./imports.js";
import type {FileInfo} from "./module.js";
import {findParams} from "./params.js";
import {parseProgram} from "./parse.js";
import type {StringLiteral} from "./source.js";
import {getStringLiteralValue, isStringLiteral} from "./source.js";

export interface TranspileModuleOptions {
  root: string;
  path: string;
  servePath?: string; // defaults to /_import/${path}
  params?: Params;
  resolveImport?: (specifier: string) => string | Promise<string>;
  resolveFile?: (name: string) => string;
  resolveFileInfo?: (name: string) => FileInfo | undefined;
}

/** Rewrites import specifiers and FileAttachment calls in the specified ES module. */
export async function transpileModule(
  input: string,
  {
    root,
    path,
    servePath = `/${join("_import", path)}`,
    params,
    resolveImport = getModuleResolver(root, path, servePath),
    resolveFile = (name) => name,
    resolveFileInfo = () => undefined
  }: TranspileModuleOptions
): Promise<string> {
  const body = parseProgram(input, params); // TODO ignore syntax error?
  const output = new Sourcemap(input);
  const imports: (ImportNode | ExportNode)[] = [];
  const calls: CallExpression[] = [];

  if (params) rewriteParams(output, body, params, input);

  simple(body, {
    ImportDeclaration: rewriteImport,
    ImportExpression: rewriteImport,
    ExportAllDeclaration: rewriteImport,
    ExportNamedDeclaration: rewriteImport,
    CallExpression: rewriteCall
  });

  function rewriteImport(node: ImportNode | ExportNode) {
    imports.push(node);
  }

  function rewriteCall(node: CallExpression) {
    calls.push(node);
  }

  async function rewriteImportSource(source: StringLiteral) {
    const specifier = getStringLiteralValue(source);
    output.replaceLeft(source.start, source.end, annotatePath(await resolveImport(specifier)));
  }

  for (const {name, node} of findFiles(body, path, input)) {
    const source = node.arguments[0];
    const p = relativePath(servePath, resolvePath(path, name));
    const info = resolveFileInfo(name);
    output.replaceLeft(
      source.start,
      source.end,
      `${
        info
          ? `{"name":${JSON.stringify(p)},"mimeType":${JSON.stringify(
              mime.getType(name) ?? undefined
            )},"path":${annotatePath(relativePath(servePath, resolveFile(name)))},"lastModified":${JSON.stringify(
              info.mtimeMs
            )},"size":${JSON.stringify(info.size)}}`
          : JSON.stringify(p)
      }, import.meta.url`
    );
  }

  for (const node of imports) {
    const source = node.source;
    if (source && isStringLiteral(source)) {
      await rewriteImportSource(source);
    }
  }

  for (const node of calls) {
    const source = node.arguments[0];
    if (isImportMetaResolve(node) && isStringLiteral(source)) {
      const value = getStringLiteralValue(source);
      const resolution = isPathImport(value) && !isJavaScript(value) ? resolveFile(value) : await resolveImport(value);
      output.replaceLeft(source.start, source.end, annotatePath(resolution));
    }
  }

  return String(output);
}

function rewriteImportDeclarations(
  output: Sourcemap,
  body: Node,
  resolve: (specifier: string) => string = String
): void {
  const declarations: ImportDeclaration[] = [];

  simple(body, {
    ImportDeclaration(node) {
      if (isStringLiteral(node.source)) {
        declarations.push(node);
      }
    }
  });

  const specifiers: string[] = [];
  const imports: string[] = [];
  for (const node of declarations) {
    output.delete(node.start, node.end + +(output.input[node.end] === "\n"));
    specifiers.push(rewriteImportSpecifiers(node));
    imports.push(`import(${annotatePath(resolve(getStringLiteralValue(node.source as StringLiteral)))})`);
  }
  if (declarations.length > 1) {
    output.insertLeft(0, `const [${specifiers.join(", ")}] = await Promise.all([${imports.join(", ")}]);\n`);
  } else if (declarations.length === 1) {
    output.insertLeft(0, `const ${specifiers[0]} = await ${imports[0]};\n`);
  }
}

function rewriteImportSpecifiers(node: ImportDeclaration): string {
  return node.specifiers.some(isNotNamespaceSpecifier)
    ? `{${node.specifiers.filter(isNotNamespaceSpecifier).map(rewriteImportSpecifier).join(", ")}}`
    : node.specifiers.find(isNamespaceSpecifier)?.local.name ?? "{}";
}

function rewriteImportSpecifier(node: ImportSpecifier | ImportDefaultSpecifier): string {
  return isDefaultSpecifier(node)
    ? `default: ${getLocalName(node)}`
    : getImportedName(node) === getLocalName(node)
    ? getLocalName(node)
    : `${getImportedName(node)}: ${getLocalName(node)}`;
}

function getLocalName(node: ImportSpecifier | ImportDefaultSpecifier): string {
  return node.local.name;
}

function getImportedName(node: ImportSpecifier): string {
  return node.imported.type === "Identifier" ? node.imported.name : node.imported.raw!;
}

function isDefaultSpecifier(
  node: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier
): node is ImportDefaultSpecifier {
  return node.type === "ImportDefaultSpecifier";
}

function isNamespaceSpecifier(
  node: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier
): node is ImportNamespaceSpecifier {
  return node.type === "ImportNamespaceSpecifier";
}

function isNotNamespaceSpecifier(
  node: ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier
): node is ImportSpecifier | ImportDefaultSpecifier {
  return node.type !== "ImportNamespaceSpecifier";
}

export function rewriteParams(output: Sourcemap, body: Node, params: Params, input: string): void {
  for (const [name, node] of findParams(body, params, input)) {
    output.replaceLeft(node.start, node.end, JSON.stringify(params[name]));
  }
}
