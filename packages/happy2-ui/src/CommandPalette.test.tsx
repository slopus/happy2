import { useReducer, useState } from "react";
import { expect, it } from "vitest";
import { server, userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/command-palette.css";
import "./styles/search-results.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/icon.css";
import { KeyCap } from "./Badge";
import { CommandPalette } from "./CommandPalette";
import { SearchResults, type SearchResultGroup } from "./SearchResults";
import { createRenderer } from "./testing";

const fontFamily = () =>
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const shortGroups: SearchResultGroup[] = [
    {
        type: "channel",
        results: [
            { id: "calm-design", title: "calm-design", meta: "Relay palette review" },
            { id: "launch-room", title: "launch-room", meta: "Release coordination" },
        ],
    },
];

const overflowGroups: SearchResultGroup[] = (["channel", "user", "message", "file"] as const).map(
    (type) => ({
        type,
        results: Array.from({ length: 5 }, (_, index) => ({
            id: `${type}-${index + 1}`,
            title: `${type} result ${index + 1} for calm`,
            meta: `Workspace match ${index + 1}`,
        })),
    }),
);

function frame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

it("holds the fixed 640x461 CommandPalette frame with a real short result set", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                data-testid="cp"
                onClose={() => {}}
                onQueryChange={() => {}}
                placeholder="Search Happy (2)…"
                query="calm"
            >
                <SearchResults groups={shortGroups} query="calm" variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();

    const card = view.$('[data-testid="cp"]');
    expect(card.element.getAttribute("role")).toBe("dialog");
    expect(card.element.getAttribute("aria-modal")).toBe("true");
    expect(card.element.getAttribute("aria-label")).toBe("Search Happy (2)…");
    expect(card.bounds()).toEqual({ x: 0, y: 0, width: 640, height: 461 });
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
            "height",
            "max-height",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(240, 240, 242)",
        "border-top-color": "rgb(209, 209, 214)",
        "border-top-left-radius": "14px",
        "border-top-width": "1px",
        "box-shadow": "rgba(0, 0, 0, 0.5) 0px 24px 64px 0px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily(),
        height: "461px",
        "max-height": "100%",
        "overflow-y": "hidden",
    });

    const header = view.$('[data-testid="cp"] [data-happy2-ui="command-palette-header"]');
    expect(header.bounds().height).toBe(60);
    expect(header.offsets().top).toBe(1);
    expect(
        header.computedStyles([
            "align-items",
            "border-bottom-color",
            "border-bottom-width",
            "display",
            "height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "align-items": "center",
        "border-bottom-color": "rgb(234, 234, 234)",
        "border-bottom-width": "1px",
        display: "flex",
        height: "60px",
        "padding-left": "20px",
        "padding-right": "16px",
    });

    const input = view.$('[data-testid="cp"] [data-happy2-ui="command-palette-input"]');
    expect(input.element.tagName).toBe("INPUT");
    expect((input.element as HTMLInputElement).value).toBe("calm");
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
        color: "rgb(0, 0, 0)",
        "font-size": "16px",
        "font-weight": "500",
    });
    expect((await input.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    expect(
        view.$('[data-testid="cp"] [data-happy2-ui="command-palette-icon"] svg').bounds().width,
    ).toBe(18);
    const cap = view.$('[data-testid="cp"] [data-happy2-ui="key-cap"]');
    expect(cap.element.getAttribute("aria-label")).toBe("ESC");
    const close = view.$('[data-testid="cp"] .happy2-command-palette__close');
    expect(close.element.tagName).toBe("BUTTON");
    expect(close.element.getAttribute("aria-label")).toBe("Close");
    expect(close.bounds().height).toBe(28);

    const body = view.$('[data-testid="cp"] [data-happy2-ui="command-palette-body"]');
    expect(body.bounds()).toEqual({ x: 1, y: 61, width: 638, height: 399 });
    expect(
        body.computedStyles([
            "margin-top",
            "overflow-x",
            "overflow-y",
            "padding-left",
            "padding-top",
            "scrollbar-gutter",
        ]),
    ).toEqual({
        "margin-top": "0px",
        "overflow-x": "hidden",
        "overflow-y": "auto",
        "padding-left": "0px",
        "padding-top": "0px",
        "scrollbar-gutter": "stable",
    });
    const bodyContent = view.$(
        '[data-testid="cp"] [data-happy2-ui="command-palette-body-content"]',
    );
    expect(bodyContent.computedStyles(["padding-top", "padding-left"])).toEqual({
        "padding-top": "8px",
        "padding-left": "8px",
    });
    const lastRow = view.$('[data-testid="cp"] [data-item-id="launch-room"]');
    expect(
        lastRow.computedStyles(["border-bottom-left-radius", "border-bottom-right-radius"]),
    ).toEqual({
        "border-bottom-left-radius": "5px",
        "border-bottom-right-radius": "5px",
    });

    await view.screenshot("CommandPalette.test");
}, 120_000);

