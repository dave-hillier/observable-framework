import React, {useCallback, useId} from "react";

export interface RadioInputProps<T = string> {
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
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A radio button group component for selecting a single value.
 * Replaces Observable's `Inputs.radio(options, {label, value})`.
 */
export function RadioInput<T = string>({
  options,
  value,
  onChange,
  label,
  format = String,
  disabled = false,
  className
}: RadioInputProps<T>) {
  const groupName = useId();

  const handleChange = useCallback(
    (option: T) => {
      onChange(option);
    },
    [onChange]
  );

  return (
    <div className={`observablehq-input observablehq-radio ${className ?? ""}`}>
      {label && <span className="observablehq-input-label">{label}</span>}
      <div role="radiogroup">
        {options.map((option, i) => (
          <label key={i}>
            <input
              type="radio"
              name={groupName}
              checked={value === option}
              onChange={() => handleChange(option)}
              disabled={disabled}
            />
            {format(option)}
          </label>
        ))}
      </div>
    </div>
  );
}
