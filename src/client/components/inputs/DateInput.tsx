import React, {useCallback, useId} from "react";

export interface DateInputProps {
  /** Current value as a Date or ISO string */
  value: Date | string;
  /** Called when the date changes */
  onChange: (value: Date) => void;
  /** Label text */
  label?: string;
  /** Minimum allowed date */
  min?: Date | string;
  /** Maximum allowed date */
  max?: Date | string;
  /** Whether the input is required */
  required?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

function toDateString(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * A date picker input component.
 * Replaces Observable's `Inputs.date({label, min, max, value})`.
 */
export function DateInput({
  value,
  onChange,
  label,
  min,
  max,
  required,
  disabled = false,
  className
}: DateInputProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = new Date(e.target.value + "T00:00:00");
      if (!isNaN(d.getTime())) onChange(d);
    },
    [onChange]
  );

  return (
    <div className={`observablehq-input observablehq-date ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        type="date"
        value={toDateString(value)}
        onChange={handleChange}
        min={min ? toDateString(min) : undefined}
        max={max ? toDateString(max) : undefined}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}

export interface DateTimeInputProps {
  /** Current value as a Date or ISO string */
  value: Date | string;
  /** Called when the datetime changes */
  onChange: (value: Date) => void;
  /** Label text */
  label?: string;
  /** Minimum allowed datetime */
  min?: Date | string;
  /** Maximum allowed datetime */
  max?: Date | string;
  /** Whether the input is required */
  required?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

function toDateTimeString(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 16);
  return d.toISOString().slice(0, 16);
}

/**
 * A datetime-local picker input component.
 * Replaces Observable's `Inputs.datetime({label, min, max, value})`.
 */
export function DateTimeInput({
  value,
  onChange,
  label,
  min,
  max,
  required,
  disabled = false,
  className
}: DateTimeInputProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = new Date(e.target.value);
      if (!isNaN(d.getTime())) onChange(d);
    },
    [onChange]
  );

  return (
    <div className={`observablehq-input observablehq-datetime ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        type="datetime-local"
        value={toDateTimeString(value)}
        onChange={handleChange}
        min={min ? toDateTimeString(min) : undefined}
        max={max ? toDateTimeString(max) : undefined}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}
