# Scrollytelling with IntersectionObserver

This example demonstrates how to implement scrollytelling in Observable Framework using React, `IntersectionObserver`, and `position: sticky`. React's `useRef` provides references to DOM elements, `useState` tracks the active step, and `useEffect` manages the observer lifecycle with automatic cleanup.

<style>

.scroll-container {
  position: relative;
  margin: 1rem auto;
  font-family: var(--sans-serif);
}

.scroll-info {
  position: sticky;
  aspect-ratio: 16 / 9;
  top: calc((100% - 9 / 16 * 100vw) / 2);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64px;
  transition: ease background-color 0.5s;
  background-color: var(--theme-background-alt);
}

.scroll-info--step-1 {
  background-color: #4269d0;
}

.scroll-info--step-2 {
  background-color: #efb118;
}

.scroll-info--step-3 {
  background-color: #ff725c;
}

.scroll-info--step-4 {
  background-color: #6cc5b0;
}

.scroll-section {
  position: relative;
  aspect-ratio: 16 / 9;
  margin: 1rem 0;
  display: flex;
  align-items: start;
  justify-content: center;
  border: solid 1px var(--theme-foreground-focus);
  background: color-mix(in srgb, var(--theme-foreground-focus) 5%, transparent);
  padding: 1rem;
  box-sizing: border-box;
}

</style>

```jsx echo
function Scrollytelling({steps = 4}) {
  const [activeStep, setActiveStep] = React.useState(0);
  const sectionRefs = React.useRef([]);

  React.useEffect(() => {
    const targets = sectionRefs.current.filter(Boolean);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      () => {
        for (const target of [...targets].reverse()) {
          const rect = target.getBoundingClientRect();
          if (rect.top < innerHeight / 2) {
            setActiveStep(Number(target.dataset.step));
            return;
          }
        }
        setActiveStep(0);
      },
      {rootMargin: "-50% 0% -50% 0%"}
    );

    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const stepNumbers = Array.from({length: steps}, (_, i) => i + 1);

  return (
    <section className="scroll-container">
      <div className={`scroll-info${activeStep ? ` scroll-info--step-${activeStep}` : ""}`}>
        {activeStep}
      </div>
      {stepNumbers.map((step) => (
        <div
          key={step}
          ref={(el) => (sectionRefs.current[step - 1] = el)}
          className="scroll-section"
          data-step={step}
        >
          STEP {step}
        </div>
      ))}
    </section>
  );
}

display(<Scrollytelling />);
```

The `Scrollytelling` component manages everything declaratively:

- **`useState`** tracks which step is active, driving the CSS class and displayed number.
- **`useRef`** stores references to each scroll section DOM element, replacing `document.querySelectorAll`.
- **`useEffect`** sets up the `IntersectionObserver` and returns a cleanup function that calls `observer.disconnect()` — replacing the old `invalidation.then(() => observer.disconnect())` pattern.

The component renders the scroll sections dynamically from the `steps` prop, and the `ref` callback on each section stores the DOM element for the observer.

The CSS is:

```css run=false
.scroll-container {
  position: relative;
  margin: 1rem auto;
  font-family: var(--sans-serif);
}

.scroll-info {
  position: sticky;
  aspect-ratio: 16 / 9;
  top: calc((100% - 9 / 16 * 100vw) / 2);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64px;
  transition: ease background-color 0.5s;
  background-color: var(--theme-background-alt);
}

.scroll-info--step-1 {
  background-color: #4269d0;
}

.scroll-info--step-2 {
  background-color: #efb118;
}

.scroll-info--step-3 {
  background-color: #ff725c;
}

.scroll-info--step-4 {
  background-color: #6cc5b0;
}

.scroll-section {
  position: relative;
  aspect-ratio: 16 / 9;
  margin: 1rem 0;
  display: flex;
  align-items: start;
  justify-content: center;
  border: solid 1px var(--theme-foreground-focus);
  background: color-mix(in srgb, var(--theme-foreground-focus) 5%, transparent);
  padding: 1rem;
  box-sizing: border-box;
}
```
