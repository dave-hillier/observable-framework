import React, {useCallback, useId, useMemo, useState} from "react";

export interface SearchInputProps<T = Record<string, unknown>> {
  /** The data to search through */
  data: T[];
  /** Current filtered results (controlled by parent) */
  value?: T[];
  /** Called when results change */
  onChange: (results: T[]) => void;
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Columns to search (defaults to all string columns) */
  columns?: string[];
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A search input that filters tabular data.
 * Replaces Observable's `Inputs.search(data, {label, columns})`.
 *
 * Returns filtered rows matching the search query across specified columns.
 */
export function SearchInput<T extends Record<string, unknown> = Record<string, unknown>>({
  data,
  onChange,
  label,
  placeholder = "Search...",
  columns,
  disabled = false,
  className
}: SearchInputProps<T>) {
  const id = useId();
  const [query, setQuery] = useState("");

  const searchColumns = useMemo(() => {
    if (columns) return columns;
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter((key) => typeof data[0][key] === "string");
  }, [data, columns]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setQuery(q);
      if (!q.trim()) {
        onChange(data);
        return;
      }
      const lower = q.toLowerCase();
      const results = data.filter((row) =>
        searchColumns.some((col) =>
          String(row[col] ?? "")
            .toLowerCase()
            .includes(lower)
        )
      );
      onChange(results);
    },
    [data, searchColumns, onChange]
  );

  return (
    <div className={`observablehq-input observablehq-search ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        type="search"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
