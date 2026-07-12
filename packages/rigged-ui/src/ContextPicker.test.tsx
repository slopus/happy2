import { expect, it, vi } from "vitest";
import { server } from "vitest/browser";
import { ContextPicker } from "./ContextPicker";
import type { ContextItem } from "./ContextIcon";
import { createRenderer } from "./testing";
import "./styles.css";

const items: ContextItem[] = [
    { detail: "src/main.tsx", id: "file", kind: "file", label: "main.tsx" },
    { detail: "Agent run", id: "run", kind: "run", label: "Forge" },
    { detail: "Design thread", id: "thread", kind: "thread", label: "UI review" },
];

it("holds ContextPicker geometry, styles, optical alignment, and controlled behavior", async () => {
    const onDone = vi.fn();
    const onToggle = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <ContextPicker
                    class="picker-placement"
                    data-testid="populated"
                    items={items}
                    onDone={onDone}
                    onToggle={onToggle}
                    selectedItems={[items[1]!]}
                    style={{ "margin-left": "4px" }}
                />
            ),
            { width: 392, height: 296, padding: 12 },
        )
        .render(
            () => (
                <ContextPicker
                    aria-label="Choose sources"
                    data-testid="empty"
                    items={[]}
                    onDone={onDone}
                    onToggle={onToggle}
                    selectedItems={[]}
                />
            ),
            { width: 384, height: 188, padding: 12 },
        );
    await view.ready();

    const picker = view.$('[data-testid="populated"]');
    const empty = view.$('[data-testid="empty"]');
    expect(picker.bounds()).toEqual({ x: 16, y: 12, width: 360, height: 270 });
    expect(empty.bounds()).toEqual({ x: 12, y: 12, width: 360, height: 178 });
    expect(picker.element.classList.contains("picker-placement")).toBe(true);
    expect(empty.element.getAttribute("aria-label")).toBe("Choose sources");
    expect(
        picker.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "margin-left",
            "overflow-x",
            "overflow-y",
            "position",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "11px",
        "border-top-color": "rgb(213, 206, 216)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "block",
        "margin-left": "4px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
        position: "static",
        width: "360px",
    });
    expect(picker.computedStyle("font-family").replaceAll('"', "")).toBe(
        "Rigged Manrope, sans-serif",
    );

    const header = view.$('[data-testid="populated"] [data-rigged-ui="context-picker-header"]');
    const list = view.$('[data-testid="populated"] [data-rigged-ui="context-picker-list"]');
    const footer = view.$('[data-testid="populated"] [data-rigged-ui="context-picker-footer"]');
    expect(header.bounds()).toEqual({ x: 17, y: 13, width: 358, height: 56 });
    expect(list.bounds()).toEqual({ x: 17, y: 69, width: 358, height: 168 });
    expect(footer.bounds()).toEqual({ x: 17, y: 237, width: 358, height: 44 });
    expect(
        header.computedStyles([
            "background-color",
            "border-bottom-color",
            "border-bottom-width",
            "box-sizing",
            "height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "background-color": "rgb(250, 248, 251)",
        "border-bottom-color": "rgb(231, 226, 232)",
        "border-bottom-width": "1px",
        "box-sizing": "border-box",
        height: "56px",
        "padding-left": "12px",
        "padding-right": "12px",
    });

    const rows = picker.element.querySelectorAll<HTMLElement>(
        '[data-rigged-ui="context-picker-item"]',
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.getBoundingClientRect().height).toBe(52);
    expect(rows[0]!.getBoundingClientRect().width).toBe(346);
    expect(rows[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(rows[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(
        view
            .$('[data-testid="populated"] [data-item-id="run"]')
            .computedStyles([
                "align-items",
                "background-color",
                "border-radius",
                "column-gap",
                "height",
                "padding-left",
                "padding-right",
                "width",
            ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(238, 231, 243)",
        "border-radius": "8px",
        "column-gap": "10px",
        height: "52px",
        "padding-left": "8px",
        "padding-right": "8px",
        width: "346px",
    });

    const fileIconBox = view.$(
        '[data-testid="populated"] [data-item-id="file"] [data-rigged-ui="context-picker-item-icon"]',
    );
    expect(fileIconBox.bounds()).toMatchObject({ width: 32, height: 32 });
    expect(fileIconBox.computedStyle("background-color")).toBe("rgb(232, 238, 248)");
    const iconVisibleBounds = {
        file: { x: 2.5, y: 1, width: 9, height: 12 },
        run: { x: 4.5, y: 2.5, width: 7.5, height: 9 },
        thread: { x: 0.5, y: 2, width: 13, height: 11.5 },
    } as const;
    for (const item of items) {
        const contextIcon = view.$(
            `[data-testid="populated"] [data-item-id="${item.id}"] [data-rigged-ui="context-icon"]`,
        );
        expect(contextIcon.bounds()).toMatchObject({ width: 14, height: 14 });
        const contextVisible = await contextIcon.visibleMetrics();
        expect(contextVisible.bounds).toEqual(iconVisibleBounds[item.kind]);
        expect(Math.round(contextVisible.center.x * 2)).toBe(14);
        expect(Math.round(contextVisible.center.y * 2)).toBe(14);
    }

    const title = view.$('[data-testid="populated"] [data-rigged-ui="context-picker-title"]');
    expect(title.textMetrics().font).toEqual({
        family: "Rigged Manrope, sans-serif",
        letterSpacing: 0,
        lineHeight: 14,
        size: 11,
        weight: "800",
    });
    const itemLabel = view.$(
        '[data-testid="populated"] [data-item-id="run"] [data-rigged-ui="context-picker-item-label"]',
    );
    expect(itemLabel.textMetrics().font).toEqual({
        family: "Rigged Manrope, sans-serif",
        letterSpacing: 0,
        lineHeight: 14,
        size: 11,
        weight: "800",
    });
    expect(itemLabel.textMetrics().text).toBe("Forge");
    const titleVisible = await title.visibleMetrics();
    const itemLabelVisible = await itemLabel.visibleMetrics();
    expect(titleVisible.bounds).toEqual(
        server.browser === "chromium"
            ? { x: 0, y: 3, width: 65.5, height: 9 }
            : { x: 0, y: 2.8, width: 65.5, height: 8.4 },
    );
    expect(Math.round(titleVisible.center.x * 2)).toBe(65);
    expect(Math.round((titleVisible.center.x + title.offsets().left) * 2)).toBe(89);
    expect(Math.round((titleVisible.center.y + title.offsets().top) * 2)).toBe(42);
    expect(itemLabelVisible.bounds).toEqual(
        server.browser === "webkit"
            ? { x: 0.5, y: 2.5, width: 29.5, height: 11.5 }
            : { x: 0.5, y: 2.5, width: 30, height: 11.5 },
    );
    expect(Math.round(itemLabelVisible.center.x * 2)).toBe(31);
    expect(Math.round(itemLabelVisible.center.y * 2)).toBe(16);

    const selected = view.$(
        '[data-testid="populated"] [data-item-id="run"] [data-rigged-ui="context-picker-selection"]',
    );
    expect(selected.bounds()).toMatchObject({ width: 16, height: 16 });
    expect(
        selected.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "color",
            "height",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(118, 81, 126)",
        "border-radius": "5px",
        "border-top-color": "rgb(118, 81, 126)",
        "border-top-width": "1px",
        color: "rgb(255, 255, 255)",
        height: "16px",
        width: "16px",
    });
    const mark = view.$(
        '[data-testid="populated"] [data-item-id="run"] [data-rigged-ui="context-picker-selection-mark"]',
    );
    expect(mark.bounds()).toMatchObject({ width: 12, height: 12 });
    const markVisible = await mark.visibleMetrics();
    expect(markVisible.pixelCount).toBeGreaterThan(0);
    expect(markVisible.bounds).toEqual({ x: 0, y: 0, width: 12, height: 12 });
    expect(Math.round(markVisible.center.x * 2)).toBe(12);
    expect(Math.round(markVisible.center.y * 2)).toBe(12);

    const unselected = view.$(
        '[data-testid="populated"] [data-item-id="file"] [data-rigged-ui="context-picker-selection"]',
    );
    expect(unselected.computedStyle("background-color")).toBe("rgb(255, 255, 255)");
    expect(unselected.computedStyle("color")).toBe("rgba(0, 0, 0, 0)");

    const emptyMessage = view.$('[data-testid="empty"] [data-rigged-ui="context-picker-empty"]');
    expect(emptyMessage.bounds()).toEqual({ x: 19, y: 75, width: 346, height: 64 });
    expect(emptyMessage.element.textContent).toBe("No context available.");
    expect(
        view.$('[data-testid="empty"] [data-rigged-ui="context-picker-count"]').element.textContent,
    ).toBe("0 attached");

    rows[0]!.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(items[0]);
    (
        picker.element.querySelector('[data-rigged-ui="context-picker-done"]') as HTMLButtonElement
    ).click();
    expect(onDone).toHaveBeenCalledTimes(1);

    await view.screenshot("ContextPicker.test");
});
