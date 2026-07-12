import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { Button, type ButtonSize, type ButtonVariant } from "./index";
import { createRenderer } from "./testing";

it("holds Button dimensions across variants", async () => {
    const cases: Array<[ButtonSize, ButtonVariant, number]> = [
        ["small", "primary", 28],
        ["medium", "secondary", 36],
        ["large", "ghost", 44],
    ];
    const expectedStyles = {
        small: {
            height: "28px",
            padding: "0px 10px",
            fontSize: "12px",
            background: "rgb(41, 38, 45)",
            color: "rgb(255, 253, 248)",
        },
        medium: {
            height: "36px",
            padding: "0px 14px",
            fontSize: "13px",
            background: "rgb(247, 244, 241)",
            color: "rgb(56, 51, 60)",
        },
        large: {
            height: "44px",
            padding: "0px 18px",
            fontSize: "14px",
            background: "rgba(0, 0, 0, 0)",
            color: "rgb(81, 73, 88)",
        },
    } satisfies Record<
        ButtonSize,
        {
            background: string;
            color: string;
            fontSize: string;
            height: string;
            padding: string;
        }
    >;
    const opticalOffsets = {
        chromium: { small: "0.5px", medium: "0px", large: "0px" },
        firefox: { small: "0px", medium: "-0.5px", large: "0px" },
        webkit: { small: "0px", medium: "0px", large: "-0.5px" },
    } as const;
    const browser = server.browser as keyof typeof opticalOffsets;
    const fontFamily =
        browser === "webkit" ? "Rigged Manrope, sans-serif" : '"Rigged Manrope", sans-serif';
    const view = createRenderer();

    for (const [size, variant] of cases) {
        view.render(
            () => (
                <Button data-testid={`button-${size}`} size={size} variant={variant} width={128}>
                    Button
                </Button>
            ),
            { width: 240, height: 100, padding: 12 },
        );
    }
    view.render(
        () => (
            <Button data-testid="button-full" fullWidth>
                Full width
            </Button>
        ),
        { width: 300, height: 100, padding: 14 },
    );
    await view.ready();

    for (const [size, , height] of cases) {
        const button = view.$(`[data-testid="button-${size}"]`);
        const content = view.$(`[data-testid="button-${size}"] [data-rigged-ui="button-content"]`);
        expect(button.bounds()).toEqual({
            x: 12,
            y: 12,
            width: 128,
            height,
        });
        expect(
            button.computedStyles([
                "align-items",
                "background-color",
                "border-radius",
                "border-top-width",
                "box-sizing",
                "color",
                "cursor",
                "display",
                "font-family",
                "font-size",
                "font-weight",
                "height",
                "justify-content",
                "letter-spacing",
                "line-height",
                "padding",
                "width",
            ]),
        ).toEqual({
            "align-items": "center",
            "background-color": expectedStyles[size].background,
            "border-radius": "6px",
            "border-top-width": "1px",
            "box-sizing": "border-box",
            color: expectedStyles[size].color,
            cursor: "pointer",
            display: "inline-flex",
            "font-family": fontFamily,
            "font-size": expectedStyles[size].fontSize,
            "font-weight": "700",
            height: expectedStyles[size].height,
            "justify-content": "center",
            "letter-spacing": `${Number.parseFloat(expectedStyles[size].fontSize) / 100}px`,
            "line-height": expectedStyles[size].fontSize,
            padding: expectedStyles[size].padding,
            width: "128px",
        });
        expect(content.computedStyle("--rigged-button-optical-y")).toBe(
            opticalOffsets[browser][size],
        );
    }
    expect(view.$('[data-testid="button-full"]').bounds()).toEqual({
        x: 14,
        y: 14,
        width: 272,
        height: 36,
    });
    expect(
        view
            .$('[data-testid="button-full"]')
            .computedStyles(["background-color", "height", "padding", "width"]),
    ).toEqual({
        "background-color": "rgb(41, 38, 45)",
        height: "36px",
        padding: "0px 14px",
        width: "272px",
    });

    const smallText = view.$('[data-testid="button-small"] [data-rigged-ui="button-content"]');
    expect(smallText.textMetrics()).toMatchObject({
        bounds: { height: 12 },
        font: {
            family: "Rigged Manrope, sans-serif",
            letterSpacing: 0.12,
            lineHeight: 12,
            size: 12,
            weight: "700",
        },
        text: "Button",
    });

    const mediumText = view.$('[data-testid="button-medium"] [data-rigged-ui="button-content"]');
    expect(mediumText.textMetrics()).toMatchObject({
        bounds: { height: 13 },
        font: {
            family: "Rigged Manrope, sans-serif",
            letterSpacing: 0.13,
            lineHeight: 13,
            size: 13,
            weight: "700",
        },
        text: "Button",
    });

    const largeText = view.$('[data-testid="button-large"] [data-rigged-ui="button-content"]');
    expect(largeText.textMetrics()).toMatchObject({
        bounds: { height: 14 },
        font: {
            family: "Rigged Manrope, sans-serif",
            letterSpacing: 0.14,
            lineHeight: 14,
            size: 14,
            weight: "700",
        },
        text: "Button",
    });
    const fullText = view.$('[data-testid="button-full"] [data-rigged-ui="button-content"]');

    for (const [element, buttonHeight, expectedBackingCenter] of [
        [smallText, 28, 29],
        [mediumText, 36, 38],
        [largeText, 44, 45],
        [fullText, 36, undefined],
    ] as const) {
        const metrics = element.textMetrics();
        const visible = await element.visibleMetrics();
        expect(metrics.bounds.width).toBeGreaterThan(metrics.font.size * 3);
        expect(metrics.bounds.width).toBeLessThan(metrics.font.size * 5);
        expect(metrics.offsets.left).toBeCloseTo(metrics.offsets.right, 1);
        expect(metrics.ink.width).toBeGreaterThan(0);
        expect(metrics.ink.width).toBeLessThanOrEqual(metrics.bounds.width + 1);
        expect(metrics.ink.height).toBeGreaterThan(metrics.font.size * 0.5);
        expect(metrics.ink.height).toBeLessThanOrEqual(metrics.font.size * 1.1);
        expect(metrics.ink.top).toBeGreaterThanOrEqual(0);
        expect(metrics.ink.bottom).toBeLessThanOrEqual(buttonHeight);
        expect(metrics.ink.baseline).toBeGreaterThan(0);
        expect(visible.pixelCount).toBeGreaterThan(0);
        expect(visible.bounds.x).toBeGreaterThanOrEqual(0);
        expect(visible.bounds.y).toBeGreaterThanOrEqual(0);
        expect(visible.bounds.width).toBeGreaterThan(0);
        expect(visible.bounds.height).toBeGreaterThan(0);
        expect(visible.center.x).toBeGreaterThanOrEqual(visible.bounds.x);
        expect(visible.center.x).toBeLessThanOrEqual(visible.bounds.x + visible.bounds.width);
        expect(visible.center.y).toBeGreaterThanOrEqual(visible.bounds.y);
        expect(visible.center.y).toBeLessThanOrEqual(visible.bounds.y + visible.bounds.height);
        const opticalCenterInButton = visible.center.y + metrics.offsets.top;
        if (expectedBackingCenter !== undefined) {
            expect(Math.round(opticalCenterInButton * 2)).toBe(expectedBackingCenter);
        }
    }
    expect(view.$('[data-testid="button-full"]').computedStyle("background-color")).toBe(
        "rgb(41, 38, 45)",
    );

    await view.screenshot("Button.test");
});
