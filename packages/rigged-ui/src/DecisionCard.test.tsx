import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { DecisionCard, type Decision } from "./DecisionCard";
import { createRenderer } from "./testing";
import "./styles.css";

const decision: Decision = {
    acceptedBy: 4,
    context: {
        detail: "Decision recorded in architecture thread",
        id: "decision-1",
        kind: "thread",
        label: "Use a single component boundary",
    },
    criteria: [
        "Every visual state can render from props",
        "The app owns expansion and context state",
        "Geometry agrees in all supported browsers",
    ],
    decidedBy: "Steve and Forge",
    id: "decision-1",
    rationale:
        "A controlled boundary keeps the visual contract reusable and independently testable.",
    summary:
        "Move visual behavior into rigged-ui while the application supplies state and callbacks.",
    title: "Use controlled UI components",
};

it("holds DecisionCard geometry, typography, styles, optical marks, and callbacks", async () => {
    await page.viewport(800, 1200);
    const onExpandedChange = vi.fn();
    const onAddContext = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <DecisionCard
                    data-testid="collapsed-card"
                    attached={false}
                    decision={decision}
                    expanded={false}
                    onAddContext={onAddContext}
                    onExpandedChange={onExpandedChange}
                />
            ),
            { width: 720, height: 210, padding: 20 },
        )
        .render(
            () => (
                <DecisionCard
                    data-testid="expanded-card"
                    attached
                    decision={decision}
                    expanded
                    onAddContext={onAddContext}
                    onExpandedChange={onExpandedChange}
                />
            ),
            { width: 720, height: 384, padding: 20 },
        )
        .render(
            () => (
                <DecisionCard
                    data-testid="narrow-card"
                    attached={false}
                    class="decision-card-custom"
                    decision={decision}
                    expanded={false}
                    onAddContext={onAddContext}
                    onExpandedChange={onExpandedChange}
                    style={{ opacity: 0.99 }}
                />
            ),
            { width: 560, height: 210, padding: 20 },
        );
    await view.ready();

    const collapsed = view.$('[data-testid="collapsed-card"]');
    const expanded = view.$('[data-testid="expanded-card"]');
    const narrow = view.$('[data-testid="narrow-card"]');
    expect(collapsed.bounds()).toEqual({ x: 20, y: 30, width: 680, height: 160 });
    expect(expanded.bounds()).toEqual({ x: 20, y: 30, width: 680, height: 334 });
    expect(narrow.bounds()).toEqual({ x: 20, y: 30, width: 520, height: 160 });
    expect(narrow.element.classList.contains("decision-card-custom")).toBe(true);
    expect(narrow.computedStyle("opacity")).toBe("0.99");

    expect(
        collapsed.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-shadow",
            "box-sizing",
            "display",
            "grid-template-rows",
            "max-width",
            "overflow-x",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 253, 248)",
        "border-radius": "10px",
        "border-top-color": "rgb(216, 210, 196)",
        "border-top-width": "1px",
        "box-shadow":
            "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(56, 43, 25, 0.05) 0px 2px 7px 0px",
        "box-sizing": "border-box",
        display: "grid",
        "grid-template-rows": "108px 50px",
        "max-width": "680px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
        width: "680px",
    });
    expect(collapsed.computedStyle("font-family").replaceAll('"', "")).toBe("Rigged Manrope");
    expect(expanded.computedStyle("grid-template-rows")).toBe("108px 174px 50px");

    expect(
        view.$('[data-testid="collapsed-card"] [data-rigged-ui="decision-summary"]').bounds(),
    ).toEqual({ x: 21, y: 31, width: 678, height: 108 });
    expect(
        view.$('[data-testid="collapsed-card"] [data-rigged-ui="decision-actions"]').bounds(),
    ).toEqual({ x: 21, y: 139, width: 678, height: 50 });
    expect(
        view.$('[data-testid="expanded-card"] [data-rigged-ui="decision-details"]').bounds(),
    ).toEqual({ x: 21, y: 139, width: 678, height: 174 });

    const title = view.$('[data-testid="collapsed-card"] [data-rigged-ui="decision-title"]');
    expect(title.bounds()).toEqual({ x: 71, y: 63, width: 616, height: 14 });
    expect(title.textMetrics().font).toEqual({
        family: "Rigged Manrope",
        letterSpacing: 0,
        lineHeight: 14,
        size: 12,
        weight: "800",
    });
    expect(title.textMetrics().ink.width).toBeGreaterThan(160);
    expect(title.textMetrics().ink.width).toBeLessThan(200);
    const addButton = view.$(
        '[data-testid="collapsed-card"] [data-rigged-ui="decision-add-context"]',
    );
    expect(addButton.bounds()).toMatchObject({ width: 96, height: 28 });
    expect(
        addButton.computedStyles([
            "background-color",
            "border-top-color",
            "border-top-width",
            "color",
            "font-size",
            "font-weight",
            "height",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "background-color": "rgb(132, 107, 56)",
        "border-top-color": "rgb(132, 107, 56)",
        "border-top-width": "1px",
        color: "rgb(255, 255, 255)",
        "font-size": "9.76px",
        "font-weight": "800",
        height: "28px",
        "padding-left": "12px",
        "padding-right": "12px",
    });

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await view.screenshot("DecisionCard.test");

    const mainMark = view.$('[data-testid="collapsed-card"] [data-rigged-ui="decision-mark"]');
    expect(mainMark.bounds()).toEqual({ x: 40, y: 48, width: 14, height: 14 });
    const mainVisible = await mainMark.visibleMetrics();
    const titleVisible = await title.visibleMetrics();
    expect(titleVisible.bounds).toMatchObject({ x: 1.66, width: 176.83 });
    expect(titleVisible.bounds.height).toBeGreaterThan(10.5);
    expect(Math.round(titleVisible.center.x * 2)).toBe(182);
    expect(Math.round(titleVisible.center.y * 2)).toBe(14);
    expect(mainVisible.pixelCount).toBeGreaterThan(45);
    expect(mainVisible.bounds).toEqual({ x: 1.556, y: 3.111, width: 10.111, height: 7 });
    expect(Math.round(mainVisible.center.x * 2)).toBe(14);
    expect(Math.round(mainVisible.center.y * 2)).toBe(14);

    const criterionMark = view.$(
        '[data-testid="expanded-card"] [data-rigged-ui="decision-criterion-mark"]',
    );
    expect(criterionMark.bounds()).toMatchObject({ width: 14, height: 14 });
    const criterionVisible = await criterionMark.visibleMetrics();
    expect(criterionVisible.pixelCount).toBeGreaterThan(45);
    expect(criterionVisible.bounds).toEqual({ x: 1.556, y: 3.5, width: 10.111, height: 7 });
    expect(Math.round(criterionVisible.center.x * 2)).toBe(14);
    expect(Math.round(criterionVisible.center.y * 2)).toBe(14);

    (view.$('[data-rigged-ui="decision-toggle"]').element as HTMLButtonElement).click();
    (addButton.element as HTMLButtonElement).click();
    expect(onExpandedChange).toHaveBeenCalledOnce();
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(onAddContext).toHaveBeenCalledOnce();
    expect(onAddContext).toHaveBeenCalledWith(decision.context);
    expect(
        (
            view.$('[data-testid="expanded-card"] [data-rigged-ui="decision-add-context"]')
                .element as HTMLButtonElement
        ).disabled,
    ).toBe(true);
});
