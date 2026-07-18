import { useState } from "react";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/command-palette.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/icon.css";
import { CommandPalette } from "./CommandPalette";
import { createRenderer } from "./testing";
const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';
function frame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
it("holds CommandPalette card geometry, input row, and body split", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                data-testid="cp"
                onClose={() => {}}
                onQueryChange={() => {}}
                placeholder="Search Happy (2)…"
                query="launch"
            >
                <div data-testid="cp-results" style={{ height: "120px" }}>
                    results
                </div>
            </CommandPalette>
        ),
        { width: 720, height: 320, padding: 40 },
    );
    await view.ready();
    /* ---- Card ----------------------------------------------------------- */
    const card = view.$('[data-testid="cp"]');
    expect(card.element.getAttribute("role")).toBe("dialog");
    expect(card.element.getAttribute("aria-modal")).toBe("true");
    expect(card.element.getAttribute("aria-label")).toBe("Search Happy (2)…");
    expect(card.width()).toBe(640);
    expect(
        card.computedStyles([
            "background-color",
            "border-top-color",
            "border-top-left-radius",
            "border-top-width",
            "box-shadow",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(36, 34, 43)",
        "border-top-color": "rgba(255, 255, 255, 0.13)",
        "border-top-left-radius": "14px",
        "border-top-width": "1px",
        "box-shadow": "rgba(0, 0, 0, 0.5) 0px 24px 64px 0px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily(),
        "overflow-y": "hidden",
    });
    /* ---- Input row ------------------------------------------------------ */
    const header = view.$('[data-testid="cp"] [data-happy2-ui="command-palette-header"]');
    expect(header.bounds().height).toBe(60);
    expect(header.offsets().top).toBe(1); /* below the 1px top border */
    expect(
        header.computedStyles([
            "align-items",
            "border-bottom-color",
            "border-bottom-width",
            "display",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "align-items": "center",
        "border-bottom-color": "rgba(255, 255, 255, 0.07)",
        "border-bottom-width": "1px",
        display: "flex",
        "padding-left": "20px",
        "padding-right": "16px",
    });
    const input = view.$('[data-testid="cp"] [data-happy2-ui="command-palette-input"]');
    expect(input.element.tagName).toBe("INPUT");
    expect((input.element as HTMLInputElement).value).toBe("launch");
    expect(input.element.getAttribute("placeholder")).toBe("Search Happy (2)…");
    expect(input.element.getAttribute("aria-label")).toBe("Search Happy (2)…");
    expect(
        input.computedStyles([
            "background-color",
            "border-top-width",
            "color",
            "font-size",
            "font-weight",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "0px",
        color: "rgb(237, 234, 242)",
        "font-size": "16px",
        "font-weight": "500",
    });
    expect((await input.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    /* Leading glyph + trailing ESC cap + ghost close square all present. */
    expect(
        view.$('[data-testid="cp"] [data-happy2-ui="command-palette-icon"] svg').bounds().width,
    ).toBe(18);
    const cap = view.$('[data-testid="cp"] [data-happy2-ui="key-cap"]');
    expect(cap.element.getAttribute("aria-label")).toBe("ESC");
    const close = view.$('[data-testid="cp"] .happy2-command-palette__close');
    expect(close.element.tagName).toBe("BUTTON");
    expect(close.element.getAttribute("aria-label")).toBe("Close");
    expect(close.bounds().height).toBe(28);
    /* ---- Body ----------------------------------------------------------- */
    const body = view.$('[data-testid="cp"] [data-happy2-ui="command-palette-body"]');
    expect(body.bounds().width).toBe(638); /* 640 - 2 * 1px border */
    expect(body.computedStyles(["overflow-y", "padding-top", "padding-left"])).toEqual({
        "overflow-y": "auto",
        "padding-top": "8px",
        "padding-left": "8px",
    });
    expect(view.$('[data-testid="cp-results"]').element.textContent).toBe("results");
    await view.screenshot("CommandPalette.test");
}, 120000);
it("focuses and selects its input on open and returns focus to the opener on close", async () => {
    const view = createRenderer();
    function PaletteFixture() {
        const [open, setOpen] = useState(false);
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <button data-testid="trigger" onClick={() => setOpen(true)} type="button">
                    Open palette
                </button>
                {open ? (
                    <CommandPalette
                        onClose={() => setOpen(false)}
                        onQueryChange={() => {}}
                        query="seed"
                    >
                        <div>results</div>
                    </CommandPalette>
                ) : null}
            </div>
        );
    }
    view.render(PaletteFixture, { width: 720, height: 420, padding: 24 });
    await view.ready();
    const trigger = view.$('[data-testid="trigger"]').element as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    await frame();
    const input = view.$('[data-happy2-ui="command-palette-input"]').element as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    /* Existing text is selected so the first keystroke replaces it. */
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("seed".length);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await frame();
    expect(view.container.querySelector('[data-happy2-ui="command-palette-input"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
});
it("keeps composition input safe and closes only on a committed Escape", async () => {
    const view = createRenderer();
    const changes: string[] = [];
    const closed: number[] = [];
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                onClose={() => closed.push(1)}
                onQueryChange={(value) => changes.push(value)}
                query=""
            >
                <div>results</div>
            </CommandPalette>
        ),
        { width: 720, height: 320, padding: 24 },
    );
    await view.ready();
    const input = view.$('[data-happy2-ui="command-palette-input"]').element as HTMLInputElement;
    /* Plain typing commits immediately. */
    input.value = "rel";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(changes).toEqual(["rel"]);
    /* Mid-composition input is held back on either signal: once with the
     * `isComposing` hint set, and once with it absent (an unreliable engine) —
     * the local composition flag alone must still suppress it. Escape cancels
     * the IME, not the palette. */
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.value = "に";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    input.value = "にほん";
    input.dispatchEvent(new InputEvent("input", { bubbles: true })); // no isComposing hint
    expect(changes).toEqual(["rel"]);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual([]);
    /* `compositionend` clears the local flag but must not itself commit — the
     * browser follows it with a final non-composing `input`, and only that
     * trailing event commits, exactly once. */
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(changes).toEqual(["rel"]);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: false }));
    expect(changes).toEqual(["rel", "にほん"]);
    /* A later Escape (no active composition) closes. */
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual([1]);
});
it("reports the close button through onClose", async () => {
    const view = createRenderer();
    const closed: number[] = [];
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                onClose={() => closed.push(1)}
                onQueryChange={() => {}}
                query="x"
            >
                <div>results</div>
            </CommandPalette>
        ),
        { width: 720, height: 320, padding: 24 },
    );
    await view.ready();
    (view.$(".happy2-command-palette__close").element as HTMLButtonElement).click();
    expect(closed).toEqual([1]);
});
