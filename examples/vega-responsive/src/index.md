# Vega-Lite responsive width

The chart below resizes to fit the container. Try resizing the window.

Rather than use Vega-Lite's built-in [responsive width](https://vega.github.io/vega-lite/docs/size.html#specifying-responsive-width-and-height) — which only listens to window _resize_ events and doesn't work correctly when the container is initially detached, or when the page content changes — we use a React component with [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) to reactively track the container width.

```jsx echo
function ResponsiveVegaChart({spec, maxWidth = Infinity, minWidth = 0}) {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer;

    (async () => {
      const chart = await vl.render({
        spec: {...spec, width: -1, autosize: {type: "fit", contains: "padding"}}
      });
      if (cancelled) return;
      container.textContent = "";
      container.appendChild(chart);

      observer = new ResizeObserver(([entry]) => {
        const width = Math.max(minWidth, Math.min(maxWidth, entry.contentRect.width));
        chart.value.width(width);
        chart.value.run();
      });
      observer.observe(container);
    })();

    return () => {
      cancelled = true;
      if (observer) observer.disconnect();
    };
  }, [spec, maxWidth, minWidth]);

  return <div ref={containerRef} />;
}

display(
  <ResponsiveVegaChart
    spec={{
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      height: 250,
      data: {url: "https://vega.github.io/vega-lite/data/cars.json"},
      mark: "bar",
      encoding: {
        x: {field: "Cylinders"},
        y: {aggregate: "count", title: "Number of cars"}
      }
    }}
    maxWidth={960 - 16 * 2}
  />
);
```

The `ResponsiveVegaChart` component:

- Uses `useRef` to hold a reference to the container DOM element.
- Uses `useEffect` to asynchronously render the Vega-Lite chart, then attaches a `ResizeObserver` that updates the chart width and re-runs it whenever the container resizes.
- Returns a cleanup function that disconnects the observer and cancels in-flight renders.

## VegaResize component

If you prefer a more reusable solution, you can create a `VegaResize` component in a JSX module that you can import into any page.

```jsx run=false
export function VegaResize({spec, minWidth = 0, maxWidth = Infinity}) {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer;

    (async () => {
      const chart = await vl.render({
        spec: {...spec, width: -1, autosize: {type: "fit", contains: "padding"}}
      });
      if (cancelled) return;
      container.textContent = "";
      container.appendChild(chart);

      observer = new ResizeObserver(([entry]) => {
        const width = Math.max(minWidth, Math.min(maxWidth, entry.contentRect.width));
        chart.value.width(width);
        chart.value.run();
      });
      observer.observe(container);
    })();

    return () => {
      cancelled = true;
      if (observer) observer.disconnect();
    };
  }, [spec, minWidth, maxWidth]);

  return <div ref={containerRef} />;
}
```

You can then import and use it like so:

```jsx run=false
import {VegaResize} from "./VegaResize.js";

display(
  <VegaResize
    spec={{
      height: 250,
      data: {url: "https://vega.github.io/vega-lite/data/cars.json"},
      mark: "bar",
      encoding: {
        x: {field: "Cylinders"},
        y: {aggregate: "count", title: "Number of cars"}
      }
    }}
    maxWidth={960 - 16 * 2}
  />
);
```

## Static width

If you'd prefer to set a fixed width and have the browser scale the chart to fit the container, you can use CSS to scale the canvas element. Below, the natural width of the chart is 640px, but it scales down to fit the container in narrow windows.

```jsx echo
function StaticVegaChart() {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    (async () => {
      const chart = await vl.render({
        spec: {
          width: 640,
          height: 250,
          data: {url: "https://vega.github.io/vega-lite/data/cars.json"},
          mark: "bar",
          encoding: {
            x: {field: "Cylinders"},
            y: {aggregate: "count", title: "Number of cars"}
          }
        }
      });
      if (cancelled) return;
      container.textContent = "";
      container.appendChild(chart);

      const canvas = chart.firstChild;
      canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
      canvas.style.maxWidth = "100%";
      canvas.style.height = "auto";
    })();

    return () => { cancelled = true; };
  }, []);

  return <div ref={containerRef} />;
}

display(<StaticVegaChart />);
```
