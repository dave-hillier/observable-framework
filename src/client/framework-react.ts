/**
 * Framework React module served at /_observablehq/framework-react.js
 * Re-exports the React components, hooks, and utilities from the framework.
 */

// Layout components
export {App} from "./components/App.js";
export type {AppConfig, AppProps, RouteDefinition} from "./components/App.js";
export {PageLayout} from "./components/PageLayout.js";
export type {PageLayoutProps} from "./components/PageLayout.js";
export {Sidebar} from "./components/Sidebar.js";
export type {SidebarProps, SidebarPage, SidebarSection, SidebarItem} from "./components/Sidebar.js";
export {TableOfContents} from "./components/TableOfContents.js";
export type {TableOfContentsProps} from "./components/TableOfContents.js";
export {Pager} from "./components/Pager.js";
export type {PagerProps, PagerLink} from "./components/Pager.js";
export {ErrorBoundary} from "./components/ErrorBoundary.js";
export {Loading} from "./components/Loading.js";

// Cell context hooks
export {CellProvider, useCellInput, useCellOutput, useCellContext} from "./hooks/useCellContext.js";

// Reactive environment hooks
export {useWidth, useWidthRef} from "./hooks/useWidth.js";
export {useDark} from "./hooks/useDark.js";
export {useNow} from "./hooks/useNow.js";

// Data loading hooks & file format classes
export {useFileAttachment, useFileData, SQLiteDatabaseClient, Workbook, ZipArchive, ZipArchiveEntry} from "./hooks/useFileAttachment.js";
