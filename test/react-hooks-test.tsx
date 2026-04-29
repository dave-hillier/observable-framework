import "global-jsdom/register";
import assert from "node:assert";
import testingLibrary, {renderHook} from "@testing-library/react";
import React from "react";
import {useDark, useThemePreference} from "../src/client/hooks/useDark.js";
import {useNow} from "../src/client/hooks/useNow.js";
// jsdom's dispatchEvent rejects events constructed with Node's native Event
// class (Node 19+). Mirror jsdom's Event onto the global so production code
// that calls `new Event(...)` produces instances jsdom accepts.
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;

// eslint-disable-next-line import/no-named-as-default-member
const {act, cleanup} = testingLibrary;

afterEach(() => {
  cleanup();
  // Reset stored preference between tests
  try {
    localStorage.removeItem("observablehq-theme");
  } catch {
    // ignore
  }
});

describe("useNow", () => {
  it("returns a number on the first render", () => {
    const {result} = renderHook(() => useNow(1000));
    assert.strictEqual(typeof result.current, "number");
    assert.ok(result.current > 0);
  });

  it("updates at the specified interval", async () => {
    const {result, unmount} = renderHook(() => useNow(20));
    const first = result.current;
    await act(() => new Promise((r) => setTimeout(r, 60)));
    assert.ok(result.current > first, "useNow should advance after the interval");
    unmount();
  });

  it("clears its interval on unmount", async () => {
    let active = 0;
    const origSet = globalThis.setInterval;
    const origClear = globalThis.clearInterval;
    globalThis.setInterval = ((fn: any, ms: any) => {
      active++;
      return origSet(fn, ms);
    }) as typeof setInterval;
    globalThis.clearInterval = ((id: any) => {
      active--;
      return origClear(id);
    }) as typeof clearInterval;
    try {
      const {unmount} = renderHook(() => useNow(50));
      assert.strictEqual(active, 1, "interval scheduled on mount");
      unmount();
      assert.strictEqual(active, 0, "interval cleared on unmount");
    } finally {
      globalThis.setInterval = origSet;
      globalThis.clearInterval = origClear;
    }
  });
});

describe("useDark / useThemePreference", () => {
  function setMatchMedia(matches: boolean) {
    (window as Window & {matchMedia: typeof window.matchMedia}).matchMedia = ((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    })) as typeof window.matchMedia;
  }

  it("returns the system preference when no stored preference exists", () => {
    setMatchMedia(true);
    const {result: dark} = renderHook(() => useDark());
    assert.strictEqual(dark.current, true);

    setMatchMedia(false);
    const {result: light} = renderHook(() => useDark());
    assert.strictEqual(light.current, false);
  });

  it("forces dark when preference is 'dark', regardless of system", () => {
    setMatchMedia(false);
    localStorage.setItem("observablehq-theme", "dark");
    const {result} = renderHook(() => useDark());
    assert.strictEqual(result.current, true);
  });

  it("forces light when preference is 'light', regardless of system", () => {
    setMatchMedia(true);
    localStorage.setItem("observablehq-theme", "light");
    const {result} = renderHook(() => useDark());
    assert.strictEqual(result.current, false);
  });

  it("propagates same-tab preference changes via custom event", () => {
    setMatchMedia(false);
    const dark = renderHook(() => useDark());
    const pref = renderHook(() => useThemePreference());
    assert.strictEqual(dark.result.current, false);

    act(() => pref.result.current.setPreference("dark"));
    assert.strictEqual(dark.result.current, true, "useDark must observe same-tab change");
    assert.strictEqual(pref.result.current.dark, true);
    assert.strictEqual(pref.result.current.preference, "dark");
  });

  it("setPreference('auto') clears stored preference", () => {
    setMatchMedia(false);
    localStorage.setItem("observablehq-theme", "dark");
    const pref = renderHook(() => useThemePreference());
    act(() => pref.result.current.setPreference("auto"));
    assert.strictEqual(localStorage.getItem("observablehq-theme"), null);
    assert.strictEqual(pref.result.current.preference, "auto");
  });

  it("applies the resolved theme to the document", () => {
    setMatchMedia(false);
    localStorage.setItem("observablehq-theme", "dark");
    renderHook(() => useDark());
    assert.strictEqual(document.documentElement.getAttribute("data-theme"), "dark");
  });
});

// Sanity check: renderHook needs a wrapper for context-bound hooks
describe("renderHook smoke", () => {
  it("runs a no-op hook", () => {
    const {result} = renderHook(() => 1 + 1);
    assert.strictEqual(result.current, 2);
  });
});

// Suppress unused-import warning for React (needed for JSX runtime in build)
void React;
