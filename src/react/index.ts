// React compilation pipeline
export {compileMarkdownToReact} from "./compile.js";
export type {CompileOptions, FileRegistration} from "./compile.js";
export {compileCellToComponent, compileInlineCellToExpression} from "./cell-transform.js";
export type {CellCompileOptions} from "./cell-transform.js";
export {generateReactPageShell, generateAppEntryModule} from "./page-template.js";

// React rendering (page → HTML shell + compiled module)
export {renderReactPage, renderReactPageModule, configToAppConfig, generateRouteDefinitions, generateRouteDefinitionsModule} from "./render.js";
export type {ReactRenderOptions} from "./render.js";

// SSR
export {extractStaticHtml, renderPageToString} from "./ssr.js";
