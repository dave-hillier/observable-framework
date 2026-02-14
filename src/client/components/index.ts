// Layout components
export {App} from "./App.js";
export type {AppConfig, AppProps, RouteDefinition} from "./App.js";
export {PageLayout} from "./PageLayout.js";
export type {PageLayoutProps} from "./PageLayout.js";
export {Sidebar} from "./Sidebar.js";
export type {SidebarProps, SidebarPage, SidebarSection, SidebarItem} from "./Sidebar.js";
export {TableOfContents} from "./TableOfContents.js";
export type {TableOfContentsProps} from "./TableOfContents.js";
export {Pager} from "./Pager.js";
export type {PagerProps, PagerLink} from "./Pager.js";
export {ErrorBoundary} from "./ErrorBoundary.js";
export {Loading} from "./Loading.js";
export type {LoadingProps} from "./Loading.js";

// Visualization components
export {PlotFigure, ResponsivePlotFigure} from "./PlotFigure.js";
export type {PlotFigureProps} from "./PlotFigure.js";
export {MermaidDiagram} from "./MermaidDiagram.js";
export type {MermaidDiagramProps} from "./MermaidDiagram.js";
export {TexMath} from "./TexMath.js";
export type {TexMathProps} from "./TexMath.js";
export {DotDiagram} from "./DotDiagram.js";
export type {DotDiagramProps} from "./DotDiagram.js";
export {DuckDBProvider, useDuckDB, useSQL} from "./DuckDBProvider.js";
export type {DuckDBProviderProps, QueryResult} from "./DuckDBProvider.js";

// Input components (re-exported for convenience)
export * from "./inputs/index.js";
