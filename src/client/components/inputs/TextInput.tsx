import React, {useCallback, useId} from "react";

export interface TextInputProps {
  /** Current value */
  value: string;
  /** Called when the value changes */
  onChange: (value: string) => void;
  /** Label text */
  label?: string;
  /** Input type (text, email, url, tel, password) */
  type?: "text" | "email" | "url" | "tel" | "password";
  /** Placeholder text */
  placeholder?: string;
  /** Minimum length */
  minlength?: number;
  /** Maximum length */
  maxlength?: number;
  /** Regex pattern for validation */
  pattern?: string;
  /** Whether the input is required */
  required?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Width of the input */
  width?: number;
  /** Whether to emit on every keystroke (true) or on submit/blur (false) */
  submit?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A text input component.
 * Replaces Observable's `Inputs.text({label, type, placeholder, submit})`.
 */
export function TextInput({
  value,
  onChange,
  label,
  type = "text",
  placeholder,
  minlength,
  maxlength,
  pattern,
  required,
  disabled = false,
  width,
  submit = false,
  className
}: TextInputProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!submit) onChange(e.target.value);
    },
    [onChange, submit]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (submit && e.key === "Enter") {
        onChange((e.target as HTMLInputElement).value);
      }
    },
    [onChange, submit]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (submit) onChange(e.target.value);
    },
    [onChange, submit]
  );

  return (
    <div className={`observablehq-input observablehq-text ${className ?? ""}`} style={width ? {width} : undefined}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        onKeyDown={submit ? handleKeyDown : undefined}
        onBlur={submit ? handleBlur : undefined}
        placeholder={placeholder}
        minLength={minlength}
        maxLength={maxlength}
        pattern={pattern}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}

export interface TextAreaInputProps {
  /** Current value */
  value: string;
  /** Called when the value changes */
  onChange: (value: string) => void;
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Number of visible rows */
  rows?: number;
  /** Number of visible columns */
  cols?: number;
  /** Minimum length */
  minlength?: number;
  /** Maximum length */
  maxlength?: number;
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
 * A textarea input component.
 * Replaces Observable's `Inputs.textarea({label, placeholder, rows})`.
 */
export function TextAreaInput({
  value,
  onChange,
  label,
  placeholder,
  rows = 3,
  cols,
  minlength,
  maxlength,
  required,
  disabled = false,
  submit = false,
  className
}: TextAreaInputProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!submit) onChange(e.target.value);
    },
    [onChange, submit]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (submit) onChange(e.target.value);
    },
    [onChange, submit]
  );

  return (
    <div className={`observablehq-input observablehq-textarea ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <textarea
        id={id}
        value={value}
        onChange={handleChange}
        onBlur={submit ? handleBlur : undefined}
        placeholder={placeholder}
        rows={rows}
        cols={cols}
        minLength={minlength}
        maxLength={maxlength}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}
