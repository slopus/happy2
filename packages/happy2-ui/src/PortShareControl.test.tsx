import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/port-share-control.css";
import { PortShareControl } from "./PortShareControl";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";

const fontFamily = () =>
    (server.browser as Engine) === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const SUBTITLE = "documentation-preview-abc123.preview.example";

/* Alpha-weighted ink centroid of a part, as an offset from its own box center
 * (positive = right/low). Refuses blank or clipped captures. */
async function iconDrift(view: ReturnType<typeof createRenderer>, selector: string) {
    const part = view.$(selector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${selector} paints no pixels`).toBeGreaterThan(0);
    const bounds = part.bounds();
    expect(visible.bounds.y, `${selector} ink clipped at top`).toBeGreaterThan(0);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${selector} ink clipped at bottom`,
    ).toBeLessThan(bounds.height);
    expect(visible.bounds.x, `${selector} ink clipped at left`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${selector} ink clipped at right`,
    ).toBeLessThan(bounds.width);
    return { dx: visible.center.x - bounds.width / 2, dy: visible.center.y - bounds.height / 2 };
}

it("holds bar layout geometry, typography, tokens, and the link mark's optical center", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", width: "320px" }}>
                <PortShareControl
                    data-testid="bar"
                    name="Documentation Preview"
                    onDisable={() => {}}
                    onOpen={() => {}}
                    subtitle={SUBTITLE}
                />
            </div>
        ),
        { width: 360, height: 96, padding: 16 },
    );
    await view.ready();

    const root = view.$('[data-testid="bar"]');
    expect(
        root.computedStyles(["box-sizing", "display", "flex-direction", "gap", "font-family"]),
    ).toEqual({
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        gap: "6px",
        "font-family": fontFamily(),
    });

    const rowBounds = view.$('[data-testid="bar"] [data-happy2-ui="port-share-control-row"]');
    expect(rowBounds.computedStyles(["display", "align-items", "gap", "min-height"])).toEqual({
        display: "flex",
        "align-items": "center",
        gap: "8px",
        "min-height": "28px",
    });

    // Fixed 16px link mark, secondary-toned, its icon optically centered.
    const mark = view.$('[data-testid="bar"] [data-happy2-ui="port-share-control-mark"]');
    expect(mark.bounds()).toMatchObject({ width: 16, height: 16 });
    expect(mark.computedStyle("color")).toBe("rgb(142, 142, 147)");
    const markDrift = await iconDrift(
        view,
        '[data-testid="bar"] [data-happy2-ui="port-share-control-mark"] svg',
    );
    expect(Math.abs(markDrift.dx), "mark ink dx").toBeLessThanOrEqual(1.2);
    expect(Math.abs(markDrift.dy), "mark ink dy").toBeLessThanOrEqual(1.2);

    const name = view.$('[data-testid="bar"] [data-happy2-ui="port-share-control-name"]');
    expect(
        name.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "line-height",
            "white-space",
            "text-overflow",
        ]),
    ).toEqual({
        color: "rgb(0, 0, 0)",
        "font-size": "13px",
        "font-weight": "600",
        "line-height": "18px",
        "white-space": "nowrap",
        "text-overflow": "ellipsis",
    });
    expect(name.element.textContent).toBe("Documentation Preview");

    const subtitle = view.$('[data-testid="bar"] [data-happy2-ui="port-share-control-subtitle"]');
    expect(subtitle.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(142, 142, 147)",
        "font-size": "12px",
        "font-weight": "400",
    });
    expect(subtitle.element.textContent).toBe(SUBTITLE);

    // Actions are small (28px) buttons, right-pinned to the row edge.
    const actions = view.$('[data-testid="bar"] [data-happy2-ui="port-share-control-actions"]');
    expect(actions.computedStyle("gap")).toBe("4px");
    const buttons = root.element.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="button"]');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button.getBoundingClientRect().height).toBeCloseTo(28, 1);
    const open = buttons[0]!;
    const disable = buttons[1]!;
    expect(open.getAttribute("aria-label")).toBe("Open shared preview: Documentation Preview");
    expect(open.textContent).toBe("Open");
    expect(disable.getAttribute("aria-label")).toBe("Stop sharing Documentation Preview");
    expect(disable.textContent).toBe("Stop sharing");
    expect(open.disabled).toBe(false);
    expect(disable.disabled).toBe(false);
    const rowRect = rowBounds.bounds();
    const actionsRect = actions.bounds();
    expect(
        Math.abs(rowRect.x + rowRect.width - (actionsRect.x + actionsRect.width)),
        "actions pinned to row right edge",
    ).toBeLessThanOrEqual(0.5);

    // No error line is present in the idle state.
    expect(root.element.querySelector('[data-happy2-ui="port-share-control-error"]')).toBeNull();
    expect(root.element.hasAttribute("data-error")).toBe(false);

    await view.screenshot("PortShareControl.bar.test");
});

it("renders busy and error states with disabled actions, danger tokens, and an inline error", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", width: "320px", gap: "16px" }}>
                <PortShareControl
                    data-testid="opening"
                    name="Documentation Preview"
                    onDisable={() => {}}
                    onOpen={() => {}}
                    opening
                    subtitle={SUBTITLE}
                />
                <PortShareControl
                    data-testid="disabling"
                    disabling
                    name="Documentation Preview"
                    onDisable={() => {}}
                    onOpen={() => {}}
                    subtitle={SUBTITLE}
                />
                <PortShareControl
                    data-testid="error"
                    error="Allow pop-ups for this app to open the shared preview."
                    name="Documentation Preview"
                    onDisable={() => {}}
                    onOpen={() => {}}
                    subtitle={SUBTITLE}
                />
            </div>
        ),
        { width: 360, height: 320, padding: 16 },
    );
    await view.ready();

    // Opening: both actions disabled, open reads "Opening…".
    const openingButtons = view
        .$('[data-testid="opening"]')
        .element.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="button"]');
    expect(openingButtons[0]!.textContent).toBe("Opening…");
    expect(openingButtons[0]!.disabled).toBe(true);
    expect(openingButtons[1]!.disabled).toBe(true);
    expect(
        view.$('[data-testid="opening"] [data-happy2-ui="button"]').computedStyle("opacity"),
    ).toBe("0.48");

    // Disabling: disable reads "Stopping…", both disabled.
    const disablingButtons = view
        .$('[data-testid="disabling"]')
        .element.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="button"]');
    expect(disablingButtons[1]!.textContent).toBe("Stopping…");
    expect(disablingButtons[0]!.disabled).toBe(true);
    expect(disablingButtons[1]!.disabled).toBe(true);

    // Error: danger mark, a danger-toned inline error line with the message.
    const errorRoot = view.$('[data-testid="error"]');
    expect(errorRoot.element.hasAttribute("data-error")).toBe(true);
    expect(
        view
            .$('[data-testid="error"] [data-happy2-ui="port-share-control-mark"]')
            .computedStyle("color"),
    ).toBe("rgb(255, 59, 48)");
    const errorLine = view.$('[data-testid="error"] [data-happy2-ui="port-share-control-error"]');
    expect(errorLine.computedStyles(["color", "font-size"])).toEqual({
        color: "rgb(255, 59, 48)",
        "font-size": "12px",
    });
    expect(errorLine.element.textContent).toBe(
        "Allow pop-ups for this app to open the shared preview.",
    );

    await view.screenshot("PortShareControl.states.test");
});

it("renders the compact header pair with accessible names, no labels, and centered icons", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", gap: "24px" }}>
                <PortShareControl
                    data-testid="compact"
                    name="Documentation Preview"
                    onDisable={() => {}}
                    onOpen={() => {}}
                    variant="compact"
                />
                <PortShareControl
                    data-testid="compact-error"
                    error="Allow pop-ups for this app to open the shared preview."
                    name="Documentation Preview"
                    onDisable={() => {}}
                    onOpen={() => {}}
                    variant="compact"
                />
            </div>
        ),
        { width: 320, height: 72, padding: 16 },
    );
    await view.ready();

    const root = view.$('[data-testid="compact"]');
    // The compact variant drops the label text block entirely.
    expect(root.element.querySelector('[data-happy2-ui="port-share-control-text"]')).toBeNull();
    expect(root.element.querySelector('[data-happy2-ui="port-share-control-error"]')).toBeNull();

    const buttons = root.element.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="button"]');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        expect(rect.width).toBeCloseTo(28, 1);
        expect(rect.height).toBeCloseTo(28, 1);
    }
    expect(buttons[0]!.getAttribute("aria-label")).toBe(
        "Open shared preview: Documentation Preview",
    );
    expect(buttons[0]!.textContent).toBe("");
    expect(buttons[1]!.getAttribute("aria-label")).toBe("Stop sharing Documentation Preview");

    // Each icon-only button paints a centered, unclipped glyph.
    for (const [index] of [0, 1].entries()) {
        const drift = await iconDrift(
            view,
            `[data-testid="compact"] [data-happy2-ui="button"]:nth-of-type(${index + 1}) svg`,
        );
        expect(Math.abs(drift.dx), `compact icon ${index} dx`).toBeLessThanOrEqual(1.4);
        expect(Math.abs(drift.dy), `compact icon ${index} dy`).toBeLessThanOrEqual(1.4);
    }

    // Compact reflects an error through the danger mark and the title attribute,
    // never a layout-growing text line.
    const errorRoot = view.$('[data-testid="compact-error"]');
    expect(errorRoot.element.getAttribute("title")).toBe(
        "Allow pop-ups for this app to open the shared preview.",
    );
    expect(
        view
            .$('[data-testid="compact-error"] [data-happy2-ui="port-share-control-mark"]')
            .computedStyle("color"),
    ).toBe("rgb(255, 59, 48)");

    // Assistive tech gets the actual message through a visually hidden role=status
    // node — not conveyed by color/title alone. It must not occupy layout.
    const srError = view.$(
        '[data-testid="compact-error"] [data-happy2-ui="port-share-control-error"]',
    );
    expect(srError.element.getAttribute("role")).toBe("status");
    expect(srError.element.textContent).toBe(
        "Allow pop-ups for this app to open the shared preview.",
    );
    expect(srError.computedStyles(["position", "width", "height", "overflow"])).toEqual({
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
    });
    // The idle compact control exposes no error node at all.
    expect(root.element.querySelector('[data-happy2-ui="port-share-control-error"]')).toBeNull();

    await view.screenshot("PortShareControl.compact.test");
});

it("routes open and disable clicks and suppresses them while an action is in flight", async () => {
    const view = createRenderer();
    const idle = { open: vi.fn(), disable: vi.fn() };
    const busy = { open: vi.fn(), disable: vi.fn() };
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "320px" }}>
                <PortShareControl
                    data-testid="idle"
                    name="Documentation Preview"
                    onDisable={idle.disable}
                    onOpen={idle.open}
                    subtitle={SUBTITLE}
                />
                <PortShareControl
                    data-testid="busy"
                    name="Documentation Preview"
                    onDisable={busy.disable}
                    onOpen={busy.open}
                    opening
                    subtitle={SUBTITLE}
                />
            </div>
        ),
        { width: 360, height: 180, padding: 16 },
    );
    await view.ready();

    const idleButtons = view
        .$('[data-testid="idle"]')
        .element.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="button"]');
    idleButtons[0]!.click();
    idleButtons[1]!.click();
    expect(idle.open).toHaveBeenCalledTimes(1);
    expect(idle.disable).toHaveBeenCalledTimes(1);

    const busyButtons = view
        .$('[data-testid="busy"]')
        .element.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="button"]');
    busyButtons[0]!.click();
    busyButtons[1]!.click();
    expect(busy.open).not.toHaveBeenCalled();
    expect(busy.disable).not.toHaveBeenCalled();
});