it("shrinks in a short host and keeps overflowing focused rows visible at both extremes", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div
                data-testid="short-host"
                style={{ display: "flex", height: "408px", width: "640px" }}
            >
                <CommandPalette
                    autoFocus={false}
                    data-testid="constrained"
                    onClose={() => {}}
                    onQueryChange={() => {}}
                    query="calm"
                >
                    <SearchResults groups={overflowGroups} query="calm" variant="flush" />
                </CommandPalette>
            </div>
        ),
        { width: 640, height: 408 },
    );
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                data-testid="overflow"
                onClose={() => {}}
                onQueryChange={() => {}}
                query="calm"
            >
                <SearchResults groups={overflowGroups} query="calm" variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    (
        view.$('[data-testid="constrained"] [data-happy2-ui="command-palette-body"]')
            .element as HTMLElement
    ).scrollTop = 4;
    await view.ready();

    const constrained = view.$('[data-testid="constrained"]');
    expect(constrained.bounds()).toEqual({ x: 0, y: 0, width: 640, height: 408 });
    expect(
        view.$('[data-testid="constrained"] [data-happy2-ui="command-palette-header"]').bounds()
            .height,
    ).toBe(60);
    expect(
        view.$('[data-testid="constrained"] [data-happy2-ui="command-palette-body"]').bounds()
            .height,
    ).toBe(346);

    const body = view.$('[data-testid="overflow"] [data-happy2-ui="command-palette-body"]');
    const bodyElement = body.element as HTMLElement;
    expect(bodyElement.scrollHeight).toBeGreaterThan(bodyElement.clientHeight);
    expect(bodyElement.clientHeight).toBe(399);

    bodyElement.scrollTop = 0;
    await frame();
    const first = view.$('[data-testid="overflow"] [data-item-id="channel-1"]');
    (first.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(first.element);
    expect(first.element.matches(":focus-visible")).toBe(true);
    expect(first.computedStyles(["outline-offset", "outline-style", "outline-width"])).toEqual({
        "outline-offset": "-2px",
        "outline-style": "solid",
        "outline-width": "2px",
    });
    expect(first.bounds().y).toBeGreaterThanOrEqual(body.bounds().y);
    expect(first.bounds().y + first.bounds().height).toBeLessThanOrEqual(
        body.bounds().y + body.bounds().height,
    );

    const last = view.$('[data-testid="overflow"] [data-item-id="file-5"]');
    const lastTopBeforeScroll = last.bounds().y;
    bodyElement.scrollTop = bodyElement.scrollHeight;
    await userEvent.wheel(bodyElement, { delta: { y: bodyElement.scrollHeight } });
    for (let attempt = 0; attempt < 12 && last.bounds().y === lastTopBeforeScroll; attempt += 1)
        await frame();
    (last.element as HTMLButtonElement).focus({ preventScroll: true });
    expect(document.activeElement).toBe(last.element);
    expect(last.element.matches(":focus-visible")).toBe(true);
    expect(last.bounds().y).toBeLessThan(lastTopBeforeScroll);
    expect(last.bounds().y).toBeGreaterThanOrEqual(body.bounds().y);
    expect(last.bounds().y + last.bounds().height).toBeLessThanOrEqual(
        body.bounds().y + body.bounds().height,
    );
    expect(body.bounds().y + body.bounds().height - (last.bounds().y + last.bounds().height)).toBe(
        8,
    );
    expect(
        last.computedStyles(["border-bottom-left-radius", "border-bottom-right-radius"]),
    ).toEqual({
        "border-bottom-left-radius": "5px",
        "border-bottom-right-radius": "5px",
    });

    await view.screenshot("CommandPalette.overflow.test");
}, 120_000);

