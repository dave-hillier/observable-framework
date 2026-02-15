# Selecting files

This example demonstrates how to select a file from a drop-down menu using a React controlled `<select>` component. `FileAttachment` requires a [static string literal argument](https://observablehq.com/framework/files#static-analysis), so the file attachments are created upfront and referenced by index.

```js
const files = [
  FileAttachment("data/buy-a-boat-cat.jpg"),
  FileAttachment("data/is-this-a-pigeon.jpg"),
  FileAttachment("data/picard-annoyed.jpg"),
  FileAttachment("data/picard-facepalm.jpg")
];
```

```jsx echo
function FileSelector({files}) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [imageNode, setImageNode] = React.useState(null);
  const file = files[selectedIndex];

  React.useEffect(() => {
    let cancelled = false;
    file.image({width: 640}).then((img) => {
      if (!cancelled) setImageNode(img);
    });
    return () => { cancelled = true; };
  }, [file]);

  return (
    <div>
      <select
        value={selectedIndex}
        onChange={(e) => setSelectedIndex(Number(e.target.value))}
      >
        {files.map((f, i) => (
          <option key={i} value={i}>{f.name}</option>
        ))}
      </select>
      <div style={{marginTop: "0.5rem"}}>{file.name}</div>
      {imageNode && <ImageDisplay node={imageNode} key={file.name} />}
    </div>
  );
}

function ImageDisplay({node}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el && node instanceof Node) {
      el.textContent = "";
      el.appendChild(node);
    }
  }, [node]);
  return <div ref={ref} />;
}

display(<FileSelector files={files} />);
```

The `FileSelector` component uses:

- **`useState`** to track the selected file index and the loaded image node.
- A controlled **`<select>`** element that updates the index on change.
- **`useEffect`** to asynchronously load the selected file's image, with a cancellation flag to avoid stale updates if the selection changes before loading completes.
- A separate **`ImageDisplay`** component that uses `useRef` to safely insert the loaded DOM node into the React tree.
