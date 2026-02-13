import {useEffect, useState} from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Reactively tracks whether the user prefers dark mode.
 * Replaces Observable's `dark` generator.
 *
 * Returns `true` when the system is in dark mode, `false` otherwise.
 * Updates automatically when the user changes their OS theme preference.
 */
export function useDark(): boolean {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(DARK_QUERY).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark;
}
