import React, {useCallback} from "react";

export interface ButtonInputProps {
  /** Button content/label */
  content?: React.ReactNode;
  /** Alias for content */
  label?: string;
  /** Called when the button is clicked */
  onClick: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** CSS class name */
  className?: string;
}

/**
 * A button input component.
 * Replaces Observable's `Inputs.button("Label", {reduce})`.
 *
 * Usage:
 *   const [count, setCount] = useState(0);
 *   <ButtonInput content="Increment" onClick={() => setCount(c => c + 1)} />
 */
export function ButtonInput({content, label, onClick, disabled = false, className}: ButtonInputProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onClick();
    },
    [onClick]
  );

  return (
    <div className={`observablehq-input observablehq-button ${className ?? ""}`}>
      <button type="button" onClick={handleClick} disabled={disabled}>
        {content ?? label ?? "Button"}
      </button>
    </div>
  );
}
