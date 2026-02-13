import React, {useCallback, useId} from "react";

export interface SelectInputProps<T = string> {
  /** The available options */
  options: T[];
  /** Current selected value */
  value: T;
  /** Called when selection changes */
  onChange: (value: T) => void;
  /** Label text */
  label?: string;
  /** Function to format option display text */
  format?: (option: T) => string;
  /** Whether multiple selections are allowed */
  multiple?: boolean;
  /** Number of visible rows (for multiple mode) */
  size?: number;
  /** Whether to sort options */
  sort?: boolean | "ascending" | "descending";
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A select dropdown/listbox component.
 * Replaces Observable's `Inputs.select(options, {label, format, multiple})`.
 */
export function SelectInput<T = string>({
  options,
  value,
  onChange,
  label,
  format = String,
  multiple = false,
  size,
  sort,
  disabled = false,
  className
}: SelectInputProps<T>) {
  const id = useId();

  const sortedOptions = sort
    ? [...options].sort((a, b) => {
        const fa = format(a);
        const fb = format(b);
        const cmp = fa.localeCompare(fb);
        return sort === "descending" ? -cmp : cmp;
      })
    : options;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (multiple) {
        const selected = Array.from(e.target.selectedOptions, (o) => options[+o.value]);
        onChange(selected as unknown as T);
      } else {
        onChange(options[+e.target.value]);
      }
    },
    [onChange, options, multiple]
  );

  const selectedIndex = options.indexOf(value);

  return (
    <div className={`observablehq-input observablehq-select ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <select
        id={id}
        value={String(selectedIndex)}
        onChange={handleChange}
        multiple={multiple}
        size={size}
        disabled={disabled}
      >
        {sortedOptions.map((option, i) => {
          const originalIndex = options.indexOf(option);
          return (
            <option key={originalIndex} value={String(originalIndex)}>
              {format(option)}
            </option>
          );
        })}
      </select>
    </div>
  );
}
