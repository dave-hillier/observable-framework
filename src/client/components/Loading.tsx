import React from "react";

export interface LoadingProps {
  /** Optional message to display */
  message?: string;
  /** CSS class name */
  className?: string;
}

/**
 * Loading indicator component for Suspense fallbacks and pending states.
 * Replaces Observable's `<observablehq-loading>` custom element.
 */
export function Loading({message, className}: LoadingProps) {
  return <div className={`observablehq-loading ${className ?? ""}`}>{message && <span>{message}</span>}</div>;
}
