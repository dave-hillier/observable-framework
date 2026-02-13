import React, {useCallback, useId} from "react";

export interface RangeInputProps {
  /** The allowed range as [min, max] */
  domain?: [number, number];
  /** Alias for domain */
  range?: [number, number];
  /** Current value */
  value: number;
  /** Called when the value changes */
  onChange: (value: number) => void;
  /** Step increment */
  step?: number | "any";
  /** Label text */
  label?: string;
  /** Width of the input in pixels */
  width?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A range slider input component.
 * Replaces Observable's `Inputs.range([min, max], {label, step, value})`.
 */
export function RangeInput({
  domain,
  range: rangeProp,
  value,
  onChange,
  step,
  label,
  width,
  disabled = false,
  className
}: RangeInputProps) {
  const id = useId();
  const [min, max] = domain ?? rangeProp ?? [0, 1];

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(+e.target.value);
    },
    [onChange]
  );

  return (
    <div className={`observablehq-input observablehq-range ${className ?? ""}`} style={width ? {width} : undefined}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={disabled}
      />
      <output htmlFor={id}>{value}</output>
    </div>
  );
}
