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
export {ThemeToggle} from "./components/ThemeToggle.js";

// DuckDB
export {DuckDBProvider, useDuckDB, useSQL} from "./components/DuckDBProvider.js";
export type {DuckDBProviderProps, QueryResult} from "./components/DuckDBProvider.js";

// Visualization components
export {PlotFigure, ResponsivePlotFigure} from "./components/PlotFigure.js";
export type {PlotFigureProps} from "./components/PlotFigure.js";
export {MermaidDiagram} from "./components/MermaidDiagram.js";
export type {MermaidDiagramProps} from "./components/MermaidDiagram.js";
export {DotDiagram} from "./components/DotDiagram.js";
export type {DotDiagramProps} from "./components/DotDiagram.js";
export {TexMath} from "./components/TexMath.js";
export type {TexMathProps} from "./components/TexMath.js";

// Input components
export {RangeInput} from "./components/inputs/RangeInput.js";
export type {RangeInputProps} from "./components/inputs/RangeInput.js";
export {SelectInput} from "./components/inputs/SelectInput.js";
export type {SelectInputProps} from "./components/inputs/SelectInput.js";
export {TextInput, TextAreaInput} from "./components/inputs/TextInput.js";
export type {TextInputProps, TextAreaInputProps} from "./components/inputs/TextInput.js";
export {CheckboxInput, ToggleInput} from "./components/inputs/CheckboxInput.js";
export type {CheckboxInputProps, ToggleInputProps} from "./components/inputs/CheckboxInput.js";
export {RadioInput} from "./components/inputs/RadioInput.js";
export type {RadioInputProps} from "./components/inputs/RadioInput.js";
export {DateInput, DateTimeInput} from "./components/inputs/DateInput.js";
export type {DateInputProps, DateTimeInputProps} from "./components/inputs/DateInput.js";
export {ColorInput} from "./components/inputs/ColorInput.js";
export type {ColorInputProps} from "./components/inputs/ColorInput.js";
export {NumberInput} from "./components/inputs/NumberInput.js";
export type {NumberInputProps} from "./components/inputs/NumberInput.js";
export {SearchInput} from "./components/inputs/SearchInput.js";
export type {SearchInputProps} from "./components/inputs/SearchInput.js";
export {ButtonInput} from "./components/inputs/ButtonInput.js";
export type {ButtonInputProps} from "./components/inputs/ButtonInput.js";
export {TableInput} from "./components/inputs/TableInput.js";
export type {TableInputProps} from "./components/inputs/TableInput.js";
export {FileInput} from "./components/inputs/FileInput.js";
export type {FileInputProps} from "./components/inputs/FileInput.js";

// Cell context hooks
export {CellProvider, useCellInput, useCellOutput, useCellContext} from "./hooks/useCellContext.js";

// Reactive environment hooks
export {useWidth, useWidthRef} from "./hooks/useWidth.js";
export {useDark, useThemePreference} from "./hooks/useDark.js";
export type {ThemePreference} from "./hooks/useDark.js";
export {useNow} from "./hooks/useNow.js";
export {useResize, useResizeRender} from "./hooks/useResize.js";
export {useVisibility, useVisibilityPromise} from "./hooks/useVisibility.js";
export {useGenerator, useAsyncIterable} from "./hooks/useGenerator.js";

// Search
export {useSearch} from "./hooks/useSearch.js";
export type {SearchResult} from "./hooks/useSearch.js";

// Data loading hooks
export {useSuspenseData, invalidateData, invalidateAllData, useAsyncData, useData} from "./hooks/useData.js";

// File attachment hooks & file format classes
export {
  registerFile,
  onFileChange,
  getFileMetadata,
  useFileAttachment,
  useFileData,
  FileAttachment,
  SQLiteDatabaseClient,
  Workbook,
  ZipArchive,
  ZipArchiveEntry
} from "./hooks/useFileAttachment.js";
export type {FileMetadata, FileAttachmentHandle} from "./hooks/useFileAttachment.js";
