import React, {useCallback, useId} from "react";

export interface ColorInputProps {
  /** Current color value as hex string (e.g., "#ff0000") */
  value: string;
  /** Called when the color changes */
  onChange: (value: string) => void;
  /** Label text */
  label?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A color picker input component.
 * Replaces Observable's `Inputs.color({label, value})`.
 */
export function ColorInput({value, onChange, label, disabled = false, className}: ColorInputProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className={`observablehq-input observablehq-color ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} type="color" value={value} onChange={handleChange} disabled={disabled} />
    </div>
  );
}
