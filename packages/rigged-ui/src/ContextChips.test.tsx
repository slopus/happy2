import { expect, it, vi } from "vitest";
import { ContextChips } from "./ContextChips";
import type { ContextItem } from "./ContextIcon";
import { createRenderer } from "./testing";
import "./styles.css";

const items: ContextItem[] = [
    { detail: "src/main.tsx", id: "file", kind: "file", label: "main.tsx" },
    { detail: "Agent run", id: "run", kind: "run", label: "Forge" },
    { detail: "Design thread", id: "thread", kind: "thread", label: "UI review" },
];

it("holds ContextChips geometry, styles, optical alignment, and behavior", async () => {
    const onRemove = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <ContextChips
                    chipWidth={112}
                    class="w-full"
                    data-testid="removable"
                    items={items.slice(0, 2)}
                    label="Attached context"
                    onRemove={onRemove}
                />
            ),
            { width: 360, height: 64, padding: 12 },
        )
        .render(
            () => (
                <ContextChips
                    chipWidth={112}
                    class="w-full"
                    data-testid="readonly"
                    items={[items[2]!]}
                    label="Read-only context"
                    onRemove={onRemove}
                    readOnly
                />
            ),
            { width: 240, height: 52, padding: 12 },
        )
        .render(
            () => (
                <ContextChips
                    chipWidth={112}
                    class="w-full"
                    data-testid="wrapped"
                    items={items}
                    label="Wrapped context"
                />
            ),
            { width: 156, height: 112, padding: 12 },
        );
    await view.ready();

    const removable = view.$('[data-testid="removable"]');
    const readonly = view.$('[data-testid="readonly"]');
    const wrapped = view.$('[data-testid="wrapped"]');
    expect(removable.bounds()).toEqual({ x: 12, y: 12, width: 336, height: 28 });
    expect(readonly.bounds()).toEqual({ x: 12, y: 12, width: 216, height: 28 });
    expect(wrapped.bounds()).toEqual({ x: 12, y: 12, width: 132, height: 96 });
    expect(removable.element.getAttribute("aria-label")).toBe("Attached context");
    expect(removable.element.getAttribute("data-read-only")).toBe("false");
    expect(readonly.element.getAttribute("data-read-only")).toBe("true");

    const firstChip = view.$('[data-testid="removable"] [data-item-id="file"]');
    expect(firstChip.bounds()).toEqual({ x: 12, y: 12, width: 112, height: 28 });
    expect(
        firstChip.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "column-gap",
            "display",
            "height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(247, 244, 249)",
        "border-radius": "7px",
        "border-top-color": "rgb(217, 210, 221)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        "column-gap": "6px",
        display: "flex",
        height: "28px",
        "padding-left": "8px",
        "padding-right": "8px",
    });

    const label = view.$(
        '[data-testid="removable"] [data-item-id="file"] [data-rigged-ui="context-chip-label"]',
    );
    expect(label.bounds()).toEqual({ x: 41, y: 20, width: 50, height: 12 });
    expect(
        label.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "line-height",
            "overflow-x",
            "text-overflow",
            "white-space-collapse",
        ]),
    ).toEqual({
        color: "rgb(96, 83, 101)",
        "font-size": "9.5px",
        "font-weight": "700",
        "line-height": "12px",
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space-collapse": "collapse",
    });
    expect(label.computedStyle("font-family").replaceAll('"', "")).toBe(
        "Rigged Manrope, sans-serif",
    );

    const contextIcon = view.$(
        '[data-testid="removable"] [data-item-id="file"] [data-rigged-ui="context-icon"]',
    );
    expect(contextIcon.bounds()).toEqual({ x: 21, y: 19, width: 14, height: 14 });
    const contextVisible = await contextIcon.visibleMetrics();
    expect(contextVisible.bounds).toEqual({ x: 2.5, y: 1, width: 9, height: 12 });
    expect(Math.round(contextVisible.center.x * 2)).toBe(14);
    expect(Math.round(contextVisible.center.y * 2)).toBe(14);

    const runIcon = view.$(
        '[data-testid="removable"] [data-item-id="run"] [data-rigged-ui="context-icon"]',
    );
    expect(runIcon.bounds()).toEqual({ x: 139, y: 19, width: 14, height: 14 });
    const runVisible = await runIcon.visibleMetrics();
    expect(runVisible.bounds).toEqual({ x: 4.5, y: 2.5, width: 7.5, height: 9 });
    expect(Math.round(runVisible.center.x * 2)).toBe(14);
    expect(Math.round(runVisible.center.y * 2)).toBe(14);

    const threadIcon = view.$(
        '[data-testid="readonly"] [data-item-id="thread"] [data-rigged-ui="context-icon"]',
    );
    expect(threadIcon.bounds()).toEqual({ x: 21, y: 19, width: 14, height: 14 });
    const threadVisible = await threadIcon.visibleMetrics();
    expect(threadVisible.bounds).toEqual({ x: 0.5, y: 2, width: 13, height: 11.5 });
    expect(Math.round(threadVisible.center.x * 2)).toBe(14);
    expect(Math.round(threadVisible.center.y * 2)).toBe(14);

    const removeButton = view.$(
        '[data-testid="removable"] [data-item-id="file"] [data-rigged-ui="context-chip-remove"]',
    );
    expect(removeButton.bounds()).toEqual({ x: 99, y: 18, width: 16, height: 16 });
    expect(
        removeButton.computedStyles([
            "background-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
            "height",
            "padding-left",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-top-width": "0px",
        "box-sizing": "border-box",
        color: "rgb(138, 126, 137)",
        display: "grid",
        height: "16px",
        "padding-left": "0px",
        width: "16px",
    });
    const removeIcon = view.$(
        '[data-testid="removable"] [data-item-id="file"] [data-rigged-ui="context-chip-remove-icon"]',
    );
    expect(removeIcon.bounds()).toEqual({ x: 103, y: 22, width: 8, height: 8 });
    const removeVisible = await removeIcon.visibleMetrics();
    expect(removeVisible.bounds).toEqual({ x: 0.5, y: 0.5, width: 7, height: 7 });
    expect(Math.round(removeVisible.center.x * 2)).toBe(8);
    expect(Math.round(removeVisible.center.y * 2)).toBe(8);

    expect(readonly.element.querySelector('[data-rigged-ui="context-chip-remove"]')).toBeNull();
    expect(wrapped.element.querySelectorAll('[data-rigged-ui="context-chip"]')).toHaveLength(3);
    expect(view.$('[data-testid="wrapped"] [data-item-id="thread"]').bounds()).toMatchObject({
        x: 12,
        y: 80,
        height: 28,
    });

    (removeButton.element as HTMLButtonElement).click();
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(items[0]);

    await view.screenshot("ContextChips.test");
});
