import vl from "observablehq:stdlib/vega-lite";

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
