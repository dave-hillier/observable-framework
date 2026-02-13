import React, {useCallback, useId} from "react";

export interface NumberInputProps {
  /** Current value */
  value: number;
  /** Called when the value changes */
  onChange: (value: number) => void;
  /** Label text */
  label?: string;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number | "any";
  /** Placeholder text */
  placeholder?: string;
  /** Whether the input is required */
  required?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to emit on every keystroke (true) or on submit/blur (false) */
  submit?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A number input component (unbounded, unlike RangeInput).
 * Replaces Observable's `Inputs.number({label, min, max, step, value})`.
 */
export function NumberInput({
  value,
  onChange,
  label,
  min,
  max,
  step,
  placeholder,
  required,
  disabled = false,
  submit = false,
  className
}: NumberInputProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!submit) {
        const v = e.target.valueAsNumber;
        if (!isNaN(v)) onChange(v);
      }
    },
    [onChange, submit]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (submit && e.key === "Enter") {
        const v = (e.target as HTMLInputElement).valueAsNumber;
        if (!isNaN(v)) onChange(v);
      }
    },
    [onChange, submit]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (submit) {
        const v = e.target.valueAsNumber;
        if (!isNaN(v)) onChange(v);
      }
    },
    [onChange, submit]
  );

  return (
    <div className={`observablehq-input observablehq-number ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        type="number"
        value={value}
        onChange={handleChange}
        onKeyDown={submit ? handleKeyDown : undefined}
        onBlur={submit ? handleBlur : undefined}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}
