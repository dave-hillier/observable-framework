import React, {useCallback, useMemo, useState} from "react";

export interface TableInputProps<T = Record<string, unknown>> {
  /** The data to display */
  data: T[];
  /** Currently selected rows */
  value?: T[];
  /** Called when row selection changes */
  onChange?: (selected: T[]) => void;
  /** Columns to display (defaults to all) */
  columns?: string[];
  /** Column header labels */
  header?: Record<string, string>;
  /** Column formatting functions */
  format?: Record<string, (value: unknown, index: number, data: T[]) => React.ReactNode>;
  /** Number of rows per page */
  rows?: number;
  /** Whether rows are selectable */
  select?: boolean;
  /** Whether to show sort controls */
  sort?: boolean | string;
  /** Whether to show row numbers */
  layout?: "auto" | "fixed";
  /** CSS class name */
  className?: string;
}

type SortDirection = "asc" | "desc" | null;

/**
 * An interactive data table component with sorting and row selection.
 * Replaces Observable's `Inputs.table(data, {columns, header, format, rows, select})`.
 */
export function TableInput<T extends Record<string, unknown> = Record<string, unknown>>({
  data,
  value: selectedRows,
  onChange,
  columns: columnsProp,
  header: headerProp = {},
  format: formatProp = {},
  rows: rowsPerPage = 15,
  select = false,
  sort: sortable = true,
  layout = "auto",
  className
}: TableInputProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(typeof sortable === "string" ? sortable : null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(typeof sortable === "string" ? "asc" : null);
  const [page, setPage] = useState(0);
  const [selectedSet, setSelectedSet] = useState<Set<number>>(
    () => new Set(selectedRows?.map((r) => data.indexOf(r)).filter((i) => i >= 0))
  );

  const columns = useMemo(() => {
    if (columnsProp) return columnsProp;
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data, columnsProp]);

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;
    return [...data].sort((a, b) => {
      const av = a[sortColumn];
      const bv = b[sortColumn];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDirection === "desc" ? -cmp : cmp;
    });
  }, [data, sortColumn, sortDirection]);

  const pageCount = Math.ceil(sortedData.length / rowsPerPage);
  const pageData = sortedData.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handleSort = useCallback(
    (col: string) => {
      if (sortColumn === col) {
        setSortDirection((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
        if (sortDirection === "desc") setSortColumn(null);
      } else {
        setSortColumn(col);
        setSortDirection("asc");
      }
    },
    [sortColumn, sortDirection]
  );

  const handleRowSelect = useCallback(
    (originalIndex: number) => {
      setSelectedSet((prev) => {
        const next = new Set(prev);
        if (next.has(originalIndex)) next.delete(originalIndex);
        else next.add(originalIndex);
        if (onChange) {
          onChange(Array.from(next).map((i) => data[i]));
        }
        return next;
      });
    },
    [data, onChange]
  );

  return (
    <div className={`observablehq-input observablehq-table ${className ?? ""}`}>
      <table style={{tableLayout: layout}}>
        <thead>
          <tr>
            {select && <th />}
            {columns.map((col) => (
              <th
                key={col}
                onClick={sortable ? () => handleSort(col) : undefined}
                style={sortable ? {cursor: "pointer"} : undefined}
              >
                {headerProp[col] ?? col}
                {sortColumn === col && (sortDirection === "asc" ? " \u25b2" : " \u25bc")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageData.map((row, i) => {
            const originalIndex = data.indexOf(row);
            return (
              <tr key={originalIndex} className={selectedSet.has(originalIndex) ? "observablehq-selected" : undefined}>
                {select && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(originalIndex)}
                      onChange={() => handleRowSelect(originalIndex)}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col}>{formatProp[col] ? formatProp[col](row[col], i, data) : String(row[col] ?? "")}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {pageCount > 1 && (
        <div className="observablehq-table-pagination">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            {page + 1} of {pageCount}
          </span>
          <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
