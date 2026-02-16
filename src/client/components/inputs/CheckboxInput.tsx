import React, {useCallback, useId} from "react";

export interface CheckboxInputProps<T = string> {
  /** The available options */
  options: T[];
  /** Currently selected values */
  value: T[];
  /** Called when selection changes */
  onChange: (value: T[]) => void;
  /** Label text */
  label?: string;
  /** Function to format option display text */
  format?: (option: T) => string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A checkbox group component for selecting multiple values.
 * Replaces Observable's `Inputs.checkbox(options, {label, value})`.
 */
export function CheckboxInput<T = string>({
  options,
  value,
  onChange,
  label,
  format = String,
  disabled = false,
  className
}: CheckboxInputProps<T>) {
  const groupId = useId();

  const handleChange = useCallback(
    (option: T, checked: boolean) => {
      if (checked) {
        onChange([...value, option]);
      } else {
        onChange(value.filter((v) => v !== option));
      }
    },
    [value, onChange]
  );

  return (
    <div className={`observablehq-input observablehq-checkbox ${className ?? ""}`}>
      {label && <span className="observablehq-input-label">{label}</span>}
      <div role="group" aria-labelledby={label ? `${groupId}-label` : undefined}>
        {options.map((option, i) => (
          <label key={i}>
            <input
              type="checkbox"
              checked={value.includes(option)}
              onChange={(e) => handleChange(option, e.target.checked)}
              disabled={disabled}
            />
            {format(option)}
          </label>
        ))}
      </div>
    </div>
  );
}

export interface ToggleInputProps {
  /** Current value */
  value: boolean;
  /** Called when toggled */
  onChange: (value: boolean) => void;
  /** Label text */
  label?: string;
  /** Values to map to [unchecked, checked] */
  values?: [unknown, unknown];
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A toggle switch component.
 * Replaces Observable's `Inputs.toggle({label, value})`.
 */
export function ToggleInput({value, onChange, label, disabled = false, className}: ToggleInputProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange]
  );

  return (
    <div className={`observablehq-input observablehq-toggle ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} type="checkbox" role="switch" checked={value} onChange={handleChange} disabled={disabled} />
    </div>
  );
}
