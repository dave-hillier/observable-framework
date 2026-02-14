import React from "react";
import type {ThemePreference} from "../hooks/useDark.js";
import {useThemePreference} from "../hooks/useDark.js";

const CYCLE: ThemePreference[] = ["auto", "light", "dark"];
const LABELS: Record<ThemePreference, string> = {auto: "Auto", light: "Light", dark: "Dark"};
const ICONS: Record<ThemePreference, string> = {auto: "\u25D1", light: "\u2600", dark: "\u263E"};

/**
 * A simple dark/light/auto theme toggle button.
 * Cycles through: auto -> light -> dark -> auto.
 * Persists the choice in localStorage.
 */
export function ThemeToggle() {
  const {preference, setPreference} = useThemePreference();
  const nextIndex = (CYCLE.indexOf(preference) + 1) % CYCLE.length;
  const next = CYCLE[nextIndex];

  return (
    <button
      className="observablehq-theme-toggle"
      type="button"
      title={`Theme: ${LABELS[preference]} (click for ${LABELS[next]})`}
      aria-label={`Theme: ${LABELS[preference]}`}
      onClick={() => setPreference(next)}
    >
      {ICONS[preference]}
    </button>
  );
}
