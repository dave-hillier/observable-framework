import {useEffect, useRef, useState} from "react";

/**
 * Subscribes to an async generator and returns the latest yielded value.
 * Replaces Observable's first-class generator variable support.
 *
 * The generator is created once (or when the factory function changes)
 * and is cleaned up (via .return()) when the component unmounts or the
 * factory changes.
 *
 * Usage:
 *   const time = useGenerator(async function*() {
 *     while (true) {
 *       yield Date.now();
 *       await new Promise(r => setTimeout(r, 1000));
 *     }
 *   });
 */
export function useGenerator<T>(factory: () => AsyncGenerator<T, void, unknown>): T | undefined;
export function useGenerator<T>(factory: () => AsyncGenerator<T, void, unknown>, initialValue: T): T;
export function useGenerator<T>(factory: () => AsyncGenerator<T, void, unknown>, initialValue?: T): T | undefined {
  const [value, setValue] = useState<T | undefined>(initialValue);
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    let cancelled = false;
    const gen = factoryRef.current();

    (async () => {
      try {
        for await (const v of gen) {
          if (cancelled) break;
          setValue(v);
        }
      } catch (err) {
        if (!cancelled) throw err;
      }
    })();

    return () => {
      cancelled = true;
      gen.return(undefined as never);
    };
  }, [factory]);

  return value;
}

/**
 * Subscribes to an async iterable (like an Observable generator) and
 * returns the latest value. Similar to useGenerator but accepts any
 * async iterable, not just generators.
 */
export function useAsyncIterable<T>(iterable: AsyncIterable<T>): T | undefined;
export function useAsyncIterable<T>(iterable: AsyncIterable<T>, initialValue: T): T;
export function useAsyncIterable<T>(iterable: AsyncIterable<T>, initialValue?: T): T | undefined {
  const [value, setValue] = useState<T | undefined>(initialValue);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        for await (const v of iterable) {
          if (cancelled) break;
          setValue(v);
        }
      } catch (err) {
        if (!cancelled) throw err;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [iterable]);

  return value;
}
