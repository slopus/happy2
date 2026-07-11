import { createSignal } from "solid-js";

export function App() {
  const [count, setCount] = createSignal(0);

  return (
    <main class="app-shell">
      <section class="app-card" aria-labelledby="app-title">
        <p class="eyebrow">RIGGED</p>
        <h1 id="app-title">A shared Solid app.</h1>
        <p>
          This screen is rendered by both the web package and the Electron desktop
          package.
        </p>
        <button type="button" onClick={() => setCount((value) => value + 1)}>
          Count: {count()}
        </button>
      </section>
    </main>
  );
}
