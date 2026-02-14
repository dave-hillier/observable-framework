/**
 * @observablehq/framework/react
 *
 * Main public API for the React port of Observable Framework.
 * This module re-exports everything users need to build React-based
 * Observable Framework applications.
 *
 * Usage:
 *   import { PageLayout, PlotFigure, useWidth, RangeInput } from "@observablehq/framework/react";
 */

// Hooks
export {
  // Reactive environment hooks
  useWidth,
  useWidthRef,
  useDark,
  useNow,
  useResize,
  useResizeRender,
  useVisibility,
  useGenerator,
  useAsyncIterable,

  // Data loading hooks
  useFileAttachment,
  useFileData,
  useSuspenseData,
  useAsyncData,
  useData,
  invalidateData,
  invalidateAllData,
  registerFile,
  FileAttachment,

  // Cell context hooks
  CellProvider,
  useCellInput,
  useCellOutput,
  useCellContext
} from "./hooks/index.js";

export type {FileAttachmentHandle, FileMetadata} from "./hooks/index.js";

// Components
export {
  // Layout
  App,
  PageLayout,
  Sidebar,
  TableOfContents,
  Pager,
  ErrorBoundary,
  Loading,

  // Visualizations
  PlotFigure,
  ResponsivePlotFigure,
  MermaidDiagram,
  TexMath,
  DotDiagram,
  DuckDBProvider,
  useDuckDB,
  useSQL,

  // Inputs
  RangeInput,
  SelectInput,
  TextInput,
  TextAreaInput,
  CheckboxInput,
  ToggleInput,
  RadioInput,
  DateInput,
  DateTimeInput,
  ColorInput,
  NumberInput,
  SearchInput,
  ButtonInput,
  TableInput
} from "./components/index.js";

export type {
  AppConfig,
  AppProps,
  RouteDefinition,
  PageLayoutProps,
  SidebarProps,
  SidebarPage,
  SidebarSection,
  SidebarItem,
  TableOfContentsProps,
  PagerProps,
  PagerLink,
  LoadingProps,
  PlotFigureProps,
  MermaidDiagramProps,
  TexMathProps,
  DotDiagramProps,
  DuckDBProviderProps,
  QueryResult,
  RangeInputProps,
  SelectInputProps,
  TextInputProps,
  TextAreaInputProps,
  CheckboxInputProps,
  ToggleInputProps,
  RadioInputProps,
  DateInputProps,
  DateTimeInputProps,
  ColorInputProps,
  NumberInputProps,
  SearchInputProps,
  ButtonInputProps,
  TableInputProps
} from "./components/index.js";
