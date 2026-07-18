import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles/fade.css";
import { Fade } from "./Fade";
import { createRenderer } from "./testing";
type Renderer = ReturnType<typeof createRenderer>;
const layers = (view: Renderer) => view.container.querySelectorAll('[data-happy2-ui="fade-layer"]');
function frame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
it("replaces the keyed layer without duplicating interactive content", async () => {
    const view = createRenderer();
    let setActive!: (active: string) => void;
    function FadeFixture() {
        const [active, updateActive] = useState("a");
        setActive = updateActive;
        return (
            <Fade
                active={active}
                durationMs={60}
                render={(key) => <div data-testid={`screen-${key}`}>{key}</div>}
            />
        );
    }
    view.render(FadeFixture, { width: 320, height: 200 });
    await view.ready();
    /* Initial: a single layer showing the first screen. */
    expect(layers(view).length).toBe(1);
    expect(view.container.querySelector('[data-testid="screen-a"]')).not.toBeNull();
    /* Changing the key remounts exactly one layer. Duplicate controls during a
     * transition would create ambiguous focus and accessibility ownership. */
    flushSync(() => setActive("b"));
    await frame();
    expect(layers(view).length).toBe(1);
    expect(view.container.querySelector('[data-testid="screen-a"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="screen-b"]')).not.toBeNull();
}, 120000);
it("settles on the latest key when changes arrive in one render batch", async () => {
    const view = createRenderer();
    let setActive!: (active: string) => void;
    function FadeFixture() {
        const [active, updateActive] = useState("a");
        setActive = updateActive;
        return (
            <Fade
                active={active}
                durationMs={80}
                render={(key) => <div data-testid={`screen-${key}`}>{key}</div>}
            />
        );
    }
    view.render(FadeFixture, { width: 320, height: 200 });
    await view.ready();
    flushSync(() => {
        setActive("b");
        setActive("c");
    });
    await frame();
    expect(layers(view).length).toBe(1);
    expect(view.container.querySelector('[data-testid="screen-c"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="screen-a"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="screen-b"]')).toBeNull();
}, 120000);
