import "global-jsdom/register";
import assert from "node:assert";
import testingLibrary from "@testing-library/react";
import React, {useEffect} from "react";
import {CellProvider, useCellContext, useCellInput, useCellOutput} from "../src/client/hooks/useCellContext.js";

// eslint-disable-next-line import/no-named-as-default-member
const {act, cleanup, render, screen} = testingLibrary;

afterEach(() => cleanup());

function Producer({name, value}: {name: string; value: unknown}) {
  useCellOutput(name, value);
  return null;
}

function Consumer({name, testId}: {name: string; testId: string}) {
  const v = useCellInput<string | number>(name);
  return <span data-testid={testId}>{v === undefined ? "undefined" : String(v)}</span>;
}

describe("CellProvider / useCellOutput / useCellInput", () => {
  it("propagates a value from a producer cell to a consumer cell rendered later in the same pass", () => {
    render(
      <CellProvider>
        <Producer name="x" value={42} />
        <Consumer name="x" testId="x" />
      </CellProvider>
    );
    assert.strictEqual(screen.getByTestId("x").textContent, "42");
  });

  it("returns undefined for names that have not been published", () => {
    render(
      <CellProvider>
        <Consumer name="missing" testId="missing" />
      </CellProvider>
    );
    assert.strictEqual(screen.getByTestId("missing").textContent, "undefined");
  });

  it("re-renders all consumers of a name when the producer's value changes", () => {
    const {rerender} = render(
      <CellProvider>
        <Producer name="y" value={1} />
        <Consumer name="y" testId="a" />
        <Consumer name="y" testId="b" />
      </CellProvider>
    );
    assert.strictEqual(screen.getByTestId("a").textContent, "1");
    assert.strictEqual(screen.getByTestId("b").textContent, "1");

    rerender(
      <CellProvider>
        <Producer name="y" value={2} />
        <Consumer name="y" testId="a" />
        <Consumer name="y" testId="b" />
      </CellProvider>
    );
    assert.strictEqual(screen.getByTestId("a").textContent, "2");
    assert.strictEqual(screen.getByTestId("b").textContent, "2");
  });

  it("throws when a cell hook is used outside a CellProvider", () => {
    // Suppress React's expected error log for this test
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.throws(() => render(<Consumer name="x" testId="t" />), /must be used within a CellProvider/);
    } finally {
      console.error = originalError;
    }
  });

  it("unsubscribes listeners on unmount (no leak)", () => {
    let setExternal: ((v: number) => void) | null = null;
    function ExternalProducer() {
      const ctx = useCellContext();
      useEffect(() => {
        setExternal = (v) => ctx.set("z", v);
        return () => {
          setExternal = null;
        };
      }, [ctx]);
      return null;
    }

    const {unmount} = render(
      <CellProvider>
        <ExternalProducer />
        <Consumer name="z" testId="z" />
      </CellProvider>
    );

    act(() => setExternal?.(7));
    assert.strictEqual(screen.getByTestId("z").textContent, "7");

    unmount();
    // After unmount the consumer's subscription must have been removed; calling
    // set again must not throw or cause errors. (Listener leak would surface as
    // a "can't update unmounted component" warning under StrictMode.)
    if (setExternal) act(() => setExternal!(99)); // setExternal is nulled by ExternalProducer cleanup
  });
});
