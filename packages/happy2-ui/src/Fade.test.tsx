import { createSignal } from "solid-js";
import { expect, it } from "vitest";
import "./styles/fade.css";
import { Fade } from "./Fade";
import { createRenderer } from "./testing";

type Renderer = ReturnType<typeof createRenderer>;

const layers = (view: Renderer) => view.container.querySelectorAll('[data-happy2-ui="fade-layer"]');

async function waitFor(condition: () => boolean, timeoutMs: number) {
    const start = performance.now();
    while (!condition()) {
        if (performance.now() - start > timeoutMs) throw new Error("waitFor timed out");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

it("crossfades: mounts the incoming layer over the outgoing one, then settles to the newest", async () => {
    const view = createRenderer();
    const [active, setActive] = createSignal<string>("a");

    view.render(
        () => (
            <Fade
                active={active()}
                durationMs={60}
                render={(key) => <div data-testid={`screen-${key}`}>{key}</div>}
            />
        ),
        { width: 320, height: 200 },
    );
    await view.ready();

    /* Initial: a single layer showing the first screen. */
    expect(layers(view).length).toBe(1);
    expect(view.container.querySelector('[data-testid="screen-a"]')).not.toBeNull();

    /* Changing the key mounts a second layer so both screens are present during
     * the crossfade, and the incoming one is last in the DOM (painted on top). */
    setActive("b");
    await waitFor(() => layers(view).length === 2, 1_000);
    const during = layers(view);
    expect(during[0].querySelector('[data-testid="screen-a"]')).not.toBeNull();
    expect(during[during.length - 1].querySelector('[data-testid="screen-b"]')).not.toBeNull();

    /* After the duration the outgoing layer is dropped, leaving only the newest. */
    await waitFor(() => layers(view).length === 1, 2_000);
    expect(view.container.querySelector('[data-testid="screen-a"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="screen-b"]')).not.toBeNull();
}, 120_000);

it("collapses cleanly when the key changes faster than the fade duration", async () => {
    const view = createRenderer();
    const [active, setActive] = createSignal<string>("a");

    view.render(
        () => (
            <Fade
                active={active()}
                durationMs={80}
                render={(key) => <div data-testid={`screen-${key}`}>{key}</div>}
            />
        ),
        { width: 320, height: 200 },
    );
    await view.ready();

    setActive("b");
    setActive("c");
    await waitFor(() => layers(view).length === 1, 2_000);
    expect(view.container.querySelector('[data-testid="screen-c"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="screen-a"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="screen-b"]')).toBeNull();
}, 120_000);
