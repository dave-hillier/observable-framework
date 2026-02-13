import {useEffect, useState} from "react";

/**
 * Returns the current timestamp, updating at the specified interval.
 * Replaces Observable's `now` generator.
 *
 * @param interval - Update interval in milliseconds. Defaults to ~60fps (16ms).
 *                   Use larger values (e.g. 1000) for second-precision clocks.
 */
export function useNow(interval: number = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
