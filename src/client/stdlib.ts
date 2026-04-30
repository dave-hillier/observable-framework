// Compatibility shim: pre-React-port code (and external user modules,
// data loaders, and similar non-component JS files) imported FileAttachment
// from "observablehq:stdlib". The React port moved the implementation to
// useFileAttachment.ts but the import specifier is still in the wild.
// Re-export it here so legacy imports keep working.

export {FileAttachment} from "./hooks/useFileAttachment.js";
