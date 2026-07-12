import { expect, it, vi } from "vitest";
import "./styles.css";
import { Rail, type Feature } from "./Rail";
import { createRenderer } from "./testing";

const features: Feature[] = [
    { id: "home", icon: "home", name: "Home" },
    { id: "agents", icon: "agents", name: "Agents" },
    { id: "tasks", icon: "tasks", name: "Tasks" },
    { id: "files", icon: "files", name: "Files" },
    { id: "more", icon: "more", name: "More" },
];

function SidebarFixture(props: { label: string }) {
    return (
        <div
            style={{
                background: "#f7f5fb",
                height: "100%",
                padding: "24px",
                "box-sizing": "border-box",
                color: "#40364e",
            }}
        >
            {props.label}
        </div>
    );
}

function MainFixture(props: { label: string }) {
    return (
        <div style={{ padding: "24px", color: "#292426" }}>
            <strong>{props.label}</strong>
        </div>
    );
}

it("holds Rail desktop grid geometry, controlled callbacks, and icon optics", async () => {
    const onBack = vi.fn();
    const onFeatureChange = vi.fn();
    const onForward = vi.fn();
    const onHelp = vi.fn();
    const onHome = vi.fn();
    const onProfile = vi.fn();
    const onQueryChange = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <Rail
                    data-testid="rail-minimum"
                    activeFeatureId="agents"
                    features={features}
                    onBack={onBack}
                    onFeatureChange={onFeatureChange}
                    onForward={onForward}
                    onHelp={onHelp}
                    onHome={onHome}
                    onProfile={onProfile}
                    onQueryChange={onQueryChange}
                    profileInitials="ST"
                    query=""
                    showWindowControls={true}
                    sidebar={<SidebarFixture label="Workspace sidebar · 288 px" />}
                >
                    <MainFixture label="Primary workspace" />
                </Rail>
            ),
            { width: 1024, height: 704 },
        )
        .render(
            () => (
                <Rail
                    data-testid="rail-large"
                    activeFeatureId="tasks"
                    features={features}
                    onFeatureChange={onFeatureChange}
                    onQueryChange={onQueryChange}
                    query="release notes"
                    showWindowControls={false}
                    sidebar={<SidebarFixture label="Tasks sidebar · 288 px" />}
                >
                    <MainFixture label="Large workspace · 1280 × 800" />
                </Rail>
            ),
            { width: 1280, height: 800 },
        );
    await view.ready();

    const minimum = view.$('[data-testid="rail-minimum"]');
    expect(minimum.bounds()).toEqual({ x: 0, y: 0, width: 1024, height: 704 });
    expect(
        minimum.computedStyles([
            "box-sizing",
            "display",
            "font-family",
            "grid-template-columns",
            "grid-template-rows",
            "height",
            "min-height",
            "min-width",
            "overflow-x",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        "box-sizing": "border-box",
        display: "grid",
        "font-family": expect.stringMatching(/Rigged Manrope/),
        "grid-template-columns": "76px 288px 660px",
        "grid-template-rows": "38px 666px",
        height: "704px",
        "min-height": "704px",
        "min-width": "1024px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
        width: "1024px",
    });
    expect(minimum.computedStyle("background-image")).toContain("linear-gradient");

    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-title-row"]').bounds(),
    ).toEqual({ x: 0, y: 0, width: 1024, height: 38 });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-window-controls"]').bounds(),
    ).toEqual({ x: 0, y: 0, width: 76, height: 38 });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-history-controls"]').bounds(),
    ).toEqual({ x: 76, y: 0, width: 88, height: 38 });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-search-region"]').bounds(),
    ).toEqual({ x: 164, y: 0, width: 772, height: 38 });
    expect(view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-search"]').bounds()).toEqual({
        x: 335,
        y: 6,
        width: 430,
        height: 26,
    });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-help-region"]').bounds(),
    ).toEqual({ x: 936, y: 0, width: 88, height: 38 });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-feature-region"]').bounds(),
    ).toEqual({ x: 0, y: 38, width: 76, height: 666 });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-content-shell"]').bounds(),
    ).toEqual({ x: 84, y: 46, width: 932, height: 650 });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-sidebar-slot"]').bounds(),
    ).toEqual({ x: 85, y: 47, width: 288, height: 648 });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-main-slot"]').bounds(),
    ).toEqual({ x: 373, y: 47, width: 642, height: 648 });

    const shell = view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-content-shell"]');
    expect(
        shell.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "display",
            "grid-template-columns",
            "overflow-x",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "14px",
        "border-top-color": "rgba(255, 255, 255, 0.2)",
        "border-top-width": "1px",
        display: "grid",
        "grid-template-columns": "288px 642px",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
    });

    const active = view.$(
        '[data-testid="rail-minimum"] [data-rigged-ui="rail-feature"][data-feature-id="agents"]',
    );
    expect(active.bounds()).toMatchObject({ width: 62, height: 54 });
    expect(
        active.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "border-top-width",
            "display",
            "flex-direction",
            "height",
            "justify-content",
            "width",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgba(255, 255, 255, 0.24)",
        "border-radius": "9px",
        "border-top-width": "0px",
        display: "flex",
        "flex-direction": "column",
        height: "54px",
        "justify-content": "center",
        width: "62px",
    });
    expect(
        view.$('[data-testid="rail-minimum"] [data-rigged-ui="rail-feature-label"]').textMetrics(),
    ).toMatchObject({
        font: { letterSpacing: -0.1, lineHeight: 10, size: 9.75, weight: "600" },
        text: "Home",
    });

    const surfaces = Array.from(
        view.container.querySelectorAll<HTMLElement>("[data-rigged-ui-surface]"),
    );
    for (const surface of surfaces) {
        surface.style.setProperty("zoom", "0.28");
    }
    await view.screenshot("Rail.test");
    for (const surface of surfaces) {
        surface.style.removeProperty("zoom");
    }
    await view.ready();

    const featureIcon = view.$(
        '[data-testid="rail-minimum"] [data-feature-id="agents"] [data-icon="agents"]',
    );
    expect(featureIcon.bounds()).toMatchObject({ width: 21, height: 21 });
    const featurePixels = await featureIcon.visibleMetrics();
    expect(featurePixels.pixelCount).toBeGreaterThan(70);
    expect(featurePixels.bounds.width).toBeGreaterThanOrEqual(14);
    expect(featurePixels.bounds.height).toBeGreaterThanOrEqual(14);
    expect(Math.round(featurePixels.center.x * 2)).toBe(21);
    expect(Math.round(featurePixels.center.y * 2)).toBe(21);

    const searchIcon = view.$(
        '[data-testid="rail-minimum"] [data-rigged-ui="rail-search"] [data-icon="search"]',
    );
    expect(searchIcon.bounds()).toMatchObject({ width: 14, height: 14 });
    const searchPixels = await searchIcon.visibleMetrics();
    expect(searchPixels.pixelCount).toBeGreaterThan(30);
    expect(searchPixels.bounds.width).toBeGreaterThanOrEqual(9);
    expect(searchPixels.bounds.height).toBeGreaterThanOrEqual(9);
    expect(Math.round(searchPixels.center.x * 2)).toBe(14);
    expect(Math.round(searchPixels.center.y * 2)).toBe(14);

    expect(minimum.element.querySelectorAll('[data-rigged-ui="rail-window-control"]')).toHaveLength(
        3,
    );
    expect(
        view
            .$('[data-testid="rail-minimum"] [data-control="close"]')
            .computedStyles(["background-color", "border-radius", "height", "width"]),
    ).toEqual({
        "background-color": "rgb(255, 105, 94)",
        "border-radius": "999px",
        height: "9px",
        width: "9px",
    });

    const large = view.$('[data-testid="rail-large"]');
    expect(large.bounds()).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
    expect(large.computedStyle("grid-template-columns")).toBe("76px 288px 916px");
    expect(large.computedStyle("grid-template-rows")).toBe("38px 762px");
    expect(
        view.$('[data-testid="rail-large"] [data-rigged-ui="rail-content-shell"]').bounds(),
    ).toEqual({ x: 84, y: 46, width: 1188, height: 746 });
    expect(
        view.$('[data-testid="rail-large"] [data-rigged-ui="rail-sidebar-slot"]').bounds(),
    ).toEqual({ x: 85, y: 47, width: 288, height: 744 });
    expect(view.$('[data-testid="rail-large"] [data-rigged-ui="rail-main-slot"]').bounds()).toEqual(
        { x: 373, y: 47, width: 898, height: 744 },
    );
    expect(large.element.querySelectorAll('[data-rigged-ui="rail-window-control"]')).toHaveLength(
        0,
    );
    expect(
        large.element.querySelector<HTMLInputElement>('[data-rigged-ui="rail-query"]')!.value,
    ).toBe("release notes");

    const query = minimum.element.querySelector<HTMLInputElement>('[data-rigged-ui="rail-query"]')!;
    query.value = "agents";
    query.dispatchEvent(new InputEvent("input", { bubbles: true, data: "s" }));
    expect(onQueryChange).toHaveBeenCalledWith("agents");
    active.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onFeatureChange).toHaveBeenCalledWith("agents");
    minimum.element.querySelector<HTMLElement>('[data-rigged-ui="rail-back"]')!.click();
    minimum.element.querySelector<HTMLElement>('[data-rigged-ui="rail-forward"]')!.click();
    minimum.element.querySelector<HTMLElement>('[data-rigged-ui="rail-help"]')!.click();
    minimum.element.querySelector<HTMLElement>('[data-rigged-ui="rail-home"]')!.click();
    minimum.element.querySelector<HTMLElement>('[data-rigged-ui="rail-profile"]')!.click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
    expect(onHelp).toHaveBeenCalledOnce();
    expect(onHome).toHaveBeenCalledOnce();
    expect(onProfile).toHaveBeenCalledOnce();
});
