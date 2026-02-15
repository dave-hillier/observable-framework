# Vega-Lite responsive dark mode

Using [vega-themes](https://github.com/vega/vega-themes) and a React `useEffect` hook to track the user's [preferred color scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme), you can render Vega-Lite charts that automatically adapt to dark mode.

```js echo
import * as themes from "npm:vega-themes";
```

```jsx echo
function VegaDarkChart() {
  const [dark, setDark] = React.useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    (async () => {
      const chart = await vl.render({
        spec: {
          config: {
            ...(dark ? themes.dark : themes.default),
            background: "transparent"
          },
          width: 640,
          height: 250,
          autosize: {type: "fit", contains: "padding"},
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
    })();

    return () => { cancelled = true; };
  }, [dark]);

  return <div ref={containerRef} />;
}

display(<VegaDarkChart />);
```

The `VegaDarkChart` component uses two effects:

- A **media query listener** (`useEffect` with `matchMedia`) tracks the user's color scheme preference and updates `dark` state when it changes.
- A **rendering effect** re-renders the Vega-Lite chart whenever `dark` changes, applying the appropriate theme from `vega-themes`.

The `useEffect` cleanup function removes the media query listener and cancels in-flight renders, replacing the old `invalidation` pattern.

Unfortunately, since Vega-Lite defaults to rendering with canvas, you can't use CSS [`currentColor`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#currentcolor_keyword) to inherit the foreground color (as Observable Plot does by default) — and hence the chart must be re-rendered if the preferred color scheme changes, and Vega-Lite's foreground color won't exactly match your chosen theme. Additionally, Vega-Lite's built-in themes do not use a transparent background, and so we override the background for a seamless appearance.
