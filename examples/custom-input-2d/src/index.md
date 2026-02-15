# Custom 2D input

Here is a 2D range input; click (or drag) to set the _xy_ value. The 2D canvas and the two 1D range sliders are linked — interacting with any of them updates the shared state.

```jsx echo
function Range2DCanvas({value, onChange, width = 100, height = 100}) {
  const canvasRef = React.useRef(null);
  const downRef = React.useRef(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const [x, y] = value;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "red";
    ctx.fillRect(Math.floor(x * width), 0, 1, height);
    ctx.fillRect(0, Math.floor(y * height), width, 1);
  }, [value, width, height]);

  const handlePointerEvent = React.useCallback((e) => {
    if (e.type === "pointerdown") {
      downRef.current = true;
      canvasRef.current?.setPointerCapture(e.pointerId);
    } else if (e.type === "pointerup") {
      downRef.current = false;
      return;
    }
    if (!downRef.current) return;
    e.preventDefault();
    const x = Math.max(0, Math.min(1, e.nativeEvent.offsetX / width));
    const y = Math.max(0, Math.min(1, e.nativeEvent.offsetY / height));
    onChange([x, y]);
  }, [width, height, onChange]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{border: "1px solid black"}}
      onPointerDown={handlePointerEvent}
      onPointerMove={handlePointerEvent}
      onPointerUp={handlePointerEvent}
    />
  );
}

function LinkedInputs() {
  const [xy, setXY] = React.useState([0.5, 0.5]);

  return (
    <div>
      <Range2DCanvas value={xy} onChange={setXY} />
      <div style={{marginTop: "0.5rem"}}>
        <label>
          x: <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={xy[0]}
            onChange={(e) => setXY([+e.target.value, xy[1]])}
          /> {xy[0].toFixed(2)}
        </label>
      </div>
      <div>
        <label>
          y: <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={xy[1]}
            onChange={(e) => setXY([xy[0], +e.target.value])}
          /> {xy[1].toFixed(2)}
        </label>
      </div>
    </div>
  );
}

display(<LinkedInputs />);
```

With React, the bidirectional linking is handled through shared state rather than manual event wiring:

- **`useState`** holds the `[x, y]` value as a single piece of state, shared between the 2D canvas and the 1D sliders.
- The **`Range2DCanvas`** component draws crosshairs on a canvas using `useEffect` whenever the value changes, and reports pointer interactions back via `onChange`.
- The **range inputs** are standard controlled `<input type="range">` elements that update the shared state on change.
- No event listener plumbing or bubble-checking is needed — React's unidirectional data flow naturally keeps everything in sync.

The `Range2DCanvas` component uses:

- **`useRef`** for both the canvas element and the pointer-down tracking flag.
- **`useEffect`** to redraw the canvas crosshairs whenever the value or dimensions change.
- **`useCallback`** to memoize the pointer event handler, which handles `pointerdown`, `pointermove`, and `pointerup` events, clamping coordinates to `[0, 1]`.