it("preserves the exact card, header, and input nodes across result-content swaps", async () => {
    const view = createRenderer();
    function SwappingFixture() {
        const [overflowing, toggle] = useReducer((value) => !value, false);
        return (
            <>
                <button data-testid="swap" onClick={toggle} type="button">
                    Swap results
                </button>
                <CommandPalette
                    autoFocus={false}
                    data-testid="identity"
                    onClose={() => {}}
                    onQueryChange={() => {}}
                    query="calm"
                >
                    <SearchResults
                        groups={overflowing ? overflowGroups : shortGroups}
                        query="calm"
                        variant="flush"
                    />
                </CommandPalette>
            </>
        );
    }
    view.render(SwappingFixture, { width: 680, height: 500, padding: 20 });
    await view.ready();

    const card = view.$('[data-testid="identity"]').element;
    const header = view.$(
        '[data-testid="identity"] [data-happy2-ui="command-palette-header"]',
    ).element;
    const input = view.$('[data-testid="identity"] [data-happy2-ui="command-palette-input"]')
        .element as HTMLInputElement;
    input.focus();
    input.setSelectionRange(1, 4);
    (view.$('[data-testid="swap"]').element as HTMLButtonElement).click();
    await frame();

    expect(view.$('[data-testid="identity"]').element).toBe(card);
    expect(
        view.$('[data-testid="identity"] [data-happy2-ui="command-palette-header"]').element,
    ).toBe(header);
    expect(
        view.$('[data-testid="identity"] [data-happy2-ui="command-palette-input"]').element,
    ).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(4);
    expect(view.container.querySelector('[data-item-id="file-5"]')).toBeTruthy();
});

it("keeps its ESC KeyCap optically identical to a standalone reference", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <CommandPalette
                autoFocus={false}
                data-testid="optical"
                onClose={() => {}}
                onQueryChange={() => {}}
                query="calm"
            >
                <SearchResults groups={shortGroups} query="calm" variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    view.render(
        () => (
            <div data-testid="cap-control" style={{ display: "flex", paddingTop: "21.5px" }}>
                <KeyCap keys="ESC" />
            </div>
        ),
        { width: 80, height: 60 },
    );
    await view.ready();

    const cap = view.$('[data-testid="optical"] [data-happy2-ui="key-cap"]');
    const capLabel = view.$('[data-testid="optical"] [data-happy2-ui="key-cap-label"]');
    const reference = view.$('[data-testid="cap-control"] [data-happy2-ui="key-cap"]');
    const referenceLabel = view.$('[data-testid="cap-control"] [data-happy2-ui="key-cap-label"]');
    expect(cap.bounds().height).toBe(18);
    expect(reference.bounds().height).toBe(18);
    expect(capLabel.bounds().height).toBe(10);
    expect(referenceLabel.bounds().height).toBe(10);
    expect(referenceLabel.bounds().y).toBe(capLabel.bounds().y);
    const capInk = await capLabel.visibleMetrics();
    const referenceInk = await referenceLabel.visibleMetrics();
    expect(capInk.pixelCount).toBeGreaterThan(0);
    expect(referenceInk.pixelCount).toBeGreaterThan(0);
    expect(
        Math.abs(capInk.center.y - referenceInk.center.y),
        "palette ESC glyph parity y vs standalone KeyCap",
    ).toBeLessThanOrEqual(0.4);
    expect(
        Math.abs(capInk.center.y + capLabel.bounds().y - cap.bounds().y - cap.bounds().height / 2),
        "palette ESC glyph gross optical y",
    ).toBeLessThanOrEqual(1.5);
});

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
                        <SearchResults groups={shortGroups} query="seed" variant="flush" />
                    </CommandPalette>
                ) : null}
            </div>
        );
    }
    view.render(PaletteFixture, { width: 720, height: 520, padding: 24 });
    await view.ready();
    const trigger = view.$('[data-testid="trigger"]').element as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    await frame();
    const input = view.$('[data-happy2-ui="command-palette-input"]').element as HTMLInputElement;
    expect(document.activeElement).toBe(input);
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
                <SearchResults groups={shortGroups} variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();
    const input = view.$('[data-happy2-ui="command-palette-input"]').element as HTMLInputElement;
    input.value = "rel";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(changes).toEqual(["rel"]);
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.value = "に";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    input.value = "にほん";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(changes).toEqual(["rel"]);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual([]);
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(changes).toEqual(["rel"]);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: false }));
    expect(changes).toEqual(["rel", "にほん"]);
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
                <SearchResults groups={shortGroups} query="x" variant="flush" />
            </CommandPalette>
        ),
        { width: 640, height: 461 },
    );
    await view.ready();
    (view.$(".happy2-command-palette__close").element as HTMLButtonElement).click();
    expect(closed).toEqual([1]);
});
