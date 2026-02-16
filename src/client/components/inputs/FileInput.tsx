import React, {useCallback, useId, useRef, useState} from "react";

export interface FileInputProps {
  /** Called when files are selected */
  onChange: (files: FileList | null) => void;
  /** Label text */
  label?: string;
  /** Accepted file types (e.g., ".csv,.json" or "image/*") */
  accept?: string;
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Whether the input is required */
  required?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A file input component.
 * Replaces Observable's `Inputs.file({label, accept, multiple})`.
 *
 * Usage:
 *   const [files, setFiles] = useState<FileList | null>(null);
 *   <FileInput label="Upload CSV" accept=".csv" onChange={setFiles} />
 */
export function FileInput({
  onChange,
  label,
  accept,
  multiple = false,
  required,
  disabled = false,
  className
}: FileInputProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setFileName(files.length === 1 ? files[0].name : `${files.length} files selected`);
      } else {
        setFileName("");
      }
      onChange(files);
    },
    [onChange]
  );

  return (
    <div className={`observablehq-input observablehq-file ${className ?? ""}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        required={required}
        disabled={disabled}
        onChange={handleChange}
      />
      {fileName && <span className="observablehq-file-name">{fileName}</span>}
    </div>
  );
}
