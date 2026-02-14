import {useCallback, useEffect, useState} from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const STORAGE_KEY = "observablehq-theme";

export type ThemePreference = "light" | "dark" | "auto";

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(DARK_QUERY).matches;
}

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  } catch {
    // localStorage may be unavailable
  }
  return "auto";
}

function applyThemeToDocument(dark: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/**
 * Reactively tracks whether the user prefers dark mode.
 * Replaces Observable's `dark` generator.
 *
 * Supports three modes via useThemePreference():
 * - "auto" (default): follows system preference
 * - "dark": forces dark mode
 * - "light": forces light mode
 *
 * Returns `true` when dark mode is active, `false` otherwise.
 * Updates automatically when the user changes their OS theme preference
 * or when the stored preference changes.
 */
export function useDark(): boolean {
  const [preference] = useState<ThemePreference>(getStoredPreference);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const dark = preference === "dark" ? true : preference === "light" ? false : systemDark;

  useEffect(() => {
    applyThemeToDocument(dark);
  }, [dark]);

  return dark;
}

/**
 * Hook providing the full theme preference control.
 * Returns the current preference, a setter, and the resolved dark boolean.
 */
export function useThemePreference(): {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  dark: boolean;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const dark = preference === "dark" ? true : preference === "light" ? false : systemDark;

  useEffect(() => {
    applyThemeToDocument(dark);
  }, [dark]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    try {
      if (pref === "auto") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, pref);
      }
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  return {preference, setPreference, dark};
}
